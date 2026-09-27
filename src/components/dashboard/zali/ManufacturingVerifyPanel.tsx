import { useState } from "react";
import { Factory, CheckCircle2, XCircle, AlertTriangle, Globe, DollarSign, Clock, ShieldCheck, Loader2, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { ZaliProject } from "./types";

interface Props { project: ZaliProject | null; }

const ManufacturingVerifyPanel = ({ project }: Props) => {
  const { user } = useAuth();
  const [tab, setTab] = useState<"dfm" | "suppliers" | "certifications" | "timeline">("dfm");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any>(null);

  const runAnalysis = async () => {
    if (!project || !user) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("zali-analyze", {
        body: {
          analysisType: "manufacturing",
          projectData: {
            name: project.name,
            description: project.description || "",
            specs: project.specs || {},
            materials: project.materials || [],
          },
        },
      });
      if (error) throw error;
      setResults(data.result);

      await supabase.from("zali_mfg_results").insert({
        user_id: user.id,
        project_name: project.name,
        analysis_type: "full",
        results: data.result,
      });
    } catch {
      toast.error("Manufacturing analysis failed");
    }
    setRunning(false);
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Factory className="h-4 w-4 text-emerald-400" />
            <h2 className="text-xs font-light tracking-[0.15em] text-muted-foreground uppercase">Manufacturing Verification</h2>
          </div>
        </div>

        {!project ? (
          <div className="text-center py-12 space-y-3">
            <Factory className="h-8 w-8 text-muted-foreground/20 mx-auto" />
            <p className="text-sm font-extralight text-muted-foreground/40">Create a design to verify manufacturability</p>
          </div>
        ) : !results ? (
          <div className="text-center py-12 space-y-4">
            <Factory className="h-10 w-10 text-emerald-400/30 mx-auto" />
            <p className="text-sm font-extralight text-muted-foreground/40">Run AI-powered DFM analysis on your design</p>
            <p className="text-[10px] text-muted-foreground/30">Checks manufacturability, supplier availability, certifications, and production timeline</p>
            <button onClick={runAnalysis} disabled={running}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-3 text-xs font-light text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50">
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {running ? "Analyzing Design..." : "Run Manufacturing Analysis"}
            </button>
          </div>
        ) : (
          <>
            {/* Verdict */}
            <div className={`rounded-xl border p-4 ${!results.dfmChecks?.some((c: any) => c.status !== "pass") ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
              <div className="flex items-center gap-3">
                {!results.dfmChecks?.some((c: any) => c.status !== "pass") ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <AlertTriangle className="h-5 w-5 text-amber-400" />}
                <div>
                  <p className="text-sm font-light text-foreground">{!results.dfmChecks?.some((c: any) => c.status !== "pass") ? "FULLY MANUFACTURABLE" : "ISSUES DETECTED"}</p>
                  <p className="text-[10px] text-muted-foreground/60">Total cost: {results.totalCost || "N/A"} · Lead time: {results.maxLeadDays || "N/A"} days</p>
                </div>
              </div>
            </div>

            <div className="flex gap-1">
              {(["dfm", "suppliers", "certifications", "timeline"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-light transition-colors capitalize ${tab === t ? "bg-foreground/10 text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
                >{t === "dfm" ? "DFM Checks" : t}</button>
              ))}
            </div>

            {tab === "dfm" && results.dfmChecks && (
              <div className="space-y-2.5">
                {results.dfmChecks.map((check: any, i: number) => (
                  <div key={i} className="rounded-xl border border-border/15 bg-card/20 p-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        {check.status === "pass" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : check.status === "fail" ? <XCircle className="h-3.5 w-3.5 text-red-400" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
                        <span className="text-[11px] font-light text-foreground">{check.label}</span>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded-md ${check.status === "pass" ? "bg-emerald-500/10 text-emerald-400" : check.status === "fail" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                        {check.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[9px] text-muted-foreground/50 mb-2">{check.detail}</p>
                    <div className="flex items-center gap-4 text-[9px] text-muted-foreground/40">
                      {check.cost && <span className="flex items-center gap-1"><DollarSign className="h-2.5 w-2.5" /> {check.cost}</span>}
                      {check.lead && <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" /> {check.lead}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "suppliers" && results.suppliers && (
              <div className="space-y-2.5">
                {results.suppliers.map((sup: any, i: number) => (
                  <div key={i} className="rounded-xl border border-border/15 bg-card/20 p-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-accent/60" />
                        <span className="text-[11px] font-light text-foreground">{sup.name}</span>
                      </div>
                      <span className={`text-[9px] ${sup.inStock === sup.items ? "text-emerald-400" : "text-amber-400"}`}>
                        {sup.inStock}/{sup.items} in stock
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[9px] text-muted-foreground/40">
                      <span>{sup.total} total</span>
                      <span>Ships in {sup.leadDays} days</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "certifications" && results.certifications && (
              <div className="space-y-2.5">
                {results.certifications.map((cert: any, i: number) => (
                  <div key={i} className="rounded-xl border border-border/15 bg-card/20 p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className={`h-3.5 w-3.5 ${cert.status === "pass" ? "text-emerald-400" : cert.status === "needs-review" ? "text-amber-400" : "text-muted-foreground/30"}`} />
                      <div>
                        <span className="text-[11px] font-light text-foreground">{cert.name}</span>
                        {cert.required && <span className="text-[8px] text-red-400/60 ml-2">Required</span>}
                      </div>
                    </div>
                    <span className={`text-[9px] px-2 py-0.5 rounded-md ${cert.status === "pass" ? "bg-emerald-500/10 text-emerald-400" : cert.status === "needs-review" ? "bg-amber-500/10 text-amber-400" : "bg-foreground/5 text-muted-foreground/40"}`}>
                      {cert.status === "pass" ? "Compliant" : cert.status === "needs-review" ? "Review Needed" : "Optional"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {tab === "timeline" && results.timeline && (
              <div className="rounded-xl border border-border/15 bg-card/20 p-4">
                <h3 className="text-[11px] font-light text-foreground mb-4">Production Timeline</h3>
                <div className="space-y-3">
                  {results.timeline.map((step: any, i: number) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`h-3 w-3 rounded-full ${step.status === "ready" ? "bg-emerald-400" : "bg-muted-foreground/20"}`} />
                        {i < results.timeline.length - 1 && <div className="w-0.5 h-4 bg-border/20" />}
                      </div>
                      <div>
                        <p className="text-[10px] font-light text-foreground">{step.week}</p>
                        <p className="text-[9px] text-muted-foreground/50">{step.task}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={runAnalysis} disabled={running}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/20 py-2.5 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-50">
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Re-analyze
            </button>
          </>
        )}
      </div>
    </ScrollArea>
  );
};

export default ManufacturingVerifyPanel;
