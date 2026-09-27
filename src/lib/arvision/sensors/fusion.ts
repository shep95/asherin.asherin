// asherin.arvision — fusion pipeline semantics.
//
//   scene -> physical streams -> calibration -> spatial registration ->
//   temporal synchronization -> sensor quality -> multimodal fusion ->
//   scene understanding -> shepherd perception
//
// Each stage reports its own real state. A stage cannot be "ready" because the
// one before it was; it is ready when the inputs it needs actually exist. Auto
// select picks from sensors that are genuinely present and prints the reason.

import type { SensorDescriptor, SensorModality, ServiceHealth } from "./types";
import { MODALITY_LABEL } from "./types";

export type FusionStageId =
  | "streams"
  | "calibration"
  | "registration"
  | "synchronization"
  | "quality"
  | "fusion"
  | "understanding"
  | "perception";

export type StageState = "ready" | "partial" | "blocked";

export interface FusionStage {
  id: FusionStageId;
  label: string;
  state: StageState;
  detail: string;
}

export type FusionTask =
  | "daylight_observation"
  | "darkness_observation"
  | "obscured_visibility"
  | "heat_investigation"
  | "reconstruction"
  | "ambiguous";

export const FUSION_TASKS: Array<{ id: FusionTask; label: string; note: string }> = [
  { id: "daylight_observation", label: "daylight observation", note: "prefers visible light with depth when a ranging sensor exists" },
  { id: "darkness_observation", label: "darkness", note: "prefers low light, near infrared or thermal where present" },
  { id: "obscured_visibility", label: "smoke or visual obstruction", note: "prefers thermal with a ranging sensor" },
  { id: "heat_investigation", label: "heat investigation", note: "requires a radiometric thermal stream" },
  { id: "reconstruction", label: "3d reconstruction", note: "visible light with stereo, time of flight or lidar" },
  { id: "ambiguous", label: "ambiguous observation", note: "asks for a second available modality for corroboration" },
];

const PREFERENCE: Record<FusionTask, SensorModality[]> = {
  daylight_observation: ["rgb", "depth", "lidar"],
  darkness_observation: ["lowlight", "nir", "lwir", "thermal_radiometric", "rgb"],
  obscured_visibility: ["lwir", "thermal_radiometric", "lidar", "depth"],
  heat_investigation: ["thermal_radiometric"],
  reconstruction: ["rgb", "depth", "lidar"],
  ambiguous: ["rgb", "lwir", "depth", "nir", "audio"],
};

export interface SensorSelection {
  task: FusionTask;
  selected: SensorDescriptor[];
  /** wanted modalities that no connected hardware provides. */
  unmet: SensorModality[];
  /** printed verbatim under the selection. */
  explanation: string;
}

function usable(s: SensorDescriptor) {
  return s.health === "live" || s.health === "opening";
}

export function autoSelect(task: FusionTask, sensors: SensorDescriptor[]): SensorSelection {
  const wanted = PREFERENCE[task];
  const live = sensors.filter(usable);
  const selected: SensorDescriptor[] = [];
  const unmet: SensorModality[] = [];

  for (const modality of wanted) {
    const match = live.find((s) => s.modality === modality);
    if (match) selected.push(match);
    else unmet.push(modality);
  }

  const chosen = selected.length
    ? `selected ${selected.map((s) => `${MODALITY_LABEL[s.modality]} (${s.label})`).join(", ")}`
    : "nothing was selected because no stream for this task is live";
  const gap = unmet.length
    ? ` — no ${unmet.map((m) => MODALITY_LABEL[m]).join(", ")} stream is connected, so that part of the task is not covered`
    : "";

  return { task, selected, unmet, explanation: `${chosen}${gap}.` };
}

export function fusionStages(params: {
  sensors: SensorDescriptor[];
  services: ServiceHealth[];
  pointCount: number;
}): FusionStage[] {
  const live = params.sensors.filter(usable);
  const calibrated = live.filter((s) => s.calibration.state !== "none");
  const stamped = live.filter((s) => s.lastSampleMs !== null);
  const measured = live.filter((s) => s.quality.cadence !== null || s.quality.signal !== null);
  const inference = params.services.find((s) => s.id === "inference");
  const prediction = params.services.find((s) => s.id === "prediction");

  const stage = (id: FusionStageId, label: string, state: StageState, detail: string): FusionStage => ({
    id, label, state, detail,
  });

  return [
    stage(
      "streams",
      "physical streams",
      live.length ? "ready" : "blocked",
      live.length ? `${live.length} live stream${live.length === 1 ? "" : "s"}` : "no stream is live",
    ),
    stage(
      "calibration",
      "calibration",
      calibrated.length === 0 ? "blocked" : calibrated.length < live.length ? "partial" : "ready",
      calibrated.length ? `${calibrated.length} of ${live.length} streams carry a calibration` : "no connected stream is calibrated, so no measurement is derived",
    ),
    stage(
      "registration",
      "spatial registration",
      live.length > 1 && calibrated.length > 1 ? "partial" : "blocked",
      live.length > 1
        ? "extrinsics between streams must come from the edge node; none has been received"
        : "registration needs at least two calibrated streams",
    ),
    stage(
      "synchronization",
      "temporal synchronization",
      stamped.length === live.length && live.length > 0 ? "ready" : stamped.length ? "partial" : "blocked",
      stamped.length ? `${stamped.length} stream${stamped.length === 1 ? "" : "s"} carry sample timestamps` : "no stream is delivering timestamped samples",
    ),
    stage(
      "quality",
      "sensor quality",
      measured.length ? "ready" : "partial",
      measured.length ? "quality is measured from delivered frames" : "quality stays unavailable until frames are measured",
    ),
    stage(
      "fusion",
      "multimodal fusion",
      live.length > 1 && calibrated.length > 1 ? "partial" : "blocked",
      "fusion across modalities requires registered, synchronised, calibrated streams",
    ),
    stage(
      "understanding",
      "scene understanding",
      inference?.online ? "ready" : "blocked",
      inference?.online ? "an inference service is answering" : "no inference service is reachable, so detections are unavailable rather than guessed",
    ),
    stage(
      "perception",
      "shepherd perception",
      prediction?.online ? "ready" : "blocked",
      prediction?.online ? "the predictive service is answering" : "no predictive service is reachable, so no risk figure is produced",
    ),
  ];
}
