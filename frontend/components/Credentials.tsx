"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { profile as p } from "@/lib/profile";

function Counter({ to, suffix }: { to: number; suffix: string }) {
  const [v, setV] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (n: number) => { const k = Math.min(1, (n - t0) / 1100); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el); return () => io.disconnect();
  }, [to]);
  return <span ref={ref}>{v}{suffix}</span>;
}

export default function Credentials() {
  return (
    <section id="credentials" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-24">
      <p className="eyebrow mb-3">Built by</p>
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <h2 className="h2">{p.name}</h2>
          <p className="mt-2 text-[15px] text-sub">{p.role}</p>
          <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-sub">
            Final-year {p.education.degree} student at {p.education.school} ({p.education.years}), based in {p.location}.
            I build end-to-end AI systems — CNNs with explainability, RAG, agentic workflows and the secure backends and
            interfaces around them. VisionForge is the platform that ties those threads together.
          </p>
          <p className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px] text-sub">
            <span className="eyebrow mr-1">Open to internships</span>{p.openTo.map((t) => <span key={t} className="chip">{t}</span>)}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a className="pill" href={`mailto:${p.email}`}>Email me</a>
            <a className="pill-ghost" href={p.github} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
            <a className="pill-ghost" href={p.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          {p.stats.map((s) => (
            <div key={s.label} className="glass p-4">
              <div className="text-[34px] font-medium leading-none tracking-tightest"><Counter to={s.value} suffix={s.suffix} /></div>
              <p className="mt-2 text-[12px] text-sub">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <h3 className="eyebrow mb-3 mt-14">Experience & simulations</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {p.experience.map((e) => (
          <motion.div key={e.title + e.org} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="glass p-4">
            <div className="flex items-baseline justify-between gap-3"><h4 className="text-[14.5px] font-medium">{e.title}</h4><span className="shrink-0 text-[11.5px] text-mute">{e.when}</span></div>
            <p className="text-[12.5px] text-sub">{e.org}</p>
            <p className="mt-1 text-[12px] text-mute">{e.note}</p>
          </motion.div>
        ))}
      </div>

      <h3 className="eyebrow mb-3 mt-14">Flagship projects</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {p.projects.map((pr) => (
          <motion.div key={pr.name} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="glass p-4">
            <span className="chip">{pr.tag}</span>
            <h4 className="mt-2 text-[15px] font-medium">{pr.name}</h4>
            <p className="mt-1 text-[12.5px] leading-snug text-sub">{pr.desc}</p>
          </motion.div>
        ))}
      </div>

      <h3 className="eyebrow mb-3 mt-14">Credential wall</h3>
      <div className="glass p-5">
        <div className="mb-4 flex flex-wrap gap-1.5">{p.tracks.map((t) => <span key={t} className="chip border-ink/30 text-ink">{t}</span>)}</div>
        <div className="flex flex-wrap gap-1.5">{p.issuers.map((i) => <span key={i} className="chip">{i}</span>)}</div>
        <p className="mt-4 text-[12px] text-mute">100+ certificates completed; the full verified list lives on my portfolio's credential log.</p>
      </div>

      <h3 className="eyebrow mb-3 mt-14">Skills</h3>
      <div className="grid gap-3 md:grid-cols-4">
        {(Object.entries(p.skills) as [string, string[]][]).map(([k, list]) => (
          <div key={k} className="glass p-4">
            <p className="mb-2 text-[13px] font-medium">{k}</p>
            <div className="flex flex-wrap gap-1.5">{list.map((s) => <span key={s} className="chip">{s}</span>)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
