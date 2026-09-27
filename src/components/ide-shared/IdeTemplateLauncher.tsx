// IDE Pain Point #7/#17: Smart templates + natural-language commands.
// Compact launcher used inside command palettes for both IDEs.
import { useState, useMemo } from "react";
import { Sparkles, FileCode, Wand2 } from "lucide-react";
import { parseTemplatePhrase, scaffold, type ScaffoldResult } from "@/lib/ide";

interface Props {
  open: boolean;
  onCreate: (result: ScaffoldResult) => void;
  onClose: () => void;
}

const PRESETS = [
  { label: "new component MyCard", desc: "React component + test file" },
  { label: "new page Dashboard", desc: "Page with main layout" },
  { label: "new hook useDebounce", desc: "Custom React hook + test" },
  { label: "new context Auth", desc: "Provider + useContext hook" },
  { label: "new api intelligence", desc: "Supabase function client" },
  { label: "new util formatDate", desc: "Plain helper module" },
  { label: "new model User", desc: "Type/interface + factory" },
];

export default function IdeTemplateLauncher({ open, onCreate, onClose }: Props) {
  const [phrase, setPhrase] = useState("");
  const parsed = useMemo(() => parseTemplatePhrase(phrase), [phrase]);
  const preview = useMemo(() => parsed ? scaffold(parsed.kind, parsed.name) : null, [parsed]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-background/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-[560px] max-w-full rounded-lg border border-border/30 bg-card/95 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
          <Sparkles className="size-3 text-foreground/70" />
          <input
            autoFocus
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && preview) { onCreate(preview); onClose(); }
              if (e.key === "Escape") onClose();
            }}
            placeholder="Describe what to scaffold... e.g. new component ThreatCard"
            className="flex-1 bg-transparent text-[12px] font-light outline-none placeholder:text-muted-foreground/40"
          />
        </div>

        {preview ? (
          <div className="p-3 space-y-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70">Will create {preview.files.length} file{preview.files.length === 1 ? "" : "s"}</div>
            <ul className="space-y-1">
              {preview.files.map(f => (
                <li key={f.path} className="flex items-center gap-2 text-[11px] font-mono">
                  <FileCode className="size-3 opacity-50" /> {f.path}
                </li>
              ))}
            </ul>
            <button
              onClick={() => { onCreate(preview); onClose(); }}
              className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-foreground/40 bg-foreground/10 text-foreground text-[11px] hover:bg-foreground/20"
            >
              <Wand2 className="size-3" /> Scaffold {preview.kind} <span className="opacity-60">↵</span>
            </button>
          </div>
        ) : (
          <div className="p-3">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 mb-2">Examples</div>
            <ul className="space-y-1">
              {PRESETS.map(p => (
                <li key={p.label}>
                  <button
                    onClick={() => setPhrase(p.label)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11px] hover:bg-card/60 text-left"
                  >
                    <span className="font-mono text-foreground/90">{p.label}</span>
                    <span className="text-[10px] text-muted-foreground/60">{p.desc}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
