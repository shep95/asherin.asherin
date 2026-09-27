// Pain Point #10: Semantic Search Panel — searches by meaning, groups by category.
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { semanticSearch, type FileBlob, type SearchGroup } from "@/lib/ide/semanticSearch";

interface Props {
  open: boolean;
  files: FileBlob[];
  onClose: () => void;
  onJump: (fileId: string, line: number) => void;
}

export default function IdeSemanticSearch({ open, files, onClose, onJump }: Props) {
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);

  useEffect(() => {
    if (!open || !q.trim()) { setGroups([]); return; }
    setBusy(true);
    const id = setTimeout(() => {
      setGroups(semanticSearch(q, files));
      setBusy(false);
    }, 120);
    return () => clearTimeout(id);
  }, [q, files, open]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.hits.length, 0), [groups]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 backdrop-blur-sm p-4 pt-[8vh]" onClick={onClose}>
      <div className="w-[720px] max-w-full max-h-[80vh] rounded-lg border border-border/30 bg-card/95 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
          <Search className="size-3.5 opacity-60" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder='Ask in plain English — e.g. "where do we fetch user data?"'
            className="flex-1 bg-transparent outline-none text-[12px] font-light placeholder:text-muted-foreground/60"
          />
          {busy && <Loader2 className="size-3 animate-spin opacity-60" />}
          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">{total} matches</span>
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="size-3.5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {!q.trim() && <p className="text-[11px] text-muted-foreground/70 font-light">Type to search by meaning. Results group by definitions, calls, queries, cache, imports.</p>}
          {q.trim() && !busy && groups.length === 0 && <p className="text-[11px] text-muted-foreground/70 font-light">No matches.</p>}
          {groups.map(g => (
            <section key={g.category}>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 mb-1">◈ {g.label} <span className="opacity-50">({g.hits.length})</span></div>
              <ul className="space-y-1">
                {g.hits.slice(0, 12).map((h, i) => (
                  <li key={i}>
                    <button
                      onClick={() => { onJump(h.fileId, h.line); onClose(); }}
                      className="w-full text-left rounded border border-border/20 bg-card/40 hover:border-foreground/30 px-2 py-1.5"
                    >
                      <div className="text-[10px] text-muted-foreground/80 font-mono truncate">{h.filePath}:{h.line}</div>
                      <pre className="text-[10.5px] font-mono whitespace-pre-wrap leading-relaxed opacity-90">{h.snippet}</pre>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
