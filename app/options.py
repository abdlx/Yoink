"""Use the installed yt-dlp parser: aliases and future options work without a stale whitelist."""

import shlex
import sys
from pathlib import Path

from yt_dlp.options import create_parser

from .models import Options

# These are application-owned or execute arbitrary programs/read server files.
RESERVED = {
    "print_help",
    "update_self",
    "list_extractors",
    "list_extractor_descriptions",
    "list_impersonate_targets",
    "config_locations",
    "ignoreconfig",
    "plugin_dirs",
    "js_runtimes",
    "remote_components",
    "_",
    "enable_file_urls",
    "download_archive",
    "batchfile",
    "paths",
    "outtmpl",
    "load_info_filename",
    "cookiefile",
    "cookiesfrombrowser",
    "cachedir",
    "rm_cachedir",
    "forceprint",
    "print_to_file",
    "geturl",
    "gettitle",
    "getid",
    "getthumbnail",
    "getdescription",
    "getduration",
    "getfilename",
    "getformat",
    "dumpjson",
    "dump_single_json",
    "print_json",
    "progress_template",
    "progress_delta",
    "progress_with_newline",
    "noprogress",
    "consoletitle",
    "encoding",
    "write_pages",
    "load_pages",
    "debug_printtraffic",
    "dump_intermediate_pages",
    "usenetrc",
    "netrc_location",
    "netrc_cmd",
    "client_certificate",
    "client_certificate_key",
    "ffmpeg_location",
    "exec_cmd",
    "exec_before_dl_cmd",
    "external_downloader",
    "external_downloader_args",
    "add_postprocessors",
    "listformats",
    "list_thumbnails",
    "listsubtitles",
    "ap_list_mso",
    "quiet",
    "simulate",
    "extract_flat",
    "compat_opts",
    "parse_metadata",
}


def option_blocked(option):
    return option.dest in RESERVED or option.dest is None


def extra_arguments(value: str):
    try:
        args = shlex.split(value, posix=True)
    except ValueError as exc:
        raise ValueError(f"Custom arguments: {exc}") from exc
    parser = create_parser()

    def fail(message, *args, **kwargs):
        raise ValueError(str(message))

    parser.error = fail
    parser.exit = fail
    for group in [parser, *parser.option_groups]:
        for option in group.option_list:
            original = option.process

            def process(opt, value, values, parser, option=option, original=original):
                if option_blocked(option):
                    raise ValueError(
                        f"{opt} is managed by the app or unavailable in the web UI. See the option reference."
                    )
                return original(opt, value, values, parser)

            option.process = process
    try:
        _, positional = parser.parse_args(args)
    except (SystemExit, Exception) as exc:
        raise ValueError(f"Custom arguments: {exc}") from exc
    if positional:
        raise ValueError("Place URLs in the URL field, not in custom arguments")
    return args


def catalog():
    parser = create_parser()
    return [
        {
            "name": group.title,
            "options": [
                {
                    "flags": o._short_opts + o._long_opts,
                    "help": (o.help or "")
                    if o.help != "SUPPRESSHELP"
                    else {
                        "referer": "Set the HTTP Referer header. Also available in Network & authentication.",
                        "user_agent": "Set the User-Agent HTTP header. Also available in Network & authentication.",
                    }.get(
                        o.dest, "Compatibility option supported by the installed yt-dlp version."
                    ),
                    "metavar": o.metavar,
                    "takes_value": o.takes_value(),
                    "managed": option_blocked(o),
                }
                for o in group.option_list
            ],
        }
        for group in parser.option_groups
    ]


def build_arguments(options: Options, downloads: Path, data: Path, cookie_file=None, preview=False):
    args = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--ignore-config",
        "--no-plugin-dirs",
        "--no-cache-dir",
        "--no-colors",
        "--encoding",
        "utf-8",
        "--js-runtimes",
        "node",
        "--socket-timeout",
        "30",
    ]
    args += ["--yes-playlist" if options.playlist else "--no-playlist"]
    for flag, value in (
        ("--referer", options.referer),
        ("--user-agent", options.user_agent),
        ("--proxy", options.proxy),
        ("--username", options.username),
        ("--password", options.password),
        ("--video-password", options.video_password),
    ):
        if value:
            args += [flag, value]
    for header in options.headers.splitlines():
        if header.strip():
            if ":" not in header:
                raise ValueError("Headers must use Name: value, one per line")
            args += ["--add-headers", header.strip()]
    if cookie_file:
        args += ["--cookies", str(cookie_file)]
    custom = extra_arguments(options.extra_args)
    if preview:
        # Network/extractor options apply to previews; no output or postprocessing is performed.
        args += custom
        args += [
            "--dump-single-json",
            "--skip-download",
            "--no-write-playlist-metafiles",
            "--no-write-thumbnail",
            "--no-write-info-json",
            "--no-write-description",
            "--no-write-subs",
            "--no-write-auto-subs",
            "--no-write-comments",
            "--playlist-end",
            "30",
            "--flat-playlist",
        ]
        return args
    target = (downloads / options.folder).resolve()
    if not target.is_relative_to(downloads):
        raise ValueError("Download folder must stay within the server downloads directory")
    args += [
        "--paths",
        str(target),
        "--output",
        options.filename,
        "--windows-filenames",
        "--concurrent-fragments",
        str(options.concurrent_fragments),
        "--retries",
        str(options.retries),
    ]
    if options.format:
        args += ["--format", options.format]
    elif options.mode == "video":
        cap = "" if options.quality == "best" else f"[height<={options.quality}]"
        args += ["--format", f"bv*{cap}+ba/b{cap}"]
    if options.mode == "audio":
        args += ["--extract-audio", "--audio-format", options.audio_format, "--audio-quality", "0"]
    elif options.container != "auto":
        args += ["--merge-output-format", options.container, "--remux-video", options.container]
    for flag, enabled in (
        ("--write-subs", options.subtitles),
        ("--write-auto-subs", options.auto_subtitles),
        ("--embed-subs", options.embed_subtitles),
        ("--embed-metadata", options.embed_metadata),
        ("--embed-thumbnail", options.embed_thumbnail),
        ("--write-thumbnail", options.write_thumbnail),
        ("--write-info-json", options.write_info_json),
    ):
        if enabled:
            args.append(flag)
    for flag, value in (
        ("--sub-langs", options.subtitle_languages),
        ("--playlist-items", options.playlist_items),
        ("--limit-rate", options.rate_limit),
        ("--download-sections", options.sections),
        ("--sponsorblock-remove", options.sponsorblock),
    ):
        if value:
            args += [flag, value]
    if options.archive:
        args += ["--download-archive", str(data / "archive.txt")]
    args += custom
    # Machine output is last, so custom options cannot silently disable queue reporting.
    args += [
        "--newline",
        "--progress",
        "--progress-delta",
        "0.5",
        "--progress-template",
        "download:__PROGRESS__%(progress)j",
        "--progress-template",
        "postprocess:__POST__%(progress)j",
        "--print",
        "before_dl:__INFO__%(.{title,thumbnail,id,playlist_index,playlist_count})j",
        "--print",
        "after_move:__FILE__%(filepath)j",
        "--no-simulate",
    ]
    return args
