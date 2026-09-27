import { describe, expect, it } from "vitest";
import { buildPosture, scorePosture, triage, exportEvidence, type Finding } from "../posture";
import { PROTECTIONS, PROTECTION_COUNT, BROWSER_MEASURABLE, AGENT_MEASURABLE } from "../protections";

const f = (id: string, state: Finding["state"], source: Finding["source"] = "browser"): Finding => ({
  id,
  state,
  source,
  observed: "measured in test",
});

describe("defender register", () => {
  it("has unique ids and a source for every protection", () => {
    const ids = PROTECTIONS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PROTECTIONS.every((p) => ["browser", "agent", "both"].includes(p.src))).toBe(true);
    expect(PROTECTION_COUNT).toBe(PROTECTIONS.length);
    expect(BROWSER_MEASURABLE + AGENT_MEASURABLE).toBeGreaterThan(PROTECTION_COUNT);
  });
});

describe("buildPosture", () => {
  it("marks anything nobody measured as unmeasured, never pass", () => {
    const rows = buildPosture([]);
    expect(rows).toHaveLength(PROTECTION_COUNT);
    expect(rows.every((r) => r.finding.state === "unmeasured" && r.finding.source === "none")).toBe(true);
  });

  it("drops readings whose id is not in the register", () => {
    const rows = buildPosture([f("not.a.real.check", "pass")]);
    expect(rows.every((r) => r.finding.state === "unmeasured")).toBe(true);
  });

  it("lets a failing agent reading override a passing browser reading", () => {
    const id = PROTECTIONS.find((p) => p.src === "both")!.id;
    const rows = buildPosture([f(id, "pass", "browser")], [f(id, "fail", "agent")]);
    const row = rows.find((r) => r.id === id)!;
    expect(row.finding.state).toBe("fail");
    expect(row.finding.source).toBe("agent");
  });
});

describe("scorePosture", () => {
  it("scores only what was measured and reports coverage separately", () => {
    const ids = PROTECTIONS.slice(0, 4).map((p) => p.id);
    const score = scorePosture(buildPosture(ids.map((id) => f(id, "pass"))));
    expect(score.score).toBe(1000);
    expect(score.pass).toBe(4);
    expect(score.unmeasured).toBe(PROTECTION_COUNT - 4);
    expect(score.coverage).toBeLessThan(100);
  });

  it("a fail pulls the score below a warn", () => {
    const [a, b] = PROTECTIONS;
    const warn = scorePosture(buildPosture([f(a.id, "warn"), f(b.id, "pass")]));
    const fail = scorePosture(buildPosture([f(a.id, "fail"), f(b.id, "pass")]));
    expect(fail.score).toBeLessThan(warn.score);
  });
});

describe("triage and export", () => {
  it("puts failures first", () => {
    const [a, b, c] = PROTECTIONS;
    const rows = triage(buildPosture([f(a.id, "pass"), f(b.id, "warn"), f(c.id, "fail")]));
    expect(rows[0].finding.state).toBe("fail");
    expect(rows[1].finding.state).toBe("warn");
  });

  it("exports every finding as parseable json", () => {
    const rows = buildPosture([f(PROTECTIONS[0].id, "fail")]);
    const parsed = JSON.parse(exportEvidence(rows, { device: "test" }));
    expect(parsed.findings).toHaveLength(PROTECTION_COUNT);
    expect(parsed.register_size).toBe(PROTECTION_COUNT);
    expect(parsed.findings[0].state).toBe("fail");
  });
});
