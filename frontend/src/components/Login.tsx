import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { api, errorMessage } from "../api";
import { Brand } from "./UI";

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/login", "POST", { password });
      onLogin();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-view">
      <div className="login-art">
        <Brand />
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <div className="orbit orbit-three" />
        <div className="login-message">
          <span className="eyebrow">YOUR MEDIA. YOUR SPACE.</span>
          <h1>
            Keep what
            <br />
            moves you<span>.</span>
          </h1>
          <p>
            A little home for your favorite things.
            <br />
            Saved on your server. Ready when you are.
          </p>
        </div>
        <span className="login-art-footer">
          Powered by yt-dlp. Made for your home server.
        </span>
      </div>
      <div className="login-form-wrap">
        <form onSubmit={submit} className="login-form">
          <div className="login-lock">
            <LockKeyhole />
          </div>
          <span className="eyebrow">WELCOME HOME</span>
          <h2>Your private media space.</h2>
          <p>Enter your server password to get started.</p>
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="Your server password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Unlocking…" : "Unlock Yoink"}
            <ArrowRight />
          </button>
          <div className="login-note">
            <LockKeyhole /> Password managed in your server’s .env file
          </div>
        </form>
      </div>
    </main>
  );
}
