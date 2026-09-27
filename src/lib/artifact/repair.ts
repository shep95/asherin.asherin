// repair engine — decide the scope BEFORE changing anything.
//
// A localised defect gets a localised repair. Rebuilding the whole artifact
// for one wrong value is a defect in the process, not a fix.

import type { ArtifactFile, ArtifactValidation, Defect, RepairPlan, RepairScope } from "./types";

export interface RepairInput {
  validation: ArtifactValidation;
  files: ArtifactFile[];
  /** how many repairs already ran on this version. */
  attempts: number;
}

const SCOPE_ORDER: RepairScope[] = ["property", "component", "module", "subsystem", "architecture", "whole"];

export function planRepair(input: RepairInput): RepairPlan | null {
  const defects = input.validation.defects;
  if (!defects.length) return null;

  const scope = chooseScope(defects, input);
  const targets = chooseTargets(defects, input.files, scope);

  return {
    scope,
    diagnosis: diagnose(defects),
    hypotheses: hypotheses(defects),
    targets,
    rerunChecks: rerunFor(defects, scope, input.validation),
    reason: reasonFor(scope, defects, input.attempts),
  };
}

function chooseScope(defects: Defect[], input: RepairInput): RepairScope {
  // escalate only on repeated failure of the same defect set.
  const base: RepairScope =
    defects.every((d) => d.kind === "wrong_value") ? "property"
      : defects.some((d) => d.kind === "crash") ? "module"
        : defects.length === 1 ? "component"
          : defects.length <= 3 ? "module"
            : "subsystem";
  const escalated = SCOPE_ORDER[Math.min(SCOPE_ORDER.indexOf(base) + Math.max(0, input.attempts), SCOPE_ORDER.length - 1)];
  return escalated;
}

function chooseTargets(defects: Defect[], files: ArtifactFile[], scope: RepairScope): string[] {
  if (!files.length) return [];
  if (scope === "whole" || scope === "architecture") return files.map((f) => f.path);
  const named = files.filter((f) =>
    defects.some((d) => [d.against, d.expected, d.actual].some((t) => t.toLowerCase().includes(f.path.toLowerCase().split("/").pop()!.split(".")[0]))),
  );
  if (named.length) return named.map((f) => f.path);
  const entry = files.find((f) => f.entry) ?? files[0];
  return [entry.path];
}

function diagnose(defects: Defect[]): string {
  const crash = defects.find((d) => d.kind === "crash");
  if (crash) return `the artifact raised an error at run time: ${crash.actual}`;
  const missing = defects.filter((d) => d.kind === "missing");
  if (missing.length) return `${missing.length} acceptance criteri${missing.length === 1 ? "on is" : "a are"} not evidenced in the artifact`;
  return `${defects.length} defect(s) against the contract`;
}

function hypotheses(defects: Defect[]): string[] {
  const h: string[] = [];
  for (const d of defects.slice(0, 4)) {
    switch (d.kind) {
      case "crash":
        h.push(`the failing path referenced by "${d.actual}" runs before its state exists`);
        break;
      case "missing":
        h.push(`"${d.against}" was modelled but never implemented`);
        break;
      case "wrong_value":
        h.push(`the value produced for "${d.against}" is computed from the wrong input`);
        break;
      case "contract_violation":
        h.push(`generation left "${d.actual}" in place, violating "${d.against}"`);
        break;
      case "unobservable":
        h.push(`"${d.against}" cannot be checked here — the acceptance criterion needs restating`);
        break;
      default:
        h.push(`behaviour for "${d.against}" diverges from the contract`);
    }
  }
  return h;
}

function rerunFor(defects: Defect[], scope: RepairScope, validation: ArtifactValidation): string[] {
  if (scope === "whole" || scope === "architecture") return validation.checks.map((c) => c.id);
  const ids = new Set(defects.map((d) => d.id));
  // a crash invalidates the runtime check for everything, so it widens.
  if (defects.some((d) => d.kind === "crash")) {
    validation.checks.filter((c) => c.result !== "unavailable").forEach((c) => ids.add(c.id));
  }
  ids.add("runtime_clean");
  return Array.from(ids);
}

function reasonFor(scope: RepairScope, defects: Defect[], attempts: number): string {
  const base = `${defects.length} defect(s) localised to ${scope} scope`;
  return attempts > 0 ? `${base}; escalated after ${attempts} unsuccessful repair attempt(s)` : base;
}
