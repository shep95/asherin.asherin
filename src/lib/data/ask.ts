// asherin.data — asking shepherd about a dataset.
//
// two short calls, both grounded in material this device computed:
//   1. plan — shepherd names the computation that would answer the question
//      (measure, dimension, date column, filter) using only the real column
//      names it was shown. the plan is validated against the profile and run
//      here (analyze.ts), so every number comes from the rows, not the model.
//   2. narrate — shepherd writes the finding from the grounding plus the
//      computed table, as json. a reply that is not json is still shown, as
//      written, with confidence marked low — never a blank, never a stack.
// the chart is drawn from the real rows (charts.ts); shepherd only names
// the x and y it would plot.

import { askModel } from "@/lib/ai";
import { extractJson } from "@/lib/local/llm";
import { buildGrounding, describePlan, runPlan, tableToLines, validatePlan } from "./analyze";
import { buildChart } from "./charts";
import type {
  AnswerBlocks, ChartSpec, ComputedTable, Confidence, DataRow, DatasetProfile, QualityReport, QueryPlan,
} from "./types";

export const PLAN_SYSTEM = [
  "you are shepherd, planning one computation over a dataset the operator loaded on their own device.",
  "you only know the columns, statistics and sample rows in the grounding. use column names exactly as written.",
  "reply with one json object and nothing else:",
  '{"plan": {"aggregate": "sum|avg|count|min|max", "measure": "<numeric column or null>", "dimension": "<column to group by or null>", "date_column": "<date column or null>", "grain": "day|month|year|null", "filter": {"column": "<column>", "op": "eq|neq|gt|gte|lt|lte|contains", "value": <string or number>} | null, "limit": <1-40>} | null,',
  ' "intent": "comparison|trend|distribution|relationship|part-to-whole|summary|anomaly",',
  ' "clarification": "<one lowercase sentence if the question cannot be answered from these columns, else null>"}',
  "set plan to null when the question needs no computation (for example, it asks what the data is about).",
].join("\n");

export const NARRATE_SYSTEM = [
  "you are shepherd, answering a question about a dataset the operator loaded on their own device.",
  "the grounding and the computed table are the only facts you have. every number you state must appear in them, copied exactly; never invent, extrapolate or round beyond what is given.",
  "write in lowercase plain english, except names that appear in the data.",
  "reply with one json object and nothing else:",
  '{"finding": "<two to four sentences answering the question>",',
  ' "evidence": ["<one line per supporting figure, each quoting a number from the grounding or table>"],',
  ' "pattern": {"name": "<short name>", "domain": "financial|behavioral|text|operational|temporal|geographic", "explanation": "<one sentence>"} | null,',
  ' "projection": "<what to watch next, one sentence, or null>",',
  ' "clarification": "<what you could not tell from this data, one sentence, or null>",',
  ' "chart": {"x": "<column>", "y": "<numeric column>", "title": "<short title>", "insight": "<one sentence>"} | null}',
].join("\n");

export interface AskInput {
  question: string;
  sourceName: string;
  version: number;
  rows: DataRow[];
  profile: DatasetProfile;
  quality: QualityReport;
  definitions?: { column: string; definition: string }[];
  instructions?: string;
  text?: string | null;
  signal?: AbortSignal;
  /** reports each stage so the interface can say what is happening */
  onStage?: (stage: "planning" | "computing" | "narrating") => void;
}

type PlanReply = { plan?: unknown; intent?: string; clarification?: string | null };
type NarrateReply = {
  finding?: unknown; evidence?: unknown; pattern?: unknown; projection?: unknown; clarification?: unknown;
  chart?: { x?: unknown; y?: unknown; title?: unknown; insight?: unknown } | null;
};

const INTENTS: ChartSpec["intent"][] = ["comparison", "trend", "distribution", "relationship", "part-to-whole", "summary", "anomaly"];

const str = (v: unknown, max = 2000): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** confidence is set here, from what the device can see: how complete the
 *  data is, how many rows backed the answer, whether a computation ran and
 *  whether shepherd's reply was structured. the model does not grade itself. */
export function gradeConfidence(d: AnswerBlocks["confidence_drivers"], clarification: string | null): Confidence {
  if (!d.structured) return "low";
  let score = 0;
  if (d.completeness >= 90) score += 2; else if (d.completeness >= 70) score += 1;
  if (d.rows >= 200) score += 2; else if (d.rows >= 30) score += 1;
  if (d.computed) score += 2;
  if (clarification) score -= 1;
  return score >= 5 ? "high" : score >= 3 ? "moderate" : "low";
}

export async function planQuestion(question: string, grounding: string, profile: DatasetProfile, signal?: AbortSignal): Promise<{ plan: QueryPlan | null; intent: ChartSpec["intent"]; clarification: string | null }> {
  const raw = await askModel(`grounding:\n${grounding}\n\nquestion: ${question}`, { system: PLAN_SYSTEM, json: true, signal, maxTokens: 400 });
  const reply = extractJson<PlanReply>(raw);
  const plan = reply ? validatePlan(reply.plan, profile) : null;
  const intent = reply && INTENTS.includes(reply.intent as ChartSpec["intent"]) ? (reply.intent as ChartSpec["intent"]) : plan?.dateColumn ? "trend" : plan?.dimension ? "comparison" : "summary";
  return { plan, intent, clarification: reply ? str(reply.clarification, 300) : null };
}

function chartFromAnswer(
  reply: NarrateReply | null,
  plan: QueryPlan | null,
  intent: ChartSpec["intent"],
  input: AskInput,
): ChartSpec | null {
  const names = new Set(input.profile.columns.map((c) => c.name));
  const sourceTag = `${input.sourceName} · v${input.version}`;
  const requested = reply?.chart && typeof reply.chart === "object" ? reply.chart : null;
  const x = str(requested?.x, 120);
  const y = str(requested?.y, 120);
  const title = str(requested?.title, 120);
  const insight = str(requested?.insight, 300);
  // shepherd's pick first, when the columns exist; then the plan's own axes
  const candidates: { x?: string; y?: string[]; title: string; insight: string }[] = [];
  if (x && names.has(x)) candidates.push({ x, y: y && names.has(y) ? [y] : undefined, title: title ?? `${y ?? "count"} by ${x}`, insight: insight ?? "" });
  if (plan && (plan.dimension || plan.dateColumn)) {
    const px = plan.dateColumn ?? plan.dimension ?? undefined;
    candidates.push({ x: px, y: plan.measure ? [plan.measure] : undefined, title: title ?? describePlan(plan), insight: insight ?? `drawn from ${input.rows.length.toLocaleString()} rows on this device` });
  }
  if (plan?.measure && !plan.dimension && !plan.dateColumn) {
    candidates.push({ y: [plan.measure], title: title ?? describePlan(plan), insight: insight ?? "" });
  }
  for (const c of candidates) {
    const spec = buildChart({ intent: c.y ? intent : "comparison", ...c, sourceTag }, input.rows, input.profile);
    if (spec) return { ...spec, quality: input.quality.score };
  }
  return null;
}

export async function answerQuestion(input: AskInput): Promise<AnswerBlocks> {
  const grounding = buildGrounding({
    sourceName: input.sourceName, version: input.version, rows: input.rows, profile: input.profile, quality: input.quality,
    definitions: input.definitions, instructions: input.instructions, text: input.text,
  });

  let plan: QueryPlan | null = null;
  let intent: ChartSpec["intent"] = "summary";
  let planClarification: string | null = null;
  let computed: ComputedTable | null = null;
  const isTable = input.rows.length > 0;

  if (isTable) {
    input.onStage?.("planning");
    try {
      const p = await planQuestion(input.question, grounding, input.profile, input.signal);
      plan = p.plan; intent = p.intent; planClarification = p.clarification;
    } catch (e) {
      if (input.signal?.aborted) throw e;
      // a failed plan call is not fatal: the narration still has the grounding
      plan = null;
    }
    if (plan) {
      input.onStage?.("computing");
      computed = runPlan(input.rows, plan);
    }
  }

  input.onStage?.("narrating");
  const prompt = [
    `grounding:\n${grounding}`,
    computed ? `\n${tableToLines(computed)}` : "",
    `\nquestion: ${input.question}`,
  ].join("\n");
  const raw = await askModel(prompt, { system: NARRATE_SYSTEM, json: true, signal: input.signal, maxTokens: 900 });
  const reply = extractJson<NarrateReply>(raw);
  const structured = !!reply && typeof reply.finding === "string";

  const finding = structured ? (str(reply.finding) ?? "") : raw.trim().slice(0, 2000) || "shepherd returned nothing.";
  const evidence = structured && Array.isArray(reply.evidence) ? reply.evidence.map((e) => str(e, 300)).filter((e): e is string => !!e).slice(0, 8) : [];
  const patternRaw = structured && reply.pattern && typeof reply.pattern === "object" ? (reply.pattern as Record<string, unknown>) : null;
  const pattern = patternRaw && str(patternRaw.name, 80)
    ? { name: str(patternRaw.name, 80)!, domain: str(patternRaw.domain, 40) ?? "operational", explanation: str(patternRaw.explanation, 300) ?? "" }
    : null;
  const clarification = (structured ? str(reply.clarification, 300) : "shepherd's reply was not structured; it is shown as written.") ?? planClarification;

  const drivers: AnswerBlocks["confidence_drivers"] = {
    completeness: input.quality.completeness,
    rows: computed?.rowsUsed ?? input.rows.length,
    computed: !!computed,
    structured,
  };

  return {
    finding,
    evidence,
    pattern,
    projection: structured ? str(reply.projection, 400) : null,
    clarification,
    confidence: gradeConfidence(drivers, clarification),
    confidence_drivers: drivers,
    reasoning: {
      plan: plan ? describePlan(plan) : isTable ? "no computation — answered from the profile and sample rows" : "document — answered from the text",
      grounding: `${input.profile.columns.length} column profiles, ${Math.min(20, input.rows.length)} sample rows${input.definitions?.some((d) => d.definition) ? ", operator definitions" : ""}${input.instructions?.trim() ? ", standing directions" : ""}`,
      model: "shepherd",
    },
    computed,
    chart: isTable && structured ? chartFromAnswer(reply, plan, intent, input) : null,
  };
}

/** a short, grounded commentary for a report; failure returns null and the
 *  deterministic report stands on its own. */
export async function narrateReport(markdown: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const text = await askModel(
      `report (every figure below was computed on the operator's device):\n\n${markdown.slice(0, 16_000)}\n\nwrite three to five lowercase sentences that say what stands out and what to watch, quoting only numbers that appear above.`,
      { system: "you are shepherd. you comment on a report using only the figures it contains. plain lowercase english, no headings, no lists.", signal, maxTokens: 400 },
    );
    const t = text.trim();
    return t ? t.slice(0, 1500) : null;
  } catch {
    return null;
  }
}
