import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, Pin, Trash2, Archive, Pencil, CornerDownRight, MoreHorizontal } from "lucide-react";
import type { Conversation } from "./types";

interface SwipeableConversationItemProps {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onRename: () => void;
}

const SWIPE_THRESHOLD = 80;
const HOVER_DELAY = 220;

const SwipeableConversationItem = ({
  conv, isActive, onSelect, onTogglePin, onDelete, onArchive, onRename,
}: SwipeableConversationItemProps) => {
  const startX = useRef(0);
  const currentX = useRef(0);
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  // Hover is a desktop affordance. On a touch panel the row actions must be
  // reachable by tap, so they hide behind an explicit ⋯ toggle instead.
  const [touchDevice] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(hover: none)").matches
  );

  const rowRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; height: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const userMessages = conv.messages.filter((m) => m.role === "user" && m.content?.trim());

  const openPreview = () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    if (hoverTimer.current) return;
    hoverTimer.current = window.setTimeout(() => {
      const rect = rowRef.current?.getBoundingClientRect();
      if (rect) setCoords({ top: rect.top, left: rect.right + 8, height: rect.height });
      setHover(true);
      hoverTimer.current = null;
    }, HOVER_DELAY);
  };

  const closePreview = () => {
    if (hoverTimer.current) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    if (closeTimer.current) return;
    closeTimer.current = window.setTimeout(() => {
      setHover(false);
      closeTimer.current = null;
    }, 160);
  };

  useEffect(() => () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    currentX.current = startX.current;
    setSwiping(true);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!swiping) return;
    currentX.current = e.touches[0].clientX;
    const diff = currentX.current - startX.current;
    if (diff < 0) setOffset(Math.max(diff, -120));
  };
  const handleTouchEnd = () => {
    setSwiping(false);
    setOffset(offset < -SWIPE_THRESHOLD ? -100 : 0);
  };
  const handleArchiveClick = () => { setOffset(0); onArchive(); };
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/aureon-conversation-id", conv.id);
    e.dataTransfer.effectAllowed = "copy";
  };

  const jumpTo = (msgId: string) => {
    // Switch to this conversation first
    onSelect();
    // Dispatch a delayed jump signal that ChatView listens for
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("aureon:jump-to-message", {
        detail: { conversationId: conv.id, messageId: msgId },
      }));
    }, 220);
    setHover(false);
  };

  return (
    <div
      className="relative overflow-visible rounded-xl"
      onMouseEnter={openPreview}
      onMouseLeave={closePreview}
    >
      <div className="overflow-hidden rounded-xl relative">
        {/* Archive action behind */}
        <div className="absolute inset-y-0 right-0 flex items-center">
          <button
            onClick={handleArchiveClick}
            className="flex h-full items-center gap-1.5 bg-muted px-4 text-xs font-light text-muted-foreground"
          >
            <Archive className="h-4 w-4" />
            <span className="hidden sm:inline">Archive</span>
          </button>
        </div>

        {/* Swipeable + draggable foreground */}
        <div
          ref={rowRef}
          draggable
          data-convo-row
          onDragStart={handleDragStart}
          className={`relative z-10 group flex items-center gap-2 rounded-xl px-3 py-2 min-h-[44px] cursor-grab active:cursor-grabbing transition-colors ${
            isActive
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          }`}
          style={{
            transform: `translateX(${offset}px)`,
            transition: swiping ? "none" : "transform 0.3s ease-out",
            backgroundColor: offset !== 0 && !isActive ? "hsl(var(--card))" : undefined,
            // Vertical scrolling of the conversation list stays native; the
            // horizontal axis is ours (archive), and the drawer-close gesture
            // skips any element carrying data-convo-row.
            touchAction: "pan-y",
          }}
          onClick={() => { if (offset !== 0) { setOffset(0); return; } onSelect(); }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate text-xs font-light">{conv.title}</span>
          {/* Touch devices have no hover, so the row actions would be
              unreachable. A ⋯ toggle exposes exactly the same three actions. */}
          {touchDevice && (
            <button
              onClick={(e) => { e.stopPropagation(); setActionsOpen((o) => !o); }}
              className="shrink-0 h-11 w-11 -my-2 -mr-2 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground"
              aria-label="Conversation actions"
              aria-expanded={actionsOpen}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
          <div
            className={`flex gap-0.5 shrink-0 transition-opacity bg-inherit pl-1 ${
              touchDevice
                ? actionsOpen ? "opacity-100" : "hidden"
                : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <button onClick={(e) => { e.stopPropagation(); setActionsOpen(false); onRename(); }} className="p-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors" title="Rename">
              <Pencil className="h-3 w-3" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setActionsOpen(false); onTogglePin(); }} className={`p-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors ${conv.pinned ? "opacity-100 text-foreground" : ""}`} title="Pin">
              <Pin className="h-3 w-3" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setActionsOpen(false); onDelete(); }} className="p-1 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors" title="Delete permanently">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

      </div>

      {/* Hover preview flyout — list of user messages */}
      {hover && coords && createPortal(
        <div
          onMouseEnter={openPreview}
          onMouseLeave={closePreview}
          style={{
            position: "fixed",
            top: Math.max(12, Math.min(coords.top - 4, window.innerHeight - 360)),
            left: Math.min(coords.left, window.innerWidth - 332),
            width: 320,
            maxHeight: 360,
            zIndex: 80,
          }}
          className="rounded-2xl border border-border/40 bg-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col animate-fade-in"
        >
          <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between bg-foreground/[0.03]">
            <div className="text-[10px] font-light tracking-[0.22em] uppercase text-muted-foreground">Your messages</div>
            <div className="text-[10px] font-light text-muted-foreground/70">{userMessages.length}</div>
          </div>
          <div className="overflow-y-auto p-1.5">
            {userMessages.length === 0 ? (
              <p className="px-3 py-6 text-[11px] font-light text-muted-foreground/60 text-center">
                {conv.messages.length === 0 ? "Loading…" : "No prompts yet in this conversation."}
              </p>
            ) : (
              userMessages.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => jumpTo(m.id)}
                  className="w-full text-left flex items-start gap-2 rounded-lg px-2.5 py-2 hover:bg-foreground/5 transition-colors group/item"
                >
                  <CornerDownRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/40 group-hover/item:text-foreground/70 transition-colors" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-light text-foreground/90 line-clamp-2 leading-snug">
                      {m.content}
                    </p>
                    <p className="text-[9px] font-light text-muted-foreground/40 mt-0.5">
                      #{i + 1} · {m.timestamp ? new Date(m.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="px-3 py-1.5 border-t border-border/20 text-[9px] font-light tracking-wider uppercase text-muted-foreground/50 bg-foreground/[0.02]">
            Click to jump
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SwipeableConversationItem;
