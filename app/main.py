import asyncio
import hmac
import os
import secrets
import shutil
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from yt_dlp.version import __version__ as ytdlp_version

from .config import Settings
from .engine import Engine
from .models import DownloadRequest, LoginRequest
from .options import build_arguments, catalog
from .store import Store

STATIC = Path(__file__).parent / "static"


def create_app(settings=None):
    settings = settings or Settings()
    store = Store(settings.data / "queue.sqlite3")
    engine = Engine(settings, store)
    sessions = {}
    attempts = OrderedDict()

    @asynccontextmanager
    async def lifespan(app):
        await engine.start()
        yield
        await engine.close()
        store.db.close()

    app = FastAPI(
        title="Still — yt-dlp", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None
    )
    app.state.store, app.state.engine = store, engine

    @app.middleware("http")
    async def protection(request, call_next):
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            allowed = {f"{request.url.scheme}://{request.url.netloc}"}
            if settings.origin:
                allowed.add(settings.origin)
            if (origin and origin.rstrip("/") not in allowed) or request.headers.get(
                "sec-fetch-site"
            ) == "cross-site":
                return JSONResponse(
                    {"detail": "Cross-site requests are not allowed"}, status_code=403
                )
            if request.headers.get("content-type", "").split(";")[0].strip() != "application/json":
                return JSONResponse({"detail": "Use application/json"}, status_code=415)
            try:
                length = int(request.headers.get("content-length", "0"))
            except ValueError:
                return JSONResponse({"detail": "Invalid content length"}, status_code=400)
            if length > 2_000_000:
                return JSONResponse({"detail": "Request too large"}, status_code=413)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: http: data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        )
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    async def authenticated(request: Request):
        token = request.cookies.get("still_session", "")
        if sessions.get(token, 0) <= time.time():
            sessions.pop(token, None)
            raise HTTPException(401, "Please sign in")

    @app.get("/healthz")
    def health():
        return {"status": "ok"}

    @app.post("/api/login")
    async def login(body: LoginRequest, request: Request, response: Response):
        now = time.time()
        client = request.client.host if request.client else "unknown"
        recent = [t for t in attempts.get(client, []) if now - t < 300]
        if len(recent) >= 10:
            raise HTTPException(429, "Too many attempts. Try again in five minutes.")
        if not hmac.compare_digest(body.password.encode(), settings.password.encode()):
            attempts[client] = [*recent, now]
            attempts.move_to_end(client)
            while len(attempts) > 2000:
                attempts.popitem(last=False)
            raise HTTPException(401, "Incorrect password")
        attempts.pop(client, None)
        # Bound expired sessions without extending their original lifetime.
        for key, expires in list(sessions.items()):
            if expires < now:
                sessions.pop(key, None)
        if len(sessions) >= 1000:
            sessions.pop(next(iter(sessions)))
        token = secrets.token_urlsafe(48)
        sessions[token] = now + settings.session_hours * 3600
        response.set_cookie(
            "still_session",
            token,
            httponly=True,
            secure=settings.secure_cookie,
            samesite="strict",
            max_age=settings.session_hours * 3600,
        )
        return {"ok": True}

    @app.post("/api/logout")
    async def logout(request: Request, response: Response):
        sessions.pop(request.cookies.get("still_session", ""), None)
        response.delete_cookie(
            "still_session", secure=settings.secure_cookie, httponly=True, samesite="strict"
        )
        return {"ok": True}

    @app.get("/api/session", dependencies=[Depends(authenticated)])
    async def session():
        return {"authenticated": True}

    @app.get("/api/system", dependencies=[Depends(authenticated)])
    async def system():
        disk = shutil.disk_usage(settings.downloads)
        return {
            "version": ytdlp_version,
            "download_dir": str(settings.downloads),
            "disk_free": disk.free,
            "disk_total": disk.total,
            "concurrency": settings.workers,
            "ffmpeg": shutil.which("ffmpeg") is not None,
            "node": shutil.which("node") is not None,
            "update_on_start": os.getenv("UPDATE_YTDLP", "true").lower() == "true",
        }

    @app.get("/api/options", dependencies=[Depends(authenticated)])
    async def options():
        return {"version": ytdlp_version, "groups": catalog()}

    @app.post("/api/preview", dependencies=[Depends(authenticated)])
    async def preview(body: DownloadRequest):
        try:
            return await engine.preview(body.urls[0], body.options)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.get("/api/jobs", dependencies=[Depends(authenticated)])
    async def jobs():
        return store.list()

    @app.post("/api/jobs", status_code=201, dependencies=[Depends(authenticated)])
    async def add_jobs(body: DownloadRequest):
        try:
            build_arguments(body.options, settings.downloads, settings.data)
            if body.options.cookies:
                from .engine import write_cookies

                cookie = write_cookies(settings.data, body.options.cookies)
                cookie.unlink(missing_ok=True)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        if (
            sum(j["status"] in {"queued", "downloading", "processing"} for j in store.list())
            + len(body.urls)
            > 500
        ):
            raise HTTPException(409, "Queue is full (500 active jobs)")
        ids = [
            store.create(
                url,
                body.options.model_dump(),
                body.title if len(body.urls) == 1 else "",
                body.thumbnail if len(body.urls) == 1 else "",
            )
            for url in body.urls
        ]
        return {"ids": ids}

    def find_job(ident):
        job = store.get(ident)
        if not job:
            raise HTTPException(404, "Job not found")
        return job

    @app.post("/api/jobs/{ident}/cancel", dependencies=[Depends(authenticated)])
    async def cancel_job(ident: str):
        if find_job(ident)["status"] not in {"queued", "downloading", "processing"}:
            raise HTTPException(409, "Job is no longer active")
        await engine.cancel(ident)
        return {"ok": True}

    @app.post("/api/jobs/{ident}/retry", dependencies=[Depends(authenticated)])
    async def retry_job(ident: str):
        if (
            find_job(ident)["status"] in {"queued", "downloading", "processing"}
            or ident in engine.running
        ):
            raise HTTPException(409, "Wait for this job to finish")
        store.update(ident, status="queued", progress=0, speed=0, error="", logs=[])
        return {"ok": True}

    @app.delete("/api/jobs/{ident}", dependencies=[Depends(authenticated)])
    async def remove_job(ident: str):
        if (
            find_job(ident)["status"] in {"queued", "downloading", "processing"}
            or ident in engine.running
        ):
            raise HTTPException(409, "Cancel the job before removing it")
        store.remove(ident)
        return {"ok": True}

    @app.get("/api/library", dependencies=[Depends(authenticated)])
    async def library():
        def scan():
            files = []
            for root, directories, names in os.walk(settings.downloads, followlinks=False):
                directories[:] = [d for d in directories if not Path(root, d).is_symlink()]
                for name in names:
                    path = Path(root, name)
                    if (
                        path.is_symlink()
                        or path.suffix in {".part", ".ytdl", ".temp"}
                        or ".part-Frag" in name
                    ):
                        continue
                    try:
                        stat = path.stat()
                        files.append(
                            {
                                "path": path.relative_to(settings.downloads).as_posix(),
                                "name": name,
                                "size": stat.st_size,
                                "modified": stat.st_mtime,
                                "ext": path.suffix[1:].lower(),
                            }
                        )
                    except OSError:
                        continue
            return sorted(files, key=lambda f: f["modified"], reverse=True)[:5000]

        return await asyncio.to_thread(scan)

    @app.get("/api/files/{relative:path}", dependencies=[Depends(authenticated)])
    def file(relative: str, download: bool = False):
        path = (settings.downloads / relative).resolve()
        if not path.is_relative_to(settings.downloads) or not path.is_file():
            raise HTTPException(404, "File not found")
        playable = {
            ".mp4",
            ".webm",
            ".mkv",
            ".mov",
            ".avi",
            ".m4v",
            ".ts",
            ".mp3",
            ".m4a",
            ".opus",
            ".flac",
            ".wav",
            ".ogg",
            ".aac",
            ".png",
            ".jpg",
            ".jpeg",
            ".webp",
            ".gif",
            ".avif",
        }
        attachment = download or path.suffix.lower() not in playable
        # Downloaded documents must never execute scripts on the authenticated app origin.
        return FileResponse(
            path,
            filename=path.name if attachment else None,
            content_disposition_type="attachment" if attachment else "inline",
            headers={
                "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'"
            },
        )

    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    @app.get("/")
    def index():
        return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})

    return app


# Factory mode keeps imports testable and fails immediately on missing configuration.
