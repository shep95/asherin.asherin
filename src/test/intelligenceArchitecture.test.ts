// deterministic tests for the four layers added on top of the turn loop:
// intent routing, the transformation loop, feedback attribution, and pattern
// governance/quarantine. every assertion here is pure — no network, no db.

import { describe, it, expect } from "vitest";
import { routeIntent } from "@/lib/intelligence/intentRouter";
import { selectLoop, renderLoop, loopFlawClasses } from "@/lib/intelligence/transformLoop";
import { analyzeFeedback, repairProcedure } from "@/lib/intelligence/feedbackAnalyzer";
import { buildGovernance, assessQuarantine, applyQuarantine, isReviewDue, recordAudit } from "@/lib/intelligence/governance";
import { frameTask } from "@/lib/intelligence/taskFrame";
import { retrievePatterns } from "@/lib/intelligence/patternRelevance";
import { canTransition } from "@/lib/intelligence/patternLifecycle";
import type { FeedbackSignal, MemoryRecord, PatternObject } from "@/lib/intelligence/types";

function pattern(over: Partial<PatternObject> = {}): PatternObject {
  return {
    id: "p1",
    slug: "test-pattern",
    name: "test pattern",
    domain: "general",
    abstractionLevel: "operational",
    scope: "user",
    triggerTerms: ["deploy", "release"],
    inputs: [],
    preconditions: [],
    mechanism: "deploy straight to production without review",
    procedure: ["push the change", "deploy to production immediately"],
    constraints: [],
    failureModes: [],
    evidence: [],
    evidenceQuality: "moderate",
    confidence: 0.7,
    successCount: 2,
    failureCount: 0,
    contextsUsed: [],
    status: "active",
    source: "conversation",
    version: 1,
    ...over,
  };
}

function signal(text: string): FeedbackSignal {
  return { text, polarity: "negative", at: new Date().toISOString() };
}

function rule(content: string): MemoryRecord {
  return {
    id: "m1",
    content,
    kind: "never",
    scope: "user",
    status: "active",
    confidence: 0.9,
    evidenceCount: 2,
  } as MemoryRecord;
}

describe("intent router", () => {
  it("sends a broken existing artefact down the reverse loop", () => {
    const task = frameTask("why does this component crash when I open the page");
    const route = routeIntent(task, { message: "why does this component crash when I open the page" });
    expect(route.loop).toBe("reverse");
    expect(route.reasons.length).toBeGreaterThan(0);
  });

  it("sends a greenfield build down the forward loop", () => {
    const msg = "build a new billing page with a monthly plan selector";
    const route = routeIntent(frameTask(msg), { message: msg });
    expect(route.loop).toBe("forward");
  });

  it("keeps an open question in the dialogue loop", () => {
    const msg = "what is the difference between these two approaches";
    const route = routeIntent(frameTask(msg), { message: msg });
    expect(route.loop).toBe("dialogue");
    expect(route.lane).toBe("conversation");
  });

  it("records why it routed, so a bad answer can be blamed on the route", () => {
    const msg = "design a logo for the landing page";
    const route = routeIntent(frameTask(msg), { message: msg });
    expect(route.reasons.join(" ")).not.toHaveLength(0);
  });
});

describe("transformation loop", () => {
  it("blocks test stages when nothing can be executed, instead of pretending", () => {
    const plan = selectLoop("forward", { canRunTests: false });
    expect(plan.blocked.map((b) => b.id)).toContain("test");
    expect(renderLoop(plan)).toMatch(/cannot be completed/i);
  });

  it("blocks nothing when execution is genuinely available", () => {
    expect(selectLoop("forward", { canRunTests: true }).blocked).toHaveLength(0);
  });

  it("blocks observed behaviour when no artefact or trace was supplied", () => {
    const plan = selectLoop("reverse", { hasArtefact: false, canRunTests: true });
    expect(plan.blocked.map((b) => b.id)).toContain("observed");
  });

  it("gives the reverse loop a reconstruct-before-repair order", () => {
    const ids = selectLoop("reverse", { hasArtefact: true }).stages.map((s) => s.id);
    expect(ids.indexOf("root")).toBeLessThan(ids.indexOf("impl_repair"));
    expect(ids.indexOf("difference")).toBeLessThan(ids.indexOf("hypotheses"));
  });

  it("names the flaw classes each loop is responsible for", () => {
    expect(loopFlawClasses(selectLoop("forward")).length).toBeGreaterThan(0);
    expect(loopFlawClasses(selectLoop("dialogue")).length).toBeGreaterThan(0);
  });
});

describe("feedback attribution", () => {
  it("attributes a length complaint to communication, not to reasoning", () => {
    const a = analyzeFeedback(signal("this is way too long, get to the point"), { hasProject: false });
    expect(a.causeType).toBe("communication");
    expect(a.needsClarification).toBe(false);
  });

  it("keeps a first correction at response level — nothing durable is written", () => {
    const a = analyzeFeedback(signal("that's wrong"), { hasProject: false, repeatCount: 1 });
    expect(a.adaptationLevel).toBe("response");
  });

  it("escalates a repeated causal failure to an architecture change", () => {
    const a = analyzeFeedback(signal("you broke the same thing again"), { hasProject: false, repeatCount: 3 });
    expect(a.adaptationLevel).toBe("architecture");
    expect(a.causeType).toBe("workflow");
  });

  it("refuses to invent a cause for an unattributable complaint", () => {
    const a = analyzeFeedback(signal("hmm"), { hasProject: false, repeatCount: 2 });
    expect(a.causeType).toBe("unattributed");
    expect(a.needsClarification).toBe(true);
    expect(a.confidence).toBeLessThan(0.3);
  });

  it("ignores praise as a corrective signal", () => {
    const a = analyzeFeedback({ text: "perfect", polarity: "positive", at: "" }, { hasProject: false });
    expect(a.adaptationLevel).toBe("response");
    expect(a.scope).toBe("ephemeral");
  });

  it("produces a concrete repair procedure, not a restatement", () => {
    const a = analyzeFeedback(signal("you keep breaking the same thing"), { hasProject: false, repeatCount: 3 });
    expect(repairProcedure(a).length).toBeGreaterThan(1);
  });
});

describe("pattern governance", () => {
  it("stamps provenance, permissions and a review date on creation", () => {
    const g = buildGovernance(pattern({ scope: "project" }), { creatorEvent: "a correction", projectId: "proj-1" });
    expect(g.provenance.creatorEvent).toBe("a correction");
    expect(g.permissions.maxScope).toBe("project");
    expect(g.permissions.shareable).toBe(false);
    expect(new Date(g.reviewAfter).getTime()).toBeGreaterThan(Date.now());
  });

  it("quarantines a pattern with no traceable origin", () => {
    const v = assessQuarantine(pattern({ governance: undefined }));
    expect(v.quarantine).toBe(true);
    expect(v.reasons.join(" ")).toMatch(/origin|provenance/i);
  });

  it("quarantines a pattern that contradicts a standing never-rule", () => {
    const p = pattern();
    p.governance = buildGovernance(p, { creatorEvent: "seed" });
    const v = assessQuarantine(p, { standingRules: [rule("never deploy to production without review")] });
    expect(v.quarantine).toBe(true);
    expect(v.reasons.join(" ")).toMatch(/contradicts/i);
  });

  it("leaves a well-evidenced, non-contradicting pattern alone", () => {
    const p = pattern();
    p.governance = buildGovernance(p, { creatorEvent: "seed" });
    const v = assessQuarantine(p, { standingRules: [rule("never use bright colours")] });
    expect(v.quarantine).toBe(false);
  });

  it("quarantines a pattern that fails more than it succeeds", () => {
    const p = pattern({ failureCount: 4, successCount: 1 });
    p.governance = buildGovernance(p, { creatorEvent: "seed" });
    expect(assessQuarantine(p).quarantine).toBe(true);
  });

  it("keeps quarantine reversible and preserves the audit trail", () => {
    const p = pattern();
    p.governance = buildGovernance(p, { creatorEvent: "seed" });
    const q = applyQuarantine(p, { quarantine: true, reasons: ["contradiction"] });
    expect(q.status).toBe("quarantined");
    expect(q.governance?.auditTrail.length).toBe(2);
    expect(canTransition("quarantined", "candidate")).toBe(true);
    expect(canTransition("quarantined", "active")).toBe(false);
  });

  it("never retrieves a quarantined pattern into an answer", () => {
    const active = pattern({ id: "a", slug: "active-one" });
    const quarantined = pattern({ id: "b", slug: "bad-one", status: "quarantined" });
    const got = retrievePatterns([active, quarantined], {
      task: frameTask("help me deploy the release"),
      query: "deploy the release",
      conversationId: "c1",
    } as never);
    expect(got.map((r) => r.pattern.slug)).not.toContain("bad-one");
  });

  it("flags review as due once the horizon has passed", () => {
    const g = buildGovernance(pattern({ scope: "conversation" }), {
      creatorEvent: "seed",
      now: new Date(Date.now() - 30 * 86_400_000),
    });
    expect(isReviewDue(g)).toBe(true);
    expect(recordAudit(g, "reviewed", "checked")?.auditTrail.length).toBe(2);
  });
});
