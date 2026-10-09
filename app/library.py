"""File management confined to the download volume, with persistent, reversible trash."""

import os
import time
import uuid
from pathlib import PurePosixPath

from fastapi import HTTPException

TRASH = ".yoink-trash"


def safe_path(root, relative):
    parts = PurePosixPath(relative).parts
    if (
        not parts
        or relative.startswith("/")
        or any(p.lower() in {"..", ".", TRASH} for p in parts)
        or any(c in relative for c in ("\\", ":", "\x00"))
    ):
        raise HTTPException(400, "Use a file path within your library")
    path = root.joinpath(*parts)
    if not path.resolve().is_relative_to(root) or any(
        root.joinpath(*parts[:i]).is_symlink() for i in range(1, len(parts) + 1)
    ):
        raise HTTPException(400, "Linked files and folders cannot be managed")
    return path


def move_file(source, target):
    # Both locations are on the download volume. link() is atomic and refuses
    # to replace an existing file, even if another process creates it first.
    os.link(source, target)
    try:
        source.unlink()
    except OSError:
        target.unlink()
        raise


class LibraryManager:
    def __init__(self, root, store, engine):
        self.root, self.store, self.engine = root, store, engine

    def idle(self, path):
        for row in self.store.db.execute(
            "SELECT id,options FROM jobs WHERE status IN ('queued','downloading','processing')"
        ).fetchall():
            job = self.store.get(row["id"], private=True)
            folder = (self.root / job["options"].get("folder", "")).resolve()
            if path.is_relative_to(folder):
                raise HTTPException(409, "Wait for downloads in this folder to finish")
        for ident in self.engine.running:
            job = self.store.get(ident, private=True)
            if job and path.is_relative_to(
                (self.root / job["options"].get("folder", "")).resolve()
            ):
                raise HTTPException(409, "Wait for this download to stop")

    def change(self, action, relative, name=""):
        if action == "restore":
            return self.restore(relative)
        if action == "delete":
            record = self.store.db.execute("SELECT * FROM trash WHERE id=?", (relative,)).fetchone()
            if not record:
                raise HTTPException(404, "Trash item not found")
            source = self.root / TRASH / record["id"]
            if source.parent.is_symlink() or source.is_symlink():
                raise HTTPException(409, "Linked trash files cannot be deleted")
            original = safe_path(self.root, record["path"])
            source.unlink(missing_ok=True)
            if not original.exists():
                self.store.replace_file(record["path"], None)
            self.store.db.execute("DELETE FROM trash WHERE id=?", (relative,))
            self.store.db.commit()
            return relative
        path = safe_path(self.root, relative)
        if not path.is_file():
            raise HTTPException(404, "File no longer exists. Refresh your library.")
        self.idle(path)
        if action == "rename":
            if (
                not name.strip()
                or name in {".", ".."}
                or name != name.strip()
                or any(ord(c) < 32 or c in '/\\:<>"|?*' for c in name)
                or name.endswith(".")
            ):
                raise HTTPException(
                    400, "Enter a filename without separators or reserved characters"
                )
            target = safe_path(self.root, (path.parent / name).relative_to(self.root).as_posix())
            if path == target:
                return relative
            move_file(path, target)
            new = target.relative_to(self.root).as_posix()
            self.store.replace_file(relative, new)
            return new
        ident = uuid.uuid4().hex
        directory = self.root / TRASH
        if directory.is_symlink():
            raise HTTPException(409, "Trash directory must not be a symbolic link")
        directory.mkdir(exist_ok=True)
        stat = path.stat()
        target = directory / ident
        try:
            self.store.db.execute(
                "INSERT INTO trash (id,path,size,modified,trashed) VALUES (?,?,?,?,?)",
                (ident, relative, stat.st_size, stat.st_mtime, time.time()),
            )
            self.store.db.commit()
            move_file(path, target)
        except Exception:
            self.store.db.execute("DELETE FROM trash WHERE id=?", (ident,))
            self.store.db.commit()
            raise
        # Keep original job references so restoring reconnects them automatically.
        return ident

    def restore(self, ident):
        record = self.store.db.execute("SELECT * FROM trash WHERE id=?", (ident,)).fetchone()
        if not record:
            raise HTTPException(404, "Trash item not found")
        target = safe_path(self.root, record["path"])
        self.idle(target)
        source = self.root / TRASH / ident
        if source.is_symlink() or source.parent.is_symlink() or not source.is_file():
            raise HTTPException(404, "Trashed file is unavailable")
        target.parent.mkdir(parents=True, exist_ok=True)
        move_file(source, target)
        self.store.db.execute("DELETE FROM trash WHERE id=?", (ident,))
        self.store.db.commit()
        return record["path"]
