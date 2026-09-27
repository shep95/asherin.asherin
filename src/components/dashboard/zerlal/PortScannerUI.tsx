/**
 * Port Scanner UI — Visualize open ports/services for analysis.
 * Client-side simulation with realistic network topology rendering.
 */
import { useState } from "react";
import { Globe, Search, Shield, AlertTriangle, Server, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PortResult {
  port: number;
  state: "open" | "closed" | "filtered";
  service: string;
  version: string;
  risk: "critical" | "high" | "medium" | "low" | "info";
  note: string;
}

const COMMON_PORTS: { port: number; service: string; version: string; risk: PortResult["risk"]; note: string }[] = [
  { port: 21, service: "FTP", version: "vsftpd 3.0.5", risk: "high", note: "FTP allows unencrypted file transfer" },
  { port: 22, service: "SSH", version: "OpenSSH 8.9p1", risk: "info", note: "Secure shell — verify key-based auth" },
  { port: 23, service: "Telnet", version: "", risk: "critical", note: "Telnet transmits in cleartext — disable immediately" },
  { port: 25, service: "SMTP", version: "Postfix 3.6", risk: "medium", note: "Mail relay — check for open relay" },
  { port: 53, service: "DNS", version: "BIND 9.18", risk: "medium", note: "DNS — verify zone transfer restrictions" },
  { port: 80, service: "HTTP", version: "nginx 1.24", risk: "medium", note: "Unencrypted web — redirect to HTTPS" },
  { port: 110, service: "POP3", version: "", risk: "high", note: "Cleartext email retrieval" },
  { port: 443, service: "HTTPS", version: "nginx 1.24", risk: "info", note: "Encrypted web traffic" },
  { port: 445, service: "SMB", version: "Samba 4.17", risk: "high", note: "File sharing — common attack vector" },
  { port: 1433, service: "MSSQL", version: "SQL Server 2022", risk: "high", note: "Database exposed to network" },
  { port: 3306, service: "MySQL", version: "MySQL 8.0", risk: "high", note: "Database port — should not be public" },
  { port: 3389, service: "RDP", version: "Windows RDP", risk: "critical", note: "Remote Desktop — primary ransomware vector" },
  { port: 5432, service: "PostgreSQL", version: "PostgreSQL 16", risk: "high", note: "Database exposed" },
  { port: 5900, service: "VNC", version: "RealVNC 6.x", risk: "critical", note: "Remote desktop without encryption" },
  { port: 6379, service: "Redis", version: "Redis 7.2", risk: "critical", note: "In-memory DB — often no auth" },
  { port: 8080, service: "HTTP-Alt", version: "Apache Tomcat 10", risk: "medium", note: "Alternative HTTP — check for admin panels" },
  { port: 8443, service: "HTTPS-Alt", version: "", risk: "low", note: "Alternative HTTPS" },
  { port: 9200, service: "Elasticsearch", version: "ES 8.12", risk: "critical", note: "Search engine — often exposed without auth" },
  { port: 27017, service: "MongoDB", version: "MongoDB 7.0", risk: "critical", note: "NoSQL DB — frequently misconfigured" },
];

function simulateScan(target: string): PortResult[] {
  const hash = target.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return COMMON_PORTS.filter((_, i) => (hash + i * 7) % 3 !== 0).map(p => ({
    ...p,
    state: ((hash + p.port) % 5 === 0 ? "filtered" : "open") as PortResult["state"],
  }));
}

const riskColor: Record<string, string> = {
  critical: "text-red-400 border-red-500/30 bg-red-500/5",
  high: "text-orange-400 border-orange-500/30 bg-orange-500/5",
  medium: "text-amber-400 border-amber-500/30 bg-amber-500/5",
  low: "text-blue-400 border-blue-500/30 bg-blue-500/5",
  info: "text-foreground/40 border-border/[0.08]",
};

const PortScannerUI = () => {
  const [target, setTarget] = useState("");
  const [results, setResults] = useState<PortResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  const handleScan = () => {
    if (!target.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setResults(simulateScan(target.trim()));
      setLoading(false);
      setScanned(true);
      toast.success("Port scan complete");
    }, 2000);
  };

  const openPorts = results.filter(r => r.state === "open");
  const criticalPorts = openPorts.filter(r => r.risk === "critical");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-[1000px] mx-auto space-y-4">
        <div>
          <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">Port Scanner</h2>
          <p className="text-[10px] text-muted-foreground/35 mt-0.5">Visualize open ports and services with risk assessment</p>
        </div>

        <div className="flex gap-2">
          <Input value={target} onChange={e => setTarget(e.target.value)} placeholder="Enter IP or hostname (e.g. 192.168.1.1)"
            className="text-xs font-mono bg-card/20 border-border/[0.08]" onKeyDown={e => e.key === "Enter" && handleScan()} />
          <Button size="sm" onClick={handleScan} disabled={loading || !target.trim()} className="text-[9px]">
            {loading ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
            {loading ? "Scanning..." : "Scan"}
          </Button>
        </div>

        {scanned && (
          <>
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3 text-center">
                <div className="text-lg font-light text-foreground/60">{results.length}</div>
                <div className="text-[9px] text-muted-foreground/30 uppercase">Scanned</div>
              </div>
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3 text-center">
                <div className="text-lg font-light text-emerald-400">{openPorts.length}</div>
                <div className="text-[9px] text-muted-foreground/30 uppercase">Open</div>
              </div>
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3 text-center">
                <div className="text-lg font-light text-amber-400">{results.filter(r => r.state === "filtered").length}</div>
                <div className="text-[9px] text-muted-foreground/30 uppercase">Filtered</div>
              </div>
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3 text-center">
                <div className="text-lg font-light text-red-400">{criticalPorts.length}</div>
                <div className="text-[9px] text-muted-foreground/30 uppercase">Critical</div>
              </div>
            </div>

            {/* Port grid visualization */}
            <div className="rounded-xl border border-border/[0.06] bg-card/20 p-4">
              <div className="text-[9px] text-muted-foreground/30 uppercase tracking-wider mb-3">Port Map</div>
              <div className="flex flex-wrap gap-1.5">
                {results.map(r => (
                  <div key={r.port} title={`${r.port} - ${r.service} (${r.state})`}
                    className={`w-10 h-10 rounded-lg border flex flex-col items-center justify-center cursor-default transition-colors ${
                      r.state === "filtered" ? "border-amber-500/20 bg-amber-500/5" : riskColor[r.risk]
                    }`}>
                    <span className="text-[9px] font-mono">{r.port}</span>
                    <span className="text-[7px] opacity-50">{r.service.slice(0, 4)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed table */}
            <div className="rounded-xl border border-border/[0.06] bg-card/20">
              <div className="grid grid-cols-[60px_80px_1fr_1fr_80px_1fr] gap-2 px-4 py-2 border-b border-border/[0.06] text-[8px] text-muted-foreground/30 uppercase tracking-wider">
                <span>Port</span><span>State</span><span>Service</span><span>Version</span><span>Risk</span><span>Note</span>
              </div>
              {results.map(r => (
                <div key={r.port} className="grid grid-cols-[60px_80px_1fr_1fr_80px_1fr] gap-2 px-4 py-2 border-b border-border/[0.04] last:border-0 text-[10px] hover:bg-foreground/[0.01]">
                  <span className="font-mono text-foreground/60">{r.port}</span>
                  <Badge variant="outline" className={`text-[8px] h-4 ${r.state === "open" ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/30"}`}>{r.state}</Badge>
                  <span className="text-foreground/50">{r.service}</span>
                  <span className="text-muted-foreground/40 font-mono">{r.version}</span>
                  <Badge variant="outline" className={`text-[8px] h-4 uppercase ${riskColor[r.risk]}`}>{r.risk}</Badge>
                  <span className="text-muted-foreground/30">{r.note}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PortScannerUI;
