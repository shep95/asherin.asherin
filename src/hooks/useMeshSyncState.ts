// ═══════════════════════════════════════════════════════════════════════════
// useMeshSyncState — a read of the server-side sweep ledger.
//
// The foreground hook can only speak for the time a tab was open. This one
// answers the other question the operator actually cares about: did anything
// happen while the app was closed? It reads google_sync_state, which the
// scheduled sweeper writes on every tick, and reports the last outcome, the
// next due time, and whether background sync is armed at all.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MeshSyncState {
  enabled: boolean;
  intervalMinutes: number;
  lastSyncedAt: string | null;
  nextDueAt: string | null;
  lastStatus: string;
  lastError: string | null;
  signalsIngested: number;
  insightsDerived: number;
}

const POLL_MS = 60_000;

export function useMeshSyncState(userId: string | undefined) {
  const [state, setState] = useState<MeshSyncState | null>(null);
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("google_sync_state" as never)
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!alive.current) return;
      const row = data as Record<string, unknown> | null;
      setState(
        row
          ? {
              enabled: Boolean(row.enabled),
              intervalMinutes: Number(row.interval_minutes ?? 30),
              lastSyncedAt: (row.last_synced_at as string) ?? null,
              nextDueAt: (row.next_due_at as string) ?? null,
              lastStatus: String(row.last_status ?? "idle"),
              lastError: (row.last_error as string) ?? null,
              signalsIngested: Number(row.signals_ingested ?? 0),
              insightsDerived: Number(row.insights_derived ?? 0),
            }
          : null,
      );
    } catch (e) {
      // A missing ledger row is the normal pre-enrollment state, not an error
      // worth surfacing — the scheduler creates it on its next tick.
      console.debug("[mesh-sync-state]", e);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    alive.current = true;
    if (!userId) return;

    // Chained timeout rather than setInterval: a slow read cannot queue a
    // backlog of overlapping polls.
    const tick = async () => {
      await load();
      if (!alive.current) return;
      if (document.visibilityState === "visible") {
        timer.current = setTimeout(tick, POLL_MS);
      }
    };
    void tick();

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void tick();
      } else if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, load]);

  /** Flip background sweeping on or off for this operator. */
  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (!userId) return;
      await supabase
        .from("google_sync_state" as never)
        .update({ enabled } as never)
        .eq("user_id", userId);
      await load();
    },
    [userId, load],
  );

  return { state, loading, refresh: load, setEnabled };
}
