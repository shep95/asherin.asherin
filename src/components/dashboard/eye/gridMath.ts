// ─────────────────────────────────────────────────────────────────────────────
// asherin.eye — the grid, and what a hole in it is allowed to mean.
//
// Two honest facts sit under every function here:
//
//   1. We only know the sky we were looking at. The grid is built from what
//      this deployment actually observed, so a cell with zero samples can mean
//      "nothing flew there" OR "nobody had the eye open on it". Those are not
//      the same claim and the code must never merge them.
//
//   2. ADS-B is line of sight from volunteer receivers. Ocean, desert and
//      mountain shadow read as emptiness even when traffic is dense. So a void
//      is only worth reporting when the ring AROUND it is well observed —
//      an island of silence inside a busy neighbourhood.
//
// Everything below is pure so it can be reasoned about and tested without a
// globe, a network, or a database.
// ─────────────────────────────────────────────────────────────────────────────

/** grid resolution in degrees. 0.25° ≈ 27 km of latitude — one cell is about
 *  four minutes of airliner cruise, fine enough to show a dogleg, coarse
 *  enough that one receiver outage does not shred the picture. */
export const CELL_DEG = 0.25;
const INV = 1 / CELL_DEG;

export interface GridCell {
  /** integer cell index, latitude */
  cy: number;
  /** integer cell index, longitude */
  cx: number;
  samples: number;
  contacts: number;
  /** mean altitude in metres across the cell, or null when never sampled */
  altMean: number | null;
  /** distinct hours this cell was ever written in */
  hours: number;
}

export interface AvoidCell extends GridCell {
  /** median sample count of the observed ring around this cell */
  ringMedian: number;
  /** how many of the eight neighbours carry any observation at all */
  ringObserved: number;
  /** 0..1 — how far below its own neighbourhood this cell sits */
  deficit: number;
  verdict: "void" | "thin" | "normal" | "unobserved";
}

export function cellOf(lat: number, lon: number): { cy: number; cx: number } {
  return { cy: Math.floor(lat * INV), cx: Math.floor(wrapLon(lon) * INV) };
}

export function cellCentre(cy: number, cx: number): { lat: number; lon: number } {
  return { lat: (cy + 0.5) * CELL_DEG, lon: wrapLon((cx + 0.5) * CELL_DEG) };
}

export function cellBounds(cy: number, cx: number) {
  return {
    south: cy * CELL_DEG,
    north: (cy + 1) * CELL_DEG,
    west: wrapLon(cx * CELL_DEG),
    east: wrapLon((cx + 1) * CELL_DEG),
  };
}

export function wrapLon(lon: number): number {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

function keyOf(cy: number, cx: number) {
  return `${cy}:${cx}`;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Score every cell against its own ring.
 *
 * A cell is called a **void** only when all three hold:
 *   • the ring around it is genuinely observed (≥ `minRingObserved` neighbours
 *     carrying samples) — otherwise we are looking at receiver shadow, not
 *     behaviour;
 *   • the ring is busy enough for silence to mean something (`minRingMedian`);
 *   • the cell itself sits far below that ring (`voidDeficit`).
 *
 * Cells with no ring evidence come back `unobserved`. That verdict is the whole
 * point of this function: it is the difference between "planes refuse to fly
 * here" and "we have never watched here".
 */
export function scoreAvoidance(
  cells: GridCell[],
  opts: { minRingObserved?: number; minRingMedian?: number; voidDeficit?: number; thinDeficit?: number } = {},
): AvoidCell[] {
  const minRingObserved = opts.minRingObserved ?? 5;
  const minRingMedian = opts.minRingMedian ?? 6;
  const voidDeficit = opts.voidDeficit ?? 0.82;
  const thinDeficit = opts.thinDeficit ?? 0.55;

  const byKey = new Map<string, GridCell>();
  cells.forEach((c) => byKey.set(keyOf(c.cy, c.cx), c));

  // the ring is evaluated over every cell that HAS a neighbour in the set, so
  // a hole with no row of its own still gets judged — a missing row is exactly
  // the shape we are hunting.
  const candidates = new Map<string, GridCell>(byKey);
  cells.forEach((c) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dy && !dx) continue;
        const k = keyOf(c.cy + dy, c.cx + dx);
        if (!candidates.has(k)) {
          candidates.set(k, { cy: c.cy + dy, cx: c.cx + dx, samples: 0, contacts: 0, altMean: null, hours: 0 });
        }
      }
    }
  });

  const out: AvoidCell[] = [];
  candidates.forEach((c) => {
    const ring: number[] = [];
    let observed = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dy && !dx) continue;
        const n = byKey.get(keyOf(c.cy + dy, c.cx + dx));
        const s = n?.samples ?? 0;
        ring.push(s);
        if (s > 0) observed++;
      }
    }
    const ringMedian = median(ring);
    const deficit = ringMedian > 0 ? Math.max(0, 1 - c.samples / ringMedian) : 0;
    let verdict: AvoidCell["verdict"] = "normal";
    if (observed < minRingObserved || ringMedian < minRingMedian) verdict = "unobserved";
    else if (deficit >= voidDeficit) verdict = "void";
    else if (deficit >= thinDeficit) verdict = "thin";
    out.push({ ...c, ringMedian, ringObserved: observed, deficit, verdict });
  });
  return out;
}

/** how much grid there is, in plain words, so the layer can refuse to lie. */
export function gridMaturity(cells: GridCell[], neededHours = 168) {
  const hours = cells.reduce((m, c) => Math.max(m, c.hours), 0);
  const samples = cells.reduce((s, c) => s + c.samples, 0);
  const ready = hours >= neededHours;
  return {
    hours,
    samples,
    neededHours,
    ready,
    note: ready
      ? `${samples.toLocaleString()} samples across ${hours}h of recorded grid`
      : `grid is ${hours}h deep and this reading wants ${neededHours}h · shown anyway, but a hole this young is far more likely to be a gap in watching than a gap in flying`,
  };
}

/** samples → the cell rows the recorder posts upward. */
export function foldSamplesToCells(
  rows: Array<{ lat: number; lon: number; alt?: number | null; id?: string }>,
): Array<{ cy: number; cx: number; samples: number; contacts: number; alt_sum: number; alt_n: number }> {
  const acc = new Map<string, { cy: number; cx: number; samples: number; ids: Set<string>; alt_sum: number; alt_n: number }>();
  rows.forEach((r) => {
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lon)) return;
    if (Math.abs(r.lat) > 90) return;
    const { cy, cx } = cellOf(r.lat, r.lon);
    const k = keyOf(cy, cx);
    const cur = acc.get(k) || { cy, cx, samples: 0, ids: new Set<string>(), alt_sum: 0, alt_n: 0 };
    cur.samples += 1;
    if (r.id) cur.ids.add(r.id);
    if (Number.isFinite(r.alt as number)) {
      cur.alt_sum += Number(r.alt);
      cur.alt_n += 1;
    }
    acc.set(k, cur);
  });
  return [...acc.values()].map((c) => ({
    cy: c.cy,
    cx: c.cx,
    samples: c.samples,
    contacts: c.ids.size || c.samples,
    alt_sum: Math.round(c.alt_sum),
    alt_n: c.alt_n,
  }));
}
