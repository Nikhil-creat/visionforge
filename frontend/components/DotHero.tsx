"use client";
import { useEffect, useRef } from "react";
import { motionById } from "@/lib/themes";

/**
 * Live dot-matrix / LED halftone of two reaching hands (Kindred-style hero), drawn per-frame on a <canvas>.
 * Motion style (calm / energetic / glitch / still), palette colour and cursor interaction come from the theme system.
 * If the hand sheet fails to load, a procedural field is used so the hero never renders empty.
 */
const SHEET =
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261030_025250_100df7b8-31fd-4614-aa4a-c1b7d5b6b273.png&w=1600&q=85";

const SRC: Record<"LA" | "RA" | "LB" | "RB", [number, number, number, number]> = {
  LA: [0, 0.06, 0.47, 0.4], RA: [0.53, 0.06, 0.47, 0.4], LB: [0, 0.55, 0.47, 0.4], RB: [0.53, 0.55, 0.47, 0.4],
};
const LOOP = 20;
const LEVELS = [0, 0.26, 0.52, 0.78, 1];
const HAND_ASPECT = (0.4 * 1520) / (0.47 * 2688);

const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mixAt = (t: number, on: number, off: number, dur: number) => smooth(on, on + dur, t) * (1 - smooth(off, off + dur, t));

export default function DotHero() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const fA = document.createElement("canvas"), fB = document.createElement("canvas");
    const fxA = fA.getContext("2d", { willReadFrequently: true })!;
    const fxB = fB.getContext("2d", { willReadFrequently: true })!;
    let tiles: Partial<Record<keyof typeof SRC, HTMLCanvasElement>> = {};
    let W = 0, H = 0, DPR = 1, step = 7, rowStep = 14, cols = 0, rows = 0, R = 3, portrait = false;
    let seeds = new Float32Array(0);
    let dotColor = "#0d0d0d", raf = 0, frame = 0, alive = true, dirty = true;
    let motion = motionById(document.documentElement.dataset.motion);
    let vt = 3, last = performance.now();           // virtual time, advanced by motion.speed
    let px = -1e4, py = -1e4;                       // pointer in canvas CSS px

    const readTheme = () => {
      motion = motionById(document.documentElement.dataset.motion);
      dotColor = getComputedStyle(canvas).getPropertyValue("--dot").trim() || dotColor;
      dirty = true;
    };

    const layout = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width; H = r.height; DPR = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      step = Math.max(5, W / 205); rowStep = step * 2.05;
      cols = Math.ceil(W / step); rows = Math.ceil(H / rowStep); R = step * 0.46; portrait = H > W;
      fA.width = fB.width = cols; fA.height = fB.height = rows;
      seeds = new Float32Array(cols * rows);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++)
        seeds[j * cols + i] = 0.55 * hash(i, j) + 0.45 * hash(j * 3.1, 7.7);
      dirty = true;
    };

    const drawFallback = (fx: CanvasRenderingContext2D, left: boolean, variant: number) => {
      const cx = left ? W * 0.22 : W * 0.78, cy = H * (variant ? 0.58 : 0.5);
      const g = fx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.2);
      g.addColorStop(0, "rgba(0,0,0,.95)"); g.addColorStop(0.7, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,0)");
      fx.fillStyle = g; fx.beginPath(); fx.ellipse(cx, cy, W * 0.2, H * 0.14, left ? 0.15 : -0.15, 0, Math.PI * 2); fx.fill();
    };

    const drawPose = (fx: CanvasRenderingContext2D, keys: [keyof typeof SRC, keyof typeof SRC], t: number, variant: number) => {
      fx.setTransform(1, 0, 0, 1, 0, 0);
      fx.fillStyle = "#fff"; fx.fillRect(0, 0, cols, rows);
      const a = (2 * Math.PI * t) / LOOP;
      keys.forEach((k, idx) => {
        const left = idx === 0, ph = left ? 0 : Math.PI;
        const hw = W * (portrait ? 0.66 : 0.53), hh = hw * HAND_ASPECT, cy = H * (portrait ? 0.66 : 0.54);
        const reach = (0.035 * Math.sin(a + ph) + 0.012 * Math.sin(2 * a + 1.3 + ph)) * W;
        const sc = 1 + 0.07 * Math.sin(a + 0.9 + ph);
        const rot = (left ? 1 : -1) * 0.045 * Math.sin(a + 2.1 + ph);
        const x = left ? reach - W * 0.045 : W - hw + W * 0.045 - reach;
        const pvx = left ? x : x + hw;
        fx.setTransform(cols / W, 0, 0, rows / H, 0, 0);
        fx.translate(pvx, cy); fx.rotate(rot); fx.scale(sc, sc); fx.translate(-pvx, -cy);
        const tile = tiles[k];
        if (tile) fx.drawImage(tile, x, cy - hh / 2, hw, hh); else drawFallback(fx, left, variant);
      });
      fx.setTransform(1, 0, 0, 1, 0, 0);
    };

    const render = (tt: number) => {
      if (!W || !cols) return;
      const t = ((tt % LOOP) + LOOP) % LOOP;
      drawPose(fxA, ["LA", "RA"], t, 0);
      drawPose(fxB, ["LB", "RB"], t, 1);
      const dA = fxA.getImageData(0, 0, cols, rows).data, dB = fxB.getImageData(0, 0, cols, rows).data;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const tick = Math.floor(t * 7);
      const mL = mixAt(t, 6.2, 14.6, 1.6), mR = mixAt(t, 2.4, 10.4, 1.6);
      const paths = LEVELS.map(() => new Path2D());
      const qx = portrait ? 0.44 : 0.2, qy = portrait ? 0.33 : 0.385;
      const magnet = motion.magnet, MR = 110, MR2 = MR * MR;
      for (let j = 0; j < rows; j++) {
        const shift = hash(j, tick) > motion.glitch ? Math.round((hash(tick, j) - 0.5) * 8) : 0;
        const ey = (((j + 0.5) * rowStep) / H - qy) / 0.085;
        for (let i = 0; i < cols; i++) {
          const si = Math.min(cols - 1, Math.max(0, i - shift));
          const m = i < cols / 2 ? mL : mR;
          const seed = seeds[j * cols + i];
          const d = seed < m ? dB : dA;
          const lum = d[(j * cols + si) * 4] / 255;
          let v = Math.min(1, Math.max(0, (1 - lum - 0.16) / 0.42));
          if (v <= 0) continue;
          if (m > 0.001 && m < 0.999) {
            const df = Math.abs(seed - m);
            if (df < 0.12) { v *= df / 0.12; if (hash(i + tick, j) <= 0.4) v *= 0.3; }
          }
          v *= 0.86 + 0.14 * Math.sin(t * 3.2 + seed * 40);
          const cx = Math.abs((i + 0.5) / cols - 0.5);
          v *= smooth(0.035, 0.11, cx);
          v *= smooth(0.85, 1.25, Math.hypot(cx / qx, ey));
          let lvl = 0;
          for (let L = 1; L < LEVELS.length; L++) if (v >= LEVELS[L] - 0.13) lvl = L;
          if (!lvl) continue;
          let r = R * (lvl === 1 ? 0.38 : LEVELS[lvl]);
          let x = (i + 0.5) * step; const y = (j + 0.5) * rowStep;
          if (magnet > 0) {                                  // cursor: dots swell and are pushed aside
            const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
            if (d2 < MR2) {
              const k = 1 - Math.sqrt(d2) / MR;
              r *= 1 + 1.1 * k * magnet;
              x += (dx / (Math.sqrt(d2) + 1)) * k * k * 9 * magnet;
            }
          }
          paths[lvl].moveTo(x + r, y); paths[lvl].arc(x, y, r, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = dotColor;
      for (let L = 1; L < LEVELS.length; L++) ctx.fill(paths[L]);
    };

    (window as any).__render = render;   // lets a deterministic recorder / tests drive time
    layout(); readTheme();

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const out: typeof tiles = {};
      (Object.keys(SRC) as (keyof typeof SRC)[]).forEach((k) => {
        const [fx, fy, fw, fh] = SRC[k];
        const sw = img.naturalWidth * fw, sh = img.naturalHeight * fh;
        const c = document.createElement("canvas");
        c.width = 420; c.height = Math.round((420 * sh) / sw);
        const cx = c.getContext("2d")!;
        cx.imageSmoothingQuality = "high";
        cx.drawImage(img, img.naturalWidth * fx, img.naturalHeight * fy, sw, sh, 0, 0, c.width, c.height);
        out[k] = c;
      });
      tiles = out; dirty = true;
    };
    img.onerror = () => { tiles = {}; };
    img.src = SHEET;

    const loop = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      vt += dt * motion.speed;
      if (motion.speed > 0 || dirty) { render(vt); dirty = false; }   // 'still' only repaints when something changed
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => layout();
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      px = e.clientX - r.left; py = e.clientY - r.top;
      if (motion.magnet > 0 && motion.speed === 0) dirty = true;
    };
    const onLeave = () => { px = py = -1e4; dirty = true; };
    const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else if (alive) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    window.addEventListener("resize", onResize);
    window.addEventListener("vf-theme", readTheme);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false; cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("vf-theme", readTheme);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 block h-full w-full" />;
}
