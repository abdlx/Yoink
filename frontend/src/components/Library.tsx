import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Grid2X2,
  List,
  Pencil,
  Trash2,
  Undo2,
  X,
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
type TrashFile = {
  id: string;
  path: string;
  size: number;
  modified: number;
  trashed: number;
};
type ChangeResult = {
  path: string;
  ok: boolean;
  result?: string;
  error?: string;
};
const mediaType = (ext: string) =>
  videos.includes(ext)
    ? "video"
    : audios.includes(ext)
      ? "audio"
      : images.includes(ext)
        ? "image"
        : "other";
const folderOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

function Artwork({
  file,
  play,
}: {
  file: LibraryFile;
  play: (path: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const kind = mediaType(file.ext);
  const src =
    kind === "image"
      ? fileUrl(file.path)
      : /^https?:\/\//i.test(file.thumbnail || "") && kind !== "other"
        ? file.thumbnail
        : "";
  const Icon =
    kind === "video"
      ? Video
      : kind === "audio"
        ? Music2
        : kind === "image"
          ? Image
          : File;
  useEffect(() => setFailed(false), [src]);
  return (
    <button
      className={`library-art ${kind === "audio" ? "is-audio" : ""}`}
      onClick={() => play(file.path)}
      aria-label={`Open ${file.name}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
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
  );
}

export function Library({
  play,
  notify,
}: {
  play: (path: string) => void;
  notify: (message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [folder, setFolder] = useState("all");
  const [sort, setSort] = useState("newest");
  const [layout, setLayout] = useState(() =>
    localStorage.getItem("yoink-library-layout") === "list" ? "list" : "grid",
  );
  const [trash, setTrash] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [limit, setLimit] = useState(48);
  const [rename, setRename] = useState<LibraryFile | null>(null);
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const [purge, setPurge] = useState<string[] | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const [issues, setIssues] = useState<ChangeResult[]>([]);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["library"],
    queryFn: () => api<LibraryFile[]>("/library"),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchOnMount: "always",
  });
  const trashQuery = useQuery({
    queryKey: ["trash"],
    queryFn: () => api<TrashFile[]>("/library/trash"),
    enabled: trash,
  });
  const mutation = useMutation({
    mutationFn: async (body: {
      action: "trash" | "restore" | "rename" | "delete";
      paths: string[];
      name?: string;
    }) => {
      const results: ChangeResult[] = [];
      for (let i = 0; i < body.paths.length; i += 200) {
        const paths = body.paths.slice(i, i + 200);
        try {
          const response = await api<{ results: ChangeResult[] }>(
            "/library/manage",
            "POST",
            { ...body, paths },
          );
          results.push(...response.results);
        } catch (error) {
          results.push(
            ...paths.map((path) => ({
              path,
              ok: false,
              error: errorMessage(error),
            })),
          );
        }
      }
      return { results };
    },
    onSuccess: ({ results }, request) => {
      const failed = results.filter((r) => !r.ok);
      const count = results.length - failed.length;
      setIssues(failed);
      setSelected(failed.map((r) => r.path));
      if (count)
        notify(
          `${count} ${count === 1 ? "file" : "files"} ${request.action === "trash" ? "moved to trash" : request.action === "restore" ? "restored" : request.action === "delete" ? "permanently deleted" : "renamed"}.`,
        );
      if (!failed.length) setRename(null);
      setConfirm(null);
      setPurge(null);
      for (const key of ["library", "trash", "jobs", "system"])
        client.invalidateQueries({ queryKey: [key] });
    },
    onError: (e) => notify(errorMessage(e)),
  });
  useEffect(() => {
    setSelected([]);
    setLimit(48);
  }, [search, kind, folder, trash]);
  const all = query.data || [];
  const folders = [...new Set(all.map((f) => folderOf(f.path)))].sort();
  const files = all
    .filter(
      (f) =>
        f.path.toLowerCase().includes(search.toLowerCase()) &&
        (kind === "all" || mediaType(f.ext) === kind) &&
        (folder === "all" || folderOf(f.path) === folder),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "size"
          ? b.size - a.size
          : sort === "oldest"
            ? a.modified - b.modified
            : b.modified - a.modified,
    );
  const trashed = (trashQuery.data || []).filter((f) =>
    f.path.toLowerCase().includes(search.toLowerCase()),
  );
  const visible = files.slice(0, limit);
  const visibleIds = trash
    ? trashed.slice(0, limit).map((f) => f.id)
    : visible.map((f) => f.path);
  const toggle = (path: string) =>
    setSelected((s) =>
      s.includes(path) ? s.filter((p) => p !== path) : [...s, path],
    );
  const selectedVisible = selected.filter((p) => visibleIds.includes(p));
  const loading = trash ? trashQuery.isPending : query.isPending;
  const error = trash ? trashQuery.error : query.error;
  const shownCount = trash ? trashed.length : files.length;
  return (
    <>
      <Heading
        eyebrow="YOUR COLLECTION"
        title="Library"
        description="Browse, play, and organize the files on your server."
      >
        <button
          className="button secondary"
          onClick={() => (trash ? trashQuery.refetch() : query.refetch())}
          disabled={query.isFetching || trashQuery.isFetching}
        >
          <RefreshCw className={query.isFetching ? "spin" : ""} />
          Refresh
        </button>
      </Heading>
      <div className="collection-summary">
        <div>
          <strong>{all.length.toLocaleString()}</strong>
          <span>saved files</span>
        </div>
        <div>
          <strong>{bytes(all.reduce((n, f) => n + f.size, 0))}</strong>
          <span>in your library</span>
        </div>
        <div>
          <strong>
            {all.filter((f) => mediaType(f.ext) === "video").length}
          </strong>
          <span>videos</span>
        </div>
        <div>
          <strong>
            {all.filter((f) => mediaType(f.ext) === "audio").length}
          </strong>
          <span>audio files</span>
        </div>
      </div>
      <div className="collection-tabs" aria-label="Library location">
        <button
          className={!trash ? "selected" : ""}
          aria-pressed={!trash}
          onClick={() => {
            setTrash(false);
            setIssues([]);
          }}
        >
          <FolderOpen /> Files
        </button>
        {trash && !!trashQuery.data?.length && (
          <button
            className="empty-trash-button"
            disabled={mutation.isPending}
            onClick={() => {
              setPurge(trashQuery.data!.map((f) => f.id));
              setDeleteText("");
            }}
          >
            <Trash2 />
            Empty trash
          </button>
        )}
        <button
          className={trash ? "selected" : ""}
          aria-pressed={trash}
          onClick={() => {
            setTrash(true);
            setIssues([]);
          }}
        >
          <Trash2 /> Trash
        </button>
      </div>
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
        {!trash && (
          <>
            <select
              aria-label="Filter media type"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="all">All media</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="image">Images</option>
              <option value="other">Other files</option>
            </select>
            <select
              aria-label="Folder"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            >
              <option value="all">All folders</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f || "Downloads root"}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort files"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setLimit(48);
              }}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
              <option value="size">Largest first</option>
            </select>
            <div
              className="segmented layout-toggle"
              aria-label="Library layout"
            >
              {[
                { value: "grid", Icon: Grid2X2 },
                { value: "list", Icon: List },
              ].map(({ value, Icon }) => (
                <button
                  key={value}
                  aria-label={`${value === "grid" ? "Grid" : "List"} view`}
                  aria-pressed={layout === value}
                  className={layout === value ? "selected" : ""}
                  onClick={() => {
                    setLayout(value);
                    localStorage.setItem("yoink-library-layout", value);
                  }}
                >
                  <Icon />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="selection-toolbar">
        <label>
          <input
            type="checkbox"
            checked={
              visibleIds.length > 0 &&
              selectedVisible.length === visibleIds.length
            }
            onChange={(e) => setSelected(e.target.checked ? visibleIds : [])}
            disabled={!visibleIds.length || mutation.isPending}
          />{" "}
          Select visible
        </label>
        <span className="muted">
          {shownCount} {shownCount === 1 ? "file" : "files"}
          {selected.length ? ` · ${selected.length} selected` : ""}
        </span>
        {selected.length > 0 && (
          <div className="selection-actions">
            <button
              className="button secondary"
              disabled={mutation.isPending}
              onClick={() =>
                trash
                  ? mutation.mutate({ action: "restore", paths: selected })
                  : setConfirm(selected)
              }
            >
              {trash ? <Undo2 /> : <Trash2 />}
              {trash ? "Restore selected" : "Move to trash"}
            </button>
            {trash && (
              <button
                className="button secondary"
                disabled={mutation.isPending}
                onClick={() => {
                  setPurge(selected);
                  setDeleteText("");
                }}
              >
                Delete forever
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Clear selection"
              onClick={() => setSelected([])}
            >
              <X />
            </button>
          </div>
        )}
      </div>
      {trash && (
        <p className="management-note">
          Restore returns files to their original location. Empty trash
          permanently removes them and frees server storage.
        </p>
      )}
      {issues.length > 0 && (
        <div className="management-errors" role="alert">
          {issues.map((i) => (
            <p key={i.path}>
              <strong>{i.path.split("/").pop()}</strong>: {i.error}
            </p>
          ))}
          <button className="text-button" onClick={() => setIssues([])}>
            Dismiss
          </button>
        </div>
      )}
      {loading ? (
        <div className="loading-state">
          <LoaderCircle className="spin" />
          Opening your library…
        </div>
      ) : error ? (
        <p className="field-error" role="alert">
          {errorMessage(error)}
        </p>
      ) : shownCount === 0 ? (
        <div className="panel">
          <Empty
            icon={FolderOpen}
            title={
              search || kind !== "all" || folder !== "all"
                ? "No matching files"
                : trash
                  ? "Trash is empty"
                  : "Your library is ready"
            }
          >
            {search || kind !== "all" || folder !== "all" ? (
              <button
                className="text-button"
                onClick={() => {
                  setSearch("");
                  setKind("all");
                  setFolder("all");
                }}
              >
                Clear search and filters
              </button>
            ) : trash ? (
              "Files you move to trash can be restored here."
            ) : (
              "Your downloaded media and sidecar files will appear here."
            )}
          </Empty>
        </div>
      ) : trash ? (
        <div className="trash-list panel">
          {trashed.slice(0, limit).map((file) => (
            <article className="trash-row" key={file.id}>
              <input
                type="checkbox"
                aria-label={`Select ${file.path}`}
                checked={selected.includes(file.id)}
                onChange={() => toggle(file.id)}
                disabled={mutation.isPending}
              />
              <File />
              <div>
                <strong>{file.path.split("/").pop()}</strong>
                <span>
                  {folderOf(file.path) || "Downloads root"} · {bytes(file.size)}{" "}
                  · Trashed {new Date(file.trashed * 1000).toLocaleDateString()}
                </span>
              </div>
              <button
                className="button secondary"
                aria-label={`Restore ${file.path}`}
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ action: "restore", paths: [file.id] })
                }
              >
                <Undo2 /> Restore
              </button>
              <button
                className="icon-button"
                aria-label={`Permanently delete ${file.path}`}
                title="Permanently delete"
                disabled={mutation.isPending}
                onClick={() => {
                  setPurge([file.id]);
                  setDeleteText("");
                }}
              >
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div
          className={`library-grid ${layout === "list" ? "library-list" : ""}`}
        >
          {visible.map((file) => {
            return (
              <article
                key={file.path}
                className={`panel library-card ${selected.includes(file.path) ? "is-selected" : ""}`}
              >
                <label className="file-select">
                  <input
                    type="checkbox"
                    aria-label={`Select ${file.name}`}
                    checked={selected.includes(file.path)}
                    onChange={() => toggle(file.path)}
                    disabled={mutation.isPending}
                  />
                </label>
                <Artwork file={file} play={play} />
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
                  <span className="file-folder" title={folderOf(file.path)}>
                    <FolderOpen />
                    {folderOf(file.path) || "Downloads root"}
                  </span>
                  <div className="file-management">
                    <button
                      className="text-button"
                      aria-label={`Rename ${file.name}`}
                      disabled={mutation.isPending}
                      onClick={() => {
                        setRename(file);
                        setName(file.name);
                        setIssues([]);
                      }}
                    >
                      <Pencil />
                      Rename
                    </button>
                    <button
                      className="text-button"
                      aria-label={`Move ${file.name} to trash`}
                      disabled={mutation.isPending}
                      onClick={() => setConfirm([file.path])}
                    >
                      <Trash2 />
                      Trash
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {shownCount > limit && (
        <div className="load-more">
          <span className="muted">
            Showing {Math.min(limit, shownCount)} of {shownCount}
          </span>
          <button
            className="button secondary"
            onClick={() => setLimit((n) => n + 48)}
          >
            Show more files
          </button>
        </div>
      )}
      {rename && (
        <Modal
          title="Rename file"
          subtitle="Keep the extension so your media remains easy to open."
          close={() => {
            if (!mutation.isPending) setRename(null);
          }}
        >
          <form
            className="management-form"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({ action: "rename", paths: [rename.path], name });
            }}
          >
            <label htmlFor="new-filename">Filename</label>
            <input
              id="new-filename"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              maxLength={240}
              required
            />
            {issues.length > 0 && (
              <p className="field-error" role="alert">
                {issues[0].error}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                disabled={mutation.isPending}
                onClick={() => setRename(null)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={mutation.isPending}>
                Save name
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal
          title="Move to trash?"
          close={() => {
            if (!mutation.isPending) setConfirm(null);
          }}
        >
          <div className="management-form">
            <p>
              {confirm.length}{" "}
              {confirm.length === 1 ? "file will" : "files will"} leave your
              library. You can restore {confirm.length === 1 ? "it" : "them"}{" "}
              from Trash at any time.
            </p>
            <p className="muted">Trash still uses server storage.</p>
            <div className="dialog-actions">
              <button
                className="button secondary"
                disabled={mutation.isPending}
                onClick={() => setConfirm(null)}
              >
                Keep files
              </button>
              <button
                className="button danger"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ action: "trash", paths: confirm })
                }
              >
                <Trash2 />
                Move to trash
              </button>
            </div>
          </div>
        </Modal>
      )}
      {purge && (
        <Modal
          title="Permanently delete files?"
          close={() => {
            if (!mutation.isPending) setPurge(null);
          }}
        >
          <form
            className="management-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (deleteText === "DELETE")
                mutation.mutate({ action: "delete", paths: purge });
            }}
          >
            <p>
              This permanently deletes {purge.length}{" "}
              {purge.length === 1 ? "file" : "files"} from your server. You
              cannot restore {purge.length === 1 ? "it" : "them"} afterward.
            </p>
            <label htmlFor="delete-confirmation">Type DELETE to confirm</label>
            <input
              id="delete-confirmation"
              autoComplete="off"
              value={deleteText}
              onChange={(e) => setDeleteText(e.target.value)}
              autoFocus
            />
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                disabled={mutation.isPending}
                onClick={() => setPurge(null)}
              >
                Keep files
              </button>
              <button
                className="button danger"
                disabled={mutation.isPending || deleteText !== "DELETE"}
              >
                Delete forever
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
