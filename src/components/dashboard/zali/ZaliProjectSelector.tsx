import { useState } from "react";
import { Plus, ChevronRight, Trash2, Pencil, Check, X, Atom, FolderOpen } from "lucide-react";
import type { ZaliProject } from "./types";

interface Props {
  projects: ZaliProject[];
  activeProject: ZaliProject | null;
  onSelect: (project: ZaliProject) => void;
  onCreate: (name: string, designType: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

const DESIGN_TYPES = [
  { value: "product", label: "Physical Product" },
  { value: "material", label: "Material / Chemical" },
  { value: "biological", label: "Biological / Medical" },
  { value: "software", label: "Software System" },
  { value: "architecture", label: "Architecture / Building" },
  { value: "electrical", label: "Electrical / Electronic" },
  { value: "mechanical", label: "Mechanical System" },
  { value: "general", label: "General Design" },
];

const ZaliProjectSelector = ({ projects, activeProject, onSelect, onCreate, onDelete, onRename }: Props) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("general");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [expanded, setExpanded] = useState(false);

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreate(newName.trim(), newType);
    setNewName("");
    setNewType("general");
    setShowCreate(false);
  };

  return (
    <div className="border-b border-border/20 bg-card/10">
      {/* Active project bar + toggle */}
      <div className="flex items-center gap-2 px-3 sm:px-6 py-2">
        <FolderOpen className="h-3.5 w-3.5 text-accent flex-shrink-0" />
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center gap-2 min-w-0 group"
        >
          <span className="text-xs font-light text-foreground truncate">
            {activeProject ? activeProject.name : "No Project Selected"}
          </span>
          {activeProject && (
            <span className="text-[9px] text-muted-foreground/50 hidden sm:inline">
              {activeProject.designType} · {activeProject.phase}
            </span>
          )}
          <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ml-auto flex-shrink-0 ${expanded ? "rotate-90" : ""}`} />
        </button>
        <button
          onClick={() => { setShowCreate(true); setExpanded(true); }}
          className="flex items-center gap-1 rounded-lg bg-accent/10 hover:bg-accent/20 px-2.5 py-1 text-[10px] sm:text-xs text-accent transition-colors flex-shrink-0"
        >
          <Plus className="h-3 w-3" />
          <span className="hidden sm:inline">New Project</span>
        </button>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-3 sm:px-6 pb-3 space-y-2">
          {/* Create form */}
          {showCreate && (
            <div className="rounded-lg border border-accent/20 bg-card/30 p-3 space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleCreate(); }
                  if (e.key === "Escape") { setShowCreate(false); setNewName(""); }
                }}
                placeholder="Project name…"
                className="w-full bg-background/50 border border-border/20 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/30"
                autoFocus
              />
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full bg-background/50 border border-border/20 rounded-lg px-3 py-2 text-xs text-foreground outline-none focus:border-accent/30 appearance-none"
              >
                {DESIGN_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="flex-1 rounded-lg bg-accent/20 py-1.5 text-xs text-accent hover:bg-accent/30 transition-colors disabled:opacity-40"
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewName(""); }}
                  className="rounded-lg border border-border/20 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Project list */}
          {projects.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors group cursor-pointer ${
                    activeProject?.id === p.id ? "bg-accent/10 border border-accent/20" : "bg-foreground/5 hover:bg-foreground/10 border border-transparent"
                  }`}
                >
                  {renamingId === p.id ? (
                    <div className="flex-1 flex items-center gap-1.5">
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && renameValue.trim()) { onRename(p.id, renameValue.trim()); setRenamingId(null); }
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 bg-background/50 border border-border/20 rounded px-2 py-1 text-xs text-foreground outline-none focus:border-accent/30"
                        autoFocus
                      />
                      <button onClick={() => { if (renameValue.trim()) onRename(p.id, renameValue.trim()); setRenamingId(null); }} className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10">
                        <Check className="h-3 w-3" />
                      </button>
                      <button onClick={() => setRenamingId(null)} className="p-1 rounded text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => { onSelect(p); setExpanded(false); }} className="flex-1 text-left min-w-0">
                        <p className="text-xs font-light text-foreground truncate">{p.name}</p>
                        <p className="text-[9px] text-muted-foreground/50">{p.designType} · {p.phase}</p>
                      </button>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={() => { setRenamingId(p.id); setRenameValue(p.name); }} className="p-1 rounded text-muted-foreground/40 hover:text-foreground">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => onDelete(p.id)} className="p-1 rounded text-muted-foreground/40 hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : !showCreate ? (
            <p className="text-[10px] text-muted-foreground/40 text-center py-3">No projects yet — click "New Project" to get started</p>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ZaliProjectSelector;
