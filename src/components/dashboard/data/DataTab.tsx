// asherin.data — the data tab: bring a file, see what it is before it is kept,
// clean it here, then store it on this device as a source or a new version.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES, parseDataFile } from "@/lib/data/parse";
import { buildDatasetProfile, buildQualityReport } from "@/lib/data/validate";
import { applyCleanOp, type CleanOp } from "@/lib/data/clean";
import { suggestJoinKeys } from "@/lib/data/join";
import { deleteSource, ingest, listDictionary, saveDefinition } from "@/lib/data/store";
import { downloadText, rowsToCsv, safeFileName } from "@/lib/data/download";
import type { DataRow, DataSourceRow, DataVersionRow, DatasetProfile, DictionaryRow, QualityReport } from "@/lib/data/types";
import { forgetVersionRows, readVersionRows } from "./useVersionRows";
import { latestOf, profileOf, qualityOf, type Room } from "./room";
import { card, chip, errorText, eyebrow, fmtWhen, scoreTone, select } from "./ui";

interface Staged {
  fileName: string;
  byteSize: number;
  mime: string;
  kind: "table" | "document";
  columns: string[];
  rows: DataRow[];
  text: string;
  warnings: string[];
  method: string;
  quality: QualityReport;
  profile: DatasetProfile;
  history: string[];
}

export default function DataTab({ room }: { room: Room }) {
  const [staged, setStaged] = useState<Staged | null>(null);
  const [reading, setReading] = useState(false);
  const [storing, setStoring] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("file too large", { description: `${file.name} is ${(file.size / 1_048_576).toFixed(1)} mb; the limit is 100 mb. nothing was read.` });
      return;
    }
    setReading(true);
    setProgress(null);
    try {
      const parsed = await parseDataFile(file, (pct) => setProgress(pct));
      const profile = buildDatasetProfile(parsed.columns, parsed.rows, parsed.text);
      const quality = buildQualityReport(parsed.columns, parsed.rows, profile.columns);
      setStaged({
        fileName: file.name, byteSize: file.size, mime: file.type || "application/octet-stream",
        kind: parsed.kind, columns: parsed.columns, rows: parsed.rows, text: parsed.text,
        warnings: parsed.warnings, method: parsed.method, quality, profile, history: [],
      });
      toast.success(`${file.name} read`, {
        description: parsed.kind === "table"
          ? `${parsed.rows.length.toLocaleString()} rows · ${parsed.columns.length} columns · quality ${quality.score}/100`
          : `${parsed.text.length.toLocaleString()} characters of text`,
      });
    } catch (e) {
      toast.error("file not read", { description: errorText(e, "that file could not be read") });
    } finally {
      setReading(false);
      setProgress(null);
      if (fileInput.current) fileInput.current.value = "";
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

  const commit = useCallback(async (asNewVersionOf?: string) => {
    if (!staged) return;
    setStoring(true);
    try {
      const res = await ingest({
        workspace_id: room.workspace.id,
        source_id: asNewVersionOf,
        source_name: staged.fileName.replace(/\.[^.]+$/, ""),
        kind: staged.kind,
        file_name: staged.fileName,
        mime: staged.mime,
        byte_size: staged.byteSize,
        columns: staged.columns,
        rows: staged.rows,
        text: staged.text,
        quality: staged.quality,
        profile: staged.profile,
        note: [staged.method, ...staged.history].join("; ").slice(0, 500),
      });
      toast.success(`version ${res.version} stored on this device`, { description: staged.kind === "table" ? `${res.rows_stored.toLocaleString()} rows` : "document text" });
      setStaged(null);
      await room.refresh();
      room.setSelectedSource(res.source_id);
    } catch (e) {
      toast.error("not stored", { description: errorText(e, "the upload could not be stored") });
    } finally {
      setStoring(false);
    }
  }, [staged, room]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const latest = latestOf(room, room.selectedSource);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {/* upload */}
        <section
          role="button"
          tabIndex={0}
          aria-label="drop a file here, or press enter to choose one"
          className={`${card} cursor-pointer p-5 outline-none transition focus-visible:ring-1 focus-visible:ring-white/30 ${dragging ? "border-white/30 bg-white/[0.06]" : ""}`}
          onClick={() => !reading && fileInput.current?.click()}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !reading) { e.preventDefault(); fileInput.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <div className="flex flex-wrap items-center gap-3">
            {reading ? <Loader2 className="h-4 w-4 animate-spin text-white/50" /> : <Upload className="h-4 w-4 text-white/50" />}
            <div className="mr-auto min-w-0">
              <div className="text-sm text-white/85">{reading ? "reading on this device…" : "drop a file, or tap to choose one"}</div>
              <div className="text-[11px] text-white/40">{ACCEPTED_EXTENSIONS.join(" ")} · up to 100 mb · the first 50,000 rows of a table</div>
            </div>
            <input
              ref={fileInput}
              type="file"
              className="hidden"
              accept={ACCEPTED_EXTENSIONS.join(",")}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {progress !== null && (
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10" aria-label={`reading text optically, ${progress}%`}>
              <div className="h-full bg-white/50 transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          )}
        </section>

        {staged && (
          <StagedReview staged={staged} storing={storing} sources={room.sources} onClean={runClean} onCommit={commit} onDiscard={() => setStaged(null)} />
        )}

        <SourcesList room={room} />
      </div>

      <aside className="space-y-4">
        {latest && <ProfileCard version={latest} />}
        {room.selectedSource && <DictionaryCard sourceId={room.selectedSource} versionId={latest?.id ?? null} />}
        {room.sources.length > 1 && room.selectedSource && <JoinPanel room={room} />}
      </aside>
    </div>
  );
}

/* ── staged review ─────────────────────────────────────────────────────── */

function StagedReview({ staged, storing, sources, onClean, onCommit, onDiscard }: {
  staged: Staged; storing: boolean; sources: DataSourceRow[];
  onClean: (op: CleanOp) => void; onCommit: (asNewVersionOf?: string) => void; onDiscard: () => void;
}) {
  const [versionOf, setVersionOf] = useState("");
  return (
    <section className={`${card} p-5`}>
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="min-w-0 truncate text-sm text-white/85">{staged.fileName}</h2>
        {staged.kind === "table" ? (
          <>
            <span className={`text-xs ${scoreTone(staged.quality.score)}`}>quality {staged.quality.score}/100</span>
            <span className="text-[11px] text-white/40">
              {staged.quality.rowCount.toLocaleString()} rows · {staged.quality.columnCount} columns · {staged.quality.completeness}% filled in · {staged.quality.duplicateCount} duplicate(s) · read as {staged.method}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-white/40">{staged.text.length.toLocaleString()} characters · read as {staged.method}</span>
        )}
      </div>

      {(staged.warnings.length > 0 || staged.quality.issues.length > 0) && (
        <ul className="mt-3 space-y-1 text-[11px]">
          {staged.warnings.map((w, i) => (
            <li key={`w${i}`} className="flex gap-2 text-amber-200/70"><AlertTriangle className="mt-px h-3 w-3 shrink-0" />{w}</li>
          ))}
          {staged.kind === "table" && staged.quality.issues.slice(0, 8).map((iss, i) => (
            <li key={`i${i}`} className={iss.severity === "high" ? "text-rose-200/70" : iss.severity === "medium" ? "text-amber-200/70" : "text-white/45"}>
              · {iss.message}
            </li>
          ))}
        </ul>
      )}

      {staged.kind === "table" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {staged.quality.duplicateCount > 0 && <button type="button" className={chip} onClick={() => onClean({ kind: "drop-duplicates" })}>remove {staged.quality.duplicateCount} duplicate(s)</button>}
          <button type="button" className={chip} onClick={() => onClean({ kind: "drop-empty-rows" })}>remove empty rows</button>
          {staged.profile.columns.filter((c) => staged.profile.measures.includes(c.name) && c.missing > 0).slice(0, 4).map((c) => (
            <button key={c.name} type="button" className={chip} onClick={() => onClean({ kind: "fill-missing", column: c.name, strategy: "median" })}>
              fill {c.missing} missing {c.name} with the median
            </button>
          ))}
          {staged.profile.columns.filter((c) => c.outlierRows.length > 0).slice(0, 3).map((c) => (
            <button key={c.name} type="button" className={chip} onClick={() => onClean({ kind: "remove-outliers", column: c.name })}>
              drop {c.outlierRows.length} out-of-range {c.name}
            </button>
          ))}
        </div>
      )}

      {staged.kind === "table" ? (
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
          {staged.columns.length > 14 && <div className="px-3 py-1.5 text-[10px] text-white/35">{staged.columns.length - 14} more column(s) are kept but not previewed</div>}
        </div>
      ) : (
        <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 p-3 text-[11px] text-white/60">
          {staged.text.slice(0, 4000)}{staged.text.length > 4000 ? "\n…" : ""}
        </pre>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={chip} disabled={storing} onClick={() => onCommit()}>
          {storing ? "storing…" : "keep as a new source"}
        </button>
        {sources.length > 0 && (
          <>
            <select className={select} value={versionOf} onChange={(e) => setVersionOf(e.target.value)} aria-label="store as a new version of">
              <option value="">…or as a new version of</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {versionOf && <button type="button" className={chip} disabled={storing} onClick={() => onCommit(versionOf)}>{storing ? "storing…" : "keep as new version"}</button>}
          </>
        )}
        <button type="button" className={chip} disabled={storing} onClick={onDiscard}>discard</button>
        <span className="text-[10px] text-white/35">kept in this browser's storage only</span>
      </div>
    </section>
  );
}

/* ── sources ───────────────────────────────────────────────────────────── */

function SourcesList({ room }: { room: Room }) {
  const [armed, setArmed] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const arm = (id: string) => {
    setArmed(id);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(null), 3500);
  };

  const remove = async (s: DataSourceRow) => {
    setDeleting(s.id);
    try {
      for (const v of room.versions[s.id] ?? []) forgetVersionRows(v.id);
      await deleteSource(s.id);
      toast.success(`${s.name} removed`, { description: "every version of it is gone from this device" });
      await room.refresh();
    } catch (e) {
      toast.error("not removed", { description: errorText(e, "the source could not be removed") });
    } finally {
      setDeleting(null);
      setArmed(null);
    }
  };

  const exportCsv = async (s: DataSourceRow, v: DataVersionRow) => {
    try {
      if (v.text !== null && v.row_count === 0) {
        downloadText(`${safeFileName(s.name)}-v${v.version}.txt`, v.text);
        return;
      }
      const rows = await readVersionRows(v.id);
      downloadText(`${safeFileName(s.name)}-v${v.version}.csv`, rowsToCsv(v.columns ?? Object.keys(rows[0] ?? {}), rows), "text/csv;charset=utf-8");
    } catch (e) {
      toast.error("not exported", { description: errorText(e, "the rows could not be read") });
    }
  };

  return (
    <section className={`${card} p-5`}>
      <h2 className="mb-3 text-sm text-white/85">your data</h2>
      {room.sources.length === 0 && (
        <p className="text-xs text-white/45">nothing here yet. drop a file above, or add a public csv/json url under settings.</p>
      )}
      <ul className="space-y-2">
        {room.sources.map((s) => {
          const v = latestOf(room, s.id);
          const q = qualityOf(v);
          const selected = room.selectedSource === s.id;
          return (
            <li key={s.id}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => room.setSelectedSource(s.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); room.setSelectedSource(s.id); } }}
                className={`flex w-full flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-left outline-none transition focus-visible:ring-1 focus-visible:ring-white/30 ${
                  selected ? "border-white/25 bg-white/[0.06]" : "border-white/8 bg-white/[0.02] hover:border-white/15"
                }`}
              >
                <div className="mr-auto min-w-0 basis-full sm:basis-auto">
                  <div className="truncate text-sm text-white/85">{s.name}</div>
                  <div className="text-[11px] text-white/40">
                    {s.connector === "url" ? "live url · " : ""}
                    {v ? (v.row_count > 0 ? `v${v.version} · ${v.row_count.toLocaleString()} rows · ${v.column_count} columns` : `v${v.version} · document · ${(v.text ?? "").length.toLocaleString()} chars`) : "no version stored"}
                    {v ? ` · ${fmtWhen(v.created_at)}` : ""}
                    {s.last_sync_error ? ` · last pull failed: ${s.last_sync_error}` : ""}
                  </div>
                </div>
                {q && <span className={`text-xs ${scoreTone(q.score)}`}>{q.score}/100</span>}
                {v && (
                  <button
                    type="button"
                    className="rounded-lg border border-white/10 p-1.5 text-white/40 hover:text-white/80"
                    aria-label={`download ${s.name} as ${v.row_count > 0 ? "csv" : "txt"}`}
                    onClick={(e) => { e.stopPropagation(); void exportCsv(s, v); }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  className={`rounded-lg border p-1.5 text-[11px] transition ${armed === s.id ? "border-rose-300/40 px-2 text-rose-200/90" : "border-white/10 text-white/40 hover:text-rose-300/80"}`}
                  aria-label={armed === s.id ? `confirm: delete ${s.name}` : `delete ${s.name}`}
                  disabled={deleting === s.id}
                  onClick={(e) => { e.stopPropagation(); if (armed === s.id) void remove(s); else arm(s.id); }}
                >
                  {deleting === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : armed === s.id ? "sure?" : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── right rail ────────────────────────────────────────────────────────── */

function ProfileCard({ version }: { version: DataVersionRow }) {
  const profile = profileOf(version);
  const quality = qualityOf(version);
  return (
    <section className={`${card} p-4`}>
      <h3 className={eyebrow}>profile</h3>
      <div className="text-[11px] text-white/50">
        version {version.version} · {fmtWhen(version.created_at)}
        {quality && <> · quality <span className={scoreTone(quality.score)}>{quality.score}</span></>}
        {version.note && <div className="mt-1 text-white/35">{version.note}</div>}
      </div>
      {profile && (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.domains.map((d) => <span key={d} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/55">{d}</span>)}
          </div>
          <ul className="mt-3 max-h-56 space-y-1 overflow-auto text-[11px]">
            {profile.columns.slice(0, 60).map((c) => (
              <li key={c.name} className="flex items-baseline gap-2">
                <span className="truncate text-white/75">{c.name}</span>
                <span className="text-white/30">{c.type}</span>
                <span className="ml-auto text-white/40">{c.completeness}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {!profile && version.text !== null && <p className="mt-2 text-[11px] text-white/45">a document: {(version.text ?? "").length.toLocaleString()} characters, no columns to profile.</p>}
    </section>
  );
}

function DictionaryCard({ sourceId, versionId }: { sourceId: string; versionId: string | null }) {
  const [rows, setRows] = useState<DictionaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    listDictionary(sourceId)
      .then((d) => { if (!cancelled) { setRows(d); setError(null); } })
      .catch((e: unknown) => { if (!cancelled) { setRows([]); setError(errorText(e, "the dictionary could not be read")); } });
    return () => { cancelled = true; };
  }, [sourceId, versionId]);
  if (error) return <section className={`${card} p-4`}><h3 className={eyebrow}>dictionary</h3><p className="text-[11px] text-rose-200/70">{error}</p></section>;
  if (!rows.length) return null;
  return (
    <section className={`${card} p-4`}>
      <h3 className={eyebrow}>dictionary</h3>
      <p className="mb-2 text-[10px] text-white/35">say what a column means; shepherd reads these when it answers.</p>
      <div className="max-h-64 space-y-2 overflow-auto">
        {rows.map((d) => (
          <div key={d.id}>
            <label className="text-[11px] text-white/70" htmlFor={`def-${d.id}`}>{d.column_name} <span className="text-white/30">{d.inferred_type}</span></label>
            <input
              id={`def-${d.id}`}
              className="mt-1 w-full rounded-lg border border-white/8 bg-black/30 px-2 py-1 text-[11px] text-white/70 outline-none focus:border-white/20"
              defaultValue={d.definition}
              placeholder="what this column means"
              onBlur={async (e) => {
                if (e.target.value === d.definition) return;
                try { await saveDefinition(d.id, e.target.value); toast.success(`${d.column_name} described`); }
                catch (err) { toast.error("not saved", { description: errorText(err, "the definition could not be saved") }); }
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function JoinPanel({ room }: { room: Room }) {
  const [other, setOther] = useState("");
  const [candidates, setCandidates] = useState<ReturnType<typeof suggestJoinKeys> | null>(null);
  const [checking, setChecking] = useState(false);
  const others = useMemo(() => room.sources.filter((s) => s.id !== room.selectedSource && (latestOf(room, s.id)?.row_count ?? 0) > 0), [room]);

  const run = useCallback(async () => {
    if (!other) return;
    setChecking(true);
    try {
      const lv = latestOf(room, room.selectedSource);
      const rv = latestOf(room, other);
      if (!lv || !rv) { toast.error("both sources need a stored version"); return; }
      const [lr, rr] = await Promise.all([readVersionRows(lv.id), readVersionRows(rv.id)]);
      setCandidates(suggestJoinKeys(lv.columns ?? Object.keys(lr[0] ?? {}), lr.slice(0, 5000), rv.columns ?? Object.keys(rr[0] ?? {}), rr.slice(0, 5000)));
    } catch (e) {
      toast.error("not compared", { description: errorText(e, "the sources could not be compared") });
    } finally {
      setChecking(false);
    }
  }, [other, room]);

  if (!others.length) return null;
  return (
    <section className={`${card} p-4`}>
      <h3 className={eyebrow}>connect two sources</h3>
      <select className={`${select} w-full`} value={other} onChange={(e) => { setOther(e.target.value); setCandidates(null); }} aria-label="the other source">
        <option value="">pick the other source</option>
        {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <button type="button" className={`${chip} mt-2`} onClick={() => void run()} disabled={!other || checking}>
        {checking ? "comparing…" : "find shared columns"}
      </button>
      <ul className="mt-2 space-y-1 text-[11px]">
        {(candidates ?? []).map((c, i) => (
          <li key={i} className="text-white/60">{c.left} ↔ {c.right} · {c.overlap}% overlap · {c.cardinality} · {c.confidence} confidence</li>
        ))}
        {candidates && candidates.length === 0 && <li className="text-white/40">no columns line up well enough to join on.</li>}
      </ul>
    </section>
  );
}
