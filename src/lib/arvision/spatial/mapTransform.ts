// asherin.arvision — map projection
// ported from Utils/MapCoordinateTransformer.swift: X-Z plane to canvas, uniform
// scale with aspect preserved, +Z drawn upward, quaternion yaw to screen heading.

import type { MapBounds, Quat, Vec3 } from "./types";

export interface ScreenPoint {
  x: number;
  y: number;
}

export class MapTransform {
  readonly scale: number;
  readonly offset: ScreenPoint;
  readonly mapWidth: number;
  readonly mapHeight: number;

  constructor(
    private readonly bounds: MapBounds,
    canvas: { width: number; height: number },
    padding = 20,
  ) {
    this.mapWidth = Math.max(bounds.max.x - bounds.min.x, 0.001);
    this.mapHeight = Math.max(bounds.max.z - bounds.min.z, 0.001);

    const availableWidth = Math.max(canvas.width - padding * 2, 1);
    const availableHeight = Math.max(canvas.height - padding * 2, 1);
    this.scale = Math.min(availableWidth / this.mapWidth, availableHeight / this.mapHeight);

    this.offset = {
      x: (canvas.width - this.mapWidth * this.scale) / 2,
      y: (canvas.height - this.mapHeight * this.scale) / 2,
    };
  }

  toScreen(position: Vec3): ScreenPoint {
    const normalizedX = position.x - this.bounds.min.x;
    const normalizedZ = position.z - this.bounds.min.z;
    const invertedZ = this.mapHeight - normalizedZ;
    return {
      x: this.offset.x + normalizedX * this.scale,
      y: this.offset.y + invertedZ * this.scale,
    };
  }

  toMap(point: ScreenPoint): Vec3 {
    const normalizedX = (point.x - this.offset.x) / this.scale;
    const invertedZ = (point.y - this.offset.y) / this.scale;
    const normalizedZ = this.mapHeight - invertedZ;
    return {
      x: normalizedX + this.bounds.min.x,
      y: 0,
      z: normalizedZ + this.bounds.min.z,
    };
  }

  toScreenDistance(worldDistance: number): number {
    return worldDistance * this.scale;
  }
}

/** Yaw of a quaternion in the left-handed space the positioning API returns, radians. */
export function headingFromRotation(rotation: Quat): number {
  const forwardX = 2 * (rotation.x * rotation.z + rotation.w * rotation.y);
  const forwardZ = 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y);
  return Math.atan2(forwardX, forwardZ);
}

/** Screen heading from movement, radians, or null when the step was too small to trust. */
export function headingFromMovement(from: Vec3, to: Vec3): number | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.sqrt(dx * dx + dz * dz) <= 0.1) return null;
  return Math.PI / 2 - Math.atan2(dz, dx);
}
