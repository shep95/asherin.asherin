// asherin.arvision — react binding for the safety hub.
//
// Subscribes to the tab-level hub, keeps the sweep running while a safety
// surface is mounted, and hands back the operator actions. It holds no state of
// its own, so two panels can never disagree about what was heard.

import { useCallback, useEffect, useState } from "react";
import { safetyHub, type SafetySnapshot } from "@/lib/arvision/safety/hub";
import type { BleAllowlistEntry } from "@/lib/arvision/ble/types";
import type { ReviewState } from "@/lib/arvision/safety/incidents";
import type { RuleFiring, SafetyRule } from "@/lib/arvision/safety/rules";
import type { EvidenceFrame } from "@/lib/arvision/safety/evidenceCapture";

export function useSafetyConsole() {
  const hub = safetyHub();
  const [snapshot, setSnapshot] = useState<SafetySnapshot>(() => hub.snapshot());

  useEffect(() => {
    hub.start();
    return hub.subscribe(setSnapshot);
  }, [hub]);

  const review = useCallback(
    (id: string, state: ReviewState, by: string, note?: string) => hub.review(id, state, by, note),
    [hub],
  );
  const report = useCallback((firing: RuleFiring, detectorId: string) => hub.report(firing, detectorId), [hub]);
  const setRules = useCallback((rules: SafetyRule[]) => hub.setRules(rules), [hub]);
  const setAllowlist = useCallback((entries: BleAllowlistEntry[]) => hub.setAllowlist(entries), [hub]);
  const pushFrame = useCallback((frame: EvidenceFrame) => hub.pushFrame(frame), [hub]);
  const bundle = useCallback((id: string) => hub.bundle(id), [hub]);
  const deleteBundle = useCallback((id: string) => hub.deleteBundle(id), [hub]);
  const observationsFor = useCallback((key: string) => hub.observationsFor(key), [hub]);

  return { snapshot, review, report, setRules, setAllowlist, pushFrame, bundle, deleteBundle, observationsFor };
}
