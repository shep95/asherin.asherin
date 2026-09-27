// asherin.arvision — sensor registry.
//
// One place that knows which streams exist, what they physically are, how
// healthy they are, and where every number came from. Adapters push into it;
// the UI reads a snapshot. Nothing enters the registry that an adapter did not
// actually observe.

import type { AdapterStatus, PointCloudChunk, RegistrySnapshot, SensorDescriptor } from "./types";
import { discoverBrowserSensors, closeBrowserVideo, openBrowserVideo } from "./adapters/browserMedia";
import { EdgeBridgeClient } from "./adapters/bridge";
import { safetyHub } from "../safety/hub";

/** a stream with no sample inside this window is stale, not live. */
export const STALE_AFTER_MS = 5_000;

type Listener = (snapshot: RegistrySnapshot) => void;

export class SensorRegistry {
  private sensors = new Map<string, SensorDescriptor>();
  private adapters = new Map<string, AdapterStatus>();
  private listeners = new Set<Listener>();
  private bridge: EdgeBridgeClient | null = null;
  private sweep: ReturnType<typeof setInterval> | null = null;
  private onCloud: ((chunk: PointCloudChunk) => void) | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  onPointCloud(fn: (chunk: PointCloudChunk) => void) {
    this.onCloud = fn;
  }

  snapshot(): RegistrySnapshot {
    return {
      sensors: [...this.sensors.values()].sort((a, b) => a.modality.localeCompare(b.modality)),
      adapters: [...this.adapters.values()],
      atMs: Date.now(),
    };
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
  }

  get(id: string): SensorDescriptor | undefined {
    return this.sensors.get(id);
  }

  upsert(sensor: SensorDescriptor) {
    const existing = this.sensors.get(sensor.id);
    this.sensors.set(sensor.id, existing ? { ...existing, ...sensor } : sensor);
    this.emit();
  }

  /** Replace every sensor belonging to one adapter, keeping open streams alive. */
  replaceAdapterSensors(adapterId: string, next: SensorDescriptor[]) {
    for (const [id, s] of this.sensors) {
      if (s.provenance.adapter === adapterId && !next.some((n) => n.id === id)) {
        if (s.stream) s.stream.getTracks().forEach((t) => t.stop());
        this.sensors.delete(id);
      }
    }
    for (const s of next) {
      const existing = this.sensors.get(s.id);
      this.sensors.set(s.id, existing?.stream ? { ...s, stream: existing.stream, health: existing.health } : s);
    }
    this.emit();
  }

  setAdapterStatus(status: AdapterStatus) {
    this.adapters.set(status.id, status);
    this.emit();
  }

  markSample(sensorId: string, atMs: number, quality: SensorDescriptor["quality"]) {
    const s = this.sensors.get(sensorId);
    if (!s) return;
    this.sensors.set(sensorId, { ...s, lastSampleMs: atMs, health: "live", statusDetail: "", quality });
    this.emit();
  }

  setSensorHealth(sensorId: string, health: SensorDescriptor["health"], detail: string) {
    const s = this.sensors.get(sensorId);
    if (!s) return;
    this.sensors.set(sensorId, { ...s, health, statusDetail: detail });
    this.emit();
  }

  async discover(): Promise<void> {
    const browser = await discoverBrowserSensors();
    this.setAdapterStatus(browser.status);
    this.replaceAdapterSensors("browser_media", browser.sensors);
  }

  connectBridge() {
    if (this.bridge) return;
    // The safety hub is fed from the same socket rather than a second one: two
    // connections would double the edge node's load and could disagree about
    // which packets arrived.
    const hub = safetyHub();
    this.bridge = new EdgeBridgeClient({
      onSensors: (sensors) => this.replaceAdapterSensors("edge_bridge", sensors),
      onSample: (id, atMs, quality) => this.markSample(id, atMs, quality),
      onPointCloud: (chunk) => this.onCloud?.(chunk),
      onStatus: (status) => this.setAdapterStatus(status),
      onSensorStatus: (id, health, detail) => this.setSensorHealth(id, health, detail),
      onBleScanners: (scanners) => hub.setScanners(scanners),
      onBleObservation: (observation) => hub.ingestObservation(observation),
      onDetectorHealth: (payload) => hub.reportDetector(payload),
      onEvidenceStatus: (payload) => hub.setStorage(payload),
    });
    hub.start();
    this.bridge.connect();
  }


  async open(sensorId: string): Promise<void> {
    const s = this.sensors.get(sensorId);
    if (!s) return;
    if (s.transport !== "browser_media") {
      this.setSensorHealth(
        sensorId,
        "unavailable",
        "this stream is published by the edge node, not opened from the browser",
      );
      return;
    }
    this.upsert({ ...s, health: "opening", statusDetail: "requesting the device" });
    const opened = await openBrowserVideo(s);
    this.upsert(opened);
  }

  close(sensorId: string) {
    const s = this.sensors.get(sensorId);
    if (!s) return;
    this.upsert(closeBrowserVideo(s));
  }

  /** Ages live streams into `stale` when their samples stop arriving. */
  startHealthSweep(intervalMs = 2000) {
    if (this.sweep) return;
    this.sweep = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, s] of this.sensors) {
        if (s.health === "live" && s.transport === "edge_bridge" && s.lastSampleMs && now - s.lastSampleMs > STALE_AFTER_MS) {
          this.sensors.set(id, {
            ...s,
            health: "stale",
            statusDetail: `no sample for ${Math.round((now - s.lastSampleMs) / 1000)}s`,
          });
          changed = true;
        }
      }
      if (changed) this.emit();
    }, intervalMs);
  }

  dispose() {
    if (this.sweep) clearInterval(this.sweep);
    this.sweep = null;
    this.bridge?.disconnect();
    this.bridge = null;
    for (const s of this.sensors.values()) s.stream?.getTracks().forEach((t) => t.stop());
    this.sensors.clear();
    this.listeners.clear();
  }
}

/** One registry per tab. ARVision layers share it so switching never re-opens hardware. */
let singleton: SensorRegistry | null = null;
export function sensorRegistry(): SensorRegistry {
  if (!singleton) singleton = new SensorRegistry();
  return singleton;
}
