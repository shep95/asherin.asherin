// asherin.data — the data intelligence room.
//
// narrative → flaws → build
// the promise: bring data, ask in plain english, get an answer with evidence, a
// visual, and what to watch next. the flaw in the naive build is that the model
// becomes the whole product: it guesses schema, invents totals, and draws a
// chart because a chart looks finished. so the room is ordered against that —
// the file is parsed and profiled on the device first, quality is shown before
// a question can be asked, arithmetic is computed deterministically on the
// server, and the model only narrates material it was handed. a source that
// cannot be reached says so; a chart with nothing behind it is not drawn.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BarChart3, Bell, Database, FileText, Loader2, Plug, RefreshCw,
  Send, Settings2, Sparkles, Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { parseDataFile, ACCEPTED_EXTENSIONS } from "@/lib/data/parse";
import { buildDatasetProfile, buildQualityReport, profileColumns, DOMAIN_PATTERNS } from "@/lib/data/validate";
import { applyCleanOp, type CleanOp } from "@/lib/data/clean";
import { suggestJoinKeys } from "@/lib/data/join";
import { buildChart } from "@/lib/data/charts";
import { DATA_THEMES, getTheme, themeStyle, checkThemeContrast } from "@/lib/data/theme";
import type { AnswerBlocks, ChartSpec, DataRow, DataSourceRow, DataVersionRow, DatasetProfile, DictionaryRow, QualityReport } from "@/lib/data/types";
import * as api from "@/lib/data/api";
import ChartRender from "./ChartRender";

type Tab = "data" | "ask" | "visuals" | "alerts" | "reports" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Database }[] = [
  { id: "data", label: "data", icon: Database },
  { id: "ask", label: "ask", icon: Sparkles },
  { id: "visuals", label: "visuals", icon: BarChart3 },
  { id: "alerts", label: "alerts", icon: Bell },
  { id: "reports", label: "reports", icon: FileText },
  { id: "settings", label: "settings", icon: Settings2 },
];

const card = "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm";
const chip = "rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70 transition hover:border-white/25 hover:bg-white/[0.07]";
const field = "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/30 focus:border-white/25";

interface StagedFile {
  fileName: string;
  byteSize: number;
  mime: string;
  columns: string[];
  rows: DataRow[];
  text: string;
  warnings: string[];
  quality: QualityReport;
  profile: DatasetProfile;
  history: string[];
}

function scoreTone(score: number): string {
  if (score >= 85) return "text-emerald-300/80";
  if (score >= 65) return "text-amber-300/80";
  return "text-rose-300/80";
}

export default function AsherinDataView() {
  const [tab, setTab] = useState<Tab>("data");
  const [workspaces, setWorkspaces] = useState<api.Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [sources, setSources] = useState<DataSourceRow[]>([]);
  const [versions, setVersions] = useState<Record<string, DataVersionRow[]>>({});
  const [dictionary, setDictionary] = useState<DictionaryRow[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [staged, setStaged] = useState<StagedFile | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<(AnswerBlocks & { sampling?: string }) | null>(null);
  const [answerChart, setAnswerChart] = useState<ChartSpec | null>(null);
  const [history, setHistory] = useState<{ id: string; question: string; confidence: string; created_at: string }[]>([]);

  const [alertRules, setAlertRules] = useState<{ id: string; name: string; kind: string; spec: Record<string, unknown>; active: boolean; source_id: string }[]>([]);
  const [alertEvents, setAlertEvents] = useState<{ id: string; message: string; metric: string; value: number; created_at: string }[]>([]);
  const [reports, setReports] = useState<{ id: string; name: string; template: string; schedule: string; content: { markdown?: string }; last_generated_at: string | null }[]>([]);
  const [openReport, setOpenReport] = useState<string | null>(null);

  const [instructions, setInstructions] = useState("");
  const [themeId, setThemeId] = useState("asherin");
  const [connectors, setConnectors] = useState<api.ConnectorInfo[]>([]);
  const [connectorId, setConnectorId] = useState("google-sheets");
  const [connectorConfig, setConnectorConfig] = useState("{\n  \"published_csv_url\": \"\"\n}");
  const [connectorSecret, setConnectorSecret] = useState("");

  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const activeWorkspace = useMemo(() => workspaces.find((w) => w.id === workspaceId) ?? null, [workspaces, workspaceId]);

  /* ---------------------------------------------------------------- loading */

  const refreshSources = useCallback(async (wsId: string) => {
    const rows = await api.listSources(wsId);
    setSources(rows);
    const map: Record<string, DataVersionRow[]> = {};
    for (const s of rows.slice(0, 25)) {
      try { map[s.id] = await api.listVersions(s.id); } catch { map[s.id] = []; }
    }
    setVersions(map);
    setSelectedSource((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? ""));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let ws = await api.listWorkspaces();
        if (!ws.length) ws = [await api.createWorkspace("my workspace")];
        if (cancelled) return;
        setWorkspaces(ws);
        setWorkspaceId(ws[0].id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "could not open your workspace");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        await refreshSources(workspaceId);
        if (cancelled) return;
        const ws = workspaces.find((w) => w.id === workspaceId);
        setInstructions(ws?.instructions ?? "");
        setThemeId((ws?.theme as { id?: string } | null)?.id ?? "asherin");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "could not load your sources");
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, refreshSources, workspaces]);

  useEffect(() => {
    if (!selectedSource) { setDictionary([]); return; }
    api.listDictionary(selectedSource).then(setDictionary).catch(() => setDictionary([]));
  }, [selectedSource]);

  const loadAsync = useCallback(async () => {
    if (!workspaceId) return;
    const { supabase } = await import("@/integrations/supabase/client");
    const [q, rules, events, reps] = await Promise.all([
      supabase.from("data_queries").select("id, question, confidence, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(15),
      supabase.from("data_alert_rules").select("id, name, kind, spec, active, source_id").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(50),
      supabase.from("data_alert_events").select("id, message, metric, value, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(25),
      supabase.from("data_reports").select("id, name, template, schedule, content, last_generated_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(20),
    ]);
    setHistory((q.data ?? []) as typeof history);
    setAlertRules((rules.data ?? []) as typeof alertRules);
    setAlertEvents((events.data ?? []) as typeof alertEvents);
    setReports((reps.data ?? []) as typeof reports);
  }, [workspaceId]);

  useEffect(() => { void loadAsync(); }, [loadAsync]);

  useEffect(() => {
    api.pullConnector; // keep the import graph explicit
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.functions.invoke("asherin-data-sync", { method: "GET" });
        if (data?.connectors) setConnectors(data.connectors as api.ConnectorInfo[]);
      } catch { /* the list is decoration; the sync call itself reports the truth */ }
    })();
  }, []);

  /* ------------------------------------------------------------- ingestion */

  const handleFile = useCallback(async (file: File) => {
    setBusy("parsing");
    setOcrProgress(null);
    try {
      const parsed = await parseDataFile(file, (pct) => setOcrProgress(pct));
      const profile = buildDatasetProfile(parsed.columns, parsed.rows, parsed.text);
      const quality = buildQualityReport(parsed.columns, parsed.rows, profile.columns);
      setStaged({
        fileName: file.name,
        byteSize: file.size,
        mime: file.type || "application/octet-stream",
        columns: parsed.columns,
        rows: parsed.rows,
        text: parsed.text,
        warnings: parsed.warnings,
        quality,
        profile,
        history: [],
      });
      toast.success(`${file.name} read: ${parsed.rows.length.toLocaleString()} row(s), quality ${quality.score}/100`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "that file could not be read");
    } finally {
      setBusy(null);
      setOcrProgress(null);
    }
  }, []);

  const runClean = useCallback((op: CleanOp) => {
    setStaged((prev) => {
      if (!prev) return prev;
      const res = applyCleanOp(prev.columns, prev.rows, op, prev.profile.columns);
      const profile = buildDatasetProfile(res.columns, res.rows, prev.text);
      const quality = buildQualityReport(res.columns, res.rows, profile.columns);
      toast.success(res.note);
      return { ...prev, columns: res.columns, rows: res.rows, profile, quality, history: [...prev.history, res.note] };
    });
  }, []);

  const commitStaged = useCallback(async (asNewVersionOf?: string) => {
    if (!staged || !workspaceId) return;
    setBusy("ingesting");
    try {
      let storagePath: string | null = null;
      const original = fileInput.current?.files?.[0];
      if (original && original.size <= 100 * 1024 * 1024) {
        storagePath = await api.uploadOriginal(workspaceId, original);
      }
      const res = await api.ingest({
        workspace_id: workspaceId,
        source_id: asNewVersionOf,
        source_name: staged.fileName,
        kind: staged.rows.length ? "table" : "document",
        file_name: staged.fileName,
        mime: staged.mime,
        byte_size: staged.byteSize,
        storage_path: storagePath,
        columns: staged.columns,
        rows: staged.rows,
        text: staged.text,
        quality: staged.quality,
        profile: staged.profile,
        note: staged.history.join("; ").slice(0, 500) || undefined,
      });
      toast.success(`version ${res.version} stored — ${res.rows_stored.toLocaleString()} row(s), retrieval ${res.retrieval}`);
      if (res.retrieval === "unavailable" && res.retrieval_note) {
        toast.message("passage retrieval is unavailable for this version", { description: res.retrieval_note.slice(0, 160) });
      }
      setStaged(null);
      if (fileInput.current) fileInput.current.value = "";
      await refreshSources(workspaceId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "the upload did not complete");
    } finally {
      setBusy(null);
    }
  }, [staged, workspaceId, refreshSources]);

  /* -------------------------------------------------------------- questions */

  const askQuestion = useCallback(async () => {
    if (!workspaceId || question.trim().length < 3) return;
    setBusy("asking");
    setAnswer(null);
    setAnswerChart(null);
    try {
      const res = await api.ask(workspaceId, question.trim(), selectedSource ? [selectedSource] : undefined);
      setAnswer(res);
      // the chart is drawn from real rows on this device; the model only chose the shape
      const req = res.chart as unknown as { intent: ChartSpec["intent"]; x?: string; y?: string[]; title: string; insight: string } | null;
      if (req && selectedSource) {
        const vers = versions[selectedSource] ?? [];
        const latest = vers[0];
        if (latest) {
          const rows = await api.loadVersionRows(latest.id, 5000);
          const profile = (latest.profile ?? {}) as DatasetProfile;
          const spec = buildChart(
            { ...req, sourceTag: `${sources.find((s) => s.id === selectedSource)?.name ?? "source"} · v${latest.version}` },
            rows,
            profile.columns ? profile : buildDatasetProfile(Object.keys(rows[0] ?? {}), rows),
          );
          if (spec) setAnswerChart({ ...spec, confidence: res.confidence, quality: (latest.quality as QualityReport)?.score });
        }
      }
      await loadAsync();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "the question could not be answered");
    } finally {
      setBusy(null);
    }
  }, [workspaceId, question, selectedSource, versions, sources, loadAsync]);

  /* ---------------------------------------------------------------- render */

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-white/50">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> opening your workspace
      </div>
    );
  }

  const sourceVersions = versions[selectedSource] ?? [];
  const latest = sourceVersions[0];
  const latestProfile = (latest?.profile ?? {}) as DatasetProfile;
  const latestQuality = (latest?.quality ?? {}) as QualityReport;

  return (
    <div className="flex h-full flex-col text-white/85" style={themeStyle(theme)}>
      {/* header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-white/8 px-4 py-3 sm:px-6">
        <div className="mr-auto">
          <h1 className="text-sm font-extralight text-white/70">asherin.data</h1>
          <p className="text-[11px] text-white/40">bring data, ask in plain english, get evidence back</p>
        </div>
        <select
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          className="rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white/80 outline-none"
          aria-label="workspace"
        >
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button
          type="button"
          className={chip}
          onClick={async () => {
            const name = prompt("name this workspace")?.trim();
            if (!name) return;
            try {
              const ws = await api.createWorkspace(name);
              setWorkspaces((p) => [...p, ws]);
              setWorkspaceId(ws.id);
            } catch (e) { toast.error(e instanceof Error ? e.message : "could not create it"); }
          }}
        >
          new workspace
        </button>
      </header>

      {/* tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-white/8 px-3 py-2 sm:px-5" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition ${
              tab === id ? "border border-white/18 bg-white/[0.07] text-white/90" : "border border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {/* ------------------------------------------------------------ data */}
        {tab === "data" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              {/* upload */}
              <section
                className={`${card} p-5`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f); }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Upload className="h-4 w-4 text-white/50" />
                  <div className="mr-auto">
                    <div className="text-sm text-white/85">drop a file, or choose one</div>
                    <div className="text-[11px] text-white/40">{ACCEPTED_EXTENSIONS.join("  ")} · up to 100 mb</div>
                  </div>
                  <button type="button" className={chip} onClick={() => fileInput.current?.click()} disabled={busy !== null}>
                    {busy === "parsing" ? "reading…" : "browse"}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    className="hidden"
                    accept={ACCEPTED_EXTENSIONS.join(",")}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
                  />
                </div>
                {ocrProgress !== null && (
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full bg-white/50 transition-[width]" style={{ width: `${ocrProgress}%` }} />
                  </div>
                )}
              </section>

              {/* staged review */}
              {staged && (
                <section className={`${card} p-5`}>
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h2 className="text-sm text-white/85">{staged.fileName}</h2>
                    <span className={`text-xs ${scoreTone(staged.quality.score)}`}>quality {staged.quality.score}/100</span>
                    <span className="text-[11px] text-white/40">
                      {staged.quality.rowCount.toLocaleString()} rows · {staged.quality.columnCount} columns ·
                      {" "}{staged.quality.completeness}% filled in · {staged.quality.duplicateCount} duplicate(s)
                    </span>
                  </div>

                  {(staged.warnings.length > 0 || staged.quality.issues.length > 0) && (
                    <ul className="mt-3 space-y-1 text-[11px]">
                      {staged.warnings.map((w, i) => (
                        <li key={`w${i}`} className="flex gap-2 text-amber-200/70"><AlertTriangle className="mt-px h-3 w-3 shrink-0" />{w}</li>
                      ))}
                      {staged.quality.issues.slice(0, 8).map((iss, i) => (
                        <li key={`i${i}`} className={iss.severity === "high" ? "text-rose-200/70" : iss.severity === "medium" ? "text-amber-200/70" : "text-white/45"}>
                          · {iss.message}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* cleaning */}
                  {staged.rows.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className={chip} onClick={() => runClean({ kind: "drop-duplicates" })}>remove duplicates</button>
                      <button type="button" className={chip} onClick={() => runClean({ kind: "drop-empty-rows" })}>remove empty rows</button>
                      {staged.profile.measures.slice(0, 4).map((m) => (
                        <button key={m} type="button" className={chip} onClick={() => runClean({ kind: "fill-missing", column: m, strategy: "median" })}>
                          fill {m} with the median
                        </button>
                      ))}
                      {staged.profile.columns.filter((c) => c.outlierRows.length > 0).slice(0, 3).map((c) => (
                        <button key={c.name} type="button" className={chip} onClick={() => runClean({ kind: "remove-outliers", column: c.name })}>
                          drop {c.outlierRows.length} out-of-range {c.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* preview */}
                  {staged.rows.length > 0 ? (
                    <div className="mt-4 max-h-56 overflow-auto rounded-xl border border-white/10">
                      <table className="w-full text-left text-[11px]">
                        <thead className="sticky top-0 bg-white/[0.06] backdrop-blur">
                          <tr>{staged.columns.slice(0, 14).map((c) => (
                            <th key={c} className="whitespace-nowrap px-3 py-2 font-normal text-white/60">
                              {c}<span className="ml-1 text-white/25">{staged.profile.columns.find((p) => p.name === c)?.type}</span>
                            </th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {staged.rows.slice(0, 40).map((r, i) => (
                            <tr key={i} className="border-t border-white/5">
                              {staged.columns.slice(0, 14).map((c) => (
                                <td key={c} className="max-w-[220px] truncate px-3 py-1.5 text-white/75">{String(r[c] ?? "")}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 p-3 text-[11px] text-white/60">
                      {staged.text.slice(0, 4000) || "no text was extracted"}
                    </pre>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" className={chip} disabled={busy !== null} onClick={() => void commitStaged()}>
                      {busy === "ingesting" ? "storing…" : "add as a new source"}
                    </button>
                    {sources.length > 0 && (
                      <select
                        className="rounded-full border border-white/12 bg-black/40 px-3 py-1 text-[11px] text-white/70"
                        defaultValue=""
                        onChange={(e) => { if (e.target.value) void commitStaged(e.target.value); }}
                      >
                        <option value="">…or add as a new version of</option>
                        {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                    <button type="button" className={chip} onClick={() => { setStaged(null); if (fileInput.current) fileInput.current.value = ""; }}>discard</button>
                  </div>
                </section>
              )}

              {/* sources */}
              <section className={`${card} p-5`}>
                <h2 className="mb-3 text-sm text-white/85">your data</h2>
                {sources.length === 0 && <p className="text-xs text-white/45">nothing here yet. upload a file or connect a live source.</p>}
                <div className="space-y-2">
                  {sources.map((s) => {
                    const v = (versions[s.id] ?? [])[0];
                    const q = (v?.quality ?? {}) as QualityReport;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSource(s.id)}
                        className={`flex w-full flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                          selectedSource === s.id ? "border-white/25 bg-white/[0.06]" : "border-white/8 bg-white/[0.02] hover:border-white/15"
                        }`}
                      >
                        <div className="mr-auto min-w-0">
                          <div className="truncate text-sm text-white/85">{s.name}</div>
                          <div className="text-[11px] text-white/40">
                            {s.connector ? `${s.connector} · ` : ""}{v ? `v${v.version} · ${v.row_count.toLocaleString()} rows · ${v.column_count} columns` : "no version loaded"}
                            {s.last_sync_error ? ` · last sync failed: ${s.last_sync_error}` : ""}
                          </div>
                        </div>
                        {typeof q.score === "number" && <span className={`text-xs ${scoreTone(q.score)}`}>{q.score}/100</span>}
                        <span
                          role="button"
                          tabIndex={0}
                          className="rounded-lg border border-white/10 p-1.5 text-white/40 hover:text-rose-300/80"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!confirm(`delete ${s.name} and every version of it?`)) return;
                            try { await api.deleteSource(s.id); await refreshSources(workspaceId); toast.success("deleted"); }
                            catch (err) { toast.error(err instanceof Error ? err.message : "could not delete it"); }
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.click(); }}
                          aria-label={`delete ${s.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* right rail: profile, dictionary, joins */}
            <aside className="space-y-4">
              {latest && (
                <section className={`${card} p-4`}>
                  <h3 className="mb-2 text-xs uppercase tracking-widest text-white/45">profile</h3>
                  <div className="text-[11px] text-white/50">
                    version {latest.version} · {new Date(latest.created_at).toLocaleString()} ·
                    {" "}quality <span className={scoreTone(latestQuality.score ?? 0)}>{latestQuality.score ?? "—"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(latestProfile.domains ?? []).map((d) => (
                      <span key={d} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/55">{d}</span>
                    ))}
                  </div>
                  <ul className="mt-3 max-h-56 space-y-1 overflow-auto text-[11px]">
                    {(latestProfile.columns ?? []).slice(0, 40).map((c) => (
                      <li key={c.name} className="flex items-baseline gap-2">
                        <span className="truncate text-white/75">{c.name}</span>
                        <span className="text-white/30">{c.type}</span>
                        <span className="ml-auto text-white/40">{c.completeness}%</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(latestProfile.domains ?? []).flatMap((d) => DOMAIN_PATTERNS[d] ?? []).slice(0, 5).map((p) => (
                      <span key={p} className="text-[10px] text-white/35">{p} ·</span>
                    ))}
                  </div>
                </section>
              )}

              {dictionary.length > 0 && (
                <section className={`${card} p-4`}>
                  <h3 className="mb-2 text-xs uppercase tracking-widest text-white/45">dictionary</h3>
                  <div className="max-h-64 space-y-2 overflow-auto">
                    {dictionary.map((d) => (
                      <div key={d.id}>
                        <div className="text-[11px] text-white/70">{d.column_name}</div>
                        <input
                          className="mt-1 w-full rounded-lg border border-white/8 bg-black/30 px-2 py-1 text-[11px] text-white/70 outline-none focus:border-white/20"
                          defaultValue={d.definition}
                          onBlur={async (e) => {
                            if (e.target.value === d.definition) return;
                            try { await api.saveDefinition(d.id, e.target.value); toast.success(`${d.column_name} described`); }
                            catch (err) { toast.error(err instanceof Error ? err.message : "could not save"); }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {sources.length > 1 && selectedSource && (
                <JoinPanel sources={sources} versions={versions} selected={selectedSource} />
              )}
            </aside>
          </div>
        )}

        {/* ------------------------------------------------------------- ask */}
        {tab === "ask" && (
          <div className="mx-auto max-w-3xl space-y-4">
            <section className={`${card} p-5`}>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
                asking against
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75"
                >
                  <option value="">every source in this workspace</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  className={field}
                  placeholder="what changed this month, and what should i watch next?"
                  value={question}
                  maxLength={1000}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void askQuestion(); } }}
                />
                <button
                  type="button"
                  className="rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm text-white/85 transition hover:bg-white/[0.1] disabled:opacity-40"
                  disabled={busy === "asking" || sources.length === 0}
                  onClick={() => void askQuestion()}
                >
                  {busy === "asking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              {sources.length === 0 && <p className="mt-2 text-[11px] text-amber-200/70">add data first — there is nothing to answer from.</p>}
            </section>

            {busy === "asking" && (
              <div className={`${card} space-y-2 p-5`}>
                {[80, 60, 70].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-white/[0.06]" style={{ width: `${w}%` }} />
                ))}
              </div>
            )}

            {answer && (
              <article className={`${card} space-y-4 p-5`}>
                <p className="text-[15px] leading-relaxed text-white/90">{answer.finding}</p>

                {answer.evidence?.length > 0 && (
                  <ul className="space-y-1 border-l border-white/10 pl-3 text-[12px] text-white/60">
                    {answer.evidence.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}

                {answer.pattern && (
                  <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[12px]">
                    <span className="text-white/45">pattern · {answer.pattern.domain}</span>
                    <div className="mt-1 text-white/80">{answer.pattern.name}</div>
                    <p className="mt-1 text-white/55">{answer.pattern.explanation}</p>
                  </div>
                )}

                {answerChart && <ChartRender spec={answerChart} />}

                {answer.projection && (
                  <div className="text-[12px] text-white/70"><span className="text-white/40">what to watch · </span>{answer.projection}</div>
                )}
                {answer.clarification && (
                  <div className="rounded-xl border border-amber-200/20 bg-amber-200/[0.04] p-3 text-[12px] text-amber-100/80">
                    {answer.clarification}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t border-white/8 pt-3 text-[11px] text-white/45">
                  <span>confidence {answer.confidence}</span>
                  {answer.confidence_drivers && (
                    <span>
                      completeness {answer.confidence_drivers.completeness} · sample {answer.confidence_drivers.sample_size} ·
                      {" "}clarity {answer.confidence_drivers.signal_clarity} · corroboration {answer.confidence_drivers.independent_points}
                    </span>
                  )}
                  {answer.sampling && <span className="w-full">{answer.sampling}</span>}
                </div>

                {answer.reasoning && (
                  <details className="text-[11px] text-white/45">
                    <summary className="cursor-pointer text-white/55">how this answer was reached</summary>
                    <div className="mt-2 space-y-1">
                      <div>domains: {(answer.reasoning.domains_activated ?? []).join(", ") || "—"}</div>
                      <div>retrieval: {answer.reasoning.retrieval}</div>
                      <div>weighting: {answer.reasoning.weighting}</div>
                      {(answer.reasoning.alternatives ?? []).length > 0 && (
                        <div>alternatives considered: {answer.reasoning.alternatives.join("; ")}</div>
                      )}
                    </div>
                  </details>
                )}

                {answer.citations?.length > 0 && (
                  <details className="text-[11px] text-white/40">
                    <summary className="cursor-pointer text-white/55">evidence trail ({answer.citations.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {answer.citations.slice(0, 12).map((c, i) => (
                        <li key={i} className="truncate">{c.source_name ?? c.source_id}{c.excerpt ? ` — ${c.excerpt.slice(0, 120)}` : ""}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            )}

            {history.length > 0 && (
              <section className={`${card} p-4`}>
                <h3 className="mb-2 text-xs uppercase tracking-widest text-white/45">recent questions</h3>
                <ul className="space-y-1 text-[11px]">
                  {history.map((h) => (
                    <li key={h.id}>
                      <button type="button" className="text-left text-white/60 hover:text-white/90" onClick={() => setQuestion(h.question)}>
                        {h.question} <span className="text-white/30">· {h.confidence}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {/* --------------------------------------------------------- visuals */}
        {tab === "visuals" && (
          <VisualsPanel
            sources={sources}
            versions={versions}
            themeId={themeId}
            onThemeChange={setThemeId}
          />
        )}

        {/* ---------------------------------------------------------- alerts */}
        {tab === "alerts" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${card} p-5`}>
              <h2 className="mb-3 text-sm text-white/85">watch a number</h2>
              <AlertForm
                sources={sources}
                versions={versions}
                onCreate={async (payload) => {
                  const { supabase } = await import("@/integrations/supabase/client");
                  const { error } = await supabase.from("data_alert_rules").insert({
                    workspace_id: workspaceId,
                    source_id: payload.source_id,
                    name: payload.name,
                    kind: payload.kind,
                    spec: payload.spec as never,
                  });
                  if (error) toast.error(error.message); else { toast.success("watching"); await loadAsync(); }
                }}
              />
              <div className="mt-4 space-y-2">
                {alertRules.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[11px]">
                    <span className="mr-auto text-white/75">{r.name}<span className="text-white/35"> · {r.kind}</span></span>
                    <button
                      type="button"
                      className={chip}
                      onClick={async () => {
                        const { supabase } = await import("@/integrations/supabase/client");
                        await supabase.from("data_alert_rules").update({ active: !r.active }).eq("id", r.id);
                        await loadAsync();
                      }}
                    >
                      {r.active ? "pause" : "resume"}
                    </button>
                    <button
                      type="button"
                      className={chip}
                      onClick={async () => {
                        const { supabase } = await import("@/integrations/supabase/client");
                        await supabase.from("data_alert_rules").delete().eq("id", r.id);
                        await loadAsync();
                      }}
                    >
                      remove
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className={`${chip} mt-4`}
                disabled={busy === "alerts"}
                onClick={async () => {
                  setBusy("alerts");
                  try {
                    const res = await api.runAlerts(workspaceId);
                    toast.success(`${res.evaluated} rule(s) checked, ${res.fired} fired`);
                    await loadAsync();
                  } catch (e) { toast.error(e instanceof Error ? e.message : "the check failed"); }
                  finally { setBusy(null); }
                }}
              >
                {busy === "alerts" ? "checking…" : "check now"}
              </button>
            </section>

            <section className={`${card} p-5`}>
              <h2 className="mb-3 text-sm text-white/85">what fired</h2>
              {alertEvents.length === 0 && <p className="text-xs text-white/45">nothing has fired yet.</p>}
              <ul className="space-y-2">
                {alertEvents.map((e) => (
                  <li key={e.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[12px]">
                    <div className="text-white/80">{e.message}</div>
                    <div className="mt-1 text-[10px] text-white/40">{new Date(e.created_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {/* --------------------------------------------------------- reports */}
        {tab === "reports" && (
          <div className="space-y-4">
            <section className={`${card} flex flex-wrap items-center gap-2 p-5`}>
              {["executive", "performance", "anomaly", "forecast", "quality"].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={chip}
                  disabled={busy === "report" || sources.length === 0}
                  onClick={async () => {
                    setBusy("report");
                    try {
                      const res = await api.generateReport(workspaceId, t);
                      toast.success(`${t} report written`);
                      setOpenReport(res.report.id);
                      await loadAsync();
                    } catch (e) { toast.error(e instanceof Error ? e.message : "the report failed"); }
                    finally { setBusy(null); }
                  }}
                >
                  {busy === "report" ? "writing…" : `${t} report`}
                </button>
              ))}
              {sources.length === 0 && <span className="text-[11px] text-amber-200/70">add data first.</span>}
            </section>

            {reports.map((r) => (
              <section key={r.id} className={`${card} p-5`}>
                <button type="button" className="flex w-full items-baseline gap-3 text-left" onClick={() => setOpenReport(openReport === r.id ? null : r.id)}>
                  <span className="text-sm text-white/85">{r.name}</span>
                  <span className="text-[11px] text-white/40">{r.template} · {r.schedule} · {r.last_generated_at ? new Date(r.last_generated_at).toLocaleString() : "not run"}</span>
                  <span className="ml-auto text-[11px] text-white/40">{openReport === r.id ? "hide" : "read"}</span>
                </button>
                {openReport === r.id && (
                  <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap border-t border-white/8 pt-3 text-[12px] leading-relaxed text-white/70">
                    {r.content?.markdown ?? "this report has no body"}
                  </pre>
                )}
              </section>
            ))}
          </div>
        )}

        {/* -------------------------------------------------------- settings */}
        {tab === "settings" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${card} p-5`}>
              <h2 className="mb-2 text-sm text-white/85">standing directions</h2>
              <p className="mb-2 text-[11px] text-white/45">context every answer in this workspace is given — what the business is, what a good month looks like, what to ignore.</p>
              <textarea
                className={`${field} min-h-[140px]`}
                maxLength={8000}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
              <button
                type="button"
                className={`${chip} mt-3`}
                onClick={async () => {
                  try {
                    await api.updateWorkspace(workspaceId, { instructions });
                    setWorkspaces((p) => p.map((w) => (w.id === workspaceId ? { ...w, instructions } : w)));
                    toast.success("saved");
                  } catch (e) { toast.error(e instanceof Error ? e.message : "could not save"); }
                }}
              >
                save directions
              </button>
            </section>

            <section className={`${card} p-5`}>
              <h2 className="mb-2 text-sm text-white/85">visual theme</h2>
              <div className="flex flex-wrap gap-2">
                {DATA_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={async () => {
                      setThemeId(t.id);
                      try { await api.updateWorkspace(workspaceId, { theme: { id: t.id } }); } catch { /* local preview still applies */ }
                    }}
                    className={`rounded-xl border px-3 py-2 text-[11px] ${themeId === t.id ? "border-white/25 bg-white/[0.07]" : "border-white/10"}`}
                  >
                    <span className="text-white/75">{t.label}</span>
                    <span className="mt-1 flex gap-1">
                      {t.series.slice(0, 6).map((s, i) => (
                        <span key={i} className="h-3 w-3 rounded-full" style={{ background: `hsl(${s})` }} />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
              <ul className="mt-3 text-[10px] text-white/40">
                {checkThemeContrast(theme).filter((c) => !c.passes).map((c) => (
                  <li key={c.series} className="text-amber-200/70">series {c.series} sits at {c.ratio}:1 against the background, below the 3:1 legibility floor</li>
                ))}
                {checkThemeContrast(theme).every((c) => c.passes) && <li>every series clears the 3:1 legibility floor on this background</li>}
              </ul>
            </section>

            <section className={`${card} p-5 lg:col-span-2`}>
              <h2 className="mb-2 flex items-center gap-2 text-sm text-white/85"><Plug className="h-4 w-4 text-white/50" /> live connections</h2>
              <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-1">
                  {connectors.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!c.available}
                      onClick={() => setConnectorId(c.id)}
                      className={`w-full rounded-lg border px-3 py-1.5 text-left text-[11px] ${
                        connectorId === c.id ? "border-white/25 bg-white/[0.06] text-white/85" : "border-white/8 text-white/55"
                      } ${c.available ? "" : "cursor-not-allowed opacity-45"}`}
                      title={c.reason ?? ""}
                    >
                      {c.label}{!c.available && <span className="block text-[10px] text-white/35">{c.reason}</span>}
                    </button>
                  ))}
                  {connectors.length === 0 && <p className="text-[11px] text-white/40">the connector list could not be loaded.</p>}
                </div>
                <div className="space-y-2">
                  <textarea className={`${field} min-h-[110px] font-mono text-[11px]`} value={connectorConfig} onChange={(e) => setConnectorConfig(e.target.value)} />
                  <input
                    className={field}
                    type="password"
                    placeholder="key or connection string (sent for this pull only, never stored)"
                    value={connectorSecret}
                    onChange={(e) => setConnectorSecret(e.target.value)}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className={chip}
                    disabled={busy === "sync"}
                    onClick={async () => {
                      setBusy("sync");
                      try {
                        let config: Record<string, unknown> = {};
                        try { config = JSON.parse(connectorConfig || "{}"); } catch { throw new Error("the connection settings are not valid json"); }
                        const pulled = await api.pullConnector({
                          workspace_id: workspaceId, connector: connectorId, config,
                          secret: connectorSecret || undefined,
                        });
                        const profile = buildDatasetProfile(pulled.columns, pulled.rows as DataRow[]);
                        const quality = buildQualityReport(pulled.columns, pulled.rows as DataRow[], profileColumns(pulled.columns, pulled.rows as DataRow[]));
                        await api.ingest({
                          workspace_id: workspaceId,
                          source_id: pulled.source_id,
                          columns: pulled.columns,
                          rows: pulled.rows as DataRow[],
                          quality, profile,
                          connector: pulled.connector,
                          note: `pulled ${new Date(pulled.pulled_at).toLocaleString()}`,
                        });
                        setConnectorSecret("");
                        toast.success(`${pulled.rows.length.toLocaleString()} row(s) pulled and stored`);
                        await refreshSources(workspaceId);
                      } catch (e) { toast.error(e instanceof Error ? e.message : "the pull failed"); }
                      finally { setBusy(null); }
                    }}
                  >
                    {busy === "sync" ? <><RefreshCw className="mr-1 inline h-3 w-3 animate-spin" />pulling…</> : "pull now"}
                  </button>
                </div>
              </div>
            </section>

            <section className={`${card} p-5 lg:col-span-2`}>
              <h2 className="mb-2 text-sm text-white/85">push api</h2>
              <p className="text-[11px] text-white/45">
                send rows in from your own systems. asherin keeps only a one-way digest of the key, so it can never be read back — losing it means generating a new one.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={chip}
                  onClick={async () => {
                    const bytes = new Uint8Array(32);
                    crypto.getRandomValues(bytes);
                    const key = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
                    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
                    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
                    try {
                      const { supabase } = await import("@/integrations/supabase/client");
                      const { error } = await supabase.from("data_workspaces").update({ api_key_hash: hash }).eq("id", workspaceId);
                      if (error) throw new Error(error.message);
                      await navigator.clipboard.writeText(key).catch(() => undefined);
                      toast.success("key generated and copied — store it now", { duration: 12000, description: key });
                    } catch (e) { toast.error(e instanceof Error ? e.message : "could not generate a key"); }
                  }}
                >
                  generate a key
                </button>
                <span className="text-[11px] text-white/40">{activeWorkspace?.api_key_hash ? "a key is active on this workspace" : "no key yet"}</span>
              </div>
              <pre className="mt-3 overflow-auto rounded-xl border border-white/8 bg-black/40 p-3 text-[10px] text-white/55">
{`POST https://xpgxgzqbtrrrbtjcemci.supabase.co/functions/v1/asherin-data-api
x-asherin-data-key: <your key>
content-type: application/json

{ "source_name": "orders", "rows": [ { "id": 1, "amount": 42.5 } ] }`}
              </pre>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- sub panels */

function JoinPanel({
  sources, versions, selected,
}: { sources: DataSourceRow[]; versions: Record<string, DataVersionRow[]>; selected: string }) {
  const [other, setOther] = useState("");
  const [candidates, setCandidates] = useState<ReturnType<typeof suggestJoinKeys>>([]);
  const [checking, setChecking] = useState(false);

  const run = useCallback(async () => {
    if (!other) return;
    setChecking(true);
    try {
      const lv = (versions[selected] ?? [])[0];
      const rv = (versions[other] ?? [])[0];
      if (!lv || !rv) { toast.error("both sources need a loaded version"); return; }
      const [lr, rr] = await Promise.all([api.loadVersionRows(lv.id, 1000), api.loadVersionRows(rv.id, 1000)]);
      setCandidates(suggestJoinKeys(Object.keys(lr[0] ?? {}), lr, Object.keys(rr[0] ?? {}), rr));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "could not compare them");
    } finally {
      setChecking(false);
    }
  }, [other, selected, versions]);

  return (
    <section className={`${card} p-4`}>
      <h3 className="mb-2 text-xs uppercase tracking-widest text-white/45">connect two sources</h3>
      <select className={`${field} text-[11px]`} value={other} onChange={(e) => setOther(e.target.value)}>
        <option value="">pick the other source</option>
        {sources.filter((s) => s.id !== selected).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <button type="button" className={`${chip} mt-2`} onClick={() => void run()} disabled={!other || checking}>
        {checking ? "comparing…" : "find shared columns"}
      </button>
      <ul className="mt-2 space-y-1 text-[11px]">
        {candidates.map((c, i) => (
          <li key={i} className="text-white/60">
            {c.left} ↔ {c.right} · {c.overlap}% overlap · {c.cardinality} · {c.confidence} confidence
          </li>
        ))}
        {!checking && other && candidates.length === 0 && <li className="text-white/40">no columns line up well enough to join on.</li>}
      </ul>
    </section>
  );
}

function AlertForm({
  sources, versions, onCreate,
}: {
  sources: DataSourceRow[];
  versions: Record<string, DataVersionRow[]>;
  onCreate: (payload: { source_id: string; name: string; kind: string; spec: Record<string, unknown> }) => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [kind, setKind] = useState("threshold");
  const [metric, setMetric] = useState("");
  const [operator, setOperator] = useState(">");
  const [threshold, setThreshold] = useState("0");

  useEffect(() => { if (!sourceId && sources[0]) setSourceId(sources[0].id); }, [sources, sourceId]);

  const measures = useMemo(() => {
    const v = (versions[sourceId] ?? [])[0];
    const p = (v?.profile ?? {}) as DatasetProfile;
    return p.measures ?? [];
  }, [versions, sourceId]);

  useEffect(() => { if (!metric && measures[0]) setMetric(measures[0]); }, [measures, metric]);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select className={`${field} text-[11px]`} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
        {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select className={`${field} text-[11px]`} value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="threshold">crosses a number</option>
        <option value="change">changes by a percentage</option>
        <option value="anomaly">breaks its normal range</option>
      </select>
      <select className={`${field} text-[11px]`} value={metric} onChange={(e) => setMetric(e.target.value)}>
        {measures.length === 0 && <option value="">no numeric columns found</option>}
        {measures.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <div className="flex gap-2">
        {kind !== "anomaly" && (
          <select className={`${field} text-[11px]`} value={operator} onChange={(e) => setOperator(e.target.value)}>
            {kind === "change" ? <><option value="change&gt;">rises by</option><option value="change&lt;">falls by</option></> : <><option value="&gt;">above</option><option value="&lt;">below</option></>}
          </select>
        )}
        <input className={`${field} text-[11px]`} value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" />
      </div>
      <button
        type="button"
        className={`${chip} sm:col-span-2`}
        disabled={!sourceId || !metric}
        onClick={() => {
          const op = kind === "change" ? (operator.includes("<") ? "change<" : "change>") : operator.includes("<") ? "<" : ">";
          void onCreate({
            source_id: sourceId,
            name: `${metric} ${kind === "anomaly" ? "breaks its range" : `${op} ${threshold}`}`,
            kind,
            spec: { metric, aggregate: "sum", operator: op, threshold: Number(threshold) || 0, sigma: 3 },
          });
        }}
      >
        start watching
      </button>
    </div>
  );
}

function VisualsPanel({
  sources, versions, themeId, onThemeChange,
}: {
  sources: DataSourceRow[];
  versions: Record<string, DataVersionRow[]>;
  themeId: string;
  onThemeChange: (id: string) => void;
}) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<ChartSpec["intent"]>("comparison");
  const [x, setX] = useState("");
  const [y, setY] = useState("");

  useEffect(() => { if (!sourceId && sources[0]) setSourceId(sources[0].id); }, [sources, sourceId]);

  const version = (versions[sourceId] ?? [])[0];
  const profile = useMemo(() => (version?.profile ?? {}) as DatasetProfile, [version]);

  useEffect(() => {
    if (!version) { setRows([]); return; }
    let cancelled = false;
    setLoading(true);
    api.loadVersionRows(version.id, 5000)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [version]);

  useEffect(() => {
    if (!x && (profile.dateColumns?.[0] || profile.dimensions?.[0])) setX(profile.dateColumns?.[0] ?? profile.dimensions?.[0] ?? "");
    if (!y && profile.measures?.[0]) setY(profile.measures[0]);
  }, [profile, x, y]);

  const spec = useMemo(() => {
    if (!rows.length || !profile.columns?.length) return null;
    return buildChart(
      {
        intent,
        x: x || undefined,
        y: y ? [y] : undefined,
        title: `${y || "count"} by ${x || "row"}`,
        insight: `${intent} view · ${rows.length.toLocaleString()} row(s) read`,
        sourceTag: `${sources.find((s) => s.id === sourceId)?.name ?? "source"} · v${version?.version ?? "?"}`,
      },
      rows,
      profile,
    );
  }, [rows, profile, intent, x, y, sources, sourceId, version]);

  return (
    <div className="space-y-4" style={themeStyle(getTheme(themeId))}>
      <section className={`${card} flex flex-wrap items-center gap-2 p-4`}>
        <select className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75" value={intent} onChange={(e) => setIntent(e.target.value as ChartSpec["intent"])}>
          {["comparison", "trend", "distribution", "relationship", "part-to-whole", "anomaly", "summary"].map((i) => <option key={i} value={i}>{i}</option>)}
        </select>
        <select className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75" value={x} onChange={(e) => setX(e.target.value)}>
          <option value="">group by…</option>
          {(profile.columns ?? []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <select className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75" value={y} onChange={(e) => setY(e.target.value)}>
          <option value="">count rows</option>
          {(profile.measures ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="ml-auto rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75" value={themeId} onChange={(e) => onThemeChange(e.target.value)}>
          {DATA_THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </section>

      {loading && <div className={`${card} p-6 text-xs text-white/45`}>reading rows…</div>}
      {!loading && !sources.length && <div className={`${card} p-6 text-xs text-white/45`}>add data first — there is nothing to draw.</div>}
      {!loading && sources.length > 0 && !spec && (
        <div className={`${card} p-6 text-xs text-white/45`}>
          this combination has nothing behind it. pick a different grouping or measure.
        </div>
      )}
      {!loading && spec && <ChartRender spec={{ ...spec, quality: (version?.quality as QualityReport)?.score }} />}
    </div>
  );
}
