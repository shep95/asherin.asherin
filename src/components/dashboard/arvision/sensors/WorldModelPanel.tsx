// asherin.arvision — 3d world model state.
// Points come from a ranging sensor through the edge bridge. When they do not,
// the panel says so and lists the prerequisites instead of drawing a cloud.

import type { WorldModelState } from "@/lib/arvision/sensors/types";

const WorldModelPanel = ({ world }: { world: WorldModelState }) => (
  <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
    <header className="mb-3">
      <h2 className="text-[13px] font-light text-white/85">3d world model</h2>
      <p className="text-[11px] font-light text-white/40">continuously updated from measured range data, or not at all</p>
    </header>

    {!world.available ? (
      <div className="rounded-xl border border-white/10 bg-black/30 p-3">
        <p className="text-[12px] font-light text-white/80">3d reconstruction unavailable</p>
        <ul className="mt-2 space-y-1">
          {world.missing.map((m) => (
            <li key={m} className="text-[11px] font-light text-white/45">
              missing: {m}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] font-light leading-relaxed text-white/35">
          a browser camera returns decoded colour frames only. reconstruction needs a depth, stereo or lidar stream
          published by an edge node, with a calibration between it and the colour camera.
        </p>
      </div>
    ) : (
      <div className="grid gap-1.5 sm:grid-cols-2">
        <p className="text-[11px] font-light text-white/60">points: {world.pointCount.toLocaleString()}</p>
        <p className="text-[11px] font-light text-white/60">chunks: {world.chunks}</p>
        <p className="text-[11px] font-light text-white/60">
          extent: {world.extentM ? `${world.extentM.x.toFixed(2)} x ${world.extentM.y.toFixed(2)} x ${world.extentM.z.toFixed(2)} m` : "—"}
        </p>
        <p className="text-[11px] font-light text-white/60">
          updated: {world.lastUpdateMs ? new Date(world.lastUpdateMs).toLocaleTimeString() : "—"}
        </p>
        <p className="text-[11px] font-light text-white/40 sm:col-span-2">
          sources: {world.sourceSensorIds.join(", ") || "—"}
        </p>
      </div>
    )}
  </section>
);

export default WorldModelPanel;
