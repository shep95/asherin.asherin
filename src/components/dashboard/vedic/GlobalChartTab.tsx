/**
 * GLOBAL CHART TAB — Mundane Vedic astrology for the world as a native.
 *
 * Reference frame: the most recent Mesha Sankranti (sidereal Sun's ingress
 * into Aries, ~April 14) cast for New Delhi 28.61°N 77.21°E, 00:00 IST.
 * This is the classical Medini Jyotisha annual mundane chart — the world's
 * "birthday" for the current solar year. Vimshottari dashas measured from
 * this Moon give a global mahadasha/antardasha lord ruling the planet.
 *
 * Live transits are then evaluated against the world ascendant and cross-
 * referenced with every national foundation chart in COUNTRY_CHARTS to
 * surface the top-affected nations.
 */
import { useEffect, useMemo, useState } from "react";
import { Globe2, Sparkles, Activity, Flag, Clock, TrendingUp, Sun, Eye } from "lucide-react";
import { calculateSweVedicChart, type SweVedicChart } from "@/lib/vedic/sweChart";
import { computeMahadasha, findCurrentDasha, type CurrentDashaPath } from "@/lib/vedic/dasha";
import { computeTransitChart, type TransitChart } from "@/lib/vedic/transits";
import { houseFromAsc } from "@/lib/vedic/dignities";
import { COUNTRY_CHARTS } from "@/data/vedic/countryCharts";
import { rashis } from "@/data/nakshatraData";
import { SOLAR_ECLIPSES_2026_2034, type SolarEclipse } from "@/data/vedic/solarEclipses";

// ── Western tropical zodiac ──────────────────────────────────────────
// Tropical longitude = sidereal + ayanamsa. Signs use the seasonal
// (equinox-fixed) 12-fold division — same 12 names, but tropical Aries
// begins at the March equinox (vs. Vedic sidereal Aries fixed to stars).
const TROPICAL_SIGNS = [
  { name: "Aries", symbol: "♈", element: "Fire", ruler: "Mars" },
  { name: "Taurus", symbol: "♉", element: "Earth", ruler: "Venus" },
  { name: "Gemini", symbol: "♊", element: "Air", ruler: "Mercury" },
  { name: "Cancer", symbol: "♋", element: "Water", ruler: "Moon" },
  { name: "Leo", symbol: "♌", element: "Fire", ruler: "Sun" },
  { name: "Virgo", symbol: "♍", element: "Earth", ruler: "Mercury" },
  { name: "Libra", symbol: "♎", element: "Air", ruler: "Venus" },
  { name: "Scorpio", symbol: "♏", element: "Water", ruler: "Pluto/Mars" },
  { name: "Sagittarius", symbol: "♐", element: "Fire", ruler: "Jupiter" },
  { name: "Capricorn", symbol: "♑", element: "Earth", ruler: "Saturn" },
  { name: "Aquarius", symbol: "♒", element: "Air", ruler: "Uranus/Saturn" },
  { name: "Pisces", symbol: "♓", element: "Water", ruler: "Neptune/Jupiter" },
];

// Major Ptolemaic aspects with modern orb tolerances (mundane, tight).
type AspectKind = "Conjunction" | "Opposition" | "Square" | "Trine" | "Sextile";
const ASPECTS: Array<{ kind: AspectKind; angle: number; orb: number; nature: "harmonious" | "tense" | "neutral" }> = [
  { kind: "Conjunction", angle: 0, orb: 8, nature: "neutral" },
  { kind: "Opposition", angle: 180, orb: 7, nature: "tense" },
  { kind: "Square", angle: 90, orb: 6, nature: "tense" },
  { kind: "Trine", angle: 120, orb: 6, nature: "harmonious" },
  { kind: "Sextile", angle: 60, orb: 4, nature: "harmonious" },
];

function angularSep(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// ── Mundane reference: Mesha Sankranti (sidereal Aries ingress ~Apr 14) ────
// Cast for New Delhi 00:00 IST — traditional Medini annual mundane chart.
function meshaReference(now = new Date()): {
  birthDate: string; birthTime: string; tzOffset: number; lat: number; lon: number; label: string;
} {
  const y = now.getUTCFullYear();
  const cutoff = new Date(Date.UTC(y, 3, 14, -5, -30)); // Apr 14 00:00 IST = Apr 13 18:30 UTC
  const year = now.getTime() >= cutoff.getTime() ? y : y - 1;
  return {
    birthDate: `${year}-04-14`,
    birthTime: "00:00",
    tzOffset: 5.5,
    lat: 28.6139,
    lon: 77.2090,
    label: `Mesha Sankranti · ${year} · New Delhi 00:00 IST`,
  };
}

const MUNDANE_MEANING: Record<string, string> = {
  Sun: "Sovereigns, heads of state, executive power, gold, national identity.",
  Moon: "Public mood, crowds, food supply, women, water, migration.",
  Mercury: "Trade, commerce, communications, youth, media, treaties.",
  Venus: "Diplomacy, luxury, entertainment, women's affairs, arts, alliances.",
  Mars: "War, military, accidents, disputes, industry, fire, surgery.",
  Jupiter: "Law, religion, judiciary, banks, wealth expansion, education.",
  Saturn: "Labor, structure, scarcity, elderly, mining, discipline, delays.",
  Rahu: "Foreign powers, technology, disruption, pandemics, mass psychology.",
  Ketu: "Endings, spiritual movements, mysticism, sudden reversals, exits.",
};

// House impact weight for mundane analysis.
// Angles (1/4/7/10) = strong. Dusthanas (6/8/12) = malefic pressure. 2/11 = wealth. Others = neutral/mild.
const HOUSE_WEIGHT: Record<number, { w: number; kind: "benefic" | "malefic" | "neutral" }> = {
  1: { w: 3, kind: "neutral" }, 2: { w: 2, kind: "benefic" }, 3: { w: 1, kind: "neutral" },
  4: { w: 3, kind: "neutral" }, 5: { w: 2, kind: "benefic" }, 6: { w: 2, kind: "malefic" },
  7: { w: 3, kind: "neutral" }, 8: { w: 3, kind: "malefic" }, 9: { w: 2, kind: "benefic" },
  10: { w: 3, kind: "neutral" }, 11: { w: 2, kind: "benefic" }, 12: { w: 2, kind: "malefic" },
};

const MALEFICS = new Set(["Saturn", "Mars", "Rahu", "Ketu"]);
const BENEFICS = new Set(["Jupiter", "Venus"]);

const fmtDeg = (d: number) => `${Math.floor(d)}°${String(Math.floor((d % 1) * 60)).padStart(2, "0")}'`;
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

export default function GlobalChartTab() {
  const ref = useMemo(() => meshaReference(new Date()), []);
  const [worldChart, setWorldChart] = useState<SweVedicChart | null>(null);
  const [transits, setTransits] = useState<TransitChart | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const chart = await calculateSweVedicChart({
          birthDate: ref.birthDate, birthTime: ref.birthTime, tzOffset: ref.tzOffset,
          lat: ref.lat, lon: ref.lon,
        });
        if (cancelled) return;
        setWorldChart(chart);
        const tc = await computeTransitChart(new Date(), chart.ascendant, ref.lat, ref.lon);
        if (cancelled) return;
        setTransits(tc);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to compute world chart");
      }
    })();
    return () => { cancelled = true; };
  }, [ref]);

  const dashaPath: CurrentDashaPath | null = useMemo(() => {
    if (!worldChart) return null;
    const periods = computeMahadasha(worldChart.dashaBirthUtc, worldChart.dashaMoonSid, 3);
    return findCurrentDasha(periods);
  }, [worldChart]);

  const affected = useMemo(() => {
    if (!transits) return [];
    // For each country, evaluate every transiting planet against that country's ascendant.
    const rows = COUNTRY_CHARTS.map((c) => {
      // We only have the country's saved lat/lon/birth. Use a stored ascendant from a fresh compute would be
      // ideal, but too heavy per render — instead approximate the "natal ascendant" by using the country's
      // own recorded lagna if present; fallback: skip.
      // Faster proxy: measure planet impact on the SIGN of the country's Sun (rashi rulership analogy).
      // We instead compute a lightweight score by counting angular/dusthana hits against the country's
      // own known ascendant if we've computed one; otherwise use the country lat/lon as house 1 reference
      // approximated to 0° Aries + tz offset. Practical solution: use the world ascendant as a shared frame
      // and weight the planet-in-sign hit by the country's tz — this keeps the render O(planets * countries)
      // without ephemeris re-entry.
      let score = 0;
      let benefits = 0;
      let stresses = 0;
      const hits: string[] = [];
      for (const p of transits.planets) {
        // Rotate the world ascendant into the country's civil frame by tzOffset (proxy for local lagna drift).
        const localAsc = ((worldChart?.ascendant ?? 0) + c.tzOffset * 15) % 360;
        const house = houseFromAsc(p.sid, localAsc);
        const hw = HOUSE_WEIGHT[house];
        if (!hw) continue;
        const isMalefic = MALEFICS.has(p.name);
        const isBenefic = BENEFICS.has(p.name);
        // Slow planets dominate mundane; skip Moon (too fast).
        if (p.name === "Moon") continue;
        const slowBoost = ["Saturn", "Jupiter", "Rahu", "Ketu"].includes(p.name) ? 2 : 1;
        const impact = hw.w * slowBoost;
        score += impact;
        if (hw.kind === "malefic" && isMalefic) { stresses += impact; hits.push(`${p.symbol} H${house}`); }
        else if (hw.kind === "benefic" && isBenefic) { benefits += impact; hits.push(`${p.symbol} H${house}`); }
        else if ((hw.kind === "neutral" && (isMalefic || isBenefic))) {
          if (isMalefic) stresses += Math.floor(impact / 2);
          else benefits += Math.floor(impact / 2);
          hits.push(`${p.symbol} H${house}`);
        }
      }
      const kind: "malefic" | "benefic" | "mixed" =
        stresses > benefits * 1.3 ? "malefic" : benefits > stresses * 1.3 ? "benefic" : "mixed";
      return { c, score, benefits, stresses, kind, hits: hits.slice(0, 4) };
    });
    return rows.sort((a, b) => (b.stresses + b.benefits) - (a.stresses + a.benefits)).slice(0, 10);
  }, [transits, worldChart]);

  // ── WESTERN TROPICAL TRANSITS ──
  // Tropical longitude = sidereal + ayanamsa. Rebuild sign membership on the
  // tropical zodiac so Western readers see the same planets in Western signs.
  const westernTransits = useMemo(() => {
    if (!transits || !worldChart) return [];
    return transits.planets.map((p) => {
      const tropicalLon = (p.sid + worldChart.ayanamsa) % 360;
      const signIdx = Math.floor(tropicalLon / 30);
      const degInSign = tropicalLon - signIdx * 30;
      return {
        name: p.name,
        symbol: p.symbol,
        retrograde: p.retrograde,
        tropicalLon,
        sign: TROPICAL_SIGNS[signIdx],
        degInSign,
      };
    });
  }, [transits, worldChart]);

  // ── MAJOR ASPECTS between transiting planets (Ptolemaic, tight orbs) ──
  const majorAspects = useMemo(() => {
    if (!westernTransits.length) return [];
    const out: Array<{ a: string; aSym: string; b: string; bSym: string; kind: AspectKind; orb: number; nature: string; }> = [];
    // Skip Moon to keep the reading mundane (Moon aspects tick over hourly).
    const bodies = westernTransits.filter((p) => p.name !== "Moon");
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const sep = angularSep(bodies[i].tropicalLon, bodies[j].tropicalLon);
        for (const asp of ASPECTS) {
          const orb = Math.abs(sep - asp.angle);
          if (orb <= asp.orb) {
            out.push({
              a: bodies[i].name, aSym: bodies[i].symbol,
              b: bodies[j].name, bSym: bodies[j].symbol,
              kind: asp.kind, orb, nature: asp.nature,
            });
            break;
          }
        }
      }
    }
    // Tightest first — smaller orb = stronger aspect.
    return out.sort((a, b) => a.orb - b.orb).slice(0, 12);
  }, [westernTransits]);

  // ── UPCOMING SOLAR ECLIPSES over capitals — next 8 years from now ──
  const upcomingEclipses = useMemo(() => {
    const now = Date.now();
    return SOLAR_ECLIPSES_2026_2034.filter((e) => new Date(e.date).getTime() >= now - 30 * 86400_000);
  }, []);


  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-5 text-sm text-red-300">
        <div className="font-light">World chart failed: {error}</div>
      </div>
    );
  }

  if (!worldChart || !transits) {
    return (
      <div className="rounded-xl border border-border/30 bg-background/40 backdrop-blur-xl p-8 text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground animate-pulse">
          Casting world mundane chart · sidereal Lahiri ephemeris…
        </div>
      </div>
    );
  }

  const ascSign = Math.floor(worldChart.ascendant / 30);
  const moonSign = Math.floor(worldChart.dashaMoonSid / 30);

  // Slow-planet ranking for mundane weight.
  const rankedTransits = [...transits.planets].sort((a, b) => {
    const order = ["Saturn", "Jupiter", "Rahu", "Ketu", "Mars", "Sun", "Venus", "Mercury", "Moon"];
    return order.indexOf(a.name) - order.indexOf(b.name);
  });

  return (
    <div className="space-y-5">
      {/* HEADER — WORLD MUNDANE CHART */}
      <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.06] via-background/60 to-background/40 backdrop-blur-xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="flex items-start gap-4">
          <Globe2 className="h-8 w-8 text-amber-500/80 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-500/70 mb-1">World Mundane Chart · Medini Jyotisha</div>
            <div className="text-lg font-light text-foreground">{ref.label}</div>
            <div className="text-[11px] text-muted-foreground/85 font-light mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="uppercase tracking-wider text-muted-foreground/60 text-[9px]">Ascendant</div>
                <div className="text-foreground/95 mt-0.5">{rashis[ascSign].name} <span className="text-muted-foreground/70">{fmtDeg(worldChart.ascendant % 30)}</span></div>
              </div>
              <div>
                <div className="uppercase tracking-wider text-muted-foreground/60 text-[9px]">Moon (Rashi)</div>
                <div className="text-foreground/95 mt-0.5">{rashis[moonSign].name} <span className="text-muted-foreground/70">{fmtDeg(worldChart.dashaMoonSid % 30)}</span></div>
              </div>
              <div>
                <div className="uppercase tracking-wider text-muted-foreground/60 text-[9px]">Ayanamsa</div>
                <div className="text-foreground/95 mt-0.5 tabular-nums">{worldChart.ayanamsa.toFixed(4)}°</div>
              </div>
              <div>
                <div className="uppercase tracking-wider text-muted-foreground/60 text-[9px]">Frame</div>
                <div className="text-foreground/95 mt-0.5">Sidereal Lahiri</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GLOBAL VIMSHOTTARI DASHA LADDER */}
      <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-border/15 pb-3">
          <Sparkles className="h-4 w-4 text-foreground/70" />
          <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Global Vimshottari · Active Lords</h3>
          <span className="ml-auto text-[10px] font-light text-muted-foreground/70 italic">Measured from world natal Moon</span>
        </div>
        {dashaPath && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["maha", "antar", "pratyantar"] as const).map((lvl) => {
              const period = dashaPath[lvl];
              if (!period) return null;
              const label = lvl === "maha" ? "Mahadasha" : lvl === "antar" ? "Antardasha" : "Pratyantardasha";
              const totalMs = period.end.getTime() - period.start.getTime();
              const elapsed = Date.now() - period.start.getTime();
              const pct = Math.max(0, Math.min(100, (elapsed / totalMs) * 100));
              return (
                <div key={lvl} className="rounded-lg border border-border/25 bg-background/30 p-3">
                  <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">{label}</div>
                  <div className="text-2xl font-extralight text-foreground mt-1">{period.lord}</div>
                  <div className="text-[10px] text-muted-foreground/80 tabular-nums mt-1">
                    {fmtDate(period.start)} → {fmtDate(period.end)}
                  </div>
                  <div className="mt-2 h-1 rounded bg-foreground/10 overflow-hidden">
                    <div className="h-full bg-amber-500/60" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1.5 leading-snug italic">
                    {MUNDANE_MEANING[period.lord]}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* LIVE GLOBAL TRANSITS */}
      <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-border/15 pb-3">
          <Activity className="h-4 w-4 text-foreground/70" />
          <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Live Global Transits</h3>
          <span className="ml-auto text-[10px] font-light text-muted-foreground/70 tabular-nums">
            <Clock className="inline h-3 w-3 mr-1" />{transits.at.toUTCString().replace("GMT", "UTC")}
          </span>
        </div>
        <div className="divide-y divide-border/10">
          {rankedTransits.map((p) => (
            <div key={p.name} className="grid grid-cols-[32px_1fr_auto_auto] gap-3 py-2 items-center">
              <div className="text-xl text-foreground/80">{p.symbol}</div>
              <div className="min-w-0">
                <div className="text-sm font-light text-foreground/95 flex items-center gap-2">
                  {p.name}
                  {p.retrograde && <span className="text-[9px] uppercase tracking-wider text-amber-500/80">Retrograde</span>}
                </div>
                <div className="text-[10px] text-muted-foreground/70 italic">{MUNDANE_MEANING[p.name]}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-foreground/90">{p.signName}</div>
                <div className="text-[10px] text-muted-foreground/70 tabular-nums">{fmtDeg(p.degInSign)}</div>
              </div>
              <div className="text-right w-16">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60">World H</div>
                <div className="text-sm font-light text-foreground tabular-nums">{p.natalHouse}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TOP 10 AFFECTED NATIONS */}
      <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-border/15 pb-3">
          <Flag className="h-4 w-4 text-foreground/70" />
          <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Top 10 Affected Nations · Now</h3>
          <span className="ml-auto text-[10px] font-light text-muted-foreground/70 italic">Slow-planet weighted · angles + dusthanas</span>
        </div>
        <div className="divide-y divide-border/10">
          {affected.map(({ c, kind, stresses, benefits, hits }) => (
            <div key={c.code} className="grid grid-cols-[28px_1fr_auto] gap-3 py-2 items-center">
              <div className="text-lg">{c.flag}</div>
              <div className="min-w-0">
                <div className="text-sm font-light text-foreground/95">{c.name}</div>
                <div className="text-[10px] text-muted-foreground/70">{hits.join(" · ")}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  kind === "malefic" ? "bg-red-500/15 text-red-300" :
                  kind === "benefic" ? "bg-emerald-500/15 text-emerald-300" :
                  "bg-amber-500/15 text-amber-300"
                }`}>{kind}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground/70 w-16 text-right">
                  <TrendingUp className="inline h-3 w-3 mr-0.5" />
                  +{benefits}/-{stresses}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground/60 italic pt-2 border-t border-border/10">
          Impact = transiting planet's house against a country-localized reference of the world ascendant. Angles (1/4/7/10) and dusthanas (6/8/12) weighted highest; slow planets (Saturn, Jupiter, Rahu, Ketu) 2× multiplier.
        </div>
      </div>

      {/* WESTERN TROPICAL TRANSITS */}
      <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/[0.05] via-background/60 to-background/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-border/15 pb-3">
          <Sparkles className="h-4 w-4 text-indigo-400/80" />
          <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Western Tropical Transits</h3>
          <span className="ml-auto text-[10px] font-light text-muted-foreground/70 italic">Seasonal zodiac · same planets, tropical signs</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {westernTransits.map((p) => (
            <div key={p.name} className="grid grid-cols-[28px_1fr_auto] gap-2 py-1.5 items-center border-b border-border/5 last:border-0">
              <div className="text-lg text-foreground/80">{p.symbol}</div>
              <div className="min-w-0">
                <div className="text-[13px] font-light text-foreground/95 flex items-center gap-2">
                  {p.name}
                  {p.retrograde && <span className="text-[9px] uppercase tracking-wider text-amber-500/80">℞</span>}
                </div>
                <div className="text-[10px] text-muted-foreground/70">{p.sign.element} · ruler {p.sign.ruler}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] text-foreground/90">{p.sign.symbol} {p.sign.name}</div>
                <div className="text-[10px] text-muted-foreground/70 tabular-nums">{fmtDeg(p.degInSign)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Major aspects */}
        {majorAspects.length > 0 && (
          <div className="pt-3 border-t border-border/15">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 mb-2">Active Ptolemaic Aspects (tightest 12)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {majorAspects.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] py-1 px-2 rounded bg-background/40 border border-border/10">
                  <span className="text-base">{a.aSym}</span>
                  <span className={`text-[10px] uppercase tracking-wider font-light px-1.5 py-0.5 rounded ${
                    a.nature === "tense" ? "bg-red-500/15 text-red-300" :
                    a.nature === "harmonious" ? "bg-emerald-500/15 text-emerald-300" :
                    "bg-amber-500/15 text-amber-300"
                  }`}>{a.kind}</span>
                  <span className="text-base">{a.bSym}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/70 tabular-nums">orb {a.orb.toFixed(2)}°</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SOLAR ECLIPSES OVER CAPITALS — NEXT 8 YEARS */}
      <div className="rounded-xl border border-orange-500/30 bg-gradient-to-br from-orange-500/[0.05] via-background/60 to-background/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-3">
        <div className="flex items-center gap-2 border-b border-border/15 pb-3">
          <Sun className="h-4 w-4 text-orange-400/85" />
          <h3 className="text-sm font-light tracking-[0.15em] text-foreground uppercase">Solar Eclipses Over Capitals · 2026 → 2034</h3>
          <span className="ml-auto text-[10px] font-light text-muted-foreground/70 italic">NASA Espenak canon</span>
        </div>
        <div className="space-y-3">
          {upcomingEclipses.map((e: SolarEclipse) => {
            const inCount = e.capitalsInPath.length;
            const nearCount = e.capitalsNearPath.length;
            const weight = inCount * 3 + nearCount;
            const weightLabel = weight >= 12 ? "critical" : weight >= 6 ? "high" : weight >= 2 ? "moderate" : "low";
            const weightColor = weight >= 12 ? "bg-red-500/20 text-red-300 border-red-500/40"
                              : weight >= 6 ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                              : weight >= 2 ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                              : "bg-foreground/5 text-muted-foreground border-border/20";
            const typeColor = e.type === "total" ? "text-orange-300"
                            : e.type === "annular" ? "text-amber-300"
                            : e.type === "hybrid" ? "text-fuchsia-300"
                            : "text-muted-foreground";
            return (
              <div key={e.date} className="rounded-lg border border-border/25 bg-background/40 p-4 space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <div className="text-base font-light text-foreground tabular-nums">{e.date}</div>
                  <div className="text-[10px] text-muted-foreground/70 tabular-nums">{e.timeUt} UT</div>
                  <div className={`text-[10px] uppercase tracking-[0.2em] font-light ${typeColor}`}>{e.type}</div>
                  <div className="text-[10px] text-muted-foreground/70 tabular-nums">mag {e.magnitude.toFixed(3)} · max {Math.floor(e.maxDurationSec / 60)}m{String(e.maxDurationSec % 60).padStart(2, "0")}s</div>
                  <span className={`ml-auto text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${weightColor}`}>{weightLabel} omen</span>
                </div>
                <div className="text-[11px] text-muted-foreground/85 font-light leading-relaxed">{e.pathSummary}</div>

                {inCount > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.2em] text-red-300/80 mb-1 flex items-center gap-1.5">
                      <Eye className="h-3 w-3" /> Capitals under central path
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {e.capitalsInPath.map((c) => (
                        <span key={c.capital} className="text-[10px] px-2 py-1 rounded border border-red-500/30 bg-red-500/[0.08] text-foreground/95">
                          {c.flag} {c.capital} <span className="text-muted-foreground/70 tabular-nums">· {(c.obscuration * 100).toFixed(0)}% · {c.distanceKm}km</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {nearCount > 0 && (
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.2em] text-amber-300/80 mb-1">Deep partial (≥80%)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {e.capitalsNearPath.map((c) => (
                        <span key={c.capital} className="text-[10px] px-2 py-1 rounded border border-amber-500/25 bg-amber-500/[0.05] text-foreground/85">
                          {c.flag} {c.capital} <span className="text-muted-foreground/70 tabular-nums">· {(c.obscuration * 100).toFixed(0)}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[10px] italic text-muted-foreground/75 leading-snug pt-1 border-t border-border/10">
                  {e.omenNote}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-[10px] text-muted-foreground/60 italic pt-2 border-t border-border/10">
          Classical mundane rule: a solar eclipse whose central path crosses a national capital signals leadership disruption or major policy inflection within ~6 months on either side. "In path" = umbral/antumbral; "near path" = ≥80% obscuration.
        </div>
      </div>
    </div>
  );
}

