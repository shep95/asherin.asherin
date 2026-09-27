// asherin.arvision — sensor registry panel.
// One row per discovered stream: modality, topic, transport, health,
// calibration, units, provenance and measured quality. Blank means unknown, and
// unknown is printed as a dash rather than a number.

import { Loader2, RefreshCw } from "lucide-react";
import type { RegistrySnapshot, SensorDescriptor } from "@/lib/arvision/sensors/types";
import { MODALITY_LABEL } from "@/lib/arvision/sensors/types";

const HEALTH_TONE: Record<SensorDescriptor["health"], string> = {
  live: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100/90",
  opening: "border-white/20 bg-white/[0.06] text-white/70",
  stale: "border-amber-300/25 bg-amber-300/10 text-amber-100/85",
  unavailable: "border-white/12 bg-white/[0.03] text-white/45",
  denied: "border-rose-300/25 bg-rose-300/10 text-rose-100/85",
  error: "border-rose-300/25 bg-rose-300/10 text-rose-100/85",
};

const Field = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-baseline justify-between gap-3 text-[11px]">
    <span className="text-white/35">{k}</span>
    <span className="text-right font-light text-white/70">{v}</span>
  </div>
);

interface Props {
  snapshot: RegistrySnapshot;
  discovering: boolean;
  onDiscover: () => void;
  onOpen: (id: string) => void;
  onClose: (id: string) => void;
}

const SensorRegistryPanel = ({ snapshot, discovering, onDiscover, onOpen, onClose }: Props) => (
  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
    <header className="mb-3 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-[13px] font-light text-white/85">sensor registry</h2>
        <p className="text-[11px] font-light text-white/40">
          every connected stream, its modality and where its numbers come from
        </p>
      </div>
      <button
        type="button"
        onClick={onDiscover}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-light text-white/70 transition hover:border-white/30 hover:text-white"
      >
        {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        discover
      </button>
    </header>

    <div className="mb-4 space-y-1.5">
      {snapshot.adapters.map((a) => (
        <div key={a.id} className="rounded-xl border border-white/8 bg-black/30 px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="font-light text-white/70">{a.label}</span>
            <span className={a.reachable ? "text-emerald-200/80" : "text-white/40"}>
              {a.reachable ? "reachable" : "not reachable"}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-light leading-relaxed text-white/40">{a.detail}</p>
        </div>
      ))}
    </div>

    {snapshot.sensors.length === 0 ? (
      <p className="rounded-xl border border-white/8 bg-black/30 px-3 py-4 text-[12px] font-light text-white/45">
        no sensor is connected. grant camera permission or connect an edge node to publish streams.
      </p>
    ) : (
      <ul className="space-y-2">
        {snapshot.sensors.map((s) => (
          <li key={s.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-light text-white/85">{s.label}</p>
                <p className="text-[11px] font-light text-white/40">
                  {MODALITY_LABEL[s.modality]} · {s.provenance.topic}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] ${HEALTH_TONE[s.health]}`}>{s.health}</span>
                {s.transport === "browser_media" && s.modality !== "audio" && (
                  <button
                    type="button"
                    onClick={() => (s.health === "live" ? onClose(s.id) : onOpen(s.id))}
                    className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[10px] font-light text-white/70 transition hover:border-white/30 hover:text-white"
                  >
                    {s.health === "live" ? "close" : "open"}
                  </button>
                )}
              </div>
            </div>

            {s.statusDetail && <p className="mt-1.5 text-[11px] font-light text-white/45">{s.statusDetail}</p>}

            <div className="mt-2.5 grid gap-1 sm:grid-cols-2">
              <Field k="transport" v={s.transport.replace(/_/g, " ")} />
              <Field k="calibration" v={`${s.calibration.state} — ${s.calibration.detail}`} />
              <Field k="units" v={s.units.measurement ?? "no measurable unit"} />
              <Field k="frame format" v={s.units.frameFormat ?? "—"} />
              <Field k="resolution" v={s.resolution ? `${s.resolution.width}x${s.resolution.height}` : "—"} />
              <Field k="declared rate" v={s.declaredFps ? `${Math.round(s.declaredFps)} fps` : "—"} />
              <Field k="last sample" v={s.lastSampleMs ? new Date(s.lastSampleMs).toLocaleTimeString() : "—"} />
              <Field k="cadence" v={s.quality.cadence === null ? "—" : s.quality.cadence.toFixed(2)} />
              <Field k="signal" v={s.quality.signal === null ? "—" : s.quality.signal.toFixed(2)} />
              <Field k="latency" v={s.quality.latencyMs === null ? "—" : `${Math.round(s.quality.latencyMs)} ms`} />
              <Field k="vendor" v={s.provenance.vendor ?? "—"} />
              <Field k="driver" v={s.provenance.driver ?? "—"} />
              <Field k="measurable" v={s.measurable ? "yes" : "no — pictures only, no measurements"} />
            </div>
          </li>
        ))}
      </ul>
    )}
  </section>
);

export default SensorRegistryPanel;
