import asyncio

import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import storage
from ..security import guard, read_limited
from ..services import audit, ops, vision
from ..services.rag_engine import rag

router = APIRouter(prefix="/images", tags=["images"], dependencies=[Depends(guard)])


def load_asset(asset_id: str):
    if not storage.valid_id(asset_id):
        raise HTTPException(400, "Invalid asset id")
    p = storage.path_for(asset_id, "png")
    if not p.exists():
        raise HTTPException(404, "Asset not found or expired (assets auto-delete after 1 hour unless pinned)")
    img = cv2.imread(str(p), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise HTTPException(500, "Stored asset unreadable")
    return img


def asset_payload(asset_id: str, img) -> dict:
    return {"asset_id": asset_id, "url": f"/api/images/{asset_id}/file", "width": int(img.shape[1]),
            "height": int(img.shape[0]), "has_alpha": bool(img.ndim == 3 and img.shape[2] == 4)}


@router.post("/upload")
async def upload(request: Request, file: UploadFile = File(...), index: bool = Form(False)):
    raw = await read_limited(file)
    try:
        img = await asyncio.to_thread(vision.load_image, raw)
    except vision.ImageError as exc:
        raise HTTPException(422, str(exc))
    aid = storage.save_bytes(vision.encode_png(img))
    analysis = await asyncio.to_thread(vision.analyze, img)
    await audit.record(request, "upload", kb=len(raw) // 1024, px=f"{img.shape[1]}x{img.shape[0]}", indexed=index,
                       flags=analysis["diagnostics"]["flags"], nsfw_flag=analysis["integrity"]["nsfw_flag"])
    if index:
        await asyncio.to_thread(rag.index_image, aid, vision.to_bgr(img), [t["tag"] for t in analysis["tags"]],
                                "image", file.filename or "", analysis["palette"])
        storage.pin(aid)
    return {**asset_payload(aid, img), "analysis": analysis, "ttl_seconds": 3600, "indexed": index}


@router.get("/{asset_id}/analysis")
async def analysis(asset_id: str):
    img = load_asset(asset_id)
    return {"analysis": await asyncio.to_thread(vision.analyze, img)}


@router.get("/{asset_id}/file")
async def file(asset_id: str, ext: str = "png"):
    if ext not in ("png", "svg"):
        raise HTTPException(400, "Unsupported format")
    if not storage.valid_id(asset_id) or not storage.exists(asset_id, ext):
        raise HTTPException(404, "Asset not found or expired")
    headers = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
               "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox"}
    return FileResponse(storage.path_for(asset_id, ext), media_type="image/svg+xml" if ext == "svg" else "image/png",
                        headers=headers)


class TransformReq(BaseModel):
    op: str
    params: dict = Field(default_factory=dict)


@router.post("/{asset_id}/transform")
async def transform(asset_id: str, req: TransformReq, request: Request):
    if req.op not in ops.OPS:
        raise HTTPException(400, f"Unknown op '{req.op}'")
    img = load_asset(asset_id)
    try:
        out, info, _ = await asyncio.to_thread(ops.run_op, req.op, img, req.params)
    except vision.ImageError as exc:
        raise HTTPException(422, str(exc))
    new_id = storage.save_bytes(vision.encode_png(out))
    await audit.record(request, "transform", op=req.op, px=f"{out.shape[1]}x{out.shape[0]}")
    svg = info.pop("svg", None)
    payload = {**asset_payload(new_id, out), "op": req.op, "info": info, "parent": asset_id}
    if svg:
        storage.save_bytes(svg.encode(), "svg", new_id)
        payload["svg_url"] = f"/api/images/{new_id}/file?ext=svg"
    return payload


@router.post("/{asset_id}/keep")
async def keep(asset_id: str):
    load_asset(asset_id)
    storage.pin(asset_id)
    return {"asset_id": asset_id, "pinned": True}


@router.delete("/{asset_id}")
async def remove(asset_id: str):
    storage.delete(asset_id)
    return {"deleted": True}
