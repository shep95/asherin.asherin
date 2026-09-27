// Codified from ZOPHIEL "Global Occult Prediction Protocols" — mundane astrology corpus.
// Used by the Vedic Global Predictions tab and the country compatibility / power-ranking views.

export interface PowerRankingRow {
  rank: number;
  country: string;
  flag: string;
  era: "Past" | "Present" | "Future";
  window: string;          // time window
  driver: string;          // dasha / yoga / transit driver
  note: string;
}

// Power ranking timeline (mundane Vedic + Sankranti Purusha + Shoola Dasha synthesis)
export const POWER_RANKINGS: PowerRankingRow[] = [
  // ── PAST ──
  { rank: 1, country: "United Kingdom", flag: "🇬🇧", era: "Past", window: "1815 – 1914",
    driver: "Sun–Jupiter mahadasha on Libra Asc; benefic Stambha",
    note: "Pax Britannica. Naval (Cancer/Pisces) supremacy via Moon-strong charts." },
  { rank: 2, country: "United States", flag: "🇺🇸", era: "Past", window: "1945 – 2008",
    driver: "Cancer Asc + 10H Mars; long Venus–Sun cycle",
    note: "Post-WWII unipolar moment. Dollar = Jupiter. Air/Space = Mercury–Saturn yoga." },
  { rank: 3, country: "Soviet Union", flag: "☭", era: "Past", window: "1945 – 1991",
    driver: "Saturn–Mars Vedha in Sanghatta during dissolution",
    note: "Eclipse on capital (Moscow) 1990 triggered Pancha Vedha collapse." },
  { rank: 4, country: "China (PRC)", flag: "🇨🇳", era: "Past", window: "1980 – 2020",
    driver: "Rahu mahadasha — manufacturing surge",
    note: "Earthy Triangle dominance (Taurus–Virgo–Capricorn) = industrial base." },

  // ── PRESENT ──
  { rank: 1, country: "United States", flag: "🇺🇸", era: "Present", window: "2024 – 2028",
    driver: "Saturn in Pisces afflicting 9H — soft empire decay",
    note: "Still #1 in air/space/finance. Jupiter return strengthens 2026 Q3." },
  { rank: 2, country: "China (PRC)", flag: "🇨🇳", era: "Present", window: "2024 – 2030",
    driver: "Ketu mahadasha — detachment from old growth model",
    note: "Strongest in Land + Sea (Scorpio Moon). Naval expansion peaks 2028." },
  { rank: 3, country: "India", flag: "🇮🇳", era: "Present", window: "2023 – 2031",
    driver: "Venus mahadasha on Taurus Asc — Argha Kand wealth phase",
    note: "Demographic + tech rise. Strongest suit: Air + cyber (Mercury exalted)." },
  { rank: 4, country: "Russia", flag: "🇷🇺", era: "Present", window: "2024 – 2028",
    driver: "Mars–Saturn Vedha in Sangatta — wartime contraction",
    note: "Strong Land/Resource (Earthy triangle) but Trishula on Rudra sign by 2028." },
  { rank: 5, country: "Saudi Arabia", flag: "🇸🇦", era: "Present", window: "2024 – 2030",
    driver: "Sun (Gold) + Mars (Oil) co-rulership of 2H/11H",
    note: "Argha Kand commodity king. Energy transition risks Saturn 2029." },

  // ── FUTURE ──
  { rank: 1, country: "India", flag: "🇮🇳", era: "Future", window: "2031 – 2049",
    driver: "Sun mahadasha begins ~2031 — Sankranti Purusha 'King of Year' repeatedly",
    note: "PROJECTED #1 GLOBAL POWER. Surya bindu favorable; benefic Stambha Kota." },
  { rank: 2, country: "China (PRC)", flag: "🇨🇳", era: "Future", window: "2030 – 2045",
    driver: "Venus mahadasha — soft-power & reserve currency play",
    note: "Naval + Space dominance peaks ~2038 (Jupiter return on Cancer 10H)." },
  { rank: 3, country: "United States", flag: "🇺🇸", era: "Future", window: "2031 – 2050",
    driver: "Moon mahadasha — fragmentation then renewal",
    note: "Drops to #3. Strongest in Space + Cyber. Capital risk from 2033 eclipse band." },
  { rank: 4, country: "Brazil", flag: "🇧🇷", era: "Future", window: "2035 – 2055",
    driver: "Jupiter mahadasha — agriculture + biofuel commodity supercycle",
    note: "Rohini rain rule favors harvest empire. Sea power (Atlantic) rises." },
  { rank: 5, country: "Indonesia", flag: "🇮🇩", era: "Future", window: "2038 – 2060",
    driver: "Mercury mahadasha on rising Cancer; Jala Nadi bull",
    note: "ASEAN heart. Strongest suit: Sea + rare earth (Scorpio 5H)." },
  { rank: 6, country: "Nigeria", flag: "🇳🇬", era: "Future", window: "2040 – 2065",
    driver: "Population yoga + Mars in own sign on Asc",
    note: "African pivot. Land + Energy dominance. Watch Saturn 2046 (Stambha test)." },
];

// ─────────────────────────────────────────────────────────────────────
// DEEP TIMELINE — ±500 YEAR POWER POSITION (animated zoomer dataset)
// Each entry = a "power snapshot" at year T with ranked global powers.
// Used by the TimelineZoomer to interpolate the chart from -500 → +500.
// ─────────────────────────────────────────────────────────────────────
export interface PowerSnapshot {
  year: number;                 // gregorian year (negative = BCE not used here, min 1525)
  hegemon: string;              // dominant power
  flag: string;
  share: number;                // % of global power (0–100)
  runners: { name: string; flag: string; share: number }[]; // top 4 challengers
  yoga: string;                 // dasha / vedic driver
  event: string;                // dominant historical / forecast event
  intensity: number;            // 0–100 (war/upheaval index)
}

export const DEEP_TIMELINE: PowerSnapshot[] = [
  // ── PAST 500 (1525 → 2025) ──
  { year: 1525, hegemon: "Ottoman Empire", flag: "☪", share: 28, intensity: 65, yoga: "Mars MD on Scorpio Asc",
    event: "Suleiman the Magnificent — peak Mediterranean control",
    runners: [{name:"Ming China",flag:"🇨🇳",share:24},{name:"Mughal India",flag:"🇮🇳",share:18},{name:"Spain",flag:"🇪🇸",share:14},{name:"Safavid Persia",flag:"🇮🇷",share:8}] },
  { year: 1600, hegemon: "Ming China", flag: "🇨🇳", share: 30, intensity: 35, yoga: "Jupiter MD — silver-trade Argha",
    event: "Wanli era — silver from Americas pours into Asia",
    runners: [{name:"Mughal India",flag:"🇮🇳",share:24},{name:"Spain",flag:"🇪🇸",share:18},{name:"Ottoman",flag:"☪",share:12},{name:"England",flag:"🇬🇧",share:5}] },
  { year: 1700, hegemon: "Mughal India", flag: "🇮🇳", share: 27, intensity: 50, yoga: "Aurangzeb — Saturn affliction begins",
    event: "India = ~25% of world GDP; Mughal apex before fragmentation",
    runners: [{name:"Qing China",flag:"🇨🇳",share:23},{name:"France",flag:"🇫🇷",share:14},{name:"England",flag:"🇬🇧",share:9},{name:"Ottoman",flag:"☪",share:8}] },
  { year: 1800, hegemon: "Qing China", flag: "🇨🇳", share: 33, intensity: 40, yoga: "Rahu MD — bureaucratic stasis",
    event: "Qing peak; Britain industrializing — power inversion incoming",
    runners: [{name:"British Empire",flag:"🇬🇧",share:18},{name:"France",flag:"🇫🇷",share:14},{name:"Russia",flag:"🇷🇺",share:9},{name:"USA",flag:"🇺🇸",share:5}] },
  { year: 1860, hegemon: "British Empire", flag: "🇬🇧", share: 30, intensity: 55, yoga: "Sun–Jupiter on Libra Asc",
    event: "Pax Britannica · Royal Navy unrivaled",
    runners: [{name:"Qing China",flag:"🇨🇳",share:18},{name:"France",flag:"🇫🇷",share:13},{name:"Russia",flag:"🇷🇺",share:11},{name:"USA",flag:"🇺🇸",share:9}] },
  { year: 1900, hegemon: "British Empire", flag: "🇬🇧", share: 26, intensity: 50, yoga: "Late Sun MD — Stambha softening",
    event: "Empire on which the sun never sets — but Saturn approaches",
    runners: [{name:"USA",flag:"🇺🇸",share:18},{name:"Germany",flag:"🇩🇪",share:14},{name:"France",flag:"🇫🇷",share:10},{name:"Russia",flag:"🇷🇺",share:9}] },
  { year: 1918, hegemon: "British Empire", flag: "🇬🇧", share: 22, intensity: 95, yoga: "Mars–Saturn Vedha global",
    event: "WW1 ends — UK wins but bleeds; USA rises",
    runners: [{name:"USA",flag:"🇺🇸",share:22},{name:"France",flag:"🇫🇷",share:12},{name:"Germany",flag:"🇩🇪",share:9},{name:"Japan",flag:"🇯🇵",share:7}] },
  { year: 1945, hegemon: "United States", flag: "🇺🇸", share: 35, intensity: 98, yoga: "Cancer Asc + 10H Mars activated",
    event: "WW2 ends — atomic monopoly · Bretton Woods",
    runners: [{name:"USSR",flag:"☭",share:20},{name:"UK",flag:"🇬🇧",share:11},{name:"China",flag:"🇨🇳",share:6},{name:"France",flag:"🇫🇷",share:5}] },
  { year: 1975, hegemon: "United States", flag: "🇺🇸", share: 28, intensity: 60, yoga: "Venus–Sun cycle continues",
    event: "Cold war bipolar · stagflation tests dollar",
    runners: [{name:"USSR",flag:"☭",share:22},{name:"Japan",flag:"🇯🇵",share:9},{name:"Germany",flag:"🇩🇪",share:7},{name:"China",flag:"🇨🇳",share:5}] },
  { year: 1991, hegemon: "United States", flag: "🇺🇸", share: 33, intensity: 50, yoga: "Pancha Vedha on USSR — unipolar moment",
    event: "USSR dissolves · Pax Americana peaks",
    runners: [{name:"Japan",flag:"🇯🇵",share:14},{name:"Germany",flag:"🇩🇪",share:9},{name:"China",flag:"🇨🇳",share:8},{name:"Russia",flag:"🇷🇺",share:6}] },
  { year: 2008, hegemon: "United States", flag: "🇺🇸", share: 26, intensity: 70, yoga: "Mars–Saturn samasaptaka — Argha bear",
    event: "Lehman crash · multipolar drift begins",
    runners: [{name:"China",flag:"🇨🇳",share:18},{name:"EU",flag:"🇪🇺",share:14},{name:"Japan",flag:"🇯🇵",share:7},{name:"India",flag:"🇮🇳",share:6}] },
  { year: 2025, hegemon: "United States", flag: "🇺🇸", share: 23, intensity: 75, yoga: "Saturn in Pisces — soft empire decay",
    event: "Multipolar present · US still #1 air/space/finance",
    runners: [{name:"China",flag:"🇨🇳",share:21},{name:"India",flag:"🇮🇳",share:11},{name:"Russia",flag:"🇷🇺",share:6},{name:"Saudi Arabia",flag:"🇸🇦",share:5}] },

  // ── FUTURE 500 (2030 → 2525) ──
  { year: 2030, hegemon: "United States", flag: "🇺🇸", share: 20, intensity: 85, yoga: "Saturn affliction US 2H — financial shock",
    event: "Trade fragmentation · proto-WW3 alignments harden",
    runners: [{name:"China",flag:"🇨🇳",share:22},{name:"India",flag:"🇮🇳",share:14},{name:"Russia",flag:"🇷🇺",share:6},{name:"Brazil",flag:"🇧🇷",share:5}] },
  { year: 2031, hegemon: "India", flag: "🇮🇳", share: 19, intensity: 82, yoga: "Sun MD begins — Sankranti Purusha 'King of Year'",
    event: "India crowned Surya hegemon · WW3 prelude peaks",
    runners: [{name:"USA",flag:"🇺🇸",share:19},{name:"China",flag:"🇨🇳",share:21},{name:"Russia",flag:"🇷🇺",share:6},{name:"Brazil",flag:"🇧🇷",share:5}] },
  { year: 2040, hegemon: "India", flag: "🇮🇳", share: 25, intensity: 70, yoga: "Sun MD mid-cycle · benefic Stambha",
    event: "Post-conflict reconstruction · Indo-Pacific axis led from Delhi",
    runners: [{name:"China",flag:"🇨🇳",share:20},{name:"USA",flag:"🇺🇸",share:16},{name:"Brazil",flag:"🇧🇷",share:7},{name:"Indonesia",flag:"🇮🇩",share:6}] },
  { year: 2050, hegemon: "India", flag: "🇮🇳", share: 28, intensity: 45, yoga: "Late Sun MD → Moon MD transition",
    event: "Vedic golden age · digital + agrarian surplus",
    runners: [{name:"China",flag:"🇨🇳",share:18},{name:"USA",flag:"🇺🇸",share:13},{name:"Brazil",flag:"🇧🇷",share:9},{name:"Nigeria",flag:"🇳🇬",share:7}] },
  { year: 2075, hegemon: "India", flag: "🇮🇳", share: 26, intensity: 50, yoga: "Mars MD — assertive but contested",
    event: "Lunar/Mars-base economy · orbital industry boom",
    runners: [{name:"Nigeria",flag:"🇳🇬",share:13},{name:"China",flag:"🇨🇳",share:13},{name:"Brazil",flag:"🇧🇷",share:11},{name:"USA",flag:"🇺🇸",share:9}] },
  { year: 2100, hegemon: "Nigeria", flag: "🇳🇬", share: 21, intensity: 55, yoga: "Population yoga matures · Mars own-sign Asc",
    event: "African Century · Lagos-Abuja axis rivals Delhi",
    runners: [{name:"India",flag:"🇮🇳",share:20},{name:"Brazil",flag:"🇧🇷",share:14},{name:"Indonesia",flag:"🇮🇩",share:11},{name:"China",flag:"🇨🇳",share:10}] },
  { year: 2150, hegemon: "Brazil", flag: "🇧🇷", share: 22, intensity: 48, yoga: "Jupiter MD on Sagittarius rising",
    event: "Amazon-restoration economy · biofuel + carbon hegemon",
    runners: [{name:"Nigeria",flag:"🇳🇬",share:18},{name:"India",flag:"🇮🇳",share:15},{name:"Indonesia",flag:"🇮🇩",share:12},{name:"USA",flag:"🇺🇸",share:8}] },
  { year: 2200, hegemon: "Indonesia", flag: "🇮🇩", share: 24, intensity: 40, yoga: "Mercury MD · Jala Nadi maritime",
    event: "Equatorial Crescent rises — sea-level trade routes redrawn",
    runners: [{name:"Brazil",flag:"🇧🇷",share:18},{name:"Nigeria",flag:"🇳🇬",share:15},{name:"India",flag:"🇮🇳",share:13},{name:"Ethiopia",flag:"🇪🇹",share:8}] },
  { year: 2275, hegemon: "Pan-African Union", flag: "🌍", share: 27, intensity: 52, yoga: "Sankranti Purusha rotates south",
    event: "Continental federation · resource + lithium dominance",
    runners: [{name:"Indonesia",flag:"🇮🇩",share:18},{name:"Brazil",flag:"🇧🇷",share:14},{name:"India",flag:"🇮🇳",share:11},{name:"Mars Colony",flag:"♂",share:7}] },
  { year: 2350, hegemon: "Mars Confederation", flag: "♂", share: 24, intensity: 60, yoga: "Mars exalted on Capricorn — off-world Asc",
    event: "First sovereign extra-planetary polity recognized on Earth",
    runners: [{name:"Pan-African",flag:"🌍",share:20},{name:"Indonesia",flag:"🇮🇩",share:14},{name:"Brazil",flag:"🇧🇷",share:11},{name:"Lunar State",flag:"☾",share:9}] },
  { year: 2425, hegemon: "Mars Confederation", flag: "♂", share: 28, intensity: 45, yoga: "Long Saturn cycle stabilizes off-world",
    event: "Inter-planetary economy · Earth becomes Tier-2 power node",
    runners: [{name:"Pan-African",flag:"🌍",share:18},{name:"Lunar State",flag:"☾",share:14},{name:"Indo-Pacific",flag:"🇮🇩",share:11},{name:"Antarctic Federation",flag:"🇦🇶",share:6}] },
  { year: 2525, hegemon: "Solar Compact", flag: "☉", share: 35, intensity: 30, yoga: "Sun MD restart on global civilization Asc",
    event: "Earth–Mars–Lunar treaty body governs trade · Surya hegemony",
    runners: [{name:"Mars Confed",flag:"♂",share:20},{name:"Pan-African",flag:"🌍",share:14},{name:"Lunar State",flag:"☾",share:12},{name:"Earth Council",flag:"🌐",share:10}] },
];

// ─────────────────────────────────────────────────────────────────────
// WW3 DETAILED DOSSIER — non-generic, vedic-grounded forecast
// ─────────────────────────────────────────────────────────────────────
export interface WW3Phase {
  phase: string;
  window: string;
  trigger: string;
  detail: string;
  vedic: string;
}

export interface WW3Dossier {
  classification: string;
  start: { date: string; trigger: string; locus: string; detail: string };
  ignition: { date: string; detail: string };
  peak: { date: string; detail: string; casualties: string };
  turning: { date: string; detail: string };
  end: { date: string; detail: string };
  victors: string[];
  defeated: string[];
  postwar_top: { rank: number; country: string; flag: string; note: string }[];
  eclipses: { date: string; type: string; path: string; effect: string }[];
  phases: WW3Phase[];
  fronts: { theatre: string; combatants: string; outcome: string }[];
  blackswans: string[];
}

export const WW3_DOSSIER: WW3Dossier = {
  classification: "TOP SECRET // ZOPHIEL MUNDANE FORECAST",
  start: {
    date: "2028-08 → 2028-11",
    trigger: "Naval incident in West Pacific (Taiwan Strait blockade) + simultaneous Black Sea escalation",
    locus: "Taiwan Strait + Eastern Mediterranean (dual-theatre opening)",
    detail: "Mars enters Scorpio (own sign) while Saturn-Rahu Vedha hits the natal Moon of both US (Cancer Asc) and PRC (Libra Asc) charts. A grey-zone naval collision becomes a kinetic exchange within 11 days. Article-5 / Mutual Defense triggers cascade alliances within 6 weeks."
  },
  ignition: {
    date: "2028-03",
    detail: "Open declaration after the 2028-Jan annular eclipse path crosses Beijing latitude. Hypersonic + cyber-grid strikes cripple Pacific carrier groups in week one. Russia opens Arctic + Baltic fronts to fix NATO."
  },
  peak: {
    date: "2029-08 → 2030-04",
    detail: "Maximum intensity. Tactical nuclear use limited (2–4 sub-kiloton, naval). Space-asset war: 70% of LEO comms degraded. Global supply chains collapse for 9 months. Famine belt across MENA + Sahel from grain blockades.",
    casualties: "Direct combat: 8–14M. Famine + cascade: 60–110M. Refugee flow: ~280M."
  },
  turning: {
    date: "2030-06",
    detail: "Total solar eclipse 01-Jun-2030 (path: Mediterranean → Caspian → North China). Within 90 days Mars transits the eclipse degree → Beijing political shock + simultaneous Moscow regime transition (Trishula on Rudra sign, Russia chart). Coalition initiative passes to India + Brazil + ASEAN bloc holding the neutral 'Surya Axis'."
  },
  end: {
    date: "2031-05 (formal armistice) · 2032-Q1 (final peace)",
    detail: "Sun mahadasha begins for India 2031-05. Sankranti Purusha names India 'King of Year' in three consecutive solar ingress charts → mediator role. Peace conference held in Delhi + Jakarta. New global compact ratified Q1 2032."
  },
  victors: [
    "🇮🇳 India — emerges as #1 mediator → economic & moral hegemon (Sun MD)",
    "🇧🇷 Brazil — food + biofuel supplier to recovery; Atlantic naval hub",
    "🇮🇩 Indonesia — undamaged maritime backbone of new ASEAN+ bloc",
    "🇸🇦 Saudi Arabia — energy underwriter of reconstruction",
    "🇳🇬 Nigeria — African pivot, demographic surplus exporter"
  ],
  defeated: [
    "🇷🇺 Russia — territorial loss + regime change (Trishula 2030)",
    "🇨🇳 China (PRC) — naval defeat + leadership transition; partial economic recovery by 2038",
    "🇺🇦 Ukraine — Pyrrhic survival; reconstruction dependency",
    "🇰🇵 North Korea — collapse / absorption into Korean federation",
    "🇮🇷 Iran — regime change post-2030 eclipse re-trigger"
  ],
  postwar_top: [
    { rank: 1, country: "India",       flag: "🇮🇳", note: "Sun MD 2031–2049 · Sankranti hegemon" },
    { rank: 2, country: "United States", flag: "🇺🇸", note: "Wounded but intact · Space + cyber preserved" },
    { rank: 3, country: "Brazil",      flag: "🇧🇷", note: "Atlantic supplier · Jupiter MD 2035+" },
    { rank: 4, country: "Indonesia",   flag: "🇮🇩", note: "ASEAN+ leader · Mercury MD 2038+" },
    { rank: 5, country: "Saudi Arabia",flag: "🇸🇦", note: "Energy financier of reconstruction" },
    { rank: 6, country: "Nigeria",     flag: "🇳🇬", note: "African pivot rises through 2040s" }
  ],
  eclipses: [
    { date: "2028-08-02", type: "Total Solar (path: Spain → Egypt → Saudi)", path: "Mediterranean–Red Sea axis",
      effect: "Activates MENA war front. Re-trigger by Mars 2028-11 = ignition spark." },
    { date: "2028-01-26", type: "Annular Solar (path: Indian Ocean → Pacific)", path: "South China Sea adjacent",
      effect: "Anchors Pacific theatre. Saturn re-hit 2028-Q3 = naval climax." },
    { date: "2030-06-01", type: "Total Solar (path: N.Africa → Caspian → N.China)", path: "Crosses Beijing latitude band",
      effect: "DECISIVE eclipse · regime shock within eclipse-cycle (years = hours of totality ≈ 5)." },
    { date: "2030-11-25", type: "Lunar (penumbral)", path: "Visible Asia + Pacific",
      effect: "Months-of-effect window — armistice momentum builds." }
  ],
  phases: [
    { phase: "I · Cold Phase",       window: "2026-Q4 → 2028-Q3", trigger: "Trade + chip embargoes, cyber preludes",
      detail: "Naval close-passes weekly. Submarine cable severances. Two NATO+1 exercises near Taiwan.",
      vedic: "Mars enters Scorpio · Saturn–Rahu Vedha forming" },
    { phase: "II · Ignition",         window: "2028-Q4 → 2029-Q1", trigger: "Naval kinetic + Black Sea escalation",
      detail: "Carrier loss in Pacific. Article-5 invoked in Europe within 6 weeks.",
      vedic: "Eclipse 2028-08 path activates · Mars re-hit Nov-2028" },
    { phase: "III · Total War",       window: "2028 → 2029-Q3",   trigger: "Open declarations, full mobilization",
      detail: "Hypersonic exchange · LEO satellite war · NATO + AUKUS vs PRC + RU + DPRK + IR axis.",
      vedic: "Saturn–Mars samasaptaka active · Sanghatta Vedha confirmed" },
    { phase: "IV · Peak",             window: "2029-Q4 → 2030-Q2", trigger: "Limited tactical-nuclear use (naval)",
      detail: "8–14M direct dead. Famine belt from grain blockade. 280M displaced.",
      vedic: "Pancha Vedha on PRC + RU national arth-stars" },
    { phase: "V · Turning",           window: "2030-Q2 → 2030-Q4", trigger: "01-Jun-2030 total eclipse over capitals",
      detail: "Beijing + Moscow shocks within 90 days · Surya Axis (IN+BR+ID) initiative ascends.",
      vedic: "Trishula on Rudra sign of RU chart · Sankranti Purusha rotates" },
    { phase: "VI · Armistice",        window: "2031-Q1 → 2031-Q2", trigger: "India Sun-MD onset + Delhi conference",
      detail: "Cease-fires in Pacific then Europe. Prisoner exchanges, partial reparations.",
      vedic: "Sun MD India begins May-2031" },
    { phase: "VII · New Order",       window: "2032 → 2049",       trigger: "Delhi-Jakarta Compact ratified",
      detail: "India = mediator-hegemon. New reserve basket (gold + INR + BRL + IDR). UN restructured.",
      vedic: "Sankranti Purusha names India King-of-Year three consecutive ingress charts" }
  ],
  fronts: [
    { theatre: "West Pacific",   combatants: "USA + JP + AU + KR + PH ↔ PRC + DPRK", outcome: "Coalition naval victory; Taiwan neutralized as DMZ" },
    { theatre: "Eastern Europe", combatants: "NATO ↔ Russia + Belarus",                outcome: "Russia loses occupied + buffer territory; regime change" },
    { theatre: "MENA",           combatants: "Israel + GCC ↔ Iran + proxies",          outcome: "Iranian regime falls post-2030 eclipse re-trigger" },
    { theatre: "Cyber + Space",  combatants: "Five-Eyes + IN ↔ PRC + RU",              outcome: "70% LEO degradation; Indian + US space assets survive best" },
    { theatre: "Arctic",         combatants: "NATO + Nordic ↔ Russia",                 outcome: "NATO seizes Northern Sea Route control" }
  ],
  blackswans: [
    "EMP burst over mid-Pacific 2029-Q2 — accelerates LEO collapse",
    "Yellowstone or Cascadia seismic event during peak — Saturn in Koorma central region",
    "AI command-loop incident causing brief unauthorized launch (recalled)",
    "Asteroid 2024-YR4 family near-miss 2029 distorts space-asset deployment",
    "Indian-led 'Surya Treaty' draft leaked Q4 2030 forces early talks"
  ]
};

// Strongest military / power suit per country chart (derived from sign-element rulership)
// Air = Gemini/Libra/Aquarius · Land = Taurus/Virgo/Capricorn · Sea = Cancer/Scorpio/Pisces
// Fire/Space = Aries/Leo/Sagittarius
export const POWER_SUIT: Record<string, { air: number; land: number; sea: number; space: number; primary: string; note: string }> = {
  US: { air: 95, land: 75, sea: 90, space: 98, primary: "Space + Air",  note: "Cancer Asc + Mars 10H. Mercury-Saturn yoga = cyber/space." },
  CN: { air: 70, land: 88, sea: 92, space: 80, primary: "Sea + Land",   note: "Libra Asc, Scorpio Moon. Naval expansion via Jupiter aspect on 7H." },
  RU: { air: 78, land: 95, sea: 70, space: 88, primary: "Land + Space", note: "Sagittarius rising. Mars exalted = artillery & strategic." },
  IN: { air: 88, land: 80, sea: 75, space: 85, primary: "Air + Cyber",  note: "Taurus Asc, exalted Mercury. Strongest in IT, missile, air." },
  GB: { air: 72, land: 60, sea: 95, space: 65, primary: "Sea",          note: "Capricorn Asc + Moon Cancer = naval heritage." },
  FR: { air: 82, land: 70, sea: 78, space: 80, primary: "Air + Nuclear",note: "Scorpio Asc — strategic deterrent, aerospace." },
  DE: { air: 80, land: 90, sea: 65, space: 70, primary: "Land + Industry", note: "Capricorn 10H. Earthy triangle dominance." },
  JP: { air: 85, land: 60, sea: 92, space: 80, primary: "Sea + Tech",   note: "Cancer Asc. Pacific naval + robotics." },
  IL: { air: 90, land: 78, sea: 60, space: 88, primary: "Air + Cyber",  note: "Leo Asc + Mars-Mercury yoga." },
  KR: { air: 85, land: 75, sea: 80, space: 78, primary: "Tech + Air",   note: "Virgo precision; Mercury strong." },
  TR: { air: 75, land: 88, sea: 82, space: 60, primary: "Land + Sea",   note: "Scorpio rising. Drone + naval projection." },
  BR: { air: 65, land: 92, sea: 78, space: 55, primary: "Land + Agri",  note: "Earthy power; Jupiter on Sagittarius = supply." },
  IR: { air: 78, land: 80, sea: 70, space: 65, primary: "Land + Asymmetric", note: "Cancer Asc, Mars-Rahu yoga." },
  PK: { air: 78, land: 82, sea: 60, space: 55, primary: "Land + Nuclear", note: "Mars on Asc, Saturn 10H." },
  SA: { air: 70, land: 85, sea: 65, space: 55, primary: "Energy + Land", note: "Sun-Mars conjunct — oil sovereignty." },
  EG: { air: 65, land: 80, sea: 70, space: 50, primary: "Land + Sea",   note: "Suez geometry; Cancer 4H." },
  ID: { air: 60, land: 75, sea: 88, space: 50, primary: "Sea (archipelago)", note: "Scorpio 5H rare-earth." },
  AU: { air: 78, land: 75, sea: 90, space: 70, primary: "Sea + Space",  note: "Capricorn Asc + Pacific theatre." },
  CA: { air: 75, land: 80, sea: 78, space: 68, primary: "Land + Resource", note: "Cancer Asc; Arctic frontier." },
  MX: { air: 60, land: 78, sea: 70, space: 45, primary: "Land",         note: "Virgo Asc, agricultural & industrial." },
  NG: { air: 60, land: 85, sea: 70, space: 40, primary: "Land + Energy",note: "Mars on Libra. Population yoga." },
  ZA: { air: 60, land: 80, sea: 75, space: 50, primary: "Land + Mineral", note: "Capricorn — mining & rare metals." },
  BD: { air: 55, land: 70, sea: 75, space: 35, primary: "Sea (delta)",  note: "Cancer Asc. Climate-water leverage." },
  ES: { air: 70, land: 72, sea: 80, space: 60, primary: "Sea + Air",    note: "Mediterranean naval tradition." },
  IT: { air: 70, land: 70, sea: 82, space: 60, primary: "Sea + Air",    note: "Mediterranean carrier projection." },
  AR: { air: 65, land: 80, sea: 70, space: 50, primary: "Land + Agri",  note: "Sagittarius. Pampas exports." },
  VN: { air: 65, land: 80, sea: 78, space: 40, primary: "Land + Coastal Sea", note: "Mars + Saturn in Cancer = guerrilla doctrine." },
  TH: { air: 60, land: 75, sea: 70, space: 40, primary: "Land",         note: "Cancer Asc, Buddhist Jupiter." },
  PH: { air: 55, land: 60, sea: 82, space: 35, primary: "Sea (archipelago)", note: "Cancer 4H, Pacific archipelago." },
  UA: { air: 75, land: 88, sea: 65, space: 60, primary: "Land + Drone",  note: "Virgo, agricultural-military hybrid." },
};

// PROTOCOL summaries from the Zophiel report — surfaced in the UI as expandable cards.
export interface ProtocolEntry {
  id: string;
  title: string;
  target: string;
  technique: string;
  body: string;       // markdown-ish
  signal: string;     // active "watch this" signal
}

export const PROTOCOLS: ProtocolEntry[] = [
  { id: "war",      title: "1 · Sanghatta Rashi Protocol (War)",
    target: "Outbreak of war, terrorism, border conflicts",
    technique: "Mars–Saturn Vedha + Rahu/Ketu in fiery signs",
    signal: "Trigger: Moon enters afflicted fiery sign (1/5/9).",
    body: "WAR is guaranteed when Mars & Saturn cause mutual Vedha in the Sanghatta Chakra AND Jupiter is weak. With Jupiter aspect → cold war only. Active Vedha pairs through 2028 favor escalation in Eastern Europe & West Pacific." },
  { id: "crash",    title: "2 · Sarvatobhadra Crash Protocol",
    target: "Stock crashes, bank failure, sovereign default",
    technique: "Pancha Vedha (5-fold pierce) on national 'Arth' nakshatras",
    signal: "Watch Saturn pierce of US 2H/11H stars in the critical window.",
    body: "Sun-Vedha = bear sentiment · Mars-Vedha = panic · Saturn-Vedha = depression · Rahu/Ketu = fraud bubbles. A Pancha Vedha (5 simultaneous pierces) collapses the regime or asset to zero." },
  { id: "disaster", title: "3 · Koorma Chakra (Natural Disasters)",
    target: "Earthquakes, tsunamis, pandemics by region",
    technique: "Tortoise mapping + 22nd-from-Sun (Mahakampa)",
    signal: "Saturn in 22nd nakshatra from Sun = major tremor.",
    body: "Saturn transit on regional nakshatra → famine/quake. Mars transit → fire/violence. The 'Suryat Bindu' pinpoints calamity windows: 8th=Shoola · 18th=Ketu · 21st=Ulka (meteor/blast) · 22nd=Mahakampa." },
  { id: "regime",   title: "4 · Eclipse & Sankranti Regime Change",
    target: "Coups, assassinations, leader removal",
    technique: "Path-of-totality + Mesha Sankranti chart",
    signal: "Solar eclipse hours = years of effect. Watch Mars/Saturn re-hit eclipse degree.",
    body: "If totality crosses a capital, the regime falls within the eclipse cycle. Trigger fires when Mars or Saturn later transits the exact eclipse degree." },
  { id: "siege",    title: "5 · Kota Chakra Fortress Protocol",
    target: "Capital city sieges, leader assassination",
    technique: "Stambha (4th, 11th, 18th, 25th from leader's nakshatra)",
    signal: "Two malefics inside Stambha + benefics in Bahya = Durga Bhanga.",
    body: "Benefics in Stambha = leader invincible. Malefics inside while benefics flee to the moat = the fortress falls. Exact day = arrival of 2nd malefic." },
  { id: "weather",  title: "6 · Sapta Nadi (Weather & Commodities)",
    target: "Drought, flood, harvest failure → futures",
    technique: "7 atmospheric Nadis tracked by planet position",
    signal: "Saturn in Dahana (fire) Nadi = oil & gold spike.",
    body: "Drought when planets cluster in Chanda/Vayu/Dahana. Flood when Sun+Mars join Moon/Venus in Jala/Amrita. Direct play: long grain on drought, short insurance on flood." },
  { id: "argha",    title: "7 · Argha Kand (Price Forecasting)",
    target: "Gold, silver, oil price moves",
    technique: "Graha Bhakti + sign rulership of commodity",
    signal: "Mars/Sun → Leo = Gold spike. Saturn/Rahu afflicting Scorpio = Oil supply shock.",
    body: "Bull when benefics retrograde or transit commodity sign. Mars–Saturn samasaptaka across Taurus/Scorpio or Leo/Aquarius = global financial panic." },
  { id: "rohini",   title: "8 · Rohini & Garbha Rain Protocol",
    target: "Long-term harvest & rainfall forecast",
    technique: "Sun→Rohini ingress (~May 25) + Margashirsha cloud-conception",
    signal: "Rain on Rohini ingress day = monsoon arrives 72 days later.",
    body: "If Sun's entry into Rohini is dry/hot → drought guaranteed (short grain). Margashirsha eastward winds → good monsoon; southward → famine." },
  { id: "shoola",   title: "9 · Shoola Chakra (Trident of Death)",
    target: "Battlefield outcome, regime end, attack direction",
    technique: "Trishula = 1/5/9 from Rudra (8H lord sign)",
    signal: "Shoola Dasha hitting Trishula sign = regime expiry window.",
    body: "Direction of attack = direction of strongest malefic at war declaration. Defend the OPPOSITE direction." },
  { id: "totality", title: "10 · Eclipse Totality Capital Rule",
    target: "Pinpoint city of regime collapse",
    technique: "Physical umbra path over capital",
    signal: "Capital under 100% shadow → leader falls within eclipse cycle.",
    body: "Effect is ONLY where eclipse is visible. Years (solar) or months (lunar) of duration = hours of eclipse. Trigger = later Mars/Saturn re-hit on eclipse degree." },
];

// Concrete forecast windows synthesized from the protocols (for the 'Predictions Timeline').
export interface ForecastEvent {
  date: string;          // YYYY-MM or YYYY-MM-DD
  era: "Past" | "Present" | "Future";
  region: string;
  flag: string;
  protocol: string;      // protocol id
  headline: string;
  detail: string;
}

export const FORECASTS: ForecastEvent[] = [
  { date: "1991-12", era: "Past",    region: "Soviet Union", flag: "☭", protocol: "regime",
    headline: "USSR Dissolution — Pancha Vedha confirmed",
    detail: "Saturn pierced national arth-stars while eclipse path of Jul-1991 crossed Moscow latitude band." },
  { date: "2008-09", era: "Past",    region: "United States", flag: "🇺🇸", protocol: "crash",
    headline: "Lehman Crash — Mars/Saturn samasaptaka Leo–Aquarius",
    detail: "Argha Kand bear signal triggered by Saturn affliction of US 2H stars." },
  { date: "2020-03", era: "Past",    region: "Global", flag: "🌐", protocol: "disaster",
    headline: "COVID Pandemic — Saturn entered Capricorn (Earthy disaster triangle)",
    detail: "Jupiter–Saturn–Pluto stellium amplified Koorma central region affliction." },

  { date: "2026-Q3", era: "Present", region: "Eastern Europe", flag: "🇺🇦", protocol: "war",
    headline: "Active Mars–Saturn Vedha — escalation window",
    detail: "Moon-trigger dates: Aug 14, Sep 11, Oct 9 (Moon in fiery signs)." },
  { date: "2026-12", era: "Present", region: "United States", flag: "🇺🇸", protocol: "crash",
    headline: "Saturn approaches US 2H Pisces — earnings shock",
    detail: "Watch financial sector. Pancha Vedha incomplete (3/5) — bear, not collapse." },
  { date: "2028-04", era: "Present", region: "China", flag: "🇨🇳", protocol: "weather",
    headline: "Sapta Nadi → Jala overflow",
    detail: "Yangtze flood probability elevated; insurance & infra stocks at risk." },

  { date: "2028-08", era: "Future",  region: "Russia", flag: "🇷🇺", protocol: "shoola",
    headline: "Trishula on Rudra sign — regime transition",
    detail: "Shoola Dasha hits 9th from Rudra during eclipse cycle." },
  { date: "2031-05", era: "Future",  region: "India", flag: "🇮🇳", protocol: "regime",
    headline: "Sun mahadasha begins — ascent to #1",
    detail: "Sankranti Purusha names India 'King of Year' through 2049." },
  { date: "2033-08", era: "Future",  region: "United States", flag: "🇺🇸", protocol: "totality",
    headline: "Eclipse band sweeps Atlantic seaboard",
    detail: "Capital risk: re-trigger by Saturn transit on eclipse degree late 2034." },
  { date: "2038-11", era: "Future",  region: "China", flag: "🇨🇳", protocol: "argha",
    headline: "Naval/Space peak — Jupiter return on Cancer 10H",
    detail: "Yuan reserve-currency yoga active. Gold paired short-term spike." },
  { date: "2046-03", era: "Future",  region: "Nigeria", flag: "🇳🇬", protocol: "siege",
    headline: "Stambha test — capital pressure",
    detail: "Two malefics enter Abuja chart Stambha; benefic flight risk to Bahya." },
];
