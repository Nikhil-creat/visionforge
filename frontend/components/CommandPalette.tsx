"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MOTIONS, PALETTES, applyTheme, loadTheme } from "@/lib/themes";

type Cmd = { id: string; label: string; hint: string; run: () => void };

export default function CommandPalette({ onRunAgent, onToggleChat }: { onRunAgent: (p: string) => void; onToggleChat: () => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const go = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const cmds: Cmd[] = useMemo(() => [
    ...["catalogue", "studio", "security", "architecture", "credentials"].map((s) => ({ id: "go-" + s, label: `Go to ${s}`, hint: "Navigate", run: go(s) })),
    { id: "chat", label: "Open Forge assistant council", hint: "Assistant", run: onToggleChat },
    ...PALETTES.map((p) => ({ id: "p-" + p.id, label: `Theme: ${p.name}`, hint: p.dark ? "Dark palette" : "Light palette", run: () => applyTheme({ ...loadTheme(), p: p.id, a: undefined }) })),
    ...MOTIONS.map((m) => ({ id: "m-" + m.id, label: `Animation: ${m.name}`, hint: m.desc, run: () => applyTheme({ ...loadTheme(), m: m.id }) })),
    { id: "a1", label: "Agent: denoise, enhance and relight", hint: "Runs on the current image", run: () => onRunAgent("denoise, enhance and relight") },
    { id: "a2", label: "Agent: remove background + emoji mosaic", hint: "Runs on the current image", run: () => onRunAgent("remove the background and convert the remaining background into an emoji mosaic") },
    { id: "a3", label: "Agent: LED dot-matrix", hint: "Runs on the current image", run: () => onRunAgent("convert to dot matrix") },
  ], [onRunAgent, onToggleChat]);

  const list = useMemo(() => cmds.filter((c) => (c.label + c.hint).toLowerCase().includes(q.toLowerCase())).slice(0, 9), [cmds, q]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === "Escape") setOpen(false);
    };
    const openEv = () => setOpen(true);
    window.addEventListener("keydown", key); window.addEventListener("vf-palette", openEv);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("vf-palette", openEv); };
  }, []);
  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => input.current?.focus(), 20); } }, [open]);
  useEffect(() => setSel(0), [q]);

  if (!open) return null;
  const run = (c?: Cmd) => { if (c) { setOpen(false); c.run(); } };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start justify-items-center bg-black/40 p-4 pt-[14vh] backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="glass w-full max-w-lg overflow-hidden shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a command…  (themes, sections, agent presets)"
          className="w-full border-b border-line bg-transparent px-4 py-3.5 text-[14px] outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            if (e.key === "Enter") run(list[sel]);
          }} />
        <ul role="listbox" className="scroll-thin max-h-80 overflow-auto p-1.5">
          {list.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => run(c)}
              className={`flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[13px] ${i === sel ? "bg-accent text-accent-ink" : ""}`}>
              <span>{c.label}</span><span className={`text-[11px] ${i === sel ? "opacity-80" : "text-mute"}`}>{c.hint}</span>
            </li>
          ))}
          {!list.length && <li className="px-3 py-4 text-[13px] text-sub">No commands match.</li>}
        </ul>
      </div>
    </div>
  );
}
