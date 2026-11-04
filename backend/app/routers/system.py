from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse

from ..security import guard
from ..services import audit, metrics

router = APIRouter(tags=["system"], dependencies=[Depends(guard)])


@router.get("/audit/verify")
async def verify():
    import asyncio
    return await asyncio.to_thread(audit.verify)


@router.get("/audit/recent")
async def recent(limit: int = Query(12, ge=1, le=50)):
    import asyncio
    return {"events": await asyncio.to_thread(audit.recent, limit)}


@router.get("/metrics", response_class=PlainTextResponse)
async def prom():
    return metrics.render()
