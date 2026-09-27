// Vedic synastry / compatibility scoring.
// Inputs: any two charts (own saved chart, generated chart, or country foundation chart).
// Output: percentage compatibility + breakdown (Kuta-style).

import { rashis } from "@/data/nakshatraData";
import type { SweVedicChart } from "./sweChart";
import { calculateSweVedicChart } from "./sweChart";
import type { CountryFoundation } from "@/data/vedic/countryCharts";

export interface CompatInput {
  label: string;
  chart: SweVedicChart;
}

export interface CompatBreakdown {
  varna:      { score: number; max: number; note: string }; // class harmony
  vashya:     { score: number; max: number; note: string }; // mutual influence
  tara:       { score: number; max: number; note: string }; // nakshatra distance
  yoni:       { score: number; max: number; note: string }; // sexual/animal nature
  graha:      { score: number; max: number; note: string }; // moon-lord friendship
  gana:       { score: number; max: number; note: string }; // temperament
  bhakoot:    { score: number; max: number; note: string }; // moon sign relationship
  nadi:       { score: number; max: number; note: string }; // health / lineage
  ascAffinity:{ score: number; max: number; note: string }; // ascendant element bridge
}

export interface CompatResult {
  total: number;     // out of 36
  pct: number;       // 0-100
  verdict: string;
  breakdown: CompatBreakdown;
  elementA: string;
  elementB: string;
  highlights: string[];
}

const ELEMENT_OF_SIGN = ["Fire","Earth","Air","Water","Fire","Earth","Air","Water","Fire","Earth","Air","Water"];
const VARNA  = ["Kshatriya","Vaishya","Shudra","Brahmin","Kshatriya","Vaishya","Shudra","Brahmin","Kshatriya","Vaishya","Shudra","Brahmin"];
const VASHYA = ["Quadruped","Quadruped","Human","Watery","Quadruped","Human","Human","Insect","Human","Quadruped","Human","Watery"];
const YONI = ["Horse","Serpent","Cat","Sheep","Rat","Cow","Buffalo","Deer","Mongoose","Lion","Tiger","Monkey","Dog","Cat","Rat","Cow","Buffalo","Tiger","Deer","Monkey","Mongoose","Lion","Horse","Sheep","Serpent","Dog","Cow","Elephant"];
const GANA = ["Deva","Manushya","Rakshasa","Manushya","Deva","Manushya","Deva","Rakshasa","Rakshasa","Manushya","Deva","Manushya","Rakshasa","Manushya","Deva","Rakshasa","Deva","Rakshasa","Manushya","Manushya","Deva","Manushya","Rakshasa","Rakshasa","Manushya","Deva","Deva","Rakshasa"];
const NADI = ["Vata","Pitta","Kapha","Kapha","Pitta","Vata","Vata","Pitta","Kapha","Kapha","Pitta","Vata","Vata","Pitta","Kapha","Kapha","Pitta","Vata","Vata","Pitta","Kapha","Kapha","Pitta","Vata","Vata","Pitta","Kapha","Kapha"];
const RASHI_LORD = ["Mars","Venus","Mercury","Moon","Sun","Mercury","Venus","Mars","Jupiter","Saturn","Saturn","Jupiter"];
const FRIEND: Record<string, string[]> = {
  Sun:["Moon","Mars","Jupiter"], Moon:["Sun","Mercury"],
  Mars:["Sun","Moon","Jupiter"], Mercury:["Sun","Venus"],
  Jupiter:["Sun","Moon","Mars"], Venus:["Mercury","Saturn"],
  Saturn:["Mercury","Venus"],
};

function moonSignIdx(c: SweVedicChart): number {
  const moon = c.planets.find((p) => p.name === "Moon");
  return moon ? Math.floor(moon.sid / 30) : 0;
}
function moonNakshatraIdx(c: SweVedicChart): number {
  const moon = c.planets.find((p) => p.name === "Moon");
  return moon ? Math.floor((moon.sid * 27) / 360) : 0;
}
function ascSignIdx(c: SweVedicChart): number { return Math.floor(c.ascendant / 30); }

function score(a: SweVedicChart, b: SweVedicChart): CompatResult {
  const aMoonSign = moonSignIdx(a), bMoonSign = moonSignIdx(b);
  const aNak = moonNakshatraIdx(a), bNak = moonNakshatraIdx(b);
  const aAscSign = ascSignIdx(a),   bAscSign = ascSignIdx(b);

  // 1. Varna (1)
  const varna = { score: VARNA[aMoonSign] === VARNA[bMoonSign] ? 1 : 0.5, max: 1,
    note: `${VARNA[aMoonSign]} ↔ ${VARNA[bMoonSign]}` };

  // 2. Vashya (2)
  const vashya = { score: VASHYA[aMoonSign] === VASHYA[bMoonSign] ? 2 : 1, max: 2,
    note: `${VASHYA[aMoonSign]} ↔ ${VASHYA[bMoonSign]}` };

  // 3. Tara (3) — nakshatra count divisibility
  const fwd = ((bNak - aNak + 27) % 27) + 1;
  const back = ((aNak - bNak + 27) % 27) + 1;
  const taraOk = (fwd % 9 !== 0) && (back % 9 !== 0); // skip 9,18,27
  const tara = { score: taraOk ? 3 : 1.5, max: 3,
    note: `Tara forward ${fwd}, reverse ${back}` };

  // 4. Yoni (4)
  const sameYoni = YONI[aNak] === YONI[bNak];
  const yoni = { score: sameYoni ? 4 : 2.5, max: 4,
    note: `${YONI[aNak]} ↔ ${YONI[bNak]}` };

  // 5. Graha Maitri (5) — moon-sign-lord friendship
  const aL = RASHI_LORD[aMoonSign], bL = RASHI_LORD[bMoonSign];
  const friendly = aL === bL ? 5 : (FRIEND[aL]?.includes(bL) || FRIEND[bL]?.includes(aL)) ? 4 : 1;
  const graha = { score: friendly, max: 5, note: `${aL} ↔ ${bL}` };

  // 6. Gana (6)
  const ga = GANA[aNak], gb = GANA[bNak];
  let ganaScore = 6;
  if (ga !== gb) {
    if ((ga === "Deva" && gb === "Manushya") || (gb === "Deva" && ga === "Manushya")) ganaScore = 5;
    else if ((ga === "Manushya" && gb === "Rakshasa") || (gb === "Manushya" && ga === "Rakshasa")) ganaScore = 1;
    else if ((ga === "Deva" && gb === "Rakshasa") || (gb === "Deva" && ga === "Rakshasa")) ganaScore = 0;
    else ganaScore = 3;
  }
  const gana = { score: ganaScore, max: 6, note: `${ga} ↔ ${gb}` };

  // 7. Bhakoot (7) — moon sign 6/8, 5/9, 2/12 relationships
  const diff = ((bMoonSign - aMoonSign + 12) % 12) + 1;
  const bad = [6, 8, 12, 2].includes(diff) || [6, 8, 12, 2].includes(14 - diff);
  const bhakoot = { score: bad ? 0 : 7, max: 7,
    note: bad ? `Doshic ${diff}/${14 - diff}` : `Harmonious ${diff}/${14 - diff}` };

  // 8. Nadi (8)
  const sameNadi = NADI[aNak] === NADI[bNak];
  const nadi = { score: sameNadi ? 0 : 8, max: 8,
    note: `${NADI[aNak]} ↔ ${NADI[bNak]}${sameNadi ? " (Nadi dosha)" : ""}` };

  // 9. Ascendant element affinity (bonus, out of 4 — separate, not in classical 36)
  const ea = ELEMENT_OF_SIGN[aAscSign], eb = ELEMENT_OF_SIGN[bAscSign];
  let ascScore = 1;
  if (ea === eb) ascScore = 4;
  else if ((ea === "Fire" && eb === "Air") || (ea === "Air" && eb === "Fire")) ascScore = 3.5;
  else if ((ea === "Earth" && eb === "Water") || (ea === "Water" && eb === "Earth")) ascScore = 3.5;
  else if ((ea === "Fire" && eb === "Water") || (ea === "Water" && eb === "Fire")) ascScore = 1.5;
  else ascScore = 2.5;
  const ascAffinity = { score: ascScore, max: 4, note: `${ea} (${rashis[aAscSign].name}) ↔ ${eb} (${rashis[bAscSign].name})` };

  const breakdown: CompatBreakdown = { varna, vashya, tara, yoni, graha, gana, bhakoot, nadi, ascAffinity };
  const total = varna.score + vashya.score + tara.score + yoni.score + graha.score + gana.score + bhakoot.score + nadi.score; // /36
  const pct = Math.round((total / 36) * 100);

  let verdict = "Excellent — strong karmic match";
  if (pct < 80) verdict = "Strong — workable harmony";
  if (pct < 65) verdict = "Mixed — manageable with effort";
  if (pct < 50) verdict = "Challenging — significant friction";
  if (pct < 35) verdict = "Severe doshas — caution advised";

  const highlights: string[] = [];
  if (nadi.score === 0) highlights.push("⚠ Nadi Dosha (same nadi) — health/lineage caution");
  if (bhakoot.score === 0) highlights.push("⚠ Bhakoot Dosha (Moon sign 2/12, 5/9, or 6/8)");
  if (gana.score <= 1) highlights.push("⚠ Gana mismatch (Deva ↔ Rakshasa)");
  if (graha.score >= 4) highlights.push("✓ Friendly Moon-sign rulers — emotional ease");
  if (ascAffinity.score >= 3.5) highlights.push("✓ Ascendant elements harmonize");

  return { total, pct, verdict, breakdown, elementA: ea, elementB: eb, highlights };
}

export async function compareCharts(a: SweVedicChart, b: SweVedicChart): Promise<CompatResult> {
  return score(a, b);
}

export async function chartFromCountry(c: CountryFoundation): Promise<SweVedicChart> {
  return calculateSweVedicChart({
    birthDate: c.birthDate,
    birthTime: c.birthTime,
    tzOffset: c.tzOffset,
    lat: c.lat,
    lon: c.lon,
  });
}

export async function chartFromSaved(input: { birth_date: string; birth_time: string; tz_offset: number; latitude: number; longitude: number }): Promise<SweVedicChart> {
  return calculateSweVedicChart({
    birthDate: input.birth_date,
    birthTime: input.birth_time,
    tzOffset: input.tz_offset,
    lat: input.latitude,
    lon: input.longitude,
  });
}
