// prints the record into two documents a person can actually carry into a clinic room:
// a clinical package (what to say, in order of urgency) and a family atlas (what is
// inherited versus what is missing). both are markdown, both are honest about gaps.
import type { HealthRecord } from "../store";
import { labDef } from "../labs";
import { findDrug } from "../medications";
import { HERBS, safetyReview } from "../herbs";
import { GENE_DEFS, findGene } from "../genetics";
import { SYMPTOMS } from "../symptoms";
import { FAMILY_PRESETS } from "../records";
import { rankFlags, triggeredFlagsExtended, painPattern, type PainReport } from "../pain";

function section(title: string, lines: string[]): string {
  if (lines.length === 0) return `### ${title}\n\nnothing recorded here yet.\n`;
  return `### ${title}\n\n${lines.map((l) => `- ${l}`).join("\n")}\n`;
}

/** timeline entry: everything with a date, sorted oldest to newest. */
function buildTimeline(record: HealthRecord): string[] {
  type Row = { at: string; label: string };
  const rows: Row[] = [];
  for (const p of record.pain) rows.push({ at: p.createdAt, label: `pain reported — ${p.partName ?? "unlocated"}` });
  for (const s of record.surgeries) if (s.year) rows.push({ at: `${s.year}-01-01`, label: `surgery — ${s.label}` });
  for (const sn of record.snapshots) rows.push({ at: sn.at, label: `snapshot — ${sn.label}` });
  for (const sy of record.symptoms) if (sy.since) rows.push({ at: sy.since, label: `symptom onset — ${SYMPTOMS.find((d) => d.key === sy.symptomKey)?.label ?? sy.symptomKey}` });
  rows.sort((a, b) => a.at.localeCompare(b.at));
  return rows.map((r) => `${new Date(r.at).toLocaleDateString()} — ${r.label}`);
}

function painRedFlagLines(pain: PainReport[]): string[] {
  const out: string[] = [];
  for (const p of pain) {
    const flags = rankFlags(triggeredFlagsExtended(p));
    if (flags.length === 0) continue;
    for (const f of flags) out.push(`${p.partName ?? "unlocated pain"}: [${f.urgency}] ${f.label} — ${f.action}`);
  }
  return out;
}

function currentPainLines(pain: PainReport[]): string[] {
  return pain.map((p) => {
    const pattern = painPattern(p)[0];
    const worst = p.intensityWorst ?? Number(p.answers.severity ?? 0);
    return `${p.partName ?? "unlocated"} — worst ${worst || "not recorded"}/10${pattern ? `, most consistent with a ${pattern.label} pattern (${Math.round(pattern.confidence * 100)}% weight, not a diagnosis)` : ""}.`;
  });
}

function medicationHerbLines(record: HealthRecord): { meds: string[]; herbs: string[]; interactions: string[] } {
  const meds = record.medications.map((m) => `${m.name}${m.dose ? ` · ${m.dose}` : ""}${m.note ? ` — ${m.note}` : ""}`);
  const herbDefs = record.herbs.map((k) => HERBS.find((h) => h.key === k)).filter((h): h is (typeof HERBS)[number] => Boolean(h));
  const herbs = herbDefs.map((h) => `${h.label} (${h.tradition}) — ${h.evidence.replace("-", " ")} evidence.`);
  const review = safetyReview(
    record.herbs,
    { medications: record.medications.map((m) => ({ name: m.name, drugKey: m.drugKey })) },
  );
  const interactions = [
    ...review.blocking.map((w) => `blocking — ${w.detail}`),
    ...review.cautions.map((w) => `caution — ${w.detail}`),
  ];
  if (interactions.length === 0 && (meds.length > 0 || herbs.length > 0)) {
    interactions.push("no interactions found between recorded herbs and recorded medications in this reference set — that is not the same as no interaction existing.");
  }
  return { meds, herbs, interactions };
}

function labsOutOfRangeLines(record: HealthRecord): string[] {
  const out: string[] = [];
  for (const v of record.labs) {
    const def = labDef(v.key);
    if (!def) continue;
    if (v.value > def.high) out.push(`${def.label}: ${v.value} ${def.unit} (reference ${def.low}–${def.high}) — above range.`);
    else if (v.value < def.low) out.push(`${def.label}: ${v.value} ${def.unit} (reference ${def.low}–${def.high}) — below range.`);
  }
  return out;
}

function familyHistoryLines(record: HealthRecord): string[] {
  return record.family.map((f) => `${f.condition} — ${f.relation}${f.ageAtOnset ? ` at age ${f.ageAtOnset}` : ""}`);
}

/** questions worth asking, generated from what is actually missing or unresolved in the record. */
function suggestedQuestions(record: HealthRecord): string[] {
  const out: string[] = [];
  const flagCount = record.pain.reduce((n, p) => n + rankFlags(triggeredFlagsExtended(p)).length, 0);
  if (flagCount > 0) out.push("which of my reported pain patterns needs urgent investigation, and which can wait?");
  if (record.herbs.length > 0) out.push("are any of the herbs or supplements I take safe to continue alongside my current medications?");
  if (labsOutOfRangeLines(record).length > 0) out.push("which of my out-of-range results need repeating versus acting on now?");
  if (record.family.some((f) => typeof f.ageAtOnset === "number" && f.ageAtOnset < 55)) {
    out.push("does my family history move my own screening age earlier for anything?");
  }
  if (record.genes.length > 0) out.push("does my genetic result change any of my current screening or medication choices?");
  if (out.length === 0) out.push("is there anything in this record you would want me to track differently before the next visit?");
  return out;
}

export function buildClinicalPackage(record: HealthRecord): string {
  const timeline = buildTimeline(record);
  const redFlags = painRedFlagLines(record.pain);
  const currentPain = currentPainLines(record.pain);
  const { meds, herbs, interactions } = medicationHerbLines(record);
  const labsOut = labsOutOfRangeLines(record);
  const family = familyHistoryLines(record);
  const questions = suggestedQuestions(record);

  const parts: string[] = [];
  parts.push("# clinical package");
  parts.push("");
  parts.push(`generated on-device on ${new Date().toLocaleDateString()}. this is a self-reported summary, not a diagnosis, and it never left this device until you exported it.`);
  parts.push("");
  if (redFlags.length > 0) {
    parts.push("### see a clinician about these first");
    parts.push("");
    for (const r of redFlags) parts.push(`- ${r}`);
    parts.push("");
  }
  parts.push(section("timeline", timeline));
  parts.push(section("current pain", currentPain));
  parts.push(section("medications", meds));
  parts.push(section("herbs and supplements", herbs));
  parts.push(section("interactions between herbs and medications", interactions));
  parts.push(section("labs outside reference range", labsOut));
  parts.push(section("family history", family));
  parts.push(section("questions to ask", questions));
  parts.push("---");
  parts.push("");
  parts.push("what is missing: this package only contains what was entered on this device. it carries no imaging, no clinician notes, and no lab results beyond what was typed in here.");
  return parts.join("\n");
}

export interface FamilyRiskPattern {
  condition: string;
  relatives: string[];
  earlyOnset: boolean;
  mechanism: string;
}

/** groups family entries by condition and states, honestly, what a repeated pattern does and does not mean. */
export function buildFamilyAtlas(record: HealthRecord): string {
  const byCondition = new Map<string, { relation: string; ageAtOnset?: number }[]>();
  for (const f of record.family) {
    const list = byCondition.get(f.condition) ?? [];
    list.push({ relation: f.relation, ageAtOnset: f.ageAtOnset });
    byCondition.set(f.condition, list);
  }
  const parts: string[] = [];
  parts.push("# family atlas");
  parts.push("");
  parts.push("inherited-risk patterns drawn from the family history and genetic entries recorded on this device.");
  parts.push("");
  if (byCondition.size === 0) {
    parts.push("no family history has been recorded yet, so no pattern can be summarised.");
  } else {
    for (const [condition, relatives] of byCondition) {
      const preset = FAMILY_PRESETS.find((p) => p.condition === condition.toLowerCase());
      const earlyOnset = relatives.some((r) => typeof r.ageAtOnset === "number" && r.ageAtOnset < 55);
      const clustered = relatives.length > 1;
      parts.push(`### ${condition}`);
      parts.push("");
      parts.push(`recorded in: ${relatives.map((r) => `${r.relation}${r.ageAtOnset ? ` (age ${r.ageAtOnset})` : ""}`).join(", ")}.`);
      if (clustered) parts.push(`more than one relative is recorded with this condition, which raises the weight of the pattern beyond a single case.`);
      if (earlyOnset) parts.push("at least one relative was affected before age 55 — that usually shifts a person's own screening age earlier.");
      parts.push(preset ? preset.mechanism : "no mechanism is mapped for this condition in the reference set; ask a clinician what shared risk, if any, applies.");
      parts.push("");
    }
  }
  const genes = record.genes.map((g) => {
    const def = g.geneKey ? GENE_DEFS.find((d) => d.key === g.geneKey) : findGene(g.name);
    return def
      ? `${def.label}${g.genotype ? ` (${g.genotype})` : ""} — ${def.penetrance}`
      : `${g.name} — not in the reference set; a genetics service can interpret this properly.`;
  });
  parts.push(section("genetic findings on record", genes));
  parts.push("---");
  parts.push("");
  parts.push("what is missing: this atlas only reflects family members and conditions that were manually entered. absence of a condition here means it was not recorded, not that it does not exist in the family.");
  return parts.join("\n");
}
