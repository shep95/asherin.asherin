import React, { useEffect, useMemo, useState, type FormEvent } from "react";
import { Calculator, Trash2, Copy, Download, Info, Globe } from "lucide-react";
import { computeAll, CIPHER_LABEL, normalize, type CipherKey } from "@/lib/gematria";
import { findBundledMatches, CORPUS_SIZE } from "@/lib/gematriaCorpus";
import { useGematria, type GematriaEntry } from "@/hooks/useGematria";
import { useGematriaWorldMatches } from "@/hooks/useGematriaWorldMatches";
import ResonancePanel from "./ResonancePanel";

const CIPHERS: CipherKey[] = ["ordinal", "reduction", "reverse", "chaldean"];
const COLUMN_FOR: Record<CipherKey, keyof GematriaEntry> = {
  ordinal: "ordinal",
  reduction: "reduction",
  reverse: "reverse_ordinal",
  chaldean: "chaldean",
};

export default function GematriaTab() {
  const { entries, loading, error, save, remove, matchesFor } = useGematria();
  const [submitted, setSubmitted] = useState("");
  const world = useGematriaWorldMatches(submitted);
  const [text, setText] = useState("");
  const [activeCiphers, setActiveCiphers] = useState<Record<CipherKey, boolean>>({
    ordinal: true, reduction: true, reverse: true, chaldean: true,
  });
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<CipherKey, boolean>>({
    ordinal: false, reduction: false, reverse: false, chaldean: false,
  });
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const results = useMemo(() => (submitted ? computeAll(submitted) : null), [submitted]);
  const submittedNormalized = submitted ? normalize(submitted) : "";

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!normalize(trimmed)) {
      setLocalError("Enter at least one letter (A–Z).");
      return;
    }
    setLocalError(null);
    setSubmitted(trimmed);
    setBusy(true);
    await save(trimmed);
    setBusy(false);
    // Kick off same-cipher world lookups for every active cipher.
    const all = computeAll(trimmed);
    CIPHERS.forEach((c) => { if (activeCiphers[c]) world.fetchFor(c, all[c].sum); });
  };

  const copy = (v: number) => {
    try { navigator.clipboard.writeText(String(v)); } catch { /* noop */ }
  };

  const filteredCorpus = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    const asNum = Number(q);
    return entries.filter((e) => {
      if (e.phrase.toLowerCase().includes(q) || e.normalized.includes(q)) return true;
      if (!Number.isNaN(asNum)) {
        return e.ordinal === asNum || e.reduction === asNum ||
               e.reverse_ordinal === asNum || e.chaldean === asNum;
      }
      return false;
    });
  }, [entries, search]);

  const exportCsv = () => {
    const header = "phrase,normalized,ordinal,reduction,reverse_ordinal,chaldean,created_at";
    const rows = entries.map((e) => [
      JSON.stringify(e.phrase), e.normalized, e.ordinal, e.reduction,
      e.reverse_ordinal, e.chaldean, e.created_at,
    ].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "gematria-corpus.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full w-full overflow-y-auto text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60">
            <Calculator className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>◈ Gematria Engine</span>
          </div>
          <h1 className="text-2xl font-light tracking-tight">Gematria</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Map any word or phrase to its numerical value across four ciphers, then compare against
            your saved corpus for value matches.
          </p>
          <div className="flex items-start gap-2 rounded-md border border-border/30 bg-foreground/[0.02] px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={1.5} />
            <span>
              This is a linguistic pattern tool. Numerical coincidences in language have no
              medical, biological, or predictive meaning.
            </span>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border/30 bg-foreground/[0.02] p-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            }}
            placeholder="Enter a word or phrase…"
            rows={2}
            className="w-full rounded-md border border-border/30 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40 resize-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            {CIPHERS.map((c) => (
              <label key={c} className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeCiphers[c]}
                  onChange={(e) => setActiveCiphers((s) => ({ ...s, [c]: e.target.checked }))}
                  className="accent-foreground"
                />
                {CIPHER_LABEL[c]}
              </label>
            ))}
            <div className="flex-1" />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="rounded-md border border-border/40 bg-foreground text-background px-4 py-2 text-xs tracking-wide uppercase disabled:opacity-40 hover:bg-foreground/90 transition-colors"
            >
              {busy ? "Calculating…" : "Calculate"}
            </button>
          </div>
          {localError && <p className="text-xs text-red-500">{localError}</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </form>

        {results && (
          <section className="space-y-3">
            <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
              Results · "{submitted}"
            </h2>
            <div className="rounded-lg border border-border/30 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-foreground/[0.03] text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-normal">Cipher</th>
                    <th className="text-right px-4 py-2 font-normal">Sum</th>
                    <th className="text-right px-4 py-2 font-normal" title="One-pass digit sum (not fully reduced)">Step</th>
                    <th className="text-right px-4 py-2 font-normal" title="Recursively reduced to single digit / master number">Reduced</th>
                    <th className="text-right px-4 py-2 font-normal">Matches</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {CIPHERS.filter((c) => activeCiphers[c]).map((c) => {
                    const r = results[c];
                    const personal = matchesFor(c, r.sum, submittedNormalized);
                    const bundled = findBundledMatches(c, r.sum, submittedNormalized, 60);
                    const worldPayload = world.byCipher[c];
                    const worldHits = worldPayload?.matches ?? [];
                    const worldLoading = !!world.loading[c];
                    const totalMatches = personal.length + bundled.length + worldHits.length;
                    return (
                      <React.Fragment key={c}>
                        <tr className="border-t border-border/20">
                          <td className="px-4 py-2">{CIPHER_LABEL[c]}</td>
                          <td className="px-4 py-2 text-right font-mono">{r.sum}</td>
                          <td
                            className="px-4 py-2 text-right font-mono text-muted-foreground"
                            title={r.sum > 9 ? `${String(r.sum).split("").join(" + ")} = ${r.step}` : "Already single digit"}
                          >
                            {r.step}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-muted-foreground">{r.reduced}</td>
                          <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                            {totalMatches}{worldLoading ? "…" : ""}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => copy(r.sum)}
                              className="p-1 text-muted-foreground hover:text-foreground"
                              title="Copy sum"
                            >
                              <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setExpanded((s) => ({ ...s, [c]: !s[c] }));
                                if (!worldPayload && !worldLoading) world.fetchFor(c, r.sum);
                              }}
                              className="ml-1 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                            >
                              {expanded[c] ? "Hide" : "Detail"}
                            </button>
                          </td>
                        </tr>
                        {expanded[c] && (
                          <tr className="bg-foreground/[0.015]">
                            <td colSpan={6} className="px-4 py-3 space-y-3">
                              <div className="flex flex-wrap gap-1.5">
                                {r.letters.map((l, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex flex-col items-center rounded border border-border/30 px-2 py-1 text-[10px] font-mono"
                                  >
                                    <span className="uppercase">{l.letter}</span>
                                    <span className="text-muted-foreground">{l.value}</span>
                                  </span>
                                ))}
                              </div>

                              {bundled.length > 0 && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                                    Bundled corpus ({bundled.length}) · {CORPUS_SIZE} phrases indexed
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {bundled.slice(0, 60).map((m, i) => (
                                      <span
                                        key={`b-${i}`}
                                        className="rounded border border-border/30 bg-background px-2 py-0.5 text-xs"
                                        title={m.category}
                                      >
                                        {m.phrase}
                                        <span className="ml-1 text-[9px] text-muted-foreground/60">{m.category}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div>
                                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1 flex items-center gap-1">
                                  <Globe className="h-3 w-3" strokeWidth={1.5} />
                                  World matches (Wikipedia + Datamuse) {worldLoading ? "· searching…" : `(${worldHits.length})`}
                                </p>
                                {worldHits.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {worldHits.slice(0, 80).map((m, i) => (
                                      <span
                                        key={`w-${i}`}
                                        className="rounded border border-border/30 bg-background px-2 py-0.5 text-xs"
                                        title={m.source}
                                      >
                                        {m.phrase}
                                        <span className="ml-1 text-[9px] text-muted-foreground/60">{m.source}</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : !worldLoading && worldPayload ? (
                                  <p className="text-[10px] text-muted-foreground/70">No same-cipher matches found in scanned candidates ({worldPayload.counts.candidates}).</p>
                                ) : null}
                              </div>

                              {personal.length > 0 && (
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
                                    Your saved corpus ({personal.length})
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {personal.slice(0, 40).map((m) => (
                                      <span
                                        key={m.id}
                                        className="rounded border border-border/30 bg-background px-2 py-0.5 text-xs"
                                        title={`saved ${new Date(m.created_at).toLocaleString()}`}
                                      >
                                        {m.phrase}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {submitted && <ResonancePanel phrase={submitted} />}

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground flex-1">
              Your Corpus ({entries.length})
            </h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phrase or value…"
              className="rounded-md border border-border/30 bg-background px-3 py-1.5 text-xs w-56 outline-none focus:border-foreground/40"
            />
            <button
              type="button"
              onClick={exportCsv}
              disabled={!entries.length}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/30 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              <Download className="h-3 w-3" strokeWidth={1.5} /> CSV
            </button>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Loading corpus…</p>
          ) : filteredCorpus.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border/30 rounded-md">
              {entries.length === 0
                ? "No saved phrases yet — calculate one above to start your corpus."
                : "No corpus entries match that search."}
            </p>
          ) : (
            <div className="rounded-lg border border-border/30 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-foreground/[0.03] text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-normal">Phrase</th>
                    <th className="text-right px-3 py-2 font-normal">Ord</th>
                    <th className="text-right px-3 py-2 font-normal">Red</th>
                    <th className="text-right px-3 py-2 font-normal">Rev</th>
                    <th className="text-right px-3 py-2 font-normal">Chal</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Build per-cipher value → count index across the entire saved corpus.
                    // Any value appearing on 2+ rows is a "shared value" and both rows
                    // should be gilded. Also fold in the currently-submitted phrase's
                    // values so a fresh calculation immediately gilds its twins.
                    const valueCount: Record<CipherKey, Map<number, number>> = {
                      ordinal: new Map(), reduction: new Map(),
                      reverse: new Map(), chaldean: new Map(),
                    };
                    const bump = (c: CipherKey, v: number) =>
                      valueCount[c].set(v, (valueCount[c].get(v) ?? 0) + 1);
                    for (const row of entries) {
                      bump("ordinal", row.ordinal);
                      bump("reduction", row.reduction);
                      bump("reverse", row.reverse_ordinal);
                      bump("chaldean", row.chaldean);
                    }
                    if (results) {
                      // Submitted phrase already appears in entries (auto-save),
                      // so don't double-count it.
                    }
                    return filteredCorpus.map((e) => {
                      const hits = CIPHERS.filter((c) => {
                        if (!activeCiphers[c]) return false;
                        const col = COLUMN_FOR[c];
                        const v = e[col] as number;
                        // Match if another corpus row shares this value…
                        if ((valueCount[c].get(v) ?? 0) > 1) return true;
                        // …or if it matches the currently-submitted phrase.
                        if (results && e.normalized !== submittedNormalized && results[c].sum === v) return true;
                        return false;
                      });
                      const isMatch = hits.length > 0;
                      const gold = (c: CipherKey) => hits.includes(c) ? "text-amber-300 font-medium" : "text-muted-foreground";
                      return (
                      <tr
                        key={e.id}
                        className={
                          isMatch
                            ? "border-t border-amber-400/40 bg-amber-400/[0.08] hover:bg-amber-400/[0.12]"
                            : "border-t border-border/20 hover:bg-foreground/[0.02]"
                        }
                        title={isMatch ? `Same-cipher match: ${hits.map((c) => CIPHER_LABEL[c]).join(", ")}` : undefined}
                      >
                        <td className="px-3 py-2 truncate max-w-[280px]" title={e.phrase}>
                          {isMatch && <span className="mr-1 text-amber-300">◈</span>}
                          <span className={isMatch ? "text-amber-100" : ""}>{e.phrase}</span>
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${gold("ordinal")}`}>{e.ordinal}</td>
                        <td className={`px-3 py-2 text-right font-mono ${gold("reduction")}`}>{e.reduction}</td>
                        <td className={`px-3 py-2 text-right font-mono ${gold("reverse")}`}>{e.reverse_ordinal}</td>
                        <td className={`px-3 py-2 text-right font-mono ${gold("chaldean")}`}>{e.chaldean}</td>

                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => remove(e.id)}
                            className="p-1 text-muted-foreground hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </button>
                        </td>
                      </tr>
                      );
                    });
                  })()}

                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
