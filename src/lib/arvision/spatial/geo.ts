// asherin.arvision — geographic anchor for the spatial room.
//
// The scanned map from the uploaded package lives in metres around its own
// origin. A real GPS fix lives in degrees on a sphere. This is the bridge: one
// anchor point fixes where local (0,0) sits on earth, and everything after that
// is a local east/north offset in metres, which is exactly the x/z plane the
// navigation graph, the map canvas and the AR projection already speak.
//
// The equirectangular approximation is used deliberately: over the few hundred
// metres a walking session covers, its error is well under the accuracy of the
// GPS fix feeding it, and it is cheap enough to run on every position update.

import type { Vec3 } from "./types";

export interface GeoAnchor {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6378137;
const DEG = Math.PI / 180;

/** Local metres from the anchor: +x is east, +z is north, y is left at zero. */
export function geoToLocal(anchor: GeoAnchor, lat: number, lon: number): Vec3 {
  const cosLat = Math.cos(anchor.lat * DEG);
  return {
    x: (lon - anchor.lon) * DEG * EARTH_RADIUS_M * cosLat,
    y: 0,
    z: (lat - anchor.lat) * DEG * EARTH_RADIUS_M,
  };
}

/** Back to degrees, for anything that needs to name a place on earth. */
export function localToGeo(anchor: GeoAnchor, point: Vec3): GeoAnchor {
  const cosLat = Math.max(1e-6, Math.cos(anchor.lat * DEG));
  return {
    lat: anchor.lat + point.z / EARTH_RADIUS_M / DEG,
    lon: anchor.lon + point.x / (EARTH_RADIUS_M * cosLat) / DEG,
  };
}

/** Great-circle distance in metres. */
export function geoDistance(a: GeoAnchor, b: GeoAnchor): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Compass bearing in degrees, 0 = north, for a local movement vector. */
export function bearingFromLocal(from: Vec3, to: Vec3): number | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.hypot(dx, dz) < 1.5) return null; // shorter than GPS noise, not a heading
  const deg = (Math.atan2(dx, dz) * 180) / Math.PI;
  return (deg + 360) % 360;
}
