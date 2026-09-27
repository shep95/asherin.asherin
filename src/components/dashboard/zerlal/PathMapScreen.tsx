import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { emitPull } from "@/lib/connect/emitPull";
import { toast } from "sonner";
import { Loader2, Route, ShieldAlert, Cookie, FileSearch, Copy, Download } from "lucide-react";

/**
 * Zerlal Path Map — defensive recon inventory.
 *
 * This screen answers one question: what is on the wire for this host, and
 * what did each response actually ship? Every row is a live observation.
 * There is no reproduction step anywhere in this surface — a finding is a
 * class with evidence attached, and a class is not a payout.
 */

interface PathAudit {
  url: string; path: string; host: string;
  status: number | null; contentType: string | null; bytes: number | null;
  redirectTo: string | null; server: string | null;
  headers: Record<string, string>;
  cookies: Array<{ name: string; secure: boolean; httpOnly: boolean; sameSite: string | null }>;
  piiCounts: { email: number; phone: number };
  piiSamples: string[];
  title: string | null;
  softNotFound: boolean;
  source: string;
  elapsedMs: number;
  error: string | null;
}

interface ClassFinding {
  klass: string; severity: "info" | "low" | "medium" | "high";
  title: string; host: string; path: string;
  evidence: string; meaning: string; remediation: string; wstg: string | null;
}

interface PathMapResult {
  host: string; origin: string; subdomains: string[];
  audits: PathAudit[]; findings: ClassFinding[];
  counts: { paths: number; hosts: number; reachable: number; findings: number };
  robotsStatus: number | null; elapsedMs: number; notes: string[];
}

const SEV_TONE: Record<string, string> = {
  high: "text-red-400/90 border-red-500/20 bg-red-500/[0.04]",
  medium: "text-amber-300/90 border-amber-400/20 bg-amber-400/[0.04]",
  low: "text-foreground/70 border-border/15 bg-foreground/[0.02]",
  info: "text-muted-foreground/60 border-border/10 bg-foreground/[0.01]",
};

const statusTone = (s: number | null) =>
  s === null ? "text-muted-foreground/30"
  : s < 300 ? "text-emerald-400/70"
  : s < 400 ? "text-sky-400/70"
  : s < 500 ? "text-amber-300/70"
  : "text-red-400/70";

const PathMapScreen = () => {
  const [domain, setDomain] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PathMapResult | null>(null);
  const [tab, setTab] = useState<"findings" | "inventory" | "headers">("findings");

  const run = async () => {
    const target = domain.trim();
    if (!target) { toast.error("Enter a domain to map."); return; }
    setRunning(true);
    setResult(null);
    const started = Date.now();

    try {
      const { data, error } = await supabase.functions.invoke("zerlal-path-map", {
        body: { domain: target, max_paths: 32, max_subdomains: 6 },
      });
      const latencyMs = Date.now() - started;

      if (error || !data?.ok) {
        const detail = (data as { error?: string } | null)?.error || error?.message || "path map failed";
        void emitPull({ organ: "zerlal", capability: "path-map", fromSurface: "zerlal", status: "fail", latencyMs, quote: `${target} — ${detail}` });
        toast.error(detail);
        return;
      }

      const res = data as PathMapResult;
      setResult(res);

      // One trace for the map itself, one for the header inventory, one per
      // host actually audited. quote is the host — never a response body.
      void emitPull({
        organ: "zerlal", capability: "path-map", fromSurface: "zerlal",
        status: res.counts.paths ? "ok" : "skip", latencyMs, quote: res.host,
        meta: { paths: res.counts.paths, hosts: res.counts.hosts, reachable: res.counts.reachable, findings: res.counts.findings },
      });
      void emitPull({
        organ: "zerlal", capability: "header-inventory", fromSurface: "zerlal",
        status: res.audits.some(a => Object.keys(a.headers).length) ? "ok" : "skip",
        latencyMs, quote: res.host,
        meta: { classes: new Set(res.findings.map(f => f.klass)).size },
      });
      for (const host of [...new Set(res.audits.map(a => a.host))].slice(0, 12)) {
        const rows = res.audits.filter(a => a.host === host);
        void emitPull({
          organ: "zerlal", capability: "audit", fromSurface: "zerlal",
          status: rows.some(r => r.status !== null) ? "ok" : "fail",
          quote: host,
          meta: { paths: rows.length, reachable: rows.filter(r => (r.status ?? 599) < 400).length },
        });
      }

      toast.success(`${res.counts.paths} paths across ${res.counts.hosts} host(s) · ${res.counts.findings} finding class(es)`);
    } catch (e) {
      void emitPull({ organ: "zerlal", capability: "path-map", fromSurface: "zerlal", status: "fail", quote: `${target} — ${e instanceof Error ? e.message : "error"}` });
      toast.error(e instanceof Error ? e.message : "Path map failed");
    } finally {
      setRunning(false);
    }
  };

  const exportJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `zerlal-path-map-${result.host}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div>
        <h1 className="text-[13px] font-light tracking-[0.18em] text-foreground/90 uppercase">Path Map</h1>
        <p className="text-[10px] font-light text-muted-foreground/50 mt-1 max-w-2xl">
          Inventory of what answers on the wire: hosts, paths, protective headers, cookie flags, and contact strings — quoted live and masked.
          Findings are classes with evidence, not reproduction steps.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={domain}
          onChange={e => setDomain(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !running) run(); }}
          placeholder="example.com"
          className="flex-1 rounded-xl border border-border/15 bg-card/20 px-3 py-2 text-[11px] font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-border/30"
        />
        <button
          onClick={run}
          disabled={running}
          className="rounded-xl border border-border/20 bg-foreground/[0.04] px-4 py-2 text-[10px] tracking-[0.15em] uppercase text-foreground/80 hover:bg-foreground/[0.07] disabled:opacity-40 flex items-center gap-2"
        >
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Route className="h-3 w-3" />}
          {running ? "Mapping" : "Map host"}
        </button>
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              { k: "paths", label: "Paths audited", v: result.counts.paths },
              { k: "hosts", label: "Hosts", v: result.counts.hosts },
              { k: "reachable", label: "Answered < 400", v: result.counts.reachable },
              { k: "classes", label: "Finding classes", v: new Set(result.findings.map(f => f.klass)).size },
              { k: "ms", label: "Elapsed", v: `${result.elapsedMs} ms` },
            ].map(s => (
              <div key={s.k} className="rounded-xl border border-border/10 bg-card/20 px-3 py-2">
                <div className="text-[8px] uppercase tracking-[0.18em] text-muted-foreground/35">{s.label}</div>
                <div className="text-[15px] font-extralight text-foreground/90">{s.v}</div>
              </div>
            ))}
          </div>

          {result.notes.length > 0 && (
            <div className="rounded-xl border border-border/10 bg-foreground/[0.015] px-3 py-2 space-y-1">
              {result.notes.map((n, i) => (
                <p key={i} className="text-[9px] font-light text-muted-foreground/50">· {n}</p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 border-b border-border/10">
            {(["findings", "inventory", "headers"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-[10px] tracking-[0.15em] uppercase transition-colors ${tab === t ? "text-foreground/90 border-b border-foreground/40" : "text-muted-foreground/40 hover:text-foreground/60"}`}
              >
                {t}
              </button>
            ))}
            <div className="ml-auto flex gap-1">
              <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(result, null, 2)); toast.success("Copied"); }} className="p-1.5 rounded hover:bg-foreground/[0.05]"><Copy className="h-3 w-3 text-muted-foreground/50" /></button>
              <button onClick={exportJson} className="p-1.5 rounded hover:bg-foreground/[0.05]"><Download className="h-3 w-3 text-muted-foreground/50" /></button>
            </div>
          </div>

          {tab === "findings" && (
            <div className="space-y-2">
              {result.findings.length === 0 && (
                <p className="text-[10px] font-light text-muted-foreground/40">No finding classes fired on this surface.</p>
              )}
              {result.findings.map((f, i) => (
                <div key={i} className={`rounded-2xl border px-4 py-3 ${SEV_TONE[f.severity]}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[8px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded border border-current/20">{f.severity}</span>
                        <span className="text-[9px] font-mono text-muted-foreground/50">{f.klass}</span>
                        {f.wstg && <span className="text-[8px] text-muted-foreground/30">{f.wstg}</span>}
                      </div>
                      <h3 className="text-[11px] font-light text-foreground/85 mt-1.5">{f.title}</h3>
                      <p className="text-[9px] font-light text-muted-foreground/50 mt-1">{f.meaning}</p>
                    </div>
                  </div>
                  <pre className="mt-2 rounded-lg border border-border/10 bg-background/40 px-2.5 py-2 text-[9px] font-mono text-foreground/60 whitespace-pre-wrap break-all">{f.evidence}</pre>
                  <p className="text-[9px] font-light text-muted-foreground/45 mt-1.5">Fix — {f.remediation}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "inventory" && (
            <div className="rounded-2xl border border-border/10 overflow-hidden">
              <table className="w-full text-[9px] font-light">
                <thead className="bg-foreground/[0.03] text-muted-foreground/40 uppercase tracking-[0.15em]">
                  <tr>
                    <th className="text-left px-3 py-2">Host</th>
                    <th className="text-left px-3 py-2">Path</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Source</th>
                    <th className="text-left px-3 py-2">Shell</th>
                    <th className="text-left px-3 py-2">ms</th>
                  </tr>
                </thead>
                <tbody>
                  {result.audits.map((a, i) => (
                    <tr key={i} className="border-t border-border/[0.06] hover:bg-foreground/[0.02]">
                      <td className="px-3 py-1.5 text-muted-foreground/60">{a.host}</td>
                      <td className="px-3 py-1.5 font-mono text-foreground/75 break-all">{a.path}</td>
                      <td className={`px-3 py-1.5 font-mono ${statusTone(a.status)}`}>{a.status ?? a.error ?? "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground/45">{(a.contentType || "—").split(";")[0]}</td>
                      <td className="px-3 py-1.5 text-muted-foreground/35">{a.source}</td>
                      <td className="px-3 py-1.5 text-muted-foreground/35">{a.softNotFound ? "catch-all" : "—"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground/35">{a.elapsedMs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "headers" && (
            <div className="space-y-2">
              {result.audits.filter(a => a.status !== null).map((a, i) => (
                <div key={i} className="rounded-2xl border border-border/10 bg-card/20 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileSearch className="h-3 w-3 text-muted-foreground/40" />
                    <span className="text-[10px] font-mono text-foreground/80 break-all">{a.host}{a.path}</span>
                    <span className={`text-[9px] font-mono ${statusTone(a.status)}`}>{a.status}</span>
                  </div>
                  {Object.keys(a.headers).length === 0 ? (
                    <p className="text-[9px] text-muted-foreground/40 mt-1.5 flex items-center gap-1"><ShieldAlert className="h-3 w-3" /> none of the protective header set present</p>
                  ) : (
                    <div className="mt-1.5 space-y-0.5">
                      {Object.entries(a.headers).map(([k, v]) => (
                        <div key={k} className="text-[9px] font-mono text-muted-foreground/55 break-all"><span className="text-foreground/70">{k}</span>: {v}</div>
                      ))}
                    </div>
                  )}
                  {a.cookies.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {a.cookies.map(c => (
                        <span key={c.name} className="text-[8px] font-mono px-1.5 py-0.5 rounded border border-border/15 text-muted-foreground/55 flex items-center gap-1">
                          <Cookie className="h-2.5 w-2.5" />{c.name} · {c.secure ? "Secure" : "no-Secure"} · {c.httpOnly ? "HttpOnly" : "no-HttpOnly"} · SameSite={c.sameSite ?? "unset"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PathMapScreen;
