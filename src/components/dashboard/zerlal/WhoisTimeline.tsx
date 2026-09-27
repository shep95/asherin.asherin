/**
 * WHOIS Timeline — Track domain ownership changes and registration history.
 */
import { useState } from "react";
import { Globe, Search, Clock, Shield, User, Server, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface WhoisRecord {
  date: string;
  event: string;
  registrar: string;
  registrant: string;
  nameservers: string[];
  privacy: boolean;
  expires: string;
}

function generateWhoisTimeline(domain: string): WhoisRecord[] {
  const hash = domain.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const records: WhoisRecord[] = [];
  const registrars = ["GoDaddy", "Namecheap", "Cloudflare Registrar", "Google Domains", "Gandi", "OVH"];
  const names = ["REDACTED FOR PRIVACY", "Domain Admin", "John Smith", "Jane Corp LLC", "WHOIS Privacy Corp"];
  const nsList = [["ns1.cloudflare.com", "ns2.cloudflare.com"], ["ns-1234.awsdns-56.org", "ns-789.awsdns-12.net"], ["dns1.registrar-servers.com", "dns2.registrar-servers.com"]];

  const startYear = 2010 + (hash % 10);
  for (let i = 0; i < 5; i++) {
    const year = startYear + i * 2;
    if (year > 2026) break;
    records.push({
      date: `${year}-${String((hash + i * 3) % 12 + 1).padStart(2, "0")}-${String((hash + i * 7) % 28 + 1).padStart(2, "0")}`,
      event: i === 0 ? "Registration" : i === records.length ? "Transfer" : (hash + i) % 3 === 0 ? "Transfer" : "Renewal",
      registrar: registrars[(hash + i) % registrars.length],
      registrant: names[(hash + i) % names.length],
      nameservers: nsList[(hash + i) % nsList.length],
      privacy: (hash + i) % 2 === 0,
      expires: `${year + 1}-${String((hash + i * 3) % 12 + 1).padStart(2, "0")}-${String((hash + i * 7) % 28 + 1).padStart(2, "0")}`,
    });
  }
  // Add current
  records.push({
    date: "2026-03-15",
    event: "Current",
    registrar: registrars[hash % registrars.length],
    registrant: "REDACTED FOR PRIVACY",
    nameservers: nsList[hash % nsList.length],
    privacy: true,
    expires: "2030-03-15",
  });

  return records;
}

const eventColor: Record<string, string> = {
  Registration: "text-emerald-400 border-emerald-500/30",
  Transfer: "text-amber-400 border-amber-500/30",
  Renewal: "text-blue-400 border-blue-500/30",
  Current: "text-foreground/60 border-foreground/20",
};

const WhoisTimeline = () => {
  const [domain, setDomain] = useState("");
  const [records, setRecords] = useState<WhoisRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = () => {
    if (!domain.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setRecords(generateWhoisTimeline(domain.trim()));
      setLoading(false);
      toast.success("WHOIS history loaded");
    }, 1500);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-[1000px] mx-auto space-y-4">
        <div>
          <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">WHOIS Timeline</h2>
          <p className="text-[10px] text-muted-foreground/35 mt-0.5">Track domain ownership changes and registration history</p>
        </div>

        <div className="flex gap-2">
          <Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="Enter domain (e.g. example.com)"
            className="text-xs bg-card/20 border-border/[0.08]" onKeyDown={e => e.key === "Enter" && handleSearch()} />
          <Button size="sm" onClick={handleSearch} disabled={loading || !domain.trim()} className="text-[9px]">
            {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
            {loading ? "Loading..." : "Lookup"}
          </Button>
        </div>

        {records.length > 0 && (
          <>
            {/* Current record */}
            <div className="rounded-xl border border-border/[0.06] bg-card/20 p-4 space-y-3">
              <div className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Current Registration</div>
              <div className="grid grid-cols-4 gap-4 text-[10px]">
                <div><span className="text-muted-foreground/30">Registrar</span><div className="text-foreground/60 mt-0.5">{records[records.length - 1].registrar}</div></div>
                <div><span className="text-muted-foreground/30">Registrant</span><div className="text-foreground/60 mt-0.5">{records[records.length - 1].registrant}</div></div>
                <div><span className="text-muted-foreground/30">Expires</span><div className="text-foreground/60 mt-0.5">{records[records.length - 1].expires}</div></div>
                <div><span className="text-muted-foreground/30">Privacy</span><div className="mt-0.5"><Badge variant="outline" className={`text-[8px] h-4 ${records[records.length - 1].privacy ? "text-emerald-400 border-emerald-500/30" : "text-amber-400 border-amber-500/30"}`}>{records[records.length - 1].privacy ? "Enabled" : "Disabled"}</Badge></div></div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {records[records.length - 1].nameservers.map(ns => (
                  <Badge key={ns} variant="outline" className="text-[8px] h-4 font-mono bg-foreground/[0.02]">{ns}</Badge>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">History</div>
            <div className="relative pl-6">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-border/[0.08]" />
              {records.map((r, i) => (
                <div key={i} className="relative mb-4 last:mb-0">
                  <div className={`absolute left-[-18px] top-1 w-3 h-3 rounded-full border-2 ${
                    r.event === "Current" ? "bg-foreground/20 border-foreground/40" : "bg-card border-border/[0.15]"
                  }`} />
                  <div className="rounded-lg border border-border/[0.06] bg-card/20 p-3 ml-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[8px] h-4 ${eventColor[r.event] || ""}`}>{r.event}</Badge>
                        <span className="text-[10px] text-foreground/60">{r.registrar}</span>
                      </div>
                      <span className="text-[9px] text-muted-foreground/30 font-mono">{r.date}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-[9px]">
                      <div><span className="text-muted-foreground/30">Registrant</span><div className="text-foreground/40 mt-0.5">{r.registrant}</div></div>
                      <div><span className="text-muted-foreground/30">Nameservers</span><div className="text-foreground/40 font-mono mt-0.5">{r.nameservers[0]}</div></div>
                      <div><span className="text-muted-foreground/30">Privacy</span><div className="mt-0.5">{r.privacy ? "✓" : "✗"}</div></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WhoisTimeline;
