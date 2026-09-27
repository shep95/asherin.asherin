// Resolve historical UTC offset for a given lat/lon and local birth date/time.
// Strategy:
//  1. Resolve IANA timezone via timeapi.io (no key) -> /TimeZone/coordinate
//  2. Compute historical offset for the birth instant via Intl + the resolved zone.
//
// Falls back to a longitude-based estimate (lon / 15) if the network call fails,
// so the chart still generates offline.

export interface ResolvedTz {
  ianaName: string | null;
  offsetHours: number; // historical offset at the given local datetime
  source: "timeapi" | "longitude-fallback";
}

const ZONE_CACHE = new Map<string, string>();

async function fetchIanaZone(lat: number, lon: number): Promise<string | null> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (ZONE_CACHE.has(key)) return ZONE_CACHE.get(key)!;
  try {
    const res = await fetch(
      `https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lon}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { timeZone?: string };
    if (data.timeZone) {
      ZONE_CACHE.set(key, data.timeZone);
      return data.timeZone;
    }
    return null;
  } catch {
    return null;
  }
}

// Compute UTC offset (hours) for a wall-clock instant in the given IANA zone.
// Works historically (DST aware) by using Intl.DateTimeFormat parts.
function offsetForLocalDate(zone: string, isoLocal: string): number {
  // isoLocal: "YYYY-MM-DDTHH:mm:00"
  const local = new Date(`${isoLocal}Z`); // treat as UTC first; we'll iterate to converge
  // Use Intl to read the offset name at this instant in the target zone.
  // We need the zone offset at the LOCAL wall-clock time. Iterate twice (handles DST).
  let guess = local.getTime();
  for (let i = 0; i < 2; i++) {
    const dt = new Date(guess);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(dt);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const asUtc = Date.UTC(
      +map.year, +map.month - 1, +map.day,
      +map.hour % 24, +map.minute, +map.second,
    );
    const offsetMs = asUtc - dt.getTime();
    // wallTimeAsUtc - dt = offset of zone vs UTC at that instant
    guess = local.getTime() - offsetMs;
  }
  const finalOffsetMs = local.getTime() - guess;
  return finalOffsetMs / 3_600_000;
}

export async function resolveBirthTimezone(
  lat: number,
  lon: number,
  birthDate: string,
  birthTime: string,
): Promise<ResolvedTz> {
  const zone = await fetchIanaZone(lat, lon);
  const isoLocal = `${birthDate}T${birthTime.length === 5 ? birthTime + ":00" : birthTime}`;
  if (zone) {
    try {
      const offsetHours = offsetForLocalDate(zone, isoLocal);
      return { ianaName: zone, offsetHours, source: "timeapi" };
    } catch {
      // fall through
    }
  }
  // Longitude fallback: 15° per hour, rounded to nearest 0.25h
  const approx = Math.round((lon / 15) * 4) / 4;
  return { ianaName: null, offsetHours: approx, source: "longitude-fallback" };
}
