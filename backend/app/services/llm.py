"""Groq + Gemini clients with automatic model discovery, retry and failover (free-tier keys).

Keys come from env only, travel in headers (never URLs) and are never logged or returned.
"""
from __future__ import annotations

import asyncio
import base64
import json
import re
import time

import httpx

from ..config import settings
from . import metrics

GROQ_BASE = "https://api.groq.com/openai/v1"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

# Substring preferences, best first. Order also gives model-family diversity for the council.
GROQ_PREFS = ["llama-3.3-70b", "gpt-oss-120b", "qwen", "gpt-oss-20b", "llama-3.1-8b", "llama-4", "kimi", "mixtral"]
GEMINI_PREFS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash", "flash-lite", "gemini-1.5-flash", "flash", "pro"]
_SKIP = ("whisper", "tts", "guard", "embed", "playai", "distil", "image", "aqa", "imagen", "veo", "audio", "live",
         "gemma", "computer-use", "robotics", "learnlm", "-exp", "orpheus", "safeguard", "vision-preview")

_cache: dict[str, tuple[float, list[str]]] = {}


def configured() -> dict:
    return {"groq": bool(settings.groq_api_key), "gemini": bool(settings.gemini_api_key)}


def pick_many(models: list[str], prefs: list[str], n: int) -> list[str]:
    models = [m for m in models if not any(s in m.lower() for s in _SKIP)]
    chosen: list[str] = []
    for pref in prefs:
        for m in models:
            if pref in m.lower() and m not in chosen:
                chosen.append(m)
                break
        if len(chosen) >= n:
            return chosen
    for m in models:  # top up with anything usable
        if len(chosen) >= n:
            break
        if m not in chosen:
            chosen.append(m)
    return chosen[:n]


def _headers(provider: str) -> dict:
    return ({"Authorization": f"Bearer {settings.groq_api_key}"} if provider == "groq"
            else {"x-goog-api-key": settings.gemini_api_key})


async def _list(c: httpx.AsyncClient, provider: str) -> list[str]:
    hit = _cache.get(provider)
    if hit and time.time() - hit[0] < 3600:
        return hit[1]
    if provider == "groq":
        r = await c.get(f"{GROQ_BASE}/models", headers=_headers("groq"))
        r.raise_for_status()
        ids = [m["id"] for m in r.json().get("data", [])]
    else:
        r = await c.get(f"{GEMINI_BASE}/models", headers=_headers("gemini"), params={"pageSize": 200})
        r.raise_for_status()
        ids = [m["name"].split("/", 1)[-1] for m in r.json().get("models", [])
               if "generateContent" in m.get("supportedGenerationMethods", [])]
    _cache[provider] = (time.time(), ids)
    return ids


async def pick_models(provider: str, n: int = 1) -> list[str]:
    key = settings.groq_api_key if provider == "groq" else settings.gemini_api_key
    if not key:
        return []
    try:
        async with httpx.AsyncClient(timeout=settings.llm_timeout) as c:
            return pick_many(await _list(c, provider), GROQ_PREFS if provider == "groq" else GEMINI_PREFS, n)
    except Exception:
        _cache.pop(provider, None)
        return []


async def roster(n: int) -> list[dict]:
    """Up to n distinct (provider, model) members, alternating providers for diversity."""
    per = max(1, (n + 1) // 2)
    groq, gem = await asyncio.gather(pick_models("groq", per), pick_models("gemini", per))
    out: list[dict] = []
    for i in range(per):
        if i < len(groq):
            out.append({"provider": "groq", "model": groq[i]})
        if i < len(gem):
            out.append({"provider": "gemini", "model": gem[i]})
    return out[:n]


async def _post(c: httpx.AsyncClient, url: str, headers: dict, body: dict) -> httpx.Response:
    r = await c.post(url, json=body, headers=headers)
    if r.status_code == 429:  # one polite retry honouring Retry-After (capped)
        try:
            wait = min(3.0, float(r.headers.get("retry-after", "1")))
        except ValueError:
            wait = 1.0
        await asyncio.sleep(wait)
        r = await c.post(url, json=body, headers=headers)
    return r


async def chat_one(provider: str, model: str, messages: list[dict], *, json_mode: bool = False,
                   temperature: float = 0.3, max_tokens: int = 700, timeout: float | None = None) -> str:
    """One completion from one specific model. Raises on failure (caller decides how to degrade)."""
    ok = False
    try:
        async with httpx.AsyncClient(timeout=timeout or settings.llm_timeout) as c:
            if provider == "groq":
                body = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
                if json_mode:
                    body["response_format"] = {"type": "json_object"}
                r = await _post(c, f"{GROQ_BASE}/chat/completions", _headers("groq"), body)
                if r.status_code == 400 and json_mode:  # model without JSON mode: retry plain
                    body.pop("response_format")
                    r = await _post(c, f"{GROQ_BASE}/chat/completions", _headers("groq"), body)
                r.raise_for_status()
                text = r.json()["choices"][0]["message"]["content"] or ""
            else:
                system = "\n".join(m["content"] for m in messages if m["role"] == "system")
                contents = [{"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
                            for m in messages if m["role"] != "system"]
                cfg: dict = {"temperature": temperature, "maxOutputTokens": max_tokens + 400}
                if json_mode:
                    cfg["responseMimeType"] = "application/json"
                if "2.5" in model and "flash" in model:
                    cfg["thinkingConfig"] = {"thinkingBudget": 0}  # keep the token budget for the answer
                body = {"contents": contents, "generationConfig": cfg}
                if system:
                    body["systemInstruction"] = {"parts": [{"text": system}]}
                r = await _post(c, f"{GEMINI_BASE}/models/{model}:generateContent", _headers("gemini"), body)
                r.raise_for_status()
                parts = r.json()["candidates"][0]["content"]["parts"]
                text = "".join(p.get("text", "") for p in parts)
        ok = bool(text.strip())
        if not ok:
            raise ValueError("empty completion")
        return text
    finally:
        metrics.llm(provider, ok)


async def complete(messages: list[dict], json_mode: bool = False, temperature: float = 0.3,
                   prefer: str = "groq") -> tuple[str, str] | None:
    """Failover completion: try the preferred provider, then the other. Returns (text, 'provider:model') or None."""
    order = ["groq", "gemini"] if prefer == "groq" else ["gemini", "groq"]
    for provider in order:
        if not (settings.groq_api_key if provider == "groq" else settings.gemini_api_key):
            continue
        for model in (await pick_models(provider, 2)):  # best model, then one fallback
            try:
                return await chat_one(provider, model, messages, json_mode=json_mode, temperature=temperature), f"{provider}:{model}"
            except Exception:
                _cache.pop(provider, None)
                continue
    return None


async def gemini_vision(prompt: str, jpeg: bytes) -> tuple[str, str]:
    """Describe an image with Gemini. Caller must have obtained explicit user consent first."""
    models = await pick_models("gemini", 1)
    if not models:
        raise RuntimeError("no gemini model available")
    model = models[0]
    cfg: dict = {"temperature": 0.2, "maxOutputTokens": 900, "responseMimeType": "application/json"}
    if "2.5" in model and "flash" in model:
        cfg["thinkingConfig"] = {"thinkingBudget": 0}
    body = {"contents": [{"role": "user", "parts": [
        {"text": prompt}, {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(jpeg).decode()}}]}],
        "generationConfig": cfg}
    ok = False
    try:
        async with httpx.AsyncClient(timeout=max(30.0, settings.llm_timeout)) as c:
            r = await _post(c, f"{GEMINI_BASE}/models/{model}:generateContent", _headers("gemini"), body)
            r.raise_for_status()
            parts = r.json()["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts)
        ok = bool(text.strip())
        return text, model
    finally:
        metrics.llm("gemini", ok)


def parse_json(text: str) -> dict | None:
    if not text:
        return None
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except Exception:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                data = json.loads(m.group(0))
                return data if isinstance(data, dict) else None
            except Exception:
                return None
    return None
