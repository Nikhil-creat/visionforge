"use client";
import { useEffect, useState } from "react";
import { status } from "@/lib/api";
import LiveSystem from "./LiveSystem";

const CONTROLS = [
  ["Payload protection", "Streaming upload cap (default 50 MB), magic-byte sniffing, decompression-bomb pixel limit, EXIF/XMP dropped on re-encode."],
  ["Abuse control", "Redis token bucket per API key / IP via an atomic Lua script, with an in-memory fallback. Optional API keys, constant-time compared."],
  ["GPU / RAM guardrails", "Inputs downscaled before tensor work, output-pixel cap, cache flush after every GPU call, automatic CPU fallback routes."],
  ["Privacy by default", "Processed assets auto-delete after 1 hour unless you pin them. no-store cache headers, sandboxed SVG responses."],
  ["Agent safety", "LLM plans are validated against a tool whitelist and clamped parameter ranges. User text is never executed or concatenated into commands."],
  ["Container hardening", "Non-root users, dropped Linux capabilities, no-new-privileges, Redis memory cap, healthchecks."],
];

const LIMITS = [
  "The manipulation score is an error-level-analysis heuristic, and the NSFW score is a skin-tone heuristic unless the optional model is enabled. Neither is a verdict.",
  "Segmentation, upscaling, inpainting and depth run classical CPU algorithms by default. SAM 2, Real-ESRGAN, diffusion and Depth Anything plug in through backend hooks and need a GPU image.",
  "Text-to-image search needs CLIP (ENABLE_CLIP=true). Without it, search is image-to-image plus keyword matching.",
  "LLM planning depends on your free-tier Groq / Gemini quota. Without keys the agent uses its built-in rule planner.",
  "Face detection uses a Haar cascade by default, so profile or very small faces can be missed. Review privacy blurs before sharing.",
  "Free-tier rate limits and 1-hour retention are intentional. Pin anything you need to keep.",
];

export default function Security() {
  const [s, setS] = useState<any>(null);
  useEffect(() => { status().then(setS).catch(() => setS(null)); }, []);
  const lim = s?.limits ?? { max_upload_mb: 50, max_side: 2048, ttl_seconds: 3600, rate_capacity: 30, auth_required: false };
  const rows: [string, string][] = [
    ["Max upload", `${lim.max_upload_mb} MB`], ["Tensor side cap", `${lim.max_side}px`],
    ["Asset TTL", `${Math.round(lim.ttl_seconds / 60)} min`], ["Rate burst", `${lim.rate_capacity} req`],
    ["API key required", lim.auth_required ? "yes" : "no (dev)"],
    ["LLM providers", s ? ["groq", "gemini"].filter((k) => s.llm?.[k]).join(" + ") || "none (offline mode)" : "—"],
  ];
  return (
    <section id="security" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-24">
      <p className="eyebrow mb-3">Security, limits & responsible use</p>
      <h2 className="h2 max-w-2xl"><span className="text-mute">Guardrails you can read,</span> and limitations stated plainly.</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {CONTROLS.map(([t, d]) => (
          <div key={t} className="glass p-5"><h3 className="text-[15px] font-medium">{t}</h3><p className="mt-1.5 text-[12.5px] leading-snug text-sub">{d}</p></div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="glass p-5 lg:col-span-2">
          <p className="eyebrow mb-3">Live limits {s ? "· from your API" : "· defaults (API offline)"}</p>
          <dl className="grid grid-cols-2 gap-y-2 text-[13px]">
            {rows.map(([k, v]) => (<><dt key={k} className="text-sub">{k}</dt><dd key={k + "v"} className="text-right font-medium">{v}</dd></>))}
          </dl>
        </div>
        <div className="glass p-5 lg:col-span-3">
          <p className="eyebrow mb-3">Known limitations</p>
          <ul className="space-y-2 text-[12.5px] leading-snug text-sub">
            {LIMITS.map((l) => <li key={l} className="flex gap-2"><span className="text-mute">—</span>{l}</li>)}
          </ul>
        </div>
      </div>
      <LiveSystem status={s} />
    </section>
  );
}
