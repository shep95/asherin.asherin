// asherin.arvision — sensors layer.
//
// The layer that tells the truth about the other layers: what hardware is
// actually connected, which modes that hardware can honestly serve, where the
// fusion pipeline stops, whether a 3d world model can exist, which backend
// services answer, and which devices this company is authorized to operate.

import { useState } from "react";
import { useSensorRegistry } from "@/hooks/useSensorRegistry";
import type { FusionTask } from "@/lib/arvision/sensors/fusion";
import SensorRegistryPanel from "./SensorRegistryPanel";
import ModeMatrixPanel from "./ModeMatrixPanel";
import FusionPanel from "./FusionPanel";
import ServiceHealthPanel from "./ServiceHealthPanel";
import WorldModelPanel from "./WorldModelPanel";
import PerceptionPanel from "./PerceptionPanel";
import SiteAuthorizationPanel from "./SiteAuthorizationPanel";

const SensorsView = () => {
  const [task, setTask] = useState<FusionTask>("daylight_observation");
  const { snapshot, services, world, modes, selection, stages, discovering, discover, refreshServices, open, close } =
    useSensorRegistry(task);

  return (
    <div className="h-full w-full overflow-y-auto bg-black">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 pb-10 sm:p-4">
        <SensorRegistryPanel
          snapshot={snapshot}
          discovering={discovering}
          onDiscover={() => void discover()}
          onOpen={(id) => void open(id)}
          onClose={close}
        />
        <ModeMatrixPanel modes={modes} />
        <FusionPanel stages={stages} selection={selection} task={task} onTask={setTask} />
        <WorldModelPanel world={world} />
        <PerceptionPanel services={services} tracks={[]} />
        <ServiceHealthPanel services={services} onRefresh={() => void refreshServices()} />
        <SiteAuthorizationPanel sensors={snapshot.sensors} />
      </div>
    </div>
  );
};

export default SensorsView;
