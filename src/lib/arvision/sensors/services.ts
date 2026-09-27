// asherin.arvision — backend and edge service health.
//
// Four services this room would use if they existed, and one that does. The
// panel prints the difference between "not configured", "configured but not
// answering" and "online", because a blank panel and a dead backend are not the
// same failure and an operator has to know which one they have.

import { supabase } from "@/integrations/supabase/client";
import type { ServiceHealth, ServiceId } from "./types";
import { bridgeEndpoint } from "./adapters/bridge";

const ENDPOINTS: Record<Exclude<ServiceId, "edge_bridge" | "positioning">, string> = {
  inference: (import.meta.env.VITE_ARVISION_INFERENCE_URL as string | undefined) ?? "",
  prediction: (import.meta.env.VITE_ARVISION_PREDICTION_URL as string | undefined) ?? "",
  recording: (import.meta.env.VITE_ARVISION_RECORDING_URL as string | undefined) ?? "",
};

const LABEL: Record<ServiceId, string> = {
  edge_bridge: "edge sensor bridge",
  inference: "inference service",
  prediction: "predictive event service",
  recording: "recording and index service",
  positioning: "visual positioning",
};

const KIND: Record<ServiceId, string> = {
  edge_bridge: "websocket to a ros 2 / genicam / gstreamer node",
  inference: "https detection and tracking endpoint",
  prediction: "https event prediction endpoint",
  recording: "https recording, index and search endpoint",
  positioning: "asherin-arvision-vps edge function",
};

function base(id: ServiceId, configured: boolean, online: boolean, detail: string): ServiceHealth {
  return { id, label: LABEL[id], configured, online, detail, checkedAtMs: Date.now(), endpointKind: KIND[id] };
}

async function probe(id: Exclude<ServiceId, "edge_bridge" | "positioning">): Promise<ServiceHealth> {
  const url = (ENDPOINTS[id] ?? "").trim();
  if (!url) {
    return base(id, false, false, `no ${LABEL[id]} is configured, so this capability is unavailable rather than simulated`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, { signal: controller.signal });
    if (!res.ok) return base(id, true, false, `the service answered ${res.status}`);
    return base(id, true, true, "online");
  } catch (e) {
    const message = e instanceof Error && e.name === "AbortError" ? "the service did not answer within six seconds" : "the service is unreachable";
    return base(id, true, false, message);
  } finally {
    clearTimeout(timer);
  }
}

async function probePositioning(): Promise<ServiceHealth> {
  try {
    const { data, error } = await supabase.functions.invoke("asherin-arvision-vps", { body: { action: "status" } });
    if (error) return base("positioning", true, false, "the positioning function is unreachable");
    const body = data as { configured?: boolean; message?: string } | null;
    return base("positioning", Boolean(body?.configured), Boolean(body?.configured), body?.message ?? "state unknown");
  } catch {
    return base("positioning", true, false, "the positioning function is unreachable");
  }
}

export async function probeServices(): Promise<ServiceHealth[]> {
  const endpoint = bridgeEndpoint();
  const bridge = base(
    "edge_bridge",
    Boolean(endpoint),
    false,
    endpoint
      ? "configured — live state is reported by the bridge adapter in the sensor registry"
      : "no edge bridge is configured. ros 2, aravis/genicam, gige and usb3 vision, gstreamer, open3d and zenoh run on an edge node, never in this browser tab",
  );
  const [inference, prediction, recording, positioning] = await Promise.all([
    probe("inference"),
    probe("prediction"),
    probe("recording"),
    probePositioning(),
  ]);
  return [bridge, inference, prediction, recording, positioning];
}
