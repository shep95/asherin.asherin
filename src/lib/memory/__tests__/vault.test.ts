// asherin.vault — extraction parsing, the writer, forgetting, and the brief.
// runs against the real on-device shim (fake-indexeddb) with the model mocked.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({ askModel: vi.fn(async () => "{}") }));
vi.mock("@/lib/local/keys", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/local/keys")>();
  return { ...real, getActiveModel: vi.fn(async () => null), hasProviderKey: vi.fn(async () => false) };
});

import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/lib/local/auth";
import { isEncrypted } from "@/lib/encryption";
import {
  LIMITS,
  VAULT_TABLE,
  PATTERN_TABLE,
  GROWTH_TABLE,
  parseDistillation,
  buildDistillPrompt,
  distillTurn,
  loadVault,
  openRow,
  forgetEntry,
  forgetPattern,
  forgetEverything,
  composeVaultContext,
} from "@/lib/memory/vault";

const uid = () => getLocalUser().id;

async function setMemory(on: boolean) {
  const user = uid();
  const { data } = await supabase.from("ai_intelligence_settings").select("id").eq("user_id", user).limit(1);
  if ((data ?? []).length) {
    await supabase.from("ai_intelligence_settings").update({ memory_enabled: on }).eq("user_id", user);
  } else {
    await supabase.from("ai_intelligence_settings").insert({ user_id: user, memory_enabled: on, learning_enabled: true, global_contribution_enabled: false });
  }
}

async function wipe() {
  for (const t of [VAULT_TABLE, PATTERN_TABLE, GROWTH_TABLE]) await supabase.from(t).delete().eq("user_id", uid());
}

const GOOD = JSON.stringify({
  knowledge: [
    { facet: "work", label: "Builds a local-first app", content: "the operator is building asherin, a local-first react app.", confidence: 0.9 },
    { facet: "style", label: "wants lowercase copy", content: "prefers interface copy in lowercase.", sensitive: false, confidence: 0.8 },
  ],
  patterns: [{ name: "Answer first, reasons after", domain: "writing", trigger: "any explanation", procedure: "state the answer in one line, then give the reasons." }],
  note: "Learned the project and a copy preference.",
});

describe("parseDistillation — the strict json contract", () => {
  it("accepts a clean object and lowercases labels, names and the note", () => {
    const d = parseDistillation(GOOD);
    expect(d.knowledge).toHaveLength(2);
    expect(d.knowledge[0].label).toBe("builds a local-first app");
    expect(d.patterns[0].name).toBe("answer first, reasons after");
    expect(d.note).toBe("learned the project and a copy preference.");
    expect(d.refused).toEqual([]);
  });

  it("reads json out of a fenced reply and returns an empty distillation for garbage", () => {
    expect(parseDistillation("```json\n" + GOOD + "\n```").knowledge).toHaveLength(2);
    expect(parseDistillation("sorry, nothing durable here")).toEqual({ knowledge: [], patterns: [], note: null, refused: [] });
    expect(parseDistillation("[1,2,3]").knowledge).toHaveLength(0);
    expect(parseDistillation("")).toEqual({ knowledge: [], patterns: [], note: null, refused: [] });
  });

  it("caps counts and lengths, normalises unknown facets and clamps confidence", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ facet: "nonsense", label: `thing ${i}`, content: "x".repeat(1000), confidence: 7 }));
    const d = parseDistillation(JSON.stringify({ knowledge: many, patterns: Array.from({ length: 6 }, (_, i) => ({ name: `p${i}`, domain: "d", trigger: "t", procedure: "p" })) }));
    expect(d.knowledge).toHaveLength(LIMITS.knowledgePerTurn);
    expect(d.patterns).toHaveLength(LIMITS.patternsPerTurn);
    expect(d.knowledge[0].facet).toBe("context");
    expect(d.knowledge[0].content.length).toBe(LIMITS.contentChars);
    expect(d.knowledge[0].confidence).toBe(1);
  });

  it("refuses anything credential-shaped and names why", () => {
    const d = parseDistillation(
      JSON.stringify({
        knowledge: [
          { facet: "context", label: "openai key", content: "their key is sk-live-abcdefghijklmnopqrstuvwxyz0123" },
          { facet: "context", label: "password", content: "password is hunter2hunter2" },
          { facet: "interest", label: "likes chess", content: "plays chess most evenings." },
        ],
      }),
    );
    expect(d.knowledge.map((k) => k.label)).toEqual(["likes chess"]);
    expect(d.refused).toHaveLength(2);
    expect(d.refused[0].reason).toMatch(/api key/);
  });

  it("forces private on the secret facet and on health or money content", () => {
    const d = parseDistillation(
      JSON.stringify({
        knowledge: [
          { facet: "secret", label: "a secret", content: "something told in confidence." },
          { facet: "context", label: "diagnosis", content: "was recently diagnosed with asthma." },
          { facet: "interest", label: "cycling", content: "cycles on weekends." },
        ],
      }),
    );
    expect(d.knowledge.map((k) => k.sensitive)).toEqual([true, true, false]);
  });

  it("drops duplicate facet+label pairs within one turn", () => {
    const d = parseDistillation(JSON.stringify({ knowledge: [{ facet: "work", label: "Role", content: "a" }, { facet: "work", label: "role", content: "b" }] }));
    expect(d.knowledge).toHaveLength(1);
  });

  it("bounds what is sent to the model", () => {
    const p = buildDistillPrompt("u".repeat(10_000), "a".repeat(10_000));
    expect(p.length).toBeLessThan(LIMITS.userTextChars + LIMITS.assistantTextChars + 200);
  });
});

describe("distillTurn — the device-side writer", () => {
  beforeEach(async () => {
    await wipe();
    await setMemory(true);
  });

  const turn = (ask: (p: string) => Promise<string>, conversationId = "conv-1") =>
    distillTurn({
      conversationId,
      userId: uid(),
      userText: "i am building asherin, a local-first react app, and i want every bit of copy in lowercase please.",
      assistantText: "understood — lowercase copy throughout.",
      ask,
    });

  it("writes nothing while memory is off", async () => {
    await setMemory(false);
    const ask = vi.fn(async () => GOOD);
    const r = await turn(ask);
    expect(r.skipped).toBe("memory off");
    expect(ask).not.toHaveBeenCalled();
    expect((await loadVault(uid())).rows).toHaveLength(0);
  });

  it("skips a turn too short to teach anything", async () => {
    const ask = vi.fn(async () => GOOD);
    const r = await distillTurn({ conversationId: "c", userId: uid(), userText: "hi", assistantText: "hello", ask });
    expect(r.skipped).toBe("too short");
    expect(ask).not.toHaveBeenCalled();
  });

  it("stays quiet when no model key is present instead of raising the key dialog", async () => {
    const r = await distillTurn({ conversationId: "c", userId: uid(), userText: "x".repeat(60), assistantText: "y" });
    expect(r.skipped).toBe("no model");
  });

  it("seals every row with the device key and records growth", async () => {
    const r = await turn(async () => GOOD);
    expect(r).toMatchObject({ ran: true, learned: 2, reinforced: 0, patterns: 1 });
    const snap = await loadVault(uid());
    expect(snap.rows).toHaveLength(2);
    for (const row of snap.rows) {
      expect(row.encrypted).toBe(true);
      expect(isEncrypted(row.content)).toBe(true);
      expect(row.enabled).toBe(true);
    }
    const opened = await openRow(snap.rows.find((x) => x.facet === "style")!, uid());
    expect(opened).toBe("prefers interface copy in lowercase.");
    expect(snap.patterns[0]).toMatchObject({ slug: "answer-first-reasons-after", potency: 1, active: true });
    expect(snap.growth).toMatchObject({ sessions: 1, entries: 2, patterns: 1, density: 2 });
    expect(snap.growth?.last_note).toBe("learned the project and a copy preference.");
  });

  it("reinforces a repeat instead of duplicating it, and counts a new conversation once", async () => {
    await turn(async () => GOOD, "conv-1");
    const r = await turn(async () => GOOD, "conv-2");
    expect(r).toMatchObject({ learned: 0, reinforced: 2, patterns: 1 });
    const snap = await loadVault(uid());
    expect(snap.rows).toHaveLength(2);
    expect(snap.rows.every((x) => x.occurrences === 2)).toBe(true);
    expect(snap.patterns).toHaveLength(1);
    expect(snap.patterns[0].potency).toBe(2);
    expect(snap.growth).toMatchObject({ sessions: 2, entries: 2, density: 1 });
    const again = await turn(async () => GOOD, "conv-2");
    expect(again.ran).toBe(true);
    expect((await loadVault(uid())).growth?.sessions).toBe(2);
  });

  it("writes nothing when the model fails or answers with nothing durable", async () => {
    const failed = await turn(async () => {
      throw new Error("boom");
    });
    expect(failed.skipped).toBe("model failed");
    const nothing = await turn(async () => '{"knowledge":[],"patterns":[]}');
    expect(nothing.skipped).toBe("nothing durable");
    expect((await loadVault(uid())).rows).toHaveLength(0);
    expect((await loadVault(uid())).growth).toBeNull();
  });
});

describe("forgetting really deletes", () => {
  beforeEach(async () => {
    await wipe();
    await setMemory(true);
    await distillTurn({ conversationId: "c1", userId: uid(), userText: "x".repeat(60), assistantText: "y", ask: async () => GOOD });
  });

  it("forgetEntry removes one row and the growth count follows", async () => {
    const before = await loadVault(uid());
    expect(before.rows).toHaveLength(2);
    const gone = await forgetEntry(uid(), before.rows[0].id);
    expect(gone).toBe(true);
    const after = await loadVault(uid());
    expect(after.rows).toHaveLength(1);
    expect(after.rows.find((r) => r.id === before.rows[0].id)).toBeUndefined();
    expect(after.growth?.entries).toBe(1);
  });

  it("forgetPattern removes one pattern", async () => {
    const before = await loadVault(uid());
    expect(await forgetPattern(uid(), before.patterns[0].id)).toBe(true);
    const after = await loadVault(uid());
    expect(after.patterns).toHaveLength(0);
    expect(after.growth?.patterns).toBe(0);
  });

  it("forgetEverything leaves no row in any of the three tables", async () => {
    expect(await forgetEverything(uid())).toBe(true);
    const after = await loadVault(uid());
    expect(after.rows).toHaveLength(0);
    expect(after.patterns).toHaveLength(0);
    expect(after.growth).toBeNull();
  });
});

describe("composeVaultContext — the silent brief", () => {
  beforeEach(async () => {
    await wipe();
    await setMemory(true);
    await distillTurn({
      conversationId: "c1",
      userId: uid(),
      userText: "x".repeat(60),
      assistantText: "y",
      ask: async () =>
        JSON.stringify({
          knowledge: [
            { facet: "directive", label: "lowercase", content: "always write interface copy in lowercase." },
            { facet: "work", label: "react app", content: "builds a react app called asherin." },
            { facet: "interest", label: "chess", content: "plays chess." },
            { facet: "secret", label: "private thing", content: "told in confidence." },
          ],
        }),
    });
  });

  it("carries directives always, relevant rows by overlap, and never a private row", async () => {
    const brief = await composeVaultContext(uid(), "help me with my react app");
    expect(brief).toContain("never quote it");
    expect(brief).toContain("directive: always write interface copy in lowercase.");
    expect(brief).toContain("work: builds a react app called asherin.");
    expect(brief).not.toContain("chess");
    expect(brief).not.toContain("told in confidence");
  });

  it("is empty when memory is off", async () => {
    await setMemory(false);
    expect(await composeVaultContext(uid(), "react app")).toBe("");
  });
});
