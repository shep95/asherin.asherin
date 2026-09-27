import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithByokRetry } from "@/lib/byokInvoke";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plane, Train, Ship, Bus, Car, Loader2, Trash2, RefreshCw, Mail, ShieldAlert } from "lucide-react";

/**
 * TRANSIT — every leg of a journey, not just the car.
 *
 * The rider desk asked "who is this driver". At a gate or a platform that is
 * the wrong question, so this surface asks the one that fits the mode: which
 * airframe is actually answering this flight number, which station is this
 * service really calling at, and what does the ground look like where the
 * traveller steps off.
 *
 * Every list row is honest about which phase produced it: a fast pass is a
 * completeness read of the booking, a sweep is primary-source evidence.
 */

type Verdict = "CLEAR" | "THIN" | "WATCH" | "AVOID";
type Mode = "car" | "rail" | "air" | "helicopter" | "bus" | "ferry";

const VERDICT_STYLE: Record<Verdict, string> = {
  CLEAR: "border-foreground/25 bg-foreground/[0.04] text-foreground/80",
  THIN: "border-border/40 bg-muted/20 text-muted-foreground",
  WATCH: "border-foreground/50 bg-foreground/[0.09] text-foreground",
  AVOID: "border-foreground bg-foreground text-background",
};

const MODE_ICON: Record<Mode, typeof Plane> = {
  air: Plane,
  helicopter: Plane,
  rail: Train,
  bus: Bus,
  ferry: Ship,
  car: Car,
};

const MODE_LABEL: Record<Mode, string> = {
  car: "Car",
  rail: "Train",
  air: "Flight",
  helicopter: "Helicopter",
  bus: "Coach",
  ferry: "Ferry",
};

const IDENT_HINT: Record<Mode, string> = {
  air: "Flight number or tail (UA2402, N628TS)",
  helicopter: "Tail registration (N628TS)",
  rail: "Train or service number (2151)",
  bus: "Service or coach number",
  ferry: "Sailing or vessel name",
  car: "Licence plate",
};

interface Report {
  id: string;
  phase: "fast" | "deep";
  verdict: Verdict;
  confidence: number;
  headline: string | null;
  payload: Record<string, any>;
  created_at: string;
}

interface Leg {
  id: string;
  mode: Mode | null;
  operator: string | null;
  operator_label: string | null;
  vehicle_ident: string | null;
  pickup_label: string | null;
  destination_label: string | null;
  depart_at: string | null;
  booking_ref: string | null;
  seat: string | null;
  auto_captured: boolean | null;
  status: string;
  verdict: Verdict | null;
  created_at: string;
  rideshare_reports: Report[];
}

const VerdictChip = ({ verdict }: { verdict: Verdict | null }) => (
  <span
    className={`inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.22em] ${
      verdict ? VERDICT_STYLE[verdict] : "border-border/40 text-muted-foreground"
    }`}
  >
    {verdict ?? "pending"}
  </span>
);

/** Resolve the caller's own AI key when they have one; the server falls back safely otherwise. */
async function resolveByok(): Promise<Record<string, string> | undefined> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return undefined;
    const { data: pref } = await supabase
      .from("user_model_preferences" as any)
      .select("active_provider, active_model")
      .eq("user_id", user.id)
      .maybeSingle();
    const provider = (pref as any)?.active_provider;
    const model = (pref as any)?.active_model;
    if (!provider || provider === "default" || !model || model === "default") return undefined;
    const { data: keyRow } = await supabase
      .from("user_api_keys" as any)
      .select("api_key")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .eq("is_active", true)
      .maybeSingle();
    const apiKey = (keyRow as any)?.api_key;
    return apiKey ? { provider, model, apiKey } : undefined;
  } catch {
    return undefined;
  }
}

const OPERATORS: Record<Mode, Array<{ id: string; label: string }>> = {
  air: [
    { id: "delta", label: "Delta Air Lines" },
    { id: "united", label: "United Airlines" },
    { id: "american", label: "American Airlines" },
    { id: "southwest", label: "Southwest Airlines" },
    { id: "jetblue", label: "JetBlue" },
    { id: "alaska", label: "Alaska Airlines" },
    { id: "unknown", label: "Other / not listed" },
  ],
  helicopter: [
    { id: "blade", label: "Blade" },
    { id: "unknown", label: "Other charter" },
  ],
  rail: [
    { id: "amtrak", label: "Amtrak" },
    { id: "eurostar", label: "Eurostar" },
    { id: "brightline", label: "Brightline" },
    { id: "unknown", label: "Other / regional" },
  ],
  bus: [
    { id: "greyhound", label: "Greyhound" },
    { id: "flixbus", label: "FlixBus" },
    { id: "unknown", label: "Other / not listed" },
  ],
  ferry: [{ id: "unknown", label: "Ferry operator" }],
  car: [
    { id: "uber", label: "Uber" },
    { id: "lyft", label: "Lyft" },
    { id: "unknown", label: "Other / taxi" },
  ],
};

const TransitTab = () => {
  const [legs, setLegs] = useState<Leg[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [sweeping, setSweeping] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Mode>("all");

  const [form, setForm] = useState({
    mode: "air" as Mode,
    operator: "delta",
    vehicle_ident: "",
    origin_label: "",
    destination_label: "",
    depart_at: "",
    booking_ref: "",
    seat: "",
  });

  const call = useCallback(async (body: Record<string, unknown>) => {
    const byok = await resolveByok();
    // The helper throws on transport and terminal-429 failures and returns the
    // parsed body otherwise, so a thrown error here is the only failure path.
    const data = await invokeWithByokRetry<Record<string, any>>("transit-guardian", {
      body: { ...body, byok },
    });
    if (data?.error) throw new Error(data.message || data.error);
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const d = await call({ action: "leg.list" });
      setLegs((d.legs || []) as Leg[]);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => (filter === "all" ? legs : legs.filter((l) => (l.mode || "car") === filter)),
    [legs, filter],
  );

  const capture = async () => {
    if (!form.vehicle_ident.trim() && !(form.origin_label.trim() && form.destination_label.trim())) {
      toast.error("Give a service identifier, or both ends of the route.");
      return;
    }
    setCapturing(true);
    try {
      await call({ action: "leg.capture", ...form });
      toast.success("Leg captured.");
      setForm((f) => ({ ...f, vehicle_ident: "", booking_ref: "", seat: "" }));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCapturing(false);
    }
  };

  const scanMail = async () => {
    setScanning(true);
    try {
      const d = await call({ action: "mail.scan", lookback_hours: 72 });
      toast.success(
        d.saved
          ? `${d.saved} leg${d.saved === 1 ? "" : "s"} read from ${d.scanned_accounts?.length ?? 0} mailbox(es).`
          : "No travel itineraries found in the last 72 hours.",
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const sweep = async (id: string) => {
    setSweeping(id);
    try {
      const d = await call({ action: "leg.sweep", leg_id: id });
      toast.success(`Sweep complete — ${d.deep?.verdict ?? "done"}.`);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSweeping(null);
    }
  };

  const remove = async (id: string) => {
    try {
      await call({ action: "leg.delete", leg_id: id });
      setLegs((l) => l.filter((x) => x.id !== id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const operatorChoices = OPERATORS[form.mode];

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 px-5 py-4">
        {/* ── capture ─────────────────────────────────────────────── */}
        <section className="rounded-sm border border-border/40 bg-muted/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Capture a leg
            </h3>
            <Button size="sm" variant="outline" onClick={scanMail} disabled={scanning}>
              {scanning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}
              Read itineraries from mail
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Mode</Label>
              <Select
                value={form.mode}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, mode: v as Mode, operator: OPERATORS[v as Mode][0].id }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                    <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Operator</Label>
              <Select value={form.operator} onValueChange={(v) => setForm((f) => ({ ...f, operator: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {operatorChoices.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Service</Label>
              <Input
                value={form.vehicle_ident}
                placeholder={IDENT_HINT[form.mode]}
                onChange={(e) => setForm((f) => ({ ...f, vehicle_ident: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Departure</Label>
              <Input
                type="datetime-local"
                value={form.depart_at}
                onChange={(e) => setForm((f) => ({ ...f, depart_at: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                value={form.origin_label}
                placeholder="Origin station, airport or address"
                onChange={(e) => setForm((f) => ({ ...f, origin_label: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                value={form.destination_label}
                placeholder="Destination"
                onChange={(e) => setForm((f) => ({ ...f, destination_label: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Booking reference</Label>
              <Input
                value={form.booking_ref}
                placeholder="PNR (optional)"
                onChange={(e) => setForm((f) => ({ ...f, booking_ref: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Seat</Label>
              <Input
                value={form.seat}
                placeholder="Optional"
                onChange={(e) => setForm((f) => ({ ...f, seat: e.target.value }))}
              />
            </div>
          </div>

          <Button className="mt-3" size="sm" onClick={capture} disabled={capturing}>
            {capturing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />}
            Capture and fast-pass
          </Button>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            A fast pass reads only what the booking says. The sweep is what queries the aircraft registry,
            live ADS-B, the open transit graph and the ground risk where you arrive.
          </p>
        </section>

        {/* ── filter ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(["all", "air", "rail", "car", "helicopter", "bus", "ferry"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFilter(m)}
              className={`rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                filter === m
                  ? "border-foreground/60 bg-foreground/[0.08] text-foreground"
                  : "border-border/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "all" ? "All" : MODE_LABEL[m]}
            </button>
          ))}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh
          </Button>
        </div>

        {/* ── list ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : loadError ? (
          <div className="rounded-sm border border-border/40 p-4 text-sm text-muted-foreground">
            {loadError}
            <Button size="sm" variant="outline" className="ml-3" onClick={() => void load()}>Retry</Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border/40 p-6 text-center text-sm text-muted-foreground">
            No legs recorded yet. Capture one above, or read your itineraries from connected mail.
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((leg) => {
              const mode = (leg.mode || "car") as Mode;
              const Icon = MODE_ICON[mode];
              const deep = leg.rideshare_reports?.find((r) => r.phase === "deep");
              const fast = leg.rideshare_reports?.find((r) => r.phase === "fast");
              const shown = deep || fast;
              const flags = (shown?.payload?.flags || []) as Array<{ code: string; severity: string; detail: string }>;
              return (
                <article key={leg.id} className="rounded-sm border border-border/40 bg-background/40 p-4">
                  <header className="flex flex-wrap items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-foreground">
                      {leg.operator_label || leg.operator || MODE_LABEL[mode]}
                      {leg.vehicle_ident ? ` · ${leg.vehicle_ident}` : ""}
                    </span>
                    <VerdictChip verdict={leg.verdict} />
                    {leg.auto_captured && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        from mail
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => void sweep(leg.id)} disabled={sweeping === leg.id}>
                        {sweeping === leg.id
                          ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          : <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />}
                        Sweep
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Delete leg" onClick={() => void remove(leg.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </header>

                  <p className="mt-2 text-sm text-foreground/85">
                    {leg.pickup_label || "?"} → {leg.destination_label || "?"}
                    {leg.depart_at ? ` · ${leg.depart_at.replace("T", " ").slice(0, 16)}` : ""}
                    {leg.seat ? ` · seat ${leg.seat}` : ""}
                  </p>

                  {shown?.headline && (
                    <p className="mt-1.5 text-xs text-muted-foreground">{shown.headline}</p>
                  )}

                  {shown?.payload?.assessment && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                      {String(shown.payload.assessment)}
                    </p>
                  )}

                  {flags.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {flags.map((f, i) => (
                        <li key={`${f.code}-${i}`} className="text-xs leading-relaxed text-muted-foreground">
                          <span className="font-mono uppercase tracking-[0.16em] text-foreground/70">{f.code}</span>
                          {" — "}{f.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default TransitTab;
