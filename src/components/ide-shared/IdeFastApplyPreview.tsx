// Inline diff preview + Apply / Reject controls for a Fast-Apply patch.
import { useMemo } from "react";
import { Check, X, FileDiff } from "lucide-react";
import { applyFastApply, computeDiff } from "@/lib/ide/fastApply";

interface Props {
  filePath: string;
  originalContent: string;
  /** The raw model output containing one or more SEARCH/REPLACE blocks. */
  rawPatch: string;
  onApply: (patched: string) => void;
  onReject: () => void;
}

export default function IdeFastApplyPreview({ filePath, originalContent, rawPatch, onApply, onReject }: Props) {
  const result = useMemo(() => applyFastApply(originalContent, rawPatch), [originalContent, rawPatch]);
  const diff = useMemo(() => result.ok ? computeDiff(originalContent, result.patched) : [], [result, originalContent]);

  const adds = diff.filter(d => d.type === "add").length;
  const dels = diff.filter(d => d.type === "del").length;

  return (
    <div className="rounded-lg border border-border/30 bg-card/60 overflow-hidden">
      <header className="flex items-center justify-between px-3 py-2 border-b border-border/20 bg-card/40">
        <div className="flex items-center gap-2 min-w-0">
          <FileDiff className="size-3.5 opacity-60" />
          <span className="text-[10.5px] truncate font-mono">{filePath}</span>
          {result.ok && (
            <span className="text-[9px] text-muted-foreground">
              <span className="text-emerald-400">+{adds}</span>{" "}
              <span className="text-rose-400">−{dels}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] bg-card/60 hover:bg-card border border-border/30"
          >
            <X className="size-2.5" /> Reject
          </button>
          <button
            disabled={!result.ok}
            onClick={() => onApply(result.patched)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] bg-foreground/10 hover:bg-foreground/20 border border-border/40 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Check className="size-2.5" /> Apply
          </button>
        </div>
      </header>
      <div className="max-h-[360px] overflow-auto font-mono text-[10px] leading-[1.4]">
        {!result.ok && (
          <div className="px-3 py-3 text-rose-400/80 text-[10px]">
            Patch could not be applied: {result.error}
          </div>
        )}
        {result.ok && diff.map((line, i) => {
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
