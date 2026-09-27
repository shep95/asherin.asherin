// asherin.eye — spatial capability matrix.
//
// Extends the existing per-device capability truth model rather than bypassing
// it: the same "a capability is never a boolean" rule, applied to the 3d
// claims. Each cell is computed from the sensor registry, the operator's own
// site assets, the registration evidence and the probed services.

import type { SensorDescriptor, ServiceHealth } from "../sensors/types";
import type { EvidenceClass } from "../integrations/types";
import { cameraFrustum } from "./camera";
import { depthAvailability, lidarAvailability } from "./depth";
import { historicalScene } from "./history";
import { resolveRegistration } from "./registration";
import { assetSpatialState, buildingGeometryState, type BuildingGeometrySource } from "./assets";
import type {
  CameraSpatialModel, PointCloudSummary, RegistrationEvidence, SiteAsset, Spatial3DState,
} from "./types";
import { SPATIAL_3D_LABEL } from "./types";

export type SpatialCapabilityId =
  | "scene_3d" | "camera_calibration" | "camera_frustum" | "depth" | "stereo" | "lidar"
  | "point_cloud" | "spatial_registration" | "building_model" | "floor_plan" | "cad_bim"
  | "reconstruction_3d" | "multi_camera_spatial" | "historical_scene";

export const SPATIAL_CAPABILITY_LABEL: Record<SpatialCapabilityId, string> = {
  scene_3d: "3d scene",
  camera_calibration: "camera calibration",
  camera_frustum: "camera frustum",
  depth: "depth",
  stereo: "stereo",
  lidar: "lidar",
  point_cloud: "point cloud",
  spatial_registration: "spatial registration",
  building_model: "building model",
  floor_plan: "floor plan",
  cad_bim: "cad / bim",
  reconstruction_3d: "3d reconstruction",
  multi_camera_spatial: "multi-camera spatial correlation",
  historical_scene: "historical scene reconstruction",
};

/**
 * Seven states. `derived`, `imported` and `render_only` exist because a single
 * "available" would let map extrusion and a lidar measurement wear the same
 * badge.
 */
export type SpatialCapabilityState =
  | "live" | "derived" | "imported" | "render_only"
  | "requires_hardware" | "requires_backend" | "unavailable";

export const SPATIAL_STATE_LABEL: Record<SpatialCapabilityState, string> = {
  live: "LIVE",
  derived: "DERIVED",
  imported: "IMPORTED",
  render_only: "RENDER ONLY",
  requires_hardware: "REQUIRES HARDWARE",
  requires_backend: "REQUIRES BACKEND",
  unavailable: "UNAVAILABLE",
};

export interface SpatialCapabilityCell {
  capability: SpatialCapabilityId;
  state: SpatialCapabilityState;
  reason: string;
  evidence: EvidenceClass;
  /** the 3d state this capability, if used, would produce. */
  produces: Spatial3DState;
}

export interface SpatialMatrixInput {
  deviceId: string;
  model: CameraSpatialModel;
  sensor: SensorDescriptor | null;
  allSensors: SensorDescriptor[];
  services: ServiceHealth[];
  edgeConnected: boolean;
  assets: SiteAsset[];
  registration: RegistrationEvidence;
  pointCloud: PointCloudSummary;
  buildingSource: BuildingGeometrySource;
  /** stored observation timestamps for this device, from the real store. */
  observationTimestampsMs: number[];
  /** true only when a second camera is registered AND time synchronised. */
  peer: { registered: boolean; timeSynchronised: boolean } | null;
}

const cell = (
  capability: SpatialCapabilityId,
  state: SpatialCapabilityState,
  reason: string,
  produces: Spatial3DState,
  evidence: EvidenceClass = "observed",
): SpatialCapabilityCell => ({ capability, state, reason, evidence, produces });

export function buildSpatialMatrix(input: SpatialMatrixInput): SpatialCapabilityCell[] {
  const cells: SpatialCapabilityCell[] = [];
  const recording = input.services.find((s) => s.id === "recording");
  const depth = depthAvailability({ sensor: input.sensor, all: input.allSensors, edgeConnected: input.edgeConnected });
  const lidar = lidarAvailability({ sensor: input.sensor, all: input.allSensors, edgeConnected: input.edgeConnected });
  const frustum = cameraFrustum(input.model);
  const registration = resolveRegistration(input.registration);
  const building = buildingGeometryState(input.buildingSource);

  // depth ------------------------------------------------------------------
  cells.push(
    cell(
      "depth",
      depth.state === "available" ? "live" : depth.state === "requires_edge" ? "requires_hardware" : "unavailable",
      depth.reason,
      depth.state === "available" ? "real_sensor_3d" : "unavailable",
    ),
  );
  const stereoPair = input.allSensors.filter((s) => s.modality === "depth" && s.provenance.adapter.includes("stereo"));
  cells.push(
    cell(
      "stereo",
      stereoPair.length > 0 ? "live" : "requires_hardware",
      stereoPair.length > 0
        ? "a stereo adapter is publishing a depth stream"
        : "a stereo depth pair needs two synchronised calibrated cameras on an edge node running OpenCV. no such pair is registered.",
      stereoPair.length > 0 ? "real_sensor_3d" : "unavailable",
    ),
  );
  cells.push(
    cell(
      "lidar",
      lidar.state === "available" ? "live" : lidar.state === "requires_edge" ? "requires_hardware" : "unavailable",
      lidar.reason,
      lidar.state === "available" ? "real_sensor_3d" : "unavailable",
    ),
  );

  // point cloud ------------------------------------------------------------
  cells.push(
    cell(
      "point_cloud",
      input.pointCloud.available ? "live" : lidar.state === "available" || depth.state === "available" ? "unavailable" : "requires_hardware",
      input.pointCloud.reason,
      input.pointCloud.available ? "real_sensor_3d" : "unavailable",
    ),
  );

  // calibration / frustum ---------------------------------------------------
  const calSource = input.model.calibration.source;
  cells.push(
    cell(
      "camera_calibration",
      calSource === "verified" || calSource === "operator" || calSource === "factory" ? "live"
        : calSource === "assumed" ? "render_only" : "unavailable",
      input.model.calibration.detail,
      "unavailable",
      calSource === "none" ? "unavailable" : "observed",
    ),
  );
  cells.push(
    cell(
      "camera_frustum",
      frustum.state === "available" ? "derived" : frustum.state === "approximate" ? "render_only" : "unavailable",
      frustum.reason,
      frustum.state === "unavailable" ? "unavailable" : "schematic_3d",
      frustum.state === "available" ? "inferred" : "unknown",
    ),
  );

  // registration ------------------------------------------------------------
  cells.push(
    cell(
      "spatial_registration",
      registration.state === "verified" || registration.state === "calibrated" ? "derived"
        : registration.state === "approximate" ? "render_only" : "unavailable",
      `${registration.state.replace(/_/g, " ")} — ${registration.reasons.join("; ")}. next: ${registration.nextAction}`,
      "unavailable",
      registration.state === "not_registered" ? "unknown" : "inferred",
    ),
  );

  // imported geometry --------------------------------------------------------
  const byFormat = (fmts: string[]) => input.assets.filter((a) => fmts.includes(a.format));
  const models = byFormat(["glb", "gltf", "obj", "ply"]);
  const plans = byFormat(["floorplan_image", "geojson"]);
  const cad = byFormat(["ifc", "dxf"]);

  cells.push(
    models.length > 0
      ? cell("building_model", "imported", `${models.length} operator-supplied model(s): ${assetSpatialState(models[0]).note}`, "imported_3d")
      : cell(
          "building_model",
          input.buildingSource === "osm" ? "derived" : "unavailable",
          input.buildingSource === "osm"
            ? `${SPATIAL_3D_LABEL.map_derived_3d} — ${building.note}`
            : "no building model has been imported and no public footprint is in use for this place.",
          building.state,
          input.buildingSource === "osm" ? "inferred" : "unavailable",
        ),
  );
  cells.push(
    plans.length > 0
      ? cell("floor_plan", "imported", `${plans.length} imported floor plan asset(s).`, "imported_3d")
      : cell("floor_plan", "unavailable", "no floor plan has been imported. floors and rooms are therefore unknown, not empty.", "unavailable", "unavailable"),
  );
  cells.push(
    cad.length > 0
      ? cell("cad_bim", "imported", `${cad.length} imported CAD / BIM asset(s).`, "imported_3d")
      : cell("cad_bim", "unavailable", "no CAD or BIM export has been imported.", "unavailable", "unavailable"),
  );

  // reconstruction -----------------------------------------------------------
  const reconstructed = input.assets.some((a) => assetSpatialState(a).state === "reconstructed_3d");
  cells.push(
    reconstructed
      ? cell("reconstruction_3d", "imported", "a surveyed capture of this place has been imported.", "reconstructed_3d")
      : input.pointCloud.available
        ? cell("reconstruction_3d", "derived", "geometry can be computed from the arriving points on an edge node running Open3D.", "reconstructed_3d", "inferred")
        : cell("reconstruction_3d", "requires_hardware", "reconstruction needs ranging observations. none are arriving, and colour frames cannot substitute.", "unavailable", "unavailable"),
  );

  // scene --------------------------------------------------------------------
  const sceneState: SpatialCapabilityState = input.pointCloud.available
    ? "live"
    : models.length > 0 || plans.length > 0 || cad.length > 0
      ? "imported"
      : input.buildingSource === "osm"
        ? "derived"
        : frustum.state !== "unavailable"
          ? "render_only"
          : "unavailable";
  cells.push(
    cell(
      "scene_3d",
      sceneState,
      sceneState === "live" ? "real ranging points back the scene."
        : sceneState === "imported" ? "the scene is built from operator-supplied assets."
          : sceneState === "derived" ? "the scene is public map geometry, extruded. it has no interior and is not a survey."
            : sceneState === "render_only" ? "the scene draws camera pose and zones only. nothing in it is measured structure."
              : "no geometry of any kind is available for this place.",
      sceneState === "live" ? "real_sensor_3d"
        : sceneState === "imported" ? "imported_3d"
          : sceneState === "derived" ? "map_derived_3d"
            : sceneState === "render_only" ? "schematic_3d" : "unavailable",
      sceneState === "live" ? "observed" : sceneState === "unavailable" ? "unavailable" : "inferred",
    ),
  );

  // multi-camera --------------------------------------------------------------
  const peerOk = Boolean(input.peer?.registered && input.peer.timeSynchronised);
  cells.push(
    cell(
      "multi_camera_spatial",
      peerOk ? "derived" : "unavailable",
      peerOk
        ? "another camera is registered to the same frame and synchronised, so a continuation may be offered as a POSSIBLE MATCH — never as an identity."
        : !input.peer
          ? "no second camera is registered to this site frame, so nothing can be correlated across cameras."
          : !input.peer.registered
            ? "the second camera is not registered to this site frame, so no distance between their tracks exists."
            : "the two cameras are not synchronised to a common clock, so the order of their observations is UNCERTAIN and no continuation is confirmed.",
      "unavailable",
      peerOk ? "inferred" : "unavailable",
    ),
  );

  // history --------------------------------------------------------------------
  const history = historicalScene({
    storage: recording
      ? { configured: recording.configured, online: recording.online, detail: recording.detail }
      : { configured: false, online: false, detail: "no recording service is configured" },
    observationTimestampsMs: input.observationTimestampsMs,
  });
  cells.push(
    cell(
      "historical_scene",
      history.available ? "derived" : recording?.configured ? "requires_backend" : "requires_backend",
      history.reason,
      history.available ? "reconstructed_3d" : "unavailable",
      history.available ? "observed" : "unavailable",
    ),
  );

  return cells;
}

export function spatialCell(cells: SpatialCapabilityCell[], id: SpatialCapabilityId): SpatialCapabilityCell {
  return (
    cells.find((c) => c.capability === id) ??
    cell(id, "unavailable", "this capability was not evaluated for this device.", "unavailable", "unknown")
  );
}
