export interface Options {
  mode: "video" | "audio";
  quality: "best" | "2160" | "1440" | "1080" | "720" | "480";
  container: "auto" | "mp4" | "mkv" | "webm";
  audio_format: "mp3" | "m4a" | "opus" | "flac" | "wav" | "best";
  format: string;
  playlist: boolean;
  playlist_items: string;
  subtitles: boolean;
  auto_subtitles: boolean;
  subtitle_languages: string;
  embed_subtitles: boolean;
  embed_metadata: boolean;
  embed_thumbnail: boolean;
  write_thumbnail: boolean;
  write_info_json: boolean;
  sponsorblock: string;
  referer: string;
  user_agent: string;
  headers: string;
  proxy: string;
  cookies: string;
  username: string;
  password: string;
  video_password: string;
  rate_limit: string;
  concurrent_fragments: number;
  retries: number;
  sections: string;
  folder: string;
  filename: string;
  archive: boolean;
  extra_args: string;
}
export const defaults: Options = {
  mode: "video",
  quality: "best",
  container: "auto",
  audio_format: "mp3",
  format: "",
  playlist: false,
  playlist_items: "",
  subtitles: false,
  auto_subtitles: false,
  subtitle_languages: "en.*",
  embed_subtitles: false,
  embed_metadata: true,
  embed_thumbnail: false,
  write_thumbnail: false,
  write_info_json: false,
  sponsorblock: "",
  referer: "",
  user_agent: "",
  headers: "",
  proxy: "",
  cookies: "",
  username: "",
  password: "",
  video_password: "",
  rate_limit: "",
  concurrent_fragments: 4,
  retries: 10,
  sections: "",
  folder: "",
  filename: "%(title).180B [%(id)s].%(ext)s",
  archive: false,
  extra_args: "",
};
export type Status =
  | "queued"
  | "downloading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";
export interface Job {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  status: Status;
  created: number;
  updated: number;
  progress: number;
  speed: number;
  eta: number | null;
  downloaded: number;
  total: number;
  error: string;
  logs: string[];
  files: string[];
  item: string;
}
export interface MediaSummary {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  channel: string | null;
  webpage_url: string | null;
  url: string | null;
}
export interface Format {
  format_id: string;
  ext: string;
  resolution: string;
  height: number | null;
  fps: number | null;
  filesize: number | null;
  filesize_approx: number | null;
  vcodec: string;
  acodec: string;
  format_note: string;
}
export interface Preview extends MediaSummary {
  description: string;
  extractor: string;
  playlist_count: number | null;
  is_playlist: boolean;
  entries: MediaSummary[];
  formats: Format[];
  subtitles: string[];
  automatic_captions: string[];
}
export interface SystemInfo {
  version: string;
  download_dir: string;
  disk_free: number;
  disk_total: number;
  concurrency: number;
  ffmpeg: boolean;
  node: boolean;
  update_on_start: boolean;
}
export interface LibraryFile {
  path: string;
  name: string;
  size: number;
  modified: number;
  ext: string;
}
export interface OptionEntry {
  flags: string[];
  help: string;
  metavar: string | null;
  takes_value: boolean;
  managed: boolean;
}
export interface OptionGroup {
  name: string;
  options: OptionEntry[];
}
export interface Preset {
  name: string;
  options: Partial<Options>;
}
export const active = (status: Status) =>
  ["queued", "downloading", "processing"].includes(status);
