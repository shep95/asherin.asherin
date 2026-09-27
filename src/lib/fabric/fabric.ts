// asherin — the shared sensor fabric.
//
// A tab-level store holding the authorized sensor registry, the normalized
// observations the existing subsystems produced, and the correlations the rules
// in ./correlate were willing to draw between them. Sentinel, ArVision and
// Eagle Eye all read the same object, so the timeline they show is the same
// timeline.
//
// What it deliberately is NOT:
//   * it is not a second acquisition path. It never opens a radio, a camera or
//     a microphone. Every observation arrives from an adapter that already
//     owned that hardware.
//   * it is not storage. It holds a bounded, recent window in memory. Anything
//     older lives in the account timeline behind ./query, which reports
//     unavailable rather than guessing when the backend cannot answer.
//   * it is not a source of truth about the world. It is a source of truth
//     about what was observed, by which device, at what claimed time.

import { correlateRadioToTracks, correlateTemporal } from "./correlate";
import type {
  FabricCorrelation,
  FabricHealth,
  FabricObservation,
  FabricSensor,
  RadioRegionObservation,
  VisualTrackObservation,
} from "./types";

/** recent window kept in memory. older observations belong to the backend. */
export const FABRIC_RETENTION_MS = 30 * 60_000;
export const FABRIC_MAX_OBSERVATIONS = 4_000;
export const FABRIC_MAX_CORRELATIONS = 400;
/** a sensor with no observation for this long is stale, not quiet. */
export const SENSOR_STALE_MS = 30_000;

export interface FabricSnapshot {
  sensors: FabricSensor[];
  observations: FabricObservation[];
  correlations: FabricCorrelation[];
  /** modalities with no attested, healthy sensor at all, and why. */
  unavailable: Array<{ modality: string; reason: string }>;
  atMs: number;
}

type Listener = (s: FabricSnapshot) => void;

export class SensorFabric {
  private sensors = new Map<string, FabricSensor>();
  private observations: FabricObservation[] = [];
  private correlations: FabricCorrelation[] = [];
  private listeners = new Set<Listener>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private emitScheduled = false;

  // ---- registry ----------------------------------------------------------

  upsertSensor(sensor: FabricSensor) {
    const prior = this.sensors.get(sensor.id);
    this.sensors.set(sensor.id, prior ? { ...prior, ...sensor } : sensor);
    this.schedule();
  }

  setSensorHealth(id: string, health: FabricHealth, detail: string) {
    const s = this.sensors.get(id);
    if (!s) return;
    this.sensors.set(id, { ...s, health, healthDetail: detail });
    this.schedule();
  }

  removeSensor(id: string) {
    if (this.sensors.delete(id)) this.schedule();
  }

  sensor(id: string): FabricSensor | null {
    return this.sensors.get(id) ?? null;
  }

  sensorList(): FabricSensor[] {
    return [...this.sensors.values()].sort((a, b) =>
      a.modality === b.modality ? a.label.localeCompare(b.label) : a.modality.localeCompare(b.modality),
    );
  }

  // ---- observations ------------------------------------------------------

  /**
   * Publish one normalized observation. Returns the correlations this
   * observation produced, which is always a list and is frequently empty —
   * an empty list means the evidence did not support a link, and the console
   * says exactly that rather than hiding the attempt.
   */
  publish(observation: FabricObservation): FabricCorrelation[] {
    this.observations.push(observation);
    if (this.observations.length > FABRIC_MAX_OBSERVATIONS) {
      this.observations.splice(0, this.observations.length - FABRIC_MAX_OBSERVATIONS);
    }

    const sensor = this.sensors.get(observation.provenance.sensorId);
    if (sensor) {
      this.sensors.set(sensor.id, {
        ...sensor,
        lastObservationMs: observation.atMs,
        health: sensor.health === "denied" || sensor.health === "error" ? sensor.health : "live",
      });
    }

    const drawn = this.correlate(observation);
    if (drawn.length) {
      this.correlations = [...this.correlations, ...drawn].slice(-FABRIC_MAX_CORRELATIONS);
    }
    this.schedule();
    return drawn;
  }

  publishMany(list: FabricObservation[]) {
    list.forEach((o) => this.publish(o));
  }

  private correlate(observation: FabricObservation): FabricCorrelation[] {
    const recent = this.observations.filter((o) => Math.abs(o.atMs - observation.atMs) <= 60_000);
    const out = correlateTemporal(observation, recent);

    if (observation.type === "radio_region") {
      const tracks = recent.filter((o): o is VisualTrackObservation => o.type === "visual_track");
      out.push(...correlateRadioToTracks(observation as RadioRegionObservation, tracks));
    }
    if (observation.type === "visual_track") {
      const regions = recent.filter((o): o is RadioRegionObservation => o.type === "radio_region");
      for (const region of regions) {
        out.push(...correlateRadioToTracks(region, [observation as VisualTrackObservation]));
      }
    }
    return out;
  }

  /** A human link, recorded with its author. The only attributed correlation. */
  recordCorrelation(correlation: FabricCorrelation) {
    this.correlations = [...this.correlations, correlation].slice(-FABRIC_MAX_CORRELATIONS);
    this.schedule();
  }

  // ---- reading -----------------------------------------------------------

  observationList(): FabricObservation[] {
    return this.observations.slice();
  }

  correlationList(): FabricCorrelation[] {
    return this.correlations.slice();
  }

  snapshot(): FabricSnapshot {
    const sensors = this.sensorList();
    const modalities: Array<[string, string]> = [
      ["vision", "no authorized camera has published a frame into the fabric. visual evidence for anything below is unavailable, not absent."],
      ["radio", "no authorized bluetooth receiver has published a sighting into the fabric."],
      ["audio", "no sentinel audio lane is publishing into the fabric on this device."],
      ["location", "no location fix has been published into the fabric on this device."],
    ];
    const unavailable = modalities
      .filter(([m]) => !sensors.some((s) => s.modality === m && s.health === "live"))
      .map(([modality, reason]) => ({ modality, reason }));

    return {
      sensors,
      observations: this.observations.slice(-600),
      correlations: this.correlations.slice(-120),
      unavailable,
      atMs: Date.now(),
    };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  /** Emission is coalesced: a per-second radio ledger must not re-render a
   *  console once per packet. */
  private schedule() {
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    const run = () => {
      this.emitScheduled = false;
      const s = this.snapshot();
      this.listeners.forEach((l) => {
        try {
          l(s);
        } catch {
          /* one bad subscriber must not stop the fabric */
        }
      });
    };
    if (typeof queueMicrotask === "function" && typeof requestAnimationFrame !== "function") queueMicrotask(run);
    else if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  start(intervalMs = 5_000) {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      const before = this.observations.length;
      this.observations = this.observations.filter((o) => now - o.atMs <= FABRIC_RETENTION_MS);
      this.correlations = this.correlations.filter((c) => now - c.atMs <= FABRIC_RETENTION_MS);
      let changed = before !== this.observations.length;
      for (const s of this.sensors.values()) {
        if (s.health !== "live" || s.lastObservationMs === null) continue;
        if (now - s.lastObservationMs > SENSOR_STALE_MS) {
          this.sensors.set(s.id, {
            ...s,
            health: "stale",
            healthDetail: `no observation for ${Math.round((now - s.lastObservationMs) / 1000)}s — this is a coverage gap, not a quiet period`,
          });
          changed = true;
        }
      }
      if (changed) this.schedule();
    }, intervalMs);
  }

  stop() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  reset() {
    this.sensors.clear();
    this.observations = [];
    this.correlations = [];
    this.schedule();
  }
}

let singleton: SensorFabric | null = null;
export function sensorFabric(): SensorFabric {
  if (!singleton) {
    singleton = new SensorFabric();
    singleton.start();
  }
  return singleton;
}
