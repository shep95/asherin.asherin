/**
 * Reports — honest in the local edition.
 *
 * The hosted build rendered executive / compliance / benchmark pdfs and mailed
 * scheduled digests from a server. the earlier screen listed five report types
 * with pdf/csv/json buttons that did nothing and two "scheduled reports" mailed
 * to hard-coded aureon.io addresses — none of which exist on this device. that
 * has been removed. what does work: every project exports a full plain-text
 * findings report from the project view (preview, copy, download .txt), built
 * entirely on this device.
 */
import { FileText } from "lucide-react";
import KernelOfflineNotice from "./KernelOfflineNotice";

const ReportsScreen = () => (
  <div className="flex-1 overflow-y-auto">
    <div className="p-6 max-w-[900px] mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-foreground/50" />
        <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 lowercase">reports</h2>
      </div>
      <KernelOfflineNotice
        capability="report rendering and scheduled digests"
        reason="pdf rendering, benchmarks and emailed schedules ran on a server. there is no mailer or scheduler on this device."
        footer="open a project and use preview / copy / download .txt — the full findings report is built on this device from your own scan data."
      />
    </div>
  </div>
);

export default ReportsScreen;
