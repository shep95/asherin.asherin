// measurement taxonomy for asherin.eye
//
// the overhead intelligence look — a route drawn across ground with leg
// distances, a ring with a radius call-out, a dropped fix with its own
// coordinates — is three primitives and nothing more:
//
//   point : one fix. lat / lon / ground elevation.
//   path  : an ordered chain of fixes. per-leg range, bearing, running total.
//   ring  : a centre and a radius. area, circumference, what stands inside.
//
// everything visible in that style of frame decomposes into those three, so
// the module stays pure geometry and formatting; the globe owns the pixels.

export type LonLat = { lat: number; lon: number };

export type MeasureKind = "point" | "path" | "ring";

const R = 6371008.8; // mean earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** great-circle range in metres. haversine — stable at short legs. */
export function rangeM(a: LonLat, b: LonLat): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** initial bearing a→b in degrees true, 0–360. */
export function bearingDeg(a: LonLat, b: LonLat): number {
  const dLon = rad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** midpoint on the great circle a→b — where a leg label belongs. */
export function midpoint(a: LonLat, b: LonLat): LonLat {
  const dLon = rad(b.lon - a.lon);
  const bx = Math.cos(rad(b.lat)) * Math.cos(dLon);
  const by = Math.cos(rad(b.lat)) * Math.sin(dLon);
  const lat = Math.atan2(
    Math.sin(rad(a.lat)) + Math.sin(rad(b.lat)),
    Math.sqrt((Math.cos(rad(a.lat)) + bx) ** 2 + by ** 2),
  );
  const lon = rad(a.lon) + Math.atan2(by, Math.cos(rad(a.lat)) + bx);
  return { lat: deg(lat), lon: ((deg(lon) + 540) % 360) - 180 };
}

export function pathLengthM(pts: LonLat[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) total += rangeM(pts[i - 1], pts[i]);
  return total;
}

const CARDINALS = ["n", "nne", "ne", "ene", "e", "ese", "se", "sse", "s", "ssw", "sw", "wsw", "w", "wnw", "nw", "nnw"];

export function fmtBearing(b: number): string {
  const idx = Math.round((((b % 360) + 360) % 360) / 22.5) % 16;
  return `${Math.round(b).toString().padStart(3, "0")}° ${CARDINALS[idx]}`;
}

export function fmtRange(m: number): string {
  if (!Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  if (m < 100000) return `${(m / 1000).toFixed(2)} km`;
  return `${Math.round(m / 1000).toLocaleString()} km`;
}

export function fmtCoord(p: LonLat): string {
  return `${p.lat.toFixed(5)} · ${p.lon.toFixed(5)}`;
}

export function circleRing(centre: LonLat, radiusM: number, steps = 128): LonLat[] {
  const ring: LonLat[] = [];
  const latScale = 1 / 111320;
  const lonScale = 1 / (111320 * Math.max(0.02, Math.cos(rad(centre.lat))));
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    ring.push({
      lat: centre.lat + Math.sin(t) * radiusM * latScale,
      lon: centre.lon + Math.cos(t) * radiusM * lonScale,
    });
  }
  return ring;
}

/** live entities standing inside a ring, nearest first. */
export function insideRing<T extends LonLat>(centre: LonLat, radiusM: number, pool: T[]): T[] {
  return pool
    .map((p) => ({ p, d: rangeM(centre, p) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.p);
}
