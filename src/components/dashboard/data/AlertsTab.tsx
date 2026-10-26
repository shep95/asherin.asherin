// asherin.data — watch a number. rules are evaluated on this device, against
// the latest stored version, whenever this tab is open or a version lands;
// nothing runs while the room is closed, and the tab says so.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { evaluateRule } from "@/lib/data/analyze";
import {
  createAlertRule, deleteAlertRule, listAlertEvents, listAlertRules, recordAlertEvent, setAlertActive,
  type AlertEventRow, type AlertKind, type AlertRuleRow,
} from "@/lib/data/store";
import { latestOf, profileOf, type Room } from "./room";
import { readVersionRows } from "./useVersionRows";
import { card, chip, errorText, field, fmtWhen } from "./ui";

export default function AlertsTab({ room }: { room: Room }) {
  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [events, setEvents] = useState<AlertEventRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<{ at: string; evaluated: number; fired: number; skipped: string[] } | null>(null);
  const checkedFor = useRef<string>("");

  const load = useCallback(async () => {
    try {
      const [r, e] = await Promise.all([listAlertRules(room.workspace.id), listAlertEvents(room.workspace.id)]);
      setRules(r);
      setEvents(e);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorText(err, "the alerts could not be read"));
    }
  }, [room.workspace.id]);

  useEffect(() => { void load(); }, [load]);

  /** every active rule, against its source's latest version (and the one before for change rules). */
  const check = useCallback(async (current: AlertRuleRow[]) => {
    setChecking(true);
    const skipped: string[] = [];
    let evaluated = 0;
    let fired = 0;
    try {
      for (const rule of current.filter((r) => r.active)) {
        const vers = room.versions[rule.source_id] ?? [];
        const latest = vers[0];
        if (!latest || latest.row_count === 0) { skipped.push(`${rule.name}: its source has no table version`); continue; }
        try {
          const rows = await readVersionRows(latest.id);
          const previous = rule.kind === "change" && vers[1] ? await readVersionRows(vers[1].id) : null;
          evaluated++;
          const hit = evaluateRule(rule, rows, previous);
          if (hit) {
            const fresh = await recordAlertEvent({
              workspace_id: room.workspace.id, rule_id: rule.id, version_id: latest.id,
              message: `${rule.name}: ${hit.message}`, metric: rule.spec.metric, value: hit.value,
            });
            if (fresh) fired++;
          }
        } catch (e) {
          skipped.push(`${rule.name}: ${errorText(e, "could not be evaluated")}`);
        }
      }
      setLastCheck({ at: new Date().toISOString(), evaluated, fired, skipped });
      await load();
    } finally {
      setChecking(false);
    }
  }, [room.versions, room.workspace.id, load]);

  // run once per distinct set of latest versions while the tab is open
  const versionKey = useMemo(() => Object.values(room.versions).map((v) => v[0]?.id ?? "").sort().join(","), [room.versions]);
  useEffect(() => {
    if (!rules.length || checkedFor.current === versionKey) return;
    checkedFor.current = versionKey;
    void check(rules);
  }, [rules, versionKey, check]);

  const tables = room.sources.filter((s) => (latestOf(room, s.id)?.row_count ?? 0) > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={`${card} p-5`}>
        <h2 className="mb-1 text-sm text-white/85">watch a number</h2>
        <p className="mb-3 text-[11px] text-white/45">checked on this device while this tab is open and whenever a new version is stored. nothing runs when the room is closed.</p>
        {tables.length === 0 ? (
          <p className="text-xs text-amber-200/70">add a table first — a rule needs a numeric column to watch.</p>
        ) : (
          <AlertForm
            room={room}
            sources={tables.map((s) => s.id)}
            onCreate={async (payload) => {
              try {
                const rule = await createAlertRule({ workspace_id: room.workspace.id, ...payload });
                toast.success("watching", { description: rule.name });
                const next = [rule, ...rules];
                setRules(next);
                await check(next);
              } catch (e) {
                toast.error("rule not saved", { description: errorText(e, "the rule could not be saved") });
              }
            }}
          />
        )}

        {loadError && <p className="mt-3 text-[11px] text-rose-200/70">{loadError}</p>}

        <ul className="mt-4 space-y-2">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[11px]">
              <span className="mr-auto min-w-0 text-white/75">
                {r.name}<span className="text-white/35"> · {room.sources.find((s) => s.id === r.source_id)?.name ?? "removed source"} · {r.active ? "active" : "paused"}</span>
              </span>
              <button type="button" className={chip} onClick={async () => { try { await setAlertActive(r.id, !r.active); await load(); } catch (e) { toast.error("not updated", { description: errorText(e, "the rule could not be updated") }); } }}>
                {r.active ? "pause" : "resume"}
              </button>
              <button type="button" className={chip} onClick={async () => { try { await deleteAlertRule(r.id); await load(); } catch (e) { toast.error("not removed", { description: errorText(e, "the rule could not be removed") }); } }}>
                remove
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={chip} disabled={checking || !rules.length} onClick={() => void check(rules)}>
            {checking ? <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />checking…</> : "check now"}
          </button>
          {lastCheck && (
            <span className="text-[11px] text-white/45">
              {fmtWhen(lastCheck.at)} · {lastCheck.evaluated} rule(s) checked · {lastCheck.fired} new
            </span>
          )}
        </div>
        {lastCheck?.skipped.length ? (
          <ul className="mt-2 space-y-1 text-[11px] text-amber-200/70">{lastCheck.skipped.map((s, i) => <li key={i}>· {s}</li>)}</ul>
        ) : null}
      </section>

      <section className={`${card} p-5`}>
        <h2 className="mb-3 text-sm text-white/85">what fired</h2>
        {events.length === 0 && <p className="text-xs text-white/45">nothing has fired yet. a rule fires once per stored version.</p>}
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[12px]">
              <div className="text-white/80">{e.message}</div>
              <div className="mt-1 text-[10px] text-white/40">{fmtWhen(e.created_at)}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AlertForm({ room, sources, onCreate }: {
  room: Room;
  sources: string[];
  onCreate: (payload: { source_id: string; name: string; kind: AlertKind; spec: AlertRuleRow["spec"] }) => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState(sources[0] ?? "");
  const [kind, setKind] = useState<AlertKind>("threshold");
  const [aggregate, setAggregate] = useState<"sum" | "avg">("sum");
  const [metric, setMetric] = useState("");
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [threshold, setThreshold] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!sources.includes(sourceId)) setSourceId(sources[0] ?? ""); }, [sources, sourceId]);
  const measures = useMemo(() => profileOf(latestOf(room, sourceId))?.measures ?? [], [room, sourceId]);
  useEffect(() => { if (!measures.includes(metric)) setMetric(measures[0] ?? ""); }, [measures, metric]);

  const n = Number(threshold);
  const valid = !!sourceId && !!metric && (kind === "anomaly" || Number.isFinite(n));

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select className={`${field} text-[11px]`} value={sourceId} onChange={(e) => setSourceId(e.target.value)} aria-label="source">
        {sources.map((id) => <option key={id} value={id}>{room.sources.find((s) => s.id === id)?.name}</option>)}
      </select>
      <select className={`${field} text-[11px]`} value={kind} onChange={(e) => setKind(e.target.value as AlertKind)} aria-label="kind of rule">
        <option value="threshold">crosses a number</option>
        <option value="change">changes between versions by a percentage</option>
        <option value="anomaly">a value breaks its normal range</option>
      </select>
      <select className={`${field} text-[11px]`} value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="column to watch">
        {measures.length === 0 && <option value="">no numeric columns found</option>}
        {measures.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      {kind !== "anomaly" ? (
        <div className="flex gap-2">
          <select className={`${field} text-[11px]`} value={aggregate} onChange={(e) => setAggregate(e.target.value as "sum" | "avg")} aria-label="aggregate">
            <option value="sum">sum</option>
            <option value="avg">average</option>
          </select>
          <select className={`${field} text-[11px]`} value={direction} onChange={(e) => setDirection(e.target.value as "up" | "down")} aria-label="direction">
            <option value="up">{kind === "change" ? "rises by" : "above"}</option>
            <option value="down">{kind === "change" ? "falls by" : "below"}</option>
          </select>
          <input className={`${field} text-[11px]`} value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" aria-label={kind === "change" ? "percent" : "threshold"} placeholder={kind === "change" ? "%" : "value"} />
        </div>
      ) : (
        <p className="self-center text-[11px] text-white/45">fires when any value sits more than 3 standard deviations from the column mean.</p>
      )}
      <button
        type="button"
        className={`${chip} sm:col-span-2`}
        disabled={!valid || saving}
        onClick={async () => {
          setSaving(true);
          try {
            const operator: AlertRuleRow["spec"]["operator"] = kind === "change" ? (direction === "down" ? "change<" : "change>") : direction === "down" ? "<" : ">";
            const label = kind === "anomaly" ? `${metric} breaks its range` : kind === "change" ? `${aggregate} of ${metric} ${direction === "up" ? "rises" : "falls"} by ${n}%` : `${aggregate} of ${metric} ${direction === "up" ? "above" : "below"} ${n}`;
            await onCreate({ source_id: sourceId, name: label, kind, spec: { metric, aggregate, operator, threshold: Number.isFinite(n) ? n : 0, sigma: 3 } });
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "saving…" : "start watching"}
      </button>
    </div>
  );
}
