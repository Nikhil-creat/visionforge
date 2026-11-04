const BOX = (x: number, y: number, w: number, h: number, t: string, s: string) => (
  <g key={t}>
    <rect x={x} y={y} width={w} height={h} rx={14} fill="var(--card)" stroke="var(--line)" />
    <text x={x + w / 2} y={y + h / 2 - 3} textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--ink)">{t}</text>
    <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fontSize="10.5" fill="var(--sub)">{s}</text>
  </g>
);
const ARROW = (d: string, k: string) => <path key={k} d={d} fill="none" stroke="var(--mute)" strokeWidth={1.4} markerEnd="url(#ah)" />;

const FLOW = [
  ["1", "Ingest", "Upload → magic-byte check → size & pixel caps → EXIF stripped → downscale guard"],
  ["2", "Recognise", "Diagnostics, faces, OCR, tags, palette, fingerprints, integrity heuristics"],
  ["3", "Plan", "Groq / Gemini turns your sentence into a validated tool graph (rule planner offline)"],
  ["4", "Act & heal", "Each tool runs, a quality gate scores it, failures retry with adjusted parameters"],
  ["5", "Remember", "Results and styles are embedded into Qdrant for cross-modal retrieval"],
];

export default function Architecture() {
  return (
    <section id="architecture" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-24">
      <p className="eyebrow mb-3">Architecture</p>
      <h2 className="h2 max-w-2xl"><span className="text-mute">One command,</span> six services, zero hidden magic.</h2>
      <div className="glass mt-8 overflow-x-auto p-4">
        <svg viewBox="0 0 920 330" className="mx-auto min-w-[760px]" role="img" aria-label="System architecture diagram">
          <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--mute)" /></marker></defs>
          {BOX(20, 130, 150, 64, "Next.js 15", "Studio · Canvas · Chat")}
          {BOX(250, 130, 160, 64, "FastAPI gateway", "Auth · Rate limit · SSE")}
          {BOX(500, 20, 160, 64, "LangGraph agent", "plan → act → evaluate")}
          {BOX(500, 130, 160, 64, "Vision services", "OpenCV · CNN · ops")}
          {BOX(500, 240, 160, 64, "Celery workers", "Batch & GPU jobs")}
          {BOX(740, 20, 160, 64, "Groq · Gemini", "Free-tier LLM failover")}
          {BOX(740, 130, 160, 64, "Qdrant", "Multi-modal vectors")}
          {BOX(740, 240, 160, 64, "Redis", "Rate limit · queue")}
          {ARROW("M170,162 H250", "a")}{ARROW("M410,150 H500", "b")}{ARROW("M410,140 C450,100 460,60 500,55", "c")}
          {ARROW("M410,175 C450,220 460,260 500,270", "d")}{ARROW("M660,52 H740", "e")}{ARROW("M660,165 H740", "f")}
          {ARROW("M660,272 H740", "g")}{ARROW("M580,84 V130", "h")}
        </svg>
      </div>
      <ol className="mt-4 grid gap-4 md:grid-cols-5">
        {FLOW.map(([n, t, d]) => (
          <li key={n} className="glass p-4">
            <span className="font-mono text-[11px] text-mute">0{n}</span>
            <h3 className="mt-1 text-[14.5px] font-medium">{t}</h3>
            <p className="mt-1 text-[12px] leading-snug text-sub">{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
