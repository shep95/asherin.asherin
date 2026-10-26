// asherin.knowledge — lexical retrieval on this device.
//
// There is no embedding model in this build (no transformers.js, no hosted
// embedding function), so passages are ranked with bm25 over stemmed tokens,
// with a small bonus for a passage whose source name matches the question.
// The score is relative: the interface shows each hit as a fraction of the
// best hit, never as a "similarity" the arithmetic cannot back.

import { tokenize } from "./chunk";

export interface IndexedPassage {
  id: string;
  sourceId: string;
  sourceName: string;
  content: string;
  /** position of the passage inside its source. */
  chunkIndex: number;
}

export interface ScoredPassage extends IndexedPassage {
  /** raw bm25 score (plus the name bonus). */
  score: number;
  /** score / best score in this result set, in (0, 1]. */
  relevance: number;
  /** query stems that occur in this passage. */
  matched: string[];
}

const BM25 = { k1: 1.2, b: 0.75, nameBonus: 0.6 } as const;

interface DocStats {
  tf: Map<string, number>;
  len: number;
  nameTokens: Set<string>;
}

export class LexicalIndex {
  private docs = new Map<string, DocStats>();
  private df = new Map<string, number>();
  private totalLen = 0;
  readonly passages: IndexedPassage[];

  constructor(passages: IndexedPassage[]) {
    this.passages = passages;
    for (const p of passages) {
      const toks = tokenize(p.content);
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.totalLen += toks.length;
      this.docs.set(p.id, { tf, len: toks.length, nameTokens: new Set(tokenize(p.sourceName)) });
    }
  }

  get size(): number {
    return this.passages.length;
  }

  private idf(term: string): number {
    const n = this.docs.size;
    const d = this.df.get(term) ?? 0;
    // bm25+ style idf, floored at 0 so a term in every passage adds nothing.
    return Math.max(0, Math.log(1 + (n - d + 0.5) / (d + 0.5)));
  }

  /** top-k passages for a free-text question; empty when nothing matches. */
  search(query: string, k = 8): ScoredPassage[] {
    const terms = Array.from(new Set(tokenize(query)));
    if (!terms.length || !this.docs.size) return [];
    const avgLen = this.totalLen / this.docs.size || 1;
    const out: ScoredPassage[] = [];
    for (const p of this.passages) {
      const d = this.docs.get(p.id)!;
      let score = 0;
      const matched: string[] = [];
      for (const t of terms) {
        const f = d.tf.get(t) ?? 0;
        const inName = d.nameTokens.has(t);
        if (!f && !inName) continue;
        if (f) {
          matched.push(t);
          const idf = this.idf(t);
          score += idf * ((f * (BM25.k1 + 1)) / (f + BM25.k1 * (1 - BM25.b + (BM25.b * d.len) / avgLen)));
        }
        if (inName) score += BM25.nameBonus;
      }
      if (score > 0 && matched.length) out.push({ ...p, score, relevance: 0, matched });
    }
    out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const top = out.slice(0, Math.max(1, k));
    const best = top[0]?.score || 1;
    for (const h of top) h.relevance = Math.min(1, h.score / best);
    return top;
  }
}

/** one-shot convenience for callers without a cached index. */
export function searchPassages(passages: IndexedPassage[], query: string, k = 8): ScoredPassage[] {
  return new LexicalIndex(passages).search(query, k);
}
