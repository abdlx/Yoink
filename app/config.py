import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


class Settings:
    def __init__(self):
        self.password = os.getenv("APP_PASSWORD", "")
        if len(self.password) < 12 or self.password == "change-this-password":
            raise RuntimeError(
                "Set APP_PASSWORD in .env to a unique password of at least 12 characters."
            )
        self.data = Path(os.getenv("DATA_DIR", "data")).resolve()
        self.downloads = Path(os.getenv("DOWNLOAD_DIR", "downloads")).resolve()
        self.data.mkdir(parents=True, exist_ok=True)
        self.downloads.mkdir(parents=True, exist_ok=True)
        self.workers = max(1, min(8, int(os.getenv("MAX_CONCURRENT_DOWNLOADS", "2"))))
        self.secure_cookie = os.getenv("COOKIE_SECURE", "false").lower() == "true"
        self.origin = os.getenv("APP_ORIGIN", "").rstrip("/")
        self.session_hours = max(1, min(168, int(os.getenv("SESSION_HOURS", "24"))))
