// eagle.eye — the company console over the shared fabric.
//
// One building, several kinds of sensor, one record. The panel is organised the
// way an operator actually reasons: which devices am I authorized to run, which
// of them are alive right now, what did each of them observe, and where do two
// of them happen to agree.
//
// Three refusals are visible on the face of it:
//   * a camera whose feed is live but whose perception is dead is shown as a
//     live feed with unavailable inference, never as a camera with nothing to
//     report.
//   * a sensor that stopped is a coverage gap, not a quiet period.
//   * a correlation is a coincidence with a measured time gap. it never names
//     a person and it never chooses between candidates.

import { useMemo } from "react";
import { Activity, Bluetooth, Camera, Link2, Mic, MapPin, ShieldQuestion } from "lucide-react";
import { useSensorFabric } from "@/hooks/useSensorFabric";
import { QUERY_CAPABILITIES } from "@/lib/fabric/query";
import { skewLine } from "@/lib/fabric/clock";
import type { FabricObservation, FabricSensor } from "@/lib/fabric/types";

const MODALITY_ICON = {
  vision: Camera,
  radio: Bluetooth,
  audio: Mic,
  location: MapPin,
  service: Activity,
} as const;

const HEALTH_STYLE: Record<FabricSensor["health"], string> = {
  live: "text-emerald-300/80",
  stale: "text-amber-300/80",
  unavailable: "text-white/35",
  denied: "text-rose-300/80",
  error: "text-rose-300/80",
};

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });

function claimChip(o: FabricObservation) {
  const kind = o.provenance.kind;
  const label =
    kind === "raw_observation"
      ? "measured"
      : kind === "derived_estimate"
        ? "derived"
        : kind === "model_inference"
          ? "model"
          : "human";
  const tone =
    kind === "raw_observation"
      ? "border-emerald-400/25 text-emerald-200/80"
      : kind === "derived_estimate"
        ? "border-amber-400/25 text-amber-200/80"
        : kind === "model_inference"
          ? "border-sky-400/25 text-sky-200/80"
          : "border-white/25 text-white/70";
  return <span className={`rounded-full border px-1.5 py-[1px] text-[9px] font-light ${tone}`}>{label}</span>;
}

export default function FabricConsolePanel() {
  const { snapshot } = useSensorFabric();

  const grouped = useMemo(() => {
    const order: Array<FabricSensor["modality"]> = ["vision", "radio", "audio", "location", "service"];
    return order.map((m) => ({ modality: m, sensors: snapshot.sensors.filter((s) => s.modality === m) }));
  }, [snapshot.sensors]);

  const recent = useMemo(() => [...snapshot.observations].sort((a, b) => b.atMs - a.atMs).slice(0, 40), [snapshot.observations]);
  const correlations = useMemo(() => [...snapshot.correlations].sort((a, b) => b.atMs - a.atMs).slice(0, 12), [snapshot.correlations]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <ShieldQuestion className="h-3.5 w-3.5 text-white/50" />
        <span className="text-[12px] font-light tracking-wide text-white/80">company console — shared sensor fabric</span>
        <span className="ml-auto text-[10px] font-light text-white/30">{snapshot.sensors.length} authorized sensors · {snapshot.observations.length} observations held</span>
      </div>

      {snapshot.unavailable.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-black/40 p-2.5 text-[10.5px] font-light leading-relaxed text-white/40">
          {snapshot.unavailable.map((u) => (
            <div key={u.modality}>
              <span className="text-white/60">{u.modality} unavailable</span> — {u.reason}
            </div>
          ))}
        </div>
      )}

      {/* sensors by modality */}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {grouped
          .filter((g) => g.sensors.length > 0)
          .map((g) => {
            const Icon = MODALITY_ICON[g.modality];
            return (
              <div key={g.modality} className="rounded-xl border border-white/10 bg-black/30 p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/35">
                  <Icon className="h-3 w-3" /> {g.modality}
                </div>
                {g.sensors.map((s) => (
                  <div key={s.id} className="mb-1.5 last:mb-0">
                    <div className="flex items-center gap-1.5 text-[11.5px] font-light text-white/75">
                      <span className="truncate">{s.label}</span>
                      <span className={`ml-auto text-[10px] ${HEALTH_STYLE[s.health]}`}>{s.health}</span>
                    </div>
                    <div className="text-[10px] font-light leading-relaxed text-white/35">{s.healthDetail}</div>
                    <div className="text-[9.5px] font-light text-white/25">
                      {s.authorization.replace(/_/g, " ")}
                      {s.spatiallyRegistered ? " · surveyed into the site frame" : " · no surveyed position"}
                      {s.lastObservationMs ? ` · last ${clock(s.lastObservationMs)}` : " · never reported"}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
      </div>

      {/* observation timeline */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-white/35">observation timeline</div>
        {recent.length === 0 ? (
          <div className="text-[11px] font-light leading-relaxed text-white/40">
            nothing has been published into the fabric in this session. that means no authorized sensor reported — it does not mean the building was quiet.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {recent.map((o) => (
              <div key={o.id} className="flex items-start gap-2 border-b border-white/[0.04] pb-1 last:border-0">
                <span className="w-[62px] shrink-0 text-[10px] font-light tabular-nums text-white/30">{clock(o.atMs)}</span>
                {claimChip(o)}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-light text-white/75">{o.summary}</div>
                  <div className="truncate text-[9.5px] font-light text-white/30">
                    {o.provenance.sensorLabel} · {o.provenance.adapter}
                    {o.zoneLabel ? ` · zone ${o.zoneLabel}` : ""}
                  </div>
                  <div className="truncate text-[9px] font-light text-white/20">{skewLine(o.provenance)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* correlations */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/35">
          <Link2 className="h-3 w-3" /> cross-modal correlation
        </div>
        {correlations.length === 0 ? (
          <div className="text-[11px] font-light leading-relaxed text-white/40">
            no correlation has been drawn. two observations are only linked when both carry the same configured zone, both clocks are trusted, and the gap between them survives the skew-widened window — or when a positioning region genuinely overlaps a surveyed camera. anything looser is a guess and is not shown.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {correlations.map((c) => (
              <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
                <div className="flex items-center gap-1.5 text-[11px] font-light text-white/75">
                  <span>{c.kind.replace(/_/g, " ")}</span>
                  <span className="text-white/30">· {c.deltaMs}ms apart</span>
                  {c.candidateCount > 1 && (
                    <span className="rounded-full border border-amber-400/25 px-1.5 text-[9px] text-amber-200/80">{c.candidateCount} candidates — none chosen</span>
                  )}
                  <span className="ml-auto rounded-full border border-white/15 px-1.5 text-[9px] text-white/50">{c.attribution.replace(/_/g, " ")}</span>
                </div>
                {c.evidence.map((e, i) => (
                  <div key={i} className="text-[10px] font-light leading-relaxed text-white/40">{e}</div>
                ))}
                <div className="mt-1 text-[9.5px] font-light leading-relaxed text-white/25">{c.limitation}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* what search can and cannot reach */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-2.5">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-white/35">search and rewind</div>
        {QUERY_CAPABILITIES.map((q) => (
          <div key={q.question} className="flex items-start gap-2 text-[10.5px] font-light leading-relaxed">
            <span className={q.available ? "text-emerald-300/70" : "text-white/25"}>{q.available ? "available" : "unavailable"}</span>
            <span className="text-white/60">{q.question}</span>
            <span className="text-white/30">— {q.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
