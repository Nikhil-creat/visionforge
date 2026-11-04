// Theme + motion registry. Palette colours themselves live in app/globals.css ([data-theme="..."] blocks) so the
// first paint is correct with no JS; this file holds metadata and the runtime helpers.

export type Palette = { id: string; name: string; dark: boolean; swatch: [string, string, string] };

export const PALETTES: Palette[] = [
  { id: "paper", name: "Paper", dark: false, swatch: ["#f7f7f5", "#111111", "#ffcf5a"] },
  { id: "mint", name: "Mint Lab", dark: false, swatch: ["#eef8f2", "#0b3d2e", "#2fd69a"] },
  { id: "sakura", name: "Sakura", dark: false, swatch: ["#fbf2f5", "#b0245b", "#ff9bb8"] },
  { id: "neon", name: "Neon Grid", dark: true, swatch: ["#05060d", "#38f5ff", "#be50ff"] },
  { id: "aurora", name: "Aurora", dark: true, swatch: ["#06100f", "#7cf7c4", "#8b6cff"] },
  { id: "ember", name: "Ember", dark: true, swatch: ["#0e0907", "#ff8a3d", "#ff4d4d"] },
  { id: "midnight", name: "Midnight Gold", dark: true, swatch: ["#070b17", "#f5c451", "#4d7cff"] },
];

export type MotionId = "calm" | "energetic" | "glitch" | "still";
export type Motion = {
  id: MotionId; name: string; desc: string;
  speed: number;   // hero time scale (0 = frozen)
  glitch: number;  // row-glitch threshold; lower = more frequent
  magnet: number;  // cursor interaction strength on the hero dots
};

export const MOTIONS: Motion[] = [
  { id: "calm", name: "Calm", desc: "Slow, editorial drift (default)", speed: 1, glitch: 0.965, magnet: 0 },
  { id: "energetic", name: "Energetic", desc: "Faster motion, cursor-reactive dots, shimmering glow", speed: 1.9, glitch: 0.95, magnet: 1 },
  { id: "glitch", name: "Glitch", desc: "LED-wall interference and RGB-split headlines", speed: 1.25, glitch: 0.86, magnet: 0.5 },
  { id: "still", name: "Still", desc: "No animation (also used for reduced-motion)", speed: 0, glitch: 1, magnet: 0 },
];

export type ThemeState = { p: string; m: MotionId; a?: string };
const KEY = "vf_theme";
const HEX = /^#[0-9a-f]{6}$/i;

export const motionById = (id: string | undefined): Motion => MOTIONS.find((m) => m.id === id) ?? MOTIONS[0];

export function loadTheme(): ThemeState {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const base: ThemeState = { p: "paper", m: reduce ? "still" : "calm" };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      p: PALETTES.some((x) => x.id === s.p) ? s.p : base.p,
      m: MOTIONS.some((x) => x.id === s.m) ? s.m : base.m,
      a: typeof s.a === "string" && HEX.test(s.a) ? s.a : undefined,
    };
  } catch { return base; }
}

export function contrastInk(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#000000" : "#ffffff";
}

export function applyTheme(s: ThemeState, persist = true) {
  const d = document.documentElement;
  d.setAttribute("data-theme", s.p);
  d.setAttribute("data-motion", s.m);
  if (s.a && HEX.test(s.a)) {
    d.style.setProperty("--accent", s.a);
    d.style.setProperty("--dot", s.a);
    d.style.setProperty("--accent-ink", contrastInk(s.a));
  } else {
    ["--accent", "--dot", "--accent-ink"].forEach((k) => d.style.removeProperty(k));
  }
  if (persist) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
  window.dispatchEvent(new Event("vf-theme"));
}
