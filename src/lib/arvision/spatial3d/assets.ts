// asherin.eye — authorized site 3d asset registry.
//
// An operator may supply real geometry: a GLB of the building, an OBJ scan, a
// point cloud, a floor plan image, an IFC/BIM export. Those become IMPORTED 3D
// and are as good as the file and its alignment — which is why every entry
// records who supplied it, in what coordinate system, and whether anyone has
// checked it against the real place.
//
// Nothing here fabricates interior geometry. `declares` counts only what the
// file itself declares; an unread field stays null.

import type { AssetFormat, RegistrationState, SiteAsset, Spatial3DState } from "./types";

const KEY = "asherin.arvision.site.assets.v1";

export const ASSET_FORMAT_LABEL: Record<AssetFormat, string> = {
  glb: "GLB model",
  gltf: "glTF model",
  obj: "OBJ mesh",
  ply: "PLY point cloud / mesh",
  las: "LAS point cloud",
  laz: "LAZ point cloud",
  floorplan_image: "floor plan image",
  geojson: "GeoJSON footprint",
  ifc: "IFC / BIM export",
  dxf: "DXF / CAD drawing",
};

/** Where a piece of building geometry came from. Drives the badge, verbatim. */
export type BuildingGeometrySource = "osm" | "imported_asset" | "photogrammetry" | "schematic" | "none";

export function buildingGeometryState(source: BuildingGeometrySource): {
  state: Spatial3DState;
  note: string;
} {
  switch (source) {
    case "osm":
      return {
        state: "map_derived_3d",
        note: "extruded from a public OpenStreetMap footprint and its tagged height. it is not a survey, it has no interior, and the height may be absent or wrong.",
      };
    case "imported_asset":
      return { state: "imported_3d", note: "an operator supplied asset, aligned to the site by an operator." };
    case "photogrammetry":
      return { state: "reconstructed_3d", note: "computed from real captured observations. accuracy follows the capture, not the render." };
    case "schematic":
      return { state: "schematic_3d", note: "a drawing for orientation. nothing in it is a measurement." };
    default:
      return { state: "unavailable", note: "no building geometry is available for this place." };
  }
}

const POINT_FORMATS: AssetFormat[] = ["ply", "las", "laz"];

/** The 3d state one registered asset earns. Alignment is part of the claim. */
export function assetSpatialState(asset: SiteAsset): { state: Spatial3DState; note: string } {
  if (POINT_FORMATS.includes(asset.format) && asset.verification === "surveyed") {
    return { state: "reconstructed_3d", note: "a surveyed capture of the real place." };
  }
  if (!asset.origin || asset.registration === "not_registered") {
    return {
      state: "imported_3d",
      note: "IMPORTED 3D, NOT REGISTERED — the file exists but has not been aligned to the site, so nothing in it may be read as a site coordinate.",
    };
  }
  return {
    state: "imported_3d",
    note: `IMPORTED 3D — ${asset.registration} alignment in ${asset.coordinateSystem}, supplied by ${asset.uploadedBy || "an unnamed operator"}.`,
  };
}

/** Interior features an asset genuinely declares, printed as unknown otherwise. */
export function declaredFeatures(asset: SiteAsset): Array<{ label: string; value: string }> {
  const d = asset.declares;
  const row = (label: string, v: number | null) => ({ label, value: v == null ? "not declared by the file" : String(v) });
  return [
    row("floors", d.floors),
    row("rooms", d.rooms),
    row("doors", d.doors),
    row("windows", d.windows),
    row("stairs", d.stairs),
    row("elevators", d.elevators),
    row("restricted areas", d.restrictedAreas),
    row("camera positions", d.cameraPositions),
  ];
}

export function emptyDeclares(): SiteAsset["declares"] {
  return {
    floors: null, rooms: null, doors: null, windows: null,
    stairs: null, elevators: null, restrictedAreas: null, cameraPositions: null,
  };
}

export function makeAsset(input: {
  siteId: string;
  format: AssetFormat;
  source: string;
  uploadedBy: string;
  building?: string | null;
  coordinateSystem?: string;
  registration?: RegistrationState;
}): SiteAsset {
  return {
    id: `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    siteId: input.siteId,
    building: input.building ?? null,
    source: input.source,
    format: input.format,
    uploadedBy: input.uploadedBy,
    createdAtMs: Date.now(),
    coordinateSystem: input.coordinateSystem || "file local metres",
    scale: 1,
    rotationDeg: [0, 0, 0],
    origin: null,
    registration: input.registration ?? "not_registered",
    verification: "unverified",
    declares: emptyDeclares(),
    note: "",
  };
}

function isAsset(v: unknown): v is SiteAsset {
  const a = v as Partial<SiteAsset>;
  return !!a && typeof a.id === "string" && typeof a.siteId === "string" && typeof a.format === "string";
}

export function loadAssets(): SiteAsset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAsset) : [];
  } catch {
    return [];
  }
}

export function saveAssets(assets: SiteAsset[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(assets));
  } catch {
    /* storage full or blocked: the registry stays in memory for this session. */
  }
}
