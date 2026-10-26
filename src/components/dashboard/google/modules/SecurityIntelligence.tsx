import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AlertTriangle, Share2, Shield,
  CheckCircle2, XCircle, RefreshCw, FileText,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import DeepDivePanel from "../intel/DeepDivePanel";
import { gmailObservations, driveObservations, surface } from "@/lib/cloudIntel/googleObservations";
import { CONNECT_UNAVAILABLE, describeFailure } from "../offline";

// bulwark — security mail and shared files from the connected account.

const SecurityIntelligence = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [securityEmails, setSecurityEmails] = useState<any[]>([]);
  const [sharedFiles, setSharedFiles] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch budgets are sized for inference, not for the list beneath. Fifteen
      // messages cannot support a baseline: the volume, rhythm and dormancy
      // detectors all need enough history to distinguish a change from noise,
      // and every one of them stays silent on a thin sample rather than guess.
      const [emailData, fileData] = await Promise.all([
        fetchGoogleData("gmail_inbox", {
          maxResults: 200,
          q: "subject:(security alert OR password OR breach OR suspicious OR verification OR unauthorized) OR from:(security OR noreply)",
        }),
        fetchGoogleData("drive_files", { pageSize: 200 }),
      ]);
      setSecurityEmails(emailData.messages || []);
      setSharedFiles((fileData.files || []).filter((f: any) => f.shared));
    } catch (err) {
      setError(describeFailure(err, "google data organ"));
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => {
    if (isConnected) void loadData();
  }, [isConnected, loadData]);

  // Two distinct surfaces: who is sending security mail, and who holds shared
  // files. They are analysed separately because a pattern in one says nothing
  // about the other, and merging them would blur both baselines.
  const alertObs = useMemo(() => gmailObservations(securityEmails), [securityEmails]);
  const shareObs = useMemo(() => driveObservations(sharedFiles), [sharedFiles]);

  const alertSpec = useMemo(
    () =>
      surface("security alerts", isConnected, {
        unit: "alert",
        unitPlural: "alerts",
        entityNoun: "sender",
        entityNounPlural: "senders",
        expectation:
          "security notifications arrive at a low, steady rate from a small set of known providers.",
        reviewAction: "open the alert and confirm the sign-in or change it describes was yours.",
      }),
    [isConnected]
  );

  const shareSpec = useMemo(
    () =>
      surface("shared exposure", isConnected, {
        unit: "shared file",
        unitPlural: "shared files",
        entityNoun: "owner",
        entityNounPlural: "owners",
        expectation: "sharing is deliberate, recent, and concentrated among people you work with.",
        magnitudeNoun: "file size",
        formatMagnitude: (n: number) =>
          n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`,
        reviewAction: "review who this file is shared with and revoke access that is no longer needed.",
      }),
    [isConnected]
  );


  const hasLive = securityEmails.length > 0 || sharedFiles.length > 0;
  const unreadSecurity = securityEmails.filter((e) => e.isUnread).length;

  return (
    <div className="space-y-6">
      {/* Security Score */}
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
          <Shield className="h-7 w-7 text-foreground/70" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-light tracking-wide text-foreground">exposure & threat</h3>
            {isConnected && (
              <button type="button" onClick={() => void loadData()} disabled={loading} className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
                read again
              </button>
            )}
          </div>
          {!isConnected && (
            <p className="text-[11px] font-extralight leading-relaxed text-muted-foreground">{CONNECT_UNAVAILABLE}</p>
          )}
          {hasLive && (
            <div className="flex flex-wrap items-center gap-2">
              {unreadSecurity > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400">{unreadSecurity} unread alerts</span>
              )}
              {sharedFiles.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400">{sharedFiles.length} shared files</span>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-border/25 bg-card/20 px-4 py-3 text-[11px] font-extralight text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {/* Inference precedes inventory: the lists below are the evidence, these
          panels are the reading of it. Both render unconditionally so a surface
          that returned nothing still states what its silence means. */}
      <DeepDivePanel spec={alertSpec} observations={alertObs} />
      <DeepDivePanel spec={shareSpec} observations={shareObs} />


      {/* Security Alerts from Email */}
      {securityEmails.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" aria-hidden /> mail matching security vocabulary
          </h3>
          <div className="space-y-2">
            {securityEmails.map((e) => (
              <div key={e.id} className="flex items-start gap-2 py-1.5 rounded-lg bg-foreground/5 px-3">
                {e.isUnread ? (
                  <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-foreground/30 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-[11px] font-light text-foreground truncate block">{e.subject || "(no subject)"}</span>
                  <span className="text-[10px] text-muted-foreground/50">{e.from?.replace(/<.*>/, "").trim()}</span>
                </div>
                <span className="text-[10px] text-muted-foreground/40 shrink-0">
                  {e.date ? new Date(e.date).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared Files Audit */}
      {sharedFiles.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Share2 className="h-4 w-4" aria-hidden /> shared files
          </h3>
          <p className="text-[10px] font-extralight text-muted-foreground">
            {sharedFiles.length} files carry a share — each one is a standing grant until revoked
          </p>
          <div className="space-y-1.5">
            {sharedFiles.map((f) => (
              <div key={f.id} className="flex items-center justify-between py-1.5 border-b border-border/10 last:border-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileText className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  <span className="text-xs font-light text-foreground truncate">{f.name}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">shared</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasLive && isConnected && !loading && !error && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center space-y-3">
          <Shield className="h-10 w-10 text-muted-foreground/20 mx-auto" aria-hidden />
          <p className="text-sm font-extralight text-muted-foreground/50">
            no mail matched the security vocabulary and no file carries a share, in the sample read. that is the sample, not a clean bill.
          </p>
        </div>
      )}
    </div>
  );
};

export default SecurityIntelligence;
