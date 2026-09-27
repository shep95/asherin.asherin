import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ZerlalProject, ZerlalFinding, ZerlalScan } from "./types";

export const useZerlalProjects = () => {
  const [projects, setProjects] = useState<ZerlalProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("zerlal_projects")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setProjects((data || []) as unknown as ZerlalProject[]);
    } catch (e) {
      console.error("Failed to fetch projects:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  return { projects, loading, refetch: fetchProjects };
};

export const useZerlalFindings = (
  projectId?: string | null,
  options?: { fetchAllWhenNoProjectId?: boolean }
) => {
  const [findings, setFindings] = useState<ZerlalFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchAllWhenNoProjectId = options?.fetchAllWhenNoProjectId ?? true;

  const fetchFindings = useCallback(async () => {
    if (!projectId && !fetchAllWhenNoProjectId) {
      setFindings([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("zerlal_findings")
        .select("*")
        .eq("user_id", user.id)
        .order("cvss_score", { ascending: false });

      if (projectId) {
        query = query.eq("project_id", projectId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setFindings((data || []) as unknown as ZerlalFinding[]);
    } catch (e) {
      console.error("Failed to fetch findings:", e);
    } finally {
      setLoading(false);
    }
  }, [fetchAllWhenNoProjectId, projectId]);

  useEffect(() => { fetchFindings(); }, [fetchFindings]);

  return { findings, loading, refetch: fetchFindings };
};

export const useZerlalScans = (projectId?: string | null) => {
  const [scans, setScans] = useState<ZerlalScan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchScans = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("zerlal_scans")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (projectId) query = query.eq("project_id", projectId);

      const { data, error } = await query;
      if (error) throw error;
      setScans((data || []) as unknown as ZerlalScan[]);
    } catch (e) {
      console.error("Failed to fetch scans:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchScans(); }, [fetchScans]);

  return { scans, loading, refetch: fetchScans };
};

export const useCreateProject = () => {
  const [creating, setCreating] = useState(false);

  const createProject = async (name: string, sourceType: string, repoUrl?: string): Promise<ZerlalProject | null> => {
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("zerlal_projects")
        .insert({
          user_id: user.id,
          name,
          source_type: sourceType,
          repo_url: repoUrl || null,
          status: "idle",
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as ZerlalProject;
    } catch (e) {
      console.error("Failed to create project:", e);
      toast.error("Failed to create project");
      return null;
    } finally {
      setCreating(false);
    }
  };

  return { createProject, creating };
};

export interface ScanProgress {
  phase: "planning" | "probing" | "scanning" | "finalizing" | "complete";
  section: number;
  totalSections: number;
  percent: number;
  message: string;
  providerLabel?: string;
  breakSeconds?: number;
  breakRemaining?: number;
  findingsSoFar?: number;
}

export const useRunScan = () => {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  const callPhase = async (body: Record<string, unknown>, timeoutMs = 90_000) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/zerlal-scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": anonKey,
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
      onTick(r);
      await new Promise((res) => setTimeout(res, 1000));
    }
  };

  const runScan = async (
    projectId: string,
    codeContent: string,
    fileName: string,
    scanProfile?: string,
    githubUrl?: string,
    includeWorkflowFunctionFlaws = false,
  ) => {
    setScanning(true);
    setProgress({ phase: "planning", section: 0, totalSections: 1, percent: 2, message: "Initializing scan…" });
    try {
      const baseBody = {
        project_id: projectId,
        scan_profile: scanProfile || "security-audit",
        include_workflow_function_flaws: includeWorkflowFunctionFlaws,
        code_content: codeContent,
        file_name: fileName,
        github_url: githubUrl || undefined,
      };

      setProgress((p) => ({ ...(p as ScanProgress), phase: "probing", percent: 5, message: "Detecting provider latency…" }));
      const plan = await callPhase({ ...baseBody, mode: "plan" }, 90_000);
      const totalSections: number = plan.total_sections || 1;
      const breakSeconds: number = plan.break_seconds || 15;
      const profile = plan.provider_profile;
      const scanId: string = plan.scan_id;
      const providerLabel: string = profile?.provider_label || "auto";

      setProgress({
        phase: "scanning",
        section: 0,
        totalSections,
        percent: 8,
        message: `Plan ready · ${totalSections} section${totalSections > 1 ? "s" : ""} via ${providerLabel}`,
        providerLabel,
        breakSeconds,
      });

      let aggregated: any[] = [];
      let firstSummary = "";
      let firstRisk = "F";
      for (let i = 0; i < totalSections; i++) {
        const sectionPct = 10 + Math.floor((i / totalSections) * 75);
        setProgress({
          phase: "scanning", section: i + 1, totalSections, percent: sectionPct,
          message: `Scanning section ${i + 1} of ${totalSections}…`,
          providerLabel, breakSeconds, findingsSoFar: aggregated.length,
        });
        const sec = await callPhase({
          ...baseBody, mode: "section", scan_id: scanId,
          section_index: i, total_sections: totalSections, provider_profile: profile,
        }, Math.max(120_000, (profile?.section_timeout_ms || 60_000) + 30_000));
        if (Array.isArray(sec.findings)) aggregated = aggregated.concat(sec.findings);
        if (i === 0) { firstSummary = sec.summary || ""; firstRisk = sec.risk_grade || "F"; }
        const donePct = 10 + Math.floor(((i + 1) / totalSections) * 75);
        setProgress({
          phase: "scanning", section: i + 1, totalSections, percent: donePct,
          message: `Section ${i + 1} complete · ${aggregated.length} findings so far`,
          providerLabel, breakSeconds, findingsSoFar: aggregated.length,
        });
        if (i < totalSections - 1) {
          await sleepWithCountdown(breakSeconds, (remaining) => {
            setProgress({
              phase: "scanning", section: i + 1, totalSections, percent: donePct,
              message: `Cooling down · ${remaining}s until section ${i + 2}`,
              providerLabel, breakSeconds, breakRemaining: remaining,
              findingsSoFar: aggregated.length,
            });
          });
        }
      }

      setProgress({
        phase: "finalizing", section: totalSections, totalSections, percent: 92,
        message: "Deduplicating findings & writing report…",
        providerLabel, findingsSoFar: aggregated.length,
      });
      const final = await callPhase({
        ...baseBody, mode: "finalize", scan_id: scanId,
        aggregated_findings: aggregated,
        first_pass_summary: firstSummary, first_pass_risk_grade: firstRisk,
        provider_profile: profile,
      }, 180_000);

      setProgress({
        phase: "complete", section: totalSections, totalSections, percent: 100,
        message: `Scan complete · ${final.findings_count} findings`,
        providerLabel, findingsSoFar: final.findings_count,
      });
      toast.success(`Scan complete: ${final.findings_count} findings found`);
      return final;
    } catch (e) {
      console.error("Scan failed:", e);
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Scan failed: " + msg);
      setProgress((p) => p ? { ...p, message: `Failed: ${msg}` } : null);
      return null;
    } finally {
      setScanning(false);
    }
  };

  return { runScan, scanning, progress };
};

export const useUpdateFinding = () => {
  const updateFinding = async (findingId: string, updates: Record<string, any>) => {
    try {
      const { error } = await supabase
        .from("zerlal_findings")
        .update(updates)
        .eq("id", findingId);

      if (error) throw error;
      toast.success("Finding updated");
      return true;
    } catch (e) {
      console.error("Failed to update finding:", e);
      toast.error("Failed to update finding");
      return false;
    }
  };

  const markFalsePositive = async (findingId: string) => {
    return updateFinding(findingId, { is_false_positive: true, status: "waived", waiver_reason: "Marked as false positive" });
  };

  const waiveFinding = async (findingId: string, reason: string) => {
    return updateFinding(findingId, { status: "waived", waiver_reason: reason });
  };

  const resolveFinding = async (findingId: string) => {
    return updateFinding(findingId, { status: "resolved", resolved_at: new Date().toISOString() });
  };

  const assignFinding = async (findingId: string, assignee: string) => {
    return updateFinding(findingId, { assignee, status: "in-progress" });
  };

  return { updateFinding, markFalsePositive, waiveFinding, resolveFinding, assignFinding };
};
