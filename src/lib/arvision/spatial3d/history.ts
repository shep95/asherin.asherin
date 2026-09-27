// asherin.eye — historical scene reconstruction.
//
// Rewind is only real when observations were stored. Without a recording or
// observation store the console says HISTORICAL SCENE UNAVAILABLE and offers no
// scrubber, because a scrubber that replays interpolated nothing is a
// fabrication of evidence.

import type { HistoricalSceneState } from "./types";

export interface HistoryInput {
  /** the recording / observation service, as probed. */
  storage: { configured: boolean; online: boolean; detail: string };
  /** stored observation timestamps that actually exist for the window. */
  observationTimestampsMs: number[];
}

export function historicalScene(input: HistoryInput): HistoricalSceneState {
  const { storage } = input;
  const stamps = input.observationTimestampsMs.filter((t) => Number.isFinite(t)).sort((a, b) => a - b);

  if (!storage.configured) {
    return {
      available: false,
      label: "HISTORICAL SCENE UNAVAILABLE",
      reason: "no recording or observation store is configured, so past scene states were never written. nothing can be replayed.",
      fromMs: null, toMs: null, observations: 0,
    };
  }
  if (!storage.online) {
    return {
      available: false,
      label: "HISTORICAL SCENE UNAVAILABLE",
      reason: `the observation store is configured but not answering: ${storage.detail}`,
      fromMs: null, toMs: null, observations: 0,
    };
  }
  if (stamps.length === 0) {
    return {
      available: false,
      label: "HISTORICAL SCENE UNAVAILABLE",
      reason: "the store answered, but it holds no observations for this camera and interval.",
      fromMs: null, toMs: null, observations: 0,
    };
  }
  return {
    available: true,
    label: "HISTORICAL SCENE",
    reason: `${stamps.length} stored observation(s) back this interval. scrubbing moves between stored states only — gaps stay gaps.`,
    fromMs: stamps[0],
    toMs: stamps[stamps.length - 1],
    observations: stamps.length,
  };
}

/** Nearest stored state to a scrub position, or null inside a gap. */
export function nearestObservation(stampsMs: number[], targetMs: number, toleranceMs = 2000): number | null {
  let best: number | null = null;
  let bestDelta = Infinity;
  for (const t of stampsMs) {
    const d = Math.abs(t - targetMs);
    if (d < bestDelta) { bestDelta = d; best = t; }
  }
  return best != null && bestDelta <= toleranceMs ? best : null;
}
