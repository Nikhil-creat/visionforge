"use client";
import { useEffect, useRef, useState } from "react";
import { CouncilResult, chat, council } from "@/lib/api";

type Msg = { role: "user" | "assistant"; content: string; res?: CouncilResult };
type Mode = "council" | "single";

const QUICK = ["What's wrong with this image?", "Make it look cinematic", "Prepare it for print", "Anonymise it"];

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="mt-2" title={label}>
      <div className="mb-1 flex justify-between text-[10.5px] text-mute"><span>{label}</span><span>{value}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line"><i className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function CouncilCard({ r, onRun }: { r: CouncilResult; onRun: (p: string) => void }) {
  const [show, setShow] = useState(false);
  const answered = r.members?.filter((m) => m.ok).length ?? 0;
  const agree = r.agreement ?? r.agreement_lexical ?? 0;
  return (
    <div>
      <p className="whitespace-pre-wrap">{r.final ?? r.reply}</p>
      {r.members && (
        <>
          <Meter value={agree} label={r.agreement != null ? "Panel agreement (judged)" : "Answer overlap (lexical)"} />
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px]">
            <span className="chip">confidence: {r.confidence}</span>
            <span className="chip">{answered}/{r.members.length} answered</span>
            <span className="chip">{r.method === "judge" ? `judge: ${r.judge}` : r.method}</span>
            {r.revised && <span className="chip">peer-revised</span>}
            {r.elapsed_ms != null && <span className="chip">{(r.elapsed_ms / 1000).toFixed(1)}s</span>}
          </div>
          {!!r.consensus?.length && <ul className="mt-2 space-y-0.5 text-[11.5px] text-sub">{r.consensus.map((c) => <li key={c}>✓ {c}</li>)}</ul>}
          {!!r.disagreements?.length && <ul className="mt-1 space-y-0.5 text-[11.5px] text-[var(--warn)]">{r.disagreements.map((c) => <li key={c}>⚠ {c}</li>)}</ul>}
          <button className="mt-2 text-[11.5px] text-sub underline" onClick={() => setShow((v) => !v)}>{show ? "Hide" : "Show"} individual answers</button>
          {show && (
            <div className="mt-2 space-y-2">
              {r.members.map((m) => (
                <div key={m.id} className="rounded-xl border border-line p-2.5 text-[11.5px]">
                  <div className="mb-1 flex flex-wrap justify-between gap-1 text-[10.5px] text-mute">
                    <b className="text-ink">{m.persona}</b><span>{m.provider}:{m.model.split("/").pop()} · {m.latency_ms}ms</span>
                  </div>
                  {m.ok ? <p className="whitespace-pre-wrap text-sub">{m.answer}</p> : <p className="text-[var(--bad)]">Unavailable ({m.error})</p>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {r.note && !r.members && <p className="mt-1 text-[11px] text-mute">{r.note}</p>}
      {r.guard && (r.guard.verdict === "flag" || Object.keys(r.guard.redactions).length > 0) && (
        <p className="mt-2 text-[10.5px] text-mute">
          🛡 {Object.keys(r.guard.redactions).length > 0 && `Masked before sending: ${Object.entries(r.guard.redactions).map(([k, v]) => `${k}×${v}`).join(", ")}. `}
          {r.guard.verdict === "flag" && `Flagged: ${r.guard.hits.join(", ")}.`}
        </p>
      )}
      {r.agent_prompt && (
        <button className="pill-ghost mt-2" onClick={() => onRun(r.agent_prompt!)}>
          ▶ Run: {r.agent_prompt.length > 38 ? r.agent_prompt.slice(0, 38) + "…" : r.agent_prompt}
        </button>
      )}
    </div>
  );
}

export default function ChatAssistant({ assetId, onRunAgent, open, setOpen }: {
  assetId: string | null; onRunAgent: (prompt: string) => void; open: boolean; setOpen: (v: boolean) => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("council");
  const [deep, setDeep] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: "Hi, I'm Forge. In Council mode several models (Groq + Gemini) answer independently and a judge reconciles them. Ask about your image or describe an edit." }]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  const send = async (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(next); setInput(""); setBusy(true);
    const history = next.map(({ role, content }) => ({ role, content }));
    try {
      const res = mode === "council" ? await council(history, assetId, deep ? "deep" : "fast") : await chat(history, assetId);
      setMsgs([...next, { role: "assistant", content: res.final ?? res.reply ?? "", res }]);
    } catch (e: any) {
      setMsgs([...next, { role: "assistant", content: `⚠ ${e.message}` }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={() => setOpen(!open)} aria-label="Open assistant" className="pill fixed bottom-5 right-5 z-40 shadow-xl">{open ? "Close" : "Ask Forge"}</button>
      {open && (
        <div role="dialog" aria-label="Forge assistant" className="glass fixed bottom-20 right-5 z-40 flex h-[min(620px,78vh)] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden shadow-2xl">
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[13.5px] font-semibold">Forge assistants</p>
              <div className="flex gap-1" role="group" aria-label="Mode">
                {(["council", "single"] as Mode[]).map((m) => (
                  <button key={m} className="pill-ghost !px-3 !py-1" data-on={mode === m} onClick={() => setMode(m)}>{m === "council" ? "Council" : "Single"}</button>
                ))}
              </div>
            </div>
            <p className="mt-0.5 flex items-center justify-between text-[11px] text-mute">
              <span>{assetId ? "image attached" : "no image yet"} · PII auto-masked</span>
              {mode === "council" && (
                <label className="flex cursor-pointer items-center gap-1" title="Deep = a second round where assistants critique each other (more API calls)">
                  <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> deep debate
                </label>
              )}
            </p>
          </div>
          <div className="scroll-thin flex-1 space-y-3 overflow-auto p-4 text-[13px]">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-8 rounded-2xl bg-accent px-3 py-2 text-accent-ink" : "mr-4"}>
                {m.res ? <CouncilCard r={m.res} onRun={(p) => { onRunAgent(p); setOpen(false); }} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
              </div>
            ))}
            {busy && <p className="animate-pulse text-mute">{mode === "council" ? (deep ? "The council is debating…" : "Consulting the council…") : "Forge is thinking…"}</p>}
            <div ref={end} />
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 pb-2">
            {QUICK.map((q) => <button key={q} className="chip hover:border-ink hover:text-ink" onClick={() => send(q)}>{q}</button>)}
          </div>
          <div className="flex gap-2 border-t border-line p-3">
            <input className="field" value={input} maxLength={2000} placeholder="Ask or describe an edit…"
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} />
            <button className="pill" disabled={busy} onClick={() => send(input)}>Send</button>
          </div>
        </div>
      )}
    </>
  );
}
