import { useMemo, useState } from "react";
import { ChevronDown, BookOpen, Sparkles, Coins } from "lucide-react";
import { rashis } from "@/data/nakshatraData";
import { buildHouseReading } from "@/lib/vedic/houseReading";
import { buildHouseActivation } from "@/lib/vedic/houseActivations";
import type { SignIngress } from "@/lib/vedic/transits";

export interface WHPlanet {
  name: string;
  symbol: string;
  sid: number;
  retrograde: boolean;
}

interface Props {
  ascendant: number;
  planets: WHPlanet[];
  ingresses?: SignIngress[] | null;
}

const HOUSE_META: { title: string; body: string; brand: string; archetype: string }[] = [
  { title: "Lagna / Self", body: "Body, vitality, identity", brand: "Personal magnetism", archetype: "The Initiator" },
  { title: "Wealth & Speech", body: "Money, family, voice, food", brand: "Earned income", archetype: "The Provider" },
  { title: "Effort & Siblings", body: "Courage, hands, communication", brand: "Self-made hustle", archetype: "The Warrior" },
  { title: "Home & Mother", body: "Roots, property, emotions", brand: "Real estate", archetype: "The Foundation" },
  { title: "Creation & Children", body: "Mind, romance, speculation", brand: "Investments", archetype: "The Creator" },
  { title: "Service & Enemies", body: "Work, debts, health", brand: "Daily grind", archetype: "The Servant" },
  { title: "Partner & Public", body: "Spouse, contracts, market", brand: "Public deals", archetype: "The Partner" },
  { title: "Transformation", body: "Inheritance, occult, crisis", brand: "Hidden money", archetype: "The Phoenix" },
  { title: "Dharma & Fortune", body: "Luck, teachers, long travel", brand: "Big breaks", archetype: "The Sage" },
  { title: "Career & Status", body: "Profession, authority, fame", brand: "Reputation", archetype: "The Sovereign" },
  { title: "Gains & Network", body: "Income, friends, ambitions", brand: "Network wealth", archetype: "The Visionary" },
  { title: "Loss & Liberation", body: "Expenses, foreign, moksha", brand: "Outflow", archetype: "The Mystic" },
];

const YOGAS: { name: string; test: (h: { signIndex: number; planets: WHPlanet[] }[]) => boolean; desc: string }[] = [
  {
    name: "Gajakesari Yoga",
    desc: "Moon and Jupiter in mutual kendra (1, 4, 7, 10) — confers fame, intelligence, and respected wealth.",
    test: (h) => {
      const moonH = h.findIndex((x) => x.planets.some((p) => p.name === "Moon"));
      const jupH = h.findIndex((x) => x.planets.some((p) => p.name === "Jupiter"));
      if (moonH < 0 || jupH < 0) return false;
      const diff = Math.abs(moonH - jupH);
      return [0, 3, 6, 9].includes(diff);
    },
  },
  {
    name: "Dhana Yoga (2-11 link)",
    desc: "Lord of the 2nd and 11th associating — classical wealth combination, steady accumulation.",
    test: (h) => {
      const lord2 = rashis[h[1].signIndex].ruler;
      const lord11 = rashis[h[10].signIndex].ruler;
      const lord2H = h.findIndex((x) => x.planets.some((p) => p.name === lord2));
      const lord11H = h.findIndex((x) => x.planets.some((p) => p.name === lord11));
      return lord2H >= 0 && lord2H === lord11H;
    },
  },
  {
    name: "Lakshmi Yoga",
    desc: "Venus strong in a kendra/trikona — beauty, luxury, and grace-based wealth.",
    test: (h) => {
      const venusH = h.findIndex((x) => x.planets.some((p) => p.name === "Venus"));
      return [0, 3, 4, 6, 8, 9].includes(venusH);
    },
  },
  {
    name: "Chandra-Mangala Yoga",
    desc: "Moon + Mars conjunct — sharp commercial mind, money through trade and risk.",
    test: (h) =>
      h.some((x) => x.planets.some((p) => p.name === "Moon") && x.planets.some((p) => p.name === "Mars")),
  },
  {
    name: "Budha-Aditya Yoga",
    desc: "Sun + Mercury conjunct — intelligence, communication, and authority-driven income.",
    test: (h) =>
      h.some((x) => x.planets.some((p) => p.name === "Sun") && x.planets.some((p) => p.name === "Mercury")),
  },
  {
    name: "Neecha Bhanga Raja Yoga",
    desc: "A debilitated planet whose dispositor is strong — cancellation of weakness becomes royal rise.",
    test: (h) => {
      const DEB: Record<string, number> = {
        Sun: 6, Moon: 7, Mercury: 11, Venus: 5, Mars: 3, Jupiter: 9, Saturn: 0,
      };
      for (const planet of Object.keys(DEB)) {
        const debSign = DEB[planet];
        const found = h.find((x) => x.signIndex === debSign && x.planets.some((p) => p.name === planet));
        if (found) {
          const dispositor = rashis[debSign].ruler;
          if (h.some((x) => x.planets.some((p) => p.name === dispositor))) return true;
        }
      }
      return false;
    },
  },
];

const GLOSSARY: { term: string; def: string }[] = [
  { term: "Lagna", def: "Ascendant — the rising sign at the moment of birth. Anchors the entire chart." },
  { term: "Rashi", def: "A zodiac sign (30° segment of the sidereal ecliptic)." },
  { term: "Bhava", def: "House — one of 12 life areas, counted from the Lagna in whole-sign Vedic style." },
  { term: "Kendra", def: "Angular houses 1, 4, 7, 10 — pillars of the chart, drive action." },
  { term: "Trikona", def: "Trine houses 1, 5, 9 — houses of dharma and grace, source of fortune." },
  { term: "Dushtana", def: "Difficult houses 6, 8, 12 — friction, transformation, and release." },
  { term: "Dhana Bhava", def: "Wealth houses — primarily 2 (accumulation), 5 (speculation), 9 (luck), 11 (gains)." },
  { term: "Yoga", def: "A planetary combination producing a specific life result (wealth, fame, hardship)." },
  { term: "Dasha", def: "Planetary period — Vimshottari is the standard 120-year predictive cycle." },
  { term: "Nakshatra", def: "One of 27 lunar mansions (~13°20' each). Finer than signs; rules personality and dasha." },
  { term: "Pada", def: "A quarter of a nakshatra (3°20'). Maps to the 12 navamsa signs." },
  { term: "Ayanamsa", def: "Offset between tropical and sidereal zodiacs. Lahiri is the Indian government standard." },
  { term: "Retrograde (ʀ)", def: "Apparent backward motion of a planet — intensifies and internalizes its theme." },
];

export default function WealthHousesPanel({ ascendant, planets, ingresses }: Props) {
  const houses = useMemo(() => {
    const ascSign = Math.floor(ascendant / 30);
    return Array.from({ length: 12 }, (_, i) => {
      const signIndex = (ascSign + i) % 12;
      return {
        house: i + 1,
        signIndex,
        planets: planets.filter((p) => Math.floor(p.sid / 30) === signIndex),
      };
    });
  }, [ascendant, planets]);

  const [openHouse, setOpenHouse] = useState<number | null>(null);
  const [section, setSection] = useState<"step" | "yogas" | "glossary" | null>(null);

  const detectedYogas = useMemo(() => YOGAS.filter((y) => y.test(houses)), [houses]);

  const housesForReading = useMemo(
    () => houses.map((h) => ({ house: h.house, planets: h.planets.map((p) => ({ name: p.name, retrograde: p.retrograde })) })),
    [houses],
  );

  const readings = useMemo(() => {
    const map: Record<number, ReturnType<typeof buildHouseReading>> = {};
    for (const h of houses) {
      map[h.house] = buildHouseReading(
        h.house,
        h.signIndex,
        h.planets.map((p) => ({ name: p.name, retrograde: p.retrograde })),
        housesForReading,
      );
    }
    return map;
  }, [houses, housesForReading]);

  return (
    <div className="rounded-xl border border-border/30 bg-background/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h3 className="text-lg font-extralight tracking-[0.15em] text-foreground uppercase">Whole-Sign Houses</h3>
        <p className="text-[10px] font-light text-muted-foreground/80 italic">
          Tap any house for a deep, specific reading — body, life areas, brand, archetype, planets
        </p>
      </div>

      {/* Wealth Doctrine accordion */}
      <div className="rounded-lg border border-border/40 bg-foreground/[0.015]">
        <div className="px-4 py-2.5 flex items-center gap-2 border-b border-border/25">
          <Coins className="h-3.5 w-3.5 text-foreground/70" />
          <span className="text-xs font-light tracking-[0.15em] text-foreground/85 uppercase">
            Wealth Doctrine — How Vedic Astrology Reveals Wealth
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 text-xs">
          {[
            { key: "step" as const, icon: BookOpen, label: "Step-by-Step (Your Chart)" },
            { key: "yogas" as const, icon: Sparkles, label: "Detected Yogas" },
            { key: "glossary" as const, icon: BookOpen, label: "Glossary" },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setSection(section === key ? null : key)}
              className="px-4 py-2.5 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition border-r border-border/15 last:border-r-0"
            >
              <Icon className="h-3 w-3" />
              <span className="font-light">{label}</span>
              <ChevronDown className={`h-3 w-3 transition ${section === key ? "rotate-180" : ""}`} />
            </button>
          ))}
        </div>
        {section === "step" && (
          <div className="px-4 py-3 border-t border-border/15 text-xs text-muted-foreground/90 font-light leading-relaxed space-y-2">
            <p><span className="text-foreground">1.</span> Identify your <span className="text-foreground/85">2nd house</span> ({rashis[houses[1].signIndex].name}) — the bank account.</p>
            <p><span className="text-foreground">2.</span> Locate the <span className="text-foreground/85">2nd lord</span> ({rashis[houses[1].signIndex].ruler}) — where your money comes from by sign and house.</p>
            <p><span className="text-foreground">3.</span> Check the <span className="text-foreground/85">11th house of gains</span> ({rashis[houses[10].signIndex].name}) and its lord ({rashis[houses[10].signIndex].ruler}).</p>
            <p><span className="text-foreground">4.</span> Examine the <span className="text-foreground/85">5th (speculation)</span> and <span className="text-foreground/85">9th (fortune)</span>: {rashis[houses[4].signIndex].name} & {rashis[houses[8].signIndex].name}.</p>
            <p><span className="text-foreground">5.</span> Look for connections (conjunction / aspect / exchange) between these lords — these are <span className="text-foreground/85">Dhana Yogas</span>.</p>
          </div>
        )}
        {section === "yogas" && (
          <div className="px-4 py-3 border-t border-border/15 text-xs space-y-2">
            {detectedYogas.length === 0 ? (
              <p className="text-muted-foreground/70 font-light italic">No major classical yogas detected in primary set.</p>
            ) : (
              detectedYogas.map((y) => (
                <div key={y.name} className="flex gap-2">
                  <Sparkles className="h-3 w-3 text-foreground/70 mt-0.5 shrink-0" />
                  <div>
                    <span className="text-foreground font-light">{y.name}</span>
                    <span className="text-muted-foreground/80 font-light"> — {y.desc}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {section === "glossary" && (
          <div className="px-4 py-3 border-t border-border/15 text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {GLOSSARY.map((g) => (
              <div key={g.term}>
                <span className="text-foreground/85 font-light">{g.term}</span>
                <span className="text-muted-foreground/80 font-light"> — {g.def}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* House grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {houses.map((h) => {
          const meta = HOUSE_META[h.house - 1];
          const sign = rashis[h.signIndex];
          const open = openHouse === h.house;
          return (
            <div
              key={h.house}
              className={`rounded-lg border bg-background/30 transition cursor-pointer ${
                open ? "border-foreground/40 bg-foreground/[0.04]" : "border-border/25 hover:border-border/50"
              }`}
              onClick={() => setOpenHouse(open ? null : h.house)}
            >
              <div className="px-3 pt-2.5 pb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-[9px] font-light text-muted-foreground/70 uppercase tracking-[0.12em]">
                    House {h.house} · {meta.title}
                  </div>
                  <div className="text-sm font-light text-foreground/85 mt-0.5">
                    {sign.symbol} {sign.name} <span className="text-muted-foreground/70">({sign.sanskrit})</span>
                  </div>
                </div>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/50 mt-1 transition ${open ? "rotate-180" : ""}`} />
              </div>
              {h.planets.length > 0 && (
                <div className="px-3 pb-2.5 flex flex-wrap gap-1.5">
                  {h.planets.map((p) => (
                    <span
                      key={p.name}
                      className="inline-flex items-center gap-1 rounded border border-border/30 bg-foreground/[0.04] px-1.5 py-0.5 text-[10px] font-light text-foreground/85"
                    >
                      <span className="text-foreground/70">{p.symbol}</span>
                      {p.name}{p.retrograde && <span className="text-muted-foreground"> ʀ</span>}
                    </span>
                  ))}
                </div>
              )}
              {open && (() => {
                const r = readings[h.house];
                return (
                  <div className="px-3 pb-3 pt-2 border-t border-border/20 text-[11px] font-light text-muted-foreground/90 space-y-3">
                    {/* Quick frame */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      <div><span className="text-muted-foreground/60">Body / Life:</span> {meta.body}</div>
                      <div><span className="text-muted-foreground/60">Brand:</span> {meta.brand}</div>
                      <div><span className="text-muted-foreground/60">Archetype:</span> {meta.archetype}</div>
                      <div><span className="text-muted-foreground/60">Sign ruler:</span> {sign.ruler} · {sign.element}</div>
                      <div className="col-span-2"><span className="text-muted-foreground/60">House karaka:</span> {r.houseKaraka} · <span className="text-muted-foreground/60">Themes:</span> {r.houseThemes.join(", ")}</div>
                    </div>

                    {/* Resident planets — KRS deep readings */}
                    {r.residents.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-[9px] uppercase tracking-[0.2em] text-foreground/60">Resident Planets</div>
                        {r.residents.map((res) => (
                          <div key={res.planet} className="rounded border border-border/20 bg-foreground/[0.02] p-2 space-y-1">
                            <div className="text-foreground/85">
                              {res.planet}{res.retrograde && <span className="text-muted-foreground/70"> (R)</span>} in House {h.house} ({sign.name})
                            </div>
                            <div className="text-muted-foreground/85 leading-relaxed">{res.reading}</div>
                            <div className="text-muted-foreground/60 text-[10px]">
                              Aspect → House {res.aspectHouse}: <span className="text-muted-foreground/80">{res.aspectEffect}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded border border-dashed border-border/25 bg-foreground/[0.015] p-2 text-muted-foreground/85 leading-relaxed">
                        {r.emptyHouseNote}
                      </div>
                    )}

                    {/* Conjunctions */}
                    {r.conjunctions.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[9px] uppercase tracking-[0.2em] text-foreground/60">Conjunctions in this House</div>
                        {r.conjunctions.map((c) => (
                          <div key={c.pair.join("-")} className="rounded border border-border/20 bg-foreground/[0.02] p-2">
                            <div className="text-foreground/85">{c.pair[0]} + {c.pair[1]} — <span className="text-muted-foreground/80">{c.yogaName}</span></div>
                            <div className="text-muted-foreground/80 leading-relaxed mt-0.5">{c.effect}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Incoming aspects */}
                    {r.incomingAspects.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[9px] uppercase tracking-[0.2em] text-foreground/60">Aspects Coming In</div>
                        {r.incomingAspects.map((a, i) => (
                          <div key={i} className="text-muted-foreground/80">
                            <span className="text-foreground/80">{a.planet}</span> from House {a.fromHouse} — <span className="text-muted-foreground/70">{a.meaning}</span>
                    {/* ── ACTIVATION TRIGGERS — what each transit unlocks here ── */}
                    {(() => {
                      const act = buildHouseActivation(h.house, { ascendant, planets }, ingresses);
                      const verdictStyle: Record<string, string> = {
                        supported: "text-emerald-300/90 border-emerald-300/30",
                        amplified: "text-amber-300/90 border-amber-300/30",
                        delayed:   "text-sky-300/90 border-sky-300/30",
                        blocked:   "text-rose-300/90 border-rose-300/30",
                        neutral:   "text-muted-foreground/80 border-border/30",
                      };
                      const fmt = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
                      return (
                        <>
                          {/* Life outcome triggers for THIS house */}
                          {act.outcomes.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-[9px] uppercase tracking-[0.2em] text-foreground/60">Life Outcome Triggers</div>
                              {act.outcomes.map((o, i) => (
                                <div key={i} className={`rounded border bg-foreground/[0.02] p-2 space-y-1 ${verdictStyle[o.chartVerdict]}`}>
                                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                    <div className="text-foreground/90 text-[11.5px]">
                                      {o.outcome} <span className="text-muted-foreground/60">— when</span>{" "}
                                      <span className="text-foreground/85">{o.planet}</span>
                                      <span className="text-muted-foreground/60"> transits House {h.house}</span>
                                      {o.currentlyActive && <span className="ml-1.5 text-[9px] uppercase tracking-[0.15em] text-emerald-300/90">· active now</span>}
                                    </div>
                                    <div className="text-[9px] uppercase tracking-[0.15em] opacity-80">{o.chartVerdict}</div>
                                  </div>
                                  <div className="text-muted-foreground/85 leading-relaxed text-[10.5px]">{o.why}</div>
                                  <div className="text-muted-foreground/75 leading-relaxed text-[10.5px]"><span className="text-foreground/60">Your chart: </span>{o.chartReason}</div>
                                  <div className="text-[10px] text-foreground/70">
                                    {o.currentlyActive
                                      ? "Window is OPEN right now — act."
                                      : o.nextDate
                                        ? <>Next window: <span className="tabular-nums">{fmt(o.nextDate)}</span></>
                                        : <span className="text-muted-foreground/50">No upcoming ingress in the current scan horizon.</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* What each transiting planet unlocks in this house */}
                          <div className="space-y-1">
                            <div className="text-[9px] uppercase tracking-[0.2em] text-foreground/60">What Each Transit Unlocks Here</div>
                            <div className="grid grid-cols-1 gap-0.5">
                              {act.planetUnlocks.map((u) => (
                                <div key={u.planet} className="text-[10.5px] leading-relaxed">
                                  <span className="text-foreground/80">{u.planet}:</span>{" "}
                                  <span className="text-muted-foreground/85">{u.effect}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
