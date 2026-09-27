/**
 * HOUSE ACTIVATIONS — what each transiting planet UNLOCKS when it enters a
 * specific natal house, and which big-ticket life outcomes (Millionaire,
 * Influence, Health, Marriage, Career, Family, Spiritual, Fame, Children,
 * Property) get triggered by a transit into THIS house — with chart-specific
 * support / delay reasoning and real upcoming dates from the live ingress feed.
 */
import { houseFromAsc } from "./dignities";

const SIGN_LORD: Record<number, string> = {
  0: "Mars", 1: "Venus", 2: "Mercury", 3: "Moon", 4: "Sun", 5: "Mercury",
  6: "Venus", 7: "Mars", 8: "Jupiter", 9: "Saturn", 10: "Saturn", 11: "Jupiter",
};
import type { SignIngress } from "./transits";

// ── What each transiting planet unlocks when it enters a given house ─────────
// [planet][house-1] → one-line activation
const PLANET_HOUSE_UNLOCK: Record<string, string[]> = {
  Jupiter: [
    "Body rebuild, weight gain, optimism, new identity arc, marriage/child talk.",
    "Wealth expansion — savings grow, family income up, voice carries weight.",
    "Courage to ship, siblings help, short trips, writing/podcasting wins.",
    "Home upgrade, mother's health, property buy, deep emotional healing.",
    "Conception, creative hit, speculation pays, romance/children blessing.",
    "Job promotion, debts clear, health recovers, enemies neutralized.",
    "Marriage, soulmate contract, public deal, business partnership signed.",
    "Inheritance, occult mastery, surgery success, hidden money surfaces.",
    "BIG BREAK — fortune, guru, foreign luck, dharma activates. The wealth window.",
    "Career peak, promotion, public authority, government favor.",
    "Massive income jump, network wealth, dreams fulfilled, elder sibling gain.",
    "Foreign success, spiritual gain, expenses for noble causes, moksha hint.",
  ],
  Saturn: [
    "Slow identity overhaul, weight loss, aging visible, structural rebuild of self.",
    "Wealth tested — frugality, family duty, voice gains gravitas through hardship.",
    "Hard work pays, sibling distance, disciplined communication, slow courage build.",
    "Property delays/responsibility, mother strain, emotional weight, foundation rebuild.",
    "Romance delays, children responsibility, speculation losses, creative discipline.",
    "Job grind, debt cycle, chronic health issue surfaces, victory over enemies through grit.",
    "Marriage delay or aged partner, contract scrutiny, public reputation tested.",
    "Long crisis, occult initiation, inheritance disputes, deep transformation forced.",
    "Dharma tested, guru distance, long journey delay, fortune earned not given.",
    "Career grind — slow climb to authority, governmental burden, lasting reputation.",
    "Network grind, gains delayed but lasting, elder sibling burden, dreams demand patience.",
    "Foreign isolation, expenses mount, hospitalization risk, forced spiritual retreat.",
  ],
  Rahu: [
    "Identity obsession, sudden makeover, foreign-looking persona, ambition explosion.",
    "Sudden wealth/scam risk, family conflict, voice gains foreign flavor.",
    "Bold risky moves, sibling jealousy, viral communication, hustle on steroids.",
    "Property obsession, mother estrangement, foreign home, emotional unrest.",
    "Forbidden romance, IVF/unusual children, gambling addiction, creative obsession.",
    "Workaholic burnout, unusual disease, foreign enemies, debt explosion or clearance.",
    "Foreign/unusual partner, online marriage, deceptive deals, market obsession.",
    "Occult obsession, sudden inheritance, surgery, near-death rebirth.",
    "Foreign dharma, sudden fortune, unusual guru, viral big break.",
    "Sudden fame, scandal-prone authority, foreign career, ambition pinnacle.",
    "Sudden viral income, foreign network, dream-chasing pays huge.",
    "Foreign settlement, hidden expenses, escapism risk, spiritual ungrounding.",
  ],
  Ketu: [
    "Detachment from body/identity, spiritual awakening, weight loss, past-life vibe.",
    "Money loses meaning, family distance, voice softens, minimalist phase.",
    "Loss of courage OR fearless renunciation, sibling cut-off.",
    "Sells property, mother distant, emotional dryness, leaves home.",
    "No interest in romance/children, past-life creative gift surfaces.",
    "Health mystery, job apathy, enemies vanish, debts dissolve mysteriously.",
    "Marriage breakdown OR transcendent partnership, contract dissolves.",
    "Mystical experience, sudden inheritance and loss, near-death awakening.",
    "Loss of faith → rebirth of faith, guru leaves, foreign renunciation.",
    "Career pivot, fame fades, sudden retirement, spiritual call from authority.",
    "Income loss, network shrinks, dreams renounced for deeper truth.",
    "Final liberation, monastic phase, foreign moksha, expenses on dharma.",
  ],
  Sun: [
    "Identity blaze, ego surge, body energized, leadership moment.",
    "Income from authority, family pride, powerful voice.",
    "Courage spike, sibling conflict OR support from elders.",
    "Home tensions with father, property pride, emotional pride.",
    "Children pride, creative leadership, romance with authority figure.",
    "Workplace victory, enemies defeated, health surge.",
    "Partnership with authority, public recognition, contract signed.",
    "Hidden transformation, surgery, occult authority.",
    "Father/guru blessing, fortune from government.",
    "Career peak month, promotion, public authority blaze.",
    "Income from authority, gains through powerful network.",
    "Foreign authority, hospitalization risk, retreat for ego rebuild.",
  ],
  Moon: [
    "Emotional sensitivity, body water-retention, public mood shift.",
    "Money emotions, family closeness, food/voice focus.",
    "Emotional courage, sibling bonding, mother's communication.",
    "Home peace OR upheaval, mother time, property mood.",
    "Romance, children attention, creative mood swings.",
    "Health-emotion link, work mood, debt anxiety eases.",
    "Marriage feels, partner softness, public mood swing.",
    "Emotional crisis, hidden feelings surface, occult sensitivity.",
    "Long travel mood, faith deepens, mother's blessing.",
    "Public emotional appeal, career mood, reputation soft.",
    "Friend gatherings, income mood, dreams emotional.",
    "Sleep, retreat, hospital risk, foreign emotion.",
  ],
  Mars: [
    "Aggression, accident risk, identity fight, sexual surge.",
    "Money fight, family argument, sharp voice.",
    "Massive courage push, sibling fight or victory, bold action.",
    "Home conflict, property aggression, mother health risk.",
    "Romance heat, children risk, gambling impulse.",
    "Victory over enemies, surgery risk, debt cleared aggressively.",
    "Partnership fight or passion, contract battles.",
    "Surgery, accident, sudden inheritance, occult breakthrough.",
    "Bold journey, guru conflict, dharma activated by fight.",
    "Career aggression, promotion through battle, authority clash.",
    "Income through aggression, elder sibling conflict.",
    "Foreign aggression, hospitalization, hidden enemies.",
  ],
  Mercury: [
    "Communication, writing, identity refresh through ideas.",
    "Money from trade/communication, family talk, voice training.",
    "Sibling talk, short trips, writing/podcast hits.",
    "Home contracts, mother communication, property paperwork.",
    "Creative writing, children's intellect, romance through wit.",
    "Job through communication, health through diet, debts negotiated.",
    "Contract signed, partnership through ideas, public communication.",
    "Research, occult study, inheritance paperwork.",
    "Teaching, publishing, foreign-language gain, dharma clarified.",
    "Public communication, career via communication skill.",
    "Income from network, dreams articulated, elder sibling talk.",
    "Foreign writing, hospital communication, hidden research.",
  ],
  Venus: [
    "Beauty glow, charm, identity refresh, romance starts.",
    "Money through art/luxury, family pleasure, sweet voice.",
    "Romantic siblings, artistic communication, courage through love.",
    "Beautiful home, mother's joy, property luxury, emotional bliss.",
    "Romance peak, children joy, creative explosion, fertility window.",
    "Pleasant work, health glow, enemies turned friends, debts forgiven.",
    "MARRIAGE WINDOW, partner joy, beautiful contracts.",
    "Hidden romance, occult through art, inherited beauty.",
    "Romantic travel, foreign love, dharma through pleasure.",
    "Career through art/beauty, public charm, reputation glow.",
    "Income through luxury, network of beautiful people.",
    "Foreign romance, retreat with partner, indulgent expenses.",
  ],
};

// ── Outcome triggers — what unlocks WHICH life outcome from a transit into THIS house ──
export interface OutcomeTrigger {
  outcome: string;
  /** Which transiting planet acts as the primary trigger when in this house. */
  planet: string;
  /** Plain-English why this combo activates the outcome. */
  why: string;
}

// Map: house (1..12) → list of outcomes activated when specific transits enter that house
const HOUSE_OUTCOME_TRIGGERS: Record<number, OutcomeTrigger[]> = {
  1: [
    { outcome: "Body Rebuild", planet: "Jupiter", why: "Jupiter on Lagna grows the body, energy, and confidence — full identity refresh." },
    { outcome: "Identity Reset", planet: "Saturn", why: "Saturn on Lagna strips ego and forces a structural rebuild of who you are." },
  ],
  2: [
    { outcome: "Earned Wealth Surge", planet: "Jupiter", why: "Jupiter in 2H expands savings, family money, and earned income directly." },
    { outcome: "Family Healing", planet: "Venus", why: "Venus in 2H sweetens family bonds and brings pleasure money." },
  ],
  3: [
    { outcome: "Hustle Breakthrough", planet: "Mars", why: "Mars in 3H is courage and self-made action — the warrior's launch." },
    { outcome: "Viral Voice", planet: "Mercury", why: "Mercury in 3H amplifies writing, podcasting, and short-form communication." },
  ],
  4: [
    { outcome: "Property Buy", planet: "Jupiter", why: "Jupiter in 4H gifts real estate, home upgrades, and lasting roots." },
    { outcome: "Mother's Health", planet: "Saturn", why: "Saturn in 4H tests the mother and forces foundation rebuild." },
    { outcome: "Emotional Peace", planet: "Moon", why: "Moon in 4H is home — emotional equilibrium and inner calm." },
  ],
  5: [
    { outcome: "Conception / Children", planet: "Jupiter", why: "Jupiter in 5H is the classical fertility and child-blessing transit." },
    { outcome: "Creative Hit", planet: "Venus", why: "Venus in 5H explodes creative output and romance simultaneously." },
    { outcome: "Speculation Profit", planet: "Jupiter", why: "Jupiter in 5H makes risk-taking pay — investments and bets land." },
  ],
  6: [
    { outcome: "Health Recovery", planet: "Jupiter", why: "Jupiter in 6H destroys disease, debt, and enemies — the healer's transit." },
    { outcome: "Enemy Defeat", planet: "Mars", why: "Mars in 6H is the warrior crushing rivals, lawsuits, and obstacles." },
    { outcome: "Debt Clearance", planet: "Jupiter", why: "Jupiter in 6H resolves financial obligations and frees you from owing." },
  ],
  7: [
    { outcome: "Marriage", planet: "Jupiter", why: "Jupiter in 7H is the strongest marriage-activator in Vedic astrology." },
    { outcome: "Marriage", planet: "Venus", why: "Venus in 7H — partnership, romance, and contract joy peak." },
    { outcome: "Public Deal", planet: "Sun", why: "Sun in 7H brings authority figures, public contracts, and recognition." },
  ],
  8: [
    { outcome: "Inheritance / Hidden Money", planet: "Jupiter", why: "Jupiter in 8H surfaces inheritance, insurance, joint funds, and tax wins." },
    { outcome: "Surgery / Transformation", planet: "Mars", why: "Mars in 8H is the surgeon — successful operations, near-death rebirth." },
    { outcome: "Occult Mastery", planet: "Saturn", why: "Saturn in 8H slow-cooks deep transformation and mystical knowledge." },
  ],
  9: [
    { outcome: "MILLIONAIRE WINDOW", planet: "Jupiter", why: "Jupiter in 9H is the SINGLE strongest fortune transit — dharma, guru, big-break, foreign luck. This is THE wealth activator." },
    { outcome: "Higher Education", planet: "Jupiter", why: "Jupiter in 9H opens universities, PhDs, certifications, teacher relationships." },
    { outcome: "Foreign Move", planet: "Rahu", why: "Rahu in 9H pulls toward foreign lands, unusual gurus, and sudden fortune." },
  ],
  10: [
    { outcome: "Career Peak / Promotion", planet: "Jupiter", why: "Jupiter in 10H is promotion, authority blessing, ethical career rise." },
    { outcome: "Reputation Build", planet: "Saturn", why: "Saturn in 10H grinds a slow but lasting career foundation — the CEO climb." },
    { outcome: "Fame", planet: "Sun", why: "Sun in 10H blazes the spotlight — public authority, government favor." },
    { outcome: "Sudden Fame", planet: "Rahu", why: "Rahu in 10H triggers viral fame, mainstream breakthrough, and ambition pinnacle." },
  ],
  11: [
    { outcome: "Income Jump", planet: "Jupiter", why: "Jupiter in 11H is massive income, network wealth, and fulfilled desires." },
    { outcome: "Influence / Network", planet: "Rahu", why: "Rahu in 11H is the influencer transit — viral following, foreign network, ambition reward." },
    { outcome: "Dream Fulfillment", planet: "Jupiter", why: "Jupiter in 11H delivers long-held desires — the gains-house king." },
  ],
  12: [
    { outcome: "Spiritual Awakening", planet: "Jupiter", why: "Jupiter in 12H is moksha — meditation, foreign spiritual wins, monastic gain." },
    { outcome: "Foreign Settlement", planet: "Rahu", why: "Rahu in 12H pulls toward foreign lands, hidden gains, expat life." },
    { outcome: "Final Liberation", planet: "Ketu", why: "Ketu in 12H is moksha exit — past-life karma resolves, spiritual completion." },
  ],
};

// ── Chart support analysis ──────────────────────────────────────────────────
export interface ChartContext {
  ascendant: number;
  planets: Array<{ name: string; sid: number; retrograde: boolean }>;
}

function planetNatalHouse(name: string, ctx: ChartContext): number | null {
  const p = ctx.planets.find((x) => x.name === name);
  if (!p) return null;
  return houseFromAsc(p.sid, ctx.ascendant);
}

/** Sign in which the lord of a given natal house sits. */
function lordNatalHouseOf(houseNum: number, ctx: ChartContext): number | null {
  const ascSign = Math.floor(((ctx.ascendant % 360) + 360) % 360 / 30);
  const houseSign = (ascSign + (houseNum - 1)) % 12;
  const lordName = SIGN_LORD[houseSign];
  if (!lordName) return null;
  return planetNatalHouse(lordName, ctx);
}

/** Generate chart-specific reasoning for an outcome trigger. */
export function chartSupportFor(
  houseNum: number,
  trigger: OutcomeTrigger,
  ctx: ChartContext,
): { verdict: "supported" | "delayed" | "amplified" | "blocked" | "neutral"; reason: string } {
  const saturnH = planetNatalHouse("Saturn", ctx);
  const jupiterH = planetNatalHouse("Jupiter", ctx);
  const rahuH = planetNatalHouse("Rahu", ctx);
  const ketuH = planetNatalHouse("Ketu", ctx);
  const triggerPlanetNatalH = planetNatalHouse(trigger.planet, ctx);
  const lordH = lordNatalHouseOf(houseNum, ctx);

  // Saturn 7th-aspect or conjunction on the target house = delay
  const saturnAspects = (from: number, to: number) =>
    from > 0 && (from === to || (from + 6) % 12 + 1 === to || (from + 2) % 12 + 1 === to || (from + 9) % 12 + 1 === to);
  // Jupiter 5th/9th aspect = amplification
  const jupiterAspects = (from: number, to: number) =>
    from > 0 && (from === to || (from + 4) % 12 + 1 === to || (from + 8) % 12 + 1 === to);

  if (saturnH && saturnAspects(saturnH, houseNum) && saturnH !== houseNum) {
    return {
      verdict: "delayed",
      reason: `Your natal Saturn in House ${saturnH} aspects this house — outcome arrives but only after patience and earned effort. Rewards are delayed but durable.`,
    };
  }
  if (saturnH === houseNum) {
    return {
      verdict: "delayed",
      reason: `Your natal Saturn sits IN House ${houseNum} — this entire life-area is karmically slow but builds lasting structure. Expect a "late bloomer" pattern here.`,
    };
  }
  if (jupiterH && jupiterAspects(jupiterH, houseNum)) {
    return {
      verdict: "amplified",
      reason: `Your natal Jupiter in House ${jupiterH} aspects this house — outcome is magnified by guru-grace. When the transit hits, expect outsized results.`,
    };
  }
  if (lordH && [1, 4, 5, 7, 9, 10, 11].includes(lordH)) {
    return {
      verdict: "supported",
      reason: `The lord of House ${houseNum} sits in your House ${lordH} (a strong kendra/trikona/upachaya position) — your chart is wired to deliver on this outcome.`,
    };
  }
  if (lordH && [6, 8, 12].includes(lordH)) {
    return {
      verdict: "blocked",
      reason: `The lord of House ${houseNum} sits in your House ${lordH} (a dusthana position) — outcome is fragile and requires the transit to fight uphill.`,
    };
  }
  if (rahuH === houseNum) {
    return {
      verdict: "amplified",
      reason: `Natal Rahu in House ${houseNum} obsessively amplifies this life-area — outcome arrives big, foreign-flavored, or unexpectedly viral.`,
    };
  }
  if (ketuH === houseNum) {
    return {
      verdict: "neutral",
      reason: `Natal Ketu in House ${houseNum} dilutes the material reward of this house — outcome comes but feels detached or spiritual rather than worldly.`,
    };
  }
  if (triggerPlanetNatalH && [1, 4, 5, 7, 9, 10, 11].includes(triggerPlanetNatalH)) {
    return {
      verdict: "supported",
      reason: `Your natal ${trigger.planet} sits in House ${triggerPlanetNatalH} (strong position) — when it transits House ${houseNum}, it carries this strength into the activation.`,
    };
  }
  return {
    verdict: "neutral",
    reason: `No major natal aspect locks this trigger — outcome activates at standard strength when the transit hits.`,
  };
}

// ── Next-ingress lookup ─────────────────────────────────────────────────────
/** Find the next ingress that puts `planet` into the given natal house. */
export function nextIngressIntoHouse(
  ingresses: SignIngress[] | null | undefined,
  planet: string,
  house: number,
  fromDate: Date = new Date(),
): SignIngress | null {
  if (!ingresses?.length) return null;
  const fromMs = fromDate.getTime();
  for (const ing of ingresses) {
    if (ing.planet !== planet) continue;
    if (ing.natalHouse !== house) continue;
    if (ing.date.getTime() < fromMs) continue;
    return ing;
  }
  return null;
}

/** Whether a planet is CURRENTLY transiting the given house (last ingress before now into this house). */
export function isCurrentlyTransiting(
  ingresses: SignIngress[] | null | undefined,
  planet: string,
  house: number,
  asOf: Date = new Date(),
): SignIngress | null {
  if (!ingresses?.length) return null;
  const asOfMs = asOf.getTime();
  // Find the latest ingress for this planet at or before asOf
  let latest: SignIngress | null = null;
  for (const ing of ingresses) {
    if (ing.planet !== planet) continue;
    if (ing.date.getTime() > asOfMs) break; // ingresses are time-sorted per-planet upstream
    latest = ing;
  }
  if (latest && latest.natalHouse === house) return latest;
  return null;
}

// ── Public API ─────────────────────────────────────────────────────────────
export interface HouseActivation {
  planetUnlocks: Array<{ planet: string; effect: string }>;
  outcomes: Array<{
    outcome: string;
    planet: string;
    why: string;
    chartVerdict: "supported" | "delayed" | "amplified" | "blocked" | "neutral";
    chartReason: string;
    nextDate: Date | null;
    currentlyActive: boolean;
  }>;
}

export function buildHouseActivation(
  house: number,
  ctx: ChartContext,
  ingresses: SignIngress[] | null | undefined,
): HouseActivation {
  const planets = ["Jupiter", "Saturn", "Rahu", "Ketu", "Sun", "Moon", "Mars", "Mercury", "Venus"];
  const planetUnlocks = planets.map((p) => ({
    planet: p,
    effect: PLANET_HOUSE_UNLOCK[p]?.[house - 1] ?? "—",
  }));
  const triggers = HOUSE_OUTCOME_TRIGGERS[house] ?? [];
  const outcomes = triggers.map((t) => {
    const support = chartSupportFor(house, t, ctx);
    const next = nextIngressIntoHouse(ingresses, t.planet, house);
    const current = isCurrentlyTransiting(ingresses, t.planet, house);
    return {
      outcome: t.outcome,
      planet: t.planet,
      why: t.why,
      chartVerdict: support.verdict,
      chartReason: support.reason,
      nextDate: next?.date ?? null,
      currentlyActive: !!current,
    };
  });
  return { planetUnlocks, outcomes };
}
