// asherin.arvision — registry, services and world model as one hook.
//
// The registry is a tab singleton so switching layers never re-opens hardware.
// Every value here is either observed by an adapter or explicitly unavailable.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sensorRegistry } from "@/lib/arvision/sensors/registry";
import { WorldModel } from "@/lib/arvision/sensors/worldModel";
import { probeServices } from "@/lib/arvision/sensors/services";
import { autoSelect, fusionStages, type FusionTask } from "@/lib/arvision/sensors/fusion";
import { evaluateModes } from "@/lib/arvision/sensors/modes";
import type { RegistrySnapshot, ServiceHealth, WorldModelState } from "@/lib/arvision/sensors/types";

const EMPTY: RegistrySnapshot = { sensors: [], adapters: [], atMs: 0 };

export function useSensorRegistry(task: FusionTask = "daylight_observation") {
  const registry = useMemo(() => sensorRegistry(), []);
  const worldRef = useRef<WorldModel>(new WorldModel());
  const [snapshot, setSnapshot] = useState<RegistrySnapshot>(EMPTY);
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [world, setWorld] = useState<WorldModelState>({
    available: false,
    missing: [],
    pointCount: 0,
    chunks: 0,
    lastUpdateMs: null,
    extentM: null,
    sourceSensorIds: [],
  });
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    const off = registry.subscribe(setSnapshot);
    registry.onPointCloud((chunk) => {
      worldRef.current.ingest(chunk);
      setWorld(worldRef.current.state(registry.snapshot().sensors));
    });
    registry.startHealthSweep();
    registry.connectBridge();
    return off;
  }, [registry]);

  const discover = useCallback(async () => {
    setDiscovering(true);
    try {
      await registry.discover();
    } finally {
      setDiscovering(false);
    }
  }, [registry]);

  const refreshServices = useCallback(async () => {
    setServices(await probeServices());
  }, []);

  useEffect(() => {
    void discover();
    void refreshServices();
  }, [discover, refreshServices]);

  useEffect(() => {
    setWorld(worldRef.current.state(snapshot.sensors));
  }, [snapshot.sensors]);

  useEffect(() => {
    const onChange = () => void discover();
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChange);
  }, [discover]);

  const modes = useMemo(() => evaluateModes(snapshot.sensors), [snapshot.sensors]);
  const selection = useMemo(() => autoSelect(task, snapshot.sensors), [task, snapshot.sensors]);
  const stages = useMemo(
    () => fusionStages({ sensors: snapshot.sensors, services, pointCount: world.pointCount }),
    [snapshot.sensors, services, world.pointCount],
  );

  return {
    registry,
    snapshot,
    services,
    world,
    modes,
    selection,
    stages,
    discovering,
    discover,
    refreshServices,
    open: (id: string) => registry.open(id),
    close: (id: string) => registry.close(id),
  };
}
