// asherin.knowledge — reading a web page from this device.
//
// A browser can only read a page directly when that site allows cross-origin
// reads (cors). Most do not. When the direct read is refused the operator may
// choose, per page, to read it through the public r.jina.ai reader; the
// address of the page is then sent to that service and the room says so
// before it happens. Nothing else leaves the device.

export const WEB = {
  timeoutMs: 20_000,
  maxBytes: 4 * 1024 * 1024,
  reader: "https://r.jina.ai/",
} as const;

export type WebFailure = "bad-url" | "blocked" | "http" | "empty" | "too-large" | "timeout";

export interface WebReadResult {
  ok: boolean;
  text: string;
  title: string | null;
  method: "web page" | "web reader" | null;
  failure?: WebFailure;
  error?: string;
}

/** http(s) only, no credentials in the address. */
export function normaliseUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
  return u.toString();
}

const DROP_TAGS = ["script", "style", "noscript", "template", "svg", "canvas", "iframe", "nav", "footer", "aside", "form", "button", "header"];
const BLOCK_TAGS = new Set(["p", "div", "section", "article", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "tr", "td", "th", "table", "br", "hr", "dd", "dt", "dl", "figcaption", "main", "body"]);

/** html → readable prose: chrome removed, main/article preferred, blocks on their own lines. */
export function htmlToText(html: string): { text: string; title: string | null } {
  if (typeof DOMParser === "undefined") return { text: html.replace(/<[^>]+>/g, " "), title: null };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = doc.querySelector("title")?.textContent?.trim() || null;
  for (const tag of DROP_TAGS) for (const el of Array.from(doc.querySelectorAll(tag))) el.remove();
  const root = doc.querySelector("main, article, [role=main]") ?? doc.body;
  if (!root) return { text: "", title };
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) { parts.push(node.textContent ?? ""); return; }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const block = BLOCK_TAGS.has(tag);
    if (block) parts.push("\n");
    for (const child of Array.from(el.childNodes)) walk(child);
    if (block) parts.push("\n");
  };
  walk(root);
  const text = parts.join("").replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, title };
}

/** the reader answers with a small header block; keep the title and the body. */
export function readerToText(body: string): { text: string; title: string | null } {
  const m = body.match(/^Title:\s*(.+)$/m);
  const idx = body.indexOf("Markdown Content:");
  const text = (idx >= 0 ? body.slice(idx + "Markdown Content:".length) : body).trim();
  return { text, title: m ? m[1].trim() : null };
}

interface Fetched {
  ok: boolean;
  body: string;
  contentType: string;
  failure: WebFailure | null;
  error: string | null;
}

const refused = (failure: WebFailure, error: string): Fetched => ({ ok: false, body: "", contentType: "", failure, error });

async function fetchText(url: string, accept: string): Promise<Fetched> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), WEB.timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept }, redirect: "follow", credentials: "omit" });
    if (!res.ok) return refused("http", `the site answered ${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > WEB.maxBytes) return refused("too-large", "the page is larger than 4 mb");
    const body = await res.text();
    if (body.length > WEB.maxBytes) return refused("too-large", "the page is larger than 4 mb");
    return { ok: true, body, contentType: res.headers.get("content-type") ?? "", failure: null, error: null };
  } catch {
    if (ctl.signal.aborted) return refused("timeout", "the page did not answer within 20 seconds");
    return refused("blocked", "the site does not allow a browser to read it directly (no cors)");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a page. `viaReader: false` tries the site itself and stops there;
 * `viaReader: true` goes to r.jina.ai (the operator agreed to that first).
 */
export async function readWebPage(rawUrl: string, viaReader: boolean): Promise<WebReadResult> {
  const url = normaliseUrl(rawUrl);
  if (!url) return { ok: false, text: "", title: null, method: null, failure: "bad-url", error: "that is not an http(s) address" };
  if (!viaReader) {
    const r = await fetchText(url, "text/html,text/plain;q=0.9,*/*;q=0.5");
    if (!r.ok) return { ok: false, text: "", title: null, method: null, failure: r.failure ?? "blocked", error: r.error ?? "the page could not be read" };
    const isHtml = /html|xml/i.test(r.contentType) || /^\s*<(!doctype|html)/i.test(r.body);
    const { text, title } = isHtml ? htmlToText(r.body) : { text: r.body, title: null };
    if (!text.trim()) return { ok: false, text: "", title, method: "web page", failure: "empty", error: "the page held no readable text" };
    return { ok: true, text, title, method: "web page" };
  }
  const r = await fetchText(`${WEB.reader}${url}`, "text/plain");
  if (!r.ok) {
    const failure = r.failure ?? "blocked";
    return { ok: false, text: "", title: null, method: null, failure, error: failure === "blocked" ? "the reader could not be reached" : r.error ?? "the reader could not read that page" };
  }
  const { text, title } = readerToText(r.body);
  if (!text.trim()) return { ok: false, text: "", title, method: "web reader", failure: "empty", error: "the reader returned no text for that page" };
  return { ok: true, text, title, method: "web reader" };
}
