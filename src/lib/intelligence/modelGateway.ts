// model gateway.
//
// the model is a replaceable capability behind one normalised interface. two
// rules hold this boundary:
//   1. the raw credential never enters the app's reasoning path. the gateway
//      works with a provider id and an opaque reference; the key itself is read
//      server-side by the edge function that talks to the provider.
//   2. switching provider changes nothing about memory or patterns — they live
//      in the database, not in the model.

import { supabase } from "@/integrations/supabase/client";
import { AI_PROVIDERS } from "@/lib/aiProviders";
import { invokeWithByokRetry } from "@/lib/byokInvoke";
import { resolveCapabilities, routeTask } from "./capabilities";
import type { ModelBinding, TaskModality } from "./types";

const UNAVAILABLE: ModelBinding = {
  providerId: "",
  providerName: "none",
  modelId: "",
  credentialRef: null,
  capabilities: resolveCapabilities("", ""),
  available: false,
  unavailableReason: "no ai provider key is saved — add one in settings before asherin can answer",
};

function providerName(id: string): string {
  return AI_PROVIDERS.find((p) => p.id === id)?.name ?? id;
}

/** opaque, non-reversible reference. never the key, never part of the key. */
function credentialReference(providerId: string, rowId: string): string {
  return `cred:${providerId}:${rowId.slice(0, 8)}`;
}

/**
 * resolve the active model binding. reads only the provider id and row id — the
 * api_key column is deliberately not selected, so the key cannot leak into
 * client state, prompts, patterns, memory or logs.
 */
export async function resolveBinding(preferredModel?: string): Promise<ModelBinding> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ...UNAVAILABLE, unavailableReason: "sign in required" };

  const { data, error } = await supabase
    .from("user_api_keys")
    .select("id, provider, is_active, updated_at")
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return UNAVAILABLE;

  const row = data[0] as { id: string; provider: string };
  const provider = AI_PROVIDERS.find((p) => p.id === row.provider);
  const modelId = preferredModel || provider?.models?.[0]?.id || "";

  return {
    providerId: row.provider,
    providerName: providerName(row.provider),
    modelId,
    credentialRef: credentialReference(row.provider, row.id),
    capabilities: resolveCapabilities(row.provider, modelId),
    available: true,
  };
}

export interface GatewayRequest {
  /** already composed by the context resolver; contains no credential material. */
  systemContext: string;
  message: string;
  conversationId: string;
  modality: TaskModality;
  hasImageInput?: boolean;
  estimatedTokens?: number;
  /** the backend function that owns the provider call for this modality. */
  functionName?: string;
  extra?: Record<string, unknown>;
}

export type GatewayResponse =
  | { ok: true; text: string; raw: unknown }
  | { ok: false; reason: string; kind: "unavailable" | "unroutable" | "error" };

const CREDENTIAL_SHAPE = /\b(sk|pk|rk)[-_][A-Za-z0-9]{12,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN[^-]{0,40}PRIVATE KEY-----/;

/** last line of defence: a composed prompt carrying key material never ships. */
export function assertNoCredentials(text: string): void {
  if (CREDENTIAL_SHAPE.test(text)) {
    throw new Error("refusing to send: credential-shaped string found in the composed context");
  }
}

export async function invokeModel(binding: ModelBinding, req: GatewayRequest): Promise<GatewayResponse> {
  if (!binding.available) {
    return { ok: false, reason: binding.unavailableReason ?? "no model available", kind: "unavailable" };
  }

  const routing = routeTask(binding.capabilities, req.modality, {
    hasImageInput: req.hasImageInput,
    estimatedTokens: req.estimatedTokens,
  });
  if (!routing.routable) {
    const missing = routing.missing.map((m) => `${m.capability} (${m.why})`).join("; ");
    return {
      ok: false,
      reason: `${binding.providerName} ${binding.modelId} cannot do this task: ${missing}`,
      kind: "unroutable",
    };
  }

  assertNoCredentials(req.systemContext);
  assertNoCredentials(req.message);

  try {
    const data = await invokeWithByokRetry<Record<string, unknown>>(req.functionName ?? "chat", {
      body: {
        conversationId: req.conversationId,
        message: req.message,
        intelligenceContext: req.systemContext,
        preferredProvider: binding.providerId,
        preferredModel: binding.modelId,
        ...(req.extra ?? {}),
      },
      silent: true,
      tool: (req as { tool?: string }).tool ?? "chat",
    });
    const text =
      (typeof data?.text === "string" && data.text) ||
      (typeof data?.content === "string" && data.content) ||
      (typeof data?.message === "string" && data.message) ||
      "";
    return { ok: true, text, raw: data };
  } catch (e) {
    return { ok: false, reason: (e as Error).message || "the model request failed", kind: "error" };
  }
}
