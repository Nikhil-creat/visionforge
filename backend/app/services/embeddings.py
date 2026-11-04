"""Image/text embeddings + zero-shot tagging.

ENABLE_CLIP=true  -> open_clip ViT-B/32 (cross-modal text<->image, 512-d)
default           -> deterministic HSV-histogram + edge descriptor (128-d, image<->image only)
"""
from __future__ import annotations

import functools

import cv2
import numpy as np

from ..config import settings
from .vision import gpu_guard, to_bgr

DEFAULT_LABELS = [
    "a portrait of a person", "a landscape", "a city street", "a building", "an animal", "a pet", "food",
    "a product photo", "a car", "a plant", "the ocean", "a mountain", "a night scene", "an illustration",
    "a logo", "a screenshot", "a document", "a diagram", "abstract art", "a painting", "a sports scene",
    "an interior room", "a hand", "text", "a map", "a robot", "a sunset", "snow", "a crowd",
]

FALLBACK_DIM = 128


@functools.lru_cache(maxsize=1)
def _clip():
    import open_clip
    import torch

    model, _, preprocess = open_clip.create_model_and_transforms("ViT-B-32", pretrained="laion2b_s34b_b79k")
    tok = open_clip.get_tokenizer("ViT-B-32")
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    return model.to(dev).eval(), preprocess, tok, dev


def clip_available() -> bool:
    if not settings.enable_clip:
        return False
    try:
        _clip()
        return True
    except Exception:
        return False


def dim() -> int:
    return 512 if clip_available() else FALLBACK_DIM


def _norm(v: np.ndarray) -> list[float]:
    n = float(np.linalg.norm(v)) or 1.0
    return (v / n).astype(np.float32).tolist()


def _fallback_embed(bgr: np.ndarray) -> list[float]:
    small = cv2.resize(to_bgr(bgr), (96, 96), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1, 2], None, [8, 4, 3], [0, 180, 0, 256, 0, 256]).flatten()  # 96
    g = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx, gy = cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1)
    ang = (np.arctan2(gy, gx) % np.pi) / np.pi * 8
    mag = np.hypot(gx, gy)
    eh = np.bincount(np.clip(ang.astype(int), 0, 7).flatten(), weights=mag.flatten(), minlength=8)  # 8
    thumb = cv2.resize(g, (6, 4), interpolation=cv2.INTER_AREA).flatten() / 255.0  # 24
    v = np.concatenate([h / (h.sum() + 1e-6), eh / (eh.sum() + 1e-6), thumb])
    v = np.pad(v, (0, FALLBACK_DIM - v.size))
    return _norm(v)


@gpu_guard
def embed_image(bgr: np.ndarray) -> list[float]:
    if clip_available():
        import torch
        from PIL import Image

        model, pre, _, dev = _clip()
        pil = Image.fromarray(cv2.cvtColor(to_bgr(bgr), cv2.COLOR_BGR2RGB))
        with torch.no_grad():
            f = model.encode_image(pre(pil).unsqueeze(0).to(dev))
        return _norm(f[0].float().cpu().numpy())
    return _fallback_embed(bgr)


@gpu_guard
def embed_text(text: str) -> list[float] | None:
    if not clip_available():
        return None
    import torch

    model, _, tok, dev = _clip()
    with torch.no_grad():
        f = model.encode_text(tok([text[:200]]).to(dev))
    return _norm(f[0].float().cpu().numpy())


@gpu_guard
def zero_shot_tags(bgr: np.ndarray, labels: list[str] | None = None, top: int = 5) -> list[dict]:
    if not clip_available():
        return []
    import torch
    from PIL import Image

    labels = labels or DEFAULT_LABELS
    model, pre, tok, dev = _clip()
    pil = Image.fromarray(cv2.cvtColor(to_bgr(bgr), cv2.COLOR_BGR2RGB))
    with torch.no_grad():
        im = model.encode_image(pre(pil).unsqueeze(0).to(dev))
        tx = model.encode_text(tok(labels).to(dev))
        im, tx = im / im.norm(dim=-1, keepdim=True), tx / tx.norm(dim=-1, keepdim=True)
        probs = (100.0 * im @ tx.T).softmax(dim=-1)[0].cpu().numpy()
    idx = np.argsort(-probs)[:top]
    return [{"tag": labels[i].replace("a ", "", 1).replace("an ", "", 1), "score": round(float(probs[i]), 3)} for i in idx]


def auto_tags(bgr, diag: dict, faces: list, pal: list[str], ocr: dict) -> list[dict]:
    tags = zero_shot_tags(bgr)
    if tags:
        return tags
    # CPU fallback: honest, descriptive tags derived from measurements (not semantic recognition)
    out = []
    if faces:
        out.append({"tag": f"{len(faces)} face(s)", "score": 1.0})
    if ocr.get("blocks"):
        out.append({"tag": "contains text", "score": 1.0})
    out.append({"tag": diag["exposure"], "score": 1.0})
    out.append({"tag": diag["sharpness"], "score": 1.0})
    hsv = cv2.cvtColor(cv2.resize(to_bgr(bgr), (32, 32)), cv2.COLOR_BGR2HSV)
    if hsv[:, :, 1].mean() < 40:
        out.append({"tag": "monochrome-ish", "score": 0.9})
    elif hsv[:, :, 1].mean() > 120:
        out.append({"tag": "vivid", "score": 0.9})
    return out[:6]
