"use client";
import { useEffect, useRef, useState } from "react";
import { AgentEvent, streamAgent } from "@/lib/api";

const PRESETS = [
  "Auto-detect the main subject, remove the background, convert the remaining background into a mathematical LaTeX grid, and upscale 4x",
  "Denoise, enhance and relight",
  "Blur faces and strip metadata",
  "Remove the background and turn the rest into an emoji mosaic",
  "Style it neon and outpaint to 16:9",
];

type Line = { kind: string; text: string };
const GLYPH: Record<string, string> = { start: "●", thought: "◆", plan: "▸", tool: "⚙", eval: "✓", retry: "↻", error: "✕", done: "■" };

export default function AgentTerminal({ assetId, request, onResult }: {
  assetId: string | null; request: { prompt: string; n: number } | null; onResult: (ev: AgentEvent, prompt: string) => void;
}) {
  const [prompt, setPrompt] = useState(PRESETS[0]);
  const [lines, setLines] = useState<Line[]>([{ kind: "thought", text: "Agent idle. Describe an edit in plain English." }]);
  const [memory, setMemory] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const lastN = useRef(0);
  const [recipes, setRecipes] = useState<string[]>([]);
  useEffect(() => { try { setRecipes(JSON.parse(localStorage.getItem("vf_recipes") || "[]")); } catch {} }, []);
  const persist = (r: string[]) => { setRecipes(r); try { localStorage.setItem("vf_recipes", JSON.stringify(r)); } catch {} };

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [lines]);

  const run = async (p: string) => {
    if (!assetId || running || p.trim().length < 3) return;
    setRunning(true); setMemory([]); setLines([{ kind: "start", text: `$ ${p}` }]);
    ctl.current = new AbortController();
    try {
      await streamAgent(assetId, p, (ev) => {
        if (ev.type === "memory") { setMemory(ev.memory ?? []); return; }
        setLines((l) => [...l, { kind: ev.ok === false && ev.type === "eval" ? "retry" : ev.type, text: ev.msg ?? ev.type }]);
        if (ev.type === "done") onResult(ev, p);
      }, ctl.current.signal);
    } catch (e: any) {
      if (e.name !== "AbortError") setLines((l) => [...l, { kind: "error", text: e.message ?? "Agent failed" }]);
    } finally { setRunning(false); }
  };

  useEffect(() => {
    if (request && request.n !== lastN.current) { lastN.current = request.n; setPrompt(request.prompt); run(request.prompt); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  return (
    <div className="glass p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="eyebrow">Autonomous agent</p>
          <p className="text-[13px] text-sub">Plan → act → evaluate → self-heal. Streams over SSE.</p>
        </div>
        <span className="flex items-center gap-1.5 text-[11.5px] text-sub">
          <i className={`h-2 w-2 rounded-full ${running ? "animate-pulse bg-[var(--warn)]" : "bg-[var(--ok)]"}`} />{running ? "running" : "ready"}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p, i) => (
          <button key={i} className="chip transition-colors hover:border-ink hover:text-ink" onClick={() => setPrompt(p)}>
            {p.length > 42 ? p.slice(0, 42) + "…" : p}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-mute">Recipes</span>
        {recipes.map((r) => (
          <span key={r} className="chip flex items-center gap-1.5">
            <button onClick={() => setPrompt(r)} title={r}>{r.length > 30 ? r.slice(0, 30) + "…" : r}</button>
            <button aria-label="Delete recipe" className="text-mute hover:text-ink" onClick={() => persist(recipes.filter((x) => x !== r))}>×</button>
          </span>
        ))}
        <button className="chip hover:border-ink hover:text-ink" disabled={!prompt.trim() || recipes.includes(prompt)}
          onClick={() => persist([prompt, ...recipes].slice(0, 12))}>+ save current</button>
      </div>
      <div ref={box} className="scroll-thin mb-3 h-52 overflow-auto rounded-xl border border-line bg-[rgba(0,0,0,.82)] p-3 font-mono text-[12px] leading-relaxed text-[#d6ffe2]">
        {lines.map((l, i) => (
          <div key={i} className={l.kind === "error" ? "text-[#ff8a8a]" : l.kind === "retry" ? "text-[#ffd479]" : l.kind === "eval" ? "text-[#7dffa8]" : ""}>
            <span className="mr-2 opacity-70">{GLYPH[l.kind] ?? "·"}</span>{l.text}
          </div>
        ))}
        {running && <span className="animate-pulse">▍</span>}
      </div>
      {memory.length > 0 && (
        <details className="mb-3 text-[12px]" open>
          <summary className="cursor-pointer text-sub">Agent memory ({memory.length} step{memory.length > 1 ? "s" : ""} committed)</summary>
          <ol className="mt-2 space-y-1 font-mono text-[11.5px] text-sub">
            {memory.map((m) => (
              <li key={m.step}>{m.step}. {m.tool} · attempts {m.attempts} · {JSON.stringify(m.params)}</li>
            ))}
          </ol>
        </details>
      )}
      <div className="flex gap-2">
        <input className="field" value={prompt} maxLength={1000} onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run(prompt)} placeholder="e.g. remove the background and upscale 4x" />
        {running
          ? <button className="pill" onClick={() => ctl.current?.abort()}>Stop</button>
          : <button className="pill" disabled={!assetId} onClick={() => run(prompt)}>Run</button>}
      </div>
      {!assetId && <p className="mt-2 text-[12px] text-mute">Upload an image first.</p>}
    </div>
  );
}
