// v.2 dashboard chrome — opt-in, never the default.
//
// The left column is a room you can talk in: conversations are always on
// screen, new chat is one press away, and the short keep-stack sits at the
// bottom. Retired products have no row and no deep-link route.

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, ChevronDown, Menu, Plus, Search, Trash2, Workflow, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import SwipeableConversationItem from "./SwipeableConversationItem";
import NotificationInbox from "./NotificationInbox";
import type { ChatMode, Conversation, DashboardView } from "./types";
import { NAV_INTENTS } from "@/lib/navIntents";

interface Props {
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

/** Quieter labels for the keep-stack. NAV_INTENTS stays the source of truth. */
const V2_LABELS: Partial<Record<string, string>> = {
  "asherin-defender": "asherin.defender",
  "asherin-arvision": "asherin.arvision",
  "asherin-eye": "asherin.eye",
  "asherin-sentinel": "asherin.sentinel",
  memory: "asherin.vault",
};

/** The keep list, in reading order. Retired products have no dashboard row. */
const V2_ORDER: DashboardView[] = [
  "asherin-defender",
  "asherin-arvision",
  "asherin-eye",
  "asherin-sentinel",
  "pdf-generator",
  "library",
  "projects",
  "memory",
  "guardian-vault",
  "whiteboard",
  "teams",
  "stats",
  "settings",
  "api-keys",
];


function groupConversations(convs: Conversation[]) {
  const pinned = convs.filter((c) => c.pinned);
  const rest = convs.filter((c) => !c.pinned);
  const out: { label: string; items: Conversation[] }[] = [];
  if (pinned.length) out.push({ label: "Pinned", items: pinned });
  if (rest.length) out.push({ label: "Conversations", items: rest });
  return out;
}

const DashboardSidebarV2 = ({
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
}: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [archivedConvos, setArchivedConvos] = useState<Conversation[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

  const keepRows = V2_ORDER.map((view) => {
    const intent = NAV_INTENTS.find((i) => i.view === view);
    if (!intent) return null;
    const label = V2_LABELS[view] ?? intent.label;
    return { view, label };
  }).filter((r): r is { view: DashboardView; label: string } => r !== null);

  /* ── archived ─────────────────────────────────────────────────────── */
  const loadArchived = useCallback(async () => {
    if (!user) return;
    setArchivedLoading(true);
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", user.id)
      .eq("archived", true)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setArchivedConvos(
        data.map((c) => ({
          id: c.id,
          title: c.title,
          messages: [],
          createdAt: new Date(c.created_at),
          pinned: c.pinned,
          mode: c.mode as ChatMode,
        })),
      );
    }
    setArchivedLoading(false);
  }, [user]);

  useEffect(() => {
    if (showArchived) loadArchived();
  }, [showArchived, loadArchived]);

  const unarchive = async (id: string) => {
    const restored = archivedConvos.find((c) => c.id === id);
    const { error } = await supabase.from("conversations").update({ archived: false }).eq("id", id);
    if (error) {
      toast({ title: "Restore failed", description: error.message, variant: "destructive" });
      return;
    }
    setArchivedConvos((prev) => prev.filter((c) => c.id !== id));
    if (restored) {
      window.dispatchEvent(new CustomEvent("asherin:conversation-restored", { detail: restored }));
    }
    toast({ title: "Conversation restored" });
  };

  const deleteArchived = async (id: string) => {
    const { error } = await supabase.rpc("delete_conversation", { p_conv_id: id });
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setArchivedConvos((prev) => prev.filter((c) => c.id !== id));
    toast({ title: "Conversation permanently deleted" });
  };

  const commitRename = () => {
    if (editingId && editTitle.trim()) onRenameConversation(editingId, editTitle.trim());
    setEditingId(null);
    setEditTitle("");
  };

  /* ── drawer gestures (below lg) ───────────────────────────────────── */
  const [dragPx, setDragPx] = useState<number | null>(null);
  const gestureRef = useRef<{
    startX: number;
    startY: number;
    startT: number;
    lastX: number;
    axis: "pending" | "x";
    from: "edge" | "drawer";
  } | null>(null);

  const RAIL_WIDTH = 288;
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
    setDragPx(Math.max(0, Math.min(w, g.from === "edge" ? dx : w + dx)));
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
    const velocity = dx / Math.max(1, Date.now() - g.startT);
    if (g.from === "edge") {
      if ((dx > 40 || velocity > 0.5) !== sidebarOpen) onToggleSidebar();
    } else if ((dx < -w * 0.4 || velocity < -0.5) && sidebarOpen) {
      onToggleSidebar();
    }
    setDragPx(null);
  };

  const dragging = dragPx !== null;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? conversations.filter(
        (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)),
      )
    : conversations;
  const groups = groupConversations(filtered);

  const openConversation = (id: string) => {
    onSelectConversation(id);
    onViewChange("chat");
    onToggleSidebar();
  };

  return (
    <>
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
        data-dashboard-ui="v2"
        onTouchStart={sidebarOpen ? beginGesture("drawer") : undefined}
        onTouchMove={sidebarOpen ? moveGesture : undefined}
        onTouchEnd={sidebarOpen ? endGesture : undefined}
        onTouchCancel={sidebarOpen ? endGesture : undefined}
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          ...(dragging ? { transform: `translateX(${(dragPx ?? 0) - drawerWidth()}px)`, transition: "none" } : {}),
        }}
        className={`fixed inset-y-0 left-0 z-40 w-[min(22rem,calc(100vw-1rem))] transform transition-transform duration-300 lg:relative lg:w-72 lg:translate-x-0 lg:transform-none flex-shrink-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col m-2 rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl overflow-hidden lg:m-3 lg:border-border/30 lg:bg-card/40">
          {/* wordmark + new chat */}
          <div className="flex-shrink-0 flex items-center justify-between gap-2 p-4 border-b border-border/20">
            <span className="text-sm font-extralight tracking-[0.06em] text-foreground/90">asherin</span>
            <div className="flex items-center gap-1">
              <NotificationInbox
                onNavigate={(v) => {
                  onViewChange(v as DashboardView);
                  onToggleSidebar();
                }}
              />
              <button
                onClick={onNewConversation}
                title="New chat"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* conversation search — always on screen, nothing buried */}
          <div className="flex-shrink-0 px-3 pt-3">
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

          <ScrollArea className="flex-1 min-h-0">
            <div className="p-2 space-y-3">
              {groups.length === 0 && (
                <p className="px-3 py-6 text-[11px] font-light text-muted-foreground/50">no conversations yet.</p>
              )}
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="px-3 py-1 text-[10px] font-light tracking-[0.15em] text-muted-foreground/50 uppercase">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((conv) =>
                      editingId === conv.id ? (
                        <div key={conv.id} className="flex items-center gap-1.5 rounded-xl px-3 py-2 bg-foreground/10">
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
                          onSelect={() => openConversation(conv.id)}
                          onTogglePin={() => onTogglePin(conv.id)}
                          onDelete={() => onDeleteConversation(conv.id)}
                          onArchive={() => onArchiveConversation(conv.id)}
                          onRename={() => {
                            setEditingId(conv.id);
                            setEditTitle(conv.title);
                          }}
                        />
                      ),
                    )}
                  </div>
                </div>
              ))}

              {/* archived — a disclosure, not a mall */}
              <div>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-xs font-light transition-colors ${
                    showArchived
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Archive className="h-4 w-4" />
                    Archived
                  </span>
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
                              onClick={() => unarchive(conv.id)}
                              title="Restore"
                              className="p-1 rounded hover:text-foreground"
                            >
                              <ArchiveRestore className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => deleteArchived(conv.id)}
                              title="Delete permanently"
                              className="p-1 rounded hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {publishedAgents.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowAgents((v) => !v)}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-xs font-light transition-colors ${
                      showAgents
                        ? "bg-foreground/10 text-foreground"
                        : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Workflow className="h-4 w-4" />
                      Agents
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${showAgents ? "rotate-180" : ""}`}
                    />
                  </button>
                  {showAgents && (
                    <div className="mt-1 space-y-0.5">
                      {publishedAgents.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            onViewChange(`agent:${a.id}` as DashboardView);
                            onToggleSidebar();
                          }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-light text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
                        >
                          <span className="truncate">{a.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* keep-stack — short, quiet, at the bottom */}
          <div
            data-dashboard-sidebar-nav
            className="flex-shrink-0 max-h-[45vh] overflow-y-auto border-t border-border/20 p-2 space-y-0.5"
          >
            <button
              onClick={() => {
                onViewChange("chat");
                onToggleSidebar();
              }}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-light transition-colors ${
                activeView === "chat"
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              }`}
            >
              Chat
            </button>
            {keepRows.map((row) => (
              <button
                key={row.view}
                onClick={() => {
                  onViewChange(row.view);
                  onToggleSidebar();
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-light transition-colors ${
                  activeView === row.view
                    ? "bg-foreground/10 text-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                }`}
              >
                {row.label}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
};

export default DashboardSidebarV2;
