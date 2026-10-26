import { useState, useEffect, useCallback } from "react";
import { Briefcase, GraduationCap, Target, RefreshCw, AlertTriangle } from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";
import { CONNECT_UNAVAILABLE, describeFailure } from "../offline";

// ascent — recruiter mail and résumé files found in the connected account.
// it never "predicts job changes": the copy that said so is gone, and the
// insight lines ("you're in demand") with it.

interface MailRow { id: string; subject?: string; from?: string; date?: string; isUnread?: boolean }
interface FileRow { id: string; name?: string; modifiedTime?: string }

const senderDomain = (from?: string) => from?.match(/@([^\s>]+)/)?.[1];

const CareerPredictor = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recruiterEmails, setRecruiterEmails] = useState<MailRow[]>([]);
  const [driveFiles, setDriveFiles] = useState<FileRow[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setError(describeFailure(err, "google data organ"));
    } finally {
      setLoading(false);
    }
  }, [fetchGoogleData]);

  useEffect(() => {
    if (isConnected) void loadData();
  }, [isConnected, loadData]);

  const hasLive = recruiterEmails.length > 0 || driveFiles.length > 0;
  const sources = new Set(recruiterEmails.map((e) => senderDomain(e.from)).filter(Boolean)).size;

  const careerStats = [
    { label: "recruiter mail", value: hasLive ? String(recruiterEmails.length) : "—" },
    { label: "unread", value: hasLive ? String(recruiterEmails.filter((e) => e.isUnread).length) : "—" },
    { label: "résumé files", value: hasLive ? String(driveFiles.length) : "—" },
    { label: "sending domains", value: hasLive ? String(sources) : "—" },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
            <Briefcase className="h-6 w-6 text-foreground/70" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">trajectory analysis</h2>
              {isConnected && (
                <button
                  type="button"
                  onClick={() => void loadData()}
                  disabled={loading}
                  className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden />
                  read again
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {isConnected
                ? "mail whose subject or sender matches recruiting vocabulary, and drive files named like a résumé. a match is a keyword hit, not a judgement."
                : CONNECT_UNAVAILABLE}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-border/25 bg-card/20 px-4 py-3 text-[11px] font-extralight text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {careerStats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
            <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {recruiterEmails.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-4">
          <h3 className="text-sm font-light tracking-wide text-foreground flex items-center gap-2">
            <Target className="h-4 w-4" aria-hidden /> mail matching recruiting vocabulary
          </h3>
          <div className="space-y-1.5">
            {recruiterEmails.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-xl bg-foreground/5 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate text-xs font-light text-foreground">{e.subject || "(no subject)"}</span>
                <span className="hidden sm:inline max-w-[25%] truncate text-[10px] text-muted-foreground/50">{e.from?.replace(/<.*>/, "").trim()}</span>
                <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
                  {e.date ? new Date(e.date).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {driveFiles.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-xs font-light tracking-wide text-foreground flex items-center gap-2">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden /> files named like a résumé
          </h3>
          <div className="space-y-1.5">
            {driveFiles.map((f) => (
              <div key={f.id} className="flex items-center gap-2 rounded-lg bg-foreground/5 px-3 py-1.5">
                <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground/40" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[10px] font-light text-foreground">{f.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground/50">
                  {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasLive && isConnected && !loading && !error && (
        <div className="rounded-2xl border border-dashed border-border/30 bg-card/10 p-10 text-center">
          <p className="text-sm font-extralight text-muted-foreground/50">no mail or file matched the recruiting vocabulary.</p>
        </div>
      )}
    </div>
  );
};

export default CareerPredictor;
