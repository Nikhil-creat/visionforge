# Contributing
1. Fork, branch from `main` (`feat/<name>`).
2. Backend: `cd backend && pip install -r requirements.txt -r requirements-dev.txt && pytest` (must pass).
3. Frontend: `cd frontend && npm i && npx tsc --noEmit && npm run build`.
4. Never commit keys or `.env`. Open a PR using the template; keep changes focused.
New image op, palette or persona? See `docs/CUSTOMIZE.md`.
