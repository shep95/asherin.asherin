// asherin.data — in-platform cleaning.
// Every operation is pure: it returns a new row set plus a plain english
// record of what changed, so the version history can explain itself later.

import type { ColumnProfile, DataRow } from "./types";
import { findDuplicateRows, toNumber, toDate } from "./validate";

export type CleanOp =
  | { kind: "drop-duplicates" }
  | { kind: "drop-empty-rows" }
  | { kind: "fill-missing"; column: string; strategy: "mean" | "median" | "zero" | "previous" | "constant"; value?: string }
  | { kind: "drop-missing"; column: string }
  | { kind: "coerce-type"; column: string; to: "number" | "date" | "text" | "boolean" }
  | { kind: "trim"; column: string }
  | { kind: "remove-outliers"; column: string }
  | { kind: "rename"; column: string; to: string }
  | { kind: "drop-column"; column: string };

export interface CleanResult {
  columns: string[];
  rows: DataRow[];
  changed: number;
  note: string;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function applyCleanOp(
  columns: string[],
  rows: DataRow[],
  op: CleanOp,
  profiles: ColumnProfile[],
): CleanResult {
  switch (op.kind) {
    case "drop-duplicates": {
      const dupes = new Set(findDuplicateRows(columns, rows));
      const next = rows.filter((_, i) => !dupes.has(i));
      return { columns, rows: next, changed: dupes.size, note: `removed ${dupes.size} duplicate row(s)` };
    }
    case "drop-empty-rows": {
      const next = rows.filter((r) => columns.some((c) => r[c] !== null && r[c] !== ""));
      return { columns, rows: next, changed: rows.length - next.length, note: `removed ${rows.length - next.length} empty row(s)` };
    }
    case "drop-missing": {
      const next = rows.filter((r) => r[op.column] !== null && r[op.column] !== "");
      return { columns, rows: next, changed: rows.length - next.length, note: `removed ${rows.length - next.length} row(s) with no ${op.column}` };
    }
    case "fill-missing": {
      const nums = rows.map((r) => toNumber(r[op.column] ?? null)).filter((n): n is number => n !== null);
      let filler: string | number | null = null;
      if (op.strategy === "mean" && nums.length) filler = Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4));
      if (op.strategy === "median" && nums.length) filler = median(nums);
      if (op.strategy === "zero") filler = 0;
      if (op.strategy === "constant") filler = op.value ?? "";
      let changed = 0;
      let previous: DataRow[string] = null;
      const next = rows.map((r) => {
        const v = r[op.column];
        if (v !== null && v !== "") { previous = v; return r; }
        const fill = op.strategy === "previous" ? previous : filler;
        if (fill === null) return r;
        changed++;
        return { ...r, [op.column]: fill };
      });
      return { columns, rows: next, changed, note: `filled ${changed} missing value(s) in ${op.column} using ${op.strategy}` };
    }
    case "coerce-type": {
      let changed = 0;
      const next = rows.map((r) => {
        const v = r[op.column];
        if (v === null || v === "") return r;
        let out: DataRow[string] = v;
        if (op.to === "number") out = toNumber(v);
        else if (op.to === "date") { const d = toDate(v); out = d ? d.toISOString() : null; }
        else if (op.to === "boolean") out = /^(true|yes|y|1)$/i.test(String(v));
        else out = String(v);
        if (out !== v) changed++;
        return { ...r, [op.column]: out };
      });
      return { columns, rows: next, changed, note: `converted ${changed} value(s) in ${op.column} to ${op.to}` };
    }
    case "trim": {
      let changed = 0;
      const next = rows.map((r) => {
        const v = r[op.column];
        if (typeof v !== "string") return r;
        const t = v.trim().replace(/\s+/g, " ");
        if (t !== v) changed++;
        return { ...r, [op.column]: t };
      });
      return { columns, rows: next, changed, note: `tidied ${changed} value(s) in ${op.column}` };
    }
    case "remove-outliers": {
      const profile = profiles.find((p) => p.name === op.column);
      const flagged = new Set(profile?.outlierRows ?? []);
      const next = rows.filter((_, i) => !flagged.has(i));
      return { columns, rows: next, changed: flagged.size, note: `removed ${flagged.size} out-of-range row(s) based on ${op.column}` };
    }
    case "rename": {
      const to = op.to.trim();
      if (!to || columns.includes(to)) {
        return { columns, rows, changed: 0, note: `"${to}" is empty or already taken, so nothing was renamed` };
      }
      const next = rows.map((r) => {
        const { [op.column]: v, ...rest } = r;
        return { ...rest, [to]: v ?? null };
      });
      return { columns: columns.map((c) => (c === op.column ? to : c)), rows: next, changed: rows.length, note: `renamed ${op.column} to ${to}` };
    }
    case "drop-column": {
      const next = rows.map((r) => {
        const copy = { ...r };
        delete copy[op.column];
        return copy;
      });
      return { columns: columns.filter((c) => c !== op.column), rows: next, changed: rows.length, note: `removed the ${op.column} column` };
    }
    default:
      return { columns, rows, changed: 0, note: "nothing to do" };
  }
}
