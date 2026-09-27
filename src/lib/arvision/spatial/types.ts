// asherin.arvision — spatial types
// ported from the uploaded see-through-walls package (Swift models):
//   Models/NavigationModels.swift, Models/LocalizationResponse.swift, Models/NetworkModels.swift
// Nothing here fabricates position data. Every field is filled either by a real
// positioning response, by a user-placed marker, or by a peer in a live session.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface MapBounds {
  center: Vec3;
  size: Vec3;
  min: Vec3;
  max: Vec3;
}

export interface NavigationPOI {
  id: number;
  name: string;
  description: string;
  type: string;
  position: Vec3;
  worldPosition?: Vec3;
  nearestWaypointId: number;
  arrivalRadius: number;
}

export interface NavigationWaypoint {
  id: number;
  position: Vec3;
  connectedWaypoints: number[];
}

export interface NavigationPath {
  fromWaypointId: number;
  toPoiId: number;
  waypointPath: number[];
  totalDistance: number;
}

export interface NavigationData {
  mapCode: string;
  exportedAt?: string;
  waypointSpacing: number;
  bounds: MapBounds;
  pois: NavigationPOI[];
  waypoints: NavigationWaypoint[];
  paths: NavigationPath[];
  /** Present when the map is anchored to earth, so a live GPS fix can be plotted on it. */
  origin?: { lat: number; lon: number };

}

/** Instruction set ported from NavigationInstruction.swift. */
export type NavInstruction =
  | "navigationStarted"
  | "moveForward"
  | "slightLeft"
  | "slightRight"
  | "turnLeft"
  | "turnRight"
  | "turnAround"
  | "recalculating"
  | "destinationReached";

export interface LocalizationPose {
  position: Vec3;
  rotation: Quat;
  confidence: number;
  /** Set by whatever produced the pose so the UI never implies a source it does not have. */
  source: "vps" | "manual" | "peer";
  at: number;
}

/** Wire messages, ported from NetworkModels.swift (poseUpdate = 1, playerInfo = 2). */
export interface PlayerInfo {
  playerName: string;
  colorR: number;
  colorG: number;
  colorB: number;
}

export interface PoseUpdate {
  position: Vec3;
  rotation: Quat;
  isLocalized: boolean;
}

export interface PeerState extends PlayerInfo {
  peerId: string;
  pose: PoseUpdate | null;
  lastSeen: number;
}

export function distance2D(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function distance3D(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function isNavigationData(value: unknown): value is NavigationData {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<NavigationData>;
  return (
    typeof d.mapCode === "string" &&
    !!d.bounds &&
    Array.isArray(d.pois) &&
    Array.isArray(d.waypoints) &&
    Array.isArray(d.paths)
  );
}
