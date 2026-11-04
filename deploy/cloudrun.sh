#!/usr/bin/env bash
# Deploy the API to Google Cloud Run (needs a Google Cloud project with billing enabled; the free allowance is
# 2M requests / 180k vCPU-seconds per month, but a card is required). Run from the repo root.
set -euo pipefail
REGION="${REGION:-asia-south1}"
PROJECT="${PROJECT:?set PROJECT=your-gcp-project-id}"
: "${GROQ_API_KEY:?export GROQ_API_KEY first}"
: "${CORS_ORIGINS:?export CORS_ORIGINS=https://<you>.github.io first}"

gcloud run deploy visionforge-api \
  --project "$PROJECT" --region "$REGION" \
  --source backend \
  --allow-unauthenticated \
  --memory 1Gi --cpu 1 --max-instances 2 --concurrency 20 --timeout 300 \
  --set-env-vars "GROQ_API_KEY=${GROQ_API_KEY},GEMINI_API_KEY=${GEMINI_API_KEY:-},CORS_ORIGINS=${CORS_ORIGINS},WEB_CONCURRENCY=1,DATA_DIR=/tmp/data,MAX_SIDE=1600,TRUSTED_PROXY_HOPS=1"
# TRUSTED_PROXY_HOPS=1 assumes one proxy appends the client IP to X-Forwarded-For; verify on your service, otherwise
# every visitor may share one rate-limit bucket. Tip: for production move keys to Secret Manager (--set-secrets) instead of --set-env-vars.
