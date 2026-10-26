// asherin.data — one version's rows, read from this device once and kept for
// the few tabs that draw from them. three versions stay warm; older ones are
// dropped so a session that walks through many sources does not pile up rows.

import { useEffect, useState } from "react";
import { loadVersionRows } from "@/lib/data/store";
import type { DataRow } from "@/lib/data/types";

const warm = new Map<string, DataRow[]>();
const WARM_LIMIT = 3;

export async function readVersionRows(versionId: string): Promise<DataRow[]> {
  const hit = warm.get(versionId);
  if (hit) return hit;
  const rows = await loadVersionRows(versionId);
  warm.set(versionId, rows);
  if (warm.size > WARM_LIMIT) {
    const oldest = warm.keys().next().value;
    if (oldest !== undefined) warm.delete(oldest);
  }
  return rows;
}

export function forgetVersionRows(versionId?: string): void {
  if (versionId) warm.delete(versionId); else warm.clear();
}

export function useVersionRows(versionId: string | null | undefined): { rows: DataRow[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ id: string | null; rows: DataRow[]; loading: boolean; error: string | null }>({ id: null, rows: [], loading: false, error: null });
  useEffect(() => {
    if (!versionId) { setState({ id: null, rows: [], loading: false, error: null }); return; }
    let cancelled = false;
    setState((s) => ({ ...s, id: versionId, loading: true, error: null }));
    readVersionRows(versionId)
      .then((rows) => { if (!cancelled) setState({ id: versionId, rows, loading: false, error: null }); })
      .catch((e: unknown) => { if (!cancelled) setState({ id: versionId, rows: [], loading: false, error: e instanceof Error ? e.message : "the rows could not be read" }); });
    return () => { cancelled = true; };
  }, [versionId]);
  return { rows: state.id === versionId ? state.rows : [], loading: state.loading, error: state.error };
}
