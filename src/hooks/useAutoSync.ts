// ═══════════════════════════════════════════════════════════════════════════
// useAutoSync — the foreground half of continuous sync.
//
// A tab that only refreshes when the operator clicks a button is a snapshot,
// not a feed. This hook turns any async sweep into a self-maintaining one:
// it runs when the surface is first opened, keeps running on a cadence while
// the tab is actually visible, catches up the moment the tab is re-focused or
// the network returns, and stands down entirely when hidden so a backgrounded
// tab never burns API quota.
//
// The properties that keep it honest:
//   • Single-flight   — a run in progress swallows every trigger until it ends,
//                       so a focus event during a sweep cannot stack a second.
//   • Cross-tab claim — the last-run stamp lives in localStorage, so three open
//                       tabs perform one sweep between them, not three.
//   • Drift-free      — the next attempt is scheduled after the previous one
//                       settles, so a slow sweep never causes a pile-up.
//   • Backoff         — repeated failures widen the gap toward an hour instead
//                       of hammering a revoked credential every cadence.
//   • Unmount-safe    — timers and listeners are torn down together and no
//                       state is written after the surface is gone.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";

export interface AutoSyncOptions {
  /** Stable identifier for the surface — scopes the cross-tab claim stamp. */
  key: string;
  /** The sweep itself. Must reject on failure for backoff to engage. */
  run: () => Promise<unknown>;
  /** Nothing is scheduled until this is true (e.g. account connected). */
  enabled: boolean;
  /** Cadence while the tab is visible. */
  intervalMs?: number;
  /** A trigger inside this window of the last run is treated as already served. */
  minGapMs?: number;
}

export interface AutoSyncState {
  syncing: boolean;
  lastRunAt: number | null;
  lastError: string | null;
  /** Wall-clock time of the next scheduled attempt, or null when idle. */
  nextRunAt: number | null;
}

const BACKOFF_CAP_MS = 60 * 60_000;
const stampKey = (key: string) => `asherin_autosync_stamp:${key}`;

function readStamp(key: string): number {
  try {
    const raw = localStorage.getItem(stampKey(key));
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeStamp(key: string, at: number) {
  try {
    localStorage.setItem(stampKey(key), String(at));
  } catch {
    /* private mode / quota — degrade to per-tab cadence */
  }
}

export function useAutoSync(opts: AutoSyncOptions) {
  const { key, enabled, intervalMs = 15 * 60_000, minGapMs = 3 * 60_000 } = opts;

  const [state, setState] = useState<AutoSyncState>({
    syncing: false,
    lastRunAt: null,
    lastError: null,
    nextRunAt: null,
  });

  // The sweep closes over component state that changes every render; holding it
  // in a ref keeps the scheduler stable while always calling the newest body.
  const runRef = useRef(opts.run);
  runRef.current = opts.run;

  const alive = useRef(true);
  const inFlight = useRef(false);
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  /** Schedules the next attempt relative to *now*, so a slow sweep pushes the
   *  cadence out rather than firing again the instant it returns. */
  const schedule = useCallback(
    (delay: number) => {
      clearTimer();
      if (!alive.current || !enabled) return;
      const at = Date.now() + delay;
      setState((s) => ({ ...s, nextRunAt: at }));
      timer.current = setTimeout(() => {
        timer.current = null;
        void attempt(false);
      }, delay);
    },
    // `attempt` is declared below and captured through the ref chain; the
    // scheduler itself only depends on the enable flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, clearTimer],
  );

  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  const attempt = useCallback(
    async (force: boolean) => {
      if (!alive.current || !enabled) return;
      if (inFlight.current) return;

      const since = Date.now() - readStamp(key);
      if (!force && since < minGapMs) {
        // Another tab (or an earlier trigger) already covered this window.
        scheduleRef.current(Math.max(1_000, minGapMs - since));
        return;
      }

      inFlight.current = true;
      // Claim before the network leg so a sibling tab firing in the same tick
      // sees a fresh stamp and yields instead of duplicating the sweep.
      writeStamp(key, Date.now());
      setState((s) => ({ ...s, syncing: true, lastError: null }));

      try {
        await runRef.current();
        failures.current = 0;
        if (!alive.current) return;
        const now = Date.now();
        writeStamp(key, now);
        setState((s) => ({ ...s, syncing: false, lastRunAt: now, lastError: null }));
        scheduleRef.current(intervalMs);
      } catch (e) {
        failures.current += 1;
        if (!alive.current) return;
        setState((s) => ({
          ...s,
          syncing: false,
          lastError: e instanceof Error ? e.message : "Sync failed",
        }));
        scheduleRef.current(Math.min(BACKOFF_CAP_MS, intervalMs * 2 ** Math.min(failures.current, 5)));
      } finally {
        inFlight.current = false;
      }
    },
    [enabled, key, minGapMs, intervalMs],
  );

  const attemptRef = useRef(attempt);
  attemptRef.current = attempt;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  // Open the surface → sync. Close it → stop. Everything else is a catch-up.
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      setState((s) => ({ ...s, nextRunAt: null }));
      return;
    }

    void attemptRef.current(false);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void attemptRef.current(false);
      } else {
        // Hidden tabs get no cadence — the server-side sweep owns that window.
        clearTimer();
      }
    };
    const onOnline = () => void attemptRef.current(false);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onOnline);
      clearTimer();
    };
  }, [enabled, key, clearTimer]);

  /** Operator-initiated sweep — ignores the gap, respects single-flight. */
  const syncNow = useCallback(() => attemptRef.current(true), []);

  return { ...state, syncNow };
}
