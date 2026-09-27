// ═══════════════════════════════════════════════════════════════════════════
// GHOSTMAIL — Cloud Intelligence run through the Asherin Engine
//
// The ledger says who wrote. Ghost says what wrote. This desk shows both in
// one row: the correspondence volume on the left, the infrastructure verdict
// on the right, and the reasons the two disagree underneath.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Ghost, RefreshCw, ShieldAlert, AlertTriangle, Link2, Mail, MessageSquare } from "lucide-react";

interface Correspondent {
  host: string;
  origin: "sender_domain" | "embedded_link" | "shortener";
  messages: number;
  inbound: number;
  outbound: number;
  channels: string[];
  senders: string[];
  phones: string[];
  firstSeen: string | null;
  lastSeen: string | null;
  reachable: boolean;
  status: number | null;
  server: string | null;
  tls: boolean;
  hsts: boolean;
  originIp: string | null;
  asn: string | null;
  geo: string | null;
  mx: string[];
  ns: string[];
  redirects: string[];
  risk: number;
  reasons: string[];
}

interface LedgerResponse {
  action: "ledger";
  empty?: boolean;
  message?: string;
  scanned: number;
  windowDays: number;
  hostsConsidered: number;
  hostsProbed: number;
  partial: boolean;
  elapsedMs: number;
  correspondents: Correspondent[];
  index: { anomalies: Array<{ severity: string; title: string; detail: string }> } | null;
}

type Channel = "all" | "gmail" | "sms";

const WINDOWS = [30, 90, 180] as const;

const riskTone = (risk: number) =>
  risk >= 60 ? "text-destructive" : risk >= 30 ? "text-foreground" : "text-muted-foreground";

const originLabel: Record<Correspondent["origin"], string> = {
  sender_domain: "sender domain",
  embedded_link: "embedded link",
  shortener: "concealed destination",
};

export default function GhostLedgerPanel() {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("all");
  const [windowDays, setWindowDays] = useState<number>(90);
  const [focus, setFocus] = useState("");
  const [openHost, setOpenHost] = useState<string | null>(null);
  // A sweep that outlives the panel must not write into an unmounted tree.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: invErr } = await supabase.functions.invoke("ghost-engine", {
        body: {
          action: "ledger",
          windowDays,
          channel: channel === "all" ? null : channel,
          focus: focus.trim() || null,
          maxHosts: 14,
        },
      });
      if (invErr) throw invErr;
      if (res?.error) throw new Error(res.error);
      if (!alive.current) return;
      setData(res as LedgerResponse);
    } catch (e: unknown) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : "Ghost ledger sweep failed");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [channel, windowDays, focus]);

  const rows = data?.correspondents ?? [];

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <Ghost className="h-4 w-4 text-muted-foreground" aria-hidden />
        <div className="mr-auto">
          <h2 className="text-sm font-medium tracking-tight">GHOSTMAIL — Ledger through the Asherin Engine</h2>
          <p className="text-xs text-muted-foreground">
            Your correspondence nominates the hosts. The Asherin Engine probes them. No message body is read.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={loading}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {loading ? "Sweeping" : "Run sweep"}
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "gmail", "sms"] as Channel[]).map((c) => (
          <Button
            key={c}
            size="sm"
            variant={channel === c ? "secondary" : "ghost"}
            onClick={() => setChannel(c)}
            className="h-7 px-3 text-xs"
          >
            {c === "gmail" ? <Mail className="mr-1.5 h-3 w-3" aria-hidden /> : c === "sms" ? <MessageSquare className="mr-1.5 h-3 w-3" aria-hidden /> : null}
            {c === "all" ? "All channels" : c === "gmail" ? "Email" : "Phone"}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {WINDOWS.map((w) => (
          <Button
            key={w}
            size="sm"
            variant={windowDays === w ? "secondary" : "ghost"}
            onClick={() => setWindowDays(w)}
            className="h-7 px-3 text-xs"
          >
            {w}d
          </Button>
        ))}
        <Input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          placeholder="Narrow to an address, number or phrase"
          className="h-7 w-64 text-xs"
          aria-label="Narrow the sweep"
        />
      </div>

      {data && !data.empty && (
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {data.scanned} signals · {data.windowDays}d · {data.hostsProbed}/{data.hostsConsidered} hosts probed
          {data.partial ? " · not exhaustive" : ""} · {data.elapsedMs}ms
        </p>
      )}

      <ScrollArea className="flex-1 rounded-md border border-border/40">
        <div className="divide-y divide-border/30">
          {loading && !rows.length && (
            <div className="space-y-3 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          )}

          {!loading && error && (
            <div className="p-6 text-center text-sm">
              <AlertTriangle className="mx-auto mb-2 h-4 w-4 text-destructive" aria-hidden />
              <p className="text-destructive">{error}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={run}>Retry</Button>
            </div>
          )}

          {!loading && !error && !data && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Run a sweep to fuse the ledger with the Asherin Engine.
            </div>
          )}

          {!loading && !error && data?.empty && (
            <div className="p-8 text-center text-sm text-muted-foreground">{data.message}</div>
          )}

          {rows.map((c) => {
            const open = openHost === c.host;
            return (
              <article key={c.host} className="p-3">
                <button
                  type="button"
                  onClick={() => setOpenHost(open ? null : c.host)}
                  aria-expanded={open}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <span className={`mt-0.5 font-mono text-xs tabular-nums ${riskTone(c.risk)}`}>{String(c.risk).padStart(3, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.host}</span>
                      <Badge variant="outline" className="text-[10px]">{originLabel[c.origin]}</Badge>
                      {c.origin === "shortener" && <Link2 className="h-3 w-3 text-muted-foreground" aria-hidden />}
                      {c.risk >= 60 && <ShieldAlert className="h-3 w-3 text-destructive" aria-hidden />}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {c.messages} signals ({c.inbound} in / {c.outbound} out) · {c.channels.join(", ") || "unknown"} ·{" "}
                      {c.reachable ? `HTTP ${c.status}` : "unreachable"} · {c.tls ? "TLS" : "no TLS"} ·{" "}
                      {c.originIp ?? "IP unresolved"}{c.asn ? ` (${c.asn})` : ""}{c.geo ? ` — ${c.geo}` : ""}
                    </span>
                  </span>
                </button>

                {open && (
                  <dl className="mt-3 grid gap-x-6 gap-y-1 pl-10 text-xs sm:grid-cols-2">
                    <div><dt className="inline text-muted-foreground">Senders: </dt><dd className="inline">{c.senders.join(", ") || "none recorded"}</dd></div>
                    <div><dt className="inline text-muted-foreground">Numbers: </dt><dd className="inline">{c.phones.join(", ") || "none"}</dd></div>
                    <div><dt className="inline text-muted-foreground">Seen: </dt><dd className="inline">{c.firstSeen?.slice(0, 10) ?? "?"} → {c.lastSeen?.slice(0, 10) ?? "?"}</dd></div>
                    <div><dt className="inline text-muted-foreground">Server: </dt><dd className="inline">{c.server ?? "undisclosed"} · HSTS {c.hsts ? "yes" : "no"}</dd></div>
                    <div><dt className="inline text-muted-foreground">MX: </dt><dd className="inline">{c.mx.join(", ") || "none published"}</dd></div>
                    <div><dt className="inline text-muted-foreground">NS: </dt><dd className="inline">{c.ns.join(", ") || "none observed"}</dd></div>
                    {c.redirects.length > 0 && (
                      <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Redirects: </dt><dd className="inline break-all">{c.redirects.join(" → ")}</dd></div>
                    )}
                    <div className="sm:col-span-2 pt-1">
                      <dt className="text-muted-foreground">Findings</dt>
                      <dd><ul className="mt-1 list-disc space-y-0.5 pl-4">{c.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></dd>
                    </div>
                  </dl>
                )}
              </article>
            );
          })}
        </div>
      </ScrollArea>

      {data?.index?.anomalies?.length ? (
        <section className="rounded-md border border-border/40 p-3">
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Ghost anomalies across the probed set
          </h3>
          <ul className="space-y-1 text-xs">
            {data.index.anomalies.slice(0, 6).map((a, i) => (
              <li key={i}>
                <span className="font-mono text-[10px] uppercase text-muted-foreground">{a.severity}</span>{" "}
                <span className="font-medium">{a.title}</span> — {a.detail}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
