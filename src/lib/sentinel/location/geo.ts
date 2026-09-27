// asherin.sentinel — location mathematics and honesty rules.
//
// Every fix carries the thing most location UIs drop: where it came from and
// how wrong it can be. A 3 000 m ip estimate and a 6 m gps fix are not the same
// claim, and rendering them as the same pin is the lie this module refuses.

export type FixSource = "gps" | "network" | "ip" | "beacon" | "manual";

export interface LocationFix {
  lat: number;
  lon: number;
  /** metres, 68% confidence, exactly as the platform reports it. */
  accuracyM: number;
  altitudeM: number | null;
  altitudeAccuracyM: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  source: FixSource;
  at: number;
  /** free text: "gps satellite fix", "ip estimate — city level, vpn-sensitive". */
  note: string;
}

export type MovementState = "stationary" | "walking" | "running" | "driving" | "unknown";

const EARTH_R = 6_371_000;

export function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/**
 * Movement is only claimed when the displacement clears the combined accuracy
 * of both fixes. Two 3 000 m ip estimates 40 m apart are not a walk; they are
 * the same unknown twice.
 */
export function movementBetween(prev: LocationFix, next: LocationFix): { state: MovementState; metres: number; mps: number } {
  const metres = haversineMeters(prev, next);
  const seconds = Math.max(1, (next.at - prev.at) / 1000);
  const noiseFloor = Math.max(prev.accuracyM, next.accuracyM);
  if (metres <= noiseFloor) return { state: "stationary", metres, mps: 0 };
  const mps = metres / seconds;
  const state: MovementState = mps < 0.4 ? "stationary" : mps < 2.2 ? "walking" : mps < 6 ? "running" : "driving";
  return { state, metres, mps: Math.round(mps * 100) / 100 };
}

/** Lower is better: a fix is preferred on accuracy first, freshness second. */
export function fixQuality(fix: LocationFix, now = Date.now()): number {
  const ageSeconds = Math.max(0, (now - fix.at) / 1000);
  return fix.accuracyM + ageSeconds * 2;
}

export function bestFix(candidates: LocationFix[], now = Date.now()): LocationFix | null {
  const usable = candidates.filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon));
  if (!usable.length) return null;
  return usable.reduce((best, f) => (fixQuality(f, now) < fixQuality(best, now) ? f : best));
}

/**
 * Weighted centroid of known-position beacons in range. Inverse-distance
 * weighted, and the accuracy returned is the spread of the contributing
 * estimates, not a flattering constant.
 */
export interface BeaconObservation {
  lat: number;
  lon: number;
  meters: number;
  label: string;
}

export function trilaterateBeacons(observations: BeaconObservation[], at = Date.now()): LocationFix | null {
  const usable = observations.filter((o) => Number.isFinite(o.lat) && Number.isFinite(o.lon) && o.meters > 0);
  if (usable.length < 2) return null;
  let wsum = 0;
  let lat = 0;
  let lon = 0;
  for (const o of usable) {
    const w = 1 / Math.max(0.5, o.meters);
    wsum += w;
    lat += o.lat * w;
    lon += o.lon * w;
  }
  lat /= wsum;
  lon /= wsum;
  const spread = usable.map((o) => haversineMeters({ lat, lon }, o) + o.meters);
  const accuracyM = Math.round(Math.max(...spread));
  return {
    lat,
    lon,
    accuracyM,
    altitudeM: null,
    altitudeAccuracyM: null,
    headingDeg: null,
    speedMps: null,
    source: "beacon",
    at,
    note: `weighted from ${usable.length} known beacons (${usable.map((o) => o.label).join(", ")}) — signal-strength distance, so metres are approximate`,
  };
}

/** Two fixes that disagree by more than either can explain. Worth surfacing:
 *  it is the shape of a vpn, a spoofed gps, or a stale cached network fix. */
export function divergence(a: LocationFix, b: LocationFix): { metres: number; unexplained: boolean } {
  const metres = haversineMeters(a, b);
  return { metres: Math.round(metres), unexplained: metres > a.accuracyM + b.accuracyM };
}

export function accuracyBand(accuracyM: number): string {
  if (accuracyM <= 15) return "building level";
  if (accuracyM <= 100) return "block level";
  if (accuracyM <= 1000) return "neighbourhood level";
  if (accuracyM <= 10000) return "city level";
  return "region level";
}
