# Deploy guide: GitHub → free hosting

Plan: **frontend on GitHub Pages (free) + backend on Render (free Docker web service)**. Both optional extras (Qdrant Cloud, Upstash Redis) have free tiers.
Free-tier limits change often. Re-check each provider's pricing page before relying on them.

## 1. Free API keys (2 minutes)
- Groq: https://console.groq.com/keys
- Gemini: https://aistudio.google.com/apikey
Either key works; both enable the multi-assistant council with failover. Gemini's free tier may use your prompts to improve Google products. Don't send private data.
Never commit keys. They go only in `.env` (local) or the host's dashboard.

## 2. Run locally first
```bash
cp .env.example .env          # paste your keys
docker compose up --build     # frontend :3000, API :8000, docs :8000/docs
```
No Docker? `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload` and `cd frontend && npm i && npm run dev`.

## 3. Push to GitHub (Termux or any terminal)
1. Create an empty repo named `visionforge` at https://github.com/new (no README).
2. Create a token: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained → repo access to `visionforge`, permission *Contents: read/write*.
3. In the unzipped project folder:
```bash
pkg install git            # Termux (on Linux/macOS git is usually present)
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git init
git add .
git commit -m "VisionForge Enterprise v2"
git branch -M main
git remote add origin https://github.com/Nikhil-creat/visionforge.git
git push -u origin main    # username = your GitHub name, password = the token
```
`.gitignore` already excludes `.env`, `node_modules`, and data. Check `git status` shows no `.env` before committing.

## 4. Backend on Render (free)
1. https://render.com → New → **Blueprint** → select the repo (uses `render.yaml`).
2. When prompted, fill `GROQ_API_KEY`, `GEMINI_API_KEY`, and `CORS_ORIGINS` = `https://<your-github-name>.github.io` (origin only: no path, no trailing slash).
3. Deploy. Your API URL looks like `https://visionforge-api.onrender.com`. Test `/health`.
Caveats: the free instance sleeps after ~15 min idle (first request takes about a minute), has about 512 MB RAM (hence `MAX_SIDE=1280`, 1 worker), and its disk is ephemeral, so assets reset on restart. `TRUSTED_PROXY_HOPS=1` is preset so rate limits see the real client IP.

Alternatives: **Google Cloud Run** (`deploy/cloudrun.sh`, generous free allowance but needs billing enabled/card), or run the API on your own PC/phone and expose it with a **Cloudflare Tunnel** (`cloudflared tunnel --url http://localhost:8000`, free; set `CORS_ORIGINS` accordingly). Hugging Face Docker Spaces are not free for this, so avoid them.

## 5. Frontend on GitHub Pages
1. Repo → Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → **Variables** → New: `API_URL` = your Render URL (no trailing slash).
3. Push to `main`; `.github/workflows/pages.yml` builds a static export under `/<repo-name>` and publishes it at `https://<you>.github.io/visionforge/`.
4. Make sure Render's `CORS_ORIGINS` is exactly `https://<you>.github.io`.
Other static hosts work too: Cloudflare Pages / Netlify (`netlify.toml` included) / Vercel. Build with `STATIC_EXPORT=1 NEXT_PUBLIC_API_URL=<api> npm run build` and publish `frontend/out`. Without a base path, set `NEXT_PUBLIC_BASE_PATH=` empty.

A static site can't hide secrets: never put LLM keys in the frontend. They live only on the backend. Visitors may paste their own API key in the header box if you enable `API_KEYS`.

## 6. Optional free infra
- **Qdrant Cloud** free cluster → set `QDRANT_URL` + `QDRANT_API_KEY` (otherwise RAG uses an in-memory store that resets on sleep).
- **Upstash Redis** → set `REDIS_URL=rediss://default:<pw>@<host>:6379` (otherwise an in-process rate limiter is used).

## 7. Troubleshooting
| Symptom | Fix |
|---|---|
| Browser "CORS error" | `CORS_ORIGINS` must equal the page origin exactly (scheme + host, no path/slash). Redeploy after changing. |
| First call hangs ~1 min | Render free cold start. Open `/health` to wake it. |
| 404 for CSS/JS on Pages | Workflow sets basePath to the repo name. Repo renamed? Re-run the workflow. |
| 429 | Rate limit. Wait, or raise `RATE_CAPACITY`. Council calls cost 4 tokens. |
| Council answers from one model | Only one key set, or the other hit its free quota. Add both keys. |
| Render restarts / OOM | Lower `MAX_SIDE` (1024) and `MAX_UPLOAD_MB`. |
| Everyone shares one rate limit | Wrong `TRUSTED_PROXY_HOPS`. Set 1 behind one proxy, 0 if direct. |

## Sources
Render free tier: https://render.com/docs/free · Upstash: https://upstash.com/pricing/redis · Free-hosting comparisons: https://snapdeploy.dev/blog/free-docker-hosting-2026-platforms-compared, https://flaviocopes.com/hosting-free-tiers/ · HF Spaces: https://huggingface.co/docs/hub/en/spaces-overview
