import { useState, useCallback, useEffect } from "react";
import { GitBranch, Plus, Trash2, Check } from "lucide-react";

export interface Branch {
  id: string;
  name: string;
  createdAt: number;
}

const BRANCHES_KEY = "aureon_conv_branches";
const ACTIVE_BRANCH_KEY = "aureon_active_branch";
const MSG_BRANCH_KEY = "aureon_msg_branch_map";

// ── In-memory cache for branch-message map ──────────────────────────
let branchMapCache: Record<string, string> | null = null;

function loadBranchMap(): Record<string, string> {
  if (branchMapCache) return branchMapCache;
  try {
    branchMapCache = JSON.parse(localStorage.getItem(MSG_BRANCH_KEY) || "{}");
  } catch {
    branchMapCache = {};
  }
  return branchMapCache!;
}

function persistBranchMap() {
  if (!branchMapCache) return;
  try {
    const keys = Object.keys(branchMapCache);
    // Prune to last 5000 entries to prevent overflow
    if (keys.length > 5000) {
      const toRemove = keys.slice(0, keys.length - 5000);
      toRemove.forEach(k => delete branchMapCache![k]);
    }
    localStorage.setItem(MSG_BRANCH_KEY, JSON.stringify(branchMapCache));
  } catch { /* localStorage full — cache still valid in memory */ }
}

// ── Public API ──────────────────────────────────────────────────────

export function getBranches(convId: string): Branch[] {
  const fallback = [{ id: "main", name: "Main", createdAt: 0 }];
  try {
    const all = JSON.parse(localStorage.getItem(BRANCHES_KEY) || "{}");
    const branches = Array.isArray(all[convId]) ? all[convId] : fallback;
    return branches.length > 0 ? branches : fallback;
  } catch {
    return fallback;
  }
}

export function saveBranchesLocal(convId: string, branches: Branch[]) {
  try {
    const all = JSON.parse(localStorage.getItem(BRANCHES_KEY) || "{}");
    all[convId] = branches;
    localStorage.setItem(BRANCHES_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

/** Save branches to DB (fire-and-forget) */
export async function saveBranchesToDB(convId: string, branches: Branch[]) {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.from("conversations").update({ branches: branches as any }).eq("id", convId);
  } catch { /* non-critical */ }
}

/** Restore branches from DB into localStorage (call on conversation load) */
export function restoreBranchesFromDB(convId: string, dbBranches: any) {
  try {
    const fallback: Branch[] = [{ id: "main", name: "Main", createdAt: 0 }];
    let branches: Branch[] = fallback;

    if (typeof dbBranches === "string") {
      branches = JSON.parse(dbBranches || "[]");
    } else if (Array.isArray(dbBranches)) {
      branches = dbBranches;
    }

    const normalized = Array.isArray(branches) && branches.length > 0 ? branches : fallback;
    const withMain = normalized.some((branch) => branch.id === "main")
      ? normalized
      : [fallback[0], ...normalized];

    saveBranchesLocal(convId, withMain);
  } catch {
    saveBranchesLocal(convId, [{ id: "main", name: "Main", createdAt: 0 }]);
  }
}

export function getActiveBranch(convId: string): string {
  try {
    const all = JSON.parse(localStorage.getItem(ACTIVE_BRANCH_KEY) || "{}");
    return all[convId] || "main";
  } catch {
    return "main";
  }
}

export function setActiveBranchStorage(convId: string, branchId: string) {
  try {
    const all = JSON.parse(localStorage.getItem(ACTIVE_BRANCH_KEY) || "{}");
    all[convId] = branchId;
    localStorage.setItem(ACTIVE_BRANCH_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

export function getMessageBranch(msgId: string): string {
  const map = loadBranchMap();
  return map[msgId] || "main";
}

export function tagMessageBranch(msgId: string, branchId: string) {
  const map = loadBranchMap();
  map[msgId] = branchId;
  persistBranchMap();
}

/** Re-tag a message when its ID changes (temp → DB ID) */
export function retargetMessageBranch(oldId: string, newId: string) {
  const map = loadBranchMap();
  const branch = map[oldId];
  if (branch) {
    map[newId] = branch;
    delete map[oldId];
    persistBranchMap();
  }
}

/** Hydrate the in-memory cache from DB branch_id values (call after loading messages from DB) */
export function hydrateMessageBranches(messages: { id: string; branch_id?: string | null }[]) {
  const map = loadBranchMap();
  let changed = false;
  for (const m of messages) {
    if (m.branch_id && m.branch_id !== "main" && !map[m.id]) {
      map[m.id] = m.branch_id;
      changed = true;
    }
  }
  if (changed) persistBranchMap();
}

// ── Component ───────────────────────────────────────────────────────

interface Props {
  conversationId: string;
  activeBranch: string;
  onBranchChange: (branchId: string) => void;
}

const ConversationBranches = ({ conversationId, activeBranch, onBranchChange }: Props) => {
  const [branches, setBranches] = useState<Branch[]>(() => getBranches(conversationId));
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    setBranches(getBranches(conversationId));
  }, [conversationId]);

  const persistBranches = useCallback((convId: string, updated: Branch[]) => {
    saveBranchesLocal(convId, updated);
    saveBranchesToDB(convId, updated); // fire-and-forget to DB
  }, []);

  const createBranch = useCallback(() => {
    const id = crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10);
    const num = branches.length;
    const newBranch: Branch = { id, name: `Branch ${num}`, createdAt: Date.now() };
    const updated = [...branches, newBranch];
    setBranches(updated);
    persistBranches(conversationId, updated);
    setActiveBranchStorage(conversationId, id);
    onBranchChange(id);
  }, [branches, conversationId, onBranchChange, persistBranches]);

  const deleteBranch = useCallback((branchId: string) => {
    if (branchId === "main") return;
    const updated = branches.filter(b => b.id !== branchId);
    setBranches(updated);
    persistBranches(conversationId, updated);
    if (activeBranch === branchId) {
      setActiveBranchStorage(conversationId, "main");
      onBranchChange("main");
    }
  }, [branches, conversationId, activeBranch, onBranchChange, persistBranches]);

  const switchBranch = useCallback((branchId: string) => {
    setActiveBranchStorage(conversationId, branchId);
    onBranchChange(branchId);
    setOpen(false);
  }, [conversationId, onBranchChange]);

  const startRename = (branchId: string, currentName: string) => {
    setRenaming(branchId);
    setRenameValue(currentName);
  };

  const commitRename = () => {
    if (!renaming || !renameValue.trim()) { setRenaming(null); return; }
    const updated = branches.map(b => b.id === renaming ? { ...b, name: renameValue.trim() } : b);
    setBranches(updated);
    persistBranches(conversationId, updated);
    setRenaming(null);
  };

  const currentBranch = branches.find(b => b.id === activeBranch) || branches[0];

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-light transition-all ${
          open ? "bg-accent/15 text-accent" : "text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5"
        }`}
        title="Conversation branches — test different responses without memory"
      >
        <GitBranch className="h-3.5 w-3.5" />
        <span className="hidden sm:inline truncate max-w-[80px]">{currentBranch?.name || "Main"}</span>
        {branches.length > 1 && (
          <span className="text-[9px] bg-foreground/10 rounded-full px-1.5 py-0.5">{branches.length}</span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-card/95 backdrop-blur-xl border border-border/30 rounded-xl shadow-2xl overflow-hidden animate-fade-in">
          <div className="px-3 py-2 border-b border-border/10">
            <p className="text-[10px] font-light tracking-wider text-muted-foreground/60 uppercase">Branches</p>
            <p className="text-[9px] font-extralight text-muted-foreground/40 mt-0.5">Each branch has isolated memory</p>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {branches.map(branch => (
              <div
                key={branch.id}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group ${
                  activeBranch === branch.id ? "bg-accent/10 text-accent" : "text-foreground/70 hover:bg-foreground/5"
                }`}
              >
                {renaming === branch.id ? (
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }}
                      autoFocus
                      className="flex-1 bg-transparent text-xs outline-none border-b border-accent/30"
                    />
                    <button onClick={commitRename} className="p-0.5 text-accent hover:text-accent/80">
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0" onClick={() => switchBranch(branch.id)}>
                      <div className="flex items-center gap-1.5">
                        <GitBranch className="h-3 w-3 shrink-0" />
                        <span className="text-xs font-light truncate">{branch.name}</span>
                        {activeBranch === branch.id && (
                          <span className="text-[8px] bg-accent/20 text-accent rounded px-1">active</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(branch.id, branch.name); }}
                        className="p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors"
                        title="Rename"
                      >
                        <span className="text-[10px]">✎</span>
                      </button>
                      {branch.id !== "main" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteBranch(branch.id); }}
                          className="p-0.5 text-muted-foreground/50 hover:text-red-400 transition-colors"
                          title="Delete branch"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-border/10 p-2">
            <button
              onClick={createBranch}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-light text-accent/70 hover:text-accent bg-accent/5 hover:bg-accent/10 transition-all"
            >
              <Plus className="h-3 w-3" />
              New Branch (no memory)
            </button>
          </div>
        </div>
      )}

      {/* Click-away */}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
    </div>
  );
};

export default ConversationBranches;
