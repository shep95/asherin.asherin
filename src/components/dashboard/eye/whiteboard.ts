// ─────────────────────────────────────────────────────────────────────────────
// asherin.eye — drawing on the world, and asking the drawing a question.
//
// A stroke dragged across a globe is a bad shape: hand jitter, forty points per
// second, an "O" that never closes. Drawn raw it looks like a scribble laid on
// a map and reads as decoration. So every stroke is FITTED — the hand proposes,
// the geometry decides — and the shape that lands is one of four honest kinds:
//
//   circle    · a ring drawn around something  → centre + radius
//   rect      · four-ish corners, roughly square to the compass
//   corridor  · an open drag                  → centreline + width
//   polygon   · anything else, simplified so the vertices are meaningful
//
// A fitted shape is then a PREDICATE, not an ornament: "which live contacts are
// inside this?" is answered against whatever the layers are currently holding.
// Every function is pure. Nothing here touches Cesium, the DOM or the network.
// ─────────────────────────────────────────────────────────────────────────────

export type ShapeKind = "circle" | "rect" | "corridor" | "polygon";

export interface LonLat {
  lat: number;
  lon: number;
}

export interface FittedShape {
  kind: ShapeKind;
  /** closed ring in lon/lat, always present so one renderer covers every kind */
  ring: LonLat[];
  /** circle only */
  centre?: LonLat;
  /** circle only, metres */
  radiusM?: number;
  /** corridor only */
  centreline?: LonLat[];
  /** corridor only, metres */
  widthM?: number;
  /** metres², 0 for a corridor of zero width */
  areaM2: number;
  /** how well the raw stroke matched the fitted kind, 0..1 */
  fit: number;
  label: string;
}

const R = 6378137;
const D2R = Math.PI / 180;

export function metresBetween(a: LonLat, b: LonLat): number {
  const dLat = (b.lat - a.lat) * D2R * R;
  const dLon = (b.lon - a.lon) * D2R * R * Math.cos(((a.lat + b.lat) / 2) * D2R);
  return Math.hypot(dLat, dLon);
}

/** local flat frame in metres about an origin — good to well under a metre at
 *  the scales anyone draws at, and it keeps every fit as plain 2-d algebra. */
function toXY(p: LonLat, o: LonLat) {
  return {
    x: (p.lon - o.lon) * D2R * R * Math.cos(o.lat * D2R),
    y: (p.lat - o.lat) * D2R * R,
  };
}

function toLonLat(x: number, y: number, o: LonLat): LonLat {
  return {
    lat: o.lat + y / (D2R * R),
    lon: o.lon + x / (D2R * R * Math.cos(o.lat * D2R)),
  };
}

/** Ramer–Douglas–Peucker. Drops the points the hand added but the shape never
 *  needed, so a polygon's vertices mean corners instead of frame rate. */
export function simplify(points: LonLat[], toleranceM: number): LonLat[] {
  if (points.length < 3) return [...points];
  const o = points[0];
  const pts = points.map((p) => toXY(p, o));
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;

  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let best = -1;
    let bestD = toleranceM;
    const ax = pts[i].x;
    const ay = pts[i].y;
    const bx = pts[j].x;
    const by = pts[j].y;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((bx - ax) * (ay - pts[k].y) - (ax - pts[k].x) * (by - ay)) / len;
      if (d > bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best > 0) {
      keep[best] = true;
      stack.push([i, best], [best, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function ringArea(ring: LonLat[]): number {
  if (ring.length < 3) return 0;
  const o = ring[0];
  const pts = ring.map((p) => toXY(p, o));
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function centroid(points: LonLat[]): LonLat {
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lon = points.reduce((s, p) => s + p.lon, 0) / points.length;
  return { lat, lon };
}

function circleRing(centre: LonLat, radiusM: number, steps = 72): LonLat[] {
  const out: LonLat[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    out.push(toLonLat(Math.cos(t) * radiusM, Math.sin(t) * radiusM, centre));
  }
  return out;
}

/**
 * Fit a raw stroke.
 *
 * The order matters: a circle test first (it is the most common intent and the
 * easiest to be sure about), then a rectangle, then the open/closed decision.
 * A stroke that fails every test is still honoured — as a simplified polygon —
 * because refusing to draw what someone drew is worse than drawing it plainly.
 */
export function fitStroke(raw: LonLat[], opts: { closeToleranceM?: number } = {}): FittedShape | null {
  const pts = dedupe(raw);
  if (pts.length < 2) return null;

  const c = centroid(pts);
  const radii = pts.map((p) => metresBetween(c, p));
  const rMean = radii.reduce((s, r) => s + r, 0) / radii.length;
  const spread = rMean > 0 ? Math.sqrt(radii.reduce((s, r) => s + (r - rMean) ** 2, 0) / radii.length) / rMean : 1;
  const gapM = metresBetween(pts[0], pts[pts.length - 1]);
  const perimeter = pts.slice(1).reduce((s, p, i) => s + metresBetween(pts[i], p), 0);
  const closeTol = opts.closeToleranceM ?? Math.max(rMean * 0.45, perimeter * 0.18);
  const closed = pts.length > 6 && gapM <= closeTol;

  // ── circle: every point roughly the same distance from the middle ─────────
  if (closed && spread < 0.16 && rMean > 1) {
    const fit = 1 - spread / 0.16;
    return {
      kind: "circle",
      centre: c,
      radiusM: rMean,
      ring: circleRing(c, rMean),
      areaM2: Math.PI * rMean * rMean,
      fit: clamp01(fit),
      label: `circle · ${fmtM(rMean)} radius`,
    };
  }

  // ── rect: the stroke fills its own axis-aligned box ───────────────────────
  if (closed) {
    const south = Math.min(...pts.map((p) => p.lat));
    const north = Math.max(...pts.map((p) => p.lat));
    const west = Math.min(...pts.map((p) => p.lon));
    const east = Math.max(...pts.map((p) => p.lon));
    const box = [
      { lat: south, lon: west },
      { lat: south, lon: east },
      { lat: north, lon: east },
      { lat: north, lon: west },
    ];
    const boxArea = ringArea(box);
    const drawn = ringArea(pts);
    const fill = boxArea > 0 ? drawn / boxArea : 0;
    if (fill > 0.82) {
      return {
        kind: "rect",
        ring: box,
        areaM2: boxArea,
        fit: clamp01((fill - 0.82) / 0.18),
        label: `box · ${fmtM(metresBetween(box[0], box[1]))} × ${fmtM(metresBetween(box[1], box[2]))}`,
      };
    }
    const ring = simplify(pts, Math.max(40, perimeter * 0.012));
    return {
      kind: "polygon",
      ring,
      areaM2: ringArea(ring),
      fit: clamp01(1 - gapM / Math.max(1, closeTol)),
      label: `area · ${ring.length} corners`,
    };
  }

  // ── corridor: an open drag is a route, not a region ───────────────────────
  const line = simplify(pts, Math.max(60, perimeter * 0.01));
  const widthM = Math.max(500, perimeter * 0.05);
  return {
    kind: "corridor",
    centreline: line,
    widthM,
    ring: bufferLine(line, widthM / 2),
    areaM2: perimeter * widthM,
    fit: 1,
    label: `corridor · ${fmtM(perimeter)} long · ${fmtM(widthM)} wide`,
  };
}

/** a flat buffer around a centreline: left side out, right side back. */
export function bufferLine(line: LonLat[], halfWidthM: number): LonLat[] {
  if (line.length < 2) return [];
  const o = line[0];
  const pts = line.map((p) => toXY(p, o));
  const left: LonLat[] = [];
  const right: LonLat[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push(toLonLat(pts[i].x + nx * halfWidthM, pts[i].y + ny * halfWidthM, o));
    right.push(toLonLat(pts[i].x - nx * halfWidthM, pts[i].y - ny * halfWidthM, o));
  }
  return [...left, ...right.reverse()];
}

/** ray casting, on the raw degrees. Shapes drawn by hand never straddle the
 *  antimeridian at a scale where that matters; anything that does is clamped by
 *  the caller's bbox first. */
export function pointInRing(p: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat;
    const xi = ring[i].lon;
    const yj = ring[j].lat;
    const xj = ring[j].lon;
    const hit = yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi || 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function shapeContains(shape: FittedShape, p: LonLat): boolean {
  if (shape.kind === "circle" && shape.centre && shape.radiusM != null) {
    return metresBetween(shape.centre, p) <= shape.radiusM;
  }
  return pointInRing(p, shape.ring);
}

export interface PredicateHit {
  layer: string;
  id: string;
  label: string;
  lat: number;
  lon: number;
  alt?: number | null;
}

/** the whole point of drawing: ask the shape what is standing in it. */
export function evaluate(
  shape: FittedShape,
  pool: Array<{ layer: string; id: string; label: string; lat: number; lon: number; alt?: number | null }>,
): { hits: PredicateHit[]; byLayer: Record<string, number>; summary: string } {
  const hits = pool.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lon) && shapeContains(shape, e));
  const byLayer: Record<string, number> = {};
  hits.forEach((h) => (byLayer[h.layer] = (byLayer[h.layer] || 0) + 1));
  const parts = Object.entries(byLayer)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${k}`);
  return {
    hits,
    byLayer,
    summary: parts.length
      ? `${hits.length} inside · ${parts.join(" · ")}`
      : "nothing live inside this shape right now",
  };
}

function dedupe(points: LonLat[]): LonLat[] {
  const out: LonLat[] = [];
  points.forEach((p) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 89.5) return;
    const last = out[out.length - 1];
    if (last && metresBetween(last, p) < 8) return;
    out.push(p);
  });
  return out;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function fmtM(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

export function fmtArea(m2: number): string {
  const km2 = m2 / 1e6;
  return km2 >= 1 ? `${km2.toFixed(km2 >= 100 ? 0 : 1)} km²` : `${Math.round(m2).toLocaleString()} m²`;
}
