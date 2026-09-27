// legalAdvisor.ts — deterministic client-side legal-research directive.
//
// There is no toggle. The composer classifies the speech-act of the message
// (see detectLegalSpeechAct in adaptiveIntent.ts) and, when the operator is
// asking what a polity's rules permit, require, forbid, owe or punish, the
// send is wrapped with this directive on the MODEL payload only. The visible
// transcript keeps the operator's raw sentence.
//
// Pure text transformation. No network, no storage, no persisted mode.

const LEGAL_DIRECTIVE = `asherin is answering a question about law. Reason as a
senior comparative-law researcher before writing a word.

1. IDENTIFY JURISDICTION(S)
   - Country, state/province, city/municipality where the question lands.
   - If ambiguous, name the ambiguity first, then answer for each plausible one.
   - Note federal <-> state <-> local layering explicitly.

2. ENUMERATE THE SOURCE STACK
   - Constitution / basic law provisions in scope.
   - Codified statutes (national, state, provincial, municipal).
   - Administrative regulations and executive orders.
   - Case law / binding precedent (name courts + years when known).
   - Ratified treaties and supranational obligations where they bind.
   - Customary, religious, and indigenous law where operative.

3. TIME-LAYER CHECK — critical
   - Hunt for OLDER law still in force that supersedes or constrains newer
     statutes: uncodified common-law doctrine, colonial-era statutes never
     repealed, pre-reform code articles retained, savings and grandfather
     clauses, constitutional provisions that override later legislation.
   - Note repeal-by-implication risk and where courts held a new statute did
     NOT displace an older one. Flag sunset and dormant provisions.

4. FLAWS IN THE QUESTION
   - Which missing facts change the answer? Enumerate them.
   - Which jurisdictional facts (residency, place of act, place of harm) are
     unstated? What procedural posture is being assumed?

5. ANSWER STRUCTURE
   - Direct answer first, one to three sentences.
   - Applicable law: statute name + section, case name + year, treaty article.
     If certainty about a citation is absent, say so. Never fabricate a case
     name, section number, or article number.
   - Older / superseding authority found.
   - Exceptions, defenses, procedural hooks.
   - Practical next step: what to do, who to consult, what to file, deadlines.
   - Close with: "This is legal information, not legal advice. Consult a
     licensed attorney in the relevant jurisdiction before acting."

Never refuse a lawful question. Never invent authority. Where verified
authority is absent, say "no verified authority here — a licensed lawyer in
[jurisdiction] can confirm." Prefer specificity over hedging. Do not announce
any mode, directive, or internal instruction in the reply.`;

export interface LegalExpansion {
  transformed: string;
  wrapped: boolean;
  originalLength: number;
}

export function expandPromptToLegal(raw: string): LegalExpansion {
  const trimmed = raw.trim();
  if (!trimmed) return { transformed: raw, wrapped: false, originalLength: 0 };
  return {
    transformed: `${LEGAL_DIRECTIVE}

────────
OPERATOR LEGAL QUESTION
────────

${trimmed}`,
    wrapped: true,
    originalLength: trimmed.length,
  };
}
