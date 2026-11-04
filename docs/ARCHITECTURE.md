# Architecture
```
Browser (Next.js, static on GitHub Pages)
   │  HTTPS + CORS (origin allow-list)
   ▼
FastAPI  ── middleware: request-id · body cap · security headers · metrics
   ├─ security.py   API-key auth · token-bucket (cost-weighted) · magic-byte uploads
   ├─ guard.py      injection scan · PII/secret redaction · output scrub
   ├─ council.py    4 personas → Groq/Gemini in parallel → anonymised judge → consensus
   ├─ agent.py      plan → act → evaluate → self-heal (LangGraph, manual-loop fallback)
   ├─ vision/ops    17 CPU image ops, pluggable neural backends (CLIP / OCR / NSFW)
   ├─ rag_engine    Qdrant (server or in-memory fallback)
   └─ audit.py      SHA-256 hash-chained JSONL ledger
Redis (rate limits, Celery) · Qdrant (vectors) — both optional
```
Request flow for a council call: guard → rate limit (cost 4) → redact PII → fan-out → judge → scrub output → audit record.
