// asherin.arvision — camera intrinsics
// ported from Services/LocalizationConfig.swift. The calibrated numbers are the
// package's measured Ray-Ban values; everything else is derived from a field of
// view, which is what the package does when a lens is not calibrated.

export interface CameraIntrinsics {
  fx: number;
  fy: number;
  px: number;
  py: number;
  width: number;
  height: number;
  label: string;
}

/** Calibrated wearable capture, full frame, from the uploaded package. */
export const CALIBRATED_FULL: CameraIntrinsics = {
  fx: 844.5,
  fy: 845.8,
  px: 540.7,
  py: 727.5,
  width: 1080,
  height: 1440,
  label: "calibrated wearable 1080x1440",
};

export const CALIBRATED_HALF: CameraIntrinsics = {
  fx: 422.25,
  fy: 422.9,
  px: 270.35,
  py: 363.75,
  width: 540,
  height: 720,
  label: "calibrated wearable 540x720",
};

/** Focal length in pixels for a horizontal field of view, in degrees. */
export function focalFromFov(fovDegrees: number, width: number): number {
  const fov = Math.min(Math.max(fovDegrees, 10), 170);
  return width / 2 / Math.tan((fov * Math.PI) / 360);
}

/**
 * Intrinsics for an uncalibrated device camera. Presets mirror the package's
 * wide / moderate / default / narrow options.
 */
export function intrinsicsForFov(width: number, height: number, fovDegrees: number, label: string): CameraIntrinsics {
  const fx = focalFromFov(fovDegrees, width);
  return { fx, fy: fx, px: width / 2, py: height / 2, width, height, label };
}

export const FOV_PRESETS: { id: string; label: string; fov: number }[] = [
  { id: "wide100", label: "ultra wide 100deg", fov: 100 },
  { id: "wide90", label: "wide 90deg", fov: 90 },
  { id: "moderate80", label: "moderate 80deg", fov: 80 },
  { id: "moderate70", label: "moderate 70deg", fov: 70 },
  { id: "default64", label: "standard 64deg", fov: 64 },
  { id: "narrow56", label: "narrow 56deg", fov: 56 },
];
