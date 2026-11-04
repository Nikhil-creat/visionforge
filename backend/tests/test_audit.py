import json

import pytest

from app.config import settings
from app.services import audit


@pytest.fixture(autouse=True)
def tmp_data(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", str(tmp_path))
    return tmp_path


def fill(n=5):
    for i in range(n):
        audit.append("evt", "abc", i=i)


def test_chain_verifies():
    fill()
    v = audit.verify()
    assert v["ok"] and v["count"] == 5


def test_tampering_detected(tmp_data):
    fill()
    p = tmp_data / "audit.jsonl"
    lines = p.read_text().splitlines()
    rec = json.loads(lines[2])
    rec["detail"]["i"] = 999                      # edit a historical record
    lines[2] = json.dumps(rec, separators=(",", ":"))
    p.write_text("\n".join(lines) + "\n")
    v = audit.verify()
    assert not v["ok"] and v["broken_at"] == 3


def test_deletion_detected(tmp_data):
    fill()
    p = tmp_data / "audit.jsonl"
    lines = p.read_text().splitlines()
    del lines[1]
    p.write_text("\n".join(lines) + "\n")
    assert not audit.verify()["ok"]


def test_details_are_sanitised_and_recent_is_newest_first():
    audit.append("x", "a", blob="y" * 500, nested={"k": 1})
    audit.append("y", "a")
    rec = audit.recent(5)
    assert rec[0]["event"] == "y"
    first = audit.recent(5)[1]["detail"]
    assert len(first["blob"]) <= 120


def test_disabled(monkeypatch):
    monkeypatch.setattr(settings, "audit_enabled", False)
    assert audit.append("x") is None
