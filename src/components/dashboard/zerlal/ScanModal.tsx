import { isStaffEmail } from "@/lib/adminEmail";
import { useState, useRef, useCallback } from "react";
import JSZip from "jszip";
import { Github, GitBranch, Upload, Link, Box, X, ChevronRight, Check, Bell, Mail, FileCode, Loader2, AlertTriangle, Code, Globe, Binary, CloudOff } from "lucide-react";
import { useCreateProject, useRunScan } from "./useZerlalData";
import { useActiveScan } from "./scanContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { triggerByokRequired } from "@/components/ByokRequiredDialog";


interface ScanModalProps {
  open: boolean;
  onClose: () => void;
  onScanComplete: () => void;
  onScanStarted?: (projectId: string) => void;
}

type Step = 1 | 2 | 3;

const sources: Array<{ id: string; label: string; icon: any; desc: string; comingSoon?: boolean }> = [
  { id: "upload", label: "Upload ZIP/Files", icon: Upload, desc: "ZIP or individual code files" },
  { id: "github-url", label: "GitHub URL", icon: Github, desc: "Public repository link" },
  { id: "paste-code", label: "Paste Code", icon: Code, desc: "Direct code paste, instant scan" },
  { id: "paste-url", label: "Any Git URL", icon: Link, desc: "GitLab, Bitbucket, GitHub — public repos" },
  { id: "dependency", label: "Dependency File", icon: FileCode, desc: "package.json, requirements.txt, etc." },
  { id: "github", label: "GitHub OAuth", icon: Github, desc: "Connect private repos", comingSoon: true },
  { id: "api-endpoint", label: "API Endpoint", icon: Globe, desc: "Swagger/OpenAPI or live API URL", comingSoon: true },
  { id: "docker", label: "Docker Image", icon: Box, desc: "Container registry scan", comingSoon: true },
  { id: "binary", label: "Binary Upload", icon: Binary, desc: "Reverse-engineer & scan", comingSoon: true },
];

const scanProfiles = [
  { id: "quick", name: "Quick Scan", desc: "Critical and high-severity only, fastest turnaround", time: "1-3 min", includes: ["Critical SAST", "Known CVE", "Secret Detection"] },
  { id: "security-audit", name: "Security Audit", desc: "Full SAST, SCA, secret detection, compliance mapping", time: "15-30 min", includes: ["Static Analysis", "Dependency Scan", "Secret Detection", "License Check", "SBOM Generation"] },
  { id: "compliance", name: "Compliance Scan", desc: "Maps to CMMC, NIST, SOC2, PCI DSS, HIPAA, FedRAMP, GDPR, ISO27001, DORA, NIS2, EU CRA", time: "20-45 min", includes: ["Full SAST", "SCA", "Multi-Framework Mapping", "SBOM", "FCA Shield"] },
  { id: "deep-scan", name: "Full Deep Scan", desc: "AI-assisted novel pattern detection, chain analysis, quantum crypto audit, red team simulation", time: "45-120 min", includes: ["Full SAST", "SCA", "AI Analysis", "Chain Detection", "Dataflow Tracing", "Quantum Crypto Audit", "Supply Chain Intel", "Zero-Trust Validation", "PoC Generation"] },
];

const isZipArchive = (name: string) => /\.zip$/i.test(name);
const isOtherArchive = (name: string) => /\.(tar|tar\.gz|tgz)$/i.test(name);
const skipArchivePath = /(^|\/)(node_modules|\.git|dist|build|__pycache__|\.next|vendor|coverage|__MACOSX|\.cache|target|out|bin|obj)\//i;
const acceptedCodeFile = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|c|cc|cpp|cxx|h|hpp|hh|php|rb|swift|kt|kts|cs|sh|bash|zsh|ps1|bat|cmd|sql|ya?ml|json|jsonc|toml|tf|vue|svelte|html|css|scss|sass|less|md|mdx|env|example|sample|dockerfile|lock|txt|xml|ini|cfg|conf|properties|gradle|scala|dart|lua|zig|hcl|gitignore|sum|mod|prisma|graphql|gql|proto|makefile|cmake)$/i;
const ZIP_FILE_LIMIT = 260;
const ZIP_TEXT_LIMIT = 2_400_000;
const ZIP_ENTRY_LIMIT = 180_000;

const ScanModal = ({ open, onClose, onScanComplete, onScanStarted }: ScanModalProps) => {
  const [step, setStep] = useState<Step>(1);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState("security-audit");
  const [includeWorkflowFunctionFlaws, setIncludeWorkflowFunctionFlaws] = useState(false);
  const [url, setUrl] = useState("");
  const [projectName, setProjectName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [codeContent, setCodeContent] = useState("");
  const [pastedCode, setPastedCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { createProject, creating } = useCreateProject();
  const { runScan, scanning, progress } = useRunScan();
  const { startScan: startLiveScan, adoptQueuedScan, failScan } = useActiveScan();

  const extractZipForScan = useCallback(async (archiveFile: File) => {
    const zip = await JSZip.loadAsync(archiveFile);
    const allEntries = Object.values(zip.files);
    const entries = allEntries
      .filter((entry) => {
        const path = entry.name || "";
        if (entry.dir || !path) return false;
        if (skipArchivePath.test(`/${path}`)) return false;
        return acceptedCodeFile.test(path) || /(^|\/)dockerfile$/i.test(path);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, ZIP_FILE_LIMIT);

    let assembled = "";
    let extracted = 0;
    let truncated = 0;
    let skipped = Math.max(0, allEntries.length - entries.length);

    for (const entry of entries) {
      if (assembled.length >= ZIP_TEXT_LIMIT) {
        skipped++;
        continue;
      }
      let text = await entry.async("text");
      if (!text) {
        skipped++;
        continue;
      }
      if (text.length > ZIP_ENTRY_LIMIT) {
        text = text.slice(0, ZIP_ENTRY_LIMIT) + `\n/* ZERLAL_NOTE: file truncated at ${ZIP_ENTRY_LIMIT} characters for transport; analyze visible logic and report if full file is needed. */\n`;
        truncated++;
      }
      assembled += `\n--- FILE: ${entry.name} ---\n${text}\n`;
      extracted++;
    }

    return {
      text: `ZIP SOURCE: ${archiveFile.name}\nFILES_EXTRACTED_FOR_CODE_AUDIT: ${extracted}\nFILES_TRUNCATED_FOR_TRANSPORT: ${truncated}\nFILES_SKIPPED_OR_DEPRIORITIZED: ${skipped}\nTOTAL_ENTRIES: ${allEntries.length}\n${assembled}`,
      extracted,
    };
  }, []);

  const handleFileSelect = useCallback(async (selectedFiles: FileList) => {
    const fileArray = Array.from(selectedFiles);
    setFiles(fileArray);
    setIsProcessing(true);

    // Archives: skip browser extraction entirely. Upload raw to cloud and let
    // the edge function extract server-side — survives WiFi drops mid-scan.
    const hasZipArchive = fileArray.some(f => isZipArchive(f.name));
    const hasOtherArchive = fileArray.some(f => isOtherArchive(f.name));

    try {
      if (hasOtherArchive) {
        setCodeContent("");
        setScanError("TAR uploads are not supported yet — upload a ZIP instead.");
      } else if (hasZipArchive) {
        const zipFile = fileArray.find(f => isZipArchive(f.name));
        if (!zipFile) throw new Error("ZIP file missing");
        const extracted = await extractZipForScan(zipFile);
        setCodeContent(extracted.text);
        toast.success(`ZIP unpacked locally — ${extracted.extracted} files ready for scan`);
      } else {
        let allContent = "";
        for (const file of fileArray) {
          const text = await file.text();
          allContent += `\n--- FILE: ${file.name} ---\n${text}\n`;
        }
        setCodeContent(allContent);
      }
      if (!projectName && fileArray.length > 0) {
        setProjectName(fileArray[0].name.replace(/\.(zip|tar|gz|tgz)$/i, ""));
      }
    } catch (e: any) {
      console.error("File processing error:", e);
      if (fileArray.some(f => isZipArchive(f.name))) {
        setCodeContent("");
        setScanError("Local ZIP unpack failed; raw ZIP will upload for cloud extraction instead.");
      } else {
        setScanError(e?.message || "Failed to read files");
      }
    } finally {
      setIsProcessing(false);
    }
  }, [extractZipForScan, projectName]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  // ── Shared BYOK resolver: returns byok config OR null. Sets scanError + triggers
  // the friendly dialog when a non-admin is missing a key, so foreground and
  // background paths give the same clear signal instead of a silent 403.
  const resolveByokOrGate = async (): Promise<{ byok: any | null; blocked: boolean }> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setScanError("Sign in required"); return { byok: null, blocked: true }; }
    let byok: any = null;
    try {
      const { data: pref } = await supabase
        .from("user_model_preferences" as any)
        .select("active_provider, active_model")
        .eq("user_id", user.id)
        .maybeSingle();
      const ap = (pref as any)?.active_provider;
      const am = (pref as any)?.active_model;
      if (ap && ap !== "default" && am && am !== "default") {
        const { data: keyRow } = await supabase
          .from("user_api_keys" as any)
          .select("api_key")
          .eq("user_id", user.id)
          .eq("provider", ap)
          .eq("is_active", true)
          .maybeSingle();
        if ((keyRow as any)?.api_key) byok = { provider: ap, model: am, apiKey: (keyRow as any).api_key };
      }
    } catch { /* ignore */ }
    const isAdmin = isStaffEmail(user.email);
    if (!byok && !isAdmin) {
      triggerByokRequired({ source: "zerlal", reason: "Zerlal scans require your own AI key. Add one in Settings → AI Keys." });
      setScanError("Add your AI key in Settings → AI Keys, then retry the scan.");
      return { byok: null, blocked: true };
    }
    return { byok, blocked: false };
  };

  const handleStartScan = async () => {
    setScanError(null);
    try {
      console.log("[ScanModal] handleStartScan", { projectName, selectedSource, fileCount: files.length, codeLen: codeContent.length, pastedLen: pastedCode.length });

      if (!projectName.trim()) {
        setScanError("Project name is required");
        return;
      }

      const unsupportedArchive = files.find(f => isOtherArchive(f.name));
      if (unsupportedArchive) {
        setScanError("TAR uploads are not supported yet — upload a ZIP instead.");
        return;
      }
      if (files.some(f => isZipArchive(f.name))) {
        return handleQueueBackground();
      }

      const finalCode = selectedSource === "paste-code" ? pastedCode : codeContent;

      if (!finalCode && !url && selectedSource !== "github" && selectedSource !== "docker") {
        setScanError("Please upload files, paste code, or provide a repository URL");
        return;
      }

      // Foreground payload guard — Supabase Edge caps request bodies well
      // below 6MB when JSON-encoded. If the source is huge, push to background
      // instead of hitting an opaque 413 mid-scan.
      if (finalCode && finalCode.length > 3_500_000) {
        setScanError("Source is large (>3.5MB). Use 'Run in background & email me' — it streams via storage and survives WiFi drops.");
        return;
      }

      // Same BYOK gate as background — foreground previously fell through
      // to the edge and users saw a raw 403 instead of the friendly dialog.
      const { blocked } = await resolveByokOrGate();
      if (blocked) return;

      const sourceType = selectedSource || "upload";
      const project = await createProject(projectName, sourceType, url || undefined);
      if (!project) { setScanError("Failed to create project — check console"); return; }

      const githubUrl = (selectedSource === "github-url" || selectedSource === "paste-url") ? url : undefined;

      if (onScanStarted) {
        console.log("[ScanModal] starting live scan", { projectId: project.id });
        try {
          startLiveScan({
            projectId: project.id,
            projectName,
            codeContent: finalCode,
            fileName: files[0]?.name || projectName,
            scanProfile: selectedProfile,
            includeWorkflowFunctionFlaws,
            sourceType,
            fileCount: files.length || (finalCode ? 1 : 0),
            githubUrl,
          });
        } catch (innerErr: any) {
          console.error("[ScanModal] startLiveScan threw", innerErr);
          setScanError("Live scan init failed: " + (innerErr?.message || String(innerErr)));
          return;
        }
        onScanComplete();
        onScanStarted(project.id);
        resetState();
        return;
      }

      const result = await runScan(project.id, finalCode, files[0]?.name || projectName, selectedProfile, githubUrl, includeWorkflowFunctionFlaws);
      if (result) {
        onScanComplete();
        onClose();
        resetState();
      }
    } catch (e: any) {
      console.error("[ScanModal] handleStartScan failed", e);
      setScanError(e?.message || String(e) || "Unknown error starting scan");
      toast.error("Scan failed to start: " + (e?.message || String(e)));
    }
  };

  const handleQueueBackground = async () => {
    setScanError(null);
    if (!projectName.trim()) { setScanError("Project name is required"); return; }
    const finalCode = selectedSource === "paste-code" ? pastedCode : codeContent;
    const archiveFile = files.find(f => isOtherArchive(f.name));
    const zipFile = files.find(f => isZipArchive(f.name));
    if (archiveFile) { setScanError("TAR uploads are not supported yet — upload a ZIP instead."); return; }
    if (!finalCode && !url && !zipFile) { setScanError("Upload files, paste code, or provide a repo URL"); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setScanError("Sign in required"); return; }

    // Shared gate — same behaviour as foreground path.
    const { byok, blocked } = await resolveByokOrGate();
    if (blocked) return;

    const sourceType = selectedSource || "upload";
    const project = await createProject(projectName, sourceType, url || undefined);
    if (!project) return;

    adoptQueuedScan({
      projectId: project.id,
      projectName,
      fileName: files[0]?.name || projectName,
      scanProfile: selectedProfile,
      sourceType: zipFile ? "zip-upload" : sourceType,
      fileCount: files.length || 1,
      percent: 1,
      message: zipFile
        ? "Uploading extracted ZIP source — hold on…"
        : "Packaging source for cloud scan — hold on…",
    });

    onScanComplete();
    if (onScanStarted) {
      onScanStarted(project.id);
    } else {
      onClose();
    }

    const githubUrl = (selectedSource === "github-url" || selectedSource === "paste-url") ? url : undefined;
    const sanitize = (s: string) =>
      s.replace(/\u0000/g, "")
       .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
       .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "$1");
    const safeCode = finalCode ? sanitize(finalCode) : null;
    let sourceStoragePath: string | null = null;

    // Upload extracted text, not the raw ZIP. The stored object MUST be named
    // as text; the worker uses file extension as a last-resort type signal.
    if (safeCode) {
      sourceStoragePath = `${user.id}/${project.id}/${crypto.randomUUID()}.source.txt`;
      const uploadPayload = new Blob([safeCode], { type: "text/plain;charset=utf-8" });
      const { error: uploadErr } = await supabase.storage
        .from("zerlal-scan-sources")
        .upload(sourceStoragePath, uploadPayload, {
          upsert: false,
          contentType: "text/plain; charset=utf-8",
        });
      if (uploadErr) {
        const message = "Failed to upload scan source: " + (uploadErr.message || JSON.stringify(uploadErr));
        setScanError(message);
        failScan(project.id, message);
        toast.error(message);
        return;
      }
      adoptQueuedScan({
        projectId: project.id,
        projectName,
        fileName: files[0]?.name || projectName,
        scanProfile: selectedProfile,
        sourceType: zipFile ? "zip-upload" : sourceType,
        fileCount: files.length || 1,
        percent: 8,
        message: zipFile ? "ZIP source uploaded — queueing cloud scan now…" : "Source uploaded — queueing cloud scan now…",
      });
    } else if (zipFile) {
      sourceStoragePath = `${user.id}/${project.id}/${crypto.randomUUID()}.zip`;
      const { error: uploadErr } = await supabase.storage
        .from("zerlal-scan-sources")
        .upload(sourceStoragePath, zipFile, {
          upsert: false,
          contentType: zipFile.type || "application/zip",
        });
      if (uploadErr) {
        const message = "Failed to upload ZIP source: " + (uploadErr.message || JSON.stringify(uploadErr));
        setScanError(message);
        failScan(project.id, message);
        toast.error(message);
        return;
      }
      adoptQueuedScan({
        projectId: project.id,
        projectName,
        fileName: zipFile.name,
        scanProfile: selectedProfile,
        sourceType: "zip-upload",
        fileCount: files.length || 1,
        percent: 8,
        message: "Raw ZIP uploaded — cloud extractor will unpack it…",
      });
    }

    const payload: Record<string, unknown> = {
      user_id: user.id,
      project_id: project.id,
      project_name: projectName,
      scan_profile: selectedProfile,
      file_name: files[0]?.name || projectName,
      github_url: githubUrl || null,
      code_content: safeCode && safeCode.length <= 300_000 ? safeCode : null,
      source_storage_path: sourceStoragePath,
      include_workflow_function_flaws: includeWorkflowFunctionFlaws,
      recipient_email: user.email,
      status: "pending",
    };
    if (byok) payload.byok = byok;

    const { error: insErr } = await supabase.from("zerlal_background_jobs" as any).insert(payload);
    if (insErr) {
      const msg = insErr.message || JSON.stringify(insErr);
      setScanError("Failed to queue background scan: " + msg + (safeCode ? ` (payload ~${Math.round(safeCode.length/1024)}KB)` : ""));
      failScan(project.id, `Failed to queue background scan: ${msg}`);
      toast.error("Failed to queue background scan: " + msg);
      return;
    }

    void supabase.functions.invoke("zerlal-bg-worker", { body: {} }).catch((err) => {
      console.warn("[ScanModal] zerlal-bg-worker kick failed", err);
    });

    adoptQueuedScan({
      projectId: project.id,
      projectName,
      fileName: files[0]?.name || projectName,
      scanProfile: selectedProfile,
      sourceType: zipFile ? "zip-upload" : sourceType,
      fileCount: files.length || 1,
      percent: 12,
      message: "Scan accepted — cloud worker is starting now…",
    });
    toast.success("Scan queued in cloud — live progress streaming. You can close this tab; we'll email the report.");
    resetState();
  };

  const resetState = () => {
    setStep(1);
    setSelectedSource(null);
    setSelectedProfile("security-audit");
    setIncludeWorkflowFunctionFlaws(false);
    setUrl("");
    setProjectName("");
    setFiles([]);
    setCodeContent("");
    setPastedCode("");
    setScanError(null);
  };

  if (!open) return null;

  const isBusy = creating || scanning || isProcessing;

  // Step-1 readiness: name + a selected source + a source-appropriate input,
  // so users cannot click Next into a scan that will fail at Step 3.
  const isStep1Ready = () => {
    if (!projectName.trim() || !selectedSource) return false;
    switch (selectedSource) {
      case "upload":
      case "dependency":
        return files.length > 0;
      case "paste-code":
        return pastedCode.trim().length > 0;
      case "github-url":
        return /github\.com/i.test(url);
      case "paste-url":
        return /(github|gitlab|bitbucket)\.(com|org)/i.test(url);
      default:
        return false; // coming-soon sources
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border/[0.08] bg-card/95 backdrop-blur-md shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/[0.06] shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-light text-foreground/80 tracking-wide">New Scan</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3].map((s) => (
                <div key={s} className={`w-6 h-0.5 rounded-full ${step >= s ? "bg-foreground/30" : "bg-foreground/[0.06]"}`} />
              ))}
            </div>
          </div>
          <button onClick={() => { onClose(); resetState(); }} className="p-1 text-muted-foreground/30 hover:text-foreground/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-muted-foreground/40 uppercase tracking-wider block mb-2">Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="my-codebase"
                  className="w-full px-3 py-2 rounded-lg bg-foreground/[0.03] border border-border/[0.06] text-[10px] text-foreground/70 placeholder:text-muted-foreground/20 focus:outline-none focus:border-foreground/10"
                />
              </div>

              <div>
                <h3 className="text-[10px] text-muted-foreground/40 uppercase tracking-wider mb-2">Select Source</h3>
                <div className="grid grid-cols-4 gap-2">
                  {sources.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => !s.comingSoon && setSelectedSource(s.id)}
                      disabled={!!s.comingSoon}
                      title={s.comingSoon ? "Coming soon" : s.desc}
                      className={`relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                        s.comingSoon
                          ? "border-border/[0.04] opacity-40 cursor-not-allowed"
                          : selectedSource === s.id
                          ? "border-foreground/15 bg-foreground/[0.04]"
                          : "border-border/[0.06] hover:border-foreground/10 hover:bg-foreground/[0.02]"
                      }`}
                    >
                      {s.comingSoon && (
                        <span className="absolute top-1 right-1 text-[6px] px-1 py-0.5 rounded bg-foreground/[0.08] text-muted-foreground/50 uppercase tracking-wider">Soon</span>
                      )}
                      <s.icon className="h-4 w-4 text-foreground/40" />
                      <span className="text-[8px] text-foreground/50 text-center leading-tight">{s.label}</span>
                      <span className="text-[7px] text-muted-foreground/25 text-center leading-tight">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedSource && (
                <div className="space-y-2">
                  {(selectedSource === "upload" || selectedSource === "dependency") && (
                    <div
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border/[0.08] rounded-xl p-6 text-center cursor-pointer hover:border-foreground/10 transition-colors"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".zip,.tar,.gz,.js,.ts,.tsx,.jsx,.py,.go,.rs,.java,.php,.rb,.c,.cpp,.h,.json,.yaml,.yml,.xml,.toml,.tf,.md,.txt,.css,.html,.vue,.svelte,.swift,.kt,.cs,.sh,.bat,.sql,.r,.scala,.dart,.lua,.zig,.hcl,.dockerfile,.env,.gitignore,.lock,.sum,.mod,.cfg,.ini,.properties,.gradle"
                        onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                        className="hidden"
                      />
                      {isProcessing ? (
                        <Loader2 className="h-5 w-5 text-foreground/30 mx-auto mb-2 animate-spin" />
                      ) : (
                        <Upload className="h-5 w-5 text-muted-foreground/20 mx-auto mb-2" />
                      )}
                      {files.length > 0 ? (
                        <div>
                          <p className="text-[10px] text-foreground/50">{files.length} file(s) selected</p>
                          <p className="text-[8px] text-muted-foreground/30 mt-1">{files.map(f => f.name).join(", ")}</p>
                          {files.some(f => /\.(zip|tar|tar\.gz|tgz)$/i.test(f.name)) && (
                            <p className="text-[8px] text-emerald-400/60 mt-2">☁ Archive will upload to cloud — scan continues even if you lose WiFi.</p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p className="text-[10px] text-muted-foreground/30">Drop ZIP/TAR archives, code files, or dependency manifests</p>
                          <p className="text-[8px] text-muted-foreground/20 mt-1">Up to ~5MB text • 260 files max • archives extracted server-side</p>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedSource === "paste-code" && (
                    <textarea
                      value={pastedCode}
                      onChange={(e) => setPastedCode(e.target.value)}
                      placeholder="Paste your code here for instant analysis..."
                      rows={8}
                      className="w-full px-3 py-2 rounded-lg bg-foreground/[0.03] border border-border/[0.06] text-[10px] text-foreground/70 placeholder:text-muted-foreground/20 focus:outline-none focus:border-foreground/10 font-mono resize-none"
                    />
                  )}

                  {(selectedSource === "github-url" || selectedSource === "paste-url") && (
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={selectedSource === "github-url" ? "https://github.com/owner/repo" : "https://gitlab.com/owner/repo or any Git URL"}
                      className="w-full px-3 py-2 rounded-lg bg-foreground/[0.03] border border-border/[0.06] text-[10px] text-foreground/70 placeholder:text-muted-foreground/20 focus:outline-none focus:border-foreground/10"
                    />
                  )}

                  {selectedSource === "api-endpoint" && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://api.example.com/v1 or paste Swagger/OpenAPI spec URL"
                        className="w-full px-3 py-2 rounded-lg bg-foreground/[0.03] border border-border/[0.06] text-[10px] text-foreground/70 placeholder:text-muted-foreground/20 focus:outline-none focus:border-foreground/10"
                      />
                      <p className="text-[8px] text-muted-foreground/25">Probes every endpoint for IDOR, auth bypass, injection, and rate limit flaws</p>
                    </div>
                  )}

                  {(selectedSource === "github" || selectedSource === "docker") && (
                    <div className="text-[10px] text-muted-foreground/30 p-3 rounded-lg bg-foreground/[0.02] border border-border/[0.04]">
                      {selectedSource === "github" ? "GitHub OAuth connection — click Next to authenticate" : "Docker registry connection — click Next to configure"}
                    </div>
                  )}

                  {selectedSource === "binary" && (
                    <div
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border/[0.08] rounded-xl p-6 text-center cursor-pointer hover:border-foreground/10 transition-colors"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".exe,.dll,.so,.dylib,.elf,.bin,.o,.a,.wasm,.apk,.ipa,.deb,.rpm"
                        onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                        className="hidden"
                      />
                      <Binary className="h-5 w-5 text-muted-foreground/20 mx-auto mb-2" />
                      {files.length > 0 ? (
                        <div>
                          <p className="text-[10px] text-foreground/50">{files[0].name}</p>
                          <p className="text-[8px] text-muted-foreground/30 mt-1">Binary will be reverse-engineered and scanned</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[10px] text-muted-foreground/30">Upload compiled binaries (.exe, .dll, .so, .elf, .wasm, .apk)</p>
                          <p className="text-[8px] text-muted-foreground/20 mt-1">ZERLAL reverse-engineers, reconstructs pseudo-source, then hunts vulnerabilities</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <h3 className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Scan Profile</h3>
              {scanProfiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProfile(p.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selectedProfile === p.id
                      ? "border-foreground/15 bg-foreground/[0.04]"
                      : "border-border/[0.06] hover:border-foreground/10"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-foreground/60">{p.name}</span>
                    <span className="text-[8px] text-muted-foreground/25">{p.time}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/30 mt-0.5">{p.desc}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {p.includes.map((inc) => (
                      <span key={inc} className="text-[7px] px-1.5 py-0.5 rounded bg-foreground/[0.03] text-muted-foreground/30">{inc}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Confirm & Start</h3>
              
              <div className="rounded-xl border border-border/[0.06] bg-foreground/[0.02] p-4 space-y-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground/40">Project</span>
                  <span className="text-foreground/60">{projectName}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground/40">Source</span>
                  <span className="text-foreground/60">{sources.find(s => s.id === selectedSource)?.label || selectedSource}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground/40">Profile</span>
                  <span className="text-foreground/60">{scanProfiles.find(p => p.id === selectedProfile)?.name}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground/40">Scope</span>
                  <span className="text-foreground/60">{includeWorkflowFunctionFlaws ? "Security + Workflow/Function" : "Security only"}</span>
                </div>
                {files.length > 0 && (
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground/40">Files</span>
                    <span className="text-foreground/60">{files.length} file(s)</span>
                  </div>
                )}
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground/40">Code Size</span>
                  <span className="text-foreground/60">{((selectedSource === "paste-code" ? pastedCode.length : codeContent.length) / 1024).toFixed(1)} KB</span>
                </div>
              </div>

              {progress && (
                <div className="rounded-xl border border-border/[0.08] bg-foreground/[0.02] p-3 space-y-2">
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-foreground/60 uppercase tracking-wider">
                      {progress.phase === "scanning"
                        ? `Section ${progress.section}/${progress.totalSections}`
                        : progress.phase}
                    </span>
                    <span className="text-muted-foreground/50">{progress.percent}%</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-foreground/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-foreground/40 transition-all duration-300 ease-out"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground/50 leading-tight">{progress.message}</p>
                  <div className="flex items-center justify-between text-[8px] text-muted-foreground/30">
                    <span>{progress.providerLabel || ""}</span>
                    <span>
                      {typeof progress.findingsSoFar === "number" ? `${progress.findingsSoFar} findings` : ""}
                      {progress.breakRemaining ? ` · cooldown ${progress.breakRemaining}s` : ""}
                    </span>
                  </div>
                </div>
              )}

              {scanError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/[0.05] border border-red-500/[0.1]">
                  <AlertTriangle className="h-3 w-3 text-red-400" />
                  <span className="text-[10px] text-red-400">{scanError}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-border/[0.06] hover:bg-foreground/[0.02] cursor-pointer">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-3 w-3 text-muted-foreground/30" />
                    <span className="text-[10px] text-foreground/50">Find workflow + function flaws</span>
                  </div>
                  <input type="checkbox" checked={includeWorkflowFunctionFlaws} onChange={(e) => setIncludeWorkflowFunctionFlaws(e.target.checked)} className="w-3 h-3 rounded accent-foreground/30" />
                </label>
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-border/[0.06] hover:bg-foreground/[0.02] cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3 w-3 text-muted-foreground/30" />
                    <span className="text-[10px] text-foreground/50">Email on completion</span>
                  </div>
                  <input type="checkbox" defaultChecked className="w-3 h-3 rounded accent-foreground/30" />
                </label>
                <label className="flex items-center justify-between p-2.5 rounded-xl border border-border/[0.06] hover:bg-foreground/[0.02] cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Bell className="h-3 w-3 text-red-400/50" />
                    <span className="text-[10px] text-foreground/50">Immediate alert on critical findings</span>
                  </div>
                  <input type="checkbox" defaultChecked className="w-3 h-3 rounded accent-foreground/30" />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/[0.06] shrink-0">
          <button
            onClick={() => step > 1 ? setStep((step - 1) as Step) : onClose()}
            className="text-[10px] text-muted-foreground/30 hover:text-foreground/50"
            disabled={isBusy}
          >
            {step > 1 ? "← Back" : "Cancel"}
          </button>
          <div className="flex items-center gap-2">
            {step === 3 && (
              <button
                onClick={handleQueueBackground}
                disabled={isBusy}
                title="Runs on our servers. Survives WiFi drops, browser close, sleep mode. Result emailed when done."
                className="px-3 py-1.5 rounded-lg border border-border/[0.1] text-[10px] text-foreground/55 hover:bg-foreground/[0.04] transition-colors disabled:opacity-30 flex items-center gap-1"
              >
                <CloudOff className="h-3 w-3" /> Run in background & email me
              </button>
            )}
            <button
              onClick={() => {
                if (step < 3) setStep((step + 1) as Step);
                else handleStartScan();
              }}
              disabled={(step === 1 && !isStep1Ready()) || isBusy}
              className="px-4 py-1.5 rounded-lg bg-foreground/[0.08] text-[10px] text-foreground/60 hover:bg-foreground/[0.12] transition-colors disabled:opacity-30 flex items-center gap-1"
            >
              {isBusy ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> {scanning ? "Scanning..." : "Processing..."}</>
              ) : step === 3 ? (
                <><Check className="h-3 w-3" /> Start Scan</>
              ) : (
                <>Next <ChevronRight className="h-3 w-3" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScanModal;
