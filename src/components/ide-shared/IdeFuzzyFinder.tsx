// IDE Pain Point #11: Fuzzy file finder. Shared launcher for both IDEs.
import { useState, useMemo, useEffect, useRef } from "react";
import { FileCode, X } from "lucide-react";

export interface FuzzyFile {
  id: string;
  path: string;
}

interface Props {
  open: boolean;
  files: FuzzyFile[];
  onPick: (id: string) => void;
  onClose: () => void;
}

function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 1000 - (t.indexOf(q) * 2);
  let qi = 0, score = 0, lastMatch = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      score += 10;
      if (lastMatch === i - 1) score += 15; // consecutive bonus
      if (i === 0 || /[/\-_.\s]/.test(t[i - 1])) score += 8; // boundary bonus
      lastMatch = i;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

export default function IdeFuzzyFinder({ open, files, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQuery(""); setHighlight(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);

  const ranked = useMemo(() => {
    if (!query) return files.slice(0, 30);
    return files
      .map(f => ({ f, s: fuzzyScore(query, f.path) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map(x => x.f);
  }, [query, files]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-background/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-[520px] max-w-full rounded-lg border border-border/30 bg-card/95 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlight(0); }}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(h + 1, ranked.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
              else if (e.key === "Enter" && ranked[highlight]) { onPick(ranked[highlight].id); onClose(); }
              else if (e.key === "Escape") onClose();
            }}
            placeholder="Go to file… (fuzzy: 'thc' → ThreatCard)"
            className="flex-1 bg-transparent text-[12px] font-light outline-none placeholder:text-muted-foreground/40"
          />
          <button onClick={onClose} className="opacity-50 hover:opacity-100"><X className="size-3" /></button>
        </div>
        <ul className="max-h-[420px] overflow-y-auto py-1">
          {ranked.length === 0 && <li className="px-3 py-4 text-[10px] text-center text-muted-foreground/50">No matching files</li>}
          {ranked.map((f, i) => (
            <li key={f.id}>
              <button
                onMouseEnter={() => setHighlight(i)}
                onClick={() => { onPick(f.id); onClose(); }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left ${i === highlight ? "bg-card/80" : "hover:bg-card/40"}`}
              >
                <FileCode className="size-3 opacity-50" />
                <span className="font-mono opacity-90 truncate">{f.path}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
