// asherin.arvision — what the other subsystems observed.
//
// The camera console's blind spot has always been that it can only see. The
// same building has sentinel microphones and bluetooth receivers already
// running, and their observations belong on this page — as their own
// observations, from their own named devices, never redrawn as camera evidence.
//
// The zone binding control below is the only way a sentinel lane can ever be
// correlated with a camera zone, because nothing measurable connects a
// microphone to a polygon. It is recorded as a human association and every
// correlation that rests on it says so.

import { useMemo, useState } from "react";
import { Bluetooth, Mic, MapPin, Radar } from "lucide-react";
import { useSensorFabric } from "@/hooks/useSensorFabric";
import { ZONE_BINDING_NOTE } from "@/lib/fabric/zoneBinding";
import type { SafetyZone } from "@/lib/arvision/vision/zones";

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });

export default function CrossModalPanel({ zones, operator }: { zones: SafetyZone[]; operator: string }) {
  const { snapshot, bindings, bind } = useSensorFabric();
  const [pending, setPending] = useState<Record<string, string>>({});

  const bindable = useMemo(
    () => snapshot.sensors.filter((s) => s.subsystem === "sentinel" || s.modality === "radio" || s.modality === "vision"),
    [snapshot.sensors],
  );

  const foreign = useMemo(
    () =>
      [...snapshot.observations]
        .filter((o) => o.provenance.subsystem === "sentinel")
        .sort((a, b) => b.atMs - a.atMs)
        .slice(0, 20),
    [snapshot.observations],
  );

  const regions = useMemo(
    () => snapshot.observations.filter((o) => o.type === "radio_region").slice(-6).reverse(),
    [snapshot.observations],
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <Radar className="h-3.5 w-3.5 text-white/50" />
        <h2 className="text-[12.5px] font-light text-white/85">other authorized sensors in this space</h2>
      </div>
      <p className="mt-1 text-[10.5px] font-light leading-relaxed text-white/40">
        sound, radio and location observations published by asherin.sentinel on this account. they are shown as what they are —
        another device's observation — and are never converted into visual evidence.
      </p>

      {/* zone bindings */}
      <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-2.5">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-white/35">zone bindings</div>
        {bindable.length === 0 ? (
          <div className="text-[10.5px] font-light text-white/35">no sensor is registered in the fabric yet.</div>
        ) : (
          bindable.map((s) => {
            const current = bindings.find((b) => b.sensorId === s.id);
            return (
              <div key={s.id} className="mb-1.5 flex flex-wrap items-center gap-2 last:mb-0">
                <span className="min-w-0 flex-1 truncate text-[11px] font-light text-white/70">{s.label}</span>
                <select
                  value={pending[s.id] ?? current?.zoneId ?? ""}
                  onChange={(e) => {
                    setPending((p) => ({ ...p, [s.id]: e.target.value }));
                    const zone = zones.find((z) => z.id === e.target.value);
                    bind(s.id, zone?.id ?? "", zone?.label ?? "", operator);
                  }}
                  className="rounded-lg border border-white/12 bg-black/60 px-2 py-1 text-[10.5px] font-light text-white/70"
                >
                  <option value="">no zone declared</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })
        )}
        <div className="mt-1 text-[9.5px] font-light leading-relaxed text-white/25">{ZONE_BINDING_NOTE}</div>
      </div>

      {/* radio uncertainty regions */}
      <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/35">
          <Bluetooth className="h-3 w-3" /> radio positioning
        </div>
        {regions.length === 0 ? (
          <div className="text-[10.5px] font-light leading-relaxed text-white/40">
            no uncertainty region exists. a region requires several authorized receivers with surveyed positions; with one receiver
            the only honest output is a sighting and a rough range, and nothing may be drawn over a camera image.
          </div>
        ) : (
          regions.map((o) => (
            <div key={o.id} className="mb-1.5 text-[10.5px] font-light leading-relaxed text-white/60 last:mb-0">
              <div>{o.summary}</div>
              <div className="text-white/30">
                {o.type === "radio_region" ? `${o.region.method.replace(/_/g, " ")} · ${o.region.receiverIds.length} receivers · ${o.region.limitation}` : ""}
              </div>
            </div>
          ))
        )}
      </div>

      {/* sentinel observations */}
      <div className="mt-2 rounded-xl border border-white/10 bg-black/30 p-2.5">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-white/35">sentinel observations</div>
        {foreign.length === 0 ? (
          <div className="text-[10.5px] font-light leading-relaxed text-white/40">
            asherin.sentinel has published nothing into the fabric in this session. its lanes may simply not be running — an empty
            list here is a statement about coverage, not about the room.
          </div>
        ) : (
          foreign.map((o) => (
            <div key={o.id} className="mb-1 flex items-start gap-2 last:mb-0">
              <span className="w-[62px] shrink-0 text-[10px] font-light tabular-nums text-white/30">{clock(o.atMs)}</span>
              {o.modality === "audio" ? (
                <Mic className="mt-[3px] h-3 w-3 shrink-0 text-white/30" />
              ) : o.modality === "location" ? (
                <MapPin className="mt-[3px] h-3 w-3 shrink-0 text-white/30" />
              ) : (
                <Bluetooth className="mt-[3px] h-3 w-3 shrink-0 text-white/30" />
              )}
              <div className="min-w-0">
                <div className="truncate text-[11px] font-light text-white/70">{o.summary}</div>
                <div className="truncate text-[9.5px] font-light text-white/25">
                  {o.provenance.sensorLabel} · {o.provenance.note}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
