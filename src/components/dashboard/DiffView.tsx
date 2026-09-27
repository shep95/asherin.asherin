import { useMemo } from "react";
import { X } from "lucide-react";

interface DiffViewProps {
  before: string;
  after: string;
  open: boolean;
  onClose: () => void;
}

interface DiffLine {
  type: "same" | "added" | "removed";
  content: string;
  lineNum: number;
}

function computeDiff(before: string, after: string): DiffLine[] {
  const bLines = before.split("\n");
  const aLines = after.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const m = bLines.length, n = aLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = bLines[i - 1] === aLines[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  let i = m, j = n;
  const ops: { type: "same" | "added" | "removed"; content: string }[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && bLines[i - 1] === aLines[j - 1]) {
      ops.unshift({ type: "same", content: bLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: "added", content: aLines[j - 1] });
      j--;
    } else {
      ops.unshift({ type: "removed", content: bLines[i - 1] });
      i--;
    }
  }

  ops.forEach((op, idx) => result.push({ ...op, lineNum: idx + 1 }));
  return result;
}

const DiffView = ({ before, after, open, onClose }: DiffViewProps) => {
  const diff = useMemo(() => computeDiff(before, after), [before, after]);
  const added = diff.filter(d => d.type === "added").length;
  const removed = diff.filter(d => d.type === "removed").length;

  if (!open) return null;

  return (
    <div className="mt-2 rounded-xl border border-border/30 bg-card/30 backdrop-blur-sm overflow-hidden animate-scale-in">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-light text-muted-foreground/60 uppercase tracking-wider">Response Diff</span>
          <span className="text-[10px] font-mono text-emerald-500">+{added}</span>
          <span className="text-[10px] font-mono text-red-400">-{removed}</span>
        </div>
        <button onClick={onClose} className="p-0.5 text-muted-foreground/40 hover:text-foreground transition-colors">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="max-h-[300px] overflow-y-auto font-mono text-[11px] leading-5">
        {diff.map((line, idx) => (
          <div
            key={idx}
            className={`px-3 py-0.5 border-l-2 ${
              line.type === "added"
                ? "bg-emerald-500/5 border-emerald-500/50 text-emerald-300"
                : line.type === "removed"
                  ? "bg-red-500/5 border-red-400/50 text-red-300 line-through opacity-60"
                  : "border-transparent text-muted-foreground/70"
            }`}
          >
            <span className="inline-block w-5 text-right mr-3 text-muted-foreground/30 select-none">
              {line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}
            </span>
            {line.content || " "}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DiffView;
