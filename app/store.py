import json
import sqlite3
import time
import uuid


class Store:
    def __init__(self, path):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("""CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, url TEXT NOT NULL, options TEXT NOT NULL,
            title TEXT NOT NULL, thumbnail TEXT NOT NULL, status TEXT NOT NULL,
            created REAL NOT NULL, updated REAL NOT NULL, progress REAL DEFAULT 0,
            speed REAL DEFAULT 0, eta REAL, downloaded REAL DEFAULT 0,
            total REAL DEFAULT 0, error TEXT DEFAULT '', logs TEXT DEFAULT '[]',
            files TEXT DEFAULT '[]', item TEXT DEFAULT '')""")
        self.db.execute(
            "UPDATE jobs SET status='queued', speed=0 WHERE status IN ('downloading','processing')"
        )
        self.db.execute("""CREATE TABLE IF NOT EXISTS trash (
            id TEXT PRIMARY KEY, path TEXT NOT NULL, size INTEGER NOT NULL,
            modified REAL NOT NULL, trashed REAL NOT NULL)""")
        self.db.commit()

    def create(self, url, options, title="", thumbnail=""):
        ident, now = uuid.uuid4().hex, time.time()
        self.db.execute(
            "INSERT INTO jobs (id,url,options,title,thumbnail,status,created,updated) VALUES (?,?,?,?,?,'queued',?,?)",
            (ident, url, json.dumps(options), title or url, thumbnail, now, now),
        )
        self.db.commit()
        return ident

    def get(self, ident, private=False):
        row = self.db.execute("SELECT * FROM jobs WHERE id=?", (ident,)).fetchone()
        return self.decode(row, private) if row else None

    @staticmethod
    def decode(row, private=False):
        job = dict(row)
        for key in ("options", "logs", "files"):
            job[key] = json.loads(job[key])
        if not private:
            job.pop("options")
        return job

    def list(self):
        return [
            self.decode(row)
            for row in self.db.execute("SELECT * FROM jobs ORDER BY created DESC LIMIT 1000")
        ]

    def update(self, ident, **fields):
        fields["updated"] = time.time()
        for key in ("options", "logs", "files"):
            if key in fields:
                fields[key] = json.dumps(fields[key])
        self.db.execute(
            f"UPDATE jobs SET {','.join(f'{key}=?' for key in fields)} WHERE id=?",
            [*fields.values(), ident],
        )
        self.db.commit()

    def next(self):
        row = self.db.execute(
            "SELECT id FROM jobs WHERE status='queued' ORDER BY created LIMIT 1"
        ).fetchone()
        return row[0] if row else None

    def remove(self, ident):
        self.db.execute("DELETE FROM jobs WHERE id=?", (ident,))
        self.db.commit()

    def replace_file(self, old, new):
        for row in self.db.execute("SELECT id,files FROM jobs").fetchall():
            files = json.loads(row["files"])
            if old in files:
                files = (
                    [new if f == old else f for f in files]
                    if new
                    else [f for f in files if f != old]
                )
                self.update(row["id"], files=files)

    def trash_list(self):
        return [dict(row) for row in self.db.execute("SELECT * FROM trash ORDER BY trashed DESC")]
