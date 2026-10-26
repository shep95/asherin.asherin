// asherin.data — a live source is a public csv or json url this browser can
// fetch itself. there is no relay: the server behind the url must allow
// cross-origin reads, and the pull happens only while the room is open.

import { MAX_UPLOAD_BYTES, extensionOf, parseDataFile } from "./parse";
import type { ParsedFile } from "./types";

export const PULL_TIMEOUT_MS = 30_000;

export interface LivePull { parsed: ParsedFile; fileName: string; mime: string; byteSize: number; pulledAt: string }

export function checkLiveUrl(raw: string): { url: string } | { error: string } {
  const s = raw.trim();
  if (!s) return { error: "enter a url first" };
  let u: URL;
  try { u = new URL(s); } catch { return { error: "that is not a valid url" }; }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) {
    return { error: "the url must start with https:// (http:// is allowed only for localhost)" };
  }
  if (u.username || u.password) return { error: "credentials in the url are not sent; use a public url" };
  return { url: u.toString() };
}

/** picks a file name the parser can route on from the url and content type. */
export function nameForUrl(url: string, contentType: string): string {
  const u = new URL(url);
  const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
  const ext = extensionOf(last);
  if ([".csv", ".tsv", ".json", ".ndjson", ".txt"].includes(ext)) return last;
  const ct = contentType.toLowerCase();
  const base = (last || u.hostname).replace(/[^\w.-]+/g, "_").slice(0, 60) || "live";
  if (ct.includes("json")) return `${base}.json`;
  if (ct.includes("tab-separated")) return `${base}.tsv`;
  if (ct.includes("csv") || u.searchParams.get("output") === "csv") return `${base}.csv`;
  return `${base}.txt`;
}

export async function pullLiveUrl(rawUrl: string, signal?: AbortSignal): Promise<LivePull> {
  const checked = checkLiveUrl(rawUrl);
  if ("error" in checked) throw new Error(checked.error);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PULL_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  let res: Response;
  try {
    res = await fetch(checked.url, { signal: ctrl.signal, credentials: "omit", cache: "no-store" });
  } catch {
    if (signal?.aborted) throw new Error("the pull was cancelled");
    if (ctrl.signal.aborted) throw new Error(`the url did not answer within ${PULL_TIMEOUT_MS / 1000} seconds`);
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new Error(offline
      ? "this device is offline; the url will be pulled when the connection is back and you press pull again"
      : "the browser could not read that url — it must be public and allow cross-origin reads (cors), and the device must be online");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!res.ok) throw new Error(`the url answered ${res.status}${res.statusText ? ` ${res.statusText.toLowerCase()}` : ""}`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES) throw new Error(`the url serves ${(length / 1_048_576).toFixed(1)} mb and the limit is 100 mb`);
  const blob = await res.blob();
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error(`the url served ${(blob.size / 1_048_576).toFixed(1)} mb and the limit is 100 mb`);
  const contentType = res.headers.get("content-type") ?? "";
  const fileName = nameForUrl(checked.url, contentType);
  const file = new File([blob], fileName, { type: contentType.split(";")[0] || "text/plain" });
  const parsed = await parseDataFile(file);
  if (parsed.kind !== "table") throw new Error("the url did not serve a table (csv, tsv or json records)");
  return { parsed, fileName, mime: file.type, byteSize: blob.size, pulledAt: new Date().toISOString() };
}
