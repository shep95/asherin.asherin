// settings → spend. recorded calls and per-room off switches, read from the
// ledger this device actually writes (src/lib/usage/ledger.ts). nothing here is
// back-filled: a call is listed because the gated wrapper recorded it, money is
// labelled an estimate because token prices are provider list prices, and a
// room is listed because its code names itself to the gate (spendRooms.ts).

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Power, Receipt, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  bucketBy,
  budgetState,
  fetchUsageEvents,
  hasKnownRate,
  invalidateToolSwitches,
  loadToolSwitches,
  monthToDateUsd,
  setToolApiEnabled,
  setToolBudget,
  type ToolSwitch,
  type UsageEvent,
} from "@/lib/usage/ledger";
import { NAV_INTENTS } from "@/lib/navIntents";
import { GATED_TOOLS, spendRooms } from "./spendRooms";

function labelFor(tool: string): string {
  const hit = NAV_INTENTS.find((n) => n.view === tool);
  return (hit?.label ?? tool).toLowerCase();
}

const money = (n: number) => (n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`);

const UsageSettings = () => {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [switches, setSwitches] = useState<Map<string, ToolSwitch>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ev, sw] = await Promise.all([fetchUsageEvents(30), loadToolSwitches(true)]);
      setEvents(ev);
      setSwitches(new Map(sw));
      setError(null);
    } catch (e) {
      setError((e as Error)?.message?.toLowerCase() || "the ledger could not be read.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byTool = useMemo(() => bucketBy(events, "tool"), [events]);
  const byProvider = useMemo(() => bucketBy(events, "provider"), [events]);
  const mtd = useMemo(() => monthToDateUsd(events), [events]);
  const anyCost = useMemo(() => events.some((e) => e.estimated_cost_usd !== null), [events]);
  const rooms = useMemo(() => spendRooms(GATED_TOOLS, switches, events), [switches, events]);

  const toggle = async (tool: string, next: boolean) => {
    setBusy(tool);
    try {
      await setToolApiEnabled(tool, next);
      invalidateToolSwitches();
      await load();
      toast.success(next ? `${labelFor(tool)} may call a provider again` : `${labelFor(tool)} will not call a provider`);
    } catch (e) {
      toast.error((e as Error).message.toLowerCase());
    } finally {
      setBusy(null);
    }
  };

  const budget = async (tool: string, value: string) => {
    const n = value.trim() === "" ? null : Number(value);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      toast.error("a limit is a number of dollars, zero or more.");
      return;
    }
    try {
      await setToolBudget(tool, n);
      await load();
    } catch (e) {
      toast.error((e as Error).message.toLowerCase());
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border/20 bg-card/20 p-6 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" /> reading the recorded calls…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-border/20 bg-card/20 p-6 text-sm text-muted-foreground">
        <p>the ledger could not be read — {error}</p>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-border/30 px-3 py-1.5 text-xs text-foreground hover:bg-foreground/5">
          try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/20 bg-card/20 p-5" aria-label="recorded spend">
        <div className="mb-1 flex items-center gap-2 text-sm font-light text-foreground/80">
          <Receipt className="h-4 w-4" /> {anyCost ? "estimated spend this month" : "recorded calls — last 30 days"}
        </div>
        <div className="text-3xl font-light tabular-nums text-foreground/90">{anyCost ? money(mtd) : events.length}</div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground/70">
          {anyCost
            ? "an estimate: the tokens your providers reported on recorded calls, priced at published list rates. calls with no token count carry no money."
            : "no priced call is on record. a row is written only when a call goes through the gated path below; the direct provider path that answers chat from this device does not write here yet."}
        </p>
      </section>

      <section className="rounded-xl border border-border/20 bg-card/20 p-5" aria-label="calls by room">
        <div className="mb-3 text-sm font-light text-foreground/80">by room — last 30 days</div>
        {byTool.length === 0 ? (
          <p className="text-sm text-muted-foreground/70">nothing recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {byTool.map((b) => (
              <div key={b.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-foreground/70">{labelFor(b.key)}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground/70">
                  {b.calls} {b.calls === 1 ? "call" : "calls"}
                  {b.tokensKnown ? ` · ${b.tokens.toLocaleString()} tokens` : " · tokens not reported"}
                  {b.costKnown ? ` · ${money(b.estimatedUsd)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {byProvider.length > 0 && (
        <section className="rounded-xl border border-border/20 bg-card/20 p-5" aria-label="calls by provider">
          <div className="mb-3 text-sm font-light text-foreground/80">by provider — last 30 days</div>
          <div className="space-y-2">
            {byProvider.map((b) => (
              <div key={b.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground/70">{b.key}</span>
                <span className="tabular-nums text-muted-foreground/70">
                  {b.calls} {b.calls === 1 ? "call" : "calls"}
                  {b.costKnown ? ` · ${money(b.estimatedUsd)}` : hasKnownRate(b.key) ? " · no tokens reported" : " · no published rate on file"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border/20 bg-card/20 p-5" aria-label="rooms that may call a provider">
        <div className="mb-1 flex items-center gap-2 text-sm font-light text-foreground/80">
          <Power className="h-4 w-4" /> which rooms may call a provider
        </div>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground/70">
          off stops the request before it leaves this browser; the room still opens and says its provider is off. listed are the rooms whose code checks this switch, plus any room with a recorded call.
        </p>
        <div className="space-y-2">
          {rooms.map((tool) => {
            const row = switches.get(tool);
            const enabled = row ? row.enabled : true;
            const spent = monthToDateUsd(events, tool);
            const state = budgetState(spent, row?.monthly_budget_usd ?? null);
            const budgetId = `budget-${tool}`;
            return (
              <div key={tool} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/15 bg-background/20 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground/80">{labelFor(tool)}</div>
                  <div className="text-[11px] tabular-nums text-muted-foreground/60">
                    {money(spent)} this month
                    {state === "warn" && " · close to the limit"}
                    {state === "over" && " · over the limit"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {state === "over" || state === "warn" ? <AlertTriangle className="h-4 w-4 text-foreground/60" aria-label="near or over the limit" /> : null}
                  <label htmlFor={budgetId} className="sr-only">
                    monthly limit in dollars for {labelFor(tool)}
                  </label>
                  <input
                    id={budgetId}
                    type="number"
                    min={0}
                    step="1"
                    defaultValue={row?.monthly_budget_usd ?? ""}
                    placeholder="limit $"
                    onBlur={(e) => void budget(tool, e.target.value)}
                    className="w-24 rounded-md border border-border/20 bg-background/40 px-2 py-1 text-xs text-foreground outline-none focus:border-foreground/30"
                  />
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${labelFor(tool)} may call a provider`}
                    disabled={busy === tool}
                    onClick={() => void toggle(tool, !enabled)}
                    className={`rounded-md border px-3 py-1 text-xs transition ${
                      enabled ? "border-foreground/25 bg-foreground/10 text-foreground/85" : "border-border/20 bg-transparent text-muted-foreground/60"
                    }`}
                  >
                    {busy === tool ? "…" : enabled ? "on" : "off"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default UsageSettings;
