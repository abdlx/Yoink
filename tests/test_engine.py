import asyncio
import sys

from app.engine import Engine, redact
from app.models import Options
from app.store import Store


def test_supplied_credentials_and_headers_are_redacted():
    options = Options(password="secret-password", headers="Authorization: Bearer secret-token")
    assert "secret-password" not in redact("ERROR: secret-password", options)
    assert "secret-token" not in redact("Authorization: Bearer secret-token", options)
    assert "user:pass" not in redact("Proxy: socks5://user:pass@localhost:1080", options)
    assert "sensitive" not in redact(
        "[debug] Command-line config: ['--password', 'sensitive']", options
    )


async def test_cancellation_stops_process_and_retry_remains_possible(settings, monkeypatch):
    store = Store(settings.data / "cancel.sqlite3")
    engine = Engine(settings, store)
    code = "import json,time; print('__PROGRESS__'+json.dumps({'downloaded_bytes':50,'total_bytes':100,'speed':10,'eta':5}),flush=True); time.sleep(30)"
    monkeypatch.setattr(
        "app.engine.build_arguments", lambda *args, **kwargs: [sys.executable, "-u", "-c", code]
    )
    ident = store.create("https://example.com/video", Options().model_dump())
    await engine.start()
    try:
        for _ in range(100):
            if store.get(ident)["progress"] == 50:
                break
            await asyncio.sleep(0.05)
        assert store.get(ident)["progress"] == 50
        process = engine.processes[ident]
        await engine.cancel(ident)
        for _ in range(50):
            if ident not in engine.processes:
                break
            await asyncio.sleep(0.02)
        assert process.returncode is not None
        assert store.get(ident)["status"] == "cancelled"
        store.update(ident, status="queued", progress=0)
        for _ in range(100):
            if store.get(ident)["progress"] == 50:
                break
            await asyncio.sleep(0.05)
        assert store.get(ident)["status"] == "downloading"
    finally:
        await engine.close()
        store.db.close()
