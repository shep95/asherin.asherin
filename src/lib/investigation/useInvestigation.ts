/**
 * React state for the investigation workspace.
 *
 * Holds one snapshot at a time and exposes the loop actions. Every failure is
 * carried as an explicit error/unavailable string rather than an empty view
 * that looks like "nothing found".
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { advanceLoop, reconcile, runHop, type HopResult } from "./coordinator";
import { nextBestHops, type HopProposal } from "./hops";
import { createInvestigation, listInvestigations, loadSnapshot } from "./persistence";
import { titleFromQuestion } from "./intent";
import type { Investigation, InvestigationSnapshot } from "./types";

export interface InvestigationState {
  list: Investigation[];
  snapshot: InvestigationSnapshot | null;
  loading: boolean;
  running: boolean;
  error: string | null;
  lastResult: HopResult | null;
  nextHops: HopProposal[];
}

export function useInvestigation(activeId: string | null) {
  const [state, setState] = useState<InvestigationState>({
    list: [],
    snapshot: null,
    loading: false,
    running: false,
    error: null,
    lastResult: null,
    nextHops: [],
  });
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const patch = useCallback((next: Partial<InvestigationState>) => {
    if (mounted.current) setState((prev) => ({ ...prev, ...next }));
  }, []);

  const refreshList = useCallback(async () => {
    try {
      patch({ list: await listInvestigations() });
    } catch (e) {
      patch({ error: (e as Error).message });
    }
  }, [patch]);

  const load = useCallback(
    async (id: string) => {
      patch({ loading: true, error: null });
      try {
        const snapshot = await loadSnapshot(id);
        patch({
          snapshot,
          loading: false,
          nextHops: snapshot ? nextBestHops(snapshot) : [],
          error: snapshot ? null : "investigation not found",
        });
      } catch (e) {
        patch({ loading: false, error: (e as Error).message });
      }
    },
    [patch],
  );

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (activeId) void load(activeId);
    else patch({ snapshot: null, nextHops: [] });
  }, [activeId, load, patch]);

  const start = useCallback(
    async (question: string, conversationId?: string | null) => {
      patch({ running: true, error: null });
      try {
        const inv = await createInvestigation({ title: titleFromQuestion(question), question, conversationId });
        await refreshList();
        patch({ running: false });
        return inv;
      } catch (e) {
        patch({ running: false, error: (e as Error).message });
        return null;
      }
    },
    [patch, refreshList],
  );

  const advance = useCallback(async () => {
    if (!activeId) return;
    patch({ running: true, error: null });
    const out = await advanceLoop(activeId);
    patch({
      running: false,
      snapshot: out.snapshot,
      lastResult: out.result,
      nextHops: out.snapshot ? nextBestHops(out.snapshot) : [],
      error: out.result?.error ?? null,
    });
  }, [activeId, patch]);

  const runSpecific = useCallback(
    async (proposal: HopProposal) => {
      if (!activeId) return;
      patch({ running: true, error: null });
      const result = await runHop({
        investigationId: activeId,
        query: proposal.query,
        phase: proposal.phase,
        objective: proposal.objective,
        targetEntityId: proposal.targetEntityId,
      });
      const reconciled = await reconcile(activeId);
      patch({
        running: false,
        lastResult: result,
        snapshot: reconciled?.snapshot ?? null,
        nextHops: reconciled?.snapshot ? nextBestHops(reconciled.snapshot) : [],
        error: result.error ?? null,
      });
    },
    [activeId, patch],
  );

  return { ...state, refreshList, load, start, advance, runSpecific };
}
