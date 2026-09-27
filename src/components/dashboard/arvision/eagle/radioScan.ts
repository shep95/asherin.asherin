// eagle.eye — passive radio observation.
//
// the operator does not want to *connect* to anything. they want what a phone's
// bluetooth settings screen shows: the names and ids of radios advertising
// themselves nearby — on a person in frame, in a pocket, or left behind on a
// surface — with no pairing, no gatt, no handshake.
//
// that is exactly what a bluetooth low energy *advertisement* is: a packet the
// device broadcasts to the world, unprompted, so scanners can list it. reading
// it is passive observation of a public broadcast, not access to the device.
//
// the browser surface for that is `navigator.bluetooth.requestLEScan()`. it is
// gated behind an explicit one-time user grant, and in chrome it currently sits
// behind the experimental web platform features flag. where it exists we get a
// continuous roster. where it does not, we say so plainly and fall back to the
// pick-a-device path — we never fabricate a scan result.
//
// two boundaries hold, because breaking either produces evidence a court throws
// out:
//   1. a radio in range is a radio in range. it is never attribution to a person
//      in frame. every surface that prints one repeats that.
//   2. modern phones rotate their bluetooth address every ~15 minutes, so an id
//      is an id *for this session*. the fingerprint below is a similarity hint,
//      never an identity claim.

export type RadioMotion = "approaching" | "receding" | "steady" | "stationary" | "unknown";

export interface RadioSighting {
  /** the browser-scoped device id for this session. rotates with the address. */
  id: string;
  /** the advertised local name, when the device publishes one. */
  name: string | null;
  /** vendor decoded from the assigned company identifier in manufacturer data. */
  vendor: string | null;
  /** company identifier as advertised, kept raw for the evidence package. */
  companyId: number | null;
  /** advertised service uuids — often what a device class is inferable from. */
  services: string[];
  /** advertised appearance code, when present. */
  appearance: number | null;
  rssi: number | null;
  txPower: number | null;
  /** coarse band from log-distance path loss. a band, never a fix. */
  meters: number | null;
  /** stable-ish hash of the *published* traits, for re-linking across rotation. */
  fingerprint: string;
  firstSeenMs: number;
  lastSeenMs: number;
  /** how many advertisement packets this session has carried. */
  packets: number;
  /** rolling rssi window used for the motion read. */
  history: number[];
  motion: RadioMotion;
}

// bluetooth sig assigned company identifiers — the ones a camera in a public
// space actually meets. anything unlisted prints its raw id rather than a guess.
const COMPANY: Record<number, string> = {
  0x004c: "Apple",
  0x0006: "Microsoft",
  0x00e0: "Google",
  0x0075: "Samsung",
  0x0087: "Garmin",
  0x000f: "Broadcom",
  0x0059: "Nordic Semiconductor",
  0x0499: "Ruuvi",
  0x0157: "Anhui Huami (Amazfit)",
  0x038f: "Xiaomi",
  0x0171: "Amazon",
  0x0131: "Cypress",
  0x02e5: "Espressif",
  0x0118: "Fitbit",
  0x01d7: "Tile",
  0x0110: "Sonos",
  0x00d2: "Logitech",
  0x0201: "GoPro",
  0x05a7: "Sonova",
  0x0822: "Adafruit",
};

export function vendorForCompanyId(id: number | null): string | null {
  if (id === null || !Number.isFinite(id)) return null;
  return COMPANY[id] ?? null;
}

/** the same log-distance relation the roster already uses, kept in one place so
 * the scan and the paired-device path never disagree with each other. */
export function metersFromRssi(rssi: number | null, txPower: number | null): number | null {
  if (rssi === null || rssi === undefined || !Number.isFinite(rssi)) return null;
  const ref = txPower !== null && txPower !== undefined && Number.isFinite(txPower) ? txPower : -59;
  const d = Math.pow(10, (ref - rssi) / 20);
  if (!Number.isFinite(d) || d <= 0) return null;
  return Math.round(Math.min(120, d) * 10) / 10;
}

/** a similarity hint built only from traits the device chose to publish. it
 * survives an address rotation often enough to be useful and is labelled a hint
 * everywhere it is shown, because two identical earbuds share it. */
export function radioFingerprint(input: {
  name: string | null;
  companyId: number | null;
  services: string[];
  appearance: number | null;
}): string {
  const parts = [
    (input.name ?? "").toLowerCase().trim(),
    input.companyId === null ? "" : `c${input.companyId.toString(16)}`,
    [...input.services].map((s) => s.toLowerCase()).sort().join(","),
    input.appearance === null ? "" : `a${input.appearance}`,
  ].join("|");
  let h = 2166136261;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** motion from the rssi trend. rf through a body or a bag moves this by metres,
 * so the wording downstream is "signal is rising", not "walking towards you". */
export function motionFromHistory(history: number[]): RadioMotion {
  if (history.length < 4) return "unknown";
  const w = history.slice(-8);
  const half = Math.floor(w.length / 2);
  const avg = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
  const delta = avg(w.slice(half)) - avg(w.slice(0, half));
  const spread = Math.max(...w) - Math.min(...w);
  if (delta > 4) return "approaching";
  if (delta < -4) return "receding";
  // a radio whose signal barely moves over a long window is sitting on a
  // surface or in a bag that is not moving — the "left behind" read.
  if (spread <= 3) return "stationary";
  return "steady";
}

export function motionLabel(m: RadioMotion): string {
  switch (m) {
    case "approaching": return "signal rising — closing on the camera";
    case "receding": return "signal falling — moving away";
    case "stationary": return "signal flat — unattended or set down";
    case "steady": return "signal varying — moving within range";
    default: return "not enough packets to read movement";
  }
}

export function proximityBandFor(meters: number | null): string {
  if (meters === null) return "range not reported";
  if (meters < 1.5) return "arm's reach of the camera";
  if (meters < 6) return "same room / close approach";
  if (meters < 20) return "nearby";
  return "distant or heavily attenuated";
}

/** fold one advertisement into the roster without mutating the previous state. */
export function mergeSighting(prev: RadioSighting | undefined, next: {
  id: string;
  name: string | null;
  companyId: number | null;
  services: string[];
  appearance: number | null;
  rssi: number | null;
  txPower: number | null;
  at: number;
}): RadioSighting {
  const history = [...(prev?.history ?? []), ...(next.rssi === null ? [] : [next.rssi])].slice(-16);
  const name = next.name ?? prev?.name ?? null;
  const companyId = next.companyId ?? prev?.companyId ?? null;
  const services = next.services.length ? next.services : prev?.services ?? [];
  const appearance = next.appearance ?? prev?.appearance ?? null;
  const rssi = next.rssi ?? prev?.rssi ?? null;
  const txPower = next.txPower ?? prev?.txPower ?? null;
  return {
    id: next.id,
    name,
    vendor: vendorForCompanyId(companyId),
    companyId,
    services,
    appearance,
    rssi,
    txPower,
    meters: metersFromRssi(rssi, txPower),
    fingerprint: radioFingerprint({ name, companyId, services, appearance }),
    firstSeenMs: prev?.firstSeenMs ?? next.at,
    lastSeenMs: next.at,
    packets: (prev?.packets ?? 0) + 1,
    history,
    motion: motionFromHistory(history),
  };
}

/** a radio that stops advertising has left, been switched off, or rotated its
 * address. the roster ages it out rather than pretending it is still there. */
export function pruneSightings(list: RadioSighting[], now: number, staleMs = 45_000): RadioSighting[] {
  return list.filter((s) => now - s.lastSeenMs <= staleMs);
}

export function displayName(s: RadioSighting): string {
  if (s.name) return s.name;
  if (s.vendor) return `${s.vendor} device (no advertised name)`;
  return "unnamed radio";
}

// ---------------------------------------------------------------------------
// the browser/native scan itself
// ---------------------------------------------------------------------------

import { startNativeScan } from "@/lib/native/nativeBle";
import { isNativeApp } from "@/lib/native/nativeRuntime";

interface ScanAdvertisementEvent {
  device?: { id?: string; name?: string | null };
  name?: string | null;
  rssi?: number | null;
  txPower?: number | null;
  appearance?: number | null;
  uuids?: string[];
  manufacturerData?: Map<number, DataView> | undefined;
}

type ScanNavigator = Navigator & {
  bluetooth?: {
    requestLEScan?: (opts: unknown) => Promise<{ active: boolean; stop: () => void }>;
    addEventListener?: (t: string, cb: (e: ScanAdvertisementEvent) => void) => void;
    removeEventListener?: (t: string, cb: (e: ScanAdvertisementEvent) => void) => void;
    getAvailability?: () => Promise<boolean>;
  };
};

export function passiveScanSupported(): boolean {
  if (isNativeApp()) return true;
  if (typeof navigator === "undefined") return false;
  const bt = (navigator as ScanNavigator).bluetooth;
  return !!bt && typeof bt.requestLEScan === "function";
}

export const SCAN_UNAVAILABLE_NOTE =
  "this browser does not expose bluetooth advertisement scanning. in chrome it lives behind chrome://flags/#enable-experimental-web-platform-features on a desktop or android build; safari and firefox do not ship it at all. nothing is inferred in its absence — the roster simply stays empty.";

/** normalise one advertisement event into the shape the roster folds in. */
export function readAdvertisement(e: ScanAdvertisementEvent, at = Date.now()) {
  let companyId: number | null = null;
  const md = e.manufacturerData;
  if (md && typeof (md as Map<number, DataView>).forEach === "function") {
    (md as Map<number, DataView>).forEach((_v, k) => {
      if (companyId === null) companyId = k;
    });
  }
  return {
    id: e.device?.id || "unknown-radio",
    name: (e.name ?? e.device?.name ?? null) || null,
    companyId,
    services: Array.isArray(e.uuids) ? e.uuids : [],
    appearance: typeof e.appearance === "number" ? e.appearance : null,
    rssi: typeof e.rssi === "number" ? e.rssi : null,
    txPower: typeof e.txPower === "number" ? e.txPower : null,
    at,
  };
}

/**
 * start a passive scan. no connection is attempted, ever — this only listens to
 * packets devices are already broadcasting. resolves with a stop function.
 */
export async function startPassiveScan(
  onSighting: (reading: ReturnType<typeof readAdvertisement>) => void,
): Promise<() => void> {
  if (isNativeApp()) {
    const handle = await startNativeScan((advert) => {
      onSighting({
        id: advert.id,
        name: advert.name,
        companyId: null,
        services: advert.serviceUuids,
        appearance: null,
        rssi: advert.rssi,
        txPower: advert.txPower,
        at: advert.ts,
      });
    });
    return () => { void handle.stop(); };
  }
  const bt = (navigator as ScanNavigator).bluetooth;
  if (!bt?.requestLEScan) throw new Error(SCAN_UNAVAILABLE_NOTE);
  const handler = (e: ScanAdvertisementEvent) => onSighting(readAdvertisement(e));
  bt.addEventListener?.("advertisementreceived", handler);
  const scan = await bt.requestLEScan({ acceptAllAdvertisements: true, keepRepeatedDevices: true });
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    bt.removeEventListener?.("advertisementreceived", handler);
    try { scan.stop(); } catch { /* the scan already ended with the page */ }
  };
}
