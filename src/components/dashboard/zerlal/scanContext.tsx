import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ScanProgress } from "./useZerlalData";
import type { ZerlalFinding } from "./types";

export interface NarrativeEntry {
  index: number;
  finding: Partial<ZerlalFinding> & {
    severity: string;
    title: string;
    file_path?: string | null;
    line_number?: number;
    code_snippet?: string;
    description?: string;
    impact?: string;
    suggested_fix?: string;
    cwe_id?: string;
    cvss_score?: number;
  };
  story: string;
  receivedAt: number;
}

export interface InputStats {
  fileName: string;
  fileCount: number;
  totalBytes: number;
  scanProfile: string;
  sourceType: string;
}

export interface ActiveScanState {
  projectId: string;
  projectName: string;
  startedAt: number;
  input: InputStats;
  progress: ScanProgress | null;
  liveFindings: NarrativeEntry[];
  status: "running" | "complete" | "failed";
  error?: string;
  finalCount?: number;
}

interface ScanContextValue {
  active: ActiveScanState | null;
  startScan: (args: {
    projectId: string;
    projectName: string;
    codeContent: string;
    fileName: string;
    scanProfile: string;
    includeWorkflowFunctionFlaws?: boolean;
    sourceType: string;
    fileCount: number;
    githubUrl?: string;
  }) => void;
  adoptQueuedScan: (args: {
    projectId: string;
    projectName: string;
    fileName: string;
    scanProfile: string;
    sourceType: string;
    fileCount: number;
    message?: string;
    percent?: number;
  }) => void;
  failScan: (projectId: string, error: string) => void;
  cancelScan: () => void;
  clear: () => void;
}

const ScanContext = createContext<ScanContextValue | null>(null);

const severityStory = (sev: string) => {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return "This one bites first. Left as-is, an attacker walks straight in.";
  if (s === "high") return "Serious exposure. Treat this as a near-term breach risk.";
  if (s === "medium") return "Real weakness — exploitable when chained with anything else here.";
  if (s === "low") return "Minor surface, but it widens the blast radius if ignored.";
  return "Hygiene issue. Clean it up before it ages into a real bug.";
};

const buildStory = (f: NarrativeEntry["finding"]): string => {
  const where = f.file_path ? `${f.file_path}${f.line_number ? `:${f.line_number}` : ""}` : "an unspecified location";
  const why = f.impact || f.description || "creates an exploitable condition";
  const sev = severityStory(f.severity);
  return `Found in ${where}. ${why}. ${sev}`;
};

export const ScanProvider = ({ children }: { children: ReactNode }) => {
  const [active, setActive] = useState<ActiveScanState | null>(null);
  const activeRef = useRef<ActiveScanState | null>(null);
  activeRef.current = active;
  const abortRef = useRef<AbortController | null>(null);
  const canceledRef = useRef<boolean>(false);

  const update = useCallback((patch: Partial<ActiveScanState>) => {
    setActive(prev => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const pushFindings = useCallback((findings: any[]) => {
    if (!findings || findings.length === 0) return;
    setActive(prev => {
      if (!prev) return prev;
      const start = prev.liveFindings.length;
      const entries: NarrativeEntry[] = findings.map((f, i) => ({
        index: start + i + 1,
        finding: f,
        story: buildStory(f),
        receivedAt: Date.now(),
      }));
      return { ...prev, liveFindings: [...prev.liveFindings, ...entries] };
    });
  }, []);

  const callPhase = async (body: Record<string, unknown>, timeoutMs = 90_000) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const controller = abortRef.current ?? new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/zerlal-scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: anonKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = await resp.text();
      let parsed: any = {};
      try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { error: raw }; }
      if (!resp.ok) throw new Error(parsed?.error || parsed?.message || `Status ${resp.status}`);
      if (parsed?.error) throw new Error(parsed.error);
      return parsed;
    } finally {
      clearTimeout(to);
    }
  };

  const sleepWithCountdown = async (seconds: number, onTick: (remaining: number) => void) => {
    for (let r = seconds; r > 0; r--) {
      if (canceledRef.current) throw new DOMException("Canceled", "AbortError");
      onTick(r);
      await new Promise(res => setTimeout(res, 1000));
    }
  };

  const runScanInternal = async (args: {
    projectId: string;
    codeContent: string;
    fileName: string;
    scanProfile: string;
    includeWorkflowFunctionFlaws?: boolean;
    githubUrl?: string;
  }) => {
    const baseBody = {
      project_id: args.projectId,
      scan_profile: args.scanProfile,
      include_workflow_function_flaws: args.includeWorkflowFunctionFlaws ?? false,
      code_content: args.codeContent,
      file_name: args.fileName,
      github_url: args.githubUrl || undefined,
    };
    try {
      update({ progress: { phase: "planning", section: 0, totalSections: 1, percent: 4, message: "Unpacking source and detecting language…" } });
      const plan = await callPhase({ ...baseBody, mode: "plan" }, 90_000);
      const totalSections: number = plan.total_sections || 1;
      const breakSeconds: number = plan.break_seconds || 15;
      const profile = plan.provider_profile;
      const scanId: string = plan.scan_id;
      const providerLabel: string = profile?.provider_label || "auto";

      update({
        progress: {
          phase: "scanning",
          section: 0,
          totalSections,
          percent: 8,
          message: `Plan ready · ${totalSections} section${totalSections > 1 ? "s" : ""} via ${providerLabel}`,
          providerLabel,
          breakSeconds,
        },
      });

      let aggregated: any[] = [];
      let firstSummary = "";
      let firstRisk = "F";
      for (let i = 0; i < totalSections; i++) {
        const sectionPct = 10 + Math.floor((i / totalSections) * 75);
        update({
          progress: {
            phase: "scanning", section: i + 1, totalSections, percent: sectionPct,
            message: `Reading section ${i + 1} of ${totalSections} — walking call graph…`,
            providerLabel, breakSeconds, findingsSoFar: aggregated.length,
          },
        });
        const sec = await callPhase({
          ...baseBody, mode: "section", scan_id: scanId,
          section_index: i, total_sections: totalSections, provider_profile: profile,
        }, Math.max(120_000, (profile?.section_timeout_ms || 60_000) + 30_000));

        if (Array.isArray(sec.findings) && sec.findings.length > 0) {
          aggregated = aggregated.concat(sec.findings);
          pushFindings(sec.findings);
        }
        if (i === 0) { firstSummary = sec.summary || ""; firstRisk = sec.risk_grade || "F"; }
        const donePct = 10 + Math.floor(((i + 1) / totalSections) * 75);
        update({
          progress: {
            phase: "scanning", section: i + 1, totalSections, percent: donePct,
            message: `Section ${i + 1} done · ${aggregated.length} issue${aggregated.length === 1 ? "" : "s"} so far`,
            providerLabel, breakSeconds, findingsSoFar: aggregated.length,
          },
        });
        if (i < totalSections - 1) {
          await sleepWithCountdown(breakSeconds, remaining => {
            update({
              progress: {
                phase: "scanning", section: i + 1, totalSections, percent: donePct,
                message: `Cooling provider · resuming in ${remaining}s`,
                providerLabel, breakSeconds, breakRemaining: remaining,
                findingsSoFar: aggregated.length,
              },
            });
          });
        }
      }

      update({
        progress: {
          phase: "finalizing", section: totalSections, totalSections, percent: 92,
          message: "Deduplicating, scoring, writing report…",
          providerLabel, findingsSoFar: aggregated.length,
        },
      });
      const final = await callPhase({
        ...baseBody, mode: "finalize", scan_id: scanId,
        aggregated_findings: aggregated,
        first_pass_summary: firstSummary, first_pass_risk_grade: firstRisk,
        provider_profile: profile,
      }, 180_000);

      update({
        progress: {
          phase: "complete", section: totalSections, totalSections, percent: 100,
          message: `Scan complete · ${final.findings_count} vulnerabilities`,
          providerLabel, findingsSoFar: final.findings_count,
        },
        status: "complete",
        finalCount: final.findings_count,
      });
      toast.success(`Scan complete: ${final.findings_count} findings`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (canceledRef.current || (e instanceof DOMException && e.name === "AbortError")) {
        update({ status: "failed", error: "Canceled by user" });
        toast.message("Scan canceled");
      } else {
        update({ status: "failed", error: msg });
        toast.error("Scan failed: " + msg);
      }
    } finally {
      abortRef.current = null;
    }
  };

  const startScan: ScanContextValue["startScan"] = useCallback(args => {
    // Reset cancel state and create a fresh controller for this run
    canceledRef.current = false;
    abortRef.current = new AbortController();
    setActive({
      projectId: args.projectId,
      projectName: args.projectName,
      startedAt: Date.now(),
      input: {
        fileName: args.fileName,
        fileCount: args.fileCount,
        totalBytes: args.codeContent?.length || 0,
        scanProfile: args.scanProfile,
        sourceType: args.sourceType,
      },
      progress: null,
      liveFindings: [],
      status: "running",
    });
    // fire and forget
    void runScanInternal({
      projectId: args.projectId,
      codeContent: args.codeContent,
      fileName: args.fileName,
      scanProfile: args.scanProfile,
      includeWorkflowFunctionFlaws: args.includeWorkflowFunctionFlaws,
      githubUrl: args.githubUrl,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adoptQueuedScan: ScanContextValue["adoptQueuedScan"] = useCallback(args => {
    canceledRef.current = false;
    abortRef.current = null;
    setActive({
      projectId: args.projectId,
      projectName: args.projectName,
      startedAt: Date.now(),
      input: {
        fileName: args.fileName,
        fileCount: args.fileCount,
        totalBytes: 0,
        scanProfile: args.scanProfile,
        sourceType: args.sourceType,
      },
      progress: {
        phase: "planning",
        section: 0,
        totalSections: 1,
        percent: args.percent ?? 2,
        message: args.message ?? "Queued in cloud — preparing secure archive analysis…",
      },
      liveFindings: [],
      status: "running",
    });
  }, []);

  const failScan: ScanContextValue["failScan"] = useCallback((projectId, error) => {
    setActive(prev => {
      if (!prev || prev.projectId !== projectId) return prev;
      return {
        ...prev,
        status: "failed",
        error,
        progress: prev.progress
          ? {
              ...prev.progress,
              message: `Scan failed: ${error}`,
            }
          : {
              phase: "planning",
              section: 0,
              totalSections: 1,
              percent: 0,
              message: `Scan failed: ${error}`,
            },
      };
    });
  }, []);

  const cancelScan = useCallback(() => {
    if (!activeRef.current || activeRef.current.status !== "running") return;
    canceledRef.current = true;
    try { abortRef.current?.abort(); } catch { /* noop */ }
    update({ status: "failed", error: "Canceled by user", progress: activeRef.current.progress ? { ...activeRef.current.progress, message: "Canceling…" } : null });
  }, [update]);

  const clear = useCallback(() => setActive(null), []);

  // ===== Cross-tab / cross-device sync via realtime on zerlal_background_jobs =====
  // When a scan is queued (from any tab/device), every open session for the same
  // user mirrors the running scan page automatically.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const mapJobToActive = (job: any): ActiveScanState => {
      const total = Math.max(1, Number(job.total_sections) || 1);
      const current = Math.max(0, Number(job.current_section) || 0);
      const findings = Array.isArray(job.aggregated_findings) ? job.aggregated_findings : [];
      const liveFindings: NarrativeEntry[] = findings.map((f: any, i: number) => ({
        index: i + 1,
        finding: f,
        story: buildStory(f),
        receivedAt: Date.now(),
      }));
      const status: ActiveScanState["status"] =
        job.status === "completed" ? "complete" :
        job.status === "failed" ? "failed" : "running";
      const phase =
        job.status === "completed" ? "complete" :
        job.status === "finalizing" ? "finalizing" :
        job.status === "pending" ? "planning" : "scanning";
      const percent =
        job.status === "completed" ? 100 :
        job.status === "finalizing" ? 92 :
        job.status === "pending" ? 4 :
        Math.min(90, 10 + Math.floor((current / total) * 75));
      const attempts = Number(job.attempts) || 0;
      const retrySuffix = job.last_error && job.status !== "completed" && job.status !== "failed"
        ? ` · ⚠ retrying after error (attempt ${attempts}/5): ${String(job.last_error).slice(0, 140)}`
        : "";
      const msg =
        job.status === "completed" ? `Scan complete · ${findings.length} vulnerabilities` :
        job.status === "failed" ? `Scan failed: ${job.last_error || "Unknown error"}` :
        job.status === "pending" ? `Queued in cloud — loading prepared source…${retrySuffix}` :
        job.status === "finalizing" ? `Deduplicating, scoring, writing report…${retrySuffix}` :
        `Reading section ${Math.min(current + 1, total)} of ${total} (cloud)${retrySuffix}`;
      return {
        projectId: job.project_id,
        projectName: job.project_name || "Cloud scan",
        startedAt: new Date(job.created_at).getTime(),
        input: {
          fileName: job.file_name || "uploaded source",
          fileCount: 0,
          totalBytes: 0,
          scanProfile: job.scan_profile || "security-audit",
          sourceType: job.source_storage_path ? "cloud-upload" : (job.github_url ? "github" : "code"),
        },
        progress: {
          phase: phase as any,
          section: current,
          totalSections: total,
          percent,
          message: msg,
          findingsSoFar: findings.length,
        },
        liveFindings,
        status,
        error: job.status === "failed" ? (job.last_error || undefined) : undefined,
        finalCount: job.status === "completed" ? (job.findings_count ?? findings.length) : undefined,
      };
    };

    const shouldAdopt = (job: any): boolean => {
      const cur = activeRef.current;
      if (!cur) return true;
      // Never let a cloud job for a DIFFERENT project clobber an actively running scan
      if (cur.status === "running" && cur.projectId && job.project_id && cur.projectId !== job.project_id) {
        return false;
      }
      // Don't clobber a locally-running scan with an older cloud job from before it started
      if (cur.status === "running" && new Date(job.created_at).getTime() < cur.startedAt - 1000) {
        return false;
      }
      return true;
    };

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Seed with the most recent active or recently-finished cloud job
      const { data: rows } = await supabase
        .from("zerlal_background_jobs" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const seed: any = Array.isArray(rows) && rows.length ? rows[0] : null;
      if (seed && shouldAdopt(seed)) {
        const ageMs = Date.now() - new Date(seed.created_at).getTime();
        // Only auto-show recent jobs (last 30 min) or anything still running
        const live = ["pending", "scanning", "finalizing"].includes(seed.status);
        if (live || ageMs < 30 * 60 * 1000) {
          setActive(mapJobToActive(seed));
        }
      }

      channel = supabase
        .channel(`zerlal-jobs-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "zerlal_background_jobs", filter: `user_id=eq.${user.id}` },
          (payload: any) => {
            const job = payload.new || payload.old;
            if (!job) return;
            if (!shouldAdopt(job)) return;
            const prev = activeRef.current;
            const next = mapJobToActive(job);
            setActive(next);
            // Visible status transitions
            if (prev?.projectId === next.projectId) {
              if (prev.status !== "failed" && next.status === "failed") {
                toast.error(`Cloud scan failed: ${next.error || "Unknown error"}`, { duration: 10000 });
              } else if (prev.status !== "complete" && next.status === "complete") {
                toast.success(`Cloud scan complete · ${next.finalCount ?? 0} findings`);
              } else if (job.last_error && prev.progress?.message !== next.progress?.message) {
                toast.warning(`Scanner hit an error, retrying: ${String(job.last_error).slice(0, 120)}`, { duration: 6000 });
              }
            }
          },
        )
        .subscribe();
    };

    void init();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);



  return (
      <ScanContext.Provider value={{ active, startScan, adoptQueuedScan, failScan, cancelScan, clear }}>
      {children}
    </ScanContext.Provider>
  );
};

export const useActiveScan = () => {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useActiveScan must be used within ScanProvider");
  return ctx;
};
