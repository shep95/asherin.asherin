// asherin.arvision — which building am i standing in, and where inside it.
//
// A position fix on its own is two numbers. What an operator actually asks is
// "which building is this, how big is it, what floor am i on, is this above or
// below ground". OpenStreetMap already carries most of that: building outlines
// with level counts, indoor room and corridor polygons with their own level
// tags, entrances, and underground markers. This resolves a fix against those.
//
// Honesty rules held here, because the whole answer is worthless without them:
//   · a footprint that does not contain the fix is reported as "nearest", with
//     the gap in metres, never promoted to "you are inside it";
//   · the horizontal fix has a stated accuracy, so a small building can be a
//     coin toss — the confidence field says so instead of hiding it;
//   · no browser sensor reports which storey a person is on. The floor is what
//     the operator selects, defaulting to the ground level of the building, and
//     the room read is filtered to that level. Nothing here guesses a storey
//     from altitude, which over a few metres is noise.

import { geoToLocal, type GeoAnchor } from "./geo";
import { overpassFetch, type OverpassElement, type OverpassGeom } from "./overpass";
import type { Vec3 } from "./types";

export interface Ring {
  /** Local metres from the anchor: +x east, +z north. */
  points: Vec3[];
}

export type Containment = "inside" | "nearest";

export interface IndoorSpace {
  id: number;
  name: string;
  /** indoor=room | corridor | area | wall … as tagged. */
  kind: string;
  /** Levels this space occupies, e.g. [0] or [-1, -2]. Empty when untagged. */
  levels: number[];
  areaM2: number;
  ring: Ring;
  contains: boolean;
  /** Metres from the fix to the polygon, 0 when inside. */
  distanceM: number;
}

export interface LevelInfo {
  /** OSM level number: 0 is ground, negatives are below ground. */
  level: number;
  label: string;
  underground: boolean;
}

export interface BuildingFix {
  osmId: string;
  name: string | null;
  /** building=* value, e.g. apartments, retail, yes. */
  kind: string;
  address: string | null;
  operatorName: string | null;
  containment: Containment;
  /** Metres from the fix to the outline, 0 when the fix falls inside it. */
  distanceM: number;
  areaM2: number;
  perimeterM: number;
  /** Longest and shortest side of the minimum-ish bounding box, metres. */
  extentM: { long: number; short: number };
  ring: Ring;
  levelsAbove: number | null;
  levelsBelow: number | null;
  roofLevels: number | null;
  heightM: number | null;
  /** Every level we can name, ordered top to bottom. */
  levels: LevelInfo[];
  /** True when the whole structure is tagged as sitting below ground. */
  structureUnderground: boolean;
  entrances: Vec3[];
  rooms: IndoorSpace[];
  /** How much the fix accuracy lets us trust the containment call. */
  confidence: "firm" | "likely" | "loose";
}

export interface BuildingLookup {
  anchor: GeoAnchor;
  building: BuildingFix | null;
  /** Other outlines nearby, so the plan view can draw context. */
  neighbours: { ring: Ring; name: string | null }[];
  message: string;
}

const M2_TO_FT2 = 10.763910417;

export const squareFeet = (m2: number) => m2 * M2_TO_FT2;
export const feet = (m: number) => m * 3.280839895;

/** Shoelace area of a ring in square metres. Sign discarded. */
export function ringArea(ring: Ring): number {
  const p = ring.points;
  if (p.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i, i += 1) {
    sum += (p[j].x + p[i].x) * (p[j].z - p[i].z);
  }
  return Math.abs(sum) / 2;
}

export function ringPerimeter(ring: Ring): number {
  const p = ring.points;
  let sum = 0;
  for (let i = 1; i < p.length; i += 1) sum += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
  return sum;
}

/** Ray casting. Points on the boundary count as inside, which is what a fix at a wall means. */
export function pointInRing(point: Vec3, ring: Ring): boolean {
  const p = ring.points;
  if (p.length < 3) return false;
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i, i += 1) {
    const zi = p[i].z;
    const zj = p[j].z;
    if (zi === zj) continue;
    const straddles = zi > point.z !== zj > point.z;
    if (!straddles) continue;
    const xAt = p[i].x + ((point.z - zi) / (zj - zi)) * (p[j].x - p[i].x);
    if (point.x < xAt) inside = !inside;
  }
  return inside;
}

/** Shortest distance from a point to the ring outline, metres. */
export function distanceToRing(point: Vec3, ring: Ring): number {
  const p = ring.points;
  if (p.length < 2) return Number.POSITIVE_INFINITY;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < p.length; i += 1) {
    const a = p[i - 1];
    const b = p[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lenSq));
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t)));
  }
  return best;
}

function extentOf(ring: Ring): { long: number; short: number } {
  // Rotating callipers on 24 orientations: close enough for a footprint read and
  // far more honest than an axis-aligned box on a building that is not square.
  let best = { long: 0, short: Number.POSITIVE_INFINITY, area: Number.POSITIVE_INFINITY };
  for (let step = 0; step < 24; step += 1) {
    const a = (step * Math.PI) / 48;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const p of ring.points) {
      const u = p.x * cos + p.z * sin;
      const v = -p.x * sin + p.z * cos;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const w = maxU - minU;
    const h = maxV - minV;
    const area = w * h;
    if (area < best.area) best = { long: Math.max(w, h), short: Math.min(w, h), area };
  }
  return { long: best.long, short: Number.isFinite(best.short) ? best.short : 0 };
}

function toRing(anchor: GeoAnchor, geometry: OverpassGeom[]): Ring | null {
  const points = geometry
    .filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lon))
    .map((g) => geoToLocal(anchor, g.lat, g.lon));
  if (points.length < 3) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(first.x - last.x, first.z - last.z) > 0.01) points.push({ ...first });
  return { points };
}

function num(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** "0", "-1", "1;2", "0-3" all appear in the wild. */
function parseLevels(value: string | undefined): number[] {
  if (!value) return [];
  const out = new Set<number>();
  for (const part of value.split(";")) {
    const range = part.trim().match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
    if (range) {
      const from = Math.round(Number(range[1]));
      const to = Math.round(Number(range[2]));
      for (let l = Math.min(from, to); l <= Math.max(from, to); l += 1) out.add(l);
      continue;
    }
    const one = Number.parseFloat(part);
    if (Number.isFinite(one)) out.add(Math.round(one));
  }
  return [...out].sort((a, b) => a - b);
}

function levelLabel(level: number, roofTop: number | null): string {
  if (roofTop !== null && level === roofTop) return `roof · level ${level}`;
  if (level === 0) return "ground level";
  if (level < 0) return `level ${level} · below ground`;
  return `level ${level}`;
}

function query(lat: number, lon: number, radius: number): string {
  const around = `(around:${radius},${lat},${lon})`;
  return `[out:json][timeout:25];
(
  way["building"]${around};
  relation["building"]["type"="multipolygon"]${around};
  way["building:part"]${around};
  way["indoor"]${around};
  way["room"]${around};
  node["entrance"]${around};
);
out geom tags;`;
}

/**
 * Resolve a fix against the real building fabric around it.
 * @param accuracyM horizontal accuracy the receiver reported, used only to
 *        grade confidence — never to move the fix.
 */
export async function resolveBuilding(
  lat: number,
  lon: number,
  accuracyM: number | null = null,
  radiusM = 120,
): Promise<BuildingLookup> {
  const anchor: GeoAnchor = { lat, lon };
  const here: Vec3 = { x: 0, y: 0, z: 0 };
  const radius = Math.min(400, Math.max(40, radiusM));
  const elements = await overpassFetch(query(lat, lon, Math.round(radius)));

  interface Candidate {
    element: OverpassElement;
    ring: Ring;
  }
  const buildings: Candidate[] = [];
  const indoor: Candidate[] = [];
  const entrances: Vec3[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    if (el.type === "node") {
      if (tags.entrance && el.lat !== undefined && el.lon !== undefined) {
        entrances.push(geoToLocal(anchor, el.lat, el.lon));
      }
      continue;
    }
    const geometries: OverpassGeom[][] = [];
    if (el.geometry) geometries.push(el.geometry);
    if (el.members) {
      for (const member of el.members) {
        if (member.role === "outer" && member.geometry) geometries.push(member.geometry);
      }
    }
    for (const geometry of geometries) {
      const ring = toRing(anchor, geometry);
      if (!ring) continue;
      if (tags.building || tags["building:part"]) buildings.push({ element: el, ring });
      else if (tags.indoor || tags.room) indoor.push({ element: el, ring });
    }
  }

  const neighbours = buildings
    .map(({ element, ring }) => ({ ring, name: element.tags?.name ?? null }))
    .slice(0, 80);

  if (buildings.length === 0) {
    return {
      anchor,
      building: null,
      neighbours,
      message: "no building outline is mapped at this position — openstreetmap has nothing here to stand in",
    };
  }

  // Prefer a footprint that actually contains the fix. Among several (a part
  // inside an outline), the smallest wins: that is the more specific structure.
  const containing = buildings
    .filter((b) => pointInRing(here, b.ring))
    .sort((a, b) => ringArea(a.ring) - ringArea(b.ring));

  let chosen: Candidate | null = containing[0] ?? null;
  let containment: Containment = "inside";
  let distanceM = 0;

  if (!chosen) {
    containment = "nearest";
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of buildings) {
      const d = distanceToRing(here, candidate.ring);
      if (d < bestDistance) {
        bestDistance = d;
        chosen = candidate;
      }
    }
    distanceM = Number.isFinite(bestDistance) ? bestDistance : 0;
  }

  if (!chosen) {
    return { anchor, building: null, neighbours, message: "no usable building outline came back for this position" };
  }

  const tags = chosen.element.tags ?? {};
  const ring = chosen.ring;
  const areaM2 = ringArea(ring);
  const levelsAbove = num(tags["building:levels"]);
  const levelsBelow = num(tags["building:levels:underground"]) ?? num(tags["level:underground"]);
  const roofLevels = num(tags["roof:levels"]);
  const heightM = num(tags.height) ?? num(tags["building:height"]);
  const structureUnderground =
    tags.location === "underground" || tags.tunnel === "yes" || (num(tags.layer) ?? 0) < 0;

  const levelSet = new Set<number>();
  const above = levelsAbove !== null ? Math.max(1, Math.round(levelsAbove)) : null;
  const below = levelsBelow !== null ? Math.max(0, Math.round(levelsBelow)) : null;
  if (above !== null) for (let l = 0; l < above; l += 1) levelSet.add(l);
  if (below !== null) for (let l = 1; l <= below; l += 1) levelSet.add(-l);
  const roomsRaw: IndoorSpace[] = indoor.map(({ element, ring: r }) => {
    const t = element.tags ?? {};
    const inside = pointInRing(here, r);
    return {
      id: element.id,
      name: (t.name ?? t.ref ?? t.room ?? t.indoor ?? "unnamed space").toString().toLowerCase().slice(0, 60),
      kind: (t.indoor ?? t.room ?? "space").toString().replace(/_/g, " "),
      levels: parseLevels(t.level ?? t["building:levels"]),
      areaM2: ringArea(r),
      ring: r,
      contains: inside,
      distanceM: inside ? 0 : distanceToRing(here, r),
    };
  });
  for (const room of roomsRaw) for (const l of room.levels) levelSet.add(l);
  if (levelSet.size === 0) levelSet.add(0);

  const roofTop = above !== null && roofLevels !== null ? above - 1 : null;
  const levels: LevelInfo[] = [...levelSet]
    .sort((a, b) => b - a)
    .map((level) => ({
      level,
      label: levelLabel(level, roofTop),
      underground: structureUnderground || level < 0,
    }));

  const rooms = roomsRaw
    .filter((room) => room.contains || room.distanceM < 15)
    .sort((a, b) => Number(b.contains) - Number(a.contains) || a.distanceM - b.distanceM)
    .slice(0, 40);

  const shortSide = extentOf(ring).short;
  const confidence: BuildingFix["confidence"] =
    accuracyM === null
      ? "likely"
      : accuracyM <= Math.max(6, shortSide * 0.25)
        ? "firm"
        : accuracyM <= Math.max(20, shortSide)
          ? "likely"
          : "loose";

  const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase() || null;

  const building: BuildingFix = {
    osmId: `${chosen.element.type}/${chosen.element.id}`,
    name: (tags.name ?? null)?.toLowerCase() ?? null,
    kind: (tags.building ?? tags["building:part"] ?? "building").replace(/_/g, " "),
    address,
    operatorName: (tags.operator ?? null)?.toLowerCase() ?? null,
    containment,
    distanceM,
    areaM2,
    perimeterM: ringPerimeter(ring),
    extentM: extentOf(ring),
    ring,
    levelsAbove: above,
    levelsBelow: below,
    roofLevels: roofLevels !== null ? Math.round(roofLevels) : null,
    heightM,
    levels,
    structureUnderground,
    entrances: entrances.filter((e) => pointInRing(e, ring) || distanceToRing(e, ring) < 6),
    rooms,
    confidence,
  };

  const message =
    containment === "inside"
      ? `inside ${building.name ?? building.kind} · ${Math.round(areaM2)} m² footprint`
      : `not inside any mapped outline — nearest is ${building.name ?? building.kind}, ${distanceM.toFixed(1)} m away`;

  return { anchor, building, neighbours, message };
}
