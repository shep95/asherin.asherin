// temporal layer panel: a dated read of everything in the record, saved snapshots with a diff
// between any two, forward trajectory projections with widening uncertainty bands, and the
// what-if scenario table. nothing here is a diagnosis or a guaranteed outcome.
import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { cn } from "@/lib/utils";
import type { HealthPanelProps } from "@/lib/health/panel";
import { buildTimeline, snapshotRecord, compareSnapshots, type TimelineKind } from "@/lib/health/temporal/timeline";
import { buildTrajectories, whatIf, type WhatIfInput, type WhatIfEstimate } from "@/lib/health/temporal/trajectory";

type SubTab = "timeline" | "snapshots" | "trajectories" | "what-if";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "timeline", label: "timeline" },
  { id: "snapshots", label: "snapshots" },
  { id: "trajectories", label: "trajectories" },
  { id: "what-if", label: "what-if" },
];

const KIND_LABEL: Record<TimelineKind, string> = {
  lab: "lab",
  pain: "pain",
  symptom: "symptom",
  surgery: "surgery",
  "body-solve": "body model",
  observation: "observation",
  snapshot: "snapshot",
  session: "session",
  "wearable-range": "wearable",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

export default function TimelinePanel({ record, persist }: HealthPanelProps) {
  const [sub, setSub] = useState<SubTab>("timeline");
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [aId, setAId] = useState<string>("");
  const [bId, setBId] = useState<string>("");

  const [sleepHours, setSleepHours] = useState(7);
  const [activityMinutes, setActivityMinutes] = useState(150);
  const [weightDeltaKg, setWeightDeltaKg] = useState(0);
  const [alcoholUnits, setAlcoholUnits] = useState(0);
  const [smokingStopped, setSmokingStopped] = useState(false);
  const [medicationChange, setMedicationChange] = useState<WhatIfInput["medicationChange"] | "">("");
  const [scenario, setScenario] = useState<{ estimates: WhatIfEstimate[]; caveat: string } | null>(null);

  const timeline = useMemo(() => buildTimeline(record), [record]);
  const trajectories = useMemo(() => buildTrajectories(record), [record]);
  const snapshots = record.snapshots;

  const diff = useMemo(() => {
    const a = snapshots.find((s) => s.id === aId);
    const b = snapshots.find((s) => s.id === bId);
    if (!a || !b) return null;
    const [earlier, later] = a.at <= b.at ? [a, b] : [b, a];
    return { earlier, later, result: compareSnapshots(earlier, later) };
  }, [snapshots, aId, bId]);

  const saveSnapshot = () => {
    const snap = snapshotRecord(record, snapshotLabel.trim() || `snapshot ${fmtDate(new Date().toISOString())}`);
    persist({ ...record, snapshots: [...record.snapshots, snap] });
    setSnapshotLabel("");
  };

  const runWhatIf = () => {
    const input: WhatIfInput = {
      sleepHours,
      activityMinutes,
      weightDeltaKg,
      alcoholUnits,
      smokingStopped,
      ...(medicationChange ? { medicationChange } : {}),
    };
    setScenario(whatIf(input));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-[10px] font-light tracking-wide transition-colors",
              sub === t.id ? "bg-amber-400/15 text-amber-200" : "text-foreground/45 hover:text-foreground/70",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "timeline" && (
        <div className="space-y-2">
          <p className="text-[10px] font-light leading-relaxed text-foreground/40">
            every dated element recorded in this room, oldest first.
          </p>
          {timeline.length === 0 && (
            <p className="text-[10px] font-light text-foreground/35">not enough in your record yet to build a timeline.</p>
          )}
          <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {[...timeline].reverse().map((e) => (
              <div key={e.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-light text-foreground/80">{e.label}</p>
                  <span className="text-[9px] text-foreground/30">{fmtDate(e.at)}</span>
                </div>
                <p className="mt-0.5 text-[9px] uppercase tracking-widest text-foreground/25">{KIND_LABEL[e.kind]}</p>
                <p className="mt-1 text-[10px] font-light leading-relaxed text-foreground/40">{e.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {sub === "snapshots" && (
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="text-[10px] font-light leading-relaxed text-foreground/40">
              save a snapshot now: it holds the record's current findings and headline metrics for comparison later.
            </p>
            <div className="flex gap-1.5">
              <input
                value={snapshotLabel}
                onChange={(e) => setSnapshotLabel(e.target.value)}
                placeholder="label (optional)"
                className="h-8 flex-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80 placeholder:text-foreground/25"
              />
              <button
                onClick={saveSnapshot}
                className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 text-[10px] font-light text-amber-200 hover:bg-amber-400/15"
              >
                save a snapshot now
              </button>
            </div>
          </div>

          {snapshots.length === 0 && (
            <p className="text-[10px] font-light text-foreground/35">no snapshots saved yet.</p>
          )}

          {snapshots.length > 0 && (
            <div className="space-y-1.5">
              {[...snapshots].reverse().map((s) => (
                <div key={s.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-light text-foreground/80">{s.label}</p>
                    <span className="text-[9px] text-foreground/30">{fmtDate(s.at)}</span>
                  </div>
                  <p className="text-[9px] font-light text-foreground/30">{s.findings.length} findings held.</p>
                </div>
              ))}
            </div>
          )}

          {snapshots.length >= 2 && (
            <div className="space-y-2 border-t border-white/[0.06] pt-3">
              <p className="text-[9px] uppercase tracking-widest text-foreground/30">compare two snapshots</p>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={aId}
                  onChange={(e) => setAId(e.target.value)}
                  className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80"
                >
                  <option value="">first snapshot</option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id}>{s.label} · {fmtDate(s.at)}</option>
                  ))}
                </select>
                <select
                  value={bId}
                  onChange={(e) => setBId(e.target.value)}
                  className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80"
                >
                  <option value="">second snapshot</option>
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id}>{s.label} · {fmtDate(s.at)}</option>
                  ))}
                </select>
              </div>

              {diff && (
                <div className="space-y-3">
                  <p className="text-[9px] font-light text-foreground/30">
                    comparing {fmtDate(diff.earlier.at)} → {fmtDate(diff.later.at)}
                  </p>

                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-foreground/30">added</p>
                    {diff.result.added.length === 0 && <p className="text-[10px] font-light text-foreground/35">none.</p>}
                    {diff.result.added.map((f) => (
                      <p key={f.id} className="text-[10px] font-light text-foreground/60">{f.label}</p>
                    ))}
                  </div>

                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-foreground/30">resolved</p>
                    {diff.result.resolved.length === 0 && <p className="text-[10px] font-light text-foreground/35">none.</p>}
                    {diff.result.resolved.map((f) => (
                      <p key={f.id} className="text-[10px] font-light text-foreground/60">{f.label}</p>
                    ))}
                  </div>

                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-foreground/30">worsened</p>
                    {diff.result.worsened.length === 0 && <p className="text-[10px] font-light text-foreground/35">none.</p>}
                    {diff.result.worsened.map((w) => (
                      <p key={w.id} className="text-[10px] font-light text-foreground/60">{w.label} — {w.from.toFixed(2)} → {w.to.toFixed(2)}</p>
                    ))}
                  </div>

                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-foreground/30">improved</p>
                    {diff.result.improved.length === 0 && <p className="text-[10px] font-light text-foreground/35">none.</p>}
                    {diff.result.improved.map((w) => (
                      <p key={w.id} className="text-[10px] font-light text-foreground/60">{w.label} — {w.from.toFixed(2)} → {w.to.toFixed(2)}</p>
                    ))}
                  </div>

                  {diff.result.metricChanges.length > 0 && (
                    <div>
                      <p className="text-[9px] uppercase tracking-widest text-foreground/30">metric changes</p>
                      {diff.result.metricChanges.map((m) => (
                        <p key={m.key} className="text-[10px] font-light text-foreground/40">
                          {m.key}: {m.from} → {m.to} ({m.delta > 0 ? "+" : ""}{m.delta.toFixed(2)})
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {sub === "trajectories" && (
        <div className="space-y-3">
          <p className="text-[10px] font-light leading-relaxed text-foreground/40">
            straight-line projections of trends already in your record — never a prediction, only a modelled continuation. bands widen with distance.
          </p>
          {trajectories.length === 0 && (
            <p className="text-[10px] font-light text-foreground/35">not enough in your record yet to project a trajectory — this needs repeated labs, wearable series, or multiple body solves.</p>
          )}
          {trajectories.map((t) => {
            const chartData = [
              ...t.history.map((h) => ({ x: fmtDate(h.t), history: h.v })),
              ...t.points.map((p) => ({ x: `+${p.monthsAhead}mo`, low: p.low, band: p.high - p.low, expected: p.expected })),
            ];
            return (
              <div key={t.metricKey} className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-light text-foreground/80">{t.label} {t.unit ? `(${t.unit})` : ""}</p>
                  <span className="text-[9px] text-foreground/30">{t.direction} · confidence {Math.round(t.confidence * 100)}%</span>
                </div>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="x" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} />
                      <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 10 }} />
                      <Legend wrapperStyle={{ fontSize: 9 }} />
                      <Area type="monotone" dataKey="low" stackId="band" stroke="none" fill="transparent" name="low" />
                      <Area type="monotone" dataKey="band" stackId="band" stroke="none" fill="rgba(251,191,36,0.15)" name="uncertainty band" />
                      <Area type="monotone" dataKey="expected" stroke="#fbbf24" fill="transparent" strokeWidth={1.5} name="expected" />
                      <Area type="monotone" dataKey="history" stroke="rgba(255,255,255,0.5)" fill="transparent" strokeWidth={1.5} name="recorded" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-0.5">
                  {t.assumptions.map((a, i) => (
                    <p key={i} className="text-[9px] font-light leading-relaxed text-foreground/30">· {a}</p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sub === "what-if" && (
        <div className="space-y-4">
          <p className="text-[10px] font-light leading-relaxed text-foreground/40">
            textbook directions of effect for a hypothetical change — not modelled from your data, and not a prediction of any outcome for you.
          </p>
          <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <label className="block space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-foreground/30">sleep (hours/night): {sleepHours}</span>
              <input type="range" min={3} max={11} step={0.5} value={sleepHours} onChange={(e) => setSleepHours(Number(e.target.value))} className="w-full accent-amber-400" />
            </label>
            <label className="block space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-foreground/30">activity (minutes/week): {activityMinutes}</span>
              <input type="range" min={0} max={420} step={10} value={activityMinutes} onChange={(e) => setActivityMinutes(Number(e.target.value))} className="w-full accent-amber-400" />
            </label>
            <label className="block space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-foreground/30">weight change (kg): {weightDeltaKg > 0 ? "+" : ""}{weightDeltaKg}</span>
              <input type="range" min={-15} max={15} step={0.5} value={weightDeltaKg} onChange={(e) => setWeightDeltaKg(Number(e.target.value))} className="w-full accent-amber-400" />
            </label>
            <label className="block space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-foreground/30">alcohol (units/week): {alcoholUnits}</span>
              <input type="range" min={0} max={40} step={1} value={alcoholUnits} onChange={(e) => setAlcoholUnits(Number(e.target.value))} className="w-full accent-amber-400" />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={smokingStopped} onChange={(e) => setSmokingStopped(e.target.checked)} className="accent-amber-400" />
              <span className="text-[10px] font-light text-foreground/60">smoking stopped</span>
            </label>
            <label className="block space-y-1">
              <span className="text-[9px] uppercase tracking-widest text-foreground/30">medication change</span>
              <select
                value={medicationChange}
                onChange={(e) => setMedicationChange(e.target.value as WhatIfInput["medicationChange"] | "")}
                className="h-8 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[11px] text-foreground/80"
              >
                <option value="">none</option>
                <option value="started">started</option>
                <option value="stopped">stopped</option>
                <option value="dose-increased">dose increased</option>
                <option value="dose-decreased">dose decreased</option>
              </select>
            </label>
            <button
              onClick={runWhatIf}
              className="w-full rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-[10px] font-light text-amber-200 hover:bg-amber-400/15"
            >
              run scenario
            </button>
          </div>

          {scenario && (
            <div className="space-y-2">
              {scenario.estimates.length === 0 && (
                <p className="text-[10px] font-light text-foreground/35">no scenario inputs set.</p>
              )}
              {scenario.estimates.map((e, i) => (
                <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-light text-foreground/80">{e.factor}</p>
                    <span className="text-[9px] text-amber-300/70">{e.magnitude}</span>
                  </div>
                  <p className="text-[10px] font-light text-foreground/50">{e.direction} — {e.target}</p>
                  <p className="mt-1 text-[10px] font-light leading-relaxed text-foreground/35">{e.mechanism}</p>
                </div>
              ))}
              <p className="text-[9px] font-light leading-relaxed text-foreground/30">{scenario.caveat}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
