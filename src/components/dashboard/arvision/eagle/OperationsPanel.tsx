// eagle.eye — security operations console.
//
// This is the desk view: what the company is authorized to watch, which of
// those feeds are actually producing frames, which of them have a model behind
// them, what fired, who owns each alert, and what evidence exists.
//
// Everything printed here comes from the sensor registry, the service probes,
// the site configuration and the incident ledger. Nothing is filled in for
// looks: where a fact is missing the row says which action would supply it.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Building2, Camera, CheckCircle2, ChevronRight, Clock, Film,
  Layers, ShieldCheck, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSensorRegistry } from "@/hooks/useSensorRegistry";
import { useSafetyConsole } from "@/hooks/useSafetyConsole";
import { loadSite } from "@/lib/arvision/sensors/site";
import type { SiteConfig } from "@/lib/arvision/sensors/types";
import { buildCameraRows, buildSiteTree, consoleSummary } from "@/lib/arvision/console/inventory";
import { applyFilter, sortQueue, toQueueItems, transition } from "@/lib/arvision/console/queue";
import { buildWindow, evidenceForIncident, intervalForIncident } from "@/lib/arvision/console/timeline";
import type { EvidenceFrameRef } from "@/lib/arvision/console/timeline";
import { CONSOLE_STATE_LABEL, type CameraRow, type ConsoleFilter, type ConsoleState, type QueueItem, type QueueStatus } from "@/lib/arvision/console/types";

const STATE_STYLE: Record<ConsoleState, string> = {
  live: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200/90",
  disconnected: "border-white/15 bg-white/5 text-white/60",
  not_configured: "border-white/15 bg-white/5 text-white/50",
  unsupported: "border-white/10 bg-white/[0.03] text-white/40",
  backend_offline: "border-amber-400/25 bg-amber-400/10 text-amber-200/90",
  denied: "border-rose-400/25 bg-rose-400/10 text-rose-200/90",
  stale: "border-amber-400/20 bg-amber-400/5 text-amber-200/70",
};

function Chip({ state, children }: { state: ConsoleState; children?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] tracking-wide ${STATE_STYLE[state]}`}>
      {children ?? CONSOLE_STATE_LABEL[state]}
    </span>
  );
}

function ago(ms: number | null, now: number): string {
  if (ms == null) return "never";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export default function OperationsPanel() {
  const { snapshot: registry, services } = useSensorRegistry();
  const { snapshot: safety, review } = useSafetyConsole();
  const [site, setSite] = useState<SiteConfig>(() => loadSite());
  const [now, setNow] = useState(() => Date.now());
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [filter, setFilter] = useState<ConsoleFilter>({});
  const [actor, setActor] = useState("");

  // one clock for the whole panel, paused while the tab is hidden so a
  // background console is not spending frames on a ticker nobody is reading.
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => setNow(Date.now());
    const start = () => {
      if (timer === undefined && document.visibilityState === "visible") {
        timer = window.setInterval(tick, 2000);
      }
    };
    const stop = () => {
      if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
    };
    const onVis = () => { if (document.visibilityState === "visible") { tick(); start(); } else stop(); };
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  useEffect(() => { setSite(loadSite()); }, []);

  const rows = useMemo(() => buildCameraRows({
    zones: site.zones,
    devices: site.devices,
    sensors: registry.sensors,
    services,
    acknowledgedAuthorizationAtMs: site.acknowledgedAuthorizationAtMs,
    nowMs: now,
  }), [site, registry.sensors, services, now]);

  const tree = useMemo(
    () => buildSiteTree({ siteId: site.siteId, siteName: site.siteName, companyName: site.companyName }, site.zones, rows),
    [site, rows],
  );

  const queue = useMemo(() => sortQueue(applyFilter(toQueueItems(safety.incidents), filter)), [safety.incidents, filter]);
  const camera = rows.find((r) => r.deviceId === selectedCamera) ?? null;
  const incident = queue.find((q) => q.incidentId === selectedIncident) ?? null;

  // evidence references come from stored bundles only. nothing is drawn for an
  // incident whose capture never succeeded.
  const frames: EvidenceFrameRef[] = useMemo(() => safety.bundles.flatMap((b) =>
    b.frames.map((f, idx) => ({
      id: `${b.id}_${idx}`,
      incidentId: b.incidentId,
      atMs: f.atMs,
      storage: (b.storage === "backend" ? "backend" : "memory") as EvidenceFrameRef["storage"],
      role: (idx === 0 ? "pre" : idx === 1 ? "trigger" : "during") as EvidenceFrameRef["role"],
      annotations: [],
      sourceDeviceId: null,
      provenance: b.notes ?? "",
    })),
  ), [safety.bundles]);

  const window_ = useMemo(() => {
    const span = incident ? intervalForIncident(incident) : { fromMs: now - 15 * 60_000, toMs: now };
    return buildWindow(queue, span.fromMs, span.toMs, frames, safety.storage.configured);
  }, [incident, queue, frames, safety.storage.configured, now]);

  const act = useCallback((item: QueueItem, to: QueueStatus) => {
    const who = actor.trim();
    const res = transition(item, to, who, Date.now());
    if (!res.changed) return;
    review(item.incidentId, to === "escalated" ? "confirmed" : to === "resolved" ? "dismissed" : "needs_review", who);
  }, [actor, review]);

  const toggleType = (t: string) => setFilter((f) => {
    const cur = new Set(f.eventTypes ?? []);
    if (cur.has(t)) cur.delete(t); else cur.add(t);
    return { ...f, eventTypes: cur.size ? [...cur] : undefined };
  });

  const eventTypes = [...new Set(toQueueItems(safety.incidents).map((i) => i.eventType))];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5" aria-label="security operations console">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-light tracking-wide text-white/85">
            <ShieldCheck className="h-4 w-4 text-white/50" aria-hidden /> operations console
          </h3>
          <p className="mt-1 text-[11px] text-white/45">
            {site.companyName || "unnamed company"} · {site.siteName || "unnamed site"} · {consoleSummary(rows)}
          </p>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-white/45">
          <span>operator</span>
          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="your name"
            className="w-32 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/80 outline-none focus:border-white/30"
          />
        </label>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* site tree ---------------------------------------------------- */}
          <div className="rounded-xl border border-white/10 p-3">
            <h4 className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/40">
              <Building2 className="h-3.5 w-3.5" aria-hidden /> sites, floors and zones
            </h4>
            {tree.buildings.length === 0 ? (
              <p className="text-[11px] text-white/45">no zone is configured. add zones in the zone editor before events can be scoped to a place.</p>
            ) : tree.buildings.map((b) => (
              <div key={b.building} className="mb-2">
                <p className="text-[11px] text-white/70">{b.building}</p>
                {b.floors.map((f) => (
                  <div key={f.floor} className="ml-3 mt-1">
                    <p className="text-[10px] uppercase tracking-widest text-white/35">floor {f.floor}</p>
                    <ul className="ml-2 mt-1 space-y-1">
                      {f.zones.map((z) => (
                        <li key={z.id} className="flex items-center gap-2 text-[11px] text-white/55">
                          <Layers className="h-3 w-3 text-white/25" aria-hidden />
                          <span>{z.name}</span>
                          <span className="text-white/30">{z.kind}</span>
                          <span className="text-white/30">{z.cameraIds.length} camera{z.cameraIds.length === 1 ? "" : "s"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
            {tree.unassignedCameraIds.length > 0 && (
              <p className="mt-1 text-[11px] text-white/40">{tree.unassignedCameraIds.length} camera(s) are not assigned to a zone, so zone rules cannot apply to them.</p>
            )}
          </div>

          {/* camera inventory --------------------------------------------- */}
          <div className="rounded-xl border border-white/10 p-3">
            <h4 className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/40">
              <Camera className="h-3.5 w-3.5" aria-hidden /> authorized camera inventory
            </h4>
            {rows.length === 0 ? (
              <p className="text-[11px] text-white/45">no authorized device is configured on this browser. add one in site authorization — eagle.eye never discovers equipment it has not been given.</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li key={r.deviceId}>
                    <button
                      type="button"
                      onClick={() => setSelectedCamera(r.deviceId)}
                      aria-pressed={selectedCamera === r.deviceId}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition ${
                        selectedCamera === r.deviceId ? "border-white/25 bg-white/[0.06]" : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-white/80">{r.name}</span>
                        <span className="block text-[10px] text-white/40">
                          {r.zoneName ?? "no zone"} · {r.building}/{r.floor} · last frame {ago(r.feed.lastSampleMs, now)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Chip state={r.feed.state}>feed {CONSOLE_STATE_LABEL[r.feed.state]}</Chip>
                        <Chip state={r.inference.state}>model {CONSOLE_STATE_LABEL[r.inference.state]}</Chip>
                        <ChevronRight className="h-3.5 w-3.5 text-white/25" aria-hidden />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* alert queue --------------------------------------------------- */}
          <div className="rounded-xl border border-white/10 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h4 className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/40">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> alert queue
              </h4>
              {eventTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  aria-pressed={(filter.eventTypes ?? []).includes(t)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] ${
                    (filter.eventTypes ?? []).includes(t) ? "border-white/30 bg-white/10 text-white/80" : "border-white/10 text-white/45"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {queue.length === 0 ? (
              <p className="text-[11px] text-white/45">nothing has fired in this filter. an empty queue means no detector reported, not that the site is clear.</p>
            ) : (
              <ul className="space-y-2">
                {queue.map((q) => (
                  <li key={q.incidentId} className="rounded-lg border border-white/10 p-2">
                    <button
                      type="button"
                      onClick={() => setSelectedIncident(q.incidentId)}
                      className="w-full text-left"
                      aria-pressed={selectedIncident === q.incidentId}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[12px] text-white/80">{q.label}</span>
                        <span className="text-[10px] text-white/40">{q.status}</span>
                      </span>
                      <span className="mt-1 block text-[10px] text-white/45">
                        {new Date(q.openedAtMs).toLocaleTimeString()} · {q.zoneId ?? "site wide"} · quality {q.quality == null ? "not scored" : q.quality.toFixed(2)}
                      </span>
                      {q.signals.slice(0, 3).map((s) => (
                        <span key={s} className="mt-0.5 block text-[10px] text-white/40">signal: {s}</span>
                      ))}
                      {q.missing.length > 0 && (
                        <span className="mt-0.5 block text-[10px] text-amber-200/60">missing: {q.missing.join(" · ")}</span>
                      )}
                    </button>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={!actor.trim() || q.status !== "new"} onClick={() => act(q, "acknowledged")}>acknowledge</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={!actor.trim() || q.status !== "acknowledged"} onClick={() => act(q, "escalated")}>escalate</Button>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" disabled={!actor.trim() || q.status === "resolved"} onClick={() => act(q, "resolved")}>resolve</Button>
                      {!actor.trim() && <span className="self-center text-[10px] text-white/35">enter your name to record a decision</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* timeline ------------------------------------------------------ */}
          <div className="rounded-xl border border-white/10 p-3">
            <h4 className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/40">
              <Clock className="h-3.5 w-3.5" aria-hidden /> investigation timeline
            </h4>
            <p className="text-[11px] text-white/45">
              {new Date(window_.fromMs).toLocaleTimeString()} – {new Date(window_.toMs).toLocaleTimeString()} · {window_.markers.length} marker(s)
            </p>
            {window_.media === null || window_.media.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-200/70">{window_.mediaUnavailableReason}</p>
            ) : (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-white/55">
                <Film className="h-3 w-3" aria-hidden /> {window_.media.length} stored frame(s) in this interval
              </p>
            )}
          </div>
        </div>

        {/* inspector -------------------------------------------------------- */}
        <aside className="space-y-3 rounded-xl border border-white/10 p-3" aria-label="inspector">
          <h4 className="text-[11px] uppercase tracking-widest text-white/40">inspector</h4>
          {!camera && !incident && (
            <p className="text-[11px] text-white/45">select a camera or an alert. the grid stays where it is.</p>
          )}

          {camera && (
            <div className="space-y-2">
              <p className="text-[12px] text-white/80">{camera.name}</p>
              <p className="text-[10px] text-white/45">
                {camera.authorized ? `authorized · ${camera.authorizationBasis}` : "not authorized for operation"}
              </p>
              <div className="space-y-1">
                <p className="text-[10px] text-white/45">feed: <Chip state={camera.feed.state} /> {camera.feed.detail}</p>
                <p className="text-[10px] text-white/45">model: <Chip state={camera.inference.state} /> {camera.inference.detail}</p>
                <p className="text-[10px] text-white/45">recording: <Chip state={camera.recording.state} /> {camera.recording.detail}</p>
              </div>
              <details className="rounded-lg border border-white/10 p-2">
                <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-white/40">capabilities</summary>
                <ul className="mt-1 space-y-1">
                  {camera.badges.map((b) => (
                    <li key={b.modality} className="text-[10px] text-white/45">
                      <Chip state={b.state}>{b.label}</Chip>{" "}
                      <span>{b.measurable ? "measurement" : "picture only"} · {b.detail}</span>
                    </li>
                  ))}
                </ul>
              </details>
              {camera.remediation.length > 0 && (
                <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-2">
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-amber-200/70">
                    <Wrench className="h-3 w-3" aria-hidden /> next steps
                  </p>
                  <ul className="mt-1 space-y-1">
                    {camera.remediation.map((r) => (
                      <li key={r.id} className="text-[10px] text-white/55">{r.label} — {r.detail}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {incident && (
            <div className="space-y-2 border-t border-white/10 pt-2">
              <p className="text-[12px] text-white/80">{incident.label}</p>
              <p className="text-[10px] text-white/45">
                opened {new Date(incident.openedAtMs).toLocaleString()} · last firing {new Date(incident.lastFiringMs).toLocaleTimeString()}
              </p>
              <p className="text-[10px] text-white/45">tracks: {incident.trackIds.length ? incident.trackIds.join(", ") : "no temporary track id was recorded"}</p>
              <p className="text-[10px] text-white/45">
                evidence: {incident.evidenceState === "stored" ? `${evidenceForIncident(frames, incident.incidentId).length} frame(s) stored` : `${incident.evidenceState} — ${safety.storage.detail}`}
              </p>
              <ul className="space-y-0.5">
                {incident.signals.map((s) => <li key={s} className="text-[10px] text-white/45">why it fired: {s}</li>)}
              </ul>
              {incident.notes.map((n) => (
                <p key={`${n.atMs}-${n.text}`} className="text-[10px] text-white/40">{n.author}: {n.text}</p>
              ))}
              <p className="flex items-center gap-1 text-[10px] text-white/35">
                <CheckCircle2 className="h-3 w-3" aria-hidden /> an alert is an observation for a person to review, never a conclusion about anyone.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
