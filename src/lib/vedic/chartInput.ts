/**
 * Birth-data validation for the chart form. Every message here is shown to
 * the operator as written, so they say what to change, in lowercase.
 */

export class ChartInputError extends Error {
  name = "ChartInputError";
}

export interface ChartInputText {
  birthDate: string;
  birthTime: string;
  tzOffset: string;
  lat: string;
  lon: string;
}

export function validateChartInput(input: ChartInputText): { latNum: number; lonNum: number; tz: number } {
  if (!input.birthDate) throw new ChartInputError("birth date required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) throw new ChartInputError("birth date must be a full calendar date");
  if (!/^\d{2}:\d{2}$/.test(input.birthTime)) throw new ChartInputError("birth time must be hh:mm");
  const latNum = parseFloat(input.lat);
  const lonNum = parseFloat(input.lon);
  const tz = parseFloat(input.tzOffset);
  if (Number.isNaN(latNum) || Number.isNaN(lonNum)) throw new ChartInputError("latitude and longitude required — pick a city or type them");
  if (latNum < -90 || latNum > 90) throw new ChartInputError("latitude must be between -90 and 90");
  if (lonNum < -180 || lonNum > 180) throw new ChartInputError("longitude must be between -180 and 180");
  if (Number.isNaN(tz)) throw new ChartInputError("utc offset required");
  if (tz < -14 || tz > 14) throw new ChartInputError("utc offset must be between -14 and +14 hours");
  return { latNum, lonNum, tz };
}

/** The line the operator sees when a chart cannot be produced. Never a raw stack. */
export function describeChartFailure(e: unknown): string {
  if (e instanceof ChartInputError) return e.message;
  console.warn("[vedic] chart computation failed", e);
  return "the ephemeris could not compute this chart on this device — reload once and try again";
}
