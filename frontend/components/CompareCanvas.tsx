"use client";
import { useCallback, useEffect, useRef } from "react";

type Props = { before: string | null; after: string | null; className?: string };

/** Before/after split canvas: wheel-zoom, drag-pan, draggable divider, DPR-aware, checkerboard for alpha. */
export default function CompareCanvas({ before, after, className }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const s = useRef({
    zoom: 1, ox: 0, oy: 0, split: 0.5, a: null as HTMLImageElement | null, b: null as HTMLImageElement | null,
    drag: null as null | "pan" | "split", lx: 0, ly: 0, w: 0, h: 0, dpr: 1, checker: null as CanvasPattern | null,
  });

  const draw = useCallback(() => {
    const c = cv.current; if (!c) return;
    const st = s.current, ctx = c.getContext("2d")!;
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    ctx.clearRect(0, 0, st.w, st.h);
    const base = st.b || st.a;
    const ink = getComputedStyle(c).getPropertyValue("--mute").trim() || "#999";
    if (!base) {
      ctx.fillStyle = ink; ctx.font = "13px Inter, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Upload an image to start", st.w / 2, st.h / 2); return;
    }
    if (!st.checker) {
      const p = document.createElement("canvas"); p.width = p.height = 16;
      const px = p.getContext("2d")!; px.fillStyle = "#cfcfcf"; px.fillRect(0, 0, 16, 16);
      px.fillStyle = "#e9e9e9"; px.fillRect(0, 0, 8, 8); px.fillRect(8, 8, 8, 8);
      st.checker = ctx.createPattern(p, "repeat");
    }
    const iw = base.naturalWidth, ih = base.naturalHeight;
    const paint = (img: HTMLImageElement) => {
      ctx.save(); ctx.translate(st.ox, st.oy); ctx.scale(st.zoom, st.zoom);
      ctx.imageSmoothingEnabled = st.zoom < 3; ctx.imageSmoothingQuality = "high";
      if (st.checker) { ctx.fillStyle = st.checker; ctx.fillRect(0, 0, iw, ih); }
      ctx.drawImage(img, 0, 0, iw, ih); // 'before' is stretched to the 'after' size so upscales compare 1:1
      ctx.restore();
    };
    if (st.a) paint(st.a); else paint(base);
    const sx = st.split * st.w;
    if (st.a && st.b) {
      ctx.save(); ctx.beginPath(); ctx.rect(sx, 0, st.w - sx, st.h); ctx.clip(); paint(st.b); ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,.95)"; ctx.fillRect(sx - 1, 0, 2, st.h);
      ctx.beginPath(); ctx.arc(sx, st.h / 2, 15, 0, Math.PI * 2); ctx.fillStyle = "#111"; ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "600 11px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("◂▸", sx, st.h / 2);
      const tag = (t: string, x: number, al: CanvasTextAlign) => {
        ctx.font = "600 11px Inter, sans-serif"; ctx.textAlign = al; ctx.textBaseline = "alphabetic";
        const w = ctx.measureText(t).width + 16, bx = al === "left" ? x : x - w;
        ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(bx, 12, w, 22); ctx.fillStyle = "#fff"; ctx.fillText(t, al === "left" ? x + 8 : x - 8, 27);
      };
      tag("BEFORE", 12, "left"); tag("AFTER", st.w - 12, "right");
    }
  }, []);

  const fit = useCallback(() => {
    const st = s.current, base = st.b || st.a; if (!base || !st.w) return;
    st.zoom = Math.min(st.w / base.naturalWidth, st.h / base.naturalHeight) * 0.96;
    st.ox = (st.w - base.naturalWidth * st.zoom) / 2; st.oy = (st.h - base.naturalHeight * st.zoom) / 2;
    draw();
  }, [draw]);

  useEffect(() => {
    const load = (src: string | null, key: "a" | "b") => {
      if (!src) { s.current[key] = null; draw(); return; }
      const im = new Image(); im.onload = () => { s.current[key] = im; fit(); }; im.src = src;
    };
    load(before, "a"); load(after, "b");
  }, [before, after, draw, fit]);

  useEffect(() => {
    const c = cv.current!, w = wrap.current!, st = s.current;
    const resize = () => {
      const r = w.getBoundingClientRect(); st.dpr = Math.min(2, window.devicePixelRatio || 1);
      st.w = r.width; st.h = r.height; c.width = Math.round(r.width * st.dpr); c.height = Math.round(r.height * st.dpr);
      c.style.width = r.width + "px"; c.style.height = r.height + "px"; fit();
    };
    const ro = new ResizeObserver(resize); ro.observe(w); resize();
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const k = Math.exp(-e.deltaY * 0.0015), nz = Math.min(40, Math.max(0.05, st.zoom * k)), f = nz / st.zoom;
      st.ox = x - (x - st.ox) * f; st.oy = y - (y - st.oy) * f; st.zoom = nz; draw();
    };
    c.addEventListener("wheel", wheel, { passive: false });
    return () => { ro.disconnect(); c.removeEventListener("wheel", wheel); };
  }, [draw, fit]);

  const down = (e: React.PointerEvent) => {
    const st = s.current, r = cv.current!.getBoundingClientRect(), x = e.clientX - r.left;
    st.drag = st.a && st.b && Math.abs(x - st.split * st.w) < 16 ? "split" : "pan";
    st.lx = e.clientX; st.ly = e.clientY; cv.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const st = s.current; if (!st.drag) return;
    if (st.drag === "split") { const r = cv.current!.getBoundingClientRect(); st.split = Math.min(1, Math.max(0, (e.clientX - r.left) / st.w)); }
    else { st.ox += e.clientX - st.lx; st.oy += e.clientY - st.ly; }
    st.lx = e.clientX; st.ly = e.clientY; draw();
  };
  const up = () => { s.current.drag = null; };
  const zoomBy = (f: number) => {
    const st = s.current, cx = st.w / 2, cy = st.h / 2, nz = Math.min(40, Math.max(0.05, st.zoom * f)), k = nz / st.zoom;
    st.ox = cx - (cx - st.ox) * k; st.oy = cy - (cy - st.oy) * k; st.zoom = nz; draw();
  };
  const actual = () => {
    const st = s.current, base = st.b || st.a; if (!base) return;
    st.zoom = 1; st.ox = (st.w - base.naturalWidth) / 2; st.oy = (st.h - base.naturalHeight) / 2; draw();
  };

  return (
    <div className={`glass relative overflow-hidden ${className ?? ""}`}>
      <div ref={wrap} className="h-full w-full">
        <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          className="block cursor-grab touch-none active:cursor-grabbing" />
      </div>
      <div className="absolute bottom-3 left-3 flex gap-1.5">
        <button className="pill-ghost bg-card" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <button className="pill-ghost bg-card" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
        <button className="pill-ghost bg-card" onClick={fit}>Fit</button>
        <button className="pill-ghost bg-card" onClick={actual}>100%</button>
      </div>
    </div>
  );
}
