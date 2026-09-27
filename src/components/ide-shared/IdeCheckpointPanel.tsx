// One-click rollback panel. Lists checkpoints captured before each agent run.
import { useEffect, useState } from "react";
import { GitCommit, RotateCcw, Trash2, X } from "lucide-react";
import { listCheckpoints, getCheckpoint, deleteCheckpoint, type Checkpoint } from "@/lib/ide/checkpoints";

interface Props {
  scope: "aureon" | "asher";
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Called with the full file set to restore. Caller wires to project state. */
  onRestore: (files: { fileId: string; filePath: string; content: string }[]) => void;
}

function ago(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

export default function IdeCheckpointPanel({ scope, projectId, open, onClose, onRestore }: Props) {
  const [items, setItems] = useState<Checkpoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const reload = async () => {
    if (!projectId) return;
    setItems(await listCheckpoints(scope, projectId));
  };

  useEffect(() => { if (open) reload(); }, [open, scope, projectId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[560px] max-h-[75vh] rounded-lg border border-border/30 bg-card/95 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-border/20">
          <div className="flex items-center gap-2">
            <GitCommit className="size-3.5 text-muted-foreground" />
            <h3 className="text-[11px] font-light tracking-wide">Checkpoints · {scope === "aureon" ? "Asherin IDE" : "Asher IDE"}</h3>
          </div>
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="size-3.5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-[10px] text-muted-foreground/60">
              No checkpoints yet. One is captured automatically before every agent edit.
            </p>
          )}
          <ul className="space-y-1">
            {items.map(c => (
              <li key={c.id} className="px-2 py-2 rounded border border-border/20 bg-card/40 hover:bg-card/60">
                <div className="flex items-center gap-2">
                  <GitCommit className="size-3 opacity-50" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10.5px] truncate">{c.label}</div>
                    <div className="text-[9px] text-muted-foreground/70">
                      {ago(c.createdAt)} · {c.files.length} file{c.files.length === 1 ? "" : "s"}
                      {c.trigger ? <span className="ml-1.5 opacity-70">· “{c.trigger.slice(0, 60)}”</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (!c.id) return;
                        setBusy(true);
                        const full = await getCheckpoint(c.id);
                        setBusy(false);
                        if (full) onRestore(full.files);
                        onClose();
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[9px] bg-card/60 hover:bg-card border border-border/30"
                    >
                      <RotateCcw className="size-2.5" /> Restore
                    </button>
                    <button
                      onClick={() => setConfirmId(c.id ?? null)}
                      className="opacity-50 hover:opacity-100 p-1 rounded hover:bg-destructive/20"
                    >
                      <Trash2 className="size-2.5" />
                    </button>
                  </div>
                </div>
                {confirmId === c.id && (
                  <div className="mt-2 flex items-center justify-end gap-1.5">
                    <span className="text-[9px] text-muted-foreground mr-auto">Delete checkpoint?</span>
                    <button onClick={() => setConfirmId(null)} className="px-2 py-0.5 text-[9px] border border-border/30 rounded">Cancel</button>
                    <button
                      onClick={async () => { if (c.id) { await deleteCheckpoint(c.id); setConfirmId(null); reload(); } }}
                      className="px-2 py-0.5 text-[9px] bg-destructive/30 border border-destructive/40 rounded"
                    >Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <footer className="px-3 py-2 border-t border-border/20 text-[9px] text-muted-foreground/60">
          Restoring rewinds every changed file at once · Stored locally, never uploaded
        </footer>
      </div>
    </div>
  );
}
