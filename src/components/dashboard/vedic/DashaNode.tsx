import { useMemo, useState } from "react";
import {
  ChevronRight, ChevronDown, Heart, DollarSign, Crown, Flame,
  Sparkles, TrendingUp, Users, Activity, Megaphone,
} from "lucide-react";
import { ensureChildren, DASHA_LEVEL_LABEL, type DashaPeriod } from "@/lib/vedic/dasha";
import { buildDashaInsight, type LifeFlag } from "@/lib/vedic/dashaReading";
import type { SweVedicChart } from "@/lib/vedic/sweChart";

// US date formatting (MM/DD/YYYY) — never ISO/European.
const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
const fmtDateTime = (d: Date) =>
  d.toLocaleString("en-US", { year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true });
const fmtDuration = (years: number) => {
  if (years >= 1) return `${years.toFixed(2)}y`;
  const days = years * 365.25;
  if (days >= 1) return `${days.toFixed(1)}d`;
  return `${(days * 24).toFixed(1)}h`;
};

const FLAG_ICON: Record<LifeFlag, { Icon: typeof Heart; title: string }> = {
  soulmate:        { Icon: Heart,      title: "Soulmate window" },
  millionaire:     { Icon: DollarSign, title: "Millionaire-grade wealth window" },
  billionaire:     { Icon: Crown,      title: "Billionaire-grade wealth window" },
  power_peak:      { Icon: Flame,      title: "Power peak" },
  viral_influence: { Icon: Megaphone,  title: "Viral influence — mass public attention / going viral" },
};

interface Props {
  period: DashaPeriod;
  parents?: DashaPeriod[];
  chart: SweVedicChart;
  expandedKey: string;
  expandedMap: Record<string, boolean>;
  setExpandedMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isOpen: boolean;
  depth?: number;
}

function ScoreBar({ label, value, Icon }: { label: string; value: number; Icon: typeof Activity }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
        <span className="flex items-center gap-1"><Icon className="h-2.5 w-2.5" />{label}</span>
        <span className="tabular-nums">{value}</span>
      </div>
      <div className="mt-0.5 h-1 rounded bg-foreground/10 overflow-hidden">
        <div className="h-full bg-foreground/60" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function DashaNode({
  period, parents = [], chart, expandedKey, expandedMap, setExpandedMap, isOpen, depth = 0,
}: Props) {
  const canExpand = period.level !== "deha";
  const useDateTime = period.level === "sookshma" || period.level === "prana" || period.level === "deha";
  const [showHoroscope, setShowHoroscope] = useState(false);

  const insight = useMemo(() => buildDashaInsight(period, parents, chart), [period, parents, chart]);

  const toggle = () => {
    if (!canExpand) return;
    if (!period.children) ensureChildren(period);
    setExpandedMap((m) => ({ ...m, [expandedKey]: !isOpen }));
  };

  const borderClass = period.isCurrent
    ? "border-foreground/40 bg-foreground/[0.045]"
    : "border-border/20 bg-background/25";
  const padding = depth === 0 ? "p-3" : "px-2.5 py-2";
  const labelClass = depth === 0
    ? "text-sm text-foreground/90 font-light"
    : "text-[11px] text-foreground/80 font-light";

  return (
    <div className={`rounded-lg border ${borderClass} ${padding}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={toggle}
          disabled={!canExpand}
          className="flex items-center gap-2 text-left disabled:cursor-default min-w-0 flex-1"
        >
          {canExpand ? (
            isOpen
              ? <ChevronDown className="h-3 w-3 text-muted-foreground/70 shrink-0" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground/70 shrink-0" />
          ) : <span className="w-3" />}
          <span className={labelClass}>
            {period.lord}
            <span className="text-muted-foreground/60 text-[10px] uppercase tracking-wider ml-1.5">
              {DASHA_LEVEL_LABEL[period.level]}
            </span>
          </span>

          {/* Life-event icons (monochrome) */}
          {insight.flags.length > 0 && (
            <span className="flex items-center gap-1 ml-1">
              {insight.flags.map((f) => {
                const { Icon, title } = FLAG_ICON[f];
                return (
                  <Icon
                    key={f}
                    className="h-3 w-3 text-foreground/85"
                    strokeWidth={1.6}
                    aria-label={title}
                  >
                    <title>{title}</title>
                  </Icon>
                );
              })}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {useDateTime ? fmtDateTime(period.start) : fmtDate(period.start)}
            {" → "}
            {useDateTime ? fmtDateTime(period.end) : fmtDate(period.end)}
            {" · "}
            {fmtDuration(period.years)}
          </div>
          <button
            type="button"
            onClick={() => setShowHoroscope((v) => !v)}
            className="inline-flex items-center gap-1 rounded border border-border/30 bg-background/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-foreground/80 hover:bg-foreground/[0.06]"
            title="Read this period's horoscope"
          >
            <Sparkles className="h-2.5 w-2.5" /> Read
          </button>
        </div>
      </div>

      {/* Horoscope panel */}
      {showHoroscope && (
        <div className="mt-3 rounded-md border border-border/25 bg-background/40 p-3 space-y-2.5">
          <div className="text-[12px] font-light text-foreground/95 italic leading-relaxed">
            {insight.headline}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <ScoreBar label="Power" value={insight.power} Icon={Flame} />
            <ScoreBar label="Wealth" value={insight.wealth} Icon={TrendingUp} />
            <ScoreBar label="Bonds" value={insight.relationship} Icon={Users} />
          </div>

          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-1">Mechanics</div>
            <ul className="space-y-1 text-[11px] text-foreground/80 font-light leading-snug">
              {insight.mechanics.map((m, i) => (
                <li key={i} className="flex gap-1.5"><span className="text-muted-foreground/50">·</span>{m}</li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-1">
            {insight.themes.map((t) => (
              <span key={t} className="rounded border border-border/25 bg-foreground/[0.03] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground/80">
                {t}
              </span>
            ))}
          </div>

          {insight.flags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-border/15">
              {insight.flags.map((f) => {
                const { Icon, title } = FLAG_ICON[f];
                return (
                  <span key={f} className="inline-flex items-center gap-1 text-[10px] text-foreground/85">
                    <Icon className="h-3 w-3" strokeWidth={1.6} /> {title}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isOpen && period.children && period.children.length > 0 && (
        <div className="mt-2 space-y-1.5 pl-3 border-l border-border/15">
          {period.children.map((child) => {
            const childKey = `${expandedKey}>${child.level}:${child.lord}:${child.start.toISOString()}`;
            const childOpen = expandedMap[childKey] ?? child.isCurrent;
            return (
              <DashaNode
                key={childKey}
                period={child}
                parents={[...parents, period]}
                chart={chart}
                expandedKey={childKey}
                expandedMap={expandedMap}
                setExpandedMap={setExpandedMap}
                isOpen={childOpen}
                depth={depth + 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
