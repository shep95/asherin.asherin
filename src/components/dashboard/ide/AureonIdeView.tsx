import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Code2, PanelLeftClose, PanelLeftOpen, Globe, FileCode, FolderKanban, Save, Loader2, Download, Search, Terminal as TerminalIcon, MessageSquare, ChevronDown, ChevronUp, MoreHorizontal, Plus, Bot } from "lucide-react";

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import IdeFileTree, { type IdeFile, getLanguage } from "./IdeFileTree";
import IdeCodeEditor from "./IdeCodeEditor";
import IdeTerminal from "./IdeTerminal";
import IdePreviewPanel from "./IdePreviewPanel";
import IdeSessionManager, { type IdeSession } from "./IdeSessionManager";
import IdeSearchPanel from "./IdeSearchPanel";
import IdeQuickOpen from "./IdeQuickOpen";
import IdeGitPanel from "./IdeGitPanel";
import IdeAgentsPanel from "./IdeAgentsPanel";
import { detectCrash, buildCrashPrompt, type CrashEvent } from "@/lib/ide/crashHook";
import { streamChat, fetchSuggestions } from "@/lib/ai";
import { useCodeRag } from "@/hooks/useCodeRag";
import {
  IdeHistoryPanel,
  IdeErrorExplainer,
  IdeTemplateLauncher,
  IdeFuzzyFinder,
  IdeApprovalGate,
  IdeModelRouterBadge,
  IdeValidatorBadge,
  IdeCheckpointPanel,
  IdeModeToggle,
  IdeChangedFilesPanel,
  type PlannedChange,
} from "@/components/ide-shared";
import { readIdeMode, type IdeMode } from "@/components/ide-shared/IdeModeToggle";
import { changedFiles } from "@/lib/ide";
import { snapshotIfChanged, routeTask, animateInsert, animateReplace, type IdeModelId, type RoutingDecision } from "@/lib/ide";
import { saveCheckpoint } from "@/lib/ide/checkpoints";
import { History, Stethoscope, Wand2, GitCommit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { emitPull } from "@/lib/connect/emitPull";
import { extractZanoemCodeFiles, type ZanoemCodeFile } from "@/components/dashboard/zali/zanoemOutput";
import { IDE_HANDOFF_EVENT, takeIdeHandoff, requestReturnToChat, type IdeHandoff } from "@/lib/ide/chatHandoff";

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

type CenterTab = "code" | "preview";
type MobilePanel = "explorer" | "editor" | "terminal";
type LeftTab = "files" | "search" | "sessions" | "git" | "agents";

const STARTER_FILES: IdeFile[] = [
  {
    id: "src", name: "src", type: "folder", children: [
      { id: "app", name: "App.tsx", type: "file", content: `import React from "react";\n\nfunction App() {\n  return (\n    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">\n      <h1 className="text-4xl font-bold">Hello World</h1>\n    </div>\n  );\n}\n\nexport default App;` },
      { id: "main", name: "main.tsx", type: "file", content: `import React from "react";\nimport ReactDOM from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\n\nReactDOM.createRoot(document.getElementById("root")!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);` },
      { id: "css", name: "index.css", type: "file", content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nbody {\n  margin: 0;\n  font-family: Inter, sans-serif;\n}` },
    ],
  },
  { id: "pkg", name: "package.json", type: "file", content: `{\n  "name": "asherin-project",\n  "version": "1.0.0",\n  "scripts": {\n    "dev": "vite",\n    "build": "vite build"\n  },\n  "dependencies": {\n    "react": "^18.3.1",\n    "react-dom": "^18.3.1"\n  },\n  "devDependencies": {\n    "vite": "^5.4.0",\n    "@vitejs/plugin-react": "^4.3.0",\n    "tailwindcss": "^3.4.0",\n    "typescript": "^5.5.0"\n  }\n}` },
  { id: "tsconfig", name: "tsconfig.json", type: "file", content: `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "jsx": "react-jsx",\n    "strict": true\n  }\n}` },
  { id: "indexhtml", name: "index.html", type: "file", content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>asherin project</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>` },
];

const EMPTY_PROJECT_FILES: IdeFile[] = [];

function flattenFiles(files: IdeFile[]): IdeFile[] {
  const result: IdeFile[] = [];
  for (const f of files) {
    if (f.type === "file") result.push(f);
    if (f.children) result.push(...flattenFiles(f.children));
  }
  return result;
}

function normalizeGeneratedFilePath(path: string): string | null {
  const cleaned = String(path || "")
    .replace(/[`'"<>]/g, "")
    .replace(/^\s*(?:file|path|filename)\s*:\s*/i, "")
    .replace(/^\.?\//, "")
    .replace(/\\/g, "/")
    .trim();
  if (!cleaned || cleaned.includes("..") || cleaned.endsWith("/")) return null;
  return cleaned;
}

function responseLooksCutOff(text: string): boolean {
  if (!text) return false;
  if (/GENERATION_INCOMPLETE|MAX_TOKENS|finish_reason\s*[:=]\s*(?:length|max_tokens)/i.test(text)) return true;
  if (((text.match(/```/g) || []).length % 2) === 1) return true;
  if (/\{\s*"files"\s*:\s*\[/i.test(text) && !/\]\s*}\s*```?\s*$/s.test(text.trim())) return true;
  if (/\b(import|export|const|let|function|class|return)\b[^\n]*$/i.test(text.trim()) && !/[;})\]`.]\s*$/.test(text.trim())) return true;
  return false;
}

function applyGeneratedFilesToTree(tree: IdeFile[], generated: ZanoemCodeFile[]): { next: IdeFile[]; primaryId: string | null; applied: number } {
  const clone = JSON.parse(JSON.stringify(tree)) as IdeFile[];
  let primaryId: string | null = null;
  let applied = 0;

  const collectByName = (nodes: IdeFile[], name: string, acc: IdeFile[] = []): IdeFile[] => {
    for (const node of nodes) {
      if (node.type === "file" && node.name === name) acc.push(node);
      if (node.children) collectByName(node.children, name, acc);
    }
    return acc;
  };

  const updateById = (nodes: IdeFile[], id: string, content: string): boolean => {
    for (const node of nodes) {
      if (node.id === id && node.type === "file") {
        node.content = content;
        node.language = getLanguage(node.name);
        return true;
      }
      if (node.children && updateById(node.children, id, content)) return true;
    }
    return false;
  };

  const upsertAtPath = (nodes: IdeFile[], parts: string[], content: string): string => {
    const [head, ...rest] = parts;
    if (!head) return "";
    if (rest.length === 0) {
      let file = nodes.find((n) => n.type === "file" && n.name === head);
      if (!file) {
        file = { id: crypto.randomUUID(), name: head, type: "file", language: getLanguage(head), content };
        nodes.push(file);
      } else {
        file.content = content;
        file.language = getLanguage(head);
      }
      return file.id;
    }
    let folder = nodes.find((n) => n.type === "folder" && n.name === head);
    if (!folder) {
      folder = { id: crypto.randomUUID(), name: head, type: "folder", children: [] };
      nodes.push(folder);
    }
    folder.children ||= [];
    return upsertAtPath(folder.children, rest, content);
  };

  for (const file of generated) {
    const normalized = normalizeGeneratedFilePath(file.filename);
    if (!normalized || !file.content?.trim()) continue;
    const parts = normalized.split("/").filter(Boolean);
    const basename = parts[parts.length - 1];
    let id: string | null = null;

    if (parts.length === 1) {
      const existing = collectByName(clone, basename);
      if (existing.length === 1) {
        id = existing[0].id;
        updateById(clone, id, file.content);
      }
    }

    if (!id) id = upsertAtPath(clone, parts, file.content);
    if (id) {
      primaryId ||= id;
      applied += 1;
    }
  }

  return { next: clone, primaryId, applied };
}

// Credit system
const MAX_CREDITS_PER_HOUR = 200;

function useCredits() {
  const [credits, setCredits] = useState<{ timestamps: number[] }>({ timestamps: [] });
  const getRemaining = useCallback(() => {
    const now = Date.now();
    const hourAgo = now - 3600_000;
    return MAX_CREDITS_PER_HOUR - credits.timestamps.filter(t => t > hourAgo).length;
  }, [credits]);
  const useCredit = useCallback(() => {
    const now = Date.now();
    const hourAgo = now - 3600_000;
    setCredits(prev => ({ timestamps: [...prev.timestamps.filter(t => t > hourAgo), now] }));
  }, []);
  return { remaining: getRemaining(), useCredit, maxCredits: MAX_CREDITS_PER_HOUR };
}

const AureonIdeView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { remaining: creditsRemaining, useCredit, maxCredits } = useCredits();

  // Session state
  const [sessions, setSessions] = useState<IdeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // File state
  const [files, setFiles] = useState<IdeFile[]>(EMPTY_PROJECT_FILES);
  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Undo/Redo
  const fileHistoryRef = useRef<IdeFile[][]>([EMPTY_PROJECT_FILES]);
  const historyIndexRef = useRef(0);
  const skipHistoryRef = useRef(false);

  const pushHistory = useCallback((newFiles: IdeFile[]) => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    const next = fileHistoryRef.current.slice(0, historyIndexRef.current + 1);
    next.push(JSON.parse(JSON.stringify(newFiles)));
    if (next.length > 100) next.shift();
    fileHistoryRef.current = next;
    historyIndexRef.current = next.length - 1;
  }, []);

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    skipHistoryRef.current = true;
    setFiles(JSON.parse(JSON.stringify(fileHistoryRef.current[historyIndexRef.current])));
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= fileHistoryRef.current.length - 1) return;
    historyIndexRef.current += 1;
    skipHistoryRef.current = true;
    setFiles(JSON.parse(JSON.stringify(fileHistoryRef.current[historyIndexRef.current])));
  }, []);

  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => pushHistory(files), 1000);
    return () => { if (historyTimerRef.current) clearTimeout(historyTimerRef.current); };
  }, [files, pushHistory]);

  // Refs used outside React's render cycle.
  const filesRefAureon = useRef(files);
  const lastAssistantRef = useRef<string>("");
  useEffect(() => { filesRefAureon.current = files; }, [files]);



  // Panel state — simplified defaults
  const [leftOpen, setLeftOpen] = useState(!isMobile);
  const [rightOpen, setRightOpen] = useState(false); // chat panel hidden by default
  const [bottomOpen, setBottomOpen] = useState(false); // Terminal hidden by default
  const [centerTab, setCenterTab] = useState<CenterTab>("code");

  // Chat vs Agent. Agent is the only mode allowed to write files.
  const [ideMode, setIdeMode] = useState<IdeMode>(() => readIdeMode("aureon"));

  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>("files");


  // Mobile
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("editor");

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── Pro tools state (shared IDE upgrade pack) ──
  const [historyOpen, setHistoryOpen] = useState(false);
  const [checkpointsOpen, setCheckpointsOpen] = useState(false);
  const [bugDoctorOpen, setBugDoctorOpen] = useState(false);
  const [bugDoctorMsg, setBugDoctorMsg] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [fuzzyOpen, setFuzzyOpen] = useState(false);
  const [approval, setApproval] = useState<{ title: string; changes: PlannedChange[]; resolve: (ok: boolean) => void } | null>(null);
  const [modelOverride, setModelOverride] = useState<IdeModelId | null>(null);
  const [chatDraft, setChatDraft] = useState("");


  // Terminal output for AI context (also auto-detects errors → Bug Doctor)
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const handleTerminalOutput = useCallback((output: string) => {
    setTerminalOutput(prev => [...prev.slice(-20), output]);
  }, []);


  const routeDecision: RoutingDecision = useMemo(
    () => routeTask(chatDraft || (chatMessages[chatMessages.length - 1]?.content ?? ""), modelOverride ?? undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatDraft, chatMessages.length, modelOverride]
  );

  // Derived
  const allFiles = useMemo(() => flattenFiles(files), [files]);
  const openFiles = useMemo(() => openFileIds.map(id => allFiles.find(f => f.id === id)).filter(Boolean) as IdeFile[], [allFiles, openFileIds]);
  const activeFile = useMemo(() => allFiles.find(f => f.id === activeFileId), [activeFileId, allFiles]);

  // ── Phase 4: RAG codebase memory (pgvector-backed) ──
  // Re-uses the active session as the project scope so embeddings follow the user's project.
  const rag = useCodeRag(activeSessionId);
  // Auto-index project files into pgvector whenever the file set changes (debounced).
  useEffect(() => {
    if (!activeSessionId) return;
    const payload = allFiles
      .filter(f => f.type === "file" && typeof f.content === "string" && (f.content?.length ?? 0) > 20)
      .map(f => ({ id: f.id, path: f.name, content: f.content ?? "", language: getLanguage(f.name) }));
    if (!payload.length) return;
    rag.indexFilesDebounced(payload, 6000);
  }, [files, activeSessionId, allFiles, rag]);


  useEffect(() => {
    if (isMobile) { setLeftOpen(false); setRightOpen(false); setBottomOpen(false); }
  }, [isMobile]);

  // ── Session CRUD ──
  const loadSessions = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from("ide_sessions").select("id, name, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (error) {
      console.warn("[ide] failed to load sessions", error);
      setSessions([]);
    } else {
      setSessions((data as IdeSession[]) ?? []);
    }
    setSessionsLoading(false);
  }, [user]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const loadSession = useCallback(async (id: string) => {
    if (!user?.id) return;
    const { data, error } = await supabase.from("ide_sessions").select("*").eq("id", id).eq("user_id", user.id).single();
    if (error) {
      console.warn("[ide] failed to load session", error);
      toast({ title: "Project failed to open", description: "The project data could not be loaded.", variant: "destructive" });
      return;
    }
    if (data) {
      const loadedFiles = Array.isArray(data.files) ? data.files as unknown as IdeFile[] : STARTER_FILES;
      const loadedFlat = flattenFiles(loadedFiles);
      const nextActiveId = data.active_file_id && loadedFlat.some(f => f.id === data.active_file_id)
        ? data.active_file_id
        : loadedFlat[0]?.id ?? null;
      setFiles(loadedFiles);
      setOpenFileIds((data.open_file_ids ?? []).filter((id: string) => loadedFlat.some(f => f.id === id)));
      setActiveFileId(nextActiveId);
      fileHistoryRef.current = [JSON.parse(JSON.stringify(loadedFiles))];
      historyIndexRef.current = 0;
      const cfg = data.panel_config as any;
      if (cfg && !isMobile) { setLeftOpen(cfg.leftOpen ?? true); setRightOpen(cfg.rightOpen ?? false); setBottomOpen(cfg.bottomOpen ?? false); }
      setActiveSessionId(id);
      const savedChat = cfg?.chatMessages as ChatMsg[] | undefined;
      setChatMessages(savedChat?.map(m => ({ ...m, timestamp: new Date(m.timestamp) })) ?? []);
      setLeftTab("files");
      if (isMobile) setMobilePanel("editor");
    }
  }, [isMobile, toast, user?.id]);

  const autoOpenedSessionRef = useRef(false);

  const createSession = useCallback(async () => {
    if (!user) return;
    const starterCopy = JSON.parse(JSON.stringify(STARTER_FILES)) as IdeFile[];
    const { data, error } = await supabase.from("ide_sessions").insert({
      user_id: user.id,
      name: `Project ${sessions.length + 1}`,
      files: starterCopy as any,
      open_file_ids: ["app"],
      active_file_id: "app",
      panel_config: { leftOpen: true, rightOpen: false, bottomOpen: false, chatMessages: [] } as any,
    }).select("id, name, updated_at").single();
    if (error) {
      console.warn("[ide] failed to create session", error);
      toast({ title: "Project failed to create", description: "The IDE could not create a clean project workspace.", variant: "destructive" });
      return;
    }
    if (data) {
      autoOpenedSessionRef.current = true;
      setSessions(prev => [data as IdeSession, ...prev]);
      await loadSession(data.id);
      setCenterTab("code");
    }
  }, [user, sessions.length, loadSession, toast]);

  // Never land on an empty workspace: reopen the most recent project, or
  // scaffold the asherin-project starter on a brand-new account.
  useEffect(() => {
    if (!user || sessionsLoading || activeSessionId || autoOpenedSessionRef.current) return;
    autoOpenedSessionRef.current = true;
    if (sessions.length > 0) void loadSession(sessions[0].id);
    else void createSession();
  }, [user, sessionsLoading, sessions, activeSessionId, loadSession, createSession]);


  const deleteSession = useCallback(async (id: string) => {
    // Phase 5: Purge local IndexedDB checkpoints and localStorage autosave so
    // deleting a project doesn't leave ghost recovery snapshots behind.
    try {
      const { listCheckpoints, deleteCheckpoint } = await import("@/lib/ide/checkpoints");
      const { clearAutoSave } = await import("@/lib/ide/autoSave");
      const ckpts = await listCheckpoints("aureon", id);
      await Promise.all(ckpts.map(c => c.id ? deleteCheckpoint(c.id) : Promise.resolve()));
      clearAutoSave(id);
    } catch (e) {
      console.warn("[ide] local cleanup failed", e);
    }
    await supabase.from("ide_sessions").delete().eq("id", id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) { setActiveSessionId(null); setFiles(EMPTY_PROJECT_FILES); setOpenFileIds([]); setActiveFileId(null); }
  }, [activeSessionId]);

  const renameSession = useCallback(async (id: string, name: string) => {
    await supabase.from("ide_sessions").update({ name }).eq("id", id);
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  }, []);

  const saveSession = useCallback(async () => {
    if (!activeSessionId || !user) return;
    setSaving(true);
    await supabase.from("ide_sessions").update({ files: files as any, open_file_ids: openFileIds, active_file_id: activeFileId, panel_config: { leftOpen, rightOpen, bottomOpen, chatMessages } as any }).eq("id", activeSessionId);
    setSaving(false);
    toast({ title: "Session saved" });
  }, [activeSessionId, user, files, openFileIds, activeFileId, leftOpen, rightOpen, bottomOpen, chatMessages, toast]);

  // Auto-save every 30s
  useEffect(() => {
    if (!activeSessionId) return;
    const interval = setInterval(() => {
      supabase.from("ide_sessions").update({ files: files as any, open_file_ids: openFileIds, active_file_id: activeFileId, panel_config: { leftOpen, rightOpen, bottomOpen, chatMessages } as any }).eq("id", activeSessionId);
    }, 30_000);
    return () => clearInterval(interval);
  }, [activeSessionId, files, openFileIds, activeFileId, leftOpen, rightOpen, bottomOpen, chatMessages]);

  // Keyboard shortcuts (simplified)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); saveSession(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "p") { e.preventDefault(); setFuzzyOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "P") { e.preventDefault(); setTemplateOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.key === "h" && e.shiftKey) { e.preventDefault(); setHistoryOpen(true); }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); setLeftOpen(p => !p); }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") { e.preventDefault(); setBottomOpen(p => !p); }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") { e.preventDefault(); handleRedo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveSession, handleUndo, handleRedo]);

  // ── Auto-snapshot active file (infinite history, IndexedDB) ──
  useEffect(() => {
    if (!activeSessionId || !activeFileId) return;
    const file = allFiles.find(f => f.id === activeFileId);
    if (!file?.content) return;
    const t = setTimeout(() => {
      void snapshotIfChanged({
        scope: "aureon",
        projectId: activeSessionId,
        fileId: activeFileId,
        filePath: file.name,
        content: file.content!,
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [files, activeFileId, activeSessionId, allFiles]);

  // ── Pro tools helpers ──
  const requestApproval = useCallback((title: string, changes: PlannedChange[]): Promise<boolean> => {
    return new Promise(resolve => setApproval({ title, changes, resolve }));
  }, []);

  const handleScaffold = useCallback(async (result: { kind: string; name: string; files: { path: string; content: string; language: string }[]; primary: string }) => {
    const changes: PlannedChange[] = result.files.map(f => ({
      path: f.path, action: "create", content: f.content, language: f.language,
    }));
    const ok = await requestApproval(`${result.kind} ${result.name}`, changes);
    if (!ok) return;
    // Apply: create each file at the root for simplicity
    for (const f of result.files) {
      const newFile: IdeFile = { id: crypto.randomUUID(), name: f.path.split("/").pop() ?? f.path, type: "file", content: f.content };
      setFiles(prev => [...prev, newFile]);
      if (f.path === result.primary) {
        setOpenFileIds(prev => [...prev, newFile.id]);
        setActiveFileId(newFile.id);
      }
    }
    toast({ title: "Scaffolded", description: `Created ${result.files.length} file(s)` });
  }, [requestApproval, toast]);


  // ── File operations ──
  const selectFile = (file: IdeFile) => {
    if (!openFileIds.includes(file.id)) setOpenFileIds(prev => [...prev, file.id]);
    setActiveFileId(file.id);
    setCenterTab("code");
    if (isMobile) setMobilePanel("editor");
  };

  const closeTab = (id: string) => {
    setOpenFileIds(prev => {
      const next = prev.filter(fid => fid !== id);
      if (activeFileId === id) setActiveFileId(next[next.length - 1] ?? null);
      return next;
    });
  };

  const updateContent = (id: string, content: string) => {
    const updateInTree = (nodes: IdeFile[]): IdeFile[] =>
      nodes.map(n => {
        if (n.id === id) return { ...n, content };
        if (n.children) return { ...n, children: updateInTree(n.children) };
        return n;
      });
    setFiles(prev => updateInTree(prev));
  };

  // Find a file's current content (for animateReplace fade-out source).
  const findContent = (id: string, nodes: IdeFile[] = files): string => {
    for (const n of nodes) {
      if (n.id === id && n.type === "file") return n.content ?? "";
      if (n.children) {
        const v = findContent(id, n.children);
        if (v) return v;
      }
    }
    return "";
  };

  // AI-driven write: word-by-word fade-out current → fade-in new.
  const aiWriteContent = (id: string, content: string) => {
    const current = findContent(id);
    const set = (next: string) => updateContent(id, next);
    if (current && current.trim().length > 0) animateReplace(current, content, set);
    else animateInsert(content, set);
  };

  const createFile = (parentId: string | null, name: string, type: "file" | "folder") => {
    const newFile: IdeFile = { id: crypto.randomUUID(), name, type, content: type === "file" ? "" : undefined, children: type === "folder" ? [] : undefined };
    if (!parentId) { setFiles(prev => [...prev, newFile]); }
    else {
      const addToParent = (nodes: IdeFile[]): IdeFile[] =>
        nodes.map(n => {
          if (n.id === parentId && n.type === "folder") return { ...n, children: [...(n.children || []), newFile] };
          if (n.children) return { ...n, children: addToParent(n.children) };
          return n;
        });
      setFiles(prev => addToParent(prev));
    }
    if (type === "file") selectFile(newFile);
  };

  const deleteFile = (id: string) => {
    const removeFromTree = (nodes: IdeFile[]): IdeFile[] =>
      nodes.filter(n => n.id !== id).map(n => n.children ? { ...n, children: removeFromTree(n.children) } : n);
    setFiles(prev => removeFromTree(prev));
    closeTab(id);
  };

  const renameFile = (id: string, newName: string) => {
    const renameInTree = (nodes: IdeFile[]): IdeFile[] =>
      nodes.map(n => {
        if (n.id === id) return { ...n, name: newName };
        if (n.children) return { ...n, children: renameInTree(n.children) };
        return n;
      });
    setFiles(prev => renameInTree(prev));
  };

  const moveFile = (fileId: string, targetFolderId: string | null) => {
    let movedFile: IdeFile | null = null;
    const removeFromTree = (nodes: IdeFile[]): IdeFile[] =>
      nodes.filter(n => {
        if (n.id === fileId) { movedFile = n; return false; }
        return true;
      }).map(n => n.children ? { ...n, children: removeFromTree(n.children) } : n);

    const addToTarget = (nodes: IdeFile[]): IdeFile[] => {
      if (!movedFile) return nodes;
      if (!targetFolderId) return [...nodes, movedFile];
      return nodes.map(n => {
        if (n.id === targetFolderId && n.type === "folder") return { ...n, children: [...(n.children || []), movedFile!] };
        if (n.children) return { ...n, children: addToTarget(n.children) };
        return n;
      });
    };

    setFiles(prev => {
      const after = removeFromTree(prev);
      return addToTarget(after);
    });
  };

  // Export ZIP
  const exportProject = useCallback(async () => {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const addToZip = (nodes: IdeFile[], path: string) => {
      for (const n of nodes) {
        if (n.type === "file" && n.content !== undefined) zip.file(`${path}${n.name}`, n.content);
        if (n.children) addToZip(n.children, `${path}${n.name}/`);
      }
    };
    addToZip(files, "");
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessions.find(s => s.id === activeSessionId)?.name ?? "asherin-project"}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "Project downloaded as ZIP." });
  }, [files, sessions, activeSessionId, toast]);

  // ── Write pipeline ──
  // Every write into the tree — whether it came from IDE agent mode or from a
  // turn in asherin chat — passes the same three gates: a visible diff, an
  // explicit approval, and a checkpoint of the whole working set taken BEFORE
  // the first byte lands, so any apply is one restore away from undone.
  const applyGeneratedFiles = useCallback(async (
    generatedFiles: ZanoemCodeFile[],
    trigger: string,
    capability: "agent_apply" | "chat_apply",
  ): Promise<"none" | "rejected" | "applied"> => {
    if (!generatedFiles || generatedFiles.length === 0) return "none";

    const flatNow = flattenFiles(filesRefAureon.current);
    const changes: PlannedChange[] = generatedFiles
      .map((g) => {
        const path = normalizeGeneratedFilePath(g.filename);
        if (!path || !g.content?.trim()) return null;
        const base = path.split("/").pop() ?? path;
        const existing = flatNow.find(f => f.name === path || f.name === base);
        return {
          path,
          action: existing ? "update" : "create",
          content: g.content,
          language: getLanguage(base),
          beforeContent: existing?.content ?? "",
        } as PlannedChange;
      })
      .filter(Boolean) as PlannedChange[];
    if (changes.length === 0) return "none";

    const label = `${changes.length} file change${changes.length === 1 ? "" : "s"}`;
    const ok = await requestApproval(label, changes);
    // Connect trace: a proposed write is a real capability pull, approved or not.
    // Connect trace: a proposed write is a real capability pull, approved or
    // not. The quote carries filenames only — never a byte of file body.
    const fileHint = changes.length <= 3
      ? changes.map(c => c.path.split("/").pop() ?? c.path).join(", ")
      : `${changes.length} files`;
    void emitPull({
      organ: "ide", capability: "apply", fromSurface: "ide",
      status: ok ? "ok" : "skip",
      quote: `${fileHint} · ${ok ? "applied" : "rejected"}`,
      meta: { origin: capability === "chat_apply" ? "chat" : "agent", files: changes.length },
    });
    if (!ok) return "rejected";

    if (activeSessionId) {
      try {
        await saveCheckpoint({
          scope: "aureon",
          projectId: activeSessionId,
          label: `Before ${capability === "chat_apply" ? "chat" : "agent"} edit · ${new Date().toLocaleTimeString()}`,
          trigger: trigger.slice(0, 200),
          files: flatNow.map(f => ({ fileId: f.id, filePath: f.name, content: f.content ?? "" })),
        });
        void emitPull({ organ: "ide", capability: "checkpoint", fromSurface: "ide", status: "ok", quote: label, meta: { files: flatNow.length } });
      } catch (e) {
        console.warn("[ide] checkpoint failed", e);
        void emitPull({ organ: "ide", capability: "checkpoint", fromSurface: "ide", status: "fail", quote: "checkpoint failed" });
      }
    }

    const result = applyGeneratedFilesToTree(filesRefAureon.current, generatedFiles);
    if (result.applied === 0) return "none";

    setFiles(result.next);
    filesRefAureon.current = result.next;
    const flatNext = flattenFiles(result.next);
    const primary = result.primaryId ? flatNext.find((f) => f.id === result.primaryId) : flatNext[0];
    if (primary) {
      setOpenFileIds((prev) => Array.from(new Set([...prev, primary.id])));
      setActiveFileId(primary.id);
      setCenterTab("code");
      if (isMobile) setMobilePanel("editor");
    }
    setRightOpen(true);
    toast({ title: "Applied", description: `${result.applied} file${result.applied === 1 ? "" : "s"} written. Restore from Checkpoints to undo.` });
    return "applied";
  }, [requestApproval, activeSessionId, isMobile, toast]);

  // ── Chat ──
  // Chat mode answers only. Agent mode proposes writes, which always pass
  // through: checkpoint snapshot → visible diff → explicit approval → apply.
  const sendChatMessage = useCallback(async (content: string) => {
    if (creditsRemaining <= 0) {
      toast({ title: "Credit limit reached", description: `You've used all ${maxCredits} credits this hour.`, variant: "destructive" });
      return;
    }

    useCredit();
    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", content, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);

    const assistantId = crypto.randomUUID();
    let assistantContent = "";
    const allMsgs = [...chatMessages, userMsg].map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    const contextParts: string[] = [];
    contextParts.push(
      ideMode === "agent"
        ? [
            "[ASHERIN IDE — AGENT MODE]",
            "You may propose file writes. Prefix EVERY fenced code block with the exact project file path on its own line.",
            "Return complete files, never fragments or diffs. The user reviews a diff and approves before anything is written.",
          ].join("\n")
        : [
            "[ASHERIN IDE — CHAT MODE]",
            "Answer the question. Do not write or modify files, and do not prefix code blocks with file paths.",
            "Show code inline for reference only.",
          ].join("\n")
    );
    if (allFiles.length > 0) {
      contextParts.push(`[Current project files]\n${allFiles.map((f) => `- ${f.name} (${getLanguage(f.name)})`).join("\n")}`);
    }
    if (activeFile?.content) {
      contextParts.push(`[IDE Context] Currently editing: ${activeFile.name}\n\`\`\`${getLanguage(activeFile.name)}\n${activeFile.content.slice(0, 4000)}\n\`\`\``);
    }

    // RAG-grounded codebase recall (best-effort; never blocks the turn).
    try {
      const matches = await rag.search(content, 6);
      const cross = matches
        .filter(m => m.file_path !== activeFile?.name)
        .slice(0, 5)
        .map(m => `// ${m.file_path} · chunk ${m.chunk_index} · sim ${(m.similarity ?? 0).toFixed(2)}\n${m.content.slice(0, 900)}`)
        .join("\n\n");
      if (cross) contextParts.push(`[Codebase RAG — top matches across project]\n${cross}`);
    } catch { /* ignore */ }
    if (terminalOutput.length > 0) {
      contextParts.push(`[Terminal Output]\n${terminalOutput.join("\n")}`);
    }
    allMsgs.unshift({ role: "user" as const, content: contextParts.join("\n\n") });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat({
        messages: allMsgs, mode: "code", depth: "deep", signal: controller.signal,
        onDelta: (chunk) => {
          assistantContent += chunk;
          setChatMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.id === assistantId) return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
            return [...prev, { id: assistantId, role: "assistant", content: assistantContent, timestamp: new Date() }];
          });
        },
        onReplace: (text) => {
          assistantContent = text;
          setChatMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.id === assistantId) return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: text } : m);
            return [...prev, { id: assistantId, role: "assistant", content: text, timestamp: new Date() }];
          });
        },
        onDone: () => setIsStreaming(false),
      });

      lastAssistantRef.current = assistantContent;

      // Chat mode answers only — it never touches the file tree.
      if (ideMode !== "agent") return;
      const rawGenerated = extractZanoemCodeFiles(assistantContent);
      const generatedFiles: ZanoemCodeFile[] = rawGenerated.length === 1 && /^snippet-\d+\./i.test(rawGenerated[0].filename) && activeFile
        ? [{ ...rawGenerated[0], filename: activeFile.name, language: getLanguage(activeFile.name) }]
        : rawGenerated;
      const outcome = await applyGeneratedFiles(generatedFiles, content, "agent_apply");
      if (outcome === "rejected") {
        toast({ title: "Changes rejected", description: "Nothing was written to the project." });
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast({ title: "Workspace request failed", description: err.message, variant: "destructive" });
      }
      setIsStreaming(false);
    }
  }, [chatMessages, activeFile, allFiles, creditsRemaining, useCredit, maxCredits, toast, terminalOutput, rag, ideMode, applyGeneratedFiles]);

  const stopStreaming = useCallback(() => { abortRef.current?.abort(); setIsStreaming(false); }, []);



  const handleTerminalAiCommand = useCallback((query: string) => {
    sendChatMessage(query);
    if (!rightOpen && !isMobile) setRightOpen(true);
    if (isMobile) setMobilePanel("editor");
  }, [sendChatMessage, rightOpen, isMobile]);

  // ── Chat handoff ──
  // asherin chat is the mouth. When a turn actually writes files, the payload
  // arrives here and opens as a diff the operator approves. The queue is
  // drained on mount too, because the dashboard splits to this workspace in the
  // same beat it queues the write and the editor may still be mounting.
  useEffect(() => {
    let busy = false;
    const drain = async (handoff: IdeHandoff | null) => {
      if (!handoff || busy) return;
      busy = true;
      try {
        const files: ZanoemCodeFile[] = handoff.files.map(f => ({
          filename: f.filename,
          content: f.content,
          language: f.language ?? getLanguage(f.filename),
        }));
        const outcome = await applyGeneratedFiles(files, handoff.trigger, "chat_apply");
        if (outcome === "rejected") {
          toast({ title: "Changes rejected", description: "Nothing was written to the project." });
        }
      } finally {
        busy = false;
      }
    };
    const onEvent = () => { void drain(takeIdeHandoff()); };
    window.addEventListener(IDE_HANDOFF_EVENT, onEvent);
    void drain(takeIdeHandoff());
    return () => window.removeEventListener(IDE_HANDOFF_EVENT, onEvent);
  }, [applyGeneratedFiles, toast]);

  // ── Crash hook wiring ─────────────────────────────────────
  // 1. Holds the IdeAgentsPanel "on_crash" trigger so we can fire it.
  // 2. Recent-crash dedupe (avoid spamming the AI when one error repeats).
  const crashAgentTriggerRef = useRef<((summary: string) => void) | null>(null);
  const lastCrashRef = useRef<{ sig: string; at: number }>({ sig: "", at: 0 });

  const handleCrashEvent = useCallback((evt: CrashEvent) => {
    const sig = `${evt.type || ""}|${evt.file || ""}:${evt.line || ""}|${evt.message.slice(0, 80)}`;
    const now = Date.now();
    if (sig === lastCrashRef.current.sig && now - lastCrashRef.current.at < 8000) return;
    lastCrashRef.current = { sig, at: now };

    // Best-effort locate file by basename
    let snippet: { name: string; content: string; startLine: number } | undefined;
    if (evt.file) {
      const baseName = evt.file.split("/").pop() || evt.file;
      const match = allFiles.find(f => f.name === baseName || f.name.endsWith("/" + baseName));
      if (match) {
        selectFile(match);
        if (match.content && evt.line) {
          const lines = match.content.split("\n");
          const start = Math.max(0, evt.line - 8);
          const end = Math.min(lines.length, evt.line + 8);
          snippet = { name: match.name, content: lines.slice(start, end).map((l, i) => `${start + i + 1} | ${l}`).join("\n"), startLine: start + 1 };
        }
      }
    }
    const prompt = buildCrashPrompt(evt, snippet);
    sendChatMessage(prompt);
    if (!rightOpen && !isMobile) setRightOpen(true);
    if (isMobile) setMobilePanel("editor");
    toast({ title: "◈ Crash detected", description: `${evt.type ?? "Error"}${evt.file ? " in " + (evt.file.split("/").pop() || evt.file) : ""} — AI dispatched` });

    // Fire on_crash agents
    crashAgentTriggerRef.current?.(prompt);
  }, [allFiles, selectFile, sendChatMessage, rightOpen, isMobile, toast]);

  // Global runtime error capture — uncaught exceptions + unhandled promise rejections.
  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      const text = `${e.error?.stack || e.message}${e.filename ? `\n    at ${e.filename}:${e.lineno}:${e.colno}` : ""}`;
      const evt = detectCrash(text);
      if (evt) handleCrashEvent(evt);
    };
    const onRej = (e: PromiseRejectionEvent) => {
      const reason: any = e.reason;
      const text = reason?.stack || String(reason);
      const evt = detectCrash(text);
      if (evt) handleCrashEvent(evt);
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, [handleCrashEvent]);


  // ── Mobile Layout ──
  if (isMobile) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden pt-1">
        {/* Simple mobile header */}
        <div className="flex items-center justify-between px-3 py-2 bg-card/20 border-b border-border/20 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-accent/70" />
            <span className="text-xs font-light tracking-widest text-foreground/80">IDE</span>
          </div>
          <button onClick={saveSession} disabled={!activeSessionId || saving} className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-30">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {mobilePanel === "explorer" && (
            leftTab === "sessions" ? <IdeSessionManager sessions={sessions} activeSessionId={activeSessionId} loading={sessionsLoading} onSelect={loadSession} onCreate={createSession} onDelete={deleteSession} onRename={renameSession} />
            : leftTab === "search" ? <IdeSearchPanel files={files} onOpenFile={selectFile} />
            : <IdeFileTree files={files} activeFileId={activeFileId} onSelectFile={selectFile} onCreateFile={createFile} onDeleteFile={deleteFile} onRenameFile={renameFile} onMoveFile={moveFile} />
          )}
          {mobilePanel === "editor" && (
            centerTab === "code"
              ? <IdeCodeEditor openFiles={openFiles} activeFileId={activeFileId} onSelectTab={setActiveFileId} onCloseTab={closeTab} onContentChange={updateContent} onHover={rag.hover}
                  canWrite={ideMode === "agent"}
                  onWriteBlocked={(reason) => toast({ title: "Chat mode is read-only", description: reason })}
                />
              : <IdePreviewPanel files={files} />
          )}
          {mobilePanel === "terminal" && <IdeTerminal onAiCommand={handleTerminalAiCommand} files={files} onCreateFile={createFile} onDeleteFile={deleteFile} onUpdateContent={updateContent} onTerminalOutput={handleTerminalOutput} onCrashDetected={handleCrashEvent} />}
        </div>

        {/* Simple 4-tab bottom nav */}
        <div className="flex items-center border-t border-border/20 bg-card/20 flex-shrink-0">
          {([
            { id: "explorer" as MobilePanel, icon: FolderKanban, label: "Files" },
            { id: "editor" as MobilePanel, icon: FileCode, label: centerTab === "preview" ? "Preview" : "Code" },
            { id: "ask" as const, icon: MessageSquare, label: "Ask" },
            { id: "terminal" as MobilePanel, icon: TerminalIcon, label: "Terminal" },
          ]).map(tab => (
            <button key={tab.id}
              onClick={() => {
                // "Ask" is not a second chat — it hands the operator back to the
                // one asherin ChatView, which is where every conversation lives.
                if (tab.id === "ask") { requestReturnToChat(); return; }
                if (tab.id === "editor" && mobilePanel === "editor") setCenterTab(t => t === "code" ? "preview" : "code");
                else setMobilePanel(tab.id as MobilePanel);
              }}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-light transition-colors ${tab.id !== "ask" && mobilePanel === tab.id ? "text-accent" : "text-muted-foreground/50"}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>


        <IdeQuickOpen open={quickOpenOpen} onClose={() => setQuickOpenOpen(false)} files={files} onSelectFile={selectFile} />
      </div>
    );
  }

  // ── Desktop Layout (Simplified) ──
  return (
    <div className="flex flex-col h-full w-full overflow-hidden pt-1">
      {/* Top bar: asherin | project | New | Code | Preview | Save | Chat | More */}
      <div className="flex items-center justify-between px-3 py-2 bg-card/20 border-b border-border/20 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-accent/70 shrink-0" />
            <span className="text-xs font-light tracking-widest text-foreground/80 shrink-0">asherin IDE</span>
          </div>
          {activeSessionId ? (
            <span className="text-[10px] text-muted-foreground/50 bg-muted/10 rounded-full px-2.5 py-0.5 truncate max-w-[160px]">
              {sessions.find(s => s.id === activeSessionId)?.name ?? ""}
            </span>
          ) : null}
          <button
            onClick={createSession}
            className="flex items-center gap-1.5 rounded-lg bg-accent/15 hover:bg-accent/25 px-3 py-1.5 text-[10px] font-light text-accent transition-colors"
          >
            <Plus className="h-3 w-3" /> New
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Code / Preview */}
          <div className="flex items-center rounded-lg border border-border/20 overflow-hidden mr-1">
            <button onClick={() => setCenterTab("code")} className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-light transition-colors ${centerTab === "code" ? "bg-accent/20 text-accent" : "text-muted-foreground/50 hover:text-foreground"}`}>
              <FileCode className="h-3 w-3" /> Code
            </button>
            <button onClick={() => setCenterTab("preview")} className={`flex items-center gap-1 px-3 py-1.5 text-[10px] font-light transition-colors ${centerTab === "preview" ? "bg-accent/20 text-accent" : "text-muted-foreground/50 hover:text-foreground"}`}>
              <Globe className="h-3 w-3" /> Preview
            </button>
          </div>

          {/* Save */}
          <button onClick={saveSession} disabled={!activeSessionId || saving} className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground transition-colors disabled:opacity-30" title="Save (Ctrl+S)">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          </button>

          {/* Chat vs Agent */}
          <IdeModeToggle scope="aureon" value={ideMode} onChange={setIdeMode} />
          <IdeModelRouterBadge decision={routeDecision} onOverride={setModelOverride} isOverridden={!!modelOverride} />

          {/* Pending changes panel */}
          <button
            onClick={() => setRightOpen(!rightOpen)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-light transition-colors ${rightOpen ? "bg-accent/15 text-accent" : "text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5"}`}
            title="Toggle changed files"
          >
            <GitCommit className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Changes</span>
          </button>

          {/* Back to the one asherin chat — the workspace never hosts a second one. */}
          <button
            onClick={requestReturnToChat}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-light text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
            title="Back to asherin chat"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Chat</span>
          </button>

          {/* More */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground transition-colors">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem onClick={() => setQuickOpenOpen(true)}>
                <Search className="h-3.5 w-3.5 mr-2" /> Go to File <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+P</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setLeftTab("search"); setLeftOpen(true); }}>
                <Search className="h-3.5 w-3.5 mr-2" /> Search in Files
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTemplateOpen(true)}>
                <Wand2 className="h-3.5 w-3.5 mr-2" /> Scaffold files <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+Shift+P</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!activeSessionId || !activeFileId} onClick={() => setHistoryOpen(true)}>
                <History className="h-3.5 w-3.5 mr-2" /> Version history
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!activeSessionId} onClick={() => setCheckpointsOpen(true)}>
                <GitCommit className="h-3.5 w-3.5 mr-2" /> Checkpoints
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setBugDoctorMsg(terminalOutput.slice(-5).join("\n") || ""); setBugDoctorOpen(true); }}>
                <Stethoscope className="h-3.5 w-3.5 mr-2" /> Explain last error
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={createSession}>
                <Plus className="h-3.5 w-3.5 mr-2" /> New Project
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setLeftTab("sessions"); setLeftOpen(true); }}>
                <FolderKanban className="h-3.5 w-3.5 mr-2" /> Projects
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setLeftTab("git"); setLeftOpen(true); }}>
                <Code2 className="h-3.5 w-3.5 mr-2" /> Git
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportProject}>
                <Download className="h-3.5 w-3.5 mr-2" /> Export as ZIP
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLeftOpen(p => !p)}>
                {leftOpen ? <PanelLeftClose className="h-3.5 w-3.5 mr-2" /> : <PanelLeftOpen className="h-3.5 w-3.5 mr-2" />}
                {leftOpen ? "Hide" : "Show"} Sidebar <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+B</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBottomOpen(p => !p)}>
                {bottomOpen ? <ChevronDown className="h-3.5 w-3.5 mr-2" /> : <ChevronUp className="h-3.5 w-3.5 mr-2" />}
                {bottomOpen ? "Hide" : "Show"} Terminal <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+J</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>


      {/* Main content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left sidebar — just files by default, simple tab strip */}
          {leftOpen && (
            <>
              <ResizablePanel defaultSize={18} minSize={10} maxSize={30} className="overflow-hidden">
                <div className="flex flex-col h-full border-r border-border/20 bg-card/10 overflow-hidden">
                  {/* Simple tab strip */}
                  <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/10 shrink-0">
                    {([
                      { id: "files" as LeftTab, icon: FolderKanban, label: "Files" },
                      { id: "search" as LeftTab, icon: Search, label: "Search" },
                      { id: "agents" as LeftTab, icon: Bot, label: "Agents" },
                    ]).map(tab => (
                      <button key={tab.id} onClick={() => setLeftTab(tab.id)}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-light transition-colors ${leftTab === tab.id ? "bg-accent/15 text-accent" : "text-muted-foreground/40 hover:text-foreground"}`}
                      >
                        <tab.icon className="h-3 w-3" />
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {leftTab === "files" && <IdeFileTree files={files} activeFileId={activeFileId} onSelectFile={selectFile} onCreateFile={createFile} onDeleteFile={deleteFile} onRenameFile={renameFile} onMoveFile={moveFile} />}
                    {leftTab === "search" && <IdeSearchPanel files={files} onOpenFile={selectFile} />}
                    {leftTab === "sessions" && <IdeSessionManager sessions={sessions} activeSessionId={activeSessionId} loading={sessionsLoading} onSelect={loadSession} onCreate={createSession} onDelete={deleteSession} onRename={renameSession} />}
                    {leftTab === "git" && <IdeGitPanel files={files} onImportFiles={(imported) => setFiles(imported)} />}
                    {leftTab === "agents" && (
                      <IdeAgentsPanel
                        sessionId={activeSessionId}
                        onRunAgent={(goal, name) => { sendChatMessage(`[Agent: ${name}]\n${goal}`); if (!rightOpen && !isMobile) setRightOpen(true); }}
                        onRegisterCrashHandler={(handler) => { crashAgentTriggerRef.current = handler; }}
                      />
                    )}
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          {/* Center */}
          <ResizablePanel defaultSize={rightOpen ? 58 : 82} minSize={30} className="overflow-hidden">
            <ResizablePanelGroup direction="vertical" className="h-full">
              <ResizablePanel defaultSize={bottomOpen ? 70 : 100} minSize={20} className="overflow-hidden">
                <div className="flex flex-col h-full">
                  {centerTab === "code" && activeFile?.content && (
                    <div className="px-2 py-1 border-b border-border/15 bg-card/5">
                      <IdeValidatorBadge content={activeFile.content} language={getLanguage(activeFile.name)} />
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    {centerTab === "code"
                      ? <IdeCodeEditor openFiles={openFiles} activeFileId={activeFileId} onSelectTab={setActiveFileId} onCloseTab={closeTab} onContentChange={updateContent} onHover={rag.hover}
                  canWrite={ideMode === "agent"}
                  onWriteBlocked={(reason) => toast({ title: "Chat mode is read-only", description: reason })}
                />
                      : <IdePreviewPanel files={files} />}

                  </div>
                </div>
              </ResizablePanel>

              {/* Terminal (only when open) */}
              {bottomOpen && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={30} minSize={10} maxSize={50} className="overflow-hidden">
                    <div className="flex flex-col h-full border-t border-border/20">
                      <div className="flex items-center px-3 py-1 bg-card/10 border-b border-border/10 shrink-0">
                        <div className="flex items-center gap-1 text-[10px] font-light text-accent/70">
                          <TerminalIcon className="h-3 w-3" />
                          Terminal
                        </div>
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <IdeTerminal onAiCommand={handleTerminalAiCommand} files={files} onCreateFile={createFile} onDeleteFile={deleteFile} onUpdateContent={updateContent} onTerminalOutput={handleTerminalOutput} onCrashDetected={handleCrashEvent} />
                      </div>
                    </div>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>

          {/* Right: AI Chat */}
          {rightOpen && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={24} minSize={15} maxSize={40} className="overflow-hidden">
                <div className="h-full border-l border-border/20 bg-card/10 overflow-hidden flex flex-col">
                  <div className="px-2 pt-2">
                    <IdeChangedFilesPanel
                      scope="aureon"
                      projectId={activeSessionId ?? ""}
                      onOpenFile={(id) => { const f = allFiles.find(x => x.id === id); if (f) selectFile(f); }}
                    />
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 pt-1">
                    <p className="text-[10px] font-light leading-relaxed text-muted-foreground/45">
                      Writes arrive from asherin chat and from Agent mode. Each one lands
                      here as a diff you approve, with a checkpoint taken first — restore
                      from Checkpoints to undo any apply.
                    </p>
                  </div>
                </div>

              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      <IdeQuickOpen open={quickOpenOpen} onClose={() => setQuickOpenOpen(false)} files={files} onSelectFile={selectFile} />


      {/* Shared IDE upgrade pack modals */}
      <IdeFuzzyFinder
        open={fuzzyOpen}
        files={allFiles.map(f => ({ id: f.id, path: f.name }))}
        onPick={(id) => { const f = allFiles.find(x => x.id === id); if (f) selectFile(f); }}
        onClose={() => setFuzzyOpen(false)}
      />
      <IdeTemplateLauncher open={templateOpen} onClose={() => setTemplateOpen(false)} onCreate={handleScaffold} />
      <IdeHistoryPanel
        scope="aureon"
        projectId={activeSessionId ?? ""}
        fileId={activeFileId ?? ""}
        filePath={activeFile?.name ?? ""}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={(content) => activeFileId && aiWriteContent(activeFileId, content)}
      />
      <IdeCheckpointPanel
        scope="aureon"
        projectId={activeSessionId ?? ""}
        open={checkpointsOpen}
        onClose={() => setCheckpointsOpen(false)}
        onRestore={(restored) => {
          for (const f of restored) aiWriteContent(f.fileId, f.content);
          changedFiles.clear("aureon", activeSessionId ?? "");
        }}
      />
      <IdeErrorExplainer
        open={bugDoctorOpen}
        message={bugDoctorMsg}
        contextCode={activeFile?.content}
        onClose={() => setBugDoctorOpen(false)}
        onApplyFix={(code) => activeFileId && aiWriteContent(activeFileId, code)}
      />
      {approval && (
        <IdeApprovalGate
          open={true}
          title={approval.title}
          changes={approval.changes}
          onApprove={() => { approval.resolve(true); setApproval(null); }}
          onCancel={() => { approval.resolve(false); setApproval(null); }}
        />
      )}
    </div>
  );
};

export default AureonIdeView;
