import { useMemo, useState } from "react";
import { Globe, Search, Shield, ChevronDown, ChevronUp, Copy, Download, Loader2, ExternalLink, RefreshCw, Skull } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useZerlalFindings } from "./useZerlalData";
import InfrastructureMap from "./InfrastructureMap";
import ExploitIntelTab from "./ExploitIntelTab";
import type { ZerlalFinding } from "./types";

interface DomainInfo {
  ip?: string;
  hosting?: string;
  cdn?: string;
  waf?: string;
  tech_stack?: string[];
  tls_grade?: string;
  email_security_grade?: string;
}

interface InfrastructureMapData {
  github_repo: string | null;
  deployment_platform: string;
  ci_cd: string;
  components: Array<{
    id: string;
    type: string;
    name: string;
    provider: string;
    details: string;
    exposed: boolean;
  }>;
  connections: Array<{
    from: string;
    to: string;
    label: string;
    protocol: string;
    encrypted: boolean;
  }>;
  data_flows: Array<{
    description: string;
    source: string;
    destination: string;
    data_type: string;
    risk_level: string;
  }>;
}

interface ScanResult {
  project_id: string;
  scan_id: string;
  findings_count: number;
  risk_grade: string;
  summary: string;
  domain_info: DomainInfo;
  subdomains_found: string[];
  total_attack_surface_score: number;
  zero_trust_score: number;
  duration: number;
  infrastructure_map: InfrastructureMapData | null;
}

interface DomainReconScreenProps {
  onSelectFinding?: (id: string) => void;
}

const severityColor: Record<string, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  low: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  info: "text-muted-foreground/60 bg-foreground/[0.03] border-border/[0.08]",
};

const gradeColor: Record<string, string> = {
  A: "text-green-400",
  B: "text-blue-400",
  C: "text-yellow-400",
  D: "text-orange-400",
  F: "text-red-400",
};

const getResponseErrorMessage = async (resp: Response) => {
  const raw = await resp.text();

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.error === "string") return parsed.error;
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    // Ignore parse errors and fall back to raw body.
  }

  return raw || `Scan failed with status ${resp.status}`;
};

const hasInfrastructureMapData = (map: InfrastructureMapData | null | undefined) => {
  if (!map) return false;

  return Boolean(
    map.github_repo ||
    (map.deployment_platform && map.deployment_platform !== "unknown") ||
    (map.ci_cd && map.ci_cd !== "unknown") ||
    (Array.isArray(map.components) && map.components.length > 0) ||
    (Array.isArray(map.connections) && map.connections.length > 0) ||
    (Array.isArray(map.data_flows) && map.data_flows.length > 0)
  );
};

const extractGithubRepo = (findings: ZerlalFinding[]) => {
  const haystack = findings
    .flatMap((finding) => [
      finding.title,
      finding.description,
      finding.impact,
      finding.code_snippet,
      finding.suggested_fix,
      finding.file_path ?? "",
      ...(finding.exploitation_steps || []),
    ])
    .join("\n");

  const match = haystack.match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i);
  return match ? match[0].replace(/[),.;\]]+$/, "") : null;
};

const detectPlatform = (domainInfo: DomainInfo, findings: ZerlalFinding[]) => {
  const haystack = [
    domainInfo.hosting,
    domainInfo.cdn,
    domainInfo.waf,
    ...(domainInfo.tech_stack || []),
    ...findings.flatMap((finding) => [finding.title, finding.description, finding.code_snippet, finding.suggested_fix]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("vercel")) return { deployment: "Vercel", ciCd: "Git-based deployment" };
  if (haystack.includes("netlify")) return { deployment: "Netlify", ciCd: "Git-based deployment" };
  if (haystack.includes("cloudflare")) return { deployment: "Cloudflare", ciCd: "Cloudflare deployment pipeline" };
  if (haystack.includes("aws") || haystack.includes("amazon")) return { deployment: "AWS", ciCd: "Cloud CI/CD or Git pipeline" };
  if (haystack.includes("azure")) return { deployment: "Azure", ciCd: "Azure DevOps or Git pipeline" };
  if (haystack.includes("gcp") || haystack.includes("google cloud")) return { deployment: "Google Cloud", ciCd: "Cloud Build or Git pipeline" };

  return { deployment: domainInfo.hosting || "unknown", ciCd: "unknown" };
};

const buildFallbackInfrastructureMap = (
  domain: string,
  domainInfo: DomainInfo,
  findings: ZerlalFinding[]
): InfrastructureMapData => {
  const cleanDomain = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  const techStack = domainInfo.tech_stack || [];
  const githubRepo = extractGithubRepo(findings);
  const { deployment, ciCd } = detectPlatform(domainInfo, findings);

  const components: InfrastructureMapData["components"] = [];
  const connections: InfrastructureMapData["connections"] = [];
  const dataFlows: InfrastructureMapData["data_flows"] = [];

  const addComponent = (component: InfrastructureMapData["components"][number]) => {
    if (!components.some((existing) => existing.id === component.id)) {
      components.push(component);
    }
  };

  addComponent({
    id: "dns-core",
    type: "dns",
    name: cleanDomain,
    provider: "Domain / DNS",
    details: `Primary domain entry point for ${cleanDomain}`,
    exposed: true,
  });

  if (domainInfo.cdn) {
    addComponent({
      id: "cdn-edge",
      type: "cdn",
      name: "Edge CDN",
      provider: domainInfo.cdn,
      details: `Traffic acceleration and caching handled by ${domainInfo.cdn}`,
      exposed: true,
    });
  }

  if (domainInfo.waf) {
    addComponent({
      id: "waf-edge",
      type: "waf",
      name: "Web Application Firewall",
      provider: domainInfo.waf,
      details: `Inbound traffic inspected by ${domainInfo.waf}`,
      exposed: false,
    });
  }

  addComponent({
    id: "web-app",
    type: "web-server",
    name: cleanDomain,
    provider: techStack[0] || domainInfo.hosting || "Web Application",
    details: techStack.length > 0 ? `Detected stack: ${techStack.join(", ")}` : "Public-facing web surface inferred from reconnaissance findings",
    exposed: true,
  });

  if (domainInfo.hosting || deployment !== "unknown") {
    addComponent({
      id: "app-runtime",
      type: "app-server",
      name: "Application Runtime",
      provider: deployment !== "unknown" ? deployment : domainInfo.hosting || "Hosting Platform",
      details: `Runtime and hosting layer inferred from ${deployment !== "unknown" ? deployment : domainInfo.hosting || "available evidence"}`,
      exposed: false,
    });
  }

  if (domainInfo.email_security_grade) {
    addComponent({
      id: "email-security",
      type: "email",
      name: "Email Security",
      provider: `Grade ${domainInfo.email_security_grade}`,
      details: "Mail authentication posture inferred from SPF / DKIM / DMARC signals",
      exposed: true,
    });
  }

  if (ciCd !== "unknown" || githubRepo) {
    addComponent({
      id: "ci-cd",
      type: "ci-cd",
      name: "Deployment Pipeline",
      provider: ciCd !== "unknown" ? ciCd : "Git-linked workflow",
      details: githubRepo ? `Repository evidence detected: ${githubRepo}` : "CI/CD inferred from hosting and application evidence",
      exposed: false,
    });
  }

  if (githubRepo) {
    addComponent({
      id: "github-origin",
      type: "third-party",
      name: "GitHub Repository",
      provider: "GitHub",
      details: githubRepo,
      exposed: true,
    });
  }

  const hasComponent = (id: string) => components.some((component) => component.id === id);

  if (hasComponent("dns-core") && hasComponent("cdn-edge")) {
    connections.push({ from: "dns-core", to: "cdn-edge", label: "DNS resolves traffic to CDN edge", protocol: "DNS/HTTPS", encrypted: true });
  }

  if (hasComponent("cdn-edge") && hasComponent("waf-edge")) {
    connections.push({ from: "cdn-edge", to: "waf-edge", label: "Edge requests pass through traffic inspection", protocol: "HTTPS", encrypted: true });
  }

  if (hasComponent("waf-edge") && hasComponent("web-app")) {
    connections.push({ from: "waf-edge", to: "web-app", label: "Filtered requests reach the application surface", protocol: "HTTPS", encrypted: true });
  } else if (hasComponent("cdn-edge") && hasComponent("web-app")) {
    connections.push({ from: "cdn-edge", to: "web-app", label: "Edge requests forwarded to the web surface", protocol: "HTTPS", encrypted: true });
  } else if (hasComponent("dns-core") && hasComponent("web-app")) {
    connections.push({ from: "dns-core", to: "web-app", label: "Domain resolves directly to the public application", protocol: "HTTPS", encrypted: true });
  }

  if (hasComponent("web-app") && hasComponent("app-runtime")) {
    connections.push({ from: "web-app", to: "app-runtime", label: "Frontend serves or proxies into the runtime layer", protocol: "HTTPS", encrypted: true });
  }

  if (hasComponent("app-runtime") && hasComponent("email-security")) {
    connections.push({ from: "app-runtime", to: "email-security", label: "Transactional or domain email flows", protocol: "SMTP/TLS", encrypted: true });
  }

  if (hasComponent("ci-cd") && hasComponent("app-runtime")) {
    connections.push({ from: "ci-cd", to: "app-runtime", label: "Deployments update the runtime environment", protocol: "CI/CD", encrypted: true });
  }

  if (hasComponent("github-origin") && hasComponent("ci-cd")) {
    connections.push({ from: "github-origin", to: "ci-cd", label: "Repository changes trigger deployment automation", protocol: "Git/Webhook", encrypted: true });
  }

  dataFlows.push({
    description: "User requests reach the public application surface",
    source: "dns-core",
    destination: hasComponent("cdn-edge") ? "cdn-edge" : "web-app",
    data_type: "web-traffic",
    risk_level: "medium",
  });

  if (hasComponent("web-app") && hasComponent("app-runtime")) {
    dataFlows.push({
      description: "Application traffic is processed by the backend/runtime layer",
      source: "web-app",
      destination: "app-runtime",
      data_type: "user-data",
      risk_level: "high",
    });
  }

  if (hasComponent("github-origin") && hasComponent("ci-cd")) {
    dataFlows.push({
      description: "Source changes propagate into build and deployment systems",
      source: "github-origin",
      destination: "ci-cd",
      data_type: "source-code",
      risk_level: "medium",
    });
  }

  return {
    github_repo: githubRepo,
    deployment_platform: deployment,
    ci_cd: ciCd,
    components,
    connections,
    data_flows: dataFlows,
  };
};

const DomainReconScreen = ({ onSelectFinding }: DomainReconScreenProps) => {
  const [domain, setDomain] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"findings" | "infrastructure" | "exploit">("findings");
  const [selectedExploitFinding, setSelectedExploitFinding] = useState<string | null>(null);

  const { findings, loading: findingsLoading, refetch } = useZerlalFindings(projectId, { fetchAllWhenNoProjectId: false });

  const resolvedInfrastructureMap = useMemo(() => {
    if (!result) return null;
    if (hasInfrastructureMapData(result.infrastructure_map)) return result.infrastructure_map;
    return buildFallbackInfrastructureMap(domain.trim(), result.domain_info || {}, findings);
  }, [domain, findings, result]);

  const isRecoveredInfrastructureMap = Boolean(
    result &&
    !hasInfrastructureMapData(result.infrastructure_map) &&
    hasInfrastructureMapData(resolvedInfrastructureMap)
  );

  const handleScan = async () => {
    if (!domain.trim()) return;
    setScanning(true);
    setResult(null);
    setProjectId(null);
    setExpandedFinding(null);
    setActiveTab("findings");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300000);

      const resp = await fetch(`${supabaseUrl}/functions/v1/zerlal-domain-recon`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": anonKey,
        },
        body: JSON.stringify({ domain: domain.trim() }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        throw new Error(await getResponseErrorMessage(resp));
      }

      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      setResult(data);
      setProjectId(data.project_id);
      toast.success(`Domain recon complete: ${data.findings_count} weaknesses found`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("aborted")) {
        toast.error("Scan is still running in the background. Refresh to see results.");
      } else {
        toast.error("Domain recon failed: " + msg);
      }
    } finally {
      setScanning(false);
    }
  };

  const copyAllFindings = () => {
    const text = findings.map((f, i) =>
      `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\n   Category: ${f.category}\n   CVSS: ${f.cvss_score}\n   CWE: ${f.cwe_id}\n   Description: ${f.description}\n   Impact: ${f.impact}\n   Fix: ${f.suggested_fix}\n`
    ).join("\n");
    navigator.clipboard.writeText(text);
    toast.success("All findings copied to clipboard");
  };

  const downloadFindings = () => {
    const text = `ZERLAL DOMAIN RECONNAISSANCE REPORT\nTarget: ${domain}\nDate: ${new Date().toISOString()}\nGrade: ${result?.risk_grade || "N/A"}\nTotal Findings: ${findings.length}\n\n${"=".repeat(80)}\n\n${result?.summary || ""}\n\n${"=".repeat(80)}\n\nFINDINGS:\n\n${findings.map((f, i) =>
      `${"─".repeat(60)}\n${i + 1}. [${f.severity.toUpperCase()}] ${f.title}\nCategory: ${f.category} | CVSS: ${f.cvss_score} | CWE: ${f.cwe_id} | Confidence: ${f.confidence}%\n\nDescription:\n${f.description}\n\nImpact:\n${f.impact}\n\nDefensive Verification:\n${(f.exploitation_steps || []).map((s: string, j: number) => `  ${j + 1}. ${s}`).join("\n")}\n\nVulnerable Evidence:\n${f.code_snippet}\n\nRemediation:\n${f.suggested_fix}\n\nCompliance Controls: ${(f.compliance_controls || []).join(", ")}\nSimilar CVEs: ${(f.similar_cves || []).join(", ")}\n`
    ).join("\n")}`;

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zerlal-domain-recon-${domain.replace(/[^a-z0-9]/gi, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Globe className="h-4 w-4 text-foreground/60" />
          <h2 className="text-[13px] font-light tracking-[0.1em] text-foreground/90 uppercase">
            Domain Reconnaissance
          </h2>
        </div>
        <p className="text-[10px] text-muted-foreground/40 tracking-wide">
          ELION/ZOHAR Intelligence Engine — Full-spectrum domain vulnerability analysis & infrastructure mapping
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30" />
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !scanning && handleScan()}
            placeholder="Enter domain (e.g., example.com)"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-foreground/[0.03] border border-border/[0.08] text-[11px] text-foreground/80 placeholder:text-muted-foreground/25 focus:outline-none focus:border-foreground/[0.15] transition-colors"
            disabled={scanning}
          />
        </div>
        <button
          onClick={handleScan}
          disabled={scanning || !domain.trim()}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-foreground/[0.08] text-[10px] font-light tracking-wide text-foreground/80 hover:bg-foreground/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {scanning ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Scanning…
            </>
          ) : (
            <>
              <Search className="h-3 w-3" />
              Scan Domain
            </>
          )}
        </button>
      </div>

      {scanning && (
        <div className="rounded-xl border border-border/[0.06] bg-foreground/[0.02] p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-foreground/30 mx-auto mb-3" />
          <p className="text-[11px] text-foreground/50 tracking-wide">ZERLAL Agent executing domain reconnaissance…</p>
          <p className="text-[9px] text-muted-foreground/30 mt-1">Running 13 intelligence modules against {domain}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {["DNS Intel", "TLS/SSL", "Headers", "Web App", "Infrastructure", "Subdomains", "APIs", "Email", "Cloud", "Secrets", "Supply Chain", "Compliance", "Infra Map"].map(m => (
              <span key={m} className="text-[8px] px-2 py-0.5 rounded-full bg-foreground/[0.04] text-muted-foreground/40 animate-pulse">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/[0.06] bg-foreground/[0.02] p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="h-4 w-4 text-foreground/50" />
                  <span className="text-[11px] text-foreground/70 tracking-wide">Scan Complete</span>
                </div>
                <h3 className="text-[13px] text-foreground/90 font-light">{domain}</h3>
              </div>
              <div className="text-right">
                <div className={`text-3xl font-extralight ${gradeColor[result.risk_grade] || "text-foreground/50"}`}>
                  {result.risk_grade}
                </div>
                <span className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Risk Grade</span>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground/50 leading-relaxed mb-4">{result.summary}</p>

            {isRecoveredInfrastructureMap && (
              <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-[9px] text-amber-400/80 leading-relaxed">
                  The native infrastructure topology did not come back from this run, so ZERLAL reconstructed the map from domain intelligence and the findings below.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg bg-foreground/[0.03] border border-border/[0.06] p-3 text-center">
                <div className="text-lg font-extralight text-foreground/80">{result.findings_count}</div>
                <div className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Weaknesses</div>
              </div>
              <div className="rounded-lg bg-foreground/[0.03] border border-border/[0.06] p-3 text-center">
                <div className="text-lg font-extralight text-foreground/80">{result.zero_trust_score ?? "—"}</div>
                <div className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Zero Trust</div>
              </div>
              <div className="rounded-lg bg-foreground/[0.03] border border-border/[0.06] p-3 text-center">
                <div className="text-lg font-extralight text-foreground/80">{result.total_attack_surface_score ?? "—"}</div>
                <div className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Attack Surface</div>
              </div>
              <div className="rounded-lg bg-foreground/[0.03] border border-border/[0.06] p-3 text-center">
                <div className="text-lg font-extralight text-foreground/80">{result.duration}s</div>
                <div className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Duration</div>
              </div>
            </div>

            {result.domain_info && (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                {result.domain_info.ip && (
                  <div className="text-[9px]">
                    <span className="text-muted-foreground/30">IP:</span>{" "}
                    <span className="text-foreground/60">{result.domain_info.ip}</span>
                  </div>
                )}
                {result.domain_info.hosting && (
                  <div className="text-[9px]">
                    <span className="text-muted-foreground/30">Hosting:</span>{" "}
                    <span className="text-foreground/60">{result.domain_info.hosting}</span>
                  </div>
                )}
                {result.domain_info.cdn && (
                  <div className="text-[9px]">
                    <span className="text-muted-foreground/30">CDN:</span>{" "}
                    <span className="text-foreground/60">{result.domain_info.cdn}</span>
                  </div>
                )}
                {result.domain_info.waf && (
                  <div className="text-[9px]">
                    <span className="text-muted-foreground/30">WAF:</span>{" "}
                    <span className="text-foreground/60">{result.domain_info.waf}</span>
                  </div>
                )}
                {result.domain_info.tls_grade && (
                  <div className="text-[9px]">
                    <span className="text-muted-foreground/30">TLS:</span>{" "}
                    <span className="text-foreground/60">{result.domain_info.tls_grade}</span>
                  </div>
                )}
                {result.domain_info.email_security_grade && (
                  <div className="text-[9px]">
                    <span className="text-muted-foreground/30">Email Security:</span>{" "}
                    <span className="text-foreground/60">{result.domain_info.email_security_grade}</span>
                  </div>
                )}
              </div>
            )}

            {result.domain_info?.tech_stack && result.domain_info.tech_stack.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {result.domain_info.tech_stack.map(t => (
                  <span key={t} className="text-[8px] px-2 py-0.5 rounded-full bg-foreground/[0.04] text-muted-foreground/50">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {result.subdomains_found && result.subdomains_found.length > 0 && (
              <div className="mt-3">
                <span className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Discovered Subdomains ({result.subdomains_found.length})</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {result.subdomains_found.map(s => (
                    <span key={s} className="text-[8px] px-2 py-0.5 rounded-full bg-foreground/[0.03] border border-border/[0.06] text-foreground/50">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 border-b border-border/[0.06] pb-0">
            <button
              onClick={() => setActiveTab("findings")}
              className={`px-4 py-2 text-[10px] tracking-wide border-b-2 transition-colors ${
                activeTab === "findings"
                  ? "border-foreground/30 text-foreground/80"
                  : "border-transparent text-muted-foreground/40 hover:text-foreground/60"
              }`}
            >
              Weaknesses ({findings.length})
            </button>
            <button
              onClick={() => setActiveTab("infrastructure")}
              className={`px-4 py-2 text-[10px] tracking-wide border-b-2 transition-colors ${
                activeTab === "infrastructure"
                  ? "border-foreground/30 text-foreground/80"
                  : "border-transparent text-muted-foreground/40 hover:text-foreground/60"
              }`}
            >
              Infrastructure Map {isRecoveredInfrastructureMap ? "• reconstructed" : ""}
            </button>
            <button
              onClick={() => setActiveTab("exploit")}
              className={`px-4 py-2 text-[10px] tracking-wide border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === "exploit"
                  ? "border-red-400/50 text-red-400"
                  : "border-transparent text-muted-foreground/40 hover:text-red-400/50"
              }`}
            >
              <Skull className="h-3 w-3" /> Exploit Intelligence
            </button>
          </div>

          {activeTab === "infrastructure" && (
            <InfrastructureMap
              data={resolvedInfrastructureMap}
              domain={domain}
              isFallback={isRecoveredInfrastructureMap}
              unavailableReason={result.summary}
            />
          )}

          {activeTab === "exploit" && (
            <div className="space-y-4">
              {findings.length === 0 ? (
                <div className="rounded-xl border border-border/[0.06] bg-foreground/[0.02] p-8 text-center">
                  <Skull className="h-6 w-6 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-[11px] text-foreground/50">No findings available for exploit analysis</p>
                  <p className="text-[9px] text-muted-foreground/30 mt-1">Run a domain scan first to generate findings</p>
                </div>
              ) : !selectedExploitFinding ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-red-500/[0.08] bg-red-500/[0.02] p-4">
                    <h3 className="text-[10px] text-red-400/60 uppercase tracking-wider mb-1">Select a Weakness to Analyze</h3>
                    <p className="text-[9px] text-muted-foreground/40">Choose a finding below to generate its full adversarial exploitation dossier and run a live shutdown test.</p>
                  </div>
                  <div className="space-y-1.5">
                    {findings.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setSelectedExploitFinding(f.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border/[0.06] bg-foreground/[0.015] hover:bg-red-500/[0.03] hover:border-red-500/[0.1] transition-colors text-left"
                      >
                        <span className={`shrink-0 text-[8px] uppercase tracking-wider px-2 py-0.5 rounded border ${severityColor[f.severity] || severityColor.info}`}>
                          {f.severity}
                        </span>
                        <span className="flex-1 text-[10px] text-foreground/70 truncate">{f.title}</span>
                        <span className="text-[8px] text-muted-foreground/30 shrink-0">CVSS {f.cvss_score}</span>
                        <Skull className="h-3 w-3 text-red-400/30 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => setSelectedExploitFinding(null)}
                    className="text-[10px] text-muted-foreground/30 hover:text-foreground/50 flex items-center gap-1"
                  >
                    ← Back to findings list
                  </button>
                  <ExploitIntelTab finding={findings.find(f => f.id === selectedExploitFinding)!} />
                </div>
              )}
            </div>
          )}

          {activeTab === "findings" && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/40">
                  {findingsLoading ? "Loading weaknesses for this scan…" : `${findings.length} weaknesses — showing all, no limit`}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => refetch()} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground/[0.04] text-[9px] text-foreground/50 hover:bg-foreground/[0.07] transition-colors">
                    <RefreshCw className="h-2.5 w-2.5" /> Refresh
                  </button>
                  <button onClick={copyAllFindings} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground/[0.04] text-[9px] text-foreground/50 hover:bg-foreground/[0.07] transition-colors">
                    <Copy className="h-2.5 w-2.5" /> Copy All
                  </button>
                  <button onClick={downloadFindings} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground/[0.04] text-[9px] text-foreground/50 hover:bg-foreground/[0.07] transition-colors">
                    <Download className="h-2.5 w-2.5" /> Download Report
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                {findings.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-lg border border-border/[0.06] bg-foreground/[0.015] overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedFinding(expandedFinding === f.id ? null : f.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-foreground/[0.02] transition-colors"
                    >
                      <span className={`shrink-0 text-[8px] uppercase tracking-wider px-2 py-0.5 rounded border ${severityColor[f.severity] || severityColor.info}`}>
                        {f.severity}
                      </span>
                      <span className="flex-1 text-[10px] text-foreground/70 truncate">{f.title}</span>
                      {f.age_days > 0 && (
                        <span className="text-[8px] text-orange-400/60 shrink-0 font-mono">
                          {f.age_days >= 365 ? `${Math.floor(f.age_days / 365)}y ${Math.floor((f.age_days % 365) / 30)}m` : f.age_days >= 30 ? `${Math.floor(f.age_days / 30)}m ${f.age_days % 30}d` : `${f.age_days}d`} old
                        </span>
                      )}
                      <span className="text-[8px] text-muted-foreground/30 shrink-0">{f.category}</span>
                      <span className="text-[8px] text-muted-foreground/30 shrink-0">CVSS {f.cvss_score}</span>
                      {expandedFinding === f.id ? (
                        <ChevronUp className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                      )}
                    </button>

                    {expandedFinding === f.id && (
                      <div className="px-4 pb-4 border-t border-border/[0.04] pt-3 space-y-3">
                        {onSelectFinding && (
                          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/[0.08] bg-red-500/[0.03] p-3">
                            <div>
                              <p className="text-[9px] text-red-400/60 uppercase tracking-wider">Exploit Intelligence</p>
                              <p className="text-[10px] text-foreground/55 mt-1">Open the full finding view to access the adversarial dossier and live shutdown test for this weakness.</p>
                            </div>
                            <button
                              onClick={() => onSelectFinding(f.id)}
                              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[9px] text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                              Open Exploit Intelligence <ExternalLink className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[9px]">
                          <div><span className="text-muted-foreground/30">CWE:</span> <span className="text-foreground/60">{f.cwe_id}</span></div>
                          <div><span className="text-muted-foreground/30">Confidence:</span> <span className="text-foreground/60">{f.confidence}%</span></div>
                          <div><span className="text-muted-foreground/30">Component:</span> <span className="text-foreground/60">{f.file_path}</span></div>
                          <div><span className="text-muted-foreground/30">Status:</span> <span className="text-foreground/60">{f.status}</span></div>
                          <div>
                            <span className="text-muted-foreground/30">Exploit Age:</span>{" "}
                            <span className={`font-mono ${f.age_days >= 365 ? "text-red-400" : f.age_days >= 90 ? "text-orange-400" : f.age_days >= 30 ? "text-yellow-400" : "text-foreground/60"}`}>
                              {f.age_days > 0
                                ? f.age_days >= 365
                                  ? `${Math.floor(f.age_days / 365)} year${Math.floor(f.age_days / 365) > 1 ? "s" : ""}, ${Math.floor((f.age_days % 365) / 30)} months`
                                  : f.age_days >= 30
                                    ? `${Math.floor(f.age_days / 30)} month${Math.floor(f.age_days / 30) > 1 ? "s" : ""}, ${f.age_days % 30} days`
                                    : `${f.age_days} days`
                                : "Unknown"}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Description</span>
                          <p className="text-[10px] text-foreground/60 leading-relaxed mt-1">{f.description}</p>
                        </div>

                        <div>
                          <span className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Impact</span>
                          <p className="text-[10px] text-foreground/60 leading-relaxed mt-1">{f.impact}</p>
                        </div>

                        {f.exploitation_steps && f.exploitation_steps.length > 0 && (
                          <div>
                            <span className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Defensive Verification</span>
                            <ol className="mt-1 space-y-1">
                              {f.exploitation_steps.map((step: string, i: number) => (
                                <li key={i} className="text-[9px] text-foreground/50 flex gap-2">
                                  <span className="text-red-400/60 shrink-0">{i + 1}.</span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {f.code_snippet && (
                          <div>
                            <span className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Evidence</span>
                            <pre className="mt-1 rounded-md bg-foreground/[0.03] border border-border/[0.06] p-3 text-[9px] text-red-300/70 overflow-x-auto font-mono whitespace-pre-wrap">
                              {f.code_snippet}
                            </pre>
                          </div>
                        )}

                        {f.suggested_fix && (
                          <div>
                            <span className="text-[8px] text-muted-foreground/30 uppercase tracking-wider">Remediation</span>
                            <pre className="mt-1 rounded-md bg-foreground/[0.03] border border-border/[0.06] p-3 text-[9px] text-green-300/70 overflow-x-auto font-mono whitespace-pre-wrap">
                              {f.suggested_fix}
                            </pre>
                          </div>
                        )}

                        {f.compliance_controls && f.compliance_controls.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {f.compliance_controls.map((c: string) => (
                              <span key={c} className="text-[7px] px-1.5 py-0.5 rounded bg-foreground/[0.03] border border-border/[0.06] text-muted-foreground/40">
                                {c}
                              </span>
                            ))}
                          </div>
                        )}

                        {f.similar_cves && f.similar_cves.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {f.similar_cves.map((cve: string) => (
                              <a
                                key={cve}
                                href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[7px] px-1.5 py-0.5 rounded bg-red-500/5 border border-red-500/10 text-red-400/60 hover:text-red-400 flex items-center gap-0.5"
                              >
                                {cve} <ExternalLink className="h-2 w-2" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {!scanning && !result && (
        <div className="rounded-xl border border-border/[0.06] bg-foreground/[0.015] p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-foreground/[0.03] border border-border/[0.06] flex items-center justify-center mx-auto mb-4">
            <Globe className="h-6 w-6 text-muted-foreground/20" />
          </div>
          <h3 className="text-[12px] font-light text-foreground/70 tracking-wide mb-1">Domain Reconnaissance</h3>
          <p className="text-[9px] text-muted-foreground/30 max-w-md mx-auto leading-relaxed">
            Enter any domain to execute a full-spectrum security reconnaissance using ELION/ZOHAR intelligence modules with the ZERLAL intelligence knowledge base.
            Scans DNS, TLS, headers, subdomains, APIs, cloud storage, secrets, supply chain, compliance, and maps the full infrastructure architecture — listing every weakness without limits.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {["DNS Intel", "TLS/SSL", "Security Headers", "Web App", "Infrastructure", "Subdomains", "APIs", "Email", "Cloud Storage", "Secrets", "Supply Chain", "Compliance", "Infra Map"].map(m => (
              <span key={m} className="text-[8px] px-2 py-0.5 rounded-full bg-foreground/[0.04] text-muted-foreground/30">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DomainReconScreen;
