import { isNativeApp } from "@/lib/native/nativeRuntime";
import { startNativeScan, listNativeBonded } from "@/lib/native/nativeBle";

// Scanner brain — wraps Web Bluetooth into a uniform sweep stream.
//
// Reality check baked into this module:
//  • requestLEScan: continuous, advertisement-level, Chrome-on-Android with the
//    "Experimental Web Platform features" flag. Gives RSSI, manufacturerData,
//    serviceData. Best mode.
//  • requestDevice: a one-shot picker. No RSSI on the picked record, but it
//    persists into navigator.bluetooth.getDevices() ("paired" set) and lets us
//    pull GATT later. Fallback mode.
//
// We never claim "scanning" if we can only do the picker.

//  • native: the Asherin companion app (Capacitor). Holds the radio while
//    backgrounded and while the screen is off — the only mode that samples the
//    hours a stalking pattern actually happens in.

export type ScanMode = "native" | "continuous" | "picker" | "unsupported";

export interface RawAdvert {
  id: string;
  name: string | null;
  rssi: number | null;
  txPower: number | null;
  manufacturer: string | null;
  serviceUuids: string[];
  ts: number;
  /** Web Bluetooth BluetoothDevice handle when available — needed for GATT. */
  device?: any;
}

// Bluetooth SIG company IDs (subset commonly seen on advertisements).
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

function decodeManufacturer(map: any): string | null {
  if (!map || typeof map.forEach !== "function") return null;
  let label: string | null = null;
  map.forEach((_value: unknown, key: number) => {
    if (label) return;
    label = COMPANY_IDS[key] ?? `Company ID 0x${key.toString(16).padStart(4, "0")}`;
  });
  return label;
}

export function detectScanMode(): ScanMode {
  if (isNativeApp()) return "native";
  if (typeof navigator === "undefined" || !("bluetooth" in (navigator as any))) return "unsupported";
  const bt = (navigator as any).bluetooth;
  if (typeof bt?.requestLEScan === "function") return "continuous";
  return "picker";
}

export interface ScannerHandle {
  mode: ScanMode;
  stop: () => Promise<void>;
}

export async function startScan(onAdvert: (a: RawAdvert) => void): Promise<ScannerHandle> {
  const mode = detectScanMode();

  // Native companion: the radio keeps running when the app leaves the screen,
  // so this branch is preferred whenever it exists.
  if (mode === "native") {
    const handle = await startNativeScan((a) => onAdvert({ ...a }));
    return { mode, stop: handle.stop };
  }

  if (mode === "unsupported") {
    throw new Error(
      "Web Bluetooth is not available. Install the Asherin companion app, or use Chrome on Android.",
    );
  }
  const bt = (navigator as any).bluetooth;


  if (mode === "continuous") {
    const handler = (event: any) => {
      const dev = event.device;
      onAdvert({
        id: dev?.id ?? "anon",
        name: dev?.name ?? event.name ?? null,
        rssi: typeof event.rssi === "number" ? event.rssi : null,
        txPower: typeof event.txPower === "number" ? event.txPower : null,
        manufacturer: decodeManufacturer(event.manufacturerData),
        serviceUuids: Array.isArray(event.uuids) ? event.uuids : [],
        ts: Date.now(),
        device: dev,
      });
    };
    bt.addEventListener("advertisementreceived", handler);
    const scan = await bt.requestLEScan({ acceptAllAdvertisements: true, keepRepeatedDevices: true });
    return {
      mode,
      stop: async () => {
        try { scan.stop(); } catch { /* noop */ }
        bt.removeEventListener("advertisementreceived", handler);
      },
    };
  }

  // Picker mode: caller triggers pickOne separately. Here we no-op the loop.
  return { mode, stop: async () => { /* noop */ } };
}

export async function pickOne(onAdvert: (a: RawAdvert) => void): Promise<void> {
  const bt = (navigator as any)?.bluetooth;
  if (!bt) throw new Error("Web Bluetooth not available.");
  const device = await bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: [
      "device_information",
      "battery_service",
      "generic_access",
    ],
  });
  onAdvert({
    id: device.id,
    name: device.name ?? null,
    rssi: null,
    txPower: null,
    manufacturer: null,
    serviceUuids: [],
    ts: Date.now(),
    device,
  });
}

/** Pull paired/bonded devices already known to this origin or to the OS. */
export async function listPaired(): Promise<RawAdvert[]> {
  if (isNativeApp()) return listNativeBonded();
  const bt = (navigator as any)?.bluetooth;
  if (!bt || typeof bt.getDevices !== "function") return [];
  try {
    const devs = await bt.getDevices();
    return (devs as any[]).map((d) => ({
      id: d.id,
      name: d.name ?? null,
      rssi: null,
      txPower: null,
      manufacturer: null,
      serviceUuids: [],
      ts: Date.now(),
      device: d,
    }));
  } catch {
    return [];
  }
}
