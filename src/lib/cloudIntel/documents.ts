// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVE ENGINE — document and media intelligence.
//
// A file list is an inventory. Intelligence is: what is this corpus about, what
// is exposed, what is duplicated, what is rotting, and which single file is the
// largest liability. Everything below is derived from Drive metadata the user
// already owns — filename, mime, timestamps, hash, and permission rows.
// ─────────────────────────────────────────────────────────────────────────────

import { median, robustZ, confidenceFrom, fmtBytes, relativeDay, round } from "./logic";

export interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  createdTime?: string | null;
  modifiedTime?: string | null;
  viewedByMeTime?: string | null;
  size?: string | number | null;
  shared?: boolean;
  starred?: boolean;
  trashed?: boolean;
  webViewLink?: string | null;
  md5Checksum?: string | null;
  owner?: string | null;
  lastModifiedBy?: string | null;
  isPublic?: boolean;
  isDomainWide?: boolean;
  sharedWith?: { email: string; role: string }[];
  externalEditors?: number;
}

export type FileClass =
  | "document" | "spreadsheet" | "presentation" | "pdf"
  | "image" | "video" | "audio" | "archive" | "code" | "data" | "other";

const MIME_CLASS: [RegExp, FileClass][] = [
  [/spreadsheet|excel|\.csv$/i, "spreadsheet"],
  [/presentation|powerpoint/i, "presentation"],
  [/pdf/i, "pdf"],
  [/document|msword|text\/plain|rtf/i, "document"],
  [/^image\//i, "image"],
  [/^video\//i, "video"],
  [/^audio\//i, "audio"],
  [/zip|tar|rar|7z|gzip/i, "archive"],
  [/json|xml|sql|script|javascript|x-python/i, "code"],
];

export function classify(mime = "", name = ""): FileClass {
  for (const [re, cls] of MIME_CLASS) if (re.test(mime) || re.test(name)) return cls;
  return "other";
}

// Sensitivity lexicon. Each hit names itself so the score is always auditable —
// a risk number the user cannot trace back to a word is a rumour.
const SENSITIVE: { re: RegExp; label: string; weight: number }[] = [
  { re: /\b(passport|driver'?s?\s?licen[cs]e|ssn|social\s?security|national\s?insurance)\b/i, label: "government identity document", weight: 34 },
  { re: /\b(bank|iban|routing|account\s?number|statement|payroll|tax|w-?2|1099|invoice)\b/i, label: "financial record", weight: 24 },
  { re: /\b(password|credential|api[\s_-]?key|secret|private[\s_-]?key|token|\.env|keystore)\b/i, label: "credential material", weight: 38 },
  { re: /\b(contract|nda|agreement|settlement|legal|litigation|deed|lease)\b/i, label: "legal instrument", weight: 18 },
  { re: /\b(medical|diagnosis|prescription|health|insurance\s?claim|patient)\b/i, label: "health record", weight: 28 },
  { re: /\b(confidential|classified|internal[\s_-]?only|do[\s_-]?not[\s_-]?share|restricted|proprietary)\b/i, label: "explicitly marked confidential", weight: 22 },
  { re: /\b(resume|cv|address\s?book|contacts?\s?export|payslip)\b/i, label: "personal dossier", weight: 14 },
  { re: /\b(backup|dump|export|archive)\b/i, label: "bulk export", weight: 10 },
];

const TOPIC_STOP = new Set([
  "copy", "final", "draft", "new", "untitled", "document", "doc", "docx", "pdf", "xlsx", "pptx",
  "png", "jpg", "jpeg", "mp4", "the", "and", "for", "with", "from", "our", "your", "version",
  "v1", "v2", "v3", "file", "image", "screenshot", "download", "export", "report", "of", "to",
]);

export interface ScoredFile extends DriveFile {
  cls: FileClass;
  sizeBytes: number;
  createdTs: number | null;
  modifiedTs: number | null;
  ageDays: number | null;
  staleDays: number | null;
  /** 0–100 exposure-weighted sensitivity. */
  risk: number;
  riskReasons: string[];
  tokens: string[];
  /** Populated when another file shares its content hash. */
  duplicateOf: string | null;
}

export function scoreFiles(files: DriveFile[]): ScoredFile[] {
  const hashSeen = new Map<string, string>();

  return files
    .filter((f) => !f.trashed)
    .map((f) => {
      const createdTs = f.createdTime ? Date.parse(f.createdTime) : null;
      const modifiedTs = f.modifiedTime ? Date.parse(f.modifiedTime) : null;
      const now = Date.now();
      const name = f.name || "";

      const reasons: string[] = [];
      let sensitivity = 0;
      for (const s of SENSITIVE) {
        if (s.re.test(name)) {
          sensitivity += s.weight;
          reasons.push(`Filename indicates ${s.label}.`);
        }
      }

      // Exposure multiplies sensitivity — a secret nobody can reach is not the
      // same liability as the identical secret on a public link.
      let exposure = 1;
      if (f.isPublic) { exposure = 2.4; reasons.push("Reachable by anyone with the link — no account required."); }
      else if (f.isDomainWide) { exposure = 1.8; reasons.push("Visible to every account in the workspace domain."); }
      else if ((f.sharedWith?.length ?? 0) > 5) { exposure = 1.5; reasons.push(`Shared with ${f.sharedWith!.length} named accounts.`); }
      else if (f.shared) { exposure = 1.25; reasons.push("Shared outside your own account."); }

      if ((f.externalEditors ?? 0) > 1) {
        reasons.push(`${f.externalEditors} accounts hold write access — content can change without your action.`);
        sensitivity += 8;
      }

      let duplicateOf: string | null = null;
      if (f.md5Checksum) {
        const prior = hashSeen.get(f.md5Checksum);
        if (prior && prior !== f.id) duplicateOf = prior;
        else hashSeen.set(f.md5Checksum, f.id);
      }

      const tokens = name
        .toLowerCase()
        .replace(/\.[a-z0-9]{2,5}$/i, "")
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 2 && t.length < 24 && !TOPIC_STOP.has(t) && !/^\d+$/.test(t));

      return {
        ...f,
        cls: classify(f.mimeType, name),
        sizeBytes: Number(f.size) || 0,
        createdTs,
        modifiedTs,
        ageDays: createdTs ? (now - createdTs) / 86400000 : null,
        staleDays: modifiedTs ? (now - modifiedTs) / 86400000 : null,
        risk: Math.min(100, Math.round(sensitivity * exposure)),
        riskReasons: reasons,
        tokens,
        duplicateOf,
      };
    })
    .sort((a, b) => b.risk - a.risk || (b.modifiedTs ?? 0) - (a.modifiedTs ?? 0));
}

export interface TopicCluster {
  label: string;
  files: ScoredFile[];
  totalBytes: number;
  maxRisk: number;
  lastTouched: number | null;
}

/**
 * Topic clustering by shared filename tokens. Deliberately transparent: a
 * cluster's label is a literal token present in every member's name, so the
 * user can verify the grouping by reading it.
 */
export function clusterTopics(files: ScoredFile[], minSize = 2): TopicCluster[] {
  const freq = new Map<string, ScoredFile[]>();
  for (const f of files) {
    for (const t of new Set(f.tokens)) {
      if (!freq.has(t)) freq.set(t, []);
      freq.get(t)!.push(f);
    }
  }

  const claimed = new Set<string>();
  const clusters: TopicCluster[] = [];
  for (const [token, members] of [...freq.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const fresh = members.filter((m) => !claimed.has(m.id));
    if (fresh.length < minSize) continue;
    fresh.forEach((m) => claimed.add(m.id));
    clusters.push({
      label: token,
      files: fresh,
      totalBytes: fresh.reduce((a, f) => a + f.sizeBytes, 0),
      maxRisk: Math.max(...fresh.map((f) => f.risk)),
      lastTouched: Math.max(...fresh.map((f) => f.modifiedTs ?? 0)) || null,
    });
  }

  const orphans = files.filter((f) => !claimed.has(f.id));
  if (orphans.length) {
    clusters.push({
      label: "unclustered",
      files: orphans,
      totalBytes: orphans.reduce((a, f) => a + f.sizeBytes, 0),
      maxRisk: Math.max(0, ...orphans.map((f) => f.risk)),
      lastTouched: Math.max(0, ...orphans.map((f) => f.modifiedTs ?? 0)) || null,
    });
  }
  return clusters.sort((a, b) => b.files.length - a.files.length);
}

export interface ArchiveStats {
  count: number;
  totalBytes: number;
  medianBytes: number;
  publicCount: number;
  sharedCount: number;
  duplicateCount: number;
  duplicateBytes: number;
  staleCount: number;
  highRisk: ScoredFile[];
  outliers: ScoredFile[];
  byClass: { label: string; value: number; bytes: number }[];
  /** Files created per week over the sampled window, oldest → newest. */
  creationSeries: number[];
  confidence: number;
}

export function archiveStats(files: ScoredFile[]): ArchiveStats {
  const sizes = files.map((f) => f.sizeBytes).filter((s) => s > 0);
  const med = sizes.length ? median(sizes) : 0;
  const dupes = files.filter((f) => f.duplicateOf);

  const classMap = new Map<string, { value: number; bytes: number }>();
  for (const f of files) {
    const e = classMap.get(f.cls) || { value: 0, bytes: 0 };
    e.value += 1;
    e.bytes += f.sizeBytes;
    classMap.set(f.cls, e);
  }

  // Weekly creation cadence across the last 12 weeks.
  const weeks = 12;
  const series = new Array(weeks).fill(0);
  const now = Date.now();
  for (const f of files) {
    if (!f.createdTs) continue;
    const w = Math.floor((now - f.createdTs) / (7 * 86400000));
    if (w >= 0 && w < weeks) series[weeks - 1 - w] += 1;
  }

  return {
    count: files.length,
    totalBytes: files.reduce((a, f) => a + f.sizeBytes, 0),
    medianBytes: med,
    publicCount: files.filter((f) => f.isPublic).length,
    sharedCount: files.filter((f) => f.shared).length,
    duplicateCount: dupes.length,
    duplicateBytes: dupes.reduce((a, f) => a + f.sizeBytes, 0),
    staleCount: files.filter((f) => (f.staleDays ?? 0) > 365).length,
    highRisk: files.filter((f) => f.risk >= 25).slice(0, 12),
    outliers: files.filter((f) => sizes.length > 5 && robustZ(f.sizeBytes, sizes) > 3).slice(0, 6),
    byClass: [...classMap.entries()]
      .map(([label, v]) => ({ label, value: v.value, bytes: v.bytes }))
      .sort((a, b) => b.value - a.value),
    creationSeries: series,
    confidence: confidenceFrom(files.length, 1.5, 90),
  };
}

export const describeFile = (f: ScoredFile): string =>
  `${fmtBytes(f.sizeBytes)} · ${f.cls} · touched ${f.modifiedTs ? relativeDay(f.modifiedTs) : "unknown"}${
    f.staleDays != null && f.staleDays > 365 ? ` · dormant ${round(f.staleDays / 365, 1)}y` : ""
  }`;
