// Motion preferences — the operator decides how much the interface moves.
//
// Three honest levels:
//   full  — everything animates as designed
//   calm  — decorative motion is shortened, state motion stays (so feedback
//           still communicates cause and effect)
//   still — no decorative motion at all; only instant state changes
//
// Two independent switches for the two loudest effects: the click ripple and
// the background shimmer. The system "reduce motion" setting is respected:
// when the operator has never chosen a level, the system choice decides.
//
// Same write -> broadcast -> repaint contract as dashboardUi.ts, so a change
// applies live without a reload.

export type MotionLevel = "full" | "calm" | "still";

export interface MotionPrefs {
  level: MotionLevel;
  ripple: boolean;
  shimmer: boolean;
}

export const MOTION_KEY = "asherin_motion";
export const MOTION_EVENT = "asherin-motion";

export const DEFAULT_MOTION: MotionPrefs = { level: "full", ripple: true, shimmer: true };

export function systemPrefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function coerceLevel(value: unknown): MotionLevel | null {
  return value === "full" || value === "calm" || value === "still" ? value : null;
}

export function readMotionPrefs(): MotionPrefs {
  let stored: Partial<MotionPrefs> | null = null;
  try {
    const raw = localStorage.getItem(MOTION_KEY);
    stored = raw ? (JSON.parse(raw) as Partial<MotionPrefs>) : null;
  } catch {
    stored = null;
  }

  // Nothing chosen yet: honour the operating system.
  if (!stored) {
    return systemPrefersReducedMotion()
      ? { level: "still", ripple: false, shimmer: false }
      : DEFAULT_MOTION;
  }

  return {
    level: coerceLevel(stored.level) ?? DEFAULT_MOTION.level,
    ripple: stored.ripple !== false,
    shimmer: stored.shimmer !== false,
  };
}

export function broadcastMotionPrefs(): void {
  window.dispatchEvent(new Event(MOTION_EVENT));
}

/** Reflects the prefs onto <html> so CSS can act on them. */
export function applyMotionPrefs(prefs: MotionPrefs = readMotionPrefs()): MotionPrefs {
  try {
    const root = document.documentElement;
    root.setAttribute("data-motion", prefs.level);
    root.setAttribute("data-motion-shimmer", prefs.shimmer ? "on" : "off");
    root.setAttribute("data-motion-ripple", prefs.ripple ? "on" : "off");
  } catch {
    /* non-browser render must not throw */
  }
  return prefs;
}

export function writeMotionPrefs(next: Partial<MotionPrefs>): MotionPrefs {
  const merged: MotionPrefs = { ...readMotionPrefs(), ...next };
  const value: MotionPrefs = {
    level: coerceLevel(merged.level) ?? DEFAULT_MOTION.level,
    ripple: merged.ripple !== false,
    shimmer: merged.shimmer !== false,
  };
  try {
    localStorage.setItem(MOTION_KEY, JSON.stringify(value));
  } catch {
    /* private-mode storage refusal must not block the live change */
  }
  applyMotionPrefs(value);
  broadcastMotionPrefs();
  return value;
}

/** True when the click ripple is allowed to draw at all. */
export function rippleEnabled(prefs: MotionPrefs = readMotionPrefs()): boolean {
  return prefs.ripple && prefs.level !== "still";
}

/** True when ambient background shimmer is allowed. */
export function shimmerEnabled(prefs: MotionPrefs = readMotionPrefs()): boolean {
  return prefs.shimmer && prefs.level !== "still";
}

export function subscribeMotionPrefs(fn: (prefs: MotionPrefs) => void): () => void {
  const handler = () => fn(readMotionPrefs());
  window.addEventListener(MOTION_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(MOTION_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
