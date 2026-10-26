// asherin.design — pure helpers the room's components and ZaliView share.
// No react, no storage, no network: everything here is unit-testable.

import type { ZaliMessage, ZaliProject } from "./types";

/* ── research findings ─────────────────────────────────────────────────── */

export const RESEARCH_DOMAINS = [
  "physics", "chemistry", "biology", "engineering",
  "economics", "manufacturing", "sustainability", "safety",
] as const;
export type ResearchDomainKey = (typeof RESEARCH_DOMAINS)[number];

const DOMAIN_ALIASES: Record<string, ResearchDomainKey> = {
  optics: "physics", optical: "physics", thermal: "physics", electromagnetics: "physics",
  materials: "chemistry", material: "chemistry", chemical: "chemistry",
  medical: "biology", medicine: "biology", biological: "biology", biomedical: "biology",
  electrical: "engineering", mechanical: "engineering", structural: "engineering", software: "engineering",
  cost: "economics", costs: "economics", market: "economics", pricing: "economics", economic: "economics",
  production: "manufacturing", assembly: "manufacturing", fabrication: "manufacturing",
  environment: "sustainability", environmental: "sustainability", sustainable: "sustainability",
  ethics: "safety", legal: "safety", compliance: "safety", regulatory: "safety",
};

export function normalizeDomain(raw: string): ResearchDomainKey | null {
  const key = raw.trim().toLowerCase().replace(/\s+&\s+.*$/, "").replace(/[^a-z]/g, "");
  if ((RESEARCH_DOMAINS as readonly string[]).includes(key)) return key as ResearchDomainKey;
  return DOMAIN_ALIASES[key] ?? null;
}

export interface ResearchFinding {
  domain: ResearchDomainKey;
  title: string;
}

/**
 * shepherd tags a domain fact as `[RESEARCH: physics] one-line finding`.
 * One finding per tag, de-duplicated by domain + title, title capped at 160
 * chars. Unknown domains are dropped rather than guessed.
 */
export function extractResearchFindings(text: string): ResearchFinding[] {
  const out: ResearchFinding[] = [];
  const seen = new Set<string>();
  const re = /\[RESEARCH:\s*([a-z &/-]+?)\s*\]\s*:?\s*([^\n]*)/gi;
  for (const m of text.matchAll(re)) {
    const domain = normalizeDomain(m[1]);
    if (!domain) continue;
    const title = m[2].replace(/[*_`]/g, "").trim().slice(0, 160) || `${domain} note`;
    const key = `${domain}|${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ domain, title });
  }
  return out;
}

/* ── question options ──────────────────────────────────────────────────── */

export interface QuestionOption {
  text: string;
  description: string;
  isRecommended: boolean;
}

/** Parse the ```options fence shepherd ends an open question with; also strips ```design_output from display. */
export function parseQuestionOptions(content: string): { cleanContent: string; options: QuestionOption[] } {
  // Remove design_output blocks from display
  const cleaned = content.replace(/```design_output[^\n]*\r?\n[\s\S]*?```/gi, "").trim();

  const optionsRegex = /```options[^\n]*\r?\n([\s\S]*?)```/i;
  const match = cleaned.match(optionsRegex);
  if (!match) return { cleanContent: cleaned, options: [] };

  const cleanContent = cleaned.replace(optionsRegex, "").trim();
  const lines = match[1].trim().split("\n").filter(Boolean);

  const options: QuestionOption[] = lines.slice(0, 8).map((line) => {
    const isRecommended = line.startsWith("[RECOMMENDED]");
    const raw = isRecommended ? line.replace("[RECOMMENDED]", "").trim() : line.trim();
    const dashIdx = raw.indexOf("—");
    const emIdx = raw.indexOf(" — ");
    const splitIdx = emIdx !== -1 ? emIdx : dashIdx;

    if (splitIdx > 0) {
      return {
        text: raw.slice(0, splitIdx).trim(),
        description: raw.slice(splitIdx + (emIdx !== -1 ? 3 : 1)).trim(),
        isRecommended,
      };
    }
    return { text: raw, description: "", isRecommended };
  });

  return { cleanContent, options };
}

/* ── spec helpers ──────────────────────────────────────────────────────── */

export type SpecListKey = "materials" | "components" | "key_features";

export function specList(specs: Record<string, unknown> | undefined, key: SpecListKey): string[] {
  const v = specs?.[key];
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? "").trim()).filter(Boolean);
}

/** Append `name` to `specs[key]` without duplicates (case-insensitive). Returns a new object. */
export function attachToSpec(
  specs: Record<string, unknown>,
  key: SpecListKey,
  name: string,
): { specs: Record<string, unknown>; added: boolean } {
  const clean = name.trim();
  if (!clean) return { specs, added: false };
  const list = specList(specs, key);
  if (list.some((x) => x.toLowerCase() === clean.toLowerCase())) return { specs, added: false };
  return { specs: { ...specs, [key]: [...list, clean] }, added: true };
}

export function hasDesignData(p: ZaliProject | null): boolean {
  if (!p) return false;
  return (
    Object.keys(p.specifications ?? {}).length > 0 ||
    Object.keys(p.costAnalysis ?? {}).length > 0 ||
    Object.keys(p.manufacturing ?? {}).length > 0 ||
    Object.keys(p.simulationResults ?? {}).length > 0
  );
}

/* ── software detection ────────────────────────────────────────────────── */

const SOFTWARE_TYPES = new Set([
  "software", "app", "web", "mobile", "api", "saas", "backend", "frontend",
  "fullstack", "service", "microservice", "platform", "dashboard", "cli",
  "library", "plugin", "extension", "bot", "automation", "script", "code",
]);

/** Tokenised so "appetite" or "botany" never read as software. */
export function isSoftwareProject(project: ZaliProject | null): boolean {
  if (!project) return false;
  const tokens = `${project.designType} ${project.name} ${project.description}`
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean);
  if (tokens.includes("full") && tokens.includes("stack")) return true;
  return tokens.some((t) => SOFTWARE_TYPES.has(t));
}

/* ── the directive shepherd gets in front of every turn ────────────────── */

const SPEC_PREVIEW_CHARS = 6_000;

function jsonPreview(v: Record<string, unknown>): string {
  if (!v || Object.keys(v).length === 0) return "{}";
  const s = JSON.stringify(v);
  return s.length > SPEC_PREVIEW_CHARS ? s.slice(0, SPEC_PREVIEW_CHARS) + "…(truncated)" : s;
}

/**
 * The contract that turns a plain chat into a design session: how shepherd
 * records a spec (```design_output), offers choices (```options), tags
 * findings ([RESEARCH: domain]) and hands over code (```code_output).
 * Without this the viewport, specs and research tabs never fill.
 */
export function buildDesignDirective(project: ZaliProject, library?: { materials: string[]; components: string[] }): string {
  const software = isSoftwareProject(project);
  const lines = [
    "[ASHERIN.DESIGN] you are shepherd, the design partner in asherin.design. the operator designs on this device; only this conversation reaches the model.",
    `project: ${project.name} · type ${project.designType || "general"} · phase ${project.phase || "understanding"}`,
    project.description ? `description: ${project.description}` : "",
    `current specifications: ${jsonPreview(project.specifications)}`,
    `current cost analysis: ${jsonPreview(project.costAnalysis)}`,
    `current manufacturing: ${jsonPreview(project.manufacturing)}`,
    `current simulation results: ${jsonPreview(project.simulationResults)}`,
    library?.materials.length ? `materials in the operator's library: ${library.materials.join(", ")}` : "",
    library?.components.length ? `components in the operator's library: ${library.components.join(", ")}` : "",
    "",
    "how to answer:",
    "- ask before you assume. when a decision is open, end the reply with a ```options fence: one option per line as `choice — why`, with `[RECOMMENDED]` in front of at most one line.",
    "- when something is settled enough to record, add ONE ```design_output fence holding a json object. allowed keys: phase (understanding|research|design|simulation|iteration|documentation), design_type (short slug), specifications {materials: [], components: [], key_features: [], dimensions, weight, power, performance_targets: {}}, cost_analysis {estimated_unit_cost, ...}, manufacturing {primary_process, estimated_lead_time, minimum_order_quantity, ...}, simulation_results {safety_rating, ...}. include only keys you can back; the fence replaces those sections of the project record, prose stays outside it.",
    "- every number is an estimate unless the operator gave it: say so next to it. never invent supplier stock, prices or test results.",
    "- when you state a fact from a domain, put it on its own line as `[RESEARCH: <domain>] <one-line finding>` with domain in physics, chemistry, biology, engineering, economics, manufacturing, sustainability, safety.",
    software
      ? "- this is a software project: when asked to generate code, answer with a ```code_output fence holding {\"files\": [{\"filename\", \"language\", \"content\"}]} or with a path line above each fenced file."
      : "",
    "- lowercase prose, short, no filler.",
  ];
  return lines.filter(Boolean).join("\n");
}

/* ── export ────────────────────────────────────────────────────────────── */

export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "project";
}

function section(title: string, data: Record<string, unknown>): string {
  const body = Object.keys(data ?? {}).length ? "```json\n" + JSON.stringify(data, null, 2) + "\n```" : "_nothing recorded yet_";
  return `## ${title}\n\n${body}`;
}

/** One markdown file: the project record, then the conversation that produced it. */
export function buildProjectExport(project: ZaliProject, messages: ZaliMessage[] = []): { filename: string; markdown: string } {
  const specs = project.specifications ?? {};
  const materials = specList(specs, "materials");
  const components = specList(specs, "components");
  const features = specList(specs, "key_features");
  const lists = [
    materials.length ? `- materials: ${materials.join(", ")}` : "",
    components.length ? `- components: ${components.join(", ")}` : "",
    features.length ? `- key features: ${features.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const convo = messages.length
    ? messages.map((m) => `**${m.role === "user" ? "operator" : "shepherd"}** · ${m.createdAt.toISOString()}\n\n${m.content}`).join("\n\n---\n\n")
    : "_no conversation yet_";

  const markdown = [
    `# ${project.name}`,
    "",
    `asherin.design export · ${new Date().toISOString()}`,
    "",
    `- type: ${project.designType || "general"}`,
    `- phase: ${project.phase || "understanding"}`,
    project.description ? `- description: ${project.description}` : "",
    lists,
    "",
    section("specifications", specs),
    "",
    section("cost analysis", project.costAnalysis ?? {}),
    "",
    section("manufacturing", project.manufacturing ?? {}),
    "",
    section("simulation results", project.simulationResults ?? {}),
    "",
    "## conversation",
    "",
    convo,
    "",
  ].filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");

  return { filename: `asherin-design-${slugify(project.name)}.md`, markdown };
}

/** Browser-only: hand a text file to the operator. */
export function downloadText(filename: string, text: string, type = "text/markdown"): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
