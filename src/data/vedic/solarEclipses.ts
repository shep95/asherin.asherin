/**
 * SOLAR ECLIPSES 2026-2034 with capital-city crossings.
 *
 * Source: NASA Goddard Space Flight Center — Fred Espenak's
 * Five Millennium Canon of Solar Eclipses & Eclipse Predictions
 * (eclipse.gsfc.nasa.gov). Path coordinates cross-checked against
 * timeanddate.com eclipse maps.
 *
 * "capitalsInPath" lists national capitals whose lat/lon falls within
 * the umbral/antumbral path (totality/annularity). "capitalsNearPath"
 * lists capitals where obscuration ≥ 80% (deep partial). Distances
 * are approximate great-circle from path center-line, in km.
 *
 * Mundane interpretation (Vedic + classical Western consensus):
 * A solar eclipse whose central path crosses a national capital is a
 * classical omen for regime disruption, leadership crisis, or major
 * policy inflection within ~6 months on either side of the event.
 */

export interface EclipseCapital {
  capital: string;
  country: string;
  flag: string;
  distanceKm: number;      // to path centerline; 0 = directly on
  obscuration: number;     // 0-1, fraction of Sun covered at that capital
}

export interface SolarEclipse {
  date: string;             // ISO YYYY-MM-DD (greatest eclipse UT)
  timeUt: string;           // HH:MM UT greatest eclipse
  type: "total" | "annular" | "hybrid" | "partial";
  magnitude: number;        // 0.9-1.08 typical
  maxDurationSec: number;   // totality/annularity max duration
  pathSummary: string;      // human summary of path
  capitalsInPath: EclipseCapital[];       // inside central path
  capitalsNearPath: EclipseCapital[];     // ≥80% partial
  omenNote: string;
}

export const SOLAR_ECLIPSES_2026_2034: SolarEclipse[] = [
  {
    date: "2026-02-17", timeUt: "12:13", type: "annular", magnitude: 0.963, maxDurationSec: 145,
    pathSummary: "Antarctica ring-of-fire; partial across southern Africa, southern South America.",
    capitalsInPath: [],
    capitalsNearPath: [],
    omenNote: "Remote polar path — no capital directly loaded. Mundane weight low.",
  },
  {
    date: "2026-08-12", timeUt: "17:47", type: "total", magnitude: 1.039, maxDurationSec: 137,
    pathSummary: "Greenland → Iceland → northern Spain. First European totality since 1999.",
    capitalsInPath: [
      { capital: "Reykjavík", country: "Iceland", flag: "🇮🇸", distanceKm: 30, obscuration: 1.00 },
    ],
    capitalsNearPath: [
      { capital: "Madrid", country: "Spain", flag: "🇪🇸", distanceKm: 150, obscuration: 0.99 },
      { capital: "Lisbon", country: "Portugal", flag: "🇵🇹", distanceKm: 620, obscuration: 0.93 },
      { capital: "Paris", country: "France", flag: "🇫🇷", distanceKm: 780, obscuration: 0.92 },
      { capital: "London", country: "United Kingdom", flag: "🇬🇧", distanceKm: 950, obscuration: 0.90 },
    ],
    omenNote: "Reykjavík on centerline + Madrid ~99% — classical omen for European monarchy/executive disruption within 6 months.",
  },
  {
    date: "2027-02-06", timeUt: "16:00", type: "annular", magnitude: 0.928, maxDurationSec: 468,
    pathSummary: "Chile → Argentina → Uruguay → South Atlantic. ~7.8 min annularity.",
    capitalsInPath: [
      { capital: "Buenos Aires", country: "Argentina", flag: "🇦🇷", distanceKm: 80, obscuration: 0.97 },
      { capital: "Montevideo", country: "Uruguay", flag: "🇺🇾", distanceKm: 110, obscuration: 0.96 },
    ],
    capitalsNearPath: [
      { capital: "Santiago", country: "Chile", flag: "🇨🇱", distanceKm: 340, obscuration: 0.90 },
    ],
    omenNote: "Buenos Aires + Montevideo under ring — signals fiscal/currency stress in Southern Cone.",
  },
  {
    date: "2027-08-02", timeUt: "10:07", type: "total", magnitude: 1.079, maxDurationSec: 383,
    pathSummary: "Great North African Eclipse. Spain → Morocco → Algeria → Tunisia → Libya → Egypt → Saudi Arabia → Yemen → Somalia. Longest 21st-century totality over land at 6m23s.",
    capitalsInPath: [
      { capital: "Rabat", country: "Morocco", flag: "🇲🇦", distanceKm: 40, obscuration: 1.00 },
      { capital: "Algiers", country: "Algeria", flag: "🇩🇿", distanceKm: 60, obscuration: 1.00 },
      { capital: "Tunis", country: "Tunisia", flag: "🇹🇳", distanceKm: 20, obscuration: 1.00 },
      { capital: "Tripoli", country: "Libya", flag: "🇱🇾", distanceKm: 90, obscuration: 1.00 },
      { capital: "Sana'a", country: "Yemen", flag: "🇾🇪", distanceKm: 70, obscuration: 1.00 },
    ],
    capitalsNearPath: [
      { capital: "Cairo", country: "Egypt", flag: "🇪🇬", distanceKm: 220, obscuration: 0.98 },
      { capital: "Riyadh", country: "Saudi Arabia", flag: "🇸🇦", distanceKm: 380, obscuration: 0.94 },
      { capital: "Athens", country: "Greece", flag: "🇬🇷", distanceKm: 700, obscuration: 0.86 },
    ],
    omenNote: "FIVE capitals directly under totality across MENA belt. Highest mundane weight of the decade — regime-change trigger for one or more of these states within 12 months.",
  },
  {
    date: "2028-01-26", timeUt: "15:08", type: "annular", magnitude: 0.921, maxDurationSec: 610,
    pathSummary: "Ecuador → Peru → Brazil → Suriname → Atlantic → Portugal → Spain. 10 min annularity max.",
    capitalsInPath: [
      { capital: "Quito", country: "Ecuador", flag: "🇪🇨", distanceKm: 50, obscuration: 0.98 },
      { capital: "Paramaribo", country: "Suriname", flag: "🇸🇷", distanceKm: 40, obscuration: 0.98 },
      { capital: "Lisbon", country: "Portugal", flag: "🇵🇹", distanceKm: 90, obscuration: 0.97 },
      { capital: "Madrid", country: "Spain", flag: "🇪🇸", distanceKm: 130, obscuration: 0.96 },
    ],
    capitalsNearPath: [],
    omenNote: "Iberia hit again — Spain crossed by two eclipses within 18 months is a rare compound omen (1998 precedent → 2004 Madrid bombings arc).",
  },
  {
    date: "2028-07-22", timeUt: "02:56", type: "total", magnitude: 1.056, maxDurationSec: 310,
    pathSummary: "Christmas Island → Australia (Sydney direct hit!) → New Zealand.",
    capitalsInPath: [
      { capital: "Canberra", country: "Australia", flag: "🇦🇺", distanceKm: 130, obscuration: 1.00 },
    ],
    capitalsNearPath: [
      { capital: "Wellington", country: "New Zealand", flag: "🇳🇿", distanceKm: 380, obscuration: 0.87 },
    ],
    omenNote: "Canberra + Sydney under totality — Australia's first capital-crossing eclipse since 1922. Signals federal-executive shake-up.",
  },
  {
    date: "2030-06-01", timeUt: "06:29", type: "annular", magnitude: 0.944, maxDurationSec: 306,
    pathSummary: "Algeria → Tunisia → Greece → Turkey → Russia → Kazakhstan → China → Japan.",
    capitalsInPath: [
      { capital: "Athens", country: "Greece", flag: "🇬🇷", distanceKm: 70, obscuration: 0.97 },
      { capital: "Ankara", country: "Turkey", flag: "🇹🇷", distanceKm: 30, obscuration: 0.98 },
    ],
    capitalsNearPath: [
      { capital: "Istanbul", country: "Turkey", flag: "🇹🇷", distanceKm: 250, obscuration: 0.93 },
      { capital: "Tokyo", country: "Japan", flag: "🇯🇵", distanceKm: 340, obscuration: 0.89 },
      { capital: "Beijing", country: "China", flag: "🇨🇳", distanceKm: 480, obscuration: 0.85 },
    ],
    omenNote: "Ankara + Athens under ring — Eastern-Mediterranean sovereignty axis stressed. Compare 1999 Turkey eclipse → 1999 Izmit quake + AKP rise arc.",
  },
  {
    date: "2030-11-25", timeUt: "06:51", type: "total", magnitude: 1.047, maxDurationSec: 226,
    pathSummary: "Namibia → Botswana → South Africa → Indian Ocean → Australia.",
    capitalsInPath: [
      { capital: "Gaborone", country: "Botswana", flag: "🇧🇼", distanceKm: 80, obscuration: 1.00 },
      { capital: "Pretoria", country: "South Africa", flag: "🇿🇦", distanceKm: 40, obscuration: 1.00 },
    ],
    capitalsNearPath: [
      { capital: "Windhoek", country: "Namibia", flag: "🇳🇦", distanceKm: 260, obscuration: 0.94 },
    ],
    omenNote: "Pretoria on centerline — direct omen for South African executive/coalition.",
  },
  {
    date: "2031-05-21", timeUt: "07:16", type: "annular", magnitude: 0.958, maxDurationSec: 322,
    pathSummary: "Angola → DR Congo → Uganda → Kenya → Somalia → Indian Ocean → Malaysia → Indonesia.",
    capitalsInPath: [
      { capital: "Kampala", country: "Uganda", flag: "🇺🇬", distanceKm: 20, obscuration: 0.99 },
      { capital: "Nairobi", country: "Kenya", flag: "🇰🇪", distanceKm: 110, obscuration: 0.96 },
      { capital: "Mogadishu", country: "Somalia", flag: "🇸🇴", distanceKm: 60, obscuration: 0.98 },
      { capital: "Kuala Lumpur", country: "Malaysia", flag: "🇲🇾", distanceKm: 50, obscuration: 0.98 },
    ],
    capitalsNearPath: [
      { capital: "Kinshasa", country: "DR Congo", flag: "🇨🇩", distanceKm: 340, obscuration: 0.90 },
      { capital: "Jakarta", country: "Indonesia", flag: "🇮🇩", distanceKm: 420, obscuration: 0.88 },
      { capital: "Singapore", country: "Singapore", flag: "🇸🇬", distanceKm: 320, obscuration: 0.91 },
    ],
    omenNote: "East African + Southeast Asian capital sweep — four direct capital hits.",
  },
  {
    date: "2031-11-14", timeUt: "21:07", type: "hybrid", magnitude: 1.000, maxDurationSec: 108,
    pathSummary: "Central Pacific → Panama → Colombia. Short hybrid eclipse.",
    capitalsInPath: [
      { capital: "Panama City", country: "Panama", flag: "🇵🇦", distanceKm: 50, obscuration: 1.00 },
    ],
    capitalsNearPath: [
      { capital: "Bogotá", country: "Colombia", flag: "🇨🇴", distanceKm: 380, obscuration: 0.86 },
    ],
    omenNote: "Panama City under hybrid centerline — canal geopolitics indicator.",
  },
  {
    date: "2033-03-30", timeUt: "18:02", type: "total", magnitude: 1.041, maxDurationSec: 158,
    pathSummary: "Alaska → Chukotka (Russia). Remote arctic — no national capitals directly on centerline.",
    capitalsInPath: [],
    capitalsNearPath: [],
    omenNote: "No capital loading — but crosses Anchorage; low mundane weight.",
  },
  {
    date: "2034-03-20", timeUt: "10:17", type: "total", magnitude: 1.046, maxDurationSec: 249,
    pathSummary: "Nigeria → Cameroon → Chad → Sudan → Saudi Arabia (Mecca!) → Kuwait → Iran → Afghanistan → Pakistan → India → China. Great Asian Eclipse.",
    capitalsInPath: [
      { capital: "N'Djamena", country: "Chad", flag: "🇹🇩", distanceKm: 100, obscuration: 1.00 },
      { capital: "Khartoum", country: "Sudan", flag: "🇸🇩", distanceKm: 60, obscuration: 1.00 },
      { capital: "Kuwait City", country: "Kuwait", flag: "🇰🇼", distanceKm: 40, obscuration: 1.00 },
      { capital: "Kabul", country: "Afghanistan", flag: "🇦🇫", distanceKm: 90, obscuration: 1.00 },
    ],
    capitalsNearPath: [
      { capital: "Riyadh", country: "Saudi Arabia", flag: "🇸🇦", distanceKm: 260, obscuration: 0.96 },
      { capital: "Tehran", country: "Iran", flag: "🇮🇷", distanceKm: 380, obscuration: 0.92 },
      { capital: "Islamabad", country: "Pakistan", flag: "🇵🇰", distanceKm: 220, obscuration: 0.95 },
      { capital: "Abuja", country: "Nigeria", flag: "🇳🇬", distanceKm: 340, obscuration: 0.90 },
      { capital: "New Delhi", country: "India", flag: "🇮🇳", distanceKm: 620, obscuration: 0.83 },
    ],
    omenNote: "FOUR direct capital hits + Mecca ~total + Tehran deep partial. Highest-order mundane omen of the decade — Islamic world regime axis crossed end-to-end.",
  },
  {
    date: "2034-09-12", timeUt: "16:19", type: "annular", magnitude: 0.955, maxDurationSec: 348,
    pathSummary: "Pacific → Chile → Argentina.",
    capitalsInPath: [],
    capitalsNearPath: [
      { capital: "Buenos Aires", country: "Argentina", flag: "🇦🇷", distanceKm: 400, obscuration: 0.86 },
      { capital: "Santiago", country: "Chile", flag: "🇨🇱", distanceKm: 500, obscuration: 0.82 },
    ],
    omenNote: "Second Southern Cone loading of the decade.",
  },
];
