"use client";
import { useEffect, useRef, useState } from "react";
import { MOTIONS, PALETTES, ThemeState, applyTheme, loadTheme } from "@/lib/themes";

export default function ThemePanel() {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<ThemeState>({ p: "paper", m: "calm" });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setT(loadTheme());
    const sync = () => setT(loadTheme());
    window.addEventListener("vf-theme", sync);
    return () => window.removeEventListener("vf-theme", sync);
  }, []);
  useEffect(() => {
    const click = (e: MouseEvent) => { if (open && box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open]);

  const set = (patch: Partial<ThemeState>) => { const next = { ...t, ...patch }; setT(next); applyTheme(next); };
  const random = () => set({ p: PALETTES[Math.floor(Math.random() * PALETTES.length)].id, a: undefined });

  return (
    <div ref={box} className="relative">
      <button className="pill-ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog">Theme</button>
      {open && (
        <div role="dialog" aria-label="Theme settings" className="glass absolute right-0 top-11 z-50 w-[min(340px,calc(100vw-2rem))] p-4 shadow-2xl">
          <p className="eyebrow mb-2">Palette</p>
          <div className="grid grid-cols-2 gap-2">
            {PALETTES.map((p) => (
              <button key={p.id} onClick={() => set({ p: p.id })} aria-pressed={t.p === p.id}
                className={`flex items-center gap-2 rounded-xl border p-2 text-left text-[12.5px] ${t.p === p.id ? "border-[var(--accent)]" : "border-line"}`}>
                <span className="flex overflow-hidden rounded-md border border-line">
                  {p.swatch.map((c) => <i key={c} className="h-6 w-3.5" style={{ background: c }} />)}
                </span>
                {p.name}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2 text-[12.5px] text-sub">
              Custom accent
              <input type="color" value={t.a ?? "#7c5cff"} onChange={(e) => set({ a: e.target.value })}
                className="h-7 w-10 cursor-pointer rounded border border-line bg-transparent" aria-label="Custom accent colour" />
            </label>
            <button className="pill-ghost" disabled={!t.a} onClick={() => set({ a: undefined })}>Reset</button>
            <button className="pill-ghost" onClick={random}>Shuffle</button>
          </div>
          <p className="eyebrow mb-2 mt-4">Animation style</p>
          <div className="space-y-1.5">
            {MOTIONS.map((m) => (
              <button key={m.id} onClick={() => set({ m: m.id })} aria-pressed={t.m === m.id}
                className={`w-full rounded-xl border px-3 py-2 text-left ${t.m === m.id ? "border-[var(--accent)]" : "border-line"}`}>
                <span className="block text-[13px] font-medium">{m.name}</span>
                <span className="block text-[11.5px] text-sub">{m.desc}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-mute">Saved in this browser. Press Ctrl/⌘ + K for quick switching.</p>
        </div>
      )}
    </div>
  );
}
