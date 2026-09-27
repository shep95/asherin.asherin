// eagle.eye — perception layer.
//
// the behavioural engine reasons about tracked people, their pose, and the
// objects near them. it cannot invent those inputs, so this module supplies real
// ones from the device itself: coco-ssd for person and object boxes, movenet for
// the 17-keypoint skeleton (no face mesh — the engine's rule, kept), and a small
// iou tracker that gives each person a stable id across frames so dwell time,
// loops and retreats mean something.
//
// everything runs in the browser on the device's own gpu. no frame leaves the
// machine for detection.

import type { BoundingBox, DetectedObject, PoseKeypoint, PoseLandmarks } from "./engine";

type CocoModel = { detect: (img: CanvasImageSource, max?: number) => Promise<Array<{ bbox: [number, number, number, number]; class: string; score: number }>> };
type MoveNetModel = { estimatePoses: (img: CanvasImageSource, cfg?: Record<string, unknown>) => Promise<Array<{ keypoints: Array<{ x: number; y: number; score?: number; name?: string }>; score?: number }>> };

let cocoPromise: Promise<CocoModel> | null = null;
let posePromise: Promise<MoveNetModel> | null = null;

export type ModelStatus = "idle" | "loading" | "ready" | "failed";

/** load both models once; concurrent callers share the same promise. */
export async function loadModels(): Promise<{ coco: CocoModel; pose: MoveNetModel }> {
  if (!cocoPromise) {
    cocoPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const coco = await import("@tensorflow-models/coco-ssd");
      return (await coco.load({ base: "lite_mobilenet_v2" })) as unknown as CocoModel;
    })();
  }
  if (!posePromise) {
    posePromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await tf.ready();
      const pd = await import("@tensorflow-models/pose-detection");
      return (await pd.createDetector(pd.SupportedModels.MoveNet, {
        modelType: "SinglePose.Lightning",
        enableSmoothing: true,
      })) as unknown as MoveNetModel;
    })();
  }
  const [coco, pose] = await Promise.all([cocoPromise, posePromise]);
  return { coco, pose };
}

// objects the engine treats as carryable / abandonable.
const CARRIABLE = new Set(["backpack", "handbag", "suitcase", "bottle", "laptop", "cell phone", "umbrella", "sports ball", "baseball bat", "knife", "scissors"]);
const VEHICLE = new Set(["car", "truck", "bus", "motorcycle", "bicycle"]);

export interface TrackedDetection {
  trackId: string;
  boundingBox: BoundingBox;
  poseLandmarks?: PoseLandmarks;
  estimatedSpeed: number;
  confidence: number;
}

export interface DetectionResult {
  persons: TrackedDetection[];
  objects: DetectedObject[];
  vehicles: DetectedObject[];
  inferenceMs: number;
}

function iou(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union <= 0 ? 0 : inter / union;
}

interface TrackSlot {
  id: string;
  box: BoundingBox;
  centre: { x: number; y: number };
  lastSeen: number;
  misses: number;
  speed: number;
}

/**
 * bytetrack-shaped association without the deep re-id model: greedy iou match,
 * centroid fallback for fast movers, and a miss budget so a person occluded for
 * a moment keeps their identity instead of becoming a "new" loiterer.
 */
export class IouTracker {
  private slots: TrackSlot[] = [];
  private counter = 0;
  constructor(private readonly iouFloor = 0.25, private readonly maxMisses = 12) {}

  step(boxes: BoundingBox[], nowMs: number): Array<{ trackId: string; box: BoundingBox; speed: number }> {
    const taken = new Set<number>();
    const out: Array<{ trackId: string; box: BoundingBox; speed: number }> = [];

    for (const box of boxes) {
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      let best = -1;
      let bestScore = 0;
      this.slots.forEach((s, i) => {
        if (taken.has(i)) return;
        const overlap = iou(s.box, box);
        const near = Math.hypot(s.centre.x - centre.x, s.centre.y - centre.y);
        // near-miss rescue: a fast walker can drop below the iou floor between
        // frames while still plainly being the same person.
        const score = overlap >= this.iouFloor ? overlap : near < Math.max(60, box.width) ? 0.2 : 0;
        if (score > bestScore) { bestScore = score; best = i; }
      });

      if (best >= 0) {
        const slot = this.slots[best];
        const dt = Math.max(1, nowMs - slot.lastSeen) / 1000;
        const dist = Math.hypot(centre.x - slot.centre.x, centre.y - slot.centre.y);
        const instant = dist / dt; // px/s
        slot.speed = slot.speed * 0.65 + instant * 0.35;
        slot.box = box;
        slot.centre = centre;
        slot.lastSeen = nowMs;
        slot.misses = 0;
        taken.add(best);
        out.push({ trackId: slot.id, box, speed: slot.speed });
      } else {
        const id = `trk_${++this.counter}_${Math.random().toString(36).slice(2, 6)}`;
        this.slots.push({ id, box, centre, lastSeen: nowMs, misses: 0, speed: 0 });
        out.push({ trackId: id, box, speed: 0 });
      }
    }

    this.slots = this.slots.filter((s, i) => {
      if (taken.has(i)) return true;
      s.misses += 1;
      return s.misses <= this.maxMisses;
    });
    return out;
  }

  reset() { this.slots = []; this.counter = 0; }
  get size() { return this.slots.length; }
}

const KP = (x = 0, y = 0, confidence = 0): PoseKeypoint => ({ x, y, confidence });

/**
 * movenet gives 17 coco keypoints; the engine's schema wants 18 mediapipe-style
 * ones including finger points. movenet has no finger landmarks, so the hand
 * points are derived from the wrist with the wrist's own confidence carried
 * through — they are declared derived, never presented as measured fingers.
 */
export function toEngineLandmarks(keypoints: Array<{ x: number; y: number; score?: number; name?: string }>): PoseLandmarks | undefined {
  const by = new Map<string, { x: number; y: number; score?: number }>();
  for (const k of keypoints) if (k.name) by.set(k.name, k);
  const get = (n: string) => {
    const k = by.get(n);
    return k ? KP(k.x, k.y, k.score ?? 0) : KP();
  };
  const ls = get("left_shoulder");
  const rs = get("right_shoulder");
  const lw = get("left_wrist");
  const rw = get("right_wrist");
  if (ls.confidence < 0.2 && rs.confidence < 0.2) return undefined;
  // derived finger points: a short extension of the forearm past the wrist.
  const derive = (wrist: PoseKeypoint, elbow: PoseKeypoint, spread: number): PoseKeypoint => {
    const dx = wrist.x - elbow.x;
    const dy = wrist.y - elbow.y;
    const len = Math.hypot(dx, dy) || 1;
    return KP(wrist.x + (dx / len) * spread, wrist.y + (dy / len) * spread, wrist.confidence);
  };
  const le = get("left_elbow");
  const re = get("right_elbow");
  return {
    leftShoulder: ls,
    rightShoulder: rs,
    leftElbow: le,
    rightElbow: re,
    leftWrist: lw,
    rightWrist: rw,
    leftHip: get("left_hip"),
    rightHip: get("right_hip"),
    leftKnee: get("left_knee"),
    rightKnee: get("right_knee"),
    leftAnkle: get("left_ankle"),
    rightAnkle: get("right_ankle"),
    leftPinky: derive(lw, le, 14),
    rightPinky: derive(rw, re, 14),
    leftIndex: derive(lw, le, 10),
    rightIndex: derive(rw, re, 10),
    leftThumb: derive(lw, le, 6),
    rightThumb: derive(rw, re, 6),
  };
}

export interface DetectOptions {
  minPersonScore?: number;
  minObjectScore?: number;
  posesFor?: number; // how many of the largest persons get a skeleton
}

export async function detectFrame(
  frame: HTMLCanvasElement,
  tracker: IouTracker,
  models: { coco: CocoModel; pose: MoveNetModel },
  seenObjects: Map<string, DetectedObject>,
  opts: DetectOptions = {},
): Promise<DetectionResult> {
  const t0 = performance.now();
  const minPerson = opts.minPersonScore ?? 0.45;
  const minObject = opts.minObjectScore ?? 0.4;
  const posesFor = opts.posesFor ?? 2;

  const raw = await models.coco.detect(frame, 20);
  const personBoxes: BoundingBox[] = [];
  const objects: DetectedObject[] = [];
  const vehicles: DetectedObject[] = [];
  const now = Date.now();

  for (const d of raw) {
    const box: BoundingBox = { x: d.bbox[0], y: d.bbox[1], width: d.bbox[2], height: d.bbox[3] };
    if (d.class === "person") {
      if (d.score >= minPerson) personBoxes.push(box);
      continue;
    }
    if (d.score < minObject) continue;
    const isCarriable = CARRIABLE.has(d.class);
    const isVehicle = VEHICLE.has(d.class);
    if (!isCarriable && !isVehicle) continue;
    // an object keeps its id while it stays roughly in place, which is what
    // makes "placed at T, owner walked away" a measurable sequence.
    const key = `${d.class}:${Math.round(box.x / 40)}:${Math.round(box.y / 40)}`;
    const prior = seenObjects.get(key);
    const obj: DetectedObject = prior
      ? { ...prior, boundingBox: box }
      : { objectId: `obj_${key}_${now}`, label: d.class, boundingBox: box, placedTimestamp: now, isAbandoned: false };
    seenObjects.set(key, obj);
    (isVehicle ? vehicles : objects).push(obj);
  }

  const tracked = tracker.step(personBoxes, now);
  const ordered = [...tracked].sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height);
  const withPose = new Map<string, PoseLandmarks>();

  for (const t of ordered.slice(0, posesFor)) {
    // crop to the person so single-pose movenet reads the right body.
    const pad = 0.12;
    const cx = Math.max(0, t.box.x - t.box.width * pad);
    const cy = Math.max(0, t.box.y - t.box.height * pad);
    const cw = Math.min(frame.width - cx, t.box.width * (1 + pad * 2));
    const ch = Math.min(frame.height - cy, t.box.height * (1 + pad * 2));
    if (cw < 24 || ch < 48) continue;
    const crop = document.createElement("canvas");
    crop.width = Math.round(cw);
    crop.height = Math.round(ch);
    const cctx = crop.getContext("2d");
    if (!cctx) continue;
    cctx.drawImage(frame, cx, cy, cw, ch, 0, 0, crop.width, crop.height);
    try {
      const poses = await models.pose.estimatePoses(crop, { maxPoses: 1, flipHorizontal: false });
      const p = poses[0];
      if (!p) continue;
      // map crop-space keypoints back into frame space so zone maths stays valid.
      const mapped = p.keypoints.map((k) => ({ ...k, x: cx + k.x, y: cy + k.y }));
      const lm = toEngineLandmarks(mapped);
      if (lm) withPose.set(t.trackId, lm);
    } catch {
      /* a failed pose read leaves the person tracked without a skeleton */
    }
  }

  return {
    persons: tracked.map((t) => ({
      trackId: t.trackId,
      boundingBox: t.box,
      poseLandmarks: withPose.get(t.trackId),
      estimatedSpeed: t.speed,
      confidence: 1,
    })),
    objects,
    vehicles,
    inferenceMs: performance.now() - t0,
  };
}
