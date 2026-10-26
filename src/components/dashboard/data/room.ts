// asherin.data — what every tab is handed: the open workspace, its sources and
// versions, the selected source, and one way to refresh after a write.

import type { Workspace } from "@/lib/data/store";
import type { DataSourceRow, DataVersionRow, DatasetProfile, QualityReport } from "@/lib/data/types";

export interface Room {
  workspace: Workspace;
  sources: DataSourceRow[];
  versions: Record<string, DataVersionRow[]>;
  selectedSource: string;
  setSelectedSource: (id: string) => void;
  /** re-reads sources and versions from this device */
  refresh: () => Promise<void>;
  /** the workspace row changed (directions, theme) */
  patchWorkspace: (patch: Partial<Workspace>) => void;
}

export function latestOf(room: Pick<Room, "versions">, sourceId: string): DataVersionRow | undefined {
  return (room.versions[sourceId] ?? [])[0];
}

export function profileOf(v: DataVersionRow | undefined): DatasetProfile | null {
  const p = v?.profile as DatasetProfile | undefined;
  return p && Array.isArray(p.columns) ? p : null;
}

export function qualityOf(v: DataVersionRow | undefined): QualityReport | null {
  const q = v?.quality as QualityReport | undefined;
  return q && typeof q.score === "number" ? q : null;
}
