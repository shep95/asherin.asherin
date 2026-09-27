// asherin.arvision — camera mode matrix.
// A mode is enabled only when hardware that can physically satisfy it is live.
// Disabled modes stay visible with the reason, because "not supported here" is
// information an operator needs before they go into a building.

import type { ModeAvailability } from "@/lib/arvision/sensors/modes";

const ModeMatrixPanel = ({ modes }: { modes: ModeAvailability[] }) => (
  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
    <header className="mb-3">
      <h2 className="text-[13px] font-light text-white/85">camera modes</h2>
      <p className="text-[11px] font-light text-white/40">
        each mode is a claim about physics; it turns on when a stream that can make that claim is live
      </p>
    </header>
    <ul className="grid gap-2 sm:grid-cols-2">
      {modes.map(({ mode, enabled, reason, sensorId }) => (
        <li
          key={mode.id}
          className={`rounded-xl border p-3 ${
            enabled ? "border-emerald-300/25 bg-emerald-300/[0.06]" : "border-white/10 bg-black/30"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[12px] font-light ${enabled ? "text-white/90" : "text-white/50"}`}>{mode.label}</span>
            <span className={`text-[10px] ${enabled ? "text-emerald-200/80" : "text-white/35"}`}>
              {enabled ? "available" : "unsupported"}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-light leading-relaxed text-white/45">
            {enabled ? mode.description : reason}
          </p>
          {enabled && sensorId && (
            <p className="mt-1 text-[10px] font-light text-white/30">served by {sensorId}</p>
          )}
        </li>
      ))}
    </ul>
  </section>
);

export default ModeMatrixPanel;
