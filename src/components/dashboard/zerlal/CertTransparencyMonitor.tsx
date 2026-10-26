/**
 * Certificate Transparency Monitor — offline in the local edition.
 *
 * Watching CT logs for rogue certificates means querying a remote CT index
 * (crt.sh, Google's logs). the hosted build did that server-side. a browser
 * tab cannot, and the earlier build fabricated certs — including a fake
 * "typosquat" and a fake "rogue CA" — from the domain string and drew them as
 * real log hits. that fabrication has been removed.
 */
import { Award } from "lucide-react";
import KernelOfflineNotice from "./KernelOfflineNotice";

const CertTransparencyMonitor = () => (
  <div className="flex-1 overflow-y-auto">
    <div className="p-6 max-w-[1000px] mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Award className="h-4 w-4 text-foreground/50" />
        <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 lowercase">certificate transparency monitor</h2>
      </div>
      <KernelOfflineNotice
        capability="certificate transparency monitoring"
        reason="reading ct logs for a domain means querying a remote log index, which this device cannot reach on your behalf. this leg ran on the kernel; no logs were read."
      />
    </div>
  </div>
);

export default CertTransparencyMonitor;
