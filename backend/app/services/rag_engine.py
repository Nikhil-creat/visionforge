"""Multi-modal visual RAG on Qdrant (falls back to in-process Qdrant if the server is unreachable)."""
from __future__ import annotations

import re
import uuid

import numpy as np

from ..config import settings
from . import embeddings

COLLECTION = "visionforge_assets"
KINDS = {"image", "style_guide", "palette", "reference"}


class RagEngine:
    def __init__(self) -> None:
        self._client = None
        self._dim: int | None = None
        self.mode = "uninitialised"

    # ---------------------------------------------------------------- setup
    def client(self):
        if self._client is not None:
            return self._client
        from qdrant_client import QdrantClient

        try:
            c = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None, timeout=6)
            c.get_collections()
            self.mode = "qdrant-server"
        except Exception:
            c = QdrantClient(":memory:")
            self.mode = "qdrant-in-memory"
        self._client = c
        self._ensure(c)
        return c

    def _ensure(self, c) -> None:
        from qdrant_client.models import Distance, VectorParams

        self._dim = embeddings.dim()
        names = {x.name for x in c.get_collections().collections}
        if COLLECTION in names:
            info = c.get_collection(COLLECTION)
            cur = info.config.params.vectors.size  # type: ignore[union-attr]
            if cur != self._dim:  # embedder changed (CLIP toggled) -> rebuild
                c.delete_collection(COLLECTION)
                names.discard(COLLECTION)
        if COLLECTION not in names:
            c.create_collection(COLLECTION, vectors_config=VectorParams(size=self._dim, distance=Distance.COSINE))

    # ---------------------------------------------------------------- index
    def index_image(self, asset_id: str, bgr: np.ndarray, tags: list[str], kind: str = "image",
                    note: str = "", palette: list[str] | None = None, style_config: dict | None = None) -> str:
        from qdrant_client.models import PointStruct

        kind = kind if kind in KINDS else "image"
        vec = embeddings.embed_image(bgr)
        pid = str(uuid.UUID(asset_id)) if re.fullmatch(r"[a-f0-9]{32}", asset_id) else str(uuid.uuid4())
        payload = {"asset_id": asset_id, "kind": kind, "tags": [t[:40] for t in tags][:20], "note": note[:500],
                   "palette": (palette or [])[:8], "style_config": style_config or {}}
        self.client().upsert(COLLECTION, points=[PointStruct(id=pid, vector=vec, payload=payload)])
        return pid

    # ---------------------------------------------------------------- query
    def search_image(self, bgr: np.ndarray, k: int = 6, kind: str | None = None) -> list[dict]:
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        flt = Filter(must=[FieldCondition(key="kind", match=MatchValue(value=kind))]) if kind in KINDS else None
        res = self.client().query_points(COLLECTION, query=embeddings.embed_image(bgr), limit=k, query_filter=flt,
                                         with_payload=True).points
        return [{"score": round(float(r.score), 4), **(r.payload or {})} for r in res]

    def search_text(self, query: str, k: int = 6) -> list[dict]:
        vec = embeddings.embed_text(query)
        if vec is not None:  # true cross-modal retrieval (CLIP)
            res = self.client().query_points(COLLECTION, query=vec, limit=k, with_payload=True).points
            return [{"score": round(float(r.score), 4), **(r.payload or {})} for r in res]
        # CPU fallback: keyword overlap on tags/notes/kind
        toks = {t for t in re.findall(r"[a-z0-9#]+", query.lower()) if len(t) > 2}
        pts, _ = self.client().scroll(COLLECTION, limit=500, with_payload=True)
        scored = []
        for p in pts:
            pl = p.payload or {}
            hay = " ".join(pl.get("tags", []) + [pl.get("note", ""), pl.get("kind", "")]).lower()
            hits = sum(1 for t in toks if t in hay)
            if hits:
                scored.append({"score": round(hits / max(1, len(toks)), 3), **pl})
        return sorted(scored, key=lambda d: -d["score"])[:k]

    def stats(self) -> dict:
        try:
            n = self.client().count(COLLECTION).count
        except Exception:
            n = 0
        return {"mode": self.mode, "points": n, "dim": self._dim, "cross_modal_text": embeddings.clip_available()}


rag = RagEngine()
