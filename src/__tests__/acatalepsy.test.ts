import { describe, expect, it } from "vitest";
import { analyzeParsed, assignRank, filterRows, pearson } from "@/lib/acatalepsy/engine";
import { parsePastedTable } from "@/lib/acatalepsy/parser";
import type { DataRow, ParsedFile } from "@/lib/data/types";

const rows: DataRow[] = [
  { date: "2026-01-01", open: 10, high: 14, low: 8, close: 12, revenue: 100 },
  { date: "2026-01-02", open: 12, high: 16, low: 11, close: 15, revenue: 150 },
  { date: "2026-01-03", open: 15, high: 18, low: 13, close: 17, revenue: 200 },
];

describe("acatalepsy deterministic engine", () => {
  it("selects financial visuals from explicit field evidence", () => {
    const parsed: ParsedFile = { kind: "table", columns: Object.keys(rows[0]), rows, text: "", warnings: [], method: "test", truncated: false };
    const analysis = analyzeParsed(parsed);
    expect(analysis.domains[0]?.domain).toBe("financial");
    expect(analysis.visuals.some((visual) => visual.kind === "candlestick")).toBe(true);
  });

  it("computes stable correlations and literal filters", () => {
    expect(pearson(rows, "open", "revenue")).toBeGreaterThan(0.99);
    expect(filterRows(rows, "2026-01-02")).toHaveLength(1);
  });

  it("assigns complexity labels from documented thresholds", () => {
    const parsed: ParsedFile = { kind: "table", columns: Object.keys(rows[0]), rows, text: "", warnings: [], method: "test", truncated: false };
    const profile = analyzeParsed(parsed).profile;
    expect(assignRank(profile).rank).toBe("beginner");
  });

  it("turns pasted tabular content into an in-memory file", () => {
    const file = parsePastedTable("city\tvalue\nrome\t3");
    expect(file.name).toBe("pasted-table.tsv");
  });
});