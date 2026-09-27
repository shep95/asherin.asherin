// eagle.eye — alert queue, acknowledgement and escalation.
//
// The queue is the only place a human decision is recorded, and it is recorded
// as a decision: who, when, and what they chose. The system never advances an
// item on its own, never resolves one because time passed, and never converts a
// detector's quality number into a statement about a person.
//
// The state machine is deliberately small and one-directional except for the
// step back a real desk needs (an escalation can be pulled back to
// acknowledged when the escalation was a mistake).

import type { Incident } from "../safety/incidents";
import type { ConsoleFilter, QueueItem, QueueStatus } from "./types";

const ALLOWED: Record<QueueStatus, QueueStatus[]> = {
  new: ["acknowledged", "resolved"],
  acknowledged: ["escalated", "resolved"],
  escalated: ["acknowledged", "resolved"],
  resolved: [],
};

export function canTransition(from: QueueStatus, to: QueueStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function transition(
  item: QueueItem, to: QueueStatus, actor: string, atMs: number,
): { item: QueueItem; changed: boolean; reason: string } {
  if (!actor.trim()) {
    return { item, changed: false, reason: "an acknowledgement needs the name of the person making it" };
  }
  if (!canTransition(item.status, to)) {
    return { item, changed: false, reason: `${item.status} cannot move directly to ${to}` };
  }
  return { item: { ...item, status: to, actor, statusAtMs: atMs }, changed: true, reason: "" };
}

/** Provenance strings are written as "camera:<id>" / "track:<id>" by the
 * detectors. Anything else yields null rather than a guessed identifier. */
export function deviceIdOf(provenance: string | null): string | null {
  const m = provenance?.match(/camera:([\w-]+)/);
  return m ? m[1] : null;
}

export function trackIdOf(provenance: string | null): string | null {
  const m = provenance?.match(/track:([\w-]+)/);
  return m ? m[1] : null;
}

/** Review state from the incident ledger mapped onto the operations queue. */
function statusFor(incident: Incident): QueueStatus {
  switch (incident.review) {
    case "confirmed": return "escalated";
    case "false_positive":
    case "dismissed": return "resolved";
    default: return incident.reviewedBy ? "acknowledged" : "new";
  }
}

/**
 * Turn incidents into queue items. Nothing is added that the incident does not
 * carry: quality stays null when the detector reported none, and the missing
 * list is printed rather than hidden so a card can say why it is weak.
 */
export function toQueueItems(incidents: Incident[]): QueueItem[] {
  return incidents.map((i) => {
    // the only signals a card may show are the ones the rule actually used:
    // its observable signal name, the measured value, and what produced it.
    const signals = [...new Set(i.firings.map(
      (f) => `${f.signal} = ${f.value} (${f.provenance})`,
    ))];
    // inputs the severity model refused to count, printed so a weak card looks weak.
    const missing = [...new Set(i.severity?.rejected ?? [])];
    const quality = typeof i.severity?.score === "number" ? i.severity.score : null;
    return {
      incidentId: i.id,
      eventType: i.ruleId,
      label: i.label,
      deviceId: deviceIdOf(i.firings[0]?.provenance ?? null),
      zoneId: i.zoneId,
      openedAtMs: i.openedAtMs,
      lastFiringMs: i.lastFiringMs,
      quality,
      signals: [...new Set(signals)],
      missing: [...new Set(missing)],
      trackIds: [...new Set(i.firings.map((f) => trackIdOf(f.provenance)).filter((t): t is string => !!t))],
      evidenceId: i.evidenceId,
      evidenceState: i.evidenceState,
      status: statusFor(i),
      actor: i.reviewedBy,
      statusAtMs: i.reviewedAtMs,
      notes: i.notes ?? [],
    };
  });
}

/** Composable: every provided field narrows, an omitted field does not. */
export function applyFilter(items: QueueItem[], f: ConsoleFilter): QueueItem[] {
  const text = f.text?.trim().toLowerCase() ?? "";
  return items.filter((i) => {
    if (f.deviceIds?.length && (!i.deviceId || !f.deviceIds.includes(i.deviceId))) return false;
    if (f.zoneIds?.length && (!i.zoneId || !f.zoneIds.includes(i.zoneId))) return false;
    if (f.eventTypes?.length && !f.eventTypes.includes(i.eventType)) return false;
    if (f.statuses?.length && !f.statuses.includes(i.status)) return false;
    if (f.fromMs != null && i.lastFiringMs < f.fromMs) return false;
    if (f.toMs != null && i.openedAtMs > f.toMs) return false;
    if (f.minQuality != null) {
      // an item with no quality figure is not silently treated as good enough.
      if (i.quality == null || i.quality < f.minQuality) return false;
    }
    if (text && !(`${i.label} ${i.eventType} ${i.signals.join(" ")}`.toLowerCase().includes(text))) return false;
    return true;
  });
}

/** Newest activity first; unreviewed work above closed work. */
export function sortQueue(items: QueueItem[]): QueueItem[] {
  const weight: Record<QueueStatus, number> = { escalated: 3, new: 2, acknowledged: 1, resolved: 0 };
  return [...items].sort((a, b) => (weight[b.status] - weight[a.status]) || (b.lastFiringMs - a.lastFiringMs));
}
