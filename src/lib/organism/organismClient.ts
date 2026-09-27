import { supabase } from "@/integrations/supabase/client";

/**
 * Client seam into the organism. Every call is authenticated as the operator;
 * the account is never sent in the body, so this file cannot address another
 * account's bloodstream even if it wanted to.
 */

export type OrganName =
  | "postmark" | "voiceprint" | "mesh" | "ghost" | "sentinel" | "shield"
  | "op" | "lattice" | "augur" | "guardian" | "zophiel" | "chat";

export type EntityKind =
  | "person" | "email" | "phone" | "domain" | "network" | "device"
  | "radio" | "credential" | "place" | "org";

export type SelfStatus = "self" | "trusted" | "unknown" | "suspect" | "hostile";

export interface OrganismEntity {
  id: string;
  kind: EntityKind;
  entity_key: string;
  label: string | null;
  confidence: number;
  corroboration: number;
  organs: string[];
  self_status: SelfStatus;
  first_seen: string;
  last_seen: string;
}

export interface OrganismEvent {
  id: string;
  organ: string;
  kind: string;
  entity_id: string | null;
  verdict: string;
  confidence: number;
  reflex: boolean;
  summary: string | null;
  observed_at: string;
}

export interface OrganismFinding {
  id: string;
  story_key: string;
  title: string;
  narrative: string;
  severity: "low" | "medium" | "high" | "critical";
  tier: "log" | "advise" | "act";
  confidence: number;
  corroboration: number;
  organs: string[];
  falsifier: string;
  status: string;
  reflex_origin: boolean;
  first_seen: string;
  last_seen: string;
}

export interface OrganismVitals {
  posture: number;
  organsReporting: number;
  organs: string[];
  circulation: number;
  memory: number;
  hostileRatio: number;
  selfKnown: number;
  strangers: number;
  calibrationNote?: string;
  resolvedFalsifiers?: number;
}

export interface OrganismState {
  last_metabolism_at: string | null;
  calibration: number;
  vitals: OrganismVitals | null;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("organism", { body });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export const organismState = (windowHours = 72) =>
  call<{
    ok: true;
    state: OrganismState | null;
    findings: OrganismFinding[];
    events: OrganismEvent[];
    entities: OrganismEntity[];
  }>({ action: "state", windowHours });

export const organismPulse = (windowHours = 72) =>
  call<{ ok: true; vitals: OrganismVitals; stories: unknown[]; immuneChanges: number; decayed: number; calibration: number; calibrationNote: string; resolvedFalsifiers: number; tookMs: number }>({
    action: "pulse",
    windowHours,
  });

export const organismDesignate = (entityId: string, selfStatus: SelfStatus) =>
  call<{ ok: true }>({ action: "designate", entityId, selfStatus });

export const organismAcknowledge = (findingId: string) =>
  call<{ ok: true }>({ action: "acknowledge", findingId });

/** Any surface in the app can breathe a sensation into the shared substance. */
export const organismPublish = (
  sensations: Array<{
    organ: OrganName;
    kind: string;
    entity?: { kind: EntityKind; key: string; label?: string | null; attrs?: Record<string, unknown> } | null;
    verdict?: "clean" | "benign" | "anomalous" | "hostile" | "unknown";
    confidence?: number;
    reflex?: boolean;
    summary?: string;
    evidence?: Record<string, unknown>;
    observedAt?: string;
    dedupeKey?: string;
    ttlDays?: number;
  }>,
) => call<{ ok: true; ingested: number; deduped: number; entities: number }>({ action: "publish", sensations });
