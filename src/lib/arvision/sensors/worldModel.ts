// asherin.arvision — world model ingestion.
//
// A continuously updated 3d representation is a real thing to build, and it has
// real prerequisites: a depth, stereo or lidar stream, a calibration, and
// points actually arriving. When any of those is missing the room says
// "3d reconstruction unavailable" and lists what is missing. It never scatters
// points to look alive.

import type { PointCloudChunk, SensorDescriptor, WorldModelState } from "./types";

export const RECONSTRUCTION_PREREQUISITES = {
  rangingSensor: "a depth, stereo or lidar stream",
  calibration: "extrinsic calibration between the ranging sensor and the colour camera",
  liveData: "point data actually arriving from that sensor",
};

export function missingPrerequisites(sensors: SensorDescriptor[], pointCount: number): string[] {
  const missing: string[] = [];
  const ranging = sensors.filter((s) => s.modality === "depth" || s.modality === "lidar");
  const live = ranging.filter((s) => s.health === "live" || s.health === "opening");

  if (ranging.length === 0) missing.push(RECONSTRUCTION_PREREQUISITES.rangingSensor);
  else if (live.length === 0) missing.push(`${RECONSTRUCTION_PREREQUISITES.rangingSensor} that is live`);

  if (live.length > 0 && !live.some((s) => s.calibration.state !== "none")) {
    missing.push(RECONSTRUCTION_PREREQUISITES.calibration);
  }
  if (pointCount === 0) missing.push(RECONSTRUCTION_PREREQUISITES.liveData);
  return missing;
}

/**
 * Holds ingested point cloud chunks with a bounded budget. Every figure it
 * reports is counted from real ingested points.
 */
export class WorldModel {
  private chunks: PointCloudChunk[] = [];
  private budgetPoints: number;

  constructor(budgetPoints = 1_500_000) {
    this.budgetPoints = budgetPoints;
  }

  ingest(chunk: PointCloudChunk) {
    if (chunk.positions.length % 3 !== 0) return;
    this.chunks.push(chunk);
    while (this.pointCount() > this.budgetPoints && this.chunks.length > 1) this.chunks.shift();
  }

  clear() {
    this.chunks = [];
  }

  pointCount(): number {
    return this.chunks.reduce((n, c) => n + c.positions.length / 3, 0);
  }

  latest(): PointCloudChunk[] {
    return this.chunks;
  }

  state(sensors: SensorDescriptor[]): WorldModelState {
    const pointCount = this.pointCount();
    const missing = missingPrerequisites(sensors, pointCount);
    let extent: WorldModelState["extentM"] = null;

    if (pointCount > 0) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const c of this.chunks) {
        const p = c.positions;
        for (let i = 0; i < p.length; i += 3) {
          if (p[i] < minX) minX = p[i];
          if (p[i] > maxX) maxX = p[i];
          if (p[i + 1] < minY) minY = p[i + 1];
          if (p[i + 1] > maxY) maxY = p[i + 1];
          if (p[i + 2] < minZ) minZ = p[i + 2];
          if (p[i + 2] > maxZ) maxZ = p[i + 2];
        }
      }
      extent = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
    }

    return {
      available: missing.length === 0,
      missing,
      pointCount,
      chunks: this.chunks.length,
      lastUpdateMs: this.chunks.length ? this.chunks[this.chunks.length - 1].atMs : null,
      extentM: extent,
      sourceSensorIds: [...new Set(this.chunks.map((c) => c.sensorId))],
    };
  }
}
