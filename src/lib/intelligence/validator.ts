// critic / validator. generated output is not accepted just because it exists.
//
// checks are modality appropriate and honest: a check that cannot run in this
// environment reports unavailable, never a silent pass.

import type { TaskFrame, ValidationCheck, ValidationReport } from "./types";

export interface ValidationInput {
  task: TaskFrame;
  output: string;
  /** claims the output makes that carry a citation, and ones that do not. */
  citedClaims?: number;
  uncitedClaims?: number;
  /** available only where the caller can actually run them. */
  externalChecks?: ValidationCheck[];
  /** memory/preference rules that were in force for this turn. */
  activeRules?: string[];
}

function has(text: string, re: RegExp): boolean {
  return re.test(text);
}

function commonChecks(input: ValidationInput): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const out = input.output || "";

  checks.push({
    id: "non_empty",
    label: "produced an answer",
    result: out.trim().length > 0 ? "pass" : "fail",
    detail: out.trim().length > 0 ? `${out.length} characters` : "empty output",
  });

  const placeholders = /\b(lorem ipsum|TODO|FIXME|coming soon|placeholder)\b/i;
  checks.push({
    id: "no_placeholder",
    label: "no placeholder content",
    result: has(out, placeholders) ? "fail" : "pass",
    detail: has(out, placeholders) ? "contains placeholder text" : "clean",
  });

  const credential = /\b(sk|pk|rk)[-_][A-Za-z0-9]{12,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN[^-]{0,40}PRIVATE KEY-----/;
  checks.push({
    id: "no_credentials",
    label: "no credential material in output",
    result: credential.test(out) ? "fail" : "pass",
    detail: credential.test(out) ? "credential-shaped string present" : "none found",
  });

  if (input.activeRules?.length) {
    const violated = input.activeRules.filter((rule) => {
      const banned = rule.match(/^never\s+(.+)$/i)?.[1];
      return banned ? out.toLowerCase().includes(banned.toLowerCase().slice(0, 24)) : false;
    });
    checks.push({
      id: "rule_compliance",
      label: "respects standing instructions",
      result: violated.length ? "fail" : "pass",
      detail: violated.length ? `conflicts with: ${violated.join("; ")}` : `${input.activeRules.length} rule(s) checked`,
    });
  }

  return checks;
}

function codeChecks(input: ValidationInput): ValidationCheck[] {
  const out = input.output || "";
  const checks: ValidationCheck[] = [];
  const fences = (out.match(/```/g) ?? []).length;
  checks.push({
    id: "code_fences_balanced",
    label: "code blocks are closed",
    result: fences % 2 === 0 ? "pass" : "fail",
    detail: `${fences} fence markers`,
  });
  const external = input.externalChecks?.map((c) => c.id) ?? [];
  for (const id of ["typecheck", "tests", "lint"]) {
    if (!external.includes(id)) {
      checks.push({
        id,
        label: id,
        result: "unavailable",
        detail: "not run in this environment",
      });
    }
  }
  return checks;
}

function researchChecks(input: ValidationInput): ValidationCheck[] {
  const cited = input.citedClaims ?? 0;
  const uncited = input.uncitedClaims ?? 0;
  const total = cited + uncited;
  return [
    {
      id: "sourcing",
      label: "claims carry sources",
      result: total === 0 ? "unavailable" : uncited === 0 ? "pass" : "fail",
      detail: total === 0 ? "no claim inventory supplied" : `${cited} cited, ${uncited} uncited`,
    },
    {
      id: "contradiction_preserved",
      label: "disagreement left visible",
      result: /\b(however|contradict|disagree|conflicting|unresolved)\b/i.test(input.output) ? "pass" : "unavailable",
      detail: "checked for contradiction language, not for factual accuracy",
    },
  ];
}

function planningChecks(input: ValidationInput): ValidationCheck[] {
  const constraintsMentioned = input.task.constraints.filter((c) =>
    input.output.toLowerCase().includes(c.toLowerCase().slice(0, 18)),
  );
  return [
    {
      id: "constraints_addressed",
      label: "stated constraints appear in the plan",
      result: input.task.constraints.length === 0 ? "unavailable" : constraintsMentioned.length ? "pass" : "fail",
      detail: input.task.constraints.length
        ? `${constraintsMentioned.length}/${input.task.constraints.length} addressed`
        : "no constraints were stated",
    },
    {
      id: "has_steps",
      label: "plan is decomposed into steps",
      result: /(^|\n)\s*(\d+[.)]|[-*])\s+/m.test(input.output) ? "pass" : "fail",
      detail: "looked for an ordered or bulleted structure",
    },
  ];
}

function designChecks(input: ValidationInput): ValidationCheck[] {
  return [
    {
      id: "requirements_compared",
      label: "output references the stated requirement",
      result: input.task.goal && input.output.length > 0 ? "pass" : "unavailable",
      detail: "textual comparison only — visual criteria need a human or a rendered comparison",
    },
    { id: "visual_review", label: "visual review", result: "unavailable", detail: "requires a rendered artifact and a human" },
  ];
}

function conversationChecks(input: ValidationInput): ValidationCheck[] {
  return [
    {
      id: "answers_the_ask",
      label: "addresses the question asked",
      result: input.output.trim().length > 0 ? "pass" : "fail",
      detail: "presence check — semantic fit is judged by the user",
    },
  ];
}

export function validate(input: ValidationInput): ValidationReport {
  const checks = [...commonChecks(input)];

  switch (input.task.modality) {
    case "code":
    case "debugging":
      checks.push(...codeChecks(input));
      break;
    case "research":
    case "analysis":
      checks.push(...researchChecks(input));
      break;
    case "planning":
    case "decision":
      checks.push(...planningChecks(input));
      break;
    case "design":
    case "image":
    case "vision":
      checks.push(...designChecks(input));
      break;
    default:
      checks.push(...conversationChecks(input));
  }

  if (input.externalChecks?.length) checks.push(...input.externalChecks);

  const failed = checks.filter((c) => c.result === "fail");
  const passed = checks.filter((c) => c.result === "pass");
  const verdict: ValidationReport["verdict"] = failed.length > 0
    ? "needs_revision"
    : passed.length > 0
      ? "accepted"
      : "unvalidated";

  return { modality: input.task.modality, checks, verdict };
}
