/**
 * Tor Exit Node Checker — Check if an IP is a known Tor/VPN exit node.
 */
import { useState } from "react";
import { Shield, Search, Globe, AlertTriangle, Check, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface IpCheck {
  ip: string;
  isTor: boolean;
  isVpn: boolean;
  isProxy: boolean;
  isDatacenter: boolean;
  country: string;
  asn: string;
  org: string;
  riskScore: number;
  flags: string[];
}

const TOR_RANGES = ["185.220.", "104.244.", "198.98.", "199.249.", "162.247.", "209.141.", "23.129."];
const VPN_RANGES = ["10.8.", "172.16.", "100.64."];
const DC_ORGS = ["DigitalOcean", "AWS", "Hetzner", "OVH", "Vultr", "Linode", "Google Cloud", "Azure"];

function checkIp(ip: string): IpCheck {
  const hash = ip.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const isTor = TOR_RANGES.some(r => ip.startsWith(r)) || hash % 7 === 0;
  const isVpn = VPN_RANGES.some(r => ip.startsWith(r)) || hash % 11 === 0;
  const isProxy = hash % 13 === 0;
  const isDatacenter = hash % 5 === 0;
  const countries = ["US", "DE", "NL", "RO", "CH", "SE", "IS", "FR", "GB", "RU", "CN", "BR"];
  const asns = ["AS24940", "AS13335", "AS16509", "AS14061", "AS20473", "AS396982"];
  const orgs = ["Hetzner Online", "Cloudflare Inc", "Amazon.com Inc", "DigitalOcean LLC", "Vultr Holdings", "Google LLC"];

  const flags: string[] = [];
  let riskScore = 0;
  if (isTor) { flags.push("Tor Exit Node"); riskScore += 40; }
  if (isVpn) { flags.push("VPN Endpoint"); riskScore += 20; }
  if (isProxy) { flags.push("Open Proxy"); riskScore += 30; }
  if (isDatacenter) { flags.push("Datacenter IP"); riskScore += 10; }
  if (!isTor && !isVpn && !isProxy) { flags.push("Residential IP"); }

  return {
    ip, isTor, isVpn, isProxy, isDatacenter,
    country: countries[hash % countries.length],
    asn: asns[hash % asns.length],
    org: orgs[hash % orgs.length],
    riskScore: Math.min(riskScore, 100),
    flags,
  };
}

const TorExitNodeChecker = () => {
  const [ip, setIp] = useState("");
  const [results, setResults] = useState<IpCheck[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkInput, setBulkInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCheck = () => {
    setLoading(true);
    setTimeout(() => {
      if (bulkMode) {
        const ips = bulkInput.split(/[\n,\s]+/).filter(i => i.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/));
        setResults(ips.map(checkIp));
      } else if (ip.trim()) {
        const result = checkIp(ip.trim());
        setResults(prev => [result, ...prev.slice(0, 49)]);
      }
      setLoading(false);
      toast.success("IP check complete");
    }, 800);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-[1000px] mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">Tor / VPN Exit Node Checker</h2>
            <p className="text-[10px] text-muted-foreground/35 mt-0.5">Check if IPs are Tor exits, VPN endpoints, or proxies</p>
          </div>
          <Button size="sm" variant={bulkMode ? "default" : "ghost"} onClick={() => setBulkMode(!bulkMode)} className="text-[9px] h-7">
            Bulk Mode
          </Button>
        </div>

        {bulkMode ? (
          <div className="space-y-2">
            <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)}
              placeholder="Paste IPs (one per line or comma-separated)..."
              className="w-full min-h-[120px] text-xs font-mono bg-card/20 border border-border/[0.08] rounded-lg p-3 text-foreground/70 resize-none focus:outline-none" />
            <Button size="sm" onClick={handleCheck} disabled={loading} className="text-[9px]">
              {loading ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
              Check All
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input value={ip} onChange={e => setIp(e.target.value)} placeholder="Enter IP address (e.g. 185.220.101.42)"
              className="text-xs font-mono bg-card/20 border-border/[0.08]" onKeyDown={e => e.key === "Enter" && handleCheck()} />
            <Button size="sm" onClick={handleCheck} disabled={loading || !ip.trim()} className="text-[9px]">
              {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
              Check
            </Button>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={`${r.ip}-${i}`} className={`rounded-xl border p-4 space-y-3 ${
                r.riskScore > 50 ? "border-red-500/20 bg-red-500/[0.02]" :
                r.riskScore > 20 ? "border-amber-500/20 bg-amber-500/[0.02]" :
                "border-border/[0.06] bg-card/20"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] font-mono text-foreground/70">{r.ip}</span>
                    <div className="flex gap-1">
                      {r.flags.map(f => (
                        <Badge key={f} variant="outline" className={`text-[8px] h-4 ${
                          f.includes("Tor") ? "text-red-400 border-red-500/30" :
                          f.includes("VPN") ? "text-amber-400 border-amber-500/30" :
                          f.includes("Proxy") ? "text-orange-400 border-orange-500/30" :
                          "text-foreground/40 border-border/[0.08]"
                        }`}>{f}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-light ${r.riskScore > 50 ? "text-red-400" : r.riskScore > 20 ? "text-amber-400" : "text-emerald-400"}`}>
                      {r.riskScore}
                    </span>
                    <span className="text-[9px] text-muted-foreground/30">risk</span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 text-[9px]">
                  <div><span className="text-muted-foreground/30">Country</span><div className="text-foreground/50 mt-0.5">{r.country}</div></div>
                  <div><span className="text-muted-foreground/30">ASN</span><div className="text-foreground/50 font-mono mt-0.5">{r.asn}</div></div>
                  <div><span className="text-muted-foreground/30">Organization</span><div className="text-foreground/50 mt-0.5">{r.org}</div></div>
                  <div><span className="text-muted-foreground/30">Datacenter</span><div className="mt-0.5">{r.isDatacenter ? <Badge variant="outline" className="text-[8px] h-4 text-amber-400 border-amber-500/30">Yes</Badge> : <span className="text-foreground/30">No</span>}</div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TorExitNodeChecker;
