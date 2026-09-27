import { useState } from "react";
import { Plus, Folder, Trash2, Loader2, Clock } from "lucide-react";
import IdeDeleteConfirm from "./IdeDeleteConfirm";

export interface IdeSession {
  id: string;
  name: string;
  updated_at: string;
}

interface Props {
  sessions: IdeSession[];
  activeSessionId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

const IdeSessionManager = ({ sessions, activeSessionId, loading, onSelect, onCreate, onDelete, onRename }: Props) => {
  const [deleteTarget, setDeleteTarget] = useState<IdeSession | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const startRename = (s: IdeSession) => {
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
        <span className="text-[10px] font-light tracking-widest text-muted-foreground/60 uppercase">Sessions</span>
        <button onClick={onCreate} className="p-1 rounded text-muted-foreground/50 hover:text-foreground transition-colors" title="New session">
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1 space-y-0.5">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-[10px] text-muted-foreground/40">No sessions yet</p>
            <button onClick={onCreate} className="mt-2 text-[10px] text-accent hover:text-accent/80 transition-colors">
              Create your first project
            </button>
          </div>
        ) : (
          sessions.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-md transition-colors group ${
                s.id === activeSessionId ? "bg-accent/15 text-accent" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              }`}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {editingId === s.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingId(null); }}
                    onBlur={commitRename}
                    className="w-full bg-transparent text-[11px] font-light outline-none border-b border-accent/30"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="text-[11px] font-light truncate block"
                    onDoubleClick={(e) => { e.stopPropagation(); startRename(s); }}
                  >
                    {s.name}
                  </span>
                )}
                <span className="text-[9px] text-muted-foreground/40 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {new Date(s.updated_at).toLocaleDateString()}
                </span>
              </div>
              <Trash2
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
                className="h-3 w-3 opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:text-destructive shrink-0 transition-opacity"
              />
            </button>
          ))
        )}
      </div>

      <IdeDeleteConfirm
        open={!!deleteTarget}
        fileName={deleteTarget?.name ?? ""}
        onConfirm={() => { if (deleteTarget) onDelete(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default IdeSessionManager;
