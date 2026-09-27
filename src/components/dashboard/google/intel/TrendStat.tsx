import { useMemo } from "react";
import { slope, mean, percentile, ordinal, round } from "@/lib/cloudIntel/logic";

/**
 * A level is a photograph; a trend is a film. Every stat in the mesh renders
 * its recent series, its direction, and where the current reading sits inside
 * the subject's own distribution — never a naked integer.
 */

export const Sparkline = ({
  series,
  height = 22,
  className = "",
}: {
  series: number[];
  height?: number;
  className?: string;
}) => {
  const path = useMemo(() => {
    if (series.length < 2) return null;
    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;
    const w = 100;
    const pts = series.map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = height - ((v - min) / span) * (height - 2) - 1;
      return `${round(x, 2)},${round(y, 2)}`;
    });
    return { line: `M${pts.join("L")}`, area: `M${pts.join("L")}L100,${height}L0,${height}Z` };
  }, [series, height]);

  if (!path) {
    return <div className={`h-[${height}px] ${className}`} aria-hidden />;
  }

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      role="img"
      aria-label={`Trend across ${series.length} intervals`}
    >
      <path d={path.area} className="fill-foreground/10" />
      <path d={path.line} className="stroke-foreground/60" strokeWidth={1} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export const TrendStat = ({
  label,
  value,
  series,
  population,
  unit = "",
  hint,
  loading,
}: {
  label: string;
  value: number | string;
  /** Recent history, oldest → newest. Drives the sparkline and the velocity. */
  series?: number[];
  /** Peer population for percentile context. */
  population?: number[];
  unit?: string;
  hint?: string;
  loading?: boolean;
}) => {
  const numeric = typeof value === "number" ? value : Number(value);
  const k = series && series.length >= 3 ? slope(series) : 0;
  const base = series && series.length ? mean(series) : 0;
  const direction = Math.abs(k) < (Math.abs(base) || 1) * 0.02 ? "flat" : k > 0 ? "rising" : "falling";
  const pct =
    population && population.length >= 4 && Number.isFinite(numeric)
      ? percentile(numeric, population)
      : null;

  return (
    <div className="rounded-2xl border border-border/20 bg-card/25 backdrop-blur-md p-4 space-y-2">
      <p className="text-[9px] tracking-[0.18em] font-light text-muted-foreground/50">{label.toUpperCase()}</p>
      <div className="flex items-end gap-1.5">
        <span className="text-xl font-extralight text-foreground leading-none">
          {loading ? "…" : value}
        </span>
        {unit && <span className="text-[10px] font-extralight text-muted-foreground/50 pb-0.5">{unit}</span>}
      </div>
      {series && series.length >= 2 && <Sparkline series={series} />}
      <div className="space-y-0.5">
        {series && series.length >= 3 && (
          <p className="text-[9px] font-extralight text-muted-foreground/60">
            {direction === "flat"
              ? "Flat against your own recent rhythm"
              : `${direction === "rising" ? "Rising" : "Falling"} ${Math.abs(round(k, 2))}${unit ? ` ${unit}` : ""}/interval`}
          </p>
        )}
        {pct !== null && (
          <p className="text-[9px] font-extralight text-muted-foreground/60">
            {ordinal(pct)} percentile against your own population
          </p>
        )}
        {hint && <p className="text-[9px] font-extralight text-muted-foreground/50">{hint}</p>}
      </div>
    </div>
  );
};

/** Horizontal comparison bar with the subject's baseline marked in place. */
export const BaselineBar = ({
  label,
  value,
  baseline,
  max,
  suffix = "",
}: {
  label: string;
  value: number;
  baseline: number;
  max: number;
  suffix?: string;
}) => {
  const cap = max || 1;
  const v = Math.max(0, Math.min(100, (value / cap) * 100));
  const b = Math.max(0, Math.min(100, (baseline / cap) * 100));
  const over = value > baseline;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-extralight text-muted-foreground truncate">{label}</span>
        <span className="text-[10px] font-light text-foreground shrink-0">
          {round(value, 1)}{suffix}
          <span className="text-muted-foreground/40 font-extralight"> vs {round(baseline, 1)}{suffix}</span>
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-foreground/[0.07] overflow-hidden">
        <div
          className={`h-full rounded-full ${over ? "bg-foreground/60" : "bg-foreground/30"}`}
          style={{ width: `${v}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-foreground/70"
          style={{ left: `${b}%` }}
          title={`Your baseline: ${round(baseline, 1)}${suffix}`}
        />
      </div>
    </div>
  );
};
