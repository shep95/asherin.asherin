import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { dayKey, modeShares, readUsage, streakFrom, summarizeUsage, type PromptRow } from "./usage";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();
const user = (created_at: string, conversation_id: string | null = "c1"): PromptRow => ({ role: "user", created_at, conversation_id });

describe("asherin.activity — usage facts", () => {
  it("counts prompts and replies separately and never reads content", () => {
    const f = summarizeUsage(
      [user(at(2026, 10, 25)), user(at(2026, 10, 25)), { role: "assistant", created_at: at(2026, 10, 25), conversation_id: "c1" }],
      [{ id: "c1", mode: "chat" }],
      new Date(2026, 9, 25, 18),
    );
    expect(f.prompts).toBe(2);
    expect(f.replies).toBe(1);
    expect(f.conversations).toBe(1);
  });

  it("attributes prompts to the mode of their conversation, in a fixed order, with unknown last", () => {
    const f = summarizeUsage(
      [user(at(2026, 10, 1), "a"), user(at(2026, 10, 1), "a"), user(at(2026, 10, 2), "b"), user(at(2026, 10, 3), "gone")],
      [{ id: "a", mode: "code" }, { id: "b", mode: "research" }],
      new Date(2026, 9, 3),
    );
    expect(f.byMode.map((m) => m.mode)).toEqual(["chat", "research", "code", "truth", "unknown"]);
    expect(f.byMode.find((m) => m.mode === "code")?.n).toBe(2);
    expect(f.byMode.find((m) => m.mode === "research")?.n).toBe(1);
    expect(f.byMode.find((m) => m.mode === "unknown")?.n).toBe(1);
  });

  it("omits the unknown bucket when every prompt has a conversation", () => {
    const f = summarizeUsage([user(at(2026, 10, 1))], [{ id: "c1", mode: "truth" }], new Date(2026, 9, 1));
    expect(f.byMode).toHaveLength(4);
  });

  it("counts active days on the local calendar and a streak back from today", () => {
    const now = new Date(2026, 9, 25, 9);
    const f = summarizeUsage(
      [user(at(2026, 10, 25)), user(at(2026, 10, 24)), user(at(2026, 10, 23)), user(at(2026, 10, 20))],
      [{ id: "c1", mode: "chat" }],
      now,
    );
    expect(f.activeDays).toBe(4);
    expect(f.streakDays).toBe(3);
    expect(f.firstAt).toBe(at(2026, 10, 20));
    expect(f.lastAt).toBe(at(2026, 10, 25));
  });

  it("a quiet today keeps yesterday's streak; a quiet yesterday ends it", () => {
    const days = new Set([dayKey(new Date(2026, 9, 24)), dayKey(new Date(2026, 9, 23))]);
    expect(streakFrom(days, new Date(2026, 9, 25, 8))).toBe(2);
    expect(streakFrom(days, new Date(2026, 9, 26, 8))).toBe(0);
    expect(streakFrom(new Set(), new Date())).toBe(0);
  });

  it("ignores an unparsable date for the day maths but still counts the prompt", () => {
    const f = summarizeUsage([user("not a date"), user(at(2026, 10, 25))], [{ id: "c1", mode: "chat" }], new Date(2026, 9, 25));
    expect(f.prompts).toBe(2);
    expect(f.activeDays).toBe(1);
  });

  it("empty input gives the empty shape, not nan", () => {
    const f = summarizeUsage([], [], new Date());
    expect(f.prompts).toBe(0);
    expect(f.streakDays).toBe(0);
    expect(f.firstAt).toBeNull();
    expect(modeShares(f.byMode, f.prompts).every((m) => m.pct === 0)).toBe(true);
  });

  it("mode shares are whole numbers that sum to 100", () => {
    const shares = modeShares(
      [{ mode: "chat", n: 1 }, { mode: "research", n: 1 }, { mode: "code", n: 1 }, { mode: "truth", n: 0 }],
      3,
    );
    expect(shares.reduce((s, m) => s + m.pct, 0)).toBe(100);
    expect(shares.find((m) => m.mode === "truth")?.pct).toBe(0);
  });

  it("reads the device's own chat rows through the shim", async () => {
    const uid = "44444444-4444-4444-8444-444444444444";
    const conv = await supabase.from("conversations").insert({ user_id: uid, title: "t", mode: "code" } as never).select().single();
    const cid = (conv.data as { id: string }).id;
    await supabase.from("messages").insert([
      { user_id: uid, conversation_id: cid, role: "user", content: "ENC:xx" },
      { user_id: uid, conversation_id: cid, role: "assistant", content: "ENC:yy" },
    ] as never);
    const f = await readUsage(uid);
    expect(f.prompts).toBe(1);
    expect(f.replies).toBe(1);
    expect(f.conversations).toBe(1);
    expect(f.byMode.find((m) => m.mode === "code")?.n).toBe(1);
    expect(f.streakDays).toBe(1);
  });
});
