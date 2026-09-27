import React from "react";

/**
 * Wraps React.lazy with recovery for stale-bundle chunk errors.
 *
 * NARRATIVE CHECK. The old guard reloaded at most once per browser session and
 * never cleared its flag. So a tab that hit one stale chunk, reloaded, and then
 * hit a *second* deploy in the same session was locked out permanently — the
 * room rendered "Component failed to load" with no path back, even though the
 * chunk existed on the server. That is exactly the asherin.sentinel report.
 *
 * The corrected rule: a reload is justified when the document itself is stale,
 * and it is justified once per *distinct staleness*, not once per session.
 *   • the guard is keyed by a fingerprint of the entry script the server is
 *     currently serving, so every new deploy earns a fresh recovery attempt.
 *   • the flag is cleared the moment a load succeeds, so a recovered tab is
 *     not carrying a spent guard into the next deploy.
 *   • before reloading we confirm the served index really differs from what is
 *     running; if it matches, reloading would only loop, so we surface instead.
 */

const RELOAD_PREFIX = "__chunk_reload__";

/** Entry script the server is serving right now, as a cheap staleness token. */
async function servedEntryFingerprint(): Promise<string | null> {
  try {
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), 6000);
    const res = await fetch(`/?__stale=${Date.now()}`, { cache: "reload", signal: ac.signal });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    return srcs.length ? srcs.join("|") : null;
  } catch {
    return null;
  }
}

/** Entry scripts this document actually booted with. */
function runningEntryFingerprint(): string {
  return [...document.querySelectorAll("script[src]")]
    .map((s) => new URL((s as HTMLScriptElement).src, location.href).pathname)
    .join("|");
}

function isChunkError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err);
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Unable to preload CSS") ||
    msg.includes("ChunkLoadError")
  );
}

export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  name = "chunk"
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const reloadKey = `${RELOAD_PREFIX}${name}`;
    const MAX_ATTEMPTS = 3;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const mod = await factory();
        // Recovered (or never broken): retire the guard so a later deploy in
        // this same session still gets its own reload budget.
        try { sessionStorage.removeItem(reloadKey); } catch { /* storage may be blocked */ }
        return mod;
      } catch (err) {
        lastErr = err;
        if (!isChunkError(err)) throw err;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
        }
      }
    }

    if (typeof window === "undefined") throw lastErr;

    // Retries exhausted. Reload only when the document is genuinely stale, and
    // only once per distinct served build — otherwise we would loop forever on
    // a chunk that is failing for some other reason (offline, blocked, 5xx).
    const served = await servedEntryFingerprint();
    const running = runningEntryFingerprint();
    const stale = served !== null && served !== running;
    let spent = "";
    try { spent = sessionStorage.getItem(reloadKey) ?? ""; } catch { /* storage may be blocked */ }
    const token = served ?? "unknown";

    if (stale && spent !== token) {
      try { sessionStorage.setItem(reloadKey, token); } catch { /* storage may be blocked */ }
      window.location.reload();
      return new Promise(() => {}) as never;
    }

    throw lastErr;
  });
}
