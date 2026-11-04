"""Single-model assistant (fast path). Guardrails: injection screen, PII redaction, output scrub."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..security import guard_cost
from ..services import assistant, audit, guard, llm, metrics
from .images import load_asset

router = APIRouter(prefix="/chat", tags=["assistant"], dependencies=[Depends(guard_cost(2))])


class Msg(BaseModel):
    role: str
    content: str = Field(max_length=2000)


class ChatReq(BaseModel):
    messages: list[Msg] = Field(min_length=1, max_length=24)
    asset_id: str | None = None


@router.post("")
async def chat(req: ChatReq, request: Request):
    try:
        clean, report = guard.prepare_messages(req.messages)
    except HTTPException:
        metrics.event("guard_block")
        await audit.record(request, "guard_block", route="chat")
        raise
    if report["verdict"] == "flag" or report["redactions"]:
        await audit.record(request, "guard_flag", route="chat", hits=report["hits"], redactions=list(report["redactions"]))

    img = None
    if req.asset_id:
        try:
            img = await asyncio.to_thread(load_asset, req.asset_id)
        except Exception:
            img = None
    last = next((m["content"] for m in reversed(clean) if m["role"] == "user"), "")
    context, diag = await assistant.build_context(img, last)

    msgs = [{"role": "system", "content": assistant.system_prompt(context)}] + clean[-12:]
    res = await llm.complete(msgs, json_mode=True, temperature=0.4)
    await audit.record(request, "chat", provider=(res[1] if res else "offline"), chars=len(last))
    if not res:
        return {**assistant.offline_reply(diag), "guard": report}
    data = llm.parse_json(res[0]) or {"reply": res[0][:1500], "agent_prompt": None}
    return {"reply": guard.scrub_output(str(data.get("reply", ""))[:2000]), "provider": res[1],
            "agent_prompt": assistant.validate_agent_prompt(data.get("agent_prompt")), "guard": report}
