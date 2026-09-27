// eagle.eye — radio intelligence surface.
//
// the operator's complaint was concrete: the only thing the platform ever showed
// them was the browser's raw pairing sheet, a wall of "unknown or unsupported
// device" rows with a truncated address and nothing else. no distance, no time,
// no history, no way to tell a phone walking past from a beacon bolted to a wall.
//
// this panel is the answer. it runs the ledger at one hertz, prints distance in
// feet with the direction of travel, keeps the whole session in a scrollable log
// with a timeline scrubber over it, separates rotating privacy addresses from
// permanent hardware addresses, and opens a full card per device. the pairing
// dialog is ours — the browser sheet only ever appears when the operator asks
// for the deeper read that requires it, and the dialog says so before it opens.
//
// it lays out as a single column on a phone and as three panes on a desktop, so
// the same surface works on the handset the screenshot came from.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bluetooth, Download, Radar, Shield, X, Activity, Clock, Users, RefreshCw, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  clearPersistedLedger, createLedger, ledgerToCsv, ledgerToJson, movementTrail, persistLedger,
  restoreLedger, signatureLabel, tickLedger, trackLabel, type DeviceTrack, type LedgerInput,
  type LedgerState, type LogLine,
} from "./radioLedger";

interface Props {
  /** the live roster, refreshed by the passive advertisement scan. */
  roster: LedgerInput[];
  scanning: boolean;
  scanSupported: boolean;
  scanNote: string;
  onToggleScan: () => void;
  /** opens the browser's own chooser for the deeper, connected read. */
  onPickDevice: () => void;
  pickSupported: boolean;
}

type Lane = "all" | "randomized" | "public";

const EVENT_STYLE: Record<LogLine["event"], string> = {
  sample: "text-white/45",
  appeared: "text-emerald-200/80",
  returned: "text-amber-200/80",
  lost: "text-rose-200/70",
  cluster: "text-sky-200/85",
};

function clockOf(t: number) {
  return new Date(t).toLocaleTimeString([], { hour12: false });
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

/** twelve rssi buckets as a bar strip — the shape tells the operator whether a
 * radio holds one band (parked), spreads wide (circling), or drifts one way. */
function HeatStrip({ heat }: { heat: number[] }) {
  const max = Math.max(1, ...heat);
  return (
    <div className="flex h-6 items-end gap-[2px]" aria-hidden>
      {heat.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px] bg-sky-300/60"
          style={{ height: `${Math.max(6, (v / max) * 100)}%`, opacity: v === 0 ? 0.12 : 0.35 + (v / max) * 0.65 }}
        />
      ))}
    </div>
  );
}

function Sparkline({ track }: { track: DeviceTrack }) {
  const pts = track.samples.slice(-90).map((s) => s.feet).filter((f): f is number => f !== null);
  if (pts.length < 2) return <div className="text-[10.5px] text-white/30">not enough seconds for a graph yet</div>;
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const span = Math.max(0.5, max - min);
  const d = pts
    .map((f, i) => `${(i / (pts.length - 1)) * 100},${100 - ((f - min) / span) * 100}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full">
      <polyline points={d} fill="none" stroke="rgba(125,211,252,0.75)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function RadioIntelPanel({
  roster, scanning, scanSupported, scanNote, onToggleScan, onPickDevice, pickSupported,
}: Props) {
  const [ledger, setLedger] = useState<LedgerState>(() => restoreLedger() ?? createLedger());
  const [lane, setLane] = useState<Lane>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  // the scrubber: 1 means "now", anything less freezes the log at that point in
  // the session so the operator can read back without the feed scrolling away.
  const [scrub, setScrub] = useState(1);
  const rosterRef = useRef<LedgerInput[]>(roster);
  rosterRef.current = roster;
  const logRef = useRef<HTMLDivElement | null>(null);

  // one tick per second, always — the ledger is the record, so it keeps its
  // cadence whether or not the panel is the thing on screen.
  useEffect(() => {
    if (!scanning) return;
    const id = window.setInterval(() => {
      setLedger((prev) => tickLedger(prev, rosterRef.current, Date.now()));
    }, 1_000);
    return () => window.clearInterval(id);
  }, [scanning]);

  // persistence is throttled: writing 60k log lines every second would stall
  // the main thread and tell the operator nothing new.
  useEffect(() => {
    const id = window.setInterval(() => persistLedger(ledger), 5_000);
    return () => window.clearInterval(id);
  }, [ledger]);

  const tracks = useMemo(() => {
    const all = Object.values(ledger.tracks);
    const filtered = lane === "all" ? all : all.filter((t) => t.macKind === lane);
    return filtered.sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      return (a.feet ?? 9_999) - (b.feet ?? 9_999);
    });
  }, [ledger.tracks, lane]);

  const spanMs = Math.max(1, ledger.lastTickMs - ledger.sessionStartMs);
  const cutoff = ledger.sessionStartMs + spanMs * scrub;
  const visibleLog = useMemo(() => {
    const rows = scrub >= 1 ? ledger.log : ledger.log.filter((l) => l.t <= cutoff);
    return rows.slice(-400).reverse();
  }, [ledger.log, scrub, cutoff]);

  useEffect(() => {
    if (scrub >= 1 && logRef.current) logRef.current.scrollTop = 0;
  }, [visibleLog.length, scrub]);

  const detail = selected ? ledger.tracks[selected] ?? null : null;
  const present = tracks.filter((t) => t.present).length;
  const randomized = Object.values(ledger.tracks).filter((t) => t.macKind === "randomized").length;

  const exportCsv = useCallback(() => {
    download(`asherin-radio-ledger-${Date.now()}.csv`, ledgerToCsv(ledger), "text/csv");
    toast.success("session log exported", { description: "one row per device per second, timestamped." });
  }, [ledger]);

  const exportJson = useCallback(() => {
    download(`asherin-radio-ledger-${Date.now()}.json`, ledgerToJson(ledger), "application/json");
    toast.success("session exported", { description: "devices, movement history, group events and the full log." });
  }, [ledger]);

  const resetSession = useCallback(() => {
    clearPersistedLedger();
    setLedger(createLedger());
    setSelected(null);
    setScrub(1);
    toast.message("session cleared", { description: "a new ledger starts from this second." });
  }, []);

  return (
    <div className="flex min-h-0 w-full flex-col gap-3">
      {/* header — wraps to two rows on a phone rather than clipping */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] p-2.5 sm:p-3">
        <div className="flex items-center gap-2 text-[12.5px] font-light text-white/80">
          <Radar className={`h-4 w-4 ${scanning ? "animate-pulse text-sky-300/80" : "text-white/40"}`} />
          <span>{scanning ? `automatic watch · ${present} radios in range` : scanSupported ? "automatic watch waiting for bluetooth permission" : "radio watch unavailable"}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" disabled={!scanSupported} onClick={onToggleScan}
            className={`h-8 rounded-full text-[12px] font-light ${scanning ? "bg-sky-400/15 text-sky-100 hover:bg-sky-400/25" : ""}`}
            variant={scanning ? "secondary" : "outline"}>
            <Radar className="mr-1.5 h-3.5 w-3.5" />{scanning ? "pause watch" : "grant & start"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPairOpen(true)} className="h-8 rounded-full text-[12px] font-light">
            <Bluetooth className="mr-1.5 h-3.5 w-3.5" />pair a device
          </Button>
          <Button size="sm" variant="ghost" onClick={exportCsv} className="h-8 rounded-full text-[12px] font-light">
            <Download className="mr-1.5 h-3.5 w-3.5" />csv
          </Button>
          <Button size="sm" variant="ghost" onClick={exportJson} className="h-8 rounded-full text-[12px] font-light">json</Button>
          <Button size="sm" variant="ghost" onClick={resetSession} className="h-8 rounded-full text-[12px] font-light text-white/50">
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />reset
          </Button>
        </div>
        {!scanSupported && <div className="w-full text-[10.5px] font-light leading-relaxed text-white/35">{scanNote}</div>}
      </div>

      {/* lanes + group events */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", "randomized", "public"] as Lane[]).map((l) => (
          <button key={l} onClick={() => setLane(l)}
            className={`rounded-full border px-3 py-1 text-[11.5px] font-light transition ${lane === l ? "border-white/25 bg-white/12 text-white/90" : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]"}`}>
            {l === "all" ? `all radios (${Object.keys(ledger.tracks).length})` : l === "randomized" ? `rotating addresses (${randomized})` : "hardware addresses"}
          </button>
        ))}
        {ledger.clusters.length > 0 && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-sky-300/25 bg-sky-400/10 px-3 py-1 text-[11.5px] font-light text-sky-100/85">
            <Users className="h-3.5 w-3.5" />{ledger.clusters.length} group arrival{ledger.clusters.length === 1 ? "" : "s"} flagged
          </span>
        )}
      </div>

      {/* body: stacks on a phone, three panes from lg up */}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* live feed */}
        <div className="min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-2.5">
          <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/35">live feed · distance in feet</div>
          {tracks.length === 0 && (
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[11.5px] font-light leading-relaxed text-white/40">
              {scanning
                ? "listening now. every observable radio broadcasting nearby appears here with its estimated distance, updated every second."
                : "bluetooth needs its one-time device permission before automatic monitoring can begin on this browser."}
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {tracks.map((t) => (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className={`rounded-xl border p-2.5 text-left transition ${t.present ? "border-white/12 bg-white/[0.04] hover:bg-white/[0.07]" : "border-white/8 bg-white/[0.015] opacity-60"}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.present ? "bg-emerald-300/80" : "bg-white/25"}`} />
                  <span className="truncate text-[12.5px] font-light text-white/85">{trackLabel(t)}</span>
                  <span className="ml-auto shrink-0 text-[13px] font-light tabular-nums text-white/90">
                    {t.feet === null ? "— ft" : `${t.feet} ft`}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10.5px] font-light text-white/40">
                  {t.mac ?? "address not exposed by this browser"} · {t.macKind === "randomized" ? "rotating privacy address" : t.macKind === "public" ? "hardware address" : "address kind unknown"}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10.5px] font-light text-white/45">
                  <Activity className="h-3 w-3" />{t.signature}
                  <Clock className="ml-1 h-3 w-3" />{t.dwellSeconds}s in range
                </div>
                <div className="mt-1 truncate text-[10.5px] font-light tabular-nums text-white/55">{movementTrail(t)}</div>
                <div className="mt-1.5"><HeatStrip heat={t.heat} /></div>
              </button>
            ))}
          </div>
        </div>

        {/* log + scrubber */}
        <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-2.5">
          <div className="mb-1.5 flex items-center gap-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">session log</div>
            <div className="ml-auto text-[10.5px] font-light tabular-nums text-white/35">{ledger.log.length} entries</div>
          </div>
          <div className="mb-2">
            <input
              type="range" min={0} max={1} step={0.001} value={scrub}
              onChange={(e) => setScrub(Number(e.target.value))}
              aria-label="scrub the session timeline"
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/12 accent-sky-300"
            />
            <div className="mt-1 flex justify-between text-[10px] font-light tabular-nums text-white/30">
              <span>{clockOf(ledger.sessionStartMs)}</span>
              <span>{scrub >= 1 ? "live" : `held at ${clockOf(cutoff)}`}</span>
              <span>{clockOf(ledger.lastTickMs)}</span>
            </div>
          </div>
          <div ref={logRef} className="min-h-[180px] flex-1 overflow-y-auto rounded-xl border border-white/8 bg-black/40 p-2 font-mono text-[10.5px] leading-relaxed">
            {visibleLog.length === 0 && <div className="text-white/30">the log fills one line per device per second once the watch is running.</div>}
            {visibleLog.map((l, i) => (
              <div key={`${l.t}-${l.id}-${i}`} className={`flex gap-2 ${EVENT_STYLE[l.event]}`}>
                <span className="shrink-0 tabular-nums text-white/30">{clockOf(l.t)}</span>
                <span className="w-[92px] shrink-0 truncate">{l.mac ?? l.id.slice(0, 10)}</span>
                <span className="w-[52px] shrink-0 tabular-nums">{l.feet === null ? "—" : `${l.feet}ft`}</span>
                <span className="w-[52px] shrink-0 tabular-nums">{l.deltaFeet === null ? "" : `${l.deltaFeet > 0 ? "+" : ""}${l.deltaFeet}`}</span>
                <span className="truncate">{l.detail ?? l.signature}</span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] font-light leading-relaxed text-white/30">
            distance is estimated from signal strength and walls, bodies and pockets all move it. presence of a radio is presence of a radio — never attribution to a person.
          </div>
        </div>
      </div>

      {/* per-device card */}
      {detail && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/12 bg-[#0b0b0c] p-4 sm:rounded-3xl">
            <div className="flex items-start gap-2">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-extralight text-white/90">{trackLabel(detail)}</div>
                <div className="truncate text-[11px] font-light text-white/40">{detail.mac ?? detail.id}</div>
              </div>
              <button onClick={() => setSelected(null)} className="ml-auto text-white/35 hover:text-white/80"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px] font-light text-white/70 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">distance</div>
                <div className="tabular-nums">{detail.feet === null ? "not reported" : `${detail.feet} ft`}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">dwell</div>
                <div className="tabular-nums">{detail.dwellSeconds}s</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">signal</div>
                <div className="tabular-nums">{detail.rssi === null ? "—" : `${detail.rssi} dBm`}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2">
                <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">address</div>
                <div>{detail.macKind === "randomized" ? "rotating" : detail.macKind === "public" ? "hardware" : "unknown"}</div>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">distance over the session</div>
              <Sparkline track={detail} />
              <div className="text-[10.5px] font-light tabular-nums text-white/50">{movementTrail(detail, 8)}</div>
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">signal spread</div>
              <HeatStrip heat={detail.heat} />
              <div className="mt-1 text-[10.5px] font-light leading-relaxed text-white/45">{signatureLabel(detail.signature)}</div>
            </div>

            {detail.macKind === "randomized" && (
              <div className="mt-3 flex gap-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-2.5 text-[10.5px] font-light leading-relaxed text-amber-100/75">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                this address is minted by the phone's privacy layer and changes every few minutes. the same handset will reappear here under a different address, so dwell and history end when it rotates.
              </div>
            )}

            {detail.gaps.length > 0 && (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/35">
                  <RefreshCw className="h-3 w-3" />reappearances
                </div>
                {detail.gaps.slice(-8).reverse().map((g, i) => (
                  <div key={i} className="text-[10.5px] font-light tabular-nums text-white/55">
                    gone {clockOf(g.lostAt)} → back {clockOf(g.returnedAt)} · {g.seconds}s away
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 text-[10px] font-light leading-relaxed text-white/30">
              first seen {clockOf(detail.firstSeenMs)} · {detail.packets} advertisement packets · vendor {detail.vendor ?? "not published"}. observed from broadcasts only; nothing was connected to.
            </div>
          </div>
        </div>
      )}

      {/* our pairing dialog — the browser sheet only opens when the operator
          explicitly asks for the connected read, and this says so first. */}
      {pairOpen && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={() => setPairOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/12 bg-[#0b0b0c] p-4 sm:rounded-3xl">
            <div className="flex items-center gap-2">
              <Bluetooth className="h-4 w-4 text-sky-300/80" />
              <div className="text-[15px] font-extralight text-white/90">connect to one device</div>
              <button onClick={() => setPairOpen(false)} className="ml-auto text-white/35 hover:text-white/80"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 text-[11.5px] font-light leading-relaxed text-white/50">
              the watch already lists every radio nearby without touching any of them. connecting is only needed for make, model, firmware and battery. the system's own picker opens next — that sheet is the operating system's and cannot be restyled, so pick the device there and it comes back here with a full card.
            </div>
            <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
              {tracks.filter((t) => t.present).slice(0, 12).map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                  <span className="truncate text-[12px] font-light text-white/75">{trackLabel(t)}</span>
                  <span className="ml-auto shrink-0 text-[11.5px] font-light tabular-nums text-white/50">{t.feet === null ? "— ft" : `${t.feet} ft`}</span>
                </div>
              ))}
              {tracks.filter((t) => t.present).length === 0 && (
                <div className="text-[11.5px] font-light text-white/35">no radio is in range right now.</div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="h-9 flex-1 rounded-full text-[12px] font-light" onClick={() => setPairOpen(false)}>stay passive</Button>
              <Button size="sm" disabled={!pickSupported} className="h-9 flex-1 rounded-full text-[12px] font-light"
                onClick={() => { setPairOpen(false); onPickDevice(); }}>
                {pickSupported ? "open the system picker" : "unavailable here"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
