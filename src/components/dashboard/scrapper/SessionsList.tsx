import { Plus, Trash2, FileText } from "lucide-react";
import type { ScrapperSession } from "./FileScrapperView";
import { useState } from "react";

interface Props {
  sessions: ScrapperSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

const SessionsList = ({ sessions, activeSessionId, onSelect, onCreate, onDelete, onRename }: Props) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const startRename = (s: ScrapperSession) => {
    setEditingId(s.id);
    setEditName(s.name);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="w-64 border-r border-border/15 bg-card/5 backdrop-blur-sm flex flex-col h-full">
      <div className="px-4 py-4 border-b border-border/10 flex items-center justify-between">
        <h3 className="text-xs font-light tracking-[0.15em] uppercase text-foreground/80">Sessions</h3>
        <button
          onClick={onCreate}
          className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 && (
          <p className="text-[10px] text-muted-foreground/50 text-center py-8 font-extralight">
            No sessions yet
          </p>
        )}
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`group flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
              activeSessionId === s.id
                ? "bg-accent/10 border border-accent/20"
                : "hover:bg-foreground/5 border border-transparent"
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            <div className="flex-1 min-w-0">
              {editingId === s.id ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => e.key === "Enter" && commitRename()}
                  autoFocus
                  className="w-full bg-transparent text-xs font-light text-foreground outline-none border-b border-accent/30"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <p
                  className="text-xs font-light text-foreground truncate"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRename(s);
                  }}
                >
                  {s.name}
                </p>
              )}
              <p className="text-[9px] text-muted-foreground/40 mt-0.5">
                {s.total_files} file{s.total_files !== 1 ? "s" : ""} · {(s.total_text_length / 1000).toFixed(1)}k chars
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(s.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 transition-all text-muted-foreground/40 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SessionsList;
