// asherin.arvision — passive radio awareness.
//
// Every row here is a broadcast someone's equipment made on its own. The panel
// keeps three distinctions visible at all times, because collapsing any one of
// them would turn observation into a claim:
//   • RADIO-DETECTED is not CAMERA-DETECTED. a radio row is never a person.
//   • an association is not an identity. pseudonymous rows say so.
//   • a range is not a position. a position appears only when three calibrated
//     surveyed receivers produced one.

import { useMemo, useState } from "react";
import type { BleAllowlistEntry, BleDeviceRecord } from "@/lib/arvision/ble/types";
import type { SafetySnapshot } from "@/lib/arvision/safety/hub";

const modeLabel = (r: BleDeviceRecord) => {
  const l = r.localization;
  if (l.mode === "multilateration" && l.position) {
    return `positioned ±${l.uncertaintyM}m · ${l.scannerCount} receivers`;
  }
  if (l.mode === "range_only") return `≈${l.rangeM}m ±${l.uncertaintyM}m · direction unknown`;
  return "no location";
};

const RadioAwarenessPanel = ({
  snapshot,
  allowlist,
  onAllowlist,
}: {
  snapshot: SafetySnapshot;
  allowlist: BleAllowlistEntry[];
  onAllowlist: (entries: BleAllowlistEntry[]) => void;
}) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const devices = snapshot.devices;
  const record = useMemo(() => devices.find((d) => d.key === selected) ?? null, [devices, selected]);

  const addToAllowlist = () => {
    if (!record || !label.trim()) return;
    const entry: BleAllowlistEntry = {
      match: record.addresses[record.addresses.length - 1] ?? record.key,
      label: label.trim(),
      note: `added by an operator on ${new Date().toISOString()}`,
    };
    onAllowlist([...allowlist.filter((e) => e.match !== entry.match), entry]);
    setLabel("");
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-light text-white/85">passive radio awareness</h2>
          <p className="text-[11px] font-light text-white/40">
            bluetooth advertisements heard by authorized scanners. listening only — nothing here pairs, connects or reads a device.
          </p>
        </div>
        <span className="text-[10px] font-light text-white/35">
          {snapshot.scanners.length} scanner{snapshot.scanners.length === 1 ? "" : "s"} · {devices.length} radios
        </span>
      </header>

      {snapshot.radioAvailability ? (
        <p className="rounded-xl border border-amber-200/20 bg-amber-200/[0.05] p-3 text-[11px] font-light leading-relaxed text-amber-100/70">
          {snapshot.radioAvailability}
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {devices.length === 0 && (
              <li className="rounded-xl border border-white/10 bg-black/30 p-3 text-[11px] font-light text-white/40">
                scanners are connected but no advertisement has been heard yet.
              </li>
            )}
            {devices.map((d) => (
              <li key={d.key}>
                <button
                  type="button"
                  onClick={() => setSelected(d.key === selected ? null : d.key)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${
                    d.key === selected ? "border-white/25 bg-white/[0.06]" : "border-white/10 bg-black/30 hover:border-white/20"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] font-light text-white/90">
                      {d.knownLabel ?? d.handle}
                      <span className="ml-2 rounded border border-sky-300/25 px-1 text-[9px] uppercase tracking-wide text-sky-200/70">
                        radio detected
                      </span>
                    </span>
                    <span className={`text-[10px] ${d.stale ? "text-white/30" : "text-emerald-200/70"}`}>
                      {d.stale ? "silent" : `${d.lastRssi} dBm`}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-light text-white/45">
                    {d.classification.category}
                    {d.classification.vendor ? ` · ${d.classification.vendor}` : ""} · confidence {d.classification.confidence}
                  </p>
                  <p className="mt-0.5 text-[10px] font-light text-white/35">{modeLabel(d)}</p>
                  {d.pseudonymous && (
                    <p className="mt-0.5 text-[10px] font-light text-white/30">
                      rotating address — grouped pseudonymously, not identified
                    </p>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            {!record ? (
              <p className="text-[11px] font-light text-white/40">select a radio to see the evidence behind its row.</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <h3 className="text-[12px] font-light text-white/85">{record.knownLabel ?? record.handle}</h3>
                  <p className="text-[10px] font-light text-white/35">
                    heard {record.observations} times · first {new Date(record.firstSeenMs).toLocaleTimeString()} · address type {record.addressType.replace(/_/g, " ")}
                  </p>
                  {Math.abs(record.clockSkewMs) > 2000 && (
                    <p className="mt-1 text-[10px] font-light text-amber-100/70">
                      the reporting scanner's clock differs from this session by {Math.round(record.clockSkewMs / 1000)}s
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wide text-white/30">classification evidence</p>
                  <ul className="mt-1 space-y-1">
                    {record.classification.evidence.map((e, i) => (
                      <li key={i} className="text-[11px] font-light leading-relaxed text-white/50">— {e}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wide text-white/30">location evidence</p>
                  {record.localization.limitation && (
                    <p className="mt-1 text-[11px] font-light leading-relaxed text-amber-100/60">
                      {record.localization.limitation}
                    </p>
                  )}
                  <ul className="mt-1 space-y-1">
                    {record.localization.evidence.map((e, i) => (
                      <li key={i} className="text-[11px] font-light leading-relaxed text-white/50">— {e}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wide text-white/30">timeline</p>
                  <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">
                    {record.timeline.slice().reverse().map((t) => (
                      <li key={t.id} className="text-[11px] font-light text-white/45">
                        <span className="text-white/30">{new Date(t.atMs).toLocaleTimeString()} </span>
                        {t.detail}
                        <span className="text-white/25"> · {t.provenance}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-2">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="label this as company equipment"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] font-light text-white/80 outline-none placeholder:text-white/25 focus:border-white/25"
                  />
                  <button
                    type="button"
                    onClick={addToAllowlist}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-light text-white/70 hover:border-white/30"
                  >
                    allowlist
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default RadioAwarenessPanel;
