import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  Pencil,
  Type,
  Eraser,
  Move,
  Minus,
  Plus,
  Square,
  Circle as CircleIcon,
  Triangle,
  Diamond,
  Star,
  MousePointer,
  Image as ImageIcon,
  Undo2,
  Redo2,
  Trash2,
  Wallpaper,
  ChevronDown,
  Lock,
  Frame as FrameIcon,
  ArrowRight,
  Download,
  Upload, MoreHorizontal,
} from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { decryptText, encryptText } from "@/lib/encryption";
import { ALL_WALLPAPERS, getWallpaperSrc } from "@/lib/wallpapers";
import { emitPull } from "@/lib/connect/emitPull";
import {
  FONT_STACKS as FONT_FAMILIES,
  contentBounds,
  getElementBounds,
  normalizeRect,
  resolveArrow,
  type ElementType,
  type FontFamilyKey,
  type FontWeightKey,
  type GridMode,
  type Point,
  type WallpaperMode,
  type WhiteboardBoard,
  type WhiteboardElement,
  type WhiteboardLayer,
} from "@/lib/whiteboard/types";
import {
  boardToJson,
  boardToSvg,
  downloadBlob,
  parseBoardJson,
  safeFileName,
  svgToPngBlob,
} from "@/lib/whiteboard/exportBoard";
import {
  BOARD_DROP_EVENT,
  consumeBoardDrops,
  type BoardDrop,
} from "@/lib/whiteboard/boardInbox";
import { describeDrop, dropToElements } from "@/lib/whiteboard/dropToElements";
const heroBgDefault = getWallpaperSrc("default");

type Tool =
  | "select"
  | "pen"
  | "marker"
  | "highlighter"
  | "text"
  | "sticky"
  | "eraser"
  | "laser"
  | "pan"
  | "rect"
  | "circle"
  | "triangle"
  | "diamond"
  | "star"
  | "line"
  | "frame"
  | "arrow";

interface DraftEditorState {
  x: number;
  y: number;
  kind: "text" | "sticky";
  existingId?: string;
}

interface HistoryState {
  boards: WhiteboardBoard[];
  activeBoardId: string;
  activeLayerId: string | null;
}

const WALLPAPERS = ALL_WALLPAPERS.map((w) =>
  w.key === "default" ? { ...w, label: "Current" } : w,
);

const COLORS = [
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#94a3b8",
  "#111827",
  "#0f766e",
  "#d1fae5",
];

const NOTE_COLORS = ["#fde68a", "#bfdbfe", "#fbcfe8", "#bbf7d0", "#fecaca", "#ddd6fe"];

const SHAPE_TOOLS: { tool: Tool; icon: typeof Square; label: string }[] = [
  { tool: "rect", icon: Square, label: "Rectangle" },
  { tool: "circle", icon: CircleIcon, label: "Circle" },
  { tool: "triangle", icon: Triangle, label: "Triangle" },
  { tool: "diamond", icon: Diamond, label: "Diamond" },
  { tool: "star", icon: Star, label: "Star" },
  { tool: "line", icon: Minus, label: "Line" },
];

const uid = () => Math.random().toString(36).slice(2, 10);
const deepClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const createLayer = (name = "Topic 1"): WhiteboardLayer => ({
  id: uid(),
  name,
  visible: true,
});

const createBoard = (name = "Board 1"): WhiteboardBoard => {
  const layer = createLayer("Topic 1");
  return {
    id: uid(),
    name,
    wallpaperMode: "current",
    wallpaperKey: "default",
    wallpaperBlur: 10,
    gridMode: "dots",
    snapMode: "freeform",
    smartShapes: true,
    layers: [layer],
    elements: [],
  };
};

const STORAGE_DEVICE_KEY = "aureon-whiteboard-device-key";
const STORAGE_NAMESPACE = "aureon-whiteboards-v3";

const getDeviceKey = () => {
  if (typeof window === "undefined") return "guest-device";
  const existing = window.localStorage.getItem(STORAGE_DEVICE_KEY);
  if (existing) return existing;
  const next = `device-${crypto.randomUUID()}`;
  window.localStorage.setItem(STORAGE_DEVICE_KEY, next);
  return next;
};

const getWallpaperSource = (board: WhiteboardBoard) => {
  if (board.wallpaperMode === "dark") return "";
  if (board.wallpaperMode === "current") return heroBgDefault;
  return WALLPAPERS.find((wallpaper) => wallpaper.key === board.wallpaperKey)?.src || heroBgDefault;
};

const moveElement = (element: WhiteboardElement, dx: number, dy: number): WhiteboardElement => {
  if (element.type === "path" && element.points) {
    return {
      ...element,
      points: element.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
    };
  }

  return {
    ...element,
    x: (element.x || 0) + dx,
    y: (element.y || 0) + dy,
  };
};

const pointHitsElement = (point: Point, element: WhiteboardElement) => {
  const bounds = getElementBounds(element);
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.w &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.h
  );
};

const detectSmartShape = (points: Point[]) => {
  if (points.length < 8) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;

  if (width < 18 && height < 18) return null;

  const start = points[0];
  const end = points[points.length - 1];
  const closed = distance(start, end) < Math.max(18, Math.min(width, height) * 0.22);

  if (!closed) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const error =
      points.reduce((sum, point) => {
        const numerator = Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x);
        return sum + numerator / length;
      }, 0) / points.length;

    if (error < Math.max(4, Math.min(width, height) * 0.12)) {
      return { type: "line" as const, x: start.x, y: start.y, w: dx, h: dy };
    }

    return null;
  }

  const ratio = width / Math.max(height, 1);
  if (ratio > 0.76 && ratio < 1.24) {
    return { type: "circle" as const, x: minX, y: minY, w: width, h: height };
  }

  return { type: "rect" as const, x: minX, y: minY, w: width, h: height };
};

const getPathOpacity = (element: WhiteboardElement) => {
  if (element.type !== "path") return 1;
  if (element.opacity) return element.opacity;
  if (element.fillColor === "highlighter") return 0.2;
  if (element.fillColor === "marker") return 0.8;
  return 1;
};

const drawCoverImage = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) => {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
};

const drawRoundedRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
};

const parseNumbersFromText = (text: string) => {
  const matches = text.match(/-?\d+(?:\.\d+)?/g) || [];
  return matches.slice(0, 24).map((value) => Number(value)).filter((value) => Number.isFinite(value));
};

const normalizeBoard = (raw: Partial<WhiteboardBoard>, index: number): WhiteboardBoard => {
  const board = raw as WhiteboardBoard;
  const layers = Array.isArray(board.layers) && board.layers.length ? board.layers : [createLayer(`Topic ${index + 1}`)];
  return {
    id: board.id || uid(),
    name: board.name || `Board ${index + 1}`,
    wallpaperMode: board.wallpaperMode || "current",
    wallpaperKey: board.wallpaperKey || "aureon",
    wallpaperBlur: typeof board.wallpaperBlur === "number" ? board.wallpaperBlur : 10,
    gridMode: board.gridMode || "dots",
    snapMode: board.snapMode || "freeform",
    smartShapes: board.smartShapes ?? true,
    layers,
    elements: Array.isArray(board.elements)
      ? board.elements.map((element) => ({ ...element, layerId: element.layerId || layers[0].id }))
      : [],
  };
};

const Whiteboard = () => {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [paneSize, setPaneSize] = useState({ w: 0, h: 0 });
  const [moreToolsOpen, setMoreToolsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const backgroundCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const loadedRef = useRef(false);
  const dragSnapshotRef = useRef<WhiteboardElement | null>(null);
  // Wheel zoom must anchor on the cursor, which needs the CURRENT view in a
  // listener registered once. State read through refs, never a stale closure.
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0 });
  const createTraceRef = useRef<{ counts: Record<string, number>; timer: number | null }>({ counts: {}, timer: null });
  const arrowDraftRef = useRef<{ id: string; fromId?: string } | null>(null);
  const frameChildrenRef = useRef<Map<string, WhiteboardElement>>(new Map());

  const [storageUserKey, setStorageUserKey] = useState("guest-device");
  const [boards, setBoards] = useState<WhiteboardBoard[]>([createBoard()]);
  const [activeBoardId, setActiveBoardId] = useState<string>(() => createBoard().id);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ffffff");
  const [fillColor, setFillColor] = useState("transparent");
  const [brushSize, setBrushSize] = useState(4);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [shapeStart, setShapeStart] = useState<Point | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedShapeMenu, setSelectedShapeMenu] = useState(false);
  const [draftEditor, setDraftEditor] = useState<DraftEditorState | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftFontSize, setDraftFontSize] = useState(18);
  const [draftFontFamily, setDraftFontFamily] = useState<FontFamilyKey>("Sans");
  const [draftFontWeight, setDraftFontWeight] = useState<FontWeightKey>("400");
  const [draftStickyColor, setDraftStickyColor] = useState(NOTE_COLORS[0]);
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
  const [laserTrail, setLaserTrail] = useState<Point[]>([]);
  const [layerPanelOpen, setLayerPanelOpen] = useState(true);
  const [backgroundPanelOpen, setBackgroundPanelOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStorageUserKey(user?.id || getDeviceKey());
  }, [user?.id]);

  useEffect(() => {
    const initialBoard = createBoard();
    setBoards([initialBoard]);
    setActiveBoardId(initialBoard.id);
    setActiveLayerId(initialBoard.layers[0]?.id ?? null);
  }, []);

  useEffect(() => {
    const storageKey = `${STORAGE_NAMESPACE}:${storageUserKey}`;
    let cancelled = false;

    const loadBoards = async () => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
          loadedRef.current = true;
          return;
        }

        const decrypted = await decryptText(raw, storageUserKey);
        const parsed = JSON.parse(decrypted) as { boards?: Partial<WhiteboardBoard>[]; activeBoardId?: string; activeLayerId?: string | null };
        if (cancelled || !parsed.boards?.length) {
          loadedRef.current = true;
          return;
        }

        const normalized = parsed.boards.map((board, index) => normalizeBoard(board, index));
        const fallbackBoard = normalized[0];
        setBoards(normalized);
        setActiveBoardId(normalized.some((board) => board.id === parsed.activeBoardId) ? parsed.activeBoardId || fallbackBoard.id : fallbackBoard.id);
        const resolvedBoard = normalized.find((board) => board.id === parsed.activeBoardId) || fallbackBoard;
        setActiveLayerId(
          resolvedBoard.layers.some((layer) => layer.id === parsed.activeLayerId)
            ? parsed.activeLayerId || resolvedBoard.layers[0]?.id || null
            : resolvedBoard.layers[0]?.id || null,
        );
      } catch {
        const resetBoard = createBoard();
        setBoards([resetBoard]);
        setActiveBoardId(resetBoard.id);
        setActiveLayerId(resetBoard.layers[0]?.id ?? null);
      } finally {
        loadedRef.current = true;
      }
    };

    loadBoards();
    return () => {
      cancelled = true;
    };
  }, [storageUserKey]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const storageKey = `${STORAGE_NAMESPACE}:${storageUserKey}`;
    // Debounce persistence so we don't encrypt + serialize on every pointermove
    // while drawing — that was the primary cause of stroke lag.
    const handle = window.setTimeout(async () => {
      try {
        const encrypted = await encryptText(
          JSON.stringify({ boards, activeBoardId, activeLayerId }),
          storageUserKey,
        );
        window.localStorage.setItem(storageKey, encrypted);
      } catch {
        /* ignore — next change will retry */
      }
    }, 600);
    return () => window.clearTimeout(handle);
  }, [boards, activeBoardId, activeLayerId, storageUserKey]);

  useEffect(() => {
    viewRef.current = { zoom, panX: panOffset.x, panY: panOffset.y };
  }, [zoom, panOffset.x, panOffset.y]);

  const activeBoard = useMemo(() => {
    return boards.find((board) => board.id === activeBoardId) || boards[0];
  }, [boards, activeBoardId]);

  useEffect(() => {
    if (!activeBoard) return;
    if (!activeBoard.layers.some((layer) => layer.id === activeLayerId)) {
      setActiveLayerId(activeBoard.layers[0]?.id || null);
    }
  }, [activeBoard, activeLayerId]);

  const selectedElement = useMemo(() => {
    return activeBoard?.elements.find((element) => element.id === selectedElementId) || null;
  }, [activeBoard, selectedElementId]);

  const selectedImage = selectedElement?.type === "image" ? selectedElement : null;
  const selectedTextElement = selectedElement && ["text", "sticky"].includes(selectedElement.type) ? selectedElement : null;
  const selectedChart = selectedElement?.type === "chart" ? selectedElement : null;

  const pushHistory = useCallback(() => {
    setUndoStack((previous) => [
      ...previous.slice(-29),
      {
        boards: deepClone(boards),
        activeBoardId,
        activeLayerId,
      },
    ]);
    setRedoStack([]);
  }, [boards, activeBoardId, activeLayerId]);

  const restoreHistory = (snapshot: HistoryState | undefined) => {
    if (!snapshot) return;
    setBoards(snapshot.boards);
    setActiveBoardId(snapshot.activeBoardId);
    setActiveLayerId(snapshot.activeLayerId);
    setSelectedElementId(null);
    setDraftEditor(null);
  };

  const undo = useCallback(() => {
    setUndoStack((previous) => {
      const next = [...previous];
      const snapshot = next.pop();
      if (snapshot) {
        setRedoStack((redoPrevious) => [
          ...redoPrevious,
          {
            boards: deepClone(boards),
            activeBoardId,
            activeLayerId,
          },
        ]);
        restoreHistory(snapshot);
      }
      return next;
    });
  }, [boards, activeBoardId, activeLayerId]);

  const redo = useCallback(() => {
    setRedoStack((previous) => {
      const next = [...previous];
      const snapshot = next.pop();
      if (snapshot) {
        setUndoStack((undoPrevious) => [
          ...undoPrevious,
          {
            boards: deepClone(boards),
            activeBoardId,
            activeLayerId,
          },
        ]);
        restoreHistory(snapshot);
      }
      return next;
    });
  }, [boards, activeBoardId, activeLayerId]);

  const updateActiveBoard = useCallback((updater: (board: WhiteboardBoard) => WhiteboardBoard) => {
    setBoards((previous) => previous.map((board) => (board.id === activeBoardId ? updater(board) : board)));
  }, [activeBoardId]);

  const updateActiveBoardElements = useCallback((updater: (elements: WhiteboardElement[]) => WhiteboardElement[]) => {
    updateActiveBoard((board) => ({ ...board, elements: updater(board.elements) }));
  }, [updateActiveBoard]);

  const updateSelectedElement = useCallback((updater: (element: WhiteboardElement) => WhiteboardElement) => {
    if (!selectedElementId) return;
    updateActiveBoardElements((elements) =>
      elements.map((element) => (element.id === selectedElementId ? updater(element) : element)),
    );
  }, [selectedElementId, updateActiveBoardElements]);

  /**
   * One Connect row per burst of authoring, not one per pen stroke. A trace
   * that fires 200 times while somebody sketches is noise, and it would make
   * the whiteboard organ look busier than the work it actually did.
   */
  const traceCreate = useCallback((kind: string, count = 1) => {
    const state = createTraceRef.current;
    state.counts[kind] = (state.counts[kind] || 0) + count;
    if (state.timer !== null) return;
    state.timer = window.setTimeout(() => {
      const counts = state.counts;
      state.counts = {};
      state.timer = null;
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      if (!total) return;
      const summary = Object.entries(counts)
        .map(([key, value]) => (value > 1 ? `${value}× ${key}` : key))
        .join(", ");
      void emitPull({
        organ: "whiteboard",
        capability: "create",
        fromSurface: "whiteboard",
        status: "ok",
        quote: summary,
        meta: { objects: total },
      });
    }, 2500);
  }, []);

  useEffect(() => () => {
    if (createTraceRef.current.timer !== null) window.clearTimeout(createTraceRef.current.timer);
  }, []);

  const notify = useCallback((message: string) => {
    setExportNotice(message);
    window.setTimeout(() => setExportNotice((current) => (current === message ? null : current)), 3200);
  }, []);

  const getCanvasPoint = useCallback((clientX: number, clientY: number, snap = false) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    const basePoint = {
      x: (clientX - rect.left - panOffset.x) / zoom,
      y: (clientY - rect.top - panOffset.y) / zoom,
    };

    if (!snap || !activeBoard || activeBoard.snapMode === "freeform") return basePoint;

    const spacing = activeBoard.snapMode === "dots" ? 28 : 40;
    return {
      x: Math.round(basePoint.x / spacing) * spacing,
      y: Math.round(basePoint.y / spacing) * spacing,
    };
  }, [activeBoard, panOffset.x, panOffset.y, zoom]);

  // The board is a pane inside the dashboard. Its centre is the centre of the
  // container box — window.innerWidth/2 lands under the nav on desktop.
  const getViewCenter = useCallback((snap = true) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return getCanvasPoint(0, 0, snap);
    return getCanvasPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, snap);
  }, [getCanvasPoint]);

  const toScreenPoint = useCallback((point: Point) => ({
    x: point.x * zoom + panOffset.x,
    y: point.y * zoom + panOffset.y,
  }), [panOffset.x, panOffset.y, zoom]);

  const createChartElement = useCallback((position?: Point) => {
    if (!activeLayerId) return;
    pushHistory();
    const point = position || getViewCenter(true);
    const chart: WhiteboardElement = {
      id: uid(),
      layerId: activeLayerId,
      type: "chart",
      x: point.x,
      y: point.y,
      w: 320,
      h: 180,
      color,
      fillColor,
      chartType: "line",
      // A blank sketch series. The board never fabricates a data feed — the
      // operator types the numbers, or drops a real series onto the canvas.
      series: [],
      text: "Sketch series",
    };
    updateActiveBoardElements((elements) => [...elements, chart]);
    setSelectedElementId(chart.id);
    traceCreate("chart");
  }, [activeLayerId, color, fillColor, getCanvasPoint, pushHistory, traceCreate, updateActiveBoardElements]);

  const createDocumentElement = useCallback((fileName: string, fileType: string, preview = "", position?: Point) => {
    if (!activeLayerId) return;
    const point = position || getViewCenter(true);
    const doc: WhiteboardElement = {
      id: uid(),
      layerId: activeLayerId,
      type: "document",
      x: point.x,
      y: point.y,
      w: 280,
      h: 140,
      fileName,
      fileType,
      preview,
      color,
    };
    updateActiveBoardElements((elements) => [...elements, doc]);
    setSelectedElementId(doc.id);
  }, [activeLayerId, color, getCanvasPoint, updateActiveBoardElements]);

  const startDraftEditor = useCallback((point: Point, kind: "text" | "sticky", existing?: WhiteboardElement) => {
    setDraftEditor({ x: point.x, y: point.y, kind, existingId: existing?.id });
    setDraftText(existing?.text || "");
    setDraftFontSize(existing?.fontSize || 18);
    setDraftFontFamily(existing?.fontFamily || "Sans");
    setDraftFontWeight(existing?.fontWeight || "400");
    setDraftStickyColor(existing?.noteColor || NOTE_COLORS[0]);
  }, []);

  const submitDraftEditor = useCallback(() => {
    if (!draftEditor || !activeLayerId) return;
    if (!draftText.trim()) {
      setDraftEditor(null);
      setDraftText("");
      return;
    }

    pushHistory();

    if (draftEditor.existingId) {
      updateActiveBoardElements((elements) =>
        elements.map((element) => {
          if (element.id !== draftEditor.existingId) return element;
          return {
            ...element,
            text: draftText,
            fontSize: draftFontSize,
            fontFamily: draftFontFamily,
            fontWeight: draftFontWeight,
            noteColor: draftEditor.kind === "sticky" ? draftStickyColor : element.noteColor,
          };
        }),
      );
      setSelectedElementId(draftEditor.existingId);
    } else {
      const nextElement: WhiteboardElement =
        draftEditor.kind === "sticky"
          ? {
              id: uid(),
              layerId: activeLayerId,
              type: "sticky",
              x: draftEditor.x,
              y: draftEditor.y,
              w: 240,
              h: 170,
              text: draftText,
              fontSize: draftFontSize,
              fontFamily: draftFontFamily,
              fontWeight: draftFontWeight,
              noteColor: draftStickyColor,
              color: "#111827",
            }
          : {
              id: uid(),
              layerId: activeLayerId,
              type: "text",
              x: draftEditor.x,
              y: draftEditor.y,
              text: draftText,
              fontSize: draftFontSize,
              fontFamily: draftFontFamily,
              fontWeight: draftFontWeight,
              color,
            };
      updateActiveBoardElements((elements) => [...elements, nextElement]);
      setSelectedElementId(nextElement.id);
    }

    setDraftEditor(null);
    setDraftText("");
  }, [activeLayerId, color, draftEditor, draftFontFamily, draftFontSize, draftFontWeight, draftStickyColor, draftText, pushHistory, updateActiveBoardElements]);

  const clearSelection = useCallback(() => {
    setSelectedElementId(null);
    setDraftEditor(null);
    dragSnapshotRef.current = null;
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedElementId) return;
    pushHistory();
    updateActiveBoardElements((elements) => elements.filter((element) => element.id !== selectedElementId));
    setSelectedElementId(null);
  }, [pushHistory, selectedElementId, updateActiveBoardElements]);

  const handleExport = useCallback(
    async (format: "png" | "svg" | "json") => {
      setExportMenuOpen(false);
      if (!activeBoard) return;
      const base = safeFileName(activeBoard.name);
      try {
        if (format === "json") {
          downloadBlob(new Blob([boardToJson(activeBoard)], { type: "application/json" }), `${base}.json`);
        } else {
          const exported = boardToSvg(activeBoard);
          if (!exported) {
            notify("Nothing on this board to export yet");
            return;
          }
          if (format === "svg") {
            downloadBlob(new Blob([exported.svg], { type: "image/svg+xml" }), `${base}.svg`);
          } else {
            downloadBlob(await svgToPngBlob(exported.svg, exported.bounds.w, exported.bounds.h, 2), `${base}.png`);
          }
        }
        notify(`Exported ${base}.${format}`);
        void emitPull({
          organ: "whiteboard",
          capability: "export",
          fromSurface: "whiteboard",
          status: "ok",
          quote: `${format} · ${activeBoard.elements.length} objects`,
        });
      } catch (error) {
        notify("Export failed");
        void emitPull({
          organ: "whiteboard",
          capability: "export",
          fromSurface: "whiteboard",
          status: "fail",
          quote: error instanceof Error ? error.message : "export failed",
        });
      }
    },
    [activeBoard, notify],
  );

  const handleImportBoard = useCallback(
    async (file: File) => {
      try {
        const parsed = parseBoardJson(await file.text());
        if (!parsed) {
          notify("That file is not an Asherin board");
          return;
        }
        pushHistory();
        setBoards((previous) => [...previous, parsed]);
        setActiveBoardId(parsed.id);
        setActiveLayerId(parsed.layers[0]?.id || null);
        notify(`Imported ${parsed.name}`);
      } catch {
        notify("Could not read that board file");
      }
    },
    [notify, pushHistory],
  );

  /**
   * Objects arriving from chat, Zophiel or Maps. Boards live inside the
   * account-synced encrypted envelope, so drops travel in memory only — no
   * plaintext round trip to a server.
   */
  const applyDrops = useCallback(
    (drops: BoardDrop[]) => {
      if (!drops.length) return;
      const board = boards.find((entry) => entry.id === activeBoardId);
      const layerId = activeLayerId || board?.layers[0]?.id;
      if (!board || !layerId) return;
      const origin = contentBounds(board.elements);
      let cursorY = origin ? origin.y + origin.h + 80 : 120;
      const created: WhiteboardElement[] = [];
      for (const drop of drops) {
        const batch = dropToElements(drop, layerId, { x: origin ? origin.x : 120, y: cursorY });
        if (!batch.length) continue;
        created.push(...batch);
        const bounds = contentBounds(batch);
        cursorY = bounds ? bounds.y + bounds.h + 80 : cursorY + 240;
      }
      if (!created.length) return;
      pushHistory();
      updateActiveBoardElements((elements) => [...elements, ...created]);
      notify(describeDrop(drops[drops.length - 1]));
      void emitPull({
        organ: "whiteboard",
        capability: "ai-object",
        fromSurface: drops[drops.length - 1].source,
        status: "ok",
        quote: describeDrop(drops[drops.length - 1]),
        meta: { objects: created.length },
      });
    },
    [activeBoardId, activeLayerId, boards, notify, pushHistory, updateActiveBoardElements],
  );

  // Drops queued before the board finished decrypting are flushed once, here.
  useEffect(() => {
    if (!loadedRef.current) return;
    applyDrops(consumeBoardDrops());
    const onDrop = () => applyDrops(consumeBoardDrops());
    window.addEventListener(BOARD_DROP_EVENT, onDrop);
    return () => window.removeEventListener(BOARD_DROP_EVENT, onDrop);
  }, [applyDrops]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rawPoint = getCanvasPoint(event.clientX, event.clientY, false);
    const snappedPoint = getCanvasPoint(event.clientX, event.clientY, true);

    if (tool === "pan" || event.button === 1 || event.altKey) {
      setIsPanning(true);
      return;
    }

    if (!activeBoard || !activeLayerId) return;

    const visibleElements = activeBoard.elements.filter((element) => activeBoard.layers.find((layer) => layer.id === element.layerId)?.visible);

    if (tool === "select") {
      // A frame is a container, so it only wins the click when nothing inside
      // it was hit — otherwise a big frame would swallow every child.
      const candidates = [...visibleElements].reverse();
      const hit =
        candidates.find((element) => element.type !== "frame" && pointHitsElement(rawPoint, element)) ||
        candidates.find((element) => element.type === "frame" && pointHitsElement(rawPoint, element));

      if (!hit) {
        clearSelection();
        return;
      }

      setSelectedElementId(hit.id);

      if (event.detail > 1 && (hit.type === "text" || hit.type === "sticky")) {
        startDraftEditor({ x: hit.x || 0, y: hit.y || 0 }, hit.type === "sticky" ? "sticky" : "text", hit);
        return;
      }

      dragSnapshotRef.current = deepClone(hit);
      if (hit.type === "frame") {
        const frameBounds = getElementBounds(hit);
        const captured = new Map<string, WhiteboardElement>();
        for (const element of visibleElements) {
          if (element.id === hit.id) continue;
          const bounds = getElementBounds(element);
          const inside =
            bounds.x >= frameBounds.x &&
            bounds.y >= frameBounds.y &&
            bounds.x + bounds.w <= frameBounds.x + frameBounds.w &&
            bounds.y + bounds.h <= frameBounds.y + frameBounds.h;
          if (inside) captured.set(element.id, deepClone(element));
        }
        frameChildrenRef.current = captured;
      } else {
        frameChildrenRef.current = new Map();
      }
      return;
    }

    if (tool === "text") {
      startDraftEditor(snappedPoint, "text");
      return;
    }

    if (tool === "sticky") {
      startDraftEditor(snappedPoint, "sticky");
      return;
    }

    if (tool === "arrow") {
      pushHistory();
      // Bind the tail to whatever sits under the start point; an arrow drawn
      // in empty space simply stays unbound.
      const anchor = [...visibleElements].reverse().find(
        (element) => element.type !== "arrow" && pointHitsElement(rawPoint, element),
      );
      const arrow: WhiteboardElement = {
        id: uid(),
        layerId: activeLayerId,
        type: "arrow",
        x: snappedPoint.x,
        y: snappedPoint.y,
        w: 0,
        h: 0,
        color,
        width: Math.max(1.4, brushSize * 0.6),
        fromId: anchor?.id,
      };
      arrowDraftRef.current = { id: arrow.id, fromId: anchor?.id };
      setShapeStart(snappedPoint);
      updateActiveBoardElements((elements) => [...elements, arrow]);
      setIsDrawing(true);
      return;
    }

    if (tool === "frame") {
      pushHistory();
      setShapeStart(snappedPoint);
      updateActiveBoardElements((elements) => [
        ...elements,
        {
          id: uid(),
          layerId: activeLayerId,
          type: "frame",
          x: snappedPoint.x,
          y: snappedPoint.y,
          w: 0,
          h: 0,
          color: "rgba(255,255,255,0.3)",
          width: 1.5,
          title: `Frame ${activeBoard.elements.filter((element) => element.type === "frame").length + 1}`,
        },
      ]);
      setIsDrawing(true);
      return;
    }

    if (["rect", "circle", "triangle", "diamond", "star", "line"].includes(tool)) {
      pushHistory();
      setShapeStart(snappedPoint);
      updateActiveBoardElements((elements) => [
        ...elements,
        {
          id: uid(),
          layerId: activeLayerId,
          type: tool as ElementType,
          x: snappedPoint.x,
          y: snappedPoint.y,
          w: 0,
          h: 0,
          color,
          fillColor,
          width: brushSize,
        },
      ]);
      setIsDrawing(true);
      return;
    }

    if (tool === "laser") {
      setLaserTrail([{ ...rawPoint, p: 1 }]);
      setIsDrawing(true);
      return;
    }

    if (["pen", "marker", "highlighter", "eraser"].includes(tool)) {
      pushHistory();
      updateActiveBoardElements((elements) => [
        ...elements,
        {
          id: uid(),
          layerId: activeLayerId,
          type: "path",
          points: [{ ...rawPoint, p: event.pointerType === "pen" ? Math.max(0.2, event.pressure || 0.5) : 1 }],
          color: tool === "eraser" ? "eraser" : color,
          fillColor: tool === "highlighter" ? "highlighter" : tool === "marker" ? "marker" : undefined,
          width: tool === "eraser" ? brushSize * 4 : brushSize,
          opacity: tool === "highlighter" ? 0.2 : tool === "marker" ? 0.8 : 1,
        },
      ]);
      setIsDrawing(true);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPanOffset((previous) => ({
        x: previous.x + event.movementX,
        y: previous.y + event.movementY,
      }));
      return;
    }

    const rawPoint = getCanvasPoint(event.clientX, event.clientY, false);
    const snappedPoint = getCanvasPoint(event.clientX, event.clientY, true);

    if (tool === "select" && selectedElementId && dragSnapshotRef.current) {
      const snapshot = dragSnapshotRef.current;
      const origin = getElementBounds(snapshot);
      const dx = rawPoint.x - origin.x;
      const dy = rawPoint.y - origin.y;
      const moved = moveElement(snapshot, dx, dy);

      // Dragging a frame drags what it contains — that is the whole point of
      // a frame. Children are measured against the frame's ORIGINAL bounds so
      // membership cannot drift mid-drag.
      if (snapshot.type === "frame") {
        const captured = frameChildrenRef.current;
        updateActiveBoardElements((elements) =>
          elements.map((element) => {
            if (element.id === selectedElementId) return moved;
            const child = captured.get(element.id);
            return child ? moveElement(child, dx, dy) : element;
          }),
        );
        return;
      }

      updateActiveBoardElements((elements) => elements.map((element) => (element.id === selectedElementId ? moved : element)));
      return;
    }

    if (!isDrawing || !activeBoard) return;

    if (tool === "laser") {
      setLaserTrail((previous) => [...previous, { ...rawPoint, p: 1 }]);
      return;
    }

    if (shapeStart && ["rect", "circle", "triangle", "diamond", "star", "line", "frame", "arrow"].includes(tool)) {
      updateActiveBoardElements((elements) => {
        const next = [...elements];
        const last = next[next.length - 1];
        if (!last) return next;
        last.w = snappedPoint.x - shapeStart.x;
        last.h = snappedPoint.y - shapeStart.y;
        return next;
      });
      return;
    }

    updateActiveBoardElements((elements) => {
      const next = [...elements];
      const last = next[next.length - 1];
      if (last?.type === "path" && last.points) {
        last.points = [
          ...last.points,
          {
            ...rawPoint,
            p: event.pointerType === "pen" ? Math.max(0.2, event.pressure || 0.5) : 1,
          },
        ];
      }
      return next;
    });
  };

  const handlePointerUp = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "laser") {
      window.setTimeout(() => setLaserTrail([]), 500);
    }

    if (tool === "arrow" && arrowDraftRef.current) {
      const draft = arrowDraftRef.current;
      arrowDraftRef.current = null;
      const endPoint = event ? getCanvasPoint(event.clientX, event.clientY, false) : null;
      updateActiveBoardElements((elements) => {
        const arrow = elements.find((element) => element.id === draft.id);
        if (!arrow) return elements;
        // A tap that never became a drag leaves nothing behind rather than a
        // zero-length arrow the operator cannot see or select.
        if (Math.hypot(arrow.w || 0, arrow.h || 0) < 6 && !arrow.toId) {
          return elements.filter((element) => element.id !== draft.id);
        }
        const target = endPoint
          ? [...elements].reverse().find(
              (element) =>
                element.type !== "arrow" && element.id !== draft.fromId && pointHitsElement(endPoint, element),
            )
          : undefined;
        return elements.map((element) =>
          element.id === draft.id ? { ...element, toId: target?.id } : element,
        );
      });
      traceCreate("arrow");
    }

    if (tool === "frame" && shapeStart) traceCreate("frame");
    if (["rect", "circle", "triangle", "diamond", "star", "line"].includes(tool)) traceCreate("shape");
    if (["pen", "marker", "highlighter"].includes(tool)) traceCreate("ink");

    if (activeBoard?.smartShapes && ["pen", "marker", "highlighter"].includes(tool)) {
      updateActiveBoardElements((elements) => {
        const next = [...elements];
        const last = next[next.length - 1];
        if (last?.type !== "path" || !last.points?.length) return next;
        const detected = detectSmartShape(last.points);
        if (!detected) return next;
        next[next.length - 1] = {
          id: last.id,
          layerId: last.layerId,
          type: detected.type,
          x: detected.x,
          y: detected.y,
          w: detected.w,
          h: detected.h,
          color: last.color,
          fillColor: fillColor,
          width: last.width,
        };
        return next;
      });
    }

    setIsDrawing(false);
    setIsPanning(false);
    setShapeStart(null);
    dragSnapshotRef.current = null;
  };

  const handleImportFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length || !activeLayerId) return;
    pushHistory();

    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const imageUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
          const image = new window.Image();
          image.onload = () => {
            const scale = Math.min(420 / image.width, 320 / image.height, 1);
            resolve({ width: image.width * scale, height: image.height * scale });
          };
          image.src = imageUrl;
        });

        const point = getViewCenter(true);
        updateActiveBoardElements((elements) => [
          ...elements,
          {
            id: uid(),
            layerId: activeLayerId,
            type: "image",
            src: imageUrl,
            x: point.x,
            y: point.y,
            imgWidth: dimensions.width,
            imgHeight: dimensions.height,
            borderRadius: 16,
          },
        ]);
        continue;
      }

      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        createDocumentElement(file.name, "PDF", "Imported onto canvas");
        continue;
      }

      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsText(file);
      }).catch(() => "");

      const numbers = parseNumbersFromText(text);
      if ((file.name.endsWith(".csv") || file.name.endsWith(".json") || file.name.endsWith(".txt")) && numbers.length >= 6) {
        const point = getViewCenter(true);
        updateActiveBoardElements((elements) => [
          ...elements,
          {
            id: uid(),
            layerId: activeLayerId,
            type: "chart",
            x: point.x,
            y: point.y,
            w: 320,
            h: 180,
            color,
            fillColor,
            chartType: "line",
            series: numbers.slice(0, 10),
            live: true,
            text: file.name,
          },
        ]);
      } else {
        createDocumentElement(file.name, file.type || "File", text.slice(0, 180));
      }
    }

    event.target.value = "";
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
      if (activeTag === "TEXTAREA" || activeTag === "INPUT") return;
      const items = event.clipboardData?.items || [];
      for (const item of items) {
        if (!activeLayerId) continue;
        if (item.type.startsWith("image/")) {
          event.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const synthetic = { target: { files: [file], value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>;
          handleImportFiles(synthetic);
          return;
        }
      }

      const pastedText = event.clipboardData?.getData("text");
      if (pastedText?.trim() && activeLayerId) {
        event.preventDefault();
        const point = getViewCenter(true);
        pushHistory();
        updateActiveBoardElements((elements) => [
          ...elements,
          {
            id: uid(),
            layerId: activeLayerId,
            type: "sticky",
            x: point.x,
            y: point.y,
            w: 240,
            h: 170,
            text: pastedText,
            fontSize: 16,
            fontFamily: "Sans",
            fontWeight: "400",
            noteColor: NOTE_COLORS[0],
            color: "#111827",
          },
        ]);
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [activeLayerId, getCanvasPoint, pushHistory, updateActiveBoardElements]);

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement | null)?.tagName;
      const isTyping = activeTag === "TEXTAREA" || activeTag === "INPUT";
      if (draftEditor && isTyping) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selectedElement) {
        event.preventDefault();
        const copyValue = selectedElement.text || selectedElement.fileName || JSON.stringify(selectedElement);
        await navigator.clipboard.writeText(copyValue);
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        undo();
        return;
      }

      if (event.key === "Delete" && selectedElementId) {
        event.preventDefault();
        deleteSelected();
        return;
      }

      if (event.key === "Escape") {
        clearSelection();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection, deleteSelected, draftEditor, redo, selectedElement, selectedElementId, undo]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      // deltaMode 1 = lines (Firefox), 2 = pages. Normalise to pixels first or
      // the same flick zooms at wildly different speeds per browser.
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
      // ctrlKey also arrives from a trackpad pinch — preventDefault or the
      // browser zooms the whole page instead of the board.
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const rect = container.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const { zoom: currentZoom, panX, panY } = viewRef.current;
        // Exponential in the delta magnitude: a long flick is one smooth
        // gesture instead of 1.08^N slamming into the zoom ceiling.
        const nextZoom = clamp(currentZoom * Math.exp(-event.deltaY * unit * 0.0015), 0.2, 4);
        const ratio = nextZoom / currentZoom;
        if (ratio === 1) return;
        setZoom(nextZoom);
        // Hold the point under the cursor still while the scale changes.
        setPanOffset({ x: px - (px - panX) * ratio, y: py - (py - panY) * ratio });
      } else {
        event.preventDefault();
        setPanOffset((previous) => ({
          x: previous.x - event.deltaX * unit,
          y: previous.y - event.deltaY * unit,
        }));
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);


  // The pane resizes whenever the sidebar drag-handle moves, the drawer opens,
  // or the window changes. Without this the canvas keeps its old backing store
  // and leaves a dead strip where the nav used to be.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setPaneSize((prev) =>
        Math.round(prev.w) === Math.round(box.width) && Math.round(prev.h) === Math.round(box.height)
          ? prev
          : { w: box.width, h: box.height },
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeBoard) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    const wallpaperSource = getWallpaperSource(activeBoard);
    const cachedBackground = wallpaperSource ? backgroundCacheRef.current.get(wallpaperSource) : null;

    if (wallpaperSource) {
      if (cachedBackground) {
        context.save();
        context.filter = `blur(${activeBoard.wallpaperBlur}px) brightness(0.55) saturate(0.9)`;
        drawCoverImage(context, cachedBackground, rect.width, rect.height);
        context.restore();
      } else {
        const image = new window.Image();
        image.src = wallpaperSource;
        image.onload = () => backgroundCacheRef.current.set(wallpaperSource, image);
      }
    }

    context.fillStyle = wallpaperSource ? "rgba(3, 7, 18, 0.5)" : "rgba(8, 8, 10, 1)";
    context.fillRect(0, 0, rect.width, rect.height);

    context.save();
    context.translate(panOffset.x, panOffset.y);
    context.scale(zoom, zoom);

    if (activeBoard.gridMode !== "freeform") {
      const spacing = activeBoard.gridMode === "dots" ? 28 : 40;
      const startX = Math.floor((-panOffset.x / zoom) / spacing) * spacing - spacing;
      const startY = Math.floor((-panOffset.y / zoom) / spacing) * spacing - spacing;
      const endX = startX + rect.width / zoom + spacing * 3;
      const endY = startY + rect.height / zoom + spacing * 3;
      if (activeBoard.gridMode === "square") {
        context.strokeStyle = "rgba(255,255,255,0.055)";
        context.lineWidth = 0.75;
        for (let x = startX; x < endX; x += spacing) {
          context.beginPath();
          context.moveTo(x, startY);
          context.lineTo(x, endY);
          context.stroke();
        }
        for (let y = startY; y < endY; y += spacing) {
          context.beginPath();
          context.moveTo(startX, y);
          context.lineTo(endX, y);
          context.stroke();
        }
      } else {
        context.fillStyle = "rgba(255,255,255,0.09)";
        for (let x = startX; x < endX; x += spacing) {
          for (let y = startY; y < endY; y += spacing) {
            context.beginPath();
            context.arc(x, y, 1.2, 0, Math.PI * 2);
            context.fill();
          }
        }
      }
    }

    const visibleLayerIds = new Set(activeBoard.layers.filter((layer) => layer.visible).map((layer) => layer.id));
    const elementById = new Map(activeBoard.elements.map((element) => [element.id, element]));
    // Frames are containers: draw them first so their wash never sits on top
    // of the objects they hold.
    const renderOrder = [
      ...activeBoard.elements.filter((element) => element.type === "frame"),
      ...activeBoard.elements.filter((element) => element.type !== "frame"),
    ];

    for (const element of renderOrder) {
      if (!visibleLayerIds.has(element.layerId)) continue;

      if (element.type === "frame") {
        const rectData = normalizeRect(element.x || 0, element.y || 0, element.w || 0, element.h || 0);
        context.save();
        drawRoundedRectPath(context, rectData.x, rectData.y, rectData.w, rectData.h, 18);
        context.fillStyle = "rgba(255,255,255,0.02)";
        context.fill();
        context.strokeStyle = element.color || "rgba(255,255,255,0.28)";
        context.lineWidth = element.width || 1.5;
        context.stroke();
        context.fillStyle = "rgba(255,255,255,0.62)";
        context.font = `400 12px ${FONT_FAMILIES.Mono}`;
        context.fillText(element.title || "Frame", rectData.x + 4, rectData.y - 10);
        context.restore();
      }

      if (element.type === "arrow") {
        const { from, to } = resolveArrow(element, elementById);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const head = 12;
        context.save();
        context.strokeStyle = element.color || "#ffffff";
        context.fillStyle = element.color || "#ffffff";
        context.lineWidth = element.width || 2;
        context.lineCap = "round";
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
        context.beginPath();
        context.moveTo(to.x, to.y);
        context.lineTo(to.x - head * Math.cos(angle - Math.PI / 7), to.y - head * Math.sin(angle - Math.PI / 7));
        context.lineTo(to.x - head * Math.cos(angle + Math.PI / 7), to.y - head * Math.sin(angle + Math.PI / 7));
        context.closePath();
        context.fill();
        if (element.text) {
          context.fillStyle = "rgba(255,255,255,0.6)";
          context.font = `400 11px ${FONT_FAMILIES.Mono}`;
          context.textAlign = "center";
          context.fillText(element.text, (from.x + to.x) / 2, (from.y + to.y) / 2 - 6);
          context.textAlign = "left";
        }
        context.restore();
      }

      if (element.type === "path" && element.points?.length) {
        context.save();
        const points = element.points;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.globalAlpha = getPathOpacity(element);
        if (element.color === "eraser") {
          context.globalCompositeOperation = "destination-out";
        }
        for (let index = 1; index < points.length; index += 1) {
          const previous = points[index - 1];
          const point = points[index];
          const pressure = ((previous.p || 1) + (point.p || 1)) / 2;
          context.strokeStyle = element.color === "eraser" ? "rgba(0,0,0,1)" : element.color || "#ffffff";
          context.lineWidth = (element.width || 2) * pressure * (element.fillColor === "marker" ? 1.2 : element.fillColor === "highlighter" ? 2.2 : 1);
          context.beginPath();
          context.moveTo(previous.x, previous.y);
          context.lineTo(point.x, point.y);
          context.stroke();
        }
        if (points.length === 1) {
          context.fillStyle = element.color || "#ffffff";
          context.beginPath();
          context.arc(points[0].x, points[0].y, element.width || 2, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }

      if (element.type === "text" && element.text) {
        const lines = element.text.split("\n");
        const fontSize = element.fontSize || 18;
        context.save();
        context.font = `${element.fontWeight || "400"} ${fontSize}px ${FONT_FAMILIES[element.fontFamily || "Sans"]}`;
        context.fillStyle = element.color || "#ffffff";
        lines.forEach((line, index) => {
          context.fillText(line, element.x || 0, (element.y || 0) + index * fontSize * 1.32);
        });
        context.restore();
      }

      if (element.type === "sticky") {
        const x = element.x || 0;
        const y = element.y || 0;
        const width = element.w || 240;
        const height = element.h || 170;
        context.save();
        drawRoundedRectPath(context, x, y, width, height, 18);
        context.fillStyle = element.noteColor || NOTE_COLORS[0];
        context.fill();
        context.strokeStyle = "rgba(17,24,39,0.15)";
        context.lineWidth = 1;
        context.stroke();
        context.fillStyle = "rgba(17,24,39,0.9)";
        context.font = `${element.fontWeight || "400"} ${element.fontSize || 16}px ${FONT_FAMILIES[element.fontFamily || "Sans"]}`;
        const textLines = (element.text || "").split("\n");
        textLines.forEach((line, index) => {
          context.fillText(line, x + 18, y + 32 + index * (element.fontSize || 16) * 1.28);
        });
        context.restore();
      }

      if (element.type === "image" && element.src) {
        let image = imageCacheRef.current.get(element.id);
        if (!image) {
          image = new window.Image();
          image.src = element.src;
          image.onload = () => imageCacheRef.current.set(element.id, image as HTMLImageElement);
          imageCacheRef.current.set(element.id, image);
        }
        if (image.complete) {
          const imageWidth = element.imgWidth || 260;
          const imageHeight = element.imgHeight || 180;
          const radius = ((element.borderRadius || 0) / 100) * Math.min(imageWidth, imageHeight) * 0.5;
          context.save();
          drawRoundedRectPath(context, element.x || 0, element.y || 0, imageWidth, imageHeight, radius);
          context.clip();
          context.drawImage(image, element.x || 0, element.y || 0, imageWidth, imageHeight);
          context.restore();
        }
      }

      if (element.type === "document") {
        const x = element.x || 0;
        const y = element.y || 0;
        const width = element.w || 280;
        const height = element.h || 140;
        context.save();
        drawRoundedRectPath(context, x, y, width, height, 20);
        context.fillStyle = "rgba(15,23,42,0.88)";
        context.fill();
        context.strokeStyle = "rgba(255,255,255,0.08)";
        context.stroke();
        context.fillStyle = "rgba(255,255,255,0.92)";
        context.font = `600 14px ${FONT_FAMILIES.Sans}`;
        context.fillText(element.fileName || "Imported file", x + 18, y + 30);
        context.fillStyle = "rgba(255,255,255,0.45)";
        context.font = `400 12px ${FONT_FAMILIES.Mono}`;
        context.fillText(element.fileType || "Document", x + 18, y + 52);
        context.font = `400 12px ${FONT_FAMILIES.Sans}`;
        const preview = (element.preview || "Dropped onto the canvas").slice(0, 120);
        context.fillText(preview, x + 18, y + 84, width - 36);
        context.restore();
      }

      if (element.type === "chart") {
        const x = element.x || 0;
        const y = element.y || 0;
        const width = element.w || 320;
        const height = element.h || 180;
        const series = element.series || [];
        const min = Math.min(...series, 0);
        const max = Math.max(...series, 100);
        context.save();
        drawRoundedRectPath(context, x, y, width, height, 22);
        context.fillStyle = "rgba(2,6,23,0.86)";
        context.fill();
        context.strokeStyle = "rgba(255,255,255,0.08)";
        context.stroke();
        context.fillStyle = "rgba(255,255,255,0.9)";
        context.font = `600 14px ${FONT_FAMILIES.Sans}`;
        context.fillText(element.text || "Sketch series", x + 18, y + 30);
        context.fillStyle = "rgba(255,255,255,0.45)";
        context.font = `400 11px ${FONT_FAMILIES.Mono}`;
        context.fillText(
          series.length ? "hand-entered — not a live feed" : "no series yet — add values in the inspector",
          x + 18,
          y + 50,
        );
        const chartX = x + 18;
        const chartY = y + 70;
        const chartWidth = width - 36;
        const chartHeight = height - 92;
        context.strokeStyle = "rgba(255,255,255,0.08)";
        context.strokeRect(chartX, chartY, chartWidth, chartHeight);
        if (series.length > 1) {
          context.strokeStyle = element.color || "#60a5fa";
          context.lineWidth = 2;
          context.beginPath();
          series.forEach((value, index) => {
            const px = chartX + (index / Math.max(series.length - 1, 1)) * chartWidth;
            const py = chartY + chartHeight - ((value - min) / Math.max(max - min, 1)) * chartHeight;
            if (index === 0) context.moveTo(px, py);
            else context.lineTo(px, py);
            context.fillStyle = element.color || "#60a5fa";
            context.beginPath();
            context.arc(px, py, 2.4, 0, Math.PI * 2);
            context.fill();
            context.beginPath();
            if (index === 0) context.moveTo(px, py);
            else context.lineTo(px, py);
          });
          context.stroke();
        }
        context.restore();
      }

      if (["rect", "circle", "triangle", "diamond", "star", "line"].includes(element.type)) {
        const rectData = normalizeRect(element.x || 0, element.y || 0, element.w || 0, element.h || 0);
        const stroke = element.color || "#ffffff";
        const fill = element.fillColor && element.fillColor !== "transparent" ? element.fillColor : null;
        context.save();
        context.lineWidth = element.width || 2;
        context.strokeStyle = stroke;
        if (element.type === "rect") {
          if (fill) {
            context.fillStyle = fill;
            context.fillRect(rectData.x, rectData.y, rectData.w, rectData.h);
          }
          context.strokeRect(rectData.x, rectData.y, rectData.w, rectData.h);
        }
        if (element.type === "circle") {
          context.beginPath();
          context.ellipse(rectData.x + rectData.w / 2, rectData.y + rectData.h / 2, rectData.w / 2, rectData.h / 2, 0, 0, Math.PI * 2);
          if (fill) {
            context.fillStyle = fill;
            context.fill();
          }
          context.stroke();
        }
        if (element.type === "triangle") {
          context.beginPath();
          context.moveTo(rectData.x + rectData.w / 2, rectData.y);
          context.lineTo(rectData.x + rectData.w, rectData.y + rectData.h);
          context.lineTo(rectData.x, rectData.y + rectData.h);
          context.closePath();
          if (fill) {
            context.fillStyle = fill;
            context.fill();
          }
          context.stroke();
        }
        if (element.type === "diamond") {
          context.beginPath();
          context.moveTo(rectData.x + rectData.w / 2, rectData.y);
          context.lineTo(rectData.x + rectData.w, rectData.y + rectData.h / 2);
          context.lineTo(rectData.x + rectData.w / 2, rectData.y + rectData.h);
          context.lineTo(rectData.x, rectData.y + rectData.h / 2);
          context.closePath();
          if (fill) {
            context.fillStyle = fill;
            context.fill();
          }
          context.stroke();
        }
        if (element.type === "star") {
          const cx = rectData.x + rectData.w / 2;
          const cy = rectData.y + rectData.h / 2;
          const outerRadius = Math.min(rectData.w, rectData.h) / 2;
          const innerRadius = outerRadius * 0.45;
          context.beginPath();
          for (let index = 0; index < 10; index += 1) {
            const radius = index % 2 === 0 ? outerRadius : innerRadius;
            const angle = (Math.PI / 5) * index - Math.PI / 2;
            const px = cx + radius * Math.cos(angle);
            const py = cy + radius * Math.sin(angle);
            if (index === 0) context.moveTo(px, py);
            else context.lineTo(px, py);
          }
          context.closePath();
          if (fill) {
            context.fillStyle = fill;
            context.fill();
          }
          context.stroke();
        }
        if (element.type === "line") {
          context.beginPath();
          context.moveTo(element.x || 0, element.y || 0);
          context.lineTo((element.x || 0) + (element.w || 0), (element.y || 0) + (element.h || 0));
          context.stroke();
        }
        // Shapes can carry a caption — that is how a dropped entity graph
        // renders its nodes as one selectable, bindable object each.
        if (element.text && element.type !== "line") {
          const labelSize = element.fontSize || 13;
          const lines = element.text.split("\n");
          context.fillStyle = element.color || "#ffffff";
          context.font = `${element.fontWeight || "400"} ${labelSize}px ${FONT_FAMILIES[element.fontFamily || "Sans"]}`;
          context.textAlign = "center";
          const startY = rectData.y + rectData.h / 2 - ((lines.length - 1) * labelSize * 1.25) / 2 + labelSize * 0.34;
          lines.forEach((line, index) => {
            context.fillText(line, rectData.x + rectData.w / 2, startY + index * labelSize * 1.25);
          });
          context.textAlign = "left";
        }
        context.restore();
      }

      if (selectedElementId === element.id) {
        const bounds = getElementBounds(element);
        context.save();
        context.setLineDash([6, 6]);
        context.strokeStyle = "rgba(96,165,250,0.7)";
        context.lineWidth = 1;
        context.strokeRect(bounds.x - 6, bounds.y - 6, bounds.w + 12, bounds.h + 12);
        context.restore();
      }
    }

    if (laserTrail.length > 1) {
      context.save();
      context.strokeStyle = "rgba(250,204,21,0.95)";
      context.lineWidth = 4;
      context.shadowBlur = 16;
      context.shadowColor = "rgba(250,204,21,0.8)";
      context.beginPath();
      context.moveTo(laserTrail[0].x, laserTrail[0].y);
      laserTrail.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
      context.restore();
    }

    context.restore();
  }, [activeBoard, fillColor, laserTrail, panOffset.x, panOffset.y, paneSize.h, paneSize.w, selectedElementId, zoom]);

  const boardScreenPoint = draftEditor ? toScreenPoint({ x: draftEditor.x, y: draftEditor.y }) : null;
  const activeLayer = activeBoard?.layers.find((layer) => layer.id === activeLayerId) || null;
  const isShapeTool = ["rect", "circle", "triangle", "diamond", "star", "line"].includes(tool);
  const toolButton = (active: boolean) =>
    `inline-flex min-h-11 min-w-11 lg:min-h-0 lg:min-w-0 items-center justify-center rounded-xl border px-2.5 py-2 transition-colors ${
      active
        ? "border-foreground/25 bg-foreground/10 text-foreground"
        : "border-transparent text-muted-foreground hover:border-border/30 hover:bg-foreground/5 hover:text-foreground"
    }`;

  return (
    <div className="relative flex h-full w-full min-h-0 overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-secondary/20" />

      <div
        className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between gap-2 pr-4 py-3 pointer-events-none pl-16 lg:pl-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
      >
        <div className="pointer-events-auto flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-border/30 bg-card/55 px-3 py-2 backdrop-blur-xl">
            <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">Board</span>
            <select
              value={activeBoard?.id || ""}
              onChange={(event) => {
                const nextBoard = boards.find((board) => board.id === event.target.value);
                if (!nextBoard) return;
                setActiveBoardId(nextBoard.id);
                setActiveLayerId(nextBoard.layers[0]?.id || null);
                clearSelection();
              }}
              className="bg-transparent text-sm text-foreground outline-none"
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id} className="bg-background text-foreground">
                  {board.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const nextBoard = createBoard(`Board ${boards.length + 1}`);
                pushHistory();
                setBoards((previous) => [...previous, nextBoard]);
                setActiveBoardId(nextBoard.id);
                setActiveLayerId(nextBoard.layers[0]?.id || null);
                clearSelection();
              }}
              className="rounded-lg border border-border/30 px-2 py-1 text-[11px] text-foreground hover:bg-foreground/5"
            >
              New
            </button>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 rounded-xl border border-border/25 bg-card/45 px-3 py-2 backdrop-blur-xl pointer-events-auto">
          <Lock className="h-3.5 w-3.5 text-emerald-400/80" />
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">Encrypted boards</span>
        </div>
      </div>

      {/* Toolbar is a child of the whiteboard pane: inset left/right off the
          pane box, never a vw fraction of the window, so it can never reach
          under the dashboard nav. Secondary controls collapse behind More
          below lg and wrap onto a second in-pane row above it. */}
      <div
        className="absolute left-3 right-3 z-40 mx-auto flex max-w-[1320px] flex-col gap-1.5"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 4rem)" }}
      >
        <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-[1.6rem] border border-border/30 bg-card/75 px-3 py-2 shadow-2xl backdrop-blur-2xl">
        <button onClick={() => setTool("select")} className={toolButton(tool === "select")} title="Select"><MousePointer className="h-4 w-4" /></button>
        <button onClick={() => setTool("pen")} className={toolButton(tool === "pen")} title="Pen"><Pencil className="h-4 w-4" /></button>
        <button onClick={() => setTool("text")} className={toolButton(tool === "text")} title="Text"><Type className="h-4 w-4" /></button>
        <button onClick={() => setTool("sticky")} className={toolButton(tool === "sticky")} title="Sticky"><span className="text-xs">Note</span></button>
        <button onClick={() => setTool("eraser")} className={toolButton(tool === "eraser")} title="Eraser"><Eraser className="h-4 w-4" /></button>
        <button onClick={() => setTool("pan")} className={toolButton(tool === "pan")} title="Pan"><Move className="h-4 w-4" /></button>
        <div className="relative">
          <button onClick={() => setSelectedShapeMenu((previous) => !previous)} className={toolButton(isShapeTool)} title="Shapes">
            <Square className="h-4 w-4" />
            <ChevronDown className="ml-1 inline h-3 w-3" />
          </button>
          {selectedShapeMenu && (
            <div className="absolute left-0 top-full mt-2 flex gap-1 rounded-2xl border border-border/30 bg-card/95 p-2 shadow-2xl backdrop-blur-xl">
              {SHAPE_TOOLS.map((shape) => (
                <button
                  key={shape.tool}
                  onClick={() => {
                    setTool(shape.tool);
                    setSelectedShapeMenu(false);
                  }}
                  className={toolButton(tool === shape.tool)}
                  title={shape.label}
                >
                  <shape.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => setTool("frame")} className={toolButton(tool === "frame")} title="Frame"><FrameIcon className="h-4 w-4" /></button>
        <button onClick={() => setTool("arrow")} className={toolButton(tool === "arrow")} title="Arrow (binds to objects)"><ArrowRight className="h-4 w-4" /></button>
        <button onClick={undo} className={toolButton(false)} title="Undo"><Undo2 className="h-4 w-4" /></button>
        <button onClick={redo} className={toolButton(false)} title="Redo"><Redo2 className="h-4 w-4" /></button>
          <button
            onClick={() => setMoreToolsOpen((previous) => !previous)}
            className={`${toolButton(moreToolsOpen)} lg:hidden`}
            aria-expanded={moreToolsOpen}
            title="More tools"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
        <div
          className={`${moreToolsOpen ? "flex" : "hidden"} lg:flex flex-wrap items-center justify-center gap-1.5 rounded-[1.6rem] border border-border/30 bg-card/75 px-3 py-2 shadow-2xl backdrop-blur-2xl`}
        >
        <button onClick={() => setTool("marker")} className={toolButton(tool === "marker")} title="Marker"><span className="text-xs">Marker</span></button>
        <button onClick={() => setTool("highlighter")} className={toolButton(tool === "highlighter")} title="Highlighter"><span className="text-xs">Highlight</span></button>
        <button onClick={() => setTool("laser")} className={toolButton(tool === "laser")} title="Laser"><span className="text-xs">Laser</span></button>
        <button onClick={() => createChartElement()} className={toolButton(false)} title="Insert sketch series"><span className="text-xs">Chart</span></button>
        <div className="relative">
          <button onClick={() => setExportMenuOpen((previous) => !previous)} className={toolButton(exportMenuOpen)} title="Export board">
            <Download className="h-4 w-4" />
          </button>
          {exportMenuOpen && (
            <div className="absolute right-0 top-11 z-30 w-40 rounded-2xl border border-border/20 bg-background/95 p-1.5 backdrop-blur-xl">
              {(["png", "svg", "json"] as const).map((format) => (
                <button
                  key={format}
                  onClick={() => void handleExport(format)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs text-foreground/80 hover:bg-foreground/5"
                >
                  <span>Export {format.toUpperCase()}</span>
                </button>
              ))}
              <button
                onClick={() => { setExportMenuOpen(false); importInputRef.current?.click(); }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-foreground/80 hover:bg-foreground/5"
              >
                <Upload className="h-3.5 w-3.5" /> Import JSON
              </button>
            </div>
          )}
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleImportBoard(file);
          }}
        />
        <button onClick={() => fileInputRef.current?.click()} className={toolButton(false)} title="Import PDF, image, spreadsheet"><ImageIcon className="h-4 w-4" /></button>
        <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.csv,.json,.txt,.xls,.xlsx" className="hidden" onChange={handleImportFiles} />
        <div className="mx-1 h-6 w-px bg-border/25" />

        <div className="flex items-center gap-1 rounded-xl border border-border/20 bg-background/40 px-2 py-1">
          {COLORS.slice(0, 8).map((swatch) => (
            <button
              key={swatch}
              onClick={() => setColor(swatch)}
              className={`h-5 w-5 rounded-full border ${color === swatch ? "border-foreground scale-110" : "border-border/30"}`}
              style={{ backgroundColor: swatch }}
              title={swatch}
            />
          ))}
          <input value={color} onChange={(event) => setColor(event.target.value)} type="color" className="h-6 w-6 rounded bg-transparent" />
        </div>

        {isShapeTool && (
          <div className="flex items-center gap-1 rounded-xl border border-border/20 bg-background/40 px-2 py-1">
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">Fill</span>
            <button onClick={() => setFillColor("transparent")} className={`rounded-lg px-2 py-1 text-[10px] ${fillColor === "transparent" ? "bg-foreground/10 text-foreground" : "text-muted-foreground"}`}>None</button>
            <input value={fillColor === "transparent" ? "#3b82f6" : fillColor} onChange={(event) => setFillColor(event.target.value)} type="color" className="h-6 w-6 rounded bg-transparent" />
          </div>
        )}

        <div className="flex items-center gap-1 rounded-xl border border-border/20 bg-background/40 px-2 py-1">
          <button onClick={() => setBrushSize((previous) => Math.max(1, previous - 1))} className="p-1 text-muted-foreground hover:text-foreground"><Minus className="h-3 w-3" /></button>
          <span className="min-w-6 text-center text-[11px] text-foreground">{brushSize}</span>
          <button onClick={() => setBrushSize((previous) => Math.min(36, previous + 1))} className="p-1 text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /></button>
        </div>

        <select
          value={activeBoard?.gridMode || "freeform"}
          onChange={(event) => updateActiveBoard((board) => ({ ...board, gridMode: event.target.value as GridMode }))}
          className="rounded-xl border border-border/20 bg-background/40 px-3 py-2 text-xs text-foreground outline-none"
        >
          <option value="freeform">Freeform grid</option>
          <option value="dots">Dot grid</option>
          <option value="square">Square grid</option>
        </select>

        <select
          value={activeBoard?.snapMode || "freeform"}
          onChange={(event) => updateActiveBoard((board) => ({ ...board, snapMode: event.target.value as GridMode }))}
          className="rounded-xl border border-border/20 bg-background/40 px-3 py-2 text-xs text-foreground outline-none"
        >
          <option value="freeform">Free snap</option>
          <option value="dots">Snap dots</option>
          <option value="square">Snap square</option>
        </select>

        <button
          onClick={() => updateActiveBoard((board) => ({ ...board, smartShapes: !board.smartShapes }))}
          className={`rounded-xl border px-3 py-2 text-xs ${activeBoard?.smartShapes ? "border-foreground/25 bg-foreground/10 text-foreground" : "border-border/25 text-muted-foreground"}`}
        >
          Smart shape
        </button>

        <button onClick={() => setBackgroundPanelOpen((previous) => !previous)} className={toolButton(backgroundPanelOpen)} title="Wallpapers">
          <Wallpaper className="h-4 w-4" />
        </button>

        <button
          onClick={() => {
            pushHistory();
            updateActiveBoard((board) => ({ ...board, elements: [] }));
            clearSelection();
          }}
          className="rounded-xl border border-transparent px-2.5 py-2 text-muted-foreground transition-colors hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
          title="Clear board"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        </div>
      </div>

      {backgroundPanelOpen && activeBoard && (
        <>
          <div
            className="absolute inset-0 z-30"
            onClick={() => setBackgroundPanelOpen(false)}
          />
          <div className="absolute top-[10.5rem] lg:top-[7.4rem] left-3 right-3 z-40 mx-auto max-h-[70%] overflow-y-auto w-auto max-w-[720px] rounded-[1.4rem] border border-border/30 bg-card/82 p-4 shadow-2xl backdrop-blur-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button onClick={() => updateActiveBoard((board) => ({ ...board, wallpaperMode: "dark" }))} className={`rounded-xl px-3 py-2 text-xs ${activeBoard.wallpaperMode === "dark" ? "bg-foreground/10 text-foreground" : "bg-background/40 text-muted-foreground"}`}>Dark board</button>
              <button onClick={() => updateActiveBoard((board) => ({ ...board, wallpaperMode: "current" }))} className={`rounded-xl px-3 py-2 text-xs ${activeBoard.wallpaperMode === "current" ? "bg-foreground/10 text-foreground" : "bg-background/40 text-muted-foreground"}`}>Current wallpaper</button>
              <button onClick={() => updateActiveBoard((board) => ({ ...board, wallpaperMode: "wallpaper" }))} className={`rounded-xl px-3 py-2 text-xs ${activeBoard.wallpaperMode === "wallpaper" ? "bg-foreground/10 text-foreground" : "bg-background/40 text-muted-foreground"}`}>Wallpaper library</button>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">Blur</span>
                <input type="range" min="0" max="24" value={activeBoard.wallpaperBlur} onChange={(event) => updateActiveBoard((board) => ({ ...board, wallpaperBlur: Number(event.target.value) }))} />
              </div>
              <button
                onClick={() => setBackgroundPanelOpen(false)}
                className="rounded-xl border border-border/20 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {WALLPAPERS.map((wallpaper) => (
                <button
                  key={wallpaper.key}
                  onClick={() => updateActiveBoard((board) => ({ ...board, wallpaperMode: "wallpaper", wallpaperKey: wallpaper.key }))}
                  className={`overflow-hidden rounded-2xl border-2 ${activeBoard.wallpaperKey === wallpaper.key && activeBoard.wallpaperMode === "wallpaper" ? "border-foreground/60" : "border-border/20"}`}
                >
                  <img src={wallpaper.src} alt={`${wallpaper.label} whiteboard wallpaper`} className="h-20 w-full object-cover" loading="lazy" />
                  <div className="bg-background/80 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{wallpaper.label}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {selectedElement && (
        <div className="absolute top-[10.5rem] lg:top-[7.4rem] left-3 right-3 lg:right-auto z-40 flex flex-wrap items-center gap-2 rounded-[1.25rem] border border-border/30 bg-card/78 px-4 py-3 shadow-2xl backdrop-blur-2xl">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/60">Selected</span>
          {selectedImage && (
            <>
              <span className="text-xs text-foreground">Image</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">Roundness</span>
              <input
                type="range"
                min="0"
                max="100"
                value={selectedImage.borderRadius || 0}
                onChange={(event) => updateSelectedElement((element) => ({ ...element, borderRadius: Number(event.target.value) }))}
              />
              <button onClick={() => updateSelectedElement((element) => ({ ...element, imgWidth: (element.imgWidth || 260) * 1.12, imgHeight: (element.imgHeight || 180) * 1.12 }))} className="rounded-lg border border-border/20 px-2 py-1 text-xs text-foreground">Bigger</button>
              <button onClick={() => updateSelectedElement((element) => ({ ...element, imgWidth: (element.imgWidth || 260) * 0.88, imgHeight: (element.imgHeight || 180) * 0.88 }))} className="rounded-lg border border-border/20 px-2 py-1 text-xs text-foreground">Smaller</button>
            </>
          )}
          {selectedTextElement && (
            <>
              <span className="text-xs text-foreground">{selectedTextElement.type === "sticky" ? "Sticky note" : "Text box"}</span>
              <select value={selectedTextElement.fontFamily || "Sans"} onChange={(event) => updateSelectedElement((element) => ({ ...element, fontFamily: event.target.value as FontFamilyKey }))} className="rounded-lg border border-border/20 bg-background/40 px-2 py-1 text-xs text-foreground outline-none">
                <option value="Sans">Sans</option>
                <option value="Serif">Serif</option>
                <option value="Mono">Mono</option>
              </select>
              <select value={selectedTextElement.fontWeight || "400"} onChange={(event) => updateSelectedElement((element) => ({ ...element, fontWeight: event.target.value as FontWeightKey }))} className="rounded-lg border border-border/20 bg-background/40 px-2 py-1 text-xs text-foreground outline-none">
                <option value="300">Light</option>
                <option value="400">Regular</option>
                <option value="500">Medium</option>
                <option value="700">Bold</option>
              </select>
              <button onClick={() => updateSelectedElement((element) => ({ ...element, fontSize: (element.fontSize || 18) + 2 }))} className="rounded-lg border border-border/20 px-2 py-1 text-xs text-foreground">A+</button>
              <button onClick={() => updateSelectedElement((element) => ({ ...element, fontSize: Math.max(10, (element.fontSize || 18) - 2) }))} className="rounded-lg border border-border/20 px-2 py-1 text-xs text-foreground">A-</button>
              {selectedTextElement.type === "sticky" && (
                <div className="flex items-center gap-1">
                  {NOTE_COLORS.map((noteColor) => (
                    <button key={noteColor} onClick={() => updateSelectedElement((element) => ({ ...element, noteColor }))} className="h-5 w-5 rounded-full border border-border/30" style={{ backgroundColor: noteColor }} />
                  ))}
                </div>
              )}
              <button onClick={() => startDraftEditor({ x: selectedTextElement.x || 0, y: selectedTextElement.y || 0 }, selectedTextElement.type === "sticky" ? "sticky" : "text", selectedTextElement)} className="rounded-lg border border-border/20 px-2 py-1 text-xs text-foreground">Edit</button>
            </>
          )}
          {selectedChart && (
            <>
              <span className="text-xs text-foreground">Sketch series</span>
              <input
                value={(selectedChart.series || []).join(", ")}
                onChange={(event) => {
                  const values = event.target.value
                    .split(/[,\s]+/)
                    .map((entry) => Number(entry))
                    .filter((entry) => Number.isFinite(entry))
                    .slice(0, 48);
                  updateSelectedElement((element) => ({ ...element, series: values }));
                }}
                placeholder="12, 18, 9, 24"
                className="w-52 rounded-lg border border-border/20 bg-background/40 px-2 py-1 text-xs text-foreground outline-none"
              />
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">Your numbers — no feed attached</span>
            </>
          )}
          <button onClick={deleteSelected} className="rounded-lg border border-destructive/20 px-2 py-1 text-xs text-destructive">Delete</button>
        </div>
      )}

      {layerPanelOpen && activeBoard && (
        <aside style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.5rem)" }} className="absolute left-3 right-3 lg:left-auto lg:bottom-auto lg:right-4 lg:top-[15rem] z-40 max-h-[46%] overflow-y-auto w-auto lg:w-72 rounded-[1.4rem] border border-border/30 bg-card/78 p-4 shadow-2xl backdrop-blur-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">Layers</p>
              <h2 className="text-sm font-light text-foreground">Topic stack</h2>
            </div>
            <button onClick={() => setLayerPanelOpen(false)} className="rounded-lg border border-border/20 px-2 py-1 text-xs text-muted-foreground">Hide</button>
          </div>
          <div className="space-y-2">
            {activeBoard.layers.map((layer, index) => (
              <div key={layer.id} className={`rounded-2xl border px-3 py-2 ${activeLayerId === layer.id ? "border-foreground/25 bg-foreground/8" : "border-border/20 bg-background/30"}`}>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => setActiveLayerId(layer.id)} className="text-left">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground/60">Topic {index + 1}</div>
                    <div className="text-sm text-foreground">{layer.name}</div>
                  </button>
                  <button
                    onClick={() => updateActiveBoard((board) => ({
                      ...board,
                      layers: board.layers.map((entry) => entry.id === layer.id ? { ...entry, visible: !entry.visible } : entry),
                    }))}
                    className={`rounded-lg px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${layer.visible ? "bg-foreground/10 text-foreground" : "bg-background/40 text-muted-foreground"}`}
                  >
                    {layer.visible ? "On" : "Off"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                const nextLayer = createLayer(`Topic ${activeBoard.layers.length + 1}`);
                pushHistory();
                updateActiveBoard((board) => ({ ...board, layers: [...board.layers, nextLayer] }));
                setActiveLayerId(nextLayer.id);
              }}
              className="rounded-xl border border-border/20 px-3 py-2 text-xs text-foreground"
            >
              Add layer
            </button>
            {activeLayer && (
              <input
                value={activeLayer.name}
                onChange={(event) => updateActiveBoard((board) => ({
                  ...board,
                  layers: board.layers.map((layer) => layer.id === activeLayer.id ? { ...layer, name: event.target.value } : layer),
                }))}
                className="flex-1 rounded-xl border border-border/20 bg-background/40 px-3 py-2 text-xs text-foreground outline-none"
                placeholder="Layer name"
              />
            )}
          </div>
        </aside>
      )}

      {!layerPanelOpen && (
        <button onClick={() => setLayerPanelOpen(true)} style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.5rem)" }} className="absolute right-4 lg:bottom-auto lg:top-[15rem] z-40 min-h-11 rounded-xl border border-border/30 bg-card/78 px-3 py-2 text-xs text-foreground backdrop-blur-xl">
          Show layers
        </button>
      )}

      <div style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }} className="absolute left-4 z-40 hidden lg:block rounded-2xl border border-border/25 bg-card/48 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55 backdrop-blur-xl">
        Scroll to pan · Ctrl/⌘ + wheel to zoom · Backspace = undo · Paste text/images onto the board
      </div>

      <div style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }} className="absolute right-4 z-40 flex items-center gap-2 rounded-2xl border border-border/25 bg-card/48 px-3 py-2 backdrop-blur-xl">
        <button onClick={() => setZoom((previous) => clamp(previous * 0.85, 0.2, 4))} className="p-1 text-muted-foreground hover:text-foreground"><Minus className="h-3.5 w-3.5" /></button>
        <span className="w-12 text-center text-[10px] uppercase tracking-[0.18em] text-foreground">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((previous) => clamp(previous * 1.15, 0.2, 4))} className="p-1 text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
        <button onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }} className="rounded-lg px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">Reset</button>
      </div>

      <div ref={containerRef} className="relative z-20 h-full w-full" style={{ cursor: tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair" }}>
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => handlePointerUp()}
        />
        {exportNotice && (
          <div
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-border/25 bg-background/90 px-4 py-2 text-xs text-foreground/80 backdrop-blur-xl"
          >
            {exportNotice}
          </div>
        )}
      </div>

      {draftEditor && boardScreenPoint && (
        <div className="absolute z-[70] w-[min(90vw,360px)] rounded-[1.35rem] border border-border/30 bg-card/92 p-4 shadow-2xl backdrop-blur-2xl" style={{ left: boardScreenPoint.x + 14, top: boardScreenPoint.y + 14 }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">{draftEditor.kind === "sticky" ? "Sticky note" : "Text box"}</div>
              <div className="text-sm font-light text-foreground">Full font control</div>
            </div>
            <button onClick={() => setDraftEditor(null)} className="rounded-lg border border-border/20 px-2 py-1 text-xs text-muted-foreground">Close</button>
          </div>
          <Textarea
            autoFocus
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                submitDraftEditor();
              }
            }}
            placeholder={draftEditor.kind === "sticky" ? "Paste or type notes…" : "Type on the board…"}
            className="min-h-[130px] resize-none rounded-2xl border-border/30 bg-background/50 text-foreground"
            style={{
              fontSize: draftFontSize,
              fontFamily: FONT_FAMILIES[draftFontFamily],
              fontWeight: Number(draftFontWeight),
              color: draftEditor.kind === "sticky" ? "#111827" : color,
            }}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select value={draftFontFamily} onChange={(event) => setDraftFontFamily(event.target.value as FontFamilyKey)} className="rounded-xl border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground outline-none">
              <option value="Sans">Sans</option>
              <option value="Serif">Serif</option>
              <option value="Mono">Mono</option>
            </select>
            <select value={draftFontWeight} onChange={(event) => setDraftFontWeight(event.target.value as FontWeightKey)} className="rounded-xl border border-border/20 bg-background/50 px-3 py-2 text-xs text-foreground outline-none">
              <option value="300">Light</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="700">Bold</option>
            </select>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => setDraftFontSize((previous) => Math.max(10, previous - 2))} className="rounded-lg border border-border/20 px-2 py-1 text-xs text-foreground">A-</button>
            <span className="text-xs text-foreground">{draftFontSize}px</span>
            <button onClick={() => setDraftFontSize((previous) => Math.min(96, previous + 2))} className="rounded-lg border border-border/20 px-2 py-1 text-xs text-foreground">A+</button>
            {draftEditor.kind === "sticky" && (
              <div className="ml-auto flex items-center gap-1">
                {NOTE_COLORS.map((noteColor) => (
                  <button key={noteColor} onClick={() => setDraftStickyColor(noteColor)} className={`h-6 w-6 rounded-full border ${draftStickyColor === noteColor ? "border-foreground" : "border-border/30"}`} style={{ backgroundColor: noteColor }} />
                ))}
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/55">Cmd/Ctrl + Enter to place</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setDraftEditor(null)} className="rounded-xl border border-border/20 px-3 py-2 text-xs text-muted-foreground">Cancel</button>
              <button onClick={submitDraftEditor} className="rounded-xl bg-primary px-3 py-2 text-xs text-primary-foreground">Place</button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center opacity-[0.028]">
        <div className="text-[11rem] font-extralight tracking-[0.35em] text-foreground">A</div>
      </div>
      <div className="pointer-events-none absolute right-4 top-5 z-10 text-[9px] uppercase tracking-[0.28em] text-muted-foreground/25">◈ ASHERIN INTELLIGENCE PLATFORM</div>
    </div>
  );
};

export default Whiteboard;
