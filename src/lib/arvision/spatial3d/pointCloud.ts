// asherin.eye — point cloud truth.
//
// Everything reported here is counted from points that actually arrived. A
// console with no ranging sensor gets `available: false` and a reason; it never
// gets a scatter of points made from a colour frame and labelled sensor depth.
//
// Downstream processing (registration, meshing, segmentation) is Open3D work on
// an edge node — free and self-hostable. The browser side only summarises.

import type { PointCloudChunk } from "../sensors/types";
import type { PointCloudSummary } from "./types";

export interface CloudChunk extends PointCloudChunk {
  /** optional per-point intensity, exactly as the sensor supplied it. */
  intensity?: Float32Array | null;
  /** the frame the coordinates are expressed in, as the producer declared it. */
  coordinateFrame?: string | null;
}

const EMPTY: PointCloudSummary = {
  available: false,
  reason: "POINT CLOUD UNAVAILABLE — no depth or lidar stream has delivered points. nothing here is generated from colour frames.",
  points: 0,
  chunks: 0,
  sensorIds: [],
  modalities: [],
  atMs: null,
  extentM: null,
  densityPerM3: null,
  rangeM: null,
  coordinateFrame: null,
  hasIntensity: false,
};

export function summarizePointCloud(chunks: CloudChunk[] | null | undefined): PointCloudSummary {
  if (!chunks || chunks.length === 0) return { ...EMPTY };

  let points = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let minR = Infinity, maxR = -Infinity;
  let atMs: number | null = null;
  const sensorIds = new Set<string>();
  const modalities = new Set<PointCloudSummary["modalities"][number]>();
  let hasIntensity = false;
  let frame: string | null = null;

  for (const c of chunks) {
    const p = c.positions;
    if (!p || p.length < 3) continue;
    sensorIds.add(c.sensorId);
    modalities.add(c.modality);
    if (c.intensity && c.intensity.length > 0) hasIntensity = true;
    frame = frame ?? c.coordinateFrame ?? c.frameId ?? null;
    atMs = atMs == null ? c.atMs : Math.max(atMs, c.atMs);
    for (let i = 0; i + 2 < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      points += 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      const r = Math.hypot(x, y, z);
      if (r < minR) minR = r; if (r > maxR) maxR = r;
    }
  }

  if (points === 0) return { ...EMPTY, chunks: chunks.length, reason: "POINT CLOUD UNAVAILABLE — chunks arrived but carried no finite points." };

  const extentM = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
  const volume = Math.max(extentM.x, 0.01) * Math.max(extentM.y, 0.01) * Math.max(extentM.z, 0.01);

  return {
    available: true,
    reason: `counted from ${points} points delivered by ${sensorIds.size} ranging stream(s).`,
    points,
    chunks: chunks.length,
    sensorIds: [...sensorIds],
    modalities: [...modalities],
    atMs,
    extentM,
    densityPerM3: points / volume,
    rangeM: { min: minR, max: maxR },
    coordinateFrame: frame,
    hasIntensity,
  };
}
