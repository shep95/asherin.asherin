// eagle.eye — plug-and-play behavioural camera layer.
//
// the premise: an operator with ordinary webcams, phone cameras or usb cameras
// should get the part of an expensive security system that actually matters —
// something watching the patterns a tired human misses — without a server, a
// subscription per camera, or a frame ever leaving the device.
//
// what this is not: it is not identification, it does not read faces, it does
// not decide that anyone is a criminal. it recognises movement and posture
// patterns, scores them, and hands a human a package to look at. every surface
// in this view repeats that boundary because an operator who forgets it will
// misuse the output.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, Bluetooth, Camera, CheckCircle2, CircleSlash, Download,
  ExternalLink, Eye, Grid2X2, Loader2, Maximize2, PictureInPicture2, Thermometer, Play, ShieldAlert, Square, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  createCameraConfig, createDefaultZones, createTemporalStore, processFrame,
  renderAnnotatedScreenshot,
  type CameraConfig, type DetectedObject, type TemporalStore, type ThreatEvent,
  type ThreatTier, type TrackedEntity,
} from "./engine";
import { IouTracker, detectFrame, loadModels, type ModelStatus } from "./detector";
import { grabCanvas, filteredCanvas, FILTER_MODES, type FilterMode } from "./filters";
import {
  DEFAULT_CALIBRATION, PATH_LABEL, PATH_NOTE, frameStats, looksThermal, renderSensorThermal,
  resolvePath, calibrationUsable, type ThermalCalibration, type ThermalPath,
} from "./thermal";
import { captureContext, cacheFix, contextLine } from "./context";
import {
  buildEvidence, downloadBlob, exportEvidenceZip, manifestFor,
  EVIDENCE_DISCLAIMER, type EvidenceRecord,
} from "./evidence";
import {
  bluetoothSupported, closeStream, listVideoInputs, openCamera, pairBleDevice,
  primePermissions, proximityBand, refreshRadio, watchRadio, type BleLink,
} from "./cameras";
import {
  SCAN_UNAVAILABLE_NOTE, displayName, mergeSighting, motionLabel, passiveScanSupported,
  proximityBandFor, pruneSightings, startPassiveScan, type RadioSighting,
} from "./radioScan";
import RadioIntelPanel from "./RadioIntelPanel";
import FabricConsolePanel from "./FabricConsolePanel";
import OperationsPanel from "./OperationsPanel";
import CapabilityMatrixPanel from "./CapabilityMatrixPanel";
import SpatialPanel from "./SpatialPanel";
import { visionSafety } from "@/lib/arvision/vision/bridge";
import { toVisionFrame } from "@/lib/arvision/vision/adapt";
import { EVENT_LABEL } from "@/lib/arvision/vision/eventEngine";
import { safetyHub } from "@/lib/arvision/safety/hub";
import type { VisionEvent } from "@/lib/arvision/vision/types";
import { zoneActiveAt } from "@/lib/arvision/vision/zones";
import type { LedgerInput } from "./radioLedger";

const TIER_STYLE: Record<ThreatTier, { ring: string; text: string; chip: string }> = {
  observation: { ring: "#3B82F6", text: "text-sky-300/80", chip: "border-sky-400/25 bg-sky-400/10 text-sky-200/90" },
  elevated: { ring: "#F59E0B", text: "text-amber-300/90", chip: "border-amber-400/25 bg-amber-400/10 text-amber-200/90" },
  high: { ring: "#EF4444", text: "text-rose-300/90", chip: "border-rose-400/25 bg-rose-400/10 text-rose-200/90" },
  critical: { ring: "#7C3AED", text: "text-violet-300/90", chip: "border-violet-400/25 bg-violet-400/10 text-violet-200/90" },
};

const CAPTURE_TIERS: ThreatTier[] = ["elevated", "high", "critical"];

/** ordering weight for a wall of cameras: the tier a camera last recorded is
 * worth more than its score, and its score is worth more than how recent it
 * was. a camera a human has already acknowledged drops out of the flagged
 * band entirely — attention is not spent twice on the same event. */
const TIER_WEIGHT: Record<ThreatTier, number> = { observation: 1, elevated: 2, high: 3, critical: 4 };

interface Flag { tier: ThreatTier; score: number; at: number }

export function rankTiles<T extends { deviceId: string; status: string }>(
  tiles: T[], flags: Record<string, Flag>,
): T[] {
  const rank = (t: T) => {
    const f = flags[t.deviceId];
    if (!f) return 0;
    return TIER_WEIGHT[f.tier] * 1e13 + Math.min(999, f.score) * 1e10 + f.at / 1e3;
  };
  return [...tiles].sort((a, b) => {
    const d = rank(b) - rank(a);
    if (d !== 0) return d;
    // then live cameras before opening/failed ones, then stable attach order.
    const live = Number(b.status === "live") - Number(a.status === "live");
    if (live !== 0) return live;
    return tiles.indexOf(a) - tiles.indexOf(b);
  });
}
const PER_TRACK_COOLDOWN_MS = 15_000;

interface Runtime {
  video: HTMLVideoElement;
  stream: MediaStream;
  tracker: IouTracker;
  entities: Map<string, TrackedEntity>;
  objects: Map<string, DetectedObject>;
  temporal: TemporalStore;
  config: CameraConfig;
  lastCaptureByTrack: Map<string, number>;
  overlay: HTMLCanvasElement | null;
  thermalDevice: boolean;
  lastObjects: DetectedObject[];
  lastInferenceMs: number;
  personCount: number;
  /** the events the configured safety machines currently hold open for this camera. */
  safetyEvents: VisionEvent[];
  /** last time an original frame was handed to the evidence buffer. */
  lastEvidencePushMs: number;
}

interface TileState {
  deviceId: string;
  label: string;
  status: "opening" | "live" | "failed";
  error: string | null;
  personCount: number;
  inferenceMs: number;
  thermalDevice: boolean;
}

export default function EagleEyeView() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [permission, setPermission] = useState<"unknown" | "granted" | "denied">("unknown");
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [tiles, setTiles] = useState<TileState[]>([]);
  const [running, setRunning] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [modelError, setModelError] = useState<string | null>(null);
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [openRecord, setOpenRecord] = useState<EvidenceRecord | null>(null);
  const [openVariant, setOpenVariant] = useState(0);
  const [ble, setBle] = useState<BleLink[]>([]);
  const [preview, setPreview] = useState<FilterMode>("colorized");
  const [quad, setQuad] = useState(false);
  // a camera that just recorded something flashes until a human looks at it.
  const [alerted, setAlerted] = useState<Record<string, number>>({});
  // what each camera last recorded, used to float the cameras that matter to
  // the top of the wall while the rest keep running underneath.
  const [flags, setFlags] = useState<Record<string, Flag>>({});
  const [full, setFull] = useState<{ deviceId: string; mode: FilterMode } | null>(null);
  const [calibration, setCalibration] = useState<ThermalCalibration>(DEFAULT_CALIBRATION);
  const [thermalRead, setThermalRead] = useState<{ path: ThermalPath; min: number | null; max: number | null; centre: number | null } | null>(null);
  const [gallery, setGallery] = useState(true);
  const [popped, setPopped] = useState(false);
  const [captureFrom, setCaptureFrom] = useState<ThreatTier>("elevated");
  const [exporting, setExporting] = useState(false);
  const [contextNote, setContextNote] = useState<string>("capture context resolves on the first recorded event");

  const runtimes = useRef<Map<string, Runtime>>(new Map());
  // the roster is read inside the capture path, which runs from a long-lived
  // loop closure — a ref keeps that path on the current radios instead of the
  // ones that existed when the loop was created.
  const bleRef = useRef<BleLink[]>([]);
  bleRef.current = ble;
  const radioWatchers = useRef<Map<string, () => void>>(new Map());
  // passive advertisement scan: nothing is ever connected to. these are packets
  // the radios around the camera are already broadcasting, the same thing a
  // phone's "nearby devices" list shows.
  const [scanning, setScanning] = useState(false);
  const [radioRoster, setRadioRoster] = useState<LedgerInput[]>([]);
  const [radioPanel, setRadioPanel] = useState(false);
  const sightings = useRef<Map<string, RadioSighting>>(new Map());
  const scanStop = useRef<(() => void) | null>(null);
  const scanStarting = useRef(false);
  const scanRetryAfterGesture = useRef(false);
  const loopRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const runningRef = useRef(false);
  const capturingRef = useRef(false);

  const captureThresholdIndex = CAPTURE_TIERS.indexOf(captureFrom);

  /** fold the live sighting map into the roster the rest of the room reads. */
  const publishSightings = useCallback(() => {
    const now = Date.now();
    const live = pruneSightings([...sightings.current.values()], now);
    sightings.current = new Map(live.map((s) => [s.id, s]));
    const rows: BleLink[] = live
      .sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999))
      .map((s) => ({
        id: s.id,
        name: displayName(s),
        connected: false,
        batteryPercent: null,
        services: s.services,
        note: "observed from its own broadcast advertisement. nothing was connected to, and presence in range is not attribution to any person in frame.",
        manufacturer: s.vendor ?? (s.companyId !== null ? `company id 0x${s.companyId.toString(16)}` : null),
        model: null,
        firmware: null,
        serial: null,
        appearance: s.appearance === null ? null : String(s.appearance),
        rssi: s.rssi,
        txPower: s.txPower,
        proximityMeters: s.meters,
        advertising: true,
        firstSeenMs: s.firstSeenMs,
        lastSeenMs: s.lastSeenMs,
        source: "scan" as const,
        observation: motionLabel(s.motion),
        fingerprint: s.fingerprint,
        packets: s.packets,
      }));
    setBle((cur) => [...cur.filter((l) => l.source !== "scan"), ...rows]);
    // the ledger takes the raw sighting, not the display row: it needs metres
    // and packet counts, and it does its own naming and distance conversion.
    setRadioRoster(live.map((s) => ({
      id: s.id,
      name: s.name,
      vendor: s.vendor,
      companyId: s.companyId,
      fingerprint: s.fingerprint,
      rssi: s.rssi,
      meters: s.meters,
      lastSeenMs: s.lastSeenMs,
      packets: s.packets,
    })));
  }, []);

  const ensureRadioScan = useCallback(async (announce = false) => {
    if (scanStop.current || scanStarting.current || !passiveScanSupported()) return;
    scanStarting.current = true;
    try {
      const stop = await startPassiveScan((reading) => {
        sightings.current.set(reading.id, mergeSighting(sightings.current.get(reading.id), reading));
      });
      scanStop.current = stop;
      scanRetryAfterGesture.current = false;
      setScanning(true);
      if (announce) {
        toast.success("automatic radio watch active", {
          description: "arvision is continuously logging nearby broadcasts without connecting to devices.",
        });
      }
    } catch (e) {
      scanRetryAfterGesture.current = true;
      if (announce) toast.error("bluetooth permission is still needed", { description: e instanceof Error ? e.message : SCAN_UNAVAILABLE_NOTE });
    } finally {
      scanStarting.current = false;
    }
  }, []);

  const toggleScan = useCallback(async () => {
    if (scanStop.current) {
      scanStop.current();
      scanStop.current = null;
      setScanning(false);
      toast.message("radio watch paused", { description: "it will resume automatically when arvision is opened again." });
      return;
    }
    await ensureRadioScan(true);
  }, [ensureRadioScan]);

  // Radio monitoring is an ARVision service, not a panel action. Start as soon
  // as Eagle Eye mounts, recover after mobile suspension/visibility changes,
  // and borrow the first ordinary tap only when the browser requires a user
  // gesture for its one-time Bluetooth grant. Native builds need no picker.
  useEffect(() => {
    void ensureRadioScan(false);
    const resume = () => {
      if (document.visibilityState === "visible") void ensureRadioScan(false);
    };
    const grantOnGesture = () => {
      if (scanRetryAfterGesture.current) void ensureRadioScan(false);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pointerdown", grantOnGesture, true);
    window.addEventListener("keydown", grantOnGesture, true);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pointerdown", grantOnGesture, true);
      window.removeEventListener("keydown", grantOnGesture, true);
    };
  }, [ensureRadioScan]);

  // the roster refreshes on a sub-second tick rather than per packet:
  // advertisements arrive several times a second per device and a render per
  // packet would jank the video. 800 ms keeps every one-hertz ledger tick fed
  // with a reading no older than the second it is stamped into.
  useEffect(() => {
    if (!scanning) return;
    publishSightings();
    const id = window.setInterval(publishSightings, 800);
    return () => window.clearInterval(id);
  }, [scanning, publishSightings]);

  useEffect(() => () => { scanStop.current?.(); scanStop.current = null; }, []);

  // ---- devices ------------------------------------------------------------
  const refreshDevices = useCallback(async () => {
    const list = await listVideoInputs();
    setDevices(list);
    return list;
  }, []);

  /** the deeper, connected read. the system picker is the browser's own sheet
   * and cannot be restyled, so our dialog frames it before it opens. */
  const pickDevice = useCallback(async () => {
    try {
      const link = await pairBleDevice();
      setBle((b) => [...b.filter((x) => x.id !== link.id), link]);
      const stop = watchRadio(link.id, (patch) => setBle((b) => b.map((x) => (x.id === link.id ? { ...x, ...patch } : x))));
      radioWatchers.current.set(link.id, stop);
      await refreshDevices();
      toast.success(`paired ${link.name}`, { description: link.note });
    } catch (e) {
      toast.error("pairing cancelled or unavailable", { description: e instanceof Error ? e.message : "no device was paired" });
    }
  }, [refreshDevices]);

  useEffect(() => {
    void refreshDevices();
    const handler = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    // a live gps watch keeps a fresh fix ready so a capture is never delayed
    // waiting on the platform while the behaviour is still in frame.
    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(cacheFix, () => undefined, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 });
    }
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [refreshDevices]);

  const grantPermission = useCallback(async () => {
    const res = await primePermissions();
    setPermission(res.granted ? "granted" : "denied");
    setPermissionError(res.error);
    if (res.granted) await refreshDevices();
    else toast.error("camera access refused", { description: res.error ?? "the browser blocked this site's camera request" });
  }, [refreshDevices]);

  // ---- camera lifecycle ---------------------------------------------------
  const attachCamera = useCallback(async (device: MediaDeviceInfo) => {
    if (runtimes.current.has(device.deviceId)) return;
    const label = device.label || `camera ${runtimes.current.size + 1}`;
    setTiles((t) => [...t, { deviceId: device.deviceId, label, status: "opening", error: null, personCount: 0, inferenceMs: 0, thermalDevice: looksThermal(label) }]);
    try {
      const stream = await openCamera(device.deviceId);
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      runtimes.current.set(device.deviceId, {
        video,
        stream,
        tracker: new IouTracker(),
        entities: new Map(),
        objects: new Map(),
        temporal: createTemporalStore(),
        config: createCameraConfig(device.deviceId.slice(0, 12) || label, label, "pending", 0, 0, Intl.DateTimeFormat().resolvedOptions().timeZone, createDefaultZones(w, h)),
        lastCaptureByTrack: new Map(),
        overlay: null,
        thermalDevice: looksThermal(label),
        lastObjects: [],
        lastInferenceMs: 0,
        personCount: 0,
        safetyEvents: [],
        lastEvidencePushMs: 0,
      });
      // the safety layer is told a real camera exists before any frame arrives,
      // so an operator can tell "watching, nothing seen" from "not watching".
      visionSafety().declareCamera(device.deviceId, label, "model_loading", "camera open, waiting for the detection models");
      setTiles((t) => t.map((x) => (x.deviceId === device.deviceId ? { ...x, status: "live" } : x)));
      setPermission("granted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "camera could not be opened";
      setTiles((t) => t.map((x) => (x.deviceId === device.deviceId ? { ...x, status: "failed", error: msg } : x)));
      toast.error(`${label} did not open`, { description: msg });
    }
  }, []);

  const detachCamera = useCallback((deviceId: string) => {
    const rt = runtimes.current.get(deviceId);
    if (rt) {
      closeStream(rt.stream);
      rt.video.srcObject = null;
      runtimes.current.delete(deviceId);
      visionSafety().releaseCamera(deviceId);
    }
    setTiles((t) => t.filter((x) => x.deviceId !== deviceId));
  }, []);

  useEffect(() => () => {
    radioWatchers.current.forEach((stop) => stop());
    radioWatchers.current.clear();
    runningRef.current = false;
    if (loopRef.current) window.clearTimeout(loopRef.current);
    runtimes.current.forEach((rt) => { closeStream(rt.stream); rt.video.srcObject = null; });
    runtimes.current.clear();
  }, []);

  // ---- evidence -----------------------------------------------------------
  const recordEvent = useCallback(async (deviceId: string, rt: Runtime, event: ThreatEvent, entity: TrackedEntity, frame: HTMLCanvasElement) => {
    const ctx = await captureContext();
    setContextNote(contextLine(ctx));
    // the engine's camera config carries whatever the platform actually gave
    // us; unknown stays unknown rather than becoming a zero coordinate.
    rt.config = {
      ...rt.config,
      locationCoords: ctx.coords ? { lat: ctx.coords.lat, lng: ctx.coords.lng } : rt.config.locationCoords,
      ipAddress: ctx.ipAddress ?? "unavailable",
      timezone: ctx.timezone,
    };
    let annotated: string | undefined;
    try {
      annotated = await renderAnnotatedScreenshot(frame.toDataURL("image/jpeg", 0.9), entity, event, frame.width, frame.height);
    } catch {
      annotated = undefined;
    }
    // read the volatile radio fields now, so the package carries the state the
    // radios were in at capture rather than at pairing. a refresh that fails
    // leaves the last observed values in place — never a fabricated one.
    const radio = await Promise.all(bleRef.current.map((l) => refreshRadio(l).catch(() => l)));
    setBle((cur) => cur.map((l) => radio.find((r) => r.id === l.id) ?? l));

    const record = await buildEvidence({
      event: { ...event, locationCoords: rt.config.locationCoords, ipAddress: rt.config.ipAddress, timezone: ctx.timezone },
      frame,
      annotatedDataUrl: annotated,
      context: ctx,
      cameraLabel: rt.config.label,
      radio,
    });
    setRecords((r) => [record, ...r].slice(0, 200));
    setAlerted((a) => ({ ...a, [deviceId]: Date.now() }));
    setFlags((f) => ({ ...f, [deviceId]: { tier: record.tier, score: record.score, at: Date.now() } }));
    toast.warning(`${event.threatTier} observable event on ${rt.config.label}`, {
      description: `${event.patternsTriggered.slice(0, 3).join(", ") || "observation recorded"} — captured for human review`,
    });
  }, []);

  // ---- inference loop -----------------------------------------------------
  const tick = useCallback(async () => {
    if (!runningRef.current || busyRef.current) return;
    busyRef.current = true;
    try {
      const models = await loadModels();
      for (const [deviceId, rt] of runtimes.current) {
        if (!runningRef.current) break;
        const vw = rt.video.videoWidth;
        const vh = rt.video.videoHeight;
        if (!vw || !vh) continue;
        const frame = grabCanvas(rt.video, vw, vh, 960);
        const det = await detectFrame(frame, rt.tracker, models, rt.objects);
        rt.lastInferenceMs = det.inferenceMs;
        rt.personCount = det.persons.length;

        const out = processFrame(
          {
            frameBase64: "",
            frameTimestamp: Date.now(),
            camera: rt.config,
            detectedPersons: det.persons.map((p) => ({
              trackId: p.trackId,
              boundingBox: p.boundingBox,
              poseLandmarks: p.poseLandmarks,
              estimatedSpeed: p.estimatedSpeed,
            })),
            detectedObjects: [...det.objects, ...det.vehicles],
            temporalStore: rt.temporal,
          },
          rt.entities,
        );
        rt.entities = out.updatedEntities;
        rt.lastObjects = [...det.objects, ...det.vehicles];

        // the configured safety layer: zones, custody, dwell, crowding, falls.
        // it consumes the same detections, keeps its own temporal state, and
        // raises only events with a measured value behind them.
        const visionFrame = toVisionFrame({
          atMs: Date.now(),
          cameraId: deviceId,
          cameraLabel: rt.config.label,
          frameWidth: frame.width,
          frameHeight: frame.height,
          persons: det.persons,
          objects: [...det.objects, ...det.vehicles],
        });
        // the original frame goes to the evidence buffer before any overlay is
        // drawn on it, at a cadence the buffer can hold rather than every pass.
        const nowMs = visionFrame.atMs;
        if (nowMs - rt.lastEvidencePushMs >= 500) {
          rt.lastEvidencePushMs = nowMs;
          try {
            safetyHub().pushFrame({
              atMs: nowMs,
              sourceId: deviceId,
              width: frame.width,
              height: frame.height,
              dataUrl: frame.toDataURL("image/jpeg", 0.55),
              // enough to redraw the overlay over this exact frame later: the
              // pixels stay original, the drawing is data beside them.
              overlay: {
                cameraLabel: rt.config.label,
                zones: visionSafety().getZones().map((z) => ({ id: z.id, label: z.label, kind: z.kind, polygon: z.polygon })),
                events: rt.safetyEvents.map((e) => ({ id: e.id, type: e.type, box: e.box, value: e.value, unit: e.valueUnit })),
              },
            });
          } catch {
            // an encoder that refuses simply means no pre-roll for this frame.
          }
        }
        const visionResult = await visionSafety().ingest(visionFrame, det.inferenceMs);
        rt.safetyEvents = visionResult.active.filter((e) => e.cameraId === deviceId);

        drawOverlay(rt, det.persons.map((p) => ({ trackId: p.trackId, box: p.boundingBox })), frame.width, frame.height);

        if (!capturingRef.current) {
          for (const ev of out.newThreatEvents) {
            const idx = CAPTURE_TIERS.indexOf(ev.threatTier);
            if (idx < 0 || idx < captureThresholdIndex) continue;
            const last = rt.lastCaptureByTrack.get(ev.trackId) ?? 0;
            if (Date.now() - last < PER_TRACK_COOLDOWN_MS) continue;
            const entity = rt.entities.get(ev.trackId);
            if (!entity) continue;
            rt.lastCaptureByTrack.set(ev.trackId, Date.now());
            capturingRef.current = true;
            try {
              await recordEvent(deviceId, rt, ev, entity, frame);
            } finally {
              capturingRef.current = false;
            }
            break; // one package per camera per cycle keeps the loop responsive
          }
        }

        setTiles((t) => t.map((x) => (x.deviceId === deviceId ? { ...x, personCount: rt.personCount, inferenceMs: Math.round(rt.lastInferenceMs) } : x)));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "the detection pass failed";
      setModelError(msg);
      for (const [deviceId, rt] of runtimes.current) visionSafety().reportFailure(deviceId, rt.config.label, msg);
    } finally {
      busyRef.current = false;
      if (runningRef.current) loopRef.current = window.setTimeout(() => void tick(), 220);
    }
  }, [captureThresholdIndex, recordEvent]);

  const drawOverlay = (rt: Runtime, boxes: Array<{ trackId: string; box: { x: number; y: number; width: number; height: number } }>, w: number, h: number) => {
    const canvas = rt.overlay;
    if (!canvas) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    for (const b of boxes) {
      const entity = rt.entities.get(b.trackId);
      const tier: ThreatTier = entity?.threatTier ?? "observation";
      ctx.strokeStyle = TIER_STYLE[tier].ring;
      ctx.lineWidth = tier === "observation" ? 1.5 : 2.5;
      ctx.strokeRect(b.box.x, b.box.y, b.box.width, b.box.height);
      const label = `${b.trackId.slice(0, 10)} · ${tier}${entity ? ` ${entity.threatScore}` : ""}`;
      ctx.font = "12px ui-monospace, monospace";
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(0,0,0,0.62)";
      ctx.fillRect(b.box.x, Math.max(0, b.box.y - 18), tw, 17);
      ctx.fillStyle = TIER_STYLE[tier].ring;
      ctx.fillText(label, b.box.x + 5, Math.max(11, b.box.y - 5));
    }
    // the configured zones, drawn where the administrator put them, so the
    // operator can see the geometry a restricted-entry event was measured
    // against instead of trusting a label.
    const zones = visionSafety().getZones().filter((z) => z.enabled && (!z.cameraId || z.cameraId === rt.config.cameraId || z.cameraId === rt.config.label));
    const zoneAt = Date.now();
    for (const zone of zones) {
      if (zone.polygon.length < 2) continue;
      const active = zoneActiveAt(zone, new Date(zoneAt));
      ctx.beginPath();
      zone.polygon.forEach((pt, i) => {
        const x = pt.x * w;
        const y = pt.y * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      const barrier = zone.kind === "barrier";
      if (!barrier) ctx.closePath();
      ctx.strokeStyle = active ? (barrier ? "rgba(251,191,36,0.75)" : "rgba(56,189,248,0.6)") : "rgba(255,255,255,0.2)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.setLineDash(active ? [] : [4, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!barrier && active) {
        ctx.fillStyle = zone.kind === "restricted" ? "rgba(239,68,68,0.08)" : "rgba(56,189,248,0.06)";
        ctx.fill();
      }
      const anchor = zone.polygon[0];
      ctx.font = "11px ui-monospace, monospace";
      const zl = `${zone.label} · ${zone.kind}${active ? "" : " · outside schedule"}`;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(anchor.x * w, Math.max(0, anchor.y * h - 16), ctx.measureText(zl).width + 8, 15);
      ctx.fillStyle = active ? "rgba(186,230,253,0.9)" : "rgba(255,255,255,0.5)";
      ctx.fillText(zl, anchor.x * w + 4, Math.max(11, anchor.y * h - 4));
    }

    // live safety events, anchored to the thing that was measured. the label is
    // the observation and its measurement — never a judgement about a person.
    for (const ev of rt.safetyEvents) {
      if (!ev.box) continue;
      const x = ev.box.x * w;
      const y = ev.box.y * h;
      const bw = ev.box.width * w;
      const bh = ev.box.height * h;
      // a weakly-evidenced or uncertainly-associated event is drawn dashed and
      // amber, so the operator can see how sure the measurement is at a glance.
      const tentative = ev.confidence < 0.6 || !ev.associationCertain;
      const colour = tentative ? "rgba(251,191,36,0.9)" : "rgba(248,113,113,0.95)";
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.setLineDash(tentative ? [6, 4] : []);
      ctx.strokeRect(x, y, bw, bh);
      ctx.setLineDash([]);
      const unit = ev.valueUnit === "seconds" ? "s" : "";
      const label = `${EVENT_LABEL[ev.type]} · ${ev.value}${unit} · ${Math.round(ev.confidence * 100)}%${ev.associationCertain ? "" : " · association uncertain"}`;
      ctx.font = "11px ui-monospace, monospace";
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(x, Math.max(0, y - 34), tw, 16);
      ctx.fillStyle = colour;
      ctx.fillText(label, x + 5, Math.max(11, y - 22));
    }

    // the object pass the optical hud draws too: coco-ssd classes with the
    // engine's abandoned flag. objects are named, never people.
    for (const obj of rt.lastObjects) {
      const box = obj.boundingBox;
      const warn = obj.isAbandoned;
      ctx.strokeStyle = warn ? "#F59E0B" : "rgba(255,255,255,0.5)";
      ctx.lineWidth = warn ? 2 : 1.2;
      ctx.setLineDash(warn ? [] : [5, 4]);
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      ctx.setLineDash([]);
      const label = warn ? `${obj.label} · unattended` : obj.label;
      ctx.font = "11px ui-monospace, monospace";
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(box.x, box.y + box.height + 2, tw, 15);
      ctx.fillStyle = warn ? "#FBBF24" : "rgba(255,255,255,0.75)";
      ctx.fillText(label, box.x + 4, box.y + box.height + 13);
    }

    // the radio roster rides in the corner of the same overlay the operator is
    // watching, so what is on screen and what lands in the package agree. it is
    // labelled as presence, never as "this person's device".
    const radios = bleRef.current;
    const lines = radios.length
      ? radios.slice(0, 5).map((r) => `${r.name}${r.manufacturer ? ` · ${r.manufacturer}` : ""}${r.rssi !== null ? ` · ${r.rssi}dBm` : ""}${r.proximityMeters !== null ? ` ~${r.proximityMeters}m` : ""}${r.batteryPercent !== null ? ` · ${r.batteryPercent}%` : ""}${r.fingerprint ? ` · fp ${r.fingerprint}` : ""}`)
      : ["no bluetooth radio observable from this device"];
    ctx.font = "11px ui-monospace, monospace";
    const head = radios.length ? `bt in range (${radios.length}) — presence, not attribution` : "bt in range (0)";
    const all = [head, ...lines];
    const boxW = Math.min(w - 12, Math.max(...all.map((l) => ctx.measureText(l).width)) + 14);
    const boxH = all.length * 14 + 10;
    const bx = w - boxW - 6;
    const by = h - boxH - 6;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = radios.length ? "rgba(56,189,248,0.45)" : "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
    all.forEach((l, i) => {
      ctx.fillStyle = i === 0 ? "rgba(125,211,252,0.9)" : "rgba(255,255,255,0.78)";
      ctx.fillText(l, bx + 7, by + 16 + i * 14);
    });
  };

  const start = useCallback(async () => {
    if (runtimes.current.size === 0) {
      toast.error("no camera attached", { description: "attach at least one camera before starting the watch" });
      return;
    }
    setModelStatus("loading");
    setModelError(null);
    try {
      await loadModels();
      setModelStatus("ready");
    } catch (e) {
      setModelStatus("failed");
      setModelError(e instanceof Error ? e.message : "the on-device models could not load");
      toast.error("detection models did not load", { description: "eagle.eye will not guess without them" });
      return;
    }
    runningRef.current = true;
    setRunning(true);
    void tick();
  }, [tick]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    if (loopRef.current) window.clearTimeout(loopRef.current);
  }, []);

  // ---- review + export ----------------------------------------------------
  const review = (recordId: string, state: EvidenceRecord["reviewState"]) => {
    setRecords((r) => r.map((x) => (x.recordId === recordId ? { ...x, reviewState: state, reviewedAtMs: Date.now() } : x)));
    setOpenRecord((cur) => (cur && cur.recordId === recordId ? { ...cur, reviewState: state, reviewedAtMs: Date.now() } : cur));
  };

  const exportAll = async (subset: EvidenceRecord[], name: string) => {
    if (subset.length === 0) { toast.error("nothing to export yet"); return; }
    setExporting(true);
    try {
      const blob = await exportEvidenceZip(subset);
      downloadBlob(blob, name);
      toast.success("evidence package written", { description: `${subset.length} event${subset.length === 1 ? "" : "s"} with manifest, hashes and printable report` });
    } catch (e) {
      toast.error("export failed", { description: e instanceof Error ? e.message : "the package could not be written" });
    } finally {
      setExporting(false);
    }
  };

  /** a human looked at it: the camera stops flashing and leaves the flagged band. */
  const ack = useCallback((deviceId: string) => {
    setAlerted((a) => { const n = { ...a }; delete n[deviceId]; return n; });
    setFlags((f) => { const n = { ...f }; delete n[deviceId]; return n; });
  }, []);

  // the wall re-orders itself: flagged cameras first, worst tier at the top.
  const orderedTiles = useMemo(() => rankTiles(tiles, flags), [tiles, flags]);

  const attachedIds = useMemo(() => new Set(tiles.map((t) => t.deviceId)), [tiles]);
  const confirmed = records.filter((r) => r.reviewState === "confirmed");

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 p-3 text-white/85">
      {/* command strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <span className="flex items-center gap-2 text-[13px] font-light tracking-wide">
          <Eye className="h-4 w-4 text-white/60" /> eagle.eye
        </span>
        <span className="text-[11px] font-light text-white/40">behavioural watch on cameras you already own · all inference stays on this device</span>
        <div className="ml-auto flex items-center gap-2">
          {!running ? (
            <Button size="sm" onClick={() => void start()} className="h-8 rounded-full bg-white/10 text-[12px] font-light hover:bg-white/15">
              {modelStatus === "loading" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />} start watch
            </Button>
          ) : (
            <Button size="sm" onClick={stop} className="h-8 rounded-full bg-rose-500/15 text-[12px] font-light text-rose-200 hover:bg-rose-500/25">
              <Square className="mr-1.5 h-3.5 w-3.5" /> stop watch
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={exporting || records.length === 0} onClick={() => void exportAll(records, `eagle-eye-evidence-${Date.now()}.zip`)} className="h-8 rounded-full text-[12px] font-light">
            {exporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />} export all
          </Button>
          <Button size="sm" variant="ghost" disabled={exporting || confirmed.length === 0} onClick={() => void exportAll(confirmed, `eagle-eye-confirmed-${Date.now()}.zip`)} className="h-8 rounded-full text-[12px] font-light">
            police package ({confirmed.length})
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto xl:flex-row xl:overflow-visible">
        {/* left: cameras */}
        <div className="flex min-h-0 w-full shrink-0 flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3 xl:w-[230px] xl:overflow-y-auto">
          <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">cameras</div>
          {permission !== "granted" && (
            <button onClick={() => void grantPermission()} className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-left text-[12px] font-light text-white/70 hover:bg-white/[0.07]">
              <Camera className="mb-1 h-3.5 w-3.5" />
              <div>allow camera access</div>
              <div className="text-[10.5px] text-white/40">{permissionError ?? "device names stay hidden until one grant happens"}</div>
            </button>
          )}
          {devices.length === 0 && <div className="text-[11.5px] font-light text-white/40">no video input is exposed by this device</div>}
          {devices.map((d, i) => {
            const on = attachedIds.has(d.deviceId);
            return (
              <button
                key={d.deviceId || i}
                onClick={() => (on ? detachCamera(d.deviceId) : void attachCamera(d))}
                className={`rounded-xl border px-3 py-2 text-left text-[12px] font-light transition ${on ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100/90" : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"}`}
              >
                <div className="truncate">{d.label || `camera ${i + 1}`}</div>
                <div className="text-[10.5px] text-white/40">{on ? "attached — tap to release" : "tap to attach"}</div>
              </button>
            );
          })}

          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/35">bluetooth</div>
          <button
            onClick={() => setRadioPanel((v) => !v)}
            className={`rounded-xl border px-3 py-2 text-left text-[12px] font-light transition ${radioPanel ? "border-sky-400/30 bg-sky-400/10 text-sky-100/90" : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"}`}
          >
            <Bluetooth className="mb-1 h-3.5 w-3.5" />
            <div>{radioPanel ? "hide radio watch" : "open radio watch"}</div>
            <div className="text-[10.5px] text-white/40">
              {passiveScanSupported()
                ? "automatic watch active whenever arvision is open: every nearby radio is logged once a second with distance, movement, dwell time and group arrivals."
                : SCAN_UNAVAILABLE_NOTE}
            </div>
          </button>
          {ble.map((l) => (
            <div key={l.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[11.5px] font-light text-white/65">
              <div className="flex items-center gap-1.5">
                <span className="truncate">{l.name}</span>
                <button
                  onClick={() => {
                    radioWatchers.current.get(l.id)?.();
                    radioWatchers.current.delete(l.id);
                    setBle((b) => b.filter((x) => x.id !== l.id));
                  }}
                  title="drop this radio from the roster"
                  className="ml-auto text-white/30 hover:text-white/70"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="text-[10.5px] text-white/40">
                {l.manufacturer ?? "make not published"}{l.model ? ` · ${l.model}` : ""}{l.batteryPercent !== null ? ` · battery ${l.batteryPercent}%` : ""}
              </div>
              <div className="text-[10.5px] text-white/35">
                {l.source === "scan" ? "observed, not connected" : l.connected ? "connected" : "picked, not connected"} · {l.rssi !== null ? `${l.rssi} dBm ~${l.proximityMeters ?? "?"} m` : "range not reported by this browser"}
              </div>
              {l.observation && <div className="text-[10px] text-white/30">{l.observation}</div>}
              <div className="mt-0.5 text-[10px] text-white/25">{proximityBand(l.proximityMeters)}</div>
            </div>
          ))}
          <div className="text-[10px] font-light leading-relaxed text-white/30">
            every recorded event stores this roster: name, make, model, firmware, battery, signal strength and estimated range, in the frame's provenance strip and as its own radio card. presence in range is never attribution to a person in frame.
          </div>

          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/35">capture from</div>
          <div className="flex flex-wrap gap-1.5">
            {CAPTURE_TIERS.map((t) => (
              <button key={t} onClick={() => setCaptureFrom(t)} className={`rounded-full border px-2.5 py-1 text-[11px] font-light ${captureFrom === t ? TIER_STYLE[t].chip : "border-white/10 bg-white/[0.03] text-white/55"}`}>{t}</button>
            ))}
          </div>

          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/35">render palette</div>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_MODES.map((f) => (
              <button key={f.id} onClick={() => setPreview(f.id)} title={f.note} className={`rounded-full border px-2.5 py-1 text-[11px] font-light ${preview === f.id ? "border-white/25 bg-white/12 text-white/90" : "border-white/10 bg-white/[0.03] text-white/55"}`}>{f.label}</button>
            ))}
          </div>
          <button
            onClick={() => setQuad((q) => !q)}
            className={`rounded-xl border px-3 py-2 text-left text-[12px] font-light transition ${quad ? "border-white/25 bg-white/12 text-white/90" : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]"}`}
          >
            <Grid2X2 className="mb-1 h-3.5 w-3.5" />
            <div>{quad ? "palette grid on" : "palette grid"}</div>
            <div className="text-[10.5px] text-white/40">one square per camera split into every palette — optical, colorized, thermal, spectral, edge — plus the bluetooth roster. tap any pane for full screen.</div>
          </button>
          <div className="text-[10.5px] font-light leading-relaxed text-white/35">every recorded event stores the clean frame plus all palette renderings, whichever one is on screen.</div>

          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/35">thermal path</div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
            <div className="flex items-center gap-2 text-[11.5px] font-light text-white/75">
              <Thermometer className="h-3.5 w-3.5 text-amber-300/70" />
              {thermalRead ? PATH_LABEL[thermalRead.path] : tiles.some((t) => t.thermalDevice) ? "thermal imager attached" : "no thermal imager detected"}
            </div>
            <div className="mt-1 text-[10.5px] font-light leading-relaxed text-white/40">
              {thermalRead ? PATH_NOTE[thermalRead.path] : "attach a usb or phone thermal imager and it is used as a sensor stream. an ordinary webcam can only ever give an estimate."}
            </div>
            {thermalRead?.path === "sensor" && (
              <>
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10.5px] font-light text-white/60">
                  <label className="flex flex-col gap-1">cold raw
                    <input type="number" value={calibration.rawLow} onChange={(e) => setCalibration((c) => ({ ...c, rawLow: Number(e.target.value) }))} className="rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-white/80" />
                  </label>
                  <label className="flex flex-col gap-1">is °c
                    <input type="number" value={calibration.tempLow} onChange={(e) => setCalibration((c) => ({ ...c, tempLow: Number(e.target.value) }))} className="rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-white/80" />
                  </label>
                  <label className="flex flex-col gap-1">hot raw
                    <input type="number" value={calibration.rawHigh} onChange={(e) => setCalibration((c) => ({ ...c, rawHigh: Number(e.target.value) }))} className="rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-white/80" />
                  </label>
                  <label className="flex flex-col gap-1">is °c
                    <input type="number" value={calibration.tempHigh} onChange={(e) => setCalibration((c) => ({ ...c, tempHigh: Number(e.target.value) }))} className="rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-white/80" />
                  </label>
                </div>
                <div className="mt-2 text-[10.5px] font-light text-white/55">
                  {calibrationUsable(calibration) && thermalRead.max !== null
                    ? `scene ${thermalRead.min}°c – ${thermalRead.max}°c · centre ${thermalRead.centre}°c`
                    : "give two references — something at a known cool temperature and something known warm — and the scale becomes celsius."}
                </div>
                <div className="mt-1 text-[10px] font-light leading-relaxed text-white/30">values follow your two references; they are not a factory-calibrated radiometric reading.</div>
              </>
            )}
          </div>
        </div>

        {/* centre: grid */}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
            {tiles.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <Camera className="h-6 w-6 text-white/25" />
                <div className="text-[13px] font-light text-white/60">attach a camera to begin</div>
                <div className="max-w-md text-[11.5px] font-light leading-relaxed text-white/35">
                  eagle.eye turns ordinary cameras into a watched perimeter. it reads movement, dwell, posture and object placement — never faces, never identity.
                </div>
              </div>
            )}
            {orderedTiles.map((t, i) => (
              <CameraTile
                key={t.deviceId}
                tile={t}
                flag={flags[t.deviceId]}
                rank={i}
                preview={preview}
                quad={quad}
                running={running}
                alerted={Boolean(alerted[t.deviceId])}
                calibration={calibration}
                radio={ble}
                onThermal={setThermalRead}
                onAck={() => ack(t.deviceId)}
                onExpand={(mode) => setFull({ deviceId: t.deviceId, mode })}
                bind={(overlay, mount) => {
                  const rt = runtimes.current.get(t.deviceId);
                  if (!rt) return;
                  rt.overlay = overlay;
                  if (mount && rt.video.parentElement !== mount) {
                    mount.replaceChildren(rt.video);
                    rt.video.className = "h-full w-full object-contain";
                  }
                }}
                getFrame={() => {
                  const rt = runtimes.current.get(t.deviceId);
                  if (!rt || !rt.video.videoWidth) return null;
                  return grabCanvas(rt.video, rt.video.videoWidth, rt.video.videoHeight, 960);
                }}
                getOverlay={() => runtimes.current.get(t.deviceId)?.overlay ?? null}
                onDetach={() => detachCamera(t.deviceId)}
              />
            ))}
          </div>

          {gallery && !popped && tiles.length > 0 && (
            <GalleryRail
              tiles={orderedTiles}
              calibration={calibration}
              alerted={alerted}
              getFrame={(id) => {
                const rt = runtimes.current.get(id);
                if (!rt || !rt.video.videoWidth) return null;
                return grabCanvas(rt.video, rt.video.videoWidth, rt.video.videoHeight, 480);
              }}
              onPick={(deviceId, mode) => { setFull({ deviceId, mode }); ack(deviceId); }}
              onPop={() => setPopped(true)}
              onHide={() => setGallery(false)}
            />
          )}
          {!gallery && (
            <button onClick={() => setGallery(true)} className="self-start rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-light text-white/55 hover:bg-white/[0.06]">show feed gallery</button>
          )}

          {radioPanel && (
            <RadioIntelPanel
              roster={radioRoster}
              scanning={scanning}
              scanSupported={passiveScanSupported()}
              scanNote={SCAN_UNAVAILABLE_NOTE}
              onToggleScan={() => void toggleScan()}
              onPickDevice={() => void pickDevice()}
              pickSupported={bluetoothSupported()}
            />
          )}

          <OperationsPanel />
          <SpatialPanel />
          <CapabilityMatrixPanel localInferenceReady={modelStatus === "ready"} />
          <FabricConsolePanel />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] font-light text-white/45">
            <span>{running ? "watching" : "idle"} · {tiles.filter((t) => t.status === "live").length} live camera{tiles.length === 1 ? "" : "s"}</span>
            <span>models {modelStatus}{modelError ? ` — ${modelError}` : ""}</span>
            <span className="truncate">{contextNote}</span>
          </div>
        </div>

        {/* right: events */}
        <div className="flex min-h-0 w-full shrink-0 flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3 xl:w-[300px]">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">recorded events</div>
            {records.length > 0 && (
              <button onClick={() => setRecords([])} className="text-white/35 hover:text-white/70"><Trash2 className="h-3.5 w-3.5" /></button>
            )}
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-2 text-[10.5px] font-light leading-relaxed text-amber-100/75">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>severity describes an observed event — a restricted zone entry, an object left behind, a prolonged stop — never a person. nothing here infers intent, character, dangerousness or identity from a face, a body or an appearance. confirm an event yourself before it leaves this device.</span>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {records.length === 0 && <div className="pt-6 text-center text-[11.5px] font-light text-white/35">nothing recorded yet</div>}
            {records.map((r) => (
              <button
                key={r.recordId}
                onClick={() => { setOpenRecord(r); setOpenVariant(0); }}
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-2 text-left hover:bg-white/[0.06]"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${TIER_STYLE[r.tier].chip}`}>{r.tier}</span>
                  <span className="text-[10.5px] text-white/40">{new Date(r.createdAtMs).toLocaleTimeString()}</span>
                  {r.reviewState === "confirmed" && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-300/80" />}
                  {r.reviewState === "dismissed" && <CircleSlash className="ml-auto h-3.5 w-3.5 text-white/30" />}
                </div>
                <div className="mt-1 line-clamp-2 text-[11.5px] font-light text-white/70">{r.reason}</div>
                <div className="mt-1 truncate text-[10.5px] text-white/35">{r.cameraLabel} · {r.patterns.slice(0, 3).join(", ") || "pattern set recorded"}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {popped && tiles.length > 0 && (
        <FloatingGallery
          tiles={orderedTiles}
          calibration={calibration}
          alerted={alerted}
          getFrame={(id) => {
            const rt = runtimes.current.get(id);
            if (!rt || !rt.video.videoWidth) return null;
            return grabCanvas(rt.video, rt.video.videoWidth, rt.video.videoHeight, 480);
          }}
          onPick={(deviceId, mode) => { setFull({ deviceId, mode }); ack(deviceId); }}
          onDock={() => { setPopped(false); setGallery(true); }}
        />
      )}

      {full && (
        <FullFrame
          label={tiles.find((t) => t.deviceId === full.deviceId)?.label ?? "camera"}
          mode={full.mode}
          onMode={(mode) => setFull((f) => (f ? { ...f, mode } : f))}
          onClose={() => setFull(null)}
          getFrame={() => {
            const rt = runtimes.current.get(full.deviceId);
            if (!rt || !rt.video.videoWidth) return null;
            return grabCanvas(rt.video, rt.video.videoWidth, rt.video.videoHeight, 1280);
          }}
          getOverlay={() => runtimes.current.get(full.deviceId)?.overlay ?? null}
          thermalDevice={Boolean(tiles.find((t) => t.deviceId === full.deviceId)?.thermalDevice)}
          calibration={calibration}
          onThermal={setThermalRead}
        />
      )}

      {openRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setOpenRecord(null)}>
          <div className="flex max-h-full w-full max-w-4xl flex-col gap-3 overflow-y-auto rounded-2xl border border-white/12 bg-[#0b0b0d] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${TIER_STYLE[openRecord.tier].chip}`}>{openRecord.tier} · score {openRecord.score}</span>
              <span className="text-[12px] font-light text-white/60">{openRecord.cameraLabel}</span>
              <button className="ml-auto text-white/40 hover:text-white/80" onClick={() => setOpenRecord(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {openRecord.variants.map((v, i) => (
                <button key={v.key} onClick={() => setOpenVariant(i)} className={`rounded-full border px-2.5 py-1 text-[11px] font-light ${openVariant === i ? "border-white/25 bg-white/12 text-white/90" : "border-white/10 bg-white/[0.03] text-white/55"}`}>{v.label}</button>
              ))}
            </div>
            <img src={openRecord.variants[openVariant]?.dataUrl} alt={openRecord.variants[openVariant]?.label ?? "recorded frame"} className="w-full rounded-xl border border-white/10" />
            <div className="text-[11px] font-light leading-relaxed text-white/45">
              {openRecord.variants[openVariant]?.note} · sha-256 {openRecord.variants[openVariant]?.sha256.slice(0, 32)}…
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[11.5px] font-light leading-relaxed text-white/65">
              <div>{openRecord.reason}</div>
              <div className="mt-2 text-white/40">{contextLine(openRecord.context)}</div>
              <div className="mt-2 text-white/40">patterns: {openRecord.patterns.join(", ") || "none recorded"}</div>
              <div className="mt-2 flex items-start gap-2 text-white/35"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{EVIDENCE_DISCLAIMER}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => review(openRecord.recordId, "confirmed")} className="h-8 rounded-full bg-emerald-500/15 text-[12px] font-light text-emerald-200 hover:bg-emerald-500/25">confirm for reporting</Button>
              <Button size="sm" variant="ghost" onClick={() => review(openRecord.recordId, "dismissed")} className="h-8 rounded-full text-[12px] font-light">dismiss</Button>
              <Button size="sm" variant="ghost" onClick={() => void exportAll([openRecord], `${openRecord.recordId}.zip`)} className="h-8 rounded-full text-[12px] font-light"><Download className="mr-1.5 h-3.5 w-3.5" /> export this event</Button>
              <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard.writeText(JSON.stringify(manifestFor(openRecord), null, 2)); toast.success("manifest copied"); }} className="h-8 rounded-full text-[12px] font-light">copy manifest</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const QUAD_MODES: FilterMode[] = ["clean", "colorized", "thermal", "spectral", "edge"];

/** paints one palette rendering of the live frames at a modest cadence. the
 * pixels come from the same grab the detector reads, so what an operator
 * watches is what the evidence package will contain. */
function FilterPane({ mode, getFrame, getOverlay, className, thermalDevice = false, calibration = null, onThermal, interval = 140 }: {
  mode: FilterMode;
  getFrame: () => HTMLCanvasElement | null;
  getOverlay?: () => HTMLCanvasElement | null;
  className?: string;
  thermalDevice?: boolean;
  calibration?: ThermalCalibration | null;
  onThermal?: (r: { path: ThermalPath; min: number | null; max: number | null; centre: number | null }) => void;
  interval?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reportRef = useRef(onThermal);
  reportRef.current = onThermal;

  useEffect(() => {
    let alive = true;
    let timer = 0;
    let lastReport = 0;
    const paint = () => {
      if (!alive) return;
      const frame = getFrame();
      const target = ref.current;
      if (frame && target) {
        if (target.width !== frame.width || target.height !== frame.height) { target.width = frame.width; target.height = frame.height; }
        const ctx = target.getContext("2d");
        if (ctx) {
          if (mode === "thermal" && thermalDevice) {
            // sensor path: the stream itself carries the magnitude, so it is read
            // and scaled — never re-derived from a visible-light picture.
            const src = frame.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, frame.width, frame.height);
            if (src) {
              const stats = frameStats(src);
              const path = resolvePath(true, stats);
              if (path === "palettized") {
                ctx.drawImage(frame, 0, 0); // the imager already coloured it; leave it alone
                if (reportRef.current && Date.now() - lastReport > 600) {
                  lastReport = Date.now();
                  reportRef.current({ path, min: null, max: null, centre: null });
                }
              } else {
                const r = renderSensorThermal(src, calibration);
                ctx.putImageData(r.image, 0, 0);
                if (reportRef.current && Date.now() - lastReport > 600) {
                  lastReport = Date.now();
                  reportRef.current({ path, min: r.minTemp, max: r.maxTemp, centre: r.centreTemp });
                }
              }
            }
          } else {
            const out = filteredCanvas(frame, mode);
            if (target.width !== out.width || target.height !== out.height) { target.width = out.width; target.height = out.height; }
            ctx.drawImage(out, 0, 0);
            if (mode === "thermal" && reportRef.current && Date.now() - lastReport > 1200) {
              lastReport = Date.now();
              reportRef.current({ path: "estimate", min: null, max: null, centre: null });
            }
          }
          // the detector reading and the radio roster are drawn from the same
          // overlay the clean pane uses, so every rendering shows one truth.
          const ov = getOverlay?.();
          if (ov && ov.width > 0) {
            const ctx2 = target.getContext("2d");
            ctx2?.drawImage(ov, 0, 0, target.width, target.height);
          }
        }
      }
      timer = window.setTimeout(paint, interval);
    };
    paint();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [mode, getFrame, getOverlay, thermalDevice, calibration, interval]);

  return <canvas ref={ref} className={className ?? "absolute inset-0 h-full w-full object-contain"} />;
}

/** the radio pane: every bluetooth radio the recording device can observe right
 * now. it names what the radio published about itself and stops there — a radio
 * in range is presence, never proof that a person in frame is carrying it. */
function RadioPane({ radio }: { radio: BleLink[] }) {
  return (
    <div className="relative overflow-y-auto bg-black/75 p-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-sky-200/70">
        <Bluetooth className="h-3 w-3" /> radios in range ({radio.length})
      </div>
      {radio.length === 0 ? (
        <div className="mt-1.5 text-[10px] font-light leading-relaxed text-white/40">
          start the scan on the left to list the radios broadcasting nearby. nothing here means nothing a browser could observe — not that no radio is present.
        </div>
      ) : (
        <div className="mt-1.5 space-y-1.5">
          {radio.map((r) => (
            <div key={r.id} className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-1">
              <div className="truncate text-[10.5px] font-light text-white/80">{r.name}</div>
              <div className="truncate text-[9.5px] font-light text-white/45">
                {r.manufacturer ?? "make not published"}{r.model ? ` · ${r.model}` : ""}{r.batteryPercent !== null ? ` · ${r.batteryPercent}%` : ""}
              </div>
              <div className="truncate text-[9.5px] font-light text-white/35">
                {r.rssi !== null ? `${r.rssi} dBm · ~${r.proximityMeters ?? "?"} m` : "range not reported"} · {r.source === "scan" ? proximityBandFor(r.proximityMeters) : proximityBand(r.proximityMeters)}
              </div>
              {r.observation && <div className="truncate text-[9.5px] font-light text-white/30">{r.observation}</div>}
              <div className="truncate text-[9px] font-light text-white/25">
                id {r.id.slice(0, 12)}{r.fingerprint ? ` · fp ${r.fingerprint}` : ""}{r.packets ? ` · ${r.packets} packets` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 text-[9px] font-light leading-relaxed text-white/25">
        recorded into every capture. presence in range only, not attribution.
      </div>
    </div>
  );
}

function CameraTile({
  tile, preview, quad, running, alerted, calibration, radio, onThermal, bind, getFrame, getOverlay, onDetach, onAck, onExpand, flag, rank,
}: {
  tile: TileState;
  preview: FilterMode;
  quad: boolean;
  running: boolean;
  alerted: boolean;
  calibration: ThermalCalibration;
  radio: BleLink[];
  onThermal: (r: { path: ThermalPath; min: number | null; max: number | null; centre: number | null }) => void;
  bind: (overlay: HTMLCanvasElement | null, mount: HTMLDivElement | null) => void;
  getFrame: () => HTMLCanvasElement | null;
  getOverlay: () => HTMLCanvasElement | null;
  onDetach: () => void;
  onAck: () => void;
  onExpand: (mode: FilterMode) => void;
  flag?: Flag;
  rank?: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => { bind(overlayRef.current, mountRef.current); }, [bind, quad, preview]);

  const cleanPane = (
    <>
      <div ref={mountRef} className="absolute inset-0" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
    </>
  );

  // the flash is a summons, not decoration: the border alternates white and
  // black five times and then holds a lit ring until a human opens the tile.
  const alertClass = alerted ? "eagle-alert" : "border border-white/10";

  return (
    <div className={`relative min-h-[180px] overflow-hidden rounded-2xl bg-black/50 ${alertClass}`}>
      {quad ? (
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 gap-[2px] bg-white/10">
          {QUAD_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { onAck(); onExpand(m); }}
              className="group relative overflow-hidden bg-black/70 text-left"
              title={`${m} — tap for full screen`}
            >
              {m === "clean" ? cleanPane : <FilterPane mode={m} getFrame={getFrame} getOverlay={getOverlay} thermalDevice={tile.thermalDevice} calibration={calibration} onThermal={m === "thermal" ? onThermal : undefined} />}
              <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9.5px] font-light text-white/65">{m}</span>
              <Maximize2 className="pointer-events-none absolute bottom-1 right-1 h-3 w-3 text-white/25 group-hover:text-white/70" />
            </button>
          ))}
          <RadioPane radio={radio} />
        </div>
      ) : (
        <button type="button" onClick={() => { onAck(); onExpand(preview); }} className="absolute inset-0 block">
          {preview === "clean" ? cleanPane : (
            <>
              <div ref={mountRef} className="invisible absolute inset-0" />
              <FilterPane mode={preview} getFrame={getFrame} thermalDevice={tile.thermalDevice} calibration={calibration} onThermal={preview === "thermal" ? onThermal : undefined} />
              <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
            </>
          )}
          <Maximize2 className="pointer-events-none absolute bottom-2 right-2 h-3.5 w-3.5 text-white/25" />
        </button>
      )}

      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10.5px] font-light text-white/70">
        <span className={`h-1.5 w-1.5 rounded-full ${tile.status === "live" ? (running ? "bg-emerald-400" : "bg-white/40") : "bg-rose-400"}`} />
        <span className="max-w-[160px] truncate">{tile.label}</span>
        <span className="text-white/35">{tile.personCount} tracked · {tile.inferenceMs}ms</span>
        {tile.thermalDevice && <span className="rounded-full bg-amber-400/15 px-1.5 text-[9.5px] text-amber-200/85">thermal sensor</span>}
        {flag && (
          <span className={`rounded-full border px-1.5 py-0.5 text-[9.5px] ${TIER_STYLE[flag.tier].chip}`}>
            #{(rank ?? 0) + 1} · {flag.tier} · {flag.score}
          </span>
        )}
      </div>
      {alerted && (
        <button onClick={onAck} className="absolute bottom-2 left-2 rounded-full border border-white/25 bg-black/70 px-2.5 py-1 text-[10.5px] font-light text-white/85">
          pattern captured — tap to acknowledge
        </button>
      )}
      <button onClick={onDetach} className="absolute right-2 top-2 rounded-full border border-white/10 bg-black/55 p-1 text-white/50 hover:text-white/90"><X className="h-3.5 w-3.5" /></button>
      {tile.status === "failed" && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-[11.5px] font-light text-rose-200/80">{tile.error}</div>
      )}
    </div>
  );
}

/** full-screen read of one camera in one rendering, with the tracking overlay
 * scaled on top and the other renderings one tap away. */
function FullFrame({
  label, mode, onMode, onClose, getFrame, getOverlay, thermalDevice, calibration, onThermal,
}: {
  label: string;
  mode: FilterMode;
  onMode: (m: FilterMode) => void;
  onClose: () => void;
  getFrame: () => HTMLCanvasElement | null;
  getOverlay: () => HTMLCanvasElement | null;
  thermalDevice: boolean;
  calibration: ThermalCalibration;
  onThermal: (r: { path: ThermalPath; min: number | null; max: number | null; centre: number | null }) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const paint = () => {
      if (!alive) return;
      const frame = getFrame();
      const target = ref.current;
      if (frame && target) {
        const src = mode === "thermal" && thermalDevice
          ? frame.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, frame.width, frame.height) ?? null
          : null;
        const sensor = src ? resolvePath(true, frameStats(src)) : null;
        const out = sensor === "palettized" ? frame : sensor === "sensor" ? null : filteredCanvas(frame, mode);
        const w = out ? out.width : frame.width;
        const h = out ? out.height : frame.height;
        if (target.width !== w || target.height !== h) { target.width = w; target.height = h; }
        const ctx = target.getContext("2d");
        if (ctx) {
          if (out) ctx.drawImage(out, 0, 0);
          else if (src) {
            const r = renderSensorThermal(src, calibration);
            ctx.putImageData(r.image, 0, 0);
            onThermal({ path: "sensor", min: r.minTemp, max: r.maxTemp, centre: r.centreTemp });
          }
          const ov = getOverlay();
          if (ov && ov.width > 0) ctx.drawImage(ov, 0, 0, target.width, target.height);
        }
      }
      timer = window.setTimeout(paint, 120);
    };
    paint();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [mode, getFrame, getOverlay, thermalDevice, calibration, onThermal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // the pop-out sits above the dashboard chrome, not under it, so the frame
    // is the only thing on screen. anywhere off the picture — the backdrop, the
    // margins around the canvas — closes it, and so does escape.
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${label} — full screen`}
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
          <Camera className="h-3.5 w-3.5 shrink-0 text-white/45" />
          <span className="truncate text-[12.5px] font-light text-white/80">{label}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {FILTER_MODES.map((f) => (
            <button
              key={f.id}
              onClick={() => onMode(f.id)}
              title={f.note}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-light transition-colors ${mode === f.id ? "border-white/25 bg-white/12 text-white/90" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white/80"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={onClose}
          aria-label="close full screen"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-light text-white/70 hover:border-white/25 hover:text-white/90"
        >
          <X className="h-3.5 w-3.5" /> close
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <canvas
          ref={ref}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-xl border border-white/10 object-contain shadow-[0_0_60px_rgba(0,0,0,0.6)]"
        />
      </div>
      <div className="px-4 pb-4 pt-3 text-center text-[10.5px] font-light text-white/35" onClick={(e) => e.stopPropagation()}>
        {FILTER_MODES.find((f) => f.id === mode)?.note} · click anywhere outside the frame, or press esc, to close
      </div>
    </div>
  );
}



interface GalleryProps {
  tiles: TileState[];
  calibration: ThermalCalibration;
  alerted: Record<string, number>;
  getFrame: (deviceId: string) => HTMLCanvasElement | null;
  onPick: (deviceId: string, mode: FilterMode) => void;
}

/** one live thumbnail per camera per rendering. every one of them is painting
 * from the same frames the detector reads, so the gallery is the whole watch at
 * a glance rather than a menu of things that would run if you picked them. */
function GalleryThumbs({ tiles, calibration, alerted, getFrame, onPick }: GalleryProps) {
  return (
    <>
      {tiles.map((t) => (
        <div key={t.deviceId} className="shrink-0">
          <div className="mb-1 flex items-center gap-1.5 px-0.5 text-[10px] font-light text-white/45">
            <span className="max-w-[130px] truncate">{t.label}</span>
            {t.thermalDevice && <span className="rounded-full bg-amber-400/15 px-1.5 text-[9px] text-amber-200/85">thermal</span>}
          </div>
          <div className="flex gap-1.5">
            {FILTER_MODES.map((f) => (
              <button
                key={f.id}
                onClick={() => onPick(t.deviceId, f.id)}
                title={`${t.label} · ${f.label} — ${f.note}`}
                className={`relative h-[62px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-black/60 ${alerted[t.deviceId] ? "eagle-alert" : "border border-white/10 hover:border-white/30"}`}
              >
                <FilterPane
                  mode={f.id}
                  getFrame={() => getFrame(t.deviceId)}
                  thermalDevice={t.thermalDevice}
                  calibration={calibration}
                  interval={320}
                />
                <span className="pointer-events-none absolute bottom-0 left-0 right-0 bg-black/55 px-1 py-0.5 text-[9px] font-light text-white/65">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function GalleryRail(props: GalleryProps & { onPop: () => void; onHide: () => void }) {
  const { onPop, onHide, ...rest } = props;
  return (
    <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.02] p-2">
      <div className="mb-1.5 flex items-center gap-2 px-0.5">
        <span className="text-[10.5px] uppercase tracking-[0.18em] text-white/35">feed gallery</span>
        <span className="text-[10px] font-light text-white/30">every camera in every rendering, live · tap one for full screen</span>
        <button onClick={onPop} title="pop the gallery out" className="ml-auto text-white/40 hover:text-white/80"><PictureInPicture2 className="h-3.5 w-3.5" /></button>
        <button onClick={onHide} title="hide the gallery" className="text-white/40 hover:text-white/80"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        <GalleryThumbs {...rest} />
      </div>
    </div>
  );
}

/** the popped-out gallery: a floating panel the operator can drag anywhere over
 * the room, so the feeds stay visible while a single camera is full screen. */
function FloatingGallery(props: GalleryProps & { onDock: () => void }) {
  const { onDock, ...rest } = props;
  const [pos, setPos] = useState({ x: 24, y: 96 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 260, e.clientX - dragRef.current.dx)),
        y: Math.max(8, Math.min(window.innerHeight - 120, e.clientY - dragRef.current.dy)),
      });
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);

  return (
    <div
      className="fixed z-[60] max-h-[70vh] w-[360px] overflow-hidden rounded-2xl border border-white/15 bg-[#0b0b0d]/95 shadow-2xl backdrop-blur"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        onPointerDown={(e) => { dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; }}
        className="flex cursor-grab items-center gap-2 border-b border-white/10 px-3 py-2 active:cursor-grabbing"
      >
        <ExternalLink className="h-3.5 w-3.5 text-white/40" />
        <span className="text-[11px] font-light text-white/70">feed gallery</span>
        <button onClick={onDock} className="ml-auto text-[10.5px] font-light text-white/45 hover:text-white/85">dock</button>
      </div>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-2">
        <GalleryThumbs {...rest} />
      </div>
    </div>
  );
}
