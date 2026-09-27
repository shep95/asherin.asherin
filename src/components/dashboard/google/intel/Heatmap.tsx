import { useMemo } from "react";

/**
 * 7×24 communication heatmap. Renders when the subject transmits, not how much
 * — the shape of a week is a behavioural signature, and its gaps are as
 * meaningful as its density.
 */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface HeatCell {
  day: number;  // 0–6
  hour: number; // 0–23
  count: number;
}

const Heatmap = ({
  cells,
  title,
  emptyNote,
}: {
  cells: HeatCell[];
  title: string;
  emptyNote?: string;
}) => {
  const { grid, max, total, peak, deadHours } = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    let t = 0;
    for (const c of cells) {
      if (c.day < 0 || c.day > 6 || c.hour < 0 || c.hour > 23) continue;
      g[c.day][c.hour] += c.count;
      t += c.count;
    }
    let m = 0;
    let pk = { day: 0, hour: 0, count: 0 };
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (g[d][h] > m) m = g[d][h];
        if (g[d][h] > pk.count) pk = { day: d, hour: h, count: g[d][h] };
      }
    }
    // Rule 2 — silence is data. Count the hours the subject never transmits in.
    const dead = Array.from({ length: 24 }, (_, h) => h).filter((h) =>
      g.every((row) => row[h] === 0)
    );
    return { grid: g, max: m, total: t, peak: pk, deadHours: dead };
  }, [cells]);

  const fmtHour = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

  return (
    <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
      <h3 className="text-xs font-light tracking-wide text-foreground">{title}</h3>

      {total === 0 ? (
        <p className="text-[11px] font-extralight text-muted-foreground/60 leading-relaxed">
          {emptyNote || "No timestamped traffic in the sampled window — the absence itself is the reading: this channel is currently dark."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-[440px]">
              <div className="flex gap-[2px] pl-8 mb-1">
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="flex-1 text-center text-[7px] text-muted-foreground/30 font-light">
                    {h % 6 === 0 ? h : ""}
                  </span>
                ))}
              </div>
              {grid.map((row, d) => (
                <div key={d} className="flex items-center gap-[2px] mb-[2px]">
                  <span className="w-8 text-[8px] text-muted-foreground/40 font-light shrink-0">{DAYS[d]}</span>
                  {row.map((v, h) => (
                    <div
                      key={h}
                      title={`${DAYS[d]} ${fmtHour(h)} — ${v} message${v === 1 ? "" : "s"}`}
                      className="flex-1 aspect-square rounded-[2px] border border-border/10"
                      style={{ backgroundColor: v ? `hsl(var(--foreground) / ${0.08 + (v / max) * 0.55})` : "transparent" }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1 pt-1">
            <p className="text-[10px] font-extralight text-muted-foreground/70">
              Peak transmission window: {DAYS[peak.day]} {fmtHour(peak.hour)} — {peak.count} of {total} messages
              ({Math.round((peak.count / total) * 100)}% of all traffic in a single hour-slot).
            </p>
            {deadHours.length > 0 && (
              <p className="text-[10px] font-extralight text-muted-foreground/50">
                {deadHours.length} of 24 hours are structurally silent every day of the week — a message arriving inside
                {" "}{fmtHour(deadHours[0])}–{fmtHour(deadHours[deadHours.length - 1])} would be off-pattern.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Heatmap;
