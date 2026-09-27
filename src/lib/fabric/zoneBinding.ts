// asherin — operator-declared zone bindings.
//
// A microphone does not know which room it is in. A camera does not know that
// the lane called "lobby desk" points at the same space its west polygon
// covers. Nothing measurable connects them, and guessing from a device label
// would be exactly the fabrication this fabric exists to prevent.
//
// So the link is a human association, stored as one, and marked as one wherever
// it is used. Until an operator makes the binding, cross-modal correlation
// between a sentinel lane and a camera zone cannot happen — and the console
// says that is why, rather than showing an empty list.

const KEY = "asherin.fabric.zonebinding.v1";

export interface ZoneBinding {
  sensorId: string;
  zoneId: string;
  zoneLabel: string;
  boundBy: string;
  boundAtMs: number;
}

let cache: ZoneBinding[] | null = null;

function read(): ZoneBinding[] {
  if (cache) return cache;
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as ZoneBinding[]) : [];
    cache = Array.isArray(parsed) ? parsed.filter((b) => b && typeof b.sensorId === "string" && typeof b.zoneId === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function listZoneBindings(): ZoneBinding[] {
  return read().slice();
}

export function zoneFor(sensorId: string): { zoneId: string; zoneLabel: string } | null {
  const hit = read().find((b) => b.sensorId === sensorId);
  return hit ? { zoneId: hit.zoneId, zoneLabel: hit.zoneLabel } : null;
}

export function bindZone(sensorId: string, zoneId: string, zoneLabel: string, boundBy: string) {
  const next = read().filter((b) => b.sensorId !== sensorId);
  if (zoneId) next.push({ sensorId, zoneId, zoneLabel, boundBy, boundAtMs: Date.now() });
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* memory-only binding still works for this session */
  }
}

export const ZONE_BINDING_NOTE =
  "a lane belongs to a zone because an operator said so. it is a human association, not a measurement, and every correlation that rests on it carries that fact.";
