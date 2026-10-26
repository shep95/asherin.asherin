// asherin.extract — the session strip.
//
// A column at desktop width, a short scrolling strip above the workspace on a
// phone. Every control is reachable by touch and keyboard: rename has a
// button (double-click still works), delete asks once inline before it acts.

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, FileText, Pencil } from "lucide-react";
import type { ScrapperSession } from "./store";
import { formatChars } from "./extract";

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
  const [armedId, setArmedId] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    },
    [],
  );

  const startRename = (s: ScrapperSession) => {
    setEditingId(s.id);
    setEditName(s.name);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) onRename(editingId, editName.trim());
    setEditingId(null);
  };

  const askDelete = (id: string) => {
    if (armedId === id) {
      if (armTimer.current) clearTimeout(armTimer.current);
      setArmedId(null);
      onDelete(id);
      return;
    }
    setArmedId(id);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmedId(null), 3500);
  };

  return (
    <aside
      aria-label="sessions"
      className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-border/15 bg-card/5 backdrop-blur-sm flex flex-col max-h-44 md:max-h-none md:h-full"
    >
      <div className="px-4 py-3 md:py-4 border-b border-border/10 flex items-center justify-between">
        <h3 className="text-xs font-light tracking-[0.15em] text-foreground/80">sessions</h3>
        <button
          type="button"
          onClick={onCreate}
          aria-label="new session"
          title="new session"
          className="p-1.5 rounded-lg hover:bg-foreground/5 transition-colors text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 && (
          <p className="text-[10px] text-muted-foreground/50 text-center py-6 md:py-8 font-extralight">no sessions yet</p>
        )}
        {sessions.map((s) => {
          const active = activeSessionId === s.id;
          const armed = armedId === s.id;
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(s.id);
                }
              }}
              className={`group flex items-center gap-2 rounded-lg px-3 py-2 md:py-2.5 cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-accent/50 ${
                active ? "bg-accent/10 border border-accent/20" : "hover:bg-foreground/5 border border-transparent"
              }`}
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                {editingId === s.id ? (
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    maxLength={80}
                    aria-label="session name"
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
                  {s.total_files} file{s.total_files !== 1 ? "s" : ""} · {formatChars(s.total_text_length)}
                </p>
              </div>
              <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                {editingId !== s.id && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(s);
                    }}
                    aria-label={`rename ${s.name}`}
                    title="rename"
                    className="p-1 rounded hover:bg-foreground/10 text-muted-foreground/40 hover:text-foreground transition-colors"
                  >
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    askDelete(s.id);
                  }}
                  aria-label={armed ? `confirm delete ${s.name}` : `delete ${s.name}`}
                  title={armed ? "tap again to delete" : "delete"}
                  className={`flex items-center gap-1 rounded px-1 py-1 transition-colors ${
                    armed ? "bg-destructive/15 text-destructive" : "hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive"
                  }`}
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  {armed && <span className="text-[9px] font-light">sure?</span>}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default SessionsList;
