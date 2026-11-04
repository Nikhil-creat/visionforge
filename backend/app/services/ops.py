"""Image operation catalogue. Every op: fn(bgr, mask=None, **params) -> (bgr_out, info)."""
from __future__ import annotations

import functools
import math
import os

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from ..config import settings
from . import vision


def P(t, default, lo=None, hi=None, choices=None, desc=""):
    return {"type": t, "default": default, "min": lo, "max": hi, "choices": choices, "desc": desc}


REGION = P("str", "all", choices=["all", "subject", "background"], desc="Where to apply the effect")


def clean_params(name: str, params) -> dict:
    spec = OPS[name]["params"]
    params = params if isinstance(params, dict) else {}
    out = {}
    for k, s in spec.items():
        v = params.get(k, s["default"])
        try:
            if s["type"] == "int":
                v = int(round(float(v)))
            elif s["type"] == "float":
                v = float(v)
            elif s["type"] == "bool":
                v = v if isinstance(v, bool) else str(v).lower() in ("1", "true", "yes")
            else:
                v = str(v)[:64]
        except (TypeError, ValueError):
            v = s["default"]
        if s["type"] in ("int", "float"):
            if s["min"] is not None:
                v = max(s["min"], v)
            if s["max"] is not None:
                v = min(s["max"], v)
        if s["choices"] and v not in s["choices"]:
            v = s["default"]
        out[k] = v
    return out


# ------------------------------------------------------------------ helpers
def _prep(img):
    if img.ndim == 3 and img.shape[2] == 4:
        return img[:, :, :3].copy(), img[:, :, 3].copy()
    return img, None


def _flatten(bgr, alpha, bg=255):
    a = (alpha.astype(np.float32) / 255.0)[..., None]
    return (bgr.astype(np.float32) * a + bg * (1 - a)).astype(np.uint8)


def _gray(bgr):
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)


@functools.lru_cache(maxsize=2)
def _font(size: int, mono: bool = True):
    cands = ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/usr/share/fonts/dejavu/DejaVuSansMono.ttf"]
    for c in cands:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    try:
        return ImageFont.load_default(size)
    except TypeError:
        return ImageFont.load_default()


def _grid_from(bgr, cols, cell_aspect=1.0):
    h, w = bgr.shape[:2]
    rows = max(1, int(round(cols * h / w / cell_aspect)))
    return cv2.resize(bgr, (cols, rows), interpolation=cv2.INTER_AREA), rows


# ------------------------------------------------------------------ analysis-style ops
def op_segment(bgr, mask=None, iters=4, **_):
    m = vision.subject_mask(bgr, iters)
    over = bgr.copy()
    tint = np.zeros_like(bgr)
    tint[:] = (255, 220, 0)
    over = np.where(m[..., None] > 0, cv2.addWeighted(bgr, 0.55, tint, 0.45, 0), (bgr * 0.45).astype(np.uint8))
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(over, cnts, -1, (255, 255, 0), max(1, bgr.shape[1] // 400))
    return over.astype(np.uint8), {"coverage": round(float((m > 0).mean()), 3), "_mask": m}


def op_remove_background(bgr, mask=None, iters=4, **_):
    m = mask if mask is not None and mask.shape[:2] == bgr.shape[:2] else vision.subject_mask(bgr, iters)
    soft = cv2.GaussianBlur(m, (0, 0), 1.2)
    return bgr, {"coverage": round(float((m > 0).mean()), 3), "_mask": m, "_alpha": soft}


# ------------------------------------------------------------------ cleanup & enhancement
def op_denoise(bgr, strength=7, **_):
    return cv2.fastNlMeansDenoisingColored(bgr, None, strength, strength, 7, 21), {}


def op_enhance(bgr, clahe=2.0, sharpen=0.6, **_):
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=clahe, tileGridSize=(8, 8)).apply(l)
    out = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
    blur = cv2.GaussianBlur(out, (0, 0), 1.6)
    return cv2.addWeighted(out, 1 + sharpen, blur, -sharpen, 0), {}


def op_blur_faces(bgr, strength=45, **_):
    faces = vision.detect_faces(bgr)
    out = bgr.copy()
    for f in faces:
        pad = int(0.15 * max(f["w"], f["h"]))
        x0, y0 = max(0, f["x"] - pad), max(0, f["y"] - pad)
        x1, y1 = min(bgr.shape[1], f["x"] + f["w"] + pad), min(bgr.shape[0], f["y"] + f["h"] + pad)
        k = max(3, (strength * max(1, (x1 - x0) // 40)) | 1)
        out[y0:y1, x0:x1] = cv2.GaussianBlur(out[y0:y1, x0:x1], (k, k), 0)
    return out, {"faces_blurred": len(faces)}


def op_strip_metadata(bgr, **_):
    return bgr.copy(), {"note": "All EXIF/ICC/XMP dropped by pixel re-encode"}


def op_upscale(bgr, factor=4, sharpen=0.35, **_):
    h, w = bgr.shape[:2]
    while factor > 1 and h * w * factor * factor > settings.max_output_pixels:
        factor //= 2
    if factor <= 1:
        return bgr, {"note": "output cap reached - no upscale applied"}
    if "upscale" in vision.NEURAL_BACKENDS:
        try:
            return vision.NEURAL_BACKENDS["upscale"](bgr, factor), {"backend": "neural"}
        except Exception:
            pass
    out, f = bgr, factor
    while f > 1:  # progressive 2x steps look cleaner than one big jump
        step = 2 if f % 2 == 0 else f
        out = cv2.resize(out, None, fx=step, fy=step, interpolation=cv2.INTER_LANCZOS4)
        f //= step
    blur = cv2.GaussianBlur(out, (0, 0), 1.2)
    return cv2.addWeighted(out, 1 + sharpen, blur, -sharpen, 0), {"backend": "lanczos+unsharp", "factor": factor}


def op_relight(bgr, azimuth=315, intensity=0.45, **_):
    h, w = bgr.shape[:2]
    ang = math.radians(azimuth)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    g = ((xx / w - 0.5) * math.cos(ang) + (yy / h - 0.5) * -math.sin(ang))
    g = (g - g.min()) / (g.max() - g.min() + 1e-6)
    gain = 1 + intensity * (g - 0.5) * 2
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab[:, :, 0] = np.clip(lab[:, :, 0] * gain, 0, 255)
    return cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2BGR), {}


_THEMES = {  # gradient-map ramps (BGR) dark -> light
    "neon": [(30, 0, 40), (255, 0, 190), (255, 240, 0)],
    "sepia": [(20, 30, 45), (90, 140, 190), (220, 240, 250)],
    "mono": [(10, 10, 10), (128, 128, 128), (250, 250, 250)],
    "pastel": [(120, 90, 160), (200, 190, 240), (240, 255, 250)],
    "ocean": [(60, 20, 5), (170, 120, 20), (240, 250, 200)],
    "ember": [(10, 10, 40), (30, 90, 220), (140, 230, 255)],
}


def op_style_transfer(bgr, theme="neon", strength=0.8, **_):
    stops = np.array(_THEMES[theme], np.float32)
    lum = _gray(bgr).astype(np.float32) / 255.0
    lut = np.zeros((256, 3), np.float32)
    for i in range(256):
        t = i / 255.0
        a, b, f = (0, 1, t * 2) if t < 0.5 else (1, 2, (t - 0.5) * 2)
        lut[i] = stops[a] * (1 - f) + stops[b] * f
    mapped = lut[(lum * 255).astype(np.uint8)]
    return np.clip(bgr * (1 - strength) + mapped * strength, 0, 255).astype(np.uint8), {"theme": theme}


# ------------------------------------------------------------------ generative-style edits (CPU)
def op_inpaint(bgr, mask=None, target="box", x=0.4, y=0.4, w=0.2, h=0.2, radius=5, **_):
    H, W = bgr.shape[:2]
    if target == "subject":
        m = mask if mask is not None and mask.shape[:2] == (H, W) else vision.subject_mask(bgr)
        m = cv2.dilate(m, np.ones((9, 9), np.uint8), iterations=2)
    else:
        m = np.zeros((H, W), np.uint8)
        cv2.rectangle(m, (int(x * W), int(y * H)), (int((x + w) * W), int((y + h) * H)), 255, -1)
    return cv2.inpaint(bgr, m, radius, cv2.INPAINT_TELEA), {"target": target, "masked": round(float((m > 0).mean()), 3)}


def op_outpaint(bgr, aspect="16:9", feather=0.04, **_):
    aw, ah = (int(v) for v in aspect.split(":"))
    H, W = bgr.shape[:2]
    tw, th = (max(W, int(H * aw / ah)), H) if W / H < aw / ah else (W, max(H, int(W * ah / aw)))
    if tw == W and th == H:
        return bgr, {"note": "already at target aspect"}
    bg = cv2.GaussianBlur(cv2.resize(bgr, (tw, th), interpolation=cv2.INTER_LINEAR), (0, 0), max(tw, th) / 60)
    ox, oy = (tw - W) // 2, (th - H) // 2
    m = np.zeros((th, tw), np.float32)
    m[oy:oy + H, ox:ox + W] = 1
    f = max(3, int(min(W, H) * feather) | 1)
    m = cv2.GaussianBlur(m, (f, f), 0)[..., None]
    canvas = bg.copy()
    canvas[oy:oy + H, ox:ox + W] = bgr
    return (canvas * m + bg * (1 - m)).astype(np.uint8), {"canvas": [tw, th]}


# ------------------------------------------------------------------ vector / topology
def op_vectorize(bgr, levels=6, min_area=40, **_):
    H, W = bgr.shape[:2]
    k = min(1.0, 800 / max(H, W))
    small = cv2.resize(bgr, (int(W * k), int(H * k)), interpolation=cv2.INTER_AREA)
    small = cv2.bilateralFilter(small, 7, 40, 7)
    data = small.reshape(-1, 3).astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 15, 1.0)
    _, lab, cen = cv2.kmeans(data, levels, None, crit, 2, cv2.KMEANS_PP_CENTERS)
    lab = lab.reshape(small.shape[:2])
    order = np.argsort(-np.bincount(lab.flatten(), minlength=levels))
    sx, sy = W / small.shape[1], H / small.shape[0]
    bg = tuple(int(c) for c in cen[order[0]])
    paths = [f'<rect width="{W}" height="{H}" fill="#{bg[2]:02x}{bg[1]:02x}{bg[0]:02x}"/>']
    preview = np.full(bgr.shape, bg, np.uint8)
    n = 0
    for idx in order[1:]:
        m = (lab == idx).astype(np.uint8) * 255
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        cnts, _ = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        col = tuple(int(c) for c in cen[idx])
        d = []
        for c in cnts:
            if cv2.contourArea(c) < min_area * k * k:
                continue
            c = cv2.approxPolyDP(c, 0.8, True)
            if len(c) < 3:
                continue
            pts = [(p[0][0] * sx, p[0][1] * sy) for p in c]
            d.append("M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + "Z")
            cv2.fillPoly(preview, [np.array(pts, np.int32)], col)
            n += 1
        if d:
            paths.append(f'<path fill="#{col[2]:02x}{col[1]:02x}{col[0]:02x}" fill-rule="evenodd" d="{" ".join(d)}"/>')
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">{"".join(paths)}</svg>'
    return preview, {"paths": n, "svg": svg}


def op_depth_contours(bgr, levels=12, **_):
    if "depth" in vision.NEURAL_BACKENDS:
        depth = vision.NEURAL_BACKENDS["depth"](bgr).astype(np.float32)
        src = "neural depth"
    else:  # luminance + vertical prior proxy; clearly labelled
        g = cv2.GaussianBlur(_gray(bgr), (0, 0), max(bgr.shape[:2]) / 120).astype(np.float32)
        yy = np.linspace(0, 1, bgr.shape[0], dtype=np.float32)[:, None]
        depth = g * 0.7 + yy * 255 * 0.3
        src = "luminance proxy (register a Depth Anything V2 backend for true depth)"
    depth = cv2.normalize(depth, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    out = np.full_like(bgr, 12)
    lw = max(1, bgr.shape[1] // 500)
    for i in range(1, levels):
        t = int(i * 255 / levels)
        cnts, _ = cv2.findContours((depth > t).astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        col = cv2.applyColorMap(np.array([[t]], np.uint8), cv2.COLORMAP_TURBO)[0, 0].tolist()
        cv2.drawContours(out, cnts, -1, col, lw)
    return out, {"source": src}


# ------------------------------------------------------------------ symbolic engines
EMOJI_THEMES = {
    "moon": list("🌑🌘🌗🌖🌕"),
    "hearts": list("🖤🤎❤️🧡💛💚💙💜🤍"),
    "faces": list("😶😐🙂😀😄😁🤩"),
    "nature": list("🌑🌲🌿🍀🌼🌻🌕"),
}
_EMOJI_FONTS = [os.environ.get("EMOJI_FONT", ""), "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
                "/usr/share/fonts/noto/NotoColorEmoji.ttf", "/usr/share/fonts/NotoColorEmoji.ttf"]


@functools.lru_cache(maxsize=1)
def _emoji_font():
    for p in _EMOJI_FONTS:
        if p and os.path.exists(p):
            try:
                return ImageFont.truetype(p, 109)
            except Exception:
                continue
    return None


@functools.lru_cache(maxsize=512)
def _glyph(ch: str, cell: int):
    f = _emoji_font()
    if f is None:
        return None
    im = Image.new("RGBA", (136, 128), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((0, 0), ch, font=f, embedded_color=True)
    bb = im.getbbox()
    return im.crop(bb).resize((cell, cell), Image.LANCZOS) if bb else None


def op_emoji_mosaic(bgr, cols=48, theme="moon", mode="luminance", cell=22, **_):
    small, rows = _grid_from(bgr, cols)
    ramp = EMOJI_THEMES[theme]
    canvas = Image.new("RGB", (cols * cell, rows * cell), (14, 14, 18))
    drw = ImageDraw.Draw(canvas)
    lum = _gray(small)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    lines, fallback = [], _emoji_font() is None
    for j in range(rows):
        row = []
        for i in range(cols):
            if mode == "hue" and hsv[j, i, 1] > 40:
                idx = int(hsv[j, i, 0] / 180 * (len(ramp) - 1))
            else:
                idx = int(lum[j, i] / 256 * len(ramp))
            ch = ramp[min(idx, len(ramp) - 1)]
            row.append(ch)
            g = None if fallback else _glyph(ch, cell)
            if g is not None:
                canvas.paste(g, (i * cell, j * cell), g)
            else:
                b, gr, r = (int(v) for v in small[j, i])
                drw.ellipse([i * cell + 2, j * cell + 2, (i + 1) * cell - 2, (j + 1) * cell - 2], fill=(r, gr, b))
        lines.append("".join(row))
    out = cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR)
    return out, {"grid": "\n".join(lines)[:20000], "cols": cols, "rows": rows,
                 "renderer": "colour-dot fallback (install fonts-noto-color-emoji)" if fallback else "NotoColorEmoji"}


def op_ascii_matrix(bgr, cols=110, invert=False, color=True, ramp=" .:-=+*#%@", **_):
    small, rows = _grid_from(bgr, cols, cell_aspect=1.8)
    g = _gray(small)
    if invert:
        g = 255 - g
    cw, ch = 8, 14
    canvas = Image.new("RGB", (cols * cw, rows * ch), (8, 10, 12))
    d = ImageDraw.Draw(canvas)
    f = _font(12)
    text = []
    for j in range(rows):
        line = ""
        for i in range(cols):
            c = ramp[int(g[j, i] / 256 * len(ramp))]
            line += c
            if c != " ":
                b, gr, r = (int(v) for v in small[j, i])
                d.text((i * cw, j * ch), c, font=f, fill=(r, gr, b) if color else (90, 255, 160))
        text.append(line)
    return cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR), {"text": "\n".join(text)[:30000]}


def op_latex_matrix(bgr, cols=40, **_):
    small, rows = _grid_from(bgr, cols, cell_aspect=1.8)
    vals = (_gray(small).astype(np.int32) * 9 // 255)
    cw, ch = 14, 18
    canvas = Image.new("RGB", (cols * cw + 40, rows * ch + 20), (6, 8, 14))
    d = ImageDraw.Draw(canvas)
    f = _font(13)
    for j in range(rows):
        for i in range(cols):
            v = int(vals[j, i])
            if v:
                shade = 70 + v * 20
                d.text((20 + i * cw, 10 + j * ch), str(v), font=f, fill=(shade // 2, shade, 255 - v * 8))
    d.line([(10, 8), (10, rows * ch + 12)], fill=(120, 140, 255), width=2)
    d.line([(cols * cw + 28, 8), (cols * cw + 28, rows * ch + 12)], fill=(120, 140, 255), width=2)
    cr, cc = min(rows, 10), min(cols, 14)
    body = r" \\ ".join(" & ".join(str(int(x)) for x in vals[j, :cc]) for j in range(cr))
    latex = "\\mathbf{I}\\approx\\begin{pmatrix}" + body + "\\end{pmatrix}"
    return cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR), {"latex_preview": latex, "shape": [rows, cols]}


LEVELS = [0, 0.26, 0.52, 0.78, 1.0]


def op_dot_matrix(bgr, step=7, invert=False, color=False, **_):
    """Kindred-style LED halftone: scanline rows of 5-level quantised dots."""
    H, W = bgr.shape[:2]
    row_step = step * 2.05
    cols, rows = int(math.ceil(W / step)), int(math.ceil(H / row_step))
    small = cv2.resize(bgr, (cols, rows), interpolation=cv2.INTER_AREA)
    lum = _gray(small).astype(np.float32) / 255.0
    v = np.clip((lum - 0.16) / 0.42 if invert else (1 - lum - 0.16) / 0.42, 0, 1)
    R = step * 0.46
    S = 2
    canvas = Image.new("RGB", (W * S, H * S), (247, 247, 245) if not invert else (13, 13, 13))
    d = ImageDraw.Draw(canvas)
    for j in range(rows):
        for i in range(cols):
            lvl = 0.0
            for L in LEVELS:
                if v[j, i] >= L - 0.13:
                    lvl = L
            if lvl == 0:
                continue
            r = R * (0.38 if lvl == LEVELS[1] else lvl) * S
            cx, cy = (i + 0.5) * step * S, (j + 0.5) * row_step * S
            if color:
                b, g, rr = (int(c) for c in small[j, i])
                fill = (rr, g, b)
            else:
                fill = (13, 13, 13) if not invert else (247, 247, 245)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)
    out = cv2.cvtColor(np.array(canvas.resize((W, H), Image.LANCZOS)), cv2.COLOR_RGB2BGR)
    return out, {"dots": int((v > 0).sum()), "grid": [cols, rows]}


# ------------------------------------------------------------------ registry
OPS: dict[str, dict] = {
    "segment": dict(fn=op_segment, label="Subject Segmentation", group="Recognition",
                    desc="Zero-click subject mask preview (GrabCut; plug in SAM 2).", params={"iters": P("int", 4, 1, 8)}),
    "remove_background": dict(fn=op_remove_background, label="Background Removal", group="Recognition",
                              desc="Cut the subject out onto a transparent canvas.", params={"iters": P("int", 4, 1, 8)}),
    "denoise": dict(fn=op_denoise, label="Denoise", group="Enhance", desc="Non-local-means colour denoising.",
                    params={"strength": P("int", 7, 1, 20), "region": REGION}),
    "enhance": dict(fn=op_enhance, label="Auto Enhance", group="Enhance", desc="CLAHE contrast + adaptive sharpening.",
                    params={"clahe": P("float", 2.0, 0.5, 6.0), "sharpen": P("float", 0.6, 0.0, 2.0), "region": REGION}),
    "blur_faces": dict(fn=op_blur_faces, label="Privacy Face Blur", group="Privacy", desc="Detect and blur every face.",
                       params={"strength": P("int", 45, 5, 120)}),
    "strip_metadata": dict(fn=op_strip_metadata, label="Strip Metadata", group="Privacy", desc="Drop EXIF/GPS/XMP.", params={}),
    "upscale": dict(fn=op_upscale, label="Super-Resolution", group="Enhance", desc="2x/4x/8x upscale with sharpening.",
                    params={"factor": P("int", 4, 2, 8, choices=None), "sharpen": P("float", 0.35, 0.0, 1.0)}),
    "relight": dict(fn=op_relight, label="Neural Relighting", group="Enhance", desc="Directional light gradient in LAB space.",
                    params={"azimuth": P("int", 315, 0, 360), "intensity": P("float", 0.45, 0.0, 1.0), "region": REGION}),
    "style_transfer": dict(fn=op_style_transfer, label="Palette / Style Transfer", group="Generative",
                           desc="Gradient-map palette transfer with strength control.",
                           params={"theme": P("str", "neon", choices=list(_THEMES)), "strength": P("float", 0.8, 0.0, 1.0), "region": REGION}),
    "inpaint": dict(fn=op_inpaint, label="Object Removal (Inpaint)", group="Generative",
                    desc="Remove a box region or the detected subject.",
                    params={"target": P("str", "box", choices=["box", "subject"]), "x": P("float", 0.4, 0, 1), "y": P("float", 0.4, 0, 1),
                            "w": P("float", 0.2, 0.01, 1), "h": P("float", 0.2, 0.01, 1), "radius": P("int", 5, 1, 25)}),
    "outpaint": dict(fn=op_outpaint, label="Canvas Outpaint", group="Generative", desc="Expand to a new aspect ratio.",
                     params={"aspect": P("str", "16:9", choices=["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"]), "feather": P("float", 0.04, 0.0, 0.2)}),
    "vectorize": dict(fn=op_vectorize, label="SVG Vectorizer", group="Symbolic", desc="Raster to layered SVG paths.",
                      params={"levels": P("int", 6, 2, 16), "min_area": P("int", 40, 4, 2000)}),
    "depth_contours": dict(fn=op_depth_contours, label="Depth Contours", group="Symbolic", desc="Topographic depth-map contours.",
                           params={"levels": P("int", 12, 3, 32)}),
    "emoji_mosaic": dict(fn=op_emoji_mosaic, label="Emoji Mosaic", group="Symbolic", desc="Luminance/hue-mapped emoji grid.",
                         params={"cols": P("int", 48, 8, 120), "theme": P("str", "moon", choices=list(EMOJI_THEMES)),
                                 "mode": P("str", "luminance", choices=["luminance", "hue"]), "cell": P("int", 22, 10, 40), "region": REGION}),
    "ascii_matrix": dict(fn=op_ascii_matrix, label="ASCII Matrix", group="Symbolic", desc="Coloured ASCII art.",
                         params={"cols": P("int", 110, 20, 240), "invert": P("bool", False), "color": P("bool", True), "region": REGION}),
    "latex_matrix": dict(fn=op_latex_matrix, label="LaTeX Tensor Grid", group="Symbolic", desc="Image as a digit tensor + pmatrix source.",
                         params={"cols": P("int", 40, 10, 90), "region": REGION}),
    "dot_matrix": dict(fn=op_dot_matrix, label="LED Dot-Matrix", group="Symbolic", desc="Kindred-style 5-level scanline halftone.",
                       params={"step": P("int", 7, 4, 16), "invert": P("bool", False), "color": P("bool", False), "region": REGION}),
}

SHAPE_CHANGING = {"upscale", "outpaint"}
FLATTEN_FIRST = {"outpaint", "vectorize", "depth_contours"}


def catalogue() -> list[dict]:
    return [{"name": n, "label": s["label"], "group": s["group"], "desc": s["desc"],
             "params": {k: {kk: vv for kk, vv in v.items()} for k, v in s["params"].items()}} for n, s in OPS.items()]


def run_op(name: str, img: np.ndarray, params=None, mask=None):
    """Run one op with region + alpha handling. Returns (img, info, mask)."""
    if name not in OPS:
        raise ValueError(f"Unknown tool: {name}")
    p = clean_params(name, params or {})
    region = p.pop("region", "all")
    bgr, alpha = _prep(img)
    if name in FLATTEN_FIRST and alpha is not None:
        bgr, alpha = _flatten(bgr, alpha), None

    m = mask if mask is not None and mask.shape[:2] == bgr.shape[:2] else None
    if region in ("subject", "background"):
        if alpha is not None:
            m = (alpha > 127).astype(np.uint8) * 255
            if region == "background":
                bgr, alpha = _flatten(bgr, alpha), None
        elif m is None:
            m = vision.subject_mask(bgr)

    out, info = OPS[name]["fn"](bgr, mask=m, **p)
    new_mask = info.pop("_mask", m)
    new_alpha = info.pop("_alpha", None)
    if new_alpha is not None:
        alpha = new_alpha

    if region in ("subject", "background") and m is not None and name not in SHAPE_CHANGING:
        if out.shape[:2] != bgr.shape[:2]:  # pattern ops render on their own canvas; fit it back to the source frame
            out = cv2.resize(out, (bgr.shape[1], bgr.shape[0]), interpolation=cv2.INTER_AREA)
        sel = (m > 127) if region == "subject" else (m <= 127)
        res = bgr.copy()
        res[sel] = out[sel]
        out = res

    if alpha is not None:
        if alpha.shape[:2] != out.shape[:2]:
            alpha = cv2.resize(alpha, (out.shape[1], out.shape[0]), interpolation=cv2.INTER_NEAREST)
        out = np.dstack([out, alpha])
    if new_mask is not None and new_mask.shape[:2] != out.shape[:2]:
        new_mask = cv2.resize(new_mask, (out.shape[1], out.shape[0]), interpolation=cv2.INTER_NEAREST)
    return out, info, new_mask
