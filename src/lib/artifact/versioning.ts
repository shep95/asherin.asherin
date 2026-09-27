// version lineage — immutable. a repair appends, it never overwrites.

import type { ArtifactFile, ArtifactManifest, ArtifactVersion } from "./types";

export interface NewVersionInput {
  parent: ArtifactVersion | null;
  manifest: ArtifactManifest;
  files: ArtifactFile[];
  changeSummary: string;
  reason: string;
  feedbackSource?: string | null;
}

export function nextVersion(input: NewVersionInput): ArtifactVersion {
  const version = (input.parent?.version ?? 0) + 1;
  return {
    version,
    parentVersion: input.parent?.version ?? null,
    manifest: input.manifest,
    files: input.files,
    dependencies: input.manifest.dependencies ?? [],
    runtimeMeta: {},
    changeSummary: input.changeSummary,
    reason: input.reason,
    feedbackSource: input.feedbackSource ?? null,
    createdAt: new Date().toISOString(),
  };
}

export interface FileDiff {
  path: string;
  status: "added" | "removed" | "changed" | "unchanged";
  beforeLines: number;
  afterLines: number;
}

export function compareVersions(a: ArtifactVersion, b: ArtifactVersion): FileDiff[] {
  const paths = Array.from(new Set([...a.files.map((f) => f.path), ...b.files.map((f) => f.path)])).sort();
  return paths.map((path) => {
    const before = a.files.find((f) => f.path === path);
    const after = b.files.find((f) => f.path === path);
    const status: FileDiff["status"] = !before ? "added" : !after ? "removed" : before.content === after.content ? "unchanged" : "changed";
    return {
      path,
      status,
      beforeLines: before ? before.content.split("\n").length : 0,
      afterLines: after ? after.content.split("\n").length : 0,
    };
  });
}

/** rollback restores content forward as a NEW version — history is never cut. */
export function rollbackTo(target: ArtifactVersion, head: ArtifactVersion): ArtifactVersion {
  return nextVersion({
    parent: head,
    manifest: target.manifest,
    files: target.files,
    changeSummary: `restored the state of version ${target.version}`,
    reason: `rollback requested from version ${head.version}`,
    feedbackSource: "user_rollback",
  });
}

export function lineage(versions: ArtifactVersion[], from: number): ArtifactVersion[] {
  const byVersion = new Map(versions.map((v) => [v.version, v]));
  const chain: ArtifactVersion[] = [];
  let cursor: number | null = from;
  const guard = new Set<number>();
  while (cursor != null && byVersion.has(cursor) && !guard.has(cursor)) {
    guard.add(cursor);
    const node = byVersion.get(cursor)!;
    chain.push(node);
    cursor = node.parentVersion;
  }
  return chain;
}
