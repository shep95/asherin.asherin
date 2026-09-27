// asherin.arvision — shared access to the public OpenStreetMap query service.
//
// The walkable map builder and the building resolver both need the same thing:
// a mirror-rotating, rate-limit-aware call that either returns real elements or
// says plainly why it could not. Keeping one implementation means a fix to the
// backoff or the mirror list benefits both, and neither surface can drift into
// inventing geometry when the service is busy.

// Only worldwide mirrors belong here. Regional instances answer 200 with an
// empty result outside their own country, which reads as "nothing is mapped
// here" and is a lie about the place rather than about the service.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const REQUEST_TIMEOUT_MS = 30_000;

export interface OverpassGeom {
  lat: number;
  lon: number;
}

export interface OverpassMember {
  type: "way" | "node" | "relation";
  ref: number;
  role?: string;
  geometry?: OverpassGeom[];
}

export interface OverpassElement {
  type: "way" | "node" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  geometry?: OverpassGeom[];
  members?: OverpassMember[];
  tags?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The public map service is shared and rate limits hard, so a 429 or 504 is a
// normal event rather than a failure: rotate to the next mirror, honour any
// Retry-After it hands back, and only then wait a growing pause before trying
// again. A 400 is our own bad query and never worth retrying.
export async function overpassFetch(body: string): Promise<OverpassElement[]> {
  let lastError = "the map service is unreachable right now";
  for (let attempt = 0; attempt < ENDPOINTS.length * 2; attempt += 1) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: `data=${encodeURIComponent(body)}`,
        signal: controller.signal,
      });
      if (res.status === 400) throw new Error("the map query was rejected as malformed");
      if (!res.ok) {
        lastError =
          res.status === 429 || res.status === 504
            ? "the public map service is busy and asked us to slow down"
            : `the map service answered ${res.status}`;
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter, 8) * 1000
            : 800 * 2 ** Math.floor(attempt / ENDPOINTS.length);
        await sleep(Math.min(wait, 6000));
        continue;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("json")) {
        lastError = "the map service returned something that was not map data";
        continue;
      }
      const json = (await res.json()) as { elements?: OverpassElement[] };
      return Array.isArray(json.elements) ? json.elements : [];
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("the map query")) throw error;
      lastError =
        error instanceof Error && error.name === "AbortError"
          ? "the map request timed out"
          : "the map request failed";
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}
