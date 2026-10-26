// asherin.data — reports are markdown files computed on this device from a
// stored version. shepherd may add a short commentary when a model is
// connected; when it cannot, the report stands without it and says so.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { REPORT_TEMPLATES, buildReportMarkdown, type ReportTemplate } from "@/lib/data/analyze";
import { narrateReport } from "@/lib/data/ask";
import { deleteReport, listReports, saveReport, type ReportRow } from "@/lib/data/store";
import { downloadText, safeFileName } from "@/lib/data/download";
import { latestOf, profileOf, qualityOf, type Room } from "./room";
import { readVersionRows } from "./useVersionRows";
import { card, chip, errorText, fmtWhen, select } from "./ui";

const TEMPLATE_COPY: Record<ReportTemplate, string> = {
  overview: "quality, columns, measures, top groups and out-of-range values",
  quality: "every quality issue and the full column table",
  trend: "measures by period along the first date column",
  anomaly: "out-of-range values and change since the previous version",
};

export default function ReportsTab({ room }: { room: Room }) {
  const tables = useMemo(() => room.sources.filter((s) => (latestOf(room, s.id)?.row_count ?? 0) > 0), [room]);
  const [sourceId, setSourceId] = useState(() => (tables.some((s) => s.id === room.selectedSource) ? room.selectedSource : tables[0]?.id ?? ""));
  useEffect(() => { if (!tables.some((s) => s.id === sourceId)) setSourceId(tables[0]?.id ?? ""); }, [tables, sourceId]);

  const [withCommentary, setWithCommentary] = useState(false);
  const [writing, setWriting] = useState<ReportTemplate | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setReports(await listReports(room.workspace.id)); setLoadError(null); }
    catch (e) { setLoadError(errorText(e, "the reports could not be read")); }
  }, [room.workspace.id]);
  useEffect(() => { void load(); }, [load]);

  const write = async (template: ReportTemplate) => {
    const source = room.sources.find((s) => s.id === sourceId);
    const version = latestOf(room, sourceId);
    const profile = profileOf(version);
    const quality = qualityOf(version);
    if (!source || !version || !profile || !quality) return;
    setWriting(template);
    try {
      const rows = await readVersionRows(version.id);
      const prev = (room.versions[sourceId] ?? [])[1];
      const previousRows = template === "anomaly" && prev ? await readVersionRows(prev.id).catch(() => null) : null;
      let markdown = buildReportMarkdown({ template, source, version, rows, profile, quality, previousRows });
      if (withCommentary) {
        const note = await narrateReport(markdown);
        markdown += note
          ? `\n\n## shepherd's commentary\n\n${note}\n`
          : "\n\n## shepherd's commentary\n\nshepherd could not be reached, so this report carries no commentary. the figures above stand on their own.\n";
      }
      const saved = await saveReport({ workspace_id: room.workspace.id, source_id: source.id, name: `${source.name} — ${template}`, template, markdown });
      toast.success(`${template} report written`, { description: `${rows.length.toLocaleString()} rows, computed on this device` });
      setOpen(saved.id);
      await load();
    } catch (e) {
      toast.error("report not written", { description: errorText(e, "the report could not be built") });
    } finally {
      setWriting(null);
    }
  };

  const download = (r: ReportRow) => downloadText(`${safeFileName(r.name)}-${r.created_at.slice(0, 10)}.md`, r.markdown, "text/markdown;charset=utf-8");

  return (
    <div className="space-y-4">
      <section className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-white/45">report on</span>
          <select className={select} value={sourceId} onChange={(e) => setSourceId(e.target.value)} aria-label="source to report on" disabled={!tables.length}>
            {!tables.length && <option value="">no table yet</option>}
            {tables.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="ml-auto flex items-center gap-2 text-[11px] text-white/55">
            <input type="checkbox" className="accent-white/70" checked={withCommentary} onChange={(e) => setWithCommentary(e.target.checked)} />
            add shepherd's commentary
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {REPORT_TEMPLATES.map((t) => (
            <button key={t} type="button" className={chip} disabled={writing !== null || !sourceId} onClick={() => void write(t)} title={TEMPLATE_COPY[t]}>
              {writing === t ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />writing…</> : `${t} report`}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-white/35">
          {sourceId ? TEMPLATE_COPY[(writing ?? "overview")] : "add a table first."} · every figure is computed here; download as .md
        </p>
      </section>

      {loadError && <p className="text-[11px] text-rose-200/70">{loadError}</p>}
      {!loadError && reports.length === 0 && <p className="px-1 text-xs text-white/45">no reports yet.</p>}

      {reports.map((r) => (
        <section key={r.id} className={`${card} p-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="mr-auto min-w-0 text-left" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
              <span className="block truncate text-sm text-white/85">{r.name}</span>
              <span className="text-[11px] text-white/40">{r.template} · {fmtWhen(r.created_at)} · {open === r.id ? "hide" : "read"}</span>
            </button>
            <button type="button" className={chip} onClick={() => download(r)} aria-label={`download ${r.name}`}><Download className="mr-1 inline h-3 w-3" />download .md</button>
            <button
              type="button"
              className="rounded-lg border border-white/10 p-1.5 text-white/40 hover:text-rose-300/80"
              aria-label={`remove ${r.name}`}
              onClick={async () => { try { await deleteReport(r.id); await load(); } catch (e) { toast.error("not removed", { description: errorText(e, "the report could not be removed") }); } }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {open === r.id && (
            <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap border-t border-white/8 pt-3 text-[12px] leading-relaxed text-white/70">{r.markdown}</pre>
          )}
        </section>
      ))}
    </div>
  );
}
