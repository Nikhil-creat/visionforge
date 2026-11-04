import asyncio
import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import storage
from .config import settings
from .routers import agent, chat, council, images, insights, jobs, rag, system
from .services import audit, embeddings, llm, metrics, ops
from .services.rag_engine import rag as rag_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("visionforge")


async def _sweeper():
    while True:
        try:
            await asyncio.to_thread(storage.sweep)
        except Exception:
            pass
        await asyncio.sleep(300)


@asynccontextmanager
async def lifespan(_: FastAPI):
    storage.root()
    await asyncio.to_thread(audit.append, "startup", "system", version="2.0.0")
    task = asyncio.create_task(_sweeper())
    yield
    task.cancel()


app = FastAPI(title=settings.app_name, version="2.0.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_methods=["GET", "POST", "DELETE"],
                   allow_headers=["Content-Type", "X-API-Key"], expose_headers=["X-Request-ID"], max_age=600)


@app.middleware("http")
async def hardening(request: Request, call_next):
    rid = request.headers.get("x-request-id", "")[:40] or uuid.uuid4().hex[:16]
    limit = (settings.max_upload_mb + 2) * 1024 * 1024
    try:
        too_big = int(request.headers.get("content-length", "0")) > limit
    except ValueError:
        too_big = True
    if too_big:
        return JSONResponse({"detail": f"Request body exceeds {settings.max_upload_mb}MB"}, status_code=413,
                            headers={"X-Request-ID": rid})
    t0 = time.perf_counter()
    try:
        resp = await call_next(request)
    except Exception:
        log.exception("unhandled error rid=%s path=%s", rid, request.url.path)
        metrics.observe(request.method, request.url.path, 500, time.perf_counter() - t0)
        return JSONResponse({"detail": "Internal error", "request_id": rid}, status_code=500, headers={"X-Request-ID": rid})
    route = request.scope.get("route")
    metrics.observe(request.method, getattr(route, "path", "unmatched"), resp.status_code, time.perf_counter() - t0)
    resp.headers["X-Request-ID"] = rid
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    resp.headers.setdefault("Cross-Origin-Resource-Policy", "cross-origin")
    return resp


for r in (images.router, agent.router, rag.router, chat.router, council.router, insights.router, jobs.router):
    app.include_router(r, prefix="/api")
app.include_router(system.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/api/ops")
async def list_ops():
    return {"ops": ops.catalogue()}


@app.get("/api/status")
async def status():
    return {
        "app": settings.app_name,
        "version": "2.0.0",
        "llm": llm.configured(),
        "council": {"max_members": settings.council_max_members},
        "rag": await asyncio.to_thread(rag_engine.stats),
        "clip": embeddings.clip_available(),
        "features": {"vision_llm": settings.vision_llm and bool(settings.gemini_api_key), "audit": settings.audit_enabled},
        "limits": {"max_upload_mb": settings.max_upload_mb, "max_side": settings.max_side, "ttl_seconds": settings.ttl_seconds,
                   "rate_capacity": settings.rate_capacity, "auth_required": bool(settings.api_key_set)},
    }
