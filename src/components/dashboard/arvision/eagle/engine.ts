// =============================================================================
// ARVISION — UNIFIED BEHAVIORAL DETECTION ENGINE v2
// converted from: eagle risk_engine.py, bytetrack, mediapipe pose,
//                 deepeye anomaly, objleft abandoned object,
//                 loitering detection, fight detection LSTM
// target: lovable.dev typescript react project
// no face mesh. no biometric ID logging.
// behavioral pattern detection only.
// fixes applied v2:
//   - react imports moved to top
//   - PatternCategory union completed (non_social_coordination added)
//   - zone point-in-polygon resolver added and wired in
//   - processFrame now resolves zone from polygon not string passthrough
//   - micro-retreat wired with nearest other entity as target
//   - body squaring wired to nearest entity target
//   - palm wiping tracked via wrist-to-thigh proximity history
//   - temporal recurrence store added (scout-return detection)
//   - useCallback dependency fixed (camera.cameraId string not object)
//   - exportEventLog fixed to use ref not stale closure
//   - alert count fixed to count before slice not after
//   - escalation chain reset logic corrected (was resetting on every expired check)
// =============================================================================

import { useState, useCallback, useRef, useEffect } from "react";

// =============================================================================
// SECTION 1 — CORE TYPE DEFINITIONS
// =============================================================================

export type ThreatTier = "observation" | "elevated" | "high" | "critical";

export type PatternCategory =
  | "stillness_anomaly"
  | "movement_anomaly"
  | "hand_concealment"
  | "pre_action_hand"
  | "scanning_behavior"
  | "gaze_fixation"
  | "zone_violation"
  | "abandoned_object"
  | "loitering"
  | "trajectory_loop"
  | "micro_retreat"
  | "escalation_chain"
  | "group_coordination"
  | "non_social_coordination"
  | "distraction_action_pair"
  | "vehicle_anomaly"
  | "pre_violence"
  | "weight_shift"
  | "camera_avoidance"
  | "weapon_check"
  | "arm_rigidity"
  | "target_locking"
  | "confrontation_stance"
  | "pace_inconsistency"
  | "palm_wiping"
  | "looping_trajectory";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PoseKeypoint {
  x: number;
  y: number;
  confidence: number;
}

// 18 keypoints from mediapipe pose — no face mesh points
export interface PoseLandmarks {
  leftShoulder: PoseKeypoint;
  rightShoulder: PoseKeypoint;
  leftElbow: PoseKeypoint;
  rightElbow: PoseKeypoint;
  leftWrist: PoseKeypoint;
  rightWrist: PoseKeypoint;
  leftHip: PoseKeypoint;
  rightHip: PoseKeypoint;
  leftKnee: PoseKeypoint;
  rightKnee: PoseKeypoint;
  leftAnkle: PoseKeypoint;
  rightAnkle: PoseKeypoint;
  leftPinky: PoseKeypoint;
  rightPinky: PoseKeypoint;
  leftIndex: PoseKeypoint;
  rightIndex: PoseKeypoint;
  leftThumb: PoseKeypoint;
  rightThumb: PoseKeypoint;
}

export interface TrackHistoryEntry {
  timestamp: number;
  position: { x: number; y: number };
  speed: number;
  zone: string;
  poseSnapshot?: PoseLandmarks;
}

export interface TrackedEntity {
  trackId: string;
  firstSeen: number;
  lastSeen: number;
  boundingBox: BoundingBox;
  poseLandmarks?: PoseLandmarks;
  history: TrackHistoryEntry[];
  dwellTimeMs: number;
  signalFlags: Set<PatternCategory>;
  threatScore: number;
  threatTier: ThreatTier;
  escalationChainStep: number;
  escalationChainStartMs: number;
  loopCount: number;
  retreatCycleCount: number;
  weaponCheckCount: number;
  palmWipeCount: number;
  gazeFocusTarget?: string;
  approachWithdrawCount: number;
  lastChainTimestamp: number;
  baselineSpeed: number;
  speedSamples: number[];
}

export interface DetectedObject {
  objectId: string;
  label: string;
  boundingBox: BoundingBox;
  placedTimestamp?: number;
  ownerId?: string;
  isAbandoned: boolean;
}

export interface ZoneDefinition {
  zoneId: string;
  name: string;
  type: "utility" | "restricted" | "high_value" | "normal" | "exit" | "entry";
  polygon: Array<{ x: number; y: number }>;
  threatMultiplier: number;
}

export interface CameraConfig {
  cameraId: string;
  label: string;
  locationCoords: { lat: number; lng: number };
  ipAddress: string;
  timezone: string;
  zones: ZoneDefinition[];
  baselineDwellMs: number;
  baselineWalkSpeed: number;
}

export interface ThreatEvent {
  eventId: string;
  timestamp: number;
  isoTimestamp: string;
  timezone: string;
  cameraId: string;
  locationCoords: { lat: number; lng: number };
  ipAddress: string;
  trackId: string;
  threatTier: ThreatTier;
  threatScore: number;
  patternsTriggered: PatternCategory[];
  signalCount: number;
  escalationChainStep: number;
  screenshotClean?: string;
  screenshotAnnotated?: string;
  clipBufferSeconds: number;
  naturalLanguageReason: string;
  requiresHumanReview: boolean;
}

// temporal recurrence store — persists across frames to detect scout-return pattern
export interface TemporalRecord {
  cameraId: string;
  behaviorSignature: string;
  firstOccurrenceMs: number;
  lastOccurrenceMs: number;
  occurrenceCount: number;
  zone: string;
}

// =============================================================================
// SECTION 2 — OBSERVABLE EVENT SEVERITY
//
// This section used to score people. It read body language — a hand near a
// waistband, a wiped palm, a clenched fist, a squared stance, where someone was
// looking — and turned it into a "threat" number about a human being. That is
// intent inference from appearance, and no camera can do it. A nervous person,
// a cold person, a disabled person and a person adjusting a belt all produce
// the same pixels.
//
// What a camera CAN observe is an event: something entered a restricted zone, a
// bag was left behind, an object was removed, someone stopped moving, a vehicle
// is where vehicles do not belong. Severity below is computed from those
// observable events only. The body-language fields remain on the input type so
// existing callers keep compiling, but they carry weight zero and are never
// allowed to raise a severity — they are recorded as context for a human
// reviewer, nothing more.
// =============================================================================

export interface RiskSignalInput {
  inDangerZone: boolean;
  inRestrictedZone: boolean;
  carryingSuspiciousItem: boolean;
  dwellTimeMs: number;
  minDwellThresholdMs: number;
  interactionCount: number;
  maxInteractions: number;
  motionType: "normal" | "erratic" | "looping" | "retreating";
  repeatedApproachCount: number;
  handConcealmentActive: boolean;
  weaponCheckCount: number;
  armRigidityDetected: boolean;
  fistClenchingActive: boolean;
  palmWipingCount: number;
  rapidScanningActive: boolean;
  gazeFixationCount: number;
  cameraAvoidanceDetected: boolean;
  abandonedObjectDetected: boolean;
  utilityZoneOccupied: boolean;
  sameTimeRecurrence: boolean;
  scoutReturnDetected: boolean;
  nonSocialCoordination: boolean;
  distractionActionPair: boolean;
  targetLockingActive: boolean;
  confrontationStanceDetected: boolean;
  escalationChainStep: number;
  vehicleCirclingDetected: boolean;
  stationaryRunningVehicle: boolean;
}

/** Only observable events carry weight. Everything else is exactly zero. */
export const EVENT_WEIGHTS: Record<string, number> = {
  restricted_zone_entry: 0.35,
  utility_zone_occupied: 0.25,
  prolonged_dwell: 0.20,
  abandoned_object: 0.40,
  object_removed: 0.35,
  stationary_running_vehicle: 0.20,
};

/**
 * Body-language and gaze fields, kept for context in the record and explicitly
 * excluded from severity. Named here so the exclusion is testable.
 */
export const NON_SCORING_SIGNALS = [
  "handConcealmentActive",
  "weaponCheckCount",
  "armRigidityDetected",
  "fistClenchingActive",
  "palmWipingCount",
  "rapidScanningActive",
  "gazeFixationCount",
  "cameraAvoidanceDetected",
  "carryingSuspiciousItem",
  "targetLockingActive",
  "confrontationStanceDetected",
  "nonSocialCoordination",
  "distractionActionPair",
  "sameTimeRecurrence",
  "scoutReturnDetected",
  "repeatedApproachCount",
  "motionType",
  "interactionCount",
  "vehicleCirclingDetected",
] as const;

/** Severity of what was observed, 0..1. Never a judgement about a person. */
export function calculateRiskScore(signals: RiskSignalInput): number {
  let total = 0.0;

  if (signals.inDangerZone || signals.inRestrictedZone) total += EVENT_WEIGHTS.restricted_zone_entry;
  if (signals.utilityZoneOccupied) total += EVENT_WEIGHTS.utility_zone_occupied;
  if (signals.dwellTimeMs > signals.minDwellThresholdMs) total += EVENT_WEIGHTS.prolonged_dwell;
  if (signals.abandonedObjectDetected) total += EVENT_WEIGHTS.abandoned_object;
  if (signals.stationaryRunningVehicle) total += EVENT_WEIGHTS.stationary_running_vehicle;

  return Math.round(Math.min(Math.max(total, 0.0), 1.0) * 100) / 100;
}

/**
 * Severity band of an observed event. The escalation chain no longer overrides
 * anything, because that chain was built from body language.
 */
export function scoreToTier(
  score: number,
  _escalationChainStep: number,
  _signalCount: number
): ThreatTier {
  if (score >= 0.75) return "critical";
  if (score >= 0.55) return "high";
  if (score >= 0.3) return "elevated";
  return "observation";
}


// =============================================================================
// SECTION 3 — ZONE RESOLUTION (POINT-IN-POLYGON)
// fixes the original which accepted zone as a raw string passthrough —
// now zones are computed from polygon definitions using ray casting algorithm.
// this is the standard computational geometry approach used in GIS and CV.
// =============================================================================

export function pointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>
): boolean {
  // ray casting algorithm — O(n) per point, standard approach
  let inside = false;
  const { x, y } = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function resolveZoneForPosition(
  position: { x: number; y: number },
  zones: ZoneDefinition[]
): ZoneDefinition | null {
  // check restricted/utility zones first (highest priority)
  const priorityOrder: ZoneDefinition["type"][] = [
    "restricted", "utility", "high_value", "exit", "entry", "normal"
  ];

  for (const zoneType of priorityOrder) {
    const zone = zones.find(
      z => z.type === zoneType && pointInPolygon(position, z.polygon)
    );
    if (zone) return zone;
  }
  return null;
}

// =============================================================================
// SECTION 4 — POSE ANALYSIS ENGINE
// converted from mediapipe + openpose keypoint geometry
// pure math on keypoint coordinates — no model required at this layer
// =============================================================================

export function detectArmRigidity(pose: PoseLandmarks): boolean {
  const leftElbowY = pose.leftElbow.y;
  const rightElbowY = pose.rightElbow.y;
  const shoulderWidth = Math.abs(pose.leftShoulder.x - pose.rightShoulder.x);
  if (shoulderWidth === 0) return false;
  const asymmetry = Math.abs(leftElbowY - rightElbowY) / shoulderWidth;
  return asymmetry > 0.35;
}

export function detectWeaponCheckZone(
  pose: PoseLandmarks,
  side: "left" | "right"
): boolean {
  const wrist = side === "right" ? pose.rightWrist : pose.leftWrist;
  const hip = side === "right" ? pose.rightHip : pose.leftHip;
  const shoulder = side === "right" ? pose.rightShoulder : pose.leftShoulder;

  // waistband is midpoint between hip and shoulder on same side
  const waistbandY = (hip.y + shoulder.y) / 2;
  const waistbandX = hip.x;

  const distToWaistband = Math.sqrt(
    Math.pow(wrist.x - waistbandX, 2) +
    Math.pow(wrist.y - waistbandY, 2)
  );

  // body height proxy = 2x shoulder-to-hip distance
  const bodyHeight = Math.abs(shoulder.y - hip.y) * 2;
  // guard: if bodyHeight is near zero (occluded/bad detection) skip
  if (bodyHeight < 0.01) return false;

  return distToWaistband < bodyHeight * 0.10;
}

export function detectConfrontationStance(pose: PoseLandmarks): boolean {
  const shoulderYDiff = Math.abs(pose.leftShoulder.y - pose.rightShoulder.y);
  const shoulderWidth = Math.abs(pose.leftShoulder.x - pose.rightShoulder.x);
  if (shoulderWidth === 0) return false;
  const ankleWidth = Math.abs(pose.leftAnkle.x - pose.rightAnkle.x);
  const shouldersLevel = shoulderYDiff < shoulderWidth * 0.1;
  const stanceWide = ankleWidth >= shoulderWidth * 0.9;
  return shouldersLevel && stanceWide;
}

export function detectFistClenching(pose: PoseLandmarks): boolean {
  // fingers collapsed toward wrist in normalized coords = fist
  const rightFist =
    Math.abs(pose.rightIndex.x - pose.rightWrist.x) < 0.03 &&
    Math.abs(pose.rightPinky.x - pose.rightWrist.x) < 0.03;
  const leftFist =
    Math.abs(pose.leftIndex.x - pose.leftWrist.x) < 0.03 &&
    Math.abs(pose.leftPinky.x - pose.leftWrist.x) < 0.03;
  return rightFist || leftFist;
}

export function detectPalmWiping(pose: PoseLandmarks): boolean {
  // palm-to-thigh proximity: wrist near the knee-hip midpoint = wiping motion
  // this is a single-frame proxy for the wiping behavior
  const rightWristToRightThigh = Math.abs(
    pose.rightWrist.y - ((pose.rightHip.y + pose.rightKnee.y) / 2)
  );
  const leftWristToLeftThigh = Math.abs(
    pose.leftWrist.y - ((pose.leftHip.y + pose.leftKnee.y) / 2)
  );
  const bodyHeight = Math.abs(pose.leftShoulder.y - pose.leftAnkle.y);
  if (bodyHeight < 0.01) return false;
  const threshold = bodyHeight * 0.08;
  return rightWristToRightThigh < threshold || leftWristToLeftThigh < threshold;
}

export function detectBodySquaringToTarget(
  pose: PoseLandmarks,
  targetX: number
): boolean {
  const shoulderMidX = (pose.leftShoulder.x + pose.rightShoulder.x) / 2;
  const hipMidX = (pose.leftHip.x + pose.rightHip.x) / 2;
  const facingVector = shoulderMidX - hipMidX;
  const toTarget = targetX - shoulderMidX;
  // positive dot product = facing toward target
  return facingVector * toTarget > 0 && Math.abs(facingVector) > 0.01;
}

// =============================================================================
// SECTION 5 — TRAJECTORY & MOVEMENT ANALYSIS
// bytetrack ring buffer logic + loitering/loop/retreat detectors
// =============================================================================

const HISTORY_BUFFER_SIZE = 30;
const SPEED_SAMPLE_SIZE = 10;

export function updateEntityHistory(
  entity: TrackedEntity,
  position: { x: number; y: number },
  zone: string,
  speed: number,
  pose?: PoseLandmarks
): void {
  const entry: TrackHistoryEntry = {
    timestamp: Date.now(),
    position,
    speed,
    zone,
    poseSnapshot: pose,
  };

  entity.history.push(entry);
  if (entity.history.length > HISTORY_BUFFER_SIZE) {
    entity.history.shift();
  }

  // rolling baseline speed (bytetrack uses Kalman filter — we use rolling mean)
  entity.speedSamples.push(speed);
  if (entity.speedSamples.length > SPEED_SAMPLE_SIZE) {
    entity.speedSamples.shift();
  }
  if (entity.speedSamples.length > 0) {
    entity.baselineSpeed =
      entity.speedSamples.reduce((a, b) => a + b, 0) / entity.speedSamples.length;
  }

  entity.lastSeen = Date.now();
  entity.dwellTimeMs = entity.lastSeen - entity.firstSeen;
}

export function detectLoitering(
  entity: TrackedEntity,
  baselineDwellMs: number,
  environmentalMultiplier: number = 2.5
): boolean {
  if (entity.history.length < 5) return false;

  const firstPos = entity.history[0].position;
  const currentPos = entity.history[entity.history.length - 1].position;
  const totalDisplacement = Math.sqrt(
    Math.pow(currentPos.x - firstPos.x, 2) +
    Math.pow(currentPos.y - firstPos.y, 2)
  );

  const threshold = baselineDwellMs * environmentalMultiplier;
  const dwellExceeded = entity.dwellTimeMs > threshold;

  // low displacement over extended dwell = loitering not transiting
  const avgSpeedPerMs =
    entity.dwellTimeMs > 0 ? totalDisplacement / entity.dwellTimeMs : 0;
  const isStationary = avgSpeedPerMs < 0.01;

  return dwellExceeded && isStationary;
}

export function detectTrajectoryLoop(entity: TrackedEntity): boolean {
  if (entity.history.length < 12) return false;

  const third = Math.floor(entity.history.length / 3);
  const segment1 = entity.history.slice(0, third).map(h => h.position);
  const segment2 = entity.history.slice(third, third * 2).map(h => h.position);

  let overlapCount = 0;
  for (const p1 of segment1) {
    for (const p2 of segment2) {
      const dist = Math.sqrt(
        Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)
      );
      if (dist < 30) {
        overlapCount++;
        break;
      }
    }
  }

  const overlapRatio = overlapCount / Math.max(segment1.length, 1);
  if (overlapRatio > 0.7) {
    entity.loopCount++;
  }
  return entity.loopCount >= 3;
}

export function detectMicroRetreat(
  entity: TrackedEntity,
  targetPosition: { x: number; y: number }
): boolean {
  if (entity.history.length < 6) return false;

  const distances = entity.history.map(h =>
    Math.sqrt(
      Math.pow(h.position.x - targetPosition.x, 2) +
      Math.pow(h.position.y - targetPosition.y, 2)
    )
  );

  let cycleCount = 0;
  let prevTrend: "approaching" | "retreating" | null = null;

  for (let i = 1; i < distances.length; i++) {
    // avoid false positives from identical positions
    if (distances[i] === distances[i - 1]) continue;
    const currentTrend =
      distances[i] < distances[i - 1] ? "approaching" : "retreating";
    if (prevTrend && prevTrend !== currentTrend) {
      if (currentTrend === "approaching") cycleCount++;
    }
    prevTrend = currentTrend;
  }

  entity.retreatCycleCount = cycleCount;
  return cycleCount >= 2;
}

export function detectPaceInconsistency(
  entity: TrackedEntity
): boolean {
  // use entity's own rolling baseline (fixed: was using camera global baseline)
  if (entity.history.length < 4 || entity.baselineSpeed < 1) return false;
  const currentSpeed = entity.history[entity.history.length - 1].speed;
  if (entity.baselineSpeed === 0) return false;
  const decelerationRatio = (entity.baselineSpeed - currentSpeed) / entity.baselineSpeed;
  return decelerationRatio > 0.40;
}

// =============================================================================
// SECTION 6 — ABANDONED OBJECT DETECTION
// objleft (kevinlin311tw) logic: placement timestamp + departure vector
// =============================================================================

export function detectAbandonedObject(
  obj: DetectedObject,
  entities: Map<string, TrackedEntity>,
  abandonmentThresholdMs: number = 300000
): boolean {
  if (!obj.placedTimestamp) return false;

  const timeSincePlacement = Date.now() - obj.placedTimestamp;

  if (obj.ownerId) {
    const owner = entities.get(obj.ownerId);
    if (owner) {
      const distToObject = Math.sqrt(
        Math.pow(
          owner.boundingBox.x + owner.boundingBox.width / 2 - (obj.boundingBox.x + obj.boundingBox.width / 2),
          2
        ) +
        Math.pow(
          owner.boundingBox.y + owner.boundingBox.height / 2 - (obj.boundingBox.y + obj.boundingBox.height / 2),
          2
        )
      );
      // owner within 100px = not abandoned
      if (distToObject < 100) return false;
    }
  }

  return timeSincePlacement > abandonmentThresholdMs;
}

export function detectPlacementDeparturePattern(
  entity: TrackedEntity,
  objectPosition: { x: number; y: number }
): boolean {
  if (entity.history.length < 4) return false;

  const recentHistory = entity.history.slice(-4);
  const firstEntry = recentHistory[0];
  const lastEntry = recentHistory[recentHistory.length - 1];

  const distBefore = Math.sqrt(
    Math.pow(firstEntry.position.x - objectPosition.x, 2) +
    Math.pow(firstEntry.position.y - objectPosition.y, 2)
  );
  const distAfter = Math.sqrt(
    Math.pow(lastEntry.position.x - objectPosition.x, 2) +
    Math.pow(lastEntry.position.y - objectPosition.y, 2)
  );

  const isDeparting = distAfter > distBefore * 1.5;
  const isAccelerating =
    firstEntry.speed > 0
      ? lastEntry.speed > firstEntry.speed * 1.2
      : lastEntry.speed > 10;

  return isDeparting && isAccelerating;
}

// =============================================================================
// SECTION 7 — ESCALATION CHAIN STATE MACHINE
// fight detection LSTM (jpowellgz) + eagle temporal reasoning
// 6-step state machine with 45-second window
// =============================================================================

export interface EscalationChainState {
  currentStep: number;
  chainStartTimestamp: number;
  stepsConfirmed: string[];
}

const CHAIN_WINDOW_MS = 45000;

const ESCALATION_STEP_ORDER = [
  "verbal_exchange",
  "body_squaring",
  "hand_to_body",
  "weight_shift",
  "distance_closure",
  "act_initiation",
] as const;

export type EscalationSignal = typeof ESCALATION_STEP_ORDER[number];

export function updateEscalationChain(
  entity: TrackedEntity,
  newSignal: EscalationSignal
): EscalationChainState {
  const now = Date.now();

  // reset chain if 45-second window expired
  if (
    entity.escalationChainStep > 0 &&
    now - entity.lastChainTimestamp > CHAIN_WINDOW_MS
  ) {
    entity.escalationChainStep = 0;
    entity.escalationChainStartMs = now;
  }

  const expectedStep = ESCALATION_STEP_ORDER[entity.escalationChainStep];
  if (newSignal === expectedStep) {
    entity.escalationChainStep = Math.min(entity.escalationChainStep + 1, 6);
    entity.lastChainTimestamp = now;
    if (entity.escalationChainStep === 1) {
      entity.escalationChainStartMs = now;
    }
  }

  return {
    currentStep: entity.escalationChainStep,
    chainStartTimestamp: entity.escalationChainStartMs,
    stepsConfirmed: Array.from(ESCALATION_STEP_ORDER.slice(0, entity.escalationChainStep)),
  };
}

// =============================================================================
// SECTION 8 — TEMPORAL RECURRENCE STORE
// fixes: scout-return and same-time recurrence were always false in v1
// now tracked via a persistent store passed into processFrame
// =============================================================================

export interface TemporalStore {
  records: Map<string, TemporalRecord>;
}

export function createTemporalStore(): TemporalStore {
  return { records: new Map() };
}

export function recordTemporalEvent(
  store: TemporalStore,
  cameraId: string,
  zone: string,
  signatureFlags: string[]
): void {
  const signature = `${cameraId}:${zone}:${signatureFlags.sort().join(",")}`;
  const now = Date.now();
  const existing = store.records.get(signature);

  if (existing) {
    existing.lastOccurrenceMs = now;
    existing.occurrenceCount++;
  } else {
    store.records.set(signature, {
      cameraId,
      behaviorSignature: signature,
      firstOccurrenceMs: now,
      lastOccurrenceMs: now,
      occurrenceCount: 1,
      zone,
    });
  }
}

export function checkTemporalRecurrence(
  store: TemporalStore,
  cameraId: string,
  zone: string,
  signatureFlags: string[],
  recurrenceWindowMs: number = 72 * 60 * 60 * 1000 // 72 hours
): { sameTimeRecurrence: boolean; scoutReturnDetected: boolean } {
  const signature = `${cameraId}:${zone}:${signatureFlags.sort().join(",")}`;
  const record = store.records.get(signature);

  if (!record) {
    return { sameTimeRecurrence: false, scoutReturnDetected: false };
  }

  const now = Date.now();
  const timeSinceFirst = now - record.firstOccurrenceMs;
  const withinWindow = timeSinceFirst < recurrenceWindowMs;
  const hasReturned = record.occurrenceCount >= 2;

  return {
    sameTimeRecurrence: withinWindow && hasReturned,
    scoutReturnDetected: withinWindow && hasReturned && record.occurrenceCount >= 2,
  };
}

// =============================================================================
// SECTION 9 — GROUP DYNAMICS DETECTION
// ORCA organized retail crime + terrorism pre-attack team behavior
// =============================================================================

export function detectNonSocialCoordination(
  entities: Map<string, TrackedEntity>,
  socialInteractionWindowMs: number = 180000
): string[][] {
  const entityList = Array.from(entities.values());
  const suspectedGroups: string[][] = [];
  const alreadyGrouped = new Set<string>();

  for (let i = 0; i < entityList.length; i++) {
    for (let j = i + 1; j < entityList.length; j++) {
      const a = entityList[i];
      const b = entityList[j];

      if (alreadyGrouped.has(a.trackId) && alreadyGrouped.has(b.trackId)) continue;

      const aCenterX = a.boundingBox.x + a.boundingBox.width / 2;
      const aCenterY = a.boundingBox.y + a.boundingBox.height / 2;
      const bCenterX = b.boundingBox.x + b.boundingBox.width / 2;
      const bCenterY = b.boundingBox.y + b.boundingBox.height / 2;

      const dist = Math.sqrt(
        Math.pow(aCenterX - bCenterX, 2) + Math.pow(aCenterY - bCenterY, 2)
      );
      if (dist > 300) continue;

      const bothInSceneLong =
        a.dwellTimeMs > socialInteractionWindowMs &&
        b.dwellTimeMs > socialInteractionWindowMs;

      // absence of stillness_anomaly as social interaction proxy
      // (people who stop to talk both show stillness_anomaly briefly)
      const noSocialStop =
        !a.signalFlags.has("stillness_anomaly") &&
        !b.signalFlags.has("stillness_anomaly");

      if (bothInSceneLong && noSocialStop) {
        suspectedGroups.push([a.trackId, b.trackId]);
        alreadyGrouped.add(a.trackId);
        alreadyGrouped.add(b.trackId);
      }
    }
  }

  return suspectedGroups;
}

export function detectDistractionActionPair(
  distractionEvent: { timestamp: number; position: { x: number; y: number } },
  entities: Map<string, TrackedEntity>,
  actionWindowMs: number = 4000
): string[] {
  const now = Date.now();
  const timeSinceDistraction = now - distractionEvent.timestamp;

  if (timeSinceDistraction > actionWindowMs) return [];

  const actingEntities: string[] = [];

  for (const [trackId, entity] of entities) {
    if (entity.history.length === 0) continue;
    const recentEntry = entity.history[entity.history.length - 1];

    const distFromDistraction = Math.sqrt(
      Math.pow(recentEntry.position.x - distractionEvent.position.x, 2) +
      Math.pow(recentEntry.position.y - distractionEvent.position.y, 2)
    );

    if (distFromDistraction < 200 && entity.signalFlags.size >= 2) {
      actingEntities.push(trackId);
    }
  }

  return actingEntities;
}

// =============================================================================
// SECTION 10 — NATURAL LANGUAGE REASON GENERATOR
// eagle llm.py reasoning layer replicated via template generation
// no API call required — runs fully offline
// =============================================================================

export function generateNaturalLanguageReason(
  entity: TrackedEntity,
  camera: CameraConfig
): string {
  const signals = Array.from(entity.signalFlags);
  const parts: string[] = [];

  if (signals.includes("loitering")) {
    const seconds = Math.round(entity.dwellTimeMs / 1000);
    parts.push(
      `subject has remained in ${camera.label} for ${seconds}s, exceeding environmental baseline by ${Math.round(entity.dwellTimeMs / camera.baselineDwellMs * 10) / 10}x`
    );
  }
  if (signals.includes("looping_trajectory") || signals.includes("trajectory_loop")) {
    parts.push(
      `non-transactional looping behavior detected (${entity.loopCount} circuits) — consistent with environmental reconnaissance`
    );
  }
  if (signals.includes("micro_retreat")) {
    parts.push(
      `repeated approach-withdrawal cycles (${entity.retreatCycleCount}) toward fixed point — consistent with pre-act ambivalence`
    );
  }
  if (signals.includes("weapon_check")) {
    parts.push(
      `repeated contact with waistband/chest zone (${entity.weaponCheckCount} touches) — consistent with weapon security touching`
    );
  }
  if (signals.includes("arm_rigidity") || signals.includes("hand_concealment")) {
    parts.push(
      "significant arm swing asymmetry — consistent with concealed object carrying posture"
    );
  }
  if (signals.includes("pre_action_hand")) {
    parts.push(
      "repetitive fist clenching detected — consistent with pre-confrontation adrenaline response"
    );
  }
  if (signals.includes("palm_wiping")) {
    parts.push(
      `palm-to-thigh wiping detected (${entity.palmWipeCount} instances) — consistent with palmar sweating response before action`
    );
  }
  if (signals.includes("scanning_behavior")) {
    parts.push(
      "rapid multi-directional scanning behavior — consistent with witness/surveillance check before act"
    );
  }
  if (signals.includes("camera_avoidance")) {
    parts.push(
      "subject path consistently routes through camera blind spots — indicates prior environmental intelligence"
    );
  }
  if (signals.includes("abandoned_object")) {
    parts.push(
      "object placed and abandoned — departure vector confirmed without return within threshold window"
    );
  }
  if (signals.includes("target_locking")) {
    parts.push(
      "sustained predatory gaze tracking on specific individual — target acquisition behavior confirmed"
    );
  }
  if (signals.includes("confrontation_stance")) {
    parts.push(
      "confrontation stance: squared shoulders, wide stance, forward weight distribution toward target"
    );
  }
  if (signals.includes("escalation_chain")) {
    parts.push(
      `pre-violence escalation chain at step ${entity.escalationChainStep}/6 — sequential behavioral sequence in progress`
    );
  }
  if (
    signals.includes("non_social_coordination") ||
    signals.includes("group_coordination")
  ) {
    parts.push(
      "coordinated multi-person movement without social interaction — consistent with organized operational group"
    );
  }
  if (signals.includes("distraction_action_pair")) {
    parts.push(
      "distraction event correlated with simultaneous proximate action — coordinated technique detected"
    );
  }
  if (signals.includes("zone_violation")) {
    parts.push(
      "subject occupying utility/restricted zone without operational purpose"
    );
  }
  if (signals.includes("pace_inconsistency")) {
    parts.push(
      "significant deceleration from personal baseline detected on approach — consistent with target fixation"
    );
  }

  if (parts.length === 0) {
    return "behavioral baseline deviation detected — insufficient signal count for specific classification";
  }

  return parts.join("; ");
}

// =============================================================================
// SECTION 11 — SCREENSHOT & EVENT CAPTURE
// CCTV anomaly repo (Aaryan2304) + IBM DNN repo metadata structure
// canvas annotation renders overlay on clean frame
// =============================================================================

export function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function buildThreatEvent(
  entity: TrackedEntity,
  camera: CameraConfig,
  patternsTriggered: PatternCategory[]
): ThreatEvent {
  const now = Date.now();
  const tier = entity.threatTier;

  const clipBufferSeconds =
    tier === "critical" ? 60 :
    tier === "high" ? 45 :
    tier === "elevated" ? 30 : 0;

  return {
    eventId: generateEventId(),
    timestamp: now,
    isoTimestamp: new Date(now).toISOString(),
    timezone: camera.timezone,
    cameraId: camera.cameraId,
    locationCoords: camera.locationCoords,
    ipAddress: camera.ipAddress,
    trackId: entity.trackId,
    threatTier: tier,
    threatScore: entity.threatScore,
    patternsTriggered,
    signalCount: patternsTriggered.length,
    escalationChainStep: entity.escalationChainStep,
    clipBufferSeconds,
    naturalLanguageReason: generateNaturalLanguageReason(entity, camera),
    requiresHumanReview: tier === "critical" || tier === "high",
  };
}

const TIER_COLORS: Record<ThreatTier, string> = {
  observation: "#3B82F6",
  elevated: "#F59E0B",
  high: "#EF4444",
  critical: "#7C3AED",
};

export function renderAnnotatedScreenshot(
  cleanImageBase64: string,
  entity: TrackedEntity,
  event: ThreatEvent,
  canvasWidth: number = 1280,
  canvasHeight: number = 720
): Promise<string> {
  return new Promise((resolve, reject) => {
    // guard: skip if not running in browser
    if (typeof document === "undefined") {
      resolve(cleanImageBase64);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      resolve(cleanImageBase64);
      return;
    }

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      const color = TIER_COLORS[event.threatTier];

      // bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(
        entity.boundingBox.x,
        entity.boundingBox.y,
        entity.boundingBox.width,
        entity.boundingBox.height
      );

      // tier label above box
      const labelWidth = 220;
      const labelHeight = 28;
      ctx.fillStyle = color;
      ctx.fillRect(
        entity.boundingBox.x,
        Math.max(0, entity.boundingBox.y - labelHeight),
        labelWidth,
        labelHeight
      );
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 12px monospace";
      ctx.fillText(
        `${event.threatTier.toUpperCase()} | ${event.threatScore.toFixed(2)}`,
        entity.boundingBox.x + 6,
        Math.max(labelHeight - 8, entity.boundingBox.y - 10)
      );

      // pattern list below box
      const patternLineHeight = 15;
      const patternBoxHeight = event.patternsTriggered.length * patternLineHeight + 10;
      const patternBoxY = Math.min(
        entity.boundingBox.y + entity.boundingBox.height,
        canvasHeight - patternBoxHeight - 2
      );
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(entity.boundingBox.x, patternBoxY, 270, patternBoxHeight);
      ctx.fillStyle = color;
      ctx.font = "11px monospace";
      event.patternsTriggered.forEach((pattern, i) => {
        ctx.fillText(
          `• ${pattern}`,
          entity.boundingBox.x + 6,
          patternBoxY + 13 + i * patternLineHeight
        );
      });

      // chain step indicator
      if (event.escalationChainStep > 0) {
        ctx.fillStyle = "rgba(124,58,237,0.85)";
        ctx.fillRect(entity.boundingBox.x, patternBoxY + patternBoxHeight + 2, 180, 20);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(
          `chain step: ${event.escalationChainStep}/6`,
          entity.boundingBox.x + 6,
          patternBoxY + patternBoxHeight + 15
        );
      }

      // timestamp watermark bottom bar
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(0, canvasHeight - 28, canvasWidth, 28);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "11px monospace";
      ctx.fillText(
        `${event.isoTimestamp}  |  cam: ${event.cameraId}  |  track: ${event.trackId}  |  score: ${event.threatScore}`,
        8,
        canvasHeight - 10
      );

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("failed to load frame image for annotation"));
    img.src = cleanImageBase64;
  });
}

// =============================================================================
// SECTION 12 — MAIN PROCESSING ORCHESTRATOR
// unified pipeline — all repos fused into one synchronous frame processor
// =============================================================================

export interface FrameProcessingInput {
  frameBase64: string;
  frameTimestamp: number;
  camera: CameraConfig;
  detectedPersons: Array<{
    trackId: string;
    boundingBox: BoundingBox;
    poseLandmarks?: PoseLandmarks;
    estimatedSpeed: number;
  }>;
  detectedObjects: DetectedObject[];
  distractionEvent?: { timestamp: number; position: { x: number; y: number } };
  temporalStore: TemporalStore;
}

export interface FrameProcessingOutput {
  updatedEntities: Map<string, TrackedEntity>;
  newThreatEvents: ThreatEvent[];
  groupAlerts: string[][];
}

export function processFrame(
  input: FrameProcessingInput,
  existingEntities: Map<string, TrackedEntity>
): FrameProcessingOutput {
  const { camera, detectedPersons, detectedObjects, distractionEvent, temporalStore } =
    input;
  const newThreatEvents: ThreatEvent[] = [];

  // --- STALE TRACK PRUNING (bytetrack max_age logic) ---
  // remove entities not seen for more than 10 seconds
  const now = Date.now();
  const MAX_AGE_MS = 10000;
  for (const [trackId, entity] of existingEntities) {
    if (now - entity.lastSeen > MAX_AGE_MS) {
      existingEntities.delete(trackId);
    }
  }

  for (const person of detectedPersons) {
    let entity = existingEntities.get(person.trackId);

    if (!entity) {
      entity = {
        trackId: person.trackId,
        firstSeen: input.frameTimestamp,
        lastSeen: input.frameTimestamp,
        boundingBox: person.boundingBox,
        poseLandmarks: person.poseLandmarks,
        history: [],
        dwellTimeMs: 0,
        signalFlags: new Set(),
        threatScore: 0,
        threatTier: "observation",
        escalationChainStep: 0,
        escalationChainStartMs: input.frameTimestamp,
        loopCount: 0,
        retreatCycleCount: 0,
        weaponCheckCount: 0,
        palmWipeCount: 0,
        approachWithdrawCount: 0,
        lastChainTimestamp: input.frameTimestamp,
        baselineSpeed: person.estimatedSpeed || 80,
        speedSamples: [],
      };
      existingEntities.set(person.trackId, entity);
    }

    entity.boundingBox = person.boundingBox;
    entity.poseLandmarks = person.poseLandmarks;

    // resolve zone from polygon (fixes v1 string passthrough)
    const centroid = {
      x: person.boundingBox.x + person.boundingBox.width / 2,
      y: person.boundingBox.y + person.boundingBox.height / 2,
    };
    const resolvedZone = resolveZoneForPosition(centroid, camera.zones);
    const zoneName = resolvedZone?.zoneId ?? "zone_unknown";

    updateEntityHistory(
      entity,
      centroid,
      zoneName,
      person.estimatedSpeed,
      person.poseLandmarks
    );

    // reset signals each frame — re-evaluate fresh
    entity.signalFlags.clear();

    // --- ZONE SIGNALS ---
    if (
      resolvedZone &&
      (resolvedZone.type === "utility" || resolvedZone.type === "restricted")
    ) {
      entity.signalFlags.add("zone_violation");
    }

    // --- MOVEMENT SIGNALS ---
    if (detectLoitering(entity, camera.baselineDwellMs)) {
      entity.signalFlags.add("loitering");
    }
    if (detectTrajectoryLoop(entity)) {
      entity.signalFlags.add("looping_trajectory");
      entity.signalFlags.add("movement_anomaly");
    }
    if (detectPaceInconsistency(entity)) {
      entity.signalFlags.add("pace_inconsistency");
      entity.signalFlags.add("movement_anomaly");
    }

    // micro-retreat: use nearest other entity as target
    const otherEntities = Array.from(existingEntities.values()).filter(
      e => e.trackId !== entity!.trackId
    );
    if (otherEntities.length > 0) {
      // find nearest other entity
      const nearest = otherEntities.reduce((prev, curr) => {
        const prevDist = Math.sqrt(
          Math.pow(prev.boundingBox.x - entity!.boundingBox.x, 2) +
          Math.pow(prev.boundingBox.y - entity!.boundingBox.y, 2)
        );
        const currDist = Math.sqrt(
          Math.pow(curr.boundingBox.x - entity!.boundingBox.x, 2) +
          Math.pow(curr.boundingBox.y - entity!.boundingBox.y, 2)
        );
        return currDist < prevDist ? curr : prev;
      });
      const nearestCentroid = {
        x: nearest.boundingBox.x + nearest.boundingBox.width / 2,
        y: nearest.boundingBox.y + nearest.boundingBox.height / 2,
      };
      if (detectMicroRetreat(entity, nearestCentroid)) {
        entity.signalFlags.add("micro_retreat");
      }
    }

    // --- POSE SIGNALS ---
    if (person.poseLandmarks) {
      const pose = person.poseLandmarks;

      if (detectArmRigidity(pose)) {
        entity.signalFlags.add("arm_rigidity");
        entity.signalFlags.add("hand_concealment");
      }

      const rightCheck = detectWeaponCheckZone(pose, "right");
      const leftCheck = detectWeaponCheckZone(pose, "left");
      if (rightCheck || leftCheck) {
        entity.weaponCheckCount++;
        if (entity.weaponCheckCount >= 2) {
          entity.signalFlags.add("weapon_check");
        }
      }

      if (detectFistClenching(pose)) {
        entity.signalFlags.add("pre_action_hand");
      }

      if (detectPalmWiping(pose)) {
        entity.palmWipeCount++;
        if (entity.palmWipeCount >= 2) {
          entity.signalFlags.add("palm_wiping");
        }
      }

      if (detectConfrontationStance(pose)) {
        entity.signalFlags.add("confrontation_stance");
        entity.signalFlags.add("pre_violence");
      }

      // body squaring toward nearest entity
      if (otherEntities.length > 0) {
        const nearestOther = otherEntities[0];
        const targetX =
          nearestOther.boundingBox.x + nearestOther.boundingBox.width / 2;
        if (detectBodySquaringToTarget(pose, targetX)) {
          entity.signalFlags.add("confrontation_stance");
        }
      }
    }

    // --- ESCALATION CHAIN ---
    if (entity.escalationChainStep >= 3) {
      entity.signalFlags.add("escalation_chain");
      entity.signalFlags.add("pre_violence");
    }

    // --- DISTRACTION-ACTION PAIR ---
    if (distractionEvent) {
      const actors = detectDistractionActionPair(
        distractionEvent,
        existingEntities
      );
      if (actors.includes(entity.trackId)) {
        entity.signalFlags.add("distraction_action_pair");
        entity.signalFlags.add("group_coordination");
      }
    }

    // --- ABANDONED OBJECT ---
    for (const obj of detectedObjects) {
      if (detectAbandonedObject(obj, existingEntities)) {
        entity.signalFlags.add("abandoned_object");
      }
    }

    // --- TEMPORAL RECURRENCE ---
    const signatureFlags = Array.from(entity.signalFlags) as string[];
    if (signatureFlags.length >= 2) {
      recordTemporalEvent(temporalStore, camera.cameraId, zoneName, signatureFlags);
    }
    const temporalCheck = checkTemporalRecurrence(
      temporalStore,
      camera.cameraId,
      zoneName,
      signatureFlags
    );

    // --- BUILD RISK SIGNAL INPUT (eagle risk_engine.py) ---
    const riskInput: RiskSignalInput = {
      inDangerZone: resolvedZone?.type === "restricted",
      inRestrictedZone:
        resolvedZone?.type === "restricted" || resolvedZone?.type === "utility",
      carryingSuspiciousItem: false,
      dwellTimeMs: entity.dwellTimeMs,
      minDwellThresholdMs: camera.baselineDwellMs * 2.5,
      interactionCount: entity.history.length,
      maxInteractions: 3,
      motionType: entity.signalFlags.has("movement_anomaly")
        ? "erratic"
        : entity.signalFlags.has("looping_trajectory")
        ? "looping"
        : entity.signalFlags.has("micro_retreat")
        ? "retreating"
        : "normal",
      repeatedApproachCount: entity.retreatCycleCount,
      handConcealmentActive: entity.signalFlags.has("hand_concealment"),
      weaponCheckCount: entity.weaponCheckCount,
      armRigidityDetected: entity.signalFlags.has("arm_rigidity"),
      fistClenchingActive: entity.signalFlags.has("pre_action_hand"),
      palmWipingCount: entity.palmWipeCount,
      rapidScanningActive: entity.signalFlags.has("scanning_behavior"),
      gazeFixationCount: 0,
      cameraAvoidanceDetected: entity.signalFlags.has("camera_avoidance"),
      abandonedObjectDetected: entity.signalFlags.has("abandoned_object"),
      utilityZoneOccupied: entity.signalFlags.has("zone_violation"),
      sameTimeRecurrence: temporalCheck.sameTimeRecurrence,
      scoutReturnDetected: temporalCheck.scoutReturnDetected,
      nonSocialCoordination: entity.signalFlags.has("non_social_coordination"),
      distractionActionPair: entity.signalFlags.has("distraction_action_pair"),
      targetLockingActive: entity.signalFlags.has("target_locking"),
      confrontationStanceDetected: entity.signalFlags.has("confrontation_stance"),
      escalationChainStep: entity.escalationChainStep,
      vehicleCirclingDetected: entity.signalFlags.has("vehicle_anomaly"),
      stationaryRunningVehicle: false,
    };

    entity.threatScore = calculateRiskScore(riskInput);
    entity.threatTier = scoreToTier(
      entity.threatScore,
      entity.escalationChainStep,
      entity.signalFlags.size
    );

    // fire event if above observation with at least 2 signals
    if (entity.threatTier !== "observation" && entity.signalFlags.size >= 2) {
      const event = buildThreatEvent(
        entity,
        camera,
        Array.from(entity.signalFlags) as PatternCategory[]
      );
      newThreatEvents.push(event);
    }
  }

  // --- GROUP DYNAMICS (runs after all entities updated) ---
  const groupAlerts = detectNonSocialCoordination(existingEntities);
  for (const group of groupAlerts) {
    for (const trackId of group) {
      const e = existingEntities.get(trackId);
      if (e) {
        e.signalFlags.add("non_social_coordination");
        e.signalFlags.add("group_coordination");
      }
    }
  }

  return { updatedEntities: existingEntities, newThreatEvents, groupAlerts };
}

// =============================================================================
// SECTION 13 — REACT HOOK FOR LOVABLE.DEV
// all fixes applied: stable dependency array, ref-based export,
// correct alert count, temporal store persistence across frames
// =============================================================================

export interface ARVisionState {
  entities: Map<string, TrackedEntity>;
  threatEvents: ThreatEvent[];
  isProcessing: boolean;
  totalAlertsToday: number;
  criticalCount: number;
  highCount: number;
  elevatedCount: number;
}

export interface ARVisionHook {
  state: ARVisionState;
  processVideoFrame: (input: Omit<FrameProcessingInput, "temporalStore">) => Promise<void>;
  clearEvents: () => void;
  updateEscalationSignal: (trackId: string, signal: EscalationSignal) => void;
  getEntityById: (trackId: string) => TrackedEntity | undefined;
  exportEventLog: () => string;
  downloadEventLog: () => void;
}

export function useARVision(camera: CameraConfig): ARVisionHook {
  const entitiesRef = useRef<Map<string, TrackedEntity>>(new Map());
  const temporalStoreRef = useRef<TemporalStore>(createTemporalStore());
  const eventsRef = useRef<ThreatEvent[]>([]);
  const cameraIdRef = useRef(camera.cameraId);

  // keep cameraIdRef current if camera prop changes
  useEffect(() => {
    cameraIdRef.current = camera.cameraId;
  }, [camera.cameraId]);

  const [state, setState] = useState<ARVisionState>({
    entities: new Map(),
    threatEvents: [],
    isProcessing: false,
    totalAlertsToday: 0,
    criticalCount: 0,
    highCount: 0,
    elevatedCount: 0,
  });

  const processVideoFrame = useCallback(
    async (input: Omit<FrameProcessingInput, "temporalStore">) => {
      setState(prev => ({ ...prev, isProcessing: true }));

      const fullInput: FrameProcessingInput = {
        ...input,
        temporalStore: temporalStoreRef.current,
      };

      const result = processFrame(fullInput, entitiesRef.current);
      entitiesRef.current = result.updatedEntities;

      // generate annotated screenshots
      const eventsWithScreenshots = await Promise.all(
        result.newThreatEvents.map(async event => {
          if (input.frameBase64 && event.threatTier !== "observation") {
            const entity = entitiesRef.current.get(event.trackId);
            if (entity) {
              try {
                const annotated = await renderAnnotatedScreenshot(
                  input.frameBase64,
                  entity,
                  event
                );
                return {
                  ...event,
                  screenshotClean: input.frameBase64,
                  screenshotAnnotated: annotated,
                };
              } catch {
                // annotation failed — return event without screenshot
                return event;
              }
            }
          }
          return event;
        })
      );

      // update events ref first (fixes stale closure on export)
      const allEvents = [...eventsRef.current, ...eventsWithScreenshots];
      // count before slicing for correct totalAlertsToday
      const totalCount = allEvents.length;
      const slicedEvents = allEvents.slice(-500);
      eventsRef.current = slicedEvents;

      setState(() => {
        const criticalCount = slicedEvents.filter(e => e.threatTier === "critical").length;
        const highCount = slicedEvents.filter(e => e.threatTier === "high").length;
        const elevatedCount = slicedEvents.filter(e => e.threatTier === "elevated").length;

        return {
          entities: new Map(entitiesRef.current),
          threatEvents: slicedEvents,
          isProcessing: false,
          totalAlertsToday: totalCount,
          criticalCount,
          highCount,
          elevatedCount,
        };
      });
    },
    [] // stable — no object dependencies
  );

  const clearEvents = useCallback(() => {
    eventsRef.current = [];
    setState(prev => ({
      ...prev,
      threatEvents: [],
      totalAlertsToday: 0,
      criticalCount: 0,
      highCount: 0,
      elevatedCount: 0,
    }));
  }, []);

  const updateEscalationSignal = useCallback(
    (trackId: string, signal: EscalationSignal) => {
      const entity = entitiesRef.current.get(trackId);
      if (entity) {
        updateEscalationChain(entity, signal);
      }
    },
    []
  );

  const getEntityById = useCallback((trackId: string) => {
    return entitiesRef.current.get(trackId);
  }, []);

  // exportEventLog reads from ref not state — fixes stale closure
  const exportEventLog = useCallback((): string => {
    return JSON.stringify(
      eventsRef.current.map(event => ({
        eventId: event.eventId,
        isoTimestamp: event.isoTimestamp,
        timezone: event.timezone,
        cameraId: event.cameraId,
        locationCoords: event.locationCoords,
        ipAddress: event.ipAddress,
        trackId: event.trackId,
        threatTier: event.threatTier,
        threatScore: event.threatScore,
        patternsTriggered: event.patternsTriggered,
        signalCount: event.signalCount,
        escalationChainStep: event.escalationChainStep,
        naturalLanguageReason: event.naturalLanguageReason,
        requiresHumanReview: event.requiresHumanReview,
        clipBufferSeconds: event.clipBufferSeconds,
      })),
      null,
      2
    );
  }, []);

  const downloadEventLog = useCallback(() => {
    const json = exportEventLog();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arvision-events-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportEventLog]);

  return {
    state,
    processVideoFrame,
    clearEvents,
    updateEscalationSignal,
    getEntityById,
    exportEventLog,
    downloadEventLog,
  };
}

// =============================================================================
// SECTION 14 — CAMERA CONFIG FACTORY
// =============================================================================

export function createCameraConfig(
  cameraId: string,
  label: string,
  ipAddress: string,
  lat: number,
  lng: number,
  timezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  zones: ZoneDefinition[] = []
): CameraConfig {
  return {
    cameraId,
    label,
    locationCoords: { lat, lng },
    ipAddress,
    timezone,
    zones,
    baselineDwellMs: 120000,
    baselineWalkSpeed: 80,
  };
}

export function createDefaultZones(
  width: number,
  height: number
): ZoneDefinition[] {
  return [
    {
      zoneId: "zone_main",
      name: "Main Area",
      type: "normal",
      polygon: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ],
      threatMultiplier: 1.0,
    },
    {
      zoneId: "zone_exit",
      name: "Exit Zone",
      type: "exit",
      polygon: [
        { x: width - 120, y: 0 },
        { x: width, y: 0 },
        { x: width, y: 160 },
        { x: width - 120, y: 160 },
      ],
      threatMultiplier: 1.5,
    },
    {
      zoneId: "zone_restricted",
      name: "Restricted Area",
      type: "restricted",
      polygon: [
        { x: 0, y: 0 },
        { x: 160, y: 0 },
        { x: 160, y: 160 },
        { x: 0, y: 160 },
      ],
      threatMultiplier: 3.0,
    },
    {
      zoneId: "zone_utility",
      name: "Utility Zone",
      type: "utility",
      polygon: [
        { x: width - 160, y: height - 160 },
        { x: width, y: height - 160 },
        { x: width, y: height },
        { x: width - 160, y: height },
      ],
      threatMultiplier: 3.0,
    },
  ];
}

// =============================================================================
// SECTION 15 — UNIT-TESTABLE PURE FUNCTION EXPORTS
// these can be imported individually and tested without the full hook
// =============================================================================

export const ARVisionUtils = {
  calculateRiskScore,
  scoreToTier,
  pointInPolygon,
  resolveZoneForPosition,
  detectArmRigidity,
  detectWeaponCheckZone,
  detectConfrontationStance,
  detectFistClenching,
  detectPalmWiping,
  detectBodySquaringToTarget,
  detectLoitering,
  detectTrajectoryLoop,
  detectMicroRetreat,
  detectPaceInconsistency,
  detectAbandonedObject,
  detectPlacementDeparturePattern,
  updateEscalationChain,
  detectNonSocialCoordination,
  detectDistractionActionPair,
  generateNaturalLanguageReason,
  buildThreatEvent,
  renderAnnotatedScreenshot,
  processFrame,
  createTemporalStore,
  recordTemporalEvent,
  checkTemporalRecurrence,
};
