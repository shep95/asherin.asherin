import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { GripVertical, Download, Shield } from "lucide-react";
import { Atom, AlertTriangle, MessageCircle, X, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { ZaliProject, ZaliMessage, ZaliTab } from "./types";
import type { ChatMode } from "../types";
import type { ResponseDepth } from "../DepthSelector";
import ZaliWorkspace from "./ZaliWorkspace";
import ZaliChatPanel from "./ZaliChatPanel";
import { extractZanoemCodeFiles } from "./zanoemOutput";
import ZaliResearchPanel from "./ZaliResearchPanel";
import ZaliProjectSelector from "./ZaliProjectSelector";
import ZaliAgentsPanel from "./ZaliAgentsPanel";
import ZaliSpecsPanel from "./ZaliSpecsPanel";
import CommunityView from "./CommunityView";
import MaterialIntelligencePanel from "./MaterialIntelligencePanel";
import ComponentLibraryPanel from "./ComponentLibraryPanel";
import SimulationEnginePanel from "./SimulationEnginePanel";
import ManufacturingVerifyPanel from "./ManufacturingVerifyPanel";
import OptimizationPanel from "./OptimizationPanel";
import GodModePanel from "./GodModePanel";
import EncryptionBadge from "../EncryptionBadge";
import React from "react";
import { isOwnerEmail } from "@/lib/adminEmail";
import { redact } from "@/lib/zanoem/redact";
import { readOpenAiSseStream } from "@/lib/zanoem/sseParse";
import { extractDesignOutput } from "@/lib/zanoem/designOutputSchema";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Error boundary for ZALI panels
class ZaliErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error("ZALI panel error:", error); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-12">
          <AlertTriangle className="h-10 w-10 text-destructive/40" />
          <div className="text-center">
            <p className="text-sm font-light text-foreground">Something went wrong</p>
            <button onClick={() => this.setState({ hasError: false })} className="text-xs text-accent mt-2 hover:underline">Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const TABS: { id: ZaliTab; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "specs", label: "Specs" },
  { id: "materials-db", label: "Materials DB" },
  { id: "components", label: "Components" },
  { id: "sim-engine", label: "Simulations" },
  { id: "mfg-verify", label: "Manufacturing" },
  { id: "optimization", label: "Optimize" },
  { id: "agents", label: "Agents" },
  { id: "research", label: "Research" },
  { id: "god-mode", label: "God Mode" },
  { id: "community", label: "Community" },
];
const ZaliView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = isOwnerEmail(user?.email);
  const [downloading, setDownloading] = useState(false);
  const [projects, setProjects] = useState<ZaliProject[]>([]);
  const [activeProject, setActiveProject] = useState<ZaliProject | null>(null);
  const [messages, setMessages] = useState<ZaliMessage[]>([]);
  const [findings, setFindings] = useState<Array<{ domain: string; title: string; confidence: number }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<ZaliTab>("workspace");
  const [loading, setLoading] = useState(true);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("chat");
  const [chatDepth, setChatDepth] = useState<ResponseDepth>("standard");
  const abortRef = useRef<AbortController | null>(null);
  const [autoBuildModel, setAutoBuildModel] = useState(false);
  const [modelPrompt, setModelPrompt] = useState("");
  const [codeFiles, setCodeFiles] = useState<Array<{ filename: string; language: string; content: string }>>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [lastTurnFailedAt, setLastTurnFailedAt] = useState<number | null>(null);
  const lastUserPromptRef = useRef<string>("");

  // History-via-ref: streaming tokens re-render `messages` many times per
  // second, but every `sendMessage` needs the frozen conversation as it
  // stood BEFORE the new user turn. Reading from a ref eliminates the
  // stale-closure race the previous `[...messages, userMsg]` had.
  const messagesRef = useRef<ZaliMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Abort any in-flight stream when the component unmounts so we never
  // call `setMessages` on an unmounted tree (fixes the console warning
  // and the associated memory leak).
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Escape closes the mobile chat overlay + delete-confirm dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deleteTarget) { setDeleteTarget(null); return; }
      if (showMobileChat) setShowMobileChat(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMobileChat, deleteTarget]);

  // codeFiles is now derived exclusively from the post-stream branch;
  // the previous message-scan useEffect was removed because it raced
  // with the fresh stream write.

  // Resizable chat panel state
  const [chatWidth, setChatWidth] = useState(() => {
    const saved = localStorage.getItem("zali_chat_width");
    return saved ? Math.max(260, Math.min(600, parseInt(saved, 10))) : 360;
  });
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = chatWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartX.current - ev.clientX;
      const newWidth = Math.max(260, Math.min(600, dragStartWidth.current + delta));
      setChatWidth(newWidth);
    };
    const onUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setChatWidth((w) => {
        localStorage.setItem("zali_chat_width", String(w));
        return w;
      });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [chatWidth]);

  // Load projects
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("zali_projects")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (data) {
        const mapped: ZaliProject[] = data.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || "",
          designType: p.design_type || "general",
          phase: (p.phase as ZaliProject["phase"]) || "understanding",
          status: p.status || "active",
          researchDomains: [],
          specifications: (p.specifications as Record<string, unknown>) || {},
          costAnalysis: (p.cost_analysis as Record<string, unknown>) || {},
          manufacturing: (p.manufacturing as Record<string, unknown>) || {},
          simulationResults: (p.simulation_results as Record<string, unknown>) || {},
          createdAt: new Date(p.created_at),
          updatedAt: new Date(p.updated_at),
        }));
        setProjects(mapped);
        if (mapped.length > 0 && !activeProject) setActiveProject(mapped[0]);
      }
      setLoading(false);
    };
    load();
  }, [user]);

  // Load messages when project changes
  useEffect(() => {
    if (!activeProject || !user) { setMessages([]); setFindings([]); return; }
    const loadMessages = async () => {
      const { data } = await supabase
        .from("zali_messages")
        .select("*")
        .eq("project_id", activeProject.id)
        .order("created_at", { ascending: true });

      if (data) {
        setMessages(data.map((m) => ({
          id: m.id,
          projectId: m.project_id,
          role: m.role as "user" | "assistant",
          content: m.content,
          metadata: (m.metadata as Record<string, unknown>) || {},
          createdAt: new Date(m.created_at),
        })));
      }

      const { data: research } = await supabase
        .from("zali_research")
        .select("*")
        .eq("project_id", activeProject.id)
        .order("created_at", { ascending: true });

      if (research) {
        setFindings(research.map((r) => ({
          domain: r.domain,
          title: r.title,
          confidence: Number(r.confidence) || 0,
        })));
      }
    };
    loadMessages();
  }, [activeProject, user]);

  // Realtime subscription for messages.
  // Ignore INSERTs authored by the current session — those are already
  // in local state via the optimistic write in sendMessage, and the
  // realtime echo was clobbering the in-flight streaming bubble.
  useEffect(() => {
    if (!activeProject || !user) return;
    const myUid = user.id;
    const channel = supabase
      .channel(`zali-msgs-${activeProject.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "zali_messages",
        filter: `project_id=eq.${activeProject.id}`,
      }, (payload) => {
        const m = payload.new as any;
        if (m?.user_id === myUid) return; // our own write — ignore echo
        setMessages((prev) => {
          if (prev.some((msg) => msg.id === m.id)) return prev;
          return [...prev, {
            id: m.id,
            projectId: m.project_id,
            role: m.role,
            content: m.content,
            metadata: m.metadata || {},
            createdAt: new Date(m.created_at),
          }];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeProject, user]);

  const createProject = useCallback(async (name: string, designType: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("zali_projects")
      .insert({ user_id: user.id, name, design_type: designType })
      .select()
      .single();

    if (error) {
      console.error("Create project error:", error);
      toast({ title: "Error creating project", description: error.message, variant: "destructive" });
      return;
    }

    if (data) {
      const p: ZaliProject = {
        id: data.id, name: data.name, description: "", designType: data.design_type || "general",
        phase: "understanding", status: "active", researchDomains: [],
        specifications: {}, costAnalysis: {}, manufacturing: {}, simulationResults: {},
        createdAt: new Date(data.created_at), updatedAt: new Date(data.updated_at),
      };
      setProjects((prev) => [p, ...prev]);
      setActiveProject(p);
      setMessages([]);
      setFindings([]);
      toast({ title: "Project created", description: name });
    }
  }, [user, toast]);

  // Two-step delete: the selector calls deleteProject → we open the
  // confirm dialog → confirmDeleteProject actually deletes. Fixes the
  // "one misclick nukes a project" UX flaw.
  const deleteProject = useCallback((id: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    setDeleteTarget({ id: target.id, name: target.name });
  }, [projects]);

  const confirmDeleteProject = useCallback(async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const { error } = await supabase.from("zali_projects").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setProjects((prev) => {
      const remaining = prev.filter((p) => p.id !== id);
      if (activeProject?.id === id) setActiveProject(remaining[0] || null);
      return remaining;
    });
    toast({ title: "Project deleted" });
  }, [deleteTarget, activeProject, toast]);

  const renameProject = useCallback(async (id: string, name: string) => {
    await supabase.from("zali_projects").update({ name }).eq("id", id);
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, name } : p));
    if (activeProject?.id === id) setActiveProject((prev) => prev ? { ...prev, name } : null);
  }, [activeProject]);

  const sendMessage = useCallback(async (content: string) => {
    if (!activeProject || !user || isStreaming) return;

    // Require a live session — the previous anon-key fallback led to a
    // silent 401 that the user only saw as "HTTP 401" in the toast.
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    if (!accessToken) {
      toast({ title: "Sign in required", description: "Please sign in again to continue.", variant: "destructive" });
      return;
    }

    lastUserPromptRef.current = content;
    setLastTurnFailedAt(null);

    const userMsgId = crypto.randomUUID();
    const userMsg: ZaliMessage = {
      id: userMsgId, projectId: activeProject.id, role: "user",
      content, metadata: {}, createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    await supabase.from("zali_messages").insert({
      id: userMsgId, project_id: activeProject.id, user_id: user.id,
      role: "user", content,
    });

    setIsStreaming(true);
    const assistantId = crypto.randomUUID();
    const assistantMsg: ZaliMessage = {
      id: assistantId, projectId: activeProject.id, role: "assistant",
      content: "", metadata: {}, createdAt: new Date(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    // Two-headed abort: user Stop button OR 60s wall-clock. Either one
    // tears the fetch AND the SSE reader down (see readOpenAiSseStream).
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(new DOMException("timeout", "AbortError")), 60_000);

    try {
      // Read history from ref so streaming re-renders can't create a
      // stale snapshot mid-turn (fixes L1).
      const history = [...messagesRef.current, userMsg].map((m) => ({
        role: m.role, content: m.content,
      }));

      let brainContext: { prompt: string; fileContents: { name: string; content: string }[] } | null = null;
      const activeBrainId = localStorage.getItem("aureon_active_brain_id");
      if (activeBrainId) {
        try {
          const { data: brain } = await supabase.from("brains").select("system_prompt, file_ids").eq("id", activeBrainId).single();
          if (brain) {
            const fileContents: { name: string; content: string }[] = [];
            if (brain.file_ids?.length) {
              const { data: files } = await supabase.from("library_files").select("file_name, storage_path, file_type").in("id", brain.file_ids);
              if (files) {
                // Parallel download instead of the previous 6× serial round-trip.
                // Cap each file at 40 KB and the total budget at 200 KB so a
                // huge brain can't blow the prompt window or the fetch payload.
                const textFiles = files.filter((f) => !f.file_type.startsWith("image/")
                  && !f.file_type.startsWith("video/") && !f.file_type.startsWith("audio/"));
                const downloaded = await Promise.all(textFiles.map(async (f) => {
                  try {
                    const { data: blob } = await supabase.storage.from("library").download(f.storage_path);
                    if (!blob) return null;
                    return { name: f.file_name, raw: (await blob.text()).slice(0, 40_000) };
                  } catch { return null; }
                }));
                let totalBudget = 200_000;
                let scrubHits = 0;
                for (const d of downloaded) {
                  if (!d || totalBudget <= 0) continue;
                  const { text, hits } = redact(d.raw);
                  scrubHits += hits;
                  const slice = text.slice(0, totalBudget);
                  totalBudget -= slice.length;
                  fileContents.push({ name: d.name, content: slice });
                }
                if (scrubHits > 0) {
                  console.info(`[zanoem] scrubbed ${scrubHits} potential secret(s) from brain files`);
                }
              }
            }
            const scrubbedPrompt = redact(brain.system_prompt || "").text;
            brainContext = { prompt: scrubbedPrompt, fileContents };
          }
        } catch (e) { console.error("Failed to load ZANOEM brain context:", e); }
      }

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/zali-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            messages: history,
            mode: chatMode,
            depth: chatDepth,
            projectContext: {
              name: activeProject.name,
              description: activeProject.description,
              phase: activeProject.phase,
              designType: activeProject.designType,
            },
            brainContext,
          }),
          signal: controller.signal,
        }
      );

      if (!resp.ok) {
        // Enumerate the failure classes so users see a useful message,
        // and honour Retry-After when the edge function is rate-limited.
        if (resp.status === 429) {
          const wait = Number(resp.headers.get("Retry-After") || "0");
          throw new Error(wait > 0 ? `Rate limited — try again in ${wait}s` : "Rate limited — try again shortly");
        }
        if (resp.status === 401 || resp.status === 403) throw new Error("Auth expired — please refresh and sign in again.");
        throw new Error(`Chat backend error (HTTP ${resp.status})`);
      }
      if (!resp.body) throw new Error("No response body");

      // Batch token appends into one setState per animation frame — the
      // previous per-token setState caused thousands of O(N) reconciliations
      // on long replies (fixes P3).
      let fullContent = "";
      let pending = "";
      let rafId = 0;
      const flushToState = () => {
        rafId = 0;
        if (!pending) return;
        fullContent += pending;
        pending = "";
        const snapshot = fullContent;
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: snapshot } : m));
      };
      const scheduleFlush = () => {
        if (rafId) return;
        rafId = window.requestAnimationFrame(flushToState);
      };

      await readOpenAiSseStream(resp.body, {
        signal: controller.signal,
        onToken: (delta) => { pending += delta; scheduleFlush(); },
      });
      if (rafId) { window.cancelAnimationFrame(rafId); flushToState(); }
      else if (pending) flushToState();

      await supabase.from("zali_messages").insert({
        id: assistantId, project_id: activeProject.id, user_id: user.id,
        role: "assistant", content: fullContent,
      });

      // Code output → workspace, but ONLY switch tabs when the user is on
      // a tab that has no direct output surface. Fixes the "get yanked to
      // Workspace mid-read" UX flaw.
      const allFiles = extractZanoemCodeFiles(fullContent);
      if (allFiles.length > 0) {
        setCodeFiles(allFiles);
        setActiveTab((cur) => (cur === "workspace" || cur === "specs" || cur === "research") ? cur : "workspace");
      }

      // Validated design_output → apply. Rejects hallucinated shapes,
      // enforces size cap, whitelists enums (fixes S3 + L5).
      const designResult = extractDesignOutput(fullContent);
      if (designResult) {
        if (designResult.ok) {
          const designData = designResult.data;
          const updatePayload: Record<string, unknown> = {};
          if (designData.phase) updatePayload.phase = designData.phase;
          if (designData.design_type) updatePayload.design_type = designData.design_type;
          if (designData.specifications) updatePayload.specifications = designData.specifications;
          if (designData.cost_analysis) updatePayload.cost_analysis = designData.cost_analysis;
          if (designData.manufacturing) updatePayload.manufacturing = designData.manufacturing;
          if (designData.simulation_results) updatePayload.simulation_results = designData.simulation_results;
          if (Object.keys(updatePayload).length > 0) {
            await supabase.from("zali_projects").update(updatePayload).eq("id", activeProject.id);
            setActiveProject((prev) => prev ? {
              ...prev,
              phase: designData.phase ?? prev.phase,
              designType: designData.design_type ?? prev.designType,
              specifications: designData.specifications ?? prev.specifications,
              costAnalysis: designData.cost_analysis ?? prev.costAnalysis,
              manufacturing: designData.manufacturing ?? prev.manufacturing,
              simulationResults: designData.simulation_results ?? prev.simulationResults,
            } : prev);
            setProjects((prev) => prev.map((p) => p.id === activeProject.id ? {
              ...p,
              phase: designData.phase ?? p.phase,
              designType: designData.design_type ?? p.designType,
              specifications: designData.specifications ?? p.specifications,
              costAnalysis: designData.cost_analysis ?? p.costAnalysis,
              manufacturing: designData.manufacturing ?? p.manufacturing,
              simulationResults: designData.simulation_results ?? p.simulationResults,
            } : p));
            setAutoBuildModel(true);
            setActiveTab((cur) => (cur === "workspace" || cur === "specs") ? cur : "workspace");
          }
        } else {
          const reason = (designResult as { ok: false; reason: string }).reason;
          console.warn("[zanoem] rejected design_output:", reason);
          toast({ title: "Design update ignored", description: reason });
        }
      }

      // Detect user build commands — auto-trigger the 3D build.
      const buildCommandRegex = /\b(build|generate|create|show|render|visualize)\b.*\b(3d|model|design|prototype|viewport)\b/i;
      const lastUserContent = content.toLowerCase();
      if (buildCommandRegex.test(lastUserContent)) {
        setAutoBuildModel(true);
        setActiveTab((cur) => (cur === "workspace" || cur === "specs") ? cur : "workspace");
      }

      // "Make it / design it …" description — apply once, then clear so a
      // stale directive from turn 3 doesn't keep re-driving the model on
      // unrelated later turns (fixes L2 + B3).
      const describeMatch = lastUserContent.match(/(?:make it|design it|style it|model should be|i want it to look)\s+(.+)/i);
      if (describeMatch) {
        setModelPrompt(describeMatch[1].trim());
        window.setTimeout(() => setModelPrompt(""), 4000);
      }

      // Research-tag scan. Regexes are built fresh each turn — the previous
      // module-level /gi patterns kept `lastIndex` state across calls and
      // silently missed matches on the second use (fixes L3).
      const researchPatterns = [
        { source: "\\[RESEARCH[:\\s][^\\]]*\\]", domain: "general" },
        { source: "\\[OPTIMUS\\]", domain: "physics" },
        { source: "\\[CHEMIX\\]", domain: "chemistry" },
        { source: "\\[BIOX\\]", domain: "biology" },
        { source: "\\[SYNTHIA\\]", domain: "manufacturing" },
        { source: "\\[ECONIA\\]", domain: "economics" },
        { source: "\\[ETHICA\\]", domain: "safety" },
      ];
      for (const p of researchPatterns) {
        const re = new RegExp(p.source, "i");
        if (!re.test(fullContent)) continue;
        const finding = { domain: p.domain, title: `${p.domain} analysis from conversation`, confidence: 0.8 };
        setFindings((prev) => [...prev, finding]);
        await supabase.from("zali_research").insert({
          project_id: activeProject.id, user_id: user.id,
          domain: p.domain, title: finding.title, confidence: finding.confidence,
        });
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("ZALI chat error:", err);
        toast({ title: "Turn failed", description: err.message, variant: "destructive" });
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setLastTurnFailedAt(Date.now());
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [activeProject, user, isStreaming, toast, chatMode, chatDepth]);

  const retryLastTurn = useCallback(() => {
    const last = lastUserPromptRef.current;
    if (!last || isStreaming) return;
    setLastTurnFailedAt(null);
    void sendMessage(last);
  }, [sendMessage, isStreaming]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case "workspace":
        return <ZaliWorkspace project={activeProject} autoBuild={autoBuildModel} modelPrompt={modelPrompt} codeFiles={codeFiles} />;
      case "specs":
        return <ZaliSpecsPanel project={activeProject} />;
      case "materials-db":
        return <MaterialIntelligencePanel />;
      case "components":
        return <ComponentLibraryPanel />;
      case "sim-engine":
        return <SimulationEnginePanel project={activeProject} />;
      case "mfg-verify":
        return <ManufacturingVerifyPanel project={activeProject} />;
      case "optimization":
        return <OptimizationPanel project={activeProject} />;
      case "agents":
        return <ZaliAgentsPanel />;
      case "research":
        return <ZaliResearchPanel project={activeProject} findings={findings} />;
      case "god-mode":
        return <GodModePanel />;
      case "community":
        return <CommunityView />;
      default:
        return <ZaliWorkspace project={activeProject} autoBuild={autoBuildModel} modelPrompt={modelPrompt} codeFiles={codeFiles} />;
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border/20 bg-card/20 backdrop-blur-sm px-3 sm:px-6 py-2.5 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Atom className="h-4 w-4 sm:h-5 sm:w-5 text-accent" />
            <div>
              <h1 className="text-sm sm:text-lg font-extralight text-foreground">asherin.design</h1>
              <p className="text-[9px] sm:text-[10px] font-extralight text-muted-foreground/60 uppercase hidden sm:block">
                zali design intelligence
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Admin blueprint download */}
            {isAdmin && (
              <button
                onClick={async () => {
                  setDownloading(true);
                  try {
                    const res = await fetch("/docs/ZALI_BLUEPRINT.md");
                    const text = await res.text();
                    const blob = new Blob([text], { type: "text/markdown" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "ZALI_BLUEPRINT_INTERNAL.md";
                    a.click();
                    URL.revokeObjectURL(url);
                  } finally {
                    setDownloading(false);
                  }
                }}
                disabled={downloading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-accent/30 bg-accent/10 text-accent text-[10px] sm:text-xs font-light tracking-wide hover:bg-accent/20 transition-colors disabled:opacity-50"
                title="Download ZANOEM Blueprint (Admin Only)"
              >
                <Shield className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <Download className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">{downloading ? "Downloading..." : "Blueprint"}</span>
              </button>
            )}
            {/* Mobile chat toggle */}
            <button
              onClick={() => setShowMobileChat(!showMobileChat)}
              className="md:hidden p-2 rounded-lg border border-border/20 text-muted-foreground hover:text-foreground transition-colors relative active:scale-95"
            >
              <MessageCircle className="h-4 w-4" />
              {messages.length > 0 && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent" />
              )}
            </button>
            {/* EncryptionBadge is now visible on every viewport — mobile
                users previously had zero trust signal (fixes U6). */}
            <div className="flex">
              <EncryptionBadge />
            </div>
          </div>
        </div>

        {/* Tabs - scrollable on mobile with edge fade */}
        <div className="mt-2 sm:mt-4 flex gap-0.5 sm:gap-1 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1 aureon-scroll-fade">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-light transition-colors flex-shrink-0 active:scale-95 ${
                activeTab === tab.id
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/25"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground border border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Project selector - inline below header */}
      <ZaliProjectSelector
        projects={projects}
        activeProject={activeProject}
        onSelect={setActiveProject}
        onCreate={createProject}
        onDelete={deleteProject}
        onRename={renameProject}
      />

      {/* Main content */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* Left: Tab content */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <ZaliErrorBoundary key={activeTab}>
            {renderTabContent()}
          </ZaliErrorBoundary>
        </div>

        {/* Desktop: Resizable Chat panel */}
        <div className="hidden md:flex flex-shrink-0 relative">
          {/* Drag handle — WAI-ARIA separator with keyboard support. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize chat panel"
            aria-valuenow={chatWidth}
            aria-valuemin={260}
            aria-valuemax={600}
            tabIndex={0}
            onMouseDown={handleDragStart}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                const step = e.shiftKey ? 64 : 32;
                const dir = e.key === "ArrowLeft" ? 1 : -1;
                setChatWidth((w) => {
                  const next = Math.max(260, Math.min(600, w + dir * step));
                  localStorage.setItem("zali_chat_width", String(next));
                  return next;
                });
              } else if (e.key === "Home") {
                e.preventDefault();
                setChatWidth(260); localStorage.setItem("zali_chat_width", "260");
              } else if (e.key === "End") {
                e.preventDefault();
                setChatWidth(600); localStorage.setItem("zali_chat_width", "600");
              }
            }}
            className="absolute left-0 top-0 bottom-0 w-2 z-10 cursor-col-resize group flex items-center justify-center hover:bg-accent/10 focus:bg-accent/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-colors -translate-x-1/2"
            title="Drag or use ←/→ to resize chat"
          >
            <div className="w-0.5 h-8 rounded-full bg-border/30 group-hover:bg-accent/50 group-focus:bg-accent/70 transition-colors" />
          </div>
          <div style={{ width: chatWidth }} className="border-l border-border/20 flex flex-col overflow-hidden">
            {lastTurnFailedAt && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-destructive/30 bg-destructive/10 text-[10px] text-destructive">
                <span className="flex-1">Last turn failed.</span>
                <button
                  onClick={retryLastTurn}
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-destructive/40 hover:bg-destructive/20"
                >
                  <RotateCcw className="h-3 w-3" /> Retry
                </button>
              </div>
            )}
            <ZaliErrorBoundary>
              <ZaliChatPanel
                messages={messages}
                project={activeProject}
                isStreaming={isStreaming}
                onSend={sendMessage}
                onStop={stopStreaming}
                mode={chatMode}
                onModeChange={setChatMode}
                depth={chatDepth}
                onDepthChange={setChatDepth}
              />
            </ZaliErrorBoundary>
          </div>
        </div>

        {/* Mobile: Chat overlay - full screen with safe areas */}
        {showMobileChat && (
          <div className="absolute inset-0 z-30 bg-background/98 backdrop-blur-md flex flex-col md:hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 flex-shrink-0">
              <h3 className="text-xs font-light tracking-[0.15em] text-muted-foreground uppercase">Conversation</h3>
              <button
                onClick={() => setShowMobileChat(false)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
               <ZaliChatPanel
                messages={messages}
                project={activeProject}
                isStreaming={isStreaming}
                onSend={sendMessage}
                onStop={stopStreaming}
                mode={chatMode}
                onModeChange={setChatMode}
                depth={chatDepth}
                onDepthChange={setChatDepth}
              />
            </div>
          </div>
        )}
      </div>

      {/* Delete-project confirmation — replaces the previous
          "one-misclick nukes a project" flow (fixes U5). */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; and every message, spec, and research
              finding attached to it will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ZaliView;