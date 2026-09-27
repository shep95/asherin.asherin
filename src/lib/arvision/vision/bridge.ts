// asherin.arvision — the one place the camera pipeline meets the safety
// subsystem.
//
// The perception loop already runs per camera and knows nothing about rules,
// incidents or notifications. The safety hub already holds rules, incidents and
// evidence and knows nothing about frames. This bridge is the only edge between
// them, so there is exactly one answer to "what does the camera think is
// happening", and the panels, the overlay and the notification all read it.
//
// It also owns the honesty state. A camera that is not attached, a model that
// has not loaded, a pass that threw — each is a named condition here, published
// to the interface, and never a quietly empty list of findings.

import { safetyHub } from "../safety/hub";
import { safetyNotifier } from "../safety/notify";
import {
  publishCameraStatus,
  publishVisionEvents,
  publishVisionFrame,
  releaseCameraSensor,
} from "@/lib/fabric/bridges/visionFabric";
import { VisionEventEngine, type SuppressedEvent, type VisionStepResult } from "./eventEngine";
import { loadZones, saveZones, type SafetyZone, type ZoneProblem } from "./zones";
import type { CustodyRecord, VisionEngineConfig, VisionEvent, VisionFrameInput } from "./types";

export type CameraDetectorState =
  /** no camera stream is attached to this console. */
  | "no_camera"
  /** a stream is attached and the models are still downloading. */
  | "model_loading"
  /** the models refused to load; nothing can be detected. */
  | "model_failed"
  /** frames are being analysed right now. */
  | "running"
  /** the stream was attached and has stopped producing frames. */
  | "stalled";

export interface CameraDetectorStatus {
  cameraId: string;
  cameraLabel: string;
  state: CameraDetectorState;
  detail: string;
  lastFrameAtMs: number | null;
  framesAnalysed: number;
  lastInferenceMs: number | null;
}

export interface VisionSnapshot {
  cameras: CameraDetectorStatus[];
  events: VisionEvent[];
  resolved: VisionEvent[];
  custody: CustodyRecord[];
  suppressed: SuppressedEvent[];
  zones: SafetyZone[];
  zoneProblems: ZoneProblem[];
  config: VisionEngineConfig;
  /** printed whenever nothing can be detected at all. empty when it can. */
  availability: string;
  atMs: number;
}

const STALL_AFTER_MS = 6000;

export class VisionSafetyBridge {
  private engine = new VisionEventEngine();
  private zones: SafetyZone[] = [];
  private cameras = new Map<string, CameraDetectorStatus>();
  private suppressed: SuppressedEvent[] = [];
  private zoneProblems: ZoneProblem[] = [];
  private notified = new Set<string>();
  private listeners = new Set<(s: VisionSnapshot) => void>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.zones = loadZones();
    this.engine.setZones(this.zones);
  }

  subscribe(fn: (s: VisionSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const s = this.snapshot();
    this.listeners.forEach((l) => l(s));
  }

  snapshot(): VisionSnapshot {
    const cameras = [...this.cameras.values()];
    const live = cameras.filter((c) => c.state === "running");
    return {
      cameras,
      events: this.engine.activeEvents(),
      resolved: this.engine.allEvents().filter((e) => e.state === "resolved").slice(-40),
      custody: this.engine.custody(),
      suppressed: this.suppressed.slice(-40),
      zones: this.zones,
      zoneProblems: this.zoneProblems,
      config: this.engine.getConfig(),
      availability:
        cameras.length === 0
          ? "detector unavailable — no camera is attached to this console. every event below the camera line requires frames from a real stream, so none of them can fire, and an empty list here means nothing has been watched rather than nothing has happened."
          : live.length === 0
            ? `detector unavailable — ${cameras.length} camera${cameras.length === 1 ? " is" : "s are"} attached but none is currently producing analysed frames: ${cameras.map((c) => `${c.cameraLabel} (${c.detail})`).join("; ")}.`
            : "",
      atMs: Date.now(),
    };
  }

  // ---- zones and configuration -------------------------------------------

  getZones(): SafetyZone[] {
    return this.zones.slice();
  }

  setZones(zones: SafetyZone[]) {
    this.zones = zones;
    saveZones(zones);
    this.engine.setZones(zones);
    this.zoneProblems = [];
    this.emit();
  }

  getConfig(): VisionEngineConfig {
    return this.engine.getConfig();
  }

  setConfig(patch: Partial<VisionEngineConfig>) {
    this.engine.setConfig(patch);
    this.emit();
  }

  // ---- camera lifecycle ---------------------------------------------------

  declareCamera(cameraId: string, cameraLabel: string, state: CameraDetectorState, detail: string) {
    const prior = this.cameras.get(cameraId);
    this.cameras.set(cameraId, {
      cameraId,
      cameraLabel,
      state,
      detail,
      lastFrameAtMs: prior?.lastFrameAtMs ?? null,
      framesAnalysed: prior?.framesAnalysed ?? 0,
      lastInferenceMs: prior?.lastInferenceMs ?? null,
    });
    // the shared fabric learns about a camera when the camera pipeline learns
    // about it, including the states where it can see nothing at all.
    publishCameraStatus([this.cameras.get(cameraId)!]);
    this.emit();
  }

  releaseCamera(cameraId: string) {
    this.cameras.delete(cameraId);
    releaseCameraSensor(cameraId);
    this.emit();
  }

  /**
   * One analysed frame. Everything downstream — events, incidents, evidence,
   * notifications — hangs off this call, and this call only happens when a real
   * model produced real detections from a real frame.
   */
  async ingest(frame: VisionFrameInput, inferenceMs: number | null = null): Promise<VisionStepResult> {
    const cam = this.cameras.get(frame.cameraId);
    this.cameras.set(frame.cameraId, {
      cameraId: frame.cameraId,
      cameraLabel: frame.cameraLabel,
      state: "running",
      detail: "analysing frames on this device",
      lastFrameAtMs: frame.atMs,
      framesAnalysed: (cam?.framesAnalysed ?? 0) + 1,
      lastInferenceMs: inferenceMs,
    });

    const result = this.engine.step(frame);
    this.suppressed = [...this.suppressed, ...result.suppressed].slice(-80);
    this.zoneProblems = result.zoneProblems;

    // one normalized copy of this frame's tracks and of whatever the engine
    // decided, so sentinel and eagle.eye read the same record this console does.
    publishCameraStatus([this.cameras.get(frame.cameraId)!]);
    publishVisionFrame(frame, inferenceMs);
    publishVisionEvents(this.engine.activeEvents());

    // the detector proves it is alive on its own cadence, so a camera that has
    // gone quiet looks different from a camera with nothing to report.
    safetyHub().reportDetector({
      detectorId: `camera:${frame.cameraId}`,
      label: `${frame.cameraLabel} — on-device event engine`,
      runtime: "browser · coco-ssd + movenet",
      expectedIntervalMs: 4000,
      atMs: frame.atMs,
      note: `${frame.tracks.length} tracked shapes, ${frame.objects.length} objects in this frame`,
    });

    for (const { event, firing } of result.firings) {
      const incident = await safetyHub().report(firing, `camera:${frame.cameraId}`);
      if (incident) this.engine.attachIncident(event.id, incident.id);
      if (!this.notified.has(event.id)) {
        this.notified.add(event.id);
        void safetyNotifier().notify(event, {
          incidentId: incident?.id ?? null,
          evidenceId: incident?.evidenceId ?? null,
          evidenceState:
            incident?.evidenceDetail ??
            "no incident was opened for this event: no enabled rule covers it, so nothing was captured either",
        });
      }
    }

    this.emit();
    return result;
  }

  /** Called when a detection pass throws, so the failure is visible. */
  reportFailure(cameraId: string, cameraLabel: string, detail: string) {
    this.declareCamera(cameraId, cameraLabel, "model_failed", detail);
  }

  start(intervalMs = 3000) {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const cam of this.cameras.values()) {
        if (cam.state !== "running" || cam.lastFrameAtMs === null) continue;
        if (now - cam.lastFrameAtMs > STALL_AFTER_MS) {
          cam.state = "stalled";
          cam.detail = `no analysed frame in ${Math.round((now - cam.lastFrameAtMs) / 1000)}s`;
          changed = true;
        }
      }
      if (changed) this.emit();
    }, intervalMs);
  }

  stop() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  reset() {
    this.engine.reset();
    this.suppressed = [];
    this.notified.clear();
    this.emit();
  }

  /** Exposed for tests and for the overlay, which needs the live event list. */
  activeEvents(): VisionEvent[] {
    return this.engine.activeEvents();
  }
}

let singleton: VisionSafetyBridge | null = null;
export function visionSafety(): VisionSafetyBridge {
  if (!singleton) {
    singleton = new VisionSafetyBridge();
    singleton.start();
  }
  return singleton;
}
