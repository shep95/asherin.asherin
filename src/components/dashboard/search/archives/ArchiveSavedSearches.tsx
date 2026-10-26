import { useState } from "react";
import { Star, Bell, Search as SearchIcon, Trash2, Play, Pencil } from "lucide-react";

export interface SavedSearch {
  id: string;
  query: string;
  resultCount: number;
  lastViewed: string;
  alertOn: boolean;
  newResults?: number;
}

interface Props {
  searches: SavedSearch[];
  onRun: (q: string) => void;
  onDelete: (id: string) => void;
  onToggleAlert: (id: string) => void;
}

const ArchiveSavedSearches = ({ searches, onRun, onDelete, onToggleAlert }: Props) => {
  if (searches.length === 0) {
    return (
      <div className="text-center py-8">
        <Star className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
        <p className="text-[11px] font-extralight text-muted-foreground/50">no saved searches yet.</p>
        <p className="text-[10px] font-extralight text-muted-foreground/30 mt-1">save a search to monitor for new intelligence.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">your saved searches</p>
      {searches.map(s => (
        <div key={s.id} className="rounded-xl border border-border/20 bg-card/30 px-3 py-2.5">
          <div className="flex items-center gap-2">
            {s.alertOn ? <Bell className="h-3.5 w-3.5 text-accent shrink-0" /> : <SearchIcon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-light text-foreground truncate">"{s.query}"</p>
              <p className="text-[9px] text-muted-foreground/50">
                {s.resultCount.toLocaleString()} results · Last viewed: {s.lastViewed}
                {s.newResults ? <span className="text-accent ml-1">({s.newResults} new)</span> : null}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => onRun(s.query)} className="text-[9px] text-accent/70 hover:text-accent px-1.5 py-0.5 rounded hover:bg-accent/10 transition-colors">run</button>
              <button onClick={() => onToggleAlert(s.id)} className="text-[9px] text-muted-foreground/50 hover:text-foreground px-1 py-0.5 rounded hover:bg-foreground/5 transition-colors" title={s.alertOn ? "Disable alert" : "Enable alert"}>
                <Bell className={`h-3 w-3 ${s.alertOn ? "text-accent" : ""}`} />
              </button>
              <button onClick={() => onDelete(s.id)} className="text-[9px] text-muted-foreground/30 hover:text-destructive px-1 py-0.5 rounded hover:bg-destructive/10 transition-colors">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ArchiveSavedSearches;
