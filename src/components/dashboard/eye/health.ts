/**
 * asherin.eye — per-layer feed health.
 *
 * The globe polls. Polling fails. The old behaviour was `.catch(() => {})`,
 * which leaves last hour's aircraft sitting on the screen looking exactly as
 * confident as live ones. This registry keeps the last outcome per layer so a
 * failed or ageing feed can be drawn differently from a fresh one, without
 * spamming the note line on every retry.
 */

import { capabilityFor } from "./capability";

export type FeedStatus = "idle" | "loading" | "ok" | "error" | "stale";

export interface FeedHealth {
  id: string;
  status: FeedStatus;
  /** rows delivered by the last good read */
  rows: number | null;
  /** epoch ms of the last good read */
  lastOkAt: number | null;
  /** epoch ms of the last failure */
  lastErrorAt: number | null;
  lastError: string | null;
  provider: string | null;
  /** consecutive failures since the last good read */
  fails: number;
}

export interface FeedSnapshot extends FeedHealth {
  ageMs: number | null;
  freshness: "never" | "fresh" | "stale" | "error";
}

const DEFAULT_STALE_MS = 90_000;

function blank(id: string): FeedHealth {
  return {
    id,
    status: "idle",
    rows: null,
    lastOkAt: null,
    lastErrorAt: null,
    lastError: null,
    provider: capabilityFor(id)?.provider ?? null,
    fails: 0,
  };
}

export function staleAfter(id: string): number {
  return capabilityFor(id)?.staleAfterMs ?? DEFAULT_STALE_MS;
}

export interface HealthRegistry {
  get(id: string): FeedHealth;
  begin(id: string): void;
  ok(id: string, info?: { rows?: number | null; provider?: string | null; at?: number }): void;
  fail(id: string, message: unknown, at?: number): void;
  reset(id: string): void;
  snapshot(id: string, now?: number): FeedSnapshot;
  all(now?: number): FeedSnapshot[];
}

export function createHealthRegistry(): HealthRegistry {
  const table: Record<string, FeedHealth> = {};
  const get = (id: string) => (table[id] ||= blank(id));

  return {
    get,
    begin(id) {
      const h = get(id);
      // a retry never erases the fact that the last one failed; it only says
      // a fresh attempt is in flight.
      h.status = h.status === "error" ? "error" : "loading";
    },
    ok(id, info = {}) {
      const h = get(id);
      h.status = "ok";
      h.rows = info.rows ?? h.rows;
      h.provider = info.provider ?? h.provider;
      h.lastOkAt = info.at ?? Date.now();
      h.lastError = null;
      h.fails = 0;
    },
    fail(id, message, at) {
      const h = get(id);
      h.status = "error";
      h.lastError = String((message as Error)?.message || message || "failed").toLowerCase();
      h.lastErrorAt = at ?? Date.now();
      h.fails += 1;
    },
    reset(id) {
      table[id] = blank(id);
    },
    snapshot(id, now = Date.now()) {
      const h = get(id);
      const ageMs = h.lastOkAt == null ? null : Math.max(0, now - h.lastOkAt);
      let freshness: FeedSnapshot["freshness"];
      if (h.status === "error") freshness = "error";
      else if (h.lastOkAt == null) freshness = "never";
      else if ((ageMs as number) > staleAfter(id)) freshness = "stale";
      else freshness = "fresh";
      const status: FeedStatus =
        h.status === "ok" && freshness === "stale" ? "stale" : h.status;
      return { ...h, status, ageMs, freshness };
    },
    all(now = Date.now()) {
      return Object.keys(table).map((id) => this.snapshot(id, now));
    },
  };
}

export function ageWord(ageMs: number | null): string {
  if (ageMs == null) return "never";
  const s = Math.round(ageMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** Compact one-line status for a chip or tooltip. */
export function healthLabel(snap: FeedSnapshot): string {
  if (snap.freshness === "error") return `error · ${snap.lastError || "failed"}`;
  if (snap.freshness === "never") return snap.status === "loading" ? "loading" : "not loaded";
  const rows = snap.rows == null ? "" : `${snap.rows} rows · `;
  return `${rows}${ageWord(snap.ageMs)}${snap.freshness === "stale" ? " · stale" : ""}`;
}
