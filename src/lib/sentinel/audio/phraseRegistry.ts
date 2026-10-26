// asherin.sentinel — one phrase matcher per lane.
//
// The store (sync.ts) asks a matcher for a turn's words at ingest time; the
// channel layer (channels.ts) hands the same matcher every final phrase the
// recogniser produces. Keeping the registry in its own module means neither
// of those files has to import the other.

import { PhraseMatcher, type SpokenPhrase, type TurnWindow } from "./transcripts";

export type { SpokenPhrase, TurnWindow };

const matchers = new Map<string, PhraseMatcher>();

export function matcherFor(deviceKey: string): PhraseMatcher {
  const existing = matchers.get(deviceKey);
  if (existing) return existing;
  const fresh = new PhraseMatcher();
  matchers.set(deviceKey, fresh);
  return fresh;
}

export function clearMatcher(deviceKey: string): void {
  matchers.get(deviceKey)?.clear();
}
