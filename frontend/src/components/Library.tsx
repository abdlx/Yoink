import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  File,
  FolderOpen,
  Image,
  LoaderCircle,
  Music2,
  Play,
  RefreshCw,
  Search,
  Video,
} from "lucide-react";
import { api, bytes, errorMessage, fileUrl } from "../api";
import type { LibraryFile } from "../types";
import { Empty, Heading, Modal } from "./UI";

const videos = ["mp4", "webm", "mkv", "mov", "avi", "m4v", "ts"];
const audios = ["mp3", "m4a", "opus", "flac", "wav", "ogg", "aac"];
const images = ["png", "jpg", "jpeg", "webp", "gif", "avif"];
export function Player({ path, close }: { path: string; close: () => void }) {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const [failed, setFailed] = useState(false);
  return (
    <Modal title={path.split("/").pop() || "Saved media"} close={close}>
      <div className="player-body">
        {audios.includes(ext) ? (
          <div className="audio-player">
            <div className="audio-art">
              <Music2 />
            </div>
            <audio
              src={fileUrl(path)}
              controls
              preload="metadata"
              onError={() => setFailed(true)}
            />
          </div>
        ) : videos.includes(ext) ? (
          <video
            src={fileUrl(path)}
            controls
            preload="metadata"
            onError={() => setFailed(true)}
          />
        ) : images.includes(ext) ? (
          <img src={fileUrl(path)} alt={path} onError={() => setFailed(true)} />
        ) : (
          <Empty icon={File} title="This file is ready to keep.">
            Download it to open in your preferred app.
          </Empty>
        )}
        {failed && (
          <p className="field-error">
            This format or codec isn’t supported by your browser. Download the
            file to play it locally.
          </p>
        )}
        <div className="player-footer">
          <span className="muted">{path}</span>
          <a className="button primary" href={fileUrl(path, true)}>
            <ArrowDownToLine />
            Download file
          </a>
        </div>
        <p className="muted detail-note">
          Browser playback depends on the media format and codecs. Original
          files stay on your server.
        </p>
      </div>
    </Modal>
  );
}
export function Library({ play }: { play: (path: string) => void }) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["library"],
    queryFn: () => api<LibraryFile[]>("/library"),
    staleTime: 10_000,
  });
  const files = (query.data || []).filter((f) =>
    f.path.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Heading
        eyebrow="YOURS TO KEEP"
        title="A home for your favorites"
        description="Your server’s downloads, all in one place."
      >
        <button
          className="button secondary"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw className={query.isFetching ? "spin" : ""} />
          Refresh
        </button>
      </Heading>
      <div className="library-toolbar">
        <label className="search-field">
          <Search />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a file…"
            aria-label="Search files"
          />
        </label>
        <span className="muted">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      </div>
      {query.isPending ? (
        <div className="loading-state">
          <LoaderCircle className="spin" />
          Opening your library…
        </div>
      ) : query.error ? (
        <p className="field-error" role="alert">
          {errorMessage(query.error)}
        </p>
      ) : files.length === 0 ? (
        <div className="panel">
          <Empty
            icon={FolderOpen}
            title={search ? "No files found." : "A collection in the making."}
          >
            {search
              ? "Try a different search."
              : "Your downloaded media and sidecar files will appear here."}
          </Empty>
        </div>
      ) : (
        <div className="library-grid">
          {files.map((file) => {
            const Icon = videos.includes(file.ext)
              ? Video
              : audios.includes(file.ext)
                ? Music2
                : images.includes(file.ext)
                  ? Image
                  : File;
            return (
              <article key={file.path} className="panel library-card">
                <button
                  className={`library-art ${audios.includes(file.ext) ? "is-audio" : ""}`}
                  onClick={() => play(file.path)}
                  aria-label={`Open ${file.name}`}
                >
                  {images.includes(file.ext) ? (
                    <img src={fileUrl(file.path)} alt="" loading="lazy" />
                  ) : (
                    <>
                      <span className="library-art-pattern" />
                      <Icon />
                    </>
                  )}
                  <span className="file-type">{file.ext || "FILE"}</span>
                  <span className="library-play">
                    <Play />
                  </span>
                </button>
                <div className="library-card-info">
                  <button
                    className="file-name"
                    onClick={() => play(file.path)}
                    title={file.name}
                  >
                    {file.name}
                  </button>
                  <div className="library-meta">
                    <span>{bytes(file.size)}</span>
                    <span>
                      {new Date(file.modified * 1000).toLocaleDateString()}
                    </span>
                    <a
                      className="icon-button"
                      href={fileUrl(file.path, true)}
                      title="Download file"
                      aria-label={`Download ${file.name}`}
                    >
                      <ArrowDownToLine />
                    </a>
                  </div>
                  {file.path.includes("/") && (
                    <span className="file-folder">
                      {file.path.slice(0, file.path.lastIndexOf("/"))}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
