import { describe, expect, it } from "vitest";
import { buildSystemPrompt, isTrivialTurn } from "@/lib/local/prompts";
import { SHEPHERD_DOCTRINE, shepherdCore } from "@/lib/local/prompt/shepherdBrain";

describe("shepherd is the mind of the assistant", () => {
  it("names itself shepherd and carries the doctrine's own words on every turn", () => {
    const p = buildSystemPrompt({ mode: "chat", depth: "standard", lastUserText: "what is a tls certificate" });
    expect(p).toContain("you are shepherd.");
    expect(p).toContain("you are a pattern-reading assistant. you were not designed to be impressive.");
    expect(p).toContain("what you never do");
    expect(p).toContain("the decision architecture");
    expect(p).toContain("stage 5: confidence architecture");
    expect(p).toContain("the future is not hidden.");
    expect(p).toContain("dark. cold. cinematic.");
    // the 28 domains are present by name; the 274 subdomains are retrieved, not carried
    expect(p).toContain("total: 28 domains, 274 subdomains");
    expect(p).toContain("cybersecurity and digital pattern recognition");
    expect(p).not.toContain("13.9 credential stuffing and brute force pattern");
  });

  it("orders identity, doctrine core, then mode and depth, and closes on shepherd", () => {
    const p = buildSystemPrompt({ mode: "chat", depth: "standard", lastUserText: "what is a tls certificate" });
    expect(p.indexOf("## identity")).toBeLessThan(p.indexOf("## shepherd — who you are"));
    expect(p.indexOf("## shepherd — who you are")).toBeLessThan(p.indexOf("MODE: CONVERSATIONAL"));
    expect(p).toMatch(/SPEAKER BOUNDARY/);
    expect(p).toMatch(/VOICE \(binding on every turn\)/);
    expect(p.trim().endsWith("you are shepherd.")).toBe(true);
  });

  it("retrieves the doctrine sections a question calls for, and stays within a budget", () => {
    const negotiation = buildSystemPrompt({ mode: "chat", lastUserText: "review this contract clause and tell me the bargaining consequence of the termination fee" });
    expect(negotiation).toContain("doctrine retrieved for this turn");
    expect(negotiation).toMatch(/negotiation|bargaining/i);
    const hackers = buildSystemPrompt({ mode: "truth", lastUserText: "how does a ransomware operator think and move through a network" });
    expect(hackers).toContain("ransomware operator");
    for (const p of [negotiation, hackers]) {
      expect(p.length).toBeLessThan(80_000);
      expect(p.length).toBeLessThan(SHEPHERD_DOCTRINE.length / 2);
    }
  });

  it("a greeting gets the short contract and no retrieval; a question does not", () => {
    expect(isTrivialTurn("hey shepherd, you there bud")).toBe(true);
    expect(isTrivialTurn("what does port 443 carry")).toBe(false);
    const hello = buildSystemPrompt({ mode: "chat", lastUserText: "hey" });
    expect(hello).toContain("THIS TURN IS A GREETING");
    expect(hello).not.toContain("doctrine retrieved for this turn");
    const ask = buildSystemPrompt({ mode: "research", lastUserText: "who owns example.com" });
    expect(ask).not.toContain("THIS TURN IS A GREETING");
    expect(ask).toContain("MODE: RESEARCH");
  });

  it("never mentions a hosted backend, a persona costume, or the old corpus name", () => {
    const p = buildSystemPrompt({ mode: "truth", depth: "deep", lastUserText: "assess this claim" });
    expect(p).not.toMatch(/supabase|lovable|stripe/i);
    expect(p).not.toContain("You are ASHER AI");
    expect(p).not.toMatch(/aureon is the thinking-pattern corpus/i);
    expect(shepherdCore().length).toBeGreaterThan(8_000);
    expect(shepherdCore().length).toBeLessThan(40_000);
  });
});
