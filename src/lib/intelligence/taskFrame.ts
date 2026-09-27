// narrative modelling of an incoming ask.
//
// the ask is treated as a hypothesis about what is wanted, not as a final
// instruction. modality, domains, constraints and unknowns are extracted before
// any pattern is retrieved, because retrieval quality depends on this frame.

import type { TaskFrame, TaskModality } from "./types";

const MODALITY_SIGNALS: { modality: TaskModality; re: RegExp; domain: string }[] = [
  { modality: "debugging", re: /\b(bug|broken|error|fail\w*|crash\w*|regress\w*|stack trace|not working|throws?)\b/i, domain: "debugging" },
  { modality: "code", re: /\b(code|function|component|refactor|implement|typescript|sql|api|deploy)\b/i, domain: "software" },
  { modality: "research", re: /\b(research|sources?|investigate|osint|evidence|verify|corroborat)\b/i, domain: "research" },
  { modality: "writing", re: /\b(write|draft|essay|article|copy|rewrite|edit this text)\b/i, domain: "writing" },
  { modality: "planning", re: /\b(plan|roadmap|schedule|steps to|strategy for|milestones?)\b/i, domain: "planning" },
  { modality: "decision", re: /\b(should i|which (one|option)|decide|trade[- ]?off|pros and cons)\b/i, domain: "decision" },
  { modality: "analysis", re: /\b(analy[sz]e|dataset|statistics|trend|correlat|forecast|metrics)\b/i, domain: "analysis" },
  { modality: "design", re: /\b(design|layout|ui|ux|typography|palette|brand)\b/i, domain: "design" },
  { modality: "image", re: /\b(generate an image|image of|illustration|render a picture|logo)\b/i, domain: "image" },
  { modality: "vision", re: /\b(this (photo|image|screenshot)|what.s in this picture|look at this image)\b/i, domain: "vision" },
  { modality: "teaching", re: /\b(explain|teach me|how does .* work|what is a\b|walk me through)\b/i, domain: "teaching" },
];

const CONSTRAINT_SIGNALS = [
  /\b(must|has to|needs? to|only|never|do not|don'?t|without|no more than|at most|at least|under \d+)\b[^.!?\n]{0,90}/gi,
];

const UNKNOWN_SIGNALS = [
  /\b(not sure|unsure|unknown|don'?t know|unclear|maybe|might be|i think)\b[^.!?\n]{0,80}/gi,
];

export function frameTask(userText: string, hints: { priorGoal?: string } = {}): TaskFrame {
  const text = (userText || "").trim();
  const modalities: { modality: TaskModality; domain: string; hits: number }[] = [];

  for (const sig of MODALITY_SIGNALS) {
    const matches = text.match(new RegExp(sig.re.source, "gi"));
    if (matches?.length) modalities.push({ modality: sig.modality, domain: sig.domain, hits: matches.length });
  }
  modalities.sort((a, b) => b.hits - a.hits);

  // "mixed" is only honest when no single modality dominates. a clear leader
  // stays a clear leader even if a few weaker signals also fired.
  const dominant = modalities[0];
  const tiedLeaders = modalities.filter((m) => m.hits === dominant?.hits).length;
  const modality: TaskModality = modalities.length === 0
    ? "conversation"
    : tiedLeaders >= 3
      ? "mixed"
      : dominant.modality;


  const domains = modalities.length ? Array.from(new Set(modalities.map((m) => m.domain))) : ["general"];

  const constraints: string[] = [];
  for (const re of CONSTRAINT_SIGNALS) {
    for (const m of text.matchAll(re)) constraints.push(m[0].trim());
  }

  const unknowns: string[] = [];
  for (const re of UNKNOWN_SIGNALS) {
    for (const m of text.matchAll(re)) unknowns.push(m[0].trim());
  }
  if (text.length < 15 && !hints.priorGoal) unknowns.push("the ask is short — the real objective may be wider than the wording");

  // actors: capitalised multi-word names and bare @handles, cheaply detected.
  const named: string[] = text.match(/\b[A-Z][a-z]{2,}(?: [A-Z][a-z]{2,})+\b/g) ?? [];
  const handles: string[] = text.match(/@[a-zA-Z0-9_]{2,}/g) ?? [];
  const actors = Array.from(new Set([...named, ...handles])).slice(0, 8);


  const goal = hints.priorGoal && text.length < 25 ? hints.priorGoal : text.slice(0, 240);

  return {
    modality,
    goal,
    actors,
    constraints: Array.from(new Set(constraints)).slice(0, 10),
    unknowns: Array.from(new Set(unknowns)).slice(0, 10),
    domains,
  };
}
