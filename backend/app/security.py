"""Payload validation, API-key auth and Redis token-bucket rate limiting."""
from __future__ import annotations

import hmac
import time

from fastapi import HTTPException, Request

from .config import settings

MAGIC = {
    "png": lambda b: b.startswith(b"\x89PNG\r\n\x1a\n"),
    "jpeg": lambda b: b.startswith(b"\xff\xd8\xff"),
    "webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
    "bmp": lambda b: b.startswith(b"BM"),
}


def sniff_image_type(head: bytes) -> str | None:
    for name, check in MAGIC.items():
        if check(head):
            return name
    return None


async def read_limited(upload, limit_mb: int | None = None) -> bytes:
    """Stream an UploadFile into memory, aborting as soon as the cap is exceeded."""
    cap = (limit_mb or settings.max_upload_mb) * 1024 * 1024
    chunks, total = [], 0
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > cap:
            raise HTTPException(413, f"File exceeds {settings.max_upload_mb}MB limit")
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise HTTPException(400, "Empty upload")
    if sniff_image_type(data[:16]) is None:
        raise HTTPException(415, "Unsupported or spoofed file type (magic-byte check failed)")
    return data


# ----------------------------------------------------------------- rate limit
_LUA = """
local key=KEYS[1]; local cap=tonumber(ARGV[1]); local rate=tonumber(ARGV[2]); local now=tonumber(ARGV[3]); local cost=tonumber(ARGV[4])
local d=redis.call('HMGET',key,'t','ts')
local tokens=tonumber(d[1]); local ts=tonumber(d[2])
if tokens==nil then tokens=cap; ts=now end
tokens=math.min(cap, tokens+(now-ts)*rate)
local ok=0
if tokens>=cost then tokens=tokens-cost; ok=1 end
redis.call('HSET',key,'t',tokens,'ts',now)
redis.call('EXPIRE',key,120)
return ok
"""

_redis = None
_redis_failed_at = 0.0
_local: dict[str, tuple[float, float]] = {}


async def _get_redis():
    global _redis, _redis_failed_at
    if _redis is not None:
        return _redis
    if time.time() - _redis_failed_at < 30:
        return None
    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=1.5)
        await r.ping()
        _redis = r
    except Exception:
        _redis_failed_at = time.time()
        _redis = None
    return _redis


def _local_bucket(key: str, cost: int = 1) -> bool:
    now = time.time()
    tokens, ts = _local.get(key, (float(settings.rate_capacity), now))
    tokens = min(settings.rate_capacity, tokens + (now - ts) * settings.rate_refill_per_sec)
    ok = tokens >= cost
    _local[key] = (tokens - cost if ok else tokens, now)
    if len(_local) > 5000:  # bound memory: drop the stalest half
        for k in sorted(_local, key=lambda k: _local[k][1])[:2500]:
            _local.pop(k, None)
    return ok


async def allow(key: str, cost: int = 1) -> bool:
    r = await _get_redis()
    if r is None:
        return _local_bucket(key, cost)
    try:
        res = await r.eval(_LUA, 1, f"rl:{key}", settings.rate_capacity, settings.rate_refill_per_sec, time.time(), cost)
        return bool(res)
    except Exception:
        return _local_bucket(key, cost)


def client_identity(request: Request) -> str:
    key = request.headers.get("x-api-key")
    if key:
        return "k:" + key[:16]
    ip = request.client.host if request.client else "unknown"
    hops = settings.trusted_proxy_hops
    if hops > 0:
        # Proxies append the address they saw on the RIGHT, so count from the right; anything further left is client-supplied.
        parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(parts) >= hops:
            ip = parts[-hops]
    return "ip:" + ip


def guard_cost(cost: int = 1):
    """FastAPI dependency factory: API-key check (if configured) + token-bucket rate limit.

    Expensive routes (LLM fan-out, agent runs) spend more tokens from the same bucket.
    The caller identity is stored on request.state.ident for audit logging.
    """

    async def dep(request: Request) -> str:
        keys = settings.api_key_set
        if keys:
            supplied = request.headers.get("x-api-key", "")
            if not any(hmac.compare_digest(supplied, k) for k in keys):
                raise HTTPException(401, "Missing or invalid API key")
        ident = client_identity(request)
        request.state.ident = ident
        if not await allow(ident, cost):
            raise HTTPException(429, "Rate limit exceeded - slow down", headers={"Retry-After": "5"})
        return ident

    return dep


guard = guard_cost(1)
