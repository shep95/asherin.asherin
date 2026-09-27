import { useMemo } from "react";
import { Radar, Sparkles, MoonStar, Layers } from "lucide-react";
import FindingCard from "./FindingCard";
import { deepDive, type Observation, type SurfaceSpec } from "@/lib/cloudIntel/deepDive";
import type { Finding } from "@/lib/cloudIntel/logic";

// The deep-dive panel is the single rendering surface for structural findings
// across every module in the mesh. It deliberately leads with the census — the
// subject cannot judge a finding without first knowing how much was looked at —
// and it never renders an empty state: deepDive() guarantees at least one
// finding, including for surfaces that returned nothing at all.

interface Props {
  spec: SurfaceSpec;
  observations: Observation[];
  /** Domain findings the module derived itself; merged and ranked alongside. */
  extraFindings?: Finding[];
  recentDays?: number;
  /** Optional heading override. */
  title?: string;
}

const fmtDate = (ts: number | null) =>
  ts ? new Date(ts).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—";

const DeepDivePanel = ({ spec, observations, extraFindings, recentDays = 14, title }: Props) => {
  // Detectors are pure and O(n log n); memoising keeps a large surface from
  // re-running the full battery on every unrelated parent render.
  const { findings, census } = useMemo(
    () => deepDive(spec, observations, { recentDays }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [observations, recentDays, spec.module, spec.connected]
  );

  const merged = useMemo(() => {
    if (!extraFindings?.length) return findings;
    const seen = new Set(findings.map((f) => f.id));
    return [...findings, ...extraFindings.filter((f) => !seen.has(f.id))];
  }, [findings, extraFindings]);

  // On a surface whose timestamps are metadata rather than event times, span
  // and rate describe the sync clock, not the subject. Showing them would
  // invite exactly the inference the engine refuses to make, so they are
  // replaced by the two figures that remain true.
  const temporal = spec.timestampsAreEvents !== false;
  const stats = temporal
    ? [
        { label: spec.unitPlural.toUpperCase(), value: census.total.toLocaleString() },
        { label: spec.entityNounPlural.toUpperCase(), value: census.entities.toLocaleString() },
        { label: "SPAN", value: census.spanDays ? `${census.spanDays}d` : "—" },
        { label: "RATE", value: census.total ? `${census.perDay}/day` : "—" },
      ]
    : [
        { label: spec.unitPlural.toUpperCase(), value: census.total.toLocaleString() },
        { label: spec.entityNounPlural.toUpperCase(), value: census.entities.toLocaleString() },
        {
          label: "SPREAD",
          value: census.entities ? `${(census.total / census.entities).toFixed(1)}/${spec.entityNoun}` : "—",
        },
        { label: "BASIS", value: "STRUCTURAL" },
      ];

  return (
    <div className="space-y-4">
      {/* Census — how much was actually examined. */}
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
            <Radar className="h-4 w-4 text-foreground/70" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-light tracking-wide text-foreground">
              {title ?? `${spec.module} — Deep Dive`}
            </h3>
            <p className="text-[11px] font-extralight text-muted-foreground leading-relaxed mt-0.5">
              {temporal
                ? "Ten structural detectors run over this surface."
                : "Three distribution detectors run over this surface."}{" "}
              Findings appear only where the effect beats coincidence on the sample available.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-foreground/5 px-3 py-2">
              <p className="text-[9px] tracking-[0.18em] text-muted-foreground/40 font-light">{s.label}</p>
              <p className="text-sm font-light text-foreground mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>

        {census.total > 0 && temporal && (
          <p className="text-[10px] font-extralight text-muted-foreground/60">
            Observed {fmtDate(census.firstSeen)} → {fmtDate(census.lastSeen)}.
          </p>
        )}
        {census.total > 0 && !temporal && (
          <p className="text-[10px] font-extralight text-muted-foreground/60">
            Records on this surface carry a sync timestamp rather than an event time, so timing is
            not interpreted here. Findings below rest on distribution alone.
          </p>
        )}

        {/* The two categories the subject is least likely to already know about. */}
        {temporal && (census.novelEntities.length > 0 || census.dormantEntities.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            {census.novelEntities.length > 0 && (
              <div className="rounded-xl border border-border/20 bg-foreground/[0.03] px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-foreground/50" aria-hidden />
                  <p className="text-[9px] tracking-[0.18em] text-muted-foreground/50 font-light">
                    NEW TO THIS SURFACE ({census.novelEntities.length})
                  </p>
                </div>
                <p className="text-[11px] font-extralight text-muted-foreground leading-relaxed break-words">
                  {census.novelEntities.slice(0, 10).join(" · ")}
                  {census.novelEntities.length > 10 && ` · +${census.novelEntities.length - 10} more`}
                </p>
              </div>
            )}
            {census.dormantEntities.length > 0 && (
              <div className="rounded-xl border border-border/20 bg-foreground/[0.03] px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <MoonStar className="h-3 w-3 text-foreground/50" aria-hidden />
                  <p className="text-[9px] tracking-[0.18em] text-muted-foreground/50 font-light">
                    GONE QUIET ({census.dormantEntities.length})
                  </p>
                </div>
                <p className="text-[11px] font-extralight text-muted-foreground leading-relaxed break-words">
                  {census.dormantEntities.slice(0, 10).join(" · ")}
                  {census.dormantEntities.length > 10 && ` · +${census.dormantEntities.length - 10} more`}
                </p>
              </div>
            )}
          </div>
        )}

        {census.topEntities.length > 2 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-foreground/40" aria-hidden />
              <p className="text-[9px] tracking-[0.18em] text-muted-foreground/40 font-light">
                CONCENTRATION
              </p>
            </div>
            {census.topEntities.slice(0, 5).map((e) => (
              <div key={e.entity} className="flex items-center gap-2">
                <span
                  className="text-[10px] font-extralight text-muted-foreground truncate max-w-[45%]"
                  title={e.entity}
                >
                  {e.entity}
                </span>
                <div className="flex-1 h-1 rounded-full bg-foreground/5 overflow-hidden">
                  <div
                    className="h-full bg-foreground/30 rounded-full"
                    style={{ width: `${Math.max(2, Math.round(e.share * 100))}%` }}
                  />
                </div>
                <span className="text-[10px] font-light text-foreground/70 tabular-nums w-10 text-right">
                  {Math.round(e.share * 100)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Findings. deepDive() guarantees this is never empty. */}
      <div className="space-y-2">
        {merged.map((f, i) => (
          <FindingCard key={f.id} finding={f} defaultOpen={i === 0 && f.severity !== "baseline"} />
        ))}
      </div>
    </div>
  );
};

export default DeepDivePanel;
