// asherin.defender — one finding shape for both measuring surfaces.
//
// A finding is only ever produced by something that actually looked. If neither
// the browser looked, the protection stays `unmeasured`
// and is counted as a gap, never as a pass. That rule is what stops this room
// from drifting back into the tab-guard theatre it used to be.

import { PROTECTIONS, PROTECTION_BY_ID, type Protection, type ProtectionCategory } from "./protections";

export type FindingState = "pass" | "warn" | "fail" | "unmeasured";
export type FindingSource = "browser" | "agent" | "none";

export interface Finding {
  id: string;
  state: FindingState;
  /** measured fact in the operator's words — never a guess */
  observed: string;
  source: FindingSource;
  /** what fixes it, when there is something to do */
  action?: string;
  /** epoch ms of the reading */
  at?: number;
}

export interface PostureRow extends Protection {
  finding: Finding;
}

const SEV_WEIGHT: Record<Protection["sev"], number> = {
  critical: 8,
  high: 5,
  medium: 3,
  low: 1,
};

/** merge readings onto the register; later sources win only if they measured. */
export function buildPosture(...sets: Finding[][]): PostureRow[] {
  const merged = new Map<string, Finding>();
  for (const set of sets) {
    for (const f of set) {
      if (!PROTECTION_BY_ID[f.id]) continue; // unknown id is dropped, never rendered
      const prev = merged.get(f.id);
      if (!prev || prev.state === "unmeasured" || f.state === "fail") merged.set(f.id, f);
    }
  }
  return PROTECTIONS.map((prot) => ({
    ...prot,
    finding:
      merged.get(prot.id) ??
      ({
        id: prot.id,
        state: "unmeasured",
        source: "none",
        observed:
          prot.src === "agent"
            ? "a browser tab cannot read this"
            : "not measured in this session yet",
      } satisfies Finding),
  }));
}

export interface PostureScore {
  /** 0–1000, weighted by severity. unmeasured counts against coverage, not correctness. */
  score: number;
  coverage: number; // 0–100, share of the register that was actually measured
  pass: number;
  warn: number;
  fail: number;
  unmeasured: number;
  total: number;
}

export function scorePosture(rows: PostureRow[]): PostureScore {
  let earned = 0;
  let possible = 0;
  const tally = { pass: 0, warn: 0, fail: 0, unmeasured: 0 };
  for (const r of rows) {
    const w = SEV_WEIGHT[r.sev];
    tally[r.finding.state] += 1;
    if (r.finding.state === "unmeasured") continue;
    possible += w;
    if (r.finding.state === "pass") earned += w;
    else if (r.finding.state === "warn") earned += w * 0.4;
  }
  const measured = rows.length - tally.unmeasured;
  return {
    score: possible ? Math.round((earned / possible) * 1000) : 0,
    coverage: rows.length ? Math.round((measured / rows.length) * 100) : 0,
    ...tally,
    total: rows.length,
  };
}

export function groupPosture(rows: PostureRow[]): Map<ProtectionCategory, PostureRow[]> {
  const out = new Map<ProtectionCategory, PostureRow[]>();
  for (const r of rows) {
    const list = out.get(r.cat) ?? [];
    list.push(r);
    out.set(r.cat, list);
  }
  return out;
}

/** worst-first, so the screen opens on what matters. */
export function triage(rows: PostureRow[]): PostureRow[] {
  const stateRank: Record<FindingState, number> = { fail: 0, warn: 1, unmeasured: 2, pass: 3 };
  const sevRank: Record<Protection["sev"], number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...rows].sort(
    (a, b) =>
      stateRank[a.finding.state] - stateRank[b.finding.state] ||
      sevRank[a.sev] - sevRank[b.sev] ||
      a.id.localeCompare(b.id),
  );
}

/** portable evidence — a finding you cannot hand over helps nobody. */
export function exportEvidence(rows: PostureRow[], meta: Record<string, unknown>): string {
  return JSON.stringify(
    {
      tool: "asherin.defender",
      generated_at: new Date().toISOString(),
      register_size: rows.length,
      score: scorePosture(rows),
      device: meta,
      findings: rows.map((r) => ({
        id: r.id,
        category: r.cat,
        title: r.title,
        severity: r.sev,
        state: r.finding.state,
        source: r.finding.source,
        observed: r.finding.observed,
        action: r.finding.action ?? null,
        measured_at: r.finding.at ? new Date(r.finding.at).toISOString() : null,
      })),
    },
    null,
    2,
  );
}
