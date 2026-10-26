/**
 * New Scan — honest in the local edition.
 *
 * The hosted build ran a multi-section AI repo audit as a server organ: it
 * chunked the source, called a model with cooldowns, deduplicated, scored a
 * risk grade and wrote findings to a database. none of that staging exists on
 * this device. the earlier modal still collected a project name, a file or a
 * repo url and a profile across three steps, gated on an api key, then either
 * failed mid-scan with "kernel offline" or — on the "run in background & email
 * me" path — told the operator the scan was "queued in cloud" and would be
 * "emailed", which was untrue: no worker and no mail exist locally.
 *
 * so the modal now says plainly what can and cannot run here, and points at
 * the tools that read real input on this device: the code scanner (static
 * analysis of pasted or uploaded source) and the log correlator.
 */
import { Shield, X, Code2, ScrollText, Smartphone } from "lucide-react";

interface ScanModalProps {
  open: boolean;
  onClose: () => void;
  onScanComplete: () => void;
  onScanStarted?: (projectId: string) => void;
}

const ScanModal = ({ open, onClose }: ScanModalProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border/[0.08] bg-card/95 backdrop-blur-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/[0.06]">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-foreground/50" />
            <span className="text-[11px] font-light text-foreground/80 tracking-wide lowercase">new scan</span>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground/30 hover:text-foreground/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[11px] text-foreground/60 leading-relaxed lowercase">
            the full repo audit ran on the asherin kernel — it chunked your source, called a model server-side
            and wrote graded findings to a database. that staging is not part of the local edition, so there is
            no honest scan to start here.
          </p>
          <p className="text-[10px] text-muted-foreground/45 leading-relaxed lowercase">
            what does run on this device, reading real input and leaving nothing:
          </p>
          <div className="space-y-2">
            <div className="flex items-start gap-2.5 rounded-lg border border-border/[0.06] bg-foreground/[0.02] p-3">
              <Code2 className="h-3.5 w-3.5 text-foreground/40 mt-0.5 shrink-0" />
              <p className="text-[10px] text-muted-foreground/50 leading-relaxed lowercase">
                <span className="text-foreground/60">code scanner</span> — paste or open source and it reads it for
                known-unsafe patterns on this device.
              </p>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border/[0.06] bg-foreground/[0.02] p-3">
              <ScrollText className="h-3.5 w-3.5 text-foreground/40 mt-0.5 shrink-0" />
              <p className="text-[10px] text-muted-foreground/50 leading-relaxed lowercase">
                <span className="text-foreground/60">log correlator</span> — paste logs and it flags brute force,
                lateral movement and anomalies locally.
              </p>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-border/[0.06] bg-foreground/[0.02] p-3">
              <Smartphone className="h-3.5 w-3.5 text-foreground/40 mt-0.5 shrink-0" />
              <p className="text-[10px] text-muted-foreground/50 leading-relaxed lowercase">
                <span className="text-foreground/60">device security</span> — checks this browser and device from
                what a page is allowed to read.
              </p>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground/35 leading-relaxed lowercase">
            open any of them from the section list under intelligence modules.
          </p>
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t border-border/[0.06]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-foreground/[0.08] text-[10px] text-foreground/60 hover:bg-foreground/[0.12] transition-colors lowercase"
          >
            close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScanModal;
