/**
 * STIX/TAXII Threat Intel Feed — Browse structured threat intelligence objects.
 * Simulates STIX 2.1 bundle browsing with MITRE ATT&CK enrichment.
 */
import { useState } from "react";
import { Crosshair, Search, Shield, Globe, Clock, Tag, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface StixObject {
  id: string;
  type: string;
  name: string;
  description: string;
  created: string;
  modified: string;
  labels: string[];
  confidence: number;
  killChain?: string;
  mitre?: string;
}

const FEED_DATA: StixObject[] = [
  { id: "indicator--a1b2c3", type: "indicator", name: "APT29 C2 Domain", description: "Command and control domain associated with Cozy Bear operations targeting government entities", created: "2026-04-10", modified: "2026-04-14", labels: ["malicious-activity", "apt"], confidence: 92, killChain: "Command and Control", mitre: "T1071.001" },
  { id: "malware--d4e5f6", type: "malware", name: "SUNBURST Variant", description: "Modified SolarWinds backdoor with enhanced anti-analysis capabilities and new C2 protocol", created: "2026-03-22", modified: "2026-04-12", labels: ["backdoor", "trojan"], confidence: 88, killChain: "Installation", mitre: "T1195.002" },
  { id: "attack-pattern--g7h8i9", type: "attack-pattern", name: "Living Off The Land (LOLBins)", description: "Abuse of legitimate Windows binaries for code execution and defense evasion", created: "2026-02-15", modified: "2026-04-10", labels: ["defense-evasion"], confidence: 95, killChain: "Defense Evasion", mitre: "T1218" },
  { id: "threat-actor--j1k2l3", type: "threat-actor", name: "Volt Typhoon", description: "Chinese state-sponsored group targeting critical infrastructure via SOHO routers and VPN appliances", created: "2026-01-08", modified: "2026-04-13", labels: ["nation-state", "espionage"], confidence: 90, killChain: "Reconnaissance", mitre: "T1590" },
  { id: "vulnerability--m4n5o6", type: "vulnerability", name: "CVE-2026-21345 (Hypothetical)", description: "Remote code execution in widely-used web framework via deserialization flaw", created: "2026-04-01", modified: "2026-04-14", labels: ["rce", "critical"], confidence: 97, killChain: "Exploitation", mitre: "T1190" },
  { id: "indicator--p7q8r9", type: "indicator", name: "Lazarus Group Crypto Wallet", description: "Cryptocurrency wallet addresses linked to DPRK-attributed theft operations", created: "2026-03-18", modified: "2026-04-11", labels: ["financial", "apt"], confidence: 85, killChain: "Actions on Objectives", mitre: "T1657" },
  { id: "campaign--s1t2u3", type: "campaign", name: "Operation Midnight Eclipse", description: "Multi-stage espionage campaign targeting aerospace and defense sectors across NATO allies", created: "2026-02-28", modified: "2026-04-09", labels: ["espionage", "targeted"], confidence: 78, killChain: "Weaponization", mitre: "T1587.001" },
  { id: "tool--v4w5x6", type: "tool", name: "Cobalt Strike 5.x", description: "Commercial adversary simulation framework widely abused by threat actors for post-exploitation", created: "2026-01-15", modified: "2026-04-08", labels: ["post-exploitation", "c2"], confidence: 99, killChain: "Command and Control", mitre: "T1219" },
  { id: "malware--y7z8a9", type: "malware", name: "BlackCat/ALPHV Ransomware", description: "Rust-based ransomware-as-a-service with cross-platform capabilities and triple extortion", created: "2026-03-05", modified: "2026-04-13", labels: ["ransomware", "raas"], confidence: 94, killChain: "Actions on Objectives", mitre: "T1486" },
  { id: "indicator--b1c2d3", type: "indicator", name: "Credential Phishing Kit (EvilProxy)", description: "Adversary-in-the-middle phishing kit capable of bypassing MFA via session token theft", created: "2026-04-02", modified: "2026-04-14", labels: ["phishing", "credential-theft"], confidence: 91, killChain: "Delivery", mitre: "T1557" },
];

const typeColor: Record<string, string> = {
  indicator: "text-amber-400 border-amber-500/30",
  malware: "text-red-400 border-red-500/30",
  "attack-pattern": "text-purple-400 border-purple-500/30",
  "threat-actor": "text-orange-400 border-orange-500/30",
  vulnerability: "text-red-400 border-red-500/30",
  campaign: "text-blue-400 border-blue-500/30",
  tool: "text-cyan-400 border-cyan-500/30",
};

const StixTaxiiFeed = () => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const types = ["all", ...new Set(FEED_DATA.map(o => o.type))];
  const filtered = FEED_DATA.filter(o => {
    if (typeFilter !== "all" && o.type !== typeFilter) return false;
    if (search && !o.name.toLowerCase().includes(search.toLowerCase()) && !o.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-[1000px] mx-auto space-y-4">
        <div>
          <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">Threat Intelligence Feed</h2>
          <p className="text-[10px] text-muted-foreground/35 mt-0.5">STIX 2.1 structured threat objects with MITRE ATT&CK enrichment</p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/30" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search indicators, malware, actors..."
              className="pl-8 text-xs bg-card/20 border-border/[0.08] h-8" />
          </div>
          <div className="flex gap-1">
            {types.map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded text-[9px] transition-colors ${typeFilter === t ? "bg-foreground/[0.08] text-foreground/80" : "text-muted-foreground/40 hover:text-foreground/60"}`}>
                {t === "all" ? "All" : t.replace("-", " ")}
              </button>
            ))}
          </div>
        </div>

        <div className="text-[9px] text-muted-foreground/25">{filtered.length} objects</div>

        <div className="space-y-2">
          {filtered.map(obj => (
            <div key={obj.id} className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm">
              <button onClick={() => setExpanded(expanded === obj.id ? null : obj.id)}
                className="w-full p-4 flex items-center gap-3 text-left hover:bg-foreground/[0.01] transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-[8px] h-4 ${typeColor[obj.type] || ""}`}>{obj.type}</Badge>
                    <span className="text-[11px] text-foreground/70">{obj.name}</span>
                    <span className="text-[9px] text-muted-foreground/20 font-mono">{obj.confidence}%</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/40 mt-1 line-clamp-1">{obj.description}</p>
                </div>
                {expanded === obj.id ? <ChevronUp className="h-3 w-3 text-muted-foreground/20" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/20" />}
              </button>

              {expanded === obj.id && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/[0.04]">
                  <p className="text-[10px] text-foreground/50 mt-3">{obj.description}</p>
                  <div className="grid grid-cols-4 gap-3">
                    <div><div className="text-[8px] text-muted-foreground/30 uppercase">STIX ID</div><div className="text-[9px] text-foreground/40 font-mono">{obj.id}</div></div>
                    <div><div className="text-[8px] text-muted-foreground/30 uppercase">Kill Chain</div><div className="text-[9px] text-foreground/40">{obj.killChain}</div></div>
                    <div><div className="text-[8px] text-muted-foreground/30 uppercase">MITRE ATT&CK</div><div className="text-[9px] text-foreground/40 font-mono">{obj.mitre}</div></div>
                    <div><div className="text-[8px] text-muted-foreground/30 uppercase">Modified</div><div className="text-[9px] text-foreground/40">{obj.modified}</div></div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {obj.labels.map(l => (
                      <Badge key={l} variant="outline" className="text-[8px] h-4 bg-foreground/[0.02]">{l}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StixTaxiiFeed;
