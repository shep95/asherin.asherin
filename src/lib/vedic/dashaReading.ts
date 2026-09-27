/**
 * DASHA READING ENGINE — deterministic, chart-aware, no AI.
 *
 * Reads the user's natal placements (house, sign, dignity, retrograde, nakshatra
 * lord) and the Vimshottari period lord to generate a "horoscope" style
 * narrative + life-event flags (soulmate / millionaire / billionaire / power-peak)
 * for ANY period level (Maha, Antar, Pratyantar, Sookshma, Prana, Deha).
 *
 * Logic style (per project knowledge):
 *   "Asher digs > what causes this person's chart to be wealthy — sees they
 *    have delayed wealth (Saturn) and must detach (Ketu) to gain it, makes
 *    it from digital intelligence (Mercury), and Jupiter is wealth — so in
 *    Jupiter's period it activates."
 */

import type { DashaLord, DashaLevel, DashaPeriod } from "./dasha";
import { computeDignity, houseFromAsc, type PlanetName } from "./dignities";
import type { SweVedicChart } from "./sweChart";

// ─── Significations (Karakas) ────────────────────────────────────────────
const KARAKA: Record<DashaLord, string[]> = {
  Sun:     ["soul", "father", "authority", "government", "throne", "ego"],
  Moon:    ["mind", "mother", "public", "emotion", "home", "fluids"],
  Mars:    ["energy", "courage", "siblings", "land", "weapons", "real estate", "competition"],
  Mercury: ["intellect", "speech", "commerce", "digital intelligence", "writing", "trade", "code"],
  Jupiter: ["wisdom", "wealth", "children", "guru", "expansion", "finance", "law"],
  Venus:   ["love", "soulmate", "spouse", "luxury", "art", "beauty", "vehicles"],
  Saturn:  ["delay", "discipline", "labor", "longevity", "structure", "karma", "old wealth"],
  Rahu:    ["obsession", "foreign lands", "technology", "fame hunger", "amplification"],
  Ketu:    ["detachment", "moksha", "research", "occult", "loss-then-gain"],
};

// Wealth significators in classical Jyotish
const WEALTH_LORDS = new Set<DashaLord>(["Jupiter", "Venus", "Mercury", "Moon"]);
const POWER_LORDS  = new Set<DashaLord>(["Sun", "Mars", "Saturn", "Rahu"]);
const RELATION_LORDS = new Set<DashaLord>(["Venus", "Moon", "Jupiter"]);
const DETACHMENT_LORDS = new Set<DashaLord>(["Ketu", "Saturn"]);

// House meanings used by the engine
const HOUSE_THEME: Record<number, string> = {
  1: "self / vitality", 2: "wealth / family / speech", 3: "courage / effort",
  4: "home / inner peace", 5: "children / speculation / fame",
  6: "rivals / debt / service", 7: "partnership / spouse",
  8: "transformation / inheritance / occult", 9: "fortune / dharma / guru",
  10: "career / authority", 11: "gains / income / network",
  12: "loss / foreign lands / liberation",
};

const DUSTHANA = new Set([6, 8, 12]);
const KENDRA = new Set([1, 4, 7, 10]);
const TRIKONA = new Set([1, 5, 9]);
const WEALTH_HOUSES = new Set([2, 11, 5, 9]);

export type LifeFlag = "soulmate" | "millionaire" | "billionaire" | "power_peak" | "viral_influence";

export interface DashaInsight {
  /** Human label e.g. "Jupiter Mahadasha" */
  title: string;
  /** Headline horoscope-style sentence */
  headline: string;
  /** Bullet list — chart-grounded mechanics */
  mechanics: string[];
  /** Themes for the period (career, love, money…) */
  themes: string[];
  /** Special life-event flags */
  flags: LifeFlag[];
  /** 0–100 power score for this period */
  power: number;
  /** 0–100 wealth score */
  wealth: number;
  /** 0–100 relationship score */
  relationship: number;
}

interface PlanetSnapshot {
  name: PlanetName;
  house: number;
  sign: number;
  retrograde: boolean;
  exalted: boolean;
  debilitated: boolean;
  ownSign: boolean;
  combust: boolean;
}

function snapshot(chart: SweVedicChart): Record<PlanetName, PlanetSnapshot> {
  const sun = chart.planets.find((p) => p.name === "Sun");
  const sunDeg = sun ? sun.sid : 0;
  const out = {} as Record<PlanetName, PlanetSnapshot>;
  for (const p of chart.planets) {
    const dig = computeDignity(p.name as PlanetName, p.sid, sunDeg, p.retrograde);
    out[p.name as PlanetName] = {
      name: p.name as PlanetName,
      house: houseFromAsc(p.sid, chart.ascendant),
      sign: Math.floor(p.sid / 30),
      retrograde: p.retrograde,
      exalted: dig.exalted,
      debilitated: dig.debilitated,
      ownSign: dig.ownSign,
      combust: dig.combust,
    };
  }
  return out;
}

/** Score how strong a single planet is in the natal chart (0–100). */
function planetStrength(snap: PlanetSnapshot): number {
  let s = 50;
  if (snap.exalted) s += 25;
  if (snap.ownSign) s += 15;
  if (snap.debilitated) s -= 25;
  if (snap.combust) s -= 10;
  if (KENDRA.has(snap.house)) s += 8;
  if (TRIKONA.has(snap.house)) s += 10;
  if (DUSTHANA.has(snap.house)) s -= 12;
  if (snap.retrograde && (snap.name !== "Rahu" && snap.name !== "Ketu")) s += 4;
  return Math.max(0, Math.min(100, s));
}

/** Reduce sub-period dignity influence with depth so deep nodes stay readable. */
const LEVEL_WEIGHT: Record<DashaLevel, number> = {
  maha: 1.0, antar: 0.85, pratyantar: 0.7, sookshma: 0.55, prana: 0.4, deha: 0.3,
};

const LEVEL_LABEL: Record<DashaLevel, string> = {
  maha: "Mahadasha", antar: "Antardasha", pratyantar: "Pratyantardasha",
  sookshma: "Sookshma", prana: "Prana", deha: "Deha",
};

/**
 * Generate a horoscope-style insight for ANY dasha period given the natal chart.
 * Sub-period chain (parents) is used to combine influences.
 */
export function buildDashaInsight(
  period: DashaPeriod,
  parents: DashaPeriod[],
  chart: SweVedicChart,
): DashaInsight {
  const snaps = snapshot(chart);
  const lord = period.lord as DashaLord;
  const lordPlanet = snaps[lord as PlanetName];
  // Ketu is not in chart.planets directly when name string differs — guard:
  const me = lordPlanet ?? snaps["Ketu" as PlanetName] ?? snaps["Sun" as PlanetName];

  const chain = [...parents, period].map((p) => p.lord as DashaLord);
  const lvlW = LEVEL_WEIGHT[period.level];

  // Base scores from the lord's natal strength
  const base = planetStrength(me);
  let power = base, wealth = base, rel = base;

  // House-based modifiers
  if (WEALTH_HOUSES.has(me.house)) wealth += 15;
  if (DUSTHANA.has(me.house)) wealth -= 10;
  if (me.house === 7 || me.house === 5) rel += 12;
  if (me.house === 10 || me.house === 1) power += 10;

  // Karaka-based modifiers — what the lord naturally signifies
  if (WEALTH_LORDS.has(lord)) wealth += 10;
  if (POWER_LORDS.has(lord)) power += 10;
  if (RELATION_LORDS.has(lord)) rel += 8;
  if (DETACHMENT_LORDS.has(lord)) { wealth -= 4; rel -= 6; power += 4; }

  // Combine parent influences (Antar / Pratyantar give the *trigger*)
  for (const parentLord of parents) {
    const pl = snaps[parentLord.lord as PlanetName];
    if (!pl) continue;
    const w = LEVEL_WEIGHT[parentLord.level] * 0.4;
    if (WEALTH_HOUSES.has(pl.house)) wealth += 6 * w;
    if (pl.exalted) { power += 5 * w; wealth += 3 * w; }
    if (pl.debilitated) { power -= 4 * w; wealth -= 3 * w; }
  }

  // Apply level weight — deeper sub-periods have smaller absolute amplitude
  const center = (v: number) => 50 + (v - 50) * lvlW;
  power = Math.max(0, Math.min(100, center(power)));
  wealth = Math.max(0, Math.min(100, center(wealth)));
  rel = Math.max(0, Math.min(100, center(rel)));

  // ── Life-event flags ────────────────────────────────────────────────────
  const flags: LifeFlag[] = [];

  // Soulmate: Venus / Moon / Jupiter touching the chain AND 7th-house resonance
  const seventhLord = (chart.planets.find((p) => Math.floor(p.sid / 30) === ((Math.floor(chart.ascendant / 30) + 6) % 12))?.name as PlanetName) || "Venus";
  if (
    chain.some((c) => RELATION_LORDS.has(c)) &&
    (chain.includes(seventhLord as DashaLord) || rel >= 70)
  ) flags.push("soulmate");

  // Millionaire: wealth lord chain + activated 2/11 + lord not severely afflicted
  const wealthChainHits = chain.filter((c) => WEALTH_LORDS.has(c)).length;
  if (wealthChainHits >= 1 && wealth >= 65 && (WEALTH_HOUSES.has(me.house) || me.exalted || me.ownSign)) {
    flags.push("millionaire");
  }

  // Billionaire: rare — Jupiter + Saturn (Lakshmi-Yoga style: expansion + structure)
  // anywhere in chain, with very high wealth and Jupiter or 11th-lord involvement.
  const hasJup = chain.includes("Jupiter");
  const hasSat = chain.includes("Saturn");
  const hasMercOrRahu = chain.includes("Mercury") || chain.includes("Rahu");
  if (hasJup && hasSat && hasMercOrRahu && wealth >= 78 && (snaps["Jupiter"]?.house ?? 0) !== 6) {
    flags.push("billionaire");
  }

  // Power peak: Sun/Mars/Saturn/Rahu with kendra/10th activation, high power
  if (POWER_LORDS.has(lord) && (KENDRA.has(me.house) || me.house === 10) && power >= 72) {
    flags.push("power_peak");
  }

  // Viral influence / mass-public attention:
  //  - Rahu in the chain = amplification / sudden virality, OR
  //  - Moon (mass mind) combined with a fame-bearing lord (Sun/Venus/Mercury/Jupiter)
  //  - Lord activated through a visibility house (1/3/5/10/11)
  const VISIBILITY_HOUSES = new Set([1, 3, 5, 10, 11]);
  const FAME_LORDS = new Set<DashaLord>(["Sun", "Venus", "Mercury", "Jupiter"]);
  const hasRahu = chain.includes("Rahu");
  const hasMoon = chain.includes("Moon");
  const hasFameLord = chain.some((c) => FAME_LORDS.has(c));
  const visibilityActive = VISIBILITY_HOUSES.has(me.house);
  if (
    (hasRahu || (hasMoon && hasFameLord)) &&
    visibilityActive &&
    (power + rel) / 2 >= 60 &&
    !me.combust
  ) {
    flags.push("viral_influence");
  }

  // ── Mechanics narrative (chart-grounded, not generic) ──────────────────
  const mechanics: string[] = [];
  const dignity = me.exalted ? "exalted" : me.debilitated ? "debilitated" : me.ownSign ? "in own sign" : "in neutral dignity";
  mechanics.push(
    `${lord} sits in House ${me.house} (${HOUSE_THEME[me.house]}), ${dignity}${me.combust ? ", combust" : ""}${me.retrograde ? ", retrograde" : ""}.`
  );
  mechanics.push(
    `Natural significations activated: ${KARAKA[lord].slice(0, 4).join(", ")}.`
  );

  if (parents.length > 0) {
    const parentNames = parents.map((p) => `${p.lord} (${LEVEL_LABEL[p.level]})`).join(" → ");
    mechanics.push(`Triggered through the chain: ${parentNames} → ${lord}.`);
  }

  // The "Asher digs" rationale
  if (flags.includes("millionaire") || flags.includes("billionaire")) {
    const why: string[] = [];
    if (DETACHMENT_LORDS.has(lord) || chain.some((c) => DETACHMENT_LORDS.has(c))) {
      why.push("delay/detachment forces letting go before gain (Saturn/Ketu signature)");
    }
    if (chain.includes("Mercury")) why.push("digital intelligence and commerce (Mercury) supplies the channel");
    if (chain.includes("Jupiter")) why.push("Jupiter expands the wealth karaka");
    if (chain.includes("Venus")) why.push("Venus brings luxury & assets");
    if (why.length) mechanics.push(`Why wealth activates now: ${why.join("; ")}.`);
  }

  // ── Headline (horoscope tone) ──────────────────────────────────────────
  const tones: string[] = [];
  if (power >= 70) tones.push("commanding");
  else if (power <= 35) tones.push("low-visibility");
  if (wealth >= 70) tones.push("financially expansive");
  else if (wealth <= 35) tones.push("financially tight");
  if (rel >= 70) tones.push("relationally magnetic");
  else if (rel <= 35) tones.push("relationally quiet");
  const toneStr = tones.length ? tones.join(", ") : "transitional";

  const headline = `${LEVEL_LABEL[period.level]} of ${lord} — a ${toneStr} window where ${KARAKA[lord][0]} and ${KARAKA[lord][1]} run the show.`;

  const themes = Array.from(new Set([
    ...KARAKA[lord].slice(0, 3),
    HOUSE_THEME[me.house].split(" / ")[0],
  ]));

  return {
    title: `${lord} ${LEVEL_LABEL[period.level]}`,
    headline,
    mechanics,
    themes,
    flags,
    power: Math.round(power),
    wealth: Math.round(wealth),
    relationship: Math.round(rel),
  };
}
