# VisionForge Enterprise v2

A futuristic, catalogue-style AI image-intelligence platform and portfolio: CNN-style diagnostics, an agentic planner (LangGraph), RAG (Qdrant), a **multi-assistant council** (Groq + Gemini, judged consensus), guardrails, a tamper-evident audit ledger, and a themeable dot-matrix UI.

| Area | Highlights |
|---|---|
| Backend | FastAPI, 17 image ops, agent plan→act→evaluate→self-heal, RAG, Celery/Redis, Prometheus metrics |
| AI | 4-persona council, optional deep peer-critique, Gemini-vision describe (consent-gated), smart suggestions, PSNR/SSIM |
| Security | prompt-injection guard, PII redaction, cost-weighted rate limits, magic-byte uploads, hash-chained audit |
| Frontend | Next.js 15 / React 19, 7 palettes × 4 motion styles, ⌘K palette, Studio (compare, history, undo/redo), agent terminal, PWA |
| Ops | Docker (CPU default, GPU opt-in), compose, CI, GitHub Pages workflow, Render blueprint, Cloud Run script |

Quick start: `cp .env.example .env && docker compose up --build` → http://localhost:3000.

Docs: [Deploy (GitHub + free hosting)](docs/DEPLOY.md) · [Customize palettes/animations](docs/CUSTOMIZE.md) · [Security](docs/SECURITY.md).
Tests: `cd backend && pip install -r requirements.txt -r requirements-dev.txt && pytest`.

MIT licensed.
