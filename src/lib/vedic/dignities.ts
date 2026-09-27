/**
 * Planetary dignities & status calculations.
 * Sign indices: 0=Aries, 1=Taurus, 2=Gemini, 3=Cancer, 4=Leo, 5=Virgo,
 *               6=Libra, 7=Scorpio, 8=Sagittarius, 9=Capricorn, 10=Aquarius, 11=Pisces.
 */

export type PlanetName =
  | "Sun" | "Moon" | "Mercury" | "Venus" | "Mars"
  | "Jupiter" | "Saturn" | "Rahu" | "Ketu";

const RULERSHIP: Record<PlanetName, number[]> = {
  Sun: [4],            // Leo
  Moon: [3],           // Cancer
  Mercury: [2, 5],     // Gemini, Virgo
  Venus: [1, 6],       // Taurus, Libra
  Mars: [0, 7],        // Aries, Scorpio
  Jupiter: [8, 11],    // Sagittarius, Pisces
  Saturn: [9, 10],     // Capricorn, Aquarius
  Rahu: [],
  Ketu: [],
};

// Exaltation sign per planet (classical Parashara).
const EXALTATION: Record<PlanetName, number | null> = {
  Sun: 0,        // Aries
  Moon: 1,       // Taurus
  Mercury: 5,    // Virgo
  Venus: 11,     // Pisces
  Mars: 9,       // Capricorn
  Jupiter: 3,    // Cancer
  Saturn: 6,     // Libra
  Rahu: 1,       // Taurus (varies by tradition)
  Ketu: 7,       // Scorpio
};

const DEBILITATION: Record<PlanetName, number | null> = {
  Sun: 6,        // Libra
  Moon: 7,       // Scorpio
  Mercury: 11,   // Pisces
  Venus: 5,      // Virgo
  Mars: 3,       // Cancer
  Jupiter: 9,    // Capricorn
  Saturn: 0,     // Aries
  Rahu: 7,
  Ketu: 1,
};

export interface DignityStatus {
  exalted: boolean;
  debilitated: boolean;
  ownSign: boolean;
  combust: boolean;
  retrograde: boolean;
  label: string;
}

/**
 * Compute a planet's dignity status given its sidereal longitude (deg),
 * the Sun's sidereal longitude, and its retrograde flag.
 */
export function computeDignity(
  planet: PlanetName,
  siderealDeg: number,
  sunSiderealDeg: number,
  retrograde: boolean,
): DignityStatus {
  const sign = Math.floor(siderealDeg / 30);
  const ownSign = RULERSHIP[planet]?.includes(sign) ?? false;
  const exalted = EXALTATION[planet] === sign;
  const debilitated = DEBILITATION[planet] === sign;

  // Combustion thresholds (Parashara, simplified):
  const combustOrb: Partial<Record<PlanetName, number>> = {
    Moon: 12, Mercury: 14, Venus: 10, Mars: 17, Jupiter: 11, Saturn: 15,
  };
  const orb = combustOrb[planet];
  let combust = false;
  if (orb !== undefined) {
    const diff = Math.abs(((siderealDeg - sunSiderealDeg + 540) % 360) - 180);
    combust = 180 - diff < orb;
  }

  const tags: string[] = [];
  if (exalted) tags.push("Exalted");
  if (debilitated) tags.push("Debilitated");
  if (ownSign) tags.push("Own Sign");
  if (combust) tags.push("Combust");
  if (retrograde) tags.push("Retrograde");

  return {
    exalted,
    debilitated,
    ownSign,
    combust,
    retrograde,
    label: tags.length ? tags.join(" · ") : "Direct",
  };
}

/** Compute house number (1..12) of a placement relative to ascendant (whole-sign houses). */
export function houseFromAsc(siderealDeg: number, ascSiderealDeg: number): number {
  const ascSign = Math.floor(ascSiderealDeg / 30);
  const planetSign = Math.floor(siderealDeg / 30);
  return ((planetSign - ascSign + 12) % 12) + 1;
}

/* ──────────────────────────────────────────────────────────────────────
 * DIGNITY MULTIPLIER — used by transit-scoring (wealthSoulmateWindows.ts).
 *
 * Returns a multiplier applied to a planet's base activator weight given
 * the SIGN it is currently in and its motion state.
 *
 * Tiers (Parashara, simplified):
 *   Exalted              → 1.5
 *   Own sign / rulership → 1.25
 *   Debilitated          → 0.5
 *   Otherwise (neutral / friendly / no data) → 1.0
 *
 * Retrograde adjustment: natural benefics (Jupiter, Venus, Mercury) get
 * an additional × 1.15 when retrograde — retrograde benefics are classically
 * stronger / more sustained in transit. Malefics are NOT amplified by
 * retrograde here (their friction is captured by their negative base weight).
 *
 * NOTE: This is now the single source of retrograde scaling. `applyRetro()`
 * in wealthSoulmateWindows.ts has been turned into a no-op to avoid the
 * previous 0.6× double-count.
 * ────────────────────────────────────────────────────────────────────── */
export function getDignityMultiplier(
  planet: string,
  signIndex: number,
  retrograde: boolean,
): number {
  const p = planet as PlanetName;
  const rulers = RULERSHIP[p];
  const exalt = EXALTATION[p];
  const debil = DEBILITATION[p];

  let mult = 1.0;
  if (exalt !== null && exalt === signIndex)        mult = 1.5;
  else if (debil !== null && debil === signIndex)   mult = 0.5;
  else if (rulers && rulers.includes(signIndex))    mult = 1.25;

  if (retrograde && (p === "Jupiter" || p === "Venus" || p === "Mercury")) {
    mult *= 1.15;
  }
  return mult;
}

/** Human-readable dignity tag for a (planet, sign, retro) triple. */
export function dignityLabel(
  planet: string,
  signIndex: number,
  retrograde: boolean,
): string | null {
  const p = planet as PlanetName;
  const tags: string[] = [];
  if (EXALTATION[p] === signIndex) tags.push("exalted — amplified");
  else if (DEBILITATION[p] === signIndex) tags.push("debilitated — weakened");
  else if (RULERSHIP[p]?.includes(signIndex)) tags.push("own sign — strong");
  if (retrograde && (p === "Jupiter" || p === "Venus" || p === "Mercury")) {
    tags.push("retrograde benefic — sustained");
  }
  return tags.length ? tags.join(", ") : null;
}

