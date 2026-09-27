// asherin.arvision — perception output → event engine input.
//
// The detector speaks in pixels and in the engine's 18-point landmark schema.
// The safety machines speak in normalized frame coordinates and in the few
// joint measurements they are allowed to use. This file is the whole of the
// translation, and it is deliberately the only place a pixel becomes a fraction.
//
// One thing it fixes that would otherwise be a real bug: each camera runs its
// own tracker, and each tracker counts from one. Two cameras would hand out the
// same track id for two unrelated shapes. Ids are namespaced by camera here, so
// "the same track" can never accidentally mean "the same number on a different
// camera".

import type { DetectedObject, PoseLandmarks } from "@/components/dashboard/arvision/eagle/engine";
import type { PoseSummary, VisionFrameInput, VisionTrackInput } from "./types";

/**
 * Reduce the landmark set to the measurements the safety machines use: where
 * the shoulder line, hip line and ankles are, and where the wrists are. No
 * face points are read, and none are present in the source schema either.
 */
export function toPoseSummary(
  lm: PoseLandmarks | undefined,
  frameWidth: number,
  frameHeight: number,
): PoseSummary | null {
  if (!lm) return null;
  const h = frameHeight || 1;
  const w = frameWidth || 1;
  const used = [lm.leftShoulder, lm.rightShoulder, lm.leftHip, lm.rightHip, lm.leftAnkle, lm.rightAnkle];
  const scored = used.filter((k) => k.confidence > 0.2);
  const quality = used.reduce((s, k) => s + k.confidence, 0) / used.length;
  // the engine needs the trunk and at least one ankle to say anything about
  // whether a body is upright. without them it says nothing.
  const usable = scored.length >= 4 && (lm.leftAnkle.confidence > 0.2 || lm.rightAnkle.confidence > 0.2);

  const meanY = (a: { y: number; confidence: number }, b: { y: number; confidence: number }) => {
    const total = a.confidence + b.confidence;
    return total <= 0 ? (a.y + b.y) / 2 / h : (a.y * a.confidence + b.y * b.confidence) / total / h;
  };

  return {
    quality: Math.max(0, Math.min(1, quality)),
    shoulderY: meanY(lm.leftShoulder, lm.rightShoulder),
    hipY: meanY(lm.leftHip, lm.rightHip),
    ankleY: Math.max(lm.leftAnkle.y, lm.rightAnkle.y) / h,
    wrists: [lm.leftWrist, lm.rightWrist].map((k) => ({ x: k.x / w, y: k.y / h, confidence: k.confidence })),
    usable,
  };
}

export interface PerceptionPerson {
  trackId: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  poseLandmarks?: PoseLandmarks;
  estimatedSpeed: number;
}

/** Build one frame of engine input from one pass of the on-device models. */
export function toVisionFrame(args: {
  atMs: number;
  cameraId: string;
  cameraLabel: string;
  frameWidth: number;
  frameHeight: number;
  persons: PerceptionPerson[];
  objects: DetectedObject[];
}): VisionFrameInput {
  const tracks: VisionTrackInput[] = args.persons.map((p) => ({
    trackId: `${args.cameraId}::${p.trackId}`,
    box: p.boundingBox,
    speedPxPerSec: Number.isFinite(p.estimatedSpeed) ? p.estimatedSpeed : 0,
    pose: toPoseSummary(p.poseLandmarks, args.frameWidth, args.frameHeight),
  }));

  return {
    atMs: args.atMs,
    cameraId: args.cameraId,
    cameraLabel: args.cameraLabel,
    frameWidth: args.frameWidth,
    frameHeight: args.frameHeight,
    tracks,
    objects: args.objects.map((o) => ({
      objectId: `${args.cameraId}::${o.objectId}`,
      label: o.label,
      box: o.boundingBox,
    })),
  };
}
