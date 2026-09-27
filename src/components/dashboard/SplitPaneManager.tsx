import { useState, useCallback, useRef, useEffect } from "react";
import { X, Columns2, Rows2, Grid2x2, Maximize2, Minimize2, GripVertical, GripHorizontal, RotateCcw } from "lucide-react";
import type { Conversation, ChatMode, FileAttachment } from "./types";
import type { ResponseDepth } from "./DepthSelector";
import type { SelectedModel } from "./MultiModelSelector";
import type { QueueItem } from "./MessageQueuePanel";
import type { FeedbackType } from "./CalibrationFeedback";
import type { MessageStatus } from "@/lib/messageQueue";
import ChatView from "./ChatView";

export interface SplitPane {
  id: string;
  conversationId: string;
}

type LayoutMode = "horizontal" | "vertical" | "grid";

const LAYOUT_STORAGE_KEY = "aureon_split_layout";
const SIZES_STORAGE_KEY = "aureon_split_sizes";

function loadLayout(): LayoutMode {
  try { return (localStorage.getItem(LAYOUT_STORAGE_KEY) as LayoutMode) || "horizontal"; } catch { return "horizontal"; }
}
function saveLayout(l: LayoutMode) {
  try { localStorage.setItem(LAYOUT_STORAGE_KEY, l); } catch {}
}
function loadSizes(): number[] | null {
  try { const s = localStorage.getItem(SIZES_STORAGE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function saveSizes(s: number[]) {
  try { localStorage.setItem(SIZES_STORAGE_KEY, JSON.stringify(s)); } catch {}
}

interface SplitPaneManagerProps {
  panes: SplitPane[];
  conversations: Conversation[];
  onRemovePane: (paneId: string) => void;
  onSendMessage: (content: string, convId: string, attachments?: FileAttachment[]) => void;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  depth: ResponseDepth;
  onDepthChange: (depth: ResponseDepth) => void;
  isStreaming?: boolean;
  suggestions?: string[];
  onCalibrationFeedback?: (messageId: string, feedback: FeedbackType) => void;
  onStopStreaming?: () => void;
  focusMode?: boolean;
  messageStatuses?: Record<string, MessageStatus>;
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
  onDropConversation: (convId: string) => void;
  isDraggingConvo: boolean;
}

const SplitPaneManager = ({
  panes,
  conversations,
  onRemovePane,
  onSendMessage,
  mode,
  onModeChange,
  depth,
  onDepthChange,
  isStreaming,
  suggestions,
  onCalibrationFeedback,
  onStopStreaming,
  focusMode,
  messageStatuses,
  queueItems,
  onRemoveFromQueue,
  onClearQueue,
  onProcessQueueNow,
  queuePaused,
  onToggleQueuePause,
  consensusEnabled,
  onConsensusToggle,
  consensusModels,
  onConsensusModelsChange,
  storedProviders,
  activeBrainId,
  onBrainChange,
  onDropConversation,
  isDraggingConvo,
}: SplitPaneManagerProps) => {
  const [layout, setLayout] = useState<LayoutMode>(loadLayout);
  const [expandedPane, setExpandedPane] = useState<string | null>(null);
  const [dragOverDrop, setDragOverDrop] = useState(false);

  // Sizes as percentages (one per pane, should sum ~100)
  const defaultSizes = useCallback(() => panes.map(() => 100 / panes.length), [panes.length]);
  const [sizes, setSizes] = useState<number[]>(() => loadSizes() || defaultSizes());

  // Reset sizes when pane count changes
  useEffect(() => {
    const equal = panes.map(() => 100 / panes.length);
    setSizes(equal);
    saveSizes(equal);
  }, [panes.length]);

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingIdx = useRef<number | null>(null);
  const startPos = useRef(0);
  const startSizes = useRef<number[]>([]);

  const changeLayout = useCallback((l: LayoutMode) => {
    setLayout(l);
    saveLayout(l);
    // Reset sizes on layout change
    const equal = panes.map(() => 100 / panes.length);
    setSizes(equal);
    saveSizes(equal);
  }, [panes.length]);

  const resetSizes = useCallback(() => {
    const equal = panes.map(() => 100 / panes.length);
    setSizes(equal);
    saveSizes(equal);
  }, [panes.length]);

  // Drag resize logic
  const isHorizontalDrag = layout === "horizontal" || (layout === "grid" && panes.length <= 2);

  const onDividerMouseDown = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    draggingIdx.current = idx;
    startPos.current = isHorizontalDrag ? e.clientX : e.clientY;
    startSizes.current = [...sizes];

    const onMouseMove = (ev: MouseEvent) => {
      if (draggingIdx.current === null || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalPx = isHorizontalDrag ? rect.width : rect.height;
      const deltaPx = isHorizontalDrag ? ev.clientX - startPos.current : ev.clientY - startPos.current;
      const deltaPct = (deltaPx / totalPx) * 100;
      const i = draggingIdx.current;
      const newSizes = [...startSizes.current];
      const minPct = 15; // minimum 15% per pane
      let sA = newSizes[i] + deltaPct;
      let sB = newSizes[i + 1] - deltaPct;
      if (sA < minPct) { sB -= (minPct - sA); sA = minPct; }
      if (sB < minPct) { sA -= (minPct - sB); sB = minPct; }
      newSizes[i] = sA;
      newSizes[i + 1] = sB;
      setSizes(newSizes);
    };

    const onMouseUp = () => {
      draggingIdx.current = null;
      saveSizes(sizes);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = isHorizontalDrag ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sizes, isHorizontalDrag]);

  // Drop zone handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOverDrop(true);
  }, []);
  const handleDragLeave = useCallback(() => setDragOverDrop(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverDrop(false);
    const convId = e.dataTransfer.getData("text/aureon-conversation-id");
    if (convId) onDropConversation(convId);
  }, [onDropConversation]);

  // Build layout styles
  const useGrid = layout === "grid" && panes.length > 2;
  const flexDir = layout === "vertical" ? "flex-col" : "flex-row";

  const renderPane = (pane: SplitPane, idx: number) => {
    const conv = conversations.find(c => c.id === pane.conversationId);
    if (!conv) return null;

    const isExpanded = expandedPane === pane.id;
    if (expandedPane && !isExpanded) return null; // hide others when one is expanded

    const sizeStyle = !isExpanded && !useGrid
      ? { [isHorizontalDrag ? "width" : "height"]: `${sizes[idx] ?? 50}%` }
      : isExpanded
        ? { width: "100%", height: "100%" }
        : {};

    return (
      <div
        key={pane.id}
        className={`relative flex flex-col min-w-0 min-h-0 overflow-hidden transition-all duration-200 ${
          useGrid ? "" : ""
        }`}
        style={useGrid ? { minWidth: 0, minHeight: 0 } : sizeStyle}
      >
        {/* Pane header */}
        <div className="flex items-center justify-between px-2 sm:px-3 py-1 border-b border-border/15 bg-card/40 backdrop-blur-sm shrink-0 gap-1">
          <span className="text-[10px] font-light text-muted-foreground/60 truncate max-w-[180px]">
            {conv.title}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setExpandedPane(isExpanded ? null : pane.id)}
              className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground transition-colors"
              title={isExpanded ? "Restore" : "Maximize pane"}
            >
              {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
            <button
              onClick={() => onRemovePane(pane.id)}
              className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground transition-colors"
              title="Close pane"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatView
            conversation={conv}
            onSendMessage={(content, attachments) => onSendMessage(content, pane.conversationId, attachments)}
            mode={mode}
            onModeChange={onModeChange}
            depth={depth}
            onDepthChange={onDepthChange}
            isStreaming={isStreaming}
            suggestions={[]}
            onCalibrationFeedback={onCalibrationFeedback}
            onStopStreaming={onStopStreaming}
            focusMode={focusMode}
            messageStatuses={messageStatuses}
            queueItems={[]}
            storedProviders={storedProviders}
            activeBrainId={activeBrainId}
            onBrainChange={onBrainChange}
          />
        </div>
      </div>
    );
  };

  const renderDivider = (idx: number) => {
    if (expandedPane) return null;
    const isH = isHorizontalDrag && !useGrid;
    return (
      <div
        key={`divider-${idx}`}
        className={`shrink-0 flex items-center justify-center group ${
          isH
            ? "w-1.5 cursor-col-resize hover:bg-foreground/10 active:bg-foreground/15"
            : "h-1.5 cursor-row-resize hover:bg-foreground/10 active:bg-foreground/15"
        } transition-colors`}
        onMouseDown={(e) => onDividerMouseDown(idx, e)}
        title="Drag to resize"
      >
        {isH ? (
          <GripVertical className="h-4 w-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
        ) : (
          <GripHorizontal className="h-4 w-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
        )}
      </div>
    );
  };

  // Build visible panes (accounting for expanded)
  const visiblePanes = expandedPane
    ? panes.filter(p => p.id === expandedPane)
    : panes;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 h-full">
      {/* Layout controls toolbar */}
      <div className="flex items-center justify-between px-2 sm:px-3 py-1 border-b border-border/10 bg-card/20 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-light text-muted-foreground/40 uppercase tracking-wider mr-1">Layout</span>
          <button
            onClick={() => changeLayout("horizontal")}
            className={`p-1 rounded transition-colors ${layout === "horizontal" ? "bg-foreground/10 text-foreground" : "text-muted-foreground/40 hover:text-foreground"}`}
            title="Side by side"
          >
            <Columns2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => changeLayout("vertical")}
            className={`p-1 rounded transition-colors ${layout === "vertical" ? "bg-foreground/10 text-foreground" : "text-muted-foreground/40 hover:text-foreground"}`}
            title="Stacked"
          >
            <Rows2 className="h-3.5 w-3.5" />
          </button>
          {panes.length > 2 && (
            <button
              onClick={() => changeLayout("grid")}
              className={`p-1 rounded transition-colors ${layout === "grid" ? "bg-foreground/10 text-foreground" : "text-muted-foreground/40 hover:text-foreground"}`}
              title="Grid"
            >
              <Grid2x2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetSizes}
            className="p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors"
            title="Reset equal sizes"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <span className="text-[9px] text-muted-foreground/30">{panes.length} pane{panes.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Panes container */}
      <div
        ref={containerRef}
        className={`flex ${useGrid ? "flex-wrap" : flexDir} flex-1 min-w-0 min-h-0`}
        style={useGrid ? {} : {}}
      >
        {useGrid ? (
          // Grid layout: 2x2
          <div className="grid grid-cols-2 grid-rows-2 flex-1 gap-px w-full h-full">
            {panes.map((pane) => {
              const conv = conversations.find(c => c.id === pane.conversationId);
              if (!conv) return null;
              const isExpanded = expandedPane === pane.id;
              if (expandedPane && !isExpanded) return null;
              return (
                <div key={pane.id} className={`relative flex flex-col min-w-0 min-h-0 overflow-hidden ${isExpanded ? "col-span-2 row-span-2" : ""}`}>
                  <div className="flex items-center justify-between px-2 sm:px-3 py-1 border-b border-border/15 bg-card/40 backdrop-blur-sm shrink-0 gap-1">
                    <span className="text-[10px] font-light text-muted-foreground/60 truncate max-w-[180px]">{conv.title}</span>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => setExpandedPane(isExpanded ? null : pane.id)} className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground transition-colors" title={isExpanded ? "Restore" : "Maximize"}>
                        {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                      </button>
                      <button onClick={() => onRemovePane(pane.id)} className="p-0.5 rounded text-muted-foreground/40 hover:text-foreground transition-colors" title="Close pane">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <ChatView
                      conversation={conv}
                      onSendMessage={(content, attachments) => onSendMessage(content, pane.conversationId, attachments)}
                      mode={mode}
                      onModeChange={onModeChange}
                      depth={depth}
                      onDepthChange={onDepthChange}
                      isStreaming={isStreaming}
                      suggestions={[]}
                      onCalibrationFeedback={onCalibrationFeedback}
                      onStopStreaming={onStopStreaming}
                      focusMode={focusMode}
                      messageStatuses={messageStatuses}
                      queueItems={[]}
                                storedProviders={storedProviders}
                      activeBrainId={activeBrainId}
                      onBrainChange={onBrainChange}
                    />
                  </div>
                </div>
              );
            })}

            {isDraggingConvo && panes.length < 4 && !expandedPane && (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex items-center justify-center border-2 border-dashed rounded-xl m-1 transition-all ${
                  dragOverDrop ? "border-foreground/40 bg-foreground/5" : "border-border/30 bg-card/10"
                }`}
              >
                <div className="text-center space-y-1">
                  <Grid2x2 className={`h-5 w-5 mx-auto transition-colors ${dragOverDrop ? "text-foreground/60" : "text-muted-foreground/30"}`} />
                  <p className={`text-[9px] font-light ${dragOverDrop ? "text-foreground/60" : "text-muted-foreground/30"}`}>Drop to add</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Flex layout (horizontal or vertical) with resizable dividers
          <>
            {visiblePanes.map((pane, idx) => (
              <div key={pane.id} className="contents">
                {renderPane(pane, panes.indexOf(pane))}
                {idx < visiblePanes.length - 1 && renderDivider(panes.indexOf(pane))}
              </div>
            ))}

            {/* Drop zone */}
            {isDraggingConvo && panes.length < 4 && !expandedPane && (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex items-center justify-center border-2 border-dashed rounded-xl m-1 transition-all shrink-0 ${
                  isHorizontalDrag ? "w-32" : "h-24"
                } ${dragOverDrop ? "border-foreground/40 bg-foreground/5" : "border-border/30 bg-card/10"}`}
              >
                <div className="text-center space-y-1">
                  <Grid2x2 className={`h-5 w-5 mx-auto transition-colors ${dragOverDrop ? "text-foreground/60" : "text-muted-foreground/30"}`} />
                  <p className={`text-[9px] font-light ${dragOverDrop ? "text-foreground/60" : "text-muted-foreground/30"}`}>Drop to add</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SplitPaneManager;
