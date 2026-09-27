// asherin.arvision — room shell.
//
// Two layers live here. The optical layer is the existing head up display over
// the device camera. The spatial layer is the capability set from the uploaded
// see-through-walls package: map positioning, indoor routing with spoken turn by
// turn guidance, a shared live session, and the silhouette view for people behind
// geometry. The shell keeps both reachable on a phone without either one being
// cropped: the switch is a pair of pills that sit above the layer, and each layer
// owns its own scrolling.

import { Suspense, useState } from "react";
import { Cpu, Eye, Radar, ScanEye, ShieldCheck } from "lucide-react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import OpticalHudView from "./OpticalHudView";

// Retry-aware so an aborted or stale chunk fetch surfaces or recovers instead
// of leaving the layer stuck on its loading line forever.
const SpatialView = lazyWithRetry(() => import("./spatial/SpatialView"), "arvision-spatial");
// Eagle owns ARVision's radio ledger. Keep its mounted instance alive across
// optical/spatial/eagle switches so nearby-radio monitoring and one-second
// history do not reset merely because the operator changed the visible layer.
const EagleEyeView = lazyWithRetry(() => import("./eagle/EagleEyeView"), "arvision-eagle");
// The sensors layer is the room's honesty surface: connected hardware, the
// modes that hardware can physically serve, and where the pipeline stops.
const SensorsView = lazyWithRetry(() => import("./sensors/SensorsView"), "arvision-sensors");
// The safety layer holds the claims that must never be guessed: what the radios
// in the building broadcast, which configured thresholds were exceeded, whether
// the detectors behind them are alive, and where evidence actually goes.
const SafetyView = lazyWithRetry(() => import("./safety/SafetyView"), "arvision-safety");


type Layer = "optical" | "spatial" | "eagle" | "sensors" | "safety";

const LAYERS: { id: Layer; label: string; hint: string; icon: typeof Eye }[] = [
  { id: "optical", label: "optical", hint: "camera head up display", icon: Eye },
  { id: "spatial", label: "spatial", hint: "map, route, session, see through", icon: Radar },
  { id: "eagle", label: "eagle.eye", hint: "multi camera behavioural watch with reviewable evidence", icon: ScanEye },
  { id: "sensors", label: "sensors", hint: "connected streams, capabilities, fusion state, services", icon: Cpu },
  { id: "safety", label: "safety", hint: "passive radio awareness, event rules, incidents, evidence", icon: ShieldCheck },
];


const AsherinArVisionView = () => {
  const [layer, setLayer] = useState<Layer>("optical");

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-black">
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/8 bg-black/80 px-3 py-2 backdrop-blur-xl">
        {LAYERS.map(({ id, label, hint, icon: Icon }) => {
          const active = layer === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setLayer(id)}
              aria-pressed={active}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-light transition ${
                active
                  ? "border-white/45 bg-white/[0.14] text-white"
                  : "border-white/12 bg-white/[0.04] text-white/60 hover:border-white/25 hover:text-white"
              }`}
              title={hint}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
        <span className="ml-auto hidden shrink-0 text-[11px] font-light text-white/35 sm:block">
          {LAYERS.find((l) => l.id === layer)?.hint}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className={`absolute inset-0 ${layer === "optical" ? "" : "pointer-events-none invisible"}`}>
          <OpticalHudView />
        </div>
        {layer === "spatial" && (
          <div className="absolute inset-0">
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center text-[12px] font-light text-white/45">
                  loading spatial layer
                </div>
              }
            >
            <SpatialView />
          </Suspense>
        </div>
      )}
        <div
          className={`absolute inset-0 ${layer === "eagle" ? "" : "pointer-events-none invisible"}`}
          aria-hidden={layer !== "eagle"}
        >
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center text-[12px] font-light text-white/45">
                loading eagle.eye layer
              </div>
            }
          >
            <EagleEyeView />
          </Suspense>
        </div>
        {layer === "sensors" && (
          <div className="absolute inset-0">
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center text-[12px] font-light text-white/45">
                  loading sensors layer
                </div>
              }
            >
              <SensorsView />
            </Suspense>
          </div>
        )}
        {layer === "safety" && (
          <div className="absolute inset-0">
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center text-[12px] font-light text-white/45">
                  loading safety layer
                </div>
              }
            >
              <SafetyView />
            </Suspense>
          </div>
        )}
      </div>

    </div>
  );
};

export default AsherinArVisionView;
