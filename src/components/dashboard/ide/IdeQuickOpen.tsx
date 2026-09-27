import { useState, useEffect, useRef, useMemo } from "react";
import { FileCode, FileText, File, Image, Database, Settings } from "lucide-react";
import type { IdeFile } from "./IdeFileTree";

interface Props {
  open: boolean;
  onClose: () => void;
  files: IdeFile[];
  onSelectFile: (file: IdeFile) => void;
}

const FILE_ICONS: Record<string, React.ElementType> = {
  tsx: FileCode, ts: FileCode, jsx: FileCode, js: FileCode,
  css: FileText, html: FileText, md: FileText, json: Settings,
  png: Image, jpg: Image, svg: Image,
  sql: Database,
};

function getIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] || File;
}

function flattenWithPath(files: IdeFile[], path: string = ""): { file: IdeFile; path: string }[] {
  const result: { file: IdeFile; path: string }[] = [];
  for (const f of files) {
    const fullPath = path ? `${path}/${f.name}` : f.name;
    if (f.type === "file") result.push({ file: f, path: fullPath });
    if (f.children) result.push(...flattenWithPath(f.children, fullPath));
  }
  return result;
}

const IdeQuickOpen = ({ open, onClose, files, onSelectFile }: Props) => {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allFiles = useMemo(() => flattenWithPath(files), [files]);

  const filtered = useMemo(() => {
    if (!query) return allFiles.slice(0, 20);
    const lower = query.toLowerCase();
    return allFiles
      .filter(f => f.path.toLowerCase().includes(lower))
      .slice(0, 20);
  }, [query, allFiles]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && filtered[selectedIdx]) {
      onSelectFile(filtered[selectedIdx].file);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-[90vw] max-w-lg bg-card border border-border/30 rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/20">
          <FileCode className="h-4 w-4 text-accent/60" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go to file..."
            className="flex-1 bg-transparent text-sm font-light text-foreground outline-none placeholder:text-muted-foreground/40"
          />
          <span className="text-[9px] text-muted-foreground/30">Ctrl+P</span>
        </div>
        <div className="max-h-[300px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground/40">No files found</div>
          ) : (
            filtered.map((f, idx) => {
              const Icon = getIcon(f.file.name);
              return (
                <button
                  key={f.file.id}
                  onClick={() => { onSelectFile(f.file); onClose(); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-[12px] font-light transition-colors ${
                    idx === selectedIdx ? "bg-accent/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  <span className="truncate">{f.file.name}</span>
                  <span className="text-[9px] text-muted-foreground/30 ml-auto truncate max-w-[200px]">{f.path}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default IdeQuickOpen;
