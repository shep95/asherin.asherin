/**
 * WHOIS Timeline — offline in the local edition.
 *
 * Registration history comes from a remote whois / rdap server. the hosted
 * build queried it server-side. a browser tab cannot, and the earlier build
 * fabricated a registrar/transfer history from a hash of the domain string
 * and drew it as a real record. that fabrication has been removed.
 */
import { Clock } from "lucide-react";
import KernelOfflineNotice from "./KernelOfflineNotice";

const WhoisTimeline = () => (
  <div className="flex-1 overflow-y-auto">
    <div className="p-6 max-w-[1000px] mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-foreground/50" />
        <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 lowercase">whois timeline</h2>
      </div>
      <KernelOfflineNotice
        capability="whois history lookup"
        reason="registration history comes from a remote whois or rdap server this device cannot query for you. this leg ran on the kernel; no records were pulled."
      />
    </div>
  </div>
);

export default WhoisTimeline;
