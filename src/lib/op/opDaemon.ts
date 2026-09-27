// ═══════════════════════════════════════════════════════════════════════════
// OP LAYER — TIER 1 DAEMON
//
// Armed from the moment the operator is signed in on this device, on every
// page, without anyone opening a tab to ask. It runs the local battery on a
// jittered cadence, reports on visibility changes and network transitions
// (the two moments where posture actually changes), and hands the watch to the
// background worker as the tab dies.
//
// Deliberate restraints:
//   • Single instance per page load — a remount must not double the cadence.
//   • Jittered interval — every device on the fleet must not report in lockstep.
//   • Never runs while hidden; the browser throttles it anyway and a throttled
//     timer produces late data that looks like fresh data.
//   • Every tick is wrapped: a failing sweep degrades to the next tick, never
//     to an unhandled rejection.
// ═══════════════════════════════════════════════════════════════════════════

import { opConsent, opEnroll, opReport } from "./opClient";

const BASE_INTERVAL_MS = 15 * 60_000;
const MIN_GAP_MS = 90_000;

let booted = false;
let timer: number | null = null;
let lastRun = 0;
let running = false;

const jitter = () => BASE_INTERVAL_MS + Math.floor(Math.random() * 5 * 60_000);

async function tick(reason: string): Promise<void> {
  if (running) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  if (Date.now() - lastRun < MIN_GAP_MS) return;
  running = true;
  lastRun = Date.now();
  try {
    await opReport("foreground");
  } catch (e) {
    console.warn("[op-daemon] tick failed", reason, String(e));
  } finally {
    running = false;
  }
}

function schedule(): void {
  if (timer !== null) clearTimeout(timer);
  timer = window.setTimeout(() => { void tick("interval"); schedule(); }, jitter());
}

/** Idempotent. Safe to call on every auth change and every mount. */
export function bootOpLayer(): void {
  if (booted || typeof window === "undefined") return;
  booted = true;

  void (async () => {
    // Enrol first: a device must be on the roster before its readings mean
    // anything, and enrolment is what hands it the account's existing posture.
    await opEnroll().catch(() => null);
    if (opConsent() !== "identity") void tick("boot");
    schedule();
  })();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void tick("foreground");
  });

  // A network transition is the single highest-yield moment to re-measure:
  // it is exactly when the answer can change.
  window.addEventListener("online", () => void tick("online"));
  (navigator as any).connection?.addEventListener?.("change", () => void tick("link-change"));

  window.addEventListener("pagehide", () => {
    if (timer !== null) clearTimeout(timer);
  });
}

export function stopOpLayer(): void {
  booted = false;
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
