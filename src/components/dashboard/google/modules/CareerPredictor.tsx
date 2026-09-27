import { useState, useEffect } from "react";
import {
  Briefcase, TrendingUp, Zap, AlertTriangle, GraduationCap, Target, RefreshCw,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";

const CareerPredictor = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [recruiterEmails, setRecruiterEmails] = useState<any[]>([]);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [emailData, fileData] = await Promise.all([
        fetchGoogleData("gmail_inbox", {
          maxResults: 20,
          q: "subject:(recruiter OR hiring OR job opportunity OR interview OR offer letter OR career) OR from:(recruiter OR talent OR hiring)",
        }),
        fetchGoogleData("drive_files", {
          pageSize: 10,
          q: "name contains 'resume' or name contains 'cv' or name contains 'cover letter'",
        }),
      ]);
      setRecruiterEmails(emailData.messages || []);
      setDriveFiles(fileData.files || []);
    } catch (err) {
      console.error("Failed to fetch career data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected]);

  const hasLive = recruiterEmails.length > 0 || driveFiles.length > 0;

  const careerStats = hasLive
    ? [
        { label: "Recruiter Emails", value: String(recruiterEmails.length) },
        { label: "Unread", value: String(recruiterEmails.filter((e) => e.isUnread).length) },
        { label: "Resume Files", value: String(driveFiles.length) },
        { label: "Sources", value: String(new Set(recruiterEmails.map((e) => e.from?.match(/@([^\s>]+)/)?.[1]).filter(Boolean)).size) },
      ]
    : [
        { label: "Current Role", value: "—" },
        { label: "Tenure", value: "—" },
        { label: "Recruiter Emails", value: "—" },
        { label: "Interview Signals", value: "—" },
      ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <Briefcase className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">Career Predictor</h2>
              {isConnected && (
                <button onClick={loadData} disabled={loading} className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50">
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Sync
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? "Live data connected — analyzing recruiter emails, resume activity, and career signals."
                : "Connect Google to predict job changes, promotions, and career trajectory."}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {careerStats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
            <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Live Recruiter Emails */}
      {recruiterEmails.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Target className="h-4 w-4" /> Career-Related Emails (Live)
          </h3>
          <div className="space-y-1.5">
            {recruiterEmails.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-4 py-2.5">
                <AlertTriangle className="h-3 w-3 text-amber-400/60 shrink-0" />
                <span className="text-xs font-light text-foreground flex-1 truncate">{e.subject || "(No Subject)"}</span>
                <span className="text-[10px] text-muted-foreground/50 truncate max-w-[25%]">{e.from?.replace(/<.*>/, "").trim()}</span>
                <span className="text-[10px] text-muted-foreground w-16 text-right shrink-0">
                  {e.date ? new Date(e.date).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resume Files */}
      {driveFiles.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <GraduationCap className="h-3.5 w-3.5" /> Resume/CV Files Detected
          </h3>
          <div className="space-y-1.5">
            {driveFiles.map((f) => (
              <div key={f.id} className="flex items-center gap-2 py-1.5 rounded-lg bg-foreground/5 px-3">
                <Briefcase className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                <span className="text-[10px] font-light text-foreground flex-1 truncate">{f.name}</span>
                <span className="text-[10px] text-muted-foreground/50">
                  {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Data */}
      {!hasLive && isConnected && !loading && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center space-y-3">
          <Briefcase className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm font-extralight text-muted-foreground/50">
            No career-related emails or resume files found.
          </p>
        </div>
      )}

      {/* Insights */}
      {hasLive && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5" /> Career Intelligence
          </h3>
          <div className="space-y-1.5">
            {[
              recruiterEmails.length > 5 ? "High recruiter activity — you're in demand" : "Normal recruiter activity",
              driveFiles.length > 0 ? `${driveFiles.length} resume/CV files found — last updated ${driveFiles[0]?.modifiedTime ? new Date(driveFiles[0].modifiedTime).toLocaleDateString() : "unknown"}` : "No resume files detected in Drive",
              recruiterEmails.filter((e) => e.isUnread).length > 0 ? `${recruiterEmails.filter((e) => e.isUnread).length} unread career emails — don't miss opportunities` : "All career emails reviewed",
              `${new Set(recruiterEmails.map((e) => e.from?.match(/@([^\s>]+)/)?.[1]).filter(Boolean)).size} unique companies reaching out`,
            ].map((m, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <Zap className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                <span className="text-[10px] font-extralight text-muted-foreground">{m}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isConnected && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center space-y-3">
          <Briefcase className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm font-extralight text-muted-foreground/50">
            Connect Google to detect career signals, recruiter emails, and resume activity.
          </p>
        </div>
      )}
    </div>
  );
};

export default CareerPredictor;
