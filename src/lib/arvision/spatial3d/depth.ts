// asherin.eye — depth acquisition contract.
//
// The single most common lie in a "3d" security console is a depth number
// derived from a flat colour image. Depth is a measurement; it comes from a
// stereo pair, an RGB-D sensor or a lidar, and from nothing else. This module
// answers only from the registered streams and the adapters that are actually
// reachable.

import type { SensorDescriptor } from "../sensors/types";
import type { DepthAvailability } from "./types";

/** Adapters that could carry depth when an operator connects one. */
export interface DepthAdapterEntry {
  id: string;
  label: string;
  /** what it needs to run, in one line. */
  requires: string;
  runsOn: "browser" | "edge_node";
  licence: "free_open_source" | "free_standard" | "optional_paid";
  /** true only when this project actually calls it today. */
  wired: boolean;
}

export const DEPTH_ADAPTERS: DepthAdapterEntry[] = [
  {
    id: "stereo_opencv",
    label: "stereo pair (OpenCV block matching / SGBM)",
    requires: "two synchronised, calibrated cameras on an edge node running OpenCV",
    runsOn: "edge_node",
    licence: "free_open_source",
    wired: false,
  },
  {
    id: "rgbd_bridge",
    label: "RGB-D camera bridge (ROS 2 / GStreamer depth topic)",
    requires: "an RGB-D device on an edge node publishing a depth topic",
    runsOn: "edge_node",
    licence: "free_open_source",
    wired: false,
  },
  {
    id: "lidar_bridge",
    label: "lidar bridge (ROS 2 PointCloud2)",
    requires: "a lidar driver on an edge node publishing point clouds",
    runsOn: "edge_node",
    licence: "free_open_source",
    wired: false,
  },
];

export const BROWSER_DEPTH_LIMIT =
  "a browser tab receives decoded colour frames only. it cannot open a depth, stereo or lidar device, so depth for browser cameras is acquired through an edge node or not at all.";

export interface DepthInput {
  /** the stream backing the selected device. */
  sensor: SensorDescriptor | null;
  /** every registered stream, so a paired depth sensor can be found. */
  all: SensorDescriptor[];
  /** true only when the edge bridge adapter reported itself reachable. */
  edgeConnected: boolean;
  /** device ids that an operator has paired as a stereo/depth rig. */
  pairedDepthSensorIds?: string[];
}

function fromSensor(s: SensorDescriptor): DepthAvailability {
  const live = s.health === "live";
  return {
    state: live ? "available" : "unavailable",
    reason: live
      ? `${s.modality} samples are arriving from ${s.provenance.adapter}`
      : `the ${s.modality} stream is registered but ${s.statusDetail || "not producing samples"}`,
    source: { sensorId: s.id, modality: s.modality, adapter: s.provenance.adapter },
    atMs: s.lastSampleMs,
    quality: s.quality.signal,
    rangeM: null,
    confidence: live ? s.quality.cadence : null,
  };
}

/** Depth for one device: measured, or explicitly unavailable with a reason. */
export function depthAvailability(input: DepthInput): DepthAvailability {
  const { sensor, all, edgeConnected } = input;
  const paired = new Set(input.pairedDepthSensorIds ?? []);

  if (sensor && (sensor.modality === "depth" || sensor.modality === "lidar")) return fromSensor(sensor);

  const partner = all.find(
    (s) => (s.modality === "depth" || s.modality === "lidar") && (paired.has(s.id) || paired.size === 0),
  );
  if (partner && paired.has(partner.id)) return fromSensor(partner);

  const rgbOnly = !sensor || sensor.modality === "rgb" || sensor.modality === "lowlight";
  if (rgbOnly) {
    return {
      state: edgeConnected ? "unavailable" : "requires_edge",
      reason: edgeConnected
        ? "this is a visible-light stream and the connected edge node publishes no depth for it. DEPTH UNAVAILABLE — a colour image is not a distance measurement."
        : `DEPTH UNAVAILABLE — this is a visible-light stream. ${BROWSER_DEPTH_LIMIT}`,
      source: null,
      atMs: null,
      quality: null,
      rangeM: null,
      confidence: null,
    };
  }
  return {
    state: "unsupported",
    reason: `a ${sensor?.modality} stream does not measure range.`,
    source: null,
    atMs: null,
    quality: null,
    rangeM: null,
    confidence: null,
  };
}

/** Lidar specifically, since operators ask for it by name. */
export function lidarAvailability(input: DepthInput): DepthAvailability {
  const lidar = input.all.find((s) => s.modality === "lidar");
  if (lidar) return fromSensor(lidar);
  return {
    state: input.edgeConnected ? "unavailable" : "requires_edge",
    reason: input.edgeConnected
      ? "the connected edge node publishes no lidar stream."
      : "LIDAR UNAVAILABLE — no lidar is registered, and a browser tab cannot open one. it arrives through an edge node bridge.",
    source: null,
    atMs: null,
    quality: null,
    rangeM: null,
    confidence: null,
  };
}
