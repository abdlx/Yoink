import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  Check,
  CircleAlert,
  Clock3,
  ListVideo,
  LoaderCircle,
  Play,
  RefreshCw,
  Terminal,
  Trash2,
  X,
  Search,
} from "lucide-react";
import { active, type Job } from "../types";
import { api, bytes, duration, errorMessage, fileUrl } from "../api";
import { Empty, Modal } from "./UI";
import { MediaImage } from "./Composer";

const labels = {
  queued: "Queued",
  downloading: "Downloading",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};
const availableFiles = (job: Job) =>
  job.files.filter((path) => !job.trashed_files?.includes(path));
export function Queue({
  jobs,
  loading,
  notify,
  play,
  history = false,
  openHistory,
}: {
  jobs: Job[];
  loading: boolean;
  notify: (message: string) => void;
  play: (path: string) => void;
  history?: boolean;
  openHistory?: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const [detail, setDetail] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<string[] | null>(null);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api(
        `/jobs/${id}${action === "remove" ? "" : `/${action}`}`,
        action === "remove" ? "DELETE" : "POST",
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e) => notify(errorMessage(e)),
  });
  const selected = jobs.find((j) => j.id === detail);
  const bulk = useMutation({
    mutationFn: async ({
      ids,
      action,
    }: {
      ids: string[];
      action: "remove" | "retry";
    }) => {
      const results: PromiseSettledResult<unknown>[] = [];
      for (let i = 0; i < ids.length; i += 10) {
        results.push(
          ...(await Promise.allSettled(
            ids
              .slice(i, i + 10)
              .map((id) =>
                api(
                  `/jobs/${id}${action === "retry" ? "/retry" : ""}`,
                  action === "retry" ? "POST" : "DELETE",
                ),
              ),
          )),
        );
      }
      return { results, ids, action };
    },
    onSuccess: ({ results, ids, action }) => {
      const failed = ids.filter((_, i) => results[i].status === "rejected");
      const error = results.find((r) => r.status === "rejected");
      setPicked(failed);
      setConfirm(null);
      notify(
        `${ids.length - failed.length} ${action === "retry" ? "queued for retry" : "removed from history"}.${error?.status === "rejected" ? ` ${errorMessage(error.reason)}` : ""}`,
      );
      client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  const matching = jobs.filter(
    (j) =>
      (!history || !active(j.status)) &&
      (filter === "all" ||
        (filter === "active" ? active(j.status) : j.status === filter)) &&
      `${j.title} ${j.url}`.toLowerCase().includes(search.toLowerCase()) &&
      (period === "all" ||
        j.created >= Date.now() / 1000 - Number(period) * 86400),
  );
  const [limit, setLimit] = useState(50);
  const shown = history
    ? matching.slice(0, limit)
    : [
        ...matching.filter((j) => active(j.status)),
        ...matching.filter((j) => !active(j.status)).slice(0, 5),
      ];
  const chosen = jobs.filter((j) => picked.includes(j.id) && !active(j.status));
  const retriable = chosen.filter((j) =>
    ["failed", "cancelled"].includes(j.status),
  );
  const running = jobs.filter((j) => active(j.status)).length;
  return (
    <>
      <div className="section-heading queue-heading">
        <div>
          <h2>
            {history ? "Past downloads" : "Download queue"}{" "}
            <span className="count-label">
              {history ? jobs.filter((j) => !active(j.status)).length : running}
            </span>
          </h2>
          <p>
            {running
              ? `${running} ${running === 1 ? "download is" : "downloads are"} on the way.`
              : history
                ? "Search completed, failed, and cancelled downloads."
                : "No active downloads. Your latest results are below."}
          </p>
        </div>
        <div className="segmented" aria-label="Filter queue">
          {(history
            ? ["all", "completed", "failed", "cancelled"]
            : ["all", "active", "completed"]
          ).map((f) => (
            <button
              key={f}
              className={filter === f ? "selected" : ""}
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f);
                setPicked([]);
                setLimit(50);
              }}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {history && (
        <>
          <div className="library-toolbar history-toolbar">
            <label className="search-field">
              <Search />
              <input
                type="search"
                aria-label="Search history"
                placeholder="Search titles or source URLs…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPicked([]);
                  setLimit(50);
                }}
              />
            </label>
            <select
              aria-label="History period"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setPicked([]);
                setLimit(50);
              }}
            >
              <option value="all">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
            </select>
          </div>
          <div className="selection-toolbar">
            <label>
              <input
                type="checkbox"
                aria-label="Select visible history"
                checked={
                  shown.length > 0 && shown.every((j) => picked.includes(j.id))
                }
                onChange={(e) =>
                  setPicked(e.target.checked ? shown.map((j) => j.id) : [])
                }
                disabled={!shown.length || bulk.isPending}
              />
              Select visible
            </label>
            <span className="muted">
              {matching.length} results
              {chosen.length ? ` · ${chosen.length} selected` : ""}
            </span>
            {chosen.length > 0 && (
              <div className="selection-actions">
                {retriable.length > 0 && (
                  <button
                    className="button secondary"
                    disabled={bulk.isPending}
                    onClick={() =>
                      bulk.mutate({
                        ids: retriable.map((j) => j.id),
                        action: "retry",
                      })
                    }
                  >
                    <RefreshCw />
                    Retry {retriable.length}
                  </button>
                )}
                <button
                  className="button secondary"
                  disabled={bulk.isPending}
                  onClick={() => setConfirm(chosen.map((j) => j.id))}
                >
                  <Trash2 />
                  Remove history
                </button>
                <button
                  className="icon-button"
                  aria-label="Clear history selection"
                  onClick={() => setPicked([])}
                >
                  <X />
                </button>
              </div>
            )}
          </div>
        </>
      )}
      <div className="queue-list">
        {loading ? (
          <div className="loading-state">
            <LoaderCircle className="spin" />
            Loading your queue…
          </div>
        ) : shown.length === 0 ? (
          <Empty
            icon={ArrowDownToLine}
            title={
              history
                ? "No matching downloads"
                : filter === "all"
                  ? "A little space for something great."
                  : filter === "active"
                    ? "All caught up."
                    : "Your collection starts here."
            }
          >
            {history
              ? "Try another search or filter. New downloads start from the Downloads tab."
              : filter === "all"
                ? "Add your first link above. We’ll take it from there."
                : filter === "active"
                  ? "There are no active downloads right now."
                  : "Completed downloads will appear here."}
          </Empty>
        ) : (
          shown.map((job) => (
            <article className={`queue-item status-${job.status}`} key={job.id}>
              {history && (
                <input
                  type="checkbox"
                  className="history-checkbox"
                  aria-label={`Select ${job.title}`}
                  checked={picked.includes(job.id)}
                  disabled={bulk.isPending}
                  onChange={() =>
                    setPicked((s) =>
                      s.includes(job.id)
                        ? s.filter((id) => id !== job.id)
                        : [...s, job.id],
                    )
                  }
                />
              )}
              <button
                className="queue-thumbnail"
                onClick={() => setDetail(job.id)}
                aria-label={`Details for ${job.title}`}
              >
                <MediaImage src={job.thumbnail} title="" />
                <span className="thumbnail-overlay">
                  {job.status === "completed" ? (
                    <Check />
                  ) : job.status === "failed" ? (
                    <CircleAlert />
                  ) : (
                    <Play />
                  )}
                </span>
              </button>
              <div className="queue-info">
                <div className="queue-item-top">
                  <button
                    className="queue-title"
                    onClick={() => setDetail(job.id)}
                  >
                    {job.title}
                  </button>
                  <span className={`status-pill ${job.status}`}>
                    {["downloading", "processing"].includes(job.status) && (
                      <LoaderCircle className="spin" />
                    )}
                    {job.status === "completed" && <Check />}
                    {labels[job.status]}
                  </span>
                </div>
                {job.status === "downloading" || job.status === "processing" ? (
                  <>
                    <progress
                      className={
                        job.status === "processing" ? "processing-progress" : ""
                      }
                      value={job.progress}
                      max="100"
                      aria-label="Download progress"
                    />
                    <div className="queue-meta">
                      <span>
                        {job.status === "processing"
                          ? "Finishing your media…"
                          : `${bytes(job.downloaded)}${job.total ? ` / ${bytes(job.total)}` : ""}`}
                      </span>
                      <span>
                        {job.item && `Item ${job.item} · `}
                        {job.speed > 0 && `${bytes(job.speed)}/s · `}
                        {job.eta != null
                          ? `${duration(job.eta)} remaining`
                          : `${Math.round(job.progress)}%`}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="queue-meta">
                    <span
                      className={job.error ? "error-text truncate" : "truncate"}
                    >
                      {job.error ||
                        (job.status === "completed"
                          ? job.files.length
                            ? `${availableFiles(job).length} in library${job.trashed_files?.length ? ` · ${job.trashed_files.length} in trash` : ""}`
                            : "No saved files linked to this download"
                          : job.status === "queued"
                            ? "Waiting for an available slot"
                            : "Download stopped")}
                    </span>
                    <span>
                      {history
                        ? new Date(job.created * 1000).toLocaleDateString()
                        : new Date(job.created * 1000).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                    </span>
                  </div>
                )}
              </div>
              <div className="queue-actions">
                <button
                  className="icon-button"
                  onClick={() => setDetail(job.id)}
                  title="View log"
                  aria-label={`View log for ${job.title}`}
                >
                  <Terminal />
                </button>
                {active(job.status) ? (
                  <button
                    className="icon-button"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({ id: job.id, action: "cancel" })
                    }
                    title="Cancel download"
                    aria-label={`Cancel ${job.title}`}
                  >
                    <X />
                  </button>
                ) : (
                  <>
                    {job.status === "completed" &&
                      availableFiles(job).length > 0 && (
                        <button
                          className="icon-button"
                          onClick={() => play(availableFiles(job)[0])}
                          title="Open saved media"
                          aria-label={`Open ${job.title}`}
                        >
                          <Play />
                        </button>
                      )}
                    <button
                      className="icon-button"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({ id: job.id, action: "retry" })
                      }
                      title="Retry download"
                      aria-label={`Retry ${job.title}`}
                    >
                      <RefreshCw />
                    </button>
                    <button
                      className="icon-button"
                      disabled={mutation.isPending}
                      onClick={() => setConfirm([job.id])}
                      title="Remove from history (keep files)"
                      aria-label={`Remove ${job.title} from history`}
                    >
                      <Trash2 />
                    </button>
                  </>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      {history && matching.length > limit && (
        <div className="load-more">
          <span className="muted">
            Showing {shown.length} of {matching.length}
          </span>
          <button
            className="button secondary"
            onClick={() => setLimit((n) => n + 50)}
          >
            Show more downloads
          </button>
        </div>
      )}
      {!history && jobs.some((j) => !active(j.status)) && (
        <button
          className="text-button queue-history-link"
          onClick={openHistory}
        >
          View all download history <ArrowDownToLine />
        </button>
      )}
      {confirm && (
        <Modal
          title="Remove from history?"
          close={() => {
            if (!bulk.isPending) setConfirm(null);
          }}
        >
          <div className="management-form">
            <p>
              Remove {confirm.length}{" "}
              {confirm.length === 1 ? "download" : "downloads"} from history?
              Saved files stay in your library.
            </p>
            <div className="dialog-actions">
              <button
                className="button secondary"
                disabled={bulk.isPending}
                onClick={() => setConfirm(null)}
              >
                Keep history
              </button>
              <button
                className="button danger"
                disabled={bulk.isPending}
                onClick={() => bulk.mutate({ ids: confirm, action: "remove" })}
              >
                Remove history
              </button>
            </div>
          </div>
        </Modal>
      )}
      {selected && (
        <Modal title="Download details" close={() => setDetail(null)}>
          <div className="job-detail">
            <div className="job-detail-title">
              <ListVideo />
              <h3>{selected.title}</h3>
              <span className={`status-pill ${selected.status}`}>
                {labels[selected.status]}
              </span>
            </div>
            <a
              href={selected.url}
              target="_blank"
              rel="noopener noreferrer"
              className="source-link"
            >
              {selected.url}
            </a>
            <div className="detail-meta">
              <span>
                <Clock3 />
                {new Date(selected.created * 1000).toLocaleString()}
              </span>
              <span>
                {Math.round(selected.progress)}% · {bytes(selected.downloaded)}
              </span>
            </div>
            {selected.error && <p className="field-error">{selected.error}</p>}
            {selected.files.length > 0 && (
              <div className="saved-files">
                <span className="eyebrow">SAVED FILES</span>
                {selected.files.map((path) =>
                  selected.trashed_files?.includes(path) ? (
                    <span className="trashed-file" key={path}>
                      <Trash2 />
                      {path}
                      <strong>In trash</strong>
                    </span>
                  ) : (
                    <a key={path} href={fileUrl(path, true)}>
                      <ArrowDownToLine />
                      {path}
                    </a>
                  ),
                )}
              </div>
            )}
            <h4>Live yt-dlp log</h4>
            <pre className="log-output">
              {selected.logs.join("\n") || "Waiting for yt-dlp output…"}
            </pre>
            <p className="muted detail-note">
              Removing a job from history keeps downloaded files on your server.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
