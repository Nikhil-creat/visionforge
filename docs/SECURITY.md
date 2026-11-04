# Security model & limitations

## Controls
- **Uploads:** magic-byte sniffing (not extensions), streamed size cap, pixel caps, auto-delete after `TTL_SECONDS`.
- **Access:** optional `API_KEYS` (constant-time compare), per-identity token bucket (Redis or in-memory); costly routes (agent 3, chat 2, council 4) spend more tokens.
- **Proxy trust:** `X-Forwarded-For` is ignored unless `TRUSTED_PROXY_HOPS>0`, then counted from the right so clients can't forge it.
- **Prompt guard:** regex scoring for instruction override, prompt/secret exfiltration, jailbreaks, chat-template tokens; block ≥ `GUARD_BLOCK_THRESHOLD`, flag below. Invisible characters stripped.
- **Privacy:** PII/secret redaction before text reaches an LLM (emails, phones, Luhn-checked cards, Aadhaar, key shapes); outputs scrubbed of the server's own keys. Gemini-vision "describe" requires explicit per-request consent and downscales images.
- **Council:** answers from several models are anonymised and shuffled for the judge; a lexical-agreement fallback runs if the judge fails.
- **Audit:** SHA-256 hash-chained JSONL ledger, metadata only; `/api/audit/verify` detects edits to past entries.
- **HTTP:** request IDs, body cap, security headers, CSP, strict CORS origins, non-root container.

## Limitations (be honest about these)
- Regex guardrails reduce, not eliminate, prompt injection. Treat LLM output as untrusted.
- The audit chain is tamper-*evident*, not tamper-proof: someone with disk access can rewrite the whole chain. Anchor the head hash externally for stronger guarantees.
- Open demo mode (no `API_KEYS`) is rate limited but public. Set keys for anything real.
- Free tiers: Groq/Gemini quotas and Render sleep apply; in-memory fallbacks reset on restart.
- CPU image runs classical CV ops; CLIP/OCR/NSFW need the GPU image or extra requirements.
- Not independently pentested.
