/**
 * asherin.agents — interval runs, honestly scoped.
 *
 * a browser cannot fire a job from a closed tab. what it can do is keep a
 * timer while this asherin tab stays open; the timers live at module level
 * so leaving the room does not stop them, closing the tab does. the room
 * re-arms them from the stored agents every time it mounts.
 */

import type { Trigger } from "./parse";

export interface Scheduled {
  id: string;
  minutes: number;
}

export interface ScheduleDiff {
  start: Scheduled[];
  stop: string[];
}

/** which timers to start and which to stop so `running` matches `desired`. pure. */
export function diffSchedules(running: Map<string, number>, desired: Scheduled[]): ScheduleDiff {
  const want = new Map(desired.map((d) => [d.id, d.minutes]));
  const start: Scheduled[] = [];
  const stop: string[] = [];
  for (const [id, minutes] of running) {
    if (want.get(id) !== minutes) stop.push(id);
  }
  for (const d of desired) {
    if (running.get(d.id) !== d.minutes) start.push(d);
  }
  return { start, stop };
}

export function desiredFrom<T extends { id: string; trigger: Trigger; status: string; spec_text: string }>(agents: T[]): Scheduled[] {
  return agents
    .filter((a) => a.trigger.kind === "interval" && a.spec_text.trim().length > 0)
    .map((a) => ({ id: a.id, minutes: (a.trigger as { minutes: number }).minutes }));
}

type Fire = (agentId: string) => void;

const timers = new Map<string, { minutes: number; handle: number; nextAt: number }>();
let fire: Fire | null = null;

export function setFireHandler(f: Fire | null) {
  fire = f;
}

export function syncSchedules(desired: Scheduled[]): ScheduleDiff {
  const running = new Map<string, number>();
  for (const [id, t] of timers) running.set(id, t.minutes);
  const diff = diffSchedules(running, desired);
  for (const id of diff.stop) {
    const t = timers.get(id);
    if (t) window.clearInterval(t.handle);
    timers.delete(id);
  }
  for (const s of diff.start) {
    const ms = s.minutes * 60_000;
    const handle = window.setInterval(() => {
      const t = timers.get(s.id);
      if (t) t.nextAt = Date.now() + ms;
      fire?.(s.id);
    }, ms);
    timers.set(s.id, { minutes: s.minutes, handle, nextAt: Date.now() + ms });
  }
  return diff;
}

export function nextRunAt(agentId: string): number | null {
  return timers.get(agentId)?.nextAt ?? null;
}

export function stopAllSchedules() {
  for (const t of timers.values()) window.clearInterval(t.handle);
  timers.clear();
}

export function scheduledCount(): number {
  return timers.size;
}
