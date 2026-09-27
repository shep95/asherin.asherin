// asherin.arvision — detector health.
//
// A quiet detector and a healthy detector look identical on a wall of screens,
// and that ambiguity is how monitoring rooms end up trusting a feed that died
// hours ago. Each detector must therefore prove it is alive on a cadence it
// declares itself. Miss the cadence and it is reported degraded, then failed —
// never "no events".

export type DetectorState = "unconfigured" | "starting" | "healthy" | "degraded" | "failed";

export interface DetectorHealth {
  id: string;
  label: string;
  /** which backend runs it. browser-local detectors say so plainly. */
  runtime: string;
  /** how often the detector promises to report, ms. */
  expectedIntervalMs: number;
  lastHeartbeatMs: number | null;
  lastEventMs: number | null;
  state: DetectorState;
  detail: string;
  /** operator-visible count of firings this session. */
  firings: number;
  falsePositives: number;
}

export function createDetector(
  id: string,
  label: string,
  runtime: string,
  expectedIntervalMs: number,
): DetectorHealth {
  return {
    id,
    label,
    runtime,
    expectedIntervalMs,
    lastHeartbeatMs: null,
    lastEventMs: null,
    state: "unconfigured",
    detail: "no backend has claimed this detector, so it is not running",
    firings: 0,
    falsePositives: 0,
  };
}

export function heartbeat(d: DetectorHealth, atMs: number, note?: string): DetectorHealth {
  return {
    ...d,
    lastHeartbeatMs: atMs,
    state: "healthy",
    detail: note ?? "reporting on schedule",
  };
}

export function recordFiring(d: DetectorHealth, atMs: number): DetectorHealth {
  return { ...d, lastEventMs: atMs, firings: d.firings + 1, lastHeartbeatMs: atMs, state: "healthy" };
}

export function recordFalsePositive(d: DetectorHealth): DetectorHealth {
  return { ...d, falsePositives: d.falsePositives + 1 };
}

/** Grade every detector against its own declared cadence. */
export function sweepDetectors(list: DetectorHealth[], nowMs: number): DetectorHealth[] {
  return list.map((d) => {
    if (d.lastHeartbeatMs === null) {
      return d.state === "unconfigured"
        ? d
        : { ...d, state: "starting", detail: "claimed by a backend but no heartbeat has arrived yet" };
    }
    const age = nowMs - d.lastHeartbeatMs;
    if (age > d.expectedIntervalMs * 6) {
      return { ...d, state: "failed", detail: `no heartbeat for ${Math.round(age / 1000)}s. treat this detector's silence as unknown, not as all-clear` };
    }
    if (age > d.expectedIntervalMs * 2) {
      return { ...d, state: "degraded", detail: `heartbeat is ${Math.round(age / 1000)}s late` };
    }
    return { ...d, state: "healthy", detail: "reporting on schedule" };
  });
}

/** Ratio of confirmed false positives, or null when there is nothing to divide. */
export function falsePositiveRate(d: DetectorHealth): number | null {
  if (d.firings === 0) return null;
  return Math.round((d.falsePositives / d.firings) * 100) / 100;
}
