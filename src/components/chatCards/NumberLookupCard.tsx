// "What phrases equal N in cipher X?" card. Answers reverse-lookup questions
// the model can't compute deterministically. Fetches world matches through
// the same edge function used by the value card, but keys on a synthetic
// phrase so the cache stays isolated.

import { useEffect } from "react";
import { Hash, BookMarked, Globe } from "lucide-react";
import { CIPHER_LABEL, type CipherKey } from "@/lib/gematria";
import { findBundledMatches } from "@/lib/gematriaCorpus";
import { useGematriaWorldMatches } from "@/hooks/useGematriaWorldMatches";

interface Props {
  value: number;
  cipher: CipherKey;
  source?: "chat:aureon" | "chat:asher";
}

export default function NumberLookupCard({ value, cipher, source }: Props) {
  // Synthetic phrase key so the cache doesn't collide with a real phrase card.
  const key = `#lookup:${cipher}:${value}`;
  const world = useGematriaWorldMatches(key);

  useEffect(() => {
    world.fetchFor(cipher, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cipher, value]);

  const bundled = findBundledMatches(cipher, value, undefined, 60);
  const worldMatches = world.byCipher[cipher]?.matches ?? [];
  const loading = world.loading[cipher];
  const total = bundled.length + worldMatches.length;

  return (
    <div className="my-2 rounded-lg border border-border/30 bg-foreground/[0.02] overflow-hidden text-foreground">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
        <Hash className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Number Lookup</span>
        <span className="text-sm font-light flex-1">
          {CIPHER_LABEL[cipher]} · <span className="font-mono">{value}</span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          {loading && total === 0 ? "searching…" : `${total} matches`}
        </span>
      </div>
      <div className="px-3 py-2 space-y-2">
        {bundled.length > 0 && (
          <div>
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-1">
              <BookMarked className="h-2.5 w-2.5" strokeWidth={1.5} /> Bundled ({bundled.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {bundled.slice(0, 40).map((b, i) => (
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
              {worldMatches.slice(0, 40).map((w, i) => (
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
        {!loading && total === 0 && (
          <div className="text-[10px] text-muted-foreground/60 italic">
            No phrases found for {CIPHER_LABEL[cipher]} = {value}.
          </div>
        )}
      </div>
      {source && (
        <div className="px-3 py-1 border-t border-border/15 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
          Origin: {source}
        </div>
      )}
    </div>
  );
}
