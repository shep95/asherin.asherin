/**
 * Code Vulnerability Scanner — Paste code, get SAST-style findings with CWE mappings.
 */
import { useState } from "react";
import { Shield, Play, AlertTriangle, Check, Code2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Finding {
  line: number;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  cwe: string;
  description: string;
  fix: string;
}

const RULES: { pattern: RegExp; severity: Finding["severity"]; title: string; cwe: string; description: string; fix: string; langs: string[] }[] = [
  { pattern: /eval\s*\(/g, severity: "critical", title: "Use of eval()", cwe: "CWE-95", description: "eval() executes arbitrary code — injection vector", fix: "Use JSON.parse() or a safe parser", langs: ["javascript", "python"] },
  { pattern: /document\.write\s*\(/g, severity: "high", title: "document.write() DOM injection", cwe: "CWE-79", description: "Direct DOM manipulation enables XSS", fix: "Use textContent or createElement", langs: ["javascript"] },
  { pattern: /innerHTML\s*=/g, severity: "high", title: "innerHTML assignment", cwe: "CWE-79", description: "Setting innerHTML with unsanitized input enables XSS", fix: "Use textContent or DOMPurify.sanitize()", langs: ["javascript"] },
  { pattern: /dangerouslySetInnerHTML/g, severity: "high", title: "React dangerouslySetInnerHTML", cwe: "CWE-79", description: "Renders raw HTML — XSS risk if input is unsanitized", fix: "Sanitize with DOMPurify before rendering", langs: ["javascript"] },
  { pattern: /SELECT\s+.*\s+FROM\s+.*\+\s*['"`]/gi, severity: "critical", title: "SQL Injection (string concatenation)", cwe: "CWE-89", description: "Building SQL queries with string concatenation", fix: "Use parameterized queries / prepared statements", langs: ["javascript", "python", "java"] },
  { pattern: /exec\s*\(/g, severity: "high", title: "Command execution via exec()", cwe: "CWE-78", description: "Executes system commands — OS injection risk", fix: "Use subprocess with shell=False / execFile", langs: ["python", "javascript"] },
  { pattern: /os\.system\s*\(/g, severity: "critical", title: "os.system() command injection", cwe: "CWE-78", description: "Directly runs shell commands", fix: "Use subprocess.run with list args, shell=False", langs: ["python"] },
  { pattern: /subprocess\.\w+\(.*shell\s*=\s*True/g, severity: "high", title: "subprocess with shell=True", cwe: "CWE-78", description: "Shell=True enables command injection", fix: "Set shell=False, pass args as list", langs: ["python"] },
  { pattern: /pickle\.loads?\s*\(/g, severity: "critical", title: "Insecure deserialization (pickle)", cwe: "CWE-502", description: "Pickle can execute arbitrary code on deserialization", fix: "Use json or a safe serialization format", langs: ["python"] },
  { pattern: /password\s*=\s*['"][^'"]+['"]/gi, severity: "high", title: "Hardcoded credential", cwe: "CWE-798", description: "Password stored in source code", fix: "Use environment variables or a secrets manager", langs: ["javascript", "python", "java"] },
  { pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/gi, severity: "high", title: "Hardcoded API key", cwe: "CWE-798", description: "API key embedded in source code", fix: "Use environment variables", langs: ["javascript", "python", "java"] },
  { pattern: /Math\.random\(\)/g, severity: "medium", title: "Weak randomness (Math.random)", cwe: "CWE-330", description: "Math.random() is not cryptographically secure", fix: "Use crypto.getRandomValues() or crypto.randomUUID()", langs: ["javascript"] },
  { pattern: /md5\s*\(/gi, severity: "medium", title: "Weak hash (MD5)", cwe: "CWE-328", description: "MD5 is broken — collision attacks are trivial", fix: "Use SHA-256 or SHA-3", langs: ["javascript", "python", "java"] },
  { pattern: /sha1\s*\(/gi, severity: "medium", title: "Weak hash (SHA-1)", cwe: "CWE-328", description: "SHA-1 has known collision vulnerabilities", fix: "Use SHA-256 or SHA-3", langs: ["javascript", "python", "java"] },
  { pattern: /console\.log\s*\(/g, severity: "low", title: "Console.log in production", cwe: "CWE-532", description: "Debug logging may expose sensitive data", fix: "Remove or gate behind debug flag", langs: ["javascript"] },
  { pattern: /TODO|FIXME|HACK|XXX/g, severity: "info", title: "Code annotation found", cwe: "CWE-1078", description: "Unresolved development annotation", fix: "Review and resolve before deployment", langs: ["javascript", "python", "java"] },
  { pattern: /atob\s*\(/g, severity: "low", title: "Base64 decode (not encryption)", cwe: "CWE-311", description: "Base64 is encoding, not encryption — data is not protected", fix: "Use proper encryption if protecting sensitive data", langs: ["javascript"] },
  { pattern: /new\s+Function\s*\(/g, severity: "critical", title: "Dynamic Function constructor", cwe: "CWE-95", description: "Creates function from string — equivalent to eval()", fix: "Avoid dynamic code generation", langs: ["javascript"] },
  { pattern: /\.env/g, severity: "low", title: "Reference to .env file", cwe: "CWE-200", description: "Environment file reference — ensure not committed to VCS", fix: "Add .env to .gitignore", langs: ["javascript", "python"] },
];

function scanCode(code: string, lang: string): Finding[] {
  const lines = code.split("\n");
  const findings: Finding[] = [];

  for (const rule of RULES) {
    if (!rule.langs.includes(lang)) continue;
    for (let i = 0; i < lines.length; i++) {
      const matches = lines[i].matchAll(rule.pattern);
      for (const _ of matches) {
        findings.push({ line: i + 1, severity: rule.severity, title: rule.title, cwe: rule.cwe, description: rule.description, fix: rule.fix });
      }
    }
  }

  return findings.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return order[a.severity] - order[b.severity];
  });
}

const sevColor: Record<string, string> = {
  critical: "text-red-400 border-red-500/30 bg-red-500/5",
  high: "text-orange-400 border-orange-500/30 bg-orange-500/5",
  medium: "text-amber-400 border-amber-500/30 bg-amber-500/5",
  low: "text-blue-400 border-blue-500/30 bg-blue-500/5",
  info: "text-muted-foreground/50 border-border/[0.08]",
};

const CodeVulnScanner = () => {
  const [code, setCode] = useState("");
  const [lang, setLang] = useState("javascript");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [scanned, setScanned] = useState(false);

  const handleScan = () => {
    const results = scanCode(code, lang);
    setFindings(results);
    setScanned(true);
    toast.success(`Found ${results.length} issue${results.length !== 1 ? "s" : ""}`);
  };

  const stats = {
    critical: findings.filter(f => f.severity === "critical").length,
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
    low: findings.filter(f => f.severity === "low").length,
    info: findings.filter(f => f.severity === "info").length,
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-[1000px] mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">Code Vulnerability Scanner</h2>
            <p className="text-[10px] text-muted-foreground/35 mt-0.5">Static analysis with CWE mappings</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={lang} onValueChange={setLang}>
              <SelectTrigger className="h-7 text-[9px] w-[120px] bg-card/20 border-border/[0.08]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="javascript">JavaScript/TS</SelectItem>
                <SelectItem value="python">Python</SelectItem>
                <SelectItem value="java">Java</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleScan} disabled={!code.trim()} className="text-[9px] h-7">
              <Play className="h-3 w-3 mr-1" />Scan
            </Button>
          </div>
        </div>

        <Textarea value={code} onChange={e => setCode(e.target.value)} placeholder="Paste code to analyze..."
          className="min-h-[250px] text-xs font-mono bg-card/20 border-border/[0.08]" />

        {scanned && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-5 gap-3">
              {(["critical", "high", "medium", "low", "info"] as const).map(s => (
                <div key={s} className={`rounded-lg border p-3 text-center ${sevColor[s]}`}>
                  <div className="text-lg font-light">{stats[s]}</div>
                  <div className="text-[9px] uppercase tracking-wider opacity-60">{s}</div>
                </div>
              ))}
            </div>

            {/* Findings */}
            <div className="space-y-2">
              {findings.map((f, i) => (
                <div key={i} className={`rounded-lg border p-3 ${sevColor[f.severity]}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3" />
                      <span className="text-[10px] font-medium">{f.title}</span>
                      <Badge variant="outline" className="text-[8px] h-4">{f.cwe}</Badge>
                      <span className="text-[9px] opacity-40">Line {f.line}</span>
                    </div>
                    <Badge variant="outline" className="text-[8px] h-4 uppercase">{f.severity}</Badge>
                  </div>
                  <div className="text-[9px] opacity-60 mt-1">{f.description}</div>
                  <div className="text-[9px] opacity-80 mt-1 flex items-center gap-1">
                    <Check className="h-2.5 w-2.5" /> Fix: {f.fix}
                  </div>
                </div>
              ))}
              {findings.length === 0 && (
                <div className="text-center py-8">
                  <Check className="h-8 w-8 text-emerald-400/30 mx-auto mb-2" />
                  <p className="text-[10px] text-muted-foreground/30">No vulnerabilities detected</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CodeVulnScanner;
