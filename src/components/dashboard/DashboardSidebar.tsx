import { isOwnerEmail } from "@/lib/adminEmail";
import { useState, useCallback, useRef, useEffect, createContext, useContext, type CSSProperties } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus,
  Search,
  LogOut,
  Zap,
  FolderOpen,
  Layers,
  Brain,
  BarChart3,
  Settings,
  X,
  Menu,
  CreditCard,
  ShieldCheck,
  Database,
  Download,
  MessageSquare,
  ChevronDown,
  Crosshair,
  Newspaper,
  Code2,
  Users,
  FileText,
  Globe,
  ScanEye,
  Ear,
  Puzzle,
  Activity,
  ClipboardList,
  Archive,
  ArchiveRestore,
  Trash2 as Trash2Icon,
  Pencil,
  MessagesSquare,
  Sparkles,
  Lock as LockIcon,
  Shield,
  Moon,
  Workflow,
  Wand2,
  PanelLeftClose,
  PanelLeftOpen,
  Ghost,
  Calculator,
  Gauge,
  HeartPulse,

} from "lucide-react";
import type { Conversation, DashboardView, ChatMode, Message } from "./types";
import SwipeableConversationItem from "./SwipeableConversationItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useToast } from "@/hooks/use-toast";
import { decryptText } from "@/lib/encryption";
import NotificationInbox from "./NotificationInbox";

interface SidebarContextValue {
  isOpen: boolean;
  toggle: () => void;
  activeView: DashboardView;
  setActiveView: (view: DashboardView) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const useSidebarContext = () => {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebarContext must be used within DashboardSidebar");
  return ctx;
};

interface DashboardSidebarProps {
  conversations: Conversation[];
  activeConversationId: string;
  activeView: DashboardView;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onArchiveConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onTogglePin: (id: string) => void;
  onViewChange: (view: DashboardView) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  publishedAgents?: { id: string; name: string }[];
}

type NavItem = { id: DashboardView; icon: React.ElementType; label: string; access?: "search" | "pro" };
interface SubGroup {
  label: string;
  items: NavItem[];
}
interface NavGroup {
  label: string;
  subgroups: SubGroup[];
}

// Icon mapping by view/route — keeps a consistent monochrome icon per intent.
import { NAV_INTENTS as ALL_INTENTS, INTENT_GROUPS, INTENT_GROUP_BLURB, type NavIntent } from "@/lib/navIntents";

const VIEW_ICON: Record<string, React.ElementType> = {
  chat: MessagesSquare,
  zali: Zap,
  "pdf-generator": FileText,
  whiteboard: Layers,
  azplen: Database,
  zeeion: Database,
  "pattern-analysis": Activity,
  timeseries: Activity,
  geospatial: Globe,
  "asherin-eye": ScanEye,
  "asherin-sentinel": Ear,
  "asherin-health": HeartPulse,
  investigations: Search,
  "video-intelligence": Crosshair,
  search: Zap,
  nomad: Crosshair,
  zerlal: Shield,
  bulwark: ShieldCheck,
  "geo-audit": Gauge,
  zacoon: Ghost,
  google: Globe,

  "reverse-engineer": Search,
  "file-scrapper": FileText,
  cipher: Shield,
  gematria: Calculator,
  briefing: Newspaper,
  cross: Crosshair,
  notebooks: FileText,
  agents: Zap,
  zahten: Workflow,
  plugins: Puzzle,
  snippets: Code2,
  media2code: Wand2,
  library: FolderOpen,
  projects: Layers,
  memory: Brain,
  teams: Users,
  community: MessagesSquare,
  "vedic-astrology": Moon,
  "guardian-vault": LockIcon,
  settings: Settings,
  stats: BarChart3,
  audit: ClipboardList,
  "bug-reports": ClipboardList,
  security: ShieldCheck,
  "self-access": FileText,
};

interface IntentNavItem extends NavItem {
  codename?: string;
  route?: string;
  adminOnly?: boolean;
}

// Build sidebar groups directly from the single source of truth (NAV_INTENTS),
// using verb-first intent groups (Create / Analyze / Investigate / Build /
// Workspace / Account). Plain-language label is primary; codename is a subtitle.
const navGroupsFlat: { label: string; blurb: string; items: IntentNavItem[] }[] = INTENT_GROUPS.map((g) => ({
  label: g,
  blurb: INTENT_GROUP_BLURB[g],
  items: ALL_INTENTS.filter((i: NavIntent) => i.group === g).map((i: NavIntent) => ({
    id: i.view ?? (i.route as DashboardView),
    icon: VIEW_ICON[(i.view ?? i.route) as string] ?? FileText,
    label: i.label,
    codename: i.codename,
    route: i.route,
    access: i.access,
    adminOnly: i.adminOnly,
  })),
}));

function groupByDate(convs: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const week = new Date(today);
  week.setDate(today.getDate() - 7);
  const month = new Date(today);
  month.setDate(today.getDate() - 30);

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Pinned", items: [] },
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Last 7 Days", items: [] },
    { label: "Last 30 Days", items: [] },
    { label: "Older", items: [] },
  ];

  convs.forEach((c) => {
    if (c.pinned) {
      groups[0].items.push(c);
      return;
    }
    const d = new Date(c.createdAt);
    if (d >= today) groups[1].items.push(c);
    else if (d >= yesterday) groups[2].items.push(c);
    else if (d >= week) groups[3].items.push(c);
    else if (d >= month) groups[4].items.push(c);
    else groups[5].items.push(c);
  });

  return groups.filter((g) => g.items.length > 0);
}

const DashboardSidebar = ({
  conversations,
  activeConversationId,
  activeView,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onArchiveConversation,
  onRenameConversation,
  onTogglePin,
  onViewChange,
  sidebarOpen,
  onToggleSidebar,
  publishedAgents = [],
}: DashboardSidebarProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [softwareSearch, setSoftwareSearch] = useState("");
  const [showConvos, setShowConvos] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedConvos, setArchivedConvos] = useState<Conversation[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("aureon_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("aureon_sidebar_collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    navGroupsFlat.forEach((g, i) => {
      init[g.label] = i < 2;
    });
    return init;
  });

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const itemAllowed = (item: IntentNavItem) => {
    if (item.id === "security") return isOwnerEmail(user?.email);
    if (item.id === "self-access") return isOwnerEmail(user?.email);
    if (item.id === "ebook") return isOwnerEmail(user?.email);
    if (item.adminOnly) return isOwnerEmail(user?.email);
    return true;
  };

  const filteredGroups = navGroupsFlat
    .map((group) => ({ ...group, items: group.items.filter(itemAllowed) }))
    .filter((group) => group.items.length > 0);

  // Append Zahten-published agents as a dynamic intent group.
  const dynamicGroups = publishedAgents.length
    ? [
        {
          label: "Deployed Agents",
          blurb: "Your Zahten-deployed agents",
          items: publishedAgents.map((a) => ({
            id: `agent:${a.id}` as DashboardView,
            icon: Workflow,
            label: a.name,
          })) as IntentNavItem[],
        },
      ]
    : [];
  const allGroupsBase = [...filteredGroups, ...dynamicGroups];
  const swq = softwareSearch.trim().toLowerCase();
  const allGroups = swq
    ? allGroupsBase
        .map((g) => ({
          ...g,
          items: g.items.filter(
            (i) => i.label.toLowerCase().includes(swq) || (i.codename ?? "").toLowerCase().includes(swq),
          ),
        }))
        .filter((g) => g.items.length > 0)
    : allGroupsBase;

  // Load archived conversations
  const loadArchived = useCallback(async () => {
    if (!user) return;
    setArchivedLoading(true);
    const { data: convRows } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", user.id)
      .eq("archived", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (convRows) {
      const convs: Conversation[] = convRows.map((c) => ({
        id: c.id,
        title: c.title,
        messages: [],
        createdAt: new Date(c.created_at),
        pinned: c.pinned,
        mode: c.mode as ChatMode,
      }));
      setArchivedConvos(convs);
    }
    setArchivedLoading(false);
  }, [user]);

  useEffect(() => {
    if (showArchived) loadArchived();
  }, [showArchived, loadArchived]);

  const unarchiveConversation = async (id: string) => {
    const restored = archivedConvos.find((c) => c.id === id);
    const { error } = await supabase.from("conversations").update({ archived: false }).eq("id", id);
    if (error) {
      toast({ title: "Restore failed", description: error.message, variant: "destructive" });
      return;
    }
    setArchivedConvos((prev) => prev.filter((c) => c.id !== id));
    // Hand the row back to the dashboard's state instead of reloading the page
    // (a reload discarded every hydrated transcript in memory).
    if (restored) {
      window.dispatchEvent(new CustomEvent("asherin:conversation-restored", { detail: restored }));
    }
    toast({ title: "Conversation restored" });
  };

  const permanentlyDeleteArchived = async (id: string) => {
    // Transactional RPC: ownership-checked, atomic. The CASCADE FK on
    // messages.conversation_id wipes children automatically inside the same
    // transaction — no more race between message delete and conversation delete.
    const { error } = await supabase.rpc("delete_conversation", { p_conv_id: id });
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setArchivedConvos((prev) => prev.filter((c) => c.id !== id));
    toast({ title: "Conversation permanently deleted" });
  };

  const startRename = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const commitRename = () => {
    if (editingId && editTitle.trim()) {
      onRenameConversation(editingId, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  const MIN_WIDTH = 220;
  const MAX_WIDTH = 480;
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const stored = localStorage.getItem("aureon_sidebar_width");
      return stored ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(stored))) : 288;
    } catch {
      return 288;
    }
  });
  const isResizing = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX)));
        setSidebarWidth(newWidth);
      };

      const onMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        localStorage.setItem("aureon_sidebar_width", String(sidebarWidth));
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [sidebarWidth],
  );

  useEffect(() => {
    localStorage.setItem("aureon_sidebar_width", String(sidebarWidth));
  }, [sidebarWidth]);

  const filtered = conversations.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.messages.some((m) => m.content.toLowerCase().includes(search.toLowerCase())),
  );
  const groups = groupByDate(filtered);

  // ── Drawer gestures (below lg only) ────────────────────────────────────
  // dragPx = how much of the drawer is currently visible, in px. null = the
  // drawer is resting (CSS class drives it) and no finger is on the glass.
  const [dragPx, setDragPx] = useState<number | null>(null);
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    startT: number;
    lastX: number;
    axis: "pending" | "x" | "y";
    from: "edge" | "drawer";
  } | null>(null);

  const drawerWidth = () => Math.min(352, window.innerWidth - 16);
  const isMobileViewport = () => window.matchMedia("(max-width: 1023px)").matches;

  useEffect(() => {
    if (!sidebarOpen || !isMobileViewport()) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [sidebarOpen]);

  const beginGesture = (from: "edge" | "drawer") => (e: React.TouchEvent) => {
    if (!isMobileViewport()) return;
    // The conversation row owns its own horizontal axis (swipe-to-archive).
    if (from === "drawer" && (e.target as HTMLElement).closest("[data-convo-row]")) return;
    const t = e.touches[0];
    gestureRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      startT: Date.now(),
      lastX: t.clientX,
      axis: "pending",
      from,
    };
  };

  const moveGesture = (e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    const t = e.touches[0];
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;
    g.lastX = t.clientX;

    if (g.axis === "pending") {
      // Vertical intent wins outright — scrolling must never drag the drawer.
      if (Math.abs(dy) > 12 && Math.abs(dy) >= Math.abs(dx)) {
        gestureRef.current = null;
        return;
      }
      if (Math.abs(dx) < 10) return;
      const rightward = dx > 0;
      if (g.from === "edge" && !rightward) {
        gestureRef.current = null;
        return;
      }
      if (g.from === "drawer" && rightward) {
        gestureRef.current = null;
        return;
      }
      g.axis = "x";
    }

    const w = drawerWidth();
    const visible = g.from === "edge" ? dx : w + dx;
    setDragPx(Math.max(0, Math.min(w, visible)));
  };

  const endGesture = () => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g || g.axis !== "x") {
      setDragPx(null);
      return;
    }
    const w = drawerWidth();
    const dx = g.lastX - g.startX;
    const velocity = dx / Math.max(1, Date.now() - g.startT); // px/ms
    if (g.from === "edge") {
      const shouldOpen = dx > 40 || velocity > 0.5;
      if (shouldOpen !== sidebarOpen) onToggleSidebar();
    } else {
      const shouldClose = dx < -w * 0.4 || velocity < -0.5;
      if (shouldClose && sidebarOpen) onToggleSidebar();
    }
    setDragPx(null);
  };

  const dragging = dragPx !== null;

  const contextValue: SidebarContextValue = {
    isOpen: sidebarOpen,
    toggle: onToggleSidebar,
    activeView,
    setActiveView: onViewChange,
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      {/* The menu control lives on the same edge as the drawer it opens. */}
      <button
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={sidebarOpen}
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
          left: "calc(env(safe-area-inset-left, 0px) + 0.75rem)",
        }}
        className="fixed z-50 h-11 w-11 flex items-center justify-center rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl lg:hidden transition-colors"
      >
        {sidebarOpen ? <X className="h-5 w-5 text-foreground" /> : <Menu className="h-5 w-5 text-foreground" />}
      </button>

      {/* Invisible edge strip: drag right from here and the drawer follows the
          finger. Inset by 8px so the iOS system back-swipe keeps its own lane. */}
      {!sidebarOpen && (
        <div
          onTouchStart={beginGesture("edge")}
          onTouchMove={moveGesture}
          onTouchEnd={endGesture}
          onTouchCancel={endGesture}
          style={{ left: "8px", touchAction: "pan-y" }}
          className="fixed inset-y-0 z-30 w-6 lg:hidden"
          aria-hidden="true"
        />
      )}

      {(sidebarOpen || dragging) && (
        <div
          className="fixed inset-0 z-30 bg-background/80 backdrop-blur-[2px] lg:hidden"
          style={
            dragging
              ? { opacity: Math.min(1, (dragPx ?? 0) / Math.max(1, drawerWidth())), transition: "none" }
              : undefined
          }
          onClick={onToggleSidebar}
        />
      )}

      <aside
        onTouchStart={sidebarOpen ? beginGesture("drawer") : undefined}
        onTouchMove={sidebarOpen ? moveGesture : undefined}
        onTouchEnd={sidebarOpen ? endGesture : undefined}
        onTouchCancel={sidebarOpen ? endGesture : undefined}
        style={{
          "--dashboard-sidebar-width": `${collapsed ? 68 : sidebarWidth}px`,
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          ...(dragging ? { transform: `translateX(${(dragPx ?? 0) - drawerWidth()}px)`, transition: "none" } : {}),
        } as CSSProperties}
        className={`fixed inset-y-0 left-0 z-40 w-[min(22rem,calc(100vw-1rem))] transform transition-[transform,width] duration-300 lg:relative lg:w-[var(--dashboard-sidebar-width)] lg:translate-x-0 lg:transform-none flex-shrink-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col m-2 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl overflow-hidden lg:m-3 lg:border-border/30 lg:bg-card/40">
          {!collapsed && (
            <div
              onMouseDown={handleMouseDown}
              className="hidden lg:block absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize z-50 group"
            >
              <div className="absolute inset-y-0 right-0 w-0.5 bg-border/0 group-hover:bg-foreground/20 transition-colors rounded-full" />
            </div>
          )}

          <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border/20 gap-2">
            {!collapsed && (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-extralight tracking-[0.16em] text-foreground whitespace-nowrap shrink-0">
                  ASHERIN
                </span>
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/70 shrink-0" />
              </div>
            )}
            <div className={`flex items-center gap-1 ${collapsed ? "mx-auto flex-col" : ""}`}>
              <button
                onClick={toggleCollapsed}
                className="hidden lg:inline-flex rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
              {!collapsed && (
                <NotificationInbox
                  onNavigate={(v) => {
                    onViewChange(v as DashboardView);
                    onToggleSidebar();
                  }}
                />
              )}
              <button
                onClick={onNewConversation}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                title="New conversation"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="flex flex-col">
              {!collapsed && (
                <div className="flex-shrink-0 px-3 pt-3">
                  <div className="flex items-center gap-2 rounded-xl border border-border/20 bg-card/20 px-3 py-2">
                    <Search className="h-3.5 w-3.5 text-muted-foreground/50" />
                    <input
                      value={softwareSearch}
                      onChange={(e) => setSoftwareSearch(e.target.value)}
                      placeholder="Search software…"
                      className="flex-1 bg-transparent text-xs font-light text-foreground placeholder:text-muted-foreground/40 outline-none"
                    />
                    {softwareSearch && (
                      <button
                        onClick={() => setSoftwareSearch("")}
                        className="text-muted-foreground/40 hover:text-foreground"
                        title="Clear"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {!collapsed && (
                <div className="flex-shrink-0 px-2 pt-3">
                  <button
                    onClick={() => setShowConvos(!showConvos)}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-xs font-light transition-colors ${
                      showConvos
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <MessageSquare className="h-4 w-4" />
                      Past Convos
                    </div>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${showConvos ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>
              )}

              {!collapsed && showConvos && (
                <>
                  <div className="flex-shrink-0 px-3 pt-2">
                    <div className="flex items-center gap-2 rounded-xl border border-border/20 bg-card/20 px-3 py-2">
                      <Search className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search conversations…"
                        className="flex-1 bg-transparent text-xs font-light text-foreground placeholder:text-muted-foreground/40 outline-none"
                      />
                    </div>
                  </div>

                  <div className="p-2 space-y-3">
                    {groups.map((group) => (
                      <div key={group.label}>
                        <p className="px-3 py-1 text-[10px] font-light tracking-[0.15em] text-muted-foreground/50 uppercase">
                          {group.label === "Pinned" ? "◆ Pinned" : group.label}
                        </p>
                        <div className="space-y-0.5">
                          {group.items.map((conv) =>
                            editingId === conv.id ? (
                              <div
                                key={conv.id}
                                className="flex items-center gap-1.5 rounded-xl px-3 py-2 bg-foreground/10"
                              >
                                <input
                                  autoFocus
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  onBlur={commitRename}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitRename();
                                    if (e.key === "Escape") {
                                      setEditingId(null);
                                      setEditTitle("");
                                    }
                                  }}
                                  className="flex-1 bg-transparent text-xs font-light text-foreground outline-none border-b border-foreground/30"
                                />
                              </div>
                            ) : (
                              <SwipeableConversationItem
                                key={conv.id}
                                conv={conv}
                                isActive={activeView === "chat" && conv.id === activeConversationId}
                                onSelect={() => {
                                  onSelectConversation(conv.id);
                                  onViewChange("chat");
                                  onToggleSidebar();
                                }}
                                onTogglePin={() => onTogglePin(conv.id)}
                                onDelete={() => onDeleteConversation(conv.id)}
                                onArchive={() => onArchiveConversation(conv.id)}
                                onRename={() => startRename(conv)}
                              />
                            ),
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Archived Convos Toggle */}
                  <div className="px-2 pb-2">
                    <button
                      onClick={() => setShowArchived(!showArchived)}
                      className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-xs font-light transition-colors ${
                        showArchived
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Archive className="h-4 w-4" />
                        Archived
                      </div>
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${showArchived ? "rotate-180" : ""}`}
                      />
                    </button>

                    {showArchived && (
                      <div className="mt-1 space-y-0.5">
                        {archivedLoading ? (
                          <p className="px-3 py-2 text-[10px] text-muted-foreground animate-pulse">Loading…</p>
                        ) : archivedConvos.length === 0 ? (
                          <p className="px-3 py-2 text-[10px] text-muted-foreground/50">No archived conversations.</p>
                        ) : (
                          archivedConvos.map((conv) => (
                            <div
                              key={conv.id}
                              className="group flex items-center gap-2 rounded-xl px-3 py-2 text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
                            >
                              <Archive className="h-3.5 w-3.5 shrink-0 opacity-50" />
                              <span className="flex-1 truncate text-xs font-light">{conv.title}</span>
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => unarchiveConversation(conv.id)}
                                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                                  title="Restore"
                                >
                                  <ArchiveRestore className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => permanentlyDeleteArchived(conv.id)}
                                  className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                                  title="Delete permanently"
                                >
                                  <Trash2Icon className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div
                data-dashboard-sidebar-nav
                className={`py-2 border-t border-border/20 space-y-1 ${collapsed ? "px-1.5" : "px-2"}`}
              >
                {allGroups.map((group) => {
                  const isOpen = swq ? true : (expandedGroups[group.label] ?? false);
                  const hasActive = group.items.some((item) => activeView === item.id);
                  const navigate = (item: IntentNavItem) => {
                    if (item.route) {
                      window.location.assign(item.route);
                    } else {
                      onViewChange(item.id);
                      onToggleSidebar();
                    }
                  };

                  if (collapsed) {
                    return (
                      <div key={group.label} className="space-y-0.5">
                        {group.items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => navigate(item)}
                            title={item.label}
                            className={`flex w-full items-center justify-center rounded-xl p-2 transition-colors ${
                              activeView === item.id
                                ? "bg-foreground/10 text-foreground"
                                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                            }`}
                          >
                            <item.icon className="h-4 w-4" />
                          </button>
                        ))}
                      </div>
                    );
                  }

                  return (
                    <div key={group.label}>
                      <button
                        onClick={() => toggleGroup(group.label)}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-1.5 text-[10px] font-medium tracking-[0.14em] uppercase transition-colors ${
                          hasActive ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"
                        }`}
                        title={group.blurb}
                      >
                        <span className="flex items-center gap-2">
                          {group.label}
                          <span className="hidden xl:inline text-[8px] font-light tracking-normal normal-case text-muted-foreground/40">
                            — {group.blurb}
                          </span>
                        </span>
                        <ChevronDown
                          className={`h-3 w-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {isOpen && (
                        <div className="mt-0.5 mb-1 space-y-0.5 pl-2 border-l border-border/15 ml-3">
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => navigate(item)}
                              className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${
                                activeView === item.id
                                  ? "bg-foreground/10 text-foreground"
                                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                              }`}
                            >
                              <item.icon className="h-4 w-4 mt-0.5 shrink-0" />
                              <span className="flex flex-col min-w-0">
                                <span className="text-xs font-light leading-tight truncate">{item.label}</span>
                                {item.codename && item.codename !== item.label && (
                                  <span className="text-[9px] font-light tracking-wider uppercase text-muted-foreground/40 truncate">
                                    {item.codename}
                                  </span>
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {swq && allGroups.length === 0 && (
                  <p className="px-3 py-4 text-[10px] text-muted-foreground/50 text-center">
                    No software matches "{softwareSearch}".
                  </p>
                )}
              </div>

              {!collapsed && (
                <div className="p-3 pb-5 border-t border-border/20 space-y-1">
                  <InstallBtn />
                  <LogoutBtn />
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>
    </SidebarContext.Provider>
  );
};

const InstallBtn = () => {
  const { canInstall, install } = usePwaInstall();
  if (!canInstall) return null;
  return (
    <button
      onClick={install}
      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-light text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
    >
      <Download className="h-4 w-4" />
      Download App
    </button>
  );
};

const LogoutBtn = () => {
  const { signOut } = useAuth();
  return (
    <button
      onClick={signOut}
      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-light text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
    >
      <LogOut className="h-4 w-4" />
      Log out
    </button>
  );
};

export default DashboardSidebar;
