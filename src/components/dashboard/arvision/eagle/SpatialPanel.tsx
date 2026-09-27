// eagle.eye — SPATIAL workflow.
//
// The operator path is camera -> measured position or an honest refusal ->
// building -> zone -> evidence -> history. Every badge on this surface says
// which of the six spatial states produced the thing being looked at, so a map
// extrusion can never be mistaken for a survey and a colour frame can never be
// mistaken for depth.

import { useCallback, useMemo, useState } from "react";
import { Box, Compass, Layers, RefreshCw, Ruler } from "lucide-react";
import { useSensorRegistry } from "@/hooks/useSensorRegistry";
import { loadSite } from "@/lib/arvision/sensors/site";
import { cameraFrustum, cameraSpatialModel } from "@/lib/arvision/spatial3d/camera";
import { summarizePointCloud } from "@/lib/arvision/spatial3d/pointCloud";
import { emptyRegistrationEvidence, resolveRegistration } from "@/lib/arvision/spatial3d/registration";
import { assetSpatialState, loadAssets, ASSET_FORMAT_LABEL } from "@/lib/arvision/spatial3d/assets";
import { clearPose, loadPoses, savePose, type StoredPose } from "@/lib/arvision/spatial3d/poses";
import {
  buildSpatialMatrix, spatialCell, SPATIAL_CAPABILITY_LABEL, SPATIAL_STATE_LABEL,
  type SpatialCapabilityId, type SpatialCapabilityState,
} from "@/lib/arvision/spatial3d/capability";
import { REGISTRATION_LABEL, SPATIAL_3D_LABEL, SPATIAL_3D_MEANING } from "@/lib/arvision/spatial3d/types";

const STATE_STYLE: Record<SpatialCapabilityState, string> = {
  live: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200/90",
  derived: "border-sky-400/20 bg-sky-400/[0.07] text-sky-200/80",
  imported: "border-indigo-400/20 bg-indigo-400/[0.07] text-indigo-200/80",
  render_only: "border-white/12 bg-white/[0.04] text-white/55",
  requires_hardware: "border-amber-400/25 bg-amber-400/10 text-amber-200/85",
  requires_backend: "border-amber-400/20 bg-amber-400/[0.07] text-amber-200/75",
  unavailable: "border-white/10 bg-white/[0.02] text-white/40",
};

const ORDER: SpatialCapabilityId[] = [
  "scene_3d", "camera_calibration", "camera_frustum", "spatial_registration",
  "depth", "stereo", "lidar", "point_cloud",
  "building_model", "floor_plan", "cad_bim", "reconstruction_3d",
  "multi_camera_spatial", "historical_scene",
];

const numOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export default function SpatialPanel() {
  const { snapshot, services, world, discovering, discover, refreshServices } = useSensorRegistry("daylight_observation");
  const site = useMemo(() => loadSite(), []);
  const [poses, setPoses] = useState<Record<string, StoredPose>>(() => loadPoses());
  const [assets] = useState(() => loadAssets());
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const edgeConnected = snapshot.adapters.some((a) => a.id === "edge_bridge" && a.reachable);

  const devices = useMemo(() => {
    const rows = site.devices.map((d) => ({
      id: d.id,
      name: d.name,
      modality: d.modality,
      zoneId: d.zoneId,
      sensor: snapshot.sensors.find((s) => s.id === d.sourceRef) ?? snapshot.sensors.find((s) => s.id === d.id) ?? null,
    }));
    const known = new Set(rows.map((r) => r.sensor?.id).filter(Boolean));
    for (const s of snapshot.sensors) {
      if (known.has(s.id)) continue;
      rows.push({ id: s.id, name: `${s.label} — not in the site file`, modality: s.modality, zoneId: null, sensor: s });
    }
    return rows;
  }, [site.devices, snapshot.sensors]);

  const active = devices.find((d) => d.id === selected) ?? devices[0] ?? null;

  const cloud = useMemo(
    () =>
      summarizePointCloud(
        world.pointCount > 0 && world.extentM
          ? [] // the world model owns the points; its own figures are printed below.
          : [],
      ),
    [world.pointCount, world.extentM],
  );

  const model = useMemo(
    () => (active ? cameraSpatialModel({ id: active.id, name: active.name, modality: active.modality }, active.sensor, poses[active.id] ?? null) : null),
    [active, poses],
  );
  const frustum = useMemo(() => (model ? cameraFrustum(model) : null), [model]);

  const registration = useMemo(() => {
    const evidence = emptyRegistrationEvidence();
    evidence.floorPlanAsset = assets.some((a) => a.format === "floorplan_image" || a.format === "geojson");
    evidence.depthOrLidar = snapshot.sensors.some((s) => s.modality === "depth" || s.modality === "lidar");
    return resolveRegistration(evidence);
  }, [assets, snapshot.sensors]);

  const cells = useMemo(() => {
    if (!active || !model) return [];
    return buildSpatialMatrix({
      deviceId: active.id,
      model,
      sensor: active.sensor,
      allSensors: snapshot.sensors,
      services,
      edgeConnected,
      assets,
      registration: {
        ...emptyRegistrationEvidence(),
        floorPlanAsset: assets.some((a) => a.format === "floorplan_image" || a.format === "geojson"),
        depthOrLidar: snapshot.sensors.some((s) => s.modality === "depth" || s.modality === "lidar"),
      },
      pointCloud: cloud,
      buildingSource: assets.length > 0 ? "imported_asset" : "none",
      observationTimestampsMs: [],
      peer: devices.length > 1 ? { registered: false, timeSynchronised: false } : null,
    });
  }, [active, model, snapshot.sensors, services, edgeConnected, assets, cloud, devices.length]);

  const commitPose = useCallback(() => {
    if (!active) return;
    const pose: StoredPose = {
      latitude: numOrNull(draft.latitude ?? ""),
      longitude: numOrNull(draft.longitude ?? ""),
      elevationM: numOrNull(draft.elevationM ?? ""),
      headingDeg: numOrNull(draft.headingDeg ?? ""),
      pitchDeg: numOrNull(draft.pitchDeg ?? ""),
      hfovDeg: numOrNull(draft.hfovDeg ?? ""),
      measuredRangeM: numOrNull(draft.measuredRangeM ?? ""),
      measuredBy: "operator entry on this device",
      measuredAtMs: Date.now(),
    };
    setPoses(savePose(active.id, pose));
  }, [active, draft]);

  const sceneCell = cells.length ? spatialCell(cells, "scene_3d") : null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[13px] font-light text-white/85">
            <Box className="h-3.5 w-3.5" /> spatial
          </h2>
          <p className="text-[11px] font-light text-white/40">
            camera → measured position → building → zone → evidence → history. each badge says what produced the geometry.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void discover()}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-light text-white/70 transition hover:border-white/30 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${discovering ? "animate-spin" : ""}`} /> rediscover
          </button>
          <button
            type="button"
            onClick={() => void refreshServices()}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-light text-white/70 transition hover:border-white/30 hover:text-white"
          >
            <Layers className="h-3.5 w-3.5" /> recheck services
          </button>
        </div>
      </header>

      {devices.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/30 p-4 text-[12px] font-light text-white/50">
          no authorized camera or sensor is registered on this device, so there is no spatial state to report. nothing is
          simulated here.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {devices.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelected(d.id)}
                className={`rounded-full border px-3 py-1 text-[11px] font-light transition ${
                  active?.id === d.id
                    ? "border-white/30 bg-white/[0.08] text-white/90"
                    : "border-white/10 bg-white/[0.02] text-white/50 hover:text-white/80"
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>

          {sceneCell && (
            <div className="mb-3 rounded-xl border border-white/8 bg-black/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[9px] tracking-wide ${STATE_STYLE[sceneCell.state]}`}>
                  {SPATIAL_STATE_LABEL[sceneCell.state]}
                </span>
                <span className="text-[11px] text-white/70">{SPATIAL_3D_LABEL[sceneCell.produces]}</span>
              </div>
              <p className="mt-1 text-[11px] font-light leading-relaxed text-white/50">{sceneCell.reason}</p>
              <p className="mt-0.5 text-[11px] font-light leading-relaxed text-white/35">
                {SPATIAL_3D_MEANING[sceneCell.produces]}
              </p>
            </div>
          )}

          <ul className="mb-4 grid gap-1.5 sm:grid-cols-2">
            {ORDER.map((id) => {
              const c = cells.length ? spatialCell(cells, id) : null;
              if (!c) return null;
              return (
                <li key={id} className="rounded-xl border border-white/8 bg-black/25 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] font-light text-white/85">{SPATIAL_CAPABILITY_LABEL[id]}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] tracking-wide ${STATE_STYLE[c.state]}`}>
                      {SPATIAL_STATE_LABEL[c.state]}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-light leading-relaxed text-white/45">{c.reason}</p>
                </li>
              );
            })}
          </ul>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-light text-white/80">
                <Compass className="h-3.5 w-3.5" /> camera pose
              </h3>
              {model && (
                <p className="mb-2 text-[11px] font-light leading-relaxed text-white/45">
                  calibration {model.calibration.state} — {model.calibration.detail}. clock:{" "}
                  {model.timeSync.state.replace(/_/g, " ")} ({model.timeSync.source}). reference {model.crs}.
                </p>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  ["latitude", "latitude"],
                  ["longitude", "longitude"],
                  ["elevationM", "elevation m"],
                  ["headingDeg", "heading °"],
                  ["pitchDeg", "pitch °"],
                  ["hfovDeg", "h. field of view °"],
                  ["measuredRangeM", "measured range m"],
                ].map(([key, label]) => (
                  <label key={key} className="text-[10px] font-light text-white/40">
                    {label}
                    <input
                      value={draft[key] ?? ""}
                      onChange={(e) => setDraft((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={
                        model && model[key as keyof typeof model] != null
                          ? String(model[key as keyof typeof model])
                          : "unmeasured"
                      }
                      className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] font-light text-white/80 outline-none focus:border-white/25"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={commitPose}
                  className="rounded-full border border-white/20 bg-white/[0.05] px-3 py-1 text-[11px] font-light text-white/75 transition hover:border-white/35 hover:text-white"
                >
                  save measured pose
                </button>
                {active && poses[active.id] && (
                  <button
                    type="button"
                    onClick={() => setPoses(clearPose(active.id))}
                    className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-light text-white/45 transition hover:text-white/75"
                  >
                    clear
                  </button>
                )}
              </div>
              <p className="mt-2 text-[10px] font-light leading-relaxed text-white/30">
                left blank means unmeasured, and stays unmeasured. no value here is guessed from the picture.
              </p>
            </div>

            <div className="rounded-xl border border-white/8 bg-black/25 p-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-light text-white/80">
                <Ruler className="h-3.5 w-3.5" /> visibility, registration and assets
              </h3>
              {frustum && (
                <>
                  <p className="text-[11px] font-light leading-relaxed text-white/55">
                    frustum {frustum.state.replace(/_/g, " ")} — {frustum.reason}
                  </p>
                  {frustum.state !== "unavailable" && (
                    <p className="mt-1 text-[10px] font-light leading-relaxed text-white/35">{frustum.caveat}</p>
                  )}
                </>
              )}
              <p className="mt-2 text-[11px] font-light leading-relaxed text-white/55">
                registration {REGISTRATION_LABEL[registration.state]} — {registration.reasons.join("; ")}.
              </p>
              <p className="mt-0.5 text-[10px] font-light leading-relaxed text-white/35">next: {registration.nextAction}</p>

              <p className="mt-3 text-[11px] font-light text-white/60">imported site assets</p>
              {assets.length === 0 ? (
                <p className="mt-0.5 text-[11px] font-light leading-relaxed text-white/40">
                  none. floors, rooms and interior structure are therefore unknown — not empty. import a real glb, floor
                  plan, point cloud or ifc export to gain interior geometry.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {assets.map((a) => {
                    const s = assetSpatialState(a);
                    return (
                      <li key={a.id} className="rounded-lg border border-white/8 bg-black/30 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-light text-white/80">{ASSET_FORMAT_LABEL[a.format]}</span>
                          <span className="text-[9px] tracking-wide text-white/45">{SPATIAL_3D_LABEL[s.state]}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] font-light leading-relaxed text-white/40">{s.note}</p>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="mt-3 text-[11px] font-light leading-relaxed text-white/45">
                point cloud: {world.pointCount > 0
                  ? `${world.pointCount} points from ${world.sourceSensorIds.join(", ") || "a ranging stream"}.`
                  : cloud.reason}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
