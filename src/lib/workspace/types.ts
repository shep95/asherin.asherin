// asherin chat workspace — the contract.
//
// A chat turn no longer produces only text. It produces a WorkspacePlan: an
// ordered list of surfaces, each of which is either `ready` (a subsystem
// actually returned data) or `unavailable` (with the reason it could not).
//
// Truth rule carried from the sensor stack: a surface is NEVER marked ready
// with invented content. If no subsystem returned rows, it is unavailable and
// the reason says why.

export type SurfaceKind =
  | "answer"
  | "cards"
  | "map"
  | "timeline"
  | "graph"
  | "table"
  | "evidence"
  | "cameras"
  | "artifact";

export type LaneKind = "research" | "sensor" | "spatial" | "files" | "artifact" | "none";

export type CardKind =
  | "entity"
  | "person"
  | "company"
  | "location"
  | "camera"
  | "sensor"
  | "incident"
  | "event"
  | "evidence"
  | "source"
  | "document"
  | "relationship"
  | "timeline-event"
  | "track"
  | "investigation";

/** Where a card's content came from. Never optional — an uncited card is a bug. */
export interface WorkspaceProvenance {
  /** subsystem that produced it: "investigation" | "fabric" | "geocoder" | ... */
  origin: string;
  /** human-readable source label, e.g. a domain, a camera id, "nominatim" */
  label: string;
  /** ISO timestamp the underlying observation/record carries, if it has one. */
  observedAt?: string | null;
  /** 0..1 when the producing subsystem supplied one. Absent means unscored. */
  confidence?: number | null;
  url?: string | null;
}

export interface WorkspaceCard {
  id: string;
  kind: CardKind;
  title: string;
  subtitle?: string;
  /** flat label/value rows — cards are generated, never hand-laid-out. */
  fields: Array<{ label: string; value: string }>;
  provenance: WorkspaceProvenance;
  /** what this card is anchored to, so selection can drive the other surfaces. */
  anchor?: {
    lat?: number;
    lng?: number;
    atMs?: number;
    cameraId?: string;
    trackId?: string;
    entityId?: string;
    evidenceId?: string;
  };
  /** contextual actions the UI may offer; each must be genuinely executable. */
  actions?: Array<{ id: string; label: string }>;
  /** claims that stayed claims. Rendered as unresolved, not as fact. */
  unresolved?: string[];
}

export interface MapMarker {
  id: string;
  kind: "location" | "entity" | "camera" | "event" | "zone";
  label: string;
  lat: number;
  lng: number;
  provenance: WorkspaceProvenance;
}

export interface MapTrackLine {
  id: string;
  label: string;
  points: Array<{ lat: number; lng: number; atMs: number }>;
  provenance: WorkspaceProvenance;
}

export interface MapPayload {
  markers: MapMarker[];
  tracks: MapTrackLine[];
  center: { lat: number; lng: number } | null;
  zoom: number;
  /** entities the lane returned that had no usable coordinate, listed not plotted. */
  unplotted: Array<{ label: string; reason: string }>;
}

export interface TimelineItem {
  id: string;
  atMs: number;
  label: string;
  detail?: string;
  provenance: WorkspaceProvenance;
}

export interface GraphPayload {
  nodes: Array<{ id: string; label: string; kind: CardKind }>;
  edges: Array<{ id: string; from: string; to: string; label: string; confidence?: number | null }>;
}

export interface EvidenceItem {
  id: string;
  label: string;
  kind: string;
  atMs: number | null;
  provenance: WorkspaceProvenance;
  /** true only when a stored artefact really exists and is retrievable. */
  mediaAvailable: boolean;
  mediaUnavailableReason?: string;
}

export interface TablePayload {
  columns: string[];
  rows: string[][];
  caption?: string;
}

export type SurfacePayload =
  | { kind: "answer" }
  | { kind: "artifact"; request: string }
  | { kind: "cards"; cards: WorkspaceCard[] }
  | { kind: "map"; map: MapPayload }
  | { kind: "timeline"; items: TimelineItem[] }
  | { kind: "graph"; graph: GraphPayload }
  | { kind: "table"; table: TablePayload }
  | { kind: "evidence"; items: EvidenceItem[] }
  | { kind: "cameras"; cameras: WorkspaceCard[] };

export type SurfaceState = "ready" | "unavailable" | "degraded" | "pending";

export interface WorkspaceSurface {
  kind: SurfaceKind;
  state: SurfaceState;
  /** required whenever state !== "ready". No silent empty panels. */
  reason?: string;
  payload?: SurfacePayload;
}

export interface WorkspacePlan {
  /** which subsystem lane the planner chose, and why. */
  lane: LaneKind;
  reasons: string[];
  surfaces: WorkspaceSurface[];
  /** lanes that were planned but failed at run time, kept visible. */
  degraded: Array<{ lane: string; reason: string }>;
}

/** Live capability facts the planner reads. Never guessed inside the planner. */
export interface WorkspaceCapabilities {
  /** an authenticated research provider is configured and reachable */
  research: boolean;
  researchReason?: string;
  /** the geocoder can be called from this session */
  geocoding: boolean;
  geocodingReason?: string;
  /** at least one authorized camera is registered */
  cameras: boolean;
  camerasReason?: string;
  /** sentinel/arvision fabric has live or recent observations */
  fabric: boolean;
  fabricReason?: string;
  /** stored evidence media is retrievable */
  evidenceStore: boolean;
  evidenceStoreReason?: string;
  /** spatial calibration exists, so tracks may be plotted */
  spatialCalibration: boolean;
  spatialCalibrationReason?: string;
}

export const NO_CAPABILITIES: WorkspaceCapabilities = {
  research: false,
  researchReason: "no research provider configured for this session",
  geocoding: false,
  geocodingReason: "geocoder not reachable from this session",
  cameras: false,
  camerasReason: "no authorized camera is registered",
  fabric: false,
  fabricReason: "no sensor has published an observation into the fabric",
  evidenceStore: false,
  evidenceStoreReason: "no evidence store is configured",
  spatialCalibration: false,
  spatialCalibrationReason: "no camera has a calibrated pose, so tracks cannot be plotted",
};
