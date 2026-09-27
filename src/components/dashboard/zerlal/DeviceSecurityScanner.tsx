import { useState, useCallback } from "react";
import { Smartphone, Shield, Wifi, Lock, Eye, Bluetooth, MapPin, Cpu, HardDrive, Globe, AlertTriangle, CheckCircle, XCircle, Loader2, RotateCcw, Copy, Download, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type RiskLevel = "safe" | "moderate" | "critical" | "unknown";
type CheckStatus = "idle" | "running" | "done";

interface CheckResult {
  id: string;
  category: string;
  name: string;
  risk: RiskLevel;
  value: string;
  detail: string;
  icon: React.ElementType;
}

interface CategoryResult {
  name: string;
  icon: React.ElementType;
  checks: CheckResult[];
  score: number;
  expanded: boolean;
}

const riskColors: Record<RiskLevel, string> = {
  safe: "text-emerald-400 bg-emerald-500/10",
  moderate: "text-amber-400 bg-amber-500/10",
  critical: "text-red-400 bg-red-500/10",
  unknown: "text-muted-foreground/40 bg-foreground/[0.03]",
};

const riskLabels: Record<RiskLevel, string> = {
  safe: "SAFE",
  moderate: "MODERATE",
  critical: "CRITICAL",
  unknown: "UNKNOWN",
};

// ── DEVICE CHECKS ──

function checkOS(): CheckResult {
  const ua = navigator.userAgent;
  let os = "Unknown OS";
  let risk: RiskLevel = "unknown";
  let detail = "";

  if (/Windows NT 10/.test(ua)) { os = "Windows 10/11"; risk = "safe"; detail = "Supported OS with active security updates."; }
  else if (/Windows NT 6\.3/.test(ua)) { os = "Windows 8.1"; risk = "critical"; detail = "End of life. No longer receiving security patches."; }
  else if (/Windows NT 6\.[12]/.test(ua)) { os = "Windows 7/8"; risk = "critical"; detail = "End of life. Highly vulnerable to known exploits."; }
  else if (/Mac OS X (\d+)[_.](\d+)/.test(ua)) {
    const m = ua.match(/Mac OS X (\d+)[_.](\d+)/);
    const major = parseInt(m?.[1] || "0"); const minor = parseInt(m?.[2] || "0");
    os = `macOS ${major}.${minor}`;
    risk = major >= 14 ? "safe" : major >= 12 ? "moderate" : "critical";
    detail = risk === "safe" ? "Recent macOS with active support." : risk === "moderate" ? "Aging macOS. Consider upgrading." : "Unsupported macOS. No security patches.";
  }
  else if (/Android (\d+)/.test(ua)) {
    const v = parseInt(ua.match(/Android (\d+)/)?.[1] || "0");
    os = `Android ${v}`;
    risk = v >= 13 ? "safe" : v >= 11 ? "moderate" : "critical";
    detail = risk === "safe" ? "Recent Android with security patches." : risk === "moderate" ? "Older Android. May miss recent patches." : "Outdated Android. Known CVEs unpatched.";
  }
  else if (/iPhone OS (\d+)/.test(ua) || /iPad/.test(ua)) {
    const v = parseInt(ua.match(/OS (\d+)/)?.[1] || "0");
    os = `iOS ${v}`;
    risk = v >= 17 ? "safe" : v >= 15 ? "moderate" : "critical";
    detail = risk === "safe" ? "Latest iOS with active patches." : risk === "moderate" ? "Older iOS. Upgrade recommended." : "Unsupported iOS version.";
  }
  else if (/Linux/.test(ua)) { os = "Linux"; risk = "safe"; detail = "Linux detected. Ensure kernel is up to date."; }
  else if (/CrOS/.test(ua)) { os = "ChromeOS"; risk = "safe"; detail = "ChromeOS auto-updates. Generally secure."; }

  return { id: "os-version", category: "System", name: "Operating System", risk, value: os, detail, icon: Cpu };
}

function checkBrowser(): CheckResult {
  const ua = navigator.userAgent;
  let browser = "Unknown";
  let version = 0;
  let risk: RiskLevel = "unknown";
  let detail = "";

  if (/Edg\/(\d+)/.test(ua)) { browser = "Edge"; version = parseInt(ua.match(/Edg\/(\d+)/)?.[1] || "0"); }
  else if (/Chrome\/(\d+)/.test(ua) && !/Edg/.test(ua)) { browser = "Chrome"; version = parseInt(ua.match(/Chrome\/(\d+)/)?.[1] || "0"); }
  else if (/Firefox\/(\d+)/.test(ua)) { browser = "Firefox"; version = parseInt(ua.match(/Firefox\/(\d+)/)?.[1] || "0"); }
  else if (/Safari\//.test(ua) && /Version\/(\d+)/.test(ua)) { browser = "Safari"; version = parseInt(ua.match(/Version\/(\d+)/)?.[1] || "0"); }

  if (browser === "Chrome" || browser === "Edge") {
    risk = version >= 120 ? "safe" : version >= 110 ? "moderate" : "critical";
  } else if (browser === "Firefox") {
    risk = version >= 120 ? "safe" : version >= 110 ? "moderate" : "critical";
  } else if (browser === "Safari") {
    risk = version >= 17 ? "safe" : version >= 15 ? "moderate" : "critical";
  }

  detail = risk === "safe" ? "Browser is up to date." : risk === "moderate" ? "Browser update available. Vulnerabilities may exist." : "Outdated browser with known CVEs. Update immediately.";

  return { id: "browser-version", category: "System", name: "Browser Version", risk, value: `${browser} ${version}`, detail, icon: Globe };
}

function checkHTTPS(): CheckResult {
  const isSecure = location.protocol === "https:";
  return {
    id: "https", category: "Network", name: "Connection Security",
    risk: isSecure ? "safe" : "critical",
    value: isSecure ? "HTTPS (TLS)" : "HTTP (Unencrypted)",
    detail: isSecure ? "Connection is encrypted with TLS." : "Connection is unencrypted. Data can be intercepted.",
    icon: Lock,
  };
}

function checkDNT(): CheckResult {
  const dnt = navigator.doNotTrack;
  const enabled = dnt === "1";
  return {
    id: "dnt", category: "Privacy", name: "Do Not Track",
    risk: enabled ? "safe" : "moderate",
    value: enabled ? "Enabled" : "Disabled",
    detail: enabled ? "DNT header is sent. Sites may honor your tracking preference." : "DNT is off. Advertisers can track freely.",
    icon: Eye,
  };
}

function checkCookies(): CheckResult {
  const enabled = navigator.cookieEnabled;
  return {
    id: "cookies", category: "Privacy", name: "Cookies",
    risk: enabled ? "moderate" : "safe",
    value: enabled ? "Enabled" : "Disabled",
    detail: enabled ? "Cookies enabled. Third-party tracking possible. Consider blocking third-party cookies." : "Cookies disabled. Maximum privacy but some sites may break.",
    icon: Eye,
  };
}

function checkWebRTC(): CheckResult {
  const hasRTC = !!(window as any).RTCPeerConnection;
  return {
    id: "webrtc", category: "Privacy", name: "WebRTC Leak Exposure",
    risk: hasRTC ? "moderate" : "safe",
    value: hasRTC ? "Exposed" : "Blocked",
    detail: hasRTC ? "WebRTC is active. Your local/public IP can leak even through VPNs." : "WebRTC is blocked. IP leak via WebRTC is prevented.",
    icon: Wifi,
  };
}

function checkWebGL(): CheckResult {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
      const renderer = debugInfo ? (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : "Unknown";
      return {
        id: "webgl", category: "Privacy", name: "WebGL Fingerprint",
        risk: "moderate",
        value: String(renderer).slice(0, 60),
        detail: "WebGL exposes GPU info used for browser fingerprinting. Consider using privacy extensions.",
        icon: Eye,
      };
    }
  } catch {}
  return { id: "webgl", category: "Privacy", name: "WebGL Fingerprint", risk: "safe", value: "Disabled", detail: "WebGL is disabled. Reduces fingerprinting surface.", icon: Eye };
}

function checkHardwareConcurrency(): CheckResult {
  const cores = navigator.hardwareConcurrency || 0;
  return {
    id: "cores", category: "System", name: "CPU Cores Exposed",
    risk: cores > 0 ? "moderate" : "safe",
    value: cores > 0 ? `${cores} cores` : "Hidden",
    detail: cores > 0 ? `Browser exposes ${cores} CPU cores. This aids fingerprinting.` : "CPU core count is hidden.",
    icon: Cpu,
  };
}

function checkDeviceMemory(): CheckResult {
  const mem = (navigator as any).deviceMemory;
  if (mem) {
    return {
      id: "memory", category: "System", name: "Device Memory Exposed",
      risk: "moderate",
      value: `${mem} GB`,
      detail: `Browser exposes ~${mem}GB RAM. Contributes to device fingerprint.`,
      icon: HardDrive,
    };
  }
  return { id: "memory", category: "System", name: "Device Memory", risk: "safe", value: "Hidden", detail: "Device memory is not exposed.", icon: HardDrive };
}

function checkScreenResolution(): CheckResult {
  const w = screen.width;
  const h = screen.height;
  const dpr = window.devicePixelRatio || 1;
  return {
    id: "screen", category: "System", name: "Screen Fingerprint",
    risk: "moderate",
    value: `${w}×${h} @${dpr}x`,
    detail: `Screen resolution and pixel ratio are exposed, contributing to fingerprinting. ${w}×${h} with ${dpr}x DPR.`,
    icon: Smartphone,
  };
}

function checkLanguages(): CheckResult {
  const langs = navigator.languages?.join(", ") || navigator.language || "Unknown";
  const count = navigator.languages?.length || 1;
  return {
    id: "languages", category: "Privacy", name: "Language Fingerprint",
    risk: count > 2 ? "moderate" : "safe",
    value: langs.slice(0, 50),
    detail: count > 2 ? `${count} languages exposed. Unique combination aids fingerprinting.` : "Language configuration is minimal.",
    icon: Globe,
  };
}

async function checkPermission(name: string, label: string): Promise<CheckResult> {
  try {
    const result = await navigator.permissions.query({ name: name as PermissionName });
    const granted = result.state === "granted";
    const prompt = result.state === "prompt";
    return {
      id: `perm-${name}`, category: "Permissions", name: `${label} Access`,
      risk: granted ? "moderate" : "safe",
      value: result.state.charAt(0).toUpperCase() + result.state.slice(1),
      detail: granted ? `${label} permission is granted. Revoke if not needed.` : prompt ? `${label} will prompt before access.` : `${label} access is denied.`,
      icon: name === "camera" ? Eye : name === "microphone" ? Eye : name === "geolocation" ? MapPin : Shield,
    };
  } catch {
    return { id: `perm-${name}`, category: "Permissions", name: `${label} Access`, risk: "unknown", value: "N/A", detail: "Permission check not supported.", icon: Shield };
  }
}

function checkBluetooth(): CheckResult {
  const hasBT = !!(navigator as any).bluetooth;
  return {
    id: "bluetooth", category: "Network", name: "Bluetooth API",
    risk: hasBT ? "moderate" : "safe",
    value: hasBT ? "Available" : "Blocked",
    detail: hasBT ? "Web Bluetooth API is available. Malicious sites could attempt BT scanning." : "Web Bluetooth is blocked. Good.",
    icon: Bluetooth,
  };
}

function checkServiceWorker(): CheckResult {
  const hasSW = "serviceWorker" in navigator;
  return {
    id: "sw", category: "System", name: "Service Workers",
    risk: hasSW ? "moderate" : "safe",
    value: hasSW ? "Supported" : "Disabled",
    detail: hasSW ? "Service workers are supported. Can be used for offline caching but also persistence of malicious code." : "Service workers disabled.",
    icon: Cpu,
  };
}

function checkPlatform(): CheckResult {
  const p = navigator.platform || (navigator as any).userAgentData?.platform || "Unknown";
  const mobile = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
  return {
    id: "platform", category: "System", name: "Device Type",
    risk: "safe",
    value: mobile ? `Mobile (${p})` : `Desktop (${p})`,
    detail: `Device identified as ${mobile ? "mobile" : "desktop"} platform.`,
    icon: Smartphone,
  };
}

function checkTouchPoints(): CheckResult {
  const tp = navigator.maxTouchPoints || 0;
  return {
    id: "touch", category: "System", name: "Touch Points",
    risk: "safe",
    value: `${tp} touch points`,
    detail: `${tp} max touch points detected. Contributes to fingerprint.`,
    icon: Smartphone,
  };
}

// ── COMPONENT ──

const DeviceSecurityScanner = () => {
  const [status, setStatus] = useState<CheckStatus>("idle");
  const [categories, setCategories] = useState<CategoryResult[]>([]);
  const [overallScore, setOverallScore] = useState<number>(0);
  const [scanTime, setScanTime] = useState<number>(0);

  const runScan = useCallback(async () => {
    setStatus("running");
    const start = Date.now();

    // Run all checks
    const results: CheckResult[] = [];

    // Sync checks
    results.push(checkOS());
    results.push(checkBrowser());
    results.push(checkPlatform());
    results.push(checkHTTPS());
    results.push(checkDNT());
    results.push(checkCookies());
    results.push(checkWebRTC());
    results.push(checkWebGL());
    results.push(checkHardwareConcurrency());
    results.push(checkDeviceMemory());
    results.push(checkScreenResolution());
    results.push(checkLanguages());
    results.push(checkBluetooth());
    results.push(checkServiceWorker());
    results.push(checkTouchPoints());

    // Async permission checks
    const permChecks = await Promise.all([
      checkPermission("camera", "Camera"),
      checkPermission("microphone", "Microphone"),
      checkPermission("geolocation", "Location"),
      checkPermission("notifications", "Notifications"),
    ]);
    results.push(...permChecks);

    // Add small delay for UX
    await new Promise(r => setTimeout(r, 800));

    // Group by category
    const catMap: Record<string, CheckResult[]> = {};
    results.forEach(r => {
      if (!catMap[r.category]) catMap[r.category] = [];
      catMap[r.category].push(r);
    });

    const catIcons: Record<string, React.ElementType> = {
      System: Cpu, Network: Wifi, Privacy: Eye, Permissions: Shield,
    };

    const catOrder = ["System", "Network", "Privacy", "Permissions"];
    const grouped: CategoryResult[] = catOrder
      .filter(c => catMap[c])
      .map(c => {
        const checks = catMap[c];
        const safeCount = checks.filter(ch => ch.risk === "safe").length;
        const score = Math.round((safeCount / checks.length) * 100);
        return { name: c, icon: catIcons[c] || Shield, checks, score, expanded: true };
      });

    // Overall score
    const allSafe = results.filter(r => r.risk === "safe").length;
    const allMod = results.filter(r => r.risk === "moderate").length;
    const total = results.length;
    const overall = Math.round(((allSafe * 1 + allMod * 0.5) / total) * 100);

    setCategories(grouped);
    setOverallScore(overall);
    setScanTime(Date.now() - start);
    setStatus("done");
    toast.success(`Device scan complete — Score: ${overall}/100`);
  }, []);

  const toggleCategory = (idx: number) => {
    setCategories(prev => prev.map((c, i) => i === idx ? { ...c, expanded: !c.expanded } : c));
  };

  const generateReport = (): string => {
    let report = "╔══════════════════════════════════════════════════════════════╗\n";
    report += "║           ZERLAL DEVICE SECURITY REPORT                     ║\n";
    report += "╚══════════════════════════════════════════════════════════════╝\n\n";
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `Overall Score: ${overallScore}/100\n`;
    report += `Risk Level: ${overallScore >= 75 ? "SAFE" : overallScore >= 50 ? "MODERATE" : "CRITICAL"}\n`;
    report += `Scan Duration: ${scanTime}ms\n`;
    report += `Checks Performed: ${categories.reduce((a, c) => a + c.checks.length, 0)}\n\n`;

    categories.forEach(cat => {
      report += `── ${cat.name.toUpperCase()} (Score: ${cat.score}/100) ──\n\n`;
      cat.checks.forEach(ch => {
        report += `  [${riskLabels[ch.risk]}] ${ch.name}: ${ch.value}\n`;
        report += `           ${ch.detail}\n\n`;
      });
    });

    return report;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateReport());
    toast.success("Report copied to clipboard");
  };

  const handleDownload = () => {
    const blob = new Blob([generateReport()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zerlal-device-scan-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  const scoreColor = overallScore >= 75 ? "text-emerald-400" : overallScore >= 50 ? "text-amber-400" : "text-red-400";
  const scoreRing = overallScore >= 75 ? "border-emerald-500/30" : overallScore >= 50 ? "border-amber-500/30" : "border-red-500/30";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-5 max-w-[900px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-foreground/[0.03] border border-border/[0.06] flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-foreground/40" />
            </div>
            <div>
              <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">Device Security Scanner</h2>
              <p className="text-[10px] text-muted-foreground/35 mt-0.5">Real-time browser-based security assessment of this device</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status === "done" && (
              <>
                <button onClick={handleCopy} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-foreground/[0.04] text-[9px] text-muted-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.07] transition-colors">
                  <Copy className="h-3 w-3" /> Copy
                </button>
                <button onClick={handleDownload} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-foreground/[0.04] text-[9px] text-muted-foreground/40 hover:text-foreground/60 hover:bg-foreground/[0.07] transition-colors">
                  <Download className="h-3 w-3" /> Download
                </button>
              </>
            )}
            <button
              onClick={runScan}
              disabled={status === "running"}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground/[0.06] text-[10px] text-foreground/60 hover:bg-foreground/[0.1] transition-colors disabled:opacity-40"
            >
              {status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : status === "done" ? <RotateCcw className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
              {status === "running" ? "Scanning..." : status === "done" ? "Re-Scan" : "Start Scan"}
            </button>
          </div>
        </div>

        {/* Idle State */}
        {status === "idle" && (
          <div className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-foreground/[0.03] border border-border/[0.08] flex items-center justify-center mx-auto mb-4">
              <Smartphone className="h-8 w-8 text-muted-foreground/20" />
            </div>
            <h3 className="text-[12px] text-foreground/50 mb-1">Device Security Assessment</h3>
            <p className="text-[10px] text-muted-foreground/30 max-w-md mx-auto mb-5 leading-relaxed">
              Performs 19 real-time checks on your device: OS version, browser security, network exposure,
              privacy leaks (WebRTC, WebGL fingerprint), permission audit, and hardware fingerprint analysis.
              All checks run locally — zero data leaves your device.
            </p>
            <button
              onClick={runScan}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-foreground/[0.08] text-[11px] text-foreground/70 hover:bg-foreground/[0.12] transition-colors"
            >
              <Shield className="h-4 w-4" /> Run Device Scan
            </button>
          </div>
        )}

        {/* Running State */}
        {status === "running" && (
          <div className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm p-12 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-foreground/20 mx-auto mb-4" />
            <p className="text-[11px] text-foreground/40">Scanning device security posture...</p>
            <p className="text-[9px] text-muted-foreground/25 mt-1">Checking OS, browser, network, privacy, permissions</p>
          </div>
        )}

        {/* Results */}
        {status === "done" && (
          <>
            {/* Score Card */}
            <div className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm p-5">
              <div className="flex items-center gap-5">
                <div className={`w-20 h-20 rounded-2xl border-2 ${scoreRing} flex items-center justify-center`}>
                  <span className={`text-2xl font-light ${scoreColor}`}>{overallScore}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12px] text-foreground/70">Device Security Score</span>
                    <span className={`text-[8px] px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      overallScore >= 75 ? "bg-emerald-500/10 text-emerald-400" : overallScore >= 50 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
                    }`}>
                      {overallScore >= 75 ? "Safe" : overallScore >= 50 ? "Moderate" : "Critical"}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/35 leading-relaxed">
                    {categories.reduce((a, c) => a + c.checks.length, 0)} checks performed in {scanTime}ms.
                    {" "}{categories.reduce((a, c) => a + c.checks.filter(ch => ch.risk === "critical").length, 0)} critical,
                    {" "}{categories.reduce((a, c) => a + c.checks.filter(ch => ch.risk === "moderate").length, 0)} moderate,
                    {" "}{categories.reduce((a, c) => a + c.checks.filter(ch => ch.risk === "safe").length, 0)} safe.
                  </p>
                  {/* Category mini-bars */}
                  <div className="flex gap-3 mt-3">
                    {categories.map((cat, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 rounded-full bg-foreground/[0.04] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${cat.score >= 75 ? "bg-emerald-500/50" : cat.score >= 50 ? "bg-amber-500/50" : "bg-red-500/50"}`}
                            style={{ width: `${cat.score}%` }}
                          />
                        </div>
                        <span className="text-[8px] text-muted-foreground/30">{cat.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Category Sections */}
            {categories.map((cat, catIdx) => {
              const CatIcon = cat.icon;
              return (
                <div key={catIdx} className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm overflow-hidden">
                  <button
                    onClick={() => toggleCategory(catIdx)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-foreground/[0.01] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <CatIcon className="h-4 w-4 text-muted-foreground/30" />
                      <span className="text-[11px] text-foreground/60 tracking-wider uppercase">{cat.name}</span>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${
                        cat.score >= 75 ? "bg-emerald-500/10 text-emerald-400" : cat.score >= 50 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
                      }`}>{cat.score}/100</span>
                    </div>
                    {cat.expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/20" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/20" />}
                  </button>

                  {cat.expanded && (
                    <div className="border-t border-border/[0.04]">
                      {cat.checks.map((check, i) => {
                        const CheckIcon = check.icon;
                        return (
                          <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border/[0.03] last:border-0 hover:bg-foreground/[0.01] transition-colors">
                            <div className="mt-0.5">
                              {check.risk === "safe" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400/60" /> :
                               check.risk === "moderate" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400/60" /> :
                               check.risk === "critical" ? <XCircle className="h-3.5 w-3.5 text-red-400/60" /> :
                               <Shield className="h-3.5 w-3.5 text-muted-foreground/20" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-foreground/55">{check.name}</span>
                                <span className={`text-[7px] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${riskColors[check.risk]}`}>
                                  {riskLabels[check.risk]}
                                </span>
                              </div>
                              <p className="text-[10px] text-foreground/40 mt-0.5 font-mono">{check.value}</p>
                              <p className="text-[9px] text-muted-foreground/30 mt-0.5 leading-relaxed">{check.detail}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default DeviceSecurityScanner;
