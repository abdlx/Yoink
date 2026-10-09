import { useState, type ReactNode } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  Folder,
  Link,
  SlidersHorizontal,
  Terminal,
  Video,
} from "lucide-react";
import { defaults, type Options } from "../types";
import { Modal } from "./UI";

function Group({
  title,
  icon,
  children,
  open = false,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open || undefined}>
      <summary>
        {icon}
        {title}
        <ChevronDown className="chevron" />
      </summary>
      <div className="details-body">{children}</div>
    </details>
  );
}
export function Advanced({
  options,
  apply,
  close,
  browse,
  customOpen = false,
}: {
  options: Options;
  apply: (options: Options) => void;
  close: () => void;
  browse: () => void;
  customOpen?: boolean;
}) {
  const [draft, setDraft] = useState(options);
  const [cookieError, setCookieError] = useState("");
  const set = <K extends keyof Options>(key: K, value: Options[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  function field(
    key: keyof Options,
    title: string,
    placeholder = "",
    help = "",
    type = "text",
    rows = 0,
  ) {
    const props = {
      name: key,
      "aria-label": title,
      value: String(draft[key]),
      placeholder,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) =>
        set(key, type === "number" ? Number(e.target.value) : e.target.value),
      autoComplete: type === "password" ? "new-password" : "off",
    };
    return (
      <label className="field">
        {title}
        {rows ? (
          <textarea
            {...props}
            rows={rows}
            spellCheck={false}
            className={key === "extra_args" ? "code-input" : ""}
          />
        ) : (
          <input
            {...props}
            type={type}
            {...(type === "number"
              ? {
                  min: key === "retries" ? 0 : 1,
                  max: key === "retries" ? 100 : 32,
                }
              : {})}
          />
        )}
        {help && <small>{help}</small>}
      </label>
    );
  }
  const check = (key: keyof Options, title: string) => (
    <label className="check-label">
      <input
        name={key}
        type="checkbox"
        checked={Boolean(draft[key])}
        onChange={(e) => set(key, e.target.checked)}
      />
      {title}
    </label>
  );
  return (
    <Modal
      title="Advanced options"
      subtitle="MAKE IT YOURS"
      close={close}
      drawer
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
        className="drawer-form"
      >
        <div className="drawer-body">
          <p className="drawer-intro">
            A little more control, whenever you need it. These settings apply to
            your next downloads.
          </p>
          <Group title="Format & media" icon={<Video />} open={!customOpen}>
            {field(
              "format",
              "Custom format selector",
              "bv*[height<=1080]+ba/b",
              "Overrides the quality picker. Preview a link to see available format IDs.",
            )}
            {field(
              "sections",
              "Download sections",
              "*00:01:00-00:03:30",
              "Time range or chapter regex, using --download-sections syntax.",
            )}
            {field(
              "sponsorblock",
              "SponsorBlock categories to remove",
              "sponsor,intro,outro",
              "Leave empty to keep everything.",
            )}
            <div className="check-grid">
              {check("embed_metadata", "Embed metadata")}
              {check("embed_thumbnail", "Embed cover art")}
              {check("write_thumbnail", "Save thumbnail")}
              {check("write_info_json", "Save info JSON")}
            </div>
          </Group>
          <Group title="Subtitles & playlists" icon={<BookOpen />}>
            <div className="check-grid">
              {check("subtitles", "Download subtitles")}
              {check("auto_subtitles", "Include auto captions")}
              {check("embed_subtitles", "Embed subtitles")}
            </div>
            {field(
              "subtitle_languages",
              "Subtitle languages",
              "en.*,ja",
              "Comma-separated codes or regex. Use all for every language.",
            )}
            {field(
              "playlist_items",
              "Playlist items",
              "1:10 or 1,3,5",
              "Enable Download playlist in the main form to download multiple entries.",
            )}
          </Group>
          <Group title="Network & authentication" icon={<Link />}>
            {field(
              "referer",
              "Referer",
              "https://example.com/watch",
              "The page URL required by some hosts.",
              "url",
            )}
            {field("user_agent", "User agent", "Mozilla/5.0 …")}
            {field(
              "headers",
              "HTTP headers",
              "Origin: https://example.com\nAuthorization: Bearer …",
              "One Name: value per line.",
              "text",
              3,
            )}
            {field("proxy", "Proxy", "socks5://user:pass@host:1080")}
            <div className="field-pair">
              {field("username", "Site username")}
              {field("password", "Site password", "", "", "password")}
            </div>
            {field("video_password", "Video password", "", "", "password")}
            <label className="cookie-upload text-button">
              <FileText />
              Import cookies.txt
              <input
                type="file"
                accept=".txt"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 1_000_000) {
                    setCookieError("Cookie file must be smaller than 1 MB.");
                    return;
                  }
                  set("cookies", await file.text());
                  setCookieError("");
                }}
              />
            </label>
            {cookieError && (
              <p className="field-error" role="alert">
                {cookieError}
              </p>
            )}
            {field(
              "cookies",
              "Cookies",
              "# Netscape HTTP Cookie File",
              "Use Netscape-format cookies. Credentials are kept in the private queue database for retry; protect the data folder.",
              "text",
              4,
            )}
          </Group>
          <Group title="Storage & performance" icon={<Folder />}>
            {field(
              "folder",
              "Subfolder",
              "Videos/Documentaries",
              "Relative to your server’s downloads folder.",
            )}
            {field(
              "filename",
              "Filename template",
              defaults.filename,
              "yt-dlp output template. Use the subfolder field for directories.",
            )}
            {check("archive", "Skip previously archived media")}
            <div className="field-pair">
              {field(
                "rate_limit",
                "Rate limit",
                "5M",
                "Bytes/sec, e.g. 500K or 5M.",
              )}
              {field(
                "concurrent_fragments",
                "Concurrent fragments",
                "",
                "",
                "number",
              )}
            </div>
            {field("retries", "Retries", "", "", "number")}
          </Group>
          <Group
            title="Custom yt-dlp arguments"
            icon={<Terminal />}
            open={customOpen}
          >
            {field(
              "extra_args",
              "Additional options",
              '--extractor-args "youtube:player_client=default"\n--sleep-requests 1\n--split-chapters',
              "CLI syntax with quoted values. Applied after the controls above. Server file access, executable hooks, and queue-owned options are managed by the app.",
              "text",
              6,
            )}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                apply(draft);
                browse();
              }}
            >
              <BookOpen />
              Browse all available options
            </button>
          </Group>
        </div>
        <div className="drawer-footer">
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setDraft({
                ...defaults,
                mode: draft.mode,
                quality: draft.quality,
                container: draft.container,
                audio_format: draft.audio_format,
                playlist: draft.playlist,
              })
            }
          >
            <SlidersHorizontal />
            Reset advanced options
          </button>
          <button className="button primary" type="submit">
            <Check />
            Apply options
          </button>
        </div>
      </form>
    </Modal>
  );
}
