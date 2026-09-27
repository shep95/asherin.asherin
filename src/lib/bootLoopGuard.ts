/**
 * Reload-storm breaker.
 *
 * Two places may reload the page on their own: chunk recovery after a deploy,
 * and the lazy-route retry. Each has its own guard, but guards that live in
 * storage can fail (private mode, quota, a blocked origin) and a failing guard
 * must fail closed. This records boot times for the tab; when a tab has booted
 * more than a few times inside a minute, automatic reloads are switched off
 * for the rest of the session and the error surfaces instead.
 */
const KEY = "asherin_boot_times";
const WINDOW_MS = 60_000;
const LIMIT = 3;

let storm = false;

export function bootLoopGuard(): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const times = (JSON.parse(sessionStorage.getItem(KEY) || "[]") as number[]).filter((t) => now - t < WINDOW_MS);
    times.push(now);
    sessionStorage.setItem(KEY, JSON.stringify(times.slice(-10)));
    storm = times.length > LIMIT;
  } catch {
    // No storage means no way to prove we are not looping: fail closed.
    storm = true;
  }
}

/** True when the page must not reload itself again this session. */
export function autoReloadBlocked(): boolean {
  return storm;
}

const STALE_KEY = "asherin_stale_reload_for";

/**
 * One reload per served build, shared by every recovery path. Returns true
 * when the caller may reload now; false when this build already had its
 * reload, when reloads are switched off, or when there is no storage to
 * remember the claim in (no memory means no proof, so no reload).
 */
export function claimStaleReload(servedToken: string): boolean {
  if (storm) return false;
  try {
    if (sessionStorage.getItem(STALE_KEY) === servedToken) return false;
    sessionStorage.setItem(STALE_KEY, servedToken);
    return true;
  } catch {
    return false;
  }
}
