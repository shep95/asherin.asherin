/**
 * Deterministic (non-AI) reading engine. Given chart placements, looks up
 * sentences from a corpus indexed by:
 *   planet_house:<planet>:<1..12>
 *   planet_sign:<planet>:<sign>
 *   planet_nakshatra:<planet>:<nakshatra>
 *   conjunction:<planetA>-<planetB>   (alphabetical)
 *
 * The corpus was built by parsing transcripts sentence-by-sentence; this
 * module only does lookups, scoring, and assembly — no LLM, no network.
 */
import corpus from "@/data/vedic/readings-corpus.json";

const SIGN_NAMES = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
];

const NAK_NAMES = [
  "ashwini", "bharani", "krittika", "rohini", "mrigashira", "ardra",
  "punarvasu", "pushya", "ashlesha", "magha", "purva phalguni", "uttara phalguni",
  "hasta", "chitra", "swati", "vishakha", "anuradha", "jyeshtha",
  "mula", "purva ashadha", "uttara ashadha", "shravana", "dhanishta",
  "shatabhisha", "purva bhadrapada", "uttara bhadrapada", "revati",
];

const HOUSE_THEMES = [
  "identity, vitality, body, and self-direction",
  "wealth, speech, family lineage, food, and stored assets",
  "courage, siblings, media, skills, hands, and self-made effort",
  "home, mother, land, vehicles, emotional security, and private peace",
  "intelligence, children, creativity, speculation, mantra, and past-life merit",
  "work, health, enemies, debts, disputes, service, and daily discipline",
  "marriage, contracts, open rivals, clients, and public dealing",
  "occult knowledge, inheritance, joint wealth, crisis, secrecy, and rebirth",
  "fortune, teachers, father, dharma, publishing, and long-distance movement",
  "career, authority, reputation, command, rank, and visible achievement",
  "income, networks, elder siblings, patrons, influence, and major gains",
  "foreign lands, sleep, losses, isolation, liberation, and hidden expenditure",
];

const PLANET_THEMES: Record<string, string> = {
  sun: "authority, confidence, father, rank, visibility, and sovereign will",
  moon: "mind, emotions, mother, memory, public mood, and adaptability",
  mars: "drive, combat, engineering, courage, land, conflict, and decisive action",
  mercury: "speech, trade, analytics, writing, strategy, calculation, and youth",
  venus: "wealth, pleasure, art, women, luxury, agreements, and relational magnetism",
  jupiter: "wisdom, teachers, law, children, blessings, finance, and expansion",
  saturn: "discipline, delay, labor, systems, endurance, duty, and mass influence",
  rahu: "foreignness, obsession, amplification, technology, taboo, and unconventional rise",
  ketu: "detachment, past-life mastery, severance, austerity, moksha, and sharp insight",
};

export interface PlacementInput {
  name: string;     // "Sun", "Moon", ...
  house: number;    // 1..12
  signIndex: number;// 0..11
  nakIndex: number; // 0..26
  retrograde: boolean;
}

export interface ReadingSection {
  planet: string;
  headline: string;
  bullets: string[];
}

export interface ReadingReport {
  sections: ReadingSection[];
  conjunctions: ReadingSection[];
}

const corpusMap = corpus as Record<string, string[]>;

function lookup(key: string): string[] {
  return corpusMap[key] ?? [];
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const k = s.slice(0, 80);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function fallbackReading(p: PlacementInput, sign: string, nak: string): string[] {
  const planet = p.name.toLowerCase();
  const planetTheme = PLANET_THEMES[planet] ?? "chart activation";
  const houseTheme = HOUSE_THEMES[p.house - 1];
  return [
    `${p.name} activates House ${p.house}, making ${houseTheme} a primary field where ${planetTheme} must express itself in concrete life events.`,
    `In ${capitalize(sign)}, ${p.name} operates through the sign's style, so its results become personalized through that rashi before manifesting through House ${p.house}.`,
    `Through ${capitalize(nak)}, this placement refines the result to a nakshatra-level pattern; the reading should prioritize its lunar mansion before giving broad sign-only judgments.`,
    p.retrograde
      ? `${p.name} is retrograde, so its results are internalized, delayed, repeated, or intensified until the native consciously masters that planetary function.`
      : `${p.name} is direct, so its house and sign results tend to express more outwardly and straightforwardly when its dasha or antardasha activates.`,
  ];
}

export function generateReading(placements: PlacementInput[]): ReadingReport {
  const sections: ReadingSection[] = [];

  for (const p of placements) {
    const planet = p.name.toLowerCase();
    const sign = SIGN_NAMES[p.signIndex];
    const nak = NAK_NAMES[p.nakIndex];

    const houseReadings = lookup(`planet_house:${planet}:${p.house}`);
    const signReadings = lookup(`planet_sign:${planet}:${sign}`);
    const nakKey = nak.replace(/\s+/g, "_");
    const nakReadings = lookup(`planet_nakshatra:${planet}:${nakKey}`);

    // Take up to 3 from each category, dedup overall.
    const bullets = dedupe([
      ...houseReadings.slice(0, 3),
      ...signReadings.slice(0, 2),
      ...nakReadings.slice(0, 2),
      ...fallbackReading(p, sign, nak),
    ]).slice(0, 6);

    if (bullets.length === 0) continue;

    sections.push({
      planet: p.name,
      headline: `${p.name} in House ${p.house} · ${capitalize(sign)} · ${capitalize(nak)}${p.retrograde ? " (Retrograde)" : ""}`,
      bullets,
    });
  }

  // Conjunctions: any two planets sharing the same sign.
  const bySign = new Map<number, PlacementInput[]>();
  for (const p of placements) {
    const arr = bySign.get(p.signIndex) ?? [];
    arr.push(p);
    bySign.set(p.signIndex, arr);
  }
  const conjunctions: ReadingSection[] = [];
  const seenPairs = new Set<string>();
  for (const arr of bySign.values()) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i].name.toLowerCase();
        const b = arr[j].name.toLowerCase();
        const pair = [a, b].sort();
        const key = pair.join("-");
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        const readings = lookup(`conjunction:${key}`);
        if (readings.length === 0) continue;
        conjunctions.push({
          planet: `${capitalize(pair[0])} ⚭ ${capitalize(pair[1])}`,
          headline: `Conjunction in ${capitalize(SIGN_NAMES[arr[i].signIndex])} (House ${arr[i].house})`,
          bullets: dedupe(readings).slice(0, 4),
        });
      }
    }
  }

  return { sections, conjunctions };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
