// asherin.arvision — administrator-defined zone geometry.
//
// A zone is the only thing that makes "entry" mean anything. Without a drawn
// polygon there is no restricted area, so every zone-dependent detector in this
// subsystem reports "no zone configured" rather than guessing a region of the
// frame. Nothing here is derived from the picture: an administrator draws it,
// names it, schedules it, and can delete it.
//
// Coordinates are normalized to the frame (0..1 on both axes) so a zone drawn
// at one resolution stays correct when the camera negotiates another, and so a
// zone can be reasoned about in tests without a canvas.

export interface Point {
  x: number;
  y: number;
}

export type ZoneKind =
  /** entry is not allowed while the schedule is active. */
  | "restricted"
  /** entry is allowed; dwell and occupancy are still measured. */
  | "monitored"
  /** running is out of place here; sustained speed above the site rule is an event. */
  | "walking_only"
  /** a two-point line across a gate, fence or barrier. crossing it is the event. */
  | "barrier"
  /** counted for crowd formation. */
  | "occupancy";

export interface ZoneSchedule {
  /** 0 = sunday … 6 = saturday. empty means every day. */
  days: number[];
  /** minutes from local midnight. start > end wraps past midnight. */
  startMinute: number;
  endMinute: number;
}

export interface SafetyZone {
  id: string;
  cameraId: string;
  label: string;
  kind: ZoneKind;
  /** normalized polygon. a barrier holds exactly two points; others need three or more. */
  polygon: Point[];
  /** null means the zone is active at all times. */
  schedule: ZoneSchedule | null;
  /** a track may be inside this long before entry counts, for doorways and thresholds. */
  gracePeriodMs: number;
  /** how long a track may remain before it is an extended dwell. */
  dwellThresholdMs: number;
  /** simultaneous tracks inside before crowd formation is reported. */
  occupancyThreshold: number;
  enabled: boolean;
  /** the administrator's written reason this zone exists. */
  rationale: string;
}

export const ZONE_STORAGE_KEY = "arvision.safety.zones.v1";

/** Ray casting. Points exactly on an edge count as inside, which matters for tests. */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (onSegment(p, a, b)) return true;
    const straddles = a.y > p.y !== b.y > p.y;
    if (!straddles) continue;
    const xAt = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (p.x < xAt) inside = !inside;
  }
  return inside;
}

function onSegment(p: Point, a: Point, b: Point): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-9) return false;
  return (
    p.x >= Math.min(a.x, b.x) - 1e-9 &&
    p.x <= Math.max(a.x, b.x) + 1e-9 &&
    p.y >= Math.min(a.y, b.y) - 1e-9 &&
    p.y <= Math.max(a.y, b.y) + 1e-9
  );
}

/** Which side of a two-point barrier a position falls on: -1, 0 or 1. */
export function sideOfLine(p: Point, a: Point, b: Point): number {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) < 1e-6) return 0;
  return cross > 0 ? 1 : -1;
}

/**
 * Do two segments actually cross? A side flip alone is not a crossing — a track
 * can walk around the end of a short barrier and flip sides without ever going
 * over it, so the path travelled must intersect the drawn segment itself.
 */
export function segmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = sideOfLine(p1, q1, q2);
  const d2 = sideOfLine(p2, q1, q2);
  const d3 = sideOfLine(q1, p1, p2);
  const d4 = sideOfLine(q2, p1, p2);
  if (d1 !== d2 && d3 !== d4) return true;
  // collinear touching counts, so a track that walks exactly along the line and
  // steps over it is not silently dropped.
  return (
    (d1 === 0 && onSegment(p1, q1, q2)) ||
    (d2 === 0 && onSegment(p2, q1, q2)) ||
    (d3 === 0 && onSegment(q1, p1, p2)) ||
    (d4 === 0 && onSegment(q2, p1, p2))
  );
}

export function zoneCentroid(zone: SafetyZone): Point {
  const n = zone.polygon.length || 1;
  return {
    x: zone.polygon.reduce((s, p) => s + p.x, 0) / n,
    y: zone.polygon.reduce((s, p) => s + p.y, 0) / n,
  };
}

/**
 * Is the schedule live at this instant? Uses the viewer's local clock, because
 * a site's closed hours are local hours.
 */
export function zoneActiveAt(zone: SafetyZone, at: Date): boolean {
  if (!zone.enabled) return false;
  const s = zone.schedule;
  if (!s) return true;
  if (s.days.length > 0 && !s.days.includes(at.getDay())) return false;
  const minute = at.getHours() * 60 + at.getMinutes();
  if (s.startMinute === s.endMinute) return true;
  if (s.startMinute < s.endMinute) return minute >= s.startMinute && minute < s.endMinute;
  // wraps midnight: 22:00 → 06:00
  return minute >= s.startMinute || minute < s.endMinute;
}

export interface ZoneProblem {
  zoneId: string;
  detail: string;
}

/** A zone that cannot be evaluated is rejected loudly rather than silently skipped. */
export function validateZones(zones: SafetyZone[]): { zones: SafetyZone[]; problems: ZoneProblem[] } {
  const problems: ZoneProblem[] = [];
  const ok = zones.filter((z) => {
    const need = z.kind === "barrier" ? 2 : 3;
    if (z.polygon.length < need) {
      problems.push({
        zoneId: z.id,
        detail: `"${z.label}" was skipped: a ${z.kind} zone needs at least ${need} points and this one has ${z.polygon.length}`,
      });
      return false;
    }
    if (z.polygon.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) {
      problems.push({ zoneId: z.id, detail: `"${z.label}" was skipped: a point falls outside the frame` });
      return false;
    }
    return true;
  });
  return { zones: ok, problems };
}

export function loadZones(): SafetyZone[] {
  try {
    const raw = localStorage.getItem(ZONE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SafetyZone[]) : [];
  } catch {
    return [];
  }
}

export function saveZones(zones: SafetyZone[]): void {
  try {
    localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(zones));
  } catch {
    /* storage may be denied; the session still holds them in memory */
  }
}

let zoneSeq = 0;

export function newZone(cameraId: string, kind: ZoneKind, polygon: Point[]): SafetyZone {
  zoneSeq += 1;
  return {
    id: `zone_${Date.now().toString(36)}_${zoneSeq}`,
    cameraId,
    label: `${kind.replace(/_/g, " ")} zone ${zoneSeq}`,
    kind,
    polygon,
    schedule: null,
    gracePeriodMs: kind === "restricted" ? 2000 : 0,
    dwellThresholdMs: 300_000,
    occupancyThreshold: 6,
    enabled: true,
    rationale: "",
  };
}
