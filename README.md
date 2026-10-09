<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/public/branding/yoink-logo.svg">
    <img src="frontend/public/branding/yoink-logo-light.svg" alt="Yoink" width="286" height="80">
  </picture>
</p>

<h1 align="center">Yoink</h1>
<p align="center"><strong>Grab it. Keep it.</strong></p>

A private, Docker-based **yt-dlp web app** for your home server. A clean React interface for saving videos, audio, and playlists directly to your server.

**React + TypeScript + Vite · FastAPI · SQLite · yt-dlp · FFmpeg**

## Install

Requires Docker Engine with Docker Compose v2 on your server. Supports Linux **amd64 and arm64**, including 64-bit Raspberry Pi systems. Build on the machine where you will run it.

From this project’s directory:

```sh
cp .env.example .env
```

Edit `.env` and replace the placeholder with your own password of **at least 12 characters**:

```dotenv
APP_PASSWORD='your-long-unique-password'
```

Then start:

```sh
docker compose up -d --build
```

Open **http://YOUR_SERVER_IP:8080** and sign in with that password. The first build takes a few minutes. No database server, accounts, frontend server, or API keys to configure.

Alternatively, `sh scripts/setup.sh` prompts for the password, writes `.env`, and starts Compose. The helper requires an interactive terminal and uses the official Python Docker image to quote the password safely. If `.env` already exists, it preserves it.

On Windows, use `Copy-Item .env.example .env` instead of `cp`, edit the password, then run the same Compose command in Docker Desktop’s Linux container mode.

## Deploy with Coolify

Select **Docker Compose** when connecting this repository:

| Coolify setting | Value |
| --- | --- |
| Base Directory | `/` |
| Docker Compose Location | `/compose.coolify.yaml` |
| Service | `yoink` |
| Domain / target port | `https://yoink.example.com:8080` |

The `:8080` suffix tells Coolify which container port to route to; visitors use your normal HTTPS domain without that port. Leave Raw Compose mode disabled so Coolify manages proxy routing.

In Coolify's **Environment Variables**, set `APP_PASSWORD` to your password (at least 12 characters). Also set `APP_ORIGIN` to your browser-facing HTTPS URL, for example `https://yoink.example.com`, without the internal `:8080` port or a URL path. The Coolify definition reads these variables directly; no `.env` file needs to be committed. It defaults to secure cookies for HTTPS. Set `COOKIE_SECURE=false` if serving over plain HTTP.

Downloads are bind-mounted to **`/data/yoink/downloads` on your server** by default. Set `DOWNLOAD_PATH` to another absolute host path if desired, for example `/mnt/media/yoink`. The queue database is kept in a persistent Docker volume mounted at `/data`. Check the parsed Persistent Storage before the first deployment.

Deploy after pushing this file and the Dockerfile to your selected branch. The regular `compose.yaml` remains available for direct LAN installation.

[Coolify's official Compose guide](https://coolify.io/docs/applications/builds/docker-compose)

## What you get

- Password login with HTTP-only session cookies, login throttling, and cross-site request protection.
- A responsive dark UI with readable controls, a download overview, advanced settings in a separate drawer, and fixed bottom navigation on phones.
- Link previews: thumbnails, title, creator, duration, available formats and subtitle languages. Playlist previews show up to the first 30 entries.
- Video quality limits up to 4K, custom format expressions, selectable format IDs, MP4/MKV/WebM remuxing, and audio extraction to MP3/M4A/Opus/FLAC/WAV.
- Referer, user agent, custom HTTP headers, proxies, site credentials, video passwords, and Netscape cookies.txt import. Network and extractor settings also apply when inspecting links.
- Subtitles and automatic captions, cover art, embedded metadata, thumbnails, info JSON, download sections, SponsorBlock, playlist ranges, and download archives.
- Persistent queue, configurable simultaneous jobs, progress/speed/ETA, postprocessing status, per-job logs, cancellation, and retries.
- A server file library with thumbnails when available, search, media and folder filters, sorting, grid/list views, bulk selection, rename, reversible trash, and confirmed permanent deletion. Includes browser playback and optional download to your computer. Playback depends on your browser’s codec support; MKV and some other formats may need a local player.
- Dedicated download history with title/URL search, status and date filters, bulk retries for failed or cancelled downloads, and bulk history removal that keeps saved files.
- Presets saved in your browser. Presets exclude network credentials, cookies, and custom arguments.
- A searchable option reference generated from the **installed yt-dlp parser**, plus a custom arguments field for its supported CLI options. New supported options appear after updating yt-dlp.

### Managing your collection

**Downloads** shows active jobs and the five most recent results. **History** keeps past activity separate; removing history never deletes media. **Library** shows up to 5,000 saved files and refreshes while open. History displays the latest 1,000 jobs.

Use **Rename** to change a filename; matching history links update automatically. **Trash** moves selected files into `.yoink-trash` on the download volume. Trash survives restarts, still uses disk space, and can be restored to the original folder. Restoring or renaming never overwrites an existing file. **Empty trash** and **Delete forever** require typing `DELETE` before permanently removing files.

File management waits for queued or running downloads in the affected folder to finish. Moves use hard links on the download volume to avoid overwriting files; the filesystem must support hard links (normal Linux ext4, XFS, and Btrfs volumes do). Back up the queue database and download volume together to preserve trash records. No new environment variables or setup steps are needed for these features.

### Advanced arguments

In **Advanced options → Custom yt-dlp arguments**, enter normal CLI arguments. Quote values containing spaces; put media links in the main URL field.

```text
--extractor-args "youtube:player_client=default"
--sleep-requests 1
--match-filters "duration < 3600"
--split-chapters
```

Custom arguments override corresponding settings in the drawer. Use the reference’s **+** button to insert an option, then fill in its quoted value.

This is broad yt-dlp support, with deliberate web-app boundaries. Output paths/templates, cookies, archives, runtime selection, config/plugin loading, executable hooks, and machine progress/print options are app-managed. Arbitrary `--exec`, external programs, local-file URL access, loading server config/credential files, and rewriting filepath metadata are unavailable. The reference labels these options **App managed**. FFmpeg is the included external media processor; additional command-line programs are not bundled.

## Where downloads live

By default:

```text
project/
  .env                    # Your password and configuration; never commit this
  downloads/              # Your downloaded files, mounted at /downloads
  data/                   # Persistent queue database and download archive
```

To save somewhere else on the server, change:

```dotenv
DOWNLOAD_PATH=/mnt/media/downloads
```

Then run `docker compose up -d`. The **Subfolder** field creates directories within that destination. The filename field accepts yt-dlp output templates, such as `%(uploader)s - %(title).180B.%(ext)s`.

Removing a job from history **keeps its files**. Manage or delete media using your server’s normal file manager. Interrupted jobs return to the queue after restart, and yt-dlp resumes partial downloads when the source supports it. Cancelled jobs stay cancelled until you retry them.

The queue database retains per-job credentials and cookies so jobs can be retried after a restart. Protect `data/` and its backups. Removing a history entry removes its configuration from the active database, but is not a secure erasure of SQLite pages or backups.

## Latest official yt-dlp

The image installs yt-dlp from **https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.tar.gz**, with its default and `curl-cffi` dependencies. On **every container start**, the entrypoint fetches the latest stable official release again before launching the app. The app shows the installed version in the header and Server settings.

FFmpeg, FFprobe, Node.js 22, and yt-dlp’s JavaScript challenge components are included. Node is explicitly enabled for yt-dlp. See the [official dependency documentation](https://github.com/yt-dlp/yt-dlp#dependencies) and [JavaScript runtime documentation](https://github.com/yt-dlp/yt-dlp/wiki/EJS).

If the startup update fails because the server is offline, the app logs a warning and uses the version bundled in the image. Set `UPDATE_YTDLP=false` to disable startup updates. To request a fresh update:

```sh
docker compose restart
```

To update the app itself after obtaining a new version of its source:

```sh
docker compose up -d --build
```

## Configuration

Only `APP_PASSWORD` needs to be changed to get started. Everything else has a default.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_PASSWORD` | Required | Login password, at least 12 characters |
| `PORT` | `8080` | Host port |
| `BIND_ADDRESS` | `0.0.0.0` | Host interface; use `127.0.0.1` behind a local reverse proxy |
| `DOWNLOAD_PATH` | `./downloads` | Host destination for files |
| `MAX_CONCURRENT_DOWNLOADS` | `2` | Simultaneous jobs, 1–8 |
| `UPDATE_YTDLP` | `true` | Fetch the latest official stable release on startup |
| `SESSION_HOURS` | `24` | Session lifetime, 1–168 hours |
| `COOKIE_SECURE` | `false` | Set to `true` when using HTTPS |
| `APP_ORIGIN` | Unset | Exact browser-facing origin when using an HTTPS reverse proxy, e.g. `https://downloads.example.com` |
| `PUID` / `PGID` | `1000` / `1000` | Linux user/group that own newly created media |

Use single quotes around passwords containing `$`, `#`, or spaces. Docker Compose’s [.env syntax](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/#env-file-syntax) explains escaping.

After editing `.env`, use `docker compose up -d` to recreate the container with the new configuration. `docker compose restart` keeps the previous environment.

The entrypoint changes ownership of the **mount roots only** to `PUID:PGID`, then drops root privileges before starting the API and download processes. Existing files are never recursively chowned. For NFS/root-squash mounts, preconfigure directory permissions and run the container as your numeric UID/GID; startup updates require the default root entrypoint, so refresh the image when running with an explicit Compose `user:` override.

## Reverse proxy and HTTPS

For remote access, put Yoink behind your existing HTTPS reverse proxy or VPN. Set `COOKIE_SECURE=true` and `APP_ORIGIN` to your exact public URL when using HTTPS, for example `https://downloads.example.com`. The API receives plain HTTP from the proxy, so it needs the public origin for request validation even when Host is preserved. Do not include the internal container port or a URL path.

Example Caddy configuration:

```caddyfile
downloads.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

For that setup, set `BIND_ADDRESS=127.0.0.1`, `COOKIE_SECURE=true`, and `APP_ORIGIN=https://downloads.example.com` in `.env`. Serving under a URL subpath is not supported; use a dedicated hostname.

The app is a single-owner server administration tool: authenticated users can make outbound requests to the URLs and proxies they supply. Give its password only to people you trust with that ability. Download only media you are permitted to save. Site-specific login, anti-bot checks, geo restrictions, and DRM can still prevent a download; yt-dlp cannot bypass every restriction.

## Troubleshooting

```sh
docker compose logs -f
docker compose ps
```

- **App exits immediately:** set a non-placeholder `APP_PASSWORD` with at least 12 characters.
- **Permission denied:** check `PUID`/`PGID` and the destination’s permissions. Existing subfolders must be writable by that UID. NFS may require setting ownership on the host.
- **Site requires login:** import a current Netscape `cookies.txt` through Advanced options. Your server cannot directly read the browser on your laptop.
- **Preview/download fails:** inspect the job log, check referer/headers/cookies, then restart to fetch current yt-dlp. Some sites require a newer upstream fix or a different server IP.
- **Cookie won’t stick on HTTP:** leave `COOKIE_SECURE=false` for plain HTTP on your LAN. Enable it after configuring HTTPS.
- **Restart seems slow:** the official release is being fetched and installed. Offline startup falls back to the bundled version after the update attempt finishes.

## Development and verification

Python 3.12+, Node 22.12+, and FFmpeg/FFprobe are needed locally. Docker supplies them for installation.

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
. .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
# Set APP_PASSWORD before running the API.
cd frontend
npm ci
npm run build
cd ..
uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8080
```

For frontend development, run `npm run dev` in `frontend/` and open **http://127.0.0.1:5173/static/**. Vite proxies API calls to port 8080. Production uses the Vite build served by FastAPI, with no additional frontend process.

Run backend tests:

```sh
python -m pytest -q
```

Run browser tests against a locally running app, using a dedicated test environment and the same password as `TEST_APP_PASSWORD` (the test default is `yoink-browser-test-password`):

```sh
cd frontend
npx playwright install chromium
npm test
```

Browser tests generate a local audio fixture and exercise actual downloads and FFmpeg conversion. They save test files and history in the running app; do not point them at your production instance. Screenshots and traces go to `frontend/test-results/`.

The backend tests cover auth, cross-site protection, throttling, option/path validation, persistence, process cancellation/retry, actual yt-dlp metadata extraction and downloads, and authenticated byte-range file retrieval. Use **one Uvicorn process**: the in-memory sessions and queue scheduler intentionally run within a single container process.

`.github/workflows/ci.yml` also runs the app tests and a Docker build/start/authentication check on GitHub Actions when the project is pushed to GitHub.

## Project layout

```text
frontend/src/             # React components, typed API client, CSS
app/main.py               # FastAPI routes, sessions, security, library
app/engine.py             # Subprocess queue, progress parsing, previews
app/options.py            # yt-dlp CLI mapping and live option reference
app/store.py              # SQLite job history and restart recovery
scripts/entrypoint.sh     # Official updater and privilege drop
compose.yaml              # Single-container installation
```

## Verification in this workspace

The React production build, backend tests, and Chromium browser flows were run locally, including MP3 conversion through FFmpeg and desktop/mobile screenshot inspection. Docker Engine is not installed in the development workspace, so an actual container build/start has **not** been executed here.

## Logo assets

The original vector logo combines a **Y** with a download arrow. The app, favicon, and README use the same assets. The README uses relative repository paths and automatically selects a light or dark wordmark on GitHub.

- [Dark-background wordmark](frontend/public/branding/yoink-logo.svg)
- [Light-background wordmark](frontend/public/branding/yoink-logo-light.svg)
- [Transparent symbol](frontend/public/branding/yoink-mark.svg)
- [App icon](frontend/public/branding/yoink-icon.svg)
- [512px app icon](frontend/public/branding/yoink-icon-512.png)
- [PNG wordmark](frontend/public/branding/yoink-logo.png)

The editable originals are SVG. Regenerate the PNG exports with `npm run brand:assets` in `frontend/`.

After pushing to `abdlx/Yoink` on `main`, the raw dark wordmark is available at `https://raw.githubusercontent.com/abdlx/Yoink/main/frontend/public/branding/yoink-logo.svg`.
