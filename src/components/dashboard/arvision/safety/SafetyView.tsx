// asherin.arvision — safety layer.
//
// The console that holds the parts of this product which must never guess:
// what the radios in the building actually broadcast, which configured
// thresholds were objectively exceeded, whether the detectors behind those
// thresholds are alive, and whether evidence has anywhere real to live.

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSafetyConsole } from "@/hooks/useSafetyConsole";
import { safetyHub } from "@/lib/arvision/safety/hub";
import RadioAwarenessPanel from "./RadioAwarenessPanel";
import IncidentTimelinePanel from "./IncidentTimelinePanel";
import DetectorHealthPanel from "./DetectorHealthPanel";
import EvidencePanel from "./EvidencePanel";
import SafetyRulesPanel from "./SafetyRulesPanel";
import VisionEventsPanel from "./VisionEventsPanel";
import ZoneEditorPanel from "./ZoneEditorPanel";
import StaffNotificationsPanel from "./StaffNotificationsPanel";
import { useVisionSafety } from "@/hooks/useVisionSafety";
import CrossModalPanel from "./CrossModalPanel";

const SafetyView = () => {
  const { user } = useAuth();
  const { snapshot, review, setRules, setAllowlist, deleteBundle } = useSafetyConsole();
  const vision = useVisionSafety();
  const operator = user?.id ? `operator ${user.id.slice(0, 8)}` : "unauthenticated session";
  const allowlist = useMemo(() => safetyHub().getAllowlist(), [snapshot.atMs]);

  return (
    <div className="h-full w-full overflow-y-auto bg-black">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 pb-10 sm:p-4">
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <h1 className="text-[13px] font-light text-white/85">safety console</h1>
          <p className="mt-1 text-[11px] font-light leading-relaxed text-white/40">
            this layer observes a space you are authorized to monitor. it records events, not people: it does not infer identity,
            intent, character or danger from anyone's appearance or behaviour, and it never acts on its own.
          </p>
        </section>

        <VisionEventsPanel snapshot={vision.snapshot} />
        <ZoneEditorPanel
          zones={vision.snapshot.zones}
          cameras={vision.snapshot.cameras.map((c) => ({ cameraId: c.cameraId, cameraLabel: c.cameraLabel }))}
          onChange={vision.setZones}
        />
        <StaffNotificationsPanel
          notifications={vision.notifications}
          channels={vision.channels}
          onChannel={vision.setChannel}
          onRead={vision.markRead}
          onAcknowledge={vision.acknowledge}
        />
        <CrossModalPanel zones={vision.snapshot.zones} operator={operator} />
        <RadioAwarenessPanel snapshot={snapshot} allowlist={allowlist} onAllowlist={setAllowlist} />
        <IncidentTimelinePanel
          incidents={snapshot.incidents}
          operator={operator}
          onReview={(id, state, note) => review(id, state, operator, note)}
          onOpenEvidence={() => document.getElementById("arvision-evidence")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />
        <DetectorHealthPanel detectors={snapshot.detectors} />
        <div id="arvision-evidence" />
        <EvidencePanel
          bundles={snapshot.bundles}
          storage={snapshot.storage}
          bufferFrames={snapshot.bufferFrames}
          onDelete={deleteBundle}
        />
        <SafetyRulesPanel rules={snapshot.rules} rejected={snapshot.rejectedRules} onChange={setRules} />
      </div>
    </div>
  );
};

export default SafetyView;
