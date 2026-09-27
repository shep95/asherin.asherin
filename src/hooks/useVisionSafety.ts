// asherin.arvision — react binding for the camera safety layer.
//
// The bridge is a plain singleton so the camera loop can reach it without React
// in the way. This hook is the only thing the interface needs: one snapshot of
// what the detectors currently believe, one list of notifications, and the
// handful of controls an administrator is allowed to turn.

import { useCallback, useEffect, useState } from "react";
import { visionSafety, type VisionSnapshot } from "@/lib/arvision/vision/bridge";
import { safetyNotifier, type NotifierChannelState, type NotifyChannel, type SafetyNotification } from "@/lib/arvision/safety/notify";
import type { SafetyZone } from "@/lib/arvision/vision/zones";
import type { VisionEngineConfig } from "@/lib/arvision/vision/types";

export function useVisionSafety() {
  const [snapshot, setSnapshot] = useState<VisionSnapshot>(() => visionSafety().snapshot());
  const [notifications, setNotifications] = useState<SafetyNotification[]>(() => safetyNotifier().list());
  const [channels, setChannels] = useState<NotifierChannelState[]>(() => safetyNotifier().channels());

  useEffect(() => visionSafety().subscribe(setSnapshot), []);
  useEffect(
    () =>
      safetyNotifier().subscribe((list) => {
        setNotifications(list);
        setChannels(safetyNotifier().channels());
      }),
    [],
  );

  const setZones = useCallback((zones: SafetyZone[]) => visionSafety().setZones(zones), []);
  const setConfig = useCallback((patch: Partial<VisionEngineConfig>) => visionSafety().setConfig(patch), []);
  const setChannel = useCallback((channel: NotifyChannel, on: boolean) => safetyNotifier().setChannel(channel, on), []);
  const markRead = useCallback((id: string) => safetyNotifier().markRead(id), []);
  const acknowledge = useCallback((id: string) => safetyNotifier().acknowledge(id), []);

  return {
    snapshot,
    notifications,
    channels,
    unread: notifications.filter((n) => n.status === "unread").length,
    setZones,
    setConfig,
    setChannel,
    markRead,
    acknowledge,
  };
}
