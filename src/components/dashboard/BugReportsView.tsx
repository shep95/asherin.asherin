// asherin.bugs — what broke and what you want, logged on this device.
//
// the hosted era promised "submit reports privately — only the admin team can
// see them". on a device there is no team and nothing is sent: the log is the
// operator's own, shepherd (the model they connected) can summarise it from
// this browser, and an export (json or markdown) is the way it reaches anyone.
// nothing here estimates, pretends to deliver, or waits on a server.

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Bug, Lightbulb, Plus, Loader2, Sparkles, ChevronDown, Trash2, FileJson, FileText, Check, Clock, Ban, Circle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";
import { onTableChange } from "@/lib/local/db";
import {
  addReport, addSummary, countByType, digestFor, downloadText, exportFilename, filterReports, readReports, readSummaries,
  removeReport, setReportStatus, summaryPrompt, toExportBundle, toMarkdown,
  DESCRIPTION_MAX, SEVERITIES, STATUSES, STATUS_LABEL, TITLE_MAX, TYPE_LABEL,
  type BugReport, type BugSummary, type ReportFilter, type ReportType, type Severity, type Status,
} from "@/lib/bugs/bugLog";

const SEVERITY_CLASS: Record<Severity, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  low: "text-muted-foreground bg-muted/30 border-border/20",
};

const STATUS_ICON: Record<Status, React.ElementType> = {
  open: Circle,
  in_progress: Clock,
  resolved: Check,
  dismissed: Ban,
};

const when = (iso: string): string => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "time unknown" : format(t, "d MMM yyyy HH:mm");
};

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const fieldClass =
  "w-full rounded-xl border border-border/20 bg-card/30 px-4 py-3 text-xs font-light text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/30";
const selectClass =
  "rounded-lg border border-border/20 bg-card/30 px-2 py-1 text-[10px] font-light text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
const quietButton =
  "inline-flex items-center gap-1.5 rounded-xl border border-border/20 px-3 py-1.5 text-xs font-light text-muted-foreground transition-colors hover:text-foreground hover:bg-foreground/5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const BugReportsView = () => {
  const v2 = useIsV2();
  const { user } = useAuth();

  const [reports, setReports] = useState<BugReport[]>([]);
  const [summaries, setSummaries] = useState<BugSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // compose
  const [composing, setComposing] = useState(false);
  const [type, setType] = useState<ReportType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // list
  const [filter, setFilter] = useState<ReportFilter>({ type: "all", status: "all" });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // summary
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [expandedSummary, setExpandedSummary] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const [r, s] = await Promise.all([readReports(user.id), readSummaries(user.id)]);
      setReports(r);
      setSummaries(s);
      setLoadError(null);
    } catch (e) {
      setLoadError(message(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
    const offReports = onTableChange("bug_reports", () => { void load(); });
    const offSummaries = onTableChange("bug_report_summaries", () => { void load(); });
    return () => {
      offReports();
      offSummaries();
    };
  }, [load]);

  const shown = useMemo(() => filterReports(reports, filter), [reports, filter]);
  const counts = useMemo(() => countByType(reports), [reports]);
  const canSave = title.trim().length > 0 && description.trim().length > 0 && !saving;

  const save = async () => {
    if (!user || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await addReport(user.id, { type, title, description, severity });
      setTitle("");
      setDescription("");
      setSeverity("medium");
      setComposing(false);
    } catch (e) {
      setSaveError(message(e));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (id: string, status: Status) => {
    setRowError(null);
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await setReportStatus(id, status);
    } catch (e) {
      setRowError(message(e));
      void load();
    }
  };

  const remove = async (id: string) => {
    setRowError(null);
    setConfirmRemove(null);
    try {
      await removeReport(id);
    } catch (e) {
      setRowError(message(e));
    }
  };

  const summarize = async () => {
    if (!user || reports.length === 0) return;
    setSummarizing(true);
    setSummaryError(null);
    try {
      // the model the operator connected answers from this browser; only the digest leaves.
      const { askModel } = await import("@/lib/ai");
      const text = (await askModel(summaryPrompt(digestFor(reports)), { maxTokens: 600 })).trim();
      if (!text) throw new Error("shepherd returned an empty answer.");
      const s = await addSummary(user.id, text, reports);
      setExpandedSummary(s.id);
    } catch (e) {
      setSummaryError(message(e));
    } finally {
      setSummarizing(false);
    }
  };

  const exportAs = (kind: "json" | "md") => {
    if (!user) return;
    const meta = { deviceId: user.id, exportedAt: new Date() };
    const name = exportFilename(kind, meta.exportedAt);
    if (kind === "json") downloadText(name, JSON.stringify(toExportBundle(reports, summaries, meta), null, 2), "application/json");
    else downloadText(name, toMarkdown(reports, summaries, meta), "text/markdown");
  };

  const exportButtons = (
    <>
      <button type="button" onClick={() => exportAs("md")} disabled={loading || reports.length === 0} className={v2 ? v2ActionClass : quietButton} aria-label="export the log as markdown">
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        export .md
      </button>
      <button type="button" onClick={() => exportAs("json")} disabled={loading || reports.length === 0} className={v2 ? v2ActionClass : quietButton} aria-label="export the log as json">
        <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
        export .json
      </button>
    </>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        {v2 ? (
          <V2Action>{exportButtons}</V2Action>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-extralight tracking-wide text-foreground">asherin.bugs</h1>
              <p className="mt-1 text-sm font-extralight text-muted-foreground">
                what broke and what you want, logged on this device. nobody receives it unless you send the export.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">{exportButtons}</div>
          </div>
        )}

        {loading && (
          <div className="space-y-3" aria-busy="true" aria-label="reading the log">
            {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl border border-border/15 bg-card/5 animate-pulse" />)}
          </div>
        )}

        {!loading && loadError && (
          <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 space-y-2">
            <p className="text-xs font-light text-foreground">the log did not load.</p>
            <p className="text-[10px] text-muted-foreground/50">{loadError}</p>
            <button type="button" onClick={() => { setLoading(true); void load(); }} className="text-[10px] px-2.5 py-1 rounded-lg border border-border/30 hover:border-border/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              try again
            </button>
          </div>
        )}

        {!loading && !loadError && (
          <>
            {/* compose */}
            <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setComposing((c) => !c)}
                aria-expanded={composing}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
              >
                <span className="flex items-center gap-2 text-xs font-light text-foreground">
                  <Plus className={`h-3.5 w-3.5 transition-transform ${composing ? "rotate-45" : ""}`} aria-hidden="true" />
                  new entry
                </span>
                <span className="text-[10px] text-muted-foreground/60">{reports.length === 0 ? "the log is empty" : `${counts.bugs} ${counts.bugs === 1 ? "bug" : "bugs"} · ${counts.features} ${counts.features === 1 ? "request" : "requests"}`}</span>
              </button>

              {composing && (
                <div className="space-y-4 border-t border-border/10 px-4 pb-4 pt-4">
                  <div className="flex gap-2" role="radiogroup" aria-label="kind of entry">
                    {(["bug", "feature"] as ReportType[]).map((t) => {
                      const Icon = t === "bug" ? Bug : Lightbulb;
                      const on = type === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setType(t)}
                          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-light transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            on ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/20 bg-card/20 text-muted-foreground hover:bg-foreground/5"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {TYPE_LABEL[t]}
                        </button>
                      );
                    })}
                  </div>

                  <label className="block space-y-1">
                    <span className="text-[10px] tracking-wider text-muted-foreground">title</span>
                    <input
                      value={title}
                      maxLength={TITLE_MAX}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={type === "bug" ? "e.g. chat loses the draft on refresh" : "e.g. export a conversation as pdf"}
                      className={fieldClass}
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[10px] tracking-wider text-muted-foreground">description</span>
                    <textarea
                      value={description}
                      maxLength={DESCRIPTION_MAX}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      placeholder={type === "bug" ? "steps to reproduce, what you expected, what happened, browser and device" : "what it would do, why it matters, an example"}
                      className={`${fieldClass} resize-none`}
                    />
                  </label>

                  {type === "bug" && (
                    <div className="space-y-1">
                      <span className="text-[10px] tracking-wider text-muted-foreground">severity</span>
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="severity">
                        {SEVERITIES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            role="radio"
                            aria-checked={severity === s}
                            onClick={() => setSeverity(s)}
                            className={`rounded-lg border px-3 py-1.5 text-[10px] font-light transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              severity === s ? SEVERITY_CLASS[s] : "border-border/20 bg-card/20 text-muted-foreground hover:bg-foreground/5"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {saveError && (
                    <p role="alert" className="text-[10px] text-destructive">the entry was not saved: {saveError}</p>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] text-muted-foreground/50">kept in this browser's store. nothing is sent.</p>
                    <button
                      type="button"
                      onClick={() => void save()}
                      disabled={!canSave}
                      className="inline-flex items-center gap-2 rounded-xl border border-foreground/20 bg-foreground/10 px-4 py-2.5 text-xs font-light text-foreground transition-colors hover:bg-foreground/15 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                      add to the log
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* the log */}
            <div className="rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-sm space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-light tracking-wider text-muted-foreground">the log</span>
                <div className="ml-auto flex items-center gap-2">
                  <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value as ReportFilter["type"] })} className={selectClass} aria-label="filter by kind">
                    <option value="all">bugs and requests</option>
                    <option value="bug">bugs</option>
                    <option value="feature">requests</option>
                  </select>
                  <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as ReportFilter["status"] })} className={selectClass} aria-label="filter by status">
                    <option value="all">any status</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </div>
              </div>

              {rowError && (
                <p role="alert" className="text-[10px] text-destructive">that change did not save: {rowError}</p>
              )}

              {shown.length === 0 ? (
                <p className="py-6 text-center text-xs font-extralight text-muted-foreground">
                  {reports.length === 0 ? "nothing logged yet. the first entry you add appears here." : "no entry matches that filter."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {shown.map((r) => {
                    const StatusIcon = STATUS_ICON[r.status];
                    return (
                      <li key={r.id} className="space-y-2 rounded-xl border border-border/10 bg-background/20 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {r.type === "bug" ? <Bug className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : <Lightbulb className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                          <span className="min-w-0 flex-1 break-words text-sm font-light text-foreground">{r.title || "(untitled)"}</span>
                          {r.type === "bug" && (
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] ${SEVERITY_CLASS[r.severity]}`}>{r.severity}</span>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground/70">{r.description}</p>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/50">
                          <StatusIcon className="h-3 w-3" aria-hidden="true" />
                          <select value={r.status} onChange={(e) => void changeStatus(r.id, e.target.value as Status)} className={selectClass} aria-label={`status of ${r.title}`}>
                            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                          </select>
                          <span className="tabular-nums">logged {when(r.created_at)}</span>
                          <span className="ml-auto flex items-center gap-2">
                            {confirmRemove === r.id ? (
                              <>
                                <span>remove this entry?</span>
                                <button type="button" onClick={() => void remove(r.id)} className="rounded-lg border border-destructive/30 px-2 py-0.5 text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">remove</button>
                                <button type="button" onClick={() => setConfirmRemove(null)} className="rounded-lg border border-border/30 px-2 py-0.5 transition-colors hover:border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">keep</button>
                              </>
                            ) : (
                              <button type="button" onClick={() => setConfirmRemove(r.id)} className="rounded-lg p-1 transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`remove ${r.title}`}>
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* shepherd summaries */}
            <div className="rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-light tracking-wider text-muted-foreground">shepherd's summary</span>
                  <p className="text-[10px] text-muted-foreground/50">written by the model you connected, from this browser. only the titles and clipped descriptions are sent to it.</p>
                </div>
                <button type="button" onClick={() => void summarize()} disabled={summarizing || reports.length === 0} className={quietButton}>
                  {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                  {summarizing ? "asking shepherd" : "summarize the log"}
                </button>
              </div>

              {summaryError && (
                <p role="alert" className="text-[10px] text-destructive">shepherd did not answer: {summaryError}</p>
              )}

              {summaries.length === 0 ? (
                <p className="py-4 text-center text-xs font-extralight text-muted-foreground">
                  {reports.length === 0 ? "add an entry first; a summary needs something to read." : "no summary yet."}
                </p>
              ) : (
                <ul className="space-y-2">
                  {summaries.map((s) => {
                    const open = expandedSummary === s.id;
                    return (
                      <li key={s.id} className="overflow-hidden rounded-xl border border-border/10 bg-background/20">
                        <button
                          type="button"
                          onClick={() => setExpandedSummary(open ? null : s.id)}
                          aria-expanded={open}
                          className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="min-w-0">
                            <span className="block text-xs font-light text-foreground tabular-nums">{when(s.created_at)}</span>
                            <span className="block text-[10px] text-muted-foreground/60">{s.bug_count} {s.bug_count === 1 ? "bug" : "bugs"} · {s.feature_count} {s.feature_count === 1 ? "request" : "requests"} · {s.report_ids.length} entries read</span>
                          </span>
                          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                        </button>
                        {open && (
                          <p className="whitespace-pre-wrap border-t border-border/10 px-3 pb-3 pt-3 text-xs leading-relaxed text-muted-foreground/80">{s.summary}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BugReportsView;
