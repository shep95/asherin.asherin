// asherin.bugs — a log of what broke and what you want, kept on this device.
//
// the hosted era posted these rows to a server where an admin team read them.
// on a device nobody receives anything: the log is the operator's own, the
// summary is written by the model they connected (shepherd), and the export is
// a file they can send themselves. this module holds the pure parts — shapes,
// filters, the digest shepherd reads, the two export formats — and thin
// readers over the local store.

import { supabase } from "@/integrations/supabase/client";

export type ReportType = "bug" | "feature";
export type Severity = "low" | "medium" | "high" | "critical";
export type Status = "open" | "in_progress" | "resolved" | "dismissed";

export const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];
export const STATUSES: Status[] = ["open", "in_progress", "resolved", "dismissed"];

export const TYPE_LABEL: Record<ReportType, string> = { bug: "bug", feature: "request" };
export const STATUS_LABEL: Record<Status, string> = {
  open: "open",
  in_progress: "in progress",
  resolved: "resolved",
  dismissed: "dismissed",
};

export const TITLE_MAX = 140;
export const DESCRIPTION_MAX = 4000;
/** how many entries the digest hands to shepherd, newest first. */
export const DIGEST_MAX = 60;
/** how much of one description the digest keeps. */
export const DIGEST_DESCRIPTION_MAX = 400;

export interface BugReport {
  id: string;
  user_id: string;
  type: ReportType;
  title: string;
  description: string;
  severity: Severity;
  status: Status;
  created_at: string;
  updated_at: string;
}

export interface BugSummary {
  id: string;
  summary: string;
  report_ids: string[];
  bug_count: number;
  feature_count: number;
  created_at: string;
}

export interface ReportFilter {
  type: ReportType | "all";
  status: Status | "all";
}

const isType = (v: unknown): v is ReportType => v === "bug" || v === "feature";
const isSeverity = (v: unknown): v is Severity => (SEVERITIES as string[]).includes(String(v));
const isStatus = (v: unknown): v is Status => (STATUSES as string[]).includes(String(v));

/**
 * rows written by the hosted-era form carried no `status` (the server default
 * filled it) and the old view crashed on `status.replace`. every row is
 * normalised on read so a missing column reads as its default.
 */
export function normalizeReport(row: Record<string, unknown>): BugReport {
  return {
    id: String(row.id ?? ""),
    user_id: String(row.user_id ?? ""),
    type: isType(row.type) ? row.type : "bug",
    title: typeof row.title === "string" ? row.title : "",
    description: typeof row.description === "string" ? row.description : "",
    severity: isSeverity(row.severity) ? row.severity : "medium",
    status: isStatus(row.status) ? row.status : "open",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : typeof row.created_at === "string" ? row.created_at : "",
  };
}

export function normalizeSummary(row: Record<string, unknown>): BugSummary {
  return {
    id: String(row.id ?? ""),
    summary: typeof row.summary === "string" ? row.summary : "",
    report_ids: Array.isArray(row.report_ids) ? row.report_ids.map(String) : [],
    bug_count: Number(row.bug_count ?? 0) || 0,
    feature_count: Number(row.feature_count ?? 0) || 0,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export function filterReports(reports: BugReport[], f: ReportFilter): BugReport[] {
  return reports.filter((r) => (f.type === "all" || r.type === f.type) && (f.status === "all" || r.status === f.status));
}

export function countByType(reports: BugReport[]): { bugs: number; features: number } {
  let bugs = 0;
  let features = 0;
  for (const r of reports) {
    if (r.type === "bug") bugs += 1;
    else features += 1;
  }
  return { bugs, features };
}

/** one line per entry, newest first, descriptions clipped. this is the only text shepherd sees. */
export function digestFor(reports: BugReport[], max = DIGEST_MAX): string {
  return reports
    .slice(0, max)
    .map((r) => {
      const desc = r.description.length > DIGEST_DESCRIPTION_MAX ? `${r.description.slice(0, DIGEST_DESCRIPTION_MAX)}…` : r.description;
      const sev = r.type === "bug" ? ` · ${r.severity}` : "";
      return `- [${TYPE_LABEL[r.type]}${sev} · ${STATUS_LABEL[r.status]}] ${r.title}${desc ? `: ${desc}` : ""}`;
    })
    .join("\n");
}

export function summaryPrompt(digest: string): string {
  return [
    "summarize this log of bugs and requests for the person who wrote it. they are the only reader.",
    "group by theme. name the most severe open bug first, then the other bugs, then the requests.",
    "say which entries are resolved or dismissed in one line at the end. plain lowercase prose, under 200 words. no headings, no preamble.",
    "",
    digest,
  ].join("\n");
}

const stamp = (iso: string): string => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "time unknown" : t.toISOString().slice(0, 16).replace("T", " ");
};

export interface ExportMeta {
  deviceId: string;
  exportedAt: Date;
}

/** a readable file the operator can paste into an issue, an email or a chat. */
export function toMarkdown(reports: BugReport[], summaries: BugSummary[], meta: ExportMeta): string {
  const { bugs, features } = countByType(reports);
  const lines: string[] = [
    "# asherin.bugs — export",
    "",
    `exported ${stamp(meta.exportedAt.toISOString())} utc from device ${meta.deviceId.slice(0, 8)}. ${reports.length} entries: ${bugs} bugs, ${features} requests.`,
    "",
  ];
  if (reports.length === 0) lines.push("_no entries._", "");
  for (const r of reports) {
    const sev = r.type === "bug" ? ` · ${r.severity}` : "";
    lines.push(`## ${r.title || "(untitled)"}`, "", `${TYPE_LABEL[r.type]}${sev} · ${STATUS_LABEL[r.status]} · logged ${stamp(r.created_at)} utc`, "");
    if (r.description) lines.push(r.description, "");
  }
  if (summaries.length > 0) {
    lines.push("---", "", "## shepherd summaries", "");
    for (const s of summaries) {
      lines.push(`### ${stamp(s.created_at)} utc — ${s.bug_count} bugs, ${s.feature_count} requests`, "", s.summary, "");
    }
  }
  return lines.join("\n");
}

export function toExportBundle(reports: BugReport[], summaries: BugSummary[], meta: ExportMeta) {
  return {
    format: "asherin-bugs-export",
    version: 1,
    exported_at: meta.exportedAt.toISOString(),
    device: meta.deviceId,
    reports,
    summaries,
  };
}

export function exportFilename(kind: "json" | "md", at: Date): string {
  const d = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  return `asherin-bugs-${d}.${kind}`;
}

/** hand the browser a file. a blob url, revoked after the click; nothing leaves the device. */
export function downloadText(name: string, text: string, mime: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── the local store ─────────────────────────────────────────────────────── */

const fail = (e: { message: string } | null): never => {
  throw new Error(e?.message ?? "the local store did not answer");
};

export async function readReports(userId: string): Promise<BugReport[]> {
  const { data, error } = await supabase.from("bug_reports").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeReport);
}

export async function readSummaries(userId: string): Promise<BugSummary[]> {
  const { data, error } = await supabase.from("bug_report_summaries").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeSummary);
}

export interface NewReport {
  type: ReportType;
  title: string;
  description: string;
  severity: Severity;
}

export async function addReport(userId: string, draft: NewReport): Promise<BugReport> {
  const title = draft.title.trim().slice(0, TITLE_MAX);
  const description = draft.description.trim().slice(0, DESCRIPTION_MAX);
  if (!title) throw new Error("a title is needed.");
  if (!description) throw new Error("a description is needed.");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("bug_reports")
    .insert({
      user_id: userId,
      type: draft.type,
      title,
      description,
      severity: draft.type === "bug" ? draft.severity : "low",
      status: "open",
      created_at: now,
      updated_at: now,
    } as never)
    .select()
    .single();
  if (error) fail(error);
  return normalizeReport((data ?? {}) as Record<string, unknown>);
}

export async function setReportStatus(id: string, status: Status): Promise<void> {
  const { error } = await supabase.from("bug_reports").update({ status, updated_at: new Date().toISOString() } as never).eq("id", id);
  if (error) fail(error);
}

export async function removeReport(id: string): Promise<void> {
  const { error } = await supabase.from("bug_reports").delete().eq("id", id);
  if (error) fail(error);
}

export async function addSummary(userId: string, summary: string, reports: BugReport[]): Promise<BugSummary> {
  const { bugs, features } = countByType(reports);
  const { data, error } = await supabase
    .from("bug_report_summaries")
    .insert({
      user_id: userId,
      summary,
      report_ids: reports.map((r) => r.id),
      bug_count: bugs,
      feature_count: features,
    } as never)
    .select()
    .single();
  if (error) fail(error);
  return normalizeSummary((data ?? {}) as Record<string, unknown>);
}
