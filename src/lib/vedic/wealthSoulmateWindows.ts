/**
 * WEALTH & SOULMATE WINDOW DETECTOR
 *
 * Given the user's sensitive points and the list of upcoming planetary
 * sign-ingresses, this module extracts the SPECIFIC future windows where
 * either (a) millionaire-grade wealth karmas activate, or (b) the soulmate
 * / marriage karmas activate — based on which natal point the transiting
 * sign actually hits, NOT generic "Jupiter in 9th house" platitudes.
 *
 * Wealth axis  : L2 (Dhana), L5 (Purva Punya), L9 (Bhagya), L11 (Labha), AK
 * Soulmate axis: UL (Upapada), DK (Darakaraka), L7 (7th lord), Chandra (Moon)
 *
 * Window strength = sum of activator weights stacked inside the same
 * 6-month period. Multiple benefics hitting wealth points in the same
 * window = "millionaire-grade" stack.
 */
import type { SignIngress } from "./transits";
import type { SensitivePoints, PointCode } from "./sensitivePoints";
import { whyTransitMatters } from "./sensitivePoints";
import { getDignityMultiplier, dignityLabel } from "./dignities";

export type WindowKind =
  | "wealth" | "soulmate" | "health"
  | "romance" | "power" | "influence" | "fame" | "career"
  | "family" | "home" | "children" | "education" | "spirituality" | "travel"
  | "network";

export interface ActivationHit {
  date: Date;
  planet: string;
  symbol: string;
  retrograde: boolean;
  pointCode: PointCode;
  pointLabel: string;
  signName: string;
  weight: number;
  reasoning: string;
  /** Dumb-it-down version of `reasoning`. */
  plain: string;
}

export interface KarmicWindow {
  kind: WindowKind;
  start: Date;
  end: Date;
  score: number;
  grade: "Peak — once-a-decade" | "Strong" | "Moderate" | "Background";
  headline: string;
  hits: ActivationHit[];
}

const WEALTH_POINTS   = new Set<PointCode>(["L2", "L5", "L9", "L11", "AK"]);
const SOULMATE_POINTS = new Set<PointCode>(["UL", "DK", "L7", "Chandra"]);
const HEALTH_POINTS   = new Set<PointCode>(["L6", "L8", "L12", "Lagna", "Chandra"]);
const ROMANCE_POINTS  = new Set<PointCode>(["L5", "L7", "Chandra", "Lagna"]);          // affairs/dating ≠ marriage
const POWER_POINTS    = new Set<PointCode>(["L10", "Lagna", "Surya", "AK"]);           // authority / throne
const INFLUENCE_POINTS= new Set<PointCode>(["L10", "L11", "L3", "Chandra", "Lagna"]);  // reach / network sway
const FAME_POINTS     = new Set<PointCode>(["L10", "Lagna", "Surya", "Chandra"]);      // public visibility
const CAREER_POINTS   = new Set<PointCode>(["L10", "L6", "L11", "AK"]);                // work / advancement
// L4 = home / family / mother / property / inner peace. Chandra = mother & emotional home.
const FAMILY_POINTS       = new Set<PointCode>(["L4", "Chandra", "L2"]);
const HOME_POINTS         = new Set<PointCode>(["L4"]);                                 // property / real-estate / vehicles
const CHILDREN_POINTS     = new Set<PointCode>(["L5"]);                                 // children & creative output
const EDUCATION_POINTS    = new Set<PointCode>(["L4", "L5", "L9"]);                     // study / wisdom / certification
const SPIRITUALITY_POINTS = new Set<PointCode>(["L12", "L9", "Chandra"]);               // moksha / dharma / inner work
const TRAVEL_POINTS       = new Set<PointCode>(["L9", "L12", "L3"]);                    // foreign / long-distance / short trips
const NETWORK_POINTS      = new Set<PointCode>(["L11", "L3", "L10", "Chandra"]);         // gains, friends, allies, public network

const WEALTH_WEIGHT: Record<string, number> = {
  Jupiter: 5, Venus: 3, Rahu: 4, Sun: 1, Mercury: 1, Mars: 1,
  Saturn: -2, Ketu: -2, Moon: 1,
};
const SOULMATE_WEIGHT: Record<string, number> = {
  Jupiter: 5, Venus: 5, Rahu: 2, Mars: 1, Mercury: 1, Sun: 1, Moon: 1,
  Saturn: -2, Ketu: -3,
};
// HEALTH: malefics on health axis = SICKNESS (positive score = sick risk).
// Benefics here = healing / immunity boost (negative score, suppressed).
const HEALTH_WEIGHT: Record<string, number> = {
  Saturn: 5, Mars: 4, Rahu: 4, Ketu: 4, Sun: 1, Mercury: 0, Moon: 0,
  Jupiter: -3, Venus: -2,
};
// ROMANCE = quick attraction, dating, affairs (distinct from soulmate/marriage axis)
const ROMANCE_WEIGHT: Record<string, number> = {
  Venus: 5, Mars: 3, Moon: 3, Rahu: 3, Jupiter: 2, Mercury: 1, Sun: 1,
  Saturn: -3, Ketu: -3,
};
// POWER = authority, command, status. Sun-king + Saturn-structure + Mars-force.
const POWER_WEIGHT: Record<string, number> = {
  Sun: 5, Saturn: 4, Mars: 3, Jupiter: 3, Rahu: 3, Mercury: 1, Venus: 1, Moon: 0,
  Ketu: -3,
};
// INFLUENCE = sway over people, mass-reach, network charisma.
const INFLUENCE_WEIGHT: Record<string, number> = {
  Rahu: 5, Jupiter: 4, Mercury: 4, Venus: 4, Sun: 3, Moon: 2, Mars: 1, Saturn: 1,
  Ketu: -2,
};
// FAME = visibility spikes — Sun (king) + Rahu (mass) are the fame-pair.
const FAME_WEIGHT: Record<string, number> = {
  Rahu: 5, Sun: 5, Jupiter: 3, Venus: 3, Mercury: 2, Mars: 2, Moon: 2,
  Saturn: -1, Ketu: -3,
};
// CAREER = work / job advancement / promotions.
const CAREER_WEIGHT: Record<string, number> = {
  Saturn: 4, Sun: 4, Jupiter: 3, Mars: 3, Mercury: 3, Rahu: 3, Venus: 1, Moon: 1,
  Ketu: -2,
};
// FAMILY = harmony, mother/parents, reunions, family events. Jupiter & Moon are family-karakas.
const FAMILY_WEIGHT: Record<string, number> = {
  Jupiter: 5, Venus: 3, Moon: 3, Mercury: 1, Sun: 1,
  Saturn: -3, Mars: -3, Rahu: -2, Ketu: -3,
};
// HOME / PROPERTY = real-estate, vehicles, relocation, household.
const HOME_WEIGHT: Record<string, number> = {
  Jupiter: 5, Venus: 4, Mercury: 2, Moon: 2, Sun: 1,
  Mars: -3, Saturn: -2, Rahu: 2, Ketu: -2,
};
// CHILDREN / CREATIVITY = conception, child welfare, creative output, speculation.
const CHILDREN_WEIGHT: Record<string, number> = {
  Jupiter: 5, Venus: 3, Sun: 2, Mercury: 2, Moon: 2, Mars: 1, Rahu: 2,
  Saturn: -3, Ketu: -4,
};
// EDUCATION = study, exams, wisdom, certification, teaching.
const EDUCATION_WEIGHT: Record<string, number> = {
  Jupiter: 5, Mercury: 5, Sun: 2, Venus: 1, Moon: 1, Saturn: 1,
  Rahu: 1, Ketu: -2, Mars: -1,
};
// SPIRITUALITY / MOKSHA = retreat, dharma, dissolution, inner work.
const SPIRITUALITY_WEIGHT: Record<string, number> = {
  Jupiter: 5, Ketu: 5, Saturn: 3, Moon: 2, Rahu: 1,
  Mercury: 0, Venus: -1, Mars: -2, Sun: 0,
};
// TRAVEL = movement, foreign, immigration, long-distance opportunities.
const TRAVEL_WEIGHT: Record<string, number> = {
  Rahu: 5, Jupiter: 4, Mercury: 3, Venus: 2, Moon: 2, Mars: 2, Sun: 1,
  Saturn: -2, Ketu: 1,
};
// NETWORK / CONNECTIONS = allies, friend-circle expansion, public-facing relationships.
const NETWORK_WEIGHT: Record<string, number> = {
  Mercury: 5, Rahu: 5, Jupiter: 4, Venus: 3, Sun: 2, Moon: 2, Mars: 1, Saturn: 1,
  Ketu: -2,
};


const POINT_BONUS: Partial<Record<PointCode, number>> = {
  L9: 3, L11: 2, L2: 1, AK: 2, UL: 3, DK: 2, L7: 1,
  L6: 3, L8: 3, L12: 2, Lagna: 1, Chandra: 1,
  L10: 3, L3: 1, Surya: 1, L5: 1,
};

/**
 * Retrograde scaling is now consolidated in getDignityMultiplier() (which
 * amplifies retrograde benefics by 1.15× and leaves malefics unchanged).
 * This used to halve weights by ~0.6× for any retrograde, which double-counted
 * the effect once dignity also touches retrograde. Kept as a no-op for call-site
 * stability — remove once nothing else imports it.
 */
function applyRetro(w: number, _retro: boolean): number {
  return w;
}

function gradeScore(score: number): KarmicWindow["grade"] {
  // NOTE: thresholds unchanged. Because dignity can now amplify weights up to
  // 1.5× (and a retrograde benefic up to 1.725×), more windows may reach "Peak"
  // on highly dignified charts. TODO: consider scaling thresholds to 5 / 10 / 17
  // if calibration drifts — leave as-is until empirically validated.
  const s = Math.abs(score);
  if (s >= 14) return "Peak — once-a-decade";
  if (s >= 8)  return "Strong";
  if (s >= 4)  return "Moderate";
  return "Background";
}

function makeHit(
  ing: SignIngress,
  pointCode: PointCode,
  pointLabel: string,
  signName: string,
  weight: number,
  reasoning: string,
  plain: string,
): ActivationHit {
  return {
    date: ing.date,
    planet: ing.planet,
    symbol: ing.symbol,
    retrograde: ing.retrograde,
    pointCode, pointLabel, signName, weight, reasoning, plain,
  };
}

export function detectWindows(
  ingresses: SignIngress[],
  points: SensitivePoints | null,
  kind: WindowKind,
  opts: { clusterDays?: number; minScore?: number } = {},
): KarmicWindow[] {
  if (!points || !ingresses.length) return [];
  const clusterMs = (opts.clusterDays ?? 180) * 86400_000;
  const minScore = opts.minScore ?? 3;
  const POINT_SET: Record<WindowKind, Set<PointCode>> = {
    wealth: WEALTH_POINTS, soulmate: SOULMATE_POINTS, health: HEALTH_POINTS,
    romance: ROMANCE_POINTS, power: POWER_POINTS, influence: INFLUENCE_POINTS,
    fame: FAME_POINTS, career: CAREER_POINTS,
    family: FAMILY_POINTS, home: HOME_POINTS, children: CHILDREN_POINTS,
    education: EDUCATION_POINTS, spirituality: SPIRITUALITY_POINTS, travel: TRAVEL_POINTS,
    network: NETWORK_POINTS,
  };
  const WEIGHT_SET: Record<WindowKind, Record<string, number>> = {
    wealth: WEALTH_WEIGHT, soulmate: SOULMATE_WEIGHT, health: HEALTH_WEIGHT,
    romance: ROMANCE_WEIGHT, power: POWER_WEIGHT, influence: INFLUENCE_WEIGHT,
    fame: FAME_WEIGHT, career: CAREER_WEIGHT,
    family: FAMILY_WEIGHT, home: HOME_WEIGHT, children: CHILDREN_WEIGHT,
    education: EDUCATION_WEIGHT, spirituality: SPIRITUALITY_WEIGHT, travel: TRAVEL_WEIGHT,
    network: NETWORK_WEIGHT,
  };
  const interesting = POINT_SET[kind];
  const planetWeights = WEIGHT_SET[kind];

  const raw: ActivationHit[] = [];
  for (const ing of ingresses) {
    const whys = whyTransitMatters(ing.planet, ing.toSignIndex, points);
    for (const w of whys) {
      if (!interesting.has(w.pointCode)) continue;
      const baseW = planetWeights[ing.planet];
      if (baseW === undefined) continue;
      const bonus = POINT_BONUS[w.pointCode] ?? 0;

      // Dignity multiplier applied to MAGNITUDE only — preserves sign so a
      // malefic's negative weight stays negative (debilitated Saturn hurts
      // less; exalted Saturn hurts more). Retrograde scaling is consolidated
      // inside getDignityMultiplier (applyRetro is now a no-op).
      const dignity = getDignityMultiplier(ing.planet, ing.toSignIndex, ing.retrograde);
      const rawScore = (baseW + Math.sign(baseW) * bonus) * dignity;
      const weight = applyRetro(Math.round(rawScore), ing.retrograde);
      if (weight === 0) continue;

      // Surface WHY the window scored high/low so users see the dignity
      // signal in the reasoning trace (only when dignity actually shifted it).
      const dTag = dignity !== 1.0 ? dignityLabel(ing.planet, ing.toSignIndex, ing.retrograde) : null;
      const reasoningOut = dTag ? `${w.text} (${ing.planet} ${dTag})` : w.text;
      const plainOut     = dTag ? `${w.plain} (${ing.planet} ${dTag})` : w.plain;

      raw.push(makeHit(ing, w.pointCode, w.pointLabel, w.signName, weight, reasoningOut, plainOut));
    }
  }
  if (!raw.length) return [];

  raw.sort((a, b) => a.date.getTime() - b.date.getTime());
  const windows: KarmicWindow[] = [];
  let bucket: ActivationHit[] = [];
  for (const hit of raw) {
    if (!bucket.length) { bucket.push(hit); continue; }
    const first = bucket[0].date.getTime();
    if (hit.date.getTime() - first <= clusterMs) {
      bucket.push(hit);
    } else {
      pushWindow(windows, bucket, kind, minScore);
      bucket = [hit];
    }
  }
  pushWindow(windows, bucket, kind, minScore);

  windows.sort((a, b) => Math.abs(b.score) - Math.abs(a.score) || a.start.getTime() - b.start.getTime());
  return windows;
}

function pushWindow(
  windows: KarmicWindow[],
  bucket: ActivationHit[],
  kind: WindowKind,
  minScore: number,
) {
  if (!bucket.length) return;
  const score = bucket.reduce((s, h) => s + h.weight, 0);
  if (Math.abs(score) < minScore) return;
  const start = bucket[0].date;
  const end = bucket[bucket.length - 1].date;
  const grade = gradeScore(score);
  const headline = buildHeadline(bucket, kind, score);
  windows.push({ kind, start, end, score, grade, headline, hits: bucket });
}

function buildHeadline(hits: ActivationHit[], kind: WindowKind, score: number): string {
  const planets = Array.from(new Set(hits.map((h) => h.planet))).join(" + ");
  const points = Array.from(new Set(hits.map((h) => h.pointLabel))).join(", ");
  if (kind === "wealth") {
    if (score >= 14) return `Millionaire-grade wealth stack — ${planets} igniting ${points}`;
    if (score >= 8)  return `Strong wealth window — ${planets} on ${points}`;
    if (score >= 4)  return `Wealth window — ${planets} activating ${points}`;
    if (score <= -4) return `Wealth pruning phase — ${planets} testing ${points}`;
    return `Wealth-axis activity — ${planets} on ${points}`;
  }
  if (kind === "health") {
    if (score >= 14) return `High sickness-risk stretch — ${planets} hitting ${points}`;
    if (score >= 8)  return `Sickness window — likely sick / injured — ${planets} on ${points}`;
    if (score >= 4)  return `Watch your health — ${planets} stressing ${points}`;
    if (score <= -8) return `Healing / immunity window — ${planets} blessing ${points}`;
    if (score <= -4) return `Recovery support — ${planets} on ${points}`;
    return `Health-axis activity — ${planets} on ${points}`;
  }
  if (kind === "soulmate") {
    if (score >= 12) return `Peak soulmate / marriage window — ${planets} on ${points}`;
    if (score >= 7)  return `Strong relationship window — ${planets} on ${points}`;
    if (score >= 3)  return `Romance / partnership opening — ${planets} on ${points}`;
    if (score <= -3) return `Relationship pressure — ${planets} on ${points}`;
    return `Partnership-axis activity — ${planets} on ${points}`;
  }
  if (kind === "romance") {
    if (score >= 12) return `Magnetism peak — hot romance window — ${planets} on ${points}`;
    if (score >= 7)  return `Strong dating / flirtation window — ${planets} on ${points}`;
    if (score >= 3)  return `Romance opening — ${planets} on ${points}`;
    if (score <= -3) return `Dry-spell / romantic friction — ${planets} on ${points}`;
    return `Romance-axis activity — ${planets} on ${points}`;
  }
  if (kind === "power") {
    if (score >= 14) return `Coronation-grade authority stack — ${planets} on ${points}`;
    if (score >= 8)  return `Power surge — authority window — ${planets} on ${points}`;
    if (score >= 4)  return `Power activation — ${planets} on ${points}`;
    if (score <= -4) return `Power stripped / tested — ${planets} on ${points}`;
    return `Authority-axis activity — ${planets} on ${points}`;
  }
  if (kind === "influence") {
    if (score >= 14) return `Mass-influence breakthrough — ${planets} on ${points}`;
    if (score >= 8)  return `Strong influence surge — ${planets} on ${points}`;
    if (score >= 4)  return `Influence growing — ${planets} on ${points}`;
    if (score <= -4) return `Influence shrinks / followers detach — ${planets} on ${points}`;
    return `Influence-axis activity — ${planets} on ${points}`;
  }
  if (kind === "fame") {
    if (score >= 14) return `Viral fame window — ${planets} on ${points}`;
    if (score >= 8)  return `Visibility spike — fame window — ${planets} on ${points}`;
    if (score >= 4)  return `Recognition window — ${planets} on ${points}`;
    if (score <= -4) return `Reputation pressure / cancel risk — ${planets} on ${points}`;
    return `Fame-axis activity — ${planets} on ${points}`;
  }
  if (kind === "career") {
    if (score >= 14) return `Once-a-decade career breakthrough — ${planets} on ${points}`;
    if (score >= 8)  return `Strong career-advancement window — ${planets} on ${points}`;
    if (score >= 4)  return `Career activation — ${planets} on ${points}`;
    if (score <= -4) return `Career restructure / pivot pressure — ${planets} on ${points}`;
    return `Career-axis activity — ${planets} on ${points}`;
  }
  if (kind === "family") {
    if (score >= 12) return `Major family-blessing window — ${planets} on ${points}`;
    if (score >= 6)  return `Strong family / mother window — ${planets} on ${points}`;
    if (score >= 3)  return `Family warmth opening — ${planets} on ${points}`;
    if (score <= -6) return `Family strain / mother-health concern — ${planets} on ${points}`;
    if (score <= -3) return `Family friction — ${planets} on ${points}`;
    return `Family-axis activity — ${planets} on ${points}`;
  }
  if (kind === "home") {
    if (score >= 10) return `Property / real-estate gain window — ${planets} on ${points}`;
    if (score >= 4)  return `Home upgrade window — ${planets} on ${points}`;
    if (score <= -4) return `Home / property pressure — repairs, relocation, disputes — ${planets} on ${points}`;
    return `Home-axis activity — ${planets} on ${points}`;
  }
  if (kind === "children") {
    if (score >= 10) return `Children / fertility blessing — ${planets} on ${points}`;
    if (score >= 4)  return `Creativity & children opening — ${planets} on ${points}`;
    if (score <= -4) return `Children worry / creative block — ${planets} on ${points}`;
    return `Children-axis activity — ${planets} on ${points}`;
  }
  if (kind === "education") {
    if (score >= 10) return `Higher-learning / wisdom peak — ${planets} on ${points}`;
    if (score >= 4)  return `Study / certification window — ${planets} on ${points}`;
    if (score <= -4) return `Study disruption / faith tested — ${planets} on ${points}`;
    return `Education-axis activity — ${planets} on ${points}`;
  }
  if (kind === "spirituality") {
    if (score >= 10) return `Deep moksha / retreat window — ${planets} on ${points}`;
    if (score >= 4)  return `Spiritual opening — ${planets} on ${points}`;
    if (score <= -4) return `Inner restlessness / detachment pressure — ${planets} on ${points}`;
    return `Moksha-axis activity — ${planets} on ${points}`;
  }
  // travel
  if (score >= 10) return `Major travel / foreign-move window — ${planets} on ${points}`;
  if (score >= 4)  return `Travel / movement window — ${planets} on ${points}`;
  if (score <= -4) return `Travel friction / delays — ${planets} on ${points}`;
  return `Travel-axis activity — ${planets} on ${points}`;
}
