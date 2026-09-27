// render runtime — documents, plans, workflows, designs.
//
// Nothing executes. The artifact is presented and a render observation is
// emitted only when there is genuinely something to present.

import type { ArtifactFile, Observation } from "../types";

export interface RenderResult {
  ok: boolean;
  /** plain text / markdown body actually rendered. */
  body: string;
  observations: Observation[];
  reason?: string;
}

export function renderArtifact(files: ArtifactFile[]): RenderResult {
  const body = files
    .filter((f) => !/\.(m?jsx?|tsx?)$/.test(f.path))
    .map((f) => f.content)
    .join("\n\n")
    .trim() || files.map((f) => f.content).join("\n\n").trim();

  if (!body) {
    return { ok: false, body: "", observations: [], reason: "the artifact produced no content to render" };
  }

  return {
    ok: true,
    body,
    observations: [
      {
        channel: "render",
        source: "render runtime",
        level: "info",
        message: `rendered ${files.length} file(s), ${body.split("\n").length} line(s)`,
        observedAt: new Date().toISOString(),
      },
    ],
  };
}
