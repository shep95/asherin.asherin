/**
 * Chat-side intent detection and grounding.
 *
 * Normal conversation is untouched: only a message that clearly asks for
 * research opens an investigation, and only while an investigation is already
 * open do the follow-up commands apply.
 */

import { assessClaim } from "./confidence";
import { nextBestHops } from "./hops";
import { TIER_LABEL } from "./authority";
import type { InvestigationSnapshot } from "./types";

export type InvestigationCommand =
  | { kind: "start"; question: string }
  | { kind: "explain"; subject: string | null }
  | { kind: "contradictions" }
  | { kind: "hop"; subject: string | null }
  | { kind: "timeline" }
  | { kind: "next" }
  | { kind: "none" };

const START_PATTERNS = [
  /\b(research|investigate|dig into|look into|find out) (this|the)? ?(company|person|organisation|organization|entity|business|firm)\b/i,
  /\bwho (owns|founded|runs|controls|is behind)\b/i,
  /\brun an? (osint|investigation|background) (check|research)\b/i,
  /\b(open|start) an investigation\b/i,
  /\bbuild (me )?a (dossier|profile) on\b/i,
  /\btrace the ownership\b/i,
];

const FOLLOW_UP: { re: RegExp; make: (m: RegExpMatchArray) => InvestigationCommand }[] = [
  { re: /\b(show me )?why do you think|why do you believe|show me the evidence|show your evidence|show me why\b/i, make: () => ({ kind: "explain", subject: null }) },
  { re: /\bwhat contradicts (this|that)|any contradictions|show contradictions|conflicting\b/i, make: () => ({ kind: "contradictions" }) },
  { re: /\bhop from (?:this |the )?(.+)$/i, make: (m) => ({ kind: "hop", subject: (m[1] || "").trim() || null }) },
  { re: /\bbuild (me )?the timeline|show (me )?the timeline\b/i, make: () => ({ kind: "timeline" }) },
  { re: /\bwhat (should we|do we) investigate next|next best hop|what next\b/i, make: () => ({ kind: "next" }) },
];

/** True when a message asks for research rather than conversation. */
export function isResearchRequest(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < 8) return false;
  return START_PATTERNS.some((p) => p.test(t));
}

export function parseCommand(text: string, hasActiveInvestigation: boolean): InvestigationCommand {
  const t = (text || "").trim();
  if (hasActiveInvestigation) {
    for (const f of FOLLOW_UP) {
      const m = t.match(f.re);
      if (m) return f.make(m);
    }
  }
  if (isResearchRequest(t)) return { kind: "start", question: t };
  return { kind: "none" };
}

/** A short, human title derived from the question. */
export function titleFromQuestion(question: string): string {
  const cleaned = question
    .replace(/^(please\s+)?(can you\s+)?(research|investigate|look into|dig into|find out)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned.charAt(0).toUpperCase() + cleaned.slice(1)).slice(0, 120) || "Untitled investigation";
}

/**
 * Renders the investigation into a grounding block for the model.
 *
 * The block carries only what is stored, each line tagged with its status and
 * the authority behind it, so the assistant answers from evidence instead of
 * memory — and says "unknown" when the investigation says unknown.
 */
export function buildGroundingContext(snapshot: InvestigationSnapshot, maxChars = 6000): string {
  const { investigation, entities, claims, evidence, sources, contradictions, gaps, timeline } = snapshot;
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const lines: string[] = [];

  lines.push(`<investigation id="${investigation.id}" title="${investigation.title}">`);
  lines.push(`QUESTION: ${investigation.question}`);

  const providerNotes = Object.entries(investigation.providerState || {})
    .filter(([, v]) => v && v.status !== "live")
    .map(([k, v]) => `${k}=${v!.status}${v!.detail ? ` (${v!.detail})` : ""}`);
  if (providerNotes.length) lines.push(`UNAVAILABLE ADAPTERS: ${providerNotes.join("; ")}`);

  if (!claims.length) {
    lines.push("NO CLAIMS STORED YET. Do not answer from memory; say the investigation has not gathered evidence yet.");
  }

  const scored = claims
    .filter((c) => c.status !== "retracted")
    .map((c) => ({ claim: c, a: assessClaim({ claim: c, evidence, sources }) }))
    .sort((x, y) => y.a.confidence - x.a.confidence)
    .slice(0, 30);

  if (scored.length) {
    lines.push("CLAIMS (status | confidence | why):");
    for (const { claim, a } of scored) {
      const cites = evidence
        .filter((e) => e.claimId === claim.id && e.stance === "supports")
        .map((e) => sourceById.get(e.sourceId || ""))
        .filter(Boolean)
        .slice(0, 3)
        .map((s) => `${s!.url ?? s!.title} [${TIER_LABEL[s!.authorityTier]}]`);
      lines.push(
        `- ${claim.statement} | ${a.status} | ${a.confidence.toFixed(2)} | ${a.reason}${
          cites.length ? `\n  sources: ${cites.join(" ; ")}` : "\n  sources: none cited"
        }`,
      );
    }
  }

  const unresolved = contradictions.filter((c) => c.resolution === "unresolved");
  if (contradictions.length) {
    lines.push(`CONTRADICTIONS (${unresolved.length} unresolved of ${contradictions.length}):`);
    for (const c of contradictions.slice(0, 10)) {
      const a = claims.find((x) => x.id === c.claimA);
      const b = claims.find((x) => x.id === c.claimB);
      lines.push(`- "${a?.statement ?? "?"}" vs "${b?.statement ?? "?"}" -> ${c.resolution}: ${c.resolutionReason ?? ""}`);
    }
  }

  if (timeline.length) {
    lines.push("TIMELINE:");
    for (const t of timeline.slice(0, 15)) {
      lines.push(`- ${t.occurredAt?.slice(0, 10) ?? "date unknown"} (${t.datePrecision}) ${t.label}`);
    }
  }

  if (entities.length) {
    lines.push(
      `ENTITIES: ${entities
        .slice(0, 25)
        .map((e) => `${e.label} [${e.kind}, ${e.resolutionState}]`)
        .join("; ")}`,
    );
  }

  if (gaps.filter((g) => g.status === "open").length) {
    lines.push("OPEN GAPS:");
    for (const g of gaps.filter((g) => g.status === "open").slice(0, 10)) lines.push(`- ${g.description}`);
  }

  const hops = nextBestHops(snapshot, 3);
  if (hops.length) {
    lines.push("NEXT BEST HOPS:");
    for (const h of hops) lines.push(`- [${h.phase}] ${h.objective} — ${h.rationale}`);
  }

  lines.push(
    "RULES: answer only from the records above; cite the source url for any claim you state; " +
      "call unresolved claims unresolved; never upgrade a weak or uncited claim into a fact; " +
      "if the answer is not in these records, say the investigation does not have it yet.",
  );
  lines.push("</investigation>");

  const out = lines.join("\n");
  void entityById;
  return out.length > maxChars ? `${out.slice(0, maxChars)}\n… (truncated)</investigation>` : out;
}
