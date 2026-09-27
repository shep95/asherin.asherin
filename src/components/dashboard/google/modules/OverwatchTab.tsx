import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck, RefreshCw, Radar, Laptop, Smartphone, Tablet, Monitor, HelpCircle,
  AlertTriangle, CheckCircle2, EyeOff, Trash2, Gauge, Activity, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  opAcknowledge, opConsent, opCurrentDeviceId, opRevokeDevice, opSettings, opState, opTrustDevice,
  setOpConsent, type ConsentLevel,
} from "@/lib/op/opClient";
import { opReport } from "@/lib/op/opClient";

/**
 * OVERWATCH — the account's posture, not a device's.
 *
 * Everything on this panel is read out of the shared ledger every device
 * writes into. Two disciplines are visible on purpose:
 *   • confidence is always shown WITH its corroboration, because a number
 *     without its witness count is a claim, not evidence;
 *   • a device that has gone quiet appears as an explicit finding rather than
 *     as an empty row, so a calm screen can never be mistaken for coverage.
 */

interface OpDeviceRow {
  device_id: string; label: string | null; platform: string | null; form_factor: string;
  consent_level: string; trusted: boolean; revoked: boolean; enrolled_at: string;
  last_report_at: string | null; last_tier: string | null; expected_interval_minutes: number;
}
interface OpFindingRow {
  id: string; code: string; title: string; narrative: string; severity: string;
  confidence: number; corroborating_devices: number; distinct_signal_types: number;
  response_tier: string; status: string; exposed_device_id: string | null;
  evidence: Record<string, any>; recommendations: string[]; first_seen: string; last_seen: string;
}
interface OpActionRow { id: string; action: string; device_id: string | null; rationale: any; outcome: string; requested_at: string }
interface OpNetworkRow { network_key: string; label: string | null; org: string | null; verdict: string; hostile_reports: number; clean_reports: number; last_seen: string }
interface OpSignalRow { device_id: string; signal_type: string; verdict: string; runtime_tier: string; observed_at: string }

const FORM_ICON: Record<string, React.ElementType> = { phone: Smartphone, tablet: Tablet, laptop: Laptop, desktop: Monitor, unknown: HelpCircle };

const SEV_STYLE: Record<string, string> = {
  critical: "border-foreground/40 bg-foreground/10 text-foreground",
  high: "border-foreground/30 bg-foreground/[0.06] text-foreground/90",
  elevated: "border-border bg-muted/40 text-foreground/80",
  informational: "border-border bg-transparent text-muted-foreground",
};

const rel = (iso: string | null): string => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(m)) return "unknown";
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

const OverwatchTab = () => {
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [devices, setDevices] = useState<OpDeviceRow[]>([]);
  const [findings, setFindings] = useState<OpFindingRow[]>([]);
  const [actions, setActions] = useState<OpActionRow[]>([]);
  const [networks, setNetworks] = useState<OpNetworkRow[]>([]);
  const [signals, setSignals] = useState<OpSignalRow[]>([]);
  const [autoResponse, setAutoResponse] = useState(true);
  const [consent, setConsent] = useState<ConsentLevel>(opConsent());
  const [error, setError] = useState<string | null>(null);
  const thisDevice = opCurrentDeviceId();

  const load = useCallback(async (sweep = false) => {
    const res: any = await opState(sweep);
    if (!res?.ok) { setError("The OP ledger could not be read. This is a failure to look, not an all-clear."); setLoading(false); return; }
    setError(null);
    setDevices(res.devices ?? []);
    setFindings((res.findings ?? []).filter((f: OpFindingRow) => f.status !== "expired"));
    setActions(res.actions ?? []);
    setNetworks(res.networks ?? []);
    setSignals(res.signals ?? []);
    setAutoResponse(res.state?.auto_response_enabled !== false);
    setLoading(false);
  }, []);

  useEffect(() => { void load(false); }, [load]);

  const sweepNow = async () => {
    setSweeping(true);
    try {
      await opReport("foreground");
      await load(true);
      toast.success("Overwatch re-scored the account from every device on the roster.");
    } finally {
      setSweeping(false);
    }
  };

  // Posture is derived here from the same weights the server uses, so the panel
  // and the unattended sweep can never disagree about how bad things are.
  const posture = useMemo(() => {
    const open = findings.filter((f) => f.status === "open");
    const risk = open.reduce((acc, f) => {
      const w = f.severity === "critical" ? 34 : f.severity === "high" ? 20 : f.severity === "elevated" ? 9 : 3;
      return acc + w * Number(f.confidence);
    }, 0);
    const score = Math.max(0, Math.min(100, Math.round(100 - risk)));
    const silent = open.filter((f) => f.code.startsWith("device-silent:")).length;
    const live = devices.filter((d) => !d.revoked).length;
    return {
      score,
      label: score >= 85 ? "NOMINAL" : score >= 65 ? "WATCH" : score >= 40 ? "PRESSURED" : "COMPROMISED",
      covered: Math.max(0, live - silent),
      live,
      silent,
    };
  }, [findings, devices]);

  const applyConsent = (level: ConsentLevel) => {
    setOpConsent(level);
    setConsent(level);
    toast.success(
      level === "identity" ? "This device is presence-only. It will be counted, not sensed."
        : level === "read" ? "This device now reports network and radio findings."
        : "This device now reports position as well, so the roster can catch impossible-location claims.",
    );
    void opReport("foreground").then(() => load(false));
  };

  if (loading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const open = findings.filter((f) => f.status === "open");

  return (
    <div className="space-y-5">
      {/* POSTURE ─────────────────────────────────────────────────────────── */}
      <Card className="border-border/60 bg-background/40 p-5 backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Overwatch · account posture
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-light tabular-nums">{posture.score}</span>
              <Badge variant="outline" className="border-foreground/30 text-[10px] tracking-[0.2em]">{posture.label}</Badge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              This is the posture of the <span className="text-foreground">account</span>, not of any one device. {posture.covered} of {posture.live} enrolled device{posture.live === 1 ? "" : "s"} reporting
              {posture.silent > 0 && <> · <span className="text-foreground">{posture.silent} silent and not assumed safe</span></>}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Auto response</span>
              <Switch
                checked={autoResponse}
                onCheckedChange={async (v) => { setAutoResponse(v); await opSettings({ autoResponse: v }); }}
                aria-label="Allow corroborated findings to act automatically"
              />
            </div>
            <Button variant="outline" size="sm" onClick={sweepNow} disabled={sweeping}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${sweeping ? "animate-spin" : ""}`} />
              {sweeping ? "Sweeping" : "Sweep now"}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {(["identity", "read", "comprehension"] as ConsentLevel[]).map((lvl) => (
            <button
              key={lvl}
              onClick={() => applyConsent(lvl)}
              className={`rounded-md border p-3 text-left transition-colors ${consent === lvl ? "border-foreground/40 bg-foreground/[0.06]" : "border-border/60 hover:bg-muted/40"}`}
            >
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{lvl}</div>
              <div className="mt-1 text-xs text-foreground/80">
                {lvl === "identity" && "Presence only. Counted on the roster, sensed nowhere."}
                {lvl === "read" && "Network and radio findings from this device."}
                {lvl === "comprehension" && "Adds position, enabling impossible-location detection."}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {error && (
        <Card className="border-foreground/30 bg-foreground/[0.04] p-4 text-sm">
          <AlertTriangle className="mr-2 inline h-4 w-4" /> {error}
          <Button variant="ghost" size="sm" className="ml-3" onClick={() => void load(false)}>Retry</Button>
        </Card>
      )}

      {/* FINDINGS ────────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          <Radar className="h-3.5 w-3.5" /> Correlated findings
        </div>
        {open.length === 0 ? (
          <Card className="border-border/60 p-6 text-sm text-muted-foreground">
            <CheckCircle2 className="mb-2 h-5 w-5 text-foreground/70" />
            Nothing is currently correlating across the roster. That statement covers only the {posture.covered} device{posture.covered === 1 ? "" : "s"} actually reporting — it is not a claim about the ones that are not.
          </Card>
        ) : (
          <div className="space-y-2">
            {open.map((f) => (
              <Card key={f.id} className={`border p-4 ${SEV_STYLE[f.severity] ?? SEV_STYLE.informational}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{f.title}</span>
                      <Badge variant="outline" className="text-[9px] uppercase tracking-[0.18em]">{f.severity}</Badge>
                      <Badge variant="outline" className="text-[9px] uppercase tracking-[0.18em]">
                        {f.response_tier === "act" ? "acted" : f.response_tier === "advise" ? "advisory" : "logged"}
                      </Badge>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{f.narrative}</p>

                    {/* Confidence is never shown alone. */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Gauge className="h-3 w-3" /> {Math.round(Number(f.confidence) * 100)}% confidence
                      </span>
                      <span>{f.corroborating_devices} device{f.corroborating_devices === 1 ? "" : "s"} corroborating</span>
                      <span>{f.distinct_signal_types} independent signal type{f.distinct_signal_types === 1 ? "" : "s"}</span>
                      <span>first seen {rel(f.first_seen)} · last {rel(f.last_seen)}</span>
                    </div>
                    {f.corroborating_devices < 2 && (
                      <p className="text-[11px] text-muted-foreground/80">
                        Single-witness finding — capped at advisory. No automatic action can be taken from one device alone.
                      </p>
                    )}

                    {(f.recommendations ?? []).length > 0 && (
                      <ul className="mt-1 space-y-1">
                        {(f.recommendations ?? []).map((r, i) => (
                          <li key={i} className="text-xs text-foreground/80">— {r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    onClick={async () => { await opAcknowledge(f.id); await load(false); }}
                  >
                    <EyeOff className="mr-1.5 h-3.5 w-3.5" /> Acknowledge
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ROSTER ──────────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          <Laptop className="h-3.5 w-3.5" /> Device roster
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {devices.map((d) => {
            const Icon = FORM_ICON[d.form_factor] ?? HelpCircle;
            const overdue = d.last_report_at
              ? Date.now() - Date.parse(d.last_report_at) > d.expected_interval_minutes * 3 * 60_000
              : true;
            return (
              <Card key={d.device_id} className={`border p-4 ${d.revoked ? "border-border/40 opacity-50" : overdue ? "border-foreground/30" : "border-border/60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate text-sm">{d.label || d.platform || d.device_id.slice(0, 12)}</span>
                      {d.device_id === thisDevice && <Badge variant="outline" className="text-[9px]">this device</Badge>}
                      {d.trusted && <Badge variant="outline" className="text-[9px]">trusted</Badge>}
                      {d.revoked && <Badge variant="outline" className="text-[9px]">revoked</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {d.platform} · consent {d.consent_level} · {d.last_tier ?? "no tier"} · last reading {rel(d.last_report_at)}
                    </div>
                    {overdue && !d.revoked && (
                      <div className="text-[11px] text-foreground/80">Overdue against its {d.expected_interval_minutes}-minute cadence. Absence is recorded, not assumed safe.</div>
                    )}
                  </div>
                  {!d.revoked && (
                    <div className="flex shrink-0 gap-1">
                      {!d.trusted && (
                        <Button variant="ghost" size="sm" onClick={async () => { await opTrustDevice(d.device_id); await load(false); }}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="sm"
                        onClick={async () => { await opRevokeDevice(d.device_id); await load(false); toast.success("Device revoked from the roster."); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* NETWORKS + AUDIT ────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            <Activity className="h-3.5 w-3.5" /> Shared network reputation
          </div>
          <Card className="border-border/60">
            <ScrollArea className="h-56">
              <div className="divide-y divide-border/40">
                {networks.length === 0 && <div className="p-4 text-xs text-muted-foreground">No network has been attributed yet.</div>}
                {networks.map((n) => (
                  <div key={n.network_key} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs">{n.label || n.network_key}</div>
                      <div className="text-[10px] text-muted-foreground">{n.org ?? "unattributed"} · {n.hostile_reports} adverse / {n.clean_reports} clean · {rel(n.last_seen)}</div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[9px] uppercase">{n.verdict}</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Automated action ledger
          </div>
          <Card className="border-border/60">
            <ScrollArea className="h-56">
              <div className="divide-y divide-border/40">
                {actions.length === 0 && (
                  <div className="p-4 text-xs text-muted-foreground">No automatic action has ever been taken on this account. Every one that ever is will be written here before it executes.</div>
                )}
                {actions.map((a) => (
                  <div key={a.id} className="space-y-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs">{a.action.replace(/_/g, " ")}</span>
                      <Badge variant="outline" className="text-[9px] uppercase">{a.outcome}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {rel(a.requested_at)} · {a.rationale?.code} · {Math.round((a.rationale?.confidence ?? 0) * 100)}% across {a.rationale?.corroboratingDevices ?? 1} device(s)
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </section>
      </div>

      {/* RECENT SIGNAL STREAM ────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Recent readings across the roster</div>
        <Card className="border-border/60">
          <ScrollArea className="h-44">
            <div className="grid gap-1 p-3 sm:grid-cols-2">
              {signals.length === 0 && <div className="text-xs text-muted-foreground">No device has filed a reading yet.</div>}
              {signals.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded border border-border/40 px-2 py-1 text-[11px]">
                  <span className="truncate text-muted-foreground">
                    {s.signal_type} · {devices.find((d) => d.device_id === s.device_id)?.label ?? s.device_id.slice(0, 10)} · {s.runtime_tier}
                  </span>
                  <span className={s.verdict === "hostile" ? "text-foreground" : "text-muted-foreground"}>{s.verdict}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      </section>
    </div>
  );
};

export default OverwatchTab;
