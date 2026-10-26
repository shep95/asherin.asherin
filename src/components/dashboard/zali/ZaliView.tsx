import React, { useState, useEffect, useRef, useCallback } from "react";
import { Atom, AlertTriangle, MessageCircle, X, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsV2 } from "@/lib/dashboardUiContext";
import type { ZaliProject, ZaliMessage, ZaliTab } from "./types";
import type { ChatMode } from "../types";
import type { ResponseDepth } from "../DepthSelector";
import ZaliWorkspace from "./ZaliWorkspace";
import ZaliChatPanel from "./ZaliChatPanel";
import { extractZanoemCodeFiles } from "./zanoemOutput";
import ZaliResearchPanel from "./ZaliResearchPanel";
import ZaliProjectSelector from "./ZaliProjectSelector";
import ZaliSpecsPanel from "./ZaliSpecsPanel";
import MaterialIntelligencePanel from "./MaterialIntelligencePanel";
import ComponentLibraryPanel from "./ComponentLibraryPanel";
import ZaliAnalysisPanel from "./ZaliAnalysisPanel";
import { attachToSpec, buildDesignDirective, extractResearchFindings, type ResearchFinding, type SpecListKey } from "./zaliPrompt";
import { redact } from "@/lib/zanoem/redact";
import { extractDesignOutput } from "@/lib/zanoem/designOutputSchema";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// A panel that throws must not take the room down with it.
class ZaliErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error("[asherin.design] panel error:", error); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-12">
          <AlertTriangle className="h-10 w-10 text-destructive/40" />
          <div className="text-center">
            <p className="text-sm font-light text-foreground">this panel hit an error</p>
            <button onClick={() => this.setState({ hasError: false })} className="text-xs text-accent mt-2 hover:underline">try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const TABS: { id: ZaliTab; label: string }[] = [
  { id: "workspace", label: "workspace" },
  { id: "specs", label: "specs" },
  { id: "materials", label: "materials" },
  { id: "components", label: "components" },
  { id: "analysis", label: "analysis" },
  { id: "research", label: "research" },
];

const STREAM_TIMEOUT_MS = 120_000;
const CHAT_WIDTH_KEY = "zali_chat_width";
const MIN_CHAT = 260;
const MAX_CHAT = 600;

const clampWidth = (n: number) => Math.max(MIN_CHAT, Math.min(MAX_CHAT, n));
const readChatWidth = () => {
  try {
    const saved = localStorage.getItem(CHAT_WIDTH_KEY);
    return saved ? clampWidth(parseInt(saved, 10) || 360) : 360;
  } catch { return 360; }
};
const writeChatWidth = (n: number) => { try { localStorage.setItem(CHAT_WIDTH_KEY, String(n)); } catch { /* private mode */ } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapProject = (p: any): ZaliProject => ({
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
  updatedAt: new Date(p.updated_at || p.created_at),
});

const ZaliView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isV2 = useIsV2();
  const [projects, setProjects] = useState<ZaliProject[]>([]);
  const [activeProject, setActiveProject] = useState<ZaliProject | null>(null);
  const [messages, setMessages] = useState<ZaliMessage[]>([]);
  const [findings, setFindings] = useState<ResearchFinding[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<ZaliTab>("workspace");
  const [loading, setLoading] = useState(true);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [chatDepth, setChatDepth] = useState<ResponseDepth>("standard");
  const abortRef = useRef<AbortController | null>(null);
  const [autoBuildModel, setAutoBuildModel] = useState(false);
  const [codeFiles, setCodeFiles] = useState<Array<{ filename: string; language: string; content: string }>>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [lastTurnFailedAt, setLastTurnFailedAt] = useState<number | null>(null);
  const lastUserPromptRef = useRef<string>("");
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  // Streaming re-renders `messages` many times a second; every sendMessage
  // needs the conversation as it stood before the new turn, so read a ref.
  const messagesRef = useRef<ZaliMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Abort an in-flight stream on unmount so nothing sets state on a dead tree.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Escape closes the phone chat overlay and the delete dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deleteTarget) { setDeleteTarget(null); return; }
      if (showMobileChat) setShowMobileChat(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMobileChat, deleteTarget]);

  // On a phone the tab strip scrolls; keep the active tab in view.
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeTab]);

  // Resizable chat panel (desktop only).
  const [chatWidth, setChatWidth] = useState(readChatWidth);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { dragCleanupRef.current?.(); }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = chatWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => setChatWidth(clampWidth(startWidth + (startX - ev.clientX)));
    const cleanup = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      dragCleanupRef.current = null;
    };
    const onUp = () => {
      cleanup();
      setChatWidth((w) => { writeChatWidth(w); return w; });
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    dragCleanupRef.current = cleanup;
  }, [chatWidth]);

  // Load projects from the device store.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("zali_projects")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) toast({ title: "could not read projects", description: error.message, variant: "destructive" });
      if (data) {
        const mapped = data.map(mapProject);
        setProjects(mapped);
        setActiveProject((cur) => cur ?? mapped[0] ?? null);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user, toast]);

  // Load the conversation and findings when the project changes.
  useEffect(() => {
    if (!activeProject || !user) { setMessages([]); setFindings([]); return; }
    let cancelled = false;
    const loadMessages = async () => {
      const { data } = await supabase
        .from("zali_messages")
        .select("*")
        .eq("project_id", activeProject.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
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
      if (cancelled) return;
      if (research) {
        setFindings(research.map((r) => ({ domain: r.domain, title: r.title })));
      }
    };
    loadMessages();
    return () => { cancelled = true; };
  }, [activeProject?.id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const createProject = useCallback(async (name: string, designType: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("zali_projects")
      .insert({ user_id: user.id, name, design_type: designType, phase: "understanding", status: "active", updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error || !data) {
      toast({ title: "could not create the project", description: error?.message, variant: "destructive" });
      return;
    }
    const p = mapProject(data);
    setProjects((prev) => [p, ...prev]);
    setActiveProject(p);
    setMessages([]);
    setFindings([]);
    setCodeFiles([]);
    setAutoBuildModel(false);
    setActiveTab("workspace");
    toast({ title: "project created", description: name });
  }, [user, toast]);

  // Two-step delete: the selector asks, the dialog confirms, then we delete
  // the project AND its rows — the device store has no cascade.
  const deleteProject = useCallback((id: string) => {
    const target = projects.find((p) => p.id === id);
    if (target) setDeleteTarget({ id: target.id, name: target.name });
  }, [projects]);

  const confirmDeleteProject = useCallback(async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const { error } = await supabase.from("zali_projects").delete().eq("id", id);
    if (error) {
      toast({ title: "delete failed", description: error.message, variant: "destructive" });
      return;
    }
    await Promise.all([
      supabase.from("zali_messages").delete().eq("project_id", id),
      supabase.from("zali_research").delete().eq("project_id", id),
      supabase.from("zali_analyses").delete().eq("project_id", id),
    ]);
    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);
    if (activeProject?.id === id) setActiveProject(remaining[0] ?? null);
    toast({ title: "project deleted" });
  }, [deleteTarget, activeProject, projects, toast]);

  const renameProject = useCallback(async (id: string, name: string) => {
    const { error } = await supabase.from("zali_projects").update({ name }).eq("id", id);
    if (error) { toast({ title: "rename failed", description: error.message, variant: "destructive" }); return; }
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, name } : p));
    setActiveProject((prev) => prev && prev.id === id ? { ...prev, name } : prev);
  }, [toast]);

  /** Materials / components tabs push an item into the active project's spec. */
  const attachToProject = useCallback(async (key: SpecListKey, name: string): Promise<boolean> => {
    if (!activeProject) { toast({ title: "pick a project first" }); return false; }
    const { specs, added } = attachToSpec(activeProject.specifications, key, name);
    if (!added) { toast({ title: `already in ${activeProject.name}` }); return false; }
    const { error } = await supabase.from("zali_projects").update({ specifications: specs }).eq("id", activeProject.id);
    if (error) { toast({ title: "could not save", description: error.message, variant: "destructive" }); return false; }
    const id = activeProject.id;
    setActiveProject((p) => p && p.id === id ? { ...p, specifications: specs } : p);
    setProjects((prev) => prev.map((p) => p.id === id ? { ...p, specifications: specs } : p));
    setAutoBuildModel(true);
    toast({ title: `added to ${activeProject.name}`, description: "it is in the workspace viewport now." });
    return true;
  }, [activeProject, toast]);

  const sendMessage = useCallback(async (content: string) => {
    if (!activeProject || !user || isStreaming) return;

    lastUserPromptRef.current = content;
    setLastTurnFailedAt(null);

    const userMsgId = crypto.randomUUID();
    const userMsg: ZaliMessage = {
      id: userMsgId, projectId: activeProject.id, role: "user",
      content, metadata: {}, createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    await supabase.from("zali_messages").insert({
      id: userMsgId, project_id: activeProject.id, user_id: user.id, role: "user", content,
    });

    setIsStreaming(true);
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, {
      id: assistantId, projectId: activeProject.id, role: "assistant",
      content: "", metadata: {}, createdAt: new Date(),
    }]);

    // Two ways to stop: the stop button, or a wall clock. Both tear the
    // fetch down; the wall clock also tells the operator what happened.
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort(new DOMException("timeout", "AbortError"));
    }, STREAM_TIMEOUT_MS);

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
    const scheduleFlush = () => { if (!rafId) rafId = window.requestAnimationFrame(flushToState); };
    const settle = () => { if (rafId) { window.cancelAnimationFrame(rafId); } flushToState(); };

    try {
      const history = [...messagesRef.current, userMsg].map((m) => ({ role: m.role, content: m.content }));

      // Optional operator brain (settings → brains), scrubbed of secrets.
      let brainText = "";
      let activeBrainId: string | null = null;
      try { activeBrainId = localStorage.getItem("aureon_active_brain_id"); } catch { /* private mode */ }
      if (activeBrainId) {
        try {
          const { data: brain } = await supabase.from("brains").select("system_prompt, file_ids").eq("id", activeBrainId).single();
          if (brain) {
            const parts: string[] = [redact(brain.system_prompt || "").text];
            if (brain.file_ids?.length) {
              const { data: files } = await supabase.from("library_files").select("file_name, storage_path, file_type").in("id", brain.file_ids);
              const textFiles = (files ?? []).filter((f) => !/^(image|video|audio)\//.test(f.file_type || ""));
              const downloaded = await Promise.all(textFiles.map(async (f) => {
                try {
                  const { data: blob } = await supabase.storage.from("library").download(f.storage_path);
                  return blob ? { name: f.file_name, raw: (await blob.text()).slice(0, 40_000) } : null;
                } catch { return null; }
              }));
              let budget = 200_000;
              for (const d of downloaded) {
                if (!d || budget <= 0) continue;
                const slice = redact(d.raw).text.slice(0, budget);
                budget -= slice.length;
                parts.push(`--- ${d.name}\n${slice}`);
              }
            }
            brainText = parts.filter(Boolean).join("\n");
          }
        } catch (e) { console.warn("[asherin.design] brain context skipped:", e); }
      }

      // The operator's own libraries, so shepherd designs with what is on hand.
      const [{ data: mats }, { data: comps }] = await Promise.all([
        supabase.from("zali_materials").select("name").eq("user_id", user.id),
        supabase.from("zali_components").select("name").eq("user_id", user.id),
      ]);
      const library = {
        materials: (mats ?? []).map((m) => String(m.name)).filter(Boolean).slice(0, 40),
        components: (comps ?? []).map((c) => String(c.name)).filter(Boolean).slice(0, 40),
      };

      const directive = [buildDesignDirective(activeProject, library), brainText ? `[OPERATOR BRAIN]\n${brainText}` : ""]
        .filter(Boolean).join("\n\n");

      const { streamChat } = await import("@/lib/ai");
      await streamChat({
        messages: [
          { role: "user", content: directive },
          { role: "assistant", content: "understood." },
          ...history,
        ],
        mode: "chat" as ChatMode,
        depth: chatDepth,
        signal: controller.signal,
        onDelta: (delta: string) => { pending += delta; scheduleFlush(); },
        onReplace: (text: string) => { pending = ""; fullContent = text; setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: text } : m)); },
        onDone: () => undefined,
      });
      settle();

      await supabase.from("zali_messages").insert({
        id: assistantId, project_id: activeProject.id, user_id: user.id, role: "assistant", content: fullContent,
      });

      // Code → workspace. Only switch tabs when the current one has no surface for it.
      const allFiles = extractZanoemCodeFiles(fullContent);
      if (allFiles.length > 0) {
        setCodeFiles(allFiles);
        setActiveTab((cur) => (cur === "workspace" || cur === "specs" || cur === "research") ? cur : "workspace");
      }

      // Validated ```design_output → the project record.
      const designResult = extractDesignOutput(fullContent);
      if (designResult) {
        const rejectedReason = designResult.ok === true ? null : designResult.reason;
        if (designResult.ok === true) {
          const d = designResult.data;
          const patch: Record<string, unknown> = {};
          if (d.phase) patch.phase = d.phase;
          if (d.design_type) patch.design_type = d.design_type;
          if (d.specifications) patch.specifications = d.specifications;
          if (d.cost_analysis) patch.cost_analysis = d.cost_analysis;
          if (d.manufacturing) patch.manufacturing = d.manufacturing;
          if (d.simulation_results) patch.simulation_results = d.simulation_results;
          if (Object.keys(patch).length > 0) {
            const { error } = await supabase.from("zali_projects").update(patch).eq("id", activeProject.id);
            if (error) toast({ title: "spec not saved", description: error.message, variant: "destructive" });
            const apply = (p: ZaliProject): ZaliProject => ({
              ...p,
              phase: d.phase ?? p.phase,
              designType: d.design_type ?? p.designType,
              specifications: d.specifications ?? p.specifications,
              costAnalysis: d.cost_analysis ?? p.costAnalysis,
              manufacturing: d.manufacturing ?? p.manufacturing,
              simulationResults: d.simulation_results ?? p.simulationResults,
            });
            setActiveProject((prev) => prev && prev.id === activeProject.id ? apply(prev) : prev);
            setProjects((prev) => prev.map((p) => p.id === activeProject.id ? apply(p) : p));
            setAutoBuildModel(true);
            setActiveTab((cur) => (cur === "workspace" || cur === "specs") ? cur : "workspace");
          }
        } else {
          console.warn("[asherin.design] rejected design_output:", rejectedReason);
          toast({ title: "spec update ignored", description: rejectedReason ?? "unreadable design_output" });
        }
      }

      // "show me the model" style requests open the viewport.
      if (/\b(build|generate|create|show|render|visualize|visualise)\b.*\b(3d|model|design|prototype|viewport)\b/i.test(content)) {
        setAutoBuildModel(true);
        setActiveTab((cur) => (cur === "workspace" || cur === "specs") ? cur : "workspace");
      }

      // [RESEARCH: domain] lines become findings.
      const found = extractResearchFindings(fullContent);
      if (found.length) {
        setFindings((prev) => {
          const seen = new Set(prev.map((f) => `${f.domain}|${f.title.toLowerCase()}`));
          return [...prev, ...found.filter((f) => !seen.has(`${f.domain}|${f.title.toLowerCase()}`))];
        });
        await supabase.from("zali_research").insert(found.map((f) => ({
          project_id: activeProject.id, user_id: user.id, domain: f.domain, title: f.title,
        })));
      }
    } catch (err) {
      const e = err as { name?: string; message?: string };
      settle();
      if (e?.name === "AbortError") {
        // Keep whatever arrived, so the operator can read it and continue.
        if (fullContent.trim()) {
          await supabase.from("zali_messages").insert({
            id: assistantId, project_id: activeProject.id, user_id: user.id, role: "assistant", content: fullContent,
          });
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
        if (timedOut) {
          toast({ title: "shepherd stopped after two minutes", description: "what arrived is kept. send again to continue." });
        }
      } else {
        console.error("[asherin.design] turn failed:", err);
        toast({ title: "shepherd could not answer", description: e?.message || "unknown error", variant: "destructive" });
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        setLastTurnFailedAt(Date.now());
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [activeProject, user, isStreaming, toast, chatDepth]);

  const retryLastTurn = useCallback(() => {
    const last = lastUserPromptRef.current;
    if (!last || isStreaming) return;
    setLastTurnFailedAt(null);
    void sendMessage(last);
  }, [sendMessage, isStreaming]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case "specs":
        return <ZaliSpecsPanel project={activeProject} messages={messages} />;
      case "materials":
        return <MaterialIntelligencePanel project={activeProject} projects={projects} onAttach={(name) => attachToProject("materials", name)} />;
      case "components":
        return <ComponentLibraryPanel project={activeProject} projects={projects} onAttach={(name) => attachToProject("components", name)} />;
      case "analysis":
        return <ZaliAnalysisPanel project={activeProject} />;
      case "research":
        return <ZaliResearchPanel project={activeProject} findings={findings} />;
      case "workspace":
      default:
        return <ZaliWorkspace project={activeProject} autoBuild={autoBuildModel} codeFiles={codeFiles} />;
    }
  };

  const chatPanel = (
    <ZaliChatPanel
      messages={messages}
      project={activeProject}
      isStreaming={isStreaming}
      onSend={sendMessage}
      onStop={stopStreaming}
      depth={chatDepth}
      onDepthChange={setChatDepth}
    />
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-3" role="status" aria-live="polite">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <span className="text-[11px] font-extralight text-muted-foreground/60">reading projects on this device…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header: title (hidden under the v.2 shell, which owns it), tabs, phone chat toggle */}
      <div className="flex-shrink-0 border-b border-border/20 bg-card/20 backdrop-blur-sm px-3 sm:px-6 py-2 sm:py-3">
        {!isV2 && (
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <Atom className="h-4 w-4 sm:h-5 sm:w-5 text-accent" aria-hidden="true" />
              <div>
                <h1 className="text-sm sm:text-lg font-extralight text-foreground">asherin.design</h1>
                <p className="text-[9px] sm:text-[10px] font-extralight text-muted-foreground/60 hidden sm:block">
                  a design workspace on this device · shepherd as design partner
                </p>
              </div>
            </div>
            <span className="hidden sm:inline text-[10px] font-extralight text-muted-foreground/50">stored on this device</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="design workspace sections" className="flex-1 min-w-0 flex gap-0.5 sm:gap-1 overflow-x-auto pb-0.5 scrollbar-none -mx-1 px-1 aureon-scroll-fade">
            {TABS.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={selected ? activeTabRef : null}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-light transition-colors flex-shrink-0 active:scale-95 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                    selected
                      ? "bg-foreground/10 text-foreground border border-border/30"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground border border-transparent"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => setShowMobileChat(!showMobileChat)}
            aria-label={showMobileChat ? "close conversation" : "open conversation"}
            className="md:hidden p-2 rounded-lg border border-border/20 text-muted-foreground hover:text-foreground transition-colors relative active:scale-95 flex-shrink-0"
          >
            <MessageCircle className="h-4 w-4" />
            {messages.length > 0 && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent" />}
          </button>
        </div>
      </div>

      <ZaliProjectSelector
        projects={projects}
        activeProject={activeProject}
        onSelect={setActiveProject}
        onCreate={createProject}
        onDelete={deleteProject}
        onRename={renameProject}
      />

      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <div className="flex-1 min-w-0 overflow-hidden">
          <ZaliErrorBoundary key={activeTab}>
            {renderTabContent()}
          </ZaliErrorBoundary>
        </div>

        {/* Desktop: resizable chat panel */}
        <div className="hidden md:flex flex-shrink-0 relative">
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="resize conversation panel"
            aria-valuenow={chatWidth}
            aria-valuemin={MIN_CHAT}
            aria-valuemax={MAX_CHAT}
            tabIndex={0}
            onMouseDown={handleDragStart}
            onKeyDown={(e) => {
              let next: number | null = null;
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                const step = e.shiftKey ? 64 : 32;
                next = clampWidth(chatWidth + (e.key === "ArrowLeft" ? step : -step));
              } else if (e.key === "Home") next = MIN_CHAT;
              else if (e.key === "End") next = MAX_CHAT;
              if (next === null) return;
              e.preventDefault();
              setChatWidth(next);
              writeChatWidth(next);
            }}
            className="absolute left-0 top-0 bottom-0 w-2 z-10 cursor-col-resize group flex items-center justify-center hover:bg-accent/10 focus:bg-accent/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-colors -translate-x-1/2"
            title="drag or use ←/→ to resize"
          >
            <div className="w-0.5 h-8 rounded-full bg-border/30 group-hover:bg-accent/50 group-focus:bg-accent/70 transition-colors" />
          </div>
          <div style={{ width: chatWidth }} className="border-l border-border/20 flex flex-col overflow-hidden">
            {lastTurnFailedAt && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-destructive/30 bg-destructive/10 text-[10px] text-destructive" role="alert">
                <span className="flex-1">last turn failed.</span>
                <button onClick={retryLastTurn} className="flex items-center gap-1 px-2 py-0.5 rounded border border-destructive/40 hover:bg-destructive/20">
                  <RotateCcw className="h-3 w-3" /> retry
                </button>
              </div>
            )}
            <ZaliErrorBoundary>{chatPanel}</ZaliErrorBoundary>
          </div>
        </div>

        {/* Phone: full-screen chat overlay */}
        {showMobileChat && (
          <div className="absolute inset-0 z-30 bg-background/98 backdrop-blur-md flex flex-col md:hidden" role="dialog" aria-label="conversation">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/20 flex-shrink-0">
              <h3 className="text-xs font-light tracking-[0.15em] text-muted-foreground">conversation</h3>
              <button onClick={() => setShowMobileChat(false)} aria-label="close conversation" className="p-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors active:scale-95">
                <X className="h-4 w-4" />
              </button>
            </div>
            {lastTurnFailedAt && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-destructive/30 bg-destructive/10 text-[10px] text-destructive" role="alert">
                <span className="flex-1">last turn failed.</span>
                <button onClick={retryLastTurn} className="flex items-center gap-1 px-2 py-0.5 rounded border border-destructive/40 hover:bg-destructive/20">
                  <RotateCcw className="h-3 w-3" /> retry
                </button>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-hidden">
              <ZaliErrorBoundary>{chatPanel}</ZaliErrorBoundary>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-light lowercase">delete this project?</AlertDialogTitle>
            <AlertDialogDescription className="lowercase">
              &quot;{deleteTarget?.name}&quot; and every message, finding and analysis attached to it will be removed from this device. this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="lowercase">cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 lowercase">
              delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ZaliView;
