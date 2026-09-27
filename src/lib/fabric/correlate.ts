// asherin — the correlation layer.
//
// This is the module with the most power to lie, so it is the module with the
// strictest rules.
//
// A correlation here is never "the same thing". It is "these two independent
// observations are compatible with one event, and here is exactly how much that
// is worth". The three narratives this file was written against:
//
//   * a microphone hears a glass-shaped impact at 02:14:18 and a camera holds a
//     track in the same configured zone at the same moment. That is a
//     coincidence in time and place worth showing an operator. It is not proof
//     the track broke the glass, and nothing here will say it is.
//
//   * three authorized receivers hear one broadcast. With surveyed geometry a
//     positioning service returns an uncertainty region. If three visual tracks
//     stand inside that region, the correct output is THREE candidates and no
//     choice. Picking the nearest one would be fabrication with arithmetic in
//     front of it.
//
//   * without geometry there is no region, so there is nothing to overlap, so
//     no spatial correlation may be produced at all — only the receiver
//     sightings themselves.
//
// Consequently: `attribution` is "not_attributed" on every automatic output.
// Only `assertHumanLink` can produce "human_asserted", and it records who.

import { syncWindowMs, clockUntrusted } from "./clock";
import type {
  FabricCorrelation,
  FabricObservation,
  RadioRegionObservation,
  VisualTrackObservation,
} from "./types";

export const NO_ATTRIBUTION_LIMIT =
  "coincidence in time and place only. this does not identify anyone, does not say the radio belongs to a tracked person, and does not establish cause.";

const AMBIGUOUS_LIMIT =
  "more than one tracked shape sits inside this uncertainty region, so no single candidate can be preferred. the fabric shows all of them and chooses none.";

let seq = 0;
const nextId = (prefix: string, atMs: number) => `${prefix}_${atMs.toString(36)}_${(seq++).toString(36)}`;

function distanceM(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Time-and-zone coincidence between one new observation and the recent record.
 *
 * Requires: both sides carry a known zone, both zones match, both clocks are
 * trusted, and the gap survives the skew-widened window. A missing zone is a
 * missing fact — it is never treated as "probably the same place".
 */
export function correlateTemporal(
  candidate: FabricObservation,
  recent: FabricObservation[],
  opts: { crossModalityOnly?: boolean } = {},
): FabricCorrelation[] {
  if (!candidate.zoneId || clockUntrusted(candidate.provenance)) return [];
  const out: FabricCorrelation[] = [];

  for (const other of recent) {
    if (other.id === candidate.id) continue;
    if (!other.zoneId || other.zoneId !== candidate.zoneId) continue;
    if (clockUntrusted(other.provenance)) continue;
    if (other.provenance.sensorId === candidate.provenance.sensorId) continue;
    if (opts.crossModalityOnly !== false && other.modality === candidate.modality) continue;
    if (candidate.modality === "service" || other.modality === "service") continue;

    const window = syncWindowMs(candidate.provenance, other.provenance);
    const delta = Math.abs(candidate.atMs - other.atMs);
    if (delta > window) continue;

    out.push({
      id: nextId("corr", candidate.atMs),
      kind: "temporal_zone_coincidence",
      atMs: Math.min(candidate.atMs, other.atMs),
      observationIds: [other.id, candidate.id],
      sensorIds: [other.provenance.sensorId, candidate.provenance.sensorId],
      deltaMs: delta,
      candidateCount: 1,
      attribution: "not_attributed",
      assertedBy: null,
      strength: {
        // the only honest scalar here is how tight the timing was relative to
        // the window the clocks allowed. it is not a probability of anything.
        value: Math.max(0, 1 - delta / window),
        basis: `${delta}ms apart inside a ${window}ms window widened by the measured clock skew of both sources`,
      },
      evidence: [
        `${other.provenance.sensorLabel} — ${other.summary}`,
        `${candidate.provenance.sensorLabel} — ${candidate.summary}`,
        `both observations carry zone ${candidate.zoneLabel ?? candidate.zoneId}`,
      ],
      limitation: NO_ATTRIBUTION_LIMIT,
    });
  }
  return out;
}

/**
 * Spatial overlap between a radio uncertainty region and visual tracks that
 * have real world coordinates.
 *
 * Refuses to run unless the region came from multilateration AND the tracks are
 * spatially registered. A range from a single receiver is a radius around that
 * receiver, not a place, and a camera without calibration has no metres to
 * compare against.
 */
export function correlateRadioToTracks(
  region: RadioRegionObservation,
  tracks: VisualTrackObservation[],
): FabricCorrelation[] {
  const centre = region.region.centre;
  const radius = region.region.radiusM;
  if (region.region.method !== "multilateration" || !centre || radius === null) return [];

  const window = 8_000;
  const inside = tracks.filter(
    (t) =>
      t.worldPoint !== null &&
      Math.abs(t.atMs - region.atMs) <= window &&
      distanceM(t.worldPoint, centre) <= radius,
  );
  if (inside.length === 0) return [];

  return [
    {
      id: nextId("overlap", region.atMs),
      kind: "spatial_overlap_candidate",
      atMs: region.atMs,
      observationIds: [region.id, ...inside.map((t) => t.id)],
      sensorIds: [region.provenance.sensorId, ...new Set(inside.map((t) => t.provenance.sensorId))],
      deltaMs: Math.max(...inside.map((t) => Math.abs(t.atMs - region.atMs))),
      candidateCount: inside.length,
      attribution: "not_attributed",
      assertedBy: null,
      strength: {
        // a region containing many candidates is weaker evidence, not stronger.
        value: null,
        basis:
          inside.length === 1
            ? "one tracked shape lies inside the region; a region containing one candidate is still not an identification"
            : `${inside.length} tracked shapes lie inside the region`,
      },
      evidence: [
        `${region.handle} placed by ${region.region.method} across ${region.region.receiverIds.length} authorized receivers, radius ${radius}m`,
        ...inside.map((t) => `track ${t.trackId} on ${t.provenance.sensorLabel} inside the region`),
        ...region.region.evidence,
      ],
      limitation: inside.length > 1 ? AMBIGUOUS_LIMIT : NO_ATTRIBUTION_LIMIT,
    },
  ];
}

/**
 * The only path to an attributed link: a named operator says so. The evidence
 * line records that this is a human assertion, not a measurement, so it can
 * never later be read back as if a sensor produced it.
 */
export function assertHumanLink(
  observations: FabricObservation[],
  by: string,
  reason: string,
  atMs = Date.now(),
): FabricCorrelation {
  return {
    id: nextId("human", atMs),
    kind: "shared_incident",
    atMs,
    observationIds: observations.map((o) => o.id),
    sensorIds: [...new Set(observations.map((o) => o.provenance.sensorId))],
    deltaMs: observations.length > 1 ? Math.max(...observations.map((o) => o.atMs)) - Math.min(...observations.map((o) => o.atMs)) : 0,
    candidateCount: 1,
    attribution: "human_asserted",
    assertedBy: by,
    strength: { value: null, basis: "asserted by a person, not measured by a sensor" },
    evidence: [`${by} linked these observations: ${reason}`, ...observations.map((o) => `${o.provenance.sensorLabel} — ${o.summary}`)],
    limitation: "this link exists because an operator asserted it. it carries that operator's judgement and no sensor evidence beyond the observations themselves.",
  };
}
