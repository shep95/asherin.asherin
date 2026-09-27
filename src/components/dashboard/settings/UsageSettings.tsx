// settings → spend. Owner-scoped, recorded-only usage and per-room off
// switches. Everything here comes from calls the app actually made; money is
// labelled an estimate because token prices are provider list prices, not a
// bill we received.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Power, DollarSign, AlertTriangle } from "lucide-react";
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

// Rooms that can spend on an AI provider. Kept explicit so the list never
// claims a room spends money when it does not.
const AI_TOOLS: string[] = [
  "chat",
  "search",
  "asherin-eye",
  "asherin-sentinel",
  "asherin-arvision",
  "asherin-health",
  "zerlal",
  "investigations",
  "briefing",
  "pdf-generator",
  "knowledge-vault",
  "pattern-analysis",
  "notebooks",
];

function labelFor(tool: string): string {
  const hit = NAV_INTENTS.find((n) => n.view === tool);
  return hit?.label ?? tool;
}

const money = (n: number) => (n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`);

const UsageSettings = () => {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [switches, setSwitches] = useState<Map<string, ToolSwitch>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ev, sw] = await Promise.all([fetchUsageEvents(30), loadToolSwitches(true)]);
    setEvents(ev);
    setSwitches(new Map(sw));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byTool = useMemo(() => bucketBy(events, "tool"), [events]);
  const byProvider = useMemo(() => bucketBy(events, "provider"), [events]);
  const mtd = useMemo(() => monthToDateUsd(events), [events]);

  const toggle = async (tool: string, next: boolean) => {
    setBusy(tool);
    try {
      await setToolApiEnabled(tool, next);
      invalidateToolSwitches();
      await load();
      toast.success(next ? `${labelFor(tool)} can use AI again` : `${labelFor(tool)} will not call AI`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const budget = async (tool: string, value: string) => {
    const n = value.trim() === "" ? null : Number(value);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return;
    try {
      await setToolBudget(tool, n);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" /> reading your recorded calls…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-white/80">
          <DollarSign className="h-4 w-4" /> spend this month
        </div>
        <div className="text-3xl font-light tabular-nums text-white/90">{money(mtd)}</div>
        <p className="mt-2 text-xs leading-relaxed text-white/40">
          estimate only. it is worked out from the tokens your providers reported on the calls this
          app made in the last 30 days, priced at published list rates. calls where the provider
          reported no token count are counted as calls with no money attached.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-3 text-sm font-medium text-white/80">by room — last 30 days</div>
        {byTool.length === 0 ? (
          <p className="text-sm text-white/40">nothing recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {byTool.map((b) => (
              <div key={b.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-white/70">{labelFor(b.key)}</span>
                <span className="shrink-0 tabular-nums text-white/45">
                  {b.calls} {b.calls === 1 ? "call" : "calls"}
                  {b.tokensKnown ? ` · ${b.tokens.toLocaleString()} tokens` : " · tokens not reported"}
                  {b.costKnown ? ` · ${money(b.estimatedUsd)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-3 text-sm font-medium text-white/80">by provider — last 30 days</div>
        {byProvider.length === 0 ? (
          <p className="text-sm text-white/40">nothing recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {byProvider.map((b) => (
              <div key={b.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-white/70">{b.key}</span>
                <span className="tabular-nums text-white/45">
                  {b.calls} {b.calls === 1 ? "call" : "calls"}
                  {b.costKnown
                    ? ` · ${money(b.estimatedUsd)}`
                    : hasKnownRate(b.key)
                      ? " · no tokens reported"
                      : " · no published rate on file"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-white/80">
          <Power className="h-4 w-4" /> which rooms may call AI
        </div>
        <p className="mb-4 text-xs text-white/40">
          turning a room off stops the request before it leaves your browser. the room still opens
          and tells you its AI is off.
        </p>
        <div className="space-y-2">
          {AI_TOOLS.map((tool) => {
            const row = switches.get(tool);
            const enabled = row ? row.enabled : true;
            const spent = monthToDateUsd(events, tool);
            const state = budgetState(spent, row?.monthly_budget_usd ?? null);
            return (
              <div
                key={tool}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-white/75">{labelFor(tool)}</div>
                  <div className="text-[11px] tabular-nums text-white/35">
                    {money(spent)} this month
                    {state === "warn" && " · close to your limit"}
                    {state === "over" && " · over your limit"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {state === "over" || state === "warn" ? (
                    <AlertTriangle className="h-4 w-4 text-white/60" />
                  ) : null}
                  <input
                    type="number"
                    min={0}
                    step="1"
                    defaultValue={row?.monthly_budget_usd ?? ""}
                    placeholder="limit $"
                    onBlur={(e) => void budget(tool, e.target.value)}
                    className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs text-white/80 outline-none focus:border-white/25"
                  />
                  <button
                    type="button"
                    disabled={busy === tool}
                    onClick={() => void toggle(tool, !enabled)}
                    className={`rounded-md border px-3 py-1 text-xs transition ${
                      enabled
                        ? "border-white/20 bg-white/10 text-white/85"
                        : "border-white/10 bg-transparent text-white/40"
                    }`}
                  >
                    {busy === tool ? "…" : enabled ? "on" : "off"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default UsageSettings;
