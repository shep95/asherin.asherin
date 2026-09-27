// asherin.arvision — zone configuration.
//
// A zone is the only way this system can say "here, and not there". Because a
// restricted-entry event is only as legitimate as the polygon behind it, the
// editor makes the administrator state a reason, and keeps the schedule and the
// grace period visible next to the shape rather than buried in defaults.
//
// Points are normalized to the frame, so the same zone holds when the camera
// resolution changes. The pad below is the frame; the zone is drawn live on the
// camera overlay in eagle eye as soon as it is saved.

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Undo2 } from "lucide-react";
import { newZone, type Point, type SafetyZone, type ZoneKind } from "@/lib/arvision/vision/zones";

const KINDS: Array<{ kind: ZoneKind; note: string }> = [
  { kind: "restricted", note: "entry is reported while the zone is active" },
  { kind: "monitored", note: "no entry event; dwell and crowding still measured" },
  { kind: "walking_only", note: "sustained running inside is reported" },
  { kind: "barrier", note: "a two-point line; crossing it is reported" },
  { kind: "occupancy", note: "reports when the count inside exceeds the threshold" },
];

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function minutesToText(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function textToMinutes(v: string): number {
  const [h, m] = v.split(":").map((n) => parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(1439, h * 60 + m));
}

interface Props {
  zones: SafetyZone[];
  cameras: Array<{ cameraId: string; cameraLabel: string }>;
  onChange: (zones: SafetyZone[]) => void;
}

const ZoneEditorPanel = ({ zones, cameras, onChange }: Props) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [kind, setKind] = useState<ZoneKind>("restricted");
  const [cameraId, setCameraId] = useState<string>(cameras[0]?.cameraId ?? "");

  const need = kind === "barrier" ? 2 : 3;

  const addPoint = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDraft((d) => [...d, { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) }]);
  };

  const save = () => {
    if (draft.length < need) return;
    const zone = newZone(cameraId, kind, draft);
    onChange([...zones, zone]);
    setDraft([]);
  };

  const update = (id: string, patch: Partial<SafetyZone>) =>
    onChange(zones.map((z) => (z.id === id ? { ...z, ...patch } : z)));

  const remove = (id: string) => onChange(zones.filter((z) => z.id !== id));

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <h2 className="text-[12px] font-light text-white/80">zones</h2>
      <p className="mt-1 text-[11px] font-light leading-relaxed text-white/40">
        the pad is the camera frame. click to place points, then save. a zone with no written reason is still saved, but the
        reason is what an operator reads when the event it produced is questioned.
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div>
          <div
            ref={padRef}
            onClick={addPoint}
            className="relative aspect-video w-full cursor-crosshair rounded-xl border border-white/12 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:12.5%_12.5%]"
          >
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {zones.filter((z) => !cameraId || z.cameraId === cameraId).map((z) => (
                <polygon
                  key={z.id}
                  points={z.polygon.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                  fill={z.kind === "restricted" ? "rgba(239,68,68,0.12)" : "rgba(56,189,248,0.08)"}
                  stroke={z.enabled ? "rgba(125,211,252,0.55)" : "rgba(255,255,255,0.22)"}
                  strokeWidth={0.4}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {draft.length > 1 && (
                <polyline
                  points={draft.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
                  fill="none"
                  stroke="rgba(251,191,36,0.9)"
                  strokeWidth={0.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {draft.map((p, i) => (
                <circle key={i} cx={p.x * 100} cy={p.y * 100} r={0.9} fill="rgba(251,191,36,0.95)" />
              ))}
            </svg>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ZoneKind)}
              className="rounded-lg border border-white/12 bg-black/50 px-2 py-1 text-[11px] font-light text-white/75"
            >
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>{k.kind.replace(/_/g, " ")}</option>
              ))}
            </select>
            <select
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              className="rounded-lg border border-white/12 bg-black/50 px-2 py-1 text-[11px] font-light text-white/75"
            >
              <option value="">every camera</option>
              {cameras.map((c) => (
                <option key={c.cameraId} value={c.cameraId}>{c.cameraLabel}</option>
              ))}
            </select>
            <Button size="sm" variant="ghost" className="h-7 text-[11px] font-light text-white/60" onClick={() => setDraft((d) => d.slice(0, -1))} disabled={draft.length === 0}>
              <Undo2 className="mr-1 h-3 w-3" /> undo point
            </Button>
            <Button size="sm" className="h-7 text-[11px] font-light" onClick={save} disabled={draft.length < need}>
              save zone
            </Button>
          </div>
          <p className="mt-1 text-[10.5px] font-light text-white/35">
            {KINDS.find((k) => k.kind === kind)?.note} · {draft.length}/{need} points placed
          </p>
          {cameras.length === 0 && (
            <p className="mt-1 text-[10.5px] font-light text-amber-200/70">
              no camera is attached, so a zone saved now cannot be measured against anything until one is.
            </p>
          )}
        </div>

        <div className="space-y-2">
          {zones.length === 0 ? (
            <p className="text-[11px] font-light text-white/35">no zone is configured. without one, no entry, dwell or crowding event can fire.</p>
          ) : (
            zones.map((z) => (
              <div key={z.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={z.label}
                    onChange={(e) => update(z.id, { label: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] font-light text-white/80"
                  />
                  <span className="text-[10px] font-light text-white/35">{z.kind.replace(/_/g, " ")}</span>
                  <label className="flex items-center gap-1 text-[10px] font-light text-white/45">
                    <input type="checkbox" checked={z.enabled} onChange={(e) => update(z.id, { enabled: e.target.checked })} />
                    enabled
                  </label>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-white/40 hover:text-rose-300" onClick={() => remove(z.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <label className="text-[10px] font-light text-white/40">
                    grace period (s)
                    <input
                      type="number" min={0}
                      value={Math.round(z.gracePeriodMs / 1000)}
                      onChange={(e) => update(z.id, { gracePeriodMs: Math.max(0, Number(e.target.value) * 1000) })}
                      className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75"
                    />
                  </label>
                  <label className="text-[10px] font-light text-white/40">
                    dwell threshold (s)
                    <input
                      type="number" min={0}
                      value={Math.round(z.dwellThresholdMs / 1000)}
                      onChange={(e) => update(z.id, { dwellThresholdMs: Math.max(0, Number(e.target.value) * 1000) })}
                      className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75"
                    />
                  </label>
                  <label className="text-[10px] font-light text-white/40">
                    occupancy threshold
                    <input
                      type="number" min={1}
                      value={z.occupancyThreshold}
                      onChange={(e) => update(z.id, { occupancyThreshold: Math.max(1, Number(e.target.value)) })}
                      className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75"
                    />
                  </label>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 text-[10px] font-light text-white/45">
                    <input
                      type="checkbox"
                      checked={z.schedule !== null}
                      onChange={(e) => update(z.id, { schedule: e.target.checked ? { days: [], startMinute: 22 * 60, endMinute: 6 * 60 } : null })}
                    />
                    active only during hours
                  </label>
                  {z.schedule && (
                    <>
                      <input
                        type="time" value={minutesToText(z.schedule.startMinute)}
                        onChange={(e) => update(z.id, { schedule: { ...z.schedule!, startMinute: textToMinutes(e.target.value) } })}
                        className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75"
                      />
                      <span className="text-[10px] text-white/35">to</span>
                      <input
                        type="time" value={minutesToText(z.schedule.endMinute)}
                        onChange={(e) => update(z.id, { schedule: { ...z.schedule!, endMinute: textToMinutes(e.target.value) } })}
                        className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/75"
                      />
                      <div className="flex flex-wrap gap-1">
                        {DAYS.map((d, i) => {
                          const on = z.schedule!.days.length === 0 || z.schedule!.days.includes(i);
                          return (
                            <button
                              key={d}
                              onClick={() => {
                                const cur = z.schedule!.days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : z.schedule!.days;
                                const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort();
                                update(z.id, { schedule: { ...z.schedule!, days: next } });
                              }}
                              className={`rounded px-1.5 py-0.5 text-[9.5px] font-light ${on ? "bg-sky-400/15 text-sky-200/85" : "bg-white/5 text-white/30"}`}
                            >
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                <textarea
                  value={z.rationale}
                  placeholder="why this zone exists — read back whenever an event from it is questioned"
                  onChange={(e) => update(z.id, { rationale: e.target.value })}
                  className="mt-2 h-12 w-full resize-none rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] font-light text-white/70 placeholder:text-white/25"
                />
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default ZoneEditorPanel;
