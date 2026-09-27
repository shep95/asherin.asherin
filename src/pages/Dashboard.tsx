import { IDE_RETURN_TO_CHAT_EVENT } from "@/lib/ide/chatHandoff";
import { applySeoHead } from "@/lib/seoHead";
import { isAdminEmail } from "@/lib/adminEmail";
import { getWallpaperSrc } from "@/lib/wallpapers";
import DashboardSurface from "@/components/dashboard/DashboardSurface";
import {
  APPEARANCE_EVENT,
  hydrateAppearanceFromDb,
  readAppearance,
  type DashboardAppearance,
} from "@/lib/dashboardAppearance";
import React, { Suspense } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Conversation, ChatMode, DashboardView, Message, FileAttachment } from "@/components/dashboard/types";
import type { ResponseDepth } from "@/components/dashboard/DepthSelector";
import type { FeedbackType } from "@/components/dashboard/CalibrationFeedback";
import type { UserProfile } from "@/lib/ai";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import DashboardSidebarV2 from "@/components/dashboard/DashboardSidebarV2";
import { DASHBOARD_UI_EVENT, hydrateDashboardUiFromDb, readDashboardUi, type DashboardUi } from "@/lib/dashboardUi";
import IntelAlertCenter from "@/components/dashboard/IntelAlertCenter";
import ChatView from "@/components/dashboard/ChatView";
import PromptEnhancerPanel from "@/components/dashboard/PromptEnhancerPanel";
import { useAccess } from "@/hooks/useAccess";
import { isRetiredView } from "@/lib/retiredSurfaces";
import { DashboardUiProvider } from "@/lib/dashboardUiContext";
import { getActiveScope } from "@/lib/projects/scope";
import V2PageShell from "@/components/dashboard/v2/V2PageShell";
import { v2TitleFor } from "@/lib/dashboard/v2Titles";
const NewAccountWelcomeModal = lazyWithRetry(() => import("@/components/NewAccountWelcomeModal"));

// Lazy-load heavy views
const LibraryView = lazyWithRetry(() => import("@/components/dashboard/LibraryView"));
const CodeSnippetsView = lazyWithRetry(() => import("@/components/dashboard/CodeSnippetsView"));
const ProjectsView = lazyWithRetry(() => import("@/components/dashboard/ProjectsView"));
const OrganismVaultView = lazyWithRetry(() => import("@/components/dashboard/OrganismVaultView"));
const ActivityView = lazyWithRetry(() => import("@/components/dashboard/ActivityView"));
const VedicAstrologyView = lazyWithRetry(() => import("@/components/dashboard/VedicAstrologyView"));
const SettingsView = lazyWithRetry(() => import("@/components/dashboard/SettingsView"));
const GoogleIntelligenceView = lazyWithRetry(() => import("@/components/dashboard/google/GoogleIntelligenceView"));
const ConnectView = lazyWithRetry(() => import("@/components/dashboard/connect/ConnectView"));
const AsherinSearchView = lazyWithRetry(() => import("@/components/dashboard/search/AsherinSearchView"));
const AsherinxEngView = lazyWithRetry(() => import("@/components/dashboard/asherinx/AsherinxEngView"));
const AsherinDataView = lazyWithRetry(() => import("@/components/dashboard/data/AsherinDataView"));
const ZaliView = lazyWithRetry(() => import("@/components/dashboard/zali/ZaliView"));
const CommunityView = lazyWithRetry(() => import("@/components/dashboard/zali/CommunityView"));
const BriefingView = lazyWithRetry(() => import("@/components/dashboard/BriefingView"));
const TeamsView = lazyWithRetry(() => import("@/components/dashboard/TeamsView"));
const NotebooksView = lazyWithRetry(() => import("@/components/dashboard/NotebooksView"));


const AureonIdeView = lazyWithRetry(() => import("@/components/dashboard/ide/AureonIdeView"));
const WhiteboardView = lazyWithRetry(() => import("@/components/whiteboard/Whiteboard"));
const DocumentStudioView = lazyWithRetry(() => import("@/components/dashboard/DocumentStudioView"));

const PatternAnalysisView = lazyWithRetry(() => import("@/components/dashboard/PatternAnalysisView"));


const BugReportsView = lazyWithRetry(() => import("@/components/dashboard/BugReportsView"));

const GuardianVaultView = lazyWithRetry(() => import("@/components/dashboard/GuardianVaultView"));
const KnowledgeVaultView = lazyWithRetry(() => import("@/components/dashboard/KnowledgeVaultView"));
const ZerlalView = lazyWithRetry(() => import("@/components/dashboard/zerlal/ZerlalView"));
const AsherinDefenderView = lazyWithRetry(() => import("@/components/dashboard/defender/AsherinDefenderView"));
const AsherinArVisionView = lazyWithRetry(() => import("@/components/dashboard/arvision/AsherinArVisionView"));
const AsherinEyeView = lazyWithRetry(() => import("@/components/dashboard/eye/AsherinEyeView"));
const AsherinHealthView = lazyWithRetry(() => import("@/components/dashboard/health/AsherinHealthView"));
const InvestigationWorkspace = lazyWithRetry(() => import("@/components/dashboard/investigation/InvestigationWorkspace"));
const SentinelView = lazyWithRetry(() => import("@/components/dashboard/sentinel/SentinelView"));

const FileScrapperView = lazyWithRetry(() => import("@/components/dashboard/scrapper/FileScrapperView"));

const GematriaView = lazyWithRetry(() => import("@/components/gematria/GematriaTab"));
const AsherZahtenModule = lazyWithRetry(() => import("@/components/asher/AsherZahtenModule"));
const AsherPublishedTabRenderer = lazyWithRetry(() => import("@/components/asher/AsherPublishedTabRenderer"));
const CommandPalette = lazyWithRetry(() => import("@/components/dashboard/CommandPalette"));
const FocusMode = lazyWithRetry(() => import("@/components/dashboard/FocusMode"));
const SplitPaneManager = lazyWithRetry(() => import("@/components/dashboard/SplitPaneManager"));
import type { SplitPane } from "@/components/dashboard/SplitPaneManager";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { streamChat, fetchSuggestions, fetchConsensus } from "@/lib/ai";
import { thinkingStore } from "@/hooks/useAureonThinking";
import type { SelectedModel } from "@/components/dashboard/MultiModelSelector";
import {
  getActiveBranch,
  getMessageBranch,
  tagMessageBranch,
  retargetMessageBranch,
  hydrateMessageBranches,
  restoreBranchesFromDB,
  saveBranchesToDB,
} from "@/components/dashboard/ConversationBranches";
import { useToast } from "@/hooks/use-toast";
import { encryptText, decryptText } from "@/lib/encryption";
import { ToastAction } from "@/components/ui/toast";
import { pushNotification } from "@/components/dashboard/NotificationInbox";
import { Lock, ArrowRight, WifiOff } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import {
  enqueueMessage,
  updateMessageStatus,
  removeMessage,
  getPendingMessages,
  getRetryDelay,
  registerBackgroundSync,
  onOnline,
  isOnline,
  type QueuedMessage,
  type MessageStatus,
} from "@/lib/messageQueue";

const RetiredRoom = ({ title }: { title: string }) => (
  <div className="flex flex-1 items-center justify-center p-6">
    <div className="max-w-md text-center space-y-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-10">
      <Lock className="h-8 w-8 text-muted-foreground mx-auto" />
      <p className="text-sm font-extralight leading-relaxed text-muted-foreground">{title.toLowerCase()} has been retired.</p>
    </div>
  </div>
);

const serializeAttachments = (attachments?: FileAttachment[]): FileAttachment[] | undefined =>
  attachments?.map(({ previewUrl: _previewUrl, ...attachment }) => attachment);

const decryptAttachments = async (ciphertext: unknown, userId: string): Promise<FileAttachment[] | undefined> => {
  if (typeof ciphertext !== "string" || !ciphertext) return undefined;
  try {
    const parsed = JSON.parse(await decryptText(ciphertext, userId));
    if (!Array.isArray(parsed)) return undefined;
    return (parsed as FileAttachment[]).map((attachment) => ({
      ...attachment,
      previewUrl:
        attachment.previewUrl ||
        (attachment.type.startsWith("image/") ? `data:${attachment.type};base64,${attachment.base64}` : undefined),
    }));
  } catch {
    return undefined;
  }
};

const LazyFallback = () => (
  <div className="flex flex-1 items-center justify-center">
    <div className="text-xs font-extralight tracking-[0.2em] text-muted-foreground animate-pulse">Loading…</div>
  </div>
);

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { canAccess } = useAccess();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("aureon_active_conv_id") || null;
    } catch {
      return null;
    }
  });
  const asherEmbed =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("asherEmbed") === "1";
  const { view: viewParam } = useParams<{ view?: string }>();
  const navigate = useNavigate();
  const VALID_VIEWS: DashboardView[] = [
    "chat",
    "library",
    "projects",
    "memory",
    "settings",
    "api-keys",
    "connect",
    "search",
    "azplen",
    "briefing",
    "snippets",
    "teams",
    "notebooks",
    "audit",
    "stats",
    "zali",
    "community",
    "google",
    "ide",
    "pdf-generator",
    "pattern-analysis",
    "slideshow",
    "bug-reports",
    "ebook",
    "guardian-vault",
    "zerlal",
    "file-scrapper",
    "vedic-astrology",
    "zahten",
    "gematria",
    "ghost-engine",
    "whiteboard",
    "knowledge-vault",
    "asherin-defender",
    "asherin-arvision",
    "asherin-eye",
    "asherin-sentinel",
    "asherin-health",
    "investigations",
  ];
  // Deep-link aliases. A person types the product name they were told, not the
  // internal id, and a URL a human guessed correctly must never collapse to
  // chat as if the room did not exist.
  const VIEW_ALIASES: Record<string, DashboardView> = {
    defender: "asherin-defender",
    arvision: "asherin-arvision",
    "ar-vision": "asherin-arvision",
    eye: "asherin-eye",
    "asherin.eye": "asherin-eye",
    health: "asherin-health",
    "asherin.health": "asherin-health",
    sentinel: "asherin-sentinel",
    "asherin.sentinel": "asherin-sentinel",
    asherinx: "ghost-engine",
    "asherinx-eng": "ghost-engine",
    investigation: "investigations",
    osint: "investigations",
    activity: "stats",
    "asherin-activity": "stats",
    "asherin.activity": "stats",
    pages: "pdf-generator",
    "asherin-pages": "pdf-generator",
  };
  const resolveView = (raw?: string): DashboardView | null => {
    if (!raw) return null;
    if ((VALID_VIEWS as string[]).includes(raw)) return raw as DashboardView;
    if (VIEW_ALIASES[raw]) return VIEW_ALIASES[raw];
    if (raw.startsWith("agent:")) return raw as DashboardView;
    return null;
  };
  const initialView: DashboardView = resolveView(viewParam) ?? "chat";
  const [activeViewRaw, setActiveViewRaw] = useState<DashboardView>(initialView);
  // The investigation bound to the current chat, if a research turn opened one.
  const [activeInvestigationId, setActiveInvestigationId] = useState<string | null>(null);
  const activeView: DashboardView = asherEmbed ? "chat" : activeViewRaw;
  // The code workspace can hand the operator back to the mouth. One chat only —
  // the workspace never hosts a transcript of its own.
  useEffect(() => {
    const back = () => setActiveViewRaw("chat");
    window.addEventListener(IDE_RETURN_TO_CHAT_EVENT, back);
    return () => {
      window.removeEventListener(IDE_RETURN_TO_CHAT_EVENT, back);
    };
  }, []);

  // Sync URL -> state (back/forward navigation, deep links)
  useEffect(() => {
    if (asherEmbed) return;
    const next: DashboardView = resolveView(viewParam) ?? "chat";
    if (next !== activeViewRaw) setActiveViewRaw(next);
    // Retired module deep links (/dashboard/nomad, /dashboard/cipher …) must not
    // leave a dead id sitting in the URL — collapse them onto chat.
    if (viewParam && next === "chat" && viewParam !== "chat") {
      navigate("/dashboard", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewParam]);
  const setActiveView = (v: DashboardView) => {
    // Retired products are unavailable through every client navigation surface.
    if (isRetiredView(v)) {
      setActiveViewRaw("chat");
      if (typeof window !== "undefined" && window.location.pathname !== "/dashboard") {
        navigate("/dashboard", { replace: true });
      }
      return;
    }
    if (asherEmbed && v !== "chat") return;
    setActiveViewRaw(v);
    setSuggestions([]);
    // Push URL: /dashboard for chat, /dashboard/<view> otherwise
    const targetPath = v === "chat" ? "/dashboard" : `/dashboard/${v}`;
    if (typeof window !== "undefined" && window.location.pathname !== targetPath) {
      navigate(targetPath, { replace: false });
    }
  };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [depth, setDepth] = useState<ResponseDepth>("standard");
  const [isStreaming, setIsStreaming] = useState(false);
  // Donation Era: Asherin is fully free. Everyone gets the toggle and can pick
  // between the Algorithm LLM and BYOK chat. Nothing is locked behind a tier.
  const isAdminUser = isAdminEmail(user?.email);
  const isFreeUser = false;
  // Algorithm-vs-Standard toggle removed — everything runs on the user's BYOK model.
  const [algorithmModeRaw, setAlgorithmMode] = useState<boolean>(false);
  const algorithmMode = false;
  const showAlgorithmToggle = false;
  const toggleAlgorithmMode = () => {
    /* no-op: BYOK only */
  };
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const activeConvIdRef = useRef<string | null>(null);
  const bootstrapConversationRef = useRef(false);
  const attachmentMapRef = useRef<Map<string, FileAttachment[]>>(new Map());
  const [online, setOnline] = useState(navigator.onLine);
  const [messageStatuses, setMessageStatuses] = useState<Record<string, MessageStatus>>({});
  const processingQueue = useRef(false);
  const pendingQueue = useRef<string[]>([]);
  const isStreamingRef = useRef(false);
  const [queueItems, setQueueItems] = useState<{ id: string; content: string }[]>([]);
  const [queuePaused, setQueuePaused] = useState(false);
  const queuePausedRef = useRef(false);
  const [consensusEnabled, setConsensusEnabled] = useState(false);
  const [consensusModels, setConsensusModels] = useState<SelectedModel[]>([]);
  const [storedProviders, setStoredProviders] = useState<string[]>([]);
  const [splitPanes, setSplitPanes] = useState<SplitPane[]>([]);
  const [publishedAgents, setPublishedAgents] = useState<{ id: string; name: string; entry_html: string | null }[]>([]);
  const [isDraggingConvo, setIsDraggingConvo] = useState(false);
  const [activeBrainId, setActiveBrainId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("aureon_active_brain_id") || null;
    } catch {
      return null;
    }
  });
  const [wallpaperKey, setWallpaperKey] = useState(() => {
    try {
      // Newbies: seed the default Asherin wallpaper so it persists across reloads
      // until they explicitly change it in Settings.
      const existing = localStorage.getItem("aureon_wallpaper");
      if (!existing) {
        localStorage.setItem("aureon_wallpaper", "aureon");
        return "aureon";
      }
      return existing;
    } catch {
      return "aureon";
    }
  });
  const [appearance, setAppearance] = useState<DashboardAppearance>(() => readAppearance());
  // Chrome layout is a preference, not a deploy. Swapping it exchanges the
  // <aside> only — <main> and the live ChatView keep their identity, so a
  // stream in flight is never remounted mid-token.
  const [dashboardUi, setDashboardUi] = useState<DashboardUi>(() => readDashboardUi());
  const [prevDashWallpaper, setPrevDashWallpaper] = useState<string | null>(null);
  const [isDashTransitioning, setIsDashTransitioning] = useState(false);
  const dashTransRef = useRef<ReturnType<typeof setTimeout>>();
  const activeWallpaper = getWallpaperSrc(wallpaperKey);

  useEffect(() => {
    applySeoHead({
      title: "Dashboard — Asherin Workspace",
      description:
        "Your Asherin workspace — chats, agents, projects, intelligence modules, and BYOK controls in one private dashboard.",
      path: "/dashboard",
    });
  }, []);

  useEffect(() => {
    const handler = () => {
      const newKey = localStorage.getItem("aureon_wallpaper") || "aureon";
      const newSrc = getWallpaperSrc(newKey);
      const oldSrc = getWallpaperSrc(wallpaperKey);
      if (newSrc !== oldSrc) {
        setPrevDashWallpaper(oldSrc);
        setIsDashTransitioning(true);
        if (dashTransRef.current) clearTimeout(dashTransRef.current);
        dashTransRef.current = setTimeout(() => {
          setIsDashTransitioning(false);
          setPrevDashWallpaper(null);
        }, 900);
      }
      setWallpaperKey(newKey);
    };
    // Appearance (photo vs flat colour) applies in the same session — the
    // operator is editing swatches and must see the surface move, not reload.
    const appearanceHandler = () => setAppearance(readAppearance());
    const uiHandler = () => setDashboardUi(readDashboardUi());
    window.addEventListener(DASHBOARD_UI_EVENT, uiHandler);
    window.addEventListener("storage", uiHandler);
    window.addEventListener("storage", handler);
    window.addEventListener("storage", appearanceHandler);
    window.addEventListener("aureon-wallpaper-change", handler);
    window.addEventListener(APPEARANCE_EVENT, appearanceHandler);
    return () => {
      window.removeEventListener(DASHBOARD_UI_EVENT, uiHandler);
      window.removeEventListener("storage", uiHandler);
      window.removeEventListener("storage", handler);
      window.removeEventListener("storage", appearanceHandler);
      window.removeEventListener("aureon-wallpaper-change", handler);
      window.removeEventListener(APPEARANCE_EVENT, appearanceHandler);
      if (dashTransRef.current) clearTimeout(dashTransRef.current);
    };
  }, [wallpaperKey]);

  // Global drag detection for split-pane drop zones
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("text/aureon-conversation-id")) {
        setIsDraggingConvo(true);
      }
    };
    const onDragEnd = () => setIsDraggingConvo(false);
    const onDrop = () => setIsDraggingConvo(false);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const addSplitPane = useCallback(
    (convId: string) => {
      if (splitPanes.length >= 4) return;
      if (splitPanes.some((p) => p.conversationId === convId)) return;
      setSplitPanes((prev) => [...prev, { id: crypto.randomUUID(), conversationId: convId }]);
    },
    [splitPanes],
  );

  const removeSplitPane = useCallback((paneId: string) => {
    setSplitPanes((prev) => {
      const next = prev.filter((p) => p.id !== paneId);
      return next;
    });
  }, []);

  const handleSplitSendMessage = useCallback(
    async (content: string, convId: string, attachments?: FileAttachment[]) => {
      // Temporarily switch active conv to send to the right conversation
      const prevActive = activeConvId;
      setActiveConvId(convId);
      await sendMessageCore(content, convId, attachments);
      if (prevActive) setActiveConvId(prevActive);
    },
    [activeConvId],
  );

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      toast({ title: "Back online", description: "Sending queued messages…" });
      processMessageQueue();
    };
    const handleOffline = () => {
      setOnline(false);
      toast({
        title: "You're offline",
        description: "Messages will be queued and sent when you reconnect.",
        variant: "destructive",
      });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Service Worker message handler
    const swHandler = (event: MessageEvent) => {
      if (event.data?.type === "PROCESS_QUEUE") {
        processMessageQueue();
      }
    };
    navigator.serviceWorker?.addEventListener("message", swHandler);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      navigator.serviceWorker?.removeEventListener("message", swHandler);
    };
  }, []);

  // Process queued messages — actually persist to DB and trigger AI
  const processMessageQueue = useCallback(async () => {
    if (processingQueue.current || !user) return;
    // Don't drain the offline queue while the main chat is mid-stream — two
    // streamChat calls would interleave tokens into the same conversation
    // (BUG-CODE-02).
    if (isStreamingRef.current) return;
    processingQueue.current = true;
    try {
      const pending = await getPendingMessages();
      for (const msg of pending.sort((a, b) => a.createdAt - b.createdAt)) {
        if (!navigator.onLine) break;
        if (msg.retryCount >= msg.maxRetries) {
          await updateMessageStatus(msg.id, "failed");
          setMessageStatuses((prev) => ({ ...prev, [msg.id]: "failed" }));
          continue;
        }
        try {
          await updateMessageStatus(msg.id, "sending");
          setMessageStatuses((prev) => ({ ...prev, [msg.id]: "sending" }));

          // Actually persist the user message to DB
          const encryptedContent = await encryptText(msg.content, user.id);
          const queuedAttachments = attachmentMapRef.current.get(msg.content);
          const encryptedAttachments = queuedAttachments?.length
            ? await encryptText(JSON.stringify(serializeAttachments(queuedAttachments)), user.id)
            : null;
          const { data: savedMsg } = await supabase
            .from("messages")
            .insert({
              conversation_id: msg.conversationId,
              user_id: user.id,
              role: "user",
              content: encryptedContent,
              attachments_enc: encryptedAttachments,
            } as any)
            .select()
            .single();

          if (savedMsg) {
            // Update the optimistic message with the real DB id
            setConversations((prev) =>
              prev.map((c) =>
                c.id === msg.conversationId
                  ? { ...c, messages: c.messages.map((m) => (m.id === msg.id ? { ...m, id: savedMsg.id } : m)) }
                  : c,
              ),
            );
          }

          await removeMessage(msg.id);
          setMessageStatuses((prev) => ({ ...prev, [msg.id]: "sent" }));

          // Trigger AI response for this queued message
          const conv = conversationsRef.current.find((c) => c.id === msg.conversationId);
          if (conv) {
            const assistantId = crypto.randomUUID();
            setConversations((prev) =>
              prev.map((c) =>
                c.id === msg.conversationId
                  ? {
                      ...c,
                      messages: c.messages,
                    }
                  : c,
              ),
            );
            setIsStreaming(true);
            let assistantContent = "";
            const history = [...conv.messages, { role: "user" as const, content: msg.content }]
              .filter((m) => {
                if (m.role !== "assistant") return true;
                const t = String(m.content || "")
                  .trim()
                  .toLowerCase();
                if (!t) return false;
                if (t === "i'm here. say that again." || t === "i'm here. send again.") return false;
                return true;
              })
              .map((m) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
              }));

            try {
              await streamChat({
                messages: history,
                mode,
                depth,
                userProfile,
                conversationId: msg.conversationId,
                onDelta: (chunk) => {
                  assistantContent += chunk;
                  const current = assistantContent;
                  setConversations((prev) =>
                    prev.map((c) => {
                      if (c.id !== msg.conversationId) return c;
                      const has = c.messages.some((m) => m.id === assistantId);
                      const messages = has
                        ? c.messages.map((m) => (m.id === assistantId ? { ...m, content: current } : m))
                        : [
                            ...c.messages,
                            { id: assistantId, role: "assistant" as const, content: current, timestamp: new Date() },
                          ];
                      return { ...c, messages };
                    }),
                  );
                },
                onDone: async () => {
                  setIsStreaming(false);
                  if (!String(assistantContent || "").trim()) return;
                  {
                    const t = String(assistantContent || "")
                      .trim()
                      .toLowerCase();
                    if (t === "i'm here. say that again." || t === "i'm here. send again.") return;
                  }
                  const encAssistant = await encryptText(assistantContent, user.id);
                  await supabase.from("messages").insert({
                    id: assistantId,
                    conversation_id: msg.conversationId,
                    user_id: user.id,
                    role: "assistant",
                    content: encAssistant,
                  });
                  pushNotification({
                    title: "Queued response ready",
                    message: assistantContent.slice(0, 80) + (assistantContent.length > 80 ? "…" : ""),
                    type: "success",
                    actionLabel: "View",
                    actionView: "chat",
                  });
                },
              });
            } catch {
              setIsStreaming(false);
            }
          }
        } catch {
          const delay = getRetryDelay(msg.retryCount);
          await updateMessageStatus(msg.id, "retrying");
          setMessageStatuses((prev) => ({ ...prev, [msg.id]: "retrying" }));
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    } finally {
      processingQueue.current = false;
    }
  }, [user, conversations, mode, depth, userProfile]);

  // CMD+K and CMD+1-4 global shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen((o) => !o);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault();
        setMode("chat");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "2") {
        e.preventDefault();
        setMode("code");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "3") {
        e.preventDefault();
        setMode("research");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "4") {
        e.preventDefault();
        setMode("truth");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Listen for navigation events from child components
  useEffect(() => {
    const handler = (e: Event) => {
      const view = (e as CustomEvent).detail as DashboardView;
      if (view) setActiveView(view);
    };
    window.addEventListener("aureon:navigate", handler);
    return () => window.removeEventListener("aureon:navigate", handler);
  }, []);

  // Load stored BYOK providers for consensus selector.
  // "aureon" is platform-hosted (no key) and always available as a switchable provider.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_api_keys")
      .select("provider")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .then(({ data }) => {
        const byok = data ? data.map((d) => d.provider) : [];
        setStoredProviders(["aureon", ...byok.filter((p) => p !== "aureon")]);
      });
  }, [user?.id]);

  // Load conversations and user profile from DB
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const [convResult, settingsResult] = await Promise.all([
        supabase
          .from("conversations")
          .select("*")
          .eq("user_id", user.id)
          .eq("archived", false)
          .order("created_at", { ascending: false }),
        supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      if (cancelled) return;

      if (convResult.error) {
        console.error("Failed to load conversations:", convResult.error);
        setLoaded(true);
        return;
      }

      // The inferred-profile table is gone: what the assistant knows about the
      // operator now lives in their encrypted vault and is read server-side.


      if (settingsResult.data?.response_depth) {
        setDepth(settingsResult.data.response_depth as ResponseDepth);
      }

      // Restore wallpaper from DB (source of truth)
      if (settingsResult.data?.wallpaper) {
        const dbWallpaper = settingsResult.data.wallpaper as string;
        setWallpaperKey(dbWallpaper);
        localStorage.setItem("aureon_wallpaper", dbWallpaper);
      }

      // Restore the appearance mode / colour the same way: the account row wins
      // on a new device, and hydrate broadcasts so the surface repaints once.
      {
        const row = settingsResult.data as {
          dashboard_bg_mode?: string | null;
          dashboard_bg_color?: string | null;
        } | null;
        if (row && (row.dashboard_bg_mode || row.dashboard_bg_color)) {
          setAppearance(hydrateAppearanceFromDb(row.dashboard_bg_mode, row.dashboard_bg_color));
        }
      }

      // Chrome layout hydrates the same way; an absent column leaves the
      // operator on whatever this device already had (default: current).
      {
        const row = settingsResult.data as { dashboard_ui?: string | null } | null;
        if (row?.dashboard_ui) setDashboardUi(hydrateDashboardUiFromDb(row.dashboard_ui));
      }

      const convRows = convResult.data ?? [];
      if (convRows.length === 0) {
        const savedConvId = localStorage.getItem("aureon_active_conv_id");
        const canBootstrapConversation =
          !bootstrapConversationRef.current && conversationsRef.current.length === 0 && !savedConvId;

        if (canBootstrapConversation) {
          bootstrapConversationRef.current = true;
          const { data: newConv, error: newConvError } = await supabase
            .from("conversations")
            .insert({ user_id: user.id, title: "New conversation", mode: "chat" })
            .select()
            .single();

          if (cancelled) return;

          if (newConvError) {
            console.error("Failed to create bootstrap conversation:", newConvError);
            bootstrapConversationRef.current = false;
            setLoaded(true);
            return;
          }

          if (newConv) {
            setConversations([
              {
                id: newConv.id,
                title: newConv.title,
                messages: [],
                createdAt: new Date(newConv.created_at),
                pinned: newConv.pinned,
                mode: newConv.mode as ChatMode,
              },
            ]);
            setActiveConvId(newConv.id);
          }
        }

        setLoaded(true);
        return;
      }

      bootstrapConversationRef.current = true;

      // FAST PATH: render dashboard immediately with conversation list (no messages yet),
      // then lazy-hydrate messages in the background. Cuts loading screen from 10s+ to <1s.
      const preferredConvId = activeConvIdRef.current ?? localStorage.getItem("aureon_active_conv_id");
      // MERGE, NEVER BLANK. If this effect re-runs while transcripts are already
      // on screen (a re-auth, a project switch), replacing them with empty shells
      // reads to the operator as a full page reload. The DB row is authoritative
      // for metadata only; in-memory messages survive until the drift probe in
      // the visibility handler proves the server is actually ahead.
      const priorById = new Map(conversationsRef.current.map((c) => [c.id, c]));
      const shellConvs: Conversation[] = convRows.map((c) => {
        const prior = priorById.get(c.id);
        return {
          ...(prior ?? {}),
          id: c.id,
          title: c.title,
          messages: prior?.messages ?? [],
          createdAt: new Date(c.created_at),
          pinned: c.pinned,
          mode: c.mode as ChatMode,
          projectId: c.project_id ?? undefined,
        } as Conversation;
      });
      setConversations(shellConvs);
      const initialActiveId =
        preferredConvId && shellConvs.find((c) => c.id === preferredConvId)
          ? preferredConvId
          : (shellConvs[0]?.id ?? null);
      setActiveConvId(initialActiveId);
      setLoaded(true);

      // Restore branches in background
      convRows.forEach((c) => {
        restoreBranchesFromDB(c.id, (c as any).branches);
        const restored = localStorage.getItem("aureon_conv_branches");
        const parsed = restored ? JSON.parse(restored) : {};
        const current = parsed[c.id];
        if (
          !Array.isArray((c as any).branches) ||
          (c as any).branches.length === 0 ||
          !current?.some((branch: any) => branch.id === "main")
        ) {
          void saveBranchesToDB(
            c.id,
            current && current.length > 0 ? current : [{ id: "main", name: "Main", createdAt: 0 }],
          );
        }
      });

      // Hydrate messages: active conversation FIRST, then the rest in the background.
      const hydrateConv = async (cid: string) => {
        const { data } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", cid)
          .order("created_at", { ascending: true })
          .limit(500);
        const rows = data ?? [];
        hydrateMessageBranches(rows.map((m) => ({ id: m.id, branch_id: (m as any).branch_id })));
        const decrypted = await Promise.all(
          rows.map(async (m) => {
            let content = "";
            try {
              content = await decryptText(m.content, user.id);
            } catch {
              content =
                "_[This message was saved with an older device-only key. Open it on the device that wrote it and re-save this conversation.]_";
            }
            const attachments = await decryptAttachments((m as any).attachments_enc, user.id);
            return {
              id: m.id,
              role: m.role as "user" | "assistant",
              content,
              timestamp: new Date(m.created_at),
              truthScore: m.truth_score as "high" | "medium" | "low" | undefined,
              sources: (m.sources as { title: string; url: string }[]) ?? [],
              attachments,
            } as Message;
          }),
        );
        if (cancelled) return;
        const visible = decrypted.filter((m) => m.role !== "assistant" || String(m.content || "").trim());
        setConversations((prev) => prev.map((c) => (c.id === cid ? { ...c, messages: visible } : c)));
      };

      // Only conversations with nothing in memory need a fetch. Re-hydrating a
      // populated thread is the second half of the "chat refreshed" complaint.
      const needsHydration = (cid: string) => (priorById.get(cid)?.messages.length ?? 0) === 0;

      (async () => {
        if (initialActiveId && needsHydration(initialActiveId)) {
          try {
            await hydrateConv(initialActiveId);
          } catch {}
        }
        if (cancelled) return;
        for (const c of convRows) {
          if (cancelled) return;
          if (c.id === initialActiveId) continue;
          if (!needsHydration(c.id)) continue;
          try {
            await hydrateConv(c.id);
          } catch {}
        }
      })();
    };

    load();
    return () => {
      cancelled = true;
    };
    // Pinned to the user *id*, never the user object: browsers mint a fresh
    // session (and therefore a fresh User instance) on TOKEN_REFRESHED when a
    // backgrounded tab wakes, and that alone used to re-run this whole loader.
  }, [user?.id]);

  // Persist active conversation id so tab-switching remembers it
  useEffect(() => {
    activeConvIdRef.current = activeConvId;
    if (activeConvId) {
      localStorage.setItem("aureon_active_conv_id", activeConvId);
    }
  }, [activeConvId]);

  // Persist active brain id
  useEffect(() => {
    if (activeBrainId) {
      localStorage.setItem("aureon_active_brain_id", activeBrainId);
    } else {
      localStorage.removeItem("aureon_active_brain_id");
    }
  }, [activeBrainId]);

  useEffect(() => {
    if (!loaded || conversations.length === 0) return;
    if (!activeConvId || !conversations.some((conversation) => conversation.id === activeConvId)) {
      setActiveConvId(conversations[0].id);
    }
  }, [loaded, conversations, activeConvId]);

  // Keep ref in sync so sendMessageCore always reads latest conversations
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Re-sync UI when tab becomes visible again — but ONLY if we were hidden long
  // enough that drift is likely AND the DB actually has newer messages than local.
  // Prior implementation force-rebuilt every conversation object on every tab flip,
  // which caused ChatView to visibly "refresh from the top" and wiped in-memory
  // extras (streaming partials, consensus cards, attachment previews).
  useEffect(() => {
    let hiddenAt: number | null = null;
    const HIDDEN_THRESHOLD_MS = 45_000; // only resync after >45s away

    const handleVisibility = async () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (document.visibilityState !== "visible") return;

      const awayMs = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = null;

      // Short tab flip → do nothing. No re-render, no re-fetch.
      if (awayMs < HIDDEN_THRESHOLD_MS) return;
      if (isStreamingRef.current) return;

      const currentConvId = activeConvIdRef.current;
      if (!user || !currentConvId) return;

      // Skip re-sync on non-main branches to avoid dropping branch-only rows.
      const currentBranch = getActiveBranch(currentConvId);
      if (currentBranch !== "main") return;

      try {
        // Cheap drift probe: fetch only the newest row's id + created_at.
        const { data: probe } = await supabase
          .from("messages")
          .select("id, created_at")
          .eq("conversation_id", currentConvId)
          .order("created_at", { ascending: false })
          .limit(1);

        const localConv = conversationsRef.current.find((c) => c.id === currentConvId);
        const localMsgs = localConv?.messages ?? [];
        const localLast = localMsgs[localMsgs.length - 1];
        const remoteLastId = probe?.[0]?.id;

        // No drift → done. Nothing rerenders.
        if (!remoteLastId || remoteLastId === localLast?.id) return;

        // Drift detected — pull full set and reconcile.
        const { data: freshMsgs } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", currentConvId)
          .order("created_at", { ascending: true })
          .limit(500);
        if (!freshMsgs || freshMsgs.length === 0) return;
        if (isStreamingRef.current) return;

        const decrypted = await Promise.all(
          freshMsgs.map(async (m) => {
            let content = "";
            try {
              content = await decryptText(m.content, user.id);
            } catch {
              content =
                "_[This message was saved with an older device-only key. Open it on the device that wrote it and re-save this conversation.]_";
            }
            const attachments = await decryptAttachments((m as any).attachments_enc, user.id);
            return {
              id: m.id,
              role: m.role as "user" | "assistant",
              content,
              timestamp: new Date(m.created_at),
              truthScore: m.truth_score as "high" | "medium" | "low" | undefined,
              sources: (m.sources as { title: string; url: string }[]) ?? [],
              attachments,
            };
          }),
        );

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== currentConvId) return c;
            const existingById = Object.fromEntries(c.messages.map((m) => [m.id, m]));
            return {
              ...c,
              // Reverse-merge: DB provides the baseline row, but in-memory fields
              // (consensusData, streaming partials, richer attachments) win.
              messages: (() => {
                const fromDb = decrypted
                  .map((dm) => ({
                    ...dm,
                    ...existingById[dm.id],
                  }))
                  .filter((m) => m.role !== "assistant" || String(m.content || "").trim());
                const inDb = new Set(fromDb.map((m) => m.id));
                const localOnly = c.messages.filter((m) => !inDb.has(m.id));
                return [...fromDb, ...localOnly];
              })(),
            };
          }),
        );
      } catch {
        // Non-critical — local state is still valid
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [user?.id]);

  // Soft-keyboard inset. On iOS the layout viewport does not shrink when the
  // keyboard opens, so a bottom-anchored composer ends up underneath it. The
  // visual viewport does shrink — publish the delta as --kb-inset and let the
  // composer sit on top of it (plus the home-indicator safe area).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const sync = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      root.style.removeProperty("--kb-inset");
    };
  }, []);

  // Restoring an archived thread puts it back in state. It used to call
  // window.location.reload(), which threw away every in-memory transcript.
  useEffect(() => {
    const onRestored = (e: Event) => {
      const conv = (e as CustomEvent).detail as Conversation | undefined;
      if (!conv?.id) return;
      setConversations((prev) => (prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]));
    };
    window.addEventListener("asherin:conversation-restored", onRestored);
    return () => window.removeEventListener("asherin:conversation-restored", onRestored);
  }, []);

  const activeConv = activeConvId
    ? (conversations.find((c) => c.id === activeConvId) ?? null)
    : (conversations[0] ?? null);

  const handleDepthChange = useCallback(
    (newDepth: ResponseDepth) => {
      setDepth(newDepth);
      if (user) {
        supabase.from("user_settings").update({ response_depth: newDepth }).eq("user_id", user.id).then();
      }
    },
    [user],
  );

  // Load Zahten-published agents so they surface as dynamic dashboard tabs (mirrors Asher Dashboard).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("asher_agents" as any)
        .select("id, name, entry_html")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!cancelled && data) setPublishedAgents(data as any);
    };
    load();
    const onUpd = () => load();
    window.addEventListener("asher-agents-updated", onUpd);
    return () => {
      cancelled = true;
      window.removeEventListener("asher-agents-updated", onUpd);
    };
  }, [user?.id]);

  const trackUsage = useCallback(
    async (modeUsed: ChatMode) => {
      if (!user) return;
      const modeCol = `${modeUsed}_prompts`;
      // maybeSingle(): zero rows is a normal first-use state, not a 406 error.
      const { data: stats } = await supabase.from("usage_stats").select("*").eq("user_id", user.id).maybeSingle();
      if (stats) {
        const today = new Date().toISOString().split("T")[0];
        const streakDays =
          stats.last_active_date === today
            ? stats.streak_days
            : stats.last_active_date === new Date(Date.now() - 86400000).toISOString().split("T")[0]
              ? stats.streak_days + 1
              : 1;
        const update: Record<string, any> = {
          total_prompts: (stats.total_prompts ?? 0) + 1,
          streak_days: streakDays,
          last_active_date: today,
        };
        update[modeCol] = ((stats as any)[modeCol] ?? 0) + 1;
        await supabase.from("usage_stats").update(update).eq("user_id", user.id);
      }
    },
    [user],
  );

  const handleCalibrationFeedback = useCallback(
    async (messageId: string, feedback: FeedbackType) => {
      if (!user) return;
      await supabase.from("calibration_feedback").insert({ user_id: user.id, message_id: messageId, feedback });
      // Depth calibration now moves the operator's saved answer depth directly,
      // so the correction survives reloads and applies on every device.
      const order: ResponseDepth[] = ["shallow", "standard", "deep", "expert"];
      let next: ResponseDepth | null = null;
      if (feedback === "too_shallow") {
        const i = order.indexOf(depth);
        if (i > -1 && i < order.length - 1) next = order[i + 1];
      } else if (feedback === "too_deep") {
        const i = order.indexOf(depth);
        if (i > 0) next = order[i - 1];
      }
      if (next) {
        setDepth(next);
        await supabase
          .from("user_settings")
          .upsert({ user_id: user.id, response_depth: next }, { onConflict: "user_id" });
      }
      toast({ title: "Calibrated", description: "Asherin adjusted to your preference." });
    },
    [user, toast, depth],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    // The queue processor polls the ref — without this, queued messages get
    // stuck behind a "still streaming" lock even after the user hit Stop.
    isStreamingRef.current = false;
  }, []);

  // Core send logic (called sequentially by queue processor)
  const sendMessageCore = async (content: string, convId: string, attachments?: FileAttachment[]) => {
    if (!user) return;
    // Hard guard against rapid double-send / concurrent streams (STRESS-01).
    if (isStreamingRef.current) {
      toast({ title: "Already responding", description: "Wait for the current reply or hit Stop." });
      return;
    }
    // Claim the streaming lock and abort handle BEFORE any async work so a
    // mid-flight Stop or second send can actually cancel us (BUG-CODE-01).
    isStreamingRef.current = true;
    const earlyController = new AbortController();
    abortRef.current = earlyController;
    setSuggestions([]);

    const tempMsgId = crypto.randomUUID();
    const conv = conversationsRef.current.find((c) => c.id === convId);
    const userMsg: Message = { id: tempMsgId, role: "user", content, timestamp: new Date(), attachments };
    const currentBranch = getActiveBranch(convId);
    tagMessageBranch(tempMsgId, currentBranch);
    const branchMsgs = conv?.messages.filter((m) => getMessageBranch(m.id) === currentBranch) ?? [];
    const isFirst = branchMsgs.length === 0 && conv?.messages.length === 0;
    if (isFirst) {
      const newTitle = content.slice(0, 50);
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: newTitle, messages: [...c.messages, userMsg] } : c)),
      );
      supabase.from("conversations").update({ title: newTitle }).eq("id", convId).then();
    } else {
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, userMsg] } : c)));
    }

    setMessageStatuses((prev) => ({ ...prev, [tempMsgId]: "sending" }));
    await enqueueMessage({ id: tempMsgId, conversationId: convId, content, role: "user" }).catch(() => {});

    if (!navigator.onLine) {
      setMessageStatuses((prev) => ({ ...prev, [tempMsgId]: "queued" }));
      registerBackgroundSync().catch(() => {});
      toast({ title: "Message queued", description: "Will send automatically when you're back online." });
      return;
    }

    try {
      const encryptedContent = await encryptText(content, user.id);
      const encryptedAttachments = attachments?.length
        ? await encryptText(JSON.stringify(serializeAttachments(attachments)), user.id)
        : null;
      const { data: userMsgRow } = await supabase
        .from("messages")
        .insert({
          conversation_id: convId,
          user_id: user.id,
          role: "user",
          content: encryptedContent,
          attachments_enc: encryptedAttachments,
        } as any)
        .select()
        .single();

      if (userMsgRow) {
        retargetMessageBranch(tempMsgId, userMsgRow.id);
        tagMessageBranch(userMsgRow.id, currentBranch); // ensure tag exists even if retarget missed
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, messages: c.messages.map((m) => (m.id === tempMsgId ? { ...m, id: userMsgRow.id } : m)) }
              : c,
          ),
        );
      }

      setMessageStatuses((prev) => ({ ...prev, [tempMsgId]: "sent" }));
      await removeMessage(tempMsgId).catch(() => {});
    } catch (err) {
      setMessageStatuses((prev) => ({ ...prev, [tempMsgId]: "queued" }));
      registerBackgroundSync().catch(() => {});
      toast({ title: "Message queued", description: "Network issue. Will retry automatically." });
      // Release the early streaming lock if we bail here.
      isStreamingRef.current = false;
      abortRef.current = null;
      return;
    }

    trackUsage(mode);
    setIsStreaming(true);
    let assistantContent = "";
    const isHoldCostume = (s: string) =>
      /^\s*i'm here\.\s*(say that again|send again)\.?\s*$/i.test(String(s || "").trim());
    const assistantId = crypto.randomUUID();
    tagMessageBranch(assistantId, currentBranch);
    // Reuse the controller we already assigned above so Stop works during pre-flight.
    const controller = earlyController;
    abortRef.current = controller;

    // assistant row exists from send so thinking + mouth have a home in ChatView
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: c.messages.some((m) => m.id === assistantId)
                ? c.messages
                : [...c.messages, { id: assistantId, role: "assistant" as const, content: "", timestamp: new Date() }],
            }
          : c,
      ),
    );

    // Only send branch-scoped history to AI (no memory leaking between branches).
    // If the composer registered a hidden model-prompt override for this visible
    // content (LAW / NAR modes), swap it in for the LAST user turn only so the
    // stored + displayed user message stays raw while the model receives the
    // wrapped directive.
    const { takeModelPromptOverride } = await import("@/lib/promptOverrideMap"); // async ok — resolves before streamChat
    const modelPromptOverride = takeModelPromptOverride(content);
    const history = [...branchMsgs, userMsg]
      .filter((m) => m.role !== "assistant" || (String(m.content || "").trim() && !isHoldCostume(String(m.content))))
      .map((m, i, arr) => ({
        role: m.role as "user" | "assistant",
        content: modelPromptOverride && i === arr.length - 1 && m.role === "user" ? modelPromptOverride : m.content,
        attachments: m.attachments,
      }));

    // ── INVESTIGATION GROUNDING ───────────────────────────────────────
    // Only a research request or an investigation follow-up is touched here;
    // every other turn passes through with its content unchanged.
    try {
      const { applyInvestigationTurn } = await import("@/lib/investigation/chatHook");
      const turn = await applyInvestigationTurn(content, convId);
      if (turn.applied && history.length) {
        const last = history[history.length - 1];
        if (last.role === "user") last.content = turn.content;
        setActiveInvestigationId(turn.investigationId);
      }
      if (turn.notice) {
        thinkingStore.step(assistantId, "investigation", turn.notice, "done");
      }
    } catch (e) {
      console.error("investigation grounding skipped:", e);
    }

    // ── INTELLIGENCE TURN ───────────────────────────────────────────
    // memory + procedure retrieval runs before the model sees anything; the
    // learning half runs in onDone / catch after the answer lands. a failure
    // here never blocks the message — the chat works without it.
    let preparedTurn: import("@/lib/intelligence/orchestrator").PreparedTurn | null = null;
    let intelligenceContext: string | undefined;
    try {
      const { prepareTurn } = await import("@/lib/intelligence/orchestrator");
      preparedTurn = await prepareTurn({
        conversationId: convId,
        message: content,
        hasImageInput: !!attachments?.length,
      });
      if (preparedTurn.composed.trim()) intelligenceContext = preparedTurn.composed;
      if (preparedTurn.discoveryRan) {
        thinkingStore.step(assistantId, "learning", "no covering procedure — drafted a hypothesis", "done");
      } else if (preparedTurn.context.patterns.length > 0) {
        thinkingStore.step(
          assistantId,
          "memory",
          `${preparedTurn.context.patterns.length} procedure(s) in context`,
          "done",
        );
      }
    } catch (e) {
      console.error("intelligence prepare skipped:", e);
    }

    // ── BRAIN CONTEXT ─────────────────────────────────────────────────
    let brainContext: { prompt: string; fileContents: { name: string; content: string }[] } | null = null;
    if (activeBrainId) {
      try {
        const { data: brain } = await supabase
          .from("brains")
          .select("system_prompt, file_ids")
          .eq("id", activeBrainId)
          .single();
        if (brain) {
          const fileContents: { name: string; content: string }[] = [];
          if (brain.file_ids?.length) {
            const { data: files } = await supabase
              .from("library_files")
              .select("file_name, storage_path, file_type")
              .in("id", brain.file_ids);
            if (files) {
              for (const f of files) {
                // Only load text-readable files as context
                const isText =
                  !f.file_type.startsWith("image/") &&
                  !f.file_type.startsWith("video/") &&
                  !f.file_type.startsWith("audio/");
                if (isText) {
                  const { data: blob } = await supabase.storage.from("library").download(f.storage_path);
                  if (blob) {
                    const text = await blob.text();
                    fileContents.push({ name: f.file_name, content: text.slice(0, 80000) });
                  }
                }
              }
            }
          }
          brainContext = { prompt: brain.system_prompt || "", fileContents };
        }
      } catch (e) {
        console.error("Failed to load brain context:", e);
      }
    }

    // Algorithm mode removed — all chat runs through BYOK only.

    // ── CONSENSUS MODE ──────────────────────────────────────────────

    if (consensusEnabled && consensusModels.length >= 2) {
      try {
        const result = await fetchConsensus({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          models: consensusModels.map((m) => ({ provider: m.provider, model: m.model })),
          mode,
        });

        // Pick the best content: use verdict response if available
        const verdictIdx = result.verdict?.index ?? 0;
        const successfulResponses = result.responses.filter((r) => r.content && !r.error);
        const bestContent =
          successfulResponses[verdictIdx]?.content ||
          successfulResponses[0]?.content ||
          result.responses
            .filter((r) => r.content)
            .map((r) => `**${r.provider}/${r.model}:**\n${r.content}`)
            .join("\n\n---\n\n") ||
          "No models responded successfully.";

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, content: bestContent, consensusData: result as any } : m,
                  ),
                }
              : c,
          ),
        );
        setIsStreaming(false);
        isStreamingRef.current = false;

        const encryptedAssistant = await encryptText(bestContent, user.id);
        await supabase.from("messages").insert({
          id: assistantId,
          conversation_id: convId,
          user_id: user.id,
          role: "assistant",
          content: encryptedAssistant,
        });
        const sug = await fetchSuggestions(bestContent);
        setSuggestions(sug);

        const confLevel = result.confidence?.level || "medium";
        const successCount = successfulResponses.length;
        const totalCount = result.responses.length;
        pushNotification({
          title: `Consensus: ${result.consensus ? "Models agree" : "Models diverge"}`,
          message: `${successCount}/${totalCount} responded · ${result.confidence?.overallConfidence ?? 0}% confidence${result.confidence?.needsHumanReview ? " · ⚠ Human review recommended" : ""}`,
          type: confLevel === "high" ? "success" : confLevel === "critical_divergence" ? "error" : "info",
          actionLabel: "View",
          actionView: "chat",
        });
      } catch (e: any) {
        setIsStreaming(false);
        isStreamingRef.current = false;
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, messages: c.messages.filter((m) => m.id !== assistantId) } : c)),
        );
        toast({ title: "Consensus Error", description: e.message, variant: "destructive" });
      }
      return;
    }

    // ── STANDARD STREAMING ──────────────────────────────────────────
    try {
      await streamChat({
        messages: history,
        mode,
        depth,
        userProfile,
        brainContext,
        intelligenceContext,
        conversationId: convId,
        turnId: assistantId,
        signal: controller.signal,
        // Ghost Chain phase 1 — reasoning streams into the transparency panel.
        onTools: (rows) => rows.forEach((r) => thinkingStore.step(assistantId, r.label, r.detail, "done")),
        // A workspace opens because its organ ran — never because a keyword
        // matched. The split happens after the tool cards land, so the
        // operator sees what fired and where it went in the same beat.
        onHands: (hands) => {
          void import("@/lib/chat/hands").then(({ openHands }) => {
            openHands(hands, (view) => setActiveView(view as DashboardView));
          });
        },
        onThinkingStart: () => thinkingStore.begin(assistantId),
        onThinkingDelta: (chunk) => thinkingStore.append(assistantId, chunk),
        onThinkingDone: () => thinkingStore.answering(assistantId),
        onDelta: (chunk) => {
          assistantContent += chunk;
          const current = assistantContent;
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              const has = c.messages.some((m) => m.id === assistantId);
              const messages = has
                ? c.messages.map((m) => (m.id === assistantId ? { ...m, content: current } : m))
                : [
                    ...c.messages,
                    { id: assistantId, role: "assistant" as const, content: current, timestamp: new Date() },
                  ];
              return { ...c, messages };
            }),
          );
        },
        onReplace: (content) => {
          assistantContent = content;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? { ...c, messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content } : m)) }
                : c,
            ),
          );
        },
        onDone: async () => {
          thinkingStore.finish(assistantId);
          if (!String(assistantContent || "").trim() || isHoldCostume(assistantContent)) {
            const thinkText = String(thinkingStore.snapshot(assistantId)?.text || "").trim();
            if (thinkText && !isHoldCostume(thinkText)) {
              assistantContent = thinkText;
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === convId
                    ? {
                        ...c,
                        messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content: thinkText } : m)),
                      }
                    : c,
                ),
              );
            }
          }
          setIsStreaming(false);
          isStreamingRef.current = false;
          if (!String(assistantContent || "").trim() || isHoldCostume(assistantContent)) {
            const mouth = "no words came back from the model.";
            assistantContent = mouth;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? {
                      ...c,
                      messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content: mouth } : m)),
                    }
                  : c,
              ),
            );
          }
          // Persist assistant message via upsert — idempotent so a retry on a
          // flaky network cannot create a duplicate row when the first insert
          // actually succeeded (BUG-FLOW-03).
          const persistOnce = async () => {
            const encryptedAssistant = await encryptText(assistantContent, user.id);
            await supabase.from("messages").upsert(
              {
                id: assistantId,
                conversation_id: convId,
                user_id: user.id,
                role: "assistant",
                content: encryptedAssistant,
              },
              { onConflict: "id", ignoreDuplicates: true },
            );
          };
          try {
            await persistOnce();
          } catch (saveErr) {
            console.error("Failed to save assistant message, retrying:", saveErr);
            try {
              await persistOnce();
            } catch (retryErr) {
              console.error("Retry save also failed:", retryErr);
            }
          }
          // A code write is the only thing that opens the workspace hand: real
          // files with real paths, extracted from what the model actually
          // returned. Chat stays the mouth — the diff and the approval gate
          // live in the workspace, so nothing is written from here.
          try {
            const { extractZanoemCodeFiles } = await import("@/components/dashboard/zali/zanoemOutput");
            const written = extractZanoemCodeFiles(assistantContent).filter(
              (f) => f.filename && !/^snippet-\d+\./i.test(f.filename) && f.content?.trim(),
            );
            if (written.length > 0) {
              const { queueIdeHandoff } = await import("@/lib/ide/chatHandoff");
              if (queueIdeHandoff(written, content)) setActiveView("ide" as DashboardView);
            }
          } catch (handoffErr) {
            console.warn("[chat] ide handoff skipped", handoffErr);
          }
          try {
            const sug = await fetchSuggestions(assistantContent);
            setSuggestions(sug);
          } catch {
            /* suggestions are non-critical */
          }
          // learning half of the turn — gated, audited, never blocks the UI.
          const completedTurn = preparedTurn;
          if (completedTurn) {
            void import("@/lib/intelligence/orchestrator")
              .then(({ completeTurn }) => completeTurn(completedTurn, { ok: true, text: assistantContent }))
              .catch((e) => console.error("intelligence complete skipped:", e));
          }
          pushNotification({
            title: "Asherin responded",
            message: assistantContent.slice(0, 80) + (assistantContent.length > 80 ? "…" : ""),
            type: "success",
            actionLabel: "View",
            actionView: "chat",
          });
        },
      });
    } catch (e: any) {
      setIsStreaming(false);
      isStreamingRef.current = false;
      thinkingStore.finish(assistantId);
      // record the failed turn so pattern outcomes stay honest.
      const failedTurn = preparedTurn;
      if (failedTurn) {
        void import("@/lib/intelligence/orchestrator")
          .then(({ completeTurn }) =>
            completeTurn(failedTurn, {
              ok: false,
              text: assistantContent,
              unavailableReason: e?.name === "AbortError" ? "stopped by operator" : String(e?.message || e),
            }),
          )
          .catch((err) => console.error("intelligence complete skipped:", err));
      }
      if (e.name === "AbortError") {
        if (assistantContent) {
          try {
            const encryptedPartial = await encryptText(assistantContent, user.id);
            await supabase.from("messages").insert({
              id: assistantId,
              conversation_id: convId,
              user_id: user.id,
              role: "assistant",
              content: encryptedPartial,
            });
          } catch {
            /* best-effort save */
          }
        }
        toast({ title: "Stopped", description: "Generation stopped. Partial response saved." });
      } else {
        // Save partial content if we got any before the error
        if (isHoldCostume(assistantContent)) assistantContent = "";
        if (assistantContent) {
          try {
            const encPartial = await encryptText(assistantContent, user.id);
            await supabase.from("messages").insert({
              id: assistantId,
              conversation_id: convId,
              user_id: user.id,
              role: "assistant",
              content: encPartial,
            });
          } catch {
            /* best-effort save */
          }
        }
        const death =
          e?.name === "TypeError" || /failed to fetch|networkerror|load failed/i.test(String(e?.message || ""));
        if (death || !String(assistantContent || "").trim() || isHoldCostume(assistantContent)) {
          if (isHoldCostume(assistantContent)) assistantContent = "";
          const thinkText = String(thinkingStore.snapshot(assistantId)?.text || "").trim();
          if (
            (!String(assistantContent || "").trim() || isHoldCostume(assistantContent)) &&
            thinkText &&
            !isHoldCostume(thinkText)
          ) {
            assistantContent = thinkText;
          }
          const errMsg = String(e?.message || "").trim();
          const body = String(assistantContent || "").trim();
          const fetchDeath =
            death ||
            /failed to fetch|networkerror|load failed/i.test(body) ||
            /failed to fetch|networkerror|load failed/i.test(errMsg);
          const keep = fetchDeath
            ? "the connection dropped before the answer finished."
            : body ||
              (errMsg && !/failed to fetch|networkerror|load failed/i.test(errMsg) ? errMsg : "") ||
              "no words came back from the model.";
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    messages: c.messages.map((m) => (m.id === assistantId ? { ...m, content: keep } : m)),
                  }
                : c,
            ),
          );
        }
      }
    }
  };

  // Queue processor — drains pending messages sequentially
  const processQueue = useCallback(async () => {
    if (processingQueue.current) return;
    processingQueue.current = true;
    while (pendingQueue.current.length > 0) {
      // Check if paused
      if (queuePausedRef.current) {
        processingQueue.current = false;
        return;
      }
      const next = pendingQueue.current.shift()!;
      // Remove from visible queue
      setQueueItems((prev) => (prev.length > 0 ? prev.slice(1) : prev));
      const [convId, ...contentParts] = next.split("||");
      const content = contentParts.join("||");
      const fileAttachments = attachmentMapRef.current.get(content);
      if (fileAttachments) attachmentMapRef.current.delete(content);
      await sendMessageCore(content, convId, fileAttachments);
      // Wait for streaming to finish before processing next
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!isStreamingRef.current) return resolve();
          setTimeout(check, 100);
        };
        check();
      });
    }
    processingQueue.current = false;
  }, [user, mode, depth, userProfile]);

  const toggleQueuePause = useCallback(() => {
    setQueuePaused((prev) => {
      const next = !prev;
      queuePausedRef.current = next;
      // If unpausing, kick off processing
      if (!next && pendingQueue.current.length > 0) {
        processQueue();
      }
      return next;
    });
  }, [processQueue]);

  const forceProcessQueue = useCallback(() => {
    queuePausedRef.current = false;
    setQueuePaused(false);
    processQueue();
  }, [processQueue]);

  // Public sendMessage — adds to queue and kicks off processing
  const sendMessage = async (content: string, attachments?: FileAttachment[]) => {
    const convId = activeConvIdRef.current;
    if (!user || !convId) return;


    // F-01 Auto-config: on the FIRST user message of a conversation, infer the
    // best Mode / Depth from intent keywords so users don't have to think about
    // controls. Manual changes after the first message always win.
    try {
      const conv = conversations.find((c) => c.id === convId);
      const hasPriorUser = conv?.messages.some((m) => m.role === "user");
      if (!hasPriorUser) {
        const { inferChatConfig } = await import("@/lib/navIntents");
        const hint = inferChatConfig(content);
        if (hint.mode && hint.mode !== mode) setMode(hint.mode as ChatMode);
        if (hint.depth && hint.depth !== depth) setDepth(hint.depth as ResponseDepth);
      }
    } catch {
      /* non-fatal */
    }

    // Store attachments for the first message in a ref-based map
    if (attachments?.length) {
      attachmentMapRef.current.set(content, attachments);
    }
    // If currently streaming, show queued status and add to queue
    if (isStreamingRef.current) {
      const tempId = crypto.randomUUID();
      const userMsg: Message = { id: tempId, role: "user", content, timestamp: new Date(), attachments };
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, messages: [...c.messages, userMsg] } : c)));
      setMessageStatuses((prev) => ({ ...prev, [tempId]: "queued" }));
      const queueEntry = `${convId}||${content}`;
      pendingQueue.current.push(queueEntry);
      setQueueItems((prev) => [...prev, { id: tempId, content }]);
      toast({ title: "Message queued", description: "Will send after current response completes." });
      return;
    }
    pendingQueue.current.push(`${convId}||${content}`);
    processQueue();
  };

  const removeFromQueue = useCallback((id: string) => {
    setQueueItems((prev) => {
      const idx = prev.findIndex((q) => q.id === id);
      if (idx >= 0) pendingQueue.current.splice(idx, 1);
      return prev.filter((q) => q.id !== id);
    });
    // Remove from conversation messages too
    setConversations((prev) =>
      prev.map((c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== id),
      })),
    );
    setMessageStatuses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const clearQueue = useCallback(() => {
    const ids = queueItems.map((q) => q.id);
    pendingQueue.current = [];
    setQueueItems([]);
    // Remove queued messages from conversation
    setConversations((prev) =>
      prev.map((c) => ({
        ...c,
        messages: c.messages.filter((m) => !ids.includes(m.id)),
      })),
    );
    setMessageStatuses((prev) => {
      const next = { ...prev };
      ids.forEach((id) => delete next[id]);
      return next;
    });
  }, [queueItems]);

  const newConversation = async (projectId?: string | null) => {
    if (!user) return;
    // A conversation started while a workspace is active belongs to that
    // workspace, so it inherits its files and standing directions on reload.
    // Sidebar buttons pass a click event through this handler — only a real
    // project id counts, never an event object.
    const boundProjectId =
      typeof projectId === "string" && projectId ? projectId : (getActiveScope()?.projectId ?? null);
    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title: "New conversation", mode, project_id: boundProjectId })
      .select()
      .single();
    if (error || !newConv) {
      toast({ title: "Failed to create conversation", description: error?.message, variant: "destructive" });
      return;
    }
    const conv: Conversation = {
      id: newConv.id,
      title: newConv.title,
      messages: [],
      createdAt: new Date(newConv.created_at),
      pinned: newConv.pinned,
      mode: newConv.mode as ChatMode,
      projectId: newConv.project_id ?? undefined,
    };
    // CRITICAL: sync the ref synchronously so any sendMessage fired before
    // React commits the state still routes to the new conversation.
    activeConvIdRef.current = newConv.id;
    setConversations((prev) => [conv, ...prev]);
    setActiveConvId(newConv.id);
    setActiveView("chat");
    setSidebarOpen(false);
    setSuggestions([]);
  };

  const deleteConversation = async (id: string) => {
    await supabase.from("messages").delete().eq("conversation_id", id);
    await supabase.from("conversations").delete().eq("id", id);
    const remaining = conversations.filter((c) => c.id !== id);
    if (remaining.length === 0) {
      await newConversation();
    } else {
      setConversations(remaining);
      if (activeConvId === id) setActiveConvId(remaining[0].id);
    }
    toast({ title: "Conversation deleted permanently" });
  };

  const archiveConversation = async (id: string) => {
    const archived = conversations.find((c) => c.id === id);
    await supabase.from("conversations").update({ archived: true }).eq("id", id);
    const remaining = conversations.filter((c) => c.id !== id);
    if (remaining.length === 0) {
      await newConversation();
    } else {
      setConversations(remaining);
      if (activeConvId === id) setActiveConvId(remaining[0].id);
    }
    if (archived) {
      toast({
        title: "Conversation archived",
        description: archived.title,
        action: React.createElement(
          ToastAction,
          {
            altText: "Undo archive",
            onClick: async () => {
              await supabase.from("conversations").update({ archived: false }).eq("id", id);
              setConversations((prev) => [archived, ...prev]);
              setActiveConvId(id);
            },
          } as any,
          "Undo",
        ) as any,
      });
    }
  };

  const renameConversation = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    await supabase.from("conversations").update({ title: newTitle.trim() }).eq("id", id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: newTitle.trim() } : c)));
  };

  const togglePin = async (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    const newPinned = !conv.pinned;
    await supabase.from("conversations").update({ pinned: newPinned }).eq("id", id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: newPinned } : c)));
  };

  const isV2 = dashboardUi === "v2";

  const renderView = () => {
    // Gate map: view -> { component, title, description }
    const gatedView = (view: DashboardView, Component: React.ComponentType, title: string, description: string) => {
      if (canAccess(view))
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <Component />
            </Suspense>
          </ErrorBoundary>
        );
      // Retired rooms have no surface to render; say so plainly.
      return (
        <RetiredRoom title={isV2 ? v2TitleFor(view, title).title : title} />
      );
    };

    // Dynamic Zahten-published agent tabs (id format: "agent:<uuid>")
    if (typeof activeView === "string" && (activeView as string).startsWith("agent:")) {
      const a = publishedAgents.find((x) => `agent:${x.id}` === activeView);
      if (a) {
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <AsherPublishedTabRenderer name={a.name} entryHtml={a.entry_html || ""} />
            </Suspense>
          </ErrorBoundary>
        );
      }
    }

    switch (activeView) {
      case "investigations":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <InvestigationWorkspace
                investigationId={activeInvestigationId}
                onSelect={setActiveInvestigationId}
              />
            </Suspense>
          </ErrorBoundary>
        );
      case "asherin-defender":
        return gatedView(
          "asherin-defender",
          AsherinDefenderView,
          "asherin.defender",
          "your device, read honestly — 186 named protections across disks, files, network, wireless, bluetooth, browsers, extensions, apps, processes, accounts, updates, peripherals and remote sessions. the browser measures what a page can. anything nothing looked at reads unmeasured, never green.",
        );
      case "asherin-sentinel":
        return gatedView(
          "asherin-sentinel",
          SentinelView,
          "asherin.sentinel",
          "an ambient watch — voices separated and learned, sounds tagged, every turn in one searchable timeline held on this device. it listens while this page is open; a browser cannot hold a microphone after its tab is gone.",
        );
      case "asherin-eye":
        return (
          <div className="asherin-eye-pane relative h-full min-h-0 w-full flex-1 overflow-hidden">
            {gatedView(
              "asherin-eye",
              AsherinEyeView,
              "asherin.eye",
              "photoreal 3d globe with live public flights, sats, quakes, radio and osm sites. maps stays its own room.",
            )}
          </div>
        );
      case "asherin-health":
        return gatedView(
          "asherin-health",
          AsherinHealthView,
          "asherin.health",
          "your own anatomy, read from your own record: bloodwork, medication, genetics, exposures, surgery, family history, pain and live sensors. it explains and orients — it does not diagnose, and the record stays on your device.",
        );
      case "asherin-arvision":
        return gatedView(
          "asherin-arvision",
          AsherinArVisionView,
          "asherin.arvision",
          "live camera hud with native frame intel and freeze. saved packets, the rf lattice and plate or vin public-index lookups run on your own model key.",
        );
      case "ghost-engine":
        return gatedView(
          "ghost-engine",
          AsherinxEngView,
          "asherinx.eng",
          "public-index search over eighteen open indexes, with origin, identifier and the buffer.",
        );
      case "search":
        return gatedView(
          "search",
          AsherinSearchView,
          "asherin.search",
          "discovery-first search: cert transparency, dns probes, orphan paths, archived captures, code leaks and identity pivots. free public sources; anything needing a paid key stays unmeasured with the reason.",
        );
      case "zali":
        return gatedView(
          "zali",
          ZaliView,
          "ZANOEM Design Lab",
          "Universal Design Intelligence — first-principles design from atoms to universes with cross-domain AI agents.",
        );
      case "community":
        return gatedView(
          "community",
          CommunityView,
          "Community",
          "Join the community — ask questions, make requests, and vote on future features.",
        );
      case "azplen":
        return gatedView(
          "azplen",
          AsherinDataView,
          "Asherin Data",
          "The data intelligence platform — bring your data, ask in plain english, get an answer with evidence, a visual and what to watch next. Available on paid plans.",
        );
      // case "elion" removed
      case "briefing":
        return gatedView(
          "briefing",
          BriefingView,
          "Intelligence Briefings",
          "Personalized daily intelligence briefings — competitor tracking, regulatory monitoring, and market signals.",
        );
      // Team is ungated: any seat may start a Team
      // space, and an invited member must reach the accept screen before
      // they hold any team entitlement at all.
      case "teams":
        return <TeamsView />;

      case "notebooks":
        return gatedView(
          "notebooks",
          NotebooksView,
          "Intelligence Notebooks",
          "Shared analysis sessions with versioning, scheduling, and collaborative editing.",
        );
      // The old stats page and audit page were each half a room. They are one
      // activity panel now, free for everyone: it is your own record.
      case "audit":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <ActivityView />
            </Suspense>
          </ErrorBoundary>
        );
      case "zahten":
        return gatedView(
          "zahten" as DashboardView,
          AsherZahtenModule,
          "Zahten Agent Forge",
          "Autonomous agent builder — design, scaffold, and harden production-grade automated agents. Available on the Chat plan and above.",
        );

      case "pattern-analysis":
        return gatedView(
          "pattern-analysis",
          PatternAnalysisView,
          "Pattern Analysis Engine",
          "Data pattern recognition with visual graph forecasting. Available on Asherin Pro.",
        );
      case "zerlal":
        return gatedView(
          "zerlal",
          ZerlalView,
          "asherin.cyber",
          "Passive domain reconnaissance and public advisory context. Available on Asherin Pro.",
        );
      case "google":
        return gatedView(
          "google",
          GoogleIntelligenceView,
          "Cloud Intelligence Mesh",
          "Asherin turns your own connected accounts into a collection array: correspondent fusion, place cartography, attention ledger, commitment extraction, exposure and threat chaining.",
        );
      // case "imagine-intelligence" removed
      case "file-scrapper":
        return gatedView(
          "file-scrapper",
          FileScrapperView,
          "File Scrapper",
          "Upload unstructured documents and extract all text into a single downloadable TXT file. Available on Asherin and above.",
        );

      case "bug-reports":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <BugReportsView />
            </Suspense>
          </ErrorBoundary>
        );
      case "guardian-vault":
        return gatedView(
          "guardian-vault",
          GuardianVaultView,
          "Guardian Vault",
          "Sessions, MFA, audit trail, encrypted item storage, and Watchtower exposure review. Included on every paid plan.",
        );
      case "knowledge-vault":
        return gatedView(
          "knowledge-vault",
          KnowledgeVaultView,
          "Knowledge Vault (RAG)",
          "Private retrieval-augmented memory — upload files or connect APIs and Asherin will cite them automatically in every chat.",
        );
      case "gematria":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <GematriaView />
            </Suspense>
          </ErrorBoundary>
        );
      // Always-accessible views
      case "library":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <LibraryView />
            </Suspense>
          </ErrorBoundary>
        );
      case "snippets":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <CodeSnippetsView />
            </Suspense>
          </ErrorBoundary>
        );
      case "whiteboard":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <div className="h-full w-full min-h-0">
                <WhiteboardView />
              </div>
            </Suspense>
          </ErrorBoundary>
        );
      case "projects":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <ProjectsView
                conversations={conversations}
                onOpenConversation={(id) => {
                  setActiveConvId(id);
                  setSuggestions([]);
                  setActiveView("chat");
                }}
                onNewProjectConversation={(projectId) => {
                  void newConversation(projectId);
                }}
              />
            </Suspense>
          </ErrorBoundary>
        );
      case "memory":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <OrganismVaultView />
            </Suspense>
          </ErrorBoundary>
        );
      case "stats":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <ActivityView />
            </Suspense>
          </ErrorBoundary>
        );
      case "vedic-astrology":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <VedicAstrologyView />
            </Suspense>
          </ErrorBoundary>
        );
      case "settings":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <SettingsView />
            </Suspense>
          </ErrorBoundary>
        );
      case "api-keys":
      case "connect":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <ConnectView />
            </Suspense>
          </ErrorBoundary>
        );
      case "ide":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <AureonIdeView />
            </Suspense>
          </ErrorBoundary>
        );
      // asherin.pages — one document studio. The old slides / ebook / pdf deep
      // links still work: they simply open the studio on their own output type.
      case "pdf-generator":
      case "ebook":
      case "slideshow":
        return (
          <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <DocumentStudioView initialKind={activeView === "ebook" ? "book" : activeView === "slideshow" ? "deck" : "page"} />
            </Suspense>
          </ErrorBoundary>
        );

      default:
        return activeConv ? (
          <div className="flex h-full w-full min-w-0">
            <div className="flex-1 min-w-0 flex flex-col">
              <ChatView
                conversation={activeConv}
                onSendMessage={sendMessage}
                mode={mode}
                onModeChange={setMode}
                depth={depth}
                onDepthChange={handleDepthChange}
                isStreaming={isStreaming}
                suggestions={suggestions}
                onCalibrationFeedback={handleCalibrationFeedback}
                onStopStreaming={stopStreaming}
                focusMode={focusMode}
                messageStatuses={messageStatuses}
                queueItems={queueItems}
                onRemoveFromQueue={removeFromQueue}
                onClearQueue={clearQueue}
                onProcessQueueNow={forceProcessQueue}
                queuePaused={queuePaused}
                onToggleQueuePause={toggleQueuePause}
                consensusEnabled={consensusEnabled}
                onConsensusToggle={setConsensusEnabled}
                consensusModels={consensusModels}
                onConsensusModelsChange={setConsensusModels}
                storedProviders={storedProviders}
                activeBrainId={activeBrainId}
                onBrainChange={setActiveBrainId}
              />
            </div>
            <PromptEnhancerPanel conversation={activeConv} />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-6">
            <div className="max-w-md text-center space-y-4">
              <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-foreground/40">◈ ASHERIN</p>
              <h2 className="text-xl font-extralight tracking-wide text-foreground">
                {dashboardUi === "v2" ? "start with a question." : "Welcome to your workspace."}
              </h2>
              <p className="text-sm font-extralight text-muted-foreground">
                {dashboardUi === "v2"
                  ? "ask, and asherin will use search, files, or a map when it needs them."
                  : "Spin up your first conversation, or pick a module from the sidebar."}
              </p>
              <button
                onClick={async () => {
                  if (!user) return;
                  const { data: nc } = await supabase
                    .from("conversations")
                    .insert({ user_id: user.id, title: "New conversation", mode: "chat" })
                    .select()
                    .single();
                  if (nc) {
                    setConversations([
                      {
                        id: nc.id,
                        title: nc.title,
                        messages: [],
                        createdAt: new Date(nc.created_at),
                        pinned: nc.pinned,
                        mode: nc.mode as ChatMode,
                      },
                    ]);
                    setActiveConvId(nc.id);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.04] px-5 py-2 text-sm font-light text-foreground hover:bg-white/[0.08] transition"
              >
                + Start a conversation
              </button>
            </div>
          </div>
        );
    }
  };

  if (!loaded) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-background">
        <div className="text-sm font-extralight tracking-[0.2em] text-muted-foreground animate-pulse">ASHERIN</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      <Suspense fallback={null}>
        <NewAccountWelcomeModal />
      </Suspense>
      <h1 className="sr-only">Asherin Dashboard — Your Intelligence Workspace</h1>
      <DashboardSurface
        appearance={appearance}
        activeWallpaper={activeWallpaper}
        prevWallpaper={prevDashWallpaper}
        transitioning={isDashTransitioning}
      />
      {/* Light streak wipe — ABOVE overlay */}
      {isDashTransitioning && (
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 4 }}>
          <div
            style={{
              position: "absolute",
              top: "-20%",
              bottom: "-20%",
              width: "35%",
              background:
                "linear-gradient(90deg, transparent 0%, hsla(275,80%,70%,0.12) 15%, hsla(275,80%,85%,0.3) 35%, hsla(0,0%,100%,0.5) 50%, hsla(275,80%,85%,0.3) 65%, hsla(275,80%,70%,0.12) 85%, transparent 100%)",
              filter: "blur(25px)",
              animation: "wpLightStreak 0.85s cubic-bezier(0.25,0.1,0.25,1) forwards",
              transform: "translateX(-100%) skewX(-8deg)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "-10%",
              bottom: "-10%",
              width: "3px",
              background:
                "linear-gradient(180deg, transparent 5%, hsla(275,80%,85%,0.7) 30%, hsla(0,0%,100%,0.95) 50%, hsla(275,80%,85%,0.7) 70%, transparent 95%)",
              filter: "blur(1px)",
              animation: "wpLightStreak 0.85s cubic-bezier(0.25,0.1,0.25,1) forwards",
              transform: "translateX(-100%) skewX(-8deg)",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "-30%",
              bottom: "-30%",
              width: "60%",
              background: "radial-gradient(ellipse at center, hsla(275,60%,70%,0.18) 0%, transparent 70%)",
              filter: "blur(40px)",
              animation: "wpLightStreak 0.85s cubic-bezier(0.25,0.1,0.25,1) forwards",
              transform: "translateX(-100%) skewX(-5deg)",
            }}
          />
        </div>
      )}

      {focusMode && (
        <Suspense fallback={null}>
          <FocusMode active={focusMode} onExit={() => setFocusMode(false)} />
        </Suspense>
      )}

      {asherEmbed && (
        <style>{`
          /* Asher embed: lock dashboard to chat conversations only */
          [data-dashboard-sidebar-nav] { display: none !important; }
          [data-dashboard-mode-switcher] { display: none !important; }
          [data-dashboard-view-switcher] { display: none !important; }
          [data-dashboard-app-launcher] { display: none !important; }
        `}</style>
      )}

      {!focusMode && <IntelAlertCenter />}

      <div className="relative z-10 flex h-dvh">
        {!focusMode &&
          (dashboardUi === "v2" ? (
            <DashboardSidebarV2
              conversations={conversations}
              activeConversationId={activeConvId ?? ""}
              activeView={activeView}
              onSelectConversation={(id) => {
                setActiveConvId(id);
                setSuggestions([]);
              }}
              onNewConversation={newConversation}
              onDeleteConversation={deleteConversation}
              onArchiveConversation={archiveConversation}
              onRenameConversation={renameConversation}
              onTogglePin={togglePin}
              onViewChange={setActiveView}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              publishedAgents={publishedAgents}
            />
          ) : (
            <DashboardSidebar
              conversations={conversations}
              activeConversationId={activeConvId ?? ""}
              activeView={activeView}
              onSelectConversation={(id) => {
                setActiveConvId(id);
                setSuggestions([]);
              }}
              onNewConversation={newConversation}
              onDeleteConversation={deleteConversation}
              onArchiveConversation={archiveConversation}
              onRenameConversation={renameConversation}
              onTogglePin={togglePin}
              onViewChange={setActiveView}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              publishedAgents={publishedAgents}
            />
          ))}

        <main
          className="flex flex-1 flex-col min-w-0 overflow-hidden h-full relative"
          onDragOver={(e) => {
            if (
              e.dataTransfer.types.includes("text/aureon-conversation-id") &&
              splitPanes.length === 0 &&
              activeView === "chat"
            ) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e) => {
            const convId = e.dataTransfer.getData("text/aureon-conversation-id");
            if (convId && splitPanes.length === 0 && activeView === "chat") {
              e.preventDefault();
              // Don't add the currently active conversation
              if (convId !== activeConvId) {
                addSplitPane(activeConvId!);
                addSplitPane(convId);
              }
            }
          }}
        >
          {splitPanes.length > 0 ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Loading split view…
                </div>
              }
            >
              <SplitPaneManager
                panes={splitPanes}
                conversations={conversations}
                onRemovePane={(paneId) => {
                  const next = splitPanes.filter((p) => p.id !== paneId);
                  if (next.length <= 1) {
                    // If only one pane left, exit split mode and set it as active
                    if (next.length === 1) setActiveConvId(next[0].conversationId);
                    setSplitPanes([]);
                  } else {
                    setSplitPanes(next);
                  }
                }}
                onSendMessage={handleSplitSendMessage}
                mode={mode}
                onModeChange={setMode}
                depth={depth}
                onDepthChange={handleDepthChange}
                isStreaming={isStreaming}
                suggestions={suggestions}
                onCalibrationFeedback={handleCalibrationFeedback}
                onStopStreaming={stopStreaming}
                focusMode={focusMode}
                messageStatuses={messageStatuses}
                storedProviders={storedProviders}
                activeBrainId={activeBrainId}
                onBrainChange={setActiveBrainId}
                onDropConversation={(convId) => {
                  if (!splitPanes.some((p) => p.conversationId === convId)) {
                    addSplitPane(convId);
                  }
                }}
                isDraggingConvo={isDraggingConvo}
              />
            </Suspense>
          ) : (
            <>
              {activeView === "chat" ? (
                renderView()
              ) : (
                /* every software room is a framed window: the workspace
                   background stays visible around it, the room itself loads
                   inside one rounded bordered surface. chat stays full bleed
                   because it is the surface, not a room on top of it. */
                <div className="h-full min-h-0 w-full p-2 sm:p-3">
                  <div
                    data-asherin-room={[
                      "zerlal", "file-scrapper", "briefing", "azplen",
                      "snippets", "zali", "slideshow", "ebook",
                    ].includes(String(activeView)) ? String(activeView) : undefined}
                    className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border/20 bg-background/55 shadow-[0_24px_70px_-40px_hsl(var(--foreground)/0.55)] backdrop-blur-xl"
                  >
                    {isV2 ? (
                      <DashboardUiProvider value="v2">
                        {(() => {
                          const meta = v2TitleFor(
                            activeView,
                            typeof activeView === "string" && activeView.startsWith("agent:")
                              ? publishedAgents.find((x) => `agent:${x.id}` === activeView)?.name
                              : undefined,
                          );
                          return (
                            <V2PageShell title={meta.title} subtitle={meta.subtitle} canvas={meta.canvas}>
                              {renderView()}
                            </V2PageShell>
                          );
                        })()}
                      </DashboardUiProvider>
                    ) : (
                      renderView()
                    )}
                  </div>
                </div>
              )}


              {/* Drop zone overlay when dragging a convo onto chat */}
              {isDraggingConvo && activeView === "chat" && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-sm pointer-events-none animate-fade-in">
                  <div className="text-center space-y-3 pointer-events-none">
                    <div className="w-16 h-16 mx-auto rounded-2xl border-2 border-dashed border-foreground/30 flex items-center justify-center">
                      <span className="text-2xl font-extralight text-foreground/40">◫</span>
                    </div>
                    <p className="text-xs font-light text-foreground/50">Drop to split view</p>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {cmdPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={cmdPaletteOpen}
            onClose={() => setCmdPaletteOpen(false)}
            onNewConversation={() => {
              newConversation();
              setCmdPaletteOpen(false);
            }}
            onViewChange={(v) => {
              setActiveView(v);
              setCmdPaletteOpen(false);
            }}
            onModeChange={(m) => {
              setMode(m);
              setCmdPaletteOpen(false);
            }}
            onFocusMode={() => setFocusMode((f) => !f)}
          />
        </Suspense>
      )}
      <style>{`
        @keyframes wpFadeIn {
          from { opacity: 0; transform: scale(1.015); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes wpLightStreak {
          from { transform: translateX(-50%) skewX(-8deg); }
          to { transform: translateX(calc(100vw + 50%)) skewX(-8deg); }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
