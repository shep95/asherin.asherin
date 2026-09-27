// asherin.arvision — rule configuration.
//
// Rules are data an operator owns: a subject, a threshold in a real unit, a
// weight, and a written reason it exists. Any rule naming appearance, posture,
// gaze, demographics, intent or suspicion is refused by the engine and listed
// here as refused, so the boundary is visible rather than merely promised.

import type { SafetyRule } from "@/lib/arvision/safety/rules";
import { FORBIDDEN_SIGNALS } from "@/lib/arvision/safety/rules";

const SafetyRulesPanel = ({
  rules,
  rejected,
  onChange,
}: {
  rules: SafetyRule[];
  rejected: string[];
  onChange: (rules: SafetyRule[]) => void;
}) => {
  const patch = (id: string, next: Partial<SafetyRule>) =>
    onChange(rules.map((r) => (r.id === id ? { ...r, ...next } : r)));

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <header className="mb-3">
        <h2 className="text-[13px] font-light text-white/85">event rules</h2>
        <p className="text-[11px] font-light text-white/40">
          thresholds on things that objectively happen in the space. severity comes only from these.
        </p>
      </header>

      <ul className="space-y-2">
        {rules.map((r) => (
          <li key={r.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] font-light text-white/85">{r.label}</span>
              <label className="flex items-center gap-1.5 text-[10px] font-light text-white/45">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => patch(r.id, { enabled: e.target.checked })}
                  className="accent-white/60"
                />
                enabled
              </label>
            </div>
            <p className="mt-1 text-[11px] font-light leading-relaxed text-white/45">{r.rationale}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-light text-white/40">
              <label className="flex items-center gap-1">
                threshold
                <input
                  type="number"
                  value={r.threshold}
                  onChange={(e) => patch(r.id, { threshold: Number(e.target.value) })}
                  className="w-20 rounded border border-white/10 bg-black/50 px-1.5 py-0.5 text-white/80 outline-none focus:border-white/25"
                />
                {r.unit}
              </label>
              <label className="flex items-center gap-1">
                weight
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={r.weight}
                  onChange={(e) => patch(r.id, { weight: Math.max(0, Math.min(1, Number(e.target.value))) })}
                  className="w-20 rounded border border-white/10 bg-black/50 px-1.5 py-0.5 text-white/80 outline-none focus:border-white/25"
                />
              </label>
              <label className="flex items-center gap-1">
                collapse repeats for
                <input
                  type="number"
                  value={Math.round(r.dedupeWindowMs / 1000)}
                  onChange={(e) => patch(r.id, { dedupeWindowMs: Math.max(0, Number(e.target.value)) * 1000 })}
                  className="w-20 rounded border border-white/10 bg-black/50 px-1.5 py-0.5 text-white/80 outline-none focus:border-white/25"
                />
                s
              </label>
              <span className="text-white/25">signal {r.signal}</span>
            </div>
          </li>
        ))}
      </ul>

      {rejected.length > 0 && (
        <ul className="mt-3 space-y-1">
          {rejected.map((r, i) => (
            <li key={i} className="text-[11px] font-light text-rose-100/70">— {r}</li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[10px] font-light leading-relaxed text-white/30">
        permanently refused as severity inputs: {FORBIDDEN_SIGNALS.join(", ")}. this console scores events in a place, never people.
      </p>
    </section>
  );
};

export default SafetyRulesPanel;
