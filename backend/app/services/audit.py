"""Tamper-evident audit ledger: append-only JSONL where every record commits to the previous one (SHA-256 chain).

Stores *metadata only* (event, hashed caller, sizes, verdicts). Never prompts, images or keys.
Editing or deleting any line breaks every later hash, which `verify()` detects.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import threading
import time
from pathlib import Path

from ..config import settings

try:  # POSIX file locking so multiple uvicorn workers can't fork the chain
    import fcntl
except ImportError:  # pragma: no cover (Windows)
    fcntl = None

GENESIS = "0" * 64
MAX_BYTES = 5 * 1024 * 1024
_lock = threading.Lock()


def _path() -> Path:
    p = Path(settings.data_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p / "audit.jsonl"


def actor_hash(ident: str) -> str:
    return hashlib.sha256(f"{settings.audit_salt}|{ident}".encode()).hexdigest()[:12]


def _digest(prev: str, rec: dict) -> str:
    body = json.dumps(rec, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256((prev + body).encode()).hexdigest()


def _clean(detail: dict) -> dict:
    out = {}
    for k, v in detail.items():
        if isinstance(v, (int, float, bool)) or v is None:
            out[str(k)[:30]] = v
        elif isinstance(v, (list, tuple)):
            out[str(k)[:30]] = [str(x)[:40] for x in v][:10]
        else:
            out[str(k)[:30]] = str(v)[:120]
    return out


def _last_record(fh) -> dict | None:
    fh.seek(0, 2)
    size = fh.tell()
    if size == 0:
        return None
    fh.seek(max(0, size - 8192))
    lines = fh.read().decode("utf-8", "ignore").strip().splitlines()
    for line in reversed(lines):
        try:
            return json.loads(line)
        except Exception:
            continue
    return None


def append(event: str, actor: str = "system", **detail) -> dict | None:
    if not settings.audit_enabled:
        return None
    with _lock:
        path = _path()
        head = GENESIS
        if path.exists() and path.stat().st_size > MAX_BYTES:  # rotate but keep the chain anchored
            with open(path, "rb") as fh:
                last = _last_record(fh)
            head = last["hash"] if last else GENESIS
            path.rename(path.with_name(f"audit-{int(time.time())}.jsonl"))
        with open(path, "ab+") as fh:
            if fcntl:
                fcntl.flock(fh, fcntl.LOCK_EX)
            try:
                last = _last_record(fh)
                prev = last["hash"] if last else head
                n = (last["n"] + 1) if last else 1
                rec = {"n": n, "ts": round(time.time(), 3), "event": event[:40], "actor": actor, "detail": _clean(detail), "prev": prev}
                rec["hash"] = _digest(prev, {k: v for k, v in rec.items() if k != "hash"})
                fh.seek(0, 2)
                fh.write((json.dumps(rec, separators=(",", ":")) + "\n").encode())
                fh.flush()
            finally:
                if fcntl:
                    fcntl.flock(fh, fcntl.LOCK_UN)
    return rec


async def record(request, event: str, **detail) -> None:
    """Async helper for routers: never lets an audit failure break the request."""
    ident = getattr(getattr(request, "state", None), "ident", None) or "anonymous"
    try:
        await asyncio.to_thread(append, event, actor_hash(ident), **detail)
    except Exception:
        pass


def verify() -> dict:
    path = _path()
    if not path.exists():
        return {"ok": True, "count": 0, "head": GENESIS, "note": "ledger is empty"}
    prev, count, anchored = None, 0, None
    with open(path, "rb") as fh:
        for line_no, raw in enumerate(fh, 1):
            try:
                rec = json.loads(raw)
                claimed = rec["hash"]
                body = {k: v for k, v in rec.items() if k != "hash"}
            except Exception:
                return {"ok": False, "count": count, "broken_at": line_no, "reason": "unparseable record"}
            if prev is None:
                anchored = rec.get("prev")
            elif rec.get("prev") != prev:
                return {"ok": False, "count": count, "broken_at": line_no, "reason": "chain link mismatch"}
            if _digest(rec.get("prev", ""), body) != claimed:
                return {"ok": False, "count": count, "broken_at": line_no, "reason": "record hash mismatch"}
            prev, count = claimed, count + 1
    return {"ok": True, "count": count, "head": prev, "anchored_prev": anchored}


def recent(limit: int = 15) -> list[dict]:
    path = _path()
    if not path.exists():
        return []
    with open(path, "rb") as fh:
        fh.seek(0, 2)
        fh.seek(max(0, fh.tell() - 65536))
        lines = fh.read().decode("utf-8", "ignore").strip().splitlines()
    out = []
    for line in lines[-limit:]:
        try:
            r = json.loads(line)
            out.append({k: r[k] for k in ("n", "ts", "event", "actor", "detail", "hash")})
        except Exception:
            continue
    return out[::-1]
