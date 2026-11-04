"use client";
import { useMemo } from "react";

export type HistNode = { id: string; parent: string | null; label: string };

/** Visual undo/redo DAG: every edit is a node; branching from an earlier node creates a new branch. */
export default function HistoryDAG({ nodes, current, onSelect }: { nodes: HistNode[]; current: string | null; onSelect: (id: string) => void }) {
  const layout = useMemo(() => {
    const kids: Record<string, string[]> = {};
    nodes.forEach((n) => { if (n.parent) (kids[n.parent] ||= []).push(n.id); });
    const pos: Record<string, { x: number; y: number }> = {};
    let leaf = 0;
    const walk = (id: string, depth: number): number => {
      const c = kids[id] ?? [];
      if (!c.length) { pos[id] = { x: depth, y: leaf++ }; return pos[id].y; }
      const ys = c.map((k) => walk(k, depth + 1));
      pos[id] = { x: depth, y: (ys[0] + ys[ys.length - 1]) / 2 };
      return pos[id].y;
    };
    nodes.filter((n) => !n.parent).forEach((r) => walk(r.id, 0));
    return pos;
  }, [nodes]);

  if (!nodes.length) return <p className="text-[12.5px] text-mute">History appears here after you upload an image.</p>;
  const pts = Object.values(layout) as { x: number; y: number }[];
  const X = 138, Y = 34, maxX = Math.max(...pts.map((p) => p.x)), maxY = Math.max(...pts.map((p) => p.y));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  return (
    <div className="scroll-thin max-h-60 overflow-auto">
      <svg width={maxX * X + 190} height={(maxY + 1) * Y + 10} role="img" aria-label="Edit history graph">
        {nodes.filter((n) => n.parent && layout[n.parent] && layout[n.id]).map((n) => {
          const a = layout[n.parent!], b = layout[n.id];
          const x1 = 14 + a.x * X, y1 = 16 + a.y * Y, x2 = 14 + b.x * X, y2 = 16 + b.y * Y;
          return <path key={n.id} d={`M${x1},${y1} C${x1 + 50},${y1} ${x2 - 50},${y2} ${x2},${y2}`} fill="none" stroke="var(--line)" strokeWidth={1.5} style={{ stroke: "var(--mute)", opacity: 0.55 }} />;
        })}
        {nodes.map((n, i) => {
          const p = layout[n.id]; if (!p) return null;
          const on = n.id === current;
          return (
            <g key={n.id} transform={`translate(${14 + p.x * X},${16 + p.y * Y})`} onClick={() => onSelect(n.id)} style={{ cursor: "pointer" }}>
              <circle r={9} fill={on ? "var(--accent)" : "var(--bg)"} stroke="var(--ink)" strokeWidth={1.2} />
              <text textAnchor="middle" dy="3.5" fontSize="9.5" fill={on ? "var(--accent-ink)" : "var(--ink)"} fontWeight="600">{i}</text>
              <text x={15} dy="3.5" fontSize="11" fill="var(--sub)">{byId[n.id].label.slice(0, 17)}</text>
              <title>{byId[n.id].label}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
