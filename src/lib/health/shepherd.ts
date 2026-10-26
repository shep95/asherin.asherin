// asherin.health — shepherd, in this room.
//
// The hosted edition answered the health assistant, the lab-report scan and the
// photograph read through an edge function ("asherin-health-ai"). The local
// edition has no server, so that name answered "kernel offline" and every one
// of those controls was dead. This file is the device-side replacement: it
// resolves the model key held in the device vault, calls the provider directly
// from this tab (src/lib/local/llm.ts), bounds what comes back, and writes
// errors in the operator's words. Nothing here opens a dialog; the room says
// what is missing in place.

import { getActiveModel, getProviderKey, VaultLockedError } from "@/lib/local/keys";
import { completeLlm, extractJson, LlmError, providerNeedsKey, type LlmImage } from "@/lib/local/llm";
import { recordAiCall } from "@/lib/usage/ledger";
import { LAB_DEFS, labDef } from "./labs";
import { SYSTEMS } from "./systems";

export const SETTINGS_PATH = "settings → intelligence";
const TOOL = "asherin-health";

export type ShepherdState =
  | { ok: true; provider: string; model: string; apiKey: string }
  | { ok: false; code: "none" | "locked"; reason: string };

/** can shepherd answer from this device right now? reads the vault, never opens a dialog. */
export async function resolveHealthShepherd(): Promise<ShepherdState> {
  const active = await getActiveModel().catch(() => null);
  if (!active) return { ok: false, code: "none", reason: `shepherd has no model to answer with on this device. connect a model key in ${SETTINGS_PATH}.` };
  let apiKey = "";
  if (providerNeedsKey(active.provider)) {
    try {
      apiKey = (await getProviderKey(active.provider)) ?? "";
    } catch (e) {
      if (e instanceof VaultLockedError) return { ok: false, code: "locked", reason: `your key vault is locked. unlock it in ${SETTINGS_PATH} and shepherd can answer.` };
      return { ok: false, code: "none", reason: `the ${active.provider} key could not be read from the vault. check ${SETTINGS_PATH}.` };
    }
    if (!apiKey) return { ok: false, code: "none", reason: `no saved key for ${active.provider}. add one in ${SETTINGS_PATH}.` };
  }
  return { ok: true, provider: active.provider, model: active.model, apiKey };
}

/** one lowercase sentence for whatever the provider call threw. pure. */
export function describeModelFailure(e: unknown): string {
  if (e instanceof LlmError) {
    switch (e.code) {
      case "AUTH":
        return `the provider refused the saved key. check it in ${SETTINGS_PATH}.`;
      case "RATE_LIMIT":
        return "the provider is rate-limiting this key right now. wait a moment and ask again.";
      case "UPSTREAM_BUSY":
        return "the provider is busy. ask again in a moment.";
      case "NETWORK":
        return "the provider could not be reached from this device. check the connection.";
      case "UNSUPPORTED":
        return e.message.toLowerCase();
      case "BAD_REQUEST":
        return `the provider rejected the request: ${e.message.slice(0, 160).toLowerCase()}`;
      default:
        return `the provider answered with an error: ${e.message.slice(0, 160).toLowerCase()}`;
    }
  }
  if (e instanceof Error && e.name === "AbortError") return "the request was cancelled.";
  if (e instanceof Error && e.message) return e.message.slice(0, 200).toLowerCase();
  return "shepherd could not answer right now.";
}

class ShepherdUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShepherdUnavailable";
  }
}

async function call(input: {
  system: string;
  user: string;
  images?: LlmImage[];
  json?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
  functionName: string;
}): Promise<string> {
  const state = await resolveHealthShepherd();
  if (state.ok === false) throw new ShepherdUnavailable(state.reason);
  try {
    const text = await completeLlm({
      provider: state.provider,
      model: state.model,
      apiKey: state.apiKey,
      json: input.json,
      maxTokens: input.maxTokens,
      signal: input.signal,
      temperature: 0.3,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user, images: input.images },
      ],
    });
    void recordAiCall({ tool: TOOL, provider: state.provider, model: state.model, functionName: input.functionName, status: "ok" });
    return text;
  } catch (e) {
    void recordAiCall({ tool: TOOL, provider: state.provider, model: state.model, functionName: input.functionName, status: "error" });
    throw new ShepherdUnavailable(describeModelFailure(e));
  }
}

/* ── the assistant ──────────────────────────────────────────────────────── */

const ASSIST_SYSTEM = [
  "you are shepherd, speaking inside asherin.health, a person's own health record held on their device.",
  "answer only from the record excerpt you are given and from general physiology. if the record does not contain something, say so plainly instead of inventing it.",
  "you explain and orient: what a region carries, what a value means against its reference interval, what tends to make something worse or better, and what would make it urgent.",
  "you never diagnose, never name a disease as a fact about this person, and never tell them to start or stop a medication. where something warrants a clinician, say so first and say why.",
  "write in lowercase plain prose, short paragraphs, no headings, no bullet lists, no emoji. two to five short paragraphs at most.",
].join("\n");

export async function askHealthShepherd(input: { question: string; context: string; signal?: AbortSignal }): Promise<string> {
  const user = [
    "record excerpt (device-local, written by the person):",
    input.context.trim() || "(the record is empty so far.)",
    "",
    "question:",
    input.question.trim(),
  ].join("\n");
  const text = await call({ system: ASSIST_SYSTEM, user, maxTokens: 900, signal: input.signal, functionName: "assist" });
  return text.trim() || "no answer came back.";
}

/* ── reading a photographed lab report ──────────────────────────────────── */

export interface LabsReadValue {
  key: string;
  label: string;
  value: number;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  collectedAt?: string;
}

export interface LabsReadResult {
  values: LabsReadValue[];
  unreadable: string[];
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * bound whatever the model answered to the catalogue: a value needs a finite
 * number and a key; a key the catalogue does not know is kept but flagged by
 * the panel (it cannot be saved). pure, so it is unit tested.
 */
export function normaliseLabRead(raw: unknown): LabsReadResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(r.values) ? r.values : [];
  const values: LabsReadValue[] = [];
  for (const item of list.slice(0, 80)) {
    const o = (item ?? {}) as Record<string, unknown>;
    const value = num(o.value);
    const key = str(o.key, 40).toLowerCase();
    if (value === undefined || !key) continue;
    const def = labDef(key);
    const collectedAt = str(o.collectedAt, 10);
    values.push({
      key,
      label: def?.label ?? (str(o.label, 60) || key),
      value,
      unit: def?.unit ?? (str(o.unit, 16) || undefined),
      refLow: num(o.refLow),
      refHigh: num(o.refHigh),
      collectedAt: /^\d{4}-\d{2}-\d{2}$/.test(collectedAt) ? collectedAt : undefined,
    });
  }
  const unreadable = Array.isArray(r.unreadable) ? r.unreadable.map((u) => str(u, 120)).filter(Boolean).slice(0, 12) : [];
  return { values, unreadable };
}

const LABS_SYSTEM = [
  "you read a photograph of a laboratory report and transcribe the analytes you can actually see. you do not interpret them.",
  "answer with one json object and nothing else: {\"values\":[{\"key\",\"label\",\"value\",\"unit\",\"refLow\",\"refHigh\",\"collectedAt\"}],\"unreadable\":[...]}.",
  "map each analyte to one of these catalogue keys when it clearly is that analyte; otherwise use a short lowercase key of your own and the printed label:",
  LAB_DEFS.map((d) => `${d.key} — ${d.label} (${d.unit}; also written ${d.aliases.join(", ")})`).join("\n"),
  "value is the printed number converted to the catalogue unit when the conversion is certain; otherwise keep the printed number and give the printed unit.",
  "collectedAt is the sample date as yyyy-mm-dd if printed, otherwise omitted. refLow/refHigh are the printed reference limits if present.",
  "anything you cannot read with confidence goes in unreadable as a short phrase. never guess a number.",
].join("\n");

export async function readLabPhoto(input: { mime: string; b64: string; signal?: AbortSignal }): Promise<LabsReadResult> {
  const text = await call({
    system: LABS_SYSTEM,
    user: "transcribe the analytes visible in this photograph of a lab report.",
    images: [{ mime: input.mime, base64: input.b64 }],
    json: true,
    maxTokens: 1800,
    signal: input.signal,
    functionName: "labs.read",
  });
  const parsed = extractJson<unknown>(text);
  if (!parsed) throw new ShepherdUnavailable("the reading came back in a shape that could not be used. try a sharper photograph.");
  return normaliseLabRead(parsed);
}

/* ── reading free-form photographs ──────────────────────────────────────── */

const PHOTO_SYSTEM = [
  "you describe what is visible in a person's own photographs, in plain words, so they can bring it to a clinician. you never diagnose, never name a disease as fact, and never prescribe.",
  "answer with one json object and nothing else:",
  "{\"summary\": string, \"findings\": [{\"title\", \"plain\", \"detail\", \"category\", \"severity\", \"imageConfidence\", \"meaningConfidence\", \"photoIndex\", \"systems\", \"regions\"}], \"limits\": [string], \"questions\": [string]}.",
  "category is one of: posture, surface, swelling, symmetry, document, device, environment, other.",
  "severity is one of: routine, watch, clinician — clinician only when what is visible should be seen by a professional.",
  "imageConfidence (0..1) is how well the camera shows the thing; meaningConfidence (0..1) is how much it means on its own.",
  "photoIndex is the zero-based index of the photograph the finding comes from. a finding not tied to one photograph is dropped, so always attribute.",
  `systems is a list from: ${SYSTEMS.map((s) => s.id).join(", ")}. regions is a short list of plain region words.`,
  "limits must name what these photographs cannot show (depth, change over time, cause). questions are what would let the reading go further.",
  "lowercase throughout. title is five or six words; plain is one or two sentences anyone can follow; detail is the fuller reading.",
].join("\n");

export async function readPhotos(input: {
  prompt: string;
  images: Array<{ view: string; mime: string; b64: string }>;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const user = [
    `${input.images.length} photograph${input.images.length === 1 ? "" : "s"}, in order: ${input.images.map((im, i) => `${i}: ${im.view}`).join("; ")}.`,
    input.prompt.trim() ? `what the person wants looked at: ${input.prompt.trim()}` : "the person did not say what to look at; describe what stands out.",
  ].join("\n");
  const text = await call({
    system: PHOTO_SYSTEM,
    user,
    images: input.images.map((im) => ({ mime: im.mime, base64: im.b64 })),
    json: true,
    maxTokens: 2200,
    signal: input.signal,
    functionName: "photo.read",
  });
  const parsed = extractJson<Record<string, unknown>>(text);
  if (!parsed || typeof parsed !== "object") throw new ShepherdUnavailable("the reading came back in a shape that could not be used. try again with fewer photographs.");
  return parsed;
}
