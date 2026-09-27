// asherin.arvision — incident timeline with human review.
//
// Nothing in this list is a conclusion. Each entry says which configured
// threshold was exceeded, what reported it, and what evidence exists. Only a
// person can mark one confirmed, dismissed, or a false positive — and marking a
// false positive is how a noisy rule becomes visible instead of tolerated.

import { useState } from "react";
import type { Incident, ReviewState } from "@/lib/arvision/safety/incidents";

const BAND: Record<string, string> = {
  informational: "border-white/10 bg-black/30 text-white/45",
  review: "border-amber-300/25 bg-amber-300/[0.06] text-amber-100/80",
  priority: "border-rose-300/25 bg-rose-300/[0.06] text-rose-100/80",
};

const REVIEW_LABEL: Record<ReviewState, string> = {
  needs_review: "needs review",
  confirmed: "confirmed by an operator",
  false_positive: "marked a false positive",
  dismissed: "dismissed",
};

const IncidentTimelinePanel = ({
  incidents,
  operator,
  onReview,
  onOpenEvidence,
}: {
  incidents: Incident[];
  operator: string;
  onReview: (id: string, state: ReviewState, note?: string) => void;
  onOpenEvidence: (evidenceId: string) => void;
}) => {
  const [note, setNote] = useState<Record<string, string>>({});

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <header className="mb-3">
        <h2 className="text-[13px] font-light text-white/85">incidents</h2>
        <p className="text-[11px] font-light text-white/40">
          objective thresholds that were exceeded. these are events in a place, not assessments of any person, and the system takes no action on them.
        </p>
      </header>

      {incidents.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] font-light text-white/40">
          no configured rule has been exceeded in the retention window.
        </p>
      ) : (
        <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {incidents.map((inc) => (
            <li key={inc.id} className={`rounded-xl border p-3 ${BAND[inc.severity.band] ?? BAND.informational}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-light text-white/90">{inc.label}</span>
                <span className="text-[10px] uppercase tracking-wide">{inc.severity.band}</span>
              </div>
              <p className="mt-1 text-[10px] font-light text-white/35">
                opened {new Date(inc.openedAtMs).toLocaleString()} · {inc.firings.length} firing
                {inc.firings.length === 1 ? "" : "s"} collapsed · {inc.zoneId ?? "site wide"} · {inc.provenance}
              </p>
              <ul className="mt-1 space-y-0.5">
                {inc.severity.contributions.map((c) => (
                  <li key={c.ruleId} className="text-[11px] font-light leading-relaxed text-white/50">— {c.detail}</li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] font-light italic text-white/30">{inc.severity.statement}</p>

              <p className="mt-2 text-[10px] font-light text-white/40">
                evidence: {inc.evidenceState.replace(/_/g, " ")} — {inc.evidenceDetail}
                {inc.evidenceId && (
                  <button
                    type="button"
                    onClick={() => onOpenEvidence(inc.evidenceId!)}
                    className="ml-2 rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/70 hover:border-white/30"
                  >
                    open frames
                  </button>
                )}
              </p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-white/40">
                  {REVIEW_LABEL[inc.review]}
                  {inc.reviewedBy ? ` · ${inc.reviewedBy}` : ""}
                </span>
                <input
                  value={note[inc.id] ?? ""}
                  onChange={(e) => setNote((n) => ({ ...n, [inc.id]: e.target.value }))}
                  placeholder="review note"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] font-light text-white/80 outline-none placeholder:text-white/25 focus:border-white/25"
                />
                {(["confirmed", "false_positive", "dismissed"] as ReviewState[]).map((state) => (
                  <button
                    key={state}
                    type="button"
                    onClick={() => onReview(inc.id, state, note[inc.id])}
                    className="rounded-lg border border-white/15 px-2 py-1 text-[10px] font-light text-white/70 hover:border-white/30"
                  >
                    {state.replace(/_/g, " ")}
                  </button>
                ))}
              </div>

              {inc.notes.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {inc.notes.map((n, i) => (
                    <li key={i} className="text-[10px] font-light text-white/35">
                      {new Date(n.atMs).toLocaleTimeString()} {n.author}: {n.text}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] font-light text-white/25">reviewing as {operator}</p>
    </section>
  );
};

export default IncidentTimelinePanel;
