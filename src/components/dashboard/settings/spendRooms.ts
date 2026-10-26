// settings → spend. which rooms the off switch and the ledger can actually
// touch, derived rather than declared.
//
// the switch (tool_api_switches) is consulted in exactly one place:
// src/lib/byokInvoke.ts `invokeWithByokRetry`, and only when the caller names
// a `tool`. the same wrapper writes the ledger (ai_usage_events). so a room is
// gated and recorded if, and only if, its code calls that wrapper with a tool
// id. these are the ids in src/ today (grep `tool: "` near invokeWithByokRetry):
//
//   chat             src/lib/intelligence/modelGateway.ts (the orchestrator's
//                    model call; chat's own direct provider path is not gated)
//   asherin-sentinel src/lib/sentinel/alwaysOn.ts, google/modules/*Sentinel*
//
// the unit test beside this file greps src/ and fails when the two drift.
//
// the direct provider path (src/lib/ai.ts → src/lib/local/llm.ts) that answers
// chat and most rooms on a device neither consults the switch nor writes the
// ledger. the room says so; a patch to ai.ts is proposed in the narrative.

import type { ToolSwitch, UsageEvent } from "@/lib/usage/ledger";

export const GATED_TOOLS: readonly string[] = ["chat", "asherin-sentinel"];

/**
 * rooms to list: everything gated in code, plus any tool the operator already
 * has a switch row for, plus any tool with a recorded call. stable order:
 * gated first, then the rest alphabetically.
 */
export function spendRooms(
  gated: readonly string[],
  switches: Map<string, ToolSwitch>,
  events: UsageEvent[],
): string[] {
  const out = [...gated];
  const rest = new Set<string>();
  for (const k of switches.keys()) if (!out.includes(k)) rest.add(k);
  for (const e of events) if (e.tool && !out.includes(e.tool)) rest.add(e.tool);
  return out.concat([...rest].sort());
}
