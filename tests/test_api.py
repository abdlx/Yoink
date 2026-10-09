import time

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import Options
from app.store import Store


@pytest.fixture
def client(settings):
    app = create_app(settings)
    with TestClient(app) as client:
        yield client


def sign_in(client, settings):
    response = client.post("/api/login", json={"password": settings.password})
    assert response.status_code == 200
    return response


def test_api_and_files_require_login(client, settings):
    (settings.downloads / "private.txt").write_text("private")
    for path in (
        "/api/jobs",
        "/api/system",
        "/api/options",
        "/api/library",
        "/api/files/private.txt",
    ):
        assert client.get(path).status_code == 401
    assert client.get("/healthz").status_code == 200
    assert client.get("/").status_code == 200
    assert "frame-ancestors 'none'" in client.get("/").headers["content-security-policy"]


def test_password_session_and_logout(client, settings):
    assert client.post("/api/login", json={"password": "wrong"}).status_code == 401
    response = sign_in(client, settings)
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert client.get("/api/session").status_code == 200
    assert client.post("/api/logout", json={}).status_code == 200
    assert client.get("/api/session").status_code == 401


def test_https_proxy_origin_is_allowed_only_when_configured(settings):
    settings.origin = "https://yoink.example.com"
    with TestClient(create_app(settings)) as client:
        response = client.post(
            "/api/login",
            json={"password": settings.password},
            headers={"Origin": "https://yoink.example.com", "Host": "yoink.example.com"},
        )
        assert response.status_code == 200
        response = client.post(
            "/api/logout",
            json={},
            headers={"Origin": "https://other.example.com", "Host": "yoink.example.com"},
        )
        assert response.status_code == 403


def test_csrf_and_bruteforce_protection(client, settings):
    assert (
        client.post(
            "/api/login",
            json={"password": settings.password},
            headers={"Origin": "https://evil.example"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/login", content='{"password":"test"}', headers={"Content-Type": "text/plain"}
        ).status_code
        == 415
    )
    for _ in range(10):
        assert client.post("/api/login", json={"password": "wrong"}).status_code == 401
    assert client.post("/api/login", json={"password": settings.password}).status_code == 429


def test_real_server_side_download_preview_and_library(client, settings, media_server):
    url, source = media_server
    sign_in(client, settings)
    preview = client.post("/api/preview", json={"urls": [url]})
    assert preview.status_code == 200, preview.text
    assert preview.json()["title"]
    assert preview.json()["formats"]
    response = client.post(
        "/api/jobs", json={"urls": [url], "options": {"embed_metadata": False, "folder": "Samples"}}
    )
    assert response.status_code == 201, response.text
    ident = response.json()["ids"][0]
    for _ in range(100):
        jobs = client.get("/api/jobs").json()
        job = next(j for j in jobs if j["id"] == ident)
        if job["status"] in {"completed", "failed"}:
            break
        time.sleep(0.1)
    assert job["status"] == "completed", job
    assert job["files"] and job["progress"] == 100
    assert "options" not in job
    downloaded = settings.downloads / job["files"][0]
    assert downloaded.read_bytes() == source.read_bytes()
    library = client.get("/api/library").json()
    assert any(f["path"] == job["files"][0] for f in library)
    file = client.get("/api/files/" + job["files"][0], headers={"Range": "bytes=0-9"})
    assert file.status_code == 206
    assert file.content == source.read_bytes()[:10]
    assert client.request("DELETE", f"/api/jobs/{ident}", json={}).status_code == 200
    assert downloaded.is_file()


def test_bad_arguments_are_rejected_before_queueing(client, settings):
    sign_in(client, settings)
    response = client.post(
        "/api/jobs",
        json={"urls": ["https://example.com/video"], "options": {"extra_args": "--exec whoami"}},
    )
    assert response.status_code == 400
    assert client.get("/api/jobs").json() == []


def test_downloaded_documents_cannot_execute_as_app_pages(client, settings):
    sign_in(client, settings)
    (settings.downloads / "untrusted.html").write_text("<script>alert('test')</script>")
    response = client.get("/api/files/untrusted.html")
    assert response.status_code == 200
    assert response.headers["content-disposition"].startswith("attachment;")
    assert "sandbox; default-src 'none'" in response.headers["content-security-policy"]


def test_file_path_escape_and_symlink(client, settings, tmp_path):
    sign_in(client, settings)
    assert client.get("/api/files/..%2F..%2Fsecret.txt").status_code == 404
    secret = tmp_path / "secret.txt"
    secret.write_text("secret")
    try:
        (settings.downloads / "link.txt").symlink_to(secret)
    except OSError:
        return
    assert client.get("/api/files/link.txt").status_code == 404
    assert not any(f["path"] == "link.txt" for f in client.get("/api/library").json())


def test_restart_requeues_interrupted_jobs_and_keeps_history(settings):
    store = Store(settings.data / "persist.sqlite3")
    ident = store.create("https://example.com/video", Options().model_dump(), "Saved title")
    store.update(ident, status="downloading", progress=41)
    store.db.close()
    reopened = Store(settings.data / "persist.sqlite3")
    assert reopened.get(ident)["status"] == "queued"
    assert reopened.get(ident)["title"] == "Saved title"
    reopened.db.close()
