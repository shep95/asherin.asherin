import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Database, RefreshCw, Search, ShieldAlert, Download, Loader2,
  Inbox, X, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import OrganOffline from "../OrganOffline";
import { NO_ACCOUNT_PATH, describeFailure } from "../offline";

// ── Contracts mirror supabase/functions/google-substrate/index.ts ──────────

interface Insight {
  id: string;
  domain: string;
  code: string;
  severity: number;
  title: string;
  detail: string;
  metric: Record<string, any>;
  computed_at: string;
}

interface Signal {
  id: string;
  source: string;
  kind: string;
  occurred_at: string | null;
  actor_email: string | null;
  actor_name: string | null;
  direction: string | null;
  subject: string | null;
  snippet: string | null;
  amount: number | string | null;
  currency: string | null;
  metadata: Record<string, any> | null;
  account_email: string | null;
}

interface Status {
  accounts: Array<{ id: string; email: string; tier: number | null; surfaces: string[] }>;
  signals: number;
  insights: number;
  sweeps: Array<{ source: string; last_run_at: string | null; signals_ingested: number; status: string; error: string | null }>;
  lastIngest: string | null;
}

interface Brief {
  totalSignals: number;
  insights: Insight[];
  byDomain: Record<string, Insight[]>;
  recent: Signal[];
  generatedAt: string;
}

const SOURCES = ["all", "gmail", "sms", "calendar", "drive", "contacts", "tasks"] as const;

const severityLabel = (s: number) =>
  s >= 5 ? "critical" : s >= 4 ? "high" : s >= 3 ? "elevated" : s >= 2 ? "noted" : "baseline";

const fmtWhen = (v: string | null) =>
  v ? new Date(v).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const relAge = (v: string | null) => {
  if (!v) return "never";
  const h = (Date.now() - Date.parse(v)) / 36e5;
  if (!Number.isFinite(h)) return "unknown";
  if (h < 1) return "minutes ago";
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const SubstrateExplorer = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [source, setSource] = useState<(typeof SOURCES)[number]>("all");
  const [results, setResults] = useState<Signal[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Every in-flight request is abandoned on unmount so a slow sweep cannot
  // set state on a torn-down tree.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error: fnErr } = await supabase.functions.invoke("google-substrate", { body });
    if (fnErr) throw new Error(fnErr.message);
    if (data?.error) throw new Error(String(data.message ?? data.error));
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, b] = await Promise.all([call({ action: "status" }), call({ action: "brief" })]);
      if (!alive.current) return;
      setStatus(s as Status);
      setBrief(b as Brief);
    } catch (e) {
      if (alive.current) setError(describeFailure(e, "substrate organ"));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  const sweep = useCallback(async () => {
    setSweeping(true);
    try {
      const r = await call({ action: "sweep", days: 90, cap: 200 });
      toast.success(
        `Sweep complete — ${r.ingested} signals indexed, ${r.derived} findings derived` +
        (r.partial ? " (partial: budget reached, run again to extend)" : ""),
      );
      const failed = (r.reports ?? []).filter((x: any) => x.status === "error");
      if (failed.length) toast.warning(`${failed.length} surface(s) failed — see Sources tab`);
      await load();
    } catch (e) {
      toast.error(describeFailure(e, "substrate organ"));
    } finally {
      if (alive.current) setSweeping(false);
    }
  }, [call, load]);

  const runSearch = useCallback(async () => {
    setSearching(true);
    try {
      const r = await call({
        action: "search",
        q: query.trim(),
        source: source === "all" ? undefined : source,
        limit: 100,
      });
      if (alive.current) setResults((r.results ?? []) as Signal[]);
    } catch (e) {
      toast.error(describeFailure(e, "substrate organ"));
    } finally {
      if (alive.current) setSearching(false);
    }
  }, [call, query, source]);

  const dismiss = useCallback(async (id: string) => {
    // Optimistic: the row is judged closed the moment the human closes it.
    setBrief((b) => (b ? { ...b, insights: b.insights.filter((i) => i.id !== id) } : b));
    try { await call({ action: "dismiss", id }); }
    catch (e) { toast.error(describeFailure(e, "substrate organ")); void load(); }
  }, [call, load]);

  const exportReport = useCallback(() => {
    if (!brief) return;
    const stamp = new Date().toISOString();
    const lines = [
      "════════════════════════════════════════════════════════════",
      "  ASHERIN — GOOGLE SUBSTRATE INTELLIGENCE REPORT",
      `  Generated: ${stamp}`,
      `  Signals indexed: ${brief.totalSignals}`,
      "════════════════════════════════════════════════════════════",
      "",
    ];
    for (const [domain, items] of Object.entries(brief.byDomain)) {
      lines.push(`── ${domain.toUpperCase()} ──`);
      for (const i of items as Insight[]) {
        lines.push(`[${severityLabel(i.severity)}] ${i.title}`);
        for (const l of String(i.detail).split("\n")) lines.push(`    ${l}`);
        lines.push("");
      }
    }
    lines.push("────────────────────────────────────────────────────────────");
    lines.push("Derived deterministically from the user's own connected Google accounts.");
    lines.push("#houseofasher #zia");
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asherin-substrate-report-${stamp.slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [brief]);

  const critical = useMemo(
    () => (brief?.insights ?? []).filter((i) => i.severity >= 4),
    [brief],
  );

  // ── Render states ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3 p-6" aria-busy="true" aria-live="polite">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-light">intelligence substrate</h2>
        <OrganOffline error={error} organ="substrate organ" onRetry={() => void load()} />
      </div>
    );
  }

  const hasAccounts = (status?.accounts?.length ?? 0) > 0;
  const isEmpty = (status?.signals ?? 0) === 0;

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground/10">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-light">intelligence substrate</h2>
            <p className="text-xs text-muted-foreground">
              {status?.signals ?? 0} signals · {status?.insights ?? 0} findings · last read {relAge(status?.lastIngest ?? null)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportReport} disabled={!brief?.insights?.length}>
            <Download className="mr-2 h-4 w-4" aria-hidden /> export report
          </Button>
          <Button size="sm" onClick={() => void sweep()} disabled={sweeping || !hasAccounts}>
            {sweeping
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> sweeping…</>
              : <><RefreshCw className="mr-2 h-4 w-4" aria-hidden /> run sweep</>}
          </Button>
        </div>
      </div>

      {!hasAccounts && (
        <div className="rounded-xl border border-border/40 bg-card/30 p-6 text-center text-sm text-muted-foreground">
          {NO_ACCOUNT_PATH}
        </div>
      )}

      {hasAccounts && isEmpty && (
        <div className="rounded-xl border border-border/40 bg-card/30 p-6 text-center">
          <Inbox className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            the ledger is empty. run a sweep to index mail, calendar, files, contacts and tasks.
          </p>
        </div>
      )}

      <Tabs defaultValue="brief" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="brief">brief</TabsTrigger>
          <TabsTrigger value="findings">findings {critical.length > 0 && `(${critical.length})`}</TabsTrigger>
          <TabsTrigger value="explorer">explorer</TabsTrigger>
          <TabsTrigger value="sources">sources</TabsTrigger>
        </TabsList>

        {/* ── BRIEF ─────────────────────────────────────────────────────── */}
        <TabsContent value="brief" className="min-h-0 flex-1">
          <ScrollArea className="h-full pr-3">
            <div className="space-y-3">
              {critical.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  nothing at elevated severity. the findings tab holds the full baseline.
                </p>
              )}
              {critical.map((i) => (
                <div key={i.id} className="rounded-xl border border-border/40 bg-card/30 p-4">
                  <div className="mb-1 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    <Badge variant="outline">{severityLabel(i.severity)}</Badge>
                    <Badge variant="secondary">{i.domain}</Badge>
                    <span className="font-medium">{i.title}</span>
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground">{i.detail}</pre>
                </div>
              ))}

              {(brief?.recent?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-border/40 bg-card/30 p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4" aria-hidden /> most recent signals
                  </h3>
                  <div className="space-y-1.5">
                    {brief!.recent.slice(0, 15).map((s) => (
                      <div key={s.id} className="text-xs">
                        <span className="text-muted-foreground">{fmtWhen(s.occurred_at)} · {s.source}</span>
                        {" — "}
                        <span className="break-words">{s.subject ?? "(no subject)"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── FINDINGS ──────────────────────────────────────────────────── */}
        <TabsContent value="findings" className="min-h-0 flex-1">
          <ScrollArea className="h-full pr-3">
            <div className="space-y-4">
              {Object.entries(brief?.byDomain ?? {}).map(([domain, items]) => (
                <div key={domain}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{domain}</h3>
                  <div className="space-y-2">
                    {(items as Insight[]).map((i) => (
                      <div key={i.id} className="rounded-lg border border-border/40 bg-card/20 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{severityLabel(i.severity)}</Badge>
                              <span className="text-sm font-medium">{i.title}</span>
                            </div>
                            <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground">{i.detail}</pre>
                          </div>
                          <Button
                            variant="ghost" size="icon"
                            aria-label={`Dismiss finding: ${i.title}`}
                            onClick={() => void dismiss(i.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!Object.keys(brief?.byDomain ?? {}).length && (
                <p className="text-sm text-muted-foreground">no findings yet — a sweep would derive them.</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── EXPLORER ──────────────────────────────────────────────────── */}
        <TabsContent value="explorer" className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="search every indexed signal…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }}
                aria-label="search the substrate"
              />
            </div>
            <div className="flex gap-1">
              {SOURCES.map((s) => (
                <Button
                  key={s} size="sm"
                  variant={source === s ? "default" : "outline"}
                  onClick={() => setSource(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
            <Button size="sm" onClick={() => void runSearch()} disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : "search"}
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1 pr-3" aria-live="polite">
            {results === null && (
              <p className="text-sm text-muted-foreground">
                search by keyword, person, vendor or subject. leave the box empty to browse the newest signals.
              </p>
            )}
            {results?.length === 0 && (
              <p className="text-sm text-muted-foreground">no signal matches that query in the current ledger.</p>
            )}
            <div className="space-y-2">
              {(results ?? []).map((s) => (
                <div key={s.id} className="rounded-lg border border-border/40 bg-card/20 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{s.source}</Badge>
                    <span>{fmtWhen(s.occurred_at)}</span>
                    {s.actor_email && <span>· {s.actor_name || s.actor_email}</span>}
                    {s.amount && <span>· {s.currency} {String(s.amount)}</span>}
                    {s.account_email && <span>· {s.account_email}</span>}
                  </div>
                  <div className="mt-1 break-words text-sm">{s.subject ?? "(no subject)"}</div>
                  {s.snippet && (
                    <div className="mt-0.5 break-words text-xs text-muted-foreground">{s.snippet}</div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── SOURCES ───────────────────────────────────────────────────── */}
        <TabsContent value="sources" className="min-h-0 flex-1">
          <ScrollArea className="h-full pr-3">
            <div className="space-y-3">
              {(status?.accounts ?? []).map((a) => (
                <div key={a.id} className="rounded-lg border border-border/40 bg-card/20 p-3">
                  <div className="text-sm font-medium">{a.email}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {a.surfaces.length
                      ? a.surfaces.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)
                      : <span className="text-xs text-muted-foreground">no read scopes granted on this account.</span>}
                  </div>
                </div>
              ))}
              <div className="rounded-lg border border-border/40 bg-card/20 p-3">
                <h3 className="mb-2 text-xs font-light tracking-wider text-muted-foreground">last sweep per surface</h3>
                {(status?.sweeps ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">no sweep has run yet.</p>
                )}
                {(status?.sweeps ?? []).map((s, idx) => (
                  <div key={`${s.source}-${idx}`} className="flex flex-wrap items-center gap-2 py-0.5 text-xs">
                    <Badge variant={s.status === "ok" ? "secondary" : "destructive"}>{s.source}</Badge>
                    <span className="text-muted-foreground">{fmtWhen(s.last_run_at)}</span>
                    <span>{s.signals_ingested} rows</span>
                    {s.error && <span className="break-words text-destructive">{s.error}</span>}
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SubstrateExplorer;
