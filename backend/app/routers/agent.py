import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .. import storage
from ..security import guard_cost
from ..services import audit, guard as guardrails, metrics, vision
from ..services.agent import run_agent
from .images import asset_payload, load_asset

router = APIRouter(prefix="/agent", tags=["agent"], dependencies=[Depends(guard_cost(3))])


class RunReq(BaseModel):
    asset_id: str
    prompt: str = Field(min_length=3, max_length=1000)


def _sse(ev: dict) -> str:
    return f"data: {json.dumps(ev, default=str)}\n\n"


@router.post("/run")
async def run(req: RunReq, request: Request):
    img = load_asset(req.asset_id)  # 404/400 raised before streaming starts
    scan = guardrails.scan(req.prompt)
    if scan.verdict == "block":
        metrics.event("guard_block")
        await audit.record(request, "guard_block", route="agent", hits=scan.hits)
        raise HTTPException(400, {"error": "blocked_by_guardrail", "reasons": scan.hits,
                                  "message": "That instruction looks like a prompt-injection attempt and was blocked."})
    prompt = guardrails.redact(scan.text)[0]  # PII never reaches the third-party planner
    await audit.record(request, "agent_run", asset=req.asset_id[:8], chars=len(prompt), flagged=scan.verdict == "flag")
    q: asyncio.Queue = asyncio.Queue()

    async def emit(ev: dict) -> None:
        await q.put(ev)

    async def worker():
        try:
            res = await run_agent(prompt, img, emit)
            out = res["image"]
            new_id = storage.save_bytes(vision.encode_png(out))
            arts = res["artifacts"]
            svg = arts.pop("svg", None)
            extra = {}
            if svg:
                storage.save_bytes(svg.encode(), "svg", new_id)
                extra["svg_url"] = f"/api/images/{new_id}/file?ext=svg"
            await q.put({"type": "done", "msg": "Pipeline complete.", **asset_payload(new_id, out), **extra,
                         "parent": req.asset_id, "engine": res["engine"], "memory": res["memory"],
                         "artifacts": {k: (v[:4000] if isinstance(v, str) else v) for k, v in arts.items()}})
        except Exception as exc:
            await q.put({"type": "error", "msg": f"Agent failed: {exc.__class__.__name__}"})
        finally:
            await q.put(None)

    task = asyncio.create_task(worker())

    async def gen():
        try:
            yield _sse({"type": "start", "msg": "Agent online."})
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                if ev is None:
                    break
                yield _sse(ev)
        finally:
            task.cancel()

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
