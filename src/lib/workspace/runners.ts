// lane -> runners. One place that says which adapters a plan may call.

import type { LaneRunner } from "./orchestrator";
import type { WorkspacePlan } from "./types";
import {
  cameraRunner,
  evidenceRunner,
  geocodeMapRunner,
  researchCardRunner,
  researchGraphRunner,
  researchTimelineRunner,
  sensorCardRunner,
  sensorMapRunner,
  sensorTimelineRunner,
} from "./adapters";

export interface RunnerContext {
  message: string;
  conversationId: string | null;
  timeWindow?: { fromMs: number; toMs: number } | null;
}

export function buildRunners(plan: WorkspacePlan, ctx: RunnerContext): LaneRunner[] {
  if (plan.lane === "sensor") {
    return [
      sensorCardRunner(ctx.timeWindow),
      cameraRunner,
      sensorTimelineRunner(ctx.timeWindow),
      sensorMapRunner,
      evidenceRunner,
    ];
  }
  if (plan.lane === "research") {
    return [
      researchCardRunner(ctx.conversationId),
      researchGraphRunner(ctx.conversationId),
      researchTimelineRunner(ctx.conversationId),
      geocodeMapRunner(ctx.message),
    ];
  }
  if (plan.lane === "spatial") {
    return [geocodeMapRunner(ctx.message)];
  }
  return [];
}
