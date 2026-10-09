#!/bin/sh
set -eu

python -c 'import os; p=os.environ.get("APP_PASSWORD", ""); assert len(p)>=12 and p!="change-this-password", "Set APP_PASSWORD in .env to a unique password of at least 12 characters"'

if [ "$(id -u)" = "0" ]; then
    # Change only the mount roots; existing media is never recursively chowned.
    mkdir -p /data /downloads
    chown "${PUID:-1000}:${PGID:-1000}" /data /downloads
    if [ "${UPDATE_YTDLP:-true}" = "true" ]; then
        echo "Fetching latest stable yt-dlp from github.com/yt-dlp/yt-dlp..."
        if ! pip install --upgrade --no-cache-dir --retries 2 --timeout 30 \
            'yt-dlp[default,curl-cffi] @ https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.tar.gz'; then
            echo "WARNING: Update failed; continuing with the version bundled in this image."
        fi
    fi
    # App, FFmpeg and yt-dlp processes run without root privileges.
    exec gosu "${PUID:-1000}:${PGID:-1000}" "$0"
fi

export HOME=/tmp
umask 077
python -c 'import os; from pathlib import Path; [p.mkdir(parents=True, exist_ok=True) for p in (Path("/data"),Path("/downloads"))]; assert os.access("/data",os.W_OK) and os.access("/downloads",os.W_OK), "Mounts must be writable by PUID/PGID"'
echo "Starting Still with yt-dlp $(python -m yt_dlp --version)"
exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8080 --no-proxy-headers
