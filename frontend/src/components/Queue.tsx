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
export function Queue({
  jobs,
  loading,
  notify,
  play,
}: {
  jobs: Job[];
  loading: boolean;
  notify: (message: string) => void;
  play: (path: string) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [detail, setDetail] = useState<string | null>(null);
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
  const shown = jobs.filter((j) =>
    filter === "active"
      ? active(j.status)
      : filter === "completed"
        ? j.status === "completed"
        : true,
  );
  const running = jobs.filter((j) => active(j.status)).length;
  return (
    <>
      <div className="section-heading queue-heading">
        <div>
          <h2>
            Download queue <span className="count-label">{jobs.length}</span>
          </h2>
          <p>
            {running
              ? `${running} ${running === 1 ? "download is" : "downloads are"} on the way.`
              : "Good things are on their way."}
          </p>
        </div>
        <div className="segmented" aria-label="Filter queue">
          {["all", "active", "completed"].map((f) => (
            <button
              key={f}
              className={filter === f ? "selected" : ""}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
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
              filter === "all"
                ? "A little space for something great."
                : filter === "active"
                  ? "All caught up."
                  : "Your collection starts here."
            }
          >
            {filter === "all"
              ? "Add your first link above. We’ll take it from there."
              : filter === "active"
                ? "There are no active downloads right now."
                : "Completed downloads will appear here."}
          </Empty>
        ) : (
          shown.map((job) => (
            <article className={`queue-item status-${job.status}`} key={job.id}>
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
                            ? `${job.files.length} ${job.files.length === 1 ? "file" : "files"} saved to your server`
                            : "Finished · skipped or no new output"
                          : job.status === "queued"
                            ? "Waiting for an available slot"
                            : "Download stopped")}
                    </span>
                    <span>
                      {new Date(job.created * 1000).toLocaleTimeString([], {
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
                    {job.status === "completed" && job.files.length > 0 && (
                      <button
                        className="icon-button"
                        onClick={() => play(job.files[0])}
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
                      onClick={() =>
                        mutation.mutate({ id: job.id, action: "remove" })
                      }
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
                {selected.files.map((path) => (
                  <a key={path} href={fileUrl(path, true)}>
                    <ArrowDownToLine />
                    {path}
                  </a>
                ))}
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
