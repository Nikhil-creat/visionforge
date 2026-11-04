"use client";
import { useState } from "react";
import { auditRecent, auditVerify } from "@/lib/api";

type Ev = { n: number; ts: number; event: string; actor: string; detail: Record<string, any> };

export default function LiveSystem({ status }: { status: any }) {
  const [verify, setVerify] = useState<{ ok: boolean; count: number; head?: string; broken_at?: number; reason?: string } | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true); setErr("");
    try { const [v, r] = await Promise.all([auditVerify(), auditRecent()]); setVerify(v); setEvents(r.events); }
    catch (e: any) { setErr(e.message || "API offline"); } finally { setBusy(false); }
  };

  const rows: [string, string, boolean][] = status ? [
    ["Groq", status.llm?.groq ? "key set" : "no key", !!status.llm?.groq],
    ["Gemini", status.llm?.gemini ? "key set" : "no key", !!status.llm?.gemini],
    ["Council", status.llm?.groq || status.llm?.gemini ? `up to ${status.council?.max_members} members` : "needs a key", !!(status.llm?.groq || status.llm?.gemini)],
    ["Vision describe", status.features?.vision_llm ? "enabled (consent-gated)" : "off", !!status.features?.vision_llm],
    ["Visual RAG", `${status.rag?.mode} · ${status.rag?.points} indexed`, true],
    ["Audit ledger", status.features?.audit ? "on" : "off", !!status.features?.audit],
  ] : [];

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="glass p-5">
        <p className="eyebrow mb-3">Live system {status ? `· v${status.version}` : "· API offline"}</p>
        {rows.length === 0 ? <p className="text-[12.5px] text-sub">Start the backend to see live status.</p> : (
          <ul className="space-y-1.5 text-[13px]">
            {rows.map(([k, v, ok]) => (
              <li key={k} className="flex items-center justify-between">
                <span className="text-sub">{k}</span>
                <span className="flex items-center gap-1.5"><i className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-[var(--ok)]" : "bg-mute"}`} />{v}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="glass p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow">Audit ledger</p>
          <button className="pill-ghost" onClick={run} disabled={busy}>{busy ? "Verifying…" : "Verify chain"}</button>
        </div>
        {err && <p className="text-[12.5px] text-[var(--bad)]">{err}</p>}
        {verify && (
          <p className={`mb-2 text-[13px] ${verify.ok ? "text-[var(--ok)]" : "text-[var(--bad)]"}`}>
            {verify.ok ? `✓ Chain intact · ${verify.count} records` : `✕ Chain broken at record ${verify.broken_at} (${verify.reason})`}
          </p>
        )}
        {verify?.head && <p className="mb-2 break-all font-mono text-[10.5px] text-mute">head {verify.head.slice(0, 40)}…</p>}
        <ul className="scroll-thin max-h-40 space-y-1 overflow-auto font-mono text-[11px] text-sub">
          {events.map((e) => (
            <li key={e.n}>#{e.n} {new Date(e.ts * 1000).toLocaleTimeString()} · <b className="text-ink">{e.event}</b> · {e.actor}</li>
          ))}
          {!events.length && !err && <li className="text-mute">Press “Verify chain” to check integrity and see recent events (metadata only).</li>}
        </ul>
      </div>
    </div>
  );
}
