"""Ephemeral asset storage with a TTL sweeper (privacy: auto-delete after 1h unless pinned)."""
from __future__ import annotations

import re
import time
import uuid
from pathlib import Path

from .config import settings

ID_RE = re.compile(r"^[a-f0-9]{32}$")
EXTS = {"png", "jpg", "svg", "txt"}


def root() -> Path:
    p = Path(settings.data_dir) / "assets"
    p.mkdir(parents=True, exist_ok=True)
    return p


def new_id() -> str:
    return uuid.uuid4().hex


def valid_id(asset_id: str) -> bool:
    return bool(ID_RE.match(asset_id or ""))


def path_for(asset_id: str, ext: str = "png") -> Path:
    if not valid_id(asset_id) or ext not in EXTS:
        raise ValueError("invalid asset reference")
    return root() / f"{asset_id}.{ext}"


def save_bytes(data: bytes, ext: str = "png", asset_id: str | None = None) -> str:
    asset_id = asset_id or new_id()
    path_for(asset_id, ext).write_bytes(data)
    return asset_id


def exists(asset_id: str, ext: str = "png") -> bool:
    try:
        return path_for(asset_id, ext).exists()
    except ValueError:
        return False


def pin(asset_id: str) -> None:
    (root() / f"{asset_id}.keep").touch()


def is_pinned(asset_id: str) -> bool:
    return valid_id(asset_id) and (root() / f"{asset_id}.keep").exists()


def delete(asset_id: str) -> None:
    if not valid_id(asset_id):
        return
    for p in root().glob(f"{asset_id}.*"):
        p.unlink(missing_ok=True)


def sweep(now: float | None = None) -> int:
    """Delete expired, un-pinned assets. Returns number of files removed."""
    now = now or time.time()
    removed = 0
    for p in root().iterdir():
        if p.suffix == ".keep" or not ID_RE.match(p.stem):
            continue
        if is_pinned(p.stem):
            continue
        if now - p.stat().st_mtime > settings.ttl_seconds:
            p.unlink(missing_ok=True)
            removed += 1
    return removed
