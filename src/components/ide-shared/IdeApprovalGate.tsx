// Agent approval gate. Shows the planned multi-file diff before any
// AI-generated code is written. Used by both IDEs for any multi-file
// scaffold or AI patch.
import { Wand2, X, FileEdit, CheckCheck, AlertTriangle } from "lucide-react";
import IdeValidatorBadge from "./IdeValidatorBadge";
import { computeDiff } from "@/lib/ide/fastApply";

function DiffBody({ before, after }: { before: string; after: string }) {
  const lines = computeDiff(before, after);
  const adds = lines.filter(l => l.type === "add").length;
  const dels = lines.filter(l => l.type === "del").length;
  return (
    <div>
      <div className="px-3 py-1 text-[9px] font-mono border-b border-border/15 bg-background/40">
        <span className="text-emerald-400">+{adds}</span> <span className="text-rose-400">−{dels}</span>
      </div>
      <div className="max-h-[240px] overflow-auto font-mono text-[10px] leading-[1.45] bg-background/60">
        {lines.map((line, i) => {
          const bg =
            line.type === "add" ? "bg-emerald-500/10 border-l-2 border-emerald-500/60" :
            line.type === "del" ? "bg-rose-500/10 border-l-2 border-rose-500/60" :
            "border-l-2 border-transparent";
          const sign = line.type === "add" ? "+" : line.type === "del" ? "−" : " ";
          return (
            <div key={i} className={`flex gap-2 px-2 ${bg}`}>
              <span className="w-8 text-right opacity-30 select-none shrink-0">{line.oldNum ?? ""}</span>
              <span className="w-8 text-right opacity-30 select-none shrink-0">{line.newNum ?? ""}</span>
              <span className="opacity-50 select-none shrink-0">{sign}</span>
              <span className="whitespace-pre">{line.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


export interface PlannedChange {
  path: string;
  action: "create" | "update" | "delete";
  content: string;
  language?: string;
  beforeContent?: string;
}

interface Props {
  open: boolean;
  title: string;
  changes: PlannedChange[];
  onApprove: () => void;
  onCancel: () => void;
}

export default function IdeApprovalGate({ open, title, changes, onApprove, onCancel }: Props) {
  if (!open) return null;
  const creates = changes.filter(c => c.action === "create").length;
  const updates = changes.filter(c => c.action === "update").length;
  const deletes = changes.filter(c => c.action === "delete").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4" onClick={onCancel}>
      <div className="w-[720px] max-w-full max-h-[85vh] rounded-lg border border-border/30 bg-card/95 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/20">
          <div className="flex items-center gap-2">
            <Wand2 className="size-3.5 text-foreground/80" />
            <h3 className="text-[11px] font-light tracking-wide uppercase">Approve plan · {title}</h3>
          </div>
          <button onClick={onCancel} className="opacity-60 hover:opacity-100"><X className="size-3.5" /></button>
        </header>

        <div className="px-4 py-2.5 border-b border-border/20 flex items-center gap-3 text-[10px] text-muted-foreground/80">
          {creates > 0 && <span className="text-foreground/80">+ {creates} create{creates === 1 ? "" : "s"}</span>}
          {updates > 0 && <span className="text-muted-foreground/80">~ {updates} update{updates === 1 ? "" : "s"}</span>}
          {deletes > 0 && <span className="text-destructive/80 flex items-center gap-1"><AlertTriangle className="size-2.5" /> − {deletes} delete{deletes === 1 ? "" : "s"}</span>}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {changes.map((c, i) => (
            <div key={i} className="rounded border border-border/30 bg-card/40">
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border/20">
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <FileEdit className={`size-3 ${c.action === "delete" ? "text-destructive/80" : c.action === "create" ? "text-foreground/80" : "text-muted-foreground/80"}`} />
                  <span className="opacity-90">{c.path}</span>
                  <span className="opacity-50">· {c.action}</span>
                </div>
                {c.action !== "delete" && <IdeValidatorBadge content={c.content} language={c.language ?? "tsx"} />}
              </div>
              {c.action !== "delete" && (
                c.beforeContent
                  ? <DiffBody before={c.beforeContent} after={c.content} />
                  : <pre className="text-[10px] font-mono bg-background/60 p-2.5 overflow-x-auto max-h-[240px]">{c.content.slice(0, 4000)}{c.content.length > 4000 ? "\n…" : ""}</pre>
              )}

            </div>
          ))}
        </div>

        <footer className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/20">
          <button onClick={onCancel} className="px-3 py-1.5 rounded border border-border/30 text-[11px] opacity-80 hover:opacity-100">Cancel</button>
          <button onClick={onApprove} className="px-3 py-1.5 rounded border border-foreground/40 bg-foreground/10 text-foreground text-[11px] hover:bg-foreground/20 flex items-center gap-1.5">
            <CheckCheck className="size-3" /> Approve & apply
          </button>
        </footer>
      </div>
    </div>
  );
}
