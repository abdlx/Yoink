import pytest
from fastapi.testclient import TestClient

from app.engine import Engine
from app.main import create_app
from app.models import Options


@pytest.fixture
def client(settings, monkeypatch):
    async def idle(self):
        pass

    monkeypatch.setattr(Engine, "start", idle)
    with TestClient(create_app(settings)) as client:
        client.post("/api/login", json={"password": settings.password})
        yield client


def change(client, action, paths, **kwargs):
    response = client.post("/api/library/manage", json={"action": action, "paths": paths, **kwargs})
    assert response.status_code == 200, response.text
    return response.json()["results"]


def test_rename_updates_history_and_preserves_file(client, settings):
    file = settings.downloads / "old.mp4"
    file.write_bytes(b"media bytes")
    store = client.app.state.store
    ident = store.create("https://example.com", Options().model_dump())
    store.update(ident, status="completed", files=["old.mp4"])
    result = change(client, "rename", ["old.mp4"], name="new name.mp4")[0]
    assert result == {"path": "old.mp4", "result": "new name.mp4", "ok": True}
    assert not file.exists()
    assert (settings.downloads / "new name.mp4").read_bytes() == b"media bytes"
    assert client.get("/api/jobs").json()[0]["files"] == ["new name.mp4"]


def test_trash_restore_and_collision_never_overwrites(client, settings):
    folder = settings.downloads / "Music"
    folder.mkdir()
    file = folder / "song.mp3"
    file.write_bytes(b"original")
    result = change(client, "trash", ["Music/song.mp3"])[0]
    assert result["ok"]
    ident = result["result"]
    assert not file.exists()
    assert client.get("/api/library").json() == []
    assert client.get(f"/api/files/.yoink-trash/{ident}").status_code == 404
    assert client.get("/api/library/trash").json()[0]["path"] == "Music/song.mp3"
    file.write_bytes(b"replacement")
    result = change(client, "restore", [ident])[0]
    assert not result["ok"] and "already exists" in result["error"]
    assert file.read_bytes() == b"replacement"
    file.unlink()
    folder.rmdir()
    assert change(client, "restore", [ident])[0]["ok"]
    assert file.read_bytes() == b"original"
    assert client.get("/api/library/trash").json() == []


def test_trash_survives_application_restart(settings):
    file = settings.downloads / "saved.wav"
    file.write_bytes(b"saved media")
    with TestClient(create_app(settings)) as client:
        client.post("/api/login", json={"password": settings.password})
        ident = change(client, "trash", ["saved.wav"])[0]["result"]
    with TestClient(create_app(settings)) as client:
        client.post("/api/login", json={"password": settings.password})
        assert client.get("/api/library/trash").json()[0]["id"] == ident
        assert change(client, "restore", [ident])[0]["ok"]
    assert file.read_bytes() == b"saved media"


def test_batch_reports_partial_failure_and_rejects_collisions(client, settings):
    (settings.downloads / "a.mp3").write_bytes(b"a")
    (settings.downloads / "b.mp3").write_bytes(b"b")
    assert not change(client, "rename", ["a.mp3"], name="b.mp3")[0]["ok"]
    assert (settings.downloads / "b.mp3").read_bytes() == b"b"
    results = change(client, "trash", ["a.mp3", "missing.mp3", "a.mp3"])
    assert len(results) == 2
    assert results[0]["ok"] and not results[1]["ok"]
    assert (settings.downloads / "b.mp3").exists()


@pytest.mark.parametrize(
    "path", ["../outside.txt", "/absolute.txt", "C:/private", "folder\\file", ".yoink-trash/file"]
)
def test_management_paths_stay_within_library(client, path):
    assert not change(client, "trash", [path])[0]["ok"]


@pytest.mark.parametrize(
    "name", ["../escape.mp3", "nested/song.mp3", ".", "bad:name", " song.mp3", "bad\x00.mp3"]
)
def test_rename_rejects_invalid_names(client, settings, name):
    file = settings.downloads / "song.mp3"
    file.write_bytes(b"keep me")
    assert not change(client, "rename", ["song.mp3"], name=name)[0]["ok"]
    assert file.read_bytes() == b"keep me"


def test_active_folder_is_protected_but_other_folders_are_manageable(client, settings):
    for folder in ("Active", "Other"):
        directory = settings.downloads / folder
        directory.mkdir()
        (directory / "file.mp3").write_bytes(b"media")
    store = client.app.state.store
    ident = store.create("https://example.com", Options(folder="Active").model_dump())
    assert not change(client, "trash", ["Active/file.mp3"])[0]["ok"]
    assert change(client, "trash", ["Other/file.mp3"])[0]["ok"]
    store.update(ident, status="cancelled")
    assert change(client, "trash", ["Active/file.mp3"])[0]["ok"]


def test_symlinked_files_and_trash_cannot_be_managed(client, settings, tmp_path):
    outside = tmp_path / "outside.mp3"
    outside.write_bytes(b"private")
    link = settings.downloads / "link.mp3"
    try:
        link.symlink_to(outside)
    except OSError:
        pytest.skip("Symlinks require additional Windows privileges")
    assert not change(client, "trash", ["link.mp3"])[0]["ok"]
    (settings.downloads / ".yoink-trash").symlink_to(tmp_path, target_is_directory=True)
    (settings.downloads / "regular.mp3").write_bytes(b"media")
    assert not change(client, "trash", ["regular.mp3"])[0]["ok"]
    assert outside.read_bytes() == b"private"


def test_management_requires_authentication(client):
    client.post("/api/logout", json={})
    assert client.get("/api/library/trash").status_code == 401
    assert (
        client.post("/api/library/manage", json={"action": "trash", "paths": ["a"]}).status_code
        == 401
    )


def test_permanent_delete_only_accepts_existing_trash_ids(client, settings):
    file = settings.downloads / "song.mp3"
    file.write_bytes(b"media")
    store = client.app.state.store
    job = store.create("https://example.com", Options().model_dump())
    store.update(job, status="completed", files=["song.mp3"])
    assert not change(client, "delete", ["song.mp3"])[0]["ok"]
    assert file.exists()
    ident = change(client, "trash", ["song.mp3"])[0]["result"]
    assert client.get("/api/jobs").json()[0]["trashed_files"] == ["song.mp3"]
    assert (settings.downloads / ".yoink-trash" / ident).exists()
    assert change(client, "delete", [ident])[0]["ok"]
    assert not (settings.downloads / ".yoink-trash" / ident).exists()
    assert client.get("/api/library/trash").json() == []
    assert client.get("/api/jobs").json()[0]["files"] == []
    assert not change(client, "restore", [ident])[0]["ok"]
