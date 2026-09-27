// asherin — shared sensor / observation fabric: the type contract.
//
// Three subsystems already exist and already work: asherin.sentinel (audio
// channels, bluetooth environment ledger, location fixes, account timeline),
// asherin.arvision (camera event engine, safety hub, edge BLE scanners) and
// eagle.eye (the company camera console). Until now each of them owned its own
// private shape of "something was observed", so nothing could be laid on one
// timeline without a component re-inventing the join.
//
// This file is that join, and it is deliberately narrow. It does not replace a
// single existing model. It normalizes what those models already measured into
// one addressable observation, carrying four things the originals sometimes
// left implicit:
//
//   1. WHICH REAL SENSOR produced it (provenance.sensorId), never "the system".
//   2. WHAT CLASS OF CLAIM it is — a raw observation, a derived estimate, a
//      model inference, or an explicit human association. These are different
//      epistemic objects and the UI must never blur them.
//   3. WHEN the source said it happened versus when this tab received it, so
//      clock skew between an edge node and a browser is visible rather than
//      silently corrected away.
//   4. WHAT IS NOT KNOWN. Every optional field here is null when unmeasured,
//      and every null has a stated reason. Nothing in this fabric may be
//      invented to make a panel look complete.
//
// Hard rule encoded in the types: a radio observation can never carry a person.
// There is no field on a radio sighting for a track id, and the only structure
// that may name both is `FabricCorrelation`, whose `attribution` field can only
// ever be "not_attributed" unless a human explicitly asserted the link.

export type FabricModality = "vision" | "radio" | "audio" | "location" | "service";

export type FabricSubsystem = "sentinel" | "arvision" | "eagle";

/**
 * The epistemic class of a value. The interface renders these differently and
 * must never present a derived estimate with the authority of a measurement.
 */
export type ClaimKind =
  /** a sensor reported it directly: an rssi number, a pcm level, a gps fix. */
  | "raw_observation"
  /** arithmetic over raw observations: a range from rssi, a speed from boxes. */
  | "derived_estimate"
  /** a model decided it: a detection, a track, an acoustic tag. */
  | "model_inference"
  /** a human typed or confirmed it. the only class that may attribute. */
  | "human_association";

export interface FabricProvenance {
  sensorId: string;
  sensorLabel: string;
  subsystem: FabricSubsystem;
  /** the concrete code path / device that produced this, for audit. */
  adapter: string;
  kind: ClaimKind;
  /** timestamp asserted by the source, when the source asserts one. */
  sourceClockMs: number | null;
  /** timestamp this tab took delivery. the pair exposes skew. */
  receivedAtMs: number;
  /** sourceClock - received, null when the source has no clock of its own. */
  clockSkewMs: number | null;
  /** why this observation exists and what it does not prove. */
  note: string;
  /** true only for a deliberately isolated demonstration path. */
  demo?: boolean;
}

export interface FabricConfidence {
  /** 0..1, or null when nothing measured supports a number. never a constant. */
  value: number | null;
  /** what the number rests on, or why there is none. */
  basis: string;
}

export type PositioningMethod =
  /** several authorized receivers with surveyed geometry solved a region. */
  | "multilateration"
  /** one receiver: a radius around that receiver, nothing more. */
  | "single_receiver_range"
  /** no geometry exists, so no region may be drawn anywhere. */
  | "none";

export interface UncertaintyRegion {
  method: PositioningMethod;
  /** site-frame metres. only ever populated for multilateration. */
  centre: { x: number; y: number; z: number } | null;
  /** metres. the region, not a point. */
  radiusM: number | null;
  receiverIds: string[];
  evidence: string[];
  /** printed verbatim whenever method is not multilateration. */
  limitation: string;
}

// ---- the authorized sensor registry ---------------------------------------

export type SensorAuthorization =
  | "owned"
  | "operated_under_contract"
  | "written_authorization"
  /** this device belongs to the signed-in operator's own machine/account. */
  | "operator_device"
  /** present but not attested. it may observe nothing until attested. */
  | "unattested";

export type FabricHealth = "live" | "stale" | "unavailable" | "denied" | "error";

export interface FabricSensor {
  id: string;
  label: string;
  modality: FabricModality;
  subsystem: FabricSubsystem;
  /** exactly what this device can measure, discovered — never assumed. */
  capabilities: string[];
  /** what it cannot do, so a panel never implies it can. */
  limitations: string[];
  authorization: SensorAuthorization;
  health: FabricHealth;
  healthDetail: string;
  siteId: string | null;
  zoneId: string | null;
  lastObservationMs: number | null;
  /** true when this sensor's coordinates were surveyed into the site frame. */
  spatiallyRegistered: boolean;
}

// ---- observations ----------------------------------------------------------

interface ObservationBase {
  id: string;
  atMs: number;
  modality: FabricModality;
  siteId: string | null;
  zoneId: string | null;
  zoneLabel: string | null;
  provenance: FabricProvenance;
  confidence: FabricConfidence;
  /** one line an operator can read without opening anything. */
  summary: string;
}

/** A camera-local, session-scoped visual track. Never a person's identity. */
export interface VisualTrackObservation extends ObservationBase {
  type: "visual_track";
  modality: "vision";
  cameraId: string;
  trackId: string;
  /** normalized frame box, 0..1. the only geometry a camera alone can assert. */
  box: { x: number; y: number; width: number; height: number } | null;
  /** site-frame metres, only when the camera is calibrated AND registered. */
  worldPoint: { x: number; y: number; z: number } | null;
  trackState: "tracking" | "occluded" | "lost";
}

export interface VisualEventObservation extends ObservationBase {
  type: "visual_event";
  modality: "vision";
  cameraId: string;
  eventType: string;
  trackIds: string[];
  value: number;
  valueUnit: "count" | "seconds";
  evidence: string[];
  /** false when tracking continuity broke: association is a guess, say so. */
  associationCertain: boolean;
  incidentId: string | null;
}

/** One receiver heard one broadcast. No position, no person, no owner. */
export interface RadioSightingObservation extends ObservationBase {
  type: "radio_sighting";
  modality: "radio";
  receiverId: string;
  /** stable pseudonym for the broadcast, never a real identity. */
  deviceKey: string;
  handle: string;
  rssi: number | null;
  /** metres, derived from rssi. an estimate with a wide error, not a distance. */
  estimatedRangeM: number | null;
  addressRandomized: boolean | null;
  vendor: string | null;
  category: string | null;
}

/** A positioning service turned several sightings into a region. */
export interface RadioRegionObservation extends ObservationBase {
  type: "radio_region";
  modality: "radio";
  deviceKey: string;
  handle: string;
  region: UncertaintyRegion;
}

export interface AudioEventObservation extends ObservationBase {
  type: "audio_event";
  modality: "audio";
  channelId: string;
  tag: string;
  durationMs: number | null;
  /** the measured basis for the tag, straight from the sentinel classifier. */
  evidence: Record<string, number | string>;
}

export interface SpeechEventObservation extends ObservationBase {
  type: "speech_event";
  modality: "audio";
  channelId: string;
  /** the account timeline's own speaker row id, when one was assigned. */
  speakerId: string | null;
  transcriptPresent: boolean;
  durationMs: number | null;
}

/** A gap: capture stopped. The fabric records silence-with-a-reason. */
export interface CoverageGapObservation extends ObservationBase {
  type: "coverage_gap";
  channelId: string;
  reason: string;
  untilMs: number | null;
}

export interface LocationObservation extends ObservationBase {
  type: "location_fix";
  modality: "location";
  lat: number;
  lon: number;
  accuracyM: number | null;
  source: string;
  place: string | null;
}

export interface ServiceHealthObservation extends ObservationBase {
  type: "service_health";
  modality: "service";
  service: string;
  state: FabricHealth;
  detail: string;
}

export type FabricObservation =
  | VisualTrackObservation
  | VisualEventObservation
  | RadioSightingObservation
  | RadioRegionObservation
  | AudioEventObservation
  | SpeechEventObservation
  | CoverageGapObservation
  | LocationObservation
  | ServiceHealthObservation;

// ---- correlation -----------------------------------------------------------

export type CorrelationKind =
  /** two observations in the same configured zone within the sync window. */
  | "temporal_zone_coincidence"
  /** a radio uncertainty region overlaps a calibrated camera's world points. */
  | "spatial_overlap_candidate"
  /** the same incident already holds both. */
  | "shared_incident";

export type CorrelationAttribution =
  /** the fabric's only automatic answer. evidence of coincidence, nothing more. */
  | "not_attributed"
  /** a named human asserted the link and is recorded as its author. */
  | "human_asserted";

export interface FabricCorrelation {
  id: string;
  kind: CorrelationKind;
  atMs: number;
  observationIds: string[];
  /** the sensors on each side, so the console can name them. */
  sensorIds: string[];
  /** ms between the two observations after clock-skew metadata is applied. */
  deltaMs: number;
  /** how many independent candidates the evidence could equally fit. */
  candidateCount: number;
  attribution: CorrelationAttribution;
  assertedBy: string | null;
  strength: FabricConfidence;
  evidence: string[];
  /** printed on every card. the sentence that stops a coincidence becoming a fact. */
  limitation: string;
}
