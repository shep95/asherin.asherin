import type { TimelineItem } from "@/lib/workspace/types";

interface Props {
  items: TimelineItem[];
  selectedId?: string;
  onSelect?: (item: TimelineItem) => void;
}

const WorkspaceTimeline = ({ items, selectedId, onSelect }: Props) => (
  <ol className="relative space-y-1.5 border-l border-border/25 pl-3">
    {items.map((it) => (
      <li key={it.id}>
        <button
          type="button"
          onClick={() => onSelect?.(it)}
          className={`w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
            it.id === selectedId ? "bg-accent/10" : "hover:bg-foreground/5"
          }`}
        >
          <span className="absolute -left-[5px] mt-1.5 block h-2 w-2 rounded-full bg-foreground/50" />
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] tabular-nums text-muted-foreground/80">
              {new Date(it.atMs).toLocaleTimeString()}
            </span>
            <span className="text-[12px] font-light text-foreground">{it.label}</span>
          </div>
          {it.detail && <div className="truncate text-[10px] text-muted-foreground/70">{it.detail}</div>}
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">
            {it.provenance.origin} · {it.provenance.label}
          </div>
        </button>
      </li>
    ))}
  </ol>
);

export default WorkspaceTimeline;
