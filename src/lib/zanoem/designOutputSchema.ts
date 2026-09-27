// ZANOEM design_output validator — a hand-rolled schema check that runs on
// whatever the model emits inside a ```design_output``` fence before we
// write it to `zali_projects`. Prevents a hostile / hallucinated payload
// from bloating the row or corrupting the project shape.
//
// Rules:
//   • Object at the top level; unknown keys are dropped.
//   • Any nested "specifications" / "cost_analysis" / "manufacturing" /
//     "simulation_results" must be plain JSON objects.
//   • Total serialized size ≤ 32 KB.
//   • `phase` ∈ known enum.
//   • `design_type` ≤ 64 chars, alnum + `_-` only.

export type DesignPhase =
  | "understanding" | "research" | "design" | "simulation" | "iteration" | "documentation";

const PHASES: readonly DesignPhase[] = [
  "understanding", "research", "design", "simulation", "iteration", "documentation",
];

export interface CleanDesignOutput {
  phase?: DesignPhase;
  design_type?: string;
  specifications?: Record<string, unknown>;
  cost_analysis?: Record<string, unknown>;
  manufacturing?: Record<string, unknown>;
  simulation_results?: Record<string, unknown>;
}

const MAX_JSON_BYTES = 32 * 1024;
const OBJ_KEYS = ["specifications", "cost_analysis", "manufacturing", "simulation_results"] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function validateDesignOutput(raw: unknown): { ok: true; data: CleanDesignOutput } | { ok: false; reason: string } {
  if (!isPlainObject(raw)) return { ok: false, reason: "root must be a JSON object" };

  const out: CleanDesignOutput = {};

  if (raw.phase !== undefined) {
    if (typeof raw.phase !== "string" || !PHASES.includes(raw.phase as DesignPhase)) {
      return { ok: false, reason: `invalid phase: ${String(raw.phase)}` };
    }
    out.phase = raw.phase as DesignPhase;
  }

  if (raw.design_type !== undefined) {
    if (typeof raw.design_type !== "string") return { ok: false, reason: "design_type must be string" };
    const dt = raw.design_type.trim().slice(0, 64);
    if (!/^[A-Za-z0-9_-]+$/.test(dt)) return { ok: false, reason: "design_type has invalid chars" };
    out.design_type = dt;
  }

  for (const k of OBJ_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (!isPlainObject(v)) return { ok: false, reason: `${k} must be a JSON object` };
    out[k] = v;
  }

  const size = JSON.stringify(out).length;
  if (size > MAX_JSON_BYTES) {
    return { ok: false, reason: `payload too large (${size} bytes > ${MAX_JSON_BYTES})` };
  }

  return { ok: true, data: out };
}

/** Extract + validate a fenced ```design_output``` block. Returns null if not present. */
export function extractDesignOutput(text: string): { ok: true; data: CleanDesignOutput } | { ok: false; reason: string } | null {
  // Tolerant fence: allow optional language tag suffix, CRLF, trailing whitespace.
  const m = /```design_output[^\n]*\r?\n([\s\S]*?)```/i.exec(text);
  if (!m) return null;
  const body = m[1].trim();
  if (!body) return { ok: false, reason: "empty design_output block" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return { ok: false, reason: `JSON parse failed: ${(e as Error).message}` };
  }
  return validateDesignOutput(parsed);
}
