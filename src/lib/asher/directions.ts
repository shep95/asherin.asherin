// Asherin Maps — Directions engine.
//
// Live routing over the OSM road graph (OSRM). Google-Maps-parity behaviour:
// multi-modal profiles, alternative routes, turn-by-turn manoeuvres, avoidance
// options, and unit-aware formatting.
//
// Honesty rules baked in:
//  · Every route reports the upstream that produced it. When the graph is
//    unreachable we return a `degraded` reason instead of silently drawing a
//    straight line and calling it a road route.
//  · `exclude` (tolls / motorways / ferries) is a best-effort request: the
//    public OSRM profile may reject it, in which case we retry unconstrained
//    and flag that the constraint was NOT honoured, rather than pretending.

export interface LatLng { lat: number; lng: number }

export type TravelMode = "driving" | "walking" | "cycling";
export type AvoidOption = "toll" | "motorway" | "ferry";
export type Units = "metric" | "imperial";

export interface RouteStep {
  /** Human manoeuvre text, e.g. "Turn left onto Mission St". */
  text: string;
  /** OSRM manoeuvre type — drives the arrow icon. */
  maneuver: string;
  modifier?: string;
  distanceM: number;
  durationS: number;
  /** Geometry of just this step, so hovering a step can highlight the leg. */
  path: LatLng[];
  name?: string;
  /** Exit number for roundabouts. */
  exit?: number;
}

export interface RouteOption {
  id: string;
  path: LatLng[];
  distanceM: number;
  durationS: number;
  steps: RouteStep[];
  summary: string;
  /** Set when the route is not a true road-graph result. */
  degraded?: string;
  /** Set when an avoid-constraint could not be applied upstream. */
  constraintWarning?: string;
}

export interface DirectionsResult {
  mode: TravelMode;
  routes: RouteOption[];
  attribution: string;
}

const OSRM = "https://router.project-osrm.org";
const REQUEST_TIMEOUT_MS = 15_000;

const normLng = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;

const R_EARTH = 6_371_000;
export function haversineM(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(normLng(b.lng - a.lng));
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function fetchJson(url: string, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<any> {
  // Local controller so a slow upstream can never hang the panel forever, and
  // an externally-aborted request still tears this one down.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const relay = () => ctrl.abort();
  signal?.addEventListener("abort", relay);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("json")) throw new Error("non-JSON response");
    return await r.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relay);
  }
}

/* ── Formatting ─────────────────────────────────────────────────────────── */

export function fmtDistance(m: number, units: Units): string {
  if (!Number.isFinite(m)) return "—";
  if (units === "imperial") {
    const ft = m * 3.280_84;
    if (ft < 1000) return `${Math.round(ft / 10) * 10} ft`;
    const mi = m / 1609.344;
    return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
  }
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  const km = m / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function fmtDuration(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return "—";
  const total = Math.round(s / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d} d ${h % 24} h`;
  }
  return h ? `${h} h ${m} min` : `${m} min`;
}

/** ETA from now, rendered in the operator's locale. */
export function fmtEta(durationS: number): string {
  if (!Number.isFinite(durationS) || durationS <= 0) return "—";
  const at = new Date(Date.now() + durationS * 1000);
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/* ── Manoeuvre text ─────────────────────────────────────────────────────── */

const MODIFIER_TEXT: Record<string, string> = {
  "sharp left": "Sharp left",
  "sharp right": "Sharp right",
  "slight left": "Slight left",
  "slight right": "Slight right",
  left: "Turn left",
  right: "Turn right",
  straight: "Continue straight",
  uturn: "Make a U-turn",
};

function manoeuvreText(step: any, isLast: boolean): string {
  const type = String(step?.maneuver?.type || "");
  const modifier = String(step?.maneuver?.modifier || "");
  const road = String(step?.name || "").trim();
  const onto = road ? ` onto ${road}` : "";
  const along = road ? ` on ${road}` : "";

  switch (type) {
    case "depart": return road ? `Head out on ${road}` : "Depart";
    case "arrive": return isLast ? "Arrive at destination" : "Arrive at waypoint";
    case "roundabout":
    case "rotary": {
      const exit = step?.maneuver?.exit;
      return `At the roundabout, take exit ${exit ?? "?"}${onto}`;
    }
    case "merge": return `Merge${onto}`;
    case "on ramp": return `Take the ramp${onto}`;
    case "off ramp": return `Take the exit${onto}`;
    case "fork": return `${MODIFIER_TEXT[modifier] || "Keep"} at the fork${onto}`;
    case "end of road": return `${MODIFIER_TEXT[modifier] || "Turn"} at the end of the road${onto}`;
    case "continue": return `Continue${along}`;
    case "new name": return road ? `Continue onto ${road}` : "Continue";
    default: return `${MODIFIER_TEXT[modifier] || "Continue"}${onto || along}`;
  }
}

function decodeSteps(legs: any[]): RouteStep[] {
  const out: RouteStep[] = [];
  const flat: any[] = [];
  for (const leg of legs || []) for (const s of leg?.steps || []) flat.push(s);
  flat.forEach((s, i) => {
    const coords: [number, number][] = s?.geometry?.coordinates || [];
    out.push({
      text: manoeuvreText(s, i === flat.length - 1),
      maneuver: String(s?.maneuver?.type || "continue"),
      modifier: s?.maneuver?.modifier ? String(s.maneuver.modifier) : undefined,
      distanceM: Number(s?.distance) || 0,
      durationS: Number(s?.duration) || 0,
      path: coords.map(([lng, lat]) => ({ lat, lng })),
      name: s?.name ? String(s.name) : undefined,
      exit: typeof s?.maneuver?.exit === "number" ? s.maneuver.exit : undefined,
    });
  });
  return out;
}

function summarise(steps: RouteStep[]): string {
  // Name the route the way a driver would: the two longest named roads on it.
  const byRoad = new Map<string, number>();
  for (const s of steps) {
    if (!s.name) continue;
    byRoad.set(s.name, (byRoad.get(s.name) || 0) + s.distanceM);
  }
  const top = [...byRoad.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n);
  return top.length ? `via ${top.join(" and ")}` : "Direct route";
}

/* ── Public API ─────────────────────────────────────────────────────────── */

export interface DirectionsOptions {
  mode?: TravelMode;
  avoid?: AvoidOption[];
  alternatives?: boolean;
  signal?: AbortSignal;
}

export async function getDirections(
  waypoints: LatLng[],
  opts: DirectionsOptions = {},
): Promise<DirectionsResult> {
  const mode: TravelMode = opts.mode || "driving";
  const attribution = "OSRM · OpenStreetMap road graph";

  if (waypoints.length < 2) {
    return { mode, routes: [], attribution };
  }

  const coords = waypoints.map((p) => `${normLng(p.lng).toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const base = `${OSRM}/route/v1/${mode}/${coords}`;
  const common = `overview=full&geometries=geojson&steps=true&annotations=false&alternatives=${opts.alternatives === false ? "false" : "true"}`;
  const avoid = (opts.avoid || []).filter(Boolean);

  let json: any = null;
  let constraintWarning: string | undefined;

  // Only the car profile carries toll/motorway/ferry classes upstream; asking
  // for them on foot/bike is a guaranteed 400, so don't.
  if (avoid.length && mode === "driving") {
    try {
      json = await fetchJson(`${base}?${common}&exclude=${avoid.join(",")}`, opts.signal);
    } catch {
      constraintWarning = `Avoid ${avoid.join(" / ")} was not honoured — the public road-graph profile rejected the constraint.`;
    }
  }
  if (!json) {
    try {
      json = await fetchJson(`${base}?${common}`, opts.signal);
    } catch (e: any) {
      const straightM = waypoints.slice(1).reduce((a, p, i) => a + haversineM(waypoints[i], p), 0);
      return {
        mode,
        attribution,
        routes: [{
          id: "degraded",
          path: waypoints,
          distanceM: straightM,
          durationS: 0,
          steps: [],
          summary: "Straight-line fallback",
          degraded: `Road graph unreachable (${e?.message || "network"}). Showing the direct line — this is NOT a drivable distance.`,
        }],
      };
    }
  }

  const raw: any[] = Array.isArray(json?.routes) ? json.routes : [];
  const routes: RouteOption[] = raw.slice(0, 3).map((r, i) => {
    const line: [number, number][] = r?.geometry?.coordinates || [];
    const steps = decodeSteps(r?.legs || []);
    return {
      id: `r${i}`,
      path: line.map(([lng, lat]) => ({ lat, lng })),
      distanceM: Number(r?.distance) || 0,
      durationS: Number(r?.duration) || 0,
      steps,
      summary: summarise(steps),
      constraintWarning,
    };
  }).filter((r) => r.path.length >= 2);

  // Fastest first — the operator's default expectation.
  routes.sort((a, b) => a.durationS - b.durationS);
  return { mode, routes, attribution };
}
