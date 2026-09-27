import { useState, useEffect, useCallback } from "react";
import { ExternalLink, Globe, Crosshair, Loader2, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";

interface LinkPreviewProps {
  url: string;
}

interface PreviewData {
  title: string;
  description: string;
  image?: string;
  domain: string;
  favicon?: string;
}

const URL_REGEX = /https?:\/\/[^\s<]+/g;

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

const previewCache = new Map<string, PreviewData | null>();
const extractionCache = new Map<string, string>();

function formatBlueprintIntel(url: string, payload: any): string {
  if (Array.isArray(payload?.findings) && payload?.http && payload?.dns) {
    const rows = payload.findings.length
      ? payload.findings.map((r: any) => `| ${r.finding} | ${r.severity} | ${r.evidence} | ${r.remediation} |`).join("\n")
      : "| No high-confidence surface flaw from current unauthenticated scan | Info | Live scan completed | Run authenticated crawl / DAST for deeper coverage |";
    const headers = payload?.http?.headers || {};
    const securityHeaders = ["strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"];
    const present = securityHeaders.filter((h) => headers[h]);
    const missing = securityHeaders.filter((h) => !headers[h]);
    return `## AUREON LINK INTELLIGENCE REPORT\n\n**Target:** ${url}\n\n**Summary:** ${payload.summary}\n\n| Signal | Value |\n|---|---|\n| HTTP | ${payload?.http?.status ?? "unreachable"} → ${payload?.http?.finalUrl || "n/a"} |\n| DNS A | ${(payload?.dns?.A || []).join(", ") || "none observed"} |\n| Security Score | ${payload?.score?.security ?? "n/a"}/100 |\n| Tech Signals | ${(payload?.tech || []).join(", ") || "none fingerprinted"} |\n\n### Security Header Posture\n\n| Present | Missing |\n|---|---|\n| ${present.join(", ") || "none"} | ${missing.join(", ") || "none"} |\n\n### Findings\n\n| Finding | Severity | Evidence | Remediation |\n|---|---:|---|---|\n${rows}`;
  }

  const blueprint = payload?.blueprint || {};
  const recon = payload?.recon || {};
  const forensics = payload?.forensics || {};
  const secrets = payload?.secrets || {};
  const security = forensics?.security_audit;
  const email = forensics?.email_infra;
  const exposed = Array.isArray(forensics?.exposed) ? forensics.exposed : [];
  const branches = Array.isArray(blueprint?.branches) ? blueprint.branches : [];
  const findings = Array.isArray(blueprint?.findings) ? blueprint.findings : [];
  const threatFindings = branches.flatMap((b: any) => Array.isArray(b?.leaves) ? b.leaves.map((leaf: any) => ({ branch: b.label || b.id, ...leaf })) : []);
  const weaknessRows = [
    ...(security?.weaknesses || []).map((w: string) => ({ finding: w, severity: /critical/i.test(w) ? "Critical" : /cors|cookie|csp|clickjacking|hsts/i.test(w) ? "High" : "Medium", evidence: "Live header/cookie audit" })),
    ...(email?.weaknesses || []).map((w: string) => ({ finding: w, severity: /No DMARC|No SPF/i.test(w) ? "High" : "Medium", evidence: "Live DNS email records" })),
    ...exposed.map((e: any) => ({ finding: `Exposed path: ${e.path}`, severity: e.risk === "critical" ? "Critical" : e.risk === "warn" ? "High" : "Info", evidence: `HTTP ${e.status}, ${e.size || 0} bytes` })),
    ...(secrets?.secrets || []).map((s: any) => ({ finding: `Client-side secret pattern: ${s.label}`, severity: String(s.severity || "high").replace(/^./, (c) => c.toUpperCase()), evidence: s.source || "JS/inline scan" })),
    ...findings.slice(0, 8).map((f: any) => ({ finding: f.finding || f.label || "Blueprint finding", severity: f.severity || "Medium", evidence: f.branch || "AI blueprint grounded in live recon" })),
    ...threatFindings.slice(0, 8).map((f: any) => ({ finding: f.label || f.finding || f.value || "Observed branch signal", severity: f.severity || f.tone || "Info", evidence: f.branch || "Blueprint branch" })),
  ].slice(0, 18);

  const score = blueprint?.score || {};
  const headers = recon?.http?.headers || {};
  const dns = recon?.dns || {};
  const securityHeaders = ["strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"];
  const present = securityHeaders.filter((h) => headers[h]);
  const missing = securityHeaders.filter((h) => !headers[h]);
  const rows = weaknessRows.length
    ? weaknessRows.map((r) => `| ${r.finding} | ${r.severity} | ${r.evidence} | Patch config/header/code path and retest |`).join("\n")
    : "| No high-confidence surface flaw from current unauthenticated scan | Info | Live scan completed | Run authenticated crawl / DAST for deeper coverage |";

  return `## AUREON LINK INTELLIGENCE REPORT\n\n**Target:** ${url}\n\n**Summary:** ${blueprint?.summary || "Live defensive URL intelligence completed from observable public surface."}\n\n| Signal | Value |\n|---|---|\n| HTTP | ${recon?.http?.status ?? "unreachable"} → ${recon?.http?.finalUrl || "n/a"} |\n| DNS A | ${(dns?.A || []).join(", ") || "none observed"} |\n| Security Score | ${score.security ?? "n/a"}/100 |\n| Performance Score | ${score.performance ?? "n/a"}/100 |\n| JS Bundles Scanned | ${secrets?.bundles_scanned ?? 0} |\n| Subdomains Found | ${(recon?.subdomains || []).length} |\n\n### Security Header Posture\n\n| Present | Missing |\n|---|---|\n| ${present.join(", ") || "none"} | ${missing.join(", ") || "none"} |\n\n### Findings\n\n| Finding | Severity | Evidence | Remediation |\n|---|---:|---|---|\n${rows}\n\n### Raw Live Evidence\n\n\`\`\`json\n${JSON.stringify({ recon, forensics, secrets }, null, 2).slice(0, 12000)}\n\`\`\``;
}

const LinkPreviewCard = ({ url }: LinkPreviewProps) => {
  const [preview, setPreview] = useState<PreviewData | null>(previewCache.get(url) ?? null);
  const [loading, setLoading] = useState(!previewCache.has(url));
  const [faviconError, setFaviconError] = useState(false);

  // Elion extraction state
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<string | null>(extractionCache.get(url) ?? null);
  const [extractExpanded, setExtractExpanded] = useState(true);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (previewCache.has(url)) {
      setPreview(previewCache.get(url) ?? null);
      setLoading(false);
      return;
    }

    const domain = extractDomain(url);
    const data: PreviewData = {
      title: domain,
      description: url,
      domain,
      favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
    };

    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch) {
      data.title = "YouTube Video";
      data.image = `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`;
      data.description = "Watch on YouTube";
    }

    if (domain.includes("twitter.com") || domain.includes("x.com")) {
      data.title = "Post on X";
      data.description = "View the post on X (formerly Twitter)";
    }

    if (domain.includes("github.com")) {
      const parts = url.split("github.com/")[1]?.split("/");
      if (parts && parts.length >= 2) {
        data.title = `${parts[0]}/${parts[1]}`;
        data.description = "GitHub Repository";
      }
    }

    previewCache.set(url, data);
    setPreview(data);
    setLoading(false);
  }, [url]);

  const handleExtract = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (extracting || extracted) return;

    setExtracting(true);
    setExtractError(null);

    try {
      const { data, error } = await supabase.functions.invoke("link-security-audit", {
        body: {
          url,
        },
      });

      if (error) {
        console.error("Elion invoke error:", error);
        throw new Error(typeof error === "object" && error.message ? error.message : String(error));
      }

      if (!data) throw new Error("No response from intelligence engine");
      if (data.error) throw new Error(data.error);

      const result = typeof data === "string" ? data : formatBlueprintIntel(url, data);
      if (!result || result === "No output generated.") throw new Error("Intelligence engine returned empty analysis");
      extractionCache.set(url, result);
      setExtracted(result);
    } catch (err: any) {
      console.error("Elion extraction error:", err);
      setExtractError(err.message || "Failed to extract intelligence from this URL");
    } finally {
      setExtracting(false);
    }
  }, [url, extracting, extracted]);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!extracted) return;
    navigator.clipboard.writeText(extracted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [extracted]);

  if (loading) {
    return (
      <div className="mt-2 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm p-3 animate-pulse">
        <div className="h-4 w-32 bg-foreground/5 rounded" />
      </div>
    );
  }

  if (!preview) return null;

  return (
    <div className="mt-2 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm overflow-hidden">
      {/* Link preview row */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex gap-3 p-3 hover:bg-card/50 transition-all group"
      >
        {preview.image && (
          <img src={preview.image} alt="" className="w-20 h-14 rounded-lg object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {preview.favicon && !faviconError ? (
              <img
                src={preview.favicon}
                alt=""
                className="w-4 h-4 rounded-sm"
                onError={() => setFaviconError(true)}
              />
            ) : (
              <Globe className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            )}
            <span className="text-[10px] text-muted-foreground/60">{preview.domain}</span>
          </div>
          <p className="text-xs font-light text-foreground truncate">{preview.title}</p>
          <p className="text-[10px] text-muted-foreground/50 truncate">{preview.description}</p>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-foreground/50 transition-colors shrink-0 mt-1" />
      </a>

      {/* Extract Intel button */}
      <div className="border-t border-border/10 px-3 py-1.5 flex items-center gap-2">
        <button
          onClick={handleExtract}
          disabled={extracting || !!extracted}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium tracking-wide transition-all ${
            extracted
              ? "bg-accent/10 text-accent/70 cursor-default"
              : extracting
              ? "bg-foreground/5 text-muted-foreground/50 cursor-wait"
              : "bg-foreground/5 hover:bg-accent/15 text-muted-foreground hover:text-accent cursor-pointer"
          }`}
        >
          {extracting ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>EXTRACTING...</span>
            </>
          ) : extracted ? (
            <>
              <Crosshair className="h-3 w-3" />
              <span>INTEL EXTRACTED</span>
            </>
          ) : (
            <>
              <Crosshair className="h-3 w-3" />
              <span>EXTRACT INTEL</span>
            </>
          )}
        </button>

        {extracted && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={handleCopy}
              className="p-1 rounded hover:bg-foreground/5 transition text-muted-foreground/40 hover:text-foreground/60"
              title="Copy report"
            >
              {copied ? <Check className="h-3 w-3 text-accent" /> : <Copy className="h-3 w-3" />}
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExtractExpanded(p => !p); }}
              className="p-1 rounded hover:bg-foreground/5 transition text-muted-foreground/40 hover:text-foreground/60"
            >
              {extractExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          </div>
        )}
      </div>

      {/* Extract error */}
      {extractError && (
        <div className="px-3 pb-2 text-[10px] text-red-400/80">
          {extractError}
        </div>
      )}

      {/* Extracted intel panel */}
      {extracted && extractExpanded && (
        <div className="border-t border-border/10 px-3 py-2 max-h-[400px] overflow-y-auto">
          <div className="text-[10px] font-semibold tracking-widest text-accent/60 uppercase mb-1.5 flex items-center gap-1.5">
            <Crosshair className="h-3 w-3" />
              AUREON INTELLIGENCE REPORT
          </div>
          <div className="prose prose-sm prose-invert max-w-none text-[11px] leading-relaxed [&_p]:mb-1.5 [&_p]:last:mb-0 [&_code]:bg-black/30 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[10px] [&_pre]:bg-black/40 [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:text-[10px] [&_ul]:space-y-0.5 [&_li]:text-[11px] [&_h1]:text-xs [&_h2]:text-[11px] [&_h3]:text-[11px] [&_table]:text-[10px] [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_table]:border-border/20 [&_th]:border-border/20 [&_td]:border-border/20 [&_hr]:border-border/20">
            <ReactMarkdown>{extracted}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

// Extract URLs from text and render previews
export function renderLinkPreviews(text: string) {
  const urls = text.match(URL_REGEX);
  if (!urls || urls.length === 0) return null;
  const unique = [...new Set(urls)].slice(0, 3);
  return (
    <div className="space-y-1.5">
      {unique.map((url) => (
        <LinkPreviewCard key={url} url={url} />
      ))}
    </div>
  );
}

export default LinkPreviewCard;
