// eagle.eye — system layer: integrations and the capability matrix.
//
// Two tables, one purpose. The first says which software and standards this
// console depends on, how each one is licensed, and whether it is actually
// answering right now. The second says, per authorized device, exactly what
// that device can and cannot do — and it is the same computation that decides
// which controls the rest of the console is allowed to draw.

import { useMemo, useState } from "react";
import { Cpu, Plug, RefreshCw } from "lucide-react";
import { useSensorRegistry } from "@/hooks/useSensorRegistry";
import { loadSite } from "@/lib/arvision/sensors/site";
import { buildIntegrationCatalog } from "@/lib/arvision/integrations/catalog";
import { buildDeviceMatrix, controlsFor, matrixSummary } from "@/lib/arvision/integrations/matrix";
import {
  CAPABILITY_LABEL, CAPABILITY_STATE_LABEL, INTEGRATION_STATE_LABEL, LICENCE_LABEL,
  type CapabilityState, type IntegrationState, type LicenceClass,
} from "@/lib/arvision/integrations/types";

const CAP_STYLE: Record<CapabilityState, string> = {
  available: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200/90",
  unavailable: "border-amber-400/25 bg-amber-400/10 text-amber-200/85",
  unsupported: "border-white/10 bg-white/[0.03] text-white/40",
  requires_edge: "border-sky-400/20 bg-sky-400/[0.07] text-sky-200/80",
  not_configured: "border-white/12 bg-white/[0.04] text-white/50",
  unknown: "border-white/10 bg-white/[0.02] text-white/35",
};

const INT_STYLE: Record<IntegrationState, string> = {
  connected: "text-emerald-200/90",
  in_browser: "text-emerald-200/80",
  configured_offline: "text-amber-200/85",
  not_configured: "text-white/45",
  contract_only: "text-sky-200/70",
};

const LICENCE_STYLE: Record<LicenceClass, string> = {
  free_open_source: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200/80",
  free_standard: "border-sky-400/20 bg-sky-400/[0.07] text-sky-200/80",
  optional_paid: "border-amber-400/20 bg-amber-400/[0.07] text-amber-200/80",
  unavailable_until_connected: "border-white/12 bg-white/[0.03] text-white/45",
};

/** `localInferenceReady` is true only when an on-device model object actually
 * finished loading in this tab — never when it is merely being fetched. */
export default function CapabilityMatrixPanel({ localInferenceReady = false }: { localInferenceReady?: boolean }) {
  const { snapshot, services, refreshServices, discovering, discover } = useSensorRegistry("daylight_observation");
  const site = useMemo(() => loadSite(), []);
  const [openDevice, setOpenDevice] = useState<string | null>(null);

  const catalog = useMemo(
    () => buildIntegrationCatalog(services, snapshot.adapters),
    [services, snapshot.adapters],
  );
  const edgeConnected = snapshot.adapters.some((a) => a.id === "edge_bridge" && a.reachable);

  const rows = useMemo(() => {
    // Every authorized device, plus any live stream the operator has not yet
    // written into the site file. An unregistered device still gets a row: the
    // absence of a stream is itself the answer.
    const seen = new Set<string>();
    const out = site.devices.map((d) => {
      const sensor =
        snapshot.sensors.find((s) => s.id === d.sourceRef) ??
        snapshot.sensors.find((s) => s.id === d.id) ??
        null;
      if (sensor) seen.add(sensor.id);
      return buildDeviceMatrix({
        deviceId: d.id,
        name: d.name,
        sensor,
        declared: null,
        services,
        localInferenceReady,
        edgeConnected,
      });
    });
    for (const s of snapshot.sensors) {
      if (seen.has(s.id)) continue;
      out.push(
        buildDeviceMatrix({
          deviceId: s.id,
          name: `${s.label} — not in the site file`,
          sensor: s,
          declared: null,
          services,
          localInferenceReady,
          edgeConnected,
        }),
      );
    }
    return out;
  }, [site.devices, snapshot.sensors, services, edgeConnected, localInferenceReady]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[13px] font-light text-white/85">
            <Plug className="h-3.5 w-3.5" /> integrations and capability matrix
          </h2>
          <p className="text-[11px] font-light text-white/40">
            what this console runs on, how it is licensed, and exactly what each authorized device can do
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void discover()}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-light text-white/70 transition hover:border-white/30 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${discovering ? "animate-spin" : ""}`} /> rediscover devices
          </button>
          <button
            type="button"
            onClick={() => void refreshServices()}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[11px] font-light text-white/70 transition hover:border-white/30 hover:text-white"
          >
            <Cpu className="h-3.5 w-3.5" /> recheck services
          </button>
        </div>
      </header>

      <ul className="mb-5 grid gap-1.5 sm:grid-cols-2">
        {catalog.map((e) => (
          <li key={e.id} className="rounded-xl border border-white/8 bg-black/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] font-light text-white/85">{e.label}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] tracking-wide ${LICENCE_STYLE[e.licence]}`}>
                {LICENCE_LABEL[e.licence]}
              </span>
            </div>
            <p className="mt-1 text-[11px] font-light leading-relaxed text-white/45">{e.role}</p>
            <p className={`mt-1 text-[11px] font-light ${INT_STYLE[e.state]}`}>
              {INTEGRATION_STATE_LABEL[e.state]} — {e.detail}
            </p>
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-white/8 bg-black/30 px-3 py-4 text-[12px] font-light text-white/45">
          no device is authorized or connected yet. add a device in the site authorization panel, or grant camera
          permission, and its real capabilities will be read here.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const open = openDevice === row.deviceId;
            const controls = controlsFor(row);
            return (
              <li key={row.deviceId} className="rounded-xl border border-white/10 bg-black/30">
                <button
                  type="button"
                  onClick={() => setOpenDevice(open ? null : row.deviceId)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-light text-white/85">{row.name}</p>
                    <p className="text-[11px] font-light text-white/40">
                      {row.modality ?? "no registered stream"} · {row.transport.replace(/_/g, " ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-light text-white/40">{matrixSummary(row)}</span>
                </button>

                {open && (
                  <div className="border-t border-white/8 p-3">
                    <div className="grid gap-1 sm:grid-cols-2">
                      {row.cells.map((c) => (
                        <div key={c.capability} className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5">
                          <div className="min-w-0">
                            <p className="text-[11px] font-light text-white/70">{CAPABILITY_LABEL[c.capability]}</p>
                            <p className="text-[10px] font-light leading-relaxed text-white/35">{c.reason}</p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] ${CAP_STYLE[c.state]}`}>
                            {CAPABILITY_STATE_LABEL[c.state]}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] font-light text-white/40">
                      controls this device may offer:{" "}
                      {controls.length === 0 ? "none — nothing about it is available yet" : controls.join(", ").replace(/_/g, " ")}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
