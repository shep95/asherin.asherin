// Generated cards. One renderer for every card kind — the shape comes from the
// structured result, never from a per-answer layout.

import {
  Building2,
  Camera,
  CircleAlert,
  FileText,
  Link2,
  MapPin,
  Radio,
  ShieldQuestion,
  Route,
  User,
} from "lucide-react";
import type { CardKind, WorkspaceCard } from "@/lib/workspace/types";

const ICON: Record<CardKind, typeof MapPin> = {
  entity: ShieldQuestion,
  person: User,
  company: Building2,
  location: MapPin,
  camera: Camera,
  sensor: Radio,
  incident: CircleAlert,
  event: CircleAlert,
  evidence: FileText,
  source: Link2,
  document: FileText,
  relationship: Link2,
  "timeline-event": CircleAlert,
  track: Route,
  investigation: ShieldQuestion,
};

interface Props {
  cards: WorkspaceCard[];
  selectedId?: string;
  onSelect?: (card: WorkspaceCard) => void;
  onAction?: (card: WorkspaceCard, actionId: string) => void;
}

const WorkspaceCards = ({ cards, selectedId, onSelect, onAction }: Props) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {cards.map((c) => {
      const Icon = ICON[c.kind] ?? ShieldQuestion;
      const active = c.id === selectedId;
      return (
        <div
          key={c.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect?.(c)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect?.(c);
            }
          }}
          className={`cursor-pointer rounded-xl border px-3 py-2.5 text-left transition-colors ${
            active ? "border-accent/50 bg-accent/10" : "border-border/25 bg-foreground/[0.02] hover:bg-foreground/[0.05]"
          }`}
        >
          <div className="flex items-center gap-2">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">{c.kind}</span>
          </div>
          <div className="mt-1 truncate text-[13px] font-light text-foreground">{c.title}</div>
          {c.subtitle && <div className="truncate text-[11px] text-muted-foreground/80">{c.subtitle}</div>}

          <dl className="mt-1.5 space-y-0.5">
            {c.fields.map((f, i) => (
              <div key={i} className="flex gap-2 text-[11px]">
                <dt className="w-20 shrink-0 text-muted-foreground/60">{f.label}</dt>
                <dd className="min-w-0 flex-1 truncate text-foreground/85">{f.value}</dd>
              </div>
            ))}
          </dl>

          {c.unresolved?.length ? (
            <ul className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground/70">
              {c.unresolved.map((u, i) => (
                <li key={i}>unresolved — {u}</li>
              ))}
            </ul>
          ) : null}

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/15 pt-1.5">
            <span className="truncate text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
              {c.provenance.origin} · {c.provenance.label}
              {typeof c.provenance.confidence === "number" ? ` · ${Math.round(c.provenance.confidence * 100)}%` : ""}
            </span>
            {c.actions?.length ? (
              <span className="flex gap-1">
                {c.actions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAction?.(c, a.id);
                    }}
                    className="rounded-md border border-border/30 px-1.5 py-0.5 text-[10px] font-light text-foreground/80 hover:bg-foreground/5"
                  >
                    {a.label}
                  </button>
                ))}
              </span>
            ) : null}
          </div>
        </div>
      );
    })}
  </div>
);

export default WorkspaceCards;
