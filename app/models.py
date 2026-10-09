from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field, field_validator


class Options(BaseModel):
    mode: Literal["video", "audio"] = "video"
    quality: Literal["best", "2160", "1440", "1080", "720", "480"] = "best"
    container: Literal["auto", "mp4", "mkv", "webm"] = "auto"
    audio_format: Literal["mp3", "m4a", "opus", "flac", "wav", "best"] = "mp3"
    format: str = Field(default="", max_length=2000)
    playlist: bool = False
    playlist_items: str = Field(default="", max_length=200)
    subtitles: bool = False
    auto_subtitles: bool = False
    subtitle_languages: str = Field(default="en.*", max_length=300)
    embed_subtitles: bool = False
    embed_metadata: bool = True
    embed_thumbnail: bool = False
    write_thumbnail: bool = False
    write_info_json: bool = False
    sponsorblock: str = Field(default="", max_length=200)
    referer: str = Field(default="", max_length=2000)
    user_agent: str = Field(default="", max_length=2000)
    headers: str = Field(default="", max_length=8000)
    proxy: str = Field(default="", max_length=2000)
    cookies: str = Field(default="", max_length=1_000_000)
    username: str = Field(default="", max_length=500)
    password: str = Field(default="", max_length=500)
    video_password: str = Field(default="", max_length=500)
    rate_limit: str = Field(default="", max_length=50)
    concurrent_fragments: int = Field(default=4, ge=1, le=32)
    retries: int = Field(default=10, ge=0, le=100)
    sections: str = Field(default="", max_length=300)
    folder: str = Field(default="", max_length=200)
    filename: str = Field(default="%(title).180B [%(id)s].%(ext)s", max_length=500)
    archive: bool = False
    extra_args: str = Field(default="", max_length=16_000)

    @field_validator("folder")
    @classmethod
    def safe_folder(cls, value):
        value = value.strip().replace("\\", "/")
        if (
            value.startswith("/")
            or any(p.lower() in {"..", ".", ".yoink-trash"} for p in value.split("/"))
            or ":" in value
            or "\x00" in value
        ):
            raise ValueError("Use a relative folder within downloads, e.g. Music/Albums")
        return value

    @field_validator("filename")
    @classmethod
    def safe_filename(cls, value):
        if (
            not value.strip()
            or any(c in value for c in ("/", "\\", "\x00", "\n", "\r"))
            or value in {".", "..", "-"}
        ):
            raise ValueError("Filename templates must be a filename, without directory separators")
        return value


class DownloadRequest(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=100)
    options: Options = Field(default_factory=Options)
    title: str = Field(default="", max_length=500)
    thumbnail: str = Field(default="", max_length=4000)

    @field_validator("urls")
    @classmethod
    def valid_urls(cls, urls):
        result = []
        for url in urls:
            url = url.strip()
            parsed = urlsplit(url)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname or len(url) > 8000:
                raise ValueError("Enter valid http:// or https:// media URLs")
            result.append(url)
        return list(dict.fromkeys(result))


class LoginRequest(BaseModel):
    password: str = Field(max_length=1000)


class LibraryAction(BaseModel):
    action: Literal["rename", "trash", "restore", "delete"]
    paths: list[str] = Field(min_length=1, max_length=200)
    name: str = Field(default="", max_length=240)
