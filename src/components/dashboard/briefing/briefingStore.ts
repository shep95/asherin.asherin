/**
 * asherin.briefing — storage and the model call.
 *
 * Profiles live in the local table `briefing_profiles` (one row per device
 * identity), reports in `briefing_reports`. Both are IndexedDB rows behind the
 * PostgREST-shaped shim; nothing here leaves the device except the prompt that
 * goes to the provider the operator connected, carrying the key from the vault.
 */

import { supabase } from "@/integrations/supabase/client";
import { getActiveModel, getProviderKey, VaultLockedError } from "@/lib/local/keys";
import { providerNeedsKey, streamLlm, LlmError } from "@/lib/local/llm";
import { normalizeProfile, type BriefingProfile, type TierCounts } from "./briefingEngine";

export interface ProfileRow extends BriefingProfile {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface ReportRow {
  id: string;
  user_id: string;
  title: string;
  content: string;
  sources_checked: number;
  critical_items: number;
  significant_items: number;
  monitoring_items: number;
  provider: string;
  model: string;
  created_at: string;
}

const REPORT_LIMIT = 50;

function errMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") return (e as { message: string }).message;
  return fallback;
}

/* ── profile ────────────────────────────────────────────────────────────── */

/** The device's profile row, or null. Several rows (never expected) resolve to the newest. */
export async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("briefing_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(errMessage(error, "could not read the briefing profile"));
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) return null;
  return {
    ...normalizeProfile(row),
    id: String(row.id),
    user_id: String(row.user_id ?? userId),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

/** Insert or update the one profile row for this device. */
export async function saveProfile(userId: string, profile: BriefingProfile): Promise<ProfileRow> {
  const clean = normalizeProfile(profile);
  const existing = await loadProfile(userId);
  const now = new Date().toISOString();
  if (existing) {
    const { error } = await supabase.from("briefing_profiles").update({ ...clean, updated_at: now }).eq("id", existing.id);
    if (error) throw new Error(errMessage(error, "could not save the briefing profile"));
    return { ...existing, ...clean, updated_at: now };
  }
  const { data, error } = await supabase
    .from("briefing_profiles")
    .insert({ ...clean, user_id: userId, updated_at: now })
    .select()
    .single();
  if (error || !data) throw new Error(errMessage(error, "could not save the briefing profile"));
  const row = data as Record<string, unknown>;
  return { ...clean, id: String(row.id), user_id: userId, created_at: String(row.created_at ?? now), updated_at: now };
}

export async function deleteProfile(userId: string): Promise<void> {
  const { error } = await supabase.from("briefing_profiles").delete().eq("user_id", userId);
  if (error) throw new Error(errMessage(error, "could not delete the briefing profile"));
}

/* ── reports ────────────────────────────────────────────────────────────── */

export async function loadReports(userId: string): Promise<ReportRow[]> {
  const { data, error } = await supabase
    .from("briefing_reports")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(REPORT_LIMIT);
  if (error) throw new Error(errMessage(error, "could not read saved briefings"));
  return ((data as Record<string, unknown>[] | null) ?? []).map(toReportRow);
}

function toReportRow(r: Record<string, unknown>): ReportRow {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    id: String(r.id),
    user_id: String(r.user_id ?? ""),
    title: typeof r.title === "string" && r.title ? r.title : "briefing",
    content: typeof r.content === "string" ? r.content : "",
    sources_checked: n(r.sources_checked),
    critical_items: n(r.critical_items),
    significant_items: n(r.significant_items),
    monitoring_items: n(r.monitoring_items),
    provider: typeof r.provider === "string" ? r.provider : "",
    model: typeof r.model === "string" ? r.model : "",
    created_at: String(r.created_at ?? ""),
  };
}

export async function insertReport(input: {
  userId: string;
  title: string;
  content: string;
  counts: TierCounts;
  provider: string;
  model: string;
}): Promise<ReportRow> {
  const { data, error } = await supabase
    .from("briefing_reports")
    .insert({
      user_id: input.userId,
      title: input.title,
      content: input.content,
      sources_checked: 0,
      critical_items: input.counts.critical,
      significant_items: input.counts.significant,
      monitoring_items: input.counts.monitoring,
      provider: input.provider,
      model: input.model,
    })
    .select()
    .single();
  if (error || !data) throw new Error(errMessage(error, "the briefing was written but could not be saved"));
  return toReportRow(data as Record<string, unknown>);
}

export async function deleteReport(id: string): Promise<void> {
  const { error } = await supabase.from("briefing_reports").delete().eq("id", id);
  if (error) throw new Error(errMessage(error, "could not delete the briefing"));
}

/* ── shepherd ───────────────────────────────────────────────────────────── */

export type ShepherdState =
  | { ok: true; provider: string; model: string; apiKey: string }
  | { ok: false; code: "none" | "locked" | "unsupported"; reason: string };

export const SETTINGS_PATH = "settings → intelligence";

/**
 * Can shepherd answer from this device right now? Reads the vault, never
 * opens a dialog: the room says precisely what is missing in its own words.
 */
export async function resolveShepherd(): Promise<ShepherdState> {
  const active = await getActiveModel().catch(() => null);
  if (!active) return { ok: false, code: "none", reason: `shepherd has no model to write with. connect a model key in ${SETTINGS_PATH}.` };
  let apiKey = "";
  if (providerNeedsKey(active.provider)) {
    try {
      apiKey = (await getProviderKey(active.provider)) ?? "";
    } catch (e) {
      if (e instanceof VaultLockedError) return { ok: false, code: "locked", reason: `your key vault is locked. unlock it in ${SETTINGS_PATH} and shepherd can write.` };
      return { ok: false, code: "none", reason: `the ${active.provider} key could not be read from the vault. check ${SETTINGS_PATH}.` };
    }
    if (!apiKey) return { ok: false, code: "none", reason: `no saved key for ${active.provider}. add one in ${SETTINGS_PATH}.` };
  }
  return { ok: true, provider: active.provider, model: active.model, apiKey };
}

export interface ShepherdMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * One call to the connected model, streamed. Throws an Error whose message is
 * already written for the operator (lowercase, says what to do).
 */
export async function askShepherd(input: {
  system: string;
  messages: ShepherdMessage[];
  signal?: AbortSignal;
  maxTokens?: number;
  onDelta?: (text: string) => void;
}): Promise<{ text: string; provider: string; model: string }> {
  const s = await resolveShepherd();
  if (s.ok === false) throw new Error(s.reason);
  try {
    const text = await streamLlm({
      provider: s.provider,
      model: s.model,
      apiKey: s.apiKey,
      maxTokens: input.maxTokens,
      signal: input.signal,
      messages: [{ role: "system", content: input.system }, ...input.messages],
      onDelta: input.onDelta,
    });
    return { text, provider: s.provider, model: s.model };
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    if (e instanceof LlmError) {
      if (e.code === "AUTH") throw new Error(`${s.provider} rejected the saved key. check it in ${SETTINGS_PATH}.`);
      if (e.code === "RATE_LIMIT" || e.code === "UPSTREAM_BUSY") throw new Error(`${s.provider} is busy or rate-limited. try again in a moment.`);
      if (e.code === "NETWORK") throw new Error(`${s.provider} could not be reached. check the connection and try again.`);
      throw new Error(e.message);
    }
    throw new Error(errMessage(e, "shepherd did not answer"));
  }
}
