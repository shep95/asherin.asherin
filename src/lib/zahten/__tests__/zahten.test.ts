import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  buildTabHtml, clampInterval, ensureCsp, extractCode, extractSpec, parseAssessor, parseNeeds, parseRunReply, parseSpecName,
  parseSpecTrigger, parseStatus, parseWorkflowSteps, readTabAgentId, triggerLabel,
} from "@/lib/zahten/parse";
import { diffSchedules, desiredFrom } from "@/lib/zahten/scheduler";
import { exampleAgents, migrateLegacy, runsToTrim, createAgent, listAgents, updateAgent, deleteAgent, publishAgent, insertRun, listRuns, readPublished, unpublishAgent } from "@/lib/zahten/store";
import { resolveRunnable } from "@/lib/zahten/runtime";

const PASS = `**PASS 1 — first full draft**

**AGENT SPEC**
- name: Release Notes Digest
- purpose: turn pasted release notes into a short digest.
- trigger: interval(30m)
- input: release notes as text
- output: three short lists
- needs outside this device: GitHub api, Slack webhook

**WORKFLOW**
1. read the notes — split by heading
2. classify each line: change, risk, customer note
3. write the digest | under twenty words per line

**CODE**
\`\`\`ts
export interface Input { notes: string }
export async function run(input: Input) { return input.notes.length; }
\`\`\`

**TEST PLAN**
| scenario | input | expected | failure covered |
| empty | "" | empty digest | no input |

STATUS: COMPLETE — the digest covers every required list.`;

describe("asherin.agents · parsing what shepherd writes", () => {
  it("reads the status line in both spellings and misses it when absent", () => {
    expect(parseStatus(PASS)).toBe("complete");
    expect(parseStatus("…\nSTATUS: MISSION_COMPLETE — old wording")).toBe("complete");
    expect(parseStatus("STATUS: REFINING — needs failure handling")).toBe("refining");
    expect(parseStatus("no sentinel here")).toBeNull();
  });

  it("reads the assessor's verdict and falls back to ready", () => {
    expect(parseAssessor("READY\nsummarise release notes into a digest.")).toEqual({ ready: true, restated: "summarise release notes into a digest." });
    expect(parseAssessor("CLARIFY\n1. what input?\n2. what output?")).toEqual({ ready: false, questions: ["what input?", "what output?"] });
    expect(parseAssessor("CLARIFY")).toEqual({ ready: true, restated: "CLARIFY" });
    expect(parseAssessor("")).toEqual({ ready: true, restated: "scope confirmed." });
  });

  it("pulls the name, trigger and outside needs from the spec", () => {
    expect(parseSpecName(PASS)).toBe("release notes digest");
    expect(parseSpecTrigger(PASS)).toEqual({ kind: "interval", minutes: 30 });
    expect(parseSpecTrigger("- trigger: manual")).toEqual({ kind: "manual" });
    expect(parseSpecTrigger("- trigger: interval(2h)")).toEqual({ kind: "interval", minutes: 120 });
    expect(parseSpecTrigger("- trigger: interval(1m)")).toEqual({ kind: "interval", minutes: 5 });
    expect(parseSpecTrigger("nothing")).toBeNull();
    expect(parseNeeds(PASS)).toEqual(["GitHub api", "Slack webhook"]);
    expect(parseNeeds("- needs outside this device: none")).toEqual([]);
    expect(parseNeeds("- Secrets required: SLACK_TOKEN and GH_PAT")).toEqual(["SLACK_TOKEN", "GH_PAT"]);
  });

  it("clamps an interval to what a tab can honestly keep", () => {
    expect(clampInterval(1)).toBe(5);
    expect(clampInterval(30)).toBe(30);
    expect(clampInterval(100_000)).toBe(1440);
    expect(clampInterval(Number.NaN)).toBe(5);
  });

  it("reads numbered workflow steps and stops at the next heading", () => {
    const steps = parseWorkflowSteps(PASS);
    expect(steps.map((s) => s.label)).toEqual(["read the notes", "classify each line", "write the digest"]);
    expect(parseWorkflowSteps("")).toEqual([]);
    expect(parseWorkflowSteps("**WORKFLOW**\n(no steps)\n**CODE**\n1. not a step")).toEqual([]);
  });

  it("extracts the typescript block and the spec block", () => {
    expect(extractCode(PASS)).toContain("export async function run");
    expect(extractCode("no code")).toBe("");
    expect(extractCode("```typescript\nconst a = 1;\n```")).toBe("const a = 1;");
    expect(extractSpec(PASS)).toContain("- purpose:");
    expect(extractSpec(PASS)).not.toContain("**WORKFLOW**");
  });

  it("splits a run reply into log lines and output", () => {
    const r = parseRunReply("step 1 · read 12 lines\nstep 2 · 3 changes, 1 risk\n**OUTPUT**\n- changed: x\n- risk: y");
    expect(r.log).toEqual(["step 1 · read 12 lines", "step 2 · 3 changes, 1 risk"]);
    expect(r.output).toBe("- changed: x\n- risk: y");
    expect(parseRunReply("just an answer")).toEqual({ log: [], output: "just an answer" });
    expect(parseRunReply("")).toEqual({ log: [], output: "" });
  });

  it("names the trigger in words a person uses", () => {
    expect(triggerLabel({ kind: "manual" })).toBe("run now");
    expect(triggerLabel({ kind: "interval", minutes: 15 })).toBe("every 15 min while open");
  });
});

describe("asherin.agents · the published page", () => {
  const html = buildTabHtml({
    agentId: "a-1",
    name: "digest <b>",
    objective: "summarise & sort",
    steps: [{ n: 1, label: "read <notes>" }],
    code: "const x = '<script>';",
    trigger: { kind: "manual" },
    needs: ["Slack"],
  });

  it("escapes everything that came from the model or the operator", () => {
    expect(html).toContain("digest &lt;b&gt;");
    expect(html).toContain("summarise &amp; sort");
    expect(html).toContain("read &lt;notes&gt;");
    expect(html).toContain("const x = &#39;&lt;script&gt;&#39;;");
    expect(html).not.toContain("<b>");
  });

  it("carries the agent id, a no-network policy and the run bridge", () => {
    expect(readTabAgentId(html)).toBe("a-1");
    expect(html).toMatch(/Content-Security-Policy/);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('type:"zahten:run"');
    expect(html).toContain("needs outside this device: Slack");
  });

  it("adds the policy to a page that lacks one and leaves one that has it", () => {
    expect(ensureCsp("<html><head><title>t</title></head><body></body></html>")).toMatch(/<head><meta http-equiv="Content-Security-Policy"/);
    expect(ensureCsp("<p>bare</p>")).toMatch(/^<meta http-equiv="Content-Security-Policy"/);
    expect(ensureCsp(html)).toBe(html);
    expect(readTabAgentId("<html></html>")).toBeNull();
  });
});

describe("asherin.agents · schedules", () => {
  it("starts what is new or changed and stops what is gone", () => {
    const running = new Map([["a", 30], ["b", 15]]);
    const d = diffSchedules(running, [{ id: "a", minutes: 30 }, { id: "b", minutes: 60 }, { id: "c", minutes: 5 }]);
    expect(d.stop).toEqual(["b"]);
    expect(d.start).toEqual([{ id: "b", minutes: 60 }, { id: "c", minutes: 5 }]);
    expect(diffSchedules(running, [])).toEqual({ start: [], stop: ["a", "b"] });
  });

  it("only arms built agents with an interval", () => {
    const desired = desiredFrom([
      { id: "x", trigger: { kind: "interval", minutes: 30 }, status: "built", spec_text: "spec" },
      { id: "y", trigger: { kind: "interval", minutes: 30 }, status: "draft", spec_text: "" },
      { id: "z", trigger: { kind: "manual" }, status: "built", spec_text: "spec" },
    ]);
    expect(desired).toEqual([{ id: "x", minutes: 30 }]);
  });
});

describe("asherin.agents · the store on this device", () => {
  it("carries the operator's legacy agents across and drops the old demos", () => {
    const raw = JSON.stringify([
      { id: "agent-001", name: "GitHub Bug Triage", objective: "demo", passes: [] },
      { id: "agent-1700", name: "mine", objective: "do a thing", passes: [{ n: 1, status: "complete", text: PASS, startedAt: 1, endedAt: 2 }] },
      { id: "agent-1701", name: "empty", objective: "", passes: [] },
    ]);
    const out = migrateLegacy(raw);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("mine");
    expect(out[0].status).toBe("built");
    expect(out[0].spec_text).toBe(PASS);
    expect(out[0].example).toBe(false);
    expect(migrateLegacy(null)).toEqual([]);
    expect(migrateLegacy("not json")).toEqual([]);
    expect(migrateLegacy("{}")).toEqual([]);
  });

  it("ships examples that are marked as such and have no fake history", () => {
    for (const e of exampleAgents()) {
      expect(e.example).toBe(true);
      expect(e.status).toBe("draft");
      expect(e.passes).toEqual([]);
      expect(e.name).toBe(e.name.toLowerCase());
    }
  });

  it("trims runs beyond the cap, oldest first", () => {
    const runs = Array.from({ length: 53 }, (_, i) => ({ id: String(i), started_at: new Date(1_700_000_000_000 + i * 1000).toISOString() }));
    const gone = runsToTrim(runs);
    expect(gone.map((r) => r.id)).toEqual(["2", "1", "0"]);
    expect(runsToTrim(runs.slice(0, 10))).toEqual([]);
  });

  it("creates, builds, publishes, runs from the tab's id, unpublishes and removes an agent", async () => {
    const a = await createAgent({ name: "digest" });
    expect((await listAgents()).map((x) => x.id)).toContain(a.id);
    const built = await updateAgent(a.id, { spec_text: PASS, status: "built" });
    expect(built.spec_text).toBe(PASS);

    const pubId = await publishAgent(built, "<html><head></head><body>hi</body></html>");
    const row = await readPublished(pubId);
    expect(row?.status).toBe("published");
    expect(row?.metadata?.zahten_agent_id).toBe(a.id);
    const again = await publishAgent({ ...built, published_id: pubId }, "<html><head></head><body>v2</body></html>");
    expect(again).toBe(pubId);

    expect((await resolveRunnable(a.id))?.spec_text).toBe(PASS);
    expect(await resolveRunnable("missing")).toBeNull();

    await insertRun({ agent_id: a.id, source: "tab", status: "ok", input: "", log: ["step 1 · x"], output: "y", error: null, started_at: new Date().toISOString(), ended_at: new Date().toISOString() });
    expect(await listRuns(a.id)).toHaveLength(1);

    await unpublishAgent(a.id, pubId);
    expect(await readPublished(pubId)).toBeNull();
    expect((await listAgents()).find((x) => x.id === a.id)?.status).toBe("built");

    await deleteAgent(a.id);
    expect((await listAgents()).map((x) => x.id)).not.toContain(a.id);
    expect(await listRuns(a.id)).toHaveLength(0);
  });
});
