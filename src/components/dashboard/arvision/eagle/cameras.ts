// eagle.eye — camera fabric.
//
// the honest position on bluetooth: a browser cannot pull a video stream over
// web bluetooth. what web bluetooth can do is talk to a paired device's gatt
// services — battery, status, a start/stop characteristic. so bluetooth here is
// a *control and status* channel, and a bluetooth camera only appears in the
// video grid when the operating system already exposes it as a normal video
// input. saying otherwise would be a lie that fails in the field.

export interface CameraSlot {
  deviceId: string;
  label: string;
  stream: MediaStream | null;
  status: "idle" | "opening" | "live" | "denied" | "failed";
  error: string | null;
  openedAtMs: number | null;
}

export async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "videoinput");
}

/** labels are blank until one permission grant happens; ask once, then list. */
export async function primePermissions(): Promise<{ granted: boolean; error: string | null }> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    s.getTracks().forEach((t) => t.stop());
    return { granted: true, error: null };
  } catch (e) {
    return { granted: false, error: e instanceof Error ? e.message : "camera permission was refused" };
  }
}

export async function openCamera(deviceId: string): Promise<MediaStream> {
  return await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 15, max: 30 },
    },
    audio: false,
  });
}

export function closeStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

// ---------------------------------------------------------------------------
// bluetooth radio roster
// ---------------------------------------------------------------------------
//
// two honest boundaries survive here, because breaking either would produce a
// package a court would throw out. first: a browser cannot pull video over web
// bluetooth — bluetooth is a control, status and *presence* channel, and a
// bluetooth camera only reaches the video grid when the operating system also
// exposes it as a normal video input. second: a radio in range is a radio in
// range. it is never proof that a particular person is carrying it, and every
// surface that prints a radio says exactly that.
//
// what web bluetooth genuinely gives us, and what this module therefore reads:
// the user-chosen device's public gatt profile (manufacturer, model, firmware,
// serial, battery, appearance) and — where the browser implements it —
// advertisement events carrying rssi and tx power, from which a coarse distance
// band can be derived with the standard log-distance path-loss relation.

export interface BleLink {
  id: string;
  name: string;
  connected: boolean;
  batteryPercent: number | null;
  services: string[];
  note: string;
  manufacturer: string | null;
  model: string | null;
  firmware: string | null;
  serial: string | null;
  appearance: string | null;
  rssi: number | null;
  txPower: number | null;
  proximityMeters: number | null;
  advertising: boolean;
  firstSeenMs: number;
  lastSeenMs: number;
  /** how this radio came to be on the roster: a passive advertisement scan (no
   * connection at any point) or a device the operator explicitly picked. */
  source?: "scan" | "paired";
  /** plain reading of the signal trend — flat means set down or unattended. */
  observation?: string;
  /** similarity hint across an address rotation. never an identity claim. */
  fingerprint?: string;
  /** advertisement packets seen this session. */
  packets?: number;
}

interface BleAdvertisementEvent {
  rssi?: number | null;
  txPower?: number | null;
}

interface BleDeviceRef {
  id: string;
  name?: string;
  watchAdvertisements?: () => Promise<void>;
  addEventListener: (t: string, cb: (e: BleAdvertisementEvent) => void) => void;
  removeEventListener?: (t: string, cb: (e: BleAdvertisementEvent) => void) => void;
  gatt?: {
    connected?: boolean;
    connect: () => Promise<{
      connected: boolean;
      getPrimaryServices: () => Promise<Array<{ uuid: string; getCharacteristic: (u: string) => Promise<{ readValue: () => Promise<DataView> }> }>>;
      disconnect: () => void;
    }>;
  };
}

type BluetoothCapableNavigator = Navigator & {
  bluetooth?: { requestDevice: (opts: unknown) => Promise<BleDeviceRef> };
};

/** the paired device handles, kept so advertisement watching can start after
 * the pick and so a later capture can re-read a battery level. */
const deviceRefs = new Map<string, BleDeviceRef>();

export function bluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as BluetoothCapableNavigator).bluetooth;
}

const DEVICE_INFO = "0000180a-0000-1000-8000-00805f9b34fb";
const CHAR = {
  battery: "00002a19-0000-1000-8000-00805f9b34fb",
  manufacturer: "00002a29-0000-1000-8000-00805f9b34fb",
  model: "00002a24-0000-1000-8000-00805f9b34fb",
  serial: "00002a25-0000-1000-8000-00805f9b34fb",
  firmware: "00002a26-0000-1000-8000-00805f9b34fb",
  appearance: "00002a01-0000-1000-8000-00805f9b34fb",
};

/** free-space-ish log-distance path loss. it produces a *band*, not a fix, and
 * callers must present it as such: rf propagation through a body, a bag or a
 * wall changes this number by metres. */
export function estimateProximityMeters(rssi: number | null, txPower: number | null): number | null {
  if (rssi === null || rssi === undefined || !Number.isFinite(rssi)) return null;
  const ref = txPower !== null && txPower !== undefined && Number.isFinite(txPower) ? txPower : -59;
  const d = Math.pow(10, (ref - rssi) / 20);
  if (!Number.isFinite(d) || d <= 0) return null;
  return Math.round(Math.min(120, d) * 10) / 10;
}

export function proximityBand(meters: number | null): string {
  if (meters === null) return "range not reported by this browser";
  if (meters < 1.5) return "within arm's reach of the camera position";
  if (meters < 6) return "same room / close approach";
  if (meters < 20) return "nearby";
  return "distant or heavily attenuated";
}

const utf8 = (v: DataView) => new TextDecoder().decode(v).replace(/\u0000+$/, "").trim();

export async function pairBleDevice(): Promise<BleLink> {
  const nav = navigator as BluetoothCapableNavigator;
  if (!nav.bluetooth) throw new Error("this browser exposes no web bluetooth api");
  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ["battery_service", "device_information", "generic_access"],
  });
  deviceRefs.set(device.id, device);
  const now = Date.now();
  const link: BleLink = {
    id: device.id,
    name: device.name || "unnamed bluetooth device",
    connected: false,
    batteryPercent: null,
    services: [],
    note: "bluetooth carries control, status and presence only. a radio in range is not attribution to a person, and video appears in the grid solely when this operating system also exposes the device as a camera input.",
    manufacturer: null,
    model: null,
    firmware: null,
    serial: null,
    appearance: null,
    rssi: null,
    txPower: null,
    proximityMeters: null,
    advertising: false,
    firstSeenMs: now,
    lastSeenMs: now,
  };

  try {
    const server = await device.gatt?.connect();
    if (server) {
      link.connected = !!server.connected;
      const list = await server.getPrimaryServices().catch(() => []);
      for (const s of list) link.services.push(s.uuid);
      const read = async (uuidPart: string, char: string) => {
        const svc = list.find((s) => s.uuid.toLowerCase().includes(uuidPart));
        if (!svc) return null;
        try { return await svc.getCharacteristic(char).then((c) => c.readValue()); } catch { return null; }
      };
      const bat = await read("180f", CHAR.battery);
      if (bat) link.batteryPercent = bat.getUint8(0);
      const man = await read(DEVICE_INFO.slice(4, 8), CHAR.manufacturer);
      if (man) link.manufacturer = utf8(man) || null;
      const mdl = await read(DEVICE_INFO.slice(4, 8), CHAR.model);
      if (mdl) link.model = utf8(mdl) || null;
      const fw = await read(DEVICE_INFO.slice(4, 8), CHAR.firmware);
      if (fw) link.firmware = utf8(fw) || null;
      const sn = await read(DEVICE_INFO.slice(4, 8), CHAR.serial);
      if (sn) link.serial = utf8(sn) || null;
    }
  } catch {
    /* a device that refuses gatt is still a present radio worth recording */
  }
  return link;
}

/** start advertisement watching where the browser implements it. returns a stop
 * function; when the api is missing the roster simply never gains an rssi and
 * the ui says the range is unreported rather than inventing one. */
export function watchRadio(id: string, onUpdate: (patch: Partial<BleLink>) => void): () => void {
  const device = deviceRefs.get(id);
  if (!device || typeof device.watchAdvertisements !== "function") return () => undefined;
  const handler = (e: BleAdvertisementEvent) => {
    const rssi = typeof e.rssi === "number" ? e.rssi : null;
    const txPower = typeof e.txPower === "number" ? e.txPower : null;
    onUpdate({
      rssi,
      txPower,
      proximityMeters: estimateProximityMeters(rssi, txPower),
      advertising: true,
      lastSeenMs: Date.now(),
    });
  };
  device.addEventListener("advertisementreceived", handler);
  void device.watchAdvertisements().catch(() => undefined);
  return () => device.removeEventListener?.("advertisementreceived", handler);
}

/** re-read the volatile fields at capture time so the package carries the state
 * the radio was actually in, not the state it was in when it was paired. */
export async function refreshRadio(link: BleLink): Promise<BleLink> {
  const device = deviceRefs.get(link.id);
  if (!device?.gatt) return link;
  try {
    const server = await device.gatt.connect();
    const list = await server.getPrimaryServices().catch(() => []);
    const bat = list.find((s) => s.uuid.toLowerCase().includes("180f"));
    let battery = link.batteryPercent;
    if (bat) {
      try { battery = (await (await bat.getCharacteristic(CHAR.battery)).readValue()).getUint8(0); } catch { /* keep last */ }
    }
    return { ...link, connected: !!server.connected, batteryPercent: battery, lastSeenMs: Date.now() };
  } catch {
    return { ...link, connected: false };
  }
}

