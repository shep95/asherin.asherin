// Compact inline gematria card rendered inside chat assistant bubbles.
// Runs computeAll() locally, auto-persists via useGematria, and shows
// cross-corpus matches from three sources: bundled seed corpus, operator's
// personal corpus, and live world matches (Wikipedia + Datamuse). Save
// failures surface a retry affordance so the chat never blocks on the DB.

import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Check, AlertTriangle, ChevronDown, ChevronUp, Globe, BookMarked, User } from "lucide-react";
import { computeAll, CIPHER_LABEL, normalize, type CipherKey } from "@/lib/gematria";
import { findBundledMatches } from "@/lib/gematriaCorpus";
import { useGematria } from "@/hooks/useGematria";
import { useGematriaWorldMatches } from "@/hooks/useGematriaWorldMatches";

const CIPHERS: CipherKey[] = ["ordinal", "reduction", "reverse", "chaldean"];

interface Props {
  phrase: string;
  source?: "chat:aureon" | "chat:asher";
}

const MAX = 200;

export default function GematriaResultCard({ phrase, source }: Props) {
  const clean = (phrase || "").slice(0, MAX);
  const normalized = useMemo(() => normalize(clean), [clean]);
  const results = useMemo(() => (normalized ? computeAll(clean) : null), [clean, normalized]);
  const { save, matchesFor } = useGematria();
  const world = useGematriaWorldMatches(clean);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [expanded, setExpanded] = useState(true);
  const savedRef = useRef<string>("");

  useEffect(() => {
    if (!normalized || savedRef.current === normalized) return;
    savedRef.current = normalized;
    setSaveState("saving");
    save(clean).then((row) => {
      setSaveState(row ? "ok" : "error");
    }).catch(() => setSaveState("error"));
  }, [normalized, clean, save]);

  // Kick off same-cipher world lookups for every cipher once results exist.
  useEffect(() => {
    if (!results) return;
    for (const c of CIPHERS) {
      const v = results[c].sum;
      if (v > 0) world.fetchFor(c, v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized]);

  if (!normalized || !results) return null;

  const retry = () => {
    setSaveState("saving");
    save(clean).then((row) => setSaveState(row ? "ok" : "error"));
  };

  return (
    <div className="my-2 rounded-lg border border-border/30 bg-foreground/[0.02] overflow-hidden text-foreground">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
        <Calculator className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Gematria</span>
        <span className="text-sm font-light truncate flex-1" title={clean}>"{clean}"</span>
        {saveState === "ok" && (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500/80">
            <Check className="h-3 w-3" strokeWidth={2} /> Saved
          </span>
        )}
        {saveState === "saving" && (
          <span className="text-[10px] text-muted-foreground">Saving…</span>
        )}
        {saveState === "error" && (
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center gap-1 text-[10px] text-amber-500/90 hover:text-amber-400"
          >
            <AlertTriangle className="h-3 w-3" strokeWidth={2} /> Retry save
          </button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground bg-foreground/[0.02]">
          <tr>
            <th className="text-left px-3 py-1.5 font-normal">Cipher</th>
            <th className="text-right px-3 py-1.5 font-normal">Sum</th>
            <th className="text-right px-3 py-1.5 font-normal">Reduced</th>
            <th className="text-right px-3 py-1.5 font-normal">Matches</th>
          </tr>
        </thead>
        <tbody>
          {CIPHERS.map((c) => {
            const r = results[c];
            const personal = matchesFor(c, r.sum, normalized);
            const bundled = findBundledMatches(c, r.sum, normalized, 20);
            const worldMatches = world.byCipher[c]?.matches ?? [];
            const total = bundled.length + personal.length + worldMatches.length;
            const isLoading = world.loading[c];
            return (
              <tr key={c} className="border-t border-border/15">
                <td className="px-3 py-1.5 text-xs">{CIPHER_LABEL[c]}</td>
                <td className="px-3 py-1.5 text-right font-mono text-sm">{r.sum}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">{r.reduced}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground">
                  {isLoading && total === 0 ? (
                    <span className="text-muted-foreground/60">…</span>
                  ) : total > 0 ? (
                    <span className="text-amber-400/90">{total}</span>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground border-t border-border/15"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Hide matches & breakdown" : "Show matches & breakdown"}
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-border/15 space-y-3">
          {CIPHERS.map((c) => {
            const r = results[c];
            const bundled = findBundledMatches(c, r.sum, normalized, 40);
            const personal = matchesFor(c, r.sum, normalized);
            const worldMatches = world.byCipher[c]?.matches ?? [];
            const isLoading = world.loading[c];
            const hasAny = bundled.length + personal.length + worldMatches.length > 0;
            return (
              <div key={c} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {CIPHER_LABEL[c]} · <span className="font-mono text-foreground">{r.sum}</span>
                  </div>
                  {isLoading && <span className="text-[9px] text-muted-foreground/60">world lookup…</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.letters.map((l, i) => (
                    <span
                      key={i}
                      className="inline-flex flex-col items-center rounded border border-border/30 px-1.5 py-0.5 text-[10px] font-mono"
                    >
                      <span className="uppercase">{l.letter}</span>
                      <span className="text-muted-foreground">{l.value}</span>
                    </span>
                  ))}
                </div>
                {bundled.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-1">
                      <BookMarked className="h-2.5 w-2.5" strokeWidth={1.5} /> Bundled ({bundled.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {bundled.slice(0, 20).map((b, i) => (
                        <span
                          key={i}
                          className="rounded border border-amber-400/30 bg-amber-400/[0.06] px-1.5 py-0.5 text-[10px] text-amber-300/90"
                          title={b.category}
                        >
                          {b.phrase}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {worldMatches.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-1">
                      <Globe className="h-2.5 w-2.5" strokeWidth={1.5} /> World ({worldMatches.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {worldMatches.slice(0, 30).map((w, i) => (
                        <span
                          key={i}
                          className="rounded border border-sky-400/25 bg-sky-400/[0.05] px-1.5 py-0.5 text-[10px] text-sky-200/90"
                          title={w.source}
                        >
                          {w.phrase}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {personal.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-1">
                      <User className="h-2.5 w-2.5" strokeWidth={1.5} /> Your Corpus ({personal.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {personal.slice(0, 20).map((p, i) => (
                        <span
                          key={i}
                          className="rounded border border-emerald-400/25 bg-emerald-400/[0.05] px-1.5 py-0.5 text-[10px] text-emerald-200/90"
                        >
                          {p.phrase}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {!hasAny && !isLoading && (
                  <div className="text-[10px] text-muted-foreground/60 italic">
                    No same-cipher matches found in bundled, world, or personal corpus.
                  </div>
                )}
              </div>
            );
          })}
          {source && (
            <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60 pt-1">
              Origin: {source}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
