// asherin.health — free-form photograph reading.
//
// The guided body capture and the surface scan both answer a question the room
// already asked. This is the other direction: the person hands over whatever
// photographs they have — a posture shot, a rash, a swollen ankle, a page of a
// discharge letter, a wearable screen — writes what they want looked at, and
// the reading comes back as plain findings they can act on, quote, and ask
// about.
//
// Three rules hold the whole file up:
//   1. a finding describes what is visible. it never names a disease as fact,
//      and the type has no field in which a diagnosis could be stored.
//   2. every finding carries where it came from (which photograph) and how
//      confident the reading was. an unattributed finding is dropped.
//   3. the view filters a finding suggests are advisory. they change what the
//      body shows; they never change the record.

import { SYSTEMS, type SystemId } from "./systems";

const SYSTEM_IDS = new Set<string>(SYSTEMS.map((s) => s.id));

/** how loudly a finding asks to be acted on. `clinician` is the only one that escalates. */
export type FindingSeverity = "routine" | "watch" | "clinician";

export type FindingCategory =
  | "posture"
  | "surface"
  | "swelling"
  | "symmetry"
  | "document"
  | "device"
  | "environment"
  | "other";

export const CATEGORY_LABEL: Record<FindingCategory, string> = {
  posture: "how you are standing",
  surface: "skin and surface",
  swelling: "swelling and fluid",
  symmetry: "left against right",
  document: "text in the photo",
  device: "a screen or device reading",
  environment: "what is around you",
  other: "other observations",
};

export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  routine: "nothing urgent",
  watch: "worth watching",
  clinician: "take this to a clinician",
};

export interface PhotoFinding {
  id: string;
  /** short headline, five or six words. */
  title: string;
  /** the same thing said to someone with no training. one or two sentences. */
  plain: string;
  /** the fuller reading, for the person who wants it. */
  detail: string;
  category: FindingCategory;
  severity: FindingSeverity;
  /** 0..1 — how well the camera could actually see this. */
  imageConfidence: number;
  /** 0..1 — how much the observation means anything at all. */
  meaningConfidence: number;
  /** index into the read's photographs. -1 when the model failed to attribute it. */
  photoIndex: number;
  /** anatomy systems worth turning on to look at this. */
  systems: SystemId[];
  /** free-text region words, used to search the atlas. */
  regions: string[];
}

export interface PhotoInRead {
  id: string;
  /** what the person called it, or the file name. */
  label: string;
  width: number;
  height: number;
  /** kept on device only; never uploaded anywhere but the model call the person triggers. */
  dataUrl: string;
}

export interface PhotoRead {
  id: string;
  createdAt: string;
  /** what the person asked to have looked at. empty when they just said "read these". */
  prompt: string;
  photos: PhotoInRead[];
  summary: string;
  findings: PhotoFinding[];
  /** what these photographs could not show. always populated; an empty list is a lie. */
  limits: string[];
  /** questions the reading itself wants answered to get further. */
  questions: string[];
}

function clamp01(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0.4;
  return Math.min(1, Math.max(0, v));
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function severity(v: unknown): FindingSeverity {
  return v === "clinician" || v === "watch" ? v : "routine";
}

function category(v: unknown): FindingCategory {
  return typeof v === "string" && v in CATEGORY_LABEL ? (v as FindingCategory) : "other";
}

/**
 * The model is asked for a shape, not trusted to hold it. Everything that
 * reaches the record has been through here: bounded strings, clamped numbers,
 * known enum members, and system ids that actually exist in the atlas.
 */
export function normaliseRead(
  raw: unknown,
  photos: PhotoInRead[],
  prompt: string,
  now = new Date(),
): PhotoRead {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(r.findings) ? r.findings : [];
  const findings: PhotoFinding[] = list.slice(0, 24).map((f, i) => {
    const o = (f ?? {}) as Record<string, unknown>;
    const idx = Number(o.photoIndex);
    return {
      id: `${now.getTime().toString(36)}-${i}`,
      title: text(o.title, 90) || "an observation",
      plain: text(o.plain, 400) || text(o.detail, 400),
      detail: text(o.detail, 900),
      category: category(o.category),
      severity: severity(o.severity),
      imageConfidence: clamp01(o.imageConfidence),
      meaningConfidence: clamp01(o.meaningConfidence),
      photoIndex: Number.isInteger(idx) && idx >= 0 && idx < photos.length ? idx : -1,
      systems: Array.isArray(o.systems)
        ? Array.from(new Set(o.systems.map((s) => String(s)).filter((s) => SYSTEM_IDS.has(s)))).slice(0, 5) as SystemId[]
        : [],
      regions: Array.isArray(o.regions) ? o.regions.map((s) => text(s, 40)).filter(Boolean).slice(0, 6) : [],
    };
  })
  // a finding with no words in it is noise, not a reading.
  .filter((f) => f.plain.length > 0);

  const limits = Array.isArray(r.limits) ? r.limits.map((l) => text(l, 220)).filter(Boolean).slice(0, 8) : [];

  return {
    id: `read-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now.toISOString(),
    prompt: prompt.slice(0, 2000),
    photos,
    summary: text(r.summary, 900),
    findings,
    limits: limits.length > 0 ? limits : ["a photograph shows a surface at one moment. it cannot show what is under it, how it changes, or what caused it."],
    questions: Array.isArray(r.questions) ? r.questions.map((q) => text(q, 180)).filter(Boolean).slice(0, 6) : [],
  };
}

/** findings grouped for reading, most pressing group first, in a stable order. */
export function groupFindings(findings: PhotoFinding[]): { category: FindingCategory; items: PhotoFinding[] }[] {
  const rank: Record<FindingSeverity, number> = { clinician: 0, watch: 1, routine: 2 };
  const buckets = new Map<FindingCategory, PhotoFinding[]>();
  for (const f of findings) {
    const arr = buckets.get(f.category) ?? [];
    arr.push(f);
    buckets.set(f.category, arr);
  }
  return Array.from(buckets.entries())
    .map(([cat, items]) => ({
      category: cat,
      items: [...items].sort((a, b) => rank[a.severity] - rank[b.severity] || b.meaningConfidence - a.meaningConfidence),
    }))
    .sort((a, b) => rank[a.items[0].severity] - rank[b.items[0].severity]);
}

/** the systems a whole read wants switched on, deduplicated. */
export function suggestedSystems(read: PhotoRead): SystemId[] {
  return Array.from(new Set(read.findings.flatMap((f) => f.systems)));
}

/** true when anything in the read should go in front of a person with training. */
export function needsClinician(read: PhotoRead): boolean {
  return read.findings.some((f) => f.severity === "clinician");
}

/**
 * The exact text the assistant is asked about. It carries the quote and its
 * provenance, so the answer is anchored to a specific line of a specific
 * reading rather than to a vague memory of the conversation.
 */
export function quoteFinding(read: PhotoRead, finding: PhotoFinding, question?: string): string {
  const photo = finding.photoIndex >= 0 ? read.photos[finding.photoIndex]?.label : undefined;
  const where = photo ? ` (from the photograph "${photo}")` : "";
  const asked = question?.trim() || "what does this mean for me, and what should i do about it?";
  return [
    `about this line from the photo read-out of ${new Date(read.createdAt).toLocaleDateString()}${where}:`,
    `"${finding.title} — ${finding.plain}"`,
    "",
    asked,
  ].join("\n");
}

/** a plain-language confidence phrase; a bare 0.42 tells a person nothing. */
export function confidencePhrase(f: PhotoFinding): string {
  const c = Math.min(f.imageConfidence, f.meaningConfidence);
  if (f.imageConfidence < 0.35) return "the camera could barely see this — treat it as a maybe";
  if (c >= 0.7) return "clearly visible and worth taking seriously";
  if (c >= 0.45) return "visible, but a photograph can only say so much";
  return "faint — this could easily be the light or the angle";
}

/**
 * remove one photograph from a stored read-out.
 *
 * the findings that came from that photograph go with it — keeping a line whose
 * evidence has been deleted would leave a claim on the record that nothing on
 * the device can back up any more. every remaining finding's pointer is shifted
 * so it still names the photograph it actually came from.
 */
export function dropPhotoFromRead(read: PhotoRead, index: number): PhotoRead | null {
  if (index < 0 || index >= read.photos.length) return read;
  const photos = read.photos.filter((_, i) => i !== index);
  if (photos.length === 0) return null; // nothing left to have been read
  const findings = read.findings
    .filter((f) => f.photoIndex !== index)
    .map((f) => (f.photoIndex > index ? { ...f, photoIndex: f.photoIndex - 1 } : f));
  return { ...read, photos, findings };
}

/** replace the photograph a stored line was read from, and say the reading is stale. */
export function replacePhotoInRead(read: PhotoRead, index: number, photo: PhotoInRead): PhotoRead {
  if (index < 0 || index >= read.photos.length) return read;
  const photos = read.photos.map((p, i) => (i === index ? { ...photo, id: p.id } : p));
  // the swapped image was never the one the model looked at, so any line that
  // pointed at it loses its evidence rather than silently inheriting a new one.
  const findings = read.findings.filter((f) => f.photoIndex !== index);
  return { ...read, photos, findings };
}
