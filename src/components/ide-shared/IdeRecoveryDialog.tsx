// Pain Point #6: Crash recovery dialog — shown when an autosave is newer than the loaded session.
import { Clock, RotateCcw, X } from "lucide-react";

interface Props {
  open: boolean;
  ageMs: number;
  fileCount: number;
  onRestore: () => void;
  onDiscard: () => void;
}

function fmtAge(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)}h ago`;
}

export default function IdeRecoveryDialog({ open, ageMs, fileCount, onRestore, onDiscard }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-[440px] max-w-full rounded-lg border border-border/30 bg-card/95 shadow-2xl">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/20">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 opacity-70" />
            <h3 className="text-[11px] font-light tracking-wide uppercase">Recover unsaved work</h3>
          </div>
          <button onClick={onDiscard} className="opacity-60 hover:opacity-100"><X className="size-3.5" /></button>
        </header>
        <div className="p-4 space-y-3">
          <p className="text-[11.5px] leading-relaxed text-foreground/85">
            We found auto-saved changes from <span className="font-medium">{fmtAge(ageMs)}</span> across {fileCount} file{fileCount === 1 ? "" : "s"}.
          </p>
          <p className="text-[10.5px] text-muted-foreground/80 leading-relaxed">
            Restoring will overwrite the current editor contents with the last auto-saved snapshot.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onDiscard} className="px-3 py-1.5 rounded border border-border/30 text-[10px] uppercase tracking-wider hover:bg-foreground/5">Discard</button>
            <button onClick={onRestore} className="px-3 py-1.5 rounded border border-foreground/40 bg-foreground/10 text-foreground text-[10px] uppercase tracking-wider hover:bg-foreground/20 inline-flex items-center gap-1.5"><RotateCcw className="size-3" /> Restore</button>
          </div>
        </div>
      </div>
    </div>
  );
}
