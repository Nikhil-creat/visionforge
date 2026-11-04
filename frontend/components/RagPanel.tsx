"use client";
import { useEffect, useState } from "react";
import { blobUrl, ragImage, ragIndex, ragStats, ragText } from "@/lib/api";

type Hit = { asset_id: string; score: number; kind: string; tags: string[]; note: string; palette: string[]; _url?: string };

export default function RagPanel({ assetId }: { assetId: string | null }) {
  const [stats, setStats] = useState<any>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("style_guide");
  const [note, setNote] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => ragStats().then(setStats).catch(() => setStats(null));
  useEffect(() => { refresh(); }, []);

  const withThumbs = async (res: Hit[]) => Promise.all(res.map(async (h) => {
    try { return { ...h, _url: await blobUrl(`/api/images/${h.asset_id}/file`) }; } catch { return h; }
  }));

  const run = async (fn: () => Promise<{ results: any[] }>) => {
    setBusy(true); setMsg("");
    try { const r = await fn(); setHits(await withThumbs(r.results)); if (!r.results.length) setMsg("No matches yet — index some images first."); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };

  const index = async () => {
    if (!assetId) return;
    setBusy(true); setMsg("");
    try { const r = await ragIndex(assetId, kind, note); setMsg(`Indexed (${r.tags.join(", ")}). Pinned so it won't expire.`); refresh(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="glass p-4">
      <p className="eyebrow">Visual RAG · Qdrant</p>
      <p className="mb-3 text-[12.5px] text-sub">
        {stats ? `${stats.points} indexed · ${stats.mode} · ${stats.cross_modal_text ? "text↔image (CLIP)" : "image↔image + keyword (enable CLIP for text↔image)"}` : "API offline"}
      </p>
      <div className="mb-3 grid gap-2 sm:grid-cols-[130px_1fr_auto]">
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="style_guide">Style guide</option><option value="palette">Palette</option>
          <option value="reference">Reference art</option><option value="image">Image</option>
        </select>
        <input className="field" placeholder="Note (e.g. 'brand teal, high-key')" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        <button className="pill" disabled={!assetId || busy} onClick={index}>Index current</button>
      </div>
      <div className="mb-3 flex gap-2">
        <input className="field" placeholder="Search by description, tag or style…" value={q} maxLength={300}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim().length > 1 && run(() => ragText(q))} />
        <button className="pill" disabled={busy || q.trim().length < 2} onClick={() => run(() => ragText(q))}>Search</button>
        <button className="pill-ghost" disabled={!assetId || busy} onClick={() => assetId && run(() => ragImage(assetId))}>Find similar</button>
      </div>
      {msg && <p className="mb-2 text-[12px] text-sub">{msg}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {hits.map((h) => (
          <div key={h.asset_id} className="overflow-hidden rounded-xl border border-line">
            {h._url ? <img src={h._url} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-line" />}
            <div className="p-2 text-[11px] text-sub">
              <div className="mb-1 flex justify-between"><span>{h.kind}</span><span>{h.score}</span></div>
              <div className="mb-1 flex gap-0.5">{(h.palette ?? []).slice(0, 5).map((c) => <i key={c} className="h-2.5 flex-1 rounded-sm" style={{ background: c }} />)}</div>
              <div className="truncate">{h.tags?.join(", ")}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
