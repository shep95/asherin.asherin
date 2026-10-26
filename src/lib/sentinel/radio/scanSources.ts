// asherin.sentinel — where advertisement packets come from.
//
// Two receivers, ranked by what each can actually deliver:
//
//   native     — the packaged mobile build, holding the radio through
//                backgrounding. address is a platform handle, not a MAC.
//   web        — navigator.bluetooth.requestLEScan(). one explicit grant, tab
//                must stay open, and the address is a rotating session id.
//
// The hosted edition had a third: a desktop companion process reached over a
// loopback websocket. That companion is not part of the local edition, and a
// probe for it on every mount was a connection attempt the room could not
// explain, so it is gone. Where a receiver is absent the panel says so. It
// never fabricates a roster.

import { isNativeApp } from "@/lib/native/nativeRuntime";
import { startNativeScan, type NativeAdvert } from "@/lib/native/nativeBle";
import type { AdvertPacket } from "./leakSurface";

export type ScanSource = "native" | "web";

export interface ScanHandle {
  source: ScanSource;
  stop: () => void;
}

export interface ScanSupport {
  native: boolean;
  web: boolean;
  note: string;
}

export function detectSupport(): ScanSupport {
  const native = isNativeApp();
  const bluetooth = typeof navigator !== "undefined" ? (navigator as Navigator & { bluetooth?: Record<string, unknown> }).bluetooth : undefined;
  const web = Boolean(bluetooth && typeof bluetooth.requestLEScan === "function");
  const note = native
    ? "mobile radio is available. addresses are platform handles, so address randomization of nearby devices cannot be judged from here."
    : web
      ? "browser scanning is available behind a one-time permission. the tab must stay open and addresses are rotating session handles."
      : "this browser cannot receive bluetooth advertisements. chrome needs chrome://flags/#enable-experimental-web-platform-features; firefox and safari have no scanning api.";
  return { native, web, note };
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
      "this browser cannot scan for bluetooth advertisements. chrome needs chrome://flags/#enable-experimental-web-platform-features.",
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
