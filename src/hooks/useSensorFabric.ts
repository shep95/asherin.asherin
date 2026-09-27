// asherin — react binding for the shared sensor fabric.
//
// Booting both bridges here is deliberate: whichever console opens first gets
// the whole fabric, so Eagle Eye shows sentinel's lanes and sentinel's radio
// even when the operator never opened the sentinel room in this session, and
// the sentinel room can show camera events for the same reason.

import { useCallback, useEffect, useMemo, useState } from "react";
import { sensorFabric, type FabricSnapshot } from "@/lib/fabric/fabric";
import { bootSentinelFabric } from "@/lib/fabric/bridges/sentinelFabric";
import { bootVisionFabric } from "@/lib/fabric/bridges/visionFabric";
import { assertHumanLink } from "@/lib/fabric/correlate";
import { bindZone, listZoneBindings } from "@/lib/fabric/zoneBinding";
import type { FabricObservation } from "@/lib/fabric/types";

export function useSensorFabric() {
  const [snapshot, setSnapshot] = useState<FabricSnapshot>(() => sensorFabric().snapshot());
  const [bindings, setBindings] = useState(() => listZoneBindings());

  useEffect(() => {
    bootSentinelFabric();
    bootVisionFabric();
    return sensorFabric().subscribe(setSnapshot);
  }, []);

  const bind = useCallback((sensorId: string, zoneId: string, zoneLabel: string, by: string) => {
    bindZone(sensorId, zoneId, zoneLabel, by);
    setBindings(listZoneBindings());
  }, []);

  const link = useCallback((observations: FabricObservation[], by: string, reason: string) => {
    sensorFabric().recordCorrelation(assertHumanLink(observations, by, reason));
  }, []);

  const byModality = useMemo(() => {
    const map = new Map<string, typeof snapshot.sensors>();
    for (const s of snapshot.sensors) map.set(s.modality, [...(map.get(s.modality) ?? []), s]);
    return map;
  }, [snapshot.sensors]);

  return { snapshot, bindings, byModality, bind, link };
}
