// Side-by-side gematria comparison card. Renders a matrix of phrases × ciphers
// and gilds cells where two or more phrases collide on the same value —
// the whole point of comparative gematria in a linguistic-pattern context.
//
// Kept intentionally local: no network calls, no persistence side-effects,
// so it's safe to render inside a streaming assistant message.

import { useMemo } from "react";
import { GitCompare } from "lucide-react";
import { computeAll, CIPHER_LABEL, normalize, type CipherKey } from "@/lib/gematria";

const CIPHERS: CipherKey[] = ["ordinal", "reduction", "reverse", "chaldean"];

interface Props {
  phrases: string[];
  source?: "chat:aureon" | "chat:asher";
}

export default function GematriaCompareCard({ phrases, source }: Props) {
  const rows = useMemo(() => {
    return phrases
      .map((p) => ({ phrase: p, normalized: normalize(p), values: computeAll(p) }))
      .filter((r) => r.normalized.length > 0);
  }, [phrases]);

  // Per-cipher collision index: value → count across rows.
  const collisions = useMemo(() => {
    const map: Record<CipherKey, Map<number, number>> = {
      ordinal: new Map(), reduction: new Map(), reverse: new Map(), chaldean: new Map(),
    };
    for (const c of CIPHERS) {
      for (const r of rows) {
        const v = r.values[c].sum;
        map[c].set(v, (map[c].get(v) ?? 0) + 1);
      }
    }
    return map;
  }, [rows]);

  if (rows.length < 2) return null;

  return (
    <div className="my-2 rounded-lg border border-border/30 bg-foreground/[0.02] overflow-hidden text-foreground">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20">
        <GitCompare className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Gematria · Compare ({rows.length})
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground bg-foreground/[0.02]">
            <tr>
              <th className="text-left px-3 py-1.5 font-normal">Phrase</th>
              {CIPHERS.map((c) => (
                <th key={c} className="text-right px-3 py-1.5 font-normal">{CIPHER_LABEL[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border/15">
                <td className="px-3 py-1.5 text-xs truncate max-w-[16rem]" title={r.phrase}>
                  "{r.phrase}"
                </td>
                {CIPHERS.map((c) => {
                  const v = r.values[c].sum;
                  const gilded = (collisions[c].get(v) ?? 0) > 1;
                  return (
                    <td
                      key={c}
                      className={
                        "px-3 py-1.5 text-right font-mono text-sm " +
                        (gilded ? "text-amber-300 bg-amber-400/[0.06] font-medium" : "text-foreground")
                      }
                      title={gilded ? "Same-cipher match with another phrase" : undefined}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 border-t border-border/15 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70 flex items-center justify-between">
        <span>Gold cells = same-cipher collisions between phrases</span>
        {source && <span>Origin: {source}</span>}
      </div>
    </div>
  );
}
