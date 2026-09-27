// localStorage-backed theory ledger — persists open predictions so the
// past/future/present cards survive reload. No PII, browser-scoped.

import type { Theory } from "./resonance";

const KEY = "gematria.theories.v1";

export function loadTheories(): Theory[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveTheories(next: Theory[]): void {
  try {
    // Cap at 200 to keep storage bounded.
    const trimmed = next.slice(0, 200);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch { /* quota — silently drop */ }
}

/** Upsert by id; existing entries keep their status/resolvedAt. */
export function upsertTheories(incoming: Theory[]): Theory[] {
  const current = loadTheories();
  const byId = new Map(current.map((t) => [t.id, t] as const));
  for (const t of incoming) {
    const prev = byId.get(t.id);
    byId.set(t.id, prev ? { ...t, status: prev.status, resolvedAt: prev.resolvedAt } : t);
  }
  const next = [...byId.values()].sort((a, b) => b.score - a.score);
  saveTheories(next);
  return next;
}

export function updateTheoryStatus(id: string, status: Theory["status"]): Theory[] {
  const next = loadTheories().map((t) => t.id === id
    ? { ...t, status, resolvedAt: status === "open" ? undefined : new Date().toISOString() }
    : t);
  saveTheories(next);
  return next;
}
