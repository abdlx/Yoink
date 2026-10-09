import asyncio
import contextlib
import json
import os
import re
import signal
import tempfile
from pathlib import Path

from .models import Options
from .options import build_arguments


async def stop_process(process):
    if process.returncode is not None:
        return
    with contextlib.suppress(ProcessLookupError):
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGTERM)
        else:
            process.terminate()
    try:
        await asyncio.wait_for(process.wait(), 5)
    except asyncio.TimeoutError:
        with contextlib.suppress(ProcessLookupError):
            if os.name == "posix":
                os.killpg(process.pid, signal.SIGKILL)
            else:
                process.kill()
        await process.wait()


def spawn_kwargs():
    return {"start_new_session": True} if os.name == "posix" else {}


def redact(text, options):
    if text.startswith("[debug] Command-line config:"):
        return "[debug] Command-line config: [hidden to protect credentials]"
    values = [options.password, options.video_password, options.proxy, options.cookies]
    for header in options.headers.splitlines():
        if ":" in header:
            values.append(header.split(":", 1)[1].strip())
    for value in values:
        if value:
            text = text.replace(value, "[redacted]")
    return re.sub(r"(https?://|socks5h?://)[^/@\s]+@", r"\1[redacted]@", text)


def write_cookies(data, value):
    if not value:
        return None
    if not value.lstrip().startswith(("# Netscape HTTP Cookie File", "# HTTP Cookie File")):
        raise ValueError("Cookies must be an exported Netscape cookies.txt file")
    fd, name = tempfile.mkstemp(prefix="cookies-", suffix=".txt", dir=data)
    with os.fdopen(fd, "w", encoding="utf-8") as file:
        file.write(value)
    return Path(name)


class Engine:
    def __init__(self, settings, store):
        self.settings, self.store = settings, store
        self.tasks = []
        self.processes = {}
        self.preview_slots = asyncio.Semaphore(2)
        self.closing = False
        self.cancelled = set()
        self.running = set()

    async def start(self):
        self.tasks = [asyncio.create_task(self.worker()) for _ in range(self.settings.workers)]

    async def close(self):
        self.closing = True
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)

    async def worker(self):
        while not self.closing:
            ident = self.store.next()
            if not ident:
                await asyncio.sleep(0.5)
                continue
            # No await between selecting and claiming: one event loop owns the queue.
            self.store.update(ident, status="downloading", error="")
            self.running.add(ident)
            await self.run(ident)

    async def run(self, ident):
        job = self.store.get(ident, private=True)
        options = Options(**job["options"])
        cookie = None
        process = None
        logs, files = [], list(job["files"])
        try:
            cookie = write_cookies(self.settings.data, options.cookies)
            args = build_arguments(options, self.settings.downloads, self.settings.data, cookie)
            args += ["--", job["url"]]
            process = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                limit=2**20,
                **spawn_kwargs(),
            )
            self.processes[ident] = process
            # Cancellation may arrive while the subprocess is being created.
            if ident in self.cancelled:
                await stop_process(process)
                return
            while line := await process.stdout.readline():
                if ident in self.cancelled:
                    continue
                text = line.decode("utf-8", errors="replace").strip()
                try:
                    if text.startswith("__PROGRESS__"):
                        progress = json.loads(text[12:])
                        total = (
                            progress.get("total_bytes") or progress.get("total_bytes_estimate") or 0
                        )
                        downloaded = progress.get("downloaded_bytes") or 0
                        self.store.update(
                            ident,
                            status="downloading",
                            downloaded=downloaded,
                            total=total,
                            progress=min(100, downloaded / total * 100) if total else 0,
                            speed=progress.get("speed") or 0,
                            eta=progress.get("eta"),
                        )
                        continue
                    if text.startswith("__POST__"):
                        self.store.update(ident, status="processing", speed=0, eta=None)
                        continue
                    if text.startswith("__INFO__"):
                        info = json.loads(text[8:])
                        self.store.update(
                            ident,
                            title=info.get("title") or job["title"],
                            thumbnail=info.get("thumbnail") or job["thumbnail"],
                            item=f"{info.get('playlist_index') or ''}/{info.get('playlist_count') or ''}"
                            if info.get("playlist_index")
                            else "",
                        )
                        continue
                    if text.startswith("__FILE__"):
                        path = Path(json.loads(text[8:])).resolve()
                        if path.is_relative_to(self.settings.downloads) and path.is_file():
                            relative = path.relative_to(self.settings.downloads).as_posix()
                            if relative not in files:
                                files.append(relative)
                            self.store.update(ident, files=files)
                        continue
                except (ValueError, TypeError, KeyError):
                    pass
                # Keep bounded logs and redact supplied credentials and headers.
                text = redact(text, options)
                logs.append(text[:4000])
                logs = logs[-200:]
                self.store.update(ident, logs=logs)
            code = await process.wait()
            if ident in self.cancelled:
                return
            if code == 0:
                self.store.update(ident, status="completed", progress=100, speed=0, eta=None)
            else:
                error = next(
                    (line for line in reversed(logs) if "ERROR" in line),
                    f"yt-dlp exited with code {code}",
                )
                self.store.update(ident, status="failed", error=error, speed=0, eta=None)
        except asyncio.CancelledError:
            if process:
                await stop_process(process)
            if self.store.get(ident)["status"] != "cancelled":
                self.store.update(ident, status="queued", speed=0)
            raise
        except Exception as exc:
            if process:
                await stop_process(process)
            self.store.update(ident, status="failed", error=str(exc), speed=0)
        finally:
            self.processes.pop(ident, None)
            self.running.discard(ident)
            self.cancelled.discard(ident)
            if cookie:
                cookie.unlink(missing_ok=True)

    async def cancel(self, ident):
        self.cancelled.add(ident)
        self.store.update(ident, status="cancelled", speed=0, eta=None)
        if process := self.processes.get(ident):
            await stop_process(process)
        # The reader may have handled buffered progress while termination was pending.
        self.store.update(ident, status="cancelled", speed=0, eta=None)
        if ident not in self.running:
            self.cancelled.discard(ident)

    async def preview(self, url, options):
        async with self.preview_slots:
            cookie, process = None, None
            preview_dir = tempfile.TemporaryDirectory(prefix="preview-", dir=self.settings.data)
            try:
                cookie = write_cookies(self.settings.data, options.cookies)
                args = build_arguments(
                    options, self.settings.downloads, self.settings.data, cookie, preview=True
                )
                args += ["--paths", preview_dir.name, "--output", "%(id)s.%(ext)s"]
                process = await asyncio.create_subprocess_exec(
                    *args,
                    "--",
                    url,
                    cwd=preview_dir.name,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    **spawn_kwargs(),
                )
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=90)
                if process.returncode:
                    raise ValueError(
                        stderr.decode("utf-8", errors="replace")[-3000:]
                        or "Could not inspect this URL"
                    )
                info = json.loads(stdout)

                def summary(entry):
                    return {
                        key: entry.get(key)
                        for key in (
                            "id",
                            "title",
                            "thumbnail",
                            "duration",
                            "uploader",
                            "channel",
                            "webpage_url",
                            "url",
                        )
                    }

                result = summary(info)
                result.update(
                    {
                        "description": (info.get("description") or "")[:1200],
                        "extractor": info.get("extractor_key"),
                        "playlist_count": info.get("playlist_count"),
                        "is_playlist": info.get("_type") in {"playlist", "multi_video"},
                        "entries": [summary(e) for e in (info.get("entries") or []) if e][:30],
                        "formats": [
                            {
                                key: f.get(key)
                                for key in (
                                    "format_id",
                                    "ext",
                                    "resolution",
                                    "height",
                                    "fps",
                                    "filesize",
                                    "filesize_approx",
                                    "vcodec",
                                    "acodec",
                                    "format_note",
                                )
                            }
                            for f in info.get("formats", [])
                        ],
                        "subtitles": list(info.get("subtitles", {})),
                        "automatic_captions": list(info.get("automatic_captions", {})),
                    }
                )
                return result
            except asyncio.TimeoutError as exc:
                raise ValueError(
                    "Preview timed out after 90 seconds. Check the URL or connection options."
                ) from exc
            finally:
                if process and process.returncode is None:
                    await stop_process(process)
                if cookie:
                    cookie.unlink(missing_ok=True)
                preview_dir.cleanup()
