// asherin.arvision — camera modes bound to real capability.
//
// A mode is a claim about physics. "thermal" claims the pixels came from an
// infrared band. "temperature" claims a calibrated radiometric array. "depth"
// claims something measured range. Each mode below names the modalities that
// can honestly satisfy it; when none of them is present the mode is disabled
// and the room says which stream is missing rather than rendering a palette
// and calling it a sensor.

import type { SensorDescriptor, SensorModality } from "./types";
import { MODALITY_LABEL } from "./types";

export type CameraMode =
  | "natural"
  | "night"
  | "thermal"
  | "temperature"
  | "depth"
  | "spectral"
  | "swir"
  | "polarization"
  | "event";

export interface ModeSpec {
  id: CameraMode;
  label: string;
  /** any one of these modalities satisfies the mode. */
  requires: SensorModality[];
  /** calibration floor — temperature needs more than a live stream. */
  needsCalibration: boolean;
  description: string;
}

export const CAMERA_MODES: ModeSpec[] = [
  {
    id: "natural",
    label: "natural",
    requires: ["rgb"],
    needsCalibration: false,
    description: "visible light exactly as the sensor captured it",
  },
  {
    id: "night",
    label: "night",
    requires: ["lowlight", "nir"],
    needsCalibration: false,
    description: "a genuine low light or near infrared stream from the connected hardware",
  },
  {
    id: "thermal",
    label: "thermal",
    requires: ["lwir", "thermal_radiometric"],
    needsCalibration: false,
    description: "a long wave infrared stream — heat, not a colour ramp over visible pixels",
  },
  {
    id: "temperature",
    label: "temperature",
    requires: ["thermal_radiometric"],
    needsCalibration: true,
    description: "per pixel temperature from a radiometric thermal stream with a calibration",
  },
  {
    id: "depth",
    label: "depth",
    requires: ["depth", "lidar"],
    needsCalibration: false,
    description: "measured range from stereo, time of flight or lidar",
  },
  {
    id: "spectral",
    label: "spectral",
    requires: ["hyperspectral"],
    needsCalibration: false,
    description: "a multispectral or hyperspectral cube with named bands",
  },
  {
    id: "swir",
    label: "swir",
    requires: ["swir"],
    needsCalibration: false,
    description: "short wave infrared imaging",
  },
  {
    id: "polarization",
    label: "polarization",
    requires: ["polarization"],
    needsCalibration: false,
    description: "a polarization camera's angle or degree of polarization channel",
  },
  {
    id: "event",
    label: "event",
    requires: ["event"],
    needsCalibration: false,
    description: "an event camera's asynchronous brightness change stream",
  },
];

export interface ModeAvailability {
  mode: ModeSpec;
  enabled: boolean;
  /** sensor chosen to serve the mode, when one qualifies. */
  sensorId: string | null;
  /** printed verbatim when disabled. */
  reason: string;
}

function isUsable(s: SensorDescriptor): boolean {
  return s.health === "live" || s.health === "opening";
}

export function evaluateModes(sensors: SensorDescriptor[]): ModeAvailability[] {
  return CAMERA_MODES.map((mode) => {
    const candidates = sensors.filter((s) => mode.requires.includes(s.modality));
    const live = candidates.filter(isUsable);

    if (live.length === 0) {
      const names = mode.requires.map((m) => MODALITY_LABEL[m]).join(" or ");
      return {
        mode,
        enabled: false,
        sensorId: null,
        reason: candidates.length
          ? `the ${names} stream is connected but not live`
          : `the connected camera does not support this mode — it needs a ${names} stream`,
      };
    }

    if (mode.needsCalibration) {
      const calibrated = live.find((s) => s.calibration.state !== "none" && s.calibration.state !== "assumed");
      if (!calibrated) {
        return {
          mode,
          enabled: false,
          sensorId: null,
          reason: "the radiometric stream is live but uncalibrated — temperatures stay unavailable until a calibration is applied",
        };
      }
      return { mode, enabled: true, sensorId: calibrated.id, reason: "" };
    }

    return { mode, enabled: true, sensorId: live[0].id, reason: "" };
  });
}

export function modeById(id: CameraMode): ModeSpec {
  const found = CAMERA_MODES.find((m) => m.id === id);
  if (!found) throw new Error(`unknown camera mode ${id}`);
  return found;
}
