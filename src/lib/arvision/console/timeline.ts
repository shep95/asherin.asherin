// eagle.eye — investigation timeline.
//
// A timeline is only as real as the recordings under it. Two different things
// are drawn here and they are never blurred together:
//
//   markers  — moments the detectors actually fired. These always exist.
//   media    — frames or clips that were actually stored. These exist only when
//              a recording path was configured and a write succeeded.
//
// Scrubbing to a moment with no stored media returns "no media at this time"
// instead of a black frame that implies footage exists.

import type { QueueItem } from "./types";

export interface TimelineMarker {
  incidentId: string;
  atMs: number;
  endMs: number;
  label: string;
  eventType: string;
  deviceId: string | null;
  hasEvidence: boolean;
}

export interface EvidenceFrameRef {
  id: string;
  incidentId: string;
  atMs: number;
  /** where the bytes actually live. */
  storage: "memory" | "indexeddb" | "backend";
  role: "pre" | "trigger" | "during" | "post";
  /** overlays are kept as metadata so the original frame stays original. */
  annotations: Array<{ kind: string; box?: { x: number; y: number; w: number; h: number }; note: string }>;
  sourceDeviceId: string | null;
  provenance: string;
}

export interface TimelineWindow {
  fromMs: number;
  toMs: number;
  markers: TimelineMarker[];
  /** null when nothing was recorded — the UI prints the reason instead. */
  media: EvidenceFrameRef[] | null;
  mediaUnavailableReason: string;
}

export function markersFor(items: QueueItem[]): TimelineMarker[] {
  return items
    .map((i) => ({
      incidentId: i.incidentId,
      atMs: i.openedAtMs,
      endMs: Math.max(i.openedAtMs, i.lastFiringMs),
      label: i.label,
      eventType: i.eventType,
      deviceId: i.deviceId,
      hasEvidence: i.evidenceState === "stored" && !!i.evidenceId,
    }))
    .sort((a, b) => a.atMs - b.atMs);
}

export function buildWindow(
  items: QueueItem[],
  fromMs: number,
  toMs: number,
  frames: EvidenceFrameRef[] | null,
  recordingConfigured: boolean,
): TimelineWindow {
  const markers = markersFor(items).filter((m) => m.endMs >= fromMs && m.atMs <= toMs);
  if (!recordingConfigured) {
    return {
      fromMs, toMs, markers, media: null,
      mediaUnavailableReason: "no recording path is configured, so there is no footage to scrub — event markers below come from detector firings only",
    };
  }
  const media = (frames ?? []).filter((f) => f.atMs >= fromMs && f.atMs <= toMs).sort((a, b) => a.atMs - b.atMs);
  return {
    fromMs, toMs, markers, media,
    mediaUnavailableReason: media.length === 0 ? "recording is configured but nothing was stored in this interval" : "",
  };
}

/** Jump to an incident: exact interval plus a small margin, clamped to sanity. */
export function intervalForIncident(item: QueueItem, marginMs = 5000): { fromMs: number; toMs: number } {
  const from = item.openedAtMs - marginMs;
  const to = Math.max(item.lastFiringMs, item.openedAtMs) + marginMs;
  return { fromMs: from, toMs: to };
}

/** Frames belonging to one incident, in playback order. */
export function evidenceForIncident(frames: EvidenceFrameRef[], incidentId: string): EvidenceFrameRef[] {
  const order: Record<EvidenceFrameRef["role"], number> = { pre: 0, trigger: 1, during: 2, post: 3 };
  return frames
    .filter((f) => f.incidentId === incidentId)
    .sort((a, b) => (a.atMs - b.atMs) || (order[a.role] - order[b.role]));
}
