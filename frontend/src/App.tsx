import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Check,
  Grid2X2,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Server,
  SlidersHorizontal,
  X,
  History,
  CircleAlert,
} from "lucide-react";
import { api, bytes, errorMessage } from "./api";
import {
  active,
  defaults,
  type Job,
  type OptionEntry,
  type Options,
  type SystemInfo,
} from "./types";
import { Brand, Heading } from "./components/UI";
import { Login } from "./components/Login";
import { Composer } from "./components/Composer";
import { Advanced } from "./components/Advanced";
import { Queue } from "./components/Queue";
import { Library, Player } from "./components/Library";
import { Reference } from "./components/Reference";
import { Settings } from "./components/Settings";

const views = {
  downloads: "Downloads",
  library: "Library",
  history: "History",
  reference: "Option reference",
  settings: "Server settings",
};
type View = keyof typeof views;
const viewIcons = {
  downloads: ArrowDownToLine,
  library: Grid2X2,
  history: History,
  reference: BookOpen,
  settings: SlidersHorizontal,
};
const readView = (): View => {
  const key = location.hash.slice(1);
  return key in views ? (key as View) : "downloads";
};
function Dashboard({ logout }: { logout: () => void }) {
  const [view, setView] = useState<View>(readView);
  const [options, setOptions] = useState<Options>(defaults);
  const [advanced, setAdvanced] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api<Job[]>("/jobs"),
    refetchInterval: 2000,
    retry: 1,
  });
  const system = useQuery({
    queryKey: ["system"],
    queryFn: () => api<SystemInfo>("/system"),
    refetchInterval: 30_000,
  });
  useEffect(() => {
    const change = () => setView(readView());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(timeout);
    }
  }, [toast]);
  const navigate = (v: View) => {
    location.hash = v;
    setView(v);
  };
  function addOption(option: OptionEntry) {
    const flag =
      option.flags.find((f) => f.startsWith("--")) || option.flags[0];
    setOptions((o) => ({
      ...o,
      extra_args: `${o.extra_args}${o.extra_args ? "\n" : ""}${flag}${option.takes_value ? ' ""' : ""}`,
    }));
    navigate("downloads");
    setCustomOpen(true);
    setAdvanced(true);
  }
  const count = (jobs.data || []).filter((j) => active(j.status)).length;
  const completed = (jobs.data || []).filter(
    (j) => j.status === "completed",
  ).length;
  const failed = (jobs.data || []).filter((j) => j.status === "failed").length;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(Object.entries(views) as [View, string][]).map(
            ([key, label], index) => {
              const Icon = viewIcons[key];
              return (
                <a
                  key={key}
                  className={`nav-item ${view === key ? "active" : ""} ${index === 3 ? "nav-section-start" : ""}`}
                  href={`#${key}`}
                  aria-current={view === key ? "page" : undefined}
                >
                  <Icon />
                  <span>{label}</span>
                  {key === "downloads" && (
                    <span className="nav-count">{count}</span>
                  )}
                </a>
              );
            },
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="server-card">
            <div className="server-card-title">
              <span className={`status-dot ${jobs.error ? "offline" : ""}`} />
              Home server
              <span className="server-state">
                {jobs.error ? "OFFLINE" : "ONLINE"}
              </span>
            </div>
            <progress
              value={
                system.data ? system.data.disk_total - system.data.disk_free : 0
              }
              max={system.data?.disk_total || 1}
              aria-label="Server storage used"
            />
            <div className="storage-label">
              {system.data
                ? `${bytes(system.data.disk_free)} free of ${bytes(system.data.disk_total)}`
                : "Checking storage…"}
            </div>
          </div>
          <div className="sidebar-footer">
            <span>
              <LockKeyhole />
              Private workspace
            </span>
            <button
              className="icon-button"
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="breadcrumb">
            Workspace<span>/</span>
            <strong>{views[view]}</strong>
          </div>
          <div className="topbar-right">
            <span className="version-badge">
              yt-dlp {system.data?.version || ""}
            </span>
            <span className="avatar" title="Your private workspace">
              <img
                src="/static/branding/yoink-mark.svg"
                alt="Yoink"
                width="20"
                height="20"
              />
            </span>
          </div>
        </header>
        <main className="content" id="main-content">
          {jobs.error && (
            <div className="connection-error" role="alert">
              Can’t reach your server. Reconnecting…{" "}
              <span>{errorMessage(jobs.error)}</span>
            </div>
          )}
          <section hidden={view !== "downloads"}>
            <Heading
              eyebrow="YOUR PRIVATE DOWNLOADER"
              title="Save something good"
              description="Paste a link, choose your format, and leave the rest to your server."
            >
              <span className="quiet-badge">
                <span className="status-dot" />
                Saving to your server
              </span>
            </Heading>
            <div className="download-overview">
              <div>
                <span className="overview-icon">
                  <ArrowDownToLine />
                </span>
                <div>
                  <strong>{count}</strong>
                  <span>Active downloads</span>
                </div>
              </div>
              <button onClick={() => navigate("history")}>
                <span className="overview-icon completed">
                  <Check />
                </span>
                <div>
                  <strong>{completed}</strong>
                  <span>Completed</span>
                </div>
              </button>
              <button onClick={() => navigate("history")}>
                <span
                  className={`overview-icon ${failed ? "needs-attention" : ""}`}
                >
                  <CircleAlert />
                </span>
                <div>
                  <strong>{failed}</strong>
                  <span>Failed downloads</span>
                </div>
              </button>
              <button onClick={() => navigate("settings")}>
                <span className="overview-icon">
                  <Server />
                </span>
                <div>
                  <strong>
                    {system.data ? bytes(system.data.disk_free) : "—"}
                  </strong>
                  <span>Server space free</span>
                </div>
              </button>
            </div>
            <Composer
              options={options}
              setOptions={setOptions}
              openAdvanced={() => {
                setCustomOpen(false);
                setAdvanced(true);
              }}
              notify={setToast}
            />
            {view === "downloads" && (
              <Queue
                jobs={jobs.data || []}
                loading={jobs.isPending}
                notify={setToast}
                play={setPlaying}
                openHistory={() => navigate("history")}
              />
            )}
            <footer className="content-footer">
              <span>
                <Server />
                Files stay on your server.
              </span>
              <a
                href="https://github.com/yt-dlp/yt-dlp"
                target="_blank"
                rel="noopener noreferrer"
              >
                Built on yt-dlp
                <ArrowUpRight />
              </a>
            </footer>
          </section>
          {view === "library" && (
            <Library play={setPlaying} notify={setToast} />
          )}
          {view === "history" && (
            <>
              <Heading
                eyebrow="DOWNLOAD ACTIVITY"
                title="History"
                description="Find past downloads, retry failures, and keep your workspace tidy."
              />
              <Queue
                history
                jobs={jobs.data || []}
                loading={jobs.isPending}
                notify={setToast}
                play={setPlaying}
              />
            </>
          )}
          {view === "reference" && <Reference add={addOption} />}
          {view === "settings" && (
            <Settings
              system={system.data}
              browse={() => navigate("reference")}
              logout={logout}
            />
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {(["downloads", "library", "history", "settings"] as View[]).map(
          (key) => {
            const Icon = viewIcons[key];
            return (
              <a
                key={key}
                href={`#${key}`}
                className={
                  view === key || (key === "settings" && view === "reference")
                    ? "active"
                    : ""
                }
                aria-current={view === key ? "page" : undefined}
              >
                <span className="mobile-nav-icon">
                  <Icon />
                  {key === "downloads" && count > 0 && (
                    <span className="mobile-nav-count">{count}</span>
                  )}
                </span>
                <span>{key === "settings" ? "Settings" : views[key]}</span>
              </a>
            );
          },
        )}
      </nav>
      {advanced && (
        <Advanced
          options={options}
          apply={(value) => {
            setOptions(value);
            setAdvanced(false);
          }}
          close={() => setAdvanced(false)}
          browse={() => navigate("reference")}
          customOpen={customOpen}
        />
      )}
      {playing && <Player path={playing} close={() => setPlaying(null)} />}
      {toast && (
        <div className="toast" role="status">
          <Check />
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X />
          </button>
        </div>
      )}
    </div>
  );
}
export default function App() {
  const [session, setSession] = useState<"loading" | "in" | "out">("loading");
  const client = useQueryClient();
  useEffect(() => {
    let alive = true;
    api("/session")
      .then(() => {
        if (alive) setSession("in");
      })
      .catch(() => {
        if (alive) setSession("out");
      });
    return () => {
      alive = false;
    };
  }, []);
  const expired = useCallback(() => {
    setSession("out");
    client.clear();
  }, [client]);
  useEffect(() => {
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, [expired]);
  async function logout() {
    try {
      await api("/logout", "POST");
      expired();
    } catch (error) {
      window.alert(errorMessage(error));
    }
  }
  if (session === "loading")
    return (
      <div className="app-loading">
        <Brand />
        <LoaderCircle className="spin" />
        <span>Opening your space…</span>
      </div>
    );
  return session === "in" ? (
    <Dashboard logout={logout} />
  ) : (
    <Login onLogin={() => setSession("in")} />
  );
}
