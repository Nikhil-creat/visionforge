export const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export type Analysis = {
  diagnostics: {
    width: number; height: number; blur_score: number; sharpness: string; noise_sigma: number;
    mean_luma: number; exposure: string; histogram: number[]; flags: string[];
  };
  faces: { x: number; y: number; w: number; h: number }[];
  palette: string[];
  ocr: { enabled: boolean; blocks: { text: string; conf: number }[] };
  integrity: {
    manipulation_score: number; manipulation_method: string; nsfw: { method: string; score: number };
    nsfw_flag: boolean; fingerprint: { dhash: string; phash: string };
  };
  tags: { tag: string; score: number }[];
};

export type Asset = { asset_id: string; url: string; width: number; height: number; has_alpha: boolean };
export type OpSpec = {
  name: string; label: string; group: string; desc: string;
  params: Record<string, { type: string; default: any; min: number | null; max: number | null; choices: string[] | null }>;
};

export type AgentEvent = {
  type: "start" | "thought" | "plan" | "tool" | "eval" | "retry" | "memory" | "done" | "error";
  msg?: string; ok?: boolean; memory?: any[]; [k: string]: any;
};

export const getKey = () => (typeof window === "undefined" ? "" : localStorage.getItem("vf_api_key") ?? "");
export const setKey = (k: string) => localStorage.setItem("vf_api_key", k.trim());

function headers(extra: Record<string, string> = {}) {
  const k = getKey();
  return k ? { ...extra, "X-API-Key": k } : extra;
}

async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(API + path, { ...init, headers: headers((init.headers as any) ?? {}) });
  if (!r.ok) {
    let detail: any = r.statusText;
    try { detail = (await r.json()).detail ?? detail; } catch {}
    throw new Error(typeof detail === "string" ? detail : detail?.message ?? JSON.stringify(detail));
  }
  return r.json();
}

const post = <T,>(path: string, body: unknown) =>
  json<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const status = () => json<any>("/api/status");
export const listOps = () => json<{ ops: OpSpec[] }>("/api/ops");

export async function upload(file: File, index = false) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("index", String(index));
  return json<Asset & { analysis: Analysis; indexed: boolean }>("/api/images/upload", { method: "POST", body: fd });
}

export const transform = (id: string, op: string, params: Record<string, any>) =>
  post<Asset & { op: string; info: any; svg_url?: string }>(`/api/images/${id}/transform`, { op, params });

export const pin = (id: string) => post<any>(`/api/images/${id}/keep`, {});
export const analyze = (id: string) => json<{ analysis: Analysis }>(`/api/images/${id}/analysis`);

/** Fetch an asset with auth headers and return an object URL (works even when an API key is required). */
export async function blobUrl(path: string): Promise<string> {
  const r = await fetch(path.startsWith("http") ? path : API + path, { headers: headers() });
  if (!r.ok) throw new Error("Could not load image (expired?)");
  return URL.createObjectURL(await r.blob());
}

export type GuardReport = { verdict: string; score: number; hits: string[]; redactions: Record<string, number> };
export type CouncilMember = {
  id: number; persona: string; provider: string; model: string; ok: boolean; answer: string;
  agent_prompt: string | null; latency_ms: number; error?: string;
};
export type CouncilResult = {
  council?: boolean; ok?: boolean; final?: string; reply?: string; agent_prompt: string | null;
  agreement?: number; agreement_lexical?: number; confidence?: string; method?: string; judge?: string | null;
  consensus?: string[]; disagreements?: string[]; members?: CouncilMember[]; revised?: boolean; elapsed_ms?: number;
  guard?: GuardReport; note?: string; reason?: string; provider?: string;
};
type Turn = { role: string; content: string };

export const chat = (messages: Turn[], asset_id?: string | null) =>
  post<CouncilResult>("/api/chat", { messages, asset_id });
export const council = (messages: Turn[], asset_id: string | null | undefined, depth: "fast" | "deep") =>
  post<CouncilResult>("/api/council", { messages, asset_id, depth });

export type Describe = { model: string; caption: string; alt_text: string; objects: string[]; mood: string; suggested_edits: string[] };
export const describe = (id: string) => post<Describe>(`/api/insights/${id}/describe`, { consent: true });
export type Suggestion = { label: string; prompt: string; reason: string };
export const suggest = (id: string) => json<{ suggestions: Suggestion[] }>(`/api/insights/${id}/suggest`);
export type Metrics = { psnr_db: number | null; ssim: number; identical: boolean; sharpness_delta: number; noise_delta: number; note: string };
export const compareMetrics = (a: string, b: string) => post<Metrics>("/api/insights/compare", { a, b });

export const auditVerify = () => json<{ ok: boolean; count: number; head?: string; broken_at?: number; reason?: string }>("/api/audit/verify");
export const auditRecent = () => json<{ events: { n: number; ts: number; event: string; actor: string; detail: Record<string, any> }[] }>("/api/audit/recent?limit=8");

export const ragIndex = (asset_id: string, kind: string, note: string) => post<any>("/api/rag/index", { asset_id, kind, note });
export const ragText = (query: string) => post<{ results: any[] }>("/api/rag/search/text", { query, k: 8 });
export const ragImage = (asset_id: string) => post<{ results: any[] }>("/api/rag/search/image", { asset_id, k: 8 });
export const ragStats = () => json<any>("/api/rag/stats");

export async function streamAgent(asset_id: string, prompt: string, onEvent: (e: AgentEvent) => void, signal?: AbortSignal) {
  const r = await fetch(API + "/api/agent/run", {
    method: "POST", signal,
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ asset_id, prompt }),
  });
  if (!r.ok || !r.body) {
    let d: any = r.statusText;
    try { d = (await r.json()).detail ?? d; } catch {}
    throw new Error(typeof d === "string" ? d : d?.message ?? "Agent request failed");
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) {
        try { onEvent(JSON.parse(line.slice(6))); } catch {}
      }
    }
  }
}
