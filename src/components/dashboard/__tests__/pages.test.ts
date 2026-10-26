// asherin.pages — the parsing and bounding logic the three generators share.
import { describe, expect, it } from "vitest";
import { DECK_LIMITS, parseSlides } from "@/lib/pages/deck";
import { lowerFirst } from "@/lib/pages/text";
import { EBOOK_LIMITS } from "../ebook/EBookGeneratorView";

describe("deck: parseSlides", () => {
  it("reads a clean json array and stamps ids", () => {
    const out = parseSlides('[{"title":"a","body":"b","layout":"title"},{"title":"c","body":"d","layout":"bullets"}]', 7);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: "sl-0-7", title: "a", body: "b", layout: "title" });
    expect(out[1].layout).toBe("bullets");
  });
  it("tolerates prose around the array", () => {
    const out = parseSlides('here you go:\n[{"title":"only","body":"","layout":"content"}]\nenjoy', 1);
    expect(out).toHaveLength(1);
  });
  it("falls back to the content layout for an unknown layout and drops empty objects", () => {
    const out = parseSlides('[{"title":"x","body":"y","layout":"hero"},{},{"layout":"quote"}]', 1);
    expect(out).toHaveLength(1);
    expect(out[0].layout).toBe("content");
  });
  it("returns nothing usable for prose, broken json or a non-array", () => {
    expect(parseSlides("sorry, no slides today")).toEqual([]);
    expect(parseSlides('[{"title": "cut off')).toEqual([]);
    expect(parseSlides('{"title":"not an array"}')).toEqual([]);
  });
  it("caps a runaway answer at the deck limit", () => {
    const many = JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ title: `s${i}`, body: "", layout: "content" })));
    expect(parseSlides(many)).toHaveLength(DECK_LIMITS.maxSlides);
  });
});

describe("page: lowerFirst", () => {
  it("lowercases only the first letter of a model-layer sentence", () => {
    expect(lowerFirst("The model provider is busy. Try again.")).toBe("the model provider is busy. Try again.");
    expect(lowerFirst("")).toBe("");
  });
});

describe("book: limits are stated, finite and ordered", () => {
  it("one model turn carries less than one source row, which is less than one file", () => {
    expect(EBOOK_LIMITS.promptChars).toBeLessThan(EBOOK_LIMITS.uploadChars);
    expect(EBOOK_LIMITS.grammarChars).toBeLessThanOrEqual(EBOOK_LIMITS.promptChars);
    expect(EBOOK_LIMITS.fileBytes).toBeGreaterThan(EBOOK_LIMITS.uploadChars);
    expect(DECK_LIMITS.promptChars).toBeLessThan(DECK_LIMITS.fileBytes);
  });
});
