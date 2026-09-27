// eagle.eye — operations console contracts.
//
// This layer owns none of the sensing. It reads what the sensor registry, the
// vision bridge, the incident ledger and the service probes already know, and
// arranges it the way a security operations desk works: a site tree, a camera
// inventory, an alert queue, and an evidence trail.
//
// The single rule it enforces on top of the layers below: a console row states
// what is actually true of that device right now — and where something is
// missing it says which action would supply it, rather than dressing the gap up
// as a working feature.

import type {
  AuthorizedDevice, SensorDescriptor, SensorModality, ServiceHealth, SiteZone, StreamHealth,
} from "../sensors/types";

/**
 * The seven states a console row can be in. They are deliberately distinct:
 * "the camera is fine but the model is not running" and "the camera is gone"
 * produce different work for the operator.
 */
export type ConsoleState =
  | "live"              // authorized, connected, producing frames now
  | "disconnected"      // authorized and known, not currently producing
  | "not_configured"    // supported here, but nothing has been set up
  | "unsupported"       // this hardware/browser cannot do it at all
  | "backend_offline"   // configured service is not answering
  | "denied"            // permission refused by the operating system or user
  | "stale";            // last sample is older than the freshness budget

export const CONSOLE_STATE_LABEL: Record<ConsoleState, string> = {
  live: "live",
  disconnected: "disconnected",
  not_configured: "not configured",
  unsupported: "unsupported here",
  backend_offline: "backend offline",
  denied: "permission denied",
  stale: "stale",
};

/** An action the operator can actually take to move a row out of its state. */
export interface Remediation {
  id:
    | "connect_camera"
    | "grant_permission"
    | "configure_edge_bridge"
    | "calibrate"
    | "start_inference"
    | "configure_recording"
    | "authorize_device"
    | "acknowledge_authorization"
    | "none";
  label: string;
  detail: string;
}

/** One badge printed on a camera card. `measurable` distinguishes a picture
 * from a measurement — a false-colour render is never a measurement. */
export interface CapabilityBadge {
  modality: SensorModality;
  label: string;
  measurable: boolean;
  state: ConsoleState;
  detail: string;
}

export interface CameraRow {
  deviceId: string;
  name: string;
  zoneId: string | null;
  zoneName: string | null;
  building: string;
  floor: string;
  authorized: boolean;
  authorizationBasis: string | null;
  /** health of the picture path only. */
  feed: { state: ConsoleState; detail: string; lastSampleMs: number | null };
  /** health of the model path only — never merged with the feed. */
  inference: { state: ConsoleState; detail: string };
  /** health of the recording/evidence path only. */
  recording: { state: ConsoleState; detail: string };
  badges: CapabilityBadge[];
  remediation: Remediation[];
  sensorId: string | null;
}

export interface SiteTreeFloor {
  floor: string;
  zones: Array<SiteZone & { cameraIds: string[] }>;
}

export interface SiteTreeBuilding {
  building: string;
  floors: SiteTreeFloor[];
}

export interface SiteTree {
  siteId: string;
  siteName: string;
  companyName: string;
  buildings: SiteTreeBuilding[];
  /** cameras whose zone the operator never set. */
  unassignedCameraIds: string[];
}

// ---------------------------------------------------------------------------
// alert queue
// ---------------------------------------------------------------------------

export type QueueStatus = "new" | "acknowledged" | "escalated" | "resolved";

export interface QueueItem {
  incidentId: string;
  eventType: string;
  label: string;
  deviceId: string | null;
  zoneId: string | null;
  openedAtMs: number;
  lastFiringMs: number;
  /** 0..1, from the detector that fired. Never assigned by the console. */
  quality: number | null;
  /** observable signal lines the rule actually used. */
  signals: string[];
  /** inputs the rule wanted and did not get. */
  missing: string[];
  trackIds: string[];
  evidenceId: string | null;
  evidenceState: "none" | "requested" | "stored" | "unavailable";
  status: QueueStatus;
  actor: string | null;
  statusAtMs: number | null;
  notes: Array<{ atMs: number; author: string; text: string }>;
}

/** Composable queue/inventory filter. Every field is optional; an omitted field
 * does not constrain. */
export interface ConsoleFilter {
  siteId?: string;
  deviceIds?: string[];
  zoneIds?: string[];
  eventTypes?: string[];
  statuses?: QueueStatus[];
  fromMs?: number;
  toMs?: number;
  minQuality?: number;
  modalities?: SensorModality[];
  text?: string;
}

export interface ConsoleInputs {
  zones: SiteZone[];
  devices: AuthorizedDevice[];
  sensors: SensorDescriptor[];
  services: ServiceHealth[];
  acknowledgedAuthorizationAtMs: number | null;
  nowMs: number;
  /** freshness budget for a live feed, ms. */
  staleAfterMs?: number;
}

export type { SensorDescriptor, StreamHealth };
