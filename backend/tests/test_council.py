import asyncio
import json

import pytest

from app.services import council, llm

ROSTER = [{"provider": "groq", "model": "llama-3.3-70b-versatile"},
          {"provider": "gemini", "model": "gemini-2.5-flash"},
          {"provider": "groq", "model": "qwen-3"}]
MSGS = [{"role": "user", "content": "how do I fix a noisy dark photo?"}]


def reply(text, prompt=None):
    return json.dumps({"reply": text, "agent_prompt": prompt})


@pytest.fixture
def three_members(monkeypatch):
    async def roster(n):
        return ROSTER[:n]

    async def chat_one(provider, model, messages, **kw):
        return {"llama-3.3-70b-versatile": reply("Denoise first, then relight the dark photo and enhance contrast", "denoise, then enhance and relight"),
                "gemini-2.5-flash": reply("Run denoise, then relight and enhance contrast on the dark photo", "denoise then enhance"),
                "qwen-3": reply("Just upscale it 8x")}[model]

    monkeypatch.setattr(llm, "roster", roster)
    monkeypatch.setattr(llm, "chat_one", chat_one)


def run(depth="fast"):
    return asyncio.run(council.run_council(MSGS, "ctx", depth))


def test_judge_path(three_members, monkeypatch):
    async def complete(messages, **kw):
        assert "Candidate A" in messages[1]["content"] and "llama" not in messages[1]["content"]   # anonymised
        return json.dumps({"final": "Denoise, then relight and enhance.", "agent_prompt": "denoise, then enhance and relight",
                           "agreement": 72, "consensus": ["denoise first"], "disagreements": ["one member wanted 8x upscale"],
                           "confidence": "high"}), "gemini:gemini-2.5-flash"
    monkeypatch.setattr(llm, "complete", complete)
    r = run()
    assert r["method"] == "judge" and r["agreement"] == 72 and r["confidence"] == "high"
    assert r["agent_prompt"] == "denoise, then enhance and relight" and len(r["members"]) == 3


def test_falls_back_to_lexical_medoid_when_judge_down(three_members, monkeypatch):
    async def complete(messages, **kw):
        return None
    monkeypatch.setattr(llm, "complete", complete)
    r = run()
    assert r["method"] == "lexical-medoid" and "upscale it 8x" not in r["final"]   # outlier is not chosen
    assert 0 <= r["agreement_lexical"] <= 100


def test_one_member_failing_is_tolerated(three_members, monkeypatch):
    original = llm.chat_one

    async def flaky(provider, model, messages, **kw):
        if model == "qwen-3":
            raise RuntimeError("429")
        return await original(provider, model, messages, **kw)

    async def complete(messages, **kw):
        return None
    monkeypatch.setattr(llm, "chat_one", flaky)
    monkeypatch.setattr(llm, "complete", complete)
    r = run()
    assert r["ok"] and sum(m["ok"] for m in r["members"]) == 2


def test_all_fail(monkeypatch):
    async def roster(n):
        return ROSTER[:2]

    async def boom(*a, **k):
        raise RuntimeError("down")
    monkeypatch.setattr(llm, "roster", roster)
    monkeypatch.setattr(llm, "chat_one", boom)
    r = run()
    assert r["available"] and not r["ok"]


def test_no_keys(monkeypatch):
    async def roster(n):
        return []
    monkeypatch.setattr(llm, "roster", roster)
    assert run()["available"] is False


def test_deep_mode_revises(three_members, monkeypatch):
    calls = []
    original = llm.chat_one

    async def spy(provider, model, messages, **kw):
        calls.append(model)
        if "<peer_answers>" in messages[-1]["content"]:
            return reply("Revised: denoise, relight and enhance.", "denoise then enhance")
        return await original(provider, model, messages, **kw)

    async def complete(messages, **kw):
        return None
    monkeypatch.setattr(llm, "chat_one", spy)
    monkeypatch.setattr(llm, "complete", complete)
    r = run("deep")
    assert r["revised"] and len(calls) == 6


def test_secrets_never_leave_members(three_members, monkeypatch):
    async def leaky(provider, model, messages, **kw):
        return reply("my key is gsk_" + "z" * 30)
    async def complete(messages, **kw):
        return None
    monkeypatch.setattr(llm, "chat_one", leaky)
    monkeypatch.setattr(llm, "complete", complete)
    r = run()
    assert "gsk_" not in json.dumps(r)


def test_pick_many_diversity_and_skips():
    ids = ["whisper-large-v3", "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen/qwen3-32b", "playai-tts", "openai/gpt-oss-120b"]
    assert llm.pick_many(ids, llm.GROQ_PREFS, 3) == ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b"]


def test_jaccard_and_medoid():
    best, mean = council.lexical_consensus(["denoise then relight photo", "denoise and relight the photo", "banana smoothie recipe"])
    assert best in (0, 1) and 0 < mean < 1
    assert llm.parse_json('```json\n{"a": 1}\n```') == {"a": 1} and llm.parse_json("nope") is None
