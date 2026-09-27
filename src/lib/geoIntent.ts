/**
 * geoIntent — a cartography request opens the map. No click to summon.
 *
 * Mirrors supabase/functions/_shared/geoToolBridge.ts so the client surfaces
 * the map at the same instant the backend fires the geography tools. Detection
 * only; nothing here geocodes or claims a location.
 */

export interface GeoIntent {
  /** The literal place phrase lifted from the turn. */
  place: string;
  /** Ownership / occupancy question → rooftop zoom + public-index dossier. */
  property: boolean;
  /** Target zoom carried with the ask so the map starts there — a chat fly
   *  must never load world tiles and then animate in. */
  zoom: number;
  /** Second place when the operator asked to compare two addresses in one
   *  turn. The map fits both; if only one geocodes it says so. */
  places?: string[];
}

/* Phrases that read like "map" but mean a diagram, not a place. */
const NEGATIVES =
  /\b(intel ?map|entity map|relationship map|link map|mind ?map|road ?map|site ?map|heat ?map|world map|map of ideas|sitemap)\b/i;

const PATTERNS: { re: RegExp; property: boolean }[] = [
  {
    re: /\b(?:who\s+lives\s+at|who\s+owns|property\s+(?:at|for)|address\s+(?:lookup\s+)?(?:for\s+)?|dossier\s+(?:on|for)\s+(?:the\s+)?(?:house|property|address)\s+at)\s+(.+)$/i,
    property: true,
  },
  {
    re: /\b(?:take\s+me\s+to|fly\s+to|go\s+to|navigate\s+to|zoom\s+(?:in\s+)?(?:on|to)|center\s+(?:the\s+)?map\s+on|show\s+me\s+on\s+the\s+map)\s+(.+)$/i,
    property: false,
  },
  /* Two-address compare reads as a property ask on both roofs. */
  { re: /\b(?:compare|contrast)\s+(.+\s+(?:vs\.?|versus|and)\s+.+)$/i, property: true },
  { re: /\b(?:pull\s+up|open\s+the\s+map\s+(?:on|for)|map)\s+(.+)$/i, property: false },
  /* Bare US-style street address typed straight into chat. */
  { re: /^(\d{1,6}\s+[A-Za-z0-9'.\- ]{3,}\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pkwy|parkway|hwy|highway|ter|terrace|pl|place|cir|circle|trl|trail|loop|sq|square)\b.*)$/i, property: true },
];

export function detectGeoIntent(text: string): GeoIntent | null {
  const raw = String(text || "").trim();
  if (!raw || raw.length > 2000) return null;
  if (NEGATIVES.test(raw)) return null;

  for (const { re, property } of PATTERNS) {
    const m = raw.match(re);
    if (!m) continue;
    const place = (m[1] || "")
      .replace(/[.?!]+$/g, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    if (!place || place.length < 2) continue;
    if (!property && /^[a-z]+$/i.test(place) && place.length < 4) continue;

    /* Compare shape: "X vs Y", "compare X and Y". Two candidates only — a
       third would be a list, not a split-glass comparison. */
    const cmp = place.split(/\s+(?:vs\.?|versus)\s+|\s+and\s+(?=\d{1,6}\s)/i)
      .map((x) => x.trim())
      .filter((x) => x.length > 2);
    const places = /\b(compare|vs\.?|versus)\b/i.test(raw) && cmp.length === 2 ? cmp : undefined;

    /* City/region asks frame the locality; rooftop asks frame the roof. */
    const cityShape = !property && !/\d{1,6}\s+\w/.test(place);
    const zoom = property ? 19 : cityShape ? 12 : 17;
    return { place: places ? places[0] : place, property, zoom, places };
  }
  return null;
}

/** Ask the shell to surface the map and fly. Idempotent, fire-and-forget.
 *  The target is also parked in sessionStorage so a map that mounts AFTER the
 *  event (first geography turn of a session) starts at the right scale instead
 *  of painting the world and animating in. */
export function requestMapFocus(intent: GeoIntent) {
  try {
    sessionStorage.setItem("asherin.map.target", JSON.stringify({ ...intent, at: Date.now() }));
  } catch { /* private mode — the event still carries the target */ }
  window.dispatchEvent(new CustomEvent("asherin:geo-focus", { detail: intent }));
  // The Asher dashboard listens on its own channel for the same event.
  window.dispatchEvent(new CustomEvent("asher:open-map"));
}
