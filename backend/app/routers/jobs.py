"""Heavy / batch work goes through Celery + Redis so the API stays responsive."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..security import guard
from ..services import ops
from .images import load_asset

router = APIRouter(prefix="/jobs", tags=["jobs"], dependencies=[Depends(guard)])


class Step(BaseModel):
    tool: str
    params: dict = Field(default_factory=dict)


class JobReq(BaseModel):
    asset_id: str
    steps: list[Step] = Field(min_length=1, max_length=8)


@router.post("")
async def submit(req: JobReq):
    load_asset(req.asset_id)
    bad = [s.tool for s in req.steps if s.tool not in ops.OPS]
    if bad:
        raise HTTPException(400, f"Unknown tools: {bad}")
    try:
        from ..worker import run_plan

        task = run_plan.delay(req.asset_id, [s.model_dump() for s in req.steps])
    except Exception:
        raise HTTPException(503, "Task queue unavailable")
    return {"job_id": task.id}


@router.get("/{job_id}")
async def status(job_id: str):
    try:
        from celery.result import AsyncResult

        from ..worker import celery_app

        r = AsyncResult(job_id, app=celery_app)
        return {"state": r.state, "result": r.result if r.successful() else None,
                "error": "failed" if r.failed() else None}
    except Exception:
        raise HTTPException(503, "Task queue unavailable")
