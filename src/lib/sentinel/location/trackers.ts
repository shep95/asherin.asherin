// asherin.sentinel — per-radio location association.
//
// A sighting is a radio *and* a place. Joining the two answers the only
// question that matters about an unfamiliar device: has this same radio been
// near me in more than one place?
//
// The join is strictly bounded. A sighting inherits a fix only when the fix is
// close in time; an old fix stapled to a new sighting invents a journey nobody
// took.

import { accuracyBand, divergence, haversineMeters, type LocationFix } from "./geo";

/** A fix older than this cannot describe where a sighting happened. */
export const MAX_FIX_AGE_MS = 120_000;

export interface RadioSighting {
  key: string;
  label: string;
  at: number;
  rssi: number | null;
  meters: number | null;
  fix: LocationFix | null;
  place: string | null;
}

export interface RadioTrail {
  key: string;
  label: string;
  sightings: RadioSighting[];
  /** distinct places, clustered at roughly 150 m. */
  places: { lat: number; lon: number; label: string | null; first: number; last: number; count: number }[];
  followsYou: boolean;
  note: string;
}

const PLACE_CLUSTER_M = 150;

export function attachFix(
  sighting: Omit<RadioSighting, "fix" | "place">,
  fix: LocationFix | null,
  place: string | null,
): RadioSighting {
  if (!fix || Math.abs(sighting.at - fix.at) > MAX_FIX_AGE_MS) {
    return { ...sighting, fix: null, place: null };
  }
  return { ...sighting, fix, place };
}

export function buildTrail(key: string, label: string, sightings: RadioSighting[]): RadioTrail {
  const located = sightings.filter((s) => s.fix);
  const places: RadioTrail["places"] = [];

  for (const s of located) {
    const fix = s.fix!;
    const hit = places.find((p) => haversineMeters(p, fix) <= Math.max(PLACE_CLUSTER_M, fix.accuracyM));
    if (hit) {
      hit.last = Math.max(hit.last, s.at);
      hit.first = Math.min(hit.first, s.at);
      hit.count += 1;
      if (!hit.label && s.place) hit.label = s.place;
    } else {
      places.push({ lat: fix.lat, lon: fix.lon, label: s.place, first: s.at, last: s.at, count: 1 });
    }
  }

  const followsYou = places.length >= 2;
  const note = !located.length
    ? "seen, but never with a location fix attached — no place claim can be made about this radio."
    : followsYou
      ? `seen in ${places.length} separate places. that is the shape of something travelling with you; it is not proof of one, and a shared commute produces the same pattern.`
      : `only ever seen at one place (${accuracyBand(located[0].fix!.accuracyM)} certainty).`;

  return { key, label, sightings, places, followsYou, note };
}

/** Fixes from two sources that cannot both be right. Surfaced, not resolved —
 *  the operator decides whether the vpn, the spoof or the stale cache explains it. */
export function conflictingFixes(fixes: LocationFix[]): { a: LocationFix; b: LocationFix; metres: number }[] {
  const out: { a: LocationFix; b: LocationFix; metres: number }[] = [];
  for (let i = 0; i < fixes.length; i++) {
    for (let j = i + 1; j < fixes.length; j++) {
      const d = divergence(fixes[i], fixes[j]);
      if (d.unexplained) out.push({ a: fixes[i], b: fixes[j], metres: d.metres });
    }
  }
  return out;
}
