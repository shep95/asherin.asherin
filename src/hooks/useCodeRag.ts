// useCodeRag — Phase 4 Aureon IDE
// Thin client wrapper around the `code-rag` edge function.
// - indexFiles: debounced background sync of project files into pgvector
// - search: top-k semantic search of project code for a free-text query
// - hover: AI-augmented hover explanation grounded in RAG context

import { useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RagMatch = {
  id: string;
  file_id: string;
  file_path: string;
  chunk_index: number;
  content: string;
  language: string | null;
  similarity: number;
};

export type RagIndexFile = {
  id: string;
  path: string;
  content: string;
  language?: string;
};

async function invoke(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("code-rag", {
    body: { action, ...payload },
  });
  if (error) throw error;
  return data;
}

export function useCodeRag(projectId: string | null) {
  const indexTimer = useRef<number | null>(null);
  const indexing = useRef(false);

  const indexFiles = useCallback(async (files: RagIndexFile[]) => {
    if (!projectId || !files.length || indexing.current) return { indexed: 0 };
    indexing.current = true;
    try {
      // Only index non-trivial text files; cap content to avoid token overflows
      const payload = files
        .filter(f => f.content && f.content.length >= 20 && f.content.length <= 200_000)
        .map(f => ({ ...f, content: f.content.slice(0, 60_000) }));
      if (!payload.length) return { indexed: 0 };
      return await invoke("index", { project_id: projectId, files: payload });
    } catch (e) {
      console.warn("[code-rag] index failed:", e);
      return { indexed: 0 };
    } finally {
      indexing.current = false;
    }
  }, [projectId]);

  // Debounced variant for save-time auto-indexing
  const indexFilesDebounced = useCallback((files: RagIndexFile[], delayMs = 4000) => {
    if (indexTimer.current) window.clearTimeout(indexTimer.current);
    indexTimer.current = window.setTimeout(() => { void indexFiles(files); }, delayMs);
  }, [indexFiles]);

  const search = useCallback(async (query: string, k = 6): Promise<RagMatch[]> => {
    if (!projectId || !query.trim()) return [];
    try {
      const d = await invoke("search", { project_id: projectId, query, k });
      return (d?.matches ?? []) as RagMatch[];
    } catch (e) {
      console.warn("[code-rag] search failed:", e);
      return [];
    }
  }, [projectId]);

  const hover = useCallback(async (args: {
    symbol: string; file_path: string; language: string; line_text: string; surrounding: string;
  }): Promise<string> => {
    if (!projectId || !args.symbol) return "";
    try {
      const d = await invoke("hover", { project_id: projectId, ...args });
      return String(d?.markdown ?? "");
    } catch (e) {
      console.warn("[code-rag] hover failed:", e);
      return "";
    }
  }, [projectId]);

  const purge = useCallback(async () => {
    if (!projectId) return;
    try { await invoke("purge", { project_id: projectId }); } catch (e) { console.warn(e); }
  }, [projectId]);

  return useMemo(() => ({ indexFiles, indexFilesDebounced, search, hover, purge }), [indexFiles, indexFilesDebounced, search, hover, purge]);
}
