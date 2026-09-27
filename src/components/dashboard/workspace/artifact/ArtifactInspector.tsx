// inspector — the contract, the model audit, the files, and what was observed.
// no hidden reasoning is shown here: only decisions and recorded facts.

import type { ArtifactContract, ArtifactFile, AuditFinding, ObservationSet } from "@/lib/artifact/types";

interface Props {
  contract: ArtifactContract;
  audit: AuditFinding[];
  files: ArtifactFile[];
  observations: ObservationSet;
  modelRepairs: string[];
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">{title}</div>
    <div className="mt-1 space-y-0.5 text-[10px] font-light text-muted-foreground/75">{children}</div>
  </div>
);

const ArtifactInspector = ({ contract, audit, files, observations, modelRepairs }: Props) => {
  const findings = audit.filter((a) => a.result === "finding");
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section title="contract">
        {contract.goals.map((g, i) => (
          <div key={`g${i}`}>goal · {g}</div>
        ))}
        {contract.acceptance.map((a, i) => (
          <div key={`a${i}`}>accepts · {a}</div>
        ))}
        {contract.invariants.map((v, i) => (
          <div key={`i${i}`}>invariant · {v}</div>
        ))}
      </Section>

      <Section title={`model audit · ${findings.length} finding(s) of ${audit.length} dimension(s)`}>
        {findings.length === 0 && <div>every dimension came back clear or not applicable</div>}
        {findings.map((f) => (
          <div key={f.dimension}>
            {f.dimension.replace(/_/g, " ")} · {f.note}
          </div>
        ))}
      </Section>

      {modelRepairs.length > 0 && (
        <Section title="model repaired before building">
          {modelRepairs.map((r, i) => (
            <div key={i}>— {r}</div>
          ))}
        </Section>
      )}

      <Section title={`files · ${files.length}`}>
        {files.length === 0 && <div>the answer contained no artifact files</div>}
        {files.map((f) => (
          <div key={f.path}>
            {f.path} · {f.content.split("\n").length} lines
          </div>
        ))}
      </Section>

      <Section title="observed">
        {observations.observations.length === 0 && <div>the run reported nothing</div>}
        {observations.observations.slice(0, 12).map((o, i) => (
          <div key={i}>
            {o.channel}/{o.level} · {o.message}
          </div>
        ))}
      </Section>

      <Section title="not observed">
        {observations.unobserved.map((u) => (
          <div key={u.channel}>
            {u.channel} · {u.reason}
          </div>
        ))}
      </Section>
    </div>
  );
};

export default ArtifactInspector;
