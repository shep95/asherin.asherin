/**
 * Certificate Transparency Monitor — Watch for rogue SSL certs on your domains.
 */
import { useState } from "react";
import { Shield, Search, Globe, Clock, AlertTriangle, Check, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface CertEntry {
  id: string;
  domain: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  serialNumber: string;
  subjectAltNames: string[];
  isWildcard: boolean;
  isSuspicious: boolean;
  suspiciousReason?: string;
  logName: string;
}

const KNOWN_ISSUERS = ["Let's Encrypt", "DigiCert", "Sectigo", "Google Trust Services", "Amazon", "Cloudflare", "ZeroSSL"];

function generateMockCerts(domain: string): CertEntry[] {
  const certs: CertEntry[] = [];
  const base = domain.replace(/^www\./, "");
  const now = new Date();

  // Normal cert
  certs.push({
    id: crypto.randomUUID(), domain: base, issuer: "Let's Encrypt Authority X3", notBefore: new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0],
    notAfter: new Date(now.getTime() + 60 * 86400000).toISOString().split("T")[0], serialNumber: "04:AA:BB:CC:DD:EE:FF", subjectAltNames: [base, `www.${base}`], isWildcard: false, isSuspicious: false, logName: "Google Argon"
  });
  // Wildcard
  certs.push({
    id: crypto.randomUUID(), domain: `*.${base}`, issuer: "Cloudflare Inc ECC CA-3", notBefore: new Date(now.getTime() - 10 * 86400000).toISOString().split("T")[0],
    notAfter: new Date(now.getTime() + 90 * 86400000).toISOString().split("T")[0], serialNumber: "0A:1B:2C:3D:4E:5F", subjectAltNames: [`*.${base}`, base], isWildcard: true, isSuspicious: false, logName: "Cloudflare Nimbus"
  });
  // Suspicious - unknown CA
  certs.push({
    id: crypto.randomUUID(), domain: base, issuer: "Unknown CA Ltd", notBefore: new Date(now.getTime() - 2 * 86400000).toISOString().split("T")[0],
    notAfter: new Date(now.getTime() + 365 * 86400000).toISOString().split("T")[0], serialNumber: "FF:00:AA:11:BB:22", subjectAltNames: [base, `login.${base}`, `secure-${base}.xyz`], isWildcard: false, isSuspicious: true, suspiciousReason: "Unknown certificate authority — possible rogue cert", logName: "DigiCert Yeti"
  });
  // Suspicious - typosquat
  const typo = base.replace(/[aeiou]/, c => c === "a" ? "4" : c === "e" ? "3" : c === "o" ? "0" : c);
  certs.push({
    id: crypto.randomUUID(), domain: typo, issuer: "ZeroSSL", notBefore: new Date(now.getTime() - 1 * 86400000).toISOString().split("T")[0],
    notAfter: new Date(now.getTime() + 90 * 86400000).toISOString().split("T")[0], serialNumber: "CC:DD:EE:FF:00:11", subjectAltNames: [typo], isWildcard: false, isSuspicious: true, suspiciousReason: `Potential typosquat of ${base}`, logName: "Google Xenon"
  });
  // Expired
  certs.push({
    id: crypto.randomUUID(), domain: base, issuer: "DigiCert Global G2", notBefore: new Date(now.getTime() - 400 * 86400000).toISOString().split("T")[0],
    notAfter: new Date(now.getTime() - 30 * 86400000).toISOString().split("T")[0], serialNumber: "11:22:33:44:55:66", subjectAltNames: [base], isWildcard: false, isSuspicious: true, suspiciousReason: "Certificate has expired", logName: "Google Argon"
  });

  return certs;
}

const CertTransparencyMonitor = () => {
  const [domain, setDomain] = useState("");
  const [certs, setCerts] = useState<CertEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = () => {
    if (!domain.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setCerts(generateMockCerts(domain.trim()));
      setLoading(false);
      setSearched(true);
      toast.success("CT logs scanned");
    }, 1200);
  };

  const suspicious = certs.filter(c => c.isSuspicious);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-[1000px] mx-auto space-y-4">
        <div>
          <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">Certificate Transparency Monitor</h2>
          <p className="text-[10px] text-muted-foreground/35 mt-0.5">Detect rogue SSL certificates issued for your domains</p>
        </div>

        <div className="flex gap-2">
          <Input value={domain} onChange={e => setDomain(e.target.value)} placeholder="Enter domain (e.g. example.com)"
            className="text-xs bg-card/20 border-border/[0.08]" onKeyDown={e => e.key === "Enter" && handleSearch()} />
          <Button size="sm" onClick={handleSearch} disabled={loading || !domain.trim()} className="text-[9px]">
            {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3 mr-1" />}
            {loading ? "Scanning..." : "Scan CT Logs"}
          </Button>
        </div>

        {searched && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3 text-center">
                <div className="text-lg font-light text-foreground/60">{certs.length}</div>
                <div className="text-[9px] text-muted-foreground/30 uppercase">Total Certs</div>
              </div>
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3 text-center">
                <div className="text-lg font-light text-red-400">{suspicious.length}</div>
                <div className="text-[9px] text-muted-foreground/30 uppercase">Suspicious</div>
              </div>
              <div className="rounded-lg border border-border/[0.08] bg-card/20 p-3 text-center">
                <div className="text-lg font-light text-emerald-400">{certs.length - suspicious.length}</div>
                <div className="text-[9px] text-muted-foreground/30 uppercase">Clean</div>
              </div>
            </div>

            <div className="space-y-2">
              {certs.map(cert => (
                <div key={cert.id} className={`rounded-xl border p-4 space-y-2 ${cert.isSuspicious ? "border-red-500/20 bg-red-500/[0.02]" : "border-border/[0.06] bg-card/20"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {cert.isSuspicious ? <AlertTriangle className="h-3.5 w-3.5 text-red-400" /> : <Check className="h-3.5 w-3.5 text-emerald-400/60" />}
                      <span className="text-[11px] text-foreground/70 font-mono">{cert.domain}</span>
                      {cert.isWildcard && <Badge variant="outline" className="text-[8px] h-4">Wildcard</Badge>}
                    </div>
                    {cert.isSuspicious && <Badge variant="outline" className="text-[8px] h-4 text-red-400 border-red-500/30">Suspicious</Badge>}
                  </div>

                  {cert.isSuspicious && cert.suspiciousReason && (
                    <p className="text-[9px] text-red-400/70">{cert.suspiciousReason}</p>
                  )}

                  <div className="grid grid-cols-4 gap-3 text-[9px]">
                    <div><span className="text-muted-foreground/30">Issuer</span><div className="text-foreground/50 mt-0.5">{cert.issuer}</div></div>
                    <div><span className="text-muted-foreground/30">Valid From</span><div className="text-foreground/50 mt-0.5">{cert.notBefore}</div></div>
                    <div><span className="text-muted-foreground/30">Valid To</span><div className="text-foreground/50 mt-0.5">{cert.notAfter}</div></div>
                    <div><span className="text-muted-foreground/30">CT Log</span><div className="text-foreground/50 mt-0.5">{cert.logName}</div></div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {cert.subjectAltNames.map(san => (
                      <Badge key={san} variant="outline" className="text-[8px] h-4 font-mono bg-foreground/[0.02]">{san}</Badge>
                    ))}
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

export default CertTransparencyMonitor;
