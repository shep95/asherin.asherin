import { describe, expect, it } from "vitest";
import {
  applyFilter, buildGrounding, buildReportMarkdown, byPeriod, describePlan, evaluateRule, groupBy, measureStats, runPlan, validatePlan,
} from "../analyze";
import { buildDatasetProfile, buildQualityReport } from "../validate";
import type { AlertRuleRow } from "../store";
import type { DataRow, DataSourceRow, DataVersionRow } from "../types";

const rows: DataRow[] = [
  { region: "north", revenue: "$1,200.50", closed_at: "2026-01-04", units: 3 },
  { region: "south", revenue: "$800", closed_at: "2026-01-11", units: 2 },
  { region: "north", revenue: "$2,400", closed_at: "2026-02-02", units: 5 },
  { region: "south", revenue: null, closed_at: "2026-02-18", units: 1 },
  { region: "west", revenue: "$300", closed_at: "2026-03-01", units: 1 },
];
const columns = ["region", "revenue", "closed_at", "units"];
const profile = buildDatasetProfile(columns, rows);
const quality = buildQualityReport(columns, rows, profile.columns);

describe("deterministic arithmetic", () => {
  it("sums, averages and groups with real numbers", () => {
    const s = measureStats(rows, "revenue")!;
    expect(s.count).toBe(4);
    expect(s.sum).toBe(4700.5);
    expect(s.min).toBe(300);
    expect(groupBy(rows, "region", "revenue", "sum")).toEqual([
      { region: "north", "sum of revenue": 3600.5 },
      { region: "south", "sum of revenue": 800 },
      { region: "west", "sum of revenue": 300 },
    ]);
    expect(groupBy(rows, "region", null, "count")[0]).toEqual({ region: "north", count: 2 });
  });

  it("buckets by month in order", () => {
    const t = byPeriod(rows, "closed_at", "month", "units", "sum");
    expect(t).toEqual([
      { closed_at: "2026-01", "sum of units": 5 },
      { closed_at: "2026-02", "sum of units": 6 },
      { closed_at: "2026-03", "sum of units": 1 },
    ]);
  });

  it("filters numerically when both sides are numbers, textually otherwise", () => {
    expect(applyFilter(rows, { column: "units", op: "gte", value: 3 })).toHaveLength(2);
    expect(applyFilter(rows, { column: "region", op: "eq", value: "North" })).toHaveLength(2);
    expect(applyFilter(rows, { column: "region", op: "contains", value: "ou" })).toHaveLength(2);
  });
});

describe("plans", () => {
  it("keeps only columns that exist and drops a plan with nothing left", () => {
    const p = validatePlan({ aggregate: "avg", measure: "revenue", dimension: "ghost", limit: 99 }, profile)!;
    expect(p.measure).toBe("revenue");
    expect(p.dimension).toBeNull();
    expect(p.limit).toBe(40);
    expect(validatePlan({ aggregate: "sum", measure: "nope", dimension: "nope" }, profile)).toBeNull();
    expect(validatePlan("garbage", profile)).toBeNull();
  });

  it("will not treat a text column as a measure", () => {
    const p = validatePlan({ aggregate: "sum", measure: "region", dimension: "region" }, profile)!;
    expect(p.measure).toBeNull();
    expect(p.aggregate).toBe("count");
  });

  it("runs a grouped plan and describes it in plain words", () => {
    const plan = validatePlan({ aggregate: "sum", measure: "revenue", dimension: "region", filter: { column: "units", op: "gte", value: 2 }, limit: 5 }, profile)!;
    expect(describePlan(plan)).toBe("sum of revenue by region where units gte 2 (top 5)");
    const t = runPlan(rows, plan);
    expect(t.rowsUsed).toBe(3);
    expect(t.rows[0]).toEqual({ region: "north", "sum of revenue": 3600.5 });
  });

  it("runs a time plan at the month grain by default", () => {
    const plan = validatePlan({ aggregate: "count", date_column: "closed_at" }, profile)!;
    expect(plan.grain).toBe("month");
    expect(runPlan(rows, plan).rows).toHaveLength(3);
  });

  it("runs a bare measure plan into one stats row", () => {
    const plan = validatePlan({ aggregate: "avg", measure: "units" }, profile)!;
    const t = runPlan(rows, plan);
    expect(t.rows[0]).toMatchObject({ measure: "units", count: 5, sum: 12, average: 2.4 });
  });
});

describe("grounding", () => {
  it("hands shepherd real names, stats, ranges and sample rows only", () => {
    const g = buildGrounding({ sourceName: "sales", version: 1, rows, profile, quality, definitions: [{ column: "units", definition: "items shipped" }], instructions: "we sell bolts" });
    expect(g).toContain("source: sales · version 1 · 5 rows · 4 columns");
    expect(g).toContain("standing directions from the operator: we sell bolts");
    expect(g).toContain("revenue (currency");
    expect(g).toContain("from 2026-01-04 to 2026-03-01");
    expect(g).toContain("meaning: items shipped");
    expect(g).toContain("north | $1,200.50 | 2026-01-04 | 3");
  });
});

const rule = (kind: AlertRuleRow["kind"], spec: Partial<AlertRuleRow["spec"]>): AlertRuleRow => ({
  id: "r", workspace_id: "w", source_id: "s", name: "n", kind, active: true, created_at: "",
  spec: { metric: "units", aggregate: "sum", operator: ">", threshold: 10, sigma: 3, ...spec },
});

describe("alert evaluation", () => {
  it("fires a threshold rule only when the number crosses", () => {
    expect(evaluateRule(rule("threshold", { threshold: 10 }), rows, null)?.message).toContain("sum of units is 12, above 10");
    expect(evaluateRule(rule("threshold", { threshold: 20 }), rows, null)).toBeNull();
    expect(evaluateRule(rule("threshold", { operator: "<", threshold: 20 }), rows, null)?.message).toContain("below 20");
  });

  it("needs a previous version for a change rule", () => {
    expect(evaluateRule(rule("change", { operator: "change>", threshold: 10 }), rows, null)).toBeNull();
    const prev = rows.map((r) => ({ ...r, units: 1 }));
    const hit = evaluateRule(rule("change", { operator: "change>", threshold: 100 }), rows, prev)!;
    expect(hit.value).toBe(140);
    expect(hit.message).toContain("rose 140%");
  });

  it("flags a value far outside the column's range", () => {
    const wide = [...Array(12)].map((_, i) => ({ units: 10 + (i % 2) }));
    expect(evaluateRule(rule("anomaly", {}), wide, null)).toBeNull();
    const hit = evaluateRule(rule("anomaly", {}), [...wide, { units: 400 }], null)!;
    expect(hit.message).toContain("1 value(s) of units");
    expect(hit.value).toBe(400);
  });
});

describe("reports", () => {
  const source = { id: "s", workspace_id: "w", name: "sales", kind: "table", connector: null, config: {}, last_sync_at: null, last_sync_error: null, status: "ready", created_at: "" } as DataSourceRow;
  const version = { id: "v", workspace_id: "w", source_id: "s", version: 2, file_name: "sales.csv", mime: "text/csv", byte_size: 1, row_count: 5, column_count: 4, columns, quality, profile, note: null, text: null, created_at: "" } as DataVersionRow;
  it("writes every figure from the rows and says it was computed here", () => {
    const md = buildReportMarkdown({ template: "overview", source, version, rows, profile, quality, generatedAt: new Date("2026-10-25T10:00:00Z") });
    expect(md).toContain("# sales — overview report");
    expect(md).toContain("version 2 · 5 rows · 4 columns");
    expect(md).toContain(`score ${quality.score}/100`);
    expect(md).toContain("| north | 3600.5 |");
    expect(md).toContain("computed on this device");
  });
  it("says plainly when a trend has no time axis", () => {
    const noDate = buildDatasetProfile(["region", "units"], rows);
    const md = buildReportMarkdown({ template: "trend", source, version, rows, profile: noDate, quality, generatedAt: new Date() });
    expect(md).toContain("no date column was found");
  });
  it("compares against the previous version in an anomaly report", () => {
    const md = buildReportMarkdown({ template: "anomaly", source, version, rows, profile, quality, previousRows: rows.map((r) => ({ ...r, units: 1 })), generatedAt: new Date() });
    expect(md).toContain("change since the previous version");
    expect(md).toContain("| units | 5 | 12 | 140% |");
  });
});
