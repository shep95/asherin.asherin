// asherin.arvision — the contract between the perception pass and the event
// engine.
//
// The engine never touches a video element, a model or a canvas. It receives
// what a detector actually reported for one frame and returns state. That
// separation is what lets every state machine below be tested deterministically,
// and it is what stops a rendering trick from ever becoming a "detection".

import type { NormBox } from "./geometry";

export type { NormBox };

/**
 * What the pose model reported for one track, reduced to the few measurements
 * the safety machines use. Nothing here describes a face, an expression, or a
 * person's appearance — only where the body's joints are in the frame.
 */
export interface PoseSummary {
  /** mean keypoint score the model itself reported, 0..1. */
  quality: number;
  /** normalized frame y of the shoulder line, hip line and lowest ankle. */
  shoulderY: number;
  hipY: number;
  ankleY: number;
  /** normalized frame x/y of both wrists, for contact impulse only. */
  wrists: Array<{ x: number; y: number; confidence: number }>;
  /** true when enough keypoints scored above the model's own floor to be used. */
  usable: boolean;
}

export interface VisionTrackInput {
  /** camera-local, session-scoped. never a real-world identity. */
  trackId: string;
  /** pixel box in the frame the detector ran on. */
  box: { x: number; y: number; width: number; height: number };
  /** pixels per second, as measured by the tracker between frames. */
  speedPxPerSec: number;
  pose: PoseSummary | null;
}

export interface VisionObjectInput {
  objectId: string;
  label: string;
  box: { x: number; y: number; width: number; height: number };
}

export interface VisionFrameInput {
  atMs: number;
  cameraId: string;
  cameraLabel: string;
  frameWidth: number;
  frameHeight: number;
  tracks: VisionTrackInput[];
  objects: VisionObjectInput[];
}

export type VisionEventType =
  | "object_left"
  | "object_retrieved_same_track"
  | "object_retrieved_different_track"
  | "object_retrieved_association_unknown"
  | "restricted_entry"
  | "restricted_exit"
  | "barrier_crossing"
  | "unusual_movement"
  | "prolonged_proximity"
  | "contact_impulse"
  | "crowd_formation"
  | "extended_dwell"
  | "rapid_approach"
  | "chase_like_trajectory"
  | "person_on_ground";

export type VisionEventState = "open" | "resolved";

export interface VisionEvent {
  id: string;
  type: VisionEventType;
  state: VisionEventState;
  cameraId: string;
  cameraLabel: string;
  zoneId: string | null;
  zoneLabel: string | null;
  /** temporary camera-local track ids only. */
  trackIds: string[];
  objectId: string | null;
  openedAtMs: number;
  updatedAtMs: number;
  resolvedAtMs: number | null;
  /** 0..1, derived only from measured evidence quality. never a constant. */
  confidence: number;
  /** every measurement that produced this event, in the operator's words. */
  evidence: string[];
  detail: string;
  /** normalized box for the ARVision overlay, or null when there is nothing to draw. */
  box: NormBox | null;
  /** false when tracking continuity was lost and association can only be a guess. */
  associationCertain: boolean;
  /** the measurement that opened this event, in `valueUnit`. what a rule compares against. */
  value: number;
  valueUnit: "count" | "seconds";
  /** the incident this event was reported into, when a rule accepted it. */
  incidentId: string | null;
}

export interface CustodyRecord {
  objectId: string;
  label: string;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  /** the track it was associated with while the tracking evidence supported it. */
  ownerTrackId: string | null;
  ownerSinceMs: number | null;
  associationCertain: boolean;
  unattendedSinceMs: number | null;
  present: boolean;
  outcome:
    | "attended"
    | "unattended"
    | "retrieved_same"
    | "retrieved_different"
    | "retrieved_unknown"
    | "removed_unknown";
  box: NormBox;
}

export interface VisionEngineConfig {
  /** separation before custody breaks, in multiples of the owner's body height. */
  abandonSeparationBodies: number;
  /** how long that separation must hold before the object is called left. */
  abandonDwellMs: number;
  /** how close a track must come to count as retrieving it. */
  retrievalSeparationBodies: number;
  /** body heights per second that counts as running. */
  runBodySpeed: number;
  /** seconds of sustained running before unusual movement is reported. */
  runSustainMs: number;
  /** body heights between two tracks that counts as close proximity. */
  proximityBodies: number;
  proximityDurationMs: number;
  /** body heights per second of closing speed that counts as a rapid approach. */
  rapidApproachBodySpeed: number;
  /** how long two fast tracks must hold station before it reads as a chase. */
  chaseSustainMs: number;
  /** verticality below which a body's geometry reads as on the ground. */
  groundVerticality: number;
  /** how long that must hold before it is reported. */
  groundConfirmMs: number;
  /** wrist acceleration, in body heights per second squared, that reads as an impulse. */
  contactImpulse: number;
  /** repeat events of one type on one subject collapse inside this window. */
  cooldownMs: number;
  /** frames a track must be held before its events are trusted at all. */
  minTrackFrames: number;
  /** events below this confidence are suppressed and counted, never shown as findings. */
  minConfidence: number;
}

export const DEFAULT_ENGINE_CONFIG: VisionEngineConfig = {
  abandonSeparationBodies: 2.5,
  abandonDwellMs: 20_000,
  retrievalSeparationBodies: 1.2,
  runBodySpeed: 1.6,
  runSustainMs: 1500,
  proximityBodies: 1.3,
  proximityDurationMs: 45_000,
  rapidApproachBodySpeed: 1.8,
  chaseSustainMs: 3000,
  groundVerticality: 0.45,
  groundConfirmMs: 8000,
  contactImpulse: 6,
  cooldownMs: 60_000,
  minTrackFrames: 5,
  minConfidence: 0.35,
};
