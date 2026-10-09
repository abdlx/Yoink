import {
  Activity,
  ArrowUpRight,
  Cpu,
  Folder,
  HardDrive,
  LoaderCircle,
} from "lucide-react";
import { bytes } from "../api";
import type { SystemInfo } from "../types";
import { Heading } from "./UI";

export function Settings({ system }: { system?: SystemInfo }) {
  return (
    <>
      <Heading
        eyebrow="BEHIND THE SCENES"
        title="Small setup. Big possibilities"
        description="Your server’s essentials. Configuration lives in your .env file."
      />
      {system ? (
        <div className="settings-grid">
          <div className="panel stat-card">
            <span className="stat-label">
              <Activity />
              YT-DLP VERSION
            </span>
            <strong>{system.version}</strong>
            <span className="stat-note">
              {system.update_on_start
                ? "Official release checked on startup"
                : "Automatic updates disabled"}
            </span>
          </div>
          <div className="panel stat-card">
            <span className="stat-label">
              <HardDrive />
              AVAILABLE STORAGE
            </span>
            <strong>{bytes(system.disk_free)}</strong>
            <span className="stat-note">
              of {bytes(system.disk_total)} total
            </span>
          </div>
          <div className="panel stat-card">
            <span className="stat-label">
              <Cpu />
              DOWNLOAD WORKERS
            </span>
            <strong>
              {system.concurrency}
              <small> simultaneous</small>
            </strong>
            <span className="stat-note">
              {system.ffmpeg ? "FFmpeg ready" : "FFmpeg not found"} ·{" "}
              {system.node
                ? "JavaScript runtime ready"
                : "JavaScript runtime missing"}
            </span>
          </div>
          <div className="panel stat-card">
            <span className="stat-label">
              <Folder />
              SERVER DESTINATION
            </span>
            <strong className="destination">{system.download_dir}</strong>
            <span className="stat-note">
              Mounted to your host download folder
            </span>
          </div>
        </div>
      ) : (
        <div className="loading-state">
          <LoaderCircle className="spin" />
          Checking your server…
        </div>
      )}
      <div className="panel settings-help">
        <h2>Make yourself at home.</h2>
        <p>
          Change settings in <code>.env</code>, then run{" "}
          <code>docker compose up -d</code> to apply them.
        </p>
        <dl>
          <dt>APP_PASSWORD</dt>
          <dd>
            Your login password. Minimum 12 characters. Changing it signs out
            existing sessions on restart.
          </dd>
          <dt>DOWNLOAD_PATH</dt>
          <dd>
            The folder on your server where files are saved. Default:
            ./downloads.
          </dd>
          <dt>MAX_CONCURRENT_DOWNLOADS</dt>
          <dd>Number of simultaneous jobs, from 1 to 8. Default: 2.</dd>
          <dt>UPDATE_YTDLP</dt>
          <dd>
            Fetch the latest stable yt-dlp from its official GitHub release on
            container startup. Default: true. If offline, the bundled version
            remains available.
          </dd>
          <dt>COOKIE_SECURE / APP_ORIGIN</dt>
          <dd>
            Set secure cookies when using HTTPS. Set the public origin if your
            reverse proxy changes the Host header.
          </dd>
        </dl>
        <a
          className="text-button"
          href="https://github.com/yt-dlp/yt-dlp#usage-and-options"
          target="_blank"
          rel="noopener noreferrer"
        >
          Official yt-dlp documentation
          <ArrowUpRight />
        </a>
      </div>
    </>
  );
}
