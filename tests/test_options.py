import pytest
from pydantic import ValidationError

from app.models import DownloadRequest, Options
from app.options import build_arguments, catalog, extra_arguments


def test_advanced_options_and_quoted_values(settings):
    options = Options(
        referer="https://example.com/watch",
        headers="Origin: https://example.com\nX-Test: hello world",
        proxy="socks5://localhost:1080",
        mode="audio",
        audio_format="flac",
        subtitles=True,
        sections="*00:01:00-00:03:30",
        extra_args='--extractor-args "youtube:player_client=default" --sleep-requests 1',
    )
    args = build_arguments(options, settings.downloads, settings.data)
    assert args[args.index("--referer") + 1] == options.referer
    assert "X-Test: hello world" in args
    assert "--extract-audio" in args
    assert args[args.index("--audio-format") + 1] == "flac"
    assert "youtube:player_client=default" in args
    assert args[-1] == "--no-simulate"


@pytest.mark.parametrize(
    "value",
    [
        '--exec "touch /tmp/pwned"',
        '--exec-before-download "whoami"',
        "--config-locations /etc/passwd",
        "--config-location=/etc/passwd",
        "-o /tmp/escape.mp4",
        "-P /tmp",
        "--output=/tmp/a",
        "--enable-file-urls",
        '--alias pwn "--exec whoami"',
        "--netrc-cmd whoami",
        "--print-to-file title /tmp/a",
        "--cookies /etc/passwd",
        "--downloader sh",
        "--plugin-dirs /tmp",
        '--parse-metadata "title:%(filepath)s"',
        "--version",
        "--help",
        "--no-progress",
        "--progress-template anything",
        "https://example.com",
    ],
)
def test_reserved_options_cannot_be_smuggled_through_aliases(value):
    with pytest.raises(ValueError):
        extra_arguments(value)


def test_future_reference_comes_from_installed_parser():
    groups = catalog()
    options = [o for g in groups for o in g["options"]]
    referer = next(o for o in options if "--referer" in o["flags"])
    assert not referer["managed"]
    assert referer["takes_value"]
    assert next(o for o in options if "--exec" in o["flags"])["managed"]
    assert len(options) > 200


@pytest.mark.parametrize(
    "folder", ["../secret", "/etc", "Music/../../secret", "C:\\Windows", "..\\secret"]
)
def test_folder_traversal_is_rejected(folder):
    with pytest.raises(ValidationError):
        Options(folder=folder)


@pytest.mark.parametrize("filename", ["../secret", "/etc/file", "..\\file", "-"])
def test_filename_traversal_is_rejected(filename):
    with pytest.raises(ValidationError):
        Options(filename=filename)


def test_symlink_folder_escape_is_rejected(settings, tmp_path):
    target = tmp_path / "elsewhere"
    target.mkdir()
    link = settings.downloads / "link"
    try:
        link.symlink_to(target, target_is_directory=True)
    except OSError:
        pytest.skip("OS does not allow creating symlinks")
    with pytest.raises(ValueError):
        build_arguments(Options(folder="link"), settings.downloads, settings.data)


@pytest.mark.parametrize(
    "url", ["file:///etc/passwd", "ftp://example.com/a", "hello", "javascript:alert(1)"]
)
def test_non_http_inputs_rejected(url):
    with pytest.raises(ValidationError):
        DownloadRequest(urls=[url])
