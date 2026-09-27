// Greek + Roman mythology archetype matcher.
// Maps Vedic planetary signatures (date-derived) to mythological figures
// using each figure's domain weights (war, wisdom, love, chaos, sea, sky, etc.).

export type Archetype = {
  name: string;
  pantheon: "Greek" | "Roman" | "Greek-Monster" | "Roman-Monster";
  domain: string;
  weights: Record<string, number>; // 0-1
  blurb: string;
};

// Compact, curated set — gods + monsters from both pantheons
export const MYTHOLOGY: Archetype[] = [
  // ── Greek Gods ───────────────────────────────────────────────────────────
  { name: "Zeus", pantheon: "Greek", domain: "Sky · Sovereignty · Thunder",
    weights: { authority: 1, sky: 1, war: 0.6, wisdom: 0.5, justice: 0.7 },
    blurb: "Throne-builder. Reads the room, then decides for it." },
  { name: "Athena", pantheon: "Greek", domain: "Wisdom · Strategy · Craft",
    weights: { wisdom: 1, war: 0.7, craft: 0.9, justice: 0.8 },
    blurb: "Tactical mind. Wins through architecture, not impulse." },
  { name: "Apollo", pantheon: "Greek", domain: "Light · Prophecy · Music",
    weights: { wisdom: 0.7, sky: 0.6, beauty: 0.8, healing: 0.7 },
    blurb: "Pattern-seer. Translates chaos into clean signal." },
  { name: "Ares", pantheon: "Greek", domain: "War · Aggression",
    weights: { war: 1, chaos: 0.7, authority: 0.4 },
    blurb: "Direct-impact operator. No preamble, no apology." },
  { name: "Aphrodite", pantheon: "Greek", domain: "Love · Beauty · Magnetism",
    weights: { love: 1, beauty: 1, persuasion: 0.8 },
    blurb: "Field generator. Bends rooms by presence alone." },
  { name: "Hermes", pantheon: "Greek", domain: "Messages · Trade · Trickery",
    weights: { speed: 1, persuasion: 0.9, craft: 0.6, chaos: 0.4 },
    blurb: "Latency-killer. Moves information faster than the market." },
  { name: "Artemis", pantheon: "Greek", domain: "Wild · Hunt · Independence",
    weights: { focus: 1, war: 0.6, wisdom: 0.5, healing: 0.4 },
    blurb: "Lone aim. Doesn't miss when it actually matters." },
  { name: "Hades", pantheon: "Greek", domain: "Underworld · Wealth · Memory",
    weights: { authority: 0.9, wisdom: 0.7, wealth: 1, chaos: 0.5 },
    blurb: "Long-arc accumulator. Owns what nobody sees." },
  { name: "Poseidon", pantheon: "Greek", domain: "Sea · Earthquake",
    weights: { sea: 1, chaos: 0.8, authority: 0.7, war: 0.5 },
    blurb: "Volatility incarnate. Calm surface, tectonic floor." },
  { name: "Dionysus", pantheon: "Greek", domain: "Ecstasy · Wine · Rebirth",
    weights: { chaos: 0.9, beauty: 0.7, persuasion: 0.7, healing: 0.5 },
    blurb: "Frame-breaker. Rewrites the rules mid-ritual." },
  // ── Roman Gods (distinct flavor) ──────────────────────────────────────────
  { name: "Jupiter", pantheon: "Roman", domain: "Law · Imperium · Sky",
    weights: { authority: 1, justice: 0.9, sky: 0.9, wisdom: 0.6 },
    blurb: "Institution-builder. Codifies what others improvise." },
  { name: "Minerva", pantheon: "Roman", domain: "Wisdom · Trades · Defense",
    weights: { wisdom: 1, craft: 1, war: 0.5, justice: 0.6 },
    blurb: "Disciplined intellect. Trains skill into weapon." },
  { name: "Mars", pantheon: "Roman", domain: "War · Order through Force",
    weights: { war: 1, authority: 0.7, justice: 0.4 },
    blurb: "Engineered violence. Turns campaigns into doctrine." },
  { name: "Venus", pantheon: "Roman", domain: "Love · Lineage · Victory",
    weights: { love: 1, beauty: 0.9, persuasion: 0.7, authority: 0.5 },
    blurb: "Magnetic founder. Builds dynasties through loyalty." },
  { name: "Mercury", pantheon: "Roman", domain: "Commerce · Eloquence",
    weights: { speed: 1, persuasion: 1, wealth: 0.7, craft: 0.4 },
    blurb: "Deal-flow engine. Closes before others read the brief." },
  { name: "Pluto", pantheon: "Roman", domain: "Hidden Wealth · Dead",
    weights: { wealth: 1, authority: 0.7, wisdom: 0.6, chaos: 0.4 },
    blurb: "Subterranean strategist. Owns the supply chain you can't see." },
  { name: "Neptune", pantheon: "Roman", domain: "Sea · Horses · Storm",
    weights: { sea: 1, chaos: 0.7, authority: 0.6 },
    blurb: "Pulls leverage from currents. Survives every storm by riding it." },
  { name: "Diana", pantheon: "Roman", domain: "Hunt · Moon · Sovereignty",
    weights: { focus: 1, healing: 0.5, wisdom: 0.6, war: 0.5 },
    blurb: "Self-governing. Answers to nothing but the target." },
  // ── Monsters · Greek ─────────────────────────────────────────────────────
  { name: "Medusa", pantheon: "Greek-Monster", domain: "Petrifying Gaze",
    weights: { focus: 1, chaos: 0.6, beauty: 0.7, war: 0.6 },
    blurb: "Stares back harder than the world stares at you." },
  { name: "Minotaur", pantheon: "Greek-Monster", domain: "Labyrinth Guardian",
    weights: { war: 0.9, authority: 0.5, chaos: 0.7 },
    blurb: "Rules a maze nobody else can navigate." },
  { name: "Hydra", pantheon: "Greek-Monster", domain: "Multi-Headed Regrowth",
    weights: { chaos: 1, war: 0.8, healing: 0.7 },
    blurb: "Cut a problem; two more take its place — for them, not you." },
  { name: "Cerberus", pantheon: "Greek-Monster", domain: "Threshold Hound",
    weights: { authority: 0.8, war: 0.7, focus: 0.9 },
    blurb: "Decides who passes. Nobody negotiates with the gate." },
  { name: "Sphinx", pantheon: "Greek-Monster", domain: "Riddle · Lethal Test",
    weights: { wisdom: 1, chaos: 0.5, authority: 0.6 },
    blurb: "Filters humans by intellect. Wrong answer ends the conversation." },
  { name: "Chimera", pantheon: "Greek-Monster", domain: "Composite Predator",
    weights: { chaos: 1, war: 0.8, craft: 0.5 },
    blurb: "Three threats in one frame. Can't be defended against linearly." },
  { name: "Cyclops", pantheon: "Greek-Monster", domain: "Forge · One-Eye Focus",
    weights: { craft: 1, war: 0.7, focus: 0.9 },
    blurb: "Forges weapons gods themselves carry." },
  // ── Monsters · Roman / Romanised ─────────────────────────────────────────
  { name: "Lupa (She-Wolf)", pantheon: "Roman-Monster", domain: "Founder-Mother",
    weights: { authority: 0.7, war: 0.6, healing: 0.6, focus: 0.6 },
    blurb: "Raises empires by feeding them when nothing else will." },
  { name: "Cacus", pantheon: "Roman-Monster", domain: "Fire-Breathing Thief",
    weights: { chaos: 0.9, war: 0.7, wealth: 0.6 },
    blurb: "Steals what's already stolen. Closes the loop in smoke." },
  { name: "Scylla", pantheon: "Roman-Monster", domain: "Strait Devourer",
    weights: { sea: 1, chaos: 0.8, war: 0.7 },
    blurb: "Chokepoint operator. Owns the only path through." },
  { name: "Charybdis", pantheon: "Roman-Monster", domain: "Whirlpool",
    weights: { sea: 1, chaos: 1, wealth: 0.4 },
    blurb: "Pulls everything inward. Resistance is fuel." },
];

// Derive crude weights from a birth date (no swiss-eph dependency).
// Uses: month/sign archetype + weekday planetary lord + day numerology.
const SIGN_WEIGHTS: Record<number, Record<string, number>> = {
  // 0=Jan (Capricorn-Aquarius cusp), simplified per month
  0: { authority: 0.9, wisdom: 0.7, focus: 0.6 },
  1: { wisdom: 0.9, healing: 0.6, chaos: 0.5 },
  2: { sea: 0.8, healing: 0.7, beauty: 0.5 },
  3: { war: 0.9, focus: 0.7, authority: 0.5 },
  4: { craft: 0.8, beauty: 0.7, wealth: 0.6 },
  5: { speed: 0.9, persuasion: 0.7, wisdom: 0.6 },
  6: { healing: 0.8, love: 0.7, sea: 0.6 },
  7: { authority: 0.9, war: 0.7, sky: 0.7 },
  8: { craft: 0.8, focus: 0.7, justice: 0.6 },
  9: { justice: 0.9, beauty: 0.7, persuasion: 0.6 },
  10: { chaos: 0.9, authority: 0.6, wealth: 0.7 },
  11: { sky: 0.8, wisdom: 0.7, justice: 0.6 },
};

const WEEKDAY_LORD: Record<number, Record<string, number>> = {
  0: { sky: 0.6, authority: 0.6 },          // Sun
  1: { healing: 0.5, beauty: 0.5, sea: 0.4 }, // Moon
  2: { war: 0.7, focus: 0.5 },              // Mars
  3: { speed: 0.7, persuasion: 0.6 },       // Mercury
  4: { wisdom: 0.7, justice: 0.6 },         // Jupiter
  5: { love: 0.7, beauty: 0.6 },            // Venus
  6: { authority: 0.5, wealth: 0.6, focus: 0.4 }, // Saturn
};

export function deriveProfile(date: Date): Record<string, number> {
  const m = date.getMonth();
  const w = date.getDay();
  const day = date.getDate();
  const profile: Record<string, number> = {};
  const merge = (src: Record<string, number>, k = 1) => {
    for (const [key, val] of Object.entries(src)) {
      profile[key] = (profile[key] ?? 0) + val * k;
    }
  };
  merge(SIGN_WEIGHTS[m] ?? {});
  merge(WEEKDAY_LORD[w] ?? {}, 0.8);
  const root = ((day - 1) % 9) + 1;
  if (root <= 3) merge({ war: 0.3, authority: 0.3 });
  else if (root <= 6) merge({ love: 0.3, persuasion: 0.3 });
  else merge({ wisdom: 0.3, chaos: 0.2 });
  const max = Math.max(...Object.values(profile), 1);
  for (const k of Object.keys(profile)) profile[k] /= max;
  return profile;
}

// ─────────────────────────────────────────────────────────────────────────────
// Placement-based profile (real chart: planets, signs, houses)
// ─────────────────────────────────────────────────────────────────────────────

const RASHI_WEIGHTS: Record<number, Record<string, number>> = {
  0:  { war: 1, focus: 0.7, authority: 0.5 },
  1:  { wealth: 0.9, beauty: 0.7, love: 0.6, craft: 0.5 },
  2:  { speed: 1, persuasion: 0.8, wisdom: 0.5 },
  3:  { healing: 0.9, sea: 0.7, love: 0.6, focus: 0.4 },
  4:  { authority: 1, sky: 0.8, war: 0.5, beauty: 0.5 },
  5:  { craft: 1, wisdom: 0.7, healing: 0.5, focus: 0.6 },
  6:  { justice: 1, beauty: 0.8, persuasion: 0.7, love: 0.6 },
  7:  { chaos: 1, wealth: 0.7, war: 0.6, sea: 0.5 },
  8:  { wisdom: 1, sky: 0.7, justice: 0.6, persuasion: 0.5 },
  9:  { authority: 1, wealth: 0.7, focus: 0.7, craft: 0.5 },
  10: { wisdom: 0.8, chaos: 0.7, justice: 0.6, sky: 0.6 },
  11: { sea: 1, healing: 0.8, chaos: 0.6, beauty: 0.5 },
};

const PLANET_NATURE: Record<string, Record<string, number>> = {
  Sun:     { authority: 1, sky: 0.8, focus: 0.6 },
  Moon:    { healing: 0.9, sea: 0.6, beauty: 0.6, love: 0.5 },
  Mars:    { war: 1, focus: 0.7, chaos: 0.4 },
  Mercury: { speed: 1, persuasion: 0.9, wisdom: 0.5, craft: 0.5 },
  Jupiter: { wisdom: 1, justice: 0.8, wealth: 0.6, sky: 0.5 },
  Venus:   { love: 1, beauty: 1, persuasion: 0.7, wealth: 0.5 },
  Saturn:  { authority: 0.8, focus: 0.9, justice: 0.6, wealth: 0.5 },
  Rahu:    { chaos: 1, wealth: 0.6, persuasion: 0.6 },
  Ketu:    { wisdom: 0.8, chaos: 0.6, focus: 0.7, healing: 0.5 },
};

const HOUSE_WEIGHTS: Record<number, Record<string, number>> = {
  1:  { authority: 0.8, focus: 0.7, beauty: 0.4 },
  2:  { wealth: 1, persuasion: 0.5, beauty: 0.4 },
  3:  { war: 0.7, speed: 0.7, craft: 0.5, persuasion: 0.5 },
  4:  { healing: 0.7, love: 0.6, sea: 0.5, authority: 0.4 },
  5:  { wisdom: 0.7, beauty: 0.6, love: 0.6, craft: 0.5 },
  6:  { war: 0.8, healing: 0.6, focus: 0.7, justice: 0.5 },
  7:  { love: 0.9, persuasion: 0.7, justice: 0.6 },
  8:  { chaos: 1, wealth: 0.6, sea: 0.5, healing: 0.4 },
  9:  { wisdom: 1, justice: 0.8, sky: 0.6, authority: 0.5 },
  10: { authority: 1, war: 0.6, justice: 0.5, wealth: 0.6 },
  11: { wealth: 1, persuasion: 0.6, speed: 0.5 },
  12: { sea: 0.8, healing: 0.6, chaos: 0.6, wisdom: 0.5 },
};

export type ChartPlacement = {
  name: string;
  sid: number;
  house: number;
  retrograde?: boolean;
};

const PLANET_WEIGHT_BY_NAME: Record<string, number> = {
  Sun: 1.4, Moon: 1.4, Mars: 1.0, Mercury: 1.0, Jupiter: 1.2,
  Venus: 1.0, Saturn: 1.1, Rahu: 0.7, Ketu: 0.7,
};

export function deriveProfileFromChart(
  ascendantSidDeg: number,
  placements: ChartPlacement[],
): Record<string, number> {
  const profile: Record<string, number> = {};
  const merge = (src: Record<string, number>, k = 1) => {
    for (const [key, val] of Object.entries(src)) {
      profile[key] = (profile[key] ?? 0) + val * k;
    }
  };

  const ascSignIdx = Math.floor(((ascendantSidDeg % 360) + 360) % 360 / 30);
  merge(RASHI_WEIGHTS[ascSignIdx] ?? {}, 1.6);

  for (const p of placements) {
    const w = PLANET_WEIGHT_BY_NAME[p.name] ?? 0.8;
    const signIdx = Math.floor(((p.sid % 360) + 360) % 360 / 30);
    merge(PLANET_NATURE[p.name] ?? {}, w);
    merge(RASHI_WEIGHTS[signIdx] ?? {}, w * 0.7);
    merge(HOUSE_WEIGHTS[p.house] ?? {}, w * 0.9);
    if (p.retrograde) merge({ chaos: 0.3, wisdom: 0.2 }, w * 0.4);
  }

  const max = Math.max(...Object.values(profile), 1);
  for (const k of Object.keys(profile)) profile[k] /= max;
  return profile;
}

function similarity(a: Record<string, number>, b: Record<string, number>): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    const x = a[k] ?? 0, y = b[k] ?? 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type Match = Archetype & { percent: number };

export function matchMythology(input: Date | Record<string, number>): Match[] {
  const profile = input instanceof Date ? deriveProfile(input) : input;
  const scored = MYTHOLOGY.map((a) => ({
    ...a,
    percent: Math.round(similarity(profile, a.weights) * 100),
  }));
  return scored.sort((a, b) => b.percent - a.percent);
}

export function matchMythologyFromChart(
  ascendantSidDeg: number,
  placements: ChartPlacement[],
): Match[] {
  return matchMythology(deriveProfileFromChart(ascendantSidDeg, placements));
}

const MATERIAL_KEYS = ["wealth", "authority", "war", "craft", "persuasion", "speed", "sea", "sky"];
const SPIRITUAL_KEYS = ["wisdom", "healing", "justice", "focus", "beauty", "love", "chaos"];

export type PowerSplit = {
  material: number;
  spiritual: number;
  materialBlurb: string;
  spiritualBlurb: string;
};

function bandBlurb(score: number, axis: "material" | "spiritual"): string {
  if (axis === "material") {
    if (score >= 80) return "Empire-grade leverage. Builds, owns, and routes capital like infrastructure.";
    if (score >= 60) return "Operator-class. Converts attention and time into compounding assets.";
    if (score >= 40) return "Balanced earner. Worldly traction without losing the inner thread.";
    if (score >= 20) return "Light material draw. Money serves the mission, not the other way around.";
    return "Detached from worldly metrics. Currency is meaning, not coin.";
  }
  if (score >= 80) return "Mystic-tier signal. Reads unseen architecture; others feel the field shift around you.";
  if (score >= 60) return "Initiated current. Wisdom and inner stillness are the real assets you carry.";
  if (score >= 40) return "Reflective practitioner. Material and sacred operate in steady dialogue.";
  if (score >= 20) return "Latent spiritual line. Awakens under pressure, ritual, or grief.";
  return "Worldly-first signature. Sacred shows up through craft, not contemplation.";
}

function powersFromProfile(profile: Record<string, number>): PowerSplit {
  const sumKeys = (keys: string[]) => keys.reduce((acc, k) => acc + (profile[k] ?? 0), 0);
  const mat = sumKeys(MATERIAL_KEYS);
  const spi = sumKeys(SPIRITUAL_KEYS);
  const total = mat + spi || 1;
  const material = Math.round((mat / total) * 100);
  const spiritual = 100 - material;
  return {
    material, spiritual,
    materialBlurb: bandBlurb(material, "material"),
    spiritualBlurb: bandBlurb(spiritual, "spiritual"),
  };
}

export function computePowers(date: Date): PowerSplit {
  return powersFromProfile(deriveProfile(date));
}

export function computePowersFromChart(
  ascendantSidDeg: number,
  placements: ChartPlacement[],
): PowerSplit {
  return powersFromProfile(deriveProfileFromChart(ascendantSidDeg, placements));
}
