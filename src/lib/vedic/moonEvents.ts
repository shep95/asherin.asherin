/**
 * MOON EVENTS — 100% Moon-driven forecast, filtered to 5 life domains and
 * personalized per ascendant (whole-sign houses + natal planet occupants).
 *
 * Domains we keep:
 *   wealth-equity   — long-term net worth (11th gains, Jupiter, Sun)
 *   wealth-liquidity— cash flow / spending (2nd, Venus, Moon, Mercury)
 *   love            — romance + partnership (5th, 7th, Venus)
 *   power           — career + status + authority (10th, Sun, Mars, Saturn)
 *   mental-health   — mood, peace, rest (1st, 4th, 8th, 12th, Moon, Rahu, Ketu, Saturn)
 *   physical-health — body, illness, vitality (6th, 1st, Mars, Saturn)
 *
 * Everything outside these buckets is dropped (3rd siblings, 9th luck/teachers
 * by default — turn them on via the panel filter if exposed later).
 *
 * Personalization: every event lists which natal planets sit in the same sign
 * the Moon is transiting (for ingresses) or which house the conjuncted planet
 * occupies (for conjunctions), framed against the user's ascendant.
 */
import { siderealMoonAt } from "./sweChart";

export type MoonEventDomain =
  | "wealth-equity"
  | "wealth-liquidity"
  | "love"
  | "power"
  | "mental-health"
  | "physical-health";

export interface NatalPlanetRef {
  name: string; // Sun | Moon | Mercury | Venus | Mars | Jupiter | Saturn | Rahu | Ketu
  sid: number;  // sidereal longitude 0..360
}

export interface MoonEvent {
  id: string;
  kind: "house-ingress" | "conjunction";
  at: Date;
  house?: number;          // 1..12 (for ingress, and for conjunction = house the planet occupies)
  planet?: string;
  tone: "good" | "bad" | "mixed";
  domains: MoonEventDomain[]; // one or more — used by filter chips
  label: string;
  headline: string;
  expect: string;          // base meaning
  natalEnrich?: string;    // appended line listing natal planets in this house, if any
}

// ── HOUSE → domains + base meaning (whole-sign, anchored on natal asc) ───────
const HOUSE_DEF: Record<number, { domains: MoonEventDomain[]; tone: "good" | "bad" | "mixed"; label: string; headline: string; expect: string } | null> = {
  1:  { domains: ["mental-health", "physical-health"], tone: "mixed",
        label: "House 1 — Self & Body",
        headline: "Mood reset — you are the center of gravity.",
        expect: "Self-focus + vitality spike. Identity, body, appearance carry weight. Expect emotional self-awareness, restlessness, and a pull to start something personal. Don't make big calls purely on mood." },
  2:  { domains: ["wealth-liquidity"], tone: "mixed",
        label: "House 2 — Cashflow, Family, Speech",
        headline: "Liquidity window — money in/out, family chatter, what you say lands.",
        expect: "Day-to-day cash moves: small purchases, food spend, bills, family money talks. Watch comfort eating and impulse buys. Good for short cash conversations, bad for long-term equity decisions." },
  4:  { domains: ["mental-health"], tone: "mixed",
        label: "House 4 — Heart, Home, Mother",
        headline: "Pull toward home, comfort, mother — emotional refuge.",
        expect: "Nesting urge, mom on the mind, sentimental moods. Domestic chores, real-estate thoughts, tender memories. Good for rest, bad for confrontation." },
  5:  { domains: ["love"], tone: "good",
        label: "House 5 — Romance, Play, Children",
        headline: "Romance + creative spark.",
        expect: "Flirty, playful, creative. Dates, kids' news, art, content output. Speculation tempting — keep stakes small." },
  6:  { domains: ["physical-health"], tone: "bad",
        label: "House 6 — Illness, Work, Conflict",
        headline: "Body load + arguments — guard health.",
        expect: "Minor health flares, busy work queue, diet slips, short-fuse arguments. Don't pick fights. Hydrate, sleep early, eat clean." },
  7:  { domains: ["love"], tone: "mixed",
        label: "House 7 — Partnership & Public",
        headline: "Partner-facing window — meetings, dates, negotiations.",
        expect: "One-on-one intensity. Spouse, dates, clients, public eyes. Emotional reads of the other person are sharper. Good for relationship talks." },
  8:  { domains: ["mental-health"], tone: "bad",
        label: "House 8 — Hidden, Intimacy, Transformation",
        headline: "Deep emotions surface — secrets, intimacy, sudden shifts.",
        expect: "Old wounds, intimacy, joint money, occult pull. Intense moods, hidden info coming up, possible sudden changes. Don't sign legal docs blindly." },
  10: { domains: ["power"], tone: "good",
        label: "House 10 — Career & Status",
        headline: "Visibility at work — reputation moment.",
        expect: "Boss notices, status conversations, promotions discussed, public eye on the career. Show up sharp. Best window of the cycle for power moves." },
  11: { domains: ["wealth-equity"], tone: "good",
        label: "House 11 — Gains & Network",
        headline: "Equity window — gains, payouts, network activates.",
        expect: "Long-cycle gains, network firing, intros, payouts, friends bringing wins. Best window for compounding/equity decisions and saying yes to social invites." },
  12: { domains: ["mental-health", "wealth-liquidity"], tone: "mixed",
        label: "House 12 — Rest, Loss, Foreign",
        headline: "Withdraw — sleep, dreams, hidden expenses.",
        expect: "Low-energy day. Vivid dreams, foreign-land thoughts, surprise expenses, urge to be alone. Don't fight it — recharge. Watch leaky spending." },
  3: null,  // siblings/courage — skipped
  9: null,  // luck/dharma — skipped
};

// ── CONJUNCTIONS (Moon hits natal planet) ────────────────────────────────────
const CONJ_DEF: Record<string, { domains: MoonEventDomain[]; tone: "good" | "bad" | "mixed"; headline: string; expect: string }> = {
  Sun:     { domains: ["power"], tone: "good",
             headline: "Identity activated — visibility + vitality surge.",
             expect: "Ego pinged, father/authority on the mind. Visibility moment, confidence test. Good for public moves and status plays." },
  Mercury: { domains: ["wealth-liquidity", "power"], tone: "good",
             headline: "Mind activated — key messages, deals, decisions.",
             expect: "Mental clarity spike. Calls, contracts, sharp memory. Best window of the week for negotiation and short-cycle money moves." },
  Venus:   { domains: ["love", "wealth-liquidity"], tone: "good",
             headline: "Love + comfort surge — sweetness, beauty, small luxury.",
             expect: "Romance, gifts, sweet food, harmony. Reach out to the person you like. Watch impulse luxury spend." },
  Mars:    { domains: ["physical-health", "power"], tone: "bad",
             headline: "Drive + conflict — impulsive action, watch the temper.",
             expect: "Energy spike, libido up, short-fuse. Arguments, accidents if rushing, spicy-food craving. Channel into training, not fights." },
  Jupiter: { domains: ["wealth-equity", "mental-health"], tone: "good",
             headline: "Blessing window — good news, mentors, lucky break.",
             expect: "Optimism floods in. Mentor contact, generous gestures, opportunity ping. Best long-cycle window — ask for what you want." },
  Saturn:  { domains: ["power", "physical-health", "mental-health"], tone: "bad",
             headline: "Weight lands — serious mood, slow day, responsibility.",
             expect: "Heaviness, fatigue, isolation pull. Work pressure, delays, bones/joints achy, old fears surface. Don't quit — just go slow." },
  Rahu:    { domains: ["mental-health", "wealth-liquidity"], tone: "mixed",
             headline: "Obsession + craving — unusual desires, distraction.",
             expect: "Intensity, foreign pull, weird cravings, addictive scrolling. Magnetism toward something risky. Notice the loop before falling in." },
  Ketu:    { domains: ["mental-health"], tone: "mixed",
             headline: "Detachment + release — spiritual pull, sudden endings.",
             expect: "Withdrawal urge, intuition flash, things falling away. Meditative mood, a chapter closing. Don't grasp — let it pass." },
};

// Brief flavor used when a natal planet sits in the transited sign.
const NATAL_FLAVOR: Record<string, string> = {
  Sun:     "ego + authority lit up",
  Moon:    "moods doubled, sleep weird",
  Mercury: "messages, decisions, deals amplified",
  Venus:   "romance + cashflow charged",
  Mars:    "drive + temper running hot",
  Jupiter: "blessings + expansion magnified",
  Saturn:  "weight, delay, discipline lands harder",
  Rahu:    "obsession + cravings amplified",
  Ketu:    "detachment + loss more pronounced",
};

// ── helpers ──────────────────────────────────────────────────────────────────
function signedDiff(a: number, b: number) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function houseOf(sid: number, ascSignStart: number): number {
  const rel = (((sid - ascSignStart) % 360) + 360) % 360;
  return Math.floor(rel / 30) + 1;
}

async function bisectIngress(
  loMs: number, hiMs: number, lat: number, lon: number,
  ascSignStart: number, targetHouse: number,
): Promise<Date> {
  let lo = loMs, hi = hiMs;
  for (let i = 0; i < 14; i++) {
    if (hi - lo < 60_000) break;
    const midMs = (lo + hi) / 2;
    const sid = await siderealMoonAt(new Date(midMs), lat, lon);
    const h = houseOf(sid, ascSignStart);
    if (h === targetHouse) hi = midMs; else lo = midMs;
  }
  return new Date(hi);
}

async function bisectConjunction(
  loMs: number, hiMs: number, lat: number, lon: number, targetSid: number,
): Promise<Date> {
  let lo = loMs, hi = hiMs;
  let dLo = signedDiff(await siderealMoonAt(new Date(lo), lat, lon), targetSid);
  for (let i = 0; i < 16; i++) {
    if (hi - lo < 60_000) break;
    const mid = (lo + hi) / 2;
    const dMid = signedDiff(await siderealMoonAt(new Date(mid), lat, lon), targetSid);
    const crossedInLow = (dLo <= 0 && dMid >= 0) || (dLo >= 0 && dMid <= 0);
    if (crossedInLow) { hi = mid; } else { lo = mid; dLo = dMid; }
  }
  return new Date((lo + hi) / 2);
}

/**
 * Compute every Moon house-ingress and Moon-to-natal-planet conjunction in
 * [start, end], tagged with domain(s) and enriched with which natal planets
 * sit in the affected house for THIS ascendant.
 */
export async function computeMoonEvents(
  start: Date,
  end: Date,
  natalAscendant: number,
  natalPlanets: NatalPlanetRef[],
  lat: number,
  lon: number,
): Promise<MoonEvent[]> {
  if (end.getTime() <= start.getTime()) return [];
  const ascSignStart = Math.floor(natalAscendant / 30) * 30;

  // Pre-bucket natal planets by which natal house they occupy.
  const planetsByHouse = new Map<number, NatalPlanetRef[]>();
  for (const p of natalPlanets) {
    if (typeof p.sid !== "number") continue;
    const h = houseOf(p.sid, ascSignStart);
    const arr = planetsByHouse.get(h) ?? [];
    arr.push(p);
    planetsByHouse.set(h, arr);
  }

  const STEP = 60 * 60_000;
  const samples: Array<{ t: number; sid: number }> = [];
  for (let t = start.getTime(); t <= end.getTime(); t += STEP) {
    samples.push({ t, sid: await siderealMoonAt(new Date(t), lat, lon) });
  }
  if (samples.length < 2) return [];

  const events: MoonEvent[] = [];

  const enrichFor = (house: number): string | undefined => {
    const occupants = planetsByHouse.get(house);
    if (!occupants || occupants.length === 0) return undefined;
    const parts = occupants.map((p) => {
      const flavor = NATAL_FLAVOR[p.name] ?? "activated";
      return `Natal ${p.name} — ${flavor}`;
    });
    return parts.join(" · ");
  };

  // House ingresses
  for (let i = 1; i < samples.length; i++) {
    const hPrev = houseOf(samples[i - 1].sid, ascSignStart);
    const hNow = houseOf(samples[i].sid, ascSignStart);
    if (hPrev === hNow) continue;
    const def = HOUSE_DEF[hNow];
    if (!def) continue; // skipped house
    const at = await bisectIngress(samples[i - 1].t, samples[i].t, lat, lon, ascSignStart, hNow);
    if (at.getTime() < start.getTime() || at.getTime() > end.getTime()) continue;
    events.push({
      id: `house-${hNow}-${at.getTime()}`,
      kind: "house-ingress",
      at,
      house: hNow,
      tone: def.tone,
      domains: def.domains,
      label: def.label,
      headline: `Moon enters ${def.label} — ${def.headline}`,
      expect: def.expect,
      natalEnrich: enrichFor(hNow),
    });
  }

  // Conjunctions
  for (const np of natalPlanets) {
    const def = CONJ_DEF[np.name];
    if (!def || typeof np.sid !== "number") continue;
    const occHouse = houseOf(np.sid, ascSignStart);
    let prev = signedDiff(samples[0].sid, np.sid);
    for (let i = 1; i < samples.length; i++) {
      const cur = signedDiff(samples[i].sid, np.sid);
      const crossed = (prev <= 0 && cur >= 0) || (prev >= 0 && cur <= 0);
      if (crossed && (Math.abs(prev) < 10 || Math.abs(cur) < 10)) {
        const at = await bisectConjunction(samples[i - 1].t, samples[i].t, lat, lon, np.sid);
        if (at.getTime() >= start.getTime() && at.getTime() <= end.getTime()) {
          events.push({
            id: `conj-${np.name}-${at.getTime()}`,
            kind: "conjunction",
            at,
            house: occHouse,
            planet: np.name,
            tone: def.tone,
            domains: def.domains,
            label: `Natal ${np.name} · House ${occHouse}`,
            headline: `Moon conjuncts natal ${np.name} — ${def.headline}`,
            expect: def.expect,
            natalEnrich: `Sits in your House ${occHouse} — flavor of that life area is amplified during this hit.`,
          });
        }
      }
      prev = cur;
    }
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  return events;
}

export function formatLocal(at: Date): string {
  return at.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

export const DOMAIN_META: Record<MoonEventDomain, { label: string; short: string }> = {
  "wealth-equity":    { label: "Wealth · Equity",    short: "Equity" },
  "wealth-liquidity": { label: "Wealth · Liquidity", short: "Liquidity" },
  "love":             { label: "Love",               short: "Love" },
  "power":            { label: "Power",              short: "Power" },
  "mental-health":    { label: "Mental Health",      short: "Mental" },
  "physical-health":  { label: "Physical Health",    short: "Health" },
};
