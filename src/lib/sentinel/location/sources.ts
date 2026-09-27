// asherin.sentinel — where the fixes come from.
//
// Four sources, ranked by what they can honestly claim:
//   gps/network — the browser's geolocation, accuracy reported by the platform
//   beacon      — weighted centroid of known-position bluetooth anchors
//   ip          — a city-level estimate that a vpn moves to another continent
//   manual      — the operator's own statement, trusted as such and labelled
//
// A source that fails does not fall silent. It opens a gap, because "no line on
// the map" is honest and "a straight line between two distant fixes" is not.

import { bestFix, type LocationFix } from "./geo";

export interface LocationGap {
  from: number;
  to: number | null;
  reason: string;
}

const IP_ENDPOINT = "https://ipapi.co/json/";

function timeout(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

export async function gpsFix(options: { highAccuracy?: boolean; timeoutMs?: number } = {}): Promise<LocationFix> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("this browser exposes no geolocation api");
  }
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: options.highAccuracy ?? true,
      timeout: options.timeoutMs ?? 12_000,
      maximumAge: 0,
    });
  });
  return fromPosition(position);
}

export function fromPosition(position: GeolocationPosition): LocationFix {
  const c = position.coords;
  // The platform does not tell us which constellation answered. Accuracy does:
  // a sub-30 m fix is satellite work, a 2 km fix is wi-fi/cell triangulation.
  const source = c.accuracy <= 30 ? "gps" : "network";
  return {
    lat: c.latitude,
    lon: c.longitude,
    accuracyM: Math.round(c.accuracy),
    altitudeM: c.altitude ?? null,
    altitudeAccuracyM: c.altitudeAccuracy ?? null,
    headingDeg: Number.isFinite(c.heading as number) ? (c.heading as number) : null,
    speedMps: Number.isFinite(c.speed as number) ? (c.speed as number) : null,
    source,
    at: position.timestamp || Date.now(),
    note:
      source === "gps"
        ? "satellite fix — horizontal only; ordinary gps cannot state a floor"
        : "wi-fi and cell triangulation — accurate to the block, not the building",
  };
}

export function watchPosition(
  onFix: (fix: LocationFix) => void,
  onError: (reason: string) => void,
): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError("this browser exposes no geolocation api");
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onFix(fromPosition(p)),
    (e) => onError(geoErrorText(e)),
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function geoErrorText(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "location permission denied for this site";
  if (error.code === error.POSITION_UNAVAILABLE) return "no position available — no satellite, wi-fi or cell fix";
  if (error.code === error.TIMEOUT) return "the position request timed out";
  return error.message || "geolocation failed";
}

export async function ipFix(): Promise<LocationFix> {
  const res = await fetch(IP_ENDPOINT, { signal: timeout(8_000) });
  if (!res.ok) throw new Error(`ip geolocation returned ${res.status}`);
  const data = (await res.json()) as { latitude?: number; longitude?: number; city?: string; country_name?: string; org?: string };
  if (typeof data.latitude !== "number" || typeof data.longitude !== "number") {
    throw new Error("ip geolocation returned no coordinates");
  }
  return {
    lat: data.latitude,
    lon: data.longitude,
    accuracyM: 5_000,
    altitudeM: null,
    altitudeAccuracyM: null,
    headingDeg: null,
    speedMps: null,
    source: "ip",
    at: Date.now(),
    note: `ip estimate near ${data.city ?? "unknown city"}, ${data.country_name ?? ""} via ${data.org ?? "unknown network"} — city level at best, and a vpn moves it entirely`.trim(),
  };
}

export interface AcquireResult {
  fix: LocationFix | null;
  attempted: { source: string; ok: boolean; detail: string }[];
}

/**
 * Try the accurate source first, fall through, and report every attempt — the
 * operator needs to know a pin is an ip guess because gps was denied, not just
 * that a pin exists.
 */
export async function acquireFix(extra: LocationFix[] = []): Promise<AcquireResult> {
  const attempted: AcquireResult["attempted"] = [];
  const candidates: LocationFix[] = [...extra];

  for (const f of extra) attempted.push({ source: f.source, ok: true, detail: f.note });

  try {
    const fix = await gpsFix();
    candidates.push(fix);
    attempted.push({ source: fix.source, ok: true, detail: `±${fix.accuracyM} m` });
  } catch (e) {
    attempted.push({ source: "gps", ok: false, detail: e instanceof Error ? e.message : "gps unavailable" });
  }

  if (!candidates.some((c) => c.accuracyM <= 200)) {
    try {
      const fix = await ipFix();
      candidates.push(fix);
      attempted.push({ source: "ip", ok: true, detail: `±${fix.accuracyM} m` });
    } catch (e) {
      attempted.push({ source: "ip", ok: false, detail: e instanceof Error ? e.message : "ip lookup failed" });
    }
  }

  return { fix: bestFix(candidates), attempted };
}

// ── reverse geocoding ────────────────────────────────────────────────────────
// OpenStreetMap Nominatim, one request per second maximum and cached per ~11 m
// cell, because hammering it is both rude and a way to get blocked mid-session.

const geocodeCache = new Map<string, string>();
let lastGeocodeAt = 0;

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = geocodeCache.get(key);
  if (cached) return cached;

  const wait = 1_100 - (Date.now() - lastGeocodeAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocodeAt = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: timeout(9_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    const name = data.display_name ?? null;
    if (name) {
      geocodeCache.set(key, name);
      if (geocodeCache.size > 500) geocodeCache.delete(geocodeCache.keys().next().value as string);
    }
    return name;
  } catch {
    return null;
  }
}
