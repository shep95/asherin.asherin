import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetBunkerForTests,
  applyBunker,
  bunkerBlockedCount,
  isBunkerOn,
  isFetchPatchedByDefender,
  restoreBunker,
  shouldFreeze,
} from "../signals";

afterEach(() => {
  __resetBunkerForTests();
  vi.restoreAllMocks();
});

describe("shouldFreeze", () => {
  it("freezes named tracker hosts and beacon paths", () => {
    expect(shouldFreeze("https://www.google-analytics.com/collect", "app.example")).toBe(true);
    expect(shouldFreeze("https://cdn.example.net/pixel.gif", "app.example")).toBe(true);
    expect(shouldFreeze("https://connect.facebook.net/en_US/fbevents.js", "app.example")).toBe(true);
  });

  it("never freezes the page's own origin or loopback, whatever the path says", () => {
    expect(shouldFreeze("https://app.example/api/beacon", "app.example")).toBe(false);
    expect(shouldFreeze("http://localhost:11434/v1/chat/completions", "app.example")).toBe(false);
    expect(shouldFreeze("http://127.0.0.1:1234/pixel", "app.example")).toBe(false);
  });

  it("leaves model-provider hosts and non-http schemes alone", () => {
    expect(shouldFreeze("https://api.openai.com/v1/chat/completions", "app.example")).toBe(false);
    expect(shouldFreeze("https://api.anthropic.com/v1/messages", "app.example")).toBe(false);
    expect(shouldFreeze("mailto:someone@example.com", "app.example")).toBe(false);
    expect(shouldFreeze("not a url at all", "app.example")).toBe(false);
  });
});

describe("bunker fetch wrapper", () => {
  it("passes every request through until applied, and only freezes trackers while on", async () => {
    const original = vi.fn(async () => new Response("ok"));
    window.fetch = original as unknown as typeof fetch;
    expect(isFetchPatchedByDefender()).toBe(false);

    applyBunker();
    expect(isBunkerOn()).toBe(true);
    expect(isFetchPatchedByDefender()).toBe(true);

    await expect(window.fetch("https://www.google-analytics.com/collect")).rejects.toBeInstanceOf(TypeError);
    expect(bunkerBlockedCount()).toBe(1);
    expect(original).not.toHaveBeenCalled();

    await window.fetch("https://api.openai.com/v1/chat/completions");
    expect(original).toHaveBeenCalledTimes(1);
  });

  it("restoring switches the freeze off but leaves the wrapper installed, which the probe reports as defender's own", async () => {
    const original = vi.fn(async () => new Response("ok"));
    window.fetch = original as unknown as typeof fetch;
    applyBunker();
    restoreBunker();
    expect(isBunkerOn()).toBe(false);
    expect(isFetchPatchedByDefender()).toBe(true);
    await window.fetch("https://www.google-analytics.com/collect");
    expect(original).toHaveBeenCalledTimes(1);
    expect(bunkerBlockedCount()).toBe(0);
  });

  it("installs the wrapper once, so a second apply does not stack", () => {
    const original = vi.fn(async () => new Response("ok"));
    window.fetch = original as unknown as typeof fetch;
    applyBunker();
    const wrapped = window.fetch;
    restoreBunker();
    applyBunker();
    expect(window.fetch).toBe(wrapped);
  });
});
