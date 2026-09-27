// asherin.arvision — see-through-walls rendering math
// The uploaded package renders a peer as a solid avatar in clear line of sight and
// as a skeleton silhouette when scanned wall geometry sits between the two devices.
// That decision needs geometry. A browser has no scanned collision mesh, so the
// walkable waypoint graph of the loaded map is used as the geometry proxy: if the
// straight line to a peer leaves the walkable corridor, something is between you.
// This is a corridor test, not a scanned mesh, and the UI labels it that way.

import { NavigationGraph } from "./navData";
import type { CameraIntrinsics } from "./intrinsics";
import { distance2D, distance3D, type Quat, type Vec3 } from "./types";

export interface Projected {
  /** Normalised 0..1 image coordinates, origin top left. */
  u: number;
  v: number;
  /** Metres in front of the camera. Negative means behind the viewer. */
  depth: number;
  inFrame: boolean;
}

/** Rotate a world-space vector into the camera frame using the inverse viewer rotation. */
export function worldToCamera(delta: Vec3, rotation: Quat): Vec3 {
  const { x, y, z, w } = rotation;
  // inverse of a unit quaternion is its conjugate
  const cx = -x;
  const cy = -y;
  const cz = -z;

  // v' = q * v * q^-1, expanded
  const ix = w * delta.x + cy * delta.z - cz * delta.y;
  const iy = w * delta.y + cz * delta.x - cx * delta.z;
  const iz = w * delta.z + cx * delta.y - cy * delta.x;
  const iw = -cx * delta.x - cy * delta.y - cz * delta.z;

  return {
    x: ix * w + iw * -cx + iy * -cz - iz * -cy,
    y: iy * w + iw * -cy + iz * -cx - ix * -cz,
    z: iz * w + iw * -cz + ix * -cy - iy * -cx,
  };
}

export function projectPoint(
  viewerPosition: Vec3,
  viewerRotation: Quat,
  worldPoint: Vec3,
  intrinsics: CameraIntrinsics,
): Projected {
  const delta = {
    x: worldPoint.x - viewerPosition.x,
    y: worldPoint.y - viewerPosition.y,
    z: worldPoint.z - viewerPosition.z,
  };
  const cam = worldToCamera(delta, viewerRotation);
  const depth = cam.z;

  if (depth <= 0.05) {
    return { u: 0.5, v: 0.5, depth, inFrame: false };
  }

  const px = intrinsics.px + (intrinsics.fx * cam.x) / depth;
  const py = intrinsics.py - (intrinsics.fy * cam.y) / depth;
  const u = px / intrinsics.width;
  const v = py / intrinsics.height;

  return { u, v, depth, inFrame: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
}

export interface OcclusionResult {
  occluded: boolean;
  /** How far off the walkable corridor the worst sample fell, metres. */
  worstClearance: number;
  method: "waypoint-corridor" | "no-map";
}

/**
 * Corridor line of sight test. Samples the segment between two positions and
 * measures each sample against the nearest walkable waypoint.
 */
export function evaluateOcclusion(
  graph: NavigationGraph | null,
  from: Vec3,
  to: Vec3,
  corridorRadius?: number,
): OcclusionResult {
  if (!graph || graph.data.waypoints.length === 0) {
    return { occluded: false, worstClearance: 0, method: "no-map" };
  }

  const radius = corridorRadius ?? Math.max(graph.data.waypointSpacing * 2.5, 1.2);
  const span = distance2D(from, to);
  const steps = Math.max(4, Math.min(48, Math.ceil(span / Math.max(graph.data.waypointSpacing, 0.25))));

  let worst = 0;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const sample: Vec3 = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
    };
    const nearest = graph.findNearestWaypoint(sample);
    if (!nearest) continue;
    const clearance = distance2D(sample, nearest.position);
    if (clearance > worst) worst = clearance;
  }

  return { occluded: worst > radius, worstClearance: worst, method: "waypoint-corridor" };
}

export function rangeTo(from: Vec3, to: Vec3): number {
  return distance3D(from, to);
}
