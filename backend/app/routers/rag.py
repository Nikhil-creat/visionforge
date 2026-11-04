import asyncio

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .. import storage
from ..security import guard, read_limited
from ..services import vision
from ..services.rag_engine import KINDS, rag
from .images import load_asset

router = APIRouter(prefix="/rag", tags=["rag"], dependencies=[Depends(guard)])


class IndexReq(BaseModel):
    asset_id: str
    kind: str = "image"
    note: str = Field(default="", max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=20)
    style_config: dict = Field(default_factory=dict)


class TextQuery(BaseModel):
    query: str = Field(min_length=2, max_length=300)
    k: int = Field(default=6, ge=1, le=20)


class ImageQuery(BaseModel):
    asset_id: str
    k: int = Field(default=6, ge=1, le=20)
    kind: str | None = None


@router.get("/stats")
async def stats():
    return await asyncio.to_thread(rag.stats)


@router.post("/index")
async def index(req: IndexReq):
    if req.kind not in KINDS:
        raise HTTPException(400, f"kind must be one of {sorted(KINDS)}")
    img = load_asset(req.asset_id)
    analysis = await asyncio.to_thread(vision.analyze, img)
    tags = req.tags or [t["tag"] for t in analysis["tags"]]
    await asyncio.to_thread(rag.index_image, req.asset_id, vision.to_bgr(img), tags, req.kind, req.note,
                            analysis["palette"], req.style_config)
    storage.pin(req.asset_id)  # indexed assets are kept
    return {"indexed": True, "tags": tags, "palette": analysis["palette"]}


@router.post("/reference")
async def add_reference(file: UploadFile = File(...), kind: str = Form("style_guide"), note: str = Form("")):
    raw = await read_limited(file)
    img = await asyncio.to_thread(vision.load_image, raw)
    aid = storage.save_bytes(vision.encode_png(img))
    analysis = await asyncio.to_thread(vision.analyze, img)
    tags = [t["tag"] for t in analysis["tags"]]
    await asyncio.to_thread(rag.index_image, aid, vision.to_bgr(img), tags, kind, note[:500], analysis["palette"])
    storage.pin(aid)
    return {"asset_id": aid, "url": f"/api/images/{aid}/file", "tags": tags, "palette": analysis["palette"]}


@router.post("/search/text")
async def search_text(q: TextQuery):
    return {"results": await asyncio.to_thread(rag.search_text, q.query, q.k), "mode": rag.stats()["cross_modal_text"]}


@router.post("/search/image")
async def search_image(q: ImageQuery):
    img = load_asset(q.asset_id)
    return {"results": await asyncio.to_thread(rag.search_image, vision.to_bgr(img), q.k, q.kind)}
