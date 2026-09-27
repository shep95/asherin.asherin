// asherin.arvision — detector health.
// A silent detector is not an all-clear. Each one is graded against the cadence
// it declared, and a failed detector says so loudly.

import { falsePositiveRate } from "@/lib/arvision/safety/detectors";
import type { DetectorHealth } from "@/lib/arvision/safety/detectors";

const TONE: Record<DetectorHealth["state"], string> = {
  unconfigured: "border-white/10 bg-black/30 text-white/40",
  starting: "border-sky-300/20 bg-sky-300/[0.05] text-sky-100/70",
  healthy: "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-100/80",
  degraded: "border-amber-300/25 bg-amber-300/[0.06] text-amber-100/80",
  failed: "border-rose-300/25 bg-rose-300/[0.06] text-rose-100/80",
};

const DetectorHealthPanel = ({ detectors }: { detectors: DetectorHealth[] }) => (
  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
    <header className="mb-3">
      <h2 className="text-[13px] font-light text-white/85">detector health</h2>
      <p className="text-[11px] font-light text-white/40">
        a quiet detector and a dead one look the same on a wall of screens, so each proves it is alive on its own cadence
      </p>
    </header>
    {detectors.length === 0 ? (
      <p className="rounded-xl border border-amber-200/20 bg-amber-200/[0.05] p-3 text-[11px] font-light leading-relaxed text-amber-100/70">
        no detector has claimed a heartbeat. event detection is not configured, which means the absence of incidents below carries no information.
      </p>
    ) : (
      <ul className="grid gap-2 sm:grid-cols-2">
        {detectors.map((d) => {
          const rate = falsePositiveRate(d);
          return (
            <li key={d.id} className={`rounded-xl border p-3 ${TONE[d.state]}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-light text-white/85">{d.label}</span>
                <span className="text-[10px] uppercase tracking-wide">{d.state}</span>
              </div>
              <p className="mt-1 text-[11px] font-light leading-relaxed text-white/45">{d.detail}</p>
              <p className="mt-1 text-[10px] font-light text-white/30">
                runtime {d.runtime} · expects a heartbeat every {Math.round(d.expectedIntervalMs / 1000)}s · {d.firings} firings
                {rate !== null ? ` · confirmed false positive rate ${rate}` : " · no review outcomes yet"}
              </p>
            </li>
          );
        })}
      </ul>
    )}
  </section>
);

export default DetectorHealthPanel;
