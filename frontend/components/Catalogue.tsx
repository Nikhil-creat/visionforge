"use client";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CATALOGUE, GROUPS, STATUS_LABEL } from "@/lib/catalogue";

export default function Catalogue({ onTry }: { onTry: (op: string) => void }) {
  const [group, setGroup] = useState<(typeof GROUPS)[number]>("All");
  const [q, setQ] = useState("");
  const list = useMemo(() => CATALOGUE.filter((e) =>
    (group === "All" || e.group === group) &&
    (!q || (e.title + e.blurb + e.specs.join(" ") + e.id).toLowerCase().includes(q.toLowerCase()))), [group, q]);

  return (
    <section id="catalogue" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-24">
      <p className="eyebrow mb-3">Capability catalogue · {CATALOGUE.length} modules</p>
      <h2 className="h2 max-w-2xl"><span className="text-mute">Everything the platform does,</span> catalogued and honest about what runs where.</h2>
      <div className="mt-8 flex flex-wrap items-center gap-2">
        {GROUPS.map((g) => <button key={g} className="pill-ghost" data-on={g === group} onClick={() => setGroup(g)}>{g}</button>)}
        <input className="field ml-auto max-w-[220px]" placeholder="Search modules…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search catalogue" />
      </div>
      <motion.div layout className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {list.map((e) => (
            <motion.article key={e.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }} className="glass flex flex-col p-5">
              <div className="mb-3 flex items-center justify-between font-mono text-[11px] text-mute">
                <span>{e.id}</span><span>{e.group}</span>
              </div>
              <h3 className="text-[17px] font-medium tracking-[-0.02em]">{e.title}</h3>
              <p className="mt-1.5 text-[13px] leading-snug text-sub">{e.blurb}</p>
              <ul className="mt-3 space-y-1 text-[12px] text-sub">
                {e.specs.map((s) => <li key={s} className="flex gap-2"><span className="text-mute">—</span>{s}</li>)}
              </ul>
              <div className="mt-auto flex items-center justify-between pt-4">
                <span className="flex items-center gap-1.5 text-[11.5px] text-sub">
                  <i className={`h-1.5 w-1.5 rounded-full ${e.status === "live" ? "bg-[var(--ok)]" : e.status === "pluggable" ? "bg-[var(--warn)]" : "bg-mute"}`} />
                  {STATUS_LABEL[e.status]}
                </span>
                {e.op && <button className="pill-ghost" onClick={() => onTry(e.op!)}>Try it →</button>}
              </div>
            </motion.article>
          ))}
        </AnimatePresence>
      </motion.div>
      {!list.length && <p className="mt-8 text-sub">No modules match.</p>}
    </section>
  );
}
