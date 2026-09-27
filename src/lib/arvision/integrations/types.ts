// asherin.eye — integration and capability truth contracts.
//
// One vocabulary for the whole console. A capability is never a boolean:
// "this camera cannot do it" and "the software that would do it is not
// connected yet" are different facts and produce different operator work.
//
// Nothing in this module invents a capability. Every state is computed from a
// real sensor descriptor, a real adapter status, a real service probe or an
// explicit declaration published by an edge/ONVIF adapter.

import type { SensorModality } from "../sensors/types";

/** How a dependency is licensed. Core function must never need OPTIONAL PAID. */
export type LicenceClass =
  | "free_open_source"
  | "free_standard"
  | "optional_paid"
  | "unavailable_until_connected";

export const LICENCE_LABEL: Record<LicenceClass, string> = {
  free_open_source: "FREE / OPEN SOURCE",
  free_standard: "FREE STANDARD",
  optional_paid: "OPTIONAL PAID",
  unavailable_until_connected: "UNAVAILABLE UNTIL CONNECTED",
};

/** Where a dependency physically runs. */
export type RunsOn = "browser" | "edge_node" | "server" | "device";

export interface IntegrationEntry {
  id: string;
  label: string;
  /** what it is used for, in one line the operator can read. */
  role: string;
  licence: LicenceClass;
  runsOn: RunsOn;
  /** modalities or functions this dependency can serve when connected. */
  serves: string[];
  /** true when this project actually calls it today. */
  wired: boolean;
  /** live state, computed from real probes; never assumed. */
  state: IntegrationState;
  detail: string;
}

export type IntegrationState =
  | "connected" // answering right now
  | "configured_offline" // an endpoint exists, it is not answering
  | "not_configured" // supported, nothing set up
  | "contract_only" // adapter/contract exists, no runtime is present here
  | "in_browser"; // runs inside this tab and is present

export const INTEGRATION_STATE_LABEL: Record<IntegrationState, string> = {
  connected: "connected",
  configured_offline: "configured, not answering",
  not_configured: "not configured",
  contract_only: "adapter contract only — needs an edge node",
  in_browser: "running in this browser",
};

// ---------------------------------------------------------------------------
// per-device capability matrix
// ---------------------------------------------------------------------------

export type CapabilityId =
  // transport / stream
  | "connection" | "video" | "codec_h264" | "codec_h265" | "ptz" | "audio"
  | "camera_metadata" | "motion_tamper" | "edge_recording" | "onvif"
  // physical modalities
  | "thermal_lwir" | "thermal_radiometric" | "nir" | "swir" | "hyperspectral"
  | "polarization" | "depth" | "lidar" | "event_camera" | "radar"
  | "gnss" | "imu" | "microphone"
  // software / backend
  | "inference" | "tracking" | "event_detection" | "recording" | "historical_search"
  // registration
  | "calibration" | "spatial_registration" | "time_sync";

export const CAPABILITY_LABEL: Record<CapabilityId, string> = {
  connection: "connection",
  video: "video stream",
  codec_h264: "h.264",
  codec_h265: "h.265",
  ptz: "ptz control",
  audio: "audio stream",
  camera_metadata: "camera metadata",
  motion_tamper: "motion / tamper events",
  edge_recording: "on-camera recording",
  onvif: "onvif profile",
  thermal_lwir: "thermal (lwir)",
  thermal_radiometric: "radiometric temperature",
  nir: "near infrared",
  swir: "short wave infrared",
  hyperspectral: "multispectral / hyperspectral",
  polarization: "polarization",
  depth: "depth",
  lidar: "lidar",
  event_camera: "event camera",
  radar: "radar",
  gnss: "satellite position",
  imu: "inertial",
  microphone: "microphone",
  inference: "ai detection",
  tracking: "tracking",
  event_detection: "event detection",
  recording: "recording",
  historical_search: "historical search",
  calibration: "calibration",
  spatial_registration: "spatial registration",
  time_sync: "time synchronisation",
};

/**
 * Six states, deliberately distinct.
 * - available: the device/software does it and it is working now.
 * - unavailable: it exists here but is not working (offline, denied, stale).
 * - unsupported: this hardware physically cannot do it.
 * - requires_edge: physically possible, but only through an edge acquisition
 *   node that is not connected — a browser tab cannot reach it.
 * - not_configured: supported and reachable, nothing has been set up.
 * - unknown: nothing has told us either way. Never rendered as a yes.
 */
export type CapabilityState =
  | "available" | "unavailable" | "unsupported" | "requires_edge" | "not_configured" | "unknown";

export const CAPABILITY_STATE_LABEL: Record<CapabilityState, string> = {
  available: "available",
  unavailable: "unavailable",
  unsupported: "unsupported",
  requires_edge: "needs edge node",
  not_configured: "not configured",
  unknown: "unknown",
};

/** Evidence class for anything the console prints. */
export type EvidenceClass = "observed" | "inferred" | "predicted" | "unknown" | "unavailable";

export interface CapabilityCell {
  capability: CapabilityId;
  state: CapabilityState;
  /** where the answer came from, printed verbatim. */
  reason: string;
  /** how the value itself was established. */
  evidence: EvidenceClass;
}

/**
 * What an ONVIF / edge / vendor adapter actually told us about a device.
 * Every field is optional: an omitted field stays `unknown`, it never
 * degrades into a "no".
 */
export interface DeclaredDeviceCapabilities {
  onvifProfile?: string | null;
  codecs?: string[];
  ptz?: boolean;
  audio?: boolean;
  metadataStream?: boolean;
  motionEvents?: boolean;
  tamperEvents?: boolean;
  edgeRecording?: boolean;
  /** extra physical modalities this one device carries beyond its primary. */
  modalities?: SensorModality[];
  timeSync?: { source: string; offsetMs: number | null } | null;
}

export interface DeviceMatrixRow {
  deviceId: string;
  name: string;
  /** primary modality of the stream backing this device, when one exists. */
  modality: SensorModality | null;
  transport: string;
  cells: CapabilityCell[];
}
