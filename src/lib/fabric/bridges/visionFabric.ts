// asherin — arvision / eagle.eye -> shared fabric.
//
// Pure publishers. This module never subscribes back into the camera pipeline
// and never holds a second copy of the vision state; the pipeline calls these
// functions at the points where it already has real data in hand, so nothing
// can appear in the fabric that a model did not actually produce from a frame.
//
// The bluetooth half subscribes to the existing safety hub, which is fed only
// by authorized edge scanners over the sensor bridge. A browser tab is never
// accepted as a receiver here, because a tab cannot prove which antenna heard a
// packet or where that antenna stands.

import { safetyHub, type SafetySnapshot } from "@/lib/arvision/safety/hub";
import type { BleDeviceRecord } from "@/lib/arvision/ble/types";
import type { CameraDetectorStatus } from "@/lib/arvision/vision/bridge";
import type { VisionEvent, VisionFrameInput } from "@/lib/arvision/vision/types";
import { sensorFabric } from "../fabric";
import { provenance } from "../clock";
import { zoneFor } from "../zoneBinding";
import type { FabricHealth, FabricObservation, UncertaintyRegion } from "../types";

const CAMERA_PREFIX = "camera:";
const RECEIVER_PREFIX = "ble-receiver:";

/** tracks are published at most this often per camera; the detector runs far
 *  faster and a per-frame stream would drown the timeline in duplicates. */
const TRACK_PUBLISH_MS = 1000;
const lastTrackPublish = new Map<string, number>();
const publishedEvents = new Map<string, number>();

const healthOf = (state: CameraDetectorStatus["state"]): FabricHealth =>
  state === "running" ? "live" : state === "stalled" ? "stale" : state === "model_failed" ? "error" : "unavailable";

export function publishCameraStatus(cameras: CameraDetectorStatus[]) {
  const fabric = sensorFabric();
  for (const cam of cameras) {
    const bound = zoneFor(`${CAMERA_PREFIX}${cam.cameraId}`);
    fabric.upsertSensor({
      id: `${CAMERA_PREFIX}${cam.cameraId}`,
      label: cam.cameraLabel,
      modality: "vision",
      subsystem: "arvision",
      capabilities: ["rgb frames", "on-device person and object detection", "on-device pose"],
      limitations: [
        "no depth, no temperature, no through-wall sensing",
        "track ids are camera-local and end when the tab ends",
        "no world coordinates unless this camera is calibrated and surveyed into a site frame",
      ],
      authorization: "operator_device",
      health: healthOf(cam.state),
      healthDetail: cam.detail,
      siteId: null,
      zoneId: bound?.zoneId ?? null,
      lastObservationMs: cam.lastFrameAtMs,
      spatiallyRegistered: false,
    });
  }
}

export function releaseCameraSensor(cameraId: string) {
  sensorFabric().removeSensor(`${CAMERA_PREFIX}${cameraId}`);
  lastTrackPublish.delete(cameraId);
}

/**
 * One analysed frame's tracks, normalized. The box is normalized frame space —
 * the only geometry a single uncalibrated camera can honestly assert — and
 * worldPoint stays null until spatial registration exists.
 */
export function publishVisionFrame(frame: VisionFrameInput, inferenceMs: number | null) {
  const last = lastTrackPublish.get(frame.cameraId) ?? 0;
  if (frame.atMs - last < TRACK_PUBLISH_MS) return;
  lastTrackPublish.set(frame.cameraId, frame.atMs);

  const sensorId = `${CAMERA_PREFIX}${frame.cameraId}`;
  const bound = zoneFor(sensorId);
  const fabric = sensorFabric();

  for (const track of frame.tracks) {
    const obs: FabricObservation = {
      id: `vt_${frame.cameraId}_${track.trackId}_${frame.atMs}`,
      type: "visual_track",
      modality: "vision",
      atMs: frame.atMs,
      siteId: null,
      zoneId: bound?.zoneId ?? null,
      zoneLabel: bound?.zoneLabel ?? null,
      cameraId: frame.cameraId,
      trackId: track.trackId,
      box: {
        x: track.box.x / frame.frameWidth,
        y: track.box.y / frame.frameHeight,
        width: track.box.width / frame.frameWidth,
        height: track.box.height / frame.frameHeight,
      },
      worldPoint: null,
      trackState: "tracking",
      provenance: provenance({
        sensorId,
        sensorLabel: frame.cameraLabel,
        subsystem: "arvision",
        adapter: "eagle.eye on-device detector (coco-ssd + movenet)",
        kind: "model_inference",
        sourceClockMs: frame.atMs,
        note: `detector output${inferenceMs === null ? "" : ` in ${inferenceMs}ms`}. a temporary shape in this camera's frame — not a person's identity.`,
      }),
      confidence: {
        value: null,
        basis: "the tracker reports continuity, not a probability that this shape is one specific thing",
      },
      summary: `track ${track.trackId} held on ${frame.cameraLabel}`,
    };
    fabric.publish(obs);
  }
}

export function publishVisionEvents(events: VisionEvent[]) {
  const fabric = sensorFabric();
  for (const ev of events) {
    const seen = publishedEvents.get(ev.id);
    if (seen === ev.updatedAtMs) continue;
    publishedEvents.set(ev.id, ev.updatedAtMs);
    if (publishedEvents.size > 500) publishedEvents.clear();

    const sensorId = `${CAMERA_PREFIX}${ev.cameraId}`;
    const bound = zoneFor(sensorId);
    fabric.publish({
      id: `ve_${ev.id}_${ev.updatedAtMs}`,
      type: "visual_event",
      modality: "vision",
      atMs: ev.openedAtMs,
      siteId: null,
      zoneId: ev.zoneId ?? bound?.zoneId ?? null,
      zoneLabel: ev.zoneLabel ?? bound?.zoneLabel ?? null,
      cameraId: ev.cameraId,
      eventType: ev.type,
      trackIds: ev.trackIds,
      value: ev.value,
      valueUnit: ev.valueUnit,
      evidence: ev.evidence,
      associationCertain: ev.associationCertain,
      incidentId: ev.incidentId,
      provenance: provenance({
        sensorId,
        sensorLabel: ev.cameraLabel,
        subsystem: "arvision",
        adapter: "arvision vision event engine",
        kind: "model_inference",
        sourceClockMs: ev.updatedAtMs,
        note: ev.associationCertain
          ? "thresholds measured on tracked geometry; it describes motion, never a person's character"
          : "tracking continuity broke during this event, so which shape did what is uncertain",
      }),
      confidence: { value: ev.confidence, basis: "measured evidence quality reported by the event engine" },
      summary: `${ev.type.replace(/_/g, " ")} — ${ev.detail}`,
    });
  }
}

// ---- bluetooth, from authorized edge receivers only ------------------------

function regionOf(rec: BleDeviceRecord): UncertaintyRegion {
  const loc = rec.localization;
  if (loc.mode === "multilateration" && loc.position) {
    return {
      method: "multilateration",
      centre: loc.position,
      radiusM: loc.uncertaintyM,
      receiverIds: rec.scannerIds.map((s) => `${RECEIVER_PREFIX}${s}`),
      evidence: loc.evidence,
      limitation: "a region, not a point. the transmitter is somewhere inside it, and the region says nothing about who is carrying it.",
    };
  }
  if (loc.mode === "range_only") {
    return {
      method: "single_receiver_range",
      centre: null,
      radiusM: loc.rangeM,
      receiverIds: rec.scannerIds.map((s) => `${RECEIVER_PREFIX}${s}`),
      evidence: loc.evidence,
      limitation: loc.limitation || "one receiver gives a radius around that receiver and no direction. it cannot be drawn on a camera.",
    };
  }
  return {
    method: "none",
    centre: null,
    radiusM: null,
    receiverIds: [],
    evidence: loc.evidence,
    limitation: loc.limitation || "no surveyed receiver geometry exists, so no position of any kind may be produced.",
  };
}

function publishSafetySnapshot(snap: SafetySnapshot) {
  const fabric = sensorFabric();

  for (const scanner of snap.scanners) {
    fabric.upsertSensor({
      id: `${RECEIVER_PREFIX}${scanner.id}`,
      label: scanner.label,
      modality: "radio",
      subsystem: "arvision",
      capabilities: ["passive bluetooth low energy advertisement reception"],
      limitations: [
        "receives broadcasts only — it never pairs, connects, authenticates or decrypts",
        scanner.calibrated ? "calibrated for range estimation in this space" : "not calibrated: rssi cannot be turned into a trustworthy range here",
        scanner.position ? "surveyed into the site frame" : "position never surveyed, so it cannot contribute to multilateration",
      ],
      authorization: "operated_under_contract",
      health: scanner.health === "live" ? "live" : scanner.health === "stale" ? "stale" : "unavailable",
      healthDetail: scanner.health === "live" ? "reporting over the sensor bridge" : `receiver is ${scanner.health}`,
      siteId: null,
      zoneId: scanner.zoneId,
      lastObservationMs: scanner.lastObservationMs,
      spatiallyRegistered: scanner.position !== null,
    });
  }

  for (const rec of snap.devices) {
    if (rec.stale) continue;
    const receiverId = `${RECEIVER_PREFIX}${rec.scannerIds[0] ?? "unknown"}`;
    const receiverLabel = snap.scanners.find((s) => `${RECEIVER_PREFIX}${s.id}` === receiverId)?.label ?? "unidentified receiver";
    const bound = zoneFor(receiverId);
    const region = regionOf(rec);

    fabric.publish({
      id: `rs_${rec.key}_${rec.lastSeenMs}`,
      type: "radio_sighting",
      modality: "radio",
      atMs: rec.lastSeenMs,
      siteId: null,
      zoneId: rec.zoneId ?? bound?.zoneId ?? null,
      zoneLabel: bound?.zoneLabel ?? null,
      receiverId,
      deviceKey: rec.key,
      handle: rec.handle,
      rssi: rec.lastRssi,
      estimatedRangeM: region.method === "single_receiver_range" ? region.radiusM : null,
      addressRandomized: rec.addressType.startsWith("random") ? true : rec.addressType === "public" ? false : null,
      vendor: rec.classification.vendor,
      category: rec.classification.category,
      provenance: provenance({
        sensorId: receiverId,
        sensorLabel: receiverLabel,
        subsystem: "arvision",
        adapter: "edge bluetooth receiver over the sensor bridge",
        kind: "raw_observation",
        sourceClockMs: rec.lastSeenMs,
        receivedAtMs: rec.lastSeenMs + rec.clockSkewMs,
        note: "a broadcast was received. it says a radio is powered on within range of this antenna — nothing about who, if anyone, is carrying it.",
      }),
      confidence: { value: rec.classification.confidence, basis: rec.classification.evidence.join("; ") || "no classifying broadcast fact was present" },
      summary: `${rec.handle} heard by ${receiverLabel} at ${rec.lastRssi} dBm`,
    });

    if (region.method === "multilateration") {
      fabric.publish({
        id: `rr_${rec.key}_${rec.lastSeenMs}`,
        type: "radio_region",
        modality: "radio",
        atMs: rec.lastSeenMs,
        siteId: null,
        zoneId: rec.zoneId ?? bound?.zoneId ?? null,
        zoneLabel: bound?.zoneLabel ?? null,
        deviceKey: rec.key,
        handle: rec.handle,
        region,
        provenance: provenance({
          sensorId: receiverId,
          sensorLabel: `${rec.scannerIds.length} authorized receivers`,
          subsystem: "arvision",
          adapter: "multi-receiver positioning over surveyed geometry",
          kind: "derived_estimate",
          sourceClockMs: rec.lastSeenMs,
          note: "solved from several receivers with surveyed positions. an area, not a point, and not a person.",
        }),
        confidence: { value: null, basis: `uncertainty radius ${region.radiusM ?? "unknown"}m across ${region.receiverIds.length} receivers` },
        summary: `${rec.handle} localized to a ${region.radiusM ?? "?"}m region`,
      });
    }
  }
}

let bootedVision = false;
let offSafety: (() => void) | null = null;

/** Subscribes the bluetooth half. Cameras publish from the vision bridge. */
export function bootVisionFabric() {
  if (bootedVision) return;
  bootedVision = true;
  offSafety = safetyHub().subscribe(publishSafetySnapshot);
}

export function shutdownVisionFabric() {
  offSafety?.();
  offSafety = null;
  bootedVision = false;
}
