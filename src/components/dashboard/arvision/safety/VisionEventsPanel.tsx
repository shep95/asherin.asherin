// asherin.arvision — what the cameras currently observe.
//
// Three separate truths live here and are never blended: whether anything is
// watching at all, what is open right now, and what was measured but held back
// for being too weakly evidenced to report. An operator who only sees the
// middle list would mistake "not watching" for "nothing happening".

import { EVENT_LABEL } from "@/lib/arvision/vision/eventEngine";
import type { VisionSnapshot } from "@/lib/arvision/vision/bridge";

const STATE_STYLE: Record<string, string> = {
  no_camera: "border-white/15 bg-white/5 text-white/45",
  model_loading: "border-sky-400/25 bg-sky-400/10 text-sky-200/85",
  model_failed: "border-rose-400/25 bg-rose-400/10 text-rose-200/85",
  running: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200/85",
  stalled: "border-amber-400/25 bg-amber-400/10 text-amber-200/85",
};

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

const VisionEventsPanel = ({ snapshot }: { snapshot: VisionSnapshot }) => {
  const { cameras, events, resolved, custody, suppressed, zoneProblems, availability } = snapshot;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <h2 className="text-[12px] font-light text-white/80">camera events</h2>
      <p className="mt-1 text-[11px] font-light leading-relaxed text-white/40">
        every line below is a measurement taken from frames on this device: a duration, a count or a crossing. nothing here
        infers who anyone is, what they intend, or whether they are dangerous.
      </p>

      {availability ? (
        <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-[11px] font-light leading-relaxed text-amber-200/80">
          {availability}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {cameras.length === 0 ? (
          <span className="rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-[10px] font-light text-white/40">
            no camera attached
          </span>
        ) : (
          cameras.map((c) => (
            <span key={c.cameraId} className={`rounded-lg border px-2 py-1 text-[10px] font-light ${STATE_STYLE[c.state] ?? STATE_STYLE.no_camera}`}>
              {c.cameraLabel} · {c.state.replace(/_/g, " ")}
              {c.framesAnalysed ? ` · ${c.framesAnalysed} frames` : ""}
              {c.lastInferenceMs !== null ? ` · ${Math.round(c.lastInferenceMs)}ms` : ""}
            </span>
          ))
        )}
      </div>

      {zoneProblems.length > 0 && (
        <ul className="mt-3 space-y-1">
          {zoneProblems.map((p) => (
            <li key={p.zoneId} className="text-[11px] font-light text-rose-200/75">{p.detail}</li>
          ))}
        </ul>
      )}

      <h3 className="mt-4 text-[11px] font-light text-white/55">open now</h3>
      {events.length === 0 ? (
        <p className="mt-1 text-[11px] font-light text-white/35">
          {cameras.some((c) => c.state === "running")
            ? "the configured thresholds are being measured and none is currently exceeded."
            : "nothing is open, because nothing is being measured."}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {events.map((e) => (
            <li key={e.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[11.5px] font-light text-white/85">{EVENT_LABEL[e.type]}</span>
                <span className="text-[10px] font-light text-white/40">
                  {e.cameraLabel}{e.zoneLabel ? ` · ${e.zoneLabel}` : ""} · opened {ago(e.openedAtMs)}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-light leading-relaxed text-white/55">{e.detail}</p>
              <div className="mt-1.5 flex flex-wrap gap-2 text-[10px] font-light text-white/40">
                <span>measured {e.value}{e.valueUnit === "seconds" ? "s" : ""}</span>
                <span>confidence {Math.round(e.confidence * 100)}%</span>
                <span>{e.associationCertain ? "association held by continuous tracking" : "association uncertain — tracking was interrupted"}</span>
                <span>{e.incidentId ? `incident ${e.incidentId.slice(0, 10)}` : "no incident opened"}</span>
              </div>
              {e.evidence.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {e.evidence.map((ev, i) => (
                    <li key={i} className="text-[10px] font-light text-white/35">· {ev}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-4 text-[11px] font-light text-white/55">object custody</h3>
      {custody.length === 0 ? (
        <p className="mt-1 text-[11px] font-light text-white/35">no object is currently being followed.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {custody.map((c) => (
            <li key={c.objectId} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-white/8 bg-black/30 px-2.5 py-1.5">
              <span className="text-[11px] font-light text-white/75">{c.label}</span>
              <span className="text-[10px] font-light text-white/40">
                {c.outcome.replace(/_/g, " ")}
                {c.ownerTrackId ? ` · with ${c.ownerTrackId.split("::").pop()}` : " · no associated track"}
                {c.unattendedSinceMs ? ` · unattended ${Math.round((Date.now() - c.unattendedSinceMs) / 1000)}s` : ""}
                {c.present ? "" : " · no longer in frame"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <>
          <h3 className="mt-4 text-[11px] font-light text-white/55">recently closed</h3>
          <ul className="mt-1 space-y-0.5">
            {resolved.slice().reverse().map((e) => (
              <li key={e.id} className="text-[10.5px] font-light text-white/40">
                {EVENT_LABEL[e.type]} · {e.cameraLabel} · closed {ago(e.updatedAtMs)}
              </li>
            ))}
          </ul>
        </>
      )}

      {suppressed.length > 0 && (
        <>
          <h3 className="mt-4 text-[11px] font-light text-white/55">measured but not reported</h3>
          <p className="mt-1 text-[10.5px] font-light text-white/35">
            held back for weak evidence. shown so a missed event is visible rather than silent.
          </p>
          <ul className="mt-1 space-y-0.5">
            {suppressed.slice().reverse().slice(0, 12).map((s, i) => (
              <li key={`${s.atMs}-${i}`} className="text-[10.5px] font-light text-white/35">
                {EVENT_LABEL[s.type]} · {Math.round(s.confidence * 100)}% · {s.reason} · {ago(s.atMs)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
};

export default VisionEventsPanel;
