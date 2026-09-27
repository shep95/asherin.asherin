/**
 * SENSITIVE POINTS — chart-specific anchors that determine WHY a transit matters.
 *
 * A transit reading without these is generic ("Jupiter in 9th = luck").
 * With these we can say: "Jupiter is walking into Cancer — the sign of your
 * Upapada Lagna. Jupiter activating UL = spouse manifestation window."
 *
 * Sensitive points we compute from the natal chart:
 *   - Lagna (Ascendant sign)
 *   - Chandra Lagna (Moon sign)
 *   - Surya Lagna (Sun sign)
 *   - Atmakaraka (AK)  — soul-mission planet (highest deg-in-sign)
 *   - Darakaraka (DK)  — spouse-significator (lowest deg-in-sign)
 *   - Upapada Lagna (UL) — Jaimini spouse point
 *   - L2 (Dhana), L5 (Purva Punya), L6 (Roga), L7 (Partner), L8 (Ayur), L9
 *     (Bhagya), L11 (Labha), L12 (Vyaya) — sign currently occupied by the
 *     respective house-lord from Lagna.
 */

import type { SweVedicPlanet } from "./sweChart";
import { rashis } from "@/data/nakshatraData";

// 0=Aries, 1=Taurus, ..., 11=Pisces
const SIGN_LORD: Record<number, string> = {
  0: "Mars", 1: "Venus", 2: "Mercury", 3: "Moon", 4: "Sun",
  5: "Mercury", 6: "Venus", 7: "Mars", 8: "Jupiter",
  9: "Saturn", 10: "Saturn", 11: "Jupiter",
};

export type PointCode =
  | "Lagna" | "Chandra" | "Surya" | "AK" | "DK" | "UL" | "L7"
  | "L2" | "L5" | "L9" | "L11"
  | "L6" | "L8" | "L12"
  | "L10" | "L3" | "L4";

export interface SensitivePoint {
  code: PointCode;
  label: string;
  signIndex: number;
  signName: string;
  /** Plain-English description of what this point IS in your chart. */
  explanation: string;
  /** Dead-simple, no-jargon version of `explanation`. */
  plainExplanation: string;
}

export interface SensitivePoints {
  byCode: Record<PointCode, SensitivePoint>;
  bySign: Map<number, SensitivePoint[]>;
}

function signOf(deg: number) { return Math.floor(((deg % 360) + 360) % 360 / 30); }
function degInSign(deg: number) { return ((deg % 30) + 30) % 30; }

export function computeSensitivePoints(planets: SweVedicPlanet[], ascendant: number): SensitivePoints {
  const ascSign = signOf(ascendant);
  const moon = planets.find((p) => p.name === "Moon");
  const sun  = planets.find((p) => p.name === "Sun");
  const moonSign = moon ? signOf(moon.sid) : ascSign;
  const sunSign  = sun ? signOf(sun.sid) : ascSign;

  const karakaCandidates = planets.filter((p) =>
    ["Sun","Moon","Mars","Mercury","Jupiter","Venus","Saturn"].includes(p.name)
  );
  const sorted = [...karakaCandidates].sort((a, b) => degInSign(b.sid) - degInSign(a.sid));
  const ak = sorted[0];
  const dk = sorted[sorted.length - 1];

  const sign2 = (ascSign + 1) % 12;
  const lord2Name = SIGN_LORD[sign2];
  const lord2Planet = planets.find((p) => p.name === lord2Name);
  const lord2Sign = lord2Planet ? signOf(lord2Planet.sid) : sign2;
  const ulSign = (lord2Sign + 11) % 12;

  const lordSignOfHouse = (houseN: number): number => {
    const sign = (ascSign + (houseN - 1)) % 12;
    const lordName = SIGN_LORD[sign];
    const lordPlanet = planets.find((p) => p.name === lordName);
    return lordPlanet ? signOf(lordPlanet.sid) : sign;
  };
  const lord3Sign = lordSignOfHouse(3);
  const lord4Sign = lordSignOfHouse(4);
  const lord5Sign = lordSignOfHouse(5);
  const lord6Sign = lordSignOfHouse(6);
  const lord7Sign = lordSignOfHouse(7);
  const lord8Sign = lordSignOfHouse(8);
  const lord9Sign = lordSignOfHouse(9);
  const lord10Sign = lordSignOfHouse(10);
  const lord11Sign = lordSignOfHouse(11);
  const lord12Sign = lordSignOfHouse(12);

  const mk = (code: PointCode, label: string, signIndex: number, explanation: string, plainExplanation: string): SensitivePoint => ({
    code, label, signIndex, signName: rashis[signIndex].name, explanation, plainExplanation,
  });

  const byCode: Record<PointCode, SensitivePoint> = {
    Lagna:   mk("Lagna",   "Ascendant (Lagna)", ascSign,
                "The sign rising at your birth — directly your body, identity, vitality, and how the world meets you.",
                "Your body and how the world sees you."),
    Chandra: mk("Chandra", "Moon Sign (Chandra Lagna)", moonSign,
                "Where your Moon sits — emotional weather, the daily mind, mother, public-facing comfort.",
                "Your mind and emotions."),
    Surya:   mk("Surya",   "Sun Sign (Surya Lagna)", sunSign,
                "Where your Sun sits — soul-vitality, ego, father, authority signature.",
                "Your vitality, ego, and 'main character' energy."),
    AK:      mk("AK", `Atmakaraka — ${ak?.name ?? "—"}`, ak ? signOf(ak.sid) : ascSign,
                `Your Atmakaraka is ${ak?.name ?? "—"} — the planet that took the highest degree at your birth. It carries the deepest agenda of this incarnation.`,
                "The single point that drives your life-mission."),
    DK:      mk("DK", `Darakaraka — ${dk?.name ?? "—"}`, dk ? signOf(dk.sid) : ascSign,
                `Your Darakaraka is ${dk?.name ?? "—"} — the planet at the lowest degree. Describes the nature of your spouse / serious partner.`,
                "The point that describes your future spouse."),
    UL:      mk("UL", "Upapada Lagna (UL)", ulSign,
                "The Upapada Lagna is the most precise spouse / soulmate indicator in Jaimini astrology. When a planet (especially Jupiter or Venus) transits this sign, the energy of your spouse gets lit up in real life.",
                "Where your soulmate 'lives' on the chart."),
    L7:      mk("L7", "Lord of 7th", lord7Sign,
                "The sign where your 7th-house lord currently resides — the field where partnerships and marriage actually play out for you.",
                "Where your relationships actually play out."),
    L2:      mk("L2", "Lord of 2nd (Dhana)", lord2Sign,
                "Sign where your 2nd-house lord (accumulated wealth, savings, family money) currently lives.",
                "Your savings and family money vault."),
    L5:      mk("L5", "Lord of 5th (Purva Punya)", lord5Sign,
                "Sign where your 5th-house lord (past-life merit, speculation, creativity, children) lives.",
                "Your luck, creativity, and speculation wins."),
    L9:      mk("L9", "Lord of 9th (Bhagya)", lord9Sign,
                "Sign where your 9th-house lord (fortune, dharma, divine grace) lives — the single most important wealth-luck axis.",
                "Your fortune engine — luck, sponsors, big breaks."),
    L11:     mk("L11", "Lord of 11th (Labha)", lord11Sign,
                "Sign where your 11th-house lord (large gains, network income, fulfilment of desires) lives.",
                "Your big-payout, network-income channel."),
    L6:      mk("L6", "Lord of 6th (Roga)", lord6Sign,
                "Sign where your 6th-house lord (disease, debts, enemies, daily work) lives. The classical 'sickness house' lord.",
                "Your disease/illness channel."),
    L8:      mk("L8", "Lord of 8th (Ayur)", lord8Sign,
                "Sign where your 8th-house lord (chronic illness, surgery, sudden events, longevity) lives.",
                "Your chronic illness / surgery / sudden-event channel."),
    L12:     mk("L12", "Lord of 12th (Vyaya)", lord12Sign,
                "Sign where your 12th-house lord (hospitalization, hidden enemies, isolation, expenses) lives.",
                "Your hospitalization / bed-rest channel."),
    L10:     mk("L10", "Lord of 10th (Karma)", lord10Sign,
                "Sign where your 10th-house lord (career, public status, authority, command, the throne) currently lives. The single most important point for power, fame, and career.",
                "Your career, status, and 'authority' throne."),
    L3:      mk("L3", "Lord of 3rd (Parakrama)", lord3Sign,
                "Sign where your 3rd-house lord (courage, self-effort, communication, content, short trips) lives.",
                "Your courage, communication, and 'reach' channel."),
    L4:      mk("L4", "Lord of 4th (Sukha)", lord4Sign,
                "Sign where your 4th-house lord (mother, home, property, vehicles, inner peace, foundational education) currently lives.",
                "Your home, family roots, property, and peace of mind."),
  };

  const bySign = new Map<number, SensitivePoint[]>();
  for (const sp of Object.values(byCode)) {
    const list = bySign.get(sp.signIndex) ?? [];
    list.push(sp);
    bySign.set(sp.signIndex, list);
  }
  return { byCode, bySign };
}

// ── Why-this-matters narrative (NERDY) and plain-English (DUMB-IT-DOWN) ──
const COMBO_REASON: Record<string, string> = {
  // Jupiter
  "Jupiter|UL":      "Jupiter is the planet of manifestation and blessing. Your Upapada Lagna is the spouse-point. Jupiter walking through this sign = the spouse energy in your chart is being illuminated in real life. Strongest spouse-arrival window of the cycle.",
  "Jupiter|DK":      "Jupiter is now in the sign of your Darakaraka — your spouse-significator. Marriage-quality opportunities, introductions, or the deepening of an existing partnership become possible.",
  "Jupiter|L7":      "Jupiter is transiting the sign your 7th-house lord lives in. The 'partnership theater' of your chart is being expanded and blessed.",
  "Jupiter|Lagna":   "Jupiter is on your Ascendant sign — body, identity, presence. People perceive you as more trustworthy, larger, wiser.",
  "Jupiter|Chandra": "Jupiter is transiting your Moon sign. Emotional expansion, peace, optimism. Classically one of the most fortunate Jupiter transits.",
  "Jupiter|Surya":   "Jupiter is on your Sun sign — recognition, authority, father, dharma. Career visibility tied to purpose grows.",
  "Jupiter|AK":      "Jupiter is in the sign of your Atmakaraka. Your soul-mission gets divine wind.",

  // Venus
  "Venus|UL":     "Venus is on your Upapada Lagna sign — pure romantic activation of the spouse-point.",
  "Venus|DK":     "Venus is in the sign of your Darakaraka — high romantic-magnetism window.",
  "Venus|L7":     "Venus is in the sign where your 7th-lord lives — partnership pleasure and harmony.",
  "Venus|Lagna":  "Venus on your Ascendant sign — beauty, magnetism, body looks better.",
  "Venus|Chandra":"Venus on your Moon sign — emotional sweetness, indulgence, comfort.",

  // Saturn
  "Saturn|Chandra":"Saturn is transiting your Moon sign. Heart of Sade Sati — 7.5-year karmic pressure cycle on your mind and public life.",
  "Saturn|Lagna":  "Saturn is on your Ascendant sign — body and identity get pressure-tested.",
  "Saturn|UL":     "Saturn is in your Upapada Lagna sign. Spouse / serious partnership matters slow down or get karmically pruned.",
  "Saturn|DK":     "Saturn is in your Darakaraka sign — testing partnership karma.",
  "Saturn|L7":     "Saturn is in the sign where your 7th-lord lives. Partnerships demand maturity and commitment.",
  "Saturn|AK":     "Saturn is on your Atmakaraka — soul-purpose is being structurally rebuilt.",

  // Rahu
  "Rahu|UL":     "Rahu is on your Upapada Lagna. Spouse arrival becomes unusual, foreign, online, or outside your normal circle.",
  "Rahu|DK":     "Rahu is in your Darakaraka sign — magnetic, obsessive, unconventional pull toward partnership.",
  "Rahu|AK":     "Rahu is on your Atmakaraka — soul-mission gets a Rahu-style amplifier: ambition, foreign opportunities, illusion.",
  "Rahu|Lagna":  "Rahu on your Ascendant — identity goes through a metamorphosis.",
  "Rahu|Chandra":"Rahu on your Moon sign — mind under foreign / obsessive influence. Sleep disrupted, cravings rise.",

  // Ketu
  "Ketu|UL":     "Ketu in your Upapada Lagna — detachment from spouse-themes.",
  "Ketu|DK":     "Ketu in your Darakaraka sign — partnerships feel hollow or finish a karmic chapter.",
  "Ketu|AK":     "Ketu on your Atmakaraka — moksha pressure. Soul wants to drop the role it's playing.",
  "Ketu|Lagna":  "Ketu on your Ascendant — identity dissolves quietly.",
  "Ketu|Chandra":"Ketu on your Moon sign — emotional detachment, confusion, isolation pull.",

  // Mars
  "Mars|Lagna":  "Mars on your Ascendant — physical drive, courage, also short fuse and accident risk.",
  "Mars|UL":     "Mars in your Upapada Lagna — passion in spouse-matters, also conflict.",

  // Sun / Moon return points
  "Sun|Lagna":   "Sun on your Ascendant sign — visibility, authority, ego forward.",
  "Sun|Surya":   "Sun returns to its natal sign — your annual 'solar return' field. Reset point.",
  "Moon|Chandra":"Moon returns to your natal Moon sign — emotional 'home', ~2.5-day peak intuition.",

  // ── WEALTH AXIS ──
  "Jupiter|L9":  "Jupiter is now in the sign of your 9th-lord (Bhagya). Single strongest fortune-activator in Vedic astrology. Millionaire-grade timing.",
  "Jupiter|L11": "Jupiter is in the sign of your 11th-lord (Labha). Income/large-gains house being expanded by the wealth-karaka. Top-tier wealth window.",
  "Jupiter|L2":  "Jupiter is in the sign of your 2nd-lord (Dhana). Vault of accumulated wealth expanded by wealth-karaka.",
  "Jupiter|L5":  "Jupiter is in the sign of your 5th-lord (Purva Punya). Past-life merit cashes in — speculative wins.",
  "Venus|L11":   "Venus is in the sign of your 11th-lord. Network-driven income, luxurious payouts.",
  "Venus|L2":    "Venus on your 2nd-lord sign — money through beauty, art, partnerships, family.",
  "Venus|L9":    "Venus is in the sign of your 9th-lord. Lucky money through travel, foreign sources, sponsors.",
  "Rahu|L11":    "Rahu in the sign of your 11th-lord — explosive, unconventional gains. Crypto, viral income, sudden jackpots.",
  "Rahu|L9":     "Rahu on your 9th-lord sign — fortune through unusual / foreign / breakthrough channels.",
  "Rahu|L2":     "Rahu in your 2nd-lord sign — speculative wealth, hidden/foreign income.",
  "Saturn|L11":  "Saturn in your 11th-lord sign. Income matures through structure and hard work.",
  "Saturn|L2":   "Saturn in your 2nd-lord sign — savings get pruned and disciplined.",
  "Saturn|L9":   "Saturn on your 9th-lord — luck slows; fortune comes through karmic effort.",
  "Ketu|L11":    "Ketu in your 11th-lord sign — income channels cut off or detached from.",

  // ── HEALTH / SICKNESS AXIS ──
  "Saturn|L6":  "Saturn is in the sign of your 6th-lord (Roga — disease). Saturn slows the disease-house engine: chronic, dragging illnesses (joints, bones, digestion). Recovery is slow.",
  "Saturn|L8":  "Saturn on your 8th-lord (Ayur — chronic illness, surgery). Long-running issue surfaces or worsens. Test, treat, don't ignore.",
  "Saturn|L12": "Saturn on your 12th-lord (Vyaya — hospitalization, bed-rest). Risk of hospital stays, isolation, surgeries needing recovery time.",

  "Mars|L6":   "Mars on your 6th-lord — sudden inflammation, fevers, infections, sports injuries, blood/heat issues.",
  "Mars|L8":   "Mars on your 8th-lord — accident risk, surgical events, sudden acute pain. Drive carefully.",
  "Mars|L12":  "Mars on your 12th-lord — risk of ER visits, accidents requiring isolation/recovery.",

  "Rahu|L6":  "Rahu on your 6th-lord — strange, hard-to-diagnose illnesses, allergies, food poisoning, foreign infections.",
  "Rahu|L8":  "Rahu on your 8th-lord — sudden weird health events, toxins, hidden conditions surfacing.",
  "Rahu|L12": "Rahu on your 12th-lord — sleep disorders, mysterious hospitalizations, foreign-soil illness.",

  "Ketu|L6":  "Ketu on your 6th-lord — old illness suddenly disappears OR cryptic chronic condition emerges. Either-or.",
  "Ketu|L8":  "Ketu on your 8th-lord — surgical events, severance illnesses, energy detachment.",
  "Ketu|L12": "Ketu on your 12th-lord — hospital stays, isolation, withdrawal, energy collapse.",

  // ── POWER / CAREER / FAME / INFLUENCE AXIS (L10 = throne, Lagna = body of authority) ──
  "Jupiter|L10": "Jupiter on your 10th-lord (Karma — career/status). Blessing the career-throne. Promotions, sponsors, mentor-elders backing your rise. Classical 'kingmaker' transit.",
  "Saturn|L10":  "Saturn on your 10th-lord. Career restructures under pressure. The slow, real climb to authority — you earn the chair through discipline, not luck.",
  "Sun|L10":     "Sun on your 10th-lord. The king-planet ignites your career-throne. Visibility from authority figures, performance reviews land in your favor.",
  "Mars|L10":    "Mars on your 10th-lord. Aggressive career pushes. Wins through force; risk of clashes with bosses or sudden role changes.",
  "Mercury|L10": "Mercury on your 10th-lord. Career through contracts, communication, deals, media, code. Negotiation window.",
  "Venus|L10":   "Venus on your 10th-lord. Career through charm, art, beauty, design, partnerships, women-led networks.",
  "Rahu|L10":    "Rahu on your 10th-lord. Status explodes — viral, foreign, unconventional rise. Massive leap energy. Watch for the inevitable correction.",
  "Ketu|L10":    "Ketu on your 10th-lord. Career detaches. Walking away from a role, retirement, role becomes hollow. Pivot phase.",
  "Moon|L10":    "Moon on your 10th-lord. Public-facing career moment. Public mood swings affect your work and reputation.",

  "Jupiter|L3":  "Jupiter on your 3rd-lord (Parakrama — courage/voice/content). Self-effort multiplies. Writing, speaking, content reach grows.",
  "Rahu|L3":     "Rahu on your 3rd-lord. Mass communication channel cracks open — viral content, foreign reach, bold self-promotion.",
  "Mars|L3":     "Mars on your 3rd-lord. Aggressive output, hustle mode, courage to ship and confront.",
  "Mercury|L3":  "Mercury on your 3rd-lord. Writing/speaking/coding clarity peak. Negotiation and short-trip wins.",

  // Influence/fame extras on Surya and Lagna
  "Rahu|Surya":  "Rahu on your Sun sign. Identity/authority gets amplified to a mass audience. Fame risk + scandal risk both rise.",
  "Sun|L11":     "Sun on your 11th-lord. Authority brings income through your network. Recognition translates to gains.",
  // "Jupiter|Surya" already defined above (line 163) — keep the earlier reading
};

const COMBO_PLAIN: Record<string, string> = {
  // Soulmate / love
  "Jupiter|UL":  "Your soulmate gets activated. This is the strongest 'meet your person' window of the cycle.",
  "Jupiter|DK":  "Marriage-quality people show up. Introductions, deep partnership upgrades.",
  "Jupiter|L7":  "Your relationships get blessed and expand. Proposals, deals, alliances.",
  "Jupiter|Lagna":"You glow. People trust you more. Looks bigger, wiser, more credible.",
  "Jupiter|Chandra":"Mind feels light. Hope returns. One of the happiest periods possible.",
  "Jupiter|Surya":"Recognition and authority grow — especially tied to your real purpose.",
  "Jupiter|AK":  "Your life-mission gets a tailwind from the universe.",
  "Venus|UL":    "Romance lights up your soulmate point. Magnetism is loud.",
  "Venus|DK":    "Strong romantic-magnetism phase. The 'spouse signal' is on.",
  "Venus|L7":    "Relationships feel good, easy, harmonious.",
  "Venus|Lagna": "You look more attractive. People are drawn to you physically.",
  "Venus|Chandra":"Emotional sweetness, comfort, indulgence.",

  // Saturn pressure
  "Saturn|Chandra":"Heavy mental period (Sade Sati core). Slow grind on mood and public life for years.",
  "Saturn|Lagna":"Body and identity get stress-tested. Feel older, heavier, more responsible.",
  "Saturn|UL":   "Marriage/soulmate stuff slows down or gets serious and karmic.",
  "Saturn|DK":   "Existing relationship is tested. New ones come with duty or age.",
  "Saturn|L7":   "Partnerships demand maturity and real commitment.",
  "Saturn|AK":   "Life-purpose is being slowly rebuilt — hard but real.",

  // Rahu / Ketu mind
  "Rahu|UL":   "Soulmate arrival is weird — foreign, online, unusual. Intense but confusing — verify.",
  "Rahu|DK":   "Obsessive, magnetic pull toward someone. Watch projection.",
  "Rahu|AK":   "Massive ambition boost. Big leap energy — also illusion risk.",
  "Rahu|Lagna":"Identity reinvention. New look, new circle, can feel 'not yourself'.",
  "Rahu|Chandra":"Mind goes loud. Sleep off, cravings up, intuition noisy.",
  "Ketu|UL":   "Spouse themes quietly detach. Not a window to push for marriage.",
  "Ketu|DK":   "Relationships feel hollow or a karmic chapter ends.",
  "Ketu|AK":   "Worldly ambition feels empty. Spiritual breakthroughs possible.",
  "Ketu|Lagna":"Identity dissolves. Stop caring about appearances. Withdrawal phase.",
  "Ketu|Chandra":"Emotionally detached. Confusion, isolation pull. Lean on practice.",

  // Mars / Sun / Moon
  "Mars|Lagna": "High drive but short fuse and accident risk. Move bodies, not arguments.",
  "Mars|UL":    "Passion + conflict in relationships. Handle carefully.",
  "Sun|Lagna":  "You're more visible. Authority forward — people see you.",
  "Sun|Surya":  "Your yearly solar reset. Vitality and direction recalibrate.",
  "Moon|Chandra":"Emotional 'home' return for ~2.5 days. Peak intuition.",

  // Wealth — keep concrete
  "Jupiter|L9":  "Biggest fortune window in the entire system. Sponsors, gurus, huge lucky breaks. Millionaire-grade timing.",
  "Jupiter|L11": "Income engine ignites. Pay rises, big payouts, network unlocks money.",
  "Jupiter|L2":  "Savings and family money grow. Assets enter your name.",
  "Jupiter|L5":  "Lucky breaks and speculation wins — past-life credit cashes in.",
  "Venus|L11":   "Income through network, beauty, art, women. Steady gains.",
  "Venus|L2":    "Money flows through art, beauty, partnerships, family.",
  "Venus|L9":    "Lucky money via travel, foreign sources, or sponsors.",
  "Rahu|L11":    "Explosive unconventional gains — crypto, viral income, sudden jackpots. Huge upside, huge volatility — exit clean.",
  "Rahu|L9":     "Fortune through unusual or foreign breakthrough channels. Verify everything.",
  "Rahu|L2":     "Speculative wealth, hidden or foreign income. Big but unstable.",
  "Saturn|L11":  "Slow, real long-term income through structure and contracts. Not get-rich-quick.",
  "Saturn|L2":   "Savings get pruned. Forced frugality builds the foundation.",
  "Saturn|L9":   "Luck slows down. Have to earn fortune through karmic effort.",
  "Ketu|L11":    "Old income streams may cut off. Not a wealth-building window.",

  // Health / sickness
  "Saturn|L6":  "Watch for chronic, dragging illness this stretch — joints, bones, digestion. Recovery will be slow if you ignore it. Get checkups.",
  "Saturn|L8":  "Long-running health issue could surface or worsen. Don't postpone tests or treatment.",
  "Saturn|L12": "Risk of hospital stays, surgeries, or forced bed-rest in this window.",
  "Mars|L6":   "Sudden fevers, infections, inflammation, or sports injuries possible. Don't push the body recklessly.",
  "Mars|L8":   "Elevated accident or surgery risk. Drive carefully, avoid reckless stunts.",
  "Mars|L12":  "Risk of ER visits or accidents that need recovery time.",
  "Rahu|L6":   "Strange, hard-to-diagnose stuff — allergies, food poisoning, foreign infections. See a doctor early.",
  "Rahu|L8":   "Weird sudden health events or hidden conditions surfacing. Get scans if anything feels off.",
  "Rahu|L12":  "Sleep disorders, mysterious hospitalizations, sickness when travelling.",
  "Ketu|L6":   "Either an old chronic issue suddenly dissolves, or a cryptic new one shows up. Pay attention.",
  "Ketu|L8":   "Surgical events or severance illnesses possible. Energy may detach.",
  "Ketu|L12":  "Hospital, isolation, or energy-collapse stretches. Rest is non-negotiable.",

  // Power / career / fame / influence
  "Jupiter|L10": "Career-throne blessed. Promotions, sponsors, big role offers — people with power back you.",
  "Saturn|L10":  "Slow real climb to authority. Boring grind now = solid throne later. No shortcuts.",
  "Sun|L10":     "Authority figures notice you. Performance reviews and visibility go your way.",
  "Mars|L10":    "You push hard for promotions — wins fast, but clash with bosses possible.",
  "Mercury|L10": "Career wins through deals, contracts, words, code, media.",
  "Venus|L10":   "Career grows through charm, art, design, partnerships, women-led networks.",
  "Rahu|L10":    "Massive status leap — viral, foreign, unconventional. Huge upside, watch the inevitable correction.",
  "Ketu|L10":    "Career detaches. You walk away from a role or it ends. Pivot phase.",
  "Moon|L10":    "Public-facing career moment. Your mood and public mood affect work.",
  "Jupiter|L3":  "Your voice gets blessed — writing, content, speaking land bigger.",
  "Rahu|L3":     "Mass-reach window — viral content, big audience, bold self-promotion.",
  "Mars|L3":     "Hustle mode. Ship things. Confront. Push your message out.",
  "Mercury|L3":  "Communication clarity peak. Best window for negotiations and deal-pitches.",
  "Rahu|Surya":  "Fame spike — also scandal risk. The mass crowd talks about you. Protect your image.",
  "Sun|L11":     "Your authority converts to income through your network. Recognition pays cash.",

  // ── FAMILY / HOME / PROPERTY / MOTHER (L4 = Sukha, the heart of family & roots) ──
  "Jupiter|L4": "Family lights up — births, weddings, reunions, property gains. Mother's health improves. Inner peace returns. Classical home-blessing transit.",
  "Saturn|L4":  "Home pressure — repairs, relocation, mother's health worry, weight of family duty. Property decisions slow but solid.",
  "Sun|L4":     "Father/authority dynamic at home flares. Ego friction with family. Property tied to status.",
  "Moon|L4":    "Emotional homecoming — comfort, nostalgia, mother contact, deep nesting need.",
  "Mars|L4":    "Family conflict, household repairs, real-estate disputes, vehicle trouble. Aggression at home.",
  "Mercury|L4": "Property paperwork, contracts for the home, sibling discussions about family matters.",
  "Venus|L4":   "Home becomes beautiful — décor, comfort buys, harmony with mother/partner, vehicle upgrades.",
  "Rahu|L4":    "Foreign-property pull, unconventional living, family secret exposed, sudden relocation.",
  "Ketu|L4":    "Detachment from home, family distance, mother's spiritual phase, ancestral karma surfacing.",

  // ── SPIRITUALITY / MOKSHA (L12) ──
  "Jupiter|L12":"Spiritual blessing, ashram pull, charity, foreign retreat. Sleep deepens. Moksha-axis lit.",
  "Ketu|L9":    "Faith dissolves or transmutes. Guru leaves. Dharma rewrites itself.",
  // "Jupiter|Surya" already defined above (line 266) in COMBO_PLAIN
};

export interface WhyReason {
  pointCode: PointCode;
  pointLabel: string;
  signName: string;
  text: string;       // nerdy version
  plain: string;      // dumb-it-down version
  importance: "high" | "medium" | "low";
}

const HIGH_POINTS = new Set<PointCode>(["UL", "AK", "DK", "Chandra", "Lagna", "Surya", "L4", "L9", "L10", "L11", "L2", "L6", "L8", "L12"]);

export function whyTransitMatters(
  planet: string,
  signIndex: number,
  points: SensitivePoints | null,
): WhyReason[] {
  if (!points) return [];
  const hits = points.bySign.get(signIndex) ?? [];
  return hits.map((sp) => {
    const key = `${planet}|${sp.code}`;
    const custom = COMBO_REASON[key];
    const customPlain = COMBO_PLAIN[key];
    const importance: WhyReason["importance"] = HIGH_POINTS.has(sp.code) ? "high" : "medium";
    const text = custom
      ?? `${planet} is now transiting your ${sp.label} sign (${sp.signName}). ${sp.explanation} ${planet}'s energy gets routed directly into that field of your life.`;
    const plain = customPlain
      ?? `${planet} is currently sitting in the part of your chart tied to: ${sp.plainExplanation} Expect that area of life to be active this period.`;
    return { pointCode: sp.code, pointLabel: sp.label, signName: sp.signName, text, plain, importance };
  });
}
