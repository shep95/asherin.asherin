import { useState, useMemo } from "react";
import { Ghost, Play, Loader2, ShieldAlert, Bug, KeySquare, Network, Globe, FileWarning, ScrollText, Wrench, Lock, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface Finding {
  id: string; target: string; url: string; type: string;
  severity: Severity; confidence: number;
  evidence: { summary: string; anchors?: Record<string, string>; sample?: string };
  created_at: string;
}

interface ApiKeyProbe {
  id: string; key_type: string; source: string; masked_key: string;
  format_valid: boolean; live_tested: boolean;
  test_result: string; details: string; recommendation: string;
}

interface ExploitScenario {
  id: string; title: string; severity: Severity; attack_vector: string;
  takedown_risk: string; prerequisites: string[]; steps: string[]; patches: string[];
}

interface GhostChainResult {
  ok: true;
  target: string;
  mode: "surface" | "web" | "full";
  started_at: string;
  surface: { dns: Record<string, string[]>; tls_sans: string[]; ports: Array<{ port: number; service: string; open: boolean }> };
  crawl: { visited_count: number; visited: string[] };
  findings: Finding[];
  api_key_probes: ApiKeyProbe[];
  exploit_map: ExploitScenario[];
  narrative: { original: string; revised: string; remediation: string[] };
  summary: { total: number; critical: number; high: number; medium: number; low: number; info: number };
}

const sevColor: Record<Severity, string> = {
  CRITICAL: "bg-red-500/10 text-red-300 border-red-500/30",
  HIGH: "bg-orange-500/10 text-orange-300 border-orange-500/30",
  MEDIUM: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  LOW: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  INFO: "bg-foreground/5 text-muted-foreground border-border/30",
};

const GhostChainScanner = () => {
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState<"surface" | "web" | "full">("full");
  const [maxDepth, setMaxDepth] = useState(2);
  const [maxUrls, setMaxUrls] = useState(60);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<GhostChainResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<"ALL" | Severity>("ALL");

  const runScan = async () => {
    const cleaned = target.trim();
    if (!cleaned) { toast.error("Enter a target domain or URL"); return; }
    setRunning(true); setError(null); setResult(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("zerlal-ghostchain", {
        body: { target: cleaned, mode, maxDepth, maxUrls },
      });
      if (invokeErr) throw new Error(invokeErr.message);
      if (data?.error) throw new Error(data.error);
      setResult(data as GhostChainResult);
      toast.success(`GhostChain finished — ${data.summary.total} findings on ${data.target}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error(`Scan failed: ${msg}`);
    } finally {
      setRunning(false);
    }
  };

  const filteredFindings = useMemo(() => {
    if (!result) return [];
    return sevFilter === "ALL" ? result.findings : result.findings.filter(f => f.severity === sevFilter);
  }, [result, sevFilter]);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/[0.06] pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-foreground/[0.04] border border-border/[0.08] flex items-center justify-center">
              <Ghost className="h-4 w-4 text-foreground/60" />
            </div>
            <div>
              <h2 className="text-sm font-light tracking-[0.15em] text-foreground/90 uppercase">GhostChain Scanner</h2>
              <p className="text-[10px] text-muted-foreground/40 tracking-wide mt-0.5">
                Defensive exposure scanner · Surface · Crawl · Audits · Live key probe · AI narrative
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="rounded-2xl border border-border/[0.08] bg-card/30 backdrop-blur-md p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="aureonai.app  or  https://example.com"
              className="flex-1 bg-background/60 border border-border/[0.08] rounded-lg px-3 py-2 text-xs text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-foreground/30"
              disabled={running}
            />
            <button
              onClick={runScan}
              disabled={running}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-background px-5 py-2 text-[11px] tracking-[0.15em] uppercase font-light disabled:opacity-50 hover:opacity-90 transition"
            >
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {running ? "Scanning" : "Run Scan"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-[10px] text-muted-foreground/50 tracking-wide space-y-1">
              <span className="uppercase">Mode</span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
                disabled={running}
                className="w-full bg-background/60 border border-border/[0.08] rounded-lg px-2 py-1.5 text-xs text-foreground/90 focus:outline-none"
              >
                <option value="surface">surface — DNS + TLS SANs + ports</option>
                <option value="web">web — crawl + wordlist + audits</option>
                <option value="full">full — surface + web</option>
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground/50 tracking-wide space-y-1">
              <span className="uppercase">Max crawl depth (0-3)</span>
              <input type="number" min={0} max={3} value={maxDepth}
                onChange={(e) => setMaxDepth(Math.min(3, Math.max(0, Number(e.target.value) || 0)))}
                disabled={running}
                className="w-full bg-background/60 border border-border/[0.08] rounded-lg px-2 py-1.5 text-xs text-foreground/90"
              />
            </label>
            <label className="text-[10px] text-muted-foreground/50 tracking-wide space-y-1">
              <span className="uppercase">Max URLs (5-120)</span>
              <input type="number" min={5} max={120} value={maxUrls}
                onChange={(e) => setMaxUrls(Math.min(120, Math.max(5, Number(e.target.value) || 60)))}
                disabled={running}
                className="w-full bg-background/60 border border-border/[0.08] rounded-lg px-2 py-1.5 text-xs text-foreground/90"
              />
            </label>
          </div>

          <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
            <Lock className="inline h-2.5 w-2.5 mr-1 opacity-60" />
            Authorized use only. Per-host rate limit (5 rps) and concurrency cap (8) enforced. Private/loopback hosts blocked at the gate.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-300">
            <strong className="font-medium">Scan error.</strong> {error}
          </div>
        )}

        {result && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              {(["CRITICAL","HIGH","MEDIUM","LOW","INFO"] as Severity[]).map(s => {
                const map: Record<Severity, number> = {
                  CRITICAL: result.summary.critical, HIGH: result.summary.high,
                  MEDIUM: result.summary.medium, LOW: result.summary.low,
                  INFO: result.summary.info,
                };
                return (
                  <button key={s} onClick={() => setSevFilter(sevFilter === s ? "ALL" : s)}
                    className={`rounded-xl border p-3 text-left transition ${sevColor[s]} ${sevFilter === s ? "ring-1 ring-foreground/40" : ""}`}>
                    <div className="text-[9px] uppercase tracking-[0.2em] opacity-70">{s}</div>
                    <div className="text-xl font-light mt-1">{map[s]}</div>
                  </button>
                );
              })}
              <button onClick={() => setSevFilter("ALL")}
                className={`rounded-xl border border-border/[0.08] bg-foreground/[0.03] p-3 text-left ${sevFilter === "ALL" ? "ring-1 ring-foreground/40" : ""}`}>
                <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">Total</div>
                <div className="text-xl font-light mt-1 text-foreground/90">{result.summary.total}</div>
              </button>
            </div>

            {/* Surface */}
            {(result.mode === "surface" || result.mode === "full") && (
              <section className="rounded-2xl border border-border/[0.08] bg-card/30 backdrop-blur-md p-5 space-y-4">
                <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-foreground/80">
                  <Network className="h-3 w-3" /> Surface map
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">DNS</p>
                    {Object.entries(result.surface.dns).filter(([, v]) => v.length).map(([t, v]) => (
                      <div key={t} className="mb-1.5">
                        <span className="text-foreground/60">{t}:</span>{" "}
                        <span className="text-foreground/90 font-mono text-[10px] break-all">{v.join(", ")}</span>
                      </div>
                    ))}
                    {!Object.values(result.surface.dns).some(v => v.length) && <p className="text-muted-foreground/40 text-[10px]">No records</p>}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">TLS SANs ({result.surface.tls_sans.length})</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
                      {result.surface.tls_sans.slice(0, 30).map(s => (
                        <div key={s} className="text-foreground/70 font-mono text-[10px] break-all">{s}</div>
                      ))}
                      {!result.surface.tls_sans.length && <p className="text-muted-foreground/40 text-[10px]">No SANs found</p>}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Ports</p>
                    {result.surface.ports.map(p => (
                      <div key={p.port} className="flex items-center justify-between mb-1 text-[10px]">
                        <span className="text-foreground/80">{p.service}/{p.port}</span>
                        <span className={p.open ? "text-emerald-300" : "text-muted-foreground/40"}>{p.open ? "open" : "closed"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* AI Narrative */}
            {result.narrative.original && (
              <section className="rounded-2xl border border-border/[0.08] bg-card/30 backdrop-blur-md p-5 space-y-3">
                <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-foreground/80">
                  <ScrollText className="h-3 w-3" /> Narrative audit
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs leading-relaxed">
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Original narrative</p>
                    <p className="text-foreground/75 whitespace-pre-wrap">{result.narrative.original}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50">Revised narrative</p>
                    <p className="text-foreground/75 whitespace-pre-wrap">{result.narrative.revised}</p>
                  </div>
                </div>
                {result.narrative.remediation.length > 0 && (
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-2 mt-3 flex items-center gap-1.5">
                      <Wrench className="h-3 w-3" /> Remediation queue
                    </p>
                    <ol className="space-y-1.5 text-xs">
                      {result.narrative.remediation.map((r, i) => (
                        <li key={i} className="flex gap-2 text-foreground/80">
                          <span className="text-muted-foreground/40 font-mono">{String(i + 1).padStart(2, "0")}</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>
            )}

            {/* Findings */}
            <section className="rounded-2xl border border-border/[0.08] bg-card/30 backdrop-blur-md p-5 space-y-3">
              <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-foreground/80">
                <FileWarning className="h-3 w-3" /> Findings
                {sevFilter !== "ALL" && (
                  <span className="text-[9px] text-muted-foreground/60 normal-case tracking-normal">
                    · filtered: {sevFilter} · <button onClick={() => setSevFilter("ALL")} className="underline">clear</button>
                  </span>
                )}
              </h3>
              {filteredFindings.length === 0 ? (
                <p className="text-xs text-muted-foreground/40">No findings in this category.</p>
              ) : (
                <div className="space-y-2">
                  {filteredFindings.map(f => (
                    <div key={f.id} className="rounded-xl border border-border/[0.06] bg-background/40 p-3 space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded border ${sevColor[f.severity]}`}>{f.severity}</span>
                          <span className="text-[10px] text-foreground/70 font-mono">{f.type}</span>
                        </div>
                        <span className="text-[9px] text-muted-foreground/40">conf {(f.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <p className="text-xs text-foreground/85">{f.evidence.summary}</p>
                      <a href={f.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-foreground/80 font-mono break-all">
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" /> {f.url}
                      </a>
                      {f.evidence.anchors && (
                        <pre className="text-[9px] text-muted-foreground/50 bg-background/40 rounded p-2 overflow-x-auto font-mono whitespace-pre-wrap break-all">
{Object.entries(f.evidence.anchors).map(([k, v]) => `${k}: ${v}`).join("\n")}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Live API key probes */}
            {result.api_key_probes.length > 0 && (
              <section className="rounded-2xl border border-border/[0.08] bg-card/30 backdrop-blur-md p-5 space-y-3">
                <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-foreground/80">
                  <KeySquare className="h-3 w-3" /> Live API key probes
                </h3>
                <div className="space-y-2">
                  {result.api_key_probes.map(p => (
                    <div key={p.id} className="rounded-xl border border-border/[0.06] bg-background/40 p-3 text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground/80 font-mono">{p.key_type}</span>
                        <span className="text-[9px] text-muted-foreground/50">{p.masked_key}</span>
                        <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded border ${
                          p.test_result === "valid" || p.test_result === "dangerous_public" ? "border-red-500/40 text-red-300 bg-red-500/10" :
                          p.test_result === "invalid" ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10" :
                          "border-border/30 text-muted-foreground bg-foreground/5"
                        }`}>{p.test_result}</span>
                      </div>
                      <p className="text-foreground/70">{p.details}</p>
                      <p className="text-[10px] text-muted-foreground/60">Source: <span className="font-mono break-all">{p.source}</span></p>
                      <p className="text-[10px] text-amber-300/80">→ {p.recommendation}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Exploit map */}
            {result.exploit_map.length > 0 && (
              <section className="rounded-2xl border border-border/[0.08] bg-card/30 backdrop-blur-md p-5 space-y-3">
                <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-foreground/80">
                  <Bug className="h-3 w-3" /> Exploit scenarios
                </h3>
                <div className="space-y-2">
                  {result.exploit_map.map(s => (
                    <details key={s.id} className="rounded-xl border border-border/[0.06] bg-background/40 p-3 text-xs">
                      <summary className="cursor-pointer flex items-center gap-2 list-none">
                        <ShieldAlert className="h-3 w-3 text-foreground/60" />
                        <span className={`text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded border ${sevColor[s.severity]}`}>{s.severity}</span>
                        <span className="text-foreground/85">{s.title}</span>
                      </summary>
                      <div className="mt-3 space-y-2 pl-5">
                        <p className="text-foreground/70"><span className="text-muted-foreground/60">Risk:</span> {s.takedown_risk}</p>
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-1">Steps</p>
                          <ol className="list-decimal list-inside space-y-0.5 text-foreground/70">
                            {s.steps.map((x, i) => <li key={i}>{x}</li>)}
                          </ol>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-1">Patches</p>
                          <ul className="list-disc list-inside space-y-0.5 text-emerald-300/80">
                            {s.patches.map((x, i) => <li key={i}>{x}</li>)}
                          </ul>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {/* Crawl trace */}
            <section className="rounded-2xl border border-border/[0.08] bg-card/30 backdrop-blur-md p-5">
              <h3 className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-foreground/80 mb-3">
                <Globe className="h-3 w-3" /> Crawl trace · {result.crawl.visited_count} URLs
              </h3>
              <div className="max-h-64 overflow-y-auto space-y-0.5 text-[10px] font-mono text-muted-foreground/60">
                {result.crawl.visited.map(u => (
                  <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="block hover:text-foreground/80 break-all">{u}</a>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default GhostChainScanner;
