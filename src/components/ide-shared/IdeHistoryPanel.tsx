// IDE Pain Point #12: Infinite version history. Shared panel for both IDEs.
import { useEffect, useState } from "react";
import { History, RotateCcw, Clock, X } from "lucide-react";
import { listSnapshots, restoreSnapshot, type Snapshot } from "@/lib/ide";

interface Props {
  scope: "aureon" | "asher";
  projectId: string;
  fileId: string;
  filePath: string;
  open: boolean;
  onClose: () => void;
  onRestore: (content: string) => void;
}

function ago(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`;
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

export default function IdeHistoryPanel({ scope, projectId, fileId, filePath, open, onClose, onRestore }: Props) {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !projectId || !fileId) return;
    let alive = true;
    (async () => {
      const s = await listSnapshots(scope, projectId, fileId);
      if (alive) setSnaps(s);
    })();
    return () => { alive = false; };
  }, [open, scope, projectId, fileId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[520px] max-h-[70vh] rounded-lg border border-border/30 bg-card/95 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-border/20">
          <div className="flex items-center gap-2">
            <History className="size-3.5 text-muted-foreground" />
            <h3 className="text-[11px] font-light tracking-wide">History · <span className="opacity-60">{filePath}</span></h3>
          </div>
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="size-3.5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-2">
          {snaps.length === 0 && (
            <p className="px-2 py-6 text-center text-[10px] text-muted-foreground/60">No snapshots yet. Edits are auto-saved every 30 seconds.</p>
          )}
          <ul className="space-y-0.5">
            {snaps.map(s => (
              <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-card/40 group">
                <Clock className="size-3 opacity-40" />
                <span className="text-[10px] opacity-80 flex-1 truncate">
                  {s.label ? <span className="text-foreground/80 mr-1.5">[{s.label}]</span> : null}
                  {ago(s.createdAt)} · {s.bytes} bytes
                </span>
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const r = await restoreSnapshot(s.id!);
                    setBusy(false);
                    if (r) { onRestore(r.content); onClose(); }
                  }}
                  className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded text-[9px] bg-card/60 hover:bg-card border border-border/30"
                >
                  <RotateCcw className="size-2.5" /> Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
        <footer className="px-3 py-2 border-t border-border/20 text-[9px] text-muted-foreground/60">
          Auto-saves every 30s · Keeps the most recent 1,000 versions per file · Stored locally in IndexedDB
        </footer>
      </div>
    </div>
  );
}
