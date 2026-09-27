import { describe, it, expect } from "vitest";
import { buildDatasetProfile, buildQualityReport, findDuplicateRows, profileColumns, toNumber, toDate, detectDomains } from "@/lib/data/validate";
import { applyCleanOp } from "@/lib/data/clean";
import { suggestJoinKeys, joinSources } from "@/lib/data/join";
import { buildChart, renderForIntent } from "@/lib/data/charts";
import { checkThemeContrast, contrastRatio, getTheme } from "@/lib/data/theme";
import type { DataRow } from "@/lib/data/types";

const rows: DataRow[] = [
  { order_id: "1", region: "north", revenue: "$1,200.50", closed_at: "2026-01-04", note: "renewal" },
  { order_id: "2", region: "south", revenue: "$800", closed_at: "2026-01-11", note: "new" },
  { order_id: "3", region: "north", revenue: "$2,400", closed_at: "2026-02-02", note: "renewal" },
  { order_id: "4", region: "south", revenue: null, closed_at: "2026-02-18", note: "" },
  { order_id: "4", region: "south", revenue: null, closed_at: "2026-02-18", note: "" },
];
const columns = ["order_id", "region", "revenue", "closed_at", "note"];

describe("value coercion", () => {
  it("reads currency and thousands separators", () => {
    expect(toNumber("$1,200.50")).toBe(1200.5);
    expect(toNumber("45%")).toBe(45);
    expect(toNumber("not a number")).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
  it("only accepts date-shaped strings", () => {
    expect(toDate("2026-01-04")?.getUTCFullYear()).toBe(2026);
    expect(toDate("north")).toBeNull();
  });
});

describe("profiling", () => {
  const profiles = profileColumns(columns, rows);
  it("types each column from its values, not its name alone", () => {
    const byName = Object.fromEntries(profiles.map((p) => [p.name, p.type]));
    expect(byName.revenue).toBe("currency");
    expect(byName.closed_at).toBe("date");
    expect(byName.region).toBe("geo");
  });
  it("counts missing values honestly", () => {
    const revenue = profiles.find((p) => p.name === "revenue")!;
    expect(revenue.missing).toBe(2);
    expect(revenue.completeness).toBe(60);
  });
  it("separates measures, dimensions and dates", () => {
    const p = buildDatasetProfile(columns, rows);
    expect(p.measures).toContain("revenue");
    expect(p.dateColumns).toContain("closed_at");
    expect(p.rowCount).toBe(5);
  });
  it("routes domains from the shape of the data", () => {
    const domains = detectDomains(profileColumns(columns, rows), "");
    expect(domains).toContain("financial");
    expect(domains).toContain("temporal");
  });
});

describe("quality", () => {
  it("flags duplicates and drops the score for them", () => {
    const profiles = profileColumns(columns, rows);
    const q = buildQualityReport(columns, rows, profiles);
    expect(findDuplicateRows(columns, rows)).toEqual([4]);
    expect(q.duplicateCount).toBe(1);
    expect(q.score).toBeLessThan(100);
    expect(q.issues.some((i) => i.message.includes("duplicate"))).toBe(true);
  });
});

describe("cleaning", () => {
  const profiles = profileColumns(columns, rows);
  it("removes duplicate rows", () => {
    const res = applyCleanOp(columns, rows, { kind: "drop-duplicates" }, profiles);
    expect(res.rows).toHaveLength(4);
    expect(res.changed).toBe(1);
  });
  it("fills missing numbers with the median", () => {
    const res = applyCleanOp(columns, rows, { kind: "fill-missing", column: "revenue", strategy: "median" }, profiles);
    expect(res.changed).toBe(2);
    expect(res.rows.every((r) => r.revenue !== null)).toBe(true);
  });
  it("refuses a rename onto an existing column", () => {
    const res = applyCleanOp(columns, rows, { kind: "rename", column: "note", to: "region" }, profiles);
    expect(res.changed).toBe(0);
    expect(res.columns).toContain("note");
  });
});

describe("joins", () => {
  const right: DataRow[] = [
    { region: "north", manager: "a", revenue: "9" },
    { region: "south", manager: "b", revenue: "3" },
  ];
  it("proposes keys from real overlap", () => {
    const cands = suggestJoinKeys(columns, rows, ["region", "manager", "revenue"], right);
    expect(cands[0].left).toBe("region");
    expect(cands[0].overlap).toBe(100);
    expect(cands[0].cardinality).toBe("many-to-one");
  });
  it("renames clashing columns instead of silently overwriting", () => {
    const res = joinSources(columns, rows, ["region", "manager", "revenue"], right, "region", "region", "targets");
    expect(res.columns).toContain("targets.revenue");
    expect(res.rows).toHaveLength(5);
    expect(res.conflicts.some((c) => c.includes("revenue"))).toBe(true);
  });
});

describe("chart selection", () => {
  const profile = buildDatasetProfile(columns, rows);
  it("maps intent to a readable family", () => {
    expect(renderForIntent("trend", { seriesCount: 1, categories: 10, hasDate: true })).toBe("line");
    expect(renderForIntent("part-to-whole", { seriesCount: 1, categories: 4, hasDate: false })).toBe("pie");
    expect(renderForIntent("part-to-whole", { seriesCount: 1, categories: 20, hasDate: false })).toBe("treemap");
    expect(renderForIntent("distribution", { seriesCount: 1, categories: 0, hasDate: false })).toBe("histogram");
  });
  it("aggregates a category comparison", () => {
    const spec = buildChart({ intent: "comparison", x: "region", y: ["revenue"], title: "t", insight: "i", sourceTag: "s" }, rows, profile);
    expect(spec?.render).toBe("bar");
    expect(spec?.data).toHaveLength(2);
  });
  it("returns nothing when the fields do not exist", () => {
    const spec = buildChart({ intent: "comparison", x: "ghost", y: ["missing"], title: "t", insight: "i", sourceTag: "s" }, rows, profile);
    expect(spec).toBeNull();
  });
});

describe("theme legibility", () => {
  it("computes wcag contrast", () => {
    expect(contrastRatio("0 0% 100%", "0 0% 0%")).toBeCloseTo(21, 0);
  });
  it("keeps every default series above the 3:1 floor", () => {
    for (const id of ["asherin", "graphite", "signal", "paper"]) {
      const failures = checkThemeContrast(getTheme(id)).filter((c) => !c.passes);
      expect(failures).toHaveLength(0);
    }
  });
});
