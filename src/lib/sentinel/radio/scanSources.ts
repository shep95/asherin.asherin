// asherin.sentinel — where advertisement packets come from.
//
// Three receivers, ranked by what each can actually deliver:
//
//   companion  — the desktop process running a real OS scanner. it sees the
//                hardware address, manufacturer payload, service data and
//                classic class-of-device. this is the only source that can
//                answer "is your own address randomized?".
//   native     — the packaged mobile build, holding the radio through
//                backgrounding. address is a platform handle, not a MAC.
//   web        — navigator.bluetooth.requestLEScan(). one explicit grant, tab
//                must stay open, and the address is a rotating session id.
//
// Where a receiver is absent the panel says so. It never fabricates a roster.

import { isNativeApp } from "@/lib/native/nativeRuntime";
import { startNativeScan, type NativeAdvert } from "@/lib/native/nativeBle";
import type { AdvertPacket } from "./leakSurface";

export type ScanSource = "companion" | "native" | "web";

export interface ScanHandle {
  source: ScanSource;
  stop: () => void;
}

export interface ScanSupport {
  companion: boolean;
  native: boolean;
  web: boolean;
  note: string;
}

const COMPANION_URL = "ws://127.0.0.1:8769";

export async function detectSupport(): Promise<ScanSupport> {
  const native = isNativeApp();
  const bluetooth = typeof navigator !== "undefined" ? (navigator as Navigator & { bluetooth?: Record<string, unknown> }).bluetooth : undefined;
  const web = Boolean(bluetooth && typeof bluetooth.requestLEScan === "function");
  const companion = await companionReachable();
  const note = companion
    ? "desktop companion is scanning — real hardware addresses, manufacturer payloads and class-of-device are readable."
    : native
      ? "mobile radio is available. addresses are platform handles, so address randomization of nearby devices cannot be judged from here."
      : web
        ? "browser scanning is available behind a one-time permission. the tab must stay open and addresses are rotating session handles."
        : "no bluetooth receiver is available in this environment. chrome needs the experimental web platform features flag for scanning; the desktop companion is the reliable path.";
  return { companion, native, web, note };
}

async function companionReachable(): Promise<boolean> {
  if (typeof WebSocket === "undefined") return false;
  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      try {
        socket?.close();
      } catch {
        /* already closing */
      }
      resolve(value);
    };
    try {
      socket = new WebSocket(COMPANION_URL);
    } catch {
      resolve(false);
      return;
    }
    socket.onopen = () => done(true);
    socket.onerror = () => done(false);
    setTimeout(() => done(false), 1_500);
  });
}

/** Companion stream. Reconnects with backoff; a dropped companion is reported
 *  as a gap by the caller rather than being papered over. */
export function scanViaCompanion(
  onPacket: (packet: AdvertPacket) => void,
  onStatus: (status: string, connected: boolean) => void,
): ScanHandle {
  let socket: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (stopped) return;
    try {
      socket = new WebSocket(COMPANION_URL);
    } catch {
      schedule();
      return;
    }
    socket.onopen = () => {
      attempt = 0;
      onStatus("companion scanner connected", true);
      socket?.send(JSON.stringify({ action: "scan-start" }));
    };
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as { type?: string; packet?: unknown; message?: string };
        if (msg.type === "advert" && msg.packet) onPacket(normalizeCompanion(msg.packet as Record<string, unknown>));
        else if (msg.type === "error") onStatus(msg.message ?? "companion scanner error", true);
      } catch {
        /* a malformed frame is dropped, never crashes the stream */
      }
    };
    socket.onclose = () => {
      onStatus("companion scanner disconnected", false);
      schedule();
    };
    socket.onerror = () => {
      try {
        socket?.close();
      } catch {
        /* handled by onclose */
      }
    };
  };

  const schedule = () => {
    if (stopped) return;
    attempt += 1;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
    retry = setTimeout(connect, delay);
  };

  connect();

  return {
    source: "companion",
    stop: () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      try {
        socket?.send(JSON.stringify({ action: "scan-stop" }));
        socket?.close();
      } catch {
        /* socket already gone */
      }
    },
  };
}

function normalizeCompanion(raw: Record<string, unknown>): AdvertPacket {
  const manufacturerData: Record<number, number[]> = {};
  const md = (raw.manufacturerData ?? {}) as Record<string, number[]>;
  for (const key of Object.keys(md)) manufacturerData[Number(key)] = md[key] ?? [];
  return {
    address: String(raw.address ?? "unknown"),
    addressIsHardware: true,
    name: (raw.name as string) || null,
    rssi: typeof raw.rssi === "number" ? raw.rssi : null,
    txPower: typeof raw.txPower === "number" ? raw.txPower : null,
    serviceUuids: Array.isArray(raw.serviceUuids) ? (raw.serviceUuids as string[]) : [],
    manufacturerData,
    serviceData: (raw.serviceData as Record<string, number[]>) ?? {},
    appearance: typeof raw.appearance === "number" ? raw.appearance : null,
    deviceClass: typeof raw.deviceClass === "number" ? raw.deviceClass : null,
    at: typeof raw.at === "number" ? raw.at : Date.now(),
  };
}

export async function scanViaNative(onPacket: (packet: AdvertPacket) => void): Promise<ScanHandle> {
  const handle = await startNativeScan((advert: NativeAdvert) => {
    onPacket({
      address: advert.id,
      addressIsHardware: false,
      name: advert.name,
      rssi: advert.rssi,
      txPower: advert.txPower,
      serviceUuids: advert.serviceUuids ?? [],
      manufacturerData: {},
      appearance: null,
      at: advert.ts || Date.now(),
    });
  });
  return { source: "native", stop: () => void handle.stop() };
}

/** Browser LE scan. Requires an explicit user gesture to grant, and in chrome
 *  the flag. Rejecting loudly beats an empty roster that looks like silence. */
export async function scanViaWeb(onPacket: (packet: AdvertPacket) => void): Promise<ScanHandle> {
  const bluetooth = (navigator as Navigator & { bluetooth?: Record<string, unknown> }).bluetooth;
  if (!bluetooth || typeof bluetooth.requestLEScan !== "function") {
    throw new Error(
      "this browser cannot scan for bluetooth advertisements. chrome needs chrome://flags/#enable-experimental-web-platform-features, or run the desktop companion.",
    );
  }
  const scan = (await (bluetooth.requestLEScan as (o: unknown) => Promise<{ stop: () => void }>)({
    acceptAllAdvertisements: true,
    keepRepeatedDevices: true,
  })) as { stop: () => void };

  const handler = (event: Event) => {
    const e = event as Event & {
      device?: { id?: string; name?: string };
      rssi?: number;
      txPower?: number;
      appearance?: number;
      uuids?: string[];
      manufacturerData?: Map<number, DataView>;
      serviceData?: Map<string, DataView>;
    };
    const manufacturerData: Record<number, number[]> = {};
    e.manufacturerData?.forEach((view, id) => {
      manufacturerData[id] = Array.from(new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)));
    });
    const serviceData: Record<string, number[]> = {};
    e.serviceData?.forEach((view, uuid) => {
      serviceData[uuid] = Array.from(new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)));
    });
    onPacket({
      address: e.device?.id ?? "session",
      addressIsHardware: false,
      name: e.device?.name || null,
      rssi: typeof e.rssi === "number" ? e.rssi : null,
      txPower: typeof e.txPower === "number" ? e.txPower : null,
      serviceUuids: Array.isArray(e.uuids) ? e.uuids : [],
      manufacturerData,
      serviceData,
      appearance: typeof e.appearance === "number" ? e.appearance : null,
      at: Date.now(),
    });
  };

  (bluetooth as unknown as EventTarget).addEventListener("advertisementreceived", handler);
  return {
    source: "web",
    stop: () => {
      (bluetooth as unknown as EventTarget).removeEventListener("advertisementreceived", handler);
      try {
        scan.stop();
      } catch {
        /* scan already ended with the permission */
      }
    },
  };
}
