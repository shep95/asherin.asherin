/**
 * Pull calendar dates out of a model reply so the timeline can mark them.
 *
 * The hosted edge function used to do this server-side; on the device the
 * reply is plain text, so the room reads it itself. Four shapes are read:
 * iso (2031-04-12), us slash (04/12/2031), "April 12, 2031" and "12 April
 * 2031". A month and a year with no day ("April 2031") is anchored to the
 * 15th so it still lands inside the right month on the strip. Anything that
 * does not survive a real calendar check (31 feb) is dropped.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const US_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const LONG_MDY_RE = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi");
const LONG_DMY_RE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?,?\\s+(\\d{4})\\b`, "gi");
const MONTH_YEAR_RE = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{4})\\b`, "gi");

const MIN_YEAR = 1800;
const MAX_YEAR = 2200;

function validDate(y: number, m: number, d: number): string | null {
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function extractDates(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  // month-year spans are claimed first so "april 12, 2031" is not also read as "april 2031"
  const claimed: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) => claimed.some(([a, b]) => s < b && e > a);
  const take = (re: RegExp, pick: (m: RegExpExecArray) => string | null) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const s = m.index, e = m.index + m[0].length;
      if (overlaps(s, e)) continue;
      const iso = pick(m);
      if (iso) { found.add(iso); claimed.push([s, e]); }
    }
  };
  take(ISO_RE, (m) => validDate(+m[1], +m[2], +m[3]));
  take(US_RE, (m) => validDate(+m[3], +m[1], +m[2]));
  take(LONG_MDY_RE, (m) => validDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]));
  take(LONG_DMY_RE, (m) => validDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]));
  take(MONTH_YEAR_RE, (m) => validDate(+m[2], MONTHS[m[1].toLowerCase()], 15));
  return Array.from(found).sort();
}
