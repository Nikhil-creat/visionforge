"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AgentEvent, Analysis, Describe, Metrics, OpSpec, Suggestion, analyze, blobUrl, compareMetrics, describe, listOps, pin, suggest, transform, upload,
} from "@/lib/api";
import AgentTerminal from "./AgentTerminal";
import CompareCanvas from "./CompareCanvas";
import HistoryDAG, { HistNode } from "./HistoryDAG";
import RagPanel from "./RagPanel";

type Node = HistNode & { url: string; svg_url?: string; w: number; h: number };
const MAX_MB = 50;

export default function Studio({ onAssetChange, agentRequest, selectedOp, onSuggest }: {
  onAssetChange: (id: string | null) => void;
  onSuggest: (prompt: string) => void;
  agentRequest: { prompt: string; n: number } | null;
  selectedOp: { name: string; n: number } | null;
}) {
  const [ops, setOps] = useState<OpSpec[]>([]);
  const [opsErr, setOpsErr] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [lastChild, setLastChild] = useState<Record<string, string>>({});
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [op, setOp] = useState("enhance");
  const [params, setParams] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [drag, setDrag] = useState(false);
  const [vsOriginal, setVsOriginal] = useState(true);
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  const file = useRef<HTMLInputElement>(null);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [desc, setDesc] = useState<Describe | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    listOps().then((r) => setOps(r.ops)).catch(() => setOpsErr("API offline — run `docker compose up --build` (see README)."));
  }, []);

  const spec = ops.find((o) => o.name === op);
  useEffect(() => {
    if (!spec) return;
    setParams(Object.fromEntries((Object.entries(spec.params) as [string, OpSpec["params"][string]][]).map(([k, v]) => [k, v.default])));
  }, [spec?.name]); // eslint-disable-line

  useEffect(() => { if (selectedOp) { setOp(selectedOp.name); document.getElementById("studio")?.scrollIntoView({ behavior: "smooth" }); } }, [selectedOp]);
  useEffect(() => { onAssetChange(cur); }, [cur, onAssetChange]);

  const node = nodes.find((n) => n.id === cur) ?? null;
  const root = nodes.find((n) => !n.parent) ?? null;
  const parent = node?.parent ? nodes.find((n) => n.id === node.parent) ?? null : null;
  const beforeNode = vsOriginal ? root : parent ?? root;
  const children = useMemo(() => nodes.filter((n) => n.parent === cur), [nodes, cur]);

  // lazily analyse whichever node is selected
  useEffect(() => {
    if (!cur || analyses[cur]) return;
    analyze(cur).then((r) => setAnalyses((a) => ({ ...a, [cur]: r.analysis }))).catch(() => {});
  }, [cur]); // eslint-disable-line

  useEffect(() => { setDesc(null); setMetrics(null); }, [cur]);
  useEffect(() => {
    if (!cur) { setSugs([]); return; }
    let live = true;
    suggest(cur).then((r) => live && setSugs(r.suggestions)).catch(() => live && setSugs([]));
    return () => { live = false; };
  }, [cur]);

  const addNode = useCallback(async (n: { asset_id: string; url: string; width: number; height: number; svg_url?: string }, label: string, parentId: string | null) => {
    const url = await blobUrl(n.url);
    setNodes((ns) => [...ns, { id: n.asset_id, parent: parentId, label, url, svg_url: n.svg_url, w: n.width, h: n.height }]);
    if (parentId) setLastChild((m) => ({ ...m, [parentId]: n.asset_id }));
    setCur(n.asset_id);
  }, []);

  const onFile = async (f: File | undefined | null) => {
    if (!f) return;
    setErr("");
    if (!/^image\/(png|jpe?g|webp|bmp)$/.test(f.type)) return setErr("Use PNG, JPEG, WebP or BMP.");
    if (f.size > MAX_MB * 1024 * 1024) return setErr(`File is ${(f.size / 1048576).toFixed(1)} MB — the limit is ${MAX_MB} MB.`);
    setBusy("Uploading & analysing…");
    try {
      const r = await upload(f);
      setNodes([]); setAnalyses({ [r.asset_id]: r.analysis }); setLastChild({}); setArtifacts({});
      await addNode(r, f.name.slice(0, 24) || "original", null);
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };

  const apply = async () => {
    if (!cur) return;
    setBusy(`Running ${spec?.label ?? op}…`); setErr("");
    try {
      const r = await transform(cur, op, params);
      const art: Record<string, string> = {};
      for (const k of ["grid", "text", "latex_preview"]) if (typeof r.info?.[k] === "string") art[k] = r.info[k];
      setArtifacts(art);
      await addNode(r, spec?.label ?? op, cur);
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };

  const onAgentResult = async (ev: AgentEvent, prompt: string) => {
    if (!cur) return;
    const art: Record<string, string> = {};
    for (const [k, v] of Object.entries(ev.artifacts ?? {})) if (typeof v === "string") art[k] = v;
    setArtifacts(art);
    await addNode({ asset_id: ev.asset_id, url: ev.url, width: ev.width, height: ev.height, svg_url: ev.svg_url }, "Agent: " + prompt.slice(0, 14), cur);
  };

  const undo = () => node?.parent && setCur(node.parent);
  const redo = () => { const nx = (cur && lastChild[cur]) || children[children.length - 1]?.id; if (nx) setCur(nx); };

  useEffect(() => {  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo (ignored while typing)
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const runDescribe = async () => {
    if (!cur) return;
    if (!window.confirm("AI describe sends a downscaled copy of this image to Google's Gemini API. Free-tier requests may be used by Google to improve its products. Continue?")) return;
    setBusy("Describing with Gemini…"); setErr("");
    try { setDesc(await describe(cur)); } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };
  const runMetrics = async () => {
    if (!cur || !root || root.id === cur) return;
    setBusy("Measuring…"); setErr("");
    try { setMetrics(await compareMetrics(root.id, cur)); } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };

  const download = (url: string, name: string) => { const a = document.createElement("a"); a.href = url; a.download = name; a.click(); };
  const downloadSvg = async () => { if (node?.svg_url) download(await blobUrl(node.svg_url), `visionforge-${node.id.slice(0, 6)}.svg`); };

  const grouped = useMemo(() => {
    const g: Record<string, OpSpec[]> = {};
    ops.forEach((o) => (g[o.group] ||= []).push(o));
    return g;
  }, [ops]);

  const an = cur ? analyses[cur] : null;

  return (
    <div className="space-y-5">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="pill" onClick={() => file.current?.click()}>Upload image</button>
        <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp,image/bmp" onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="pill-ghost" disabled={!node?.parent} onClick={undo}>↶ Undo</button>
        <button className="pill-ghost" disabled={!children.length} onClick={redo}>↷ Redo</button>
        <button className="pill-ghost" data-on={vsOriginal} onClick={() => setVsOriginal((v) => !v)}>
          Compare vs {vsOriginal ? "original" : "previous"}
        </button>
        {node && <button className="pill-ghost" onClick={() => download(node.url, `visionforge-${node.id.slice(0, 6)}.png`)}>Download PNG</button>}
        {node?.svg_url && <button className="pill-ghost" onClick={downloadSvg}>Download SVG</button>}
        {node && <button className="pill-ghost" disabled={!!busy} onClick={runDescribe} title="Gemini vision caption + alt text (asks consent)">✦ AI describe</button>}
        {node && root && node.id !== root.id && <button className="pill-ghost" disabled={!!busy} onClick={runMetrics} title="PSNR / SSIM versus the original">Quality metrics</button>}
        {node && <button className="pill-ghost" data-on={!!pinned[node.id]} onClick={async () => { await pin(node.id).catch(() => {}); setPinned((p) => ({ ...p, [node.id]: true })); }}>
          {pinned[node.id] ? "Pinned ✓" : "Keep (skip 1h TTL)"}</button>}
        {busy && <span className="animate-pulse text-[12.5px] text-sub">{busy}</span>}
      </div>
      {(err || opsErr) && <p className="glass border-[var(--bad)] p-3 text-[12.5px] text-[var(--bad)]" role="alert">{err || opsErr}</p>}

      {sugs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">Smart suggestions</span>
          {sugs.map((s) => (
            <button key={s.label} className="chip hover:border-ink hover:text-ink" title={s.reason} onClick={() => onSuggest(s.prompt)}>{s.label}</button>
          ))}
        </div>
      )}
      {metrics && (
        <p className="glass p-3 text-[12.5px] text-sub">
          vs original · PSNR <b className="text-ink">{metrics.identical ? "identical" : `${metrics.psnr_db} dB`}</b> · SSIM <b className="text-ink">{metrics.ssim}</b>
          · sharpness Δ <b className="text-ink">{metrics.sharpness_delta}</b> · noise Δ <b className="text-ink">{metrics.noise_delta}</b>
          <span className="block text-[11px] text-mute">{metrics.note}</span>
        </p>
      )}
      {desc && (
        <div className="glass p-4 text-[13px]">
          <div className="mb-1 flex items-center justify-between"><p className="eyebrow">AI description · {desc.model}</p>
            <button className="pill-ghost" onClick={() => navigator.clipboard?.writeText(desc.alt_text)}>Copy alt text</button></div>
          <p>{desc.caption}</p>
          <p className="mt-1 text-sub"><b>Alt:</b> {desc.alt_text}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{desc.objects.map((o) => <span key={o} className="chip">{o}</span>)}{desc.mood && <span className="chip">mood: {desc.mood}</span>}</div>
          {desc.suggested_edits.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{desc.suggested_edits.map((e) => <button key={e} className="pill-ghost" onClick={() => onSuggest(e)}>▶ {e}</button>)}</div>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        {/* canvas + agent */}
        <div className="space-y-5 lg:col-span-8">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
            className={`relative rounded-[20px] transition-shadow ${drag ? "ring-2 ring-[var(--accent)]" : ""}`}>
            <CompareCanvas className="h-[460px] md:h-[540px]" before={beforeNode && beforeNode.id !== node?.id ? beforeNode.url : null} after={node?.url ?? null} />
            {!node && (
              <button onClick={() => file.current?.click()} className="absolute inset-0 grid place-items-center text-center">
                <span className="rounded-2xl border border-dashed border-line px-8 py-6 text-[13px] text-sub">
                  <b className="block text-ink">Drop an image here</b>PNG · JPEG · WebP · BMP — up to {MAX_MB} MB
                </span>
              </button>
            )}
          </div>
          <AgentTerminal assetId={cur} request={agentRequest} onResult={onAgentResult} />
        </div>

        {/* side panels */}
        <div className="space-y-5 lg:col-span-4">
          <div className="glass p-4">
            <p className="eyebrow mb-2">Tool</p>
            <select className="field mb-3" value={op} onChange={(e) => setOp(e.target.value)} disabled={!ops.length}>
              {(Object.entries(grouped) as [string, OpSpec[]][]).map(([g, list]) => (
                <optgroup key={g} label={g}>{list.map((o) => <option key={o.name} value={o.name}>{o.label}</option>)}</optgroup>
              ))}
              {!ops.length && <option>{op}</option>}
            </select>
            {spec && <p className="mb-3 text-[12.5px] text-sub">{spec.desc}</p>}
            <div className="space-y-3">
              {spec && (Object.entries(spec.params) as [string, OpSpec["params"][string]][]).map(([k, p]) => (
                <label key={k} className="block text-[12px] text-sub">
                  <span className="mb-1 flex justify-between"><span>{k}</span><span className="text-ink">{String(params[k] ?? "")}</span></span>
                  {p.choices ? (
                    <select className="field" value={params[k]} onChange={(e) => setParams({ ...params, [k]: e.target.value })}>
                      {p.choices.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  ) : p.type === "bool" ? (
                    <input type="checkbox" checked={!!params[k]} onChange={(e) => setParams({ ...params, [k]: e.target.checked })} />
                  ) : p.min != null && p.max != null ? (
                    <input type="range" className="w-full accent-[var(--accent)]" min={p.min} max={p.max} step={p.type === "int" ? 1 : 0.05}
                      value={params[k] ?? p.default} onChange={(e) => setParams({ ...params, [k]: p.type === "int" ? parseInt(e.target.value) : parseFloat(e.target.value) })} />
                  ) : (
                    <input className="field" value={params[k] ?? ""} onChange={(e) => setParams({ ...params, [k]: e.target.value })} />
                  )}
                </label>
              ))}
            </div>
            <button className="pill mt-4 w-full justify-center" disabled={!cur || !!busy || !spec} onClick={apply}>Apply tool</button>
          </div>

          <div className="glass p-4">
            <p className="eyebrow mb-2">Layer history · DAG</p>
            <HistoryDAG nodes={nodes} current={cur} onSelect={setCur} />
          </div>

          <div className="glass p-4">
            <p className="eyebrow mb-2">Diagnostics</p>
            {!an ? <p className="text-[12.5px] text-mute">{cur ? "Analysing…" : "Upload an image to see diagnostics."}</p> : (
              <div className="space-y-3 text-[12.5px]">
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sub">
                  <span>Size</span><b className="text-ink">{an.diagnostics.width}×{an.diagnostics.height}</b>
                  <span>Sharpness</span><b className="text-ink">{an.diagnostics.sharpness} ({an.diagnostics.blur_score})</b>
                  <span>Noise σ</span><b className="text-ink">{an.diagnostics.noise_sigma}</b>
                  <span>Exposure</span><b className="text-ink">{an.diagnostics.exposure}</b>
                  <span>Faces</span><b className="text-ink">{an.faces.length}</b>
                  <span>Manipulation*</span><b className="text-ink">{an.integrity.manipulation_score}</b>
                  <span>NSFW ({an.integrity.nsfw.method.split(" ")[0]})</span><b className="text-ink">{an.integrity.nsfw.score}{an.integrity.nsfw_flag ? " ⚑" : ""}</b>
                </div>
                <div className="flex h-10 items-end gap-px" aria-label="Luminance histogram">
                  {an.diagnostics.histogram.map((v, i) => <i key={i} className="flex-1 rounded-t-sm bg-ink/70" style={{ height: `${Math.max(2, v * 400)}%`, maxHeight: "100%" }} />)}
                </div>
                <div className="flex gap-1">{an.palette.map((c) => <i key={c} title={c} className="h-5 flex-1 rounded-md border border-line" style={{ background: c }} />)}</div>
                <div className="flex flex-wrap gap-1.5">
                  {an.diagnostics.flags.map((f) => <span key={f} className="chip border-[var(--warn)] text-[var(--warn)]">{f}</span>)}
                  {an.tags.map((t) => <span key={t.tag} className="chip">{t.tag}</span>)}
                </div>
                <p className="break-all font-mono text-[10.5px] text-mute">pHash {an.integrity.fingerprint.phash}</p>
                <p className="text-[11px] text-mute">*{an.integrity.manipulation_method}. Indicative only — not a deepfake verdict.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {Object.keys(artifacts).length > 0 && (
        <div className="glass grid gap-4 p-4 md:grid-cols-2">
          {(Object.entries(artifacts) as [string, string][]).map(([k, v]) => (
            <div key={k}>
              <div className="mb-1 flex items-center justify-between">
                <p className="eyebrow">{k.replace("_", " ")}</p>
                <button className="pill-ghost" onClick={() => navigator.clipboard?.writeText(v)}>Copy</button>
              </div>
              <pre className="scroll-thin max-h-48 overflow-auto rounded-xl border border-line p-3 font-mono text-[10.5px] leading-tight">{v}</pre>
            </div>
          ))}
        </div>
      )}

      <RagPanel assetId={cur} />
    </div>
  );
}
