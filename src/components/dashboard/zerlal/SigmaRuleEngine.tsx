/**
 * SIGMA Rule Engine — Write, test, and validate SIGMA detection rules.
 * Converts SIGMA YAML to pseudo-queries for Splunk/Elastic/Sentinel.
 */
import { useState } from "react";
import { FileText, Play, Copy, Download, Plus, Trash2, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const SAMPLE_RULE = `title: Suspicious PowerShell Download Cradle
status: experimental
description: Detects PowerShell download and execute patterns
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine|contains|all:
      - 'powershell'
      - 'downloadstring'
  condition: selection
level: high
tags:
  - attack.execution
  - attack.t1059.001
falsepositives:
  - Legitimate admin scripts`;

const TEMPLATES = [
  { name: "Process Creation", yaml: `title: New Rule\nlogsource:\n  category: process_creation\n  product: windows\ndetection:\n  selection:\n    CommandLine|contains: ''\n  condition: selection\nlevel: medium` },
  { name: "Network Connection", yaml: `title: New Rule\nlogsource:\n  category: network_connection\n  product: windows\ndetection:\n  selection:\n    DestinationPort: 4444\n  condition: selection\nlevel: high` },
  { name: "File Creation", yaml: `title: New Rule\nlogsource:\n  category: file_event\n  product: windows\ndetection:\n  selection:\n    TargetFilename|endswith: '.exe'\n  condition: selection\nlevel: medium` },
];

type Backend = "splunk" | "elastic" | "sentinel" | "qradar";

function sigmaToQuery(yaml: string, backend: Backend): string {
  const lines = yaml.split("\n");
  const fields: string[] = [];
  let inSelection = false;
  let level = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("level:")) level = trimmed.split(":")[1]?.trim() || "";
    if (trimmed === "selection:") { inSelection = true; continue; }
    if (inSelection && trimmed.startsWith("- ") && !trimmed.includes(":")) continue;
    if (inSelection && /^\w/.test(trimmed) && !trimmed.includes("|")) { inSelection = false; continue; }
    if (inSelection) {
      const match = trimmed.match(/^(\w[\w|]*)\s*:\s*(.+)/);
      if (match) {
        const [, field, val] = match;
        const cleanField = field.split("|")[0];
        const modifiers = field.includes("|") ? field.split("|").slice(1) : [];
        const cleanVal = val.replace(/^['"]|['"]$/g, "");
        
        if (backend === "splunk") {
          if (modifiers.includes("contains")) fields.push(`${cleanField}="*${cleanVal}*"`);
          else if (modifiers.includes("endswith")) fields.push(`${cleanField}="*${cleanVal}"`);
          else if (modifiers.includes("startswith")) fields.push(`${cleanField}="${cleanVal}*"`);
          else fields.push(`${cleanField}="${cleanVal}"`);
        } else if (backend === "elastic") {
          if (modifiers.includes("contains")) fields.push(`${cleanField}: *${cleanVal}*`);
          else fields.push(`${cleanField}: "${cleanVal}"`);
        } else if (backend === "sentinel") {
          if (modifiers.includes("contains")) fields.push(`${cleanField} contains "${cleanVal}"`);
          else fields.push(`${cleanField} == "${cleanVal}"`);
        } else {
          if (modifiers.includes("contains")) fields.push(`"${cleanField}" ILIKE '%${cleanVal}%'`);
          else fields.push(`"${cleanField}" = '${cleanVal}'`);
        }
      }
    }
  }

  const condition = fields.join(backend === "sentinel" ? "\n| where " : " AND ");
  
  switch (backend) {
    case "splunk": return `index=* sourcetype=WinEventLog:Security\n${condition}\n| table _time, host, user, ${fields.map(f => f.split("=")[0]).join(", ")}`;
    case "elastic": return `GET /_search\n{\n  "query": {\n    "bool": {\n      "must": [\n        ${fields.map(f => `{ "wildcard": { ${JSON.stringify(f)} } }`).join(",\n        ")}\n      ]\n    }\n  }\n}`;
    case "sentinel": return `SecurityEvent\n| where ${condition}\n| project TimeGenerated, Computer, Account`;
    case "qradar": return `SELECT * FROM events WHERE ${condition} LAST 24 HOURS`;
  }
}

function validateRule(yaml: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!yaml.includes("title:")) errors.push("Missing 'title' field");
  if (!yaml.includes("logsource:")) errors.push("Missing 'logsource' field");
  if (!yaml.includes("detection:")) errors.push("Missing 'detection' field");
  if (!yaml.includes("level:")) warnings.push("Missing 'level' field — recommended");
  if (!yaml.includes("condition:")) errors.push("Missing 'condition' in detection");
  if (!yaml.includes("description:")) warnings.push("Missing 'description' — recommended for documentation");
  return { valid: errors.length === 0, errors, warnings };
}

const SigmaRuleEngine = () => {
  const [yaml, setYaml] = useState("");
  const [backend, setBackend] = useState<Backend>("splunk");
  const [output, setOutput] = useState("");
  const [validation, setValidation] = useState<ReturnType<typeof validateRule> | null>(null);

  const handleConvert = () => {
    const v = validateRule(yaml);
    setValidation(v);
    if (v.valid) {
      setOutput(sigmaToQuery(yaml, backend));
      toast.success(`Converted to ${backend.toUpperCase()}`);
    } else {
      toast.error("Rule has validation errors");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-[1000px] mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">SIGMA Rule Engine</h2>
            <p className="text-[10px] text-muted-foreground/35 mt-0.5">Write, validate, and convert detection rules</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-[9px] h-7" onClick={() => setYaml(SAMPLE_RULE)}>Load Sample</Button>
            {TEMPLATES.map(t => (
              <Button key={t.name} size="sm" variant="ghost" className="text-[9px] h-7" onClick={() => setYaml(t.yaml)}>{t.name}</Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Editor */}
          <div className="space-y-2">
            <div className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">SIGMA YAML</div>
            <Textarea value={yaml} onChange={e => setYaml(e.target.value)} placeholder="Paste or write SIGMA rule..."
              className="min-h-[400px] text-xs font-mono bg-card/20 border-border/[0.08]" />
          </div>

          {/* Output */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Query Output</div>
              <div className="flex items-center gap-2">
                <Select value={backend} onValueChange={v => setBackend(v as Backend)}>
                  <SelectTrigger className="h-7 text-[9px] w-[120px] bg-card/20 border-border/[0.08]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="splunk">Splunk SPL</SelectItem>
                    <SelectItem value="elastic">Elastic KQL</SelectItem>
                    <SelectItem value="sentinel">Sentinel KQL</SelectItem>
                    <SelectItem value="qradar">QRadar AQL</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleConvert} className="text-[9px] h-7"><Play className="h-3 w-3 mr-1" />Convert</Button>
              </div>
            </div>
            <Textarea value={output} readOnly placeholder="Converted query will appear here..."
              className="min-h-[300px] text-xs font-mono bg-card/20 border-border/[0.08] text-emerald-400/80" />
            {output && (
              <Button size="sm" variant="ghost" className="text-[9px] h-6" onClick={() => { navigator.clipboard.writeText(output); toast.success("Copied"); }}>
                <Copy className="h-3 w-3 mr-1" />Copy Query
              </Button>
            )}
          </div>
        </div>

        {/* Validation */}
        {validation && (
          <div className="rounded-lg border border-border/[0.08] bg-card/20 p-4 space-y-2">
            <div className="flex items-center gap-2">
              {validation.valid ? <Check className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-red-400" />}
              <span className="text-[10px] text-foreground/60">{validation.valid ? "Rule is valid" : "Validation failed"}</span>
            </div>
            {validation.errors.map((e, i) => (
              <div key={i} className="text-[10px] text-red-400/70 flex items-center gap-2">
                <AlertTriangle className="h-3 w-3" /> {e}
              </div>
            ))}
            {validation.warnings.map((w, i) => (
              <div key={i} className="text-[10px] text-amber-400/60 flex items-center gap-2">
                <AlertTriangle className="h-3 w-3" /> {w}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SigmaRuleEngine;
