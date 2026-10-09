import functools
import http.server
import threading
import wave

import pytest


@pytest.fixture
def settings(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_PASSWORD", "a-unique-test-password-123")
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("DOWNLOAD_DIR", str(tmp_path / "downloads"))
    monkeypatch.setenv("MAX_CONCURRENT_DOWNLOADS", "1")
    from app.config import Settings

    return Settings()


@pytest.fixture
def media_server(tmp_path):
    root = tmp_path / "media"
    root.mkdir()
    with wave.open(str(root / "sample.wav"), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\x00\x00" * 8000)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = functools.partial(Handler, directory=str(root))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}/sample.wav", root / "sample.wav"
    server.shutdown()
    server.server_close()
    thread.join()
