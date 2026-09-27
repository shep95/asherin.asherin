// Pain Point #17: Natural-language Command Palette.
// Translates intent → command. Fuzzy-matches command name OR keywords.

import { useEffect, useMemo, useRef, useState } from "react";
import { Command, X } from "lucide-react";

export interface IdeCommand {
  id: string;
  label: string;
  shortcut?: string;
  keywords?: string[];
  run: () => void;
}

interface Props {
  open: boolean;
  commands: IdeCommand[];
  onClose: () => void;
}

function score(q: string, c: IdeCommand): number {
  const qq = q.toLowerCase().trim();
  if (!qq) return 1;
  const hay = [c.label, ...(c.keywords || [])].join(" ").toLowerCase();
  // exact phrase
  if (hay.includes(qq)) return 100;
  // all tokens present
  const toks = qq.split(/\s+/);
  let s = 0;
  for (const t of toks) if (hay.includes(t)) s += 10;
  // fuzzy: subsequence match on label
  let i = 0;
  for (const ch of c.label.toLowerCase()) if (ch === qq[i]) { i++; if (i === qq.length) break; }
  if (i === qq.length) s += 5;
  return s;
}

export default function IdeCommandPalette({ open, commands, onClose }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  const results = useMemo(() => {
    const scored = commands.map(c => ({ c, s: score(q, c) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30);
    return scored.map(x => x.c);
  }, [commands, q]);

  useEffect(() => { setActive(0); }, [q]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 backdrop-blur-sm p-4 pt-[12vh]" onClick={onClose}>
      <div className="w-[560px] max-w-full max-h-[70vh] rounded-lg border border-border/30 bg-card/95 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
          <Command className="size-3.5 opacity-60" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { const r = results[active]; if (r) { r.run(); onClose(); } }
            }}
            placeholder='Type a command — e.g. "format code", "save", "fmt"'
            className="flex-1 bg-transparent outline-none text-[12px] font-light placeholder:text-muted-foreground/60"
          />
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="size-3.5" /></button>
        </header>
        <ul className="flex-1 overflow-y-auto py-1">
          {results.length === 0 && <li className="px-3 py-4 text-[11px] text-muted-foreground/70 font-light">No matching commands.</li>}
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                onClick={() => { c.run(); onClose(); }}
                onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-3 py-1.5 text-[11.5px] flex items-center justify-between gap-3 ${i === active ? "bg-foreground/10" : "hover:bg-foreground/5"}`}
              >
                <span>{c.label}</span>
                {c.shortcut && <span className="text-[9px] text-muted-foreground/60 font-mono uppercase tracking-wider">{c.shortcut}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
