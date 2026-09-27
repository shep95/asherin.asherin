import { FileText } from "lucide-react";
import type { EvidenceItem } from "@/lib/workspace/types";

interface Props {
  items: EvidenceItem[];
  selectedId?: string;
  onSelect?: (item: EvidenceItem) => void;
}

const EvidencePanel = ({ items, selectedId, onSelect }: Props) => (
  <ul className="space-y-1.5">
    {items.map((it) => (
      <li key={it.id}>
        <button
          type="button"
          onClick={() => onSelect?.(it)}
          className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
            it.id === selectedId ? "border-accent/50 bg-accent/10" : "border-border/25 hover:bg-foreground/5"
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-[12px] font-light text-foreground">{it.label}</span>
            <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/70">
              {it.atMs ? new Date(it.atMs).toLocaleTimeString() : "undated"}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground/75">
            {it.mediaAvailable ? "stored artefact available" : `media unavailable — ${it.mediaUnavailableReason}`}
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/55">
            {it.provenance.origin} · {it.provenance.label}
          </div>
        </button>
      </li>
    ))}
  </ul>
);

export default EvidencePanel;
