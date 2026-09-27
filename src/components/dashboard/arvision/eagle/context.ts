// eagle.eye — capture context.
//
// an evidence frame is worth little without the answers to "when, where, and
// from which network". this module gathers exactly those three, and it never
// guesses: a denied geolocation permission is recorded as denied, an unreachable
// ip service is recorded as unavailable. a police-facing package that invents a
// coordinate is worse than one that admits it has none.

export interface CaptureContext {
  capturedAtMs: number;
  isoUtc: string;
  isoLocal: string;
  timezone: string;
  utcOffsetMinutes: number;
  coords: { lat: number; lng: number; accuracyM: number | null; altitudeM: number | null } | null;
  coordsStatus: "fixed" | "denied" | "unavailable" | "not-requested";
  coordsSource: string;
  ipAddress: string | null;
  ipStatus: "resolved" | "unavailable";
  ipSource: string;
}

const IP_TTL_MS = 10 * 60 * 1000;
let ipCache: { value: string | null; at: number; source: string } | null = null;

function localIso(d: Date): string {
  const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

async function resolvePublicIp(): Promise<{ value: string | null; source: string }> {
  if (ipCache && Date.now() - ipCache.at < IP_TTL_MS) return { value: ipCache.value, source: ipCache.source };
  const endpoints: Array<{ url: string; pick: (j: Record<string, unknown>) => string | undefined }> = [
    { url: "https://api.ipify.org?format=json", pick: (j) => j.ip as string | undefined },
    { url: "https://ipapi.co/json/", pick: (j) => j.ip as string | undefined },
  ];
  for (const ep of endpoints) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(ep.url, { signal: ctrl.signal });
      if (!r.ok) continue;
      const j = (await r.json()) as Record<string, unknown>;
      const ip = ep.pick(j);
      if (ip) {
        ipCache = { value: ip, at: Date.now(), source: new URL(ep.url).hostname };
        return { value: ip, source: ipCache.source };
      }
    } catch {
      /* try the next endpoint */
    } finally {
      clearTimeout(t);
    }
  }
  ipCache = { value: null, at: Date.now(), source: "unavailable" };
  return { value: null, source: "unavailable" };
}

let lastFix: { coords: NonNullable<CaptureContext["coords"]>; at: number } | null = null;

export function cacheFix(pos: GeolocationPosition) {
  lastFix = {
    at: Date.now(),
    coords: {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
      altitudeM: pos.coords.altitude ?? null,
    },
  };
}

async function resolveCoords(timeoutMs = 8000): Promise<Pick<CaptureContext, "coords" | "coordsStatus" | "coordsSource">> {
  // a recent watchPosition fix is preferable to blocking the capture on a new
  // one: evidence must be written while the behaviour is still on screen.
  if (lastFix && Date.now() - lastFix.at < 60_000) {
    return { coords: lastFix.coords, coordsStatus: "fixed", coordsSource: "device gps / platform location, cached fix under 60s" };
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { coords: null, coordsStatus: "unavailable", coordsSource: "this device exposes no location api" };
  }
  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cacheFix(pos);
        resolve({ coords: lastFix!.coords, coordsStatus: "fixed", coordsSource: "device gps / platform location" });
      },
      (err) => resolve({
        coords: null,
        coordsStatus: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
        coordsSource: err.code === err.PERMISSION_DENIED
          ? "location permission was refused for this site"
          : `location could not be fixed (${err.message || "unavailable"})`,
      }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 },
    );
  });
}

export async function captureContext(): Promise<CaptureContext> {
  const now = new Date();
  const [geo, ip] = await Promise.all([resolveCoords(), resolvePublicIp()]);
  return {
    capturedAtMs: now.getTime(),
    isoUtc: now.toISOString(),
    isoLocal: localIso(now),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
    utcOffsetMinutes: -now.getTimezoneOffset(),
    ...geo,
    ipAddress: ip.value,
    ipStatus: ip.value ? "resolved" : "unavailable",
    ipSource: ip.source,
  };
}

/** one-line human summary used on the burned-in stamp and in the report. */
export function contextLine(c: CaptureContext): string {
  const where = c.coords
    ? `${c.coords.lat.toFixed(6)}, ${c.coords.lng.toFixed(6)}${c.coords.accuracyM ? ` ±${Math.round(c.coords.accuracyM)}m` : ""}`
    : `location ${c.coordsStatus}`;
  const net = c.ipAddress ? `ip ${c.ipAddress}` : "ip unavailable";
  return `${c.isoLocal} (${c.timezone}, utc${c.utcOffsetMinutes >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(c.utcOffsetMinutes) / 60)).padStart(2, "0")}:${String(Math.abs(c.utcOffsetMinutes) % 60).padStart(2, "0")}) · ${where} · ${net}`;
}
