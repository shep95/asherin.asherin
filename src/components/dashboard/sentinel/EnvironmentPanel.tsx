import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bluetooth, Crosshair, Loader2, MapPin, Radio, ShieldAlert, Signal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { BluetoothEnvironment, label as radioLabel, type EnvironmentEvent, type RadioRecord } from "@/lib/sentinel/radio/environment";
import { detectSupport, scanViaCompanion, scanViaNative, scanViaWeb, type ScanHandle, type ScanSupport } from "@/lib/sentinel/radio/scanSources";
import { accuracyBand, movementBetween, type LocationFix, type MovementState } from "@/lib/sentinel/location/geo";
import { acquireFix, geoErrorText, ipFix, reverseGeocode, watchPosition } from "@/lib/sentinel/location/sources";
import { attachFix, buildTrail, type RadioSighting } from "@/lib/sentinel/location/trackers";
import { logLocation, logRadio, registerDevice } from "@/lib/sentinel/audio/sync";
import { publishSentinelLocation, publishSentinelRadio } from "@/lib/fabric/bridges/sentinelFabric";

/**
 * asherin.sentinel — the environment room.
 *
 * Two records that only mean something together: what is broadcasting near you,
 * and where you were while it did. Both are written into the same account
 * timeline as speech, so an operator reads one history rather than three.
 *
 * The boundaries are stated on the face of the room, not in a footnote:
 *  • every bluetooth field here came from a packet the device broadcast to the
 *    whole room. nothing pairs, connects, queries or handshakes.
 *  • a radio in range is a radio in range — never a person, never attribution.
 *  • distance from signal strength is a band, not a measurement.
 *  • ordinary gps is horizontal. it cannot state a floor, and this room will
 *    not pretend otherwise.
 *  • when a receiver drops, the record shows a gap rather than implying quiet.
 */

const ENV_DEVICE_KEY = "asherin-sentinel-environment";
const SWEEP_MS = 5_000;
const FLUSH_MS = 30_000;
const MAX_TRAIL = 400;

type Pending = { atIso: string; summary: string; tag: string; risk: string; source: string; meta: Record<string, unknown> };

export default function EnvironmentPanel() {
  const { toast } = useToast();
  const [support, setSupport] = useState<ScanSupport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string>("");
  const [records, setRecords] = useState<RadioRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<EnvironmentEvent[]>([]);

  const [fix, setFix] = useState<LocationFix | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [movement, setMovement] = useState<MovementState>("unknown");
  const [locError, setLocError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [trail, setTrail] = useState<LocationFix[]>([]);
  const [locationGaps, setLocationGaps] = useState<{ from: number; to: number | null; reason: string }[]>([]);

  const ledgerRef = useRef<BluetoothEnvironment | null>(null);
  const handleRef = useRef<ScanHandle | null>(null);
  const fixRef = useRef<LocationFix | null>(null);
  const placeRef = useRef<string | null>(null);
  const sightingsRef = useRef<Map<string, RadioSighting[]>>(new Map());
  const pendingRadioRef = useRef<Pending[]>([]);
  const pendingFixRef = useRef<LocationFix[]>([]);
  const registeredRef = useRef(false);

  // ── one ledger for the life of the room ────────────────────────────────────
  if (!ledgerRef.current) {
    ledgerRef.current = new BluetoothEnvironment({
      onEvent: (event) => {
        setEvents((prev) => [event, ...prev].slice(0, 200));
        pendingRadioRef.current.push({
          atIso: new Date(event.at).toISOString(),
          summary: event.note,
          tag: `radio ${event.kind}`,
          risk: event.record.leak.riskLevel,
          source: handleRef.current?.source ?? "unknown",
          meta: {
            address: event.record.address,
            addressIsHardware: event.record.addressIsHardware,
            randomized: event.record.randomized,
            fingerprint: event.record.fingerprint,
            name: event.record.name,
            category: event.record.classification.category,
            brand: event.record.classification.brand,
            services: event.record.classification.services,
            rssi: event.record.rssi,
            approxMeters: event.record.meters,
            leakScore: event.record.leak.totalScore,
            factors: event.record.leak.factors,
            lat: fixRef.current?.lat ?? null,
            lon: fixRef.current?.lon ?? null,
            locationAccuracyM: fixRef.current?.accuracyM ?? null,
            locationSource: fixRef.current?.source ?? null,
            place: placeRef.current,
          },
        });
        if (pendingRadioRef.current.length > 400) pendingRadioRef.current.splice(0, 200);
      },
    });
  }

  useEffect(() => {
    void detectSupport().then(setSupport);
  }, []);

  // ── the per-second record ──────────────────────────────────────────────────
  useEffect(() => {
    const timer = window.setInterval(() => {
      const ledger = ledgerRef.current;
      if (!ledger) return;
      ledger.sweep();
      const list = ledger.list();
      setRecords(list);
      const now = Date.now();
      for (const record of list) {
        if (record.presence !== "present") continue;
        const bucket = sightingsRef.current.get(record.key) ?? [];
        bucket.push(
          attachFix(
            { key: record.key, label: radioLabel(record), at: now, rssi: record.rssi, meters: record.meters },
            fixRef.current,
            placeRef.current,
          ),
        );
        if (bucket.length > MAX_TRAIL) bucket.splice(0, bucket.length - MAX_TRAIL);
        sightingsRef.current.set(record.key, bucket);
        // the same sighting, normalized once, so eagle.eye and arvision read
        // this receiver without opening a second radio.
        publishSentinelRadio(record, radioLabel(record), handleRef.current?.source ?? "unknown receiver");
      }
    }, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  // ── batched writes to the account timeline ─────────────────────────────────
  const flush = useCallback(async () => {
    const radio = pendingRadioRef.current.splice(0, pendingRadioRef.current.length);
    const fixes = pendingFixRef.current.splice(0, pendingFixRef.current.length);
    if (!radio.length && !fixes.length) return;
    try {
      if (!registeredRef.current) {
        await registerDevice(ENV_DEVICE_KEY, "environment", "browser");
        registeredRef.current = true;
      }
      if (radio.length) await logRadio(ENV_DEVICE_KEY, radio);
      if (fixes.length) {
        await logLocation(
          ENV_DEVICE_KEY,
          fixes.map((f) => ({
            atIso: new Date(f.at).toISOString(),
            lat: f.lat,
            lon: f.lon,
            accuracyM: f.accuracyM,
            source: f.source,
            note: f.note,
            place: placeRef.current,
            movement,
            altitudeM: f.altitudeM,
            speedMps: f.speedMps,
            headingDeg: f.headingDeg,
          })),
        );
      }
    } catch (e) {
      // Put the work back rather than losing it; a failed write is a network
      // problem, not evidence that nothing happened.
      pendingRadioRef.current.unshift(...radio);
      pendingFixRef.current.unshift(...fixes);
      setScanNote(`timeline write failed: ${e instanceof Error ? e.message : "unknown error"} — retrying`);
    }
  }, [movement]);

  useEffect(() => {
    const timer = window.setInterval(() => void flush(), FLUSH_MS);
    return () => {
      window.clearInterval(timer);
      void flush();
    };
  }, [flush]);

  useEffect(() => () => handleRef.current?.stop(), []);

  const startScan = useCallback(async () => {
    if (handleRef.current) return;
    const s = support ?? (await detectSupport());
    try {
      let handle: ScanHandle;
      if (s.companion) {
        handle = scanViaCompanion(
          (packet) => ledgerRef.current?.observe(packet),
          (status) => setScanNote(status),
        );
      } else if (s.native) {
        handle = await scanViaNative((packet) => ledgerRef.current?.observe(packet));
      } else {
        handle = await scanViaWeb((packet) => ledgerRef.current?.observe(packet));
      }
      handleRef.current = handle;
      setScanning(true);
      setScanNote(`scanning via ${handle.source}`);
    } catch (e) {
      setScanNote(e instanceof Error ? e.message : "the scan could not start");
      toast({ title: "no bluetooth receiver", description: e instanceof Error ? e.message : "scan unavailable" });
    }
  }, [support, toast]);

  const stopScan = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setScanning(false);
    setScanNote("scanning stopped — anything broadcast from now on is not in the record.");
  }, []);

  // ── location ───────────────────────────────────────────────────────────────
  const applyFix = useCallback((next: LocationFix) => {
    const prev = fixRef.current;
    if (prev) setMovement(movementBetween(prev, next).state);
    fixRef.current = next;
    setFix(next);
    setTrail((t) => [...t, next].slice(-MAX_TRAIL));
    pendingFixRef.current.push(next);
    publishSentinelLocation(next, placeRef.current);
    setLocError(null);
    setLocationGaps((gaps) =>
      gaps.map((g) => (g.to === null ? { ...g, to: next.at } : g)),
    );
    void reverseGeocode(next.lat, next.lon).then((name) => {
      if (!name) return;
      placeRef.current = name;
      setPlace(name);
    });
  }, []);

  const openLocationGap = useCallback((reason: string) => {
    setLocationGaps((gaps) => (gaps.some((g) => g.to === null) ? gaps : [{ from: Date.now(), to: null, reason }, ...gaps].slice(0, 40)));
  }, []);

  const startLocation = useCallback(async () => {
    setLocating(true);
    const result = await acquireFix();
    if (result.fix) applyFix(result.fix);
    else {
      const reason = result.attempted.map((a) => `${a.source}: ${a.detail}`).join("; ");
      setLocError(reason || "no source could produce a fix");
      openLocationGap(reason || "no location source available");
    }
    setLocating(false);
  }, [applyFix, openLocationGap]);

  useEffect(() => {
    const stop = watchPosition(applyFix, (reason) => {
      setLocError(reason);
      openLocationGap(reason);
      // A denied or unavailable satellite fix is not the end of the record: an
      // ip estimate is still true, it is simply true at city scale.
      void ipFix()
        .then(applyFix)
        .catch(() => {});
    });
    return stop;
  }, [applyFix, openLocationGap]);

  const selectedRecord = useMemo(() => records.find((r) => r.key === selected) ?? null, [records, selected]);
  const selectedTrail = useMemo(
    () => (selectedRecord ? buildTrail(selectedRecord.key, radioLabel(selectedRecord), sightingsRef.current.get(selectedRecord.key) ?? []) : null),
    [selectedRecord, records],
  );

  const present = records.filter((r) => r.presence !== "departed");
  const risky = records.filter((r) => r.leak.riskLevel === "high" || r.leak.riskLevel === "critical");

  return (
    <div className="space-y-4">
      {/* boundary statement */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-[11px] leading-relaxed text-white/55">
        <span className="font-medium text-white/90">what this room reads:</span> every bluetooth field below arrived in a
        packet the device itself broadcast to the whole room. nothing here pairs, connects, queries or handshakes, and no
        radio is ever attributed to a person. distance is derived from signal strength, so it is a band and not a
        measurement. location carries its own source and accuracy on every entry — a satellite fix and a city-level ip
        estimate are different claims and are never drawn as the same pin. ordinary gps is horizontal: it cannot state a
        floor. when a receiver drops, the record opens a visible gap instead of showing quiet.
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={scanning ? "secondary" : "default"} onClick={() => (scanning ? stopScan() : void startScan())}>
          <Bluetooth className="mr-2 h-4 w-4" />
          {scanning ? "stop radio scan" : "scan the room"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void startLocation()} disabled={locating}>
          {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
          fix location now
        </Button>
        <span className="text-[11px] text-white/45">{scanNote || support?.note || "checking receivers…"}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* radios */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm text-white/80">
              <Radio className="h-4 w-4" /> radios in range
            </h3>
            <span className="text-[11px] text-white/45">
              {present.length} present · {risky.length} high exposure
            </span>
          </header>

          {!records.length ? (
            <p className="text-[12px] text-white/45">
              nothing observed yet. {scanning ? "the receiver is on and no device in range has advertised." : "start a scan to begin the record."}
            </p>
          ) : (
            <ul className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              {records.map((r) => (
                <li key={r.key}>
                  <button
                    onClick={() => setSelected(r.key === selected ? null : r.key)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      selected === r.key ? "border-white/25 bg-white/[0.08]" : "border-white/10 bg-white/[0.03] hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] text-white/85">{radioLabel(r)}</span>
                      <span className={`text-[10px] uppercase tracking-wide ${riskTone(r.leak.riskLevel)}`}>{r.leak.riskLevel}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/45">
                      <span>{r.classification.category}</span>
                      <span>{r.meters != null ? `~${r.meters} m` : "range unknown"}</span>
                      <span>{r.rssi != null ? `${r.rssi} dbm` : "no rssi"}</span>
                      <span>{r.presence}</span>
                      <span>{r.sightings} packets</span>
                      <span>
                        {r.randomized === true ? "address rotates" : r.randomized === false ? "permanent address" : "address unreadable here"}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* location */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm text-white/80">
              <MapPin className="h-4 w-4" /> where the record was taken
            </h3>
            <span className="text-[11px] text-white/45">{movement}</span>
          </header>

          {fix ? (
            <div className="space-y-2 text-[12px] text-white/70">
              <div className="font-mono text-[12px] text-white/85">
                {fix.lat.toFixed(6)}, {fix.lon.toFixed(6)}
              </div>
              <div className="text-[11px] text-white/50">
                {fix.source} · ±{fix.accuracyM} m ({accuracyBand(fix.accuracyM)}) · {new Date(fix.at).toLocaleTimeString()}
              </div>
              <div className="text-[11px] text-white/45">{fix.note}</div>
              {place && <div className="text-[12px] text-white/75">{place}</div>}
              {fix.altitudeM != null && (
                <div className="text-[11px] text-white/45">
                  altitude {Math.round(fix.altitudeM)} m ±{fix.altitudeAccuracyM ? Math.round(fix.altitudeAccuracyM) : "?"} m — barometric
                  altitude is not a floor number
                </div>
              )}
              <TrailMap trail={trail} />
            </div>
          ) : (
            <p className="text-[12px] text-white/45">no fix yet. {locError ?? "waiting for a location source."}</p>
          )}

          {locError && fix && <p className="mt-2 text-[11px] text-amber-300/80">last error: {locError}</p>}

          {locationGaps.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-2">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-white/40">location gaps</p>
              <ul className="space-y-1 text-[11px] text-white/50">
                {locationGaps.slice(0, 5).map((g) => (
                  <li key={g.from}>
                    {new Date(g.from).toLocaleTimeString()} → {g.to ? new Date(g.to).toLocaleTimeString() : "open"} — {g.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* detail */}
      {selectedRecord && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <header className="mb-2 flex items-center gap-2 text-sm text-white/85">
            <ShieldAlert className="h-4 w-4" /> {radioLabel(selectedRecord)} — what it discloses
          </header>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1 text-[11px] text-white/55">
              <Row k="address" v={`${selectedRecord.address}${selectedRecord.addressIsHardware ? "" : " (session handle, not a mac)"}`} />
              <Row k="fingerprint" v={`${selectedRecord.fingerprint} — traits that stay constant while the address rotates`} />
              <Row k="brand" v={selectedRecord.classification.brand} />
              <Row k="category" v={selectedRecord.classification.category} />
              <Row k="services" v={selectedRecord.classification.services.join(", ") || "none advertised"} />
              <Row k="first seen" v={new Date(selectedRecord.firstSeen).toLocaleTimeString()} />
              <Row k="dwell" v={`${Math.round(selectedRecord.dwellMs / 1000)}s across ${selectedRecord.visits} visit(s)`} />
              <Row k="exposure score" v={`${selectedRecord.leak.totalScore}/100 (${selectedRecord.leak.riskLevel})`} />
            </div>
            <div className="space-y-2">
              <ul className="space-y-1 text-[11px]">
                {selectedRecord.leak.factors.map((f) => (
                  <li key={f.factor} className="text-white/60">
                    <span className={riskTone(f.risk)}>{f.factor}</span> — {f.detail}
                  </li>
                ))}
              </ul>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 text-[11px] text-white/65">
                <p className="mb-1 uppercase tracking-wide text-white/40">what to do</p>
                <ul className="list-disc space-y-1 pl-4">
                  {selectedRecord.leak.recommendations.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              {selectedTrail && (
                <p className="text-[11px] text-white/50">
                  <Signal className="mr-1 inline h-3 w-3" />
                  {selectedTrail.note}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* environment events */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm text-white/80">
          <AlertTriangle className="h-4 w-4" /> environment timeline
        </h3>
        {!events.length ? (
          <p className="text-[12px] text-white/45">no arrivals or departures recorded yet.</p>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto pr-1 text-[11px] text-white/60">
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span className="text-white/35">{new Date(e.at).toLocaleTimeString()}</span> · {e.note}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-white/35">{k}</span>
      <span className="break-all text-white/70">{v}</span>
    </div>
  );
}

function riskTone(level: string): string {
  return level === "critical"
    ? "text-red-300"
    : level === "high"
      ? "text-amber-300"
      : level === "medium"
        ? "text-yellow-200/80"
        : "text-white/50";
}

/** A trail drawn from the fixes actually taken, each one sized by its own
 *  accuracy. No interpolation between distant fixes — the space between two
 *  points is space nobody recorded, and drawing a line through it would invent
 *  a path. */
function TrailMap({ trail }: { trail: LocationFix[] }) {
  if (trail.length < 1) return null;
  const lats = trail.map((t) => t.lat);
  const lons = trail.map((t) => t.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const spanLat = Math.max(1e-5, maxLat - minLat);
  const spanLon = Math.max(1e-5, maxLon - minLon);
  const x = (lon: number) => 8 + ((lon - minLon) / spanLon) * 264;
  const y = (lat: number) => 128 - ((lat - minLat) / spanLat) * 112 - 8;

  return (
    <svg viewBox="0 0 280 136" className="mt-2 h-32 w-full rounded-xl border border-white/10 bg-black/40">
      {trail.map((t, i) => (
        <circle
          key={`${t.at}-${i}`}
          cx={x(t.lon)}
          cy={y(t.lat)}
          r={t.source === "ip" ? 5 : t.accuracyM > 100 ? 4 : 2.5}
          className={t.source === "ip" ? "fill-amber-300/30" : "fill-white/60"}
        />
      ))}
      <text x="8" y="130" className="fill-white/35" fontSize="7">
        {trail.length} fixes · larger dot = looser accuracy · amber = ip estimate
      </text>
    </svg>
  );
}
