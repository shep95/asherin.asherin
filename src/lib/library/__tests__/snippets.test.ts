import { describe, expect, it } from "vitest";
import { languageOf } from "../snippets";

describe("snippet language", () => {
  it("uses the declared language when the file states one", () => {
    expect(languageOf({ path: "a.txt", content: "", language: "python" })).toBe("python");
  });

  it("derives the language from the extension", () => {
    expect(languageOf({ path: "game/snake.ts", content: "" })).toBe("typescript");
    expect(languageOf({ path: "index.html", content: "" })).toBe("html");
  });

  it("falls back to plain text rather than guessing", () => {
    expect(languageOf({ path: "LICENSE", content: "" })).toBe("plaintext");
  });
});
