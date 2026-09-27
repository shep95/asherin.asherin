import { useMemo, useState } from "react";
import { Globe2, Crown, Swords, AlertTriangle, TrendingUp, Anchor, Plane, Mountain, Rocket, ChevronDown } from "lucide-react";
import { POWER_RANKINGS, POWER_SUIT, PROTOCOLS, FORECASTS } from "@/data/vedic/globalPredictions";
import { COUNTRY_CHARTS } from "@/data/vedic/countryCharts";
import TimelineZoomer from "./TimelineZoomer";
import WW3Dossier from "./WW3Dossier";

type Era = "Past" | "Present" | "Future";

const SUIT_ICONS: Record<string, any> = { air: Plane, land: Mountain, sea: Anchor, space: Rocket };

export default function GlobalPredictionsTab() {
  const [era, setEra] = useState<Era>("Present");
  const [openProtocol, setOpenProtocol] = useState<string | null>("war");
  const [suitCountry, setSuitCountry] = useState<string>("US");

  const ranks = useMemo(() => POWER_RANKINGS.filter((r) => r.era === era).sort((a, b) => a.rank - b.rank), [era]);
  const events = useMemo(() => FORECASTS.filter((f) => f.era === era).sort((a, b) => a.date.localeCompare(b.date)), [era]);
  const futureKing = POWER_RANKINGS.find((r) => r.era === "Future" && r.rank === 1);
  const suit = POWER_SUIT[suitCountry];

  return (
    <div className="space-y-5">
      {/* HEADER — projected #1 future power */}
      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] via-background/60 to-background/40 backdrop-blur-xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="flex items-start gap-4">
          <Crown className="h-8 w-8 text-amber-500/80 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-1">Projected Future #1 Global Power</div>
            <div className="text-2xl font-light text-foreground flex items-center gap-3">
              <span className="text-3xl">{futureKing?.flag}</span>
              <span>{futureKing?.country}</span>
              <span className="text-sm text-muted-foreground tabular-nums">· {futureKing?.window}</span>
            </div>
            <div className="text-xs text-muted-foreground/85 font-light mt-1.5 leading-relaxed">{futureKing?.driver}</div>
            <div className="text-[11px] text-foreground/70 italic mt-1">{futureKing?.note}</div>
          </div>
        </div>
      </div>

      {/* ANIMATED ±500-YEAR TIMELINE ZOOMER */}
      <TimelineZoomer />

      {/* WW3 DETAILED DOSSIER */}
      <WW3Dossier />

      {/* ERA TOGGLE */}
      <div className="grid grid-cols-3 rounded-xl border border-border/30 bg-background/40 backdrop-blur-xl overflow-hidden">
        {(["Past", "Present", "Future"] as Era[]).map((e) => (
          <button
            key={e}
            onClick={() => setEra(e)}
            className={`px-4 py-2.5 text-xs uppercase tracking-[0.18em] transition border-r border-border/20 last:border-r-0 ${era === e ? "text-foreground bg-foreground/[0.06]" : "text-muted-foreground hover:text-foreground"}`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* POWER RANKING TABLE */}
      <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/15 px-5 py-3">
          <TrendingUp className="h-4 w-4 text-foreground/70" />
          <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Power Ranking · {era}</h3>
        </div>
        <div className="divide-y divide-border/10">
          {ranks.map((r) => (
            <div key={`${r.era}-${r.rank}-${r.country}`} className="grid grid-cols-[40px_1fr_auto] gap-3 px-5 py-3 items-start hover:bg-foreground/[0.02] transition">
              <div className="text-2xl font-extralight text-foreground/40 tabular-nums">#{r.rank}</div>
              <div className="min-w-0">
                <div className="text-sm font-light text-foreground/95 flex items-center gap-2">
                  <span className="text-base">{r.flag}</span> {r.country}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-0.5">{r.driver}</div>
                <div className="text-[11px] text-foreground/70 mt-1 italic font-light">{r.note}</div>
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap pt-1">{r.window}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MILITARY POWER SUIT */}
      <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-border/15 pb-3">
          <Swords className="h-4 w-4 text-foreground/70" />
          <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Power Suit · Air / Land / Sea / Space</h3>
          <select
            value={suitCountry}
            onChange={(e) => setSuitCountry(e.target.value)}
            className="ml-auto rounded-md border border-border/30 bg-background/40 px-2 py-1 text-xs text-foreground focus:outline-none focus:border-foreground/40"
          >
            {COUNTRY_CHARTS.filter((c) => POWER_SUIT[c.code]).map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
            ))}
          </select>
        </div>
        {suit && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(["air", "land", "sea", "space"] as const).map((k) => {
                const Icon = SUIT_ICONS[k];
                const val = suit[k];
                return (
                  <div key={k} className="rounded-lg border border-border/25 bg-background/30 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="h-3.5 w-3.5 text-foreground/60" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</span>
                    </div>
                    <div className="text-2xl font-extralight text-foreground tabular-nums">{val}<span className="text-xs text-muted-foreground/60">/100</span></div>
                    <div className="mt-2 h-1 rounded bg-foreground/10 overflow-hidden">
                      <div className="h-full bg-foreground/60" style={{ width: `${val}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-lg border border-border/20 bg-background/20 p-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">Strongest suit</div>
              <div className="text-sm text-foreground/95 font-light mt-0.5">{suit.primary}</div>
              <div className="text-[11px] text-muted-foreground/80 italic mt-1">{suit.note}</div>
            </div>
          </>
        )}
      </div>

      {/* PREDICTIONS TIMELINE */}
      <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-border/15 pb-3">
          <AlertTriangle className="h-4 w-4 text-foreground/70" />
          <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Forecast Events · {era}</h3>
        </div>
        <div className="space-y-2">
          {events.map((f, i) => (
            <div key={i} className="grid grid-cols-[90px_1fr] gap-3 rounded-lg border border-border/20 bg-background/30 p-3">
              <div className="text-[11px] tabular-nums text-foreground/85 font-light">{f.date}</div>
              <div className="min-w-0">
                <div className="text-sm font-light text-foreground/95 flex items-center gap-2">
                  <span>{f.flag}</span> {f.region}
                  <span className="ml-auto text-[9px] uppercase tracking-wider text-muted-foreground/60">{f.protocol}</span>
                </div>
                <div className="text-[12px] text-foreground/85 mt-0.5">{f.headline}</div>
                <div className="text-[11px] text-muted-foreground/80 italic mt-1">{f.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PROTOCOLS LIBRARY */}
      <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/15 px-5 py-3">
          <Globe2 className="h-4 w-4 text-foreground/70" />
          <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">10 Mundane Protocols</h3>
        </div>
        <div className="divide-y divide-border/10">
          {PROTOCOLS.map((p) => {
            const open = openProtocol === p.id;
            return (
              <div key={p.id}>
                <button
                  onClick={() => setOpenProtocol(open ? null : p.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-foreground/[0.02] transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-light text-foreground/95">{p.title}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-0.5">{p.target}</div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {open && (
                  <div className="px-5 pb-4 space-y-2">
                    <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2">
                      <div className="text-[9px] uppercase tracking-[0.2em] text-amber-500/80">Active Signal</div>
                      <div className="text-[12px] text-foreground/90 mt-0.5">{p.signal}</div>
                    </div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70">Technique</div>
                    <div className="text-[12px] text-foreground/85 italic">{p.technique}</div>
                    <div className="text-[12px] text-foreground/80 leading-relaxed">{p.body}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
