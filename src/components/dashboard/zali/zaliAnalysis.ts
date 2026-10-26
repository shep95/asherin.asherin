// asherin.design — the analysis tab's contract with shepherd.
//
// shepherd does not run FEA, CFD or a supply-chain query. It reasons. Every
// result here is an estimate with its assumptions listed, and the interface
// says so. The model answers in json; the validators below drop anything
// that is not the shape the panel can draw, so a hallucinated payload never
// reaches the screen or the local store.

import { askModel } from "@/lib/ai";
import type { ZaliProject } from "./types";
import { specList } from "./zaliPrompt";

/* ── shapes ────────────────────────────────────────────────────────────── */

export const ESTIMATE_TYPES = [
  { id: "structural", label: "structural", description: "stress, strain, deformation" },
  { id: "thermal", label: "thermal", description: "heat paths, hotspots" },
  { id: "electrical", label: "electrical", description: "voltage, current, signal integrity" },
  { id: "fluids", label: "fluids", description: "airflow, pressure drop" },
  { id: "vibration", label: "vibration", description: "resonance, damping, fatigue" },
  { id: "chemical", label: "chemical", description: "reaction, stability, corrosion" },
] as const;
export type EstimateType = (typeof ESTIMATE_TYPES)[number]["id"];

export interface EstimateResult {
  status: "pass" | "fail" | "issue";
  metrics: Record<string, string>;
  recommendations: string[];
  assumptions: string[];
}

export interface DfmCheck { label: string; status: "pass" | "fail" | "warn"; detail: string; cost?: string; lead?: string }
export interface Certification { name: string; required: boolean; status: "pass" | "needs-review" | "optional" }
export interface TimelineStep { week: string; task: string; status: "ready" | "pending" }
export interface ManufacturingResult {
  dfmChecks: DfmCheck[];
  certifications: Certification[];
  timeline: TimelineStep[];
  sourcing: string[];
  totalCost?: string;
  maxLeadDays?: number;
  assumptions: string[];
}

export interface ProposalMetric { value: string; delta: string }
export interface Proposal {
  name: string;
  score: number;
  badge?: string;
  changes: string[];
  tradeoffs: string[];
  metrics: Partial<Record<"cost" | "performance" | "weight" | "buildTime", ProposalMetric>>;
}
export interface ProposalsResult { designs: Proposal[]; assumptions: string[] }

export interface MaterialFailure { material: string; failRate: string; context: string; recommendation: string }
export interface MaterialSubstitution { original: string; alternative: string; costDelta: string; strengthDelta: string; risk: string }
export interface MaterialsResult { failureAlerts: MaterialFailure[]; substitutions: MaterialSubstitution[]; assumptions: string[] }

export interface LibraryMaterial { name: string; category: string; avg_cost: number; top_use: string; failure_mode: string }

export type AnalysisInput =
  | { kind: "estimate"; project: ZaliProject; estimateType: EstimateType }
  | { kind: "manufacturing"; project: ZaliProject }
  | { kind: "proposals"; project: ZaliProject; weights: Record<string, number> }
  | { kind: "materials"; materials: LibraryMaterial[] };

export type AnalysisResultFor<K extends AnalysisInput["kind"]> =
  K extends "estimate" ? EstimateResult
  : K extends "manufacturing" ? ManufacturingResult
  : K extends "proposals" ? ProposalsResult
  : MaterialsResult;

/* ── json parsing ──────────────────────────────────────────────────────── */

/** Find the json object in a model reply: fenced, bare, or wrapped in prose. */
export function parseModelJson(raw: string): unknown | null {
  if (!raw) return null;
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(raw);
  const candidates = [fenced?.[1], raw];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1));
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/* ── validators ────────────────────────────────────────────────────────── */

const MAX_LIST = 12;
const MAX_STR = 400;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = MAX_STR): string => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, MAX_LIST) : []);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

export function validateEstimate(v: unknown): EstimateResult | null {
  if (!isObj(v)) return null;
  const metrics: Record<string, string> = {};
  const src = isObj(v.metrics) ? v.metrics : v;
  for (const [k, val] of Object.entries(src)) {
    if (["status", "recommendations", "assumptions", "metrics"].includes(k)) continue;
    if (typeof val === "string" || typeof val === "number") metrics[str(k, 48)] = str(val, 120);
    if (Object.keys(metrics).length >= MAX_LIST) break;
  }
  const recommendations = strList(v.recommendations);
  const assumptions = strList(v.assumptions);
  if (!Object.keys(metrics).length && !recommendations.length) return null;
  return { status: oneOf(v.status, ["pass", "fail", "issue"] as const, "issue"), metrics, recommendations, assumptions };
}

export function validateManufacturing(v: unknown): ManufacturingResult | null {
  if (!isObj(v)) return null;
  const dfmChecks: DfmCheck[] = (Array.isArray(v.dfmChecks) ? v.dfmChecks : [])
    .filter(isObj)
    .map((c) => ({
      label: str(c.label, 120),
      status: oneOf(c.status, ["pass", "fail", "warn"] as const, "warn"),
      detail: str(c.detail),
      cost: str(c.cost, 60) || undefined,
      lead: str(c.lead, 60) || undefined,
    }))
    .filter((c) => c.label)
    .slice(0, MAX_LIST);
  const certifications: Certification[] = (Array.isArray(v.certifications) ? v.certifications : [])
    .filter(isObj)
    .map((c) => ({ name: str(c.name, 120), required: c.required === true, status: oneOf(c.status, ["pass", "needs-review", "optional"] as const, "needs-review") }))
    .filter((c) => c.name)
    .slice(0, MAX_LIST);
  const timeline: TimelineStep[] = (Array.isArray(v.timeline) ? v.timeline : [])
    .filter(isObj)
    .map((s) => ({ week: str(s.week, 40), task: str(s.task, 200), status: oneOf(s.status, ["ready", "pending"] as const, "pending") }))
    .filter((s) => s.task)
    .slice(0, MAX_LIST);
  if (!dfmChecks.length && !certifications.length && !timeline.length) return null;
  const lead = Number(v.maxLeadDays);
  return {
    dfmChecks,
    certifications,
    timeline,
    sourcing: strList(v.sourcing),
    totalCost: str(v.totalCost, 60) || undefined,
    maxLeadDays: Number.isFinite(lead) && lead >= 0 ? Math.round(lead) : undefined,
    assumptions: strList(v.assumptions),
  };
}

const METRIC_KEYS = ["cost", "performance", "weight", "buildTime"] as const;

export function validateProposals(v: unknown): ProposalsResult | null {
  if (!isObj(v)) return null;
  const designs: Proposal[] = (Array.isArray(v.designs) ? v.designs : [])
    .filter(isObj)
    .map((d) => {
      const metrics: Proposal["metrics"] = {};
      for (const k of METRIC_KEYS) {
        const m = d[k];
        if (isObj(m) && (m.value !== undefined || m.delta !== undefined)) metrics[k] = { value: str(m.value, 60), delta: str(m.delta, 40) };
      }
      const score = Number(d.score);
      return {
        name: str(d.name, 120),
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
        badge: str(d.badge, 40) || undefined,
        changes: strList(d.changes),
        tradeoffs: strList(d.tradeoffs),
        metrics,
      };
    })
    .filter((d) => d.name)
    .slice(0, 6);
  if (!designs.length) return null;
  return { designs, assumptions: strList(v.assumptions) };
}

export function validateMaterials(v: unknown): MaterialsResult | null {
  if (!isObj(v)) return null;
  const failureAlerts: MaterialFailure[] = (Array.isArray(v.failureAlerts) ? v.failureAlerts : [])
    .filter(isObj)
    .map((f) => ({ material: str(f.material, 120), failRate: str(f.failRate, 40), context: str(f.context), recommendation: str(f.recommendation) }))
    .filter((f) => f.material)
    .slice(0, MAX_LIST);
  const substitutions: MaterialSubstitution[] = (Array.isArray(v.substitutions) ? v.substitutions : [])
    .filter(isObj)
    .map((s) => ({ original: str(s.original, 120), alternative: str(s.alternative, 120), costDelta: str(s.costDelta, 40), strengthDelta: str(s.strengthDelta, 40), risk: str(s.risk, 120) }))
    .filter((s) => s.original && s.alternative)
    .slice(0, MAX_LIST);
  if (!failureAlerts.length && !substitutions.length) return null;
  return { failureAlerts, substitutions, assumptions: strList(v.assumptions) };
}

/* ── prompts ───────────────────────────────────────────────────────────── */

const SYSTEM = [
  "you are shepherd, the design partner in asherin.design, answering a structured request from the analysis tab.",
  "answer with one json object and nothing else. lowercase strings. every figure is an estimate from reasoning, not a measurement: keep it plausible, give units, and list the assumptions it rests on in an `assumptions` array.",
  "never invent supplier stock, live prices or test data. if the project record is too thin to estimate, say so inside the json (status \"issue\", an assumption that names what is missing).",
].join("\n");

function projectBlock(p: ZaliProject): string {
  const specs = p.specifications ?? {};
  return [
    `project: ${p.name} · type ${p.designType || "general"} · phase ${p.phase || "understanding"}`,
    p.description ? `description: ${p.description}` : "",
    `materials: ${specList(specs, "materials").join(", ") || "none recorded"}`,
    `components: ${specList(specs, "components").join(", ") || "none recorded"}`,
    `key features: ${specList(specs, "key_features").join(", ") || "none recorded"}`,
    `specifications: ${JSON.stringify(specs).slice(0, 4000)}`,
    Object.keys(p.costAnalysis ?? {}).length ? `cost analysis: ${JSON.stringify(p.costAnalysis).slice(0, 1500)}` : "",
    Object.keys(p.manufacturing ?? {}).length ? `manufacturing: ${JSON.stringify(p.manufacturing).slice(0, 1500)}` : "",
  ].filter(Boolean).join("\n");
}

export function buildAnalysisPrompt(input: AnalysisInput): string {
  switch (input.kind) {
    case "estimate": {
      const t = ESTIMATE_TYPES.find((x) => x.id === input.estimateType);
      return [
        projectBlock(input.project),
        "",
        `give a ${t?.label ?? input.estimateType} estimate (${t?.description ?? ""}) for this design.`,
        'shape: {"status": "pass"|"fail"|"issue", "metrics": {"<metric name>": "<value with unit>"}, "recommendations": ["..."], "assumptions": ["..."]}',
        "four to eight metrics, up to six recommendations.",
      ].join("\n");
    }
    case "manufacturing":
      return [
        projectBlock(input.project),
        "",
        "review this design for manufacturability.",
        'shape: {"dfmChecks": [{"label", "status": "pass"|"fail"|"warn", "detail", "cost"?, "lead"?}], "certifications": [{"name", "required": true|false, "status": "pass"|"needs-review"|"optional"}], "timeline": [{"week", "task", "status": "ready"|"pending"}], "sourcing": ["where this kind of part is usually sourced — no stock claims"], "totalCost"?: "estimate with unit", "maxLeadDays"?: number, "assumptions": ["..."]}',
      ].join("\n");
    case "proposals": {
      const w = Object.entries(input.weights).map(([k, v]) => `${k} ${v}%`).join(", ");
      return [
        projectBlock(input.project),
        "",
        `propose three design variants that trade off these priorities: ${w}.`,
        'shape: {"designs": [{"name", "score": 0-100, "badge"?: "short tag", "cost": {"value", "delta"}, "performance": {"value", "delta"}, "weight": {"value", "delta"}, "buildTime": {"value", "delta"}, "changes": ["..."], "tradeoffs": ["..."]}], "assumptions": ["..."]}',
        "delta is relative to the current design, e.g. \"-12%\" or \"+5%\" or \"0%\".",
      ].join("\n");
    }
    case "materials":
      return [
        "the operator's material library:",
        ...input.materials.map((m) => `- ${m.name} (${m.category}; ~$${m.avg_cost || "?"}/kg; use: ${m.top_use || "?"}; known failure: ${m.failure_mode || "?"})`),
        "",
        "for these materials, list known failure modes worth checking and credible substitutions.",
        'shape: {"failureAlerts": [{"material", "failRate": "qualitative or estimated", "context", "recommendation"}], "substitutions": [{"original", "alternative", "costDelta", "strengthDelta", "risk"}], "assumptions": ["..."]}',
      ].join("\n");
  }
}

export const ANALYSIS_UNREADABLE = "shepherd answered, but not in a shape this tab can read. send it again.";

/** Ask shepherd, parse, validate. Throws an Error with a sentence the operator can read. */
export async function runAnalysis<K extends AnalysisInput["kind"]>(
  input: Extract<AnalysisInput, { kind: K }>,
  signal?: AbortSignal,
): Promise<AnalysisResultFor<K>> {
  const raw = await askModel(buildAnalysisPrompt(input), { system: SYSTEM, json: true, signal, maxTokens: 2400 });
  const parsed = parseModelJson(raw);
  const validated =
    input.kind === "estimate" ? validateEstimate(parsed)
    : input.kind === "manufacturing" ? validateManufacturing(parsed)
    : input.kind === "proposals" ? validateProposals(parsed)
    : validateMaterials(parsed);
  if (!validated) throw new Error(ANALYSIS_UNREADABLE);
  return validated as AnalysisResultFor<K>;
}
