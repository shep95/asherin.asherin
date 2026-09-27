// tool orchestrator — runs the planned lanes in parallel, normalizes what came
// back into workspace surfaces, and keeps a failed lane visible as degraded
// instead of quietly dropping it.
//
// It owns no acquisition path of its own: every runner is an adapter over a
// subsystem that already owned that data.

import { markDegraded } from "./planner";
import type { SurfaceKind, WorkspacePlan, WorkspaceSurface, SurfacePayload } from "./types";

export interface LaneRunner {
  kind: SurfaceKind;
  run: (signal: AbortSignal) => Promise<SurfacePayload | null>;
  /** reason used when the runner returns nothing at all. */
  emptyReason: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, outer?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms);
  const onOuter = () => ctrl.abort(new Error("cancelled"));
  outer?.addEventListener("abort", onOuter, { once: true });
  return fn(ctrl.signal).finally(() => {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuter);
  });
}

function payloadIsEmpty(p: SurfacePayload): boolean {
  switch (p.kind) {
    case "cards":
      return p.cards.length === 0;
    case "cameras":
      return p.cameras.length === 0;
    case "timeline":
      return p.items.length === 0;
    case "evidence":
      return p.items.length === 0;
    case "graph":
      return p.graph.nodes.length === 0;
    case "table":
      return p.table.rows.length === 0;
    case "map":
      return p.map.markers.length === 0 && p.map.tracks.length === 0 && p.map.unplotted.length === 0;
    default:
      return false;
  }
}

export async function runLanes(
  plan: WorkspacePlan,
  runners: LaneRunner[],
  outerSignal?: AbortSignal,
): Promise<WorkspacePlan> {
  const pending = new Set(
    plan.surfaces.filter((s) => s.state === "pending").map((s) => s.kind),
  );
  const active = runners.filter((r) => pending.has(r.kind));

  const settled = await Promise.allSettled(
    active.map(async (r) => ({
      kind: r.kind,
      payload: await withTimeout(r.run, r.timeoutMs ?? DEFAULT_TIMEOUT_MS, outerSignal),
    })),
  );

  let next: WorkspacePlan = { ...plan, surfaces: plan.surfaces.map((s) => ({ ...s })) };

  settled.forEach((res, i) => {
    const runner = active[i];
    if (res.status === "rejected") {
      const reason = res.reason instanceof Error ? res.reason.message : String(res.reason);
      next = markDegraded(next, runner.kind, `${runner.kind} lane failed: ${reason}`);
      return;
    }
    const { kind, payload } = res.value;
    if (!payload || payloadIsEmpty(payload)) {
      next = {
        ...next,
        surfaces: next.surfaces.map((s: WorkspaceSurface) =>
          s.kind === kind ? { ...s, state: "unavailable", reason: runner.emptyReason, payload: undefined } : s,
        ),
      };
      return;
    }
    next = {
      ...next,
      surfaces: next.surfaces.map((s: WorkspaceSurface) =>
        s.kind === kind ? { ...s, state: "ready", reason: undefined, payload } : s,
      ),
    };
  });

  // any surface still pending had no runner at all — say so rather than spin.
  next = {
    ...next,
    surfaces: next.surfaces.map((s) =>
      s.state === "pending"
        ? { ...s, state: "unavailable", reason: `no adapter is wired for the ${s.kind} surface in this session` }
        : s,
    ),
  };

  return next;
}
