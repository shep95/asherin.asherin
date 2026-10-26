// asherin.data — ask shepherd about one source. the model sees the real
// column names, stats and sample rows; the sums are done on this device; the
// chart is drawn from the stored rows. a missing model key is said plainly.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { answerQuestion } from "@/lib/data/ask";
import { listDictionary, listQueries, logQuery, type QueryLogRow } from "@/lib/data/store";
import type { AnswerBlocks } from "@/lib/data/types";
import ChartRender from "./ChartRender";
import { latestOf, profileOf, qualityOf, type Room } from "./room";
import { useVersionRows } from "./useVersionRows";
import { card, chip, errorText, eyebrow, field, select } from "./ui";

type Stage = "planning" | "computing" | "narrating";
const STAGE_COPY: Record<Stage, string> = {
  planning: "shepherd is choosing what to compute…",
  computing: "computing on this device…",
  narrating: "shepherd is writing the answer…",
};

export default function AskTab({ room }: { room: Room }) {
  const [question, setQuestion] = useState("");
  const [stage, setStage] = useState<Stage | null>(null);
  const [answer, setAnswer] = useState<AnswerBlocks | null>(null);
  const [asked, setAsked] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryLogRow[]>([]);
  const abort = useRef<AbortController | null>(null);

  const sourceId = room.selectedSource || room.sources[0]?.id || "";
  const source = room.sources.find((s) => s.id === sourceId);
  const latest = latestOf(room, sourceId);
  const { rows, loading: rowsLoading, error: rowsError } = useVersionRows(latest && latest.row_count > 0 ? latest.id : null);
  const profile = profileOf(latest);
  const quality = qualityOf(latest);

  const refreshHistory = useCallback(() => {
    listQueries(room.workspace.id).then(setHistory).catch(() => setHistory([]));
  }, [room.workspace.id]);
  useEffect(() => { refreshHistory(); }, [refreshHistory]);
  useEffect(() => () => abort.current?.abort(), []);

  const ready = !!latest && !!profile && !!quality && !rowsLoading && !rowsError && (latest.row_count === 0 || rows.length > 0);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (q.length < 3 || !latest || !profile || !quality || !source) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setStage("planning");
    setAnswer(null);
    setError(null);
    setAsked(q);
    try {
      const dictionary = await listDictionary(source.id).catch(() => []);
      const res = await answerQuestion({
        question: q,
        sourceName: source.name,
        version: latest.version,
        rows,
        profile,
        quality,
        definitions: dictionary.filter((d) => d.definition.trim()).map((d) => ({ column: d.column_name, definition: d.definition })),
        instructions: room.workspace.instructions,
        text: latest.row_count === 0 ? latest.text : null,
        signal: ctrl.signal,
        onStage: (s) => { if (!ctrl.signal.aborted) setStage(s); },
      });
      if (ctrl.signal.aborted) return;
      setAnswer(res);
      await logQuery(room.workspace.id, source.id, q, res).catch(() => undefined);
      refreshHistory();
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(errorText(e, "shepherd could not answer"));
    } finally {
      if (!ctrl.signal.aborted) setStage(null);
    }
  }, [question, latest, profile, quality, source, rows, room.workspace, refreshHistory]);

  const stop = () => { abort.current?.abort(); setStage(null); };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className={`${card} p-5`}>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
          asking against
          <select className={select} value={sourceId} onChange={(e) => room.setSelectedSource(e.target.value)} aria-label="source to ask about" disabled={!room.sources.length}>
            {!room.sources.length && <option value="">no source yet</option>}
            {room.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {latest && <span>· v{latest.version} · {latest.row_count > 0 ? `${latest.row_count.toLocaleString()} rows` : "document"}</span>}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className={field}
            placeholder={latest ? "what stands out, and what should i watch next?" : "add data first"}
            value={question}
            maxLength={1000}
            disabled={!ready || stage !== null}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }}
            aria-label="your question"
          />
          {stage ? (
            <button type="button" className="rounded-xl border border-white/15 bg-white/[0.06] px-4 text-xs text-white/85 transition hover:bg-white/[0.1]" onClick={stop}>stop</button>
          ) : (
            <button
              type="button"
              className="rounded-xl border border-white/15 bg-white/[0.06] px-4 text-sm text-white/85 transition hover:bg-white/[0.1] disabled:opacity-40"
              disabled={!ready || question.trim().length < 3}
              onClick={() => void ask()}
              aria-label="ask shepherd"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        {!room.sources.length && <p className="mt-2 text-[11px] text-amber-200/70">add data first — there is nothing to answer from.</p>}
        {rowsLoading && <p className="mt-2 flex items-center gap-2 text-[11px] text-white/45"><Loader2 className="h-3 w-3 animate-spin" /> reading the stored rows…</p>}
        {rowsError && <p className="mt-2 text-[11px] text-rose-200/70">{rowsError}</p>}
        {latest && !profile && !rowsLoading && <p className="mt-2 text-[11px] text-rose-200/70">this version has no profile; store the file again.</p>}
        <p className="mt-2 text-[10px] text-white/35">shepherd sees column names, statistics, {Math.min(20, rows.length)} sample rows and your definitions; the arithmetic runs on this device; the model key is the one saved in settings → ai keys.</p>
      </section>

      {stage && (
        <div className={`${card} flex items-center gap-2 p-5 text-xs text-white/55`} role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {STAGE_COPY[stage]}
        </div>
      )}

      {error && (
        <div className={`${card} p-5 text-xs text-rose-200/80`} role="alert">
          {error}
          <div className="mt-2"><button type="button" className={chip} onClick={() => void ask()} disabled={!ready}>try again</button></div>
        </div>
      )}

      {answer && !stage && (
        <article className={`${card} space-y-4 p-5`}>
          <div className="text-[11px] text-white/40">{asked}</div>
          <p className="text-[15px] leading-relaxed text-white/90">{answer.finding}</p>

          {answer.evidence.length > 0 && (
            <ul className="space-y-1 border-l border-white/10 pl-3 text-[12px] text-white/60">
              {answer.evidence.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}

          {answer.computed && answer.computed.rows.length > 0 && (
            <details className="text-[11px] text-white/55" open={answer.computed.rows.length <= 6}>
              <summary className="cursor-pointer">computed on this device · {answer.computed.note} · {answer.computed.rowsUsed.toLocaleString()} rows</summary>
              <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-white/10">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-white/[0.06]"><tr>{answer.computed.columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-1.5 font-normal text-white/60">{c}</th>)}</tr></thead>
                  <tbody>
                    {answer.computed.rows.map((r, i) => (
                      <tr key={i} className="border-t border-white/5">{answer.computed!.columns.map((c) => <td key={c} className="px-3 py-1 text-white/75">{typeof r[c] === "number" ? (r[c] as number).toLocaleString() : String(r[c] ?? "")}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {answer.pattern && (
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[12px]">
              <span className="text-white/45">pattern · {answer.pattern.domain}</span>
              <div className="mt-1 text-white/80">{answer.pattern.name}</div>
              <p className="mt-1 text-white/55">{answer.pattern.explanation}</p>
            </div>
          )}

          {answer.chart && <ChartRender spec={{ ...answer.chart, confidence: answer.confidence }} />}

          {answer.projection && (
            <div className="text-[12px] text-white/70"><span className="text-white/40">what to watch · </span>{answer.projection}</div>
          )}
          {answer.clarification && (
            <div className="rounded-xl border border-amber-200/20 bg-amber-200/[0.04] p-3 text-[12px] text-amber-100/80">{answer.clarification}</div>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/8 pt-3 text-[11px] text-white/45">
            <span>confidence {answer.confidence}</span>
            <span>
              {answer.confidence_drivers.completeness}% complete · {answer.confidence_drivers.rows.toLocaleString()} rows ·
              {answer.confidence_drivers.computed ? " computed here" : " no computation"} · {answer.confidence_drivers.structured ? "structured reply" : "unstructured reply"}
            </span>
          </div>

          <details className="text-[11px] text-white/45">
            <summary className="cursor-pointer text-white/55">how this answer was reached</summary>
            <div className="mt-2 space-y-1">
              <div>plan: {answer.reasoning.plan}</div>
              <div>grounding: {answer.reasoning.grounding}</div>
              <div>model: {answer.reasoning.model} · confidence graded on this device from completeness, rows, computation and reply shape</div>
            </div>
          </details>
        </article>
      )}

      {history.length > 0 && (
        <section className={`${card} p-4`}>
          <h3 className={eyebrow}>recent questions</h3>
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
  );
}
