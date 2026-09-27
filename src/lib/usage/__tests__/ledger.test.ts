import { describe, it, expect } from "vitest";
import {
  bucketBy,
  budgetState,
  estimateCostUsd,
  hasKnownRate,
  monthToDateUsd,
  readUsage,
  type UsageEvent,
} from "../ledger";

const ev = (p: Partial<UsageEvent>): UsageEvent => ({
  id: Math.random().toString(36).slice(2),
  tool: "chat",
  provider: "openai",
  model: null,
  function_name: null,
  prompt_tokens: null,
  completion_tokens: null,
  total_tokens: null,
  estimated_cost_usd: null,
  status: "ok",
  created_at: new Date().toISOString(),
  ...p,
});

describe("usage ledger maths", () => {
  it("prices only what the provider reported", () => {
    expect(estimateCostUsd("openai", null, null)).toBeNull();
    expect(estimateCostUsd("openai", 1_000_000, 0)).toBeCloseTo(2.5, 6);
    expect(estimateCostUsd("openai", 0, 1_000_000)).toBeCloseTo(10, 6);
  });

  it("refuses to invent a rate for an unknown provider", () => {
    expect(hasKnownRate("some-local-thing")).toBe(false);
    expect(estimateCostUsd("some-local-thing", 500, 500)).toBeNull();
  });

  it("marks tokens unknown rather than reporting zero", () => {
    const [b] = bucketBy([ev({}), ev({})], "tool");
    expect(b.calls).toBe(2);
    expect(b.tokensKnown).toBe(false);
    expect(b.costKnown).toBe(false);
  });

  it("buckets by tool, provider and day", () => {
    const events = [
      ev({ tool: "chat", provider: "openai", total_tokens: 10, estimated_cost_usd: 0.5 }),
      ev({ tool: "search", provider: "google", total_tokens: 20, estimated_cost_usd: 0.25 }),
    ];
    expect(bucketBy(events, "tool").map((b) => b.key).sort()).toEqual(["chat", "search"]);
    expect(bucketBy(events, "provider").map((b) => b.key).sort()).toEqual(["google", "openai"]);
    expect(bucketBy(events, "day")).toHaveLength(1);
  });

  it("month-to-date counts only this month and only recorded cost", () => {
    const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const events = [
      ev({ estimated_cost_usd: 1 }),
      ev({ estimated_cost_usd: 5, created_at: old }),
      ev({ estimated_cost_usd: null }),
    ];
    expect(monthToDateUsd(events)).toBeCloseTo(1, 6);
  });

  it("budget states are off until a limit is set", () => {
    expect(budgetState(5, null)).toBe("none");
    expect(budgetState(1, 10)).toBe("ok");
    expect(budgetState(8.5, 10)).toBe("warn");
    expect(budgetState(10, 10)).toBe("over");
  });

  it("reads token usage from the shapes edge functions return", () => {
    expect(readUsage({ usage: { prompt_tokens: 3, completion_tokens: 4 }, model: "m" })).toEqual({
      prompt: 3,
      completion: 4,
      model: "m",
    });
    expect(readUsage({ usage: { input_tokens: 7, output_tokens: 8 } })).toEqual({
      prompt: 7,
      completion: 8,
      model: null,
    });
    expect(readUsage({ text: "hi" })).toEqual({ prompt: null, completion: null, model: null });
  });
});
