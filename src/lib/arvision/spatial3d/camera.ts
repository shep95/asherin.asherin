// asherin.eye — camera spatial model and frustum.
//
// A camera becomes a spatial instrument only when somebody measured where it
// is, which way it looks and how wide it sees. Until then it is a picture on a
// screen, and this module says so instead of drawing a confident wedge over a
// map.
//
// Geometry pattern adapted from the gods-eye-view Cesium layer (pose -> world
// position -> camera framing), rewritten as pure maths so the numbers can be
// tested without a renderer and so nothing depends on a paid tile provider.

import type { SensorDescriptor } from "../sensors/types";
import type { AuthorizedDevice } from "../sensors/types";
import {
  FRUSTUM_CAVEAT,
  type CalibrationSource,
  type CameraFrustum,
  type CameraSpatialModel,
} from "./types";

/** Operator-entered pose for one authorized camera. Absent fields stay absent. */
export interface CameraPoseInput {
  latitude?: number | null;
  longitude?: number | null;
  elevationM?: number | null;
  headingDeg?: number | null;
  pitchDeg?: number | null;
  rollDeg?: number | null;
  hfovDeg?: number | null;
  vfovDeg?: number | null;
  measuredRangeM?: number | null;
  crs?: string | null;
  distortion?: CameraSpatialModel["distortion"];
  extrinsics?: CameraSpatialModel["extrinsics"];
  timeSync?: { state: CameraSpatialModel["timeSync"]["state"]; offsetMs: number | null; source: string } | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Build the spatial model from what is actually known. Nothing is defaulted. */
export function cameraSpatialModel(
  device: Pick<AuthorizedDevice, "id" | "name" | "modality">,
  sensor: SensorDescriptor | null,
  pose: CameraPoseInput | null,
): CameraSpatialModel {
  const intr = sensor?.calibration.intrinsics ?? null;
  const source = (sensor?.calibration.state ?? "none") as CalibrationSource;
  return {
    deviceId: device.id,
    name: device.name,
    latitude: num(pose?.latitude),
    longitude: num(pose?.longitude),
    elevationM: num(pose?.elevationM),
    headingDeg: num(pose?.headingDeg),
    pitchDeg: num(pose?.pitchDeg),
    rollDeg: num(pose?.rollDeg),
    hfovDeg: num(pose?.hfovDeg),
    vfovDeg: num(pose?.vfovDeg),
    imageWidth: sensor?.resolution?.width ?? intr?.width ?? null,
    imageHeight: sensor?.resolution?.height ?? intr?.height ?? null,
    intrinsics: intr ? { ...intr } : null,
    extrinsics: pose?.extrinsics ?? null,
    distortion: pose?.distortion ?? null,
    calibration: {
      source,
      state: source === "none" ? "uncalibrated" : source,
      atMs: sensor?.calibration.atMs ?? null,
      detail: sensor?.calibration.detail || "no calibration has been recorded for this camera",
    },
    crs: pose?.crs || "EPSG:4326 (WGS84 lon/lat) + local metres",
    timeSync: pose?.timeSync ?? { state: "local_clock_only", offsetMs: null, source: "this machine's clock" },
    measuredRangeM: num(pose?.measuredRangeM),
    modality: sensor?.modality ?? device.modality ?? null,
  };
}

const CONFIDENCE: Record<CalibrationSource, number | null> = {
  none: null,
  assumed: 0.3,
  factory: 0.6,
  operator: 0.75,
  verified: 0.9,
};

const M_PER_DEG_LAT = 111_320;

function offset(lat: number, lon: number, bearingDeg: number, distanceM: number): [number, number] {
  const rad = (bearingDeg * Math.PI) / 180;
  const dNorth = Math.cos(rad) * distanceM;
  const dEast = Math.sin(rad) * distanceM;
  const dLat = dNorth / M_PER_DEG_LAT;
  const dLon = dEast / (M_PER_DEG_LAT * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return [lon + dLon, lat + dLat];
}

/**
 * The wedge an operator may be shown. It is an ESTIMATE of visibility from the
 * entered pose, and the caveat travels with it in the returned object so no
 * caller can render the shape without the sentence.
 */
export function cameraFrustum(model: CameraSpatialModel): CameraFrustum {
  const base = { caveat: FRUSTUM_CAVEAT, confidence: CONFIDENCE[model.calibration.source] };
  const { latitude, longitude, headingDeg, hfovDeg } = model;

  if (latitude == null || longitude == null || headingDeg == null || hfovDeg == null) {
    const missing = [
      latitude == null || longitude == null ? "position" : null,
      headingDeg == null ? "heading" : null,
      hfovDeg == null ? "horizontal field of view" : null,
    ].filter(Boolean);
    return {
      ...base,
      state: "unavailable",
      reason: `no frustum can be drawn: ${missing.join(", ")} has not been measured or entered for this camera.`,
      geometry: null,
    };
  }

  const elevationM = model.elevationM ?? 0;
  const pitchDeg = model.pitchDeg ?? 0;
  const rangeM = model.measuredRangeM;
  const half = hfovDeg / 2;
  const footprint: Array<[number, number]> =
    rangeM == null
      ? []
      : [
          [longitude, latitude],
          ...Array.from({ length: 9 }, (_, i) =>
            offset(latitude, longitude, headingDeg - half + (hfovDeg * i) / 8, rangeM),
          ),
          [longitude, latitude],
        ];

  const geometry = {
    apex: { latitude, longitude, elevationM },
    headingDeg,
    pitchDeg,
    hfovDeg,
    vfovDeg: model.vfovDeg,
    rangeM,
    footprint,
  };

  const calibrated =
    model.calibration.source === "operator" ||
    model.calibration.source === "verified" ||
    model.calibration.source === "factory";

  if (!calibrated) {
    return {
      ...base,
      state: "approximate",
      reason:
        model.calibration.source === "assumed"
          ? "the pose values are assumed rather than measured, so the wedge shows orientation only and supports no metric claim."
          : "this camera is uncalibrated. the wedge is drawn from entered pose values and supports no metric claim.",
      geometry,
    };
  }
  if (rangeM == null) {
    return {
      ...base,
      state: "approximate",
      reason: "calibration exists but no usable range has been measured, so the wedge has direction but no extent.",
      geometry,
    };
  }
  return {
    ...base,
    state: "available",
    reason: `drawn from ${model.calibration.source} calibration, entered pose and a measured range of ${rangeM} m.`,
    geometry,
  };
}

/** Straight-line ground distance between two poses, or null when either is unknown. */
export function groundDistanceM(
  a: Pick<CameraSpatialModel, "latitude" | "longitude">,
  b: Pick<CameraSpatialModel, "latitude" | "longitude">,
): number | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const dLat = (b.latitude - a.latitude) * M_PER_DEG_LAT;
  const dLon =
    (b.longitude - a.longitude) * M_PER_DEG_LAT * Math.cos(((a.latitude + b.latitude) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLon);
}
