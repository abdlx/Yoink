FROM node:22-bookworm-slim AS javascript
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 DATA_DIR=/data DOWNLOAD_DIR=/downloads
WORKDIR /app
COPY --from=javascript /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 still && useradd --uid 1000 --gid still --create-home still \
    && mkdir /data /downloads
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir 'yt-dlp[default,curl-cffi] @ https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.tar.gz'
COPY app ./app
COPY --from=javascript /app/static ./app/static
COPY scripts ./scripts
RUN chmod +x scripts/entrypoint.sh
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=4)"]
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
