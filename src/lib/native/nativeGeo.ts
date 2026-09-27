import { Geolocation, type PositionOptions } from "@capacitor/geolocation";
import { isNativeApp } from "./nativeRuntime";

/**
 * NATIVE GEOLOCATION BRIDGE
 *
 * On the web the only fix source is `navigator.geolocation`, which a mobile OS
 * suspends the moment the app leaves the foreground. Inside the companion app
 * the OS-level plugin holds the fix stream instead, so the watch survives the
 * screen going off. This module is the single seam between the two: callers ask
 * for a watch and get whichever runtime is actually present.
 *
 * Errors are never thrown outward — a denied permission degrades to "no fixes",
 * exactly as a web geolocation error does, so the Sentinel's two legs keep the
 * same failure shape on both runtimes.
 */

export type Fix = { lat: number; lng: number; accuracy?: number };
export type GeoHandle = { stop: () => void };

/**
 * A full sensor sample, not just a point. The trip black box needs the sensor's
 * own Doppler speed and heading — a speed derived from successive coordinates
 * inherits every metre of GPS jitter and turns a parked car into a swerve.
 */
export type GeoSample = {
  t: number;
  lat: number;
  lon: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading_deg: number | null;
  altitude_m: number | null;
};

/** A refusal is terminal; anything else is a gap that may close by itself. */
export type GeoErrorKind = "denied" | "transient";


const OPTS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15_000,
  timeout: 20_000,
};

/** Ask once. A denial is a final answer for this launch, not a retry loop. */
export async function ensureNativePermission(): Promise<boolean> {
  try {
    const status = await Geolocation.checkPermissions();
    const granted = status.location === "granted" || (status as any).coarseLocation === "granted";
    if (granted) return true;
    if (status.location === "denied") return false;
    const asked = await Geolocation.requestPermissions({ permissions: ["location"] });
    return asked.location === "granted" || (asked as any).coarseLocation === "granted";
  } catch {
    return false;
  }
}

/**
 * Starts a fix stream on the best runtime available. Returns a handle whose
 * `stop()` is idempotent and safe before the async start has resolved.
 */
export function watchPosition(
  onFix: (fix: Fix) => void,
  onError: () => void,
): GeoHandle {
  let stopped = false;

  if (isNativeApp()) {
    let watchId: string | null = null;
    void (async () => {
      if (!(await ensureNativePermission())) { onError(); return; }
      try {
        const id = await Geolocation.watchPosition(OPTS, (p, err) => {
          if (stopped) return;
          if (err || !p) { onError(); return; }
          onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
        });
        if (stopped) { void Geolocation.clearWatch({ id }); return; }
        watchId = id;
      } catch {
        onError();
      }
    })();
    return {
      stop: () => {
        stopped = true;
        if (watchId) { void Geolocation.clearWatch({ id: watchId }).catch(() => undefined); watchId = null; }
      },
    };
  }

  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    onError();
    return { stop: () => undefined };
  }

  const id = navigator.geolocation.watchPosition(
    (p) => {
      if (stopped) return;
      onFix({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
    },
    () => { if (!stopped) onError(); },
    // The web leg stays low-accuracy: it runs in a tab that pays for the radio
    // in battery the user did not opt into by installing an app.
    { enableHighAccuracy: false, maximumAge: 15_000, timeout: 20_000 },
  );

  return {
    stop: () => {
      stopped = true;
      try { navigator.geolocation.clearWatch(id); } catch { /* noop */ }
    },
  };
}

// ── Full-sample watch (trip black box, auto-arm sentinel) ───────────────────

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function toSample(c: {
  latitude: number; longitude: number; accuracy?: number | null;
  speed?: number | null; heading?: number | null; altitude?: number | null;
}, timestamp?: number): GeoSample {
  const speed = num(c.speed);
  const heading = num(c.heading);
  const alt = num(c.altitude);
  const acc = num(c.accuracy);
  return {
    t: timestamp && Number.isFinite(timestamp) ? timestamp : Date.now(),
    lat: c.latitude,
    lon: c.longitude,
    accuracy_m: acc === null ? null : Math.round(acc * 10) / 10,
    // A negative speed is the platform saying "unknown", not "reversing".
    speed_mps: speed === null || speed < 0 ? null : Math.round(speed * 100) / 100,
    heading_deg: heading === null || heading < 0 ? null : Math.round(heading),
    altitude_m: alt === null ? null : Math.round(alt),
  };
}

/**
 * Watch the richest fix stream this runtime can give.
 *
 * WHY THIS EXISTS: the trip recorder and the auto-arm sentinel both called
 * `navigator.geolocation.watchPosition` directly. Inside the companion app that
 * is the WebView's geolocation, which the OS suspends the instant the screen
 * locks — precisely the moment a rider is in the back seat with the phone in a
 * pocket. The Capacitor plugin holds an OS-level watch that survives it. Same
 * callback shape on both runtimes, so callers carry no branch.
 */
export function watchSamples(
  onSample: (s: GeoSample) => void,
  onError: (kind: GeoErrorKind) => void,
  opts?: { highAccuracy?: boolean; maximumAge?: number; timeout?: number },
): GeoHandle {
  let stopped = false;
  const highAccuracy = opts?.highAccuracy ?? true;
  const maximumAge = opts?.maximumAge ?? 0;
  const timeout = opts?.timeout ?? 30_000;

  if (isNativeApp()) {
    let watchId: string | null = null;
    void (async () => {
      if (!(await ensureNativePermission())) { if (!stopped) onError("denied"); return; }
      try {
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: highAccuracy, maximumAge, timeout },
          (p, err) => {
            if (stopped) return;
            if (err || !p) { onError("transient"); return; }
            onSample(toSample(p.coords, p.timestamp));
          },
        );
        if (stopped) { void Geolocation.clearWatch({ id }).catch(() => undefined); return; }
        watchId = id;
      } catch {
        if (!stopped) onError("transient");
      }
    })();
    return {
      stop: () => {
        stopped = true;
        if (watchId) { void Geolocation.clearWatch({ id: watchId }).catch(() => undefined); watchId = null; }
      },
    };
  }

  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    onError("denied");
    return { stop: () => undefined };
  }

  const id = navigator.geolocation.watchPosition(
    (p) => { if (!stopped) onSample(toSample(p.coords, p.timestamp)); },
    (err) => {
      if (stopped) return;
      onError(err.code === err.PERMISSION_DENIED ? "denied" : "transient");
    },
    { enableHighAccuracy: highAccuracy, maximumAge, timeout },
  );

  return {
    stop: () => {
      stopped = true;
      try { navigator.geolocation.clearWatch(id); } catch { /* noop */ }
    },
  };
}
