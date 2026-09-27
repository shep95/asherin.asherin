// asherin — temporal synchronization metadata for the shared fabric.
//
// Two sensors never agree on the time. A browser tab, a bluetooth headset lane,
// an edge node and a camera each stamp from their own clock, and the difference
// between "02:14:18 according to the microphone" and "02:14:18 according to the
// camera" is the whole reason a correlation window exists.
//
// This module does not correct clocks. Correcting them would destroy the
// evidence that they disagree. It records the skew alongside the observation
// and widens the correlation window by the skew that was actually measured, so
// a coincidence is only claimed when it survives the uncertainty in the clocks.

import type { FabricProvenance } from "./types";

/** default window for calling two observations simultaneous, before skew. */
export const BASE_SYNC_WINDOW_MS = 5_000;

/** skew larger than this is a broken clock, not a synchronization detail. */
export const MAX_TRUSTED_SKEW_MS = 120_000;

export function skewOf(sourceClockMs: number | null, receivedAtMs: number): number | null {
  if (sourceClockMs === null) return null;
  return sourceClockMs - receivedAtMs;
}

export function provenance(input: {
  sensorId: string;
  sensorLabel: string;
  subsystem: FabricProvenance["subsystem"];
  adapter: string;
  kind: FabricProvenance["kind"];
  sourceClockMs?: number | null;
  receivedAtMs?: number;
  note: string;
  demo?: boolean;
}): FabricProvenance {
  const receivedAtMs = input.receivedAtMs ?? Date.now();
  const sourceClockMs = input.sourceClockMs ?? null;
  return {
    sensorId: input.sensorId,
    sensorLabel: input.sensorLabel,
    subsystem: input.subsystem,
    adapter: input.adapter,
    kind: input.kind,
    sourceClockMs,
    receivedAtMs,
    clockSkewMs: skewOf(sourceClockMs, receivedAtMs),
    note: input.note,
    ...(input.demo ? { demo: true } : {}),
  };
}

/**
 * The window inside which two observations may be called simultaneous. It is
 * the base window widened by whatever skew each side actually reported, so a
 * pair of well-synchronized sensors is held to a tight standard and a pair with
 * a drifting edge node is held to an honestly looser one.
 */
export function syncWindowMs(a: FabricProvenance, b: FabricProvenance, base = BASE_SYNC_WINDOW_MS): number {
  const skew = (p: FabricProvenance) => {
    const s = p.clockSkewMs === null ? 0 : Math.abs(p.clockSkewMs);
    return Math.min(s, MAX_TRUSTED_SKEW_MS);
  };
  return base + skew(a) + skew(b);
}

/** True when the clocks disagree by more than the fabric is willing to absorb. */
export function clockUntrusted(p: FabricProvenance): boolean {
  return p.clockSkewMs !== null && Math.abs(p.clockSkewMs) > MAX_TRUSTED_SKEW_MS;
}

export function skewLine(p: FabricProvenance): string {
  if (p.clockSkewMs === null) return "this source stamps no clock of its own — the receive time is the only time available";
  const s = Math.round(p.clockSkewMs / 100) / 10;
  if (Math.abs(p.clockSkewMs) < 250) return "source clock agrees with this device to within a quarter second";
  if (clockUntrusted(p)) return `source clock is ${s}s from this device — too far apart to call anything simultaneous`;
  return `source clock runs ${s}s ${p.clockSkewMs > 0 ? "ahead of" : "behind"} this device; correlation windows are widened by that much`;
}
