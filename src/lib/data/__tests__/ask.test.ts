import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({ askModel: vi.fn() }));

import { askModel } from "@/lib/ai";
import { answerQuestion, gradeConfidence, narrateReport } from "../ask";
import { buildDatasetProfile, buildQualityReport } from "../validate";
import type { DataRow } from "../types";

const mocked = vi.mocked(askModel);

const rows: DataRow[] = [
  { region: "north", revenue: "1200", closed_at: "2026-01-04" },
  { region: "south", revenue: "800", closed_at: "2026-01-11" },
  { region: "north", revenue: "2400", closed_at: "2026-02-02" },
  { region: "west", revenue: "300", closed_at: "2026-03-01" },
];
const columns = ["region", "revenue", "closed_at"];
const profile = buildDatasetProfile(columns, rows);
const quality = buildQualityReport(columns, rows, profile.columns);
const base = { question: "which region leads on revenue?", sourceName: "sales", version: 1, rows, profile, quality };

describe("asking shepherd", () => {
  beforeEach(() => mocked.mockReset());

  it("plans, computes on the device, narrates, and draws from the real rows", async () => {
    mocked
      .mockResolvedValueOnce(JSON.stringify({ plan: { aggregate: "sum", measure: "revenue", dimension: "region", limit: 5 }, intent: "comparison", clarification: null }))
      .mockResolvedValueOnce(JSON.stringify({
        finding: "north leads with 3600.", evidence: ["north: 3600", "south: 800"], pattern: null, projection: "watch west.", clarification: null,
        chart: { x: "region", y: "revenue", title: "revenue by region", insight: "north is well ahead" },
      }));
    const stages: string[] = [];
    const a = await answerQuestion({ ...base, onStage: (s) => stages.push(s) });
    expect(stages).toEqual(["planning", "computing", "narrating"]);
    expect(a.computed?.note).toBe("sum of revenue by region (top 5)");
    expect(a.computed?.rows[0]).toEqual({ region: "north", "sum of revenue": 3600 });
    expect(a.finding).toBe("north leads with 3600.");
    expect(a.evidence).toEqual(["north: 3600", "south: 800"]);
    expect(a.chart?.render).toBe("bar");
    expect(a.chart?.data).toEqual([{ region: "north", revenue: 3600 }, { region: "south", revenue: 800 }, { region: "west", revenue: 300 }]);
    expect(a.chart?.title).toBe("revenue by region");
    expect(a.confidence_drivers).toEqual({ completeness: 100, rows: 4, computed: true, structured: true });
    expect(a.reasoning.model).toBe("shepherd");
    // the narration prompt carried the computed table, not just the question
    const narratePrompt = mocked.mock.calls[1][0];
    expect(narratePrompt).toContain("computed on this device — sum of revenue by region (top 5) — from 4 rows");
    expect(narratePrompt).toContain("north | 3600");
    expect(mocked.mock.calls[0][1]?.json).toBe(true);
  });

  it("ignores a plan that names columns the data does not have and still answers", async () => {
    mocked
      .mockResolvedValueOnce(JSON.stringify({ plan: { aggregate: "sum", measure: "profit", dimension: "country" }, intent: "comparison" }))
      .mockResolvedValueOnce(JSON.stringify({ finding: "the data has no profit column.", evidence: [], chart: null, clarification: "profit is not in this file" }));
    const a = await answerQuestion(base);
    expect(a.computed).toBeNull();
    expect(a.reasoning.plan).toContain("no computation");
    expect(a.clarification).toBe("profit is not in this file");
    expect(a.chart).toBeNull();
  });

  it("falls back to shepherd's prose when the reply is not json, and marks confidence low", async () => {
    mocked
      .mockResolvedValueOnce("not json at all")
      .mockResolvedValueOnce("north is doing well, broadly speaking.");
    const a = await answerQuestion(base);
    expect(a.finding).toBe("north is doing well, broadly speaking.");
    expect(a.confidence).toBe("low");
    expect(a.confidence_drivers.structured).toBe(false);
    expect(a.clarification).toContain("not structured");
  });

  it("drops a chart whose columns do not exist instead of drawing decoration", async () => {
    mocked
      .mockResolvedValueOnce(JSON.stringify({ plan: null, intent: "summary" }))
      .mockResolvedValueOnce(JSON.stringify({ finding: "f", evidence: [], chart: { x: "ghost", y: "phantom", title: "t", insight: "i" } }));
    const a = await answerQuestion(base);
    expect(a.chart).toBeNull();
  });

  it("surfaces a model failure instead of hiding it", async () => {
    // once per call: a persistent rejecting implementation after mockReset trips
    // vitest's unhandled-rejection tracking, which is harness behaviour, not the room's
    const refuse = () => Promise.reject(new Error("connect a model key in settings → ai keys to start chatting."));
    mocked.mockImplementationOnce(refuse).mockImplementationOnce(refuse);
    let caught: unknown = null;
    try { await answerQuestion(base); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("connect a model key");
    // the plan call failed first and was absorbed; the narration failure is the one surfaced
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it("answers a document from its text with one call and no chart", async () => {
    mocked.mockResolvedValueOnce(JSON.stringify({ finding: "the memo is about bolts.", evidence: [] }));
    const a = await answerQuestion({ ...base, rows: [], profile: buildDatasetProfile([], [], "bolts"), quality: buildQualityReport([], [], []), text: "we sell bolts" });
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked.mock.calls[0][0]).toContain("we sell bolts");
    expect(a.chart).toBeNull();
    expect(a.reasoning.plan).toContain("document");
  });

  it("grades confidence from the device's own evidence", () => {
    expect(gradeConfidence({ completeness: 100, rows: 500, computed: true, structured: true }, null)).toBe("high");
    expect(gradeConfidence({ completeness: 80, rows: 50, computed: false, structured: true }, null)).toBe("low");
    expect(gradeConfidence({ completeness: 95, rows: 50, computed: true, structured: true }, "unclear")).toBe("moderate");
    expect(gradeConfidence({ completeness: 100, rows: 500, computed: true, structured: false }, null)).toBe("low");
  });

  it("returns null commentary when shepherd cannot be reached", async () => {
    mocked.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    expect(await narrateReport("# r")).toBeNull();
    mocked.mockResolvedValueOnce("  north stands out.  ");
    expect(await narrateReport("# r")).toBe("north stands out.");
  });
});
