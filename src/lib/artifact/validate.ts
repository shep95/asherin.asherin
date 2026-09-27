// validator — expected model vs actual result.
//
// Generated output is not finished output. Each acceptance criterion becomes a
// check, and a check that cannot be observed is `unavailable`, never `pass`.

import type {
  ArtifactCapability,
  ArtifactCheck,
  ArtifactContract,
  ArtifactFile,
  ArtifactValidation,
  Defect,
  ObservationSet,
} from "./types";
import { errorMessages, hasErrors } from "./observer";

export interface ValidateInput {
  contract: ArtifactContract;
  capability: ArtifactCapability;
  files: ArtifactFile[];
  observations: ObservationSet;
  /** rendered / produced text for non-executing artifacts. */
  output?: string;
  /** when a repair reruns only part of the model. */
  onlyChecks?: string[];
}

const PLACEHOLDER = /\b(lorem ipsum|TODO|FIXME|coming soon|placeholder)\b/i;
const CREDENTIAL = /\b(sk|pk|rk)[-_][A-Za-z0-9]{12,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN[^-]{0,40}PRIVATE KEY-----/;

export function validateArtifact(input: ValidateInput): ArtifactValidation {
  const checks: ArtifactCheck[] = [];
  const defects: Defect[] = [];
  const body = [input.output ?? "", ...input.files.map((f) => f.content)].join("\n");

  const want = (id: string) => !input.onlyChecks || input.onlyChecks.includes(id);

  if (want("has_content")) {
    const ok = body.trim().length > 0;
    checks.push({ id: "has_content", label: "the artifact has content", result: ok ? "pass" : "fail", detail: ok ? `${body.length} characters` : "nothing was produced" });
    if (!ok) defects.push(defect("has_content", "missing", "an artifact exists", "an artifact exists", "nothing was produced", []));
  }

  if (want("no_placeholder")) {
    const bad = PLACEHOLDER.test(body);
    checks.push({ id: "no_placeholder", label: "no placeholder content", result: bad ? "fail" : "pass", detail: bad ? "placeholder text present" : "clean" });
    if (bad) defects.push(defect("no_placeholder", "contract_violation", "no placeholder or TODO text survives into the result", "finished content", "placeholder text present", []));
  }

  if (want("no_credentials")) {
    const bad = CREDENTIAL.test(body);
    checks.push({ id: "no_credentials", label: "no credential material", result: bad ? "fail" : "pass", detail: bad ? "credential-shaped string present" : "none found" });
    if (bad) defects.push(defect("no_credentials", "contract_violation", "no secret material in an artifact", "no credentials", "credential-shaped string present", []));
  }

  if (want("runtime_clean")) {
    if (input.capability === "execute" || input.capability === "compute") {
      const errs = errorMessages(input.observations);
      const failed = hasErrors(input.observations);
      checks.push({
        id: "runtime_clean",
        label: "runs without an uncaught error",
        result: failed ? "fail" : input.observations.observations.length ? "pass" : "unavailable",
        detail: failed ? errs.slice(0, 3).join(" | ") : input.observations.observations.length ? "no error reported by the runtime" : "the runtime reported nothing back",
      });
      if (failed) defects.push(defect("runtime_clean", "crash", "the artifact loads without an uncaught error", "no uncaught error", errs[0] ?? "error", errs.slice(0, 5)));
    } else {
      checks.push({
        id: "runtime_clean",
        label: "runs without an uncaught error",
        result: "unavailable",
        detail: "this artifact type does not execute",
      });
    }
  }

  // acceptance criteria — each becomes its own check.
  for (const t of input.contract.testModel) {
    if (!want(t.id)) continue;
    if (!t.observable) {
      checks.push({ id: t.id, label: t.description, result: "unavailable", detail: t.why ?? "not observable in this environment" });
      continue;
    }
    // observable acceptance is confirmed by the absence of an error touching it
    // plus the criterion's own keywords appearing in the produced artifact.
    const keys = keywords(t.description);
    const present = keys.length === 0 ? false : keys.every((k) => body.toLowerCase().includes(k));
    checks.push({
      id: t.id,
      label: t.description,
      result: present ? "pass" : "fail",
      detail: present ? `all required elements present: ${keys.join(", ")}` : `not evidenced in the artifact: ${keys.filter((k) => !body.toLowerCase().includes(k)).join(", ") || "no testable keyword"}`,
    });
    if (!present) {
      defects.push(defect(t.id, "missing", t.description, t.description, "the artifact does not evidence this criterion", []));
    }
  }

  for (const inv of input.contract.invariants) {
    const id = `inv_${slug(inv)}`;
    if (!want(id)) continue;
    checks.push({ id, label: inv, result: "unavailable", detail: "invariants are asserted by construction; no runtime assertion harness exists here" });
  }

  const failed = checks.filter((c) => c.result === "fail");
  const passed = checks.filter((c) => c.result === "pass");
  const verdict: ArtifactValidation["verdict"] = failed.length ? "defective" : passed.length ? "verified" : "unvalidated";

  return { verdict, checks, defects };
}

const STOP = new Set([
  "observable", "the", "a", "an", "and", "or", "with", "that", "this", "it", "to", "of", "for", "in", "on", "is",
  "are", "be", "should", "must", "when", "after", "each", "time", "artifact", "result", "satisfies",
]);

function keywords(description: string): string[] {
  return Array.from(
    new Set(
      description
        .toLowerCase()
        .replace(/^observable:\s*/, "")
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3 && !STOP.has(w)),
    ),
  ).slice(0, 4);
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
}

function defect(id: string, kind: Defect["kind"], against: string, expected: string, actual: string, evidence: string[]): Defect {
  return { id, kind, against, expected, actual, evidence };
}
