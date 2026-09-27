import { BleClient, type ScanResult } from "@capacitor-community/bluetooth-le";
import { isNativeApp } from "./nativeRuntime";

/**
 * NATIVE BLE SUBSTRATE
 *
 * Web Bluetooth gives us advertisements only while a tab is focused. The native
 * companion holds the radio through backgrounding and screen-off, so the
 * recurrence question — "has this same radio been near me across separate times
 * and separate places?" — finally gets sampled during the hours that matter.
 *
 * Design notes carried from the flaw pass:
 *  • initialize() is idempotent and guarded; a second start must not throw.
 *  • allowDuplicates is on, otherwise the OS collapses repeat sightings and the
 *    recurrence counter never advances.
 *  • Every callback is wrapped: a plugin-side throw must never kill the scan.
 *  • stop() is always safe to call, even if start failed halfway.
 */

export interface NativeAdvert {
  id: string;
  name: string | null;
  rssi: number | null;
  txPower: number | null;
  manufacturer: string | null;
  serviceUuids: string[];
  ts: number;
}

const COMPANY_IDS: Record<number, string> = {
  0x004c: "Apple, Inc.",
  0x0075: "Samsung Electronics",
  0x00e0: "Google, Inc.",
  0x0157: "Anhui Huami / Amazfit",
  0x0087: "Garmin International",
  0x0006: "Microsoft",
  0x038f: "Xiaomi Inc.",
  0x0499: "Ruuvi Innovations",
  0x004f: "Logitech",
};

let initialized = false;
let scanning = false;

async function ensureInit(): Promise<void> {
  if (initialized) return;
  await BleClient.initialize({ androidNeverForLocation: false });
  initialized = true;
}

function decodeManufacturer(data?: Record<string, DataView>): string | null {
  if (!data) return null;
  for (const key of Object.keys(data)) {
    const id = Number.parseInt(key, 10);
    if (Number.isNaN(id)) continue;
    return COMPANY_IDS[id] ?? `Company ID 0x${id.toString(16).padStart(4, "0")}`;
  }
  return null;
}

function toAdvert(r: ScanResult): NativeAdvert {
  return {
    // deviceId is a stable per-install handle on Android and a rotating UUID on
    // iOS; the server dedupes on it exactly the same way it does a web id.
    id: r.device?.deviceId ?? "anon",
    name: r.localName ?? r.device?.name ?? null,
    rssi: typeof r.rssi === "number" ? r.rssi : null,
    txPower: typeof r.txPower === "number" ? r.txPower : null,
    manufacturer: decodeManufacturer(r.manufacturerData as any),
    serviceUuids: Array.isArray(r.uuids) ? r.uuids : [],
    ts: Date.now(),
  };
}

export interface NativeScanHandle {
  stop: () => Promise<void>;
}

export async function startNativeScan(
  onAdvert: (a: NativeAdvert) => void,
): Promise<NativeScanHandle> {
  if (!isNativeApp()) throw new Error("Native scanning requires the Asherin companion app.");
  await ensureInit();
  if (scanning) {
    try { await BleClient.stopLEScan(); } catch { /* stale scan */ }
    scanning = false;
  }
  await BleClient.requestLEScan({ allowDuplicates: true }, (result) => {
    try { onAdvert(toAdvert(result)); } catch { /* a bad sample must not end the sweep */ }
  });
  scanning = true;
  return {
    stop: async () => {
      if (!scanning) return;
      scanning = false;
      try { await BleClient.stopLEScan(); } catch { /* already torn down */ }
    },
  };
}

/** Radios the OS already knows about — seeds the log before the first sweep. */
export async function listNativeBonded(): Promise<NativeAdvert[]> {
  if (!isNativeApp()) return [];
  try {
    await ensureInit();
    const devices = await BleClient.getBondedDevices();
    return devices.map((d) => ({
      id: d.deviceId,
      name: d.name ?? null,
      rssi: null,
      txPower: null,
      manufacturer: null,
      serviceUuids: [],
      ts: Date.now(),
    }));
  } catch {
    return [];
  }
}

export async function nativeBleEnabled(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    await ensureInit();
    return await BleClient.isEnabled();
  } catch {
    return false;
  }
}
