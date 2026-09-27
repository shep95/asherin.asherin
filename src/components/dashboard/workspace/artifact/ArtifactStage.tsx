// the stage — where an artifact is actually run or rendered.
//
// Execution happens in a cross-origin sandboxed frame with no same-origin
// access and network denied by default. Anything that cannot run says so.

import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { buildSrcDoc, readSandboxMessage, SANDBOX_ATTR, SANDBOX_LIMITS } from "@/lib/artifact/runtimes/browserSandbox";
import { renderArtifact } from "@/lib/artifact/runtimes/renderRuntime";
import type { ArtifactCapability, ArtifactFile, Observation } from "@/lib/artifact/types";

interface Props {
  capability: ArtifactCapability;
  capabilityReason: string;
  files: ArtifactFile[];
  onObservation: (o: Omit<Observation, "observedAt"> & { observedAt?: string }) => void;
}

const ArtifactStage = ({ capability, capabilityReason, files, onObservation }: Props) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const build = useMemo(
    () => (capability === "execute" ? buildSrcDoc(files) : null),
    [capability, files],
  );
  const rendered = useMemo(
    () => (capability === "render" || capability === "compute" ? renderArtifact(files) : null),
    [capability, files],
  );

  useEffect(() => {
    if (capability !== "execute") return;
    const onMessage = (event: MessageEvent) => {
      if (frameRef.current && event.source !== frameRef.current.contentWindow) return;
      const msg = readSandboxMessage(event.data);
      if (msg) onObservation(msg);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [capability, onObservation]);

  useEffect(() => {
    if (!build) return;
    for (const err of build.errors) {
      onObservation({ channel: "runtime_error", level: "error", message: err, source: "sandbox build" });
    }
  }, [build, onObservation]);

  useEffect(() => {
    if (!rendered) return;
    for (const o of rendered.observations) onObservation(o);
  }, [rendered, onObservation]);

  if (capability === "unavailable" || capability === "validate_only") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border/20 bg-foreground/[0.02] p-3 text-[11px] font-light text-muted-foreground/80">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={1.5} />
        <span>{capabilityReason}</span>
      </div>
    );
  }

  if (capability === "execute") {
    if (!build?.srcDoc) {
      return (
        <div className="rounded-lg border border-border/20 p-3 text-[11px] font-light text-muted-foreground/80">
          {build?.errors[0] ?? "nothing to run"}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <iframe
          ref={frameRef}
          title="artifact"
          sandbox={SANDBOX_ATTR}
          srcDoc={build.srcDoc}
          className="h-[380px] w-full rounded-lg border border-border/20 bg-black"
        />
        <ul className="space-y-0.5 text-[9px] font-light text-muted-foreground/50">
          {SANDBOX_LIMITS.map((l) => (
            <li key={l}>— {l}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (!rendered?.ok) {
    return (
      <div className="rounded-lg border border-border/20 p-3 text-[11px] font-light text-muted-foreground/80">
        {rendered?.reason ?? "nothing to render"}
      </div>
    );
  }

  return (
    <pre className="max-h-[380px] overflow-auto whitespace-pre-wrap rounded-lg border border-border/20 bg-foreground/[0.02] p-3 text-[11px] font-light leading-relaxed text-foreground/80">
      {rendered.body}
    </pre>
  );
};

export default ArtifactStage;
