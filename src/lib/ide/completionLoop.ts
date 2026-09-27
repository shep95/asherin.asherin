// ============================================================
// IDE Completion Loop — ported from ZAHTEN's Mission Console
// ------------------------------------------------------------
// The IDE used to half-finish builds because it only continued
// when the model asked a *question*. If the model just stopped
// mid-build with "I'll continue next time", the IDE accepted it.
//
// ZAHTEN solves this with four mechanisms — all ported here so
// both Asher Code and Aureon IDE share them:
//
//   1. Scope Assessor pre-flight  — batches missing-detail
//      questions ONCE before the build starts.
//   2. Output contract per pass   — every pass MUST emit
//      PLAN / FILES TO CREATE / FILES TO UPDATE /
//      MISSING PIECES / NEXT PASS sections.
//   3. STATUS sentinel            — every pass ends with
//      `STATUS: REFINING — <why>`  or
//      `STATUS: MISSION_COMPLETE — <why>`. The loop only
//      stops on the complete sentinel or the iteration cap.
//   4. Auto-approve continuation  — "APPROVED. Pass N+1:
//      harder critique, deeper edge cases, FULL improved
//      version" — same UX as ZAHTEN's auto-approve toggle.
// ============================================================

export const IDE_BUILD_MAX_ITERATIONS = 8;

// ── 1. Scope Assessor ─────────────────────────────────────
export const IDE_SCOPE_ASSESSOR_SYSTEM = `You are the IDE SCOPE ASSESSOR. Your only job is to decide whether a build prompt has enough information to ship a production-grade software project without guessing core decisions.

Required signal (must be inferable from the prompt):
- What the software does (one-sentence purpose)
- Primary user / surface (web / cli / mobile / library)
- Core data sources / external APIs (or "none")
- Persistence (none / localStorage / database / file)
- Auth / access control (or "public")
- Success criteria — how do we know it's done?

Respond with ONE of these two formats and NOTHING else:

READY
<one sentence restating the build in your own words>

or

CLARIFY
1. <specific question>
2. <specific question>
3. <specific question>`;

export interface AssessorResult {
  ready: boolean;
  restated?: string;
  questions?: string[];
}

export function parseAssessor(text: string): AssessorResult {
  const t = (text || "").trim();
  if (/^READY\b/i.test(t)) {
    const rest = t.replace(/^READY\s*/i, "").trim();
    return { ready: true, restated: rest || "Scope confirmed." };
  }
  if (/^CLARIFY\b/i.test(t)) {
    const lines = t.split(/\r?\n/).slice(1);
    const qs: string[] = [];
    for (const raw of lines) {
      const m = /^\s*\d+[.)]\s+(.+)$/.exec(raw);
      if (m) qs.push(m[1].trim());
    }
    if (qs.length) return { ready: false, questions: qs };
  }
  // Fallback: treat as ready so we never block the user.
  return { ready: true, restated: "Scope confirmed (assessor returned free-form)." };
}

// ── 2. Output contract injected into every build pass ─────
export const IDE_BUILD_CONTRACT = `[BUILD CONTRACT — REQUIRED FOR EVERY PASS]
Every response MUST contain these BOLD sections in this exact order:

**PASS N — <one-line summary of this pass's improvement>**

**PLAN** (numbered list of architectural decisions made or refined this pass)

**FILES TO CREATE** (path → one-line purpose; or "none this pass")

**FILES TO UPDATE** (path → what changes; or "none this pass")

**CODE** (one fenced code block per file you are creating/updating, each block prefixed with the file path on its own line above the fence)

**MISSING PIECES** (bullet list of everything still incomplete — empty list ONLY when the project is genuinely shippable)

**NEXT PASS** (one sentence describing what the next pass will tackle, or "n/a — shipping")

End the message with EXACTLY one of these sentinel lines on its own:
    STATUS: REFINING — <one-sentence reason another pass is needed>
    STATUS: MISSION_COMPLETE — <one-sentence reason this is now production-grade>

Doctrine:
- After producing output, SILENTLY self-critique: missing files, weak error handling, unhandled edge cases, missing observability, security gaps, unwired imports.
- Then produce the FULL improved version (not a diff).
- Keep iterating until the build is genuinely shippable.
- Voice: Senior staff engineer. Surgical. Direct. No filler. No "Certainly".`;

// ── 3. STATUS sentinel parsing ────────────────────────────
export type IdeBuildStatus = "refining" | "complete" | "unknown";

export function parseIdeBuildStatus(text: string): IdeBuildStatus {
  if (!text) return "unknown";
  if (/STATUS:\s*MISSION_COMPLETE/i.test(text)) return "complete";
  if (/AUTOPILOT\s+COMPLETE/i.test(text)) return "complete";
  if (/STATUS:\s*REFINING/i.test(text)) return "refining";
  return "unknown";
}

/** Pull the bullets under **MISSING PIECES** so the panel can render them. */
export function extractMissingPieces(text: string): string[] {
  if (!text) return [];
  const m = /\*\*MISSING PIECES\*\*\s*\n([\s\S]*?)(?=\n\*\*[A-Z]|\nSTATUS:|$)/i.exec(text);
  if (!m) return [];
  const out: string[] = [];
  for (const raw of m[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const b = /^[-*•]\s+(.+)$/.exec(line);
    if (b) out.push(b[1].trim());
  }
  return out;
}

/** Extract the one-line reason from the trailing STATUS sentinel. */
export function extractStatusReason(text: string): string | null {
  const m = /STATUS:\s*(?:REFINING|MISSION_COMPLETE)\s*[—\-:]\s*(.+?)\s*$/im.exec(text || "");
  return m ? m[1].trim() : null;
}

// ── 4. Auto-approve continuation reply ────────────────────
export function buildCritiqueContinuationReply(round: number, max: number): string {
  return [
    `[IDE BUILD AUTOPILOT — pass ${round}/${max}]`,
    "",
    "APPROVED. Now perform the next pass:",
    "- Harder self-critique. Deeper edge cases. Tighter code.",
    "- Resolve every item under **MISSING PIECES** from your previous pass.",
    "- Produce the FULL improved version (not a diff).",
    "- Follow the BUILD CONTRACT exactly.",
    "- End with the STATUS sentinel.",
    "",
    "Make every architectural decision yourself using first-principles reasoning.",
    "Do NOT ask me any questions in this round.",
  ].join("\n");
}

/** True when the loop should keep going — i.e. model said REFINING and we have budget. */
export function shouldContinueBuild(text: string, round: number, max: number): boolean {
  if (round >= max) return false;
  return parseIdeBuildStatus(text) === "refining";
}
