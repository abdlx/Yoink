export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== "/login")
      window.dispatchEvent(new Event("session-expired"));
    const detail = data.detail;
    const message = Array.isArray(detail)
      ? detail
          .map(
            (d: { loc: string[]; msg: string }) =>
              `${d.loc.slice(1).join(".")}: ${d.msg}`,
          )
          .join("\n")
      : detail;
    throw new ApiError(
      message || `Request failed (${response.status})`,
      response.status,
    );
  }
  return data as T;
}
export const fileUrl = (path: string, download = false) =>
  `/api/files/${path.split("/").map(encodeURIComponent).join("/")}${download ? "?download=true" : ""}`;
export function bytes(value: number): string {
  if (!value || value < 0) return "0 B";
  const i = Math.min(4, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${["B", "KB", "MB", "GB", "TB"][i]}`;
}
export function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
