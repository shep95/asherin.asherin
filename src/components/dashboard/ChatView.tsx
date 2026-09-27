import { useState, useRef, useEffect, useCallback, useMemo, forwardRef, Suspense, lazy } from "react";
import { useChatWorkspace } from "@/lib/workspace/useChatWorkspace";

const WorkspacePanel = lazy(() => import("@/components/dashboard/workspace/WorkspacePanel"));

import { supabase } from "@/integrations/supabase/client";
import BrainsManager from "./BrainsManager";
import { Link } from "react-router-dom";

import {
  Copy,
  Check,
  Download,
  FileText,
  ExternalLink,
  RefreshCw,
  MoreHorizontal,
  X,
  ZoomIn,
  Pencil,
  Lock,
  LayoutDashboard,
  Brain,
} from "lucide-react";
import { queueBoardDrop } from "@/lib/whiteboard/boardInbox";
import DiffView from "./DiffView";
import ChatErrorBanner from "./ChatErrorBanner";
import ChatSearchBar from "./ChatSearchBar";
import type { FileAttachment } from "./types";
import ReactMarkdown from "react-markdown";
import {
  parseChatCards,
  detectCreamPdfIntent,
  creamDocFromConvo,
  hasCreamPdfFence,
  downloadCreamPdf,
} from "@/lib/chatCards/parseChatCards";
import ChatCardRenderer from "@/components/chatCards/ChatCardRenderer";
import { INTEL_SELECT_EVENT } from "@/components/chatCards/CandidatesCard";
import { useNavigate } from "react-router-dom";
import type { Conversation, ChatMode, Message } from "./types";
import MessageStatusIndicator from "./MessageStatusIndicator";
import CodeFilePreview from "./CodeFilePreview";
import type { ResponseDepth } from "./DepthSelector";
import type { FeedbackType } from "./CalibrationFeedback";
import AdaptiveInputBar from "./AdaptiveInputBar";
import ScrollIntelligence from "./ScrollIntelligence";
import ThinkingPanel from "./ThinkingPanel";
import TurnTraces from "./TurnTraces";
import PropertyMapCard, { type PropertyMapCardData } from "@/components/dashboard/property/PropertyMapCard";
import { detectAddresses, geocodeAddress } from "@/lib/propertyIntent";
import { detectGeoIntent } from "@/lib/geoIntent";
import { emitPull } from "@/lib/connect/emitPull";
import { renderLinkPreviews } from "./LinkPreview";
import type { QueueItem } from "./MessageQueuePanel";
import type { SelectedModel } from "./MultiModelSelector";

interface ChatViewProps {
  conversation: Conversation;
  onSendMessage: (content: string, attachments?: FileAttachment[]) => void;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  depth: ResponseDepth;
  onDepthChange: (depth: ResponseDepth) => void;
  isStreaming?: boolean;
  suggestions?: string[];
  onCalibrationFeedback?: (messageId: string, feedback: FeedbackType) => void;
  onStopStreaming?: () => void;
  focusMode?: boolean;
  messageStatuses?: Record<string, import("@/lib/messageQueue").MessageStatus>;
  queueItems?: QueueItem[];
  onRemoveFromQueue?: (id: string) => void;
  onClearQueue?: () => void;
  onProcessQueueNow?: () => void;
  queuePaused?: boolean;
  onToggleQueuePause?: () => void;
  consensusEnabled?: boolean;
  onConsensusToggle?: (enabled: boolean) => void;
  consensusModels?: SelectedModel[];
  onConsensusModelsChange?: (models: SelectedModel[]) => void;
  storedProviders?: string[];
  activeBrainId?: string | null;
  onBrainChange?: (brainId: string | null) => void;
}

/**
 * Drops an answer onto the whiteboard as a brief. Boards are decrypted with
 * the operator's own key in the browser, so the payload rides an in-memory
 * queue instead of a server round trip, then we open the board view.
 */
function SendToBoardButton({ content }: { content: string }) {
  const [sent, setSent] = useState(false);
  const send = () => {
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const heading = lines.find((line) => line.startsWith("#"))?.replace(/^#+\s*/, "");
    const bullets = lines
      .filter((line) => /^([-*•]|\d+[.)])\s+/.test(line))
      .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, ""))
      .slice(0, 8);
    queueBoardDrop({
      kind: bullets.length ? "brief" : "note",
      source: "chat",
      title: heading || "asherin answer",
      text: bullets.length ? undefined : content.slice(0, 1200),
      bullets: bullets.length ? bullets : undefined,
    });
    setSent(true);
    window.setTimeout(() => {
      window.location.assign("/dashboard?view=whiteboard");
    }, 220);
  };

  return (
    <button
      onClick={send}
      className="flex items-center gap-1 text-[10px] font-light text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      title="Send this answer to the whiteboard"
    >
      <LayoutDashboard className="h-3 w-3" />
      {sent ? "On board" : "Send to board"}
    </button>
  );
}

// Copy button for messages
function MessageCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] font-light text-muted-foreground/50 hover:text-muted-foreground transition-colors"
      title="Copy message"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

import type { AdaptiveInputBarHandle } from "./AdaptiveInputBar";
import IntelReportCard from "./chat/IntelReportCard";
import { wantsIntelReportFile } from "@/lib/intelligenceReport";

const SubscriptionGatedInput = forwardRef<
  AdaptiveInputBarHandle,
  {
    onSendMessage: (content: string, attachments?: FileAttachment[]) => void;
    onStop?: () => void;
    onQuickAction?: (action: string, content: string) => void;
    isStreaming: boolean;
    conversationId?: string;
  }
>((props, ref) => {
  // Free dashboard users are allowed to message through the Asherin Algorithm.
  // The backend owns the quota and only blocks after it is exhausted.
  return <AdaptiveInputBar ref={ref} {...props} disabled={false} />;
});
SubscriptionGatedInput.displayName = "SubscriptionGatedInput";

// Helper to parse user messages for code blocks and render as file preview cards
const CODE_BLOCK_RE = /```(\w+)?\n([\s\S]*?)```/g;

function UserMessageContent({ content }: { content: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(CODE_BLOCK_RE);
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++} className="whitespace-pre-wrap">
          {content.slice(lastIndex, match.index)}
        </span>,
      );
    }
    parts.push(<CodeFilePreview key={key++} code={match[2].trimEnd()} language={match[1]} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(
      <span key={key++} className="whitespace-pre-wrap">
        {content.slice(lastIndex)}
      </span>,
    );
  }

  if (parts.length === 0) {
    const trimmed = content.trim();
    const looksLikeCode =
      trimmed.split("\n").length >= 3 &&
      /[{};()=>]/.test(trimmed) &&
      /^(import|export|const|let|var|function|def |class |#include|package |fn |pub )/.test(trimmed);
    if (looksLikeCode) {
      return <CodeFilePreview code={trimmed} />;
    }
    return <span className="whitespace-pre-wrap">{content}</span>;
  }

  return <>{parts}</>;
}

// Custom markdown components with copy button on code blocks
function CodeBlockCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-foreground/10 hover:bg-foreground/20 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy code"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// Valid internal routes for the app
const VALID_INTERNAL_PATHS = new Set([
  "/",
  "/software",
  "/founder",
  "/dashboard",
  "/terms",
  "/privacy",
  "/security-policy",
]);

function isInternalLink(href: string): string | null {
  try {
    const url = new URL(href);
    const isOwnDomain =
      url.hostname === "asherin.com" || url.hostname === "www.asherin.com";
    if (isOwnDomain && VALID_INTERNAL_PATHS.has(url.pathname)) {
      return url.pathname;
    }
  } catch {
    if (href.startsWith("/") && VALID_INTERNAL_PATHS.has(href)) {
      return href;
    }
  }
  return null;
}

function MarkdownLink({
  href,
  children,
  navigate,
}: {
  href?: string;
  children?: React.ReactNode;
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (!href) return <>{children}</>;

  const internalPath = isInternalLink(href);

  if (internalPath) {
    return (
      <button
        onClick={() => navigate(internalPath)}
        className="text-accent hover:text-accent/80 underline underline-offset-2 decoration-accent/40 hover:decoration-accent/70 transition-colors cursor-pointer inline-flex items-center gap-1"
      >
        {children}
      </button>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:text-accent/80 underline underline-offset-2 decoration-accent/40 hover:decoration-accent/70 transition-colors inline-flex items-center gap-1"
    >
      {children}
      <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
    </a>
  );
}

const createMarkdownComponents = (navigate: ReturnType<typeof useNavigate>) => ({
  pre({ children, ...props }: any) {
    const extractText = (node: any): string => {
      if (typeof node === "string") return node;
      if (node?.props?.children) {
        if (Array.isArray(node.props.children)) return node.props.children.map(extractText).join("");
        return extractText(node.props.children);
      }
      return "";
    };
    const codeText = extractText(children);
    return (
      <div className="relative group overflow-hidden">
        <pre className="overflow-x-auto" {...props}>
          {children}
        </pre>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <CodeBlockCopyButton code={codeText} />
        </div>
      </div>
    );
  },
  a({ href, children }: any) {
    return (
      <MarkdownLink href={href} navigate={navigate}>
        {children}
      </MarkdownLink>
    );
  },
  table({ children, ...props }: any) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-border/20">
        <table className="w-full text-[12px] sm:text-[13px]" {...props}>
          {children}
        </table>
      </div>
    );
  },
  thead({ children, ...props }: any) {
    return (
      <thead className="bg-foreground/5 border-b border-border/20" {...props}>
        {children}
      </thead>
    );
  },
  th({ children, ...props }: any) {
    return (
      <th
        className="px-3 py-2 text-left font-medium text-foreground/80 text-[11px] uppercase tracking-wider"
        {...props}
      >
        {children}
      </th>
    );
  },
  td({ children, ...props }: any) {
    return (
      <td className="px-3 py-2 border-t border-border/10 text-muted-foreground" {...props}>
        {children}
      </td>
    );
  },
  tr({ children, ...props }: any) {
    return (
      <tr className="hover:bg-foreground/[0.02] transition-colors" {...props}>
        {children}
      </tr>
    );
  },
  h1({ children, ...props }: any) {
    return (
      <h1 className="text-lg font-semibold text-foreground mt-4 mb-2 pb-1 border-b border-border/20" {...props}>
        {children}
      </h1>
    );
  },
  h2({ children, ...props }: any) {
    return (
      <h2 className="text-base font-semibold text-foreground mt-3 mb-1.5" {...props}>
        {children}
      </h2>
    );
  },
  h3({ children, ...props }: any) {
    return (
      <h3 className="text-sm font-medium text-foreground/90 mt-2 mb-1" {...props}>
        {children}
      </h3>
    );
  },
  h4({ children, ...props }: any) {
    return (
      <h4 className="text-[13px] font-medium text-foreground/80 mt-2 mb-1" {...props}>
        {children}
      </h4>
    );
  },
  ul({ children, ...props }: any) {
    return (
      <ul className="list-disc list-inside space-y-0.5 text-muted-foreground" {...props}>
        {children}
      </ul>
    );
  },
  ol({ children, ...props }: any) {
    return (
      <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground" {...props}>
        {children}
      </ol>
    );
  },
  li({ children, ...props }: any) {
    return (
      <li className="text-[13px] leading-relaxed" {...props}>
        {children}
      </li>
    );
  },
  blockquote({ children, ...props }: any) {
    return (
      <blockquote
        className="border-l-2 border-accent/40 pl-3 py-1 my-2 text-muted-foreground/80 italic text-[13px]"
        {...props}
      >
        {children}
      </blockquote>
    );
  },
  hr({ ...props }: any) {
    return <hr className="my-3 border-border/20" {...props} />;
  },
  img({ src, alt, ...props }: any) {
    const hasAlt = typeof alt === "string" && alt.trim().length > 0;
    return (
      <span
        className="relative inline-block group cursor-pointer"
        onClick={() => (window as any).__aureonLightbox?.(src)}
      >
        <img
          src={src}
          alt={hasAlt ? alt : ""}
          role={hasAlt ? undefined : "presentation"}
          className="rounded-xl border border-border/20 max-w-full my-3 shadow-lg transition-transform hover:scale-[1.02]"
          style={{ maxHeight: "500px", objectFit: "contain" }}
          loading="lazy"
          {...props}
        />
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-xl">
          <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
        </span>
      </span>
    );
  },
});

const ChatView = ({
  conversation,
  onSendMessage,
  isStreaming,
  onStopStreaming,
  focusMode,
  messageStatuses = {},
  queueItems = [],
  activeBrainId = null,
  onBrainChange,
}: ChatViewProps) => {
  // Directive profiles are optional: when the host doesn't wire a handler the
  // control stays out of the bar rather than rendering a dead button.
  const [activeBrainName, setActiveBrainName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!activeBrainId) {
      setActiveBrainName(null);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from("brains")
        .select("name")
        .eq("id", activeBrainId)
        .maybeSingle();
      if (!cancelled) setActiveBrainName((data as { name: string } | null)?.name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBrainId]);
  const navigate = useNavigate();
  const markdownComponents = useMemo(() => createMarkdownComponents(navigate), [navigate]);
  const inputBarRef = useRef<AdaptiveInputBarHandle>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  // Regeneration history: the previous answer text keyed by message id. When the
  // new answer differs, the patch is rendered inline — never behind a chip.
  const [previousResponses, setPreviousResponses] = useState<Record<string, string>>({});
  const [dismissedDiffs, setDismissedDiffs] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const branchMessages: Message[] = conversation.messages;

  // Auto-scroll to bottom when the conversation changes
  useEffect(() => {
    if (conversation.messages.length > 0) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      });
    }
  }, [conversation.id]);

  // Scroll to highlighted message (with retries — the target may not be mounted
  // yet when a cross-conversation jump arrives while messages hydrate).
  useEffect(() => {
    if (!highlightedMsgId) return;
    let attempts = 0;
    let timer: number | undefined;
    const tryScroll = () => {
      const el = messageRefs.current[highlightedMsgId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (attempts++ < 20) timer = window.setTimeout(tryScroll, 120);
    };
    tryScroll();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [highlightedMsgId, branchMessages.length]);

  // ── Inline property/address satellite maps ────────────────────────────────
  const [propertyMaps, setPropertyMaps] = useState<Record<string, PropertyMapCardData>>({});
  const geocodeAttempted = useRef<Set<string>>(new Set());
  const lastMsgId = branchMessages[branchMessages.length - 1]?.id;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const m of branchMessages) {
        if (!m.content) continue;
        if (propertyMaps[m.id]) continue;
        if (geocodeAttempted.current.has(m.id)) continue;
        if (m.role === "assistant" && isStreaming && m.id === lastMsgId) continue;
        const [hit] = detectAddresses(m.content);
        const geo = hit ? null : detectGeoIntent(m.content);
        const query = hit?.raw || geo?.place;
        if (!query) continue;
        geocodeAttempted.current.add(m.id);
        const started = performance.now();
        const g = await geocodeAddress(query);
        // Real trace: the geocoder actually ran, so Connect records it.
        void emitPull({
          organ: "maps",
          capability: "property",
          fromSurface: "chat",
          status: g ? "ok" : "fail",
          latencyMs: performance.now() - started,
          quote: g ? g.formatted : query,
        });
        if (cancelled || !g) continue;
        setPropertyMaps((prev) =>
          prev[m.id]
            ? prev
            : {
                ...prev,
                [m.id]: { address: query, formatted: g.formatted, lat: g.lat, lng: g.lng, category: g.category },
              },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchMessages, propertyMaps, isStreaming, lastMsgId]);

  // ── Chat as a workspace ───────────────────────────────────────────────────
  // The turn is planned only after streaming ends, and only when the request
  // genuinely needs a subsystem. Everything else stays plain prose.
  const { plans: workspacePlans, visible: workspaceVisible } = useChatWorkspace({
    messages: branchMessages,
    isStreaming,
    conversationId: conversation.id,
    hasResearchProvider: true,
  });

  // Listen for cross-component jump signals (e.g. sidebar hover preview)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.conversationId !== conversation.id) return;
      setHighlightedMsgId(detail.messageId);
    };
    window.addEventListener("aureon:jump-to-message", handler as EventListener);
    return () => window.removeEventListener("aureon:jump-to-message", handler as EventListener);
  }, [conversation.id]);

  // Wire lightbox for markdown images
  useEffect(() => {
    (window as any).__aureonLightbox = (src: string) => setLightboxSrc(src);
    return () => {
      delete (window as any).__aureonLightbox;
    };
  }, []);

  // Identity-resolution rack: confirming a candidate sends the server-authored
  // confirmation prompt as a normal turn. Guarded against re-entry mid-stream.
  useEffect(() => {
    const onIntelSelect = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (!prompt || isStreaming) return;
      onSendMessage(prompt.slice(0, 2000));
    };
    window.addEventListener(INTEL_SELECT_EVENT, onIntelSelect as EventListener);
    return () => window.removeEventListener(INTEL_SELECT_EVENT, onIntelSelect as EventListener);
  }, [onSendMessage, isStreaming]);

  const downloadConversation = () => {
    if (!branchMessages.length) return;
    const lines = branchMessages.map(
      (m) =>
        // Speaker label is the product name the operator sees: asherin.
        `**${m.role === "user" ? "You" : "asherin"}** (${m.timestamp ? new Date(m.timestamp).toLocaleString() : ""}):\n${m.content}`,
    );
    const md = `# ${conversation.title}\n\n${lines.join("\n\n---\n\n")}`;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${conversation.title.replace(/[^a-zA-Z0-9 -]/g, "")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleQuickAction = useCallback(
    (action: string, content: string) => {
      const prompts: Record<string, string> = {
        debug: `Debug this code:\n\`\`\`\n${content}\n\`\`\``,
        explain: `Explain this code line by line:\n\`\`\`\n${content}\n\`\`\``,
        optimize: `Optimize this code:\n\`\`\`\n${content}\n\`\`\``,
        test: `Write tests for this code:\n\`\`\`\n${content}\n\`\`\``,
        summarize: `Summarize the content at: ${content}`,
        "fact-check": `Fact check: ${content}`,
        extract: `Extract key data from: ${content}`,
      };
      const prompt = prompts[action] ?? `${action}: ${content}`;
      onSendMessage(prompt);
    },
    [onSendMessage],
  );

  const lastMsg = branchMessages[branchMessages.length - 1];
  const lastUserMsg = [...branchMessages].reverse().find((m) => m.role === "user");
  const lastUserId = lastUserMsg?.id;
  const creamIntent = detectCreamPdfIntent(String(lastUserMsg?.content || ""));
  // A queued send is only real when the transport actually parked one.
  const queuedCount = queueItems.length;

  return (
    <div className="flex flex-1 min-w-0 h-full relative overflow-hidden">
      {/* Main chat column */}
      <div className="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
        {/* Top bar — search + one overflow menu. Nothing else. */}
        {!focusMode && (
          <div
            className="flex items-center justify-end px-2 sm:px-4 pb-1 gap-1.5 shrink-0 pl-16 lg:pl-2"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
          >
            <ChatSearchBar
              messages={branchMessages}
              onHighlightMessage={setHighlightedMsgId}
              onSearchActive={() => {}}
            />
            {onBrainChange && (
              <BrainsManager activeBrainId={activeBrainId} onBrainChange={onBrainChange} />
            )}
            {branchMessages.length > 0 && (
              <div className="relative shrink-0">
                <button
                  onClick={() => setOverflowOpen((o) => !o)}
                  className={`p-1.5 rounded-md transition-colors ${overflowOpen ? "bg-foreground/10 text-foreground" : "text-muted-foreground/50 hover:text-foreground"}`}
                  title="More"
                  aria-haspopup="menu"
                  aria-expanded={overflowOpen}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {overflowOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setOverflowOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-[220px] rounded-2xl border border-border/25 bg-card/95 backdrop-blur-xl shadow-2xl p-1.5 animate-fade-in motion-reduce:animate-none">
                      <button
                        onClick={() => {
                          downloadConversation();
                          setOverflowOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-light text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" /> Download conversation
                      </button>
                      <button
                        onClick={() => {
                          const intent = detectCreamPdfIntent(
                            String([...branchMessages].reverse().find((m) => m.role === "user")?.content || ""),
                          );
                          downloadCreamPdf(creamDocFromConvo(branchMessages, intent.hit ? intent.species : "convo"));
                          setOverflowOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-light text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5" /> download creamy pdf
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-2 sm:px-4 pb-4 relative min-h-0"
          style={{ touchAction: "pan-y", overscrollBehaviorY: "contain" }}
        >
          {branchMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center max-w-md animate-fade-in motion-reduce:animate-none">
                <h1 className="text-2xl sm:text-3xl font-extralight tracking-wide text-foreground mb-3">
                  <Link
                    to="/dashboard/settings"
                    aria-label="How can I help? Open settings"
                    title="Open settings"
                    className="rounded-md px-1 outline-none transition-colors duration-200 hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
                  >
                    How can I help?
                  </Link>
                </h1>

                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Lock className="h-3 w-3 text-emerald-500/70" />
                  <span className="text-xs font-extralight text-emerald-500/70">Account-synced encryption</span>
                </div>
                <p className="text-sm font-extralight text-muted-foreground">
                  Conversations are stored encrypted at rest under a key bound to your account, so they open on every
                  device you sign in from.
                </p>
              </div>
            </div>
          ) : (
            <div ref={messagesRef} className="relative mx-auto max-w-3xl space-y-3 sm:space-y-4 py-4">
              {chatError && (
                <ChatErrorBanner
                  error={chatError}
                  onRetry={() => {
                    setChatError(null);
                    const lastUserMsg = [...branchMessages].reverse().find((m) => m.role === "user");
                    if (lastUserMsg) onSendMessage(lastUserMsg.content);
                  }}
                  onFallback={() => setChatError(null)}
                  onDismiss={() => setChatError(null)}
                />
              )}
              {branchMessages.map((msg, idx) =>
                msg.role === "assistant" &&
                !String(msg.content || "").trim() &&
                !(isStreaming && msg === lastMsg) ? null : (
                  <div
                    key={msg.id}
                    ref={(el) => {
                      messageRefs.current[msg.id] = el;
                    }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-slide-up motion-reduce:animate-none transition-all duration-300 motion-reduce:transition-none ${highlightedMsgId === msg.id ? "ring-1 ring-accent/50 rounded-2xl bg-accent/5" : ""}`}
                    style={{ animationDelay: `${Math.min(idx * 30, 150)}ms`, animationFillMode: "backwards" }}
                  >
                    <div className="max-w-[95%] sm:max-w-[80%] min-w-0">
                      <div
                        className={`rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-[13px] sm:text-sm font-light leading-relaxed ${
                          msg.role === "user"
                            ? "bg-foreground/15 text-foreground backdrop-blur-sm border border-border/20"
                            : "bg-background/90 text-foreground backdrop-blur-md border border-border/20"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <>
                            <ThinkingPanel messageId={msg.id} />
                            <div className="prose prose-sm prose-invert max-w-none overflow-hidden [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_code]:text-accent [&_code]:bg-secondary/50 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-secondary/50 [&_pre]:rounded-lg [&_pre]:p-3 [&_blockquote]:border-accent/50 [&_blockquote]:text-muted-foreground [&_strong]:text-foreground [&_hr]:border-border/30">
                              {(() => {
                                const segs = parseChatCards(msg.content);
                                const visible = segs.some(
                                  (s) =>
                                    s.type === "card" ||
                                    s.type === "card-unknown" ||
                                    (s.type === "text" && String(s.value || "").trim()),
                                );
                                if (!visible && String(msg.content || "").trim()) {
                                  return <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>;
                                }
                                return segs.map((seg, i) =>
                                  seg.type === "card" || seg.type === "card-unknown" ? (
                                    <ChatCardRenderer key={`c-${i}`} segment={seg} source="chat:asher" />
                                  ) : (
                                    <ReactMarkdown key={`t-${i}`} components={markdownComponents}>
                                      {seg.value}
                                    </ReactMarkdown>
                                  ),
                                );
                              })()}
                              {isStreaming && msg === lastMsg && (
                                <span className="inline-block w-0.5 h-4 bg-foreground/60 animate-pulse motion-reduce:animate-none ml-0.5 align-text-bottom" />
                              )}
                              {renderLinkPreviews(msg.content)}
                            </div>
                            {(() => {
                              try {
                                if (
                                  !(
                                    msg === lastMsg &&
                                    !isStreaming &&
                                    creamIntent.hit &&
                                    !hasCreamPdfFence(String(msg.content || ""))
                                  )
                                )
                                  return null;
                                return (
                                  <ChatCardRenderer
                                    segment={{
                                      type: "card",
                                      cardType: "cream-pdf",
                                      payload: creamDocFromConvo(
                                        branchMessages,
                                        creamIntent.species,
                                      ) as unknown as Record<string, unknown>,
                                    }}
                                    source="chat:asher"
                                  />
                                );
                              } catch {
                                return null;
                              }
                            })()}
                            {workspacePlans[msg.id] ? (
                              <Suspense fallback={null}>
                                <WorkspacePanel
                                  plan={workspacePlans[msg.id]}
                                  visible={workspaceVisible}
                                  answer={msg.content}
                                  conversationId={conversation.id}
                                />
                              </Suspense>
                            ) : null}
                          </>

                        ) : editingId === msg.id ? (
                          /* Cursor-style edit of the last user turn: change it and resend. */
                          <div className="min-w-[240px] sm:min-w-[360px]">
                            <textarea
                              value={editDraft}
                              autoFocus
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  setEditingId(null);
                                }
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  const next = editDraft.trim();
                                  setEditingId(null);
                                  if (next && next !== msg.content) onSendMessage(next);
                                }
                              }}
                              rows={Math.min(8, Math.max(2, editDraft.split("\n").length))}
                              className="w-full resize-none rounded-xl border border-border/30 bg-background/60 px-2.5 py-2 text-[13px] font-light text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                            <div className="mt-1.5 flex items-center justify-end gap-2">
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-[10px] font-light text-muted-foreground/60 hover:text-foreground transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => {
                                  const next = editDraft.trim();
                                  setEditingId(null);
                                  if (next && next !== msg.content) onSendMessage(next);
                                }}
                                disabled={!editDraft.trim() || isStreaming}
                                className="rounded-lg border border-accent/30 px-2.5 py-1 text-[10px] font-light text-accent/90 hover:bg-accent/10 disabled:opacity-40 transition-colors"
                              >
                                Send
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.attachments && msg.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {msg.attachments.map((att, aidx) => (
                                  <div key={aidx} className="rounded-lg overflow-hidden border border-border/20">
                                    {att.type.startsWith("image/") && att.previewUrl ? (
                                      <span
                                        className="relative group cursor-pointer block"
                                        onClick={() => setLightboxSrc(att.previewUrl!)}
                                      >
                                        <img
                                          src={att.previewUrl}
                                          alt={att.name}
                                          className="max-w-[200px] max-h-[150px] object-cover rounded-lg transition-transform hover:scale-[1.02]"
                                        />
                                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 rounded-lg">
                                          <ZoomIn className="h-5 w-5 text-white drop-shadow-lg" />
                                        </span>
                                      </span>
                                    ) : (
                                      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/30 text-xs text-muted-foreground">
                                        <FileText className="h-4 w-4" />
                                        <span className="truncate max-w-[150px]">{att.name}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            <UserMessageContent content={msg.content} />
                            {renderLinkPreviews(msg.content)}
                          </>
                        )}
                      </div>

                      {/* Inline satellite map for any address in the message */}
                      {propertyMaps[msg.id] && (
                        <div className="mt-2 max-w-[560px]">
                          <PropertyMapCard data={propertyMaps[msg.id]} />
                        </div>
                      )}

                      {/* Inline edit card — the patch is shown as it lands, never
                        hidden behind a chip. Dismissible once read. */}
                      {msg.role === "assistant" &&
                        previousResponses[msg.id] &&
                        previousResponses[msg.id] !== msg.content &&
                        !dismissedDiffs[msg.id] && (
                          <DiffView
                            before={previousResponses[msg.id]}
                            after={msg.content}
                            open={true}
                            onClose={() => setDismissedDiffs((prev) => ({ ...prev, [msg.id]: true }))}
                          />
                        )}

                      {/* Timestamp */}
                      {msg.timestamp && (
                        <div
                          className={`text-[9px] font-extralight text-muted-foreground/40 mt-1 px-1 ${msg.role === "user" ? "text-right" : "text-left"}`}
                        >
                          {(() => {
                            const ts = new Date(msg.timestamp);
                            const now = new Date();
                            const isToday = ts.toDateString() === now.toDateString();
                            const yesterday = new Date(now);
                            yesterday.setDate(yesterday.getDate() - 1);
                            const isYesterday = ts.toDateString() === yesterday.toDateString();
                            const time = ts.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                            if (isToday) return time;
                            if (isYesterday) return `Yesterday ${time}`;
                            return `${ts.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
                          })()}
                        </div>
                      )}

                      {/* Action bar — copy, plus one action per role. Nothing else. */}
                      {msg.content && !isStreaming && editingId !== msg.id && (
                        <div className="flex items-center gap-2 mt-1 px-1 animate-fade-in motion-reduce:animate-none">
                          {msg.role === "user" && <MessageStatusIndicator status={messageStatuses[msg.id]} />}
                          <MessageCopyButton text={msg.content} />
                          {msg.role === "user" && msg.id === lastUserId && (
                            <button
                              onClick={() => {
                                setEditingId(msg.id);
                                setEditDraft(msg.content);
                              }}
                              className="flex items-center gap-1 text-[10px] font-light text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                              title="Edit and resend"
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </button>
                          )}
                          {msg.role === "assistant" && <SendToBoardButton content={msg.content} />}
                          {msg.role === "assistant" && (
                            <button
                              onClick={() => {
                                setPreviousResponses((prev) => ({ ...prev, [msg.id]: msg.content }));
                                setDismissedDiffs((prev) => ({ ...prev, [msg.id]: false }));
                                const userMsg = branchMessages
                                  .slice(0, idx)
                                  .reverse()
                                  .find((m) => m.role === "user");
                                if (userMsg) onSendMessage(userMsg.content);
                              }}
                              className="flex items-center gap-1 text-[10px] font-light text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                              title="Regenerate this answer"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Regenerate
                            </button>
                          )}
                        </div>
                      )}

                      {/* Branded intelligence report artifact — only when the operator
                        asked for the product as a file, and only after streaming. */}
                      {msg.role === "assistant" &&
                        !!msg.content &&
                        !(isStreaming && msg === lastMsg) &&
                        wantsIntelReportFile(
                          branchMessages[idx - 1]?.role === "user" ? branchMessages[idx - 1].content : "",
                        ) && (
                          <IntelReportCard
                            content={msg.content}
                            request={branchMessages[idx - 1]?.content}
                            conversationTitle={conversation.title}
                            timestamp={msg.timestamp}
                            sources={msg.sources}
                          />
                        )}

                      {/* Sources — numbered so the answer's [n] markers resolve to a
                        real link. The links the answer actually carried; no scores. */}
                      {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 px-1">
                          {msg.sources.map((s, i) => (
                            <a
                              key={`${s.url}-${i}`}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-light text-muted-foreground/50 hover:text-accent transition-colors max-w-[280px]"
                            >
                              <span className="shrink-0 font-mono text-muted-foreground/40">[{i + 1}]</span>
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{s.title || s.url}</span>
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Tool traces — read back from the Connect pulls table, so a row
                        exists only if a real invoke wrote it, and survives refresh. */}
                      {msg.role === "assistant" && (
                        <TurnTraces
                          messageId={msg.id}
                          onOpenOrgan={(organ) => navigate(`/dashboard/connect?organ=${encodeURIComponent(organ)}`)}
                        />
                      )}
                    </div>
                  </div>
                ),
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
          <ScrollIntelligence
            containerRef={scrollContainerRef}
            isStreaming={!!isStreaming}
            messagesEndRef={messagesEndRef}
          />
        </div>

        {/* Queued sends — one honest line, only when the transport parked one. */}
        {queuedCount > 0 && (
          <div className="px-4 pb-1 text-[10px] font-light text-muted-foreground/50 shrink-0">
            {queuedCount} message{queuedCount > 1 ? "s" : ""} queued
          </div>
        )}

        {/* Active directive profile — the composer states what is in force. */}
        {activeBrainId && (
          <div className="px-4 pb-1 shrink-0">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1">
              <Brain className="h-3 w-3 text-accent" aria-hidden="true" />
              <span className="text-[10px] font-light text-accent">
                directions in force{activeBrainName ? `: ${activeBrainName}` : ""}
              </span>
              {onBrainChange && (
                <button
                  onClick={() => onBrainChange(null)}
                  className="text-[10px] font-light text-muted-foreground/60 hover:text-foreground transition-colors"
                  aria-label="turn off directive profile"
                  title="turn off directive profile"
                >
                  turn off
                </button>
              )}
            </div>
          </div>
        )}

        {/* Composer */}
        <SubscriptionGatedInput
          ref={inputBarRef}
          onSendMessage={onSendMessage}
          onStop={onStopStreaming}
          onQuickAction={handleQuickAction}
          isStreaming={!!isStreaming}
          conversationId={conversation.id}
        />
      </div>

      {/* Image Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in motion-reduce:animate-none cursor-zoom-out"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightboxSrc(null);
            }}
            className="absolute top-4 right-4 p-2 rounded-full bg-foreground/10 hover:bg-foreground/20 text-white transition-colors z-10"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxSrc}
            alt="Expanded view"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl border border-border/10 animate-scale-in motion-reduce:animate-none"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default ChatView;
