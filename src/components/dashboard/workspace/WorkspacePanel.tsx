// The workspace a chat turn assembles. Every surface is either ready with real
// rows, or it states the reason it could not be produced. Nothing is invented.

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import WorkspaceCards from "./WorkspaceCards";
import WorkspaceTimeline from "./WorkspaceTimeline";
import WorkspaceGraph from "./WorkspaceGraph";
import EvidencePanel from "./EvidencePanel";
import WorkspaceMap from "./WorkspaceMap";
import ArtifactSurface from "./artifact/ArtifactSurface";
import type { SurfaceKind, WorkspacePlan, WorkspaceSurface } from "@/lib/workspace/types";

const TITLE: Record<SurfaceKind, string> = {
  answer: "answer",
  cards: "cards",
  map: "map",
  timeline: "timeline",
  graph: "relationships",
  table: "table",
  evidence: "evidence",
  cameras: "cameras",
  artifact: "artifact",
};

interface Props {
  plan: WorkspacePlan;
  visible?: SurfaceKind[];
  /** the answer this workspace belongs to — the artifact surface builds from it. */
  answer?: string;
  conversationId?: string | null;
}

function SurfaceShell({
  surface,
  children,
}: {
  surface: WorkspaceSurface;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/20 bg-foreground/[0.015] p-3">
      <header className="mb-2 flex items-center gap-2">
        <h4 className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">{TITLE[surface.kind]}</h4>
        {surface.state !== "ready" && (
          <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">{surface.state}</span>
        )}
      </header>
      {surface.state === "ready" ? (
        children
      ) : surface.state === "pending" ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
          <Loader2 className="h-3 w-3 animate-spin" /> working…
        </div>
      ) : (
        <div className="flex items-start gap-2 text-[11px] font-light text-muted-foreground/80">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
          <span>{surface.reason || "unavailable"}</span>
        </div>
      )}
    </section>
  );
}

const WorkspacePanel = ({ plan, visible, answer = "", conversationId = null }: Props) => {
  const [selected, setSelected] = useState<string | undefined>();

  const surfaces = plan.surfaces.filter(
    (s) => s.kind !== "answer" && (!visible || !visible.length || visible.includes(s.kind)),
  );
  if (!surfaces.length) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/50">
        workspace · {plan.lane} lane
      </div>
      {plan.reasons.length > 0 && (
        <ul className="space-y-0.5 text-[10px] font-light text-muted-foreground/65">
          {plan.reasons.map((r, i) => (
            <li key={i}>— {r}</li>
          ))}
        </ul>
      )}

      {surfaces.map((s) => {
        const p = s.payload;
        return (
          <SurfaceShell key={s.kind} surface={s}>
            {p?.kind === "cards" && (
              <WorkspaceCards cards={p.cards} selectedId={selected} onSelect={(c) => setSelected(c.id)} />
            )}
            {p?.kind === "cameras" && (
              <WorkspaceCards cards={p.cameras} selectedId={selected} onSelect={(c) => setSelected(c.id)} />
            )}
            {p?.kind === "map" && <WorkspaceMap map={p.map} selectedId={selected} onSelect={setSelected} />}
            {p?.kind === "timeline" && (
              <WorkspaceTimeline items={p.items} selectedId={selected} onSelect={(i) => setSelected(i.id)} />
            )}
            {p?.kind === "graph" && <WorkspaceGraph graph={p.graph} selectedId={selected} onSelect={setSelected} />}
            {p?.kind === "evidence" && (
              <EvidencePanel items={p.items} selectedId={selected} onSelect={(i) => setSelected(i.id)} />
            )}
            {p?.kind === "artifact" && (
              <ArtifactSurface request={p.request} answer={answer} conversationId={conversationId} />
            )}
          </SurfaceShell>
        );
      })}
    </div>
  );
};

export default WorkspacePanel;
