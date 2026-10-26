/**
 * Tor / VPN Exit Node Checker — offline in the local edition.
 *
 * Deciding whether an ip is a tor exit, vpn endpoint or datacenter address
 * needs a remote reputation / exit-list index. the hosted build queried it
 * server-side. a browser tab cannot, and the earlier build fabricated the
 * verdict, country, asn and risk score from a hash of the ip string and drew
 * them as a real check. that fabrication has been removed.
 */
import { Eye } from "lucide-react";
import KernelOfflineNotice from "./KernelOfflineNotice";

const TorExitNodeChecker = () => (
  <div className="flex-1 overflow-y-auto">
    <div className="p-6 max-w-[1000px] mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-foreground/50" />
        <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 lowercase">tor / vpn exit node checker</h2>
      </div>
      <KernelOfflineNotice
        capability="tor / vpn exit node lookup"
        reason="classifying an ip needs a remote exit-list and reputation index this device cannot query for you. this leg ran on the kernel; no address was checked."
      />
    </div>
  </div>
);

export default TorExitNodeChecker;
