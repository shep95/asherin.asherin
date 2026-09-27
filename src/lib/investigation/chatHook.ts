/**
 * Chat -> investigation bridge.
 *
 * A normal message passes through untouched. A research request opens (or
 * reuses) the investigation bound to this conversation, runs one real hop,
 * reconciles the evidence, and hands the model a grounding block built only
 * from what was actually stored.
 */

import { supabase } from "@/integrations/supabase/client";

import { advanceLoop, reconcile, runHop } from "./coordinator";
import { buildGroundingContext, parseCommand, titleFromQuestion } from "./intent";
import { createInvestigation, loadSnapshot } from "./persistence";
import type { Investigation } from "./types";

export interface InvestigationTurn {
  /** Content to send to the model — original text unless research applied. */
  content: string;
  investigationId: string | null;
  /** Short operator-facing note about what the hop actually did. */
  notice: string | null;
  applied: boolean;
}

async function investigationForConversation(conversationId: string): Promise<Investigation | null> {
  const { data } = await supabase
    .from("osint_investigations")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    userId: data.user_id,
    title: data.title,
    question: data.question,
    status: data.status as Investigation["status"],
    summary: data.summary,
    conversationId: data.conversation_id,
    providerState: (data.provider_state ?? {}) as Investigation["providerState"],
    lastHopAt: data.last_hop_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function providerNotice(state: Investigation["providerState"]): string | null {
  const down = Object.entries(state || {})
    .filter(([, v]) => v && v.status !== "live")
    .map(([k, v]) => `${k}: ${v!.status}${v!.detail ? ` — ${v!.detail}` : ""}`);
  return down.length ? down.join(" · ") : null;
}

/**
 * Called for every outgoing chat turn. Returns the original content unchanged
 * for anything that is not research, so ordinary conversation is unaffected.
 */
export async function applyInvestigationTurn(content: string, conversationId: string): Promise<InvestigationTurn> {
  const untouched: InvestigationTurn = { content, investigationId: null, notice: null, applied: false };
  try {
    const existing = await investigationForConversation(conversationId);
    const command = parseCommand(content, Boolean(existing));
    if (command.kind === "none") return untouched;

    let investigation = existing;
    let notice: string | null = null;

    if (command.kind === "start" && !investigation) {
      investigation = await createInvestigation({
        title: titleFromQuestion(content),
        question: content,
        conversationId,
      });
      const result = await runHop({ investigationId: investigation.id, query: content, phase: "discover", objective: content });
      await reconcile(investigation.id);
      notice = result.ok
        ? `investigation opened · ${result.stats?.sources ?? 0} sources, ${result.stats?.claims ?? 0} cited claims`
        : `investigation opened, but the hop returned nothing: ${result.reason || result.error || "no source retrieved"}`;
      const down = providerNotice(result.providers);
      if (down) notice += ` · ${down}`;
    } else if (investigation && (command.kind === "hop" || command.kind === "next")) {
      const out = await advanceLoop(investigation.id);
      notice = out.hop
        ? `hop [${out.hop.phase}] ${out.hop.objective}${out.result?.ok ? "" : ` — ${out.result?.reason || out.result?.error || "no new sources"}`}`
        : out.next.reason;
    }

    if (!investigation) return untouched;

    const snapshot = await loadSnapshot(investigation.id);
    if (!snapshot) return untouched;

    const grounding = buildGroundingContext(snapshot);
    return {
      content: `${grounding}\n\nOPERATOR MESSAGE: ${content}`,
      investigationId: investigation.id,
      notice,
      applied: true,
    };
  } catch (e) {
    // A research failure must never swallow the user's message.
    return { ...untouched, notice: `investigation layer unavailable: ${(e as Error).message}` };
  }
}
