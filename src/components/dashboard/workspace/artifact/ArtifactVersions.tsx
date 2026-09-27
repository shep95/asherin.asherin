// immutable version lineage — compare and restore. history is never cut.

import { useState } from "react";
import { compareVersions } from "@/lib/artifact/versioning";
import type { ArtifactVersion } from "@/lib/artifact/types";

interface Props {
  versions: ArtifactVersion[];
  activeVersion: number;
  onRestore?: (version: ArtifactVersion) => void;
}

const ArtifactVersions = ({ versions, activeVersion, onRestore }: Props) => {
  const [compareWith, setCompareWith] = useState<number | null>(null);
  const head = versions.find((v) => v.version === activeVersion) ?? versions[versions.length - 1];
  const other = versions.find((v) => v.version === compareWith) ?? null;
  const diff = head && other ? compareVersions(other, head) : [];

  if (!versions.length) {
    return <p className="text-[11px] font-light text-muted-foreground/70">no version has been recorded yet</p>;
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {[...versions].reverse().map((v) => (
          <li key={v.version} className="flex items-start justify-between gap-2 text-[11px] font-light">
            <span className={v.version === activeVersion ? "text-foreground/85" : "text-muted-foreground/70"}>
              v{v.version}
              {v.parentVersion ? ` ← v${v.parentVersion}` : ""} · {v.changeSummary || "no summary"}
              <span className="block text-[10px] text-muted-foreground/55">{v.reason}</span>
            </span>
            <span className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setCompareWith(compareWith === v.version ? null : v.version)}
                className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60 hover:text-foreground/80"
              >
                compare
              </button>
              {onRestore && v.version !== activeVersion && (
                <button
                  type="button"
                  onClick={() => onRestore(v)}
                  className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60 hover:text-foreground/80"
                >
                  restore
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {other && head && (
        <div className="rounded-lg border border-border/20 bg-foreground/[0.02] p-2.5 text-[10px] font-light text-muted-foreground/75">
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">
            v{other.version} → v{head.version}
          </div>
          {diff.map((d) => (
            <div key={d.path}>
              {d.status} · {d.path} ({d.beforeLines} → {d.afterLines} lines)
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArtifactVersions;
