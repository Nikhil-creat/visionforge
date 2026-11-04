import asyncio

import cv2
import numpy as np

from app.config import settings
from app.services import agent


def make_img():
    a = np.zeros((180, 240, 3), np.uint8)
    for x in range(240):
        a[:, x] = (40 + x // 3, 90, 160 - x // 5)
    cv2.circle(a, (120, 90), 50, (230, 220, 40), -1)
    return a


def test_rule_plan_maps_the_headline_example():
    plan = agent.rule_plan("Auto-detect the main subject, remove the background, convert the remaining background "
                           "into a mathematical LaTeX grid, and upscale the subject 4x")
    tools = [s["tool"] for s in plan]
    assert tools == ["segment", "remove_background", "latex_matrix", "upscale"]
    assert plan[2]["params"]["region"] == "background" and plan[3]["params"]["factor"] == 4


def test_unmappable_prompt_gives_empty_plan():
    assert agent.rule_plan("tell me a joke") == []


def test_validate_plan_whitelists_tools_and_clamps():
    out = agent.validate_plan([{"tool": "os.system", "params": {}}, {"tool": "denoise", "params": {"strength": 999}}])
    assert [s["tool"] for s in out] == ["denoise"] and out[0]["params"]["strength"] == 20


def test_judge_catches_blank_output():
    img = make_img()
    ok, why = agent._judge("emoji_mosaic", img, np.zeros_like(img), {})
    assert not ok


def test_adjust_changes_parameters():
    p = agent.adjust("emoji_mosaic", {"cols": 48, "theme": "moon", "mode": "luminance", "cell": 22, "region": "all"}, 1)
    assert p["cols"] < 48


def test_full_run_offline(monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    events = []

    async def emit(e):
        events.append(e)

    res = asyncio.run(agent.run_agent("denoise then enhance and emoji mosaic the background", make_img(), emit))
    assert [m["tool"] for m in res["memory"]] == ["denoise", "enhance", "emoji_mosaic"]
    assert any(e["type"] == "eval" and e["ok"] for e in events)
