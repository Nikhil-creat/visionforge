# syntax=docker/dockerfile:1.6
# IMPORTANT: hosts such as Render and Cloud Run build the LAST stage by default, so the CPU image is last on purpose.
#   docker build --target cpu -t visionforge-api backend/       (default; runs anywhere, ~512 MB RAM is enough)
#   docker build --target gpu -t visionforge-api-gpu backend/   (CUDA 12.1 + PyTorch stack: CLIP, OCR, ...)

# ---------- shared wheel builder ----------
FROM python:3.11-slim AS wheels
WORKDIR /w
COPY requirements.txt .
RUN pip wheel --no-cache-dir -r requirements.txt -w /wheels

# ---------- GPU runtime (opt-in) ----------
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04 AS gpu
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 DATA_DIR=/data DEBIAN_FRONTEND=noninteractive \
    ENABLE_CLIP=true ENABLE_OCR=true
RUN apt-get update && apt-get install -y --no-install-recommends python3.10 python3-pip libglib2.0-0 libgl1 \
    fonts-dejavu-core fonts-noto-color-emoji && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3.10 /usr/local/bin/python \
    && useradd -m -u 10001 forge && mkdir /data && chown forge /data
WORKDIR /app
COPY requirements.txt requirements-gpu.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir -r requirements-gpu.txt --extra-index-url https://download.pytorch.org/whl/cu121
COPY app ./app
USER forge
EXPOSE 8000
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

# ---------- CPU runtime (DEFAULT, must stay last) ----------
FROM python:3.11-slim AS cpu
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 DATA_DIR=/data
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 fonts-dejavu-core fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 10001 forge && mkdir /data && chown forge /data
COPY --from=wheels /wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels /wheels/*.whl && rm -rf /wheels
WORKDIR /app
COPY app ./app
USER forge
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:%s/health'%os.environ.get('PORT','8000'))" || exit 1
# PORT is injected by Render / Cloud Run; WEB_CONCURRENCY=1 keeps memory low on 512 MB hosts.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2}"]
