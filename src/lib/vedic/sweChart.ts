import type SwissEPH from "sweph-wasm";

export interface SweVedicPlanet {
  id: number;
  name: string;
  symbol: string;
  sid: number;
  speed: number;
  retrograde: boolean;
}

export interface SweVedicChart {
  planets: SweVedicPlanet[];
  ascendant: number;
  houses: number[];
  ayanamsa: number;
  jd: number;
  birthUtc: Date;
  dashaBirthUtc: Date;
  dashaMoonSid: number;
}

interface ChartInput {
  birthDate: string;
  birthTime: string;
  tzOffset: number;
  lat: number;
  lon: number;
}

const PLANET_DEFS = [
  { id: 0, name: "Sun", symbol: "☉" },
  { id: 1, name: "Moon", symbol: "☽" },
  { id: 2, name: "Mercury", symbol: "☿" },
  { id: 3, name: "Venus", symbol: "♀" },
  { id: 4, name: "Mars", symbol: "♂" },
  { id: 5, name: "Jupiter", symbol: "♃" },
  { id: 6, name: "Saturn", symbol: "♄" },
  { id: 11, name: "Rahu", symbol: "☊" },
];

let swePromise: Promise<SwissEPH> | null = null;

const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

async function getSwissEph() {
  if (!swePromise) {
    swePromise = import("sweph-wasm").then(async (mod) => {
      const SwissEPH = mod.default;
      const wasmUrl = typeof window !== "undefined" ? `${window.location.origin}/wasm/swisseph.wasm` : "/wasm/swisseph.wasm";
      const swe = await SwissEPH.init(wasmUrl);
      swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);
      return swe;
    }).catch((e) => {
      // Clear cached rejected promise so the next chart calculation can retry
      // instead of permanently failing for the rest of the session.
      swePromise = null;
      throw e;
    });
  }
  return swePromise;
}

export async function calculateSweVedicChart(input: ChartInput): Promise<SweVedicChart> {
  const swe = await getSwissEph();
  const [year, month, day] = input.birthDate.split("-").map(Number);
  const [hour, minute] = input.birthTime.split(":").map(Number);
  const localDecimalHours = hour + minute / 60;
  const utHours = localDecimalHours - input.tzOffset;
  const birthUtc = new Date(Date.UTC(year, month - 1, day, hour, minute) - input.tzOffset * 3_600_000);
  // Use full fractional tz offset — Math.trunc() previously dropped the
  // 30/45-minute component for IST (+5.5), NPT (+5.75), IRST (+3.5), etc.,
  // throwing every Dasha calculation off by up to 45 minutes for life.
  const dashaUtHours = localDecimalHours - input.tzOffset;
  const dashaBirthUtc = new Date(Date.UTC(year, month - 1, day, hour, minute) - input.tzOffset * 3_600_000);

  const jd = swe.swe_julday(year, month, day, utHours, swe.SE_GREG_CAL);
  const dashaJd = swe.swe_julday(year, month, day, dashaUtHours, swe.SE_GREG_CAL);
  swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);
  swe.swe_set_topo(input.lon, input.lat, 0);

  const siderealFlag = swe.SEFLG_SIDEREAL | swe.SEFLG_SPEED | swe.SEFLG_TOPOCTR;
  const dashaMoonSid = norm360(swe.swe_calc_ut(dashaJd, 1, siderealFlag)[0]);
  const planets: SweVedicPlanet[] = PLANET_DEFS.map((def) => {
    const pos = swe.swe_calc_ut(jd, def.id, siderealFlag);
    const speed = pos[3] || 0;
    return {
      ...def,
      sid: norm360(pos[0]),
      speed,
      retrograde: speed < 0,
    };
  });

  const rahu = planets.find((planet) => planet.name === "Rahu");
  if (rahu) {
    planets.push({
      id: -1,
      name: "Ketu",
      symbol: "☋",
      sid: norm360(rahu.sid + 180),
      speed: rahu.speed,
      retrograde: true,
    });
  }

  const housesResult = swe.swe_houses(jd, input.lat, input.lon, "W");
  const ayanamsa = swe.swe_get_ayanamsa_ut(jd);
  const ascendant = norm360(housesResult.ascmc[0] - ayanamsa);
  const ascSign = Math.floor(ascendant / 30);
  const houses = Array.from({ length: 12 }, (_, index) => ((ascSign + index) % 12) * 30);

  return { planets, ascendant, houses, ayanamsa, jd, birthUtc, dashaBirthUtc, dashaMoonSid };
}

/**
 * Lightweight Moon-only sidereal longitude probe. Avoids the cost of a full
 * chart compute when all we need is the Moon's position at instant `at`.
 * Returns Lahiri-corrected sidereal degrees in [0, 360).
 */
export async function siderealMoonAt(at: Date, lat: number, lon: number): Promise<number> {
  const swe = await getSwissEph();
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth() + 1;
  const d = at.getUTCDate();
  const utHours = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600;
  const jd = swe.swe_julday(y, m, d, utHours, swe.SE_GREG_CAL);
  swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);
  swe.swe_set_topo(lon, lat, 0);
  const flag = swe.SEFLG_SIDEREAL | swe.SEFLG_TOPOCTR;
  const pos = swe.swe_calc_ut(jd, 1, flag);
  return norm360(pos[0]);
}