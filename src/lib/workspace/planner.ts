// capability planner — decides which surfaces a turn needs, and whether each
// one can honestly be produced. Pure: same inputs, same plan, always.

import type { IntentRoute } from "@/lib/intelligence/intentRouter";
import type { TaskFrame } from "@/lib/intelligence/types";
import { wantsArtifact } from "@/lib/artifact/engine";
import type { LaneKind, SurfaceKind, WorkspaceCapabilities, WorkspacePlan, WorkspaceSurface } from "./types";

const SENSOR_WORDS =
  /\b(camera|cameras|cctv|footage|clip|recording|incident|intrusion|sentinel|eagle eye|arvision|track|tracks|zone|warehouse|entrance|perimeter|bluetooth|ble|audio|microphone|alarm|alert)\b/i;
const TIME_WINDOW =
  /\b(\d{1,2}\s?(:\d{2})?\s?(am|pm)\b|\bbetween\b.*\band\b|\blast (hour|night|week|\d+ (minutes|hours|days))|\byesterday\b|\btoday\b)/i;
const RESEARCH_WORDS =
  /\b(research|investigate|osint|who (owns|is|runs)|background on|dig into|find out about|company|corporation|filings|registry|linked to|connected to|affiliat\w+)\b/i;
const PLACE_WORDS =
  /\b(where|location|locations|address|addresses|map|nearby|site|sites|branch|branches|headquarters|hq|premises|property)\b/i;

export interface PlannerInput {
  message: string;
  route: IntentRoute;
  task: TaskFrame;
  capabilities: WorkspaceCapabilities;
}

function surface(
  kind: SurfaceKind,
  available: boolean,
  reason: string | undefined,
): WorkspaceSurface {
  return available ? { kind, state: "pending" } : { kind, state: "unavailable", reason: reason || "unavailable" };
}

export function chooseLane(input: PlannerInput): { lane: LaneKind; reasons: string[] } {
  const { message } = input;
  const reasons: string[] = [];
  const sensor = SENSOR_WORDS.test(message);

  // a request for a concrete, inspectable result leads with the artifact lane.
  if (wantsArtifact(message) && !sensor) {
    reasons.push("the request asks for a concrete artifact, so it is built, run where possible, and validated");
    return { lane: "artifact", reasons };
  }
  const research = RESEARCH_WORDS.test(message);
  const place = PLACE_WORDS.test(message);

  if (sensor) {
    reasons.push("the request names cameras, sensors, incidents or a monitored place");
    if (TIME_WINDOW.test(message)) reasons.push("a time window was given, so the timeline is part of the answer");
    return { lane: "sensor", reasons };
  }
  if (research || input.route.specialisation === "research") {
    reasons.push("the request asks for evidence about an entity, so the research lane leads");
    if (place) reasons.push("locations were asked for, so a geographic surface is included");
    return { lane: "research", reasons };
  }
  if (place && /\b(map|address|where)\b/i.test(message)) {
    reasons.push("a place was asked about with no research or sensor framing");
    return { lane: "spatial", reasons };
  }
  reasons.push("no subsystem is needed — this is answered in prose");
  return { lane: "none", reasons };
}

export function planWorkspace(input: PlannerInput): WorkspacePlan {
  const { lane, reasons } = chooseLane(input);
  const cap = input.capabilities;
  const surfaces: WorkspaceSurface[] = [{ kind: "answer", state: "ready", payload: { kind: "answer" } }];

  if (lane === "sensor") {
    surfaces.push(surface("cards", cap.fabric, cap.fabricReason));
    surfaces.push(surface("cameras", cap.cameras, cap.camerasReason));
    surfaces.push(surface("timeline", cap.fabric, cap.fabricReason));
    surfaces.push(
      surface(
        "map",
        cap.cameras && cap.spatialCalibration,
        !cap.cameras ? cap.camerasReason : cap.spatialCalibrationReason,
      ),
    );
    surfaces.push(surface("evidence", cap.evidenceStore, cap.evidenceStoreReason));
  } else if (lane === "research") {
    surfaces.push(surface("cards", cap.research, cap.researchReason));
    surfaces.push(surface("graph", cap.research, cap.researchReason));
    surfaces.push(surface("timeline", cap.research, cap.researchReason));
    if (PLACE_WORDS.test(input.message)) {
      surfaces.push(
        surface("map", cap.geocoding, cap.geocodingReason),
      );
    }
  } else if (lane === "spatial") {
    surfaces.push(surface("map", cap.geocoding, cap.geocodingReason));
  } else if (lane === "artifact") {
    // the artifact surface owns its own lifecycle: it models, builds, runs
    // where it can, and validates. it is marked ready with the request it
    // must satisfy, never with invented content.
    surfaces.push({ kind: "artifact", state: "ready", payload: { kind: "artifact", request: input.message } });
  }

  return { lane, reasons, surfaces, degraded: [] };
}

/** After the orchestrator runs: mark a lane that failed rather than dropping it. */
export function markDegraded(plan: WorkspacePlan, kind: SurfaceKind, reason: string): WorkspacePlan {
  return {
    ...plan,
    surfaces: plan.surfaces.map((s) => (s.kind === kind ? { ...s, state: "degraded", reason, payload: undefined } : s)),
    degraded: [...plan.degraded, { lane: kind, reason }],
  };
}
