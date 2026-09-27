/**
 * Deterministic, non-AI deep reading for a single house in a chart.
 *
 * Pulls from KRS knowledge base (Bishop port):
 *   - HOUSE_MEANINGS         — house karakas + themes
 *   - PLANET_HOUSE_PREDICTIONS — every planet's specific behaviour in each house
 *   - ASPECT_RULES / ASPECT_MEANINGS — which houses each planet aspects out to
 *   - CONJUNCTION_MEANINGS   — pair-wise combinations resident in the house
 *   - SIGN_LORDS / SIGN_NAMES — sign of the house cusp + dispositor
 */

import {
  HOUSE_MEANINGS,
  PLANET_HOUSE_PREDICTIONS,
  ASPECT_RULES,
  ASPECT_MEANINGS,
  CONJUNCTION_MEANINGS,
  SIGN_LORDS,
  SIGN_NAMES,
  type PlanetHousePrediction,
  type ConjunctionMeaning,
} from "@/data/vedic/krsKnowledge";

export interface HouseReadingPlanet {
  name: string;
  retrograde: boolean;
}

export interface HouseReading {
  house: number;
  signIndex: number;
  signName: string;
  signLord: string;
  houseName: string;
  houseKaraka: string;
  houseThemes: string[];
  /** KRS reading for every planet sitting in this house. */
  residents: { planet: string; retrograde: boolean; reading: string; aspectHouse: number; aspectEffect: string }[];
  /** Pair-wise classical conjunction meanings between residents. */
  conjunctions: { pair: [string, string]; yogaName: string; effect: string }[];
  /** Aspects coming OUT of this house's planets to other houses. */
  outgoingAspects: { planet: string; toHouse: number; meaning: string }[];
  /** Aspects coming INTO this house from other planets. */
  incomingAspects: { fromHouse: number; planet: string; meaning: string }[];
  /** Empty-house fallback summary when no resident planets. */
  emptyHouseNote?: string;
}

function findPrediction(planet: string, house: number): PlanetHousePrediction | undefined {
  return PLANET_HOUSE_PREDICTIONS[planet]?.find((p) => p.house === house);
}

function findConjunction(a: string, b: string): ConjunctionMeaning | undefined {
  return CONJUNCTION_MEANINGS.find(
    (c) => (c.planets[0] === a && c.planets[1] === b) || (c.planets[0] === b && c.planets[1] === a),
  );
}

/** wrap (1..12) house arithmetic */
function houseAdd(h: number, n: number): number {
  return ((h - 1 + n - 1) % 12) + 1;
}

/**
 * @param house   1..12 (whole-sign, counted from Lagna)
 * @param signIndex 0..11 (sidereal sign occupying the house)
 * @param residents planets sitting in this house
 * @param allHouses 12-entry map of house → planets occupying it (for incoming aspects)
 */
export function buildHouseReading(
  house: number,
  signIndex: number,
  residents: HouseReadingPlanet[],
  allHouses: { house: number; planets: HouseReadingPlanet[] }[],
): HouseReading {
  const houseMeta = HOUSE_MEANINGS[house];

  const residentReadings = residents
    .map((p) => {
      const pred = findPrediction(p.name, house);
      if (!pred) return null;
      return {
        planet: p.name,
        retrograde: p.retrograde,
        reading: pred.prediction,
        aspectHouse: pred.aspectHouse,
        aspectEffect: pred.aspectEffect,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Pairwise conjunctions inside this house.
  const conjunctions: HouseReading["conjunctions"] = [];
  for (let i = 0; i < residents.length; i++) {
    for (let j = i + 1; j < residents.length; j++) {
      const c = findConjunction(residents[i].name, residents[j].name);
      if (c) {
        conjunctions.push({
          pair: [residents[i].name, residents[j].name],
          yogaName: c.meaning,
          effect: c.effect,
        });
      }
    }
  }

  // Outgoing aspects: every resident planet aspects 1..N other houses.
  const outgoing: HouseReading["outgoingAspects"] = [];
  for (const p of residents) {
    const offsets = ASPECT_RULES[p.name] ?? [7];
    for (const off of offsets) {
      if (off === 1) continue; // own house, skip
      outgoing.push({
        planet: p.name,
        toHouse: houseAdd(house, off - 1),
        meaning: ASPECT_MEANINGS[p.name] ?? "",
      });
    }
  }

  // Incoming aspects: scan every other house's planets and see if they aspect HERE.
  const incoming: HouseReading["incomingAspects"] = [];
  for (const h of allHouses) {
    if (h.house === house) continue;
    for (const p of h.planets) {
      const offsets = ASPECT_RULES[p.name] ?? [7];
      for (const off of offsets) {
        if (houseAdd(h.house, off - 1) === house) {
          incoming.push({
            fromHouse: h.house,
            planet: p.name,
            meaning: ASPECT_MEANINGS[p.name] ?? "",
          });
        }
      }
    }
  }

  let emptyHouseNote: string | undefined;
  if (residents.length === 0) {
    const lord = SIGN_LORDS[signIndex] ?? "—";
    emptyHouseNote =
      `No planets reside in House ${house}. Read it through its sign lord (${lord}) — wherever ${lord} sits in the chart drives the affairs of ${houseMeta?.name ?? `House ${house}`} ` +
      `(${(houseMeta?.themes ?? []).slice(0, 3).join(", ")}). ` +
      (incoming.length > 0
        ? `It is also influenced by aspects from ${incoming.map((a) => `${a.planet} (H${a.fromHouse})`).join(", ")}.`
        : "No major aspects fall on it either, so it operates quietly through its lord alone.");
  }

  return {
    house,
    signIndex,
    signName: SIGN_NAMES[signIndex],
    signLord: SIGN_LORDS[signIndex] ?? "—",
    houseName: houseMeta?.name ?? `House ${house}`,
    houseKaraka: houseMeta?.karaka ?? "—",
    houseThemes: houseMeta?.themes ?? [],
    residents: residentReadings,
    conjunctions,
    outgoingAspects: outgoing,
    incomingAspects: incoming,
    emptyHouseNote,
  };
}
