import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/local/keys", () => ({
  getActiveModel: vi.fn(async () => null),
  getProviderKey: vi.fn(async () => null),
  VaultLockedError: class VaultLockedError extends Error {},
}));
vi.mock("@/lib/usage/ledger", () => ({ recordAiCall: vi.fn(async () => undefined) }));

import { LlmError } from "@/lib/local/llm";
import { describeModelFailure, normaliseLabRead, resolveHealthShepherd, askHealthShepherd } from "../shepherd";

describe("normaliseLabRead", () => {
  it("keeps only values with a finite number and a key, mapping catalogue keys to their label and unit", () => {
    const out = normaliseLabRead({
      values: [
        { key: "hemoglobin", value: "13,1", unit: "g/dl", collectedAt: "2026-03-01" },
        { key: "FERRITIN", value: 18 },
        { key: "mystery", label: "Something Printed", value: 4.2, unit: "au" },
        { key: "", value: 9 },
        { key: "hba1c", value: "n/a" },
      ],
      unreadable: ["a smudged line", 42, ""],
    });
    expect(out.values.map((v) => v.key)).toEqual(["hemoglobin", "ferritin", "mystery"]);
    expect(out.values[0]).toMatchObject({ label: "haemoglobin", unit: "g/dL", value: 13.1, collectedAt: "2026-03-01" });
    expect(out.values[2]).toMatchObject({ label: "Something Printed", unit: "au" });
    expect(out.unreadable).toEqual(["a smudged line"]);
  });

  it("drops a collection date that is not yyyy-mm-dd and survives garbage", () => {
    expect(normaliseLabRead({ values: [{ key: "ferritin", value: 1, collectedAt: "march" }] }).values[0].collectedAt).toBeUndefined();
    expect(normaliseLabRead(null)).toEqual({ values: [], unreadable: [] });
    expect(normaliseLabRead("nope")).toEqual({ values: [], unreadable: [] });
  });
});

describe("describeModelFailure", () => {
  it("writes each provider failure as one lowercase sentence that says what to do", () => {
    expect(describeModelFailure(new LlmError("Unauthorized", 401, "AUTH"))).toMatch(/refused the saved key/);
    expect(describeModelFailure(new LlmError("slow down", 429, "RATE_LIMIT", 4000))).toMatch(/rate-limiting/);
    expect(describeModelFailure(new LlmError("Bad Gateway", 502, "UPSTREAM_BUSY"))).toMatch(/busy/);
    expect(describeModelFailure(new LlmError("Context too long", 400, "BAD_REQUEST"))).toBe("the provider rejected the request: context too long");
    expect(describeModelFailure("???")).toBe("shepherd could not answer right now.");
  });

  it("never leaks a raw stack or an uppercase provider message", () => {
    const msg = describeModelFailure(new Error("Something Exploded\n    at fn (file.ts:1:1)"));
    expect(msg).toBe(msg.toLowerCase());
  });
});

describe("resolveHealthShepherd", () => {
  it("says plainly that no model is connected, and the assistant refuses with the same words instead of 'kernel offline'", async () => {
    const state = await resolveHealthShepherd();
    expect(state.ok).toBe(false);
    if (state.ok === false) expect(state.reason).toMatch(/connect a model key in settings → intelligence/);
    await expect(askHealthShepherd({ question: "what does this mean?", context: "" })).rejects.toThrow(/connect a model key/);
  });
});
