/**
 * TRANSITS ENGINE — current planetary positions vs natal chart.
 * Uses the same Swiss Ephemeris pipeline (sidereal Lahiri) as the natal chart.
 *
 * "Transit" = where a planet is RIGHT NOW (or at any chosen moment), evaluated
 * against your natal Ascendant to determine which natal house it is activating.
 *
 * Future ingresses are computed by stepping forward in time per-planet and
 * bisecting the boundary when the sidereal sign index changes.
 */
import { calculateSweVedicChart, type SweVedicPlanet } from "./sweChart";
import { houseFromAsc } from "./dignities";
import { rashis } from "@/data/nakshatraData";

export interface TransitPlanet {
  name: string;
  symbol: string;
  sid: number;            // current sidereal longitude (deg)
  retrograde: boolean;
  signIndex: number;      // 0..11
  signName: string;
  signSanskrit: string;
  degInSign: number;      // 0..29.999
  natalHouse: number;     // 1..12 — which natal house this planet is currently transiting
}

export interface TransitChart {
  at: Date;
  planets: TransitPlanet[];
}

/** Compute a transit chart for an arbitrary moment, evaluated against the natal Ascendant. */
export async function computeTransitChart(
  at: Date,
  natalAscendant: number,
  observerLat: number,
  observerLon: number,
): Promise<TransitChart> {
  // We re-use the natal birthplace as the observer (geocentric planets barely
  // change with lat/lon, but topocentric ascendant doesn't matter for transits).
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth() + 1;
  const d = at.getUTCDate();
  const hh = at.getUTCHours();
  const mm = at.getUTCMinutes();
  const birthDate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const birthTime = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const chart = await calculateSweVedicChart({
    birthDate, birthTime, tzOffset: 0, lat: observerLat, lon: observerLon,
  });
  const planets: TransitPlanet[] = chart.planets.map((p: SweVedicPlanet) => {
    const signIndex = Math.floor(p.sid / 30);
    return {
      name: p.name,
      symbol: p.symbol,
      sid: p.sid,
      retrograde: p.retrograde,
      signIndex,
      signName: rashis[signIndex].name,
      signSanskrit: rashis[signIndex].sanskrit,
      degInSign: p.sid % 30,
      natalHouse: houseFromAsc(p.sid, natalAscendant),
    };
  });
  return { at, planets };
}

// ── Future sign ingresses ────────────────────────────────────────────────────
// Step sizes (days) tuned per planet's mean speed. Conservative — we'll bisect.
const STEP_DAYS: Record<string, number> = {
  Moon: 0.5,
  Sun: 4,
  Mercury: 4,
  Venus: 4,
  Mars: 7,
  Jupiter: 20,
  Saturn: 30,
  Rahu: 20,
  Ketu: 20,
};

export interface SignIngress {
  planet: string;
  symbol: string;
  fromSign: string;
  toSign: string;
  toSignIndex: number;
  toSignSanskrit: string;
  natalHouse: number;     // house entered (against natal asc)
  date: Date;
  retrograde: boolean;    // direction at the ingress
}

async function planetSidAt(date: Date, planetName: string, lat: number, lon: number): Promise<{ sid: number; retro: boolean }> {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const hh = date.getUTCHours();
  const mm = date.getUTCMinutes();
  const c = await calculateSweVedicChart({
    birthDate: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    birthTime: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
    tzOffset: 0, lat, lon,
  });
  const p = c.planets.find((x) => x.name === planetName)!;
  return { sid: p.sid, retro: p.retrograde };
}

/**
 * Find the next N sign ingresses for each planet within `horizonDays`.
 * Bisects to ~1-hour precision once a sign boundary is detected between two samples.
 */
export async function computeFutureIngresses(
  natalAscendant: number,
  lat: number,
  lon: number,
  opts: { planets?: string[]; horizonDays?: number; perPlanetLimit?: number; from?: Date } = {},
): Promise<SignIngress[]> {
  const planets = opts.planets ?? ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Rahu", "Ketu"];
  const horizonDays = opts.horizonDays ?? 365 * 3;
  const perPlanetLimit = opts.perPlanetLimit ?? 6;
  const from = opts.from ?? new Date();
  const out: SignIngress[] = [];

  for (const planet of planets) {
    const stepMs = (STEP_DAYS[planet] ?? 10) * 86400_000;
    let prevDate = new Date(from);
    let prev = await planetSidAt(prevDate, planet, lat, lon);
    let found = 0;
    let cursorMs = prevDate.getTime();
    const endMs = from.getTime() + horizonDays * 86400_000;
    while (cursorMs < endMs && found < perPlanetLimit) {
      cursorMs += stepMs;
      const nextDate = new Date(cursorMs);
      const next = await planetSidAt(nextDate, planet, lat, lon);
      const prevSign = Math.floor(prev.sid / 30);
      const nextSign = Math.floor(next.sid / 30);
      if (prevSign !== nextSign) {
        // Bisect to ~1 hour
        let loMs = prevDate.getTime();
        let loSign = prevSign;
        let hiMs = nextDate.getTime();
        for (let i = 0; i < 18; i++) {
          const midMs = (loMs + hiMs) / 2;
          const mid = await planetSidAt(new Date(midMs), planet, lat, lon);
          const midSign = Math.floor(mid.sid / 30);
          if (midSign === loSign) loMs = midMs;
          else hiMs = midMs;
          if (hiMs - loMs < 3600_000) break;
        }
        const ingressDate = new Date(hiMs);
        const ing = await planetSidAt(ingressDate, planet, lat, lon);
        const toIdx = Math.floor(ing.sid / 30);
        out.push({
          planet,
          symbol: planetSymbol(planet),
          fromSign: rashis[loSign].name,
          toSign: rashis[toIdx].name,
          toSignIndex: toIdx,
          toSignSanskrit: rashis[toIdx].sanskrit,
          natalHouse: houseFromAsc(ing.sid, natalAscendant),
          date: ingressDate,
          retrograde: ing.retro,
        });
        found++;
        prev = ing;
        prevDate = ingressDate;
        cursorMs = ingressDate.getTime();
      } else {
        prev = next;
        prevDate = nextDate;
      }
    }
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

function planetSymbol(name: string): string {
  return { Sun: "☉", Moon: "☽", Mercury: "☿", Venus: "♀", Mars: "♂", Jupiter: "♃", Saturn: "♄", Rahu: "☊", Ketu: "☋" }[name] ?? "·";
}
