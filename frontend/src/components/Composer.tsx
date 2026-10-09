import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  Clock3,
  Folder,
  Link,
  LoaderCircle,
  Music2,
  Play,
  Plus,
  SlidersHorizontal,
  Trash2,
  Video,
} from "lucide-react";
import { api, bytes, duration, errorMessage } from "../api";
import { defaults, type Options, type Preset, type Preview } from "../types";
import { Modal } from "./UI";

const presetKeys = [
  "mode",
  "quality",
  "container",
  "audio_format",
  "format",
  "playlist",
  "playlist_items",
  "subtitles",
  "auto_subtitles",
  "subtitle_languages",
  "embed_subtitles",
  "embed_metadata",
  "embed_thumbnail",
  "write_thumbnail",
  "write_info_json",
  "sponsorblock",
  "rate_limit",
  "concurrent_fragments",
  "retries",
  "sections",
  "folder",
  "filename",
  "archive",
] as const;
function loadPresets(): Preset[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem("still-presets") || "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p) =>
          p &&
          typeof p.name === "string" &&
          p.options &&
          typeof p.options === "object",
      )
      .slice(0, 50)
      .map((p) => ({
        name: p.name.slice(0, 60),
        options: Object.fromEntries(
          presetKeys
            .filter((k) => typeof p.options[k] === typeof defaults[k])
            .map((k) => [k, p.options[k]]),
        ),
      }));
  } catch {
    return [];
  }
}
function MediaImage({ src, title }: { src: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && /^https?:\/\//i.test(src) && !failed ? (
    <img
      src={src}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  ) : (
    <div className="thumbnail-fallback">
      <Video />
    </div>
  );
}
export { MediaImage };

function PreviewCard({
  preview,
  loading,
  error,
  choose,
}: {
  preview: Preview | null;
  loading: boolean;
  error: string;
  choose: (format: string) => void;
}) {
  if (loading)
    return (
      <aside className="panel preview-panel">
        <div className="preview-empty">
          <LoaderCircle className="spin loading-icon" />
          <h3>Taking a closer look…</h3>
          <p>
            Checking the media and available formats.
            <br />
            Some hosts take a moment.
          </p>
        </div>
      </aside>
    );
  if (error)
    return (
      <aside className="panel preview-panel">
        <div className="preview-empty preview-error">
          <Link className="loading-icon" />
          <h3>Couldn’t open this link.</h3>
          <p>{error}</p>
          <span className="preview-hint">TRY NETWORK OPTIONS OR COOKIES</span>
        </div>
      </aside>
    );
  if (!preview)
    return (
      <aside className="panel preview-panel">
        <div className="preview-empty">
          <div className="preview-illustration">
            <div className="illustration-card back" />
            <div className="illustration-card front">
              <Play />
            </div>
            <span className="spark spark-one">✦</span>
            <span className="spark spark-two">✦</span>
          </div>
          <h3>A sneak peek first.</h3>
          <p>
            Paste a link and hit preview.
            <br />
            See the details before you save.
          </p>
          <span className="preview-hint">VIDEO · AUDIO · PLAYLISTS</span>
        </div>
      </aside>
    );
  const cover =
    preview.thumbnail ||
    preview.entries.find((e) => e.thumbnail)?.thumbnail ||
    null;
  const formats = [...preview.formats]
    .reverse()
    .filter((f) => !f.format_id.startsWith("sb"));
  return (
    <aside className="panel preview-panel preview-ready">
      <div className="preview-cover">
        <MediaImage src={cover} title={preview.title} />
        <span className="preview-source">{preview.extractor || "Media"}</span>
        {preview.duration != null && (
          <span className="duration-badge">{duration(preview.duration)}</span>
        )}
      </div>
      <div className="preview-content">
        <span className="eyebrow">
          {preview.is_playlist
            ? `${preview.playlist_count || preview.entries.length}${preview.playlist_count ? "" : "+"} ITEMS IN PLAYLIST`
            : "READY WHEN YOU ARE"}
        </span>
        <h3>{preview.title}</h3>
        <div className="preview-meta">
          <span>{preview.channel || preview.uploader || "Media preview"}</span>
          {preview.duration != null && (
            <span>
              <Clock3 />
              {duration(preview.duration)}
            </span>
          )}
        </div>
        {formats.length > 0 && (
          <label className="format-picker">
            AVAILABLE FORMATS
            <select
              aria-label="Choose an available format"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) {
                  choose("");
                  return;
                }
                const f = formats.find((f) => f.format_id === e.target.value)!;
                choose(
                  f.vcodec !== "none" && f.acodec === "none"
                    ? `${f.format_id}+ba/${f.format_id}`
                    : f.format_id,
                );
              }}
            >
              <option value="">Auto · use quality settings</option>
              {formats.map((f) => (
                <option key={f.format_id} value={f.format_id}>
                  {f.format_id} ·{" "}
                  {f.resolution ||
                    f.format_note ||
                    (f.vcodec === "none" ? "Audio" : f.ext)}{" "}
                  · {f.ext}
                  {f.filesize || f.filesize_approx
                    ? ` · ${bytes(f.filesize || f.filesize_approx || 0)}`
                    : ""}
                  {f.acodec === "none" ? " + audio" : ""}
                </option>
              ))}
            </select>
            <ChevronDown />
          </label>
        )}
        {preview.is_playlist && (
          <details className="playlist-preview">
            <summary>
              Peek inside this playlist <ChevronDown />
            </summary>
            <ol>
              {preview.entries.slice(0, 8).map((e, i) => (
                <li key={`${e.id}-${i}`}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  {e.title || "Untitled media"}
                </li>
              ))}
            </ol>
            {preview.entries.length > 8 && (
              <small>Showing the first 8 entries.</small>
            )}
          </details>
        )}
        {preview.subtitles.length > 0 && (
          <span className="subtitles-note">
            Subtitles available in {preview.subtitles.length} languages
          </span>
        )}
      </div>
    </aside>
  );
}

export function Composer({
  options,
  setOptions,
  openAdvanced,
  notify,
}: {
  options: Options;
  setOptions: (o: Options) => void;
  openAdvanced: () => void;
  notify: (s: string) => void;
}) {
  const [urls, setUrls] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewSequence = useRef(0);
  const [presets, setPresets] = useState(loadPresets);
  const [preset, setPreset] = useState("");
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState("");
  const client = useQueryClient();
  const list = () =>
    urls
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  const add = useMutation({
    mutationFn: () =>
      api<{ ids: string[] }>("/jobs", "POST", {
        urls: list(),
        options,
        title: preview?.title || "",
        thumbnail: preview?.thumbnail || "",
      }),
    onSuccess: (data) => {
      notify(
        `${data.ids.length === 1 ? "Download" : `${data.ids.length} downloads`} added to your queue.`,
      );
      setUrls("");
      setPreview(null);
      setPreviewError("");
      previewSequence.current++;
      client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  const set = <K extends keyof Options>(key: K, value: Options[K]) => {
    setOptions({ ...options, [key]: value });
    setPreset("");
  };
  async function inspect() {
    if (!list().length) {
      setPreviewError("Paste a media link first.");
      return;
    }
    const sequence = ++previewSequence.current;
    setPreviewBusy(true);
    setPreviewError("");
    setPreview(null);
    try {
      const data = await api<Preview>("/preview", "POST", {
        urls: [list()[0]],
        options,
      });
      if (sequence === previewSequence.current) setPreview(data);
    } catch (error) {
      if (sequence === previewSequence.current)
        setPreviewError(errorMessage(error));
    } finally {
      if (sequence === previewSequence.current) setPreviewBusy(false);
    }
  }
  function persist(next: Preset[]) {
    try {
      localStorage.setItem("still-presets", JSON.stringify(next));
      setPresets(next);
      return true;
    } catch {
      notify("Browser storage is unavailable. This preset could not be saved.");
      return false;
    }
  }
  function savePreset(event: FormEvent) {
    event.preventDefault();
    const name = presetName.trim();
    if (!name) return;
    const safe = Object.fromEntries(presetKeys.map((k) => [k, options[k]]));
    if (
      persist(
        [
          ...presets.filter((p) => p.name !== name),
          { name, options: safe },
        ].slice(-50),
      )
    ) {
      setPreset(name);
      setSaving(false);
      notify("Preset saved in this browser.");
    }
  }
  const advancedCount = Object.entries(options).filter(
    ([k, v]) =>
      !["mode", "quality", "container", "audio_format", "playlist"].includes(
        k,
      ) && v !== defaults[k as keyof Options],
  ).length;
  return (
    <>
      <div className="composer-layout">
        <section className="panel composer">
          <div className="panel-heading">
            <h2>
              <Link />
              New download
            </h2>
            <span className="subtle-label">PASTE. PREVIEW. KEEP.</span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <label className="sr-only" htmlFor="urls">
              Media URLs, one per line
            </label>
            <div className="url-box">
              <textarea
                id="urls"
                value={urls}
                onChange={(e) => {
                  setUrls(e.target.value);
                  setPreview(null);
                  setPreviewError("");
                  setPreviewBusy(false);
                  previewSequence.current++;
                  add.reset();
                }}
                placeholder="Drop a video, playlist, or audio link here…"
                rows={3}
                required
                spellCheck={false}
              />
              <div className="url-box-footer">
                <span>Multiple links? Add one per line.</span>
                <button
                  className="text-button"
                  type="button"
                  onClick={inspect}
                  disabled={previewBusy}
                >
                  {previewBusy ? <LoaderCircle className="spin" /> : <Play />}
                  Preview link
                </button>
              </div>
            </div>
            <div className="format-row">
              <div className="mode-toggle" aria-label="Media type">
                <button
                  type="button"
                  aria-pressed={options.mode === "video"}
                  className={options.mode === "video" ? "selected" : ""}
                  onClick={() => set("mode", "video")}
                >
                  <Video />
                  Video
                </button>
                <button
                  type="button"
                  aria-pressed={options.mode === "audio"}
                  className={options.mode === "audio" ? "selected" : ""}
                  onClick={() => set("mode", "audio")}
                >
                  <Music2 />
                  Audio
                </button>
              </div>
              {options.mode === "video" ? (
                <>
                  <label className="quick-field">
                    QUALITY
                    <select
                      aria-label="Quality"
                      value={options.quality}
                      onChange={(e) =>
                        set("quality", e.target.value as Options["quality"])
                      }
                    >
                      <option value="best">Best available</option>
                      <option value="2160">4K · 2160p</option>
                      <option value="1440">2K · 1440p</option>
                      <option value="1080">Full HD · 1080p</option>
                      <option value="720">HD · 720p</option>
                      <option value="480">480p</option>
                    </select>
                  </label>
                  <label className="quick-field">
                    CONTAINER
                    <select
                      aria-label="Container"
                      value={options.container}
                      onChange={(e) =>
                        set("container", e.target.value as Options["container"])
                      }
                    >
                      <option value="auto">Auto</option>
                      <option value="mp4">MP4</option>
                      <option value="mkv">MKV</option>
                      <option value="webm">WebM</option>
                    </select>
                  </label>
                </>
              ) : (
                <label className="quick-field">
                  AUDIO FORMAT
                  <select
                    aria-label="Audio format"
                    value={options.audio_format}
                    onChange={(e) =>
                      set(
                        "audio_format",
                        e.target.value as Options["audio_format"],
                      )
                    }
                  >
                    {["mp3", "m4a", "opus", "flac", "wav", "best"].map((f) => (
                      <option key={f} value={f}>
                        {f === "best" ? "Original format" : f.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="composer-options">
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={options.playlist}
                  onChange={(e) => set("playlist", e.target.checked)}
                />
                Download playlist
              </label>
              <button
                className="text-button"
                type="button"
                onClick={openAdvanced}
              >
                <SlidersHorizontal />
                Advanced options
                {advancedCount > 0 && (
                  <span className="tiny-count">{advancedCount}</span>
                )}
              </button>
            </div>
            {options.format && (
              <div className="custom-format-note">
                Custom format: <code>{options.format}</code>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => set("format", "")}
                >
                  Clear
                </button>
              </div>
            )}
            <div className="composer-bottom">
              <div className="preset-control">
                <Folder />
                <label htmlFor="preset" className="sr-only">
                  Saved preset
                </label>
                <select
                  id="preset"
                  value={preset}
                  onChange={(e) => {
                    const p = presets.find((p) => p.name === e.target.value);
                    setPreset(e.target.value);
                    setOptions({ ...defaults, ...p?.options });
                  }}
                >
                  <option value="">Default settings</option>
                  {presets.map((p) => (
                    <option key={p.name}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  title="Save settings as a preset"
                  aria-label="Save preset"
                  onClick={() => {
                    setPresetName(preset);
                    setSaving(true);
                  }}
                >
                  <Plus />
                </button>
                {preset && (
                  <button
                    type="button"
                    className="icon-button"
                    title="Delete preset"
                    aria-label="Delete preset"
                    onClick={() => {
                      if (persist(presets.filter((p) => p.name !== preset)))
                        setPreset("");
                    }}
                  >
                    <Trash2 />
                  </button>
                )}
              </div>
              <button className="button primary" disabled={add.isPending}>
                {add.isPending ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <ArrowDownToLine />
                )}
                {add.isPending ? "Adding…" : "Add to queue"}
              </button>
            </div>
            {add.error && (
              <p className="field-error" role="alert">
                {errorMessage(add.error)}
              </p>
            )}
          </form>
        </section>
        <PreviewCard
          preview={preview}
          loading={previewBusy}
          error={previewError}
          choose={(value) => {
            set("format", value);
            notify(
              value
                ? `Format selected: ${value}`
                : "Using quality settings again.",
            );
          }}
        />
      </div>
      {saving && (
        <Modal title="Save a preset" close={() => setSaving(false)}>
          <form onSubmit={savePreset} className="preset-form">
            <label className="field">
              Preset name
              <input
                placeholder="Evening listening"
                maxLength={60}
                required
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
              />
            </label>
            <p className="muted">
              Saves format, subtitle, storage, and performance settings in this
              browser. Network credentials and custom arguments are excluded.
            </p>
            <button className="button primary">
              <Check />
              Save preset
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
