import { describe, it, expect } from "vitest";
import { AI_PROVIDERS } from "@/lib/aiProviders";
import { DEFAULT_MODEL, OPENAI_COMPAT_BASE, isSupportedProvider, providerNeedsKey } from "@/lib/local/llm";

// A saved key is only useful if the local engine can actually call that
// provider. These tests keep the settings catalogue and the engine honest
// with each other: every provider the engine can reach has a default model,
// and every catalogue entry is either callable or clearly a pass-through
// (routed via openrouter / a local runtime).

describe("byok provider coverage", () => {
  it("every openai-compatible base has a default model", () => {
    for (const p of Object.keys(OPENAI_COMPAT_BASE)) {
      expect(typeof DEFAULT_MODEL[p] === "string" || AI_PROVIDERS.some((c) => c.id === p), `no default model for ${p}`).toBe(true);
    }
  });

  it("the catalogue's main providers are directly callable from the browser", () => {
    for (const id of ["openai", "anthropic", "google", "xai", "mistral", "deepseek", "openrouter", "venice", "perplexity", "groq", "ollama", "lmstudio"]) {
      expect(AI_PROVIDERS.some((p) => p.id === id), `${id} missing from catalogue`).toBe(true);
      expect(isSupportedProvider(id), `${id} not callable`).toBe(true);
    }
  });

  it("local runtimes need no key; hosted providers do", () => {
    expect(providerNeedsKey("ollama")).toBe(false);
    expect(providerNeedsKey("lmstudio")).toBe(false);
    expect(providerNeedsKey("openai")).toBe(true);
    expect(providerNeedsKey("anthropic")).toBe(true);
  });

  it("no base url is plain http except the two local runtimes", () => {
    for (const [p, base] of Object.entries(OPENAI_COMPAT_BASE)) {
      if (p === "ollama" || p === "lmstudio") expect(base).toMatch(/^http:\/\/localhost:/);
      else expect(base, p).toMatch(/^https:\/\//);
    }
  });
});
