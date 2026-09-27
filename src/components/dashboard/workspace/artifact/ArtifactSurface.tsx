// the artifact surface — a workspace surface, not an ide.
//
// It models the request, takes the files the answer actually produced, runs or
// renders them where the runtime honestly can, collects real observations,
// validates expected against actual, plans a scoped repair when it fails, and
// records the run so the pattern layer can learn from it through the existing
// learning gate.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import ArtifactStage from "./ArtifactStage";
import ArtifactValidationReport from "./ArtifactValidationReport";
import ArtifactVersions from "./ArtifactVersions";
import ArtifactInspector from "./ArtifactInspector";
import { buildManifest, evaluateRun, extractFiles, modelRequest, recordExperience } from "@/lib/artifact/engine";
import { nextVersion, rollbackTo } from "@/lib/artifact/versioning";
import { normalise } from "@/lib/artifact/observer";
import { learnFromExperience } from "@/lib/artifact/experience";
import { loadSettings } from "@/lib/intelligence/store";
import { recordLearningDecisions, upsertPattern } from "@/lib/intelligence/store";
import { saveFilesAsSnippets } from "@/lib/library/snippets";
import {
  createSession,
  listSessions,
  listVersions,
  saveContract,
  saveExperience,
  saveObservations,
  saveRepair,
  saveValidation,
  saveVersion,
  updateSession,
} from "@/lib/artifact/store";
import type { ArtifactLifecycle, ArtifactVersion, Observation } from "@/lib/artifact/types";


interface Props {
  request: string;
  answer: string;
  conversationId: string | null;
}

const STAGE_LABEL: Record<ArtifactLifecycle, string> = {
  draft: "drafting",
  modeled: "modelled",
  building: "building",
  built: "built",
  starting: "starting",
  running: "running",
  rendered: "rendered",
  validating: "validating",
  verified: "verified",
  build_failed: "build failed",
  runtime_failed: "runtime failed",
  validation_failed: "validation failed",
  repairing: "repairing",
  unavailable: "unavailable",
};

const SETTLE_MS = 1200;

const ArtifactSurface = ({ request, answer, conversationId }: Props) => {
  const stage = useMemo(() => modelRequest(request), [request]);
  const files = useMemo(() => extractFiles(answer), [answer]);
  const [raw, setRaw] = useState<Array<{ channel: Observation["channel"]; message: string; source: string; level?: Observation["level"] }>>([]);
  const [settled, setSettled] = useState(false);
  const [open, setOpen] = useState<"stage" | "validation" | "versions" | "inspector">("stage");
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState(0);
  const [saveState, setSaveState] = useState<string | null>(null);
  const persisted = useRef(false);


  const onObservation = useCallback((o: Omit<Observation, "observedAt"> & { observedAt?: string }) => {
    setRaw((prev) => (prev.length > 200 ? prev : [...prev, { channel: o.channel, message: o.message, source: o.source, level: o.level }]));
  }, []);

  // give the runtime a moment to report before judging it.
  useEffect(() => {
    setSettled(false);
    const t = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [request, answer]);

  const run = useMemo(
    () => evaluateRun({ stage, files, rawObservations: raw, output: answer, attempts: 0 }),
    [stage, files, raw, answer],
  );
  const observations = useMemo(() => normalise(raw, stage.capability), [raw, stage.capability]);

  // first version is recorded as soon as there is something to record.
  useEffect(() => {
    if (versions.length || !files.length) return;
    const v = nextVersion({
      parent: null,
      manifest: buildManifest(stage, files, stage.contract.goals[0] ?? request.slice(0, 80)),
      files,
      changeSummary: `first construction from the request`,
      reason: stage.capabilityReason,
    });
    setVersions([v]);
    setActiveVersion(v.version);
  }, [files, stage, request, versions.length]);

  // persist once the run has settled. owner-scoped; nothing is written for a
  // signed-out session because the store returns null.
  //
  // a follow-up in the same conversation MUTATES the existing session: it
  // appends a version to that lineage instead of starting a new artifact from
  // zero. only a genuinely new conversation or modality opens a new session.
  useEffect(() => {
    if (!settled || persisted.current || !versions.length) return;
    persisted.current = true;
    void (async () => {
      const title = stage.contract.goals[0] ?? request.slice(0, 80);
      let session = conversationId
        ? (await listSessions(conversationId)).find((s) => s.modality === stage.modality) ?? null
        : null;
      let base = 0;
      if (session) {
        const existing = await listVersions(session.id);
        base = existing.reduce((m, v) => Math.max(m, v.version), 0);
      } else {
        session = await createSession({
          conversationId,
          title,
          modality: stage.modality,
          capability: stage.capability,
          capabilityReason: stage.capabilityReason,
        });
      }
      if (!session) return;

      const local = versions[versions.length - 1];
      const head: ArtifactVersion =
        base > 0
          ? {
              ...local,
              version: base + 1,
              parentVersion: base,
              changeSummary: `follow-up in the same conversation — ${local.changeSummary}`,
            }
          : local;

      await saveContract(session.id, head.version, stage.contract, stage.audit);
      await saveVersion(session.id, head);
      await saveObservations(session.id, head.version, observations.observations);
      await saveValidation(session.id, head.version, run.validation);
      if (run.repair) await saveRepair(session.id, head.version, run.repair, null);
      await updateSession(session.id, {
        lifecycle: run.lifecycle,
        lifecycleReason: run.lifecycleReason,
        activeVersion: head.version,
        title,
        capability: stage.capability,
        capabilityReason: stage.capabilityReason,
      });
      if (base > 0) {
        setVersions((prev) => prev.map((v) => (v.version === local.version ? head : v)));
        setActiveVersion(head.version);
      }

      const experience = recordExperience({
        sessionId: session.id,
        version: head,
        stage,
        observations: observations.observations,
        validation: run.validation,
        repairs: run.repair ? [run.repair] : [],
        actions: [`modelled the request as a ${stage.modality} artifact`, `ran it with ${stage.capability} capability`],
        patternsUsed: [],
      });
      await saveExperience(experience);

      const settings = await loadSettings();
      // learning always goes through the existing gate — never a direct write.
      const derived = learnFromExperience(experience, stage.task.domains[0] ?? "general", settings);
      if (derived) {
        // the gate's decision is recorded whatever it decided, so the reasoning
        // stays auditable. only promoted or candidate patterns are stored.
        let subjectId: string | undefined;
        if (
          (derived.gate.outcome === "promoted" || derived.gate.outcome === "candidate") &&
          derived.gate.value
        ) {
          const stored = await upsertPattern(derived.gate.value);
          subjectId = stored?.id || undefined;
        }
        await recordLearningDecisions(conversationId, derived.gate.decisions, subjectId);
      }
    })();
  }, [settled, versions, observations, run, stage, conversationId, request]);


  const lifecycle: ArtifactLifecycle = !settled && stage.capability !== "unavailable" ? "validating" : run.lifecycle;

  const tabs: Array<[typeof open, string]> = [
    ["stage", "artifact"],
    ["validation", `validation · ${run.validation.checks.filter((c) => c.result === "pass").length}/${run.validation.checks.length || 0}`],
    ["versions", `versions · ${versions.length}`],
    ["inspector", "inspect"],
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground/60">
          {stage.modality} · {STAGE_LABEL[lifecycle]}
        </span>
        <span className="text-[10px] font-light text-muted-foreground/60">{run.lifecycleReason || stage.capabilityReason}</span>
        {files.length > 0 && (
          <button
            type="button"
            disabled={saveState === "saving"}
            onClick={async () => {
              setSaveState("saving");
              const res = await saveFilesAsSnippets(files, {
                title: stage.contract.goals[0] ?? request.slice(0, 60),
                tags: [stage.modality],
              });
              setSaveState(res.error ? res.error : `saved ${res.saved} file(s) to your code library`);
            }}
            className="ml-auto text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60 hover:text-foreground/80 disabled:opacity-50"
          >
            save to code library
          </button>
        )}
      </div>
      {saveState && saveState !== "saving" && (
        <p className="text-[10px] font-light text-muted-foreground/60">{saveState}</p>
      )}


      <div className="flex gap-3 border-b border-border/15 pb-1">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setOpen(id)}
            className={`text-[10px] uppercase tracking-[0.16em] ${open === id ? "text-foreground/85" : "text-muted-foreground/55 hover:text-foreground/70"}`}
          >
            {label}
          </button>
        ))}
        <ChevronDown className="ml-auto h-3 w-3 text-muted-foreground/30" strokeWidth={1.5} />
      </div>

      {open === "stage" && (
        <ArtifactStage
          capability={stage.capability}
          capabilityReason={stage.capabilityReason}
          files={files}
          onObservation={onObservation}
        />
      )}
      {open === "validation" && <ArtifactValidationReport validation={run.validation} repair={run.repair} />}
      {open === "versions" && (
        <ArtifactVersions
          versions={versions}
          activeVersion={activeVersion}
          onRestore={(v) => {
            const head = versions[versions.length - 1];
            const restored = rollbackTo(v, head);
            setVersions((prev) => [...prev, restored]);
            setActiveVersion(restored.version);
          }}
        />
      )}
      {open === "inspector" && (
        <ArtifactInspector
          contract={stage.contract}
          audit={stage.audit}
          files={files}
          observations={observations}
          modelRepairs={stage.modelRepairs}
        />
      )}
    </div>
  );
};

export default ArtifactSurface;
