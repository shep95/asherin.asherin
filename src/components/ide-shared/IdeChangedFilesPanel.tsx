// Collapsible sidebar listing every file the agent touched in the current turn.
// Subscribes to the in-memory ChangedFilesStore.
import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown, FilePlus, FileMinus, FileEdit, RotateCcw } from "lucide-react";
import { changedFiles, type ChangedFile } from "@/lib/ide/changedFiles";

interface Props {
  scope: "aureon" | "asher";
  projectId: string;
  onOpenFile?: (fileId: string) => void;
  onClearAll?: () => void;
}

function formatDelta(b: number) {
  if (b === 0) return "·";
  return (b > 0 ? "+" : "−") + Math.abs(b);
}

export default function IdeChangedFilesPanel({ scope, projectId, onOpenFile, onClearAll }: Props) {
  const [files, setFiles] = useState<ChangedFile[]>(() => changedFiles.list(scope, projectId));
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setFiles(changedFiles.list(scope, projectId));
    return changedFiles.subscribe(scope, projectId, setFiles);
  }, [scope, projectId]);

  if (files.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/30 bg-card/50 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[10.5px] hover:bg-card/60"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span className="font-light tracking-wide">Changed Files</span>
        <span className="text-[9px] text-muted-foreground">({files.length})</span>
        <button
          onClick={(e) => { e.stopPropagation(); changedFiles.clear(scope, projectId); onClearAll?.(); }}
          className="ml-auto opacity-50 hover:opacity-100 flex items-center gap-1 text-[9px]"
          title="Clear list (does not undo edits)"
        >
          <RotateCcw className="size-2.5" /> Clear
        </button>
      </button>
      {open && (
        <ul className="border-t border-border/20">
          {files.map(f => {
            const Icon = f.kind === "create" ? FilePlus : f.kind === "delete" ? FileMinus : FileEdit;
            const tone =
              f.kind === "create" ? "text-emerald-400" :
              f.kind === "delete" ? "text-rose-400" :
              "text-muted-foreground";
            const delta = f.bytesAfter - f.bytesBefore;
            return (
              <li key={f.fileId}>
                <button
                  onClick={() => onOpenFile?.(f.fileId)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-card/60 text-left"
                >
                  <Icon className={`size-3 ${tone}`} />
                  <span className="flex-1 truncate font-mono">{f.filePath}</span>
                  <span className="text-[9px] text-muted-foreground tabular-nums">{formatDelta(delta)} B</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
