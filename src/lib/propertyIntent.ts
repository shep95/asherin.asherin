// Client-side property/address detection + Nominatim geocoding.
// Mirrors the server-side rules in supabase/functions/_shared/propertyIntel.ts
// so the main Aureon dashboard chat can render a satellite map card beneath
// any message that mentions a real address — without waiting for the LLM
// stream to finish.

const STREET_TOKEN = "(?:[A-Z][a-zA-Z'.-]+|\\d+(?:st|nd|rd|th))";
// case-INSENSITIVE — see comment in the shared server module.
const US_ADDR_RE = new RegExp(
  `\\b\\d{1,6}[A-Z]?\\s+(?:[NSEW]\\.?\\s+)?(?:${STREET_TOKEN}\\s+){1,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Place|Pl|Terrace|Ter|Way|Highway|Hwy|Parkway|Pkwy|Square|Sq)\\b\\.?(?:\\s*(?:Apt|Unit|Suite|Ste|#)\\s*\\w+)?(?:,?\\s+[A-Z][a-zA-Z]+(?:\\s+[A-Z][a-zA-Z]+){0,3})?(?:,?\\s+[A-Z]{2})?(?:\\s+\\d{5}(?:-\\d{4})?)?`,
  "gi",
);
const UK_POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;
const CA_POSTAL_RE = /\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/gi;

export interface DetectedAddress {
  raw: string;
}

export function detectAddresses(text: string): DetectedAddress[] {
  if (!text) return [];
  const found = new Set<string>();
  const push = (re: RegExp) => {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) found.add(m[0].replace(/\s+/g, " ").trim());
    re.lastIndex = 0;
  };
  push(US_ADDR_RE);
  push(UK_POSTCODE_RE);
  push(CA_POSTAL_RE);
  return [...found].slice(0, 1).map((raw) => ({ raw }));
}

export interface GeocodedAddress {
  address: string;
  formatted: string;
  lat: number;
  lng: number;
  category?: string;
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Nominatim asks for a UA. Browsers won't let us set User-Agent, but Referer
// is fine and identifies our app for their acceptable-use policy.
const geoCache = new Map<string, GeocodedAddress | null>();

export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  const key = address.trim().toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key)!;
  try {
    const url = new URL(NOMINATIM);
    url.searchParams.set("q", address);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "1");
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    const r = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) { geoCache.set(key, null); return null; }
    const arr = (await r.json()) as Array<{
      lat: string; lon: string; display_name: string; category?: string; type?: string;
    }>;
    if (!arr?.length) { geoCache.set(key, null); return null; }
    const hit = arr[0];
    const g: GeocodedAddress = {
      address,
      formatted: hit.display_name,
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      category: hit.category || hit.type,
    };
    geoCache.set(key, g);
    return g;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}
