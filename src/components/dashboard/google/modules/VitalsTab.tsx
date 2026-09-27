import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, HeartPulse, RefreshCw, Droplets, Brain, ShieldCheck, AlertTriangle,
  CircleDot, Layers, Fingerprint, Gauge, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  organismAcknowledge, organismDesignate, organismPulse, organismState,
  type OrganismEntity, type OrganismEvent, type OrganismFinding, type OrganismState,
} from "@/lib/organism/organismClient";

/**
 * VITALS — the organism read as one body rather than as a rack of tools.
 *
 * Three disciplines are deliberately visible:
 *   • no number appears without the witness count that earned it;
 *   • every story shows its falsifier, so the operator can see exactly what
 *     would make the system admit it was wrong;
 *   • an organ that has gone silent is stated, because a calm screen must
 *     never be mistakable for coverage.
 */

const SEV: Record<string, string> = {
  critical: "border-foreground/40 bg-foreground/10 text-foreground",
  high: "border-foreground/30 bg-foreground/[0.06] text-foreground/90",
  medium: "border-border bg-muted/40 text-foreground/80",
  low: "border-border bg-transparent text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  self: "SELF",
  trusted: "TRUSTED",
  unknown: "UNRECOGNISED",
  suspect: "SUSPECT",
  hostile: "HOSTILE",
};

const rel = (iso: string | null | undefined): string => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(m)) return "unknown";
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

const Stat = ({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) => (
  <Card className="border-border/60 bg-card/40 p-3">
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </div>
    <div className="mt-1.5 font-mono text-xl leading-none text-foreground">{value}</div>
    {sub && <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{sub}</div>}
  </Card>
);

const VitalsTab = () => {
  const [loading, setLoading] = useState(true);
  const [pulsing, setPulsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<OrganismState | null>(null);
  const [findings, setFindings] = useState<OrganismFinding[]>([]);
  const [events, setEvents] = useState<OrganismEvent[]>([]);
  const [entities, setEntities] = useState<OrganismEntity[]>([]);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    try {
      const res = await organismState(72);
      if (!alive.current) return;
      setState(res.state);
      setFindings(res.findings ?? []);
      setEvents(res.events ?? []);
      setEntities(res.entities ?? []);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      setError("The bloodstream could not be read. This is a failure to look, not an all-clear.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pulse = useCallback(async () => {
    setPulsing(true);
    try {
      const r = await organismPulse(72);
      toast.success(
        `Metabolism complete — ${r.stories.length} stor${r.stories.length === 1 ? "y" : "ies"}, ` +
        `${r.immuneChanges} immune change(s), ${r.decayed} belief(s) decayed`,
        { description: r.calibrationNote },
      );
      await load();
    } catch {
      toast.error("The pulse could not complete. The last known vitals are still shown.");
    } finally {
      if (alive.current) setPulsing(false);
    }
  }, [load]);

  const vitals = state?.vitals ?? null;
  const strangers = useMemo(
    () => entities.filter((e) => e.self_status === "unknown" || e.self_status === "suspect" || e.self_status === "hostile").slice(0, 24),
    [entities],
  );
  const organCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.organ, (m.get(e.organ) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [events]);

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-live="polite">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
            <HeartPulse className="h-4 w-4" aria-hidden /> Vitals — the organism
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Every collector on this account writes what it sensed into one shared bloodstream. This panel is the body
            reading itself: what is circulating, what it recognises as its own, the stories it has assembled from
            more than one organ agreeing, and how often it has been right before.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={pulse} disabled={pulsing} className="shrink-0">
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${pulsing ? "animate-spin" : ""}`} aria-hidden />
          {pulsing ? "Metabolising" : "Pulse"}
        </Button>
      </header>

      {error && (
        <Card className="border-foreground/30 bg-foreground/[0.04] p-3 text-xs text-foreground">
          <AlertTriangle className="mr-2 inline h-3.5 w-3.5" aria-hidden /> {error}
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Gauge}
          label="Posture"
          value={vitals ? `${vitals.posture}` : "—"}
          sub={vitals ? `100 is healthy. Weighted by story severity, never by alert volume.` : "No metabolism pass yet."}
        />
        <Stat
          icon={Droplets}
          label="Circulation"
          value={vitals ? `${vitals.circulation}` : "—"}
          sub={`${organCounts.length} organ(s) reporting in the last 72h`}
        />
        <Stat
          icon={Layers}
          label="Memory"
          value={vitals ? `${vitals.memory}` : "—"}
          sub={vitals ? `${vitals.selfKnown} recognised as self · ${vitals.strangers} unrecognised` : "—"}
        />
        <Stat
          icon={CheckCircle2}
          label="Calibration"
          value={state ? `${Math.round(Number(state.calibration) * 100)}%` : "—"}
          sub={vitals?.calibrationNote ?? "Confidence gain, learned from how past falsifiers resolved."}
        />
      </div>

      <Card className="border-border/60 bg-card/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Activity className="h-3.5 w-3.5" aria-hidden /> Organs reporting
        </div>
        {organCounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing has circulated in 72 hours. That is an absence of collection, not an absence of threat.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {organCounts.map(([organ, count]) => (
              <Badge key={organ} variant="outline" className="border-border font-mono text-[10px] tracking-wide">
                {organ.toUpperCase()} · {count}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card className="border-border/60 bg-card/40">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <Brain className="h-3.5 w-3.5" aria-hidden /> Stories — assembled across organs
        </div>
        {findings.length === 0 ? (
          <p className="p-3 text-xs leading-relaxed text-muted-foreground">
            No story currently reproduces from the shared window. Single-organ sensations are still being logged; a
            story is only told once at least two independent collectors describe the same subject or the same hour.
          </p>
        ) : (
          <ScrollArea className="max-h-[26rem]">
            <ul className="divide-y divide-border/50">
              {findings.map((f) => (
                <li key={f.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] tracking-wide ${SEV[f.severity] ?? SEV.low}`}>
                      {f.severity.toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className="border-border font-mono text-[10px] tracking-wide">
                      {f.tier.toUpperCase()}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {Math.round(Number(f.confidence) * 100)}% · {f.corroboration} organ(s)
                    </span>
                    {f.reflex_origin && (
                      <Badge variant="outline" className="border-border text-[10px] tracking-wide">REFLEX</Badge>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground">{rel(f.last_seen)}</span>
                  </div>
                  <h3 className="mt-1.5 text-sm font-medium text-foreground">{f.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.narrative}</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/90">
                    <span className="uppercase tracking-[0.14em]">Falsifier</span> — {f.falsifier}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {f.organs.map((o) => (
                      <Badge key={o} variant="outline" className="border-border font-mono text-[10px]">{o.toUpperCase()}</Badge>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-7 text-[11px]"
                      onClick={async () => {
                        try {
                          await organismAcknowledge(f.id);
                          setFindings((prev) => prev.filter((x) => x.id !== f.id));
                        } catch { toast.error("Could not acknowledge this story."); }
                      }}
                    >
                      Acknowledge
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </Card>

      <Card className="border-border/60 bg-card/40">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Immune roster — not-self
        </div>
        {strangers.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            Everything in memory is currently recognised as yours or benign. Designations you set by hand always
            outrank the model's own guess.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {strangers.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 p-2.5">
                <Fingerprint className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {e.label || e.entity_key}
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{e.kind}</span>
                </span>
                <Badge variant="outline" className="border-border text-[10px] tracking-wide">
                  {STATUS_LABEL[e.self_status] ?? e.self_status.toUpperCase()}
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {Math.round(Number(e.confidence) * 100)}% · {e.corroboration} organ(s)
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px]"
                  onClick={async () => {
                    try {
                      await organismDesignate(e.id, "self");
                      setEntities((prev) => prev.map((x) => (x.id === e.id ? { ...x, self_status: "self" } : x)));
                      toast.success("Designated as yours — the immune model will not override this.");
                    } catch { toast.error("Could not update the designation."); }
                  }}
                >
                  This is mine
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-border/60 bg-card/40">
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <CircleDot className="h-3.5 w-3.5" aria-hidden /> Bloodstream — raw circulation
        </div>
        {events.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No sensations in the window.</p>
        ) : (
          <ScrollArea className="max-h-72">
            <ul className="divide-y divide-border/40">
              {events.map((ev) => (
                <li key={ev.id} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                  <span className="w-24 shrink-0 font-mono text-muted-foreground">{ev.organ.toUpperCase()}</span>
                  <span className="w-20 shrink-0 font-mono text-muted-foreground">{ev.verdict}</span>
                  <span className="min-w-0 flex-1 truncate text-foreground/90">{ev.summary || ev.kind}</span>
                  <span className="shrink-0 text-muted-foreground">{rel(ev.observed_at)}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </Card>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Last metabolism {rel(state?.last_metabolism_at)}. The involuntary pass runs on the server every 30 minutes
        whether or not this page is open; the Pulse button only asks for it early.
      </p>
    </div>
  );
};

export default VitalsTab;
