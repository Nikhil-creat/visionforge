"""Multi-assistant council endpoint: several models answer, a judge reconciles them."""
import asyncio
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..security import guard_cost
from ..services import assistant, audit, council, guard, metrics
from .chat import Msg
from .images import load_asset

router = APIRouter(prefix="/council", tags=["assistant"], dependencies=[Depends(guard_cost(4))])


class CouncilReq(BaseModel):
    messages: list[Msg] = Field(min_length=1, max_length=24)
    asset_id: str | None = None
    depth: Literal["fast", "deep"] = "fast"


@router.post("")
async def ask(req: CouncilReq, request: Request):
    try:
        clean, report = guard.prepare_messages(req.messages)
    except HTTPException:
        metrics.event("guard_block")
        await audit.record(request, "guard_block", route="council")
        raise
    if report["verdict"] == "flag" or report["redactions"]:
        await audit.record(request, "guard_flag", route="council", hits=report["hits"], redactions=list(report["redactions"]))

    img = None
    if req.asset_id:
        try:
            img = await asyncio.to_thread(load_asset, req.asset_id)
        except Exception:
            img = None
    last = next((m["content"] for m in reversed(clean) if m["role"] == "user"), "")
    context, diag = await assistant.build_context(img, last)

    result = await council.run_council(clean, context, req.depth)
    metrics.event("council")
    await audit.record(request, "council", depth=req.depth, members=len(result.get("members", [])),
                       ok=bool(result.get("ok")), method=result.get("method", "n/a"), chars=len(last))
    if not result.get("available"):
        return {**assistant.offline_reply(diag), "council": False, "guard": report, "note": result.get("reason")}
    result["guard"] = report
    return result
