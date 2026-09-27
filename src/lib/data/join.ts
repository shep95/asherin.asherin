// asherin.data — cross-source joins.
// Keys are proposed from overlap evidence, never assumed. A join with weak
// overlap is reported as weak rather than silently producing a thin result.

import type { DataRow } from "./types";

export interface JoinCandidate {
  left: string;
  right: string;
  /** Share of left keys that find a match on the right (0-100). */
  overlap: number;
  leftUnique: boolean;
  rightUnique: boolean;
  cardinality: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
  confidence: "high" | "moderate" | "low";
}

function keyset(rows: DataRow[], col: string): { values: string[]; set: Set<string> } {
  const values = rows
    .map((r) => r[col])
    .filter((v) => v !== null && v !== "")
    .map((v) => String(v).trim().toLowerCase());
  return { values, set: new Set(values) };
}

export function suggestJoinKeys(
  leftColumns: string[], leftRows: DataRow[],
  rightColumns: string[], rightRows: DataRow[],
  limit = 6,
): JoinCandidate[] {
  const out: JoinCandidate[] = [];
  for (const l of leftColumns) {
    const L = keyset(leftRows, l);
    if (L.set.size === 0) continue;
    for (const r of rightColumns) {
      const R = keyset(rightRows, r);
      if (R.set.size === 0) continue;
      let hits = 0;
      for (const v of L.set) if (R.set.has(v)) hits++;
      const overlap = Math.round((hits / L.set.size) * 100);
      if (overlap < 10) continue;
      const leftUnique = L.set.size === L.values.length;
      const rightUnique = R.set.size === R.values.length;
      const cardinality: JoinCandidate["cardinality"] =
        leftUnique && rightUnique ? "one-to-one"
        : leftUnique ? "one-to-many"
        : rightUnique ? "many-to-one"
        : "many-to-many";
      const nameBonus = l.toLowerCase() === r.toLowerCase() ? 15 : 0;
      const score = overlap + nameBonus;
      out.push({
        left: l, right: r, overlap, leftUnique, rightUnique, cardinality,
        confidence: score >= 85 ? "high" : score >= 45 ? "moderate" : "low",
      });
    }
  }
  return out.sort((a, b) => b.overlap - a.overlap).slice(0, limit);
}

export interface JoinResult {
  columns: string[];
  rows: DataRow[];
  matched: number;
  unmatchedLeft: number;
  conflicts: string[];
}

export function joinSources(
  leftColumns: string[], leftRows: DataRow[],
  rightColumns: string[], rightRows: DataRow[],
  leftKey: string, rightKey: string,
  rightLabel: string,
  mode: "inner" | "left" = "left",
): JoinResult {
  const index = new Map<string, DataRow[]>();
  for (const r of rightRows) {
    const k = r[rightKey] === null || r[rightKey] === undefined ? "" : String(r[rightKey]).trim().toLowerCase();
    if (!k) continue;
    const bucket = index.get(k);
    if (bucket) bucket.push(r); else index.set(k, [r]);
  }
  const clash = rightColumns.filter((c) => leftColumns.includes(c) && c !== rightKey);
  const renamed = new Map(clash.map((c) => [c, `${rightLabel}.${c}`]));
  const columns = [...leftColumns, ...rightColumns.filter((c) => c !== rightKey).map((c) => renamed.get(c) ?? c)];

  const rows: DataRow[] = [];
  let matched = 0;
  let unmatchedLeft = 0;
  for (const l of leftRows) {
    const k = l[leftKey] === null || l[leftKey] === undefined ? "" : String(l[leftKey]).trim().toLowerCase();
    const hits = k ? index.get(k) : undefined;
    if (!hits || !hits.length) {
      unmatchedLeft++;
      if (mode === "left") rows.push({ ...l });
      continue;
    }
    matched++;
    for (const r of hits) {
      const merged: DataRow = { ...l };
      for (const c of rightColumns) {
        if (c === rightKey) continue;
        merged[renamed.get(c) ?? c] = r[c] ?? null;
      }
      rows.push(merged);
    }
  }
  const conflicts = clash.map((c) => `both sources have a "${c}" column; the second one is shown as "${rightLabel}.${c}"`);
  if (unmatchedLeft) {
    conflicts.push(`${unmatchedLeft} row(s) on the left had no match on the right`);
  }
  return { columns, rows, matched, unmatchedLeft, conflicts };
}
