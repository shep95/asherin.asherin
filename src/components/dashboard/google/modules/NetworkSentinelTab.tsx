import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, RefreshCw, Trash2, Wifi } from "lucide-react";
import { isNativeApp } from "@/lib/native/nativeRuntime";

/**
 * NETWORK SENTINEL — the missing half of the Wi-Fi report.
 *
 * The backend has always been able to judge a network. Nothing ever asked it
 * to: no surface in the app invoked the sentinel, and the only action it
 * exposed required an SSID, a BSSID and an RSSI — three facts every browser
 * on earth refuses to hand to a web page. Silence was therefore guaranteed,
 * not incidental.
 *
 * This surface asks, on mount and on every link change, using the facts the
 * runtime will actually give: the link type the device reports, and the public
 * egress the server observes for itself from the request headers. It states
 * plainly what it cannot see rather than implying a clean bill of health, and
 * it throttles automatic runs so a flaky connection does not become a firehose.
 */

interface Finding { severity: string; title: string; detail: string }
interface NetRow {
  bssid: string;
  ssid: string | null;
  security: string | null;
  public_ip: string | null;
  risk_score: number;
  risk_level: string;
  findings: Finding[] | null;
  last_seen: string;
  enrichment: Record<string, unknown> | null;
}

const SEV_CLASS: Record<string, string> = {
  critical: "text-destructive",
  high: "text-destructive",
  medium: "text-foreground",
  low: "text-muted-foreground",
  info: "text-muted-foreground",
};

function linkFacts(): { linkType: string; effectiveType: string } {
  const c = (navigator as unknown as { connection?: { type?: string; effectiveType?: string } }).connection;
  const type = c?.type;
  // `type` is only populated on a few engines; when absent the honest answer is
  // "unknown", never an invented "wifi".
  const linkType = type && type !== "none" ? type : isNativeApp() ? "unknown" : "unknown";
  return { linkType, effectiveType: c?.effectiveType ?? "" };
}

export default function NetworkSentinelTab() {
  const [rows, setRows] = useState<NetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.functions.invoke("wifi-sentinel", { body: { action: "list" } });
    if (!alive.current) return;
    if (error) setLoadError("Could not read the network ledger. Retry, or check you are still signed in.");
    else setRows(((data as { networks?: NetRow[] })?.networks ?? []));
    setLoading(false);
  }, []);

  const run = useCallback(async (force: boolean) => {
    if (!alive.current) return;
    setRunning(true);
    try {
      const { linkType, effectiveType } = linkFacts();
      const { data, error } = await supabase.functions.invoke("wifi-sentinel", {
        body: { action: "uplink", linkType, effectiveType, force },
      });
      if (error) throw error;
      const res = data as { network?: { riskLevel: string; operator: string | null }; notified?: boolean };
      if (force) {
        toast.success(
          res?.network
            ? `Report ready — ${res.network.operator ?? "unattributed uplink"} · risk ${res.network.riskLevel}${res.notified ? " · sent to your alerts" : ""}`
            : "Report ready",
        );
      }
      await load();
    } catch {
      if (force) toast.error("Network report failed. The egress could not be attributed from this connection.");
    } finally {
      if (alive.current) setRunning(false);
    }
  }, [load]);

  // Automatic runs belong to the always-on daemon (src/lib/sentinel/alwaysOn.ts),
  // which judges every uplink on boot, on link change, on reconnect and on a
  // half-hourly cadence whether or not this tab was ever opened. Scheduling them
  // here as well would double-fire and race the shared throttle, so this view
  // only listens and renders.
  useEffect(() => {
    void load();
    const onUpdated = () => { void load(); };
    window.addEventListener("asherin-network-updated", onUpdated);
    return () => window.removeEventListener("asherin-network-updated", onUpdated);
  }, [load]);

  const forget = async (bssid: string) => {
    await supabase.functions.invoke("wifi-sentinel", { body: { action: "forget", bssid } });
    setRows((r) => r.filter((x) => x.bssid !== bssid));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => run(true)} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Wifi className="h-3.5 w-3.5 mr-1" />}
          Report this network
        </Button>
        <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {isNativeApp()
          ? "Native companion: the full six-question report runs on connect — owner, distance, encryption grade, resolvers, segment population and evil-twin history."
          : "In a browser the network name, hardware address and signal strength are withheld by the platform, so encryption grade, transmitter distance and evil-twin history cannot be judged here. What is judged is the public egress your traffic actually leaves through — who operates it, and whether it is a carrier or somebody's datacentre relay. Install the Asherin companion for the full report."}
      </p>

      {loading ? (
        <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : loadError ? (
        <div className="rounded border border-border p-4 text-sm">
          <p className="text-muted-foreground">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => load()}>Retry</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No networks assessed yet. The sentinel judges each connection automatically — the first report appears here within a minute of coming online.
        </div>
      ) : (
        <ScrollArea className="h-[520px] pr-3">
          <div className="space-y-3">
            {rows.map((n) => (
              <div key={n.bssid} className="rounded border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{n.ssid || n.bssid}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {n.security ?? "unknown link"}
                      {n.public_ip ? ` · egress ${n.public_ip}` : ""}
                      {` · ${new Date(n.last_seen).toLocaleString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[11px] uppercase tracking-wider ${SEV_CLASS[n.risk_level] ?? "text-muted-foreground"}`}>
                      {n.risk_level} · {n.risk_score}/100
                    </span>
                    <Button size="icon" variant="ghost" aria-label="Forget network" onClick={() => forget(n.bssid)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  {(n.findings ?? []).map((f, i) => (
                    <div key={i} className="text-[11px] leading-relaxed">
                      <span className={`uppercase tracking-wider ${SEV_CLASS[f.severity] ?? ""}`}>{f.severity}</span>
                      <span className="text-foreground"> · {f.title}</span>
                      <p className="text-muted-foreground">{f.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
