import { useCallback, useRef, useState } from "react";
import { runIntelAnalysis, type IntelAnalysisType } from "@/lib/local/search/intel";
import type { SearchResult } from "../types";

export type { IntelAnalysisType };

/**
 * A read already produced for this exact corpus is kept for the tab's life.
 * Each suite tab unmounts when another is chosen; without this, going back to
 * a tab asked the model the same question again and spent the operator's key.
 */
const cache = new Map<string, unknown>();
const MAX_CACHED = 40;

export function corpusKey(type: IntelAnalysisType, query: string, results: SearchResult[]): string {
  return `${type}\u0000${query.trim().toLowerCase()}\u0000${results
    .slice(0, 20)
    .map((r) => r.url)
    .join("\u0001")}`;
}

/** One structured read over the corpus, produced by shepherd on the device model. */
export function useIntelAnalysis<T = unknown>(type: IntelAnalysisType) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (query: string, results: SearchResult[], opts?: { force?: boolean }) => {
      const key = corpusKey(type, query, results);
      if (!opts?.force && cache.has(key)) {
        setError(null);
        setLoading(false);
        setData(cache.get(key) as T);
        return;
      }
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setLoading(true);
      setError(null);
      try {
        const analysis = await runIntelAnalysis<T>(type, query, results, ctl.signal);
        if (ctl.signal.aborted) return;
        cache.set(key, analysis);
        if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string);
        setData(analysis);
      } catch (e) {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "analysis failed");
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    },
    [type],
  );

  return {
    data,
    loading,
    error,
    run,
    reset: () => {
      abortRef.current?.abort();
      setData(null);
      setError(null);
    },
  };
}
