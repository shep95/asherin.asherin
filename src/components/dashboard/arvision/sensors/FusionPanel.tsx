// asherin.arvision — fusion pipeline and sensor auto selection.

import type { FusionStage, FusionTask, SensorSelection } from "@/lib/arvision/sensors/fusion";
import { FUSION_TASKS } from "@/lib/arvision/sensors/fusion";
import { MODALITY_LABEL } from "@/lib/arvision/sensors/types";

const TONE: Record<FusionStage["state"], string> = {
  ready: "border-emerald-300/25 bg-emerald-300/[0.07] text-emerald-100/90",
  partial: "border-amber-300/25 bg-amber-300/[0.06] text-amber-100/85",
  blocked: "border-white/10 bg-black/30 text-white/45",
};

interface Props {
  stages: FusionStage[];
  selection: SensorSelection;
  task: FusionTask;
  onTask: (t: FusionTask) => void;
}

const FusionPanel = ({ stages, selection, task, onTask }: Props) => (
  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
    <header className="mb-3">
      <h2 className="text-[13px] font-light text-white/85">fusion pipeline</h2>
      <p className="text-[11px] font-light text-white/40">
        scene · streams · calibration · registration · synchronization · quality · fusion · understanding · perception
      </p>
    </header>

    <div className="mb-3 flex flex-wrap gap-1.5">
      {FUSION_TASKS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onTask(t.id)}
          title={t.note}
          className={`rounded-full border px-3 py-1.5 text-[11px] font-light transition ${
            task === t.id
              ? "border-white/40 bg-white/[0.12] text-white"
              : "border-white/12 bg-white/[0.03] text-white/55 hover:border-white/25 hover:text-white"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>

    <div className="mb-3 rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="text-[11px] font-light text-white/40">auto selection</p>
      <p className="mt-1 text-[12px] font-light leading-relaxed text-white/75">{selection.explanation}</p>
      {selection.unmet.length > 0 && (
        <p className="mt-1.5 text-[11px] font-light text-white/40">
          missing modalities: {selection.unmet.map((m) => MODALITY_LABEL[m]).join(", ")}
        </p>
      )}
    </div>

    <ol className="space-y-1.5">
      {stages.map((s) => (
        <li key={s.id} className={`rounded-xl border px-3 py-2 ${TONE[s.state]}`}>
          <div className="flex items-center justify-between gap-3 text-[12px] font-light">
            <span>{s.label}</span>
            <span className="text-[10px] uppercase tracking-wide opacity-70">{s.state}</span>
          </div>
          <p className="mt-0.5 text-[11px] font-light leading-relaxed opacity-70">{s.detail}</p>
        </li>
      ))}
    </ol>
  </section>
);

export default FusionPanel;
