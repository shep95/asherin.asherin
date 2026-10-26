import { describe, expect, it } from "vitest";
import { PHRASE_TTL_MS, PhraseMatcher, overlapMs, recognitionLang, type SpokenPhrase } from "../transcripts";

const phrase = (startedAt: number, endedAt: number, text = "hello there"): SpokenPhrase => ({
  text,
  startedAt,
  endedAt,
  confidence: 0.9,
  lang: "en-US",
  local: false,
});

describe("phrase matcher", () => {
  it("pairs a phrase with the turn it overlaps most, whichever arrives first", () => {
    let now = 10_000;
    const m = new PhraseMatcher(() => now);
    expect(m.offerTurn({ id: "a", startedAt: 1_000, endedAt: 3_000 })).toBeNull();
    expect(m.offerTurn({ id: "b", startedAt: 4_000, endedAt: 7_000 })).toBeNull();
    // spans the end of a and most of b → b
    const turn = m.offerPhrase(phrase(2_800, 6_500));
    expect(turn?.id).toBe("b");
    expect(m.pendingTurns()).toBe(1);

    // the phrase arrives first, the turn second
    expect(m.offerPhrase(phrase(20_000, 22_000, "second"))).toBeNull();
    now = 23_000;
    const got = m.offerTurn({ id: "c", startedAt: 20_500, endedAt: 21_800 });
    expect(got?.text).toBe("second");
  });

  it("tolerates a small gap between a phrase and its turn, but not a large one", () => {
    const m = new PhraseMatcher(() => 0);
    m.offerTurn({ id: "a", startedAt: 1_000, endedAt: 2_000 });
    expect(m.offerPhrase(phrase(3_000, 3_500))).not.toBeNull(); // 1 s after the turn ended: paired
    m.offerTurn({ id: "b", startedAt: 10_000, endedAt: 11_000 });
    expect(m.offerPhrase(phrase(14_000, 15_000))).toBeNull(); // 3 s after: not this turn
    expect(m.pendingPhrases()).toBe(1);
  });

  it("drops what has waited too long instead of pairing it with the wrong turn", () => {
    let now = 0;
    const m = new PhraseMatcher(() => now);
    m.offerPhrase(phrase(0, 1_000, "stale"));
    now = PHRASE_TTL_MS + 2_000;
    expect(m.offerTurn({ id: "late", startedAt: now - 500, endedAt: now })).toBeNull();
    expect(m.pendingPhrases()).toBe(0);
  });

  it("measures overlap, negative when the windows do not touch", () => {
    expect(overlapMs({ startedAt: 0, endedAt: 10 }, { startedAt: 5, endedAt: 20 })).toBe(5);
    expect(overlapMs({ startedAt: 0, endedAt: 10 }, { startedAt: 12, endedAt: 20 })).toBe(-2);
  });
});

describe("recognition language", () => {
  it("auto follows the browser's own language; a code is passed through", () => {
    expect(recognitionLang("auto")).toBe(navigator.language || "en-US");
    expect(recognitionLang("")).toBe(navigator.language || "en-US");
    expect(recognitionLang("de")).toBe("de");
  });
});
