// Strengths / Weaknesses / Vulnerabilities engine
// Derives chart-grounded insights from planet placements, dignities, house lords,
// and classical malefic/benefic combinations. Used for personal + country charts.

import { rashis } from "@/data/nakshatraData";
import { computeDignity, houseFromAsc, type PlanetName } from "./dignities";

export interface SwvPlanet {
  name: string;
  symbol: string;
  sid: number;
  retrograde: boolean;
}

export interface SwvFinding {
  kind: "strength" | "weakness" | "vulnerability";
  title: string;
  detail: string;
  domain: string; // e.g. "Wealth", "Health", "Career", "Foreign", "Defense"
  weight: number; // 1–5 magnitude
  source: string; // citation tag e.g. "Sun H10 · Exalted"
}

export interface SwvReport {
  ascSign: string;
  ascRuler: string;
  strengths: SwvFinding[];
  weaknesses: SwvFinding[];
  vulnerabilities: SwvFinding[];
  scores: { strength: number; weakness: number; vulnerability: number; resilience: number };
}

const FRIEND: Record<PlanetName, PlanetName[]> = {
  Sun: ["Moon", "Mars", "Jupiter"],
  Moon: ["Sun", "Mercury"],
  Mars: ["Sun", "Moon", "Jupiter"],
  Mercury: ["Sun", "Venus"],
  Jupiter: ["Sun", "Moon", "Mars"],
  Venus: ["Mercury", "Saturn"],
  Saturn: ["Mercury", "Venus"],
  Rahu: ["Venus", "Saturn"],
  Ketu: ["Mars", "Venus"],
};

const NATURAL_MALEFIC = new Set(["Sun", "Mars", "Saturn", "Rahu", "Ketu"]);
const NATURAL_BENEFIC = new Set(["Jupiter", "Venus", "Moon", "Mercury"]);

const HOUSE_DOMAIN: Record<number, string> = {
  1: "Self / Vitality",
  2: "Wealth / Speech",
  3: "Courage / Siblings",
  4: "Home / Mother / Property",
  5: "Children / Intelligence / Speculation",
  6: "Enemies / Health / Service",
  7: "Partnership / Foreign / Trade",
  8: "Longevity / Crisis / Hidden",
  9: "Fortune / Dharma / Higher Mind",
  10: "Career / Power / Authority",
  11: "Gains / Networks / Allies",
  12: "Loss / Foreign Lands / Liberation",
};

const PLANET_KEYWORDS: Record<string, string> = {
  Sun: "leadership, vitality, government, ego",
  Moon: "mind, emotions, public, mother",
  Mars: "force, military, courage, accidents",
  Mercury: "intellect, commerce, communication, youth",
  Jupiter: "wisdom, wealth, expansion, dharma",
  Venus: "harmony, finance, alliances, beauty",
  Saturn: "discipline, structure, longevity, restriction",
  Rahu: "obsession, foreign, technology, deception",
  Ketu: "detachment, mysticism, isolation, severance",
};

const DUSTHANA = new Set([6, 8, 12]); // malefic houses
const KENDRA = new Set([1, 4, 7, 10]);
const TRIKONA = new Set([1, 5, 9]);

function signName(deg: number) { return rashis[Math.floor(deg / 30)].name; }
function signRuler(deg: number) { return rashis[Math.floor(deg / 30)].ruler; }

export function analyzeSwv(ascendant: number, planetsIn: SwvPlanet[]): SwvReport {
  // Normalize: include synthetic Ketu (180° from Rahu) for full SWV coverage.
  const planets: SwvPlanet[] = [...planetsIn];
  const rahu = planetsIn.find((p) => p.name === "Rahu");
  if (rahu && !planetsIn.some((p) => p.name === "Ketu")) {
    planets.push({ name: "Ketu", symbol: "☋", sid: (rahu.sid + 180) % 360, retrograde: true });
  }

  const sun = planets.find((p) => p.name === "Sun")!;
  const findings: SwvFinding[] = [];
  const ascSignIdx = Math.floor(ascendant / 30);
  const ascSign = rashis[ascSignIdx].name;
  const ascRuler = rashis[ascSignIdx].ruler;

  // Build a quick map: which planet is in which house
  const houseOf: Record<string, number> = {};
  const signOf: Record<string, number> = {};
  for (const p of planets) {
    houseOf[p.name] = houseFromAsc(p.sid, ascendant);
    signOf[p.name] = Math.floor(p.sid / 30);
  }

  // 1) Per-planet dignity contributions
  for (const p of planets) {
    if (p.name === "Ketu") continue; // dignity below for Ketu separately
    const dignity = computeDignity(p.name as PlanetName, p.sid, sun.sid, p.retrograde);
    const house = houseOf[p.name];
    const sign = signName(p.sid);
    const domain = HOUSE_DOMAIN[house];
    const kw = PLANET_KEYWORDS[p.name] ?? "";

    if (dignity.exalted) {
      findings.push({
        kind: "strength", weight: 5, domain,
        title: `${p.name} EXALTED in ${sign} (H${house})`,
        detail: `Peak dignity grants exceptional ${kw} themed strength in ${domain}. This is a flagship asset of the chart.`,
        source: `${p.name} · Exalted · H${house}`,
      });
    } else if (dignity.ownSign) {
      findings.push({
        kind: "strength", weight: 4, domain,
        title: `${p.name} in OWN sign ${sign} (H${house})`,
        detail: `Sovereign placement — ${p.name} delivers stable, reliable ${kw} results in ${domain}.`,
        source: `${p.name} · Own Sign · H${house}`,
      });
    } else if (dignity.debilitated) {
      findings.push({
        kind: "weakness", weight: 5, domain,
        title: `${p.name} DEBILITATED in ${sign} (H${house})`,
        detail: `Lowest dignity — ${p.name} struggles to deliver ${kw}. Expect underperformance in ${domain} unless cancellation (Neecha Bhanga) applies via dispositor strength.`,
        source: `${p.name} · Debilitated · H${house}`,
      });
    }

    if (dignity.combust && p.name !== "Sun") {
      findings.push({
        kind: "vulnerability", weight: 3, domain,
        title: `${p.name} COMBUST by Sun`,
        detail: `Burnt by solar proximity — ${p.name}'s significations (${kw}) are scorched. Vulnerable to ego/authority over-rides in ${domain}.`,
        source: `${p.name} · Combust`,
      });
    }

    if (p.retrograde && !["Rahu", "Ketu"].includes(p.name)) {
      findings.push({
        kind: "vulnerability", weight: 2, domain,
        title: `${p.name} RETROGRADE`,
        detail: `Inward / re-do energy. Themes of ${kw} replay until resolved. Strategic delays in ${domain}.`,
        source: `${p.name} · Retrograde`,
      });
    }

    // House placement category effects
    if (DUSTHANA.has(house)) {
      if (NATURAL_BENEFIC.has(p.name)) {
        findings.push({
          kind: "weakness", weight: 3, domain,
          title: `Benefic ${p.name} in dusthana H${house}`,
          detail: `Benefic locked in a malefic house — ${kw} energy is consumed by ${domain}; healing/service possible but native wealth diminished.`,
          source: `${p.name} · Dusthana H${house}`,
        });
      } else {
        findings.push({
          kind: "strength", weight: 3, domain,
          title: `Malefic ${p.name} in H${house} (Vipareeta logic)`,
          detail: `Malefic in dusthana fights enemies/debt/disease well — Vipareeta yoga potential. Native gains through struggle in ${domain}.`,
          source: `${p.name} · Vipareeta H${house}`,
        });
      }
    }
    if (KENDRA.has(house) && NATURAL_BENEFIC.has(p.name)) {
      findings.push({
        kind: "strength", weight: 3, domain,
        title: `Benefic ${p.name} in kendra H${house}`,
        detail: `Pillar placement — sustains ${kw} as a structural strength of the chart's ${domain}.`,
        source: `${p.name} · Kendra H${house}`,
      });
    }
    if (TRIKONA.has(house) && NATURAL_BENEFIC.has(p.name)) {
      findings.push({
        kind: "strength", weight: 4, domain,
        title: `Benefic ${p.name} in trikona H${house}`,
        detail: `Lakshmi placement — fortune flows through ${kw} into ${domain}.`,
        source: `${p.name} · Trikona H${house}`,
      });
    }
  }

  // 2) Lagna lord (ascendant ruler) condition
  const lagnaLord = ascRuler;
  const llPlanet = planets.find((p) => p.name === lagnaLord);
  if (llPlanet) {
    const llHouse = houseOf[lagnaLord];
    const llDignity = computeDignity(lagnaLord as PlanetName, llPlanet.sid, sun.sid, llPlanet.retrograde);
    if (DUSTHANA.has(llHouse)) {
      findings.push({
        kind: "vulnerability", weight: 4, domain: "Self / Vitality",
        title: `Lagna lord ${lagnaLord} in dusthana H${llHouse}`,
        detail: `Identity ruler trapped in ${HOUSE_DOMAIN[llHouse]}. Self-undoing tendencies; health, reputation or losses are the prime vulnerability.`,
        source: `Lagna Lord · H${llHouse}`,
      });
    }
    if (llDignity.exalted || llDignity.ownSign) {
      findings.push({
        kind: "strength", weight: 5, domain: "Self / Vitality",
        title: `Lagna lord ${lagnaLord} dignified (${llDignity.label})`,
        detail: `Ruler of self stands strong — vitality, identity and self-direction are core strengths.`,
        source: `Lagna Lord · ${llDignity.label}`,
      });
    }
    if (llDignity.debilitated) {
      findings.push({
        kind: "weakness", weight: 5, domain: "Self / Vitality",
        title: `Lagna lord ${lagnaLord} debilitated`,
        detail: `Identity ruler weak — chronic self-doubt, vitality dips, leadership friction.`,
        source: `Lagna Lord · Debilitated`,
      });
    }
  }

  // 3) Mars / Saturn afflictions in same sign or opposition (Sanghatta-style stress)
  const mars = planets.find((p) => p.name === "Mars");
  const sat = planets.find((p) => p.name === "Saturn");
  if (mars && sat) {
    const sameSign = signOf["Mars"] === signOf["Saturn"];
    const opposition = Math.abs(signOf["Mars"] - signOf["Saturn"]) === 6;
    if (sameSign || opposition) {
      findings.push({
        kind: "vulnerability", weight: 4, domain: "Conflict / Defense",
        title: `Mars–Saturn ${sameSign ? "conjunction" : "opposition"}`,
        detail: `Classical stress combo — pressure under restriction. Vulnerable to accidents, surgeries, conflict spirals, infrastructure failure when triggered by transits.`,
        source: `Mars × Saturn`,
      });
    }
  }

  // 4) Rahu / Ketu axis house themes
  const rahuP = planets.find((p) => p.name === "Rahu");
  const ketuP = planets.find((p) => p.name === "Ketu");
  if (rahuP) {
    const rh = houseOf["Rahu"];
    findings.push({
      kind: "vulnerability", weight: 3, domain: HOUSE_DOMAIN[rh],
      title: `Rahu in H${rh} — obsession axis`,
      detail: `Insatiable hunger in ${HOUSE_DOMAIN[rh]}. Risk of overreach, illusion, foreign influence and deception in this domain.`,
      source: `Rahu · H${rh}`,
    });
  }
  if (ketuP) {
    const kh = houseOf["Ketu"];
    findings.push({
      kind: "weakness", weight: 2, domain: HOUSE_DOMAIN[kh],
      title: `Ketu in H${kh} — detachment axis`,
      detail: `Reluctance / past-life closure in ${HOUSE_DOMAIN[kh]}. Native may abandon or under-engage with this domain.`,
      source: `Ketu · H${kh}`,
    });
  }

  // 5) Wealth axis (2H + 11H lords)
  const lord2 = rashis[(ascSignIdx + 1) % 12].ruler;
  const lord11 = rashis[(ascSignIdx + 10) % 12].ruler;
  for (const [label, lord] of [["2H lord", lord2], ["11H lord", lord11]] as const) {
    const lp = planets.find((p) => p.name === lord);
    if (!lp) continue;
    const dg = computeDignity(lord as PlanetName, lp.sid, sun.sid, lp.retrograde);
    if (dg.exalted || dg.ownSign) {
      findings.push({ kind: "strength", weight: 4, domain: "Wealth",
        title: `${label} ${lord} dignified (${dg.label})`,
        detail: `Wealth pipeline structurally strong — earning capacity and gains ride a stable channel.`,
        source: `${label} · ${dg.label}` });
    }
    if (dg.debilitated) {
      findings.push({ kind: "weakness", weight: 4, domain: "Wealth",
        title: `${label} ${lord} debilitated`,
        detail: `Wealth channel kinked — chronic income or accumulation friction unless cancellation applies.`,
        source: `${label} · Debilitated` });
    }
  }

  // 6) 8H lord (longevity / hidden vulnerabilities)
  const lord8 = rashis[(ascSignIdx + 7) % 12].ruler;
  const lp8 = planets.find((p) => p.name === lord8);
  if (lp8) {
    const h = houseOf[lord8];
    if (KENDRA.has(h) || TRIKONA.has(h)) {
      findings.push({ kind: "vulnerability", weight: 3, domain: "Crisis / Hidden",
        title: `8H lord ${lord8} in H${h}`,
        detail: `Crisis ruler in a power house — sudden upheavals or exposure of hidden matters can disrupt central life areas.`,
        source: `8H Lord · H${h}` });
    }
  }

  // 7) Resilience: count benefics in kendras/trikonas
  let resilience = 0;
  for (const p of planets) {
    const h = houseOf[p.name];
    if (NATURAL_BENEFIC.has(p.name) && (KENDRA.has(h) || TRIKONA.has(h))) resilience += 2;
    const dg = p.name !== "Ketu" ? computeDignity(p.name as PlanetName, p.sid, sun.sid, p.retrograde) : null;
    if (dg?.exalted) resilience += 3;
    if (dg?.ownSign) resilience += 2;
    if (dg?.debilitated) resilience -= 3;
  }

  const scores = {
    strength: findings.filter((f) => f.kind === "strength").reduce((a, b) => a + b.weight, 0),
    weakness: findings.filter((f) => f.kind === "weakness").reduce((a, b) => a + b.weight, 0),
    vulnerability: findings.filter((f) => f.kind === "vulnerability").reduce((a, b) => a + b.weight, 0),
    resilience: Math.max(0, Math.min(100, 50 + resilience * 3)),
  };

  // Sort findings by weight desc
  const byWeight = (a: SwvFinding, b: SwvFinding) => b.weight - a.weight;
  return {
    ascSign, ascRuler,
    strengths: findings.filter((f) => f.kind === "strength").sort(byWeight),
    weaknesses: findings.filter((f) => f.kind === "weakness").sort(byWeight),
    vulnerabilities: findings.filter((f) => f.kind === "vulnerability").sort(byWeight),
    scores,
  };
}
