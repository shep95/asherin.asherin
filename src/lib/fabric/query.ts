// asherin — search and rewind over the fabric.
//
// An operator opening an incident asks a small number of concrete questions:
// when did this track first appear, which cameras ever saw it, what did the
// radios hear around that minute, what did the microphones hear. Each of those
// is answerable from the normalized record — for the window the fabric still
// holds in memory.
//
// Beyond that window the answer depends on a backend. Sentinel already persists
// speech, sound, gap, radio and location rows to the account timeline, so those
// questions really can be asked of storage. ArVision tracks and camera events
// are NOT persisted anywhere yet: they exist only for the life of the tab. This
// module reports that difference instead of returning a thinner answer that
// looks the same.

import type { FabricObservation } from "./types";
import { sensorFabric } from "./fabric";
import { fetchTimeline, type AmbientEvent } from "@/lib/sentinel/audio/sync";

export type QueryScope = "session_memory" | "account_timeline";

export interface QueryResult<T> {
  ok: boolean;
  scope: QueryScope;
  data: T;
  /** what the answer covers, or why it could not be produced. always shown. */
  coverage: string;
}

const windowNote =
  "answered from the observations this browser session still holds. asherin.arvision does not persist tracks or camera events to any backend, so this cannot reach further back than this session.";

export function firstVisualAppearance(trackId: string): QueryResult<FabricObservation | null> {
  const hits = sensorFabric()
    .observationList()
    .filter((o) => o.type === "visual_track" && o.trackId === trackId)
    .sort((a, b) => a.atMs - b.atMs);
  return {
    ok: hits.length > 0,
    scope: "session_memory",
    data: hits[0] ?? null,
    coverage: hits.length ? windowNote : `no observation of track ${trackId} is held in this session. ${windowNote}`,
  };
}

export function camerasThatObserved(trackId: string): QueryResult<Array<{ sensorId: string; label: string; firstMs: number; lastMs: number }>> {
  const map = new Map<string, { sensorId: string; label: string; firstMs: number; lastMs: number }>();
  for (const o of sensorFabric().observationList()) {
    if (o.type !== "visual_track" || o.trackId !== trackId) continue;
    const prior = map.get(o.provenance.sensorId);
    map.set(o.provenance.sensorId, {
      sensorId: o.provenance.sensorId,
      label: o.provenance.sensorLabel,
      firstMs: prior ? Math.min(prior.firstMs, o.atMs) : o.atMs,
      lastMs: prior ? Math.max(prior.lastMs, o.atMs) : o.atMs,
    });
  }
  const data = [...map.values()].sort((a, b) => a.firstMs - b.firstMs);
  return {
    ok: data.length > 0,
    scope: "session_memory",
    data,
    coverage:
      "a camera appears here only if it published a track with this id into the fabric. track ids are camera-local and session-scoped, so the same physical shape seen by two cameras carries two ids unless a registered world position joined them.",
  };
}

/** Everything the fabric holds inside a window around a moment, in order. */
export function around(atMs: number, windowMs = 60_000): QueryResult<FabricObservation[]> {
  const data = sensorFabric()
    .observationList()
    .filter((o) => Math.abs(o.atMs - atMs) <= windowMs)
    .sort((a, b) => a.atMs - b.atMs);
  return { ok: true, scope: "session_memory", data, coverage: windowNote };
}

export function radioSightingsAround(atMs: number, windowMs = 60_000): QueryResult<FabricObservation[]> {
  const r = around(atMs, windowMs);
  return { ...r, data: r.data.filter((o) => o.type === "radio_sighting" || o.type === "radio_region") };
}

export function soundEventsAround(atMs: number, windowMs = 60_000): QueryResult<FabricObservation[]> {
  const r = around(atMs, windowMs);
  return { ...r, data: r.data.filter((o) => o.type === "audio_event" || o.type === "speech_event") };
}

/**
 * The persisted half of a rewind. Sentinel's account timeline is a real store
 * with a real query, so this really does reach past the session — for audio,
 * radio and location only. A failure is returned as a failure.
 */
export async function rewindAccountTimeline(
  atMs: number,
  windowMs = 5 * 60_000,
): Promise<QueryResult<AmbientEvent[]>> {
  try {
    const res = await fetchTimeline({
      sinceIso: new Date(atMs - windowMs).toISOString(),
      untilIso: new Date(atMs + windowMs).toISOString(),
      limit: 300,
    });
    return {
      ok: true,
      scope: "account_timeline",
      data: res.events,
      coverage:
        "stored asherin.sentinel rows: speech, sound, coverage gaps, radio and location. camera tracks and camera events are not stored by any backend in this project, so they are absent here rather than empty.",
    };
  } catch (e) {
    return {
      ok: false,
      scope: "account_timeline",
      data: [],
      coverage: `the account timeline could not be read: ${e instanceof Error ? e.message : "the request failed"}. this is a backend failure, not an absence of events.`,
    };
  }
}

/** Capabilities the console prints so an operator knows what search can reach. */
export const QUERY_CAPABILITIES: Array<{ question: string; available: boolean; detail: string }> = [
  { question: "first visual appearance of a track", available: true, detail: "this session only — arvision tracks are not persisted" },
  { question: "which cameras observed a track", available: true, detail: "this session only, camera-local ids" },
  { question: "radio sightings around a moment", available: true, detail: "this session in memory; sentinel also persists radio rows to the account timeline" },
  { question: "sound and speech events around a moment", available: true, detail: "persisted by sentinel to the account timeline" },
  { question: "replay stored camera video around an incident", available: false, detail: "no recording backend is configured — the rolling frame buffer lives only in this tab" },
  { question: "cross-site search across multiple buildings", available: false, detail: "no multi-site store exists in this project" },
];
