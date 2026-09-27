// Pain Point #6/#12: Auto-save every 30s with crash recovery.
// Stores per-session snapshots in localStorage; survives reload/crash.

const KEY = (sid: string) => `ide_autosave_v1::${sid}`;
const META = (sid: string) => `ide_autosave_meta_v1::${sid}`;

export interface AutoSaveSnapshot {
  files: Array<{ id: string; path: string; content: string; language?: string }>;
  activeFileId: string | null;
  savedAt: number;
}

export function writeAutoSave(sessionId: string, snap: AutoSaveSnapshot) {
  try {
    localStorage.setItem(KEY(sessionId), JSON.stringify(snap));
    localStorage.setItem(META(sessionId), String(snap.savedAt));
  } catch (e) {
    // Surface quota errors so the UI can warn the user before they lose work.
    if (typeof window !== "undefined") {
      const isQuota = e instanceof DOMException &&
        (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED");
      window.dispatchEvent(new CustomEvent("ide:autosave-error", {
        detail: { sessionId, quotaExceeded: isQuota, error: String(e) },
      }));
    }
  }
}

export function readAutoSave(sessionId: string): AutoSaveSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as AutoSaveSnapshot;
  } catch { return null; }
}

export function clearAutoSave(sessionId: string) {
  try {
    localStorage.removeItem(KEY(sessionId));
    localStorage.removeItem(META(sessionId));
  } catch { /* */ }
}

export function getAutoSaveAge(sessionId: string): number | null {
  const t = localStorage.getItem(META(sessionId));
  return t ? Date.now() - parseInt(t, 10) : null;
}

/** Start a 30-second autosave loop; returns disposer. */
export function startAutoSaveLoop(
  sessionId: string,
  getSnap: () => AutoSaveSnapshot,
  intervalMs = 30_000,
): () => void {
  const tick = () => {
    const snap = getSnap();
    if (!snap || !snap.files?.length) return;
    writeAutoSave(sessionId, { ...snap, savedAt: Date.now() });
  };
  const id = window.setInterval(tick, intervalMs);
  // Save on tab close too
  const onUnload = () => tick();
  window.addEventListener("beforeunload", onUnload);
  return () => {
    clearInterval(id);
    window.removeEventListener("beforeunload", onUnload);
  };
}
