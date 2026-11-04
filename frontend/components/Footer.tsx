import { API } from "@/lib/api";
import { profile as p } from "@/lib/profile";
import { Brand } from "./Header";

const COLS: [string, [string, string][]][] = [
  ["Product", [["Catalogue", "#catalogue"], ["Studio", "#studio"], ["Agent", "#studio"], ["Visual RAG", "#studio"]]],
  ["Platform", [["Security", "#security"], ["Architecture", "#architecture"], ["API docs", `${API}/api/docs`]]],
  ["Builder", [["Credentials", "#credentials"], ["GitHub", p.github], ["LinkedIn", p.linkedin], ["Email", `mailto:${p.email}`]]],
];

export default function Footer() {
  return (
    <footer className="relative z-[1] border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Brand />
          <p className="mt-3 max-w-xs text-[12.5px] leading-snug text-sub">
            Agentic image intelligence with CNN diagnostics, visual RAG and a free-tier Groq + Gemini assistant.
          </p>
        </div>
        {COLS.map(([h, links]) => (
          <div key={h}>
            <p className="eyebrow mb-3">{h}</p>
            <ul className="space-y-2 text-[13px]">
              {links.map(([t, href]) => (
                <li key={t}><a className="text-sub transition-colors hover:text-ink" href={href}
                  {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{t}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-[12px] text-mute">
          <span>© 2026 VisionForge Enterprise · Built by {p.name}</span>
          <span>Uploads auto-delete after 1 hour · Your API keys never leave the server</span>
        </div>
      </div>
    </footer>
  );
}
