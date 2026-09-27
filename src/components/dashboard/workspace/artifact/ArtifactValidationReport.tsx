// validation report — expected vs actual, and what was not checkable.

import { Check, Minus, X } from "lucide-react";
import type { ArtifactValidation, RepairPlan } from "@/lib/artifact/types";

const ICON = {
  pass: <Check className="h-3 w-3 text-emerald-400/80" strokeWidth={1.5} />,
  fail: <X className="h-3 w-3 text-red-400/80" strokeWidth={1.5} />,
  unavailable: <Minus className="h-3 w-3 text-muted-foreground/50" strokeWidth={1.5} />,
};

const ArtifactValidationReport = ({ validation, repair }: { validation: ArtifactValidation; repair?: RepairPlan | null }) => (
  <div className="space-y-2">
    <ul className="space-y-1">
      {validation.checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2 text-[11px] font-light">
          <span className="mt-0.5">{ICON[c.result]}</span>
          <span className="text-foreground/75">
            {c.label}
            <span className="block text-[10px] text-muted-foreground/60">{c.detail}</span>
          </span>
        </li>
      ))}
      {validation.checks.length === 0 && (
        <li className="text-[11px] font-light text-muted-foreground/70">no check could be evaluated for this artifact</li>
      )}
    </ul>

    {repair && (
      <div className="rounded-lg border border-border/20 bg-foreground/[0.02] p-2.5">
        <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">repair plan · {repair.scope} scope</div>
        <p className="mt-1 text-[11px] font-light text-foreground/75">{repair.diagnosis}</p>
        <ul className="mt-1 space-y-0.5 text-[10px] font-light text-muted-foreground/70">
          {repair.hypotheses.map((h, i) => (
            <li key={i}>— {h}</li>
          ))}
        </ul>
        <p className="mt-1 text-[10px] text-muted-foreground/55">
          rerunning {repair.rerunChecks.length} check(s){repair.targets.length ? ` on ${repair.targets.join(", ")}` : ""}
        </p>
      </div>
    )}
  </div>
);

export default ArtifactValidationReport;
