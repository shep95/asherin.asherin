// asherin.arvision — sensor architecture types.
//
// The correction this file exists for: the room used to treat "camera" as a
// synonym for "video element". A camera is one instance of a typed sensor
// stream, and almost every claim the room can make depends on which modality
// actually produced the pixels. A temperature is only a temperature when a
// radiometric thermal stream produced it. A distance is only a distance when a
// depth, stereo or lidar stream measured it. Anything else is a picture.
//
// Every field below is either filled from real adapter metadata or left null.
// There is no default that invents a value.

/** Physical modality of a stream. Mirrors the conceptual topic paths. */
export type SensorModality =
  | "rgb"
  | "lowlight"
  | "nir"
  | "swir"
  | "lwir"
  | "thermal_radiometric"
  | "depth"
  | "lidar"
  | "polarization"
  | "event"
  | "hyperspectral"
  | "audio"
  | "gnss"
  | "imu";

/** Conceptual topic path for a modality, as the edge bridge publishes them. */
export const MODALITY_TOPIC: Record<SensorModality, string> = {
  rgb: "/sensors/rgb",
  lowlight: "/sensors/lowlight",
  nir: "/sensors/nir",
  swir: "/sensors/swir",
  lwir: "/sensors/lwir",
  thermal_radiometric: "/sensors/thermal_radiometric",
  depth: "/sensors/depth",
  lidar: "/sensors/lidar",
  polarization: "/sensors/polarization",
  event: "/sensors/event",
  hyperspectral: "/sensors/hyperspectral",
  audio: "/sensors/audio",
  gnss: "/sensors/gnss",
  imu: "/sensors/imu",
};

export const MODALITY_LABEL: Record<SensorModality, string> = {
  rgb: "visible light",
  lowlight: "low light",
  nir: "near infrared",
  swir: "short wave infrared",
  lwir: "long wave infrared",
  thermal_radiometric: "radiometric thermal",
  depth: "depth",
  lidar: "lidar",
  polarization: "polarization",
  event: "event camera",
  hyperspectral: "multispectral / hyperspectral",
  audio: "audio",
  gnss: "satellite position",
  imu: "inertial",
};

/** Where a stream physically comes from. */
export type SensorTransport =
  | "browser_media" // getUserMedia / enumerateDevices
  | "file" // operator supplied recording
  | "rtsp" // network camera, reached through the edge bridge
  | "edge_bridge" // ROS 2 / GenICam / GStreamer / lidar driver behind a bridge
  | "browser_sensor"; // geolocation, device orientation

export type StreamHealth = "live" | "opening" | "stale" | "unavailable" | "denied" | "error";

/** Calibration state. `none` means no measurement may be derived from the stream. */
export type CalibrationState = "none" | "assumed" | "factory" | "operator" | "verified";

export interface SensorCalibration {
  state: CalibrationState;
  /** Free text the UI prints verbatim, e.g. "two operator reference points". */
  detail: string;
  /** Intrinsics when the adapter actually knows them. */
  intrinsics?: { fx: number; fy: number; px: number; py: number; width: number; height: number } | null;
  /** Epoch ms of the last calibration event, when one happened. */
  atMs?: number | null;
}

export interface SensorProvenance {
  /** Vendor / driver string exactly as reported. Never guessed. */
  vendor: string | null;
  model: string | null;
  driver: string | null;
  /** Adapter that produced this record. */
  adapter: string;
  /** Conceptual topic path. */
  topic: string;
}

/**
 * Quality is only ever derived from real input metadata or real processing of
 * real frames. A stream that has produced nothing has quality null.
 */
export interface SensorQuality {
  /** 0..1, from measured frame cadence against the declared rate. */
  cadence: number | null;
  /** 0..1, from actual frame statistics (exposure, saturation, noise floor). */
  signal: number | null;
  /** ms between the sensor timestamp and local clock, when the source stamps. */
  latencyMs: number | null;
  /** Plain reading printed next to the numbers. */
  note: string;
}

export interface SensorUnits {
  /** e.g. "celsius", "metres", "counts", "dbfs". null when the stream is not measurable. */
  measurement: string | null;
  frameFormat: string | null;
}

export interface SensorDescriptor {
  id: string;
  modality: SensorModality;
  label: string;
  transport: SensorTransport;
  health: StreamHealth;
  /** Why the stream is not live, printed verbatim. Empty when live. */
  statusDetail: string;
  calibration: SensorCalibration;
  provenance: SensorProvenance;
  quality: SensorQuality;
  units: SensorUnits;
  /** Epoch ms of the most recent sample actually received. */
  lastSampleMs: number | null;
  /** Declared frame rate when the source declares one. */
  declaredFps: number | null;
  resolution: { width: number; height: number } | null;
  /** Live MediaStream when the transport is a browser media device. */
  stream?: MediaStream | null;
  /** True only when this modality can produce measurements, not just pictures. */
  measurable: boolean;
}

export interface RegistrySnapshot {
  sensors: SensorDescriptor[];
  /** Adapters that reported, with their own reachability. */
  adapters: AdapterStatus[];
  atMs: number;
}

export interface AdapterStatus {
  id: string;
  label: string;
  reachable: boolean;
  detail: string;
  /** Modalities this adapter is capable of publishing when a source exists. */
  modalities: SensorModality[];
}

// ---------------------------------------------------------------------------
// backend / edge services
// ---------------------------------------------------------------------------

export type ServiceId = "edge_bridge" | "inference" | "prediction" | "recording" | "positioning";

export interface ServiceHealth {
  id: ServiceId;
  label: string;
  /** configured means an endpoint exists; online means it answered. */
  configured: boolean;
  online: boolean;
  detail: string;
  checkedAtMs: number | null;
  endpointKind: string;
}

// ---------------------------------------------------------------------------
// multimodal object state
// ---------------------------------------------------------------------------

export interface Measured<T> {
  value: T;
  /** modality that produced it — provenance travels with every number. */
  source: SensorModality;
  sensorId: string;
  atMs: number;
  /** 0..1, derived from the producing pipeline, never assigned by hand. */
  confidence: number;
  /** symmetric uncertainty in the value's own unit, when the source gives one. */
  uncertainty: number | null;
  unit: string;
}

export interface TrackPoint {
  atMs: number;
  /** image space, normalised 0..1 — always available for a visual track. */
  image: { x: number; y: number; w: number; h: number };
  /** metric position, only when a measuring sensor produced it. */
  world: Measured<{ x: number; y: number; z: number }> | null;
}

export type OcclusionState = "visible" | "partial" | "occluded" | "lost";

export interface TrackedObject {
  trackId: string;
  /** class only when a real inference backend labelled it. */
  category: Measured<string> | null;
  firstSeenMs: number;
  lastSeenMs: number;
  occlusion: OcclusionState;
  /** most recent image-space evidence, always present for a visual track. */
  image: { x: number; y: number; w: number; h: number };
  /** trajectory in whatever space was measurable. */
  history: TrackPoint[];
  world: Measured<{ x: number; y: number; z: number }> | null;
  distanceM: Measured<number> | null;
  geometry: Measured<{ widthM: number; heightM: number; depthM: number }> | null;
  velocityMps: Measured<{ x: number; y: number; z: number }> | null;
  accelerationMps2: Measured<number> | null;
  headingDeg: Measured<number> | null;
  poseKeypoints: Measured<Array<{ name: string; x: number; y: number }>> | null;
  thermal: Measured<{ minC: number; maxC: number; meanC: number }> | null;
  spectral: Measured<Record<string, number>> | null;
  polarization: Measured<number> | null;
  /** which sensors contributed to this track. */
  sensorIds: string[];
  /** relationships to other tracks, only when an interaction backend produced them. */
  relations: Array<{ trackId: string; kind: string; confidence: number }>;
  environment: { illumination: number | null; motionEnergy: number | null };
  confidence: number;
}

// ---------------------------------------------------------------------------
// world model
// ---------------------------------------------------------------------------

export interface PointCloudChunk {
  /** xyz triplets in metres, sensor frame. */
  positions: Float32Array;
  /** optional rgb triplets 0..255, same point count. */
  colors: Uint8Array | null;
  sensorId: string;
  modality: SensorModality;
  atMs: number;
  frameId: string;
}

export interface WorldModelState {
  available: boolean;
  /** what is missing before a reconstruction can exist. Printed verbatim. */
  missing: string[];
  pointCount: number;
  chunks: number;
  lastUpdateMs: number | null;
  /** metric extent, only computed from real ingested points. */
  extentM: { x: number; y: number; z: number } | null;
  sourceSensorIds: string[];
}

// ---------------------------------------------------------------------------
// events, alerts, recording
// ---------------------------------------------------------------------------

export type SceneEventKind =
  | "intrusion"
  | "abandoned_object"
  | "removed_object"
  | "fall"
  | "collision"
  | "fire_smoke"
  | "crowd_surge"
  | "aggression_dynamics"
  | "loitering"
  | "zone_dwell";

export interface SceneEvent {
  id: string;
  kind: SceneEventKind;
  atMs: number;
  zoneId: string | null;
  deviceId: string | null;
  trackIds: string[];
  /** observable evidence lines, never inference about a person. */
  evidence: string[];
  severity: number;
  confidence: number;
  /** null unless a prediction backend produced a horizon. */
  imminenceSec: number | null;
  alternatives: Array<{ outcome: string; probability: number }>;
}

export interface RecordingStatus {
  configured: boolean;
  online: boolean;
  detail: string;
  retainedHours: number | null;
  indexedEvents: number | null;
  oldestSegmentMs: number | null;
}

// ---------------------------------------------------------------------------
// company / site configuration
// ---------------------------------------------------------------------------

export interface SiteZone {
  id: string;
  name: string;
  kind: "restricted" | "public" | "perimeter" | "storage" | "entry";
  note: string;
  /** operator-entered building name. null when the operator never entered one —
   * the console prints "unassigned" rather than inventing a structure. */
  building?: string | null;
  /** operator-entered floor label, same rule. */
  floor?: string | null;
}


export interface AuthorizedDevice {
  id: string;
  name: string;
  /** how this device is reached. */
  transport: SensorTransport;
  modality: SensorModality;
  zoneId: string | null;
  /** the operator's own attestation, stored with the device. */
  authorization: {
    attestedBy: string;
    attestedAtMs: number;
    basis: "owned" | "operated_under_contract" | "written_authorization";
  } | null;
  sourceRef: string;
}

export interface SiteConfig {
  siteId: string;
  companyName: string;
  siteName: string;
  zones: SiteZone[];
  devices: AuthorizedDevice[];
  acknowledgedAuthorizationAtMs: number | null;
}
