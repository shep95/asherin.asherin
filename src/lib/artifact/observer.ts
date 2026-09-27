// observer — normalises what actually happened.
//
// The observer never invents an observation. A channel that could not be
// watched is listed as unobserved with the reason, and the validator treats
// that as "unavailable", never as "pass".

import type { ArtifactCapability, Observation, ObservationChannel, ObservationSet, UnobservedChannel } from "./types";

const ALL_CHANNELS: ObservationChannel[] = [
  "runtime_error",
  "console",
  "network",
  "state",
  "interaction",
  "test",
  "performance",
  "render",
];

/** channels a given capability can genuinely watch in this app. */
export function watchableChannels(capability: ArtifactCapability): ObservationChannel[] {
  switch (capability) {
    case "execute":
      // the sandbox frame posts errors, console output and render signals back.
      return ["runtime_error", "console", "state", "render", "performance"];
    case "compute":
      return ["runtime_error", "state", "test", "performance"];
    case "render":
      return ["render"];
    default:
      return [];
  }
}

const REASONS: Record<ObservationChannel, string> = {
  runtime_error: "nothing executes, so no runtime error can be raised",
  console: "no console exists outside an executing frame",
  network: "the sandbox denies network by default, so no request is observed",
  state: "no runtime state is produced by this artifact type",
  interaction: "no automated interaction driver runs in this app",
  test: "no test runner executes artifact tests in the browser",
  performance: "no timing is measured for this artifact type",
  render: "nothing is rendered for this artifact type",
};

export function normalise(raw: Array<Partial<Observation> & { channel: ObservationChannel; message: string; source: string }>, capability: ArtifactCapability): ObservationSet {
  const watchable = watchableChannels(capability);
  const observations: Observation[] = raw
    .filter((r) => watchable.includes(r.channel))
    .map((r) => ({
      channel: r.channel,
      source: r.source,
      level: r.level ?? "info",
      message: String(r.message).slice(0, 2000),
      detail: r.detail,
      observedAt: r.observedAt ?? new Date().toISOString(),
    }));

  const seen = new Set(observations.map((o) => o.channel));
  const unobserved: UnobservedChannel[] = ALL_CHANNELS.filter((c) => !seen.has(c)).map((c) => ({
    channel: c,
    reason: watchable.includes(c)
      ? "watched, but the run produced nothing on this channel"
      : REASONS[c],
  }));

  return { observations, unobserved };
}

export function hasErrors(set: ObservationSet): boolean {
  return set.observations.some((o) => o.level === "error");
}

export function errorMessages(set: ObservationSet): string[] {
  return set.observations.filter((o) => o.level === "error").map((o) => o.message);
}
