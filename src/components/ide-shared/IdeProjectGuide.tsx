// Pain Point #25a: AI Project Guide Panel — what to work on next.
import { useEffect, useState } from "react";
import { X, Flame, Sparkles, Zap, Loader2 } from "lucide-react";
import { buildProjectGuide, type GuideTask, type GuideFile } from "@/lib/ide/projectGuide";

interface Props {
  open: boolean;
  files: GuideFile[];
  onClose: () => void;
}

const ICONS = { high: Flame, suggested: Sparkles, quick: Zap } as const;
const LABELS = { high: "High priority", suggested: "Suggested", quick: "Quick wins" } as const;

export default function IdeProjectGuide({ open, files, onClose }: Props) {
  const [tasks, setTasks] = useState<GuideTask[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    const id = setTimeout(() => { setTasks(buildProjectGuide(files)); setBusy(false); }, 50);
    return () => clearTimeout(id);
  }, [open, files]);

  if (!open) return null;
  const grouped = (["high", "suggested", "quick"] as const).map(p => ({ p, items: tasks.filter(t => t.priority === p) }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-[640px] max-w-full max-h-[80vh] rounded-lg border border-border/30 bg-card/95 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/20">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 opacity-70" />
            <h3 className="text-[11px] font-light tracking-wide uppercase">Project Guide</h3>
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-border/30 opacity-60">what to work on</span>
          </div>
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="size-3.5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {busy && <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2"><Loader2 className="size-3 animate-spin" /> Analyzing codebase…</div>}
          {!busy && grouped.map(({ p, items }) => items.length > 0 && (
            <section key={p}>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 mb-2 flex items-center gap-1.5">
                {(() => { const I = ICONS[p]; return <I className="size-3" />; })()}
                {LABELS[p]} <span className="opacity-50">({items.length})</span>
              </div>
              <ul className="space-y-2">
                {items.map(t => (
                  <li key={t.id} className="rounded border border-border/30 bg-card/40 p-2.5">
                    <div className="text-[11.5px] font-medium">{t.title}</div>
                    <p className="text-[10.5px] text-muted-foreground/85 mt-0.5 leading-relaxed">{t.detail}</p>
                    {t.estimateMin != null && <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mt-1">Est: {t.estimateMin} min</div>}
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
