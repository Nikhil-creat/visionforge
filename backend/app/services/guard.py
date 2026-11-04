"""Prompt-injection screening, PII / secret redaction and output scrubbing for anything that touches an LLM.

These are heuristics: they raise the cost of casual attacks and stop accidental leaks, but they are not a
complete defence. The hard guarantees come from architecture: LLM output is only ever used as *data*
(plans are validated against a tool whitelist with clamped parameters and nothing is executed).
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from fastapi import HTTPException

from ..config import settings

_I = re.IGNORECASE | re.DOTALL

INJECTION_RULES: list[tuple[re.Pattern, float, str]] = [
    (re.compile(r"\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|prior|above|earlier|system|all|your)\b.{0,30}\b(instructions?|prompts?|rules?|guidelines?|messages?|context)\b", _I), 0.9, "override-instructions"),
    (re.compile(r"\b(reveal|show|print|leak|repeat|display|output|dump|tell me)\b.{0,30}\b(system|hidden|initial|developer|secret)\b.{0,15}\b(prompt|instructions?|message)s?\b", _I), 0.9, "prompt-exfiltration"),
    (re.compile(r"\b(reveal|show|print|leak|dump|expose|give me|send me|tell me|what(?:'s| is))\b.{0,20}\b(your|the (?:server'?s?|backend|system|admin)|all)\b.{0,20}\b(api[ _-]?keys?|secrets?|passwords?|credentials?|tokens?|env(?:ironment)? variables?)\b", _I), 0.85, "secret-exfiltration"),
    (re.compile(r"\b(jailbreak|developer mode|dan mode|do anything now|without (any )?(restrictions|filters|rules|limits))\b", _I), 0.7, "jailbreak-phrase"),
    (re.compile(r"(<\|im_(start|end)\|>|<\|(system|assistant|user)\|>|\[/?INST\]|<</?SYS>>)", _I), 0.85, "chat-template-tokens"),
    (re.compile(r"</?(system|assistant)>", _I), 0.6, "role-tag-smuggling"),
    (re.compile(r"(\brm\s+-rf\b|\bos\.system\b|\bsubprocess\b|__import__|\beval\(|\bcurl\s+https?://|\bwget\s+https?://)", _I), 0.5, "code-exec-bait"),
]

_SECRET = re.compile(r"\b(gsk_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_\-]{30,}|sk-[A-Za-z0-9_\-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9\-]{10,})\b")
_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_CARD = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")
_AADHAAR = re.compile(r"(?<!\d)(?<!\d\s)[2-9]\d{3}\s\d{4}\s\d{4}(?!\d)(?!\s\d)")  # not a slice of a longer grouped number
_PHONE = re.compile(r"(?<!\d)(?:\+91[ \-]?|0)?[6-9]\d{9}(?!\d)|\+\d{1,3}[ \-]?\d{2,4}[ \-]?\d{3,4}[ \-]?\d{3,4}(?!\d)")


@dataclass
class Scan:
    score: float = 0.0
    verdict: str = "allow"          # allow | flag | block
    hits: list[str] = field(default_factory=list)
    text: str = ""                  # cleaned text (invisible characters stripped)


def strip_invisible(text: str) -> tuple[str, int]:
    out, n = [], 0
    for ch in text:
        cat = unicodedata.category(ch)
        if cat == "Cf" or (cat == "Cc" and ch not in "\n\t\r"):
            n += 1
            continue
        out.append(ch)
    return "".join(out), n


def scan(text: str) -> Scan:
    clean, hidden = strip_invisible(text or "")
    hits, scores = [], []
    for pat, weight, name in INJECTION_RULES:
        if pat.search(clean):
            hits.append(name)
            scores.append(weight)
    if hidden >= 3:
        hits.append("invisible-characters")
        scores.append(0.5)
    if not scores:
        return Scan(0.0, "allow", [], clean)
    score = min(1.0, max(scores) + 0.05 * (len(scores) - 1))
    verdict = "block" if score >= settings.guard_block_threshold else "flag"
    return Scan(round(score, 2), verdict, hits, clean)


def _luhn_ok(digits: str) -> bool:
    if not 13 <= len(digits) <= 19:
        return False
    total, alt = 0, False
    for d in reversed(digits):
        n = int(d)
        if alt:
            n *= 2
            n -= 9 if n > 9 else 0
        total += n
        alt = not alt
    return total % 10 == 0


def redact(text: str) -> tuple[str, dict]:
    """Mask secrets and personal identifiers before text leaves for a third-party LLM."""
    counts = {"secret": 0, "email": 0, "card": 0, "id": 0, "phone": 0}

    def sub(pattern, label, validator=None):
        def _r(m):
            if validator and not validator(re.sub(r"\D", "", m.group(0))):
                return m.group(0)
            counts[label] += 1
            return f"[{label}]"
        return pattern.sub(_r, text_ref[0])

    text_ref = [text]
    for pat, label, val in ((_SECRET, "secret", None), (_EMAIL, "email", None), (_CARD, "card", _luhn_ok),
                            (_AADHAAR, "id", None), (_PHONE, "phone", None)):
        text_ref[0] = sub(pat, label, val)
    return text_ref[0], {k: v for k, v in counts.items() if v}


def scrub_output(text: str) -> str:
    """Never let a model echo our own keys or any key-shaped string back to the browser."""
    for key in (settings.groq_api_key, settings.gemini_api_key, *settings.api_key_set, settings.qdrant_api_key):
        if key and len(key) >= 8:
            text = text.replace(key, "[redacted]")
    return _SECRET.sub("[redacted]", text)


def prepare_messages(messages, *, max_chars: int = 2000) -> tuple[list[dict], dict]:
    """Screen and sanitise a chat history. Raises HTTP 400 if the newest user turn is a high-confidence attack.

    Earlier turns are only sanitised (they may be assistant text); the newest user turn decides block/flag.
    """
    report = {"verdict": "allow", "score": 0.0, "hits": [], "redactions": {}}
    clean: list[dict] = []
    last_user = max((i for i, m in enumerate(messages) if m.role == "user"), default=-1)
    for i, m in enumerate(messages):
        if m.role not in ("user", "assistant"):
            continue
        text = m.content[:max_chars]
        if m.role == "user":
            s = scan(text)
            text = s.text
            if i == last_user:
                report.update(verdict=s.verdict, score=s.score, hits=s.hits)
                if s.verdict == "block":
                    raise HTTPException(400, {"error": "blocked_by_guardrail", "reasons": s.hits,
                                              "message": "That message looks like an attempt to override the assistant's rules, so it was blocked."})
            text, counts = redact(text)
            for k, v in counts.items():
                report["redactions"][k] = report["redactions"].get(k, 0) + v
        clean.append({"role": m.role, "content": text})
    if not any(m["role"] == "user" for m in clean):
        raise HTTPException(400, "No user message")
    return clean, report
