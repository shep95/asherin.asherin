// asherin.arvision — edge bridge adapter (contract only, by design).
//
// ROS 2, Aravis/GenICam, GigE Vision, USB3 Vision, GStreamer, OpenCV,
// Open3D/PCL and Zenoh do not run in a browser tab and never will. They run on
// an edge node next to the hardware. This adapter is the wire contract to that
// node: a websocket that publishes a capability manifest and then typed frames
// and point cloud chunks on the conceptual topic paths.
//
// If no bridge endpoint is configured, this adapter reports itself unreachable
// and publishes nothing. It never synthesises a sensor so a panel can look busy.

import type { BleObservation, BleScanner } from "../../ble/types";
import type {
  AdapterStatus,
  PointCloudChunk,
  SensorDescriptor,
  SensorModality,
} from "../types";
import { MODALITY_TOPIC } from "../types";

export const BRIDGE_ADAPTER_ID = "edge_bridge";

/** Manifest the edge node must answer with on connect. */
export interface BridgeManifest {
  node: string;
  stack: string[];
  sensors: Array<{
    id: string;
    modality: SensorModality;
    label: string;
    topic: string;
    vendor?: string | null;
    model?: string | null;
    driver?: string | null;
    fps?: number | null;
    width?: number | null;
    height?: number | null;
    units?: string | null;
    frameFormat?: string | null;
    calibration?: { state: "none" | "assumed" | "factory" | "operator" | "verified"; detail: string; atMs?: number } | null;
  }>;
}

export type BridgeMessage =
  | { type: "manifest"; manifest: BridgeManifest }
  | {
      type: "sample";
      sensorId: string;
      atMs: number;
      /** measured quality from the producing node, never invented here. */
      quality?: { cadence?: number; signal?: number; latencyMs?: number; note?: string };
    }
  | {
      type: "pointcloud";
      sensorId: string;
      modality: SensorModality;
      atMs: number;
      frameId: string;
      /** xyz triplets in metres, base64 float32 little endian. */
      positions: string;
      colors?: string | null;
    }
  | { type: "status"; sensorId: string; health: SensorDescriptor["health"]; detail: string }
  // ---- passive radio awareness -------------------------------------------
  // Only an authorized edge scanner may publish these. The browser never
  // fabricates an advertisement, and Web Bluetooth is not accepted as a source
  // here because a tab cannot prove which receiver heard what, or where that
  // receiver is standing.
  | { type: "ble_scanners"; scanners: BridgeScannerDecl[] }
  | { type: "ble_observation"; observation: BridgeBleObservation }
  // ---- detector health and evidence storage ------------------------------
  | { type: "detector_health"; detectorId: string; label?: string; runtime?: string; expectedIntervalMs?: number; atMs: number; note?: string }
  | { type: "evidence_status"; configured: boolean; detail: string; retentionMs?: number };

export interface BridgeScannerDecl {
  id: string;
  label: string;
  position?: { x: number; y: number; z: number } | null;
  positionAccuracyM?: number | null;
  txRefDbm?: number | null;
  pathLossN?: number | null;
  zoneId?: string | null;
}

export interface BridgeBleObservation {
  scannerId: string;
  atMs: number;
  address?: string | null;
  addressType?: string;
  rssi: number;
  txPower?: number | null;
  localName?: string | null;
  serviceUuids?: string[];
  manufacturerIds?: number[];
  serviceDataKeys?: string[];
  appearance?: number | null;
}

const ADDRESS_TYPES = new Set(["public", "random_static", "random_resolvable", "random_nonresolvable", "unknown"]);

/** Every field is checked; a malformed packet is discarded, never coerced. */
export function parseBleObservation(raw: unknown, receivedAtMs: number): BleObservation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.scannerId !== "string" || !o.scannerId) return null;
  if (typeof o.rssi !== "number" || !Number.isFinite(o.rssi) || o.rssi > 20 || o.rssi < -140) return null;
  const atMs = typeof o.atMs === "number" && Number.isFinite(o.atMs) ? o.atMs : receivedAtMs;
  const addressType = typeof o.addressType === "string" && ADDRESS_TYPES.has(o.addressType)
    ? (o.addressType as BleObservation["addressType"])
    : "unknown";
  return {
    scannerId: o.scannerId,
    atMs,
    receivedAtMs,
    address: typeof o.address === "string" && o.address ? o.address.toUpperCase() : null,
    addressType,
    rssi: o.rssi,
    txPower: typeof o.txPower === "number" ? o.txPower : null,
    localName: typeof o.localName === "string" && o.localName ? o.localName.slice(0, 64) : null,
    serviceUuids: Array.isArray(o.serviceUuids) ? o.serviceUuids.filter((u): u is string => typeof u === "string").slice(0, 16) : [],
    manufacturerIds: Array.isArray(o.manufacturerIds)
      ? o.manufacturerIds.filter((n): n is number => typeof n === "number" && Number.isInteger(n)).slice(0, 8)
      : [],
    serviceDataKeys: Array.isArray(o.serviceDataKeys) ? o.serviceDataKeys.filter((u): u is string => typeof u === "string").slice(0, 16) : [],
    appearance: typeof o.appearance === "number" ? o.appearance : null,
    provenance: `edge bridge scanner ${o.scannerId}`,
  };
}

export function parseScannerDecl(raw: unknown): BleScanner | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== "string" || !s.id) return null;
  const pos = s.position as { x?: unknown; y?: unknown; z?: unknown } | null | undefined;
  const position =
    pos && typeof pos.x === "number" && typeof pos.y === "number" && typeof pos.z === "number"
      ? { x: pos.x, y: pos.y, z: pos.z }
      : null;
  const txRefDbm = typeof s.txRefDbm === "number" ? s.txRefDbm : null;
  const pathLossN = typeof s.pathLossN === "number" ? s.pathLossN : null;
  return {
    id: s.id,
    label: typeof s.label === "string" && s.label ? s.label : s.id,
    position,
    positionAccuracyM: typeof s.positionAccuracyM === "number" ? s.positionAccuracyM : null,
    txRefDbm,
    pathLossN,
    // calibration is a measured fact, so it is derived, never declared.
    calibrated: txRefDbm !== null && pathLossN !== null,
    zoneId: typeof s.zoneId === "string" ? s.zoneId : null,
    lastObservationMs: null,
    health: "live",
    adapter: BRIDGE_ADAPTER_ID,
  };
}


export function bridgeEndpoint(): string | null {
  const raw = (import.meta.env.VITE_ARVISION_BRIDGE_URL as string | undefined) ?? "";
  const url = raw.trim();
  if (!url) return null;
  return /^wss?:\/\//i.test(url) ? url : null;
}

export function manifestToSensors(manifest: BridgeManifest): SensorDescriptor[] {
  return manifest.sensors.map((s) => ({
    id: `bridge:${s.id}`,
    modality: s.modality,
    label: s.label,
    transport: "edge_bridge" as const,
    health: "opening" as const,
    statusDetail: "declared by the edge node, waiting for the first sample",
    calibration: {
      state: s.calibration?.state ?? "none",
      detail: s.calibration?.detail ?? "the edge node reported no calibration for this stream",
      intrinsics: null,
      atMs: s.calibration?.atMs ?? null,
    },
    provenance: {
      vendor: s.vendor ?? null,
      model: s.model ?? null,
      driver: s.driver ?? null,
      adapter: BRIDGE_ADAPTER_ID,
      topic: s.topic || MODALITY_TOPIC[s.modality],
    },
    quality: { cadence: null, signal: null, latencyMs: null, note: "no samples received yet" },
    units: { measurement: s.units ?? null, frameFormat: s.frameFormat ?? null },
    lastSampleMs: null,
    declaredFps: s.fps ?? null,
    resolution: s.width && s.height ? { width: s.width, height: s.height } : null,
    stream: null,
    // a bridge stream carries raw sensor values, so measurement is possible for
    // the modalities that physically measure something.
    measurable: ["thermal_radiometric", "depth", "lidar", "gnss", "imu", "hyperspectral", "polarization"].includes(
      s.modality,
    ),
  }));
}

function decodeFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4));
}

function decodeBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function decodePointCloud(msg: Extract<BridgeMessage, { type: "pointcloud" }>): PointCloudChunk {
  return {
    positions: decodeFloat32(msg.positions),
    colors: msg.colors ? decodeBytes(msg.colors) : null,
    sensorId: `bridge:${msg.sensorId}`,
    modality: msg.modality,
    atMs: msg.atMs,
    frameId: msg.frameId,
  };
}

export interface BridgeEvents {
  onSensors: (sensors: SensorDescriptor[]) => void;
  onSample: (sensorId: string, atMs: number, quality: SensorDescriptor["quality"]) => void;
  onPointCloud: (chunk: PointCloudChunk) => void;
  onStatus: (status: AdapterStatus) => void;
  onSensorStatus: (sensorId: string, health: SensorDescriptor["health"], detail: string) => void;
  onBleScanners?: (scanners: BleScanner[]) => void;
  onBleObservation?: (observation: BleObservation) => void;
  onDetectorHealth?: (payload: { detectorId: string; label?: string; runtime?: string; expectedIntervalMs?: number; atMs: number; note?: string }) => void;
  onEvidenceStatus?: (payload: { configured: boolean; detail: string; retentionMs: number }) => void;
}

/**
 * Websocket client for the edge node. Reconnects with bounded backoff; every
 * failure is surfaced as adapter status rather than swallowed.
 */
export class EdgeBridgeClient {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private closed = false;

  constructor(private readonly events: BridgeEvents) {}

  status(): AdapterStatus {
    const endpoint = bridgeEndpoint();
    return {
      id: BRIDGE_ADAPTER_ID,
      label: "edge sensor bridge",
      reachable: this.socket?.readyState === WebSocket.OPEN,
      detail: endpoint
        ? this.socket?.readyState === WebSocket.OPEN
          ? "connected to the edge node"
          : "an edge bridge endpoint is configured but the node has not answered"
        : "no edge bridge is configured, so ros 2, genicam, gstreamer, lidar and hyperspectral sources are not reachable from this browser",
      modalities: [
        "rgb", "lowlight", "nir", "swir", "lwir", "thermal_radiometric",
        "depth", "lidar", "polarization", "event", "hyperspectral", "audio",
      ],
    };
  }

  connect() {
    const endpoint = bridgeEndpoint();
    this.events.onStatus(this.status());
    if (!endpoint) return;
    this.closed = false;
    this.open(endpoint);
  }

  private open(endpoint: string) {
    try {
      this.socket = new WebSocket(endpoint);
    } catch {
      this.scheduleRetry(endpoint);
      return;
    }
    this.socket.onopen = () => {
      this.attempt = 0;
      this.events.onStatus(this.status());
    };
    this.socket.onmessage = (ev) => this.handle(ev.data);
    this.socket.onerror = () => this.events.onStatus(this.status());
    this.socket.onclose = () => {
      this.events.onStatus(this.status());
      if (!this.closed) this.scheduleRetry(endpoint);
    };
  }

  private scheduleRetry(endpoint: string) {
    if (this.closed) return;
    this.attempt = Math.min(this.attempt + 1, 6);
    const delay = Math.min(30_000, 1000 * 2 ** this.attempt) + Math.floor(Math.random() * 250);
    this.timer = setTimeout(() => this.open(endpoint), delay);
  }

  private handle(raw: unknown) {
    if (typeof raw !== "string") return;
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(raw) as BridgeMessage;
    } catch {
      return;
    }
    if (msg.type === "manifest") {
      this.events.onSensors(manifestToSensors(msg.manifest));
    } else if (msg.type === "sample") {
      this.events.onSample(`bridge:${msg.sensorId}`, msg.atMs, {
        cadence: typeof msg.quality?.cadence === "number" ? msg.quality.cadence : null,
        signal: typeof msg.quality?.signal === "number" ? msg.quality.signal : null,
        latencyMs: typeof msg.quality?.latencyMs === "number" ? msg.quality.latencyMs : null,
        note: msg.quality?.note ?? "reported by the producing node",
      });
    } else if (msg.type === "pointcloud") {
      this.events.onPointCloud(decodePointCloud(msg));
    } else if (msg.type === "status") {
      this.events.onSensorStatus(`bridge:${msg.sensorId}`, msg.health, msg.detail);
    } else if (msg.type === "ble_scanners") {
      const parsed = (Array.isArray(msg.scanners) ? msg.scanners : [])
        .map(parseScannerDecl)
        .filter((s): s is BleScanner => s !== null);
      if (parsed.length) this.events.onBleScanners?.(parsed);
    } else if (msg.type === "ble_observation") {
      const obs = parseBleObservation(msg.observation, Date.now());
      if (obs) this.events.onBleObservation?.(obs);
    } else if (msg.type === "detector_health") {
      if (typeof msg.detectorId === "string" && msg.detectorId) this.events.onDetectorHealth?.(msg);
    } else if (msg.type === "evidence_status") {
      this.events.onEvidenceStatus?.({
        configured: msg.configured === true,
        detail: typeof msg.detail === "string" ? msg.detail : "the edge node reported evidence storage without a description",
        retentionMs: typeof msg.retentionMs === "number" ? msg.retentionMs : 0,
      });
    }
  }


  disconnect() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
  }
}
