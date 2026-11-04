"use client";
import { useEffect, useState } from "react";
import { getKey, setKey, status } from "@/lib/api";
import ThemePanel from "./ThemePanel";

const LINKS = [
  ["Catalogue", "#catalogue"], ["Studio", "#studio"], ["Security", "#security"],
  ["Architecture", "#architecture"], ["Credentials", "#credentials"],
] as const;

export function Brand() {
  return (
    <a href="#top" className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
      <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor" aria-hidden>
        <path d="M2 0h4v18H2zM7 9c3-1 5-4 6-9h3c-1 5-3 8-6 9 3 1 5 4 6 9h-3c-1-5-3-8-6-9z" />
      </svg>
      VisionForge
    </a>
  );
}

export default function Header() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyVal, setKeyVal] = useState("");

  useEffect(() => {
    setKeyVal(getKey());
    status().then(() => setOnline(true)).catch(() => setOnline(false));
  }, []);

  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pt-8 text-[13.5px] md:justify-center md:gap-8" aria-label="Primary">
        <Brand />
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map(([t, h]) => (
            <a key={h} href={h} className="text-sub transition-colors hover:text-ink">{t}</a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span title={online === null ? "Checking API…" : online ? "API online" : "API offline — start the backend (see README)"}
            className="flex items-center gap-1.5 text-[11.5px] text-sub">
            <i className={`h-2 w-2 rounded-full ${online === null ? "bg-mute" : online ? "bg-[var(--ok)]" : "bg-[var(--bad)]"}`} />
            <span className="hidden sm:inline">{online === null ? "…" : online ? "API live" : "API offline"}</span>
          </span>
          <ThemePanel />
          <button onClick={() => window.dispatchEvent(new Event("vf-palette"))} className="pill-ghost hidden sm:inline-flex" aria-label="Open command palette">
            <kbd className="font-sans text-[11px]">⌘K</kbd>
          </button>
          <button onClick={() => setKeyOpen((v) => !v)} className="pill-ghost hidden sm:inline-flex" aria-label="API key">Key</button>
          <a href="#studio" className="pill hidden sm:inline-flex">Launch</a>
          <button className="pill-ghost md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open}>Menu</button>
        </div>
      </nav>
      {open && (
        <div className="glass mx-5 mt-3 flex flex-col gap-3 p-4 md:hidden">
          {LINKS.map(([t, h]) => <a key={h} href={h} onClick={() => setOpen(false)}>{t}</a>)}
        </div>
      )}
      {keyOpen && (
        <div className="glass mx-auto mt-3 flex max-w-md items-center gap-2 p-3">
          <input className="field" placeholder="X-API-Key (only if your server sets API_KEYS)" value={keyVal}
            onChange={(e) => setKeyVal(e.target.value)} type="password" autoComplete="off" />
          <button className="pill" onClick={() => { setKey(keyVal); setKeyOpen(false); location.reload(); }}>Save</button>
        </div>
      )}
    </header>
  );
}
