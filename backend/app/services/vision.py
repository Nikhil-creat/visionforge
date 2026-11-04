"""Classical + CNN computer-vision layer: diagnostics, faces, OCR, integrity, segmentation.

Heavy neural backends (SAM 2, Grounding DINO, Real-ESRGAN, Depth Anything ...) are *pluggable*:
register a callable in NEURAL_BACKENDS and the ops layer will use it instead of the CPU fallback.
"""
from __future__ import annotations

import functools
import io
from typing import Callable

import cv2
import numpy as np
from PIL import Image

from ..config import settings

Image.MAX_IMAGE_PIXELS = settings.max_input_pixels

# name -> callable. e.g. NEURAL_BACKENDS["upscale"] = lambda bgr, factor: ...
NEURAL_BACKENDS: dict[str, Callable] = {}


class ImageError(ValueError):
    pass


# ------------------------------------------------------------------ I/O
def load_image(raw: bytes, max_side: int | None = None) -> np.ndarray:
    """Decode -> uint8 BGR(A). Re-encoding drops all EXIF. Downscales huge inputs (VRAM/RAM guard)."""
    try:
        with Image.open(io.BytesIO(raw)) as im:
            w, h = im.size
            if w * h > settings.max_input_pixels:
                raise ImageError("Image has too many pixels")
            im.verify()
    except ImageError:
        raise
    except Exception as exc:  # corrupted / truncated
        raise ImageError(f"Corrupted image: {exc.__class__.__name__}") from exc

    arr = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_UNCHANGED)
    if arr is None:
        raise ImageError("Could not decode image")
    if arr.dtype != np.uint8:
        arr = cv2.convertScaleAbs(arr, alpha=255.0 / max(1, int(arr.max())))
    if arr.ndim == 2:
        arr = cv2.cvtColor(arr, cv2.COLOR_GRAY2BGR)
    elif arr.shape[2] == 4 and (arr[:, :, 3] == 255).all():
        arr = arr[:, :, :3]
    return downscale(arr, max_side or settings.max_side)


def downscale(img: np.ndarray, max_side: int) -> np.ndarray:
    h, w = img.shape[:2]
    s = max(h, w)
    if s <= max_side:
        return img
    k = max_side / s
    return cv2.resize(img, (max(1, int(w * k)), max(1, int(h * k))), interpolation=cv2.INTER_AREA)


def encode_png(img: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img, [cv2.IMWRITE_PNG_COMPRESSION, 3])
    if not ok:
        raise ImageError("PNG encode failed")
    return buf.tobytes()


def to_bgr(img: np.ndarray) -> np.ndarray:
    return img[:, :, :3] if img.ndim == 3 and img.shape[2] == 4 else img


def gpu_guard(fn):
    """Free VRAM after every call and convert CUDA OOM into a clean ImageError (caller falls back to CPU)."""

    @functools.wraps(fn)
    def wrapper(*a, **k):
        try:
            return fn(*a, **k)
        except RuntimeError as exc:
            if "out of memory" in str(exc).lower():
                raise ImageError("GPU out of memory - retry with a smaller image") from exc
            raise
        finally:
            try:
                import torch

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass

    return wrapper


# ------------------------------------------------------------------ diagnostics
def diagnostics(bgr: np.ndarray) -> dict:
    bgr = to_bgr(bgr)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    lap = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    # Immerkaer noise estimator
    k = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], dtype=np.float64)
    h, w = gray.shape
    conv = cv2.filter2D(gray.astype(np.float64), -1, k)[1:-1, 1:-1]
    noise = float(np.sqrt(np.pi / 2) * np.abs(conv).sum() / (6 * max(1, (w - 2) * (h - 2))))
    hist = cv2.calcHist([gray], [0], None, [32], [0, 256]).flatten()
    hist = (hist / max(1.0, hist.sum())).round(4).tolist()
    mean = float(gray.mean())
    clipped_lo = float((gray < 5).mean())
    clipped_hi = float((gray > 250).mean())
    if mean < 60:
        exposure = "underexposed"
    elif mean > 195:
        exposure = "overexposed"
    else:
        exposure = "balanced"
    flags = []
    if lap < 60:
        flags.append("blurry")
    if noise > 6:
        flags.append("noisy")
    if float(gray.std()) < 8:
        flags.append("low_contrast_or_blank")
    return {
        "width": int(w),
        "height": int(h),
        "blur_score": round(lap, 2),
        "sharpness": "sharp" if lap >= 150 else "soft" if lap >= 60 else "blurry",
        "noise_sigma": round(noise, 2),
        "mean_luma": round(mean, 1),
        "exposure": exposure,
        "clipped_shadows": round(clipped_lo, 4),
        "clipped_highlights": round(clipped_hi, 4),
        "histogram": hist,
        "flags": flags,
        "corrupted": False,
    }


def quality(bgr: np.ndarray) -> dict:
    """Cheap quality gate used by the agent's self-healing loop."""
    bgr = to_bgr(bgr)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 160)
    return {
        "finite": bool(np.isfinite(bgr).all()),
        "std": float(gray.std()),
        "edge_density": float((edges > 0).mean()),
        "lap_var": float(cv2.Laplacian(gray, cv2.CV_64F).var()),
        "pixels": int(gray.size),
    }


# ------------------------------------------------------------------ faces / OCR
@functools.lru_cache(maxsize=1)
def _face_cascade():
    return cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")


def detect_faces(bgr: np.ndarray) -> list[dict]:
    """Haar cascade (CPU, no downloads). Swap in RetinaFace/MediaPipe through NEURAL_BACKENDS['faces']."""
    if "faces" in NEURAL_BACKENDS:
        return NEURAL_BACKENDS["faces"](bgr)
    bgr = to_bgr(bgr)
    cascade = _face_cascade()
    if cascade.empty():  # some OpenCV builds ship without the XML data files
        return []
    gray = cv2.equalizeHist(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY))
    h, w = gray.shape
    min_sz = max(24, int(min(h, w) * 0.05))
    try:
        boxes = cascade.detectMultiScale(gray, 1.1, 5, minSize=(min_sz, min_sz))
    except cv2.error:
        return []
    return [{"x": int(x), "y": int(y), "w": int(bw), "h": int(bh)} for x, y, bw, bh in boxes]


@functools.lru_cache(maxsize=1)
def _ocr_reader():
    import easyocr  # optional dependency

    return easyocr.Reader(["en"], gpu=False, verbose=False)


def run_ocr(bgr: np.ndarray) -> dict:
    if not settings.enable_ocr:
        return {"enabled": False, "blocks": []}
    try:
        res = _ocr_reader().readtext(to_bgr(bgr))
    except Exception as exc:
        return {"enabled": False, "error": exc.__class__.__name__, "blocks": []}
    blocks = []
    for box, text, conf in res[:60]:
        xs, ys = [p[0] for p in box], [p[1] for p in box]
        blocks.append({"text": text[:200], "conf": round(float(conf), 3),
                       "x": int(min(xs)), "y": int(min(ys)), "w": int(max(xs) - min(xs)), "h": int(max(ys) - min(ys))})
    return {"enabled": True, "blocks": blocks}


# ------------------------------------------------------------------ integrity & safety
def dhash(bgr: np.ndarray, size: int = 8) -> str:
    g = cv2.cvtColor(to_bgr(bgr), cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, (size + 1, size), interpolation=cv2.INTER_AREA)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return f"{int(''.join('1' if b else '0' for b in bits), 2):0{size * size // 4}x}"


def phash(bgr: np.ndarray) -> str:
    g = cv2.cvtColor(to_bgr(bgr), cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, (32, 32), interpolation=cv2.INTER_AREA).astype(np.float32)
    d = cv2.dct(g)[:8, :8]
    med = np.median(d.flatten()[1:])
    bits = (d.flatten() > med)
    return f"{int(''.join('1' if b else '0' for b in bits), 2):016x}"


def hamming_hex(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def _ela_score(bgr: np.ndarray, quality_: int = 90) -> float:
    """Error-level analysis: heuristic only - NOT a deepfake verdict."""
    bgr = to_bgr(bgr)
    ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, quality_])
    if not ok:
        return 0.0
    re_ = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    diff = cv2.absdiff(bgr, re_).astype(np.float32)
    blk = cv2.resize(diff.mean(axis=2), (16, 16), interpolation=cv2.INTER_AREA)
    return float(np.clip(blk.std() / (blk.mean() + 1e-3) / 2.0, 0, 1))


def _skin_ratio(bgr: np.ndarray) -> float:
    ycrcb = cv2.cvtColor(to_bgr(bgr), cv2.COLOR_BGR2YCrCb)
    mask = cv2.inRange(ycrcb, (0, 133, 77), (255, 173, 127))
    return float((mask > 0).mean())


@functools.lru_cache(maxsize=1)
def _nsfw_pipe():
    from transformers import pipeline

    return pipeline("image-classification", model="Falconsai/nsfw_image_detection")


def integrity(bgr: np.ndarray) -> dict:
    ela = _ela_score(bgr)
    nsfw = {"method": "skin-tone heuristic", "score": 0.0}
    skin = _skin_ratio(bgr)
    nsfw["score"] = round(float(np.clip((skin - 0.35) / 0.4, 0, 1)), 3)
    if settings.enable_nsfw_model:
        try:
            out = _nsfw_pipe()(Image.fromarray(cv2.cvtColor(to_bgr(bgr), cv2.COLOR_BGR2RGB)))
            nsfw = {"method": "Falconsai/nsfw_image_detection",
                    "score": round(next((o["score"] for o in out if o["label"].lower() == "nsfw"), 0.0), 3)}
        except Exception:
            pass
    return {
        "manipulation_score": round(ela, 3),
        "manipulation_method": "error-level-analysis heuristic (indicative only)",
        "nsfw": nsfw,
        "nsfw_flag": nsfw["score"] >= 0.7,
        "fingerprint": {"dhash": dhash(bgr), "phash": phash(bgr)},
        "metadata_stripped": True,
    }


# ------------------------------------------------------------------ colour & segmentation
def palette(bgr: np.ndarray, k: int = 5) -> list[str]:
    small = cv2.resize(to_bgr(bgr), (64, 64), interpolation=cv2.INTER_AREA).reshape(-1, 3).astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 12, 1.0)
    _, labels, centers = cv2.kmeans(small, k, None, crit, 2, cv2.KMEANS_PP_CENTERS)
    order = np.argsort(-np.bincount(labels.flatten(), minlength=k))
    return ["#%02x%02x%02x" % (int(c[2]), int(c[1]), int(c[0])) for c in centers[order]]


def subject_mask(bgr: np.ndarray, iters: int = 4) -> np.ndarray:
    """Zero-click subject mask. GrabCut on a downscaled copy; plug SAM 2 in via NEURAL_BACKENDS['segment']."""
    bgr = to_bgr(bgr)
    if "segment" in NEURAL_BACKENDS:
        return NEURAL_BACKENDS["segment"](bgr)
    h, w = bgr.shape[:2]
    k = min(1.0, 640 / max(h, w))
    small = cv2.resize(bgr, (max(2, int(w * k)), max(2, int(h * k))), interpolation=cv2.INTER_AREA)
    sh, sw = small.shape[:2]
    mask = np.zeros((sh, sw), np.uint8)
    rect = (int(sw * 0.06), int(sh * 0.06), int(sw * 0.88), int(sh * 0.88))
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(small, mask, rect, bgd, fgd, max(1, int(iters)), cv2.GC_INIT_WITH_RECT)
        m = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    except cv2.error:
        m = np.zeros((sh, sw), np.uint8)
    if m.mean() < 255 * 0.02:  # degenerate -> centred ellipse fallback
        m = np.zeros((sh, sw), np.uint8)
        cv2.ellipse(m, (sw // 2, sh // 2), (int(sw * 0.38), int(sh * 0.42)), 0, 0, 360, 255, -1)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    m = cv2.GaussianBlur(m, (5, 5), 0)
    m = (m > 127).astype(np.uint8) * 255
    return cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)


# ------------------------------------------------------------------ full analysis
def analyze(bgr: np.ndarray) -> dict:
    from . import embeddings

    bgr3 = to_bgr(bgr)
    d = diagnostics(bgr3)
    faces = detect_faces(bgr3)
    pal = palette(bgr3)
    ocr = run_ocr(bgr3)
    tags = embeddings.auto_tags(bgr3, d, faces, pal, ocr)
    return {
        "diagnostics": d,
        "faces": faces,
        "palette": pal,
        "ocr": ocr,
        "integrity": integrity(bgr3),
        "tags": tags,
    }
