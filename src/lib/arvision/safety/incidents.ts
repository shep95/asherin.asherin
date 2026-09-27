// asherin.arvision — incident ledger with human review.
//
// Three commitments live here:
//   • one thing that happened is one incident. a rule that keeps firing for the
//     same door in the same minute must not become forty alerts, because forty
//     alerts is how a real one gets missed.
//   • nothing is concluded. every incident opens in "needs review" and only a
//     person moves it. the system never decides an incident was real, and never
//     acts on one.
//   • being wrong is recorded. marking a false positive feeds the detector's own
//     health record, so a noisy rule becomes visible instead of tolerated.

import type { RuleFiring, SeverityResult } from "./rules";

export type ReviewState = "needs_review" | "confirmed" | "false_positive" | "dismissed";

export interface IncidentNote {
  atMs: number;
  author: string;
  text: string;
}

export interface Incident {
  id: string;
  ruleId: string;
  label: string;
  zoneId: string | null;
  openedAtMs: number;
  lastFiringMs: number;
  /** every repeat firing collapsed into this incident. */
  firings: RuleFiring[];
  severity: SeverityResult;
  review: ReviewState;
  reviewedBy: string | null;
  reviewedAtMs: number | null;
  notes: IncidentNote[];
  /** id of the stored evidence bundle, when capture succeeded. */
  evidenceId: string | null;
  evidenceState: "none" | "requested" | "stored" | "unavailable";
  evidenceDetail: string;
  detectorId: string;
  provenance: string;
}

export interface IncidentStoreOptions {
  /** incidents older than this are dropped from memory. */
  retentionMs: number;
  maxIncidents: number;
}

export const DEFAULT_INCIDENT_OPTIONS: IncidentStoreOptions = {
  retentionMs: 24 * 60 * 60 * 1000,
  maxIncidents: 500,
};

function incidentKey(f: RuleFiring): string {
  return `${f.ruleId}::${f.zoneId ?? "site"}::${f.provenance}`;
}

export class IncidentStore {
  private incidents: Incident[] = [];
  private index = new Map<string, Incident>();
  private seq = 0;

  constructor(private options: IncidentStoreOptions = DEFAULT_INCIDENT_OPTIONS) {}

  /**
   * Record a firing. Returns the incident it belongs to and whether that
   * incident is new — callers use `created` to decide whether to capture
   * evidence, so a dedupe hit never re-triggers a capture.
   */
  record(
    firing: RuleFiring,
    severity: SeverityResult,
    dedupeWindowMs: number,
    meta: { label: string; detectorId: string },
  ): { incident: Incident; created: boolean } {
    const key = incidentKey(firing);
    const open = this.index.get(key);
    if (open && firing.atMs - open.lastFiringMs <= dedupeWindowMs) {
      open.lastFiringMs = firing.atMs;
      open.firings.push(firing);
      open.severity = severity;
      return { incident: open, created: false };
    }

    this.seq += 1;
    const incident: Incident = {
      id: `inc_${firing.atMs.toString(36)}_${this.seq}`,
      ruleId: firing.ruleId,
      label: meta.label,
      zoneId: firing.zoneId,
      openedAtMs: firing.atMs,
      lastFiringMs: firing.atMs,
      firings: [firing],
      severity,
      review: "needs_review",
      reviewedBy: null,
      reviewedAtMs: null,
      notes: [],
      evidenceId: null,
      evidenceState: "none",
      evidenceDetail: "no evidence has been requested for this incident yet",
      detectorId: meta.detectorId,
      provenance: firing.provenance,
    };
    this.incidents.unshift(incident);
    this.index.set(key, incident);
    this.prune(firing.atMs);
    return { incident, created: true };
  }

  review(id: string, state: ReviewState, by: string, atMs: number, note?: string): Incident | null {
    const inc = this.incidents.find((i) => i.id === id);
    if (!inc) return null;
    inc.review = state;
    inc.reviewedBy = by;
    inc.reviewedAtMs = atMs;
    if (note) inc.notes.push({ atMs, author: by, text: note });
    return inc;
  }

  attachEvidence(id: string, evidenceId: string | null, state: Incident["evidenceState"], detail: string): Incident | null {
    const inc = this.incidents.find((i) => i.id === id);
    if (!inc) return null;
    inc.evidenceId = evidenceId;
    inc.evidenceState = state;
    inc.evidenceDetail = detail;
    return inc;
  }

  list(): Incident[] {
    return this.incidents.slice();
  }

  get(id: string): Incident | null {
    return this.incidents.find((i) => i.id === id) ?? null;
  }

  /** Confirmed false positives per detector, for the health panel. */
  falsePositiveCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const i of this.incidents) {
      if (i.review === "false_positive") out[i.detectorId] = (out[i.detectorId] ?? 0) + 1;
    }
    return out;
  }

  prune(nowMs: number) {
    const cutoff = nowMs - this.options.retentionMs;
    this.incidents = this.incidents.filter((i) => i.lastFiringMs >= cutoff).slice(0, this.options.maxIncidents);
    for (const [key, inc] of this.index) {
      if (!this.incidents.includes(inc)) this.index.delete(key);
    }
  }

  clear() {
    this.incidents = [];
    this.index.clear();
  }
}
