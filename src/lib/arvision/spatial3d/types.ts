// asherin.eye — spatial / 3d truth contracts.
//
// The gap this module closes: a Cesium globe, an extruded OpenStreetMap
// footprint and a GLB aircraft model are three completely different kinds of
// claim, and the old interface printed all three as "3d". They are not the
// same fact and they do not support the same operator decision.
//
// Every structure below carries the state that says WHERE the geometry came
// from, and no function in this folder ever manufactures geometry, depth,
// distance, a point or a pose. Missing input produces `unavailable` with a
// printable reason — never a plausible number.

import type { SensorModality } from "../sensors/types";

/** How a piece of 3d in front of the operator was actually produced. */
export type Spatial3DState =
  /** depth / stereo / lidar hardware is connected and measuring. */
  | "real_sensor_3d"
  /** geometry computed from real observations (photogrammetry, SfM, fused depth). */
  | "reconstructed_3d"
  /** an operator supplied a real 3d / floor plan / CAD / BIM asset. */
  | "imported_3d"
  /** public map footprints and tagged heights, extruded. */
  | "map_derived_3d"
  /** drawn for orientation only; it measures nothing. */
  | "schematic_3d"
  /** the sensor, asset or backend required for any of the above is missing. */
  | "unavailable";

export const SPATIAL_3D_LABEL: Record<Spatial3DState, string> = {
  real_sensor_3d: "REAL SENSOR 3D",
  reconstructed_3d: "RECONSTRUCTED 3D",
  imported_3d: "IMPORTED 3D",
  map_derived_3d: "MAP DERIVED 3D",
  schematic_3d: "SCHEMATIC 3D",
  unavailable: "UNAVAILABLE",
};

/** One line printed next to the badge, at the point of use. */
export const SPATIAL_3D_MEANING: Record<Spatial3DState, string> = {
  real_sensor_3d: "measured by depth, stereo or lidar hardware that is connected now.",
  reconstructed_3d: "computed from real observations. accuracy depends on the observations, not on the render.",
  imported_3d: "an operator supplied asset. it is as correct as the file and its alignment.",
  map_derived_3d: "public map footprints with tagged heights, extruded. it is not an interior or a verified building model.",
  schematic_3d: "a drawing for orientation. nothing here is a measurement.",
  unavailable: "the sensor, asset or backend this would need is not present.",
};

// ---------------------------------------------------------------------------
// camera spatial model
// ---------------------------------------------------------------------------

export interface CameraIntrinsics {
  fx: number; fy: number; px: number; py: number; width: number; height: number;
}

export interface CameraDistortion {
  model: string; // e.g. "brown_conrady" / "kannala_brandt"
  coefficients: number[];
}

export type CalibrationSource = "none" | "assumed" | "factory" | "operator" | "verified";

export type TimeSyncState = "synchronised" | "local_clock_only" | "drifting" | "unknown";

export interface CameraSpatialModel {
  deviceId: string;
  name: string;
  /** geographic pose. every field stays null when nobody measured or entered it. */
  latitude: number | null;
  longitude: number | null;
  elevationM: number | null;
  headingDeg: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
  hfovDeg: number | null;
  vfovDeg: number | null;
  imageWidth: number | null;
  imageHeight: number | null;
  intrinsics: CameraIntrinsics | null;
  /** rotation + translation into the site frame, when a registration produced one. */
  extrinsics: { rotationDeg: [number, number, number]; translationM: [number, number, number] } | null;
  distortion: CameraDistortion | null;
  calibration: { source: CalibrationSource; state: string; atMs: number | null; detail: string };
  /** coordinate reference the pose is expressed in. */
  crs: string;
  timeSync: { state: TimeSyncState; offsetMs: number | null; source: string };
  /** operator-measured usable range. null when nobody measured it. */
  measuredRangeM: number | null;
  modality: SensorModality | null;
}

export type FrustumState = "available" | "approximate" | "unavailable";

export interface CameraFrustum {
  state: FrustumState;
  reason: string;
  /** apex + ground footprint, only when the pose supports it. */
  geometry: {
    apex: { latitude: number; longitude: number; elevationM: number };
    headingDeg: number;
    pitchDeg: number;
    hfovDeg: number;
    vfovDeg: number | null;
    /** how far the wedge is drawn. null when no range was ever measured. */
    rangeM: number | null;
    /** ground polygon of the wedge, [lon, lat] pairs. */
    footprint: Array<[number, number]>;
  } | null;
  /** 0..1 from the calibration evidence that exists, never assigned by hand. */
  confidence: number | null;
  /** printed verbatim under every frustum. */
  caveat: string;
}

export const FRUSTUM_CAVEAT =
  "estimated visibility volume from the entered pose and field of view. it is not guaranteed detection coverage: occlusion, focus, lighting and resolution all reduce what is actually visible.";

// ---------------------------------------------------------------------------
// depth / point clouds
// ---------------------------------------------------------------------------

export type DepthState = "available" | "unavailable" | "requires_edge" | "unsupported";

export interface DepthAvailability {
  state: DepthState;
  reason: string;
  source: { sensorId: string; modality: SensorModality; adapter: string } | null;
  atMs: number | null;
  /** 0..1 from the producing stream's own quality figures. */
  quality: number | null;
  rangeM: { min: number; max: number } | null;
  confidence: number | null;
}

export interface PointCloudSummary {
  available: boolean;
  reason: string;
  points: number;
  chunks: number;
  sensorIds: string[];
  modalities: SensorModality[];
  atMs: number | null;
  /** metric extent counted from real points only. */
  extentM: { x: number; y: number; z: number } | null;
  /** points per cubic metre, computed from the same real points. */
  densityPerM3: number | null;
  rangeM: { min: number; max: number } | null;
  /** frame the coordinates are expressed in, as the producer declared it. */
  coordinateFrame: string | null;
  hasIntensity: boolean;
}

// ---------------------------------------------------------------------------
// imported site assets
// ---------------------------------------------------------------------------

export type AssetFormat = "glb" | "gltf" | "obj" | "ply" | "las" | "laz" | "floorplan_image" | "geojson" | "ifc" | "dxf";

export type AssetVerification = "unverified" | "operator_checked" | "surveyed";

export interface SiteAsset {
  id: string;
  siteId: string;
  building: string | null;
  /** where the file came from, in the operator's words. */
  source: string;
  format: AssetFormat;
  uploadedBy: string;
  createdAtMs: number;
  /** coordinate system the file is authored in. */
  coordinateSystem: string;
  scale: number;
  rotationDeg: [number, number, number];
  /** geographic origin the file is pinned to. null until an operator aligns it. */
  origin: { latitude: number; longitude: number; elevationM: number } | null;
  registration: RegistrationState;
  verification: AssetVerification;
  /** interior features the FILE actually declares. never inferred. */
  declares: {
    floors: number | null;
    rooms: number | null;
    doors: number | null;
    windows: number | null;
    stairs: number | null;
    elevators: number | null;
    restrictedAreas: number | null;
    cameraPositions: number | null;
  };
  note: string;
}

// ---------------------------------------------------------------------------
// spatial registration
// ---------------------------------------------------------------------------

export type RegistrationState = "not_registered" | "approximate" | "calibrated" | "verified";

export const REGISTRATION_LABEL: Record<RegistrationState, string> = {
  not_registered: "NOT REGISTERED",
  approximate: "APPROXIMATE",
  calibrated: "CALIBRATED",
  verified: "VERIFIED",
};

export interface RegistrationEvidence {
  /** count of physical reference points an operator measured and entered. */
  referencePoints: number;
  matchedBuildingGeometry: boolean;
  floorPlanAsset: boolean;
  peerCameraCalibrated: boolean;
  depthOrLidar: boolean;
  surveyedByOperator: boolean;
}

export interface RegistrationResult {
  state: RegistrationState;
  reasons: string[];
  /** what would raise the state one step. printed as the next operator action. */
  nextAction: string;
}

// ---------------------------------------------------------------------------
// 3d tracks, relationships, handoff
// ---------------------------------------------------------------------------

export interface SpatialTrack3D {
  /** temporary, per-session, per-camera. never an identity. */
  trackId: string;
  sourceDeviceId: string;
  position: { x: number; y: number; z: number };
  /** the modality that MEASURED the position. */
  measuredBy: SensorModality;
  atMs: number;
  firstSeenMs: number;
  lastSeenMs: number;
  velocityMps: { x: number; y: number; z: number } | null;
  headingDeg: number | null;
  /** ± metres per axis. an unmeasured axis stays null. */
  uncertaintyM: { x: number | null; y: number | null; z: number | null };
  occlusion: "visible" | "partial" | "occluded" | "lost";
  confidence: number;
  trajectory: Array<{ atMs: number; x: number; y: number; z: number }>;
  spatialState: Spatial3DState;
}

export type SpatialRelation =
  | "inside" | "outside" | "near" | "above" | "below"
  | "approaching" | "departing" | "crossing" | "stationary" | "moving";

export interface RelationFinding {
  relation: SpatialRelation;
  /** the measurement the relation was computed from. */
  basis: string;
  /** metres, when the relation is a distance. */
  valueM: number | null;
}

export type HandoffStatus = "possible_match" | "not_confirmed" | "insufficient_evidence";

export interface HandoffCandidate {
  fromTrackId: string;
  toTrackId: string;
  fromDeviceId: string;
  toDeviceId: string;
  status: HandoffStatus;
  gapMs: number | null;
  distanceM: number | null;
  reasons: string[];
}

export const HANDOFF_CAVEAT =
  "a spatial and temporal continuation between two anonymous camera tracks. it is never a statement that the same person or object was identified.";

// ---------------------------------------------------------------------------
// historical scene
// ---------------------------------------------------------------------------

export interface HistoricalSceneState {
  available: boolean;
  label: string;
  reason: string;
  fromMs: number | null;
  toMs: number | null;
  observations: number;
}
