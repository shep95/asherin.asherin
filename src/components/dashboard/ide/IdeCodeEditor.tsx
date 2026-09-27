import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { X, Copy, Check, Search, WrapText, AlignLeft } from "lucide-react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { IdeFile } from "./IdeFileTree";
import { getLanguage } from "./IdeFileTree";
import { validateCode, attachInlineEditFeatures } from "@/lib/ide";
import { emitPull } from "@/lib/connect/emitPull";

interface HoverFetcher {
  (args: { symbol: string; file_path: string; language: string; line_text: string; surrounding: string }): Promise<string>;
}

interface Props {
  openFiles: IdeFile[];
  activeFileId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onContentChange: (id: string, content: string) => void;
  /** Optional RAG-grounded AI hover provider. When supplied, Monaco hover shows grounded intel. */
  onHover?: HoverFetcher;
  /** False in Chat mode: ⌘K and ghost completions must not touch the buffer. */
  canWrite?: boolean;
  /** Surface hook so a refused write is said out loud, not swallowed. */
  onWriteBlocked?: (reason: string) => void;
}

// Map our friendly language ids to Monaco's expected ids.
const toMonacoLang = (lang: string): string => {
  const m: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    py: "python", rb: "ruby", sh: "shell", yml: "yaml", md: "markdown",
    plaintext: "plaintext",
  };
  return m[lang] ?? lang;
};

// Custom monochrome Monaco theme matching the Aureon dark glass palette.
// Registered once on first mount.
let themeRegistered = false;
function registerAureonTheme(monaco: Monaco) {
  if (themeRegistered) return;
  themeRegistered = true;
  monaco.editor.defineTheme("aureon-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "d4d4d4" },
      { token: "comment", foreground: "6b7280", fontStyle: "italic" },
      { token: "keyword", foreground: "c4b5fd" },
      { token: "string", foreground: "a3a3a3" },
      { token: "number", foreground: "e5e5e5" },
      { token: "type", foreground: "d1d5db" },
      { token: "function", foreground: "f3f4f6" },
      { token: "variable", foreground: "d4d4d4" },
    ],
    colors: {
      "editor.background": "#00000000",
      "editor.foreground": "#e5e5e5",
      "editorLineNumber.foreground": "#4b5563",
      "editorLineNumber.activeForeground": "#9ca3af",
      "editor.lineHighlightBackground": "#ffffff08",
      "editor.selectionBackground": "#ffffff15",
      "editor.inactiveSelectionBackground": "#ffffff0a",
      "editorCursor.foreground": "#ffffff",
      "editorWidget.background": "#0a0a0acc",
      "editorWidget.border": "#ffffff14",
      "editorSuggestWidget.background": "#0a0a0aee",
      "editorSuggestWidget.border": "#ffffff14",
      "editorSuggestWidget.selectedBackground": "#ffffff14",
      "editorHoverWidget.background": "#0a0a0aee",
      "editorBracketMatch.background": "#ffffff10",
      "editorBracketMatch.border": "#ffffff30",
      "scrollbarSlider.background": "#ffffff10",
      "scrollbarSlider.hoverBackground": "#ffffff20",
      "scrollbarSlider.activeBackground": "#ffffff30",
      "minimap.background": "#00000000",
    },
  });
}

const IdeCodeEditor = ({ openFiles, activeFileId, onSelectTab, onCloseTab, onContentChange, onHover, canWrite = true, onWriteBlocked }: Props) => {
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [cursor, setCursor] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const activeFile = useMemo(() => openFiles.find(f => f.id === activeFileId), [openFiles, activeFileId]);
  const content = activeFile?.content ?? "";
  const language = activeFile ? getLanguage(activeFile.name) : "plaintext";
  const monacoLang = toMonacoLang(language);

  // Run our shared validator and convert issues into Monaco markers (red squiggles).
  useEffect(() => {
    if (!activeFile || !editorRef.current || !monacoRef.current) return;
    const monaco = monacoRef.current;
    const model = editorRef.current.getModel();
    if (!model) return;
    try {
      const result = validateCode(content, language);
      const markers: MonacoEditor.IMarkerData[] = (result.issues ?? []).map((i) => ({
        severity:
          i.severity === "error" ? monaco.MarkerSeverity.Error :
          i.severity === "warning" ? monaco.MarkerSeverity.Warning :
          monaco.MarkerSeverity.Info,
        message: i.message ?? "Validator finding",
        startLineNumber: i.line ?? 1,
        endLineNumber: i.line ?? 1,
        startColumn: 1,
        endColumn: 1000,
      }));
      monaco.editor.setModelMarkers(model, "aureon-zanoem", markers);
    } catch {
      monaco.editor.setModelMarkers(model, "aureon-zanoem", []);
    }
  }, [content, language, activeFile]);

  // Refs hold latest props so the long-lived Monaco hover provider always
  // sees the active file / language / fetcher without re-registering.
  const onHoverRef = useRef<HoverFetcher | undefined>(onHover);
  const activeFileRef = useRef(activeFile);
  const languageRef = useRef(language);
  const canWriteRef = useRef(canWrite);
  const onWriteBlockedRef = useRef(onWriteBlocked);
  useEffect(() => { canWriteRef.current = canWrite; }, [canWrite]);
  useEffect(() => { onWriteBlockedRef.current = onWriteBlocked; }, [onWriteBlocked]);
  useEffect(() => { onHoverRef.current = onHover; }, [onHover]);
  useEffect(() => { activeFileRef.current = activeFile; }, [activeFile]);
  useEffect(() => { languageRef.current = language; }, [language]);

  // Per-language registration guard so we only attach one hover provider per Monaco lang.
  const hoverRegistered = useRef<Set<string>>(new Set());

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerAureonTheme(monaco);
    monaco.editor.setTheme("aureon-dark");
    editor.onDidChangeCursorPosition((e) => {
      setCursor({ line: e.position.lineNumber, col: e.position.column });
    });
    // Cursor / Claude-Code moves: ⌘K inline edit, ⌘L send-to-chat, Tab ghost completions.
    const detach = attachInlineEditFeatures(editor, monaco, {
      canWrite: () => canWriteRef.current,
      onWriteBlocked: (reason) => onWriteBlockedRef.current?.(reason),
      onInlineEditApplied: ({ path }) => {
        // Quote is the filename only — never the edited body, however large.
        void emitPull({
          organ: "ide", capability: "inline-edit", fromSurface: "ide",
          status: "ok", quote: path.split("/").pop() ?? path,
        });
      },
      getFile: () => {
        const f = activeFileRef.current;
        return f ? { id: f.id, name: f.name, language: languageRef.current, content: f.content } : null;
      },
      getByok: () => {
        try {
          const cached = localStorage.getItem("aureon_byok_active");
          const parsed = cached ? JSON.parse(cached) : null;
          if (parsed?.provider && parsed.provider !== "default" && parsed?.model) {
            return { provider: parsed.provider, model: parsed.model };
          }
        } catch { /* ignore */ }
        // No saved selection → let the backend resolve the user's own key
        // instead of forcing a provider they may have removed.
        return null;

      },
    });
    (editor as any).__aureonDetach = detach;
    editor.onDidDispose(() => { try { detach(); } catch { /* noop */ } });
  }, []);

  // Register one AUREON RAG-grounded hover provider per Monaco language.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco || !monacoLang) return;
    if (hoverRegistered.current.has(monacoLang)) return;
    hoverRegistered.current.add(monacoLang);

    monaco.languages.registerHoverProvider(monacoLang, {
      provideHover: async (model, position) => {
        const fetcher = onHoverRef.current;
        if (!fetcher) return null;
        const word = model.getWordAtPosition(position);
        if (!word || word.word.length < 2) return null;
        const file = activeFileRef.current;
        if (!file) return null;
        // Only hover on the currently active editor model
        if (model.uri.path.replace(/^\//, "") !== file.id) return null;

        const totalLines = model.getLineCount();
        const startLine = Math.max(1, position.lineNumber - 12);
        const endLine = Math.min(totalLines, position.lineNumber + 12);
        const surrounding = model.getValueInRange({
          startLineNumber: startLine, startColumn: 1,
          endLineNumber: endLine, endColumn: model.getLineMaxColumn(endLine),
        });
        const lineText = model.getLineContent(position.lineNumber);

        try {
          const md = await fetcher({
            symbol: word.word,
            file_path: file.name,
            language: languageRef.current,
            line_text: lineText,
            surrounding,
          });
          if (!md) return null;
          return {
            range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
            contents: [{ value: `**AUREON CODE**\n\n${md}` }],
          };
        } catch {
          return null;
        }
      },
    });
  }, [monacoLang]);

  const handleCopyAll = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleFind = () => editorRef.current?.getAction("actions.find")?.run();

  if (openFiles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background/50 h-full">
        <div className="text-center space-y-2 animate-fade-in">
          <p className="text-sm font-extralight text-muted-foreground/40">No files open</p>
          <p className="text-[10px] font-light text-muted-foreground/30">Select a file from the explorer or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full">
      {/* Tabs */}
      <div className="flex items-center border-b border-border/20 bg-card/20 overflow-x-auto scrollbar-none">
        <div className="flex items-center min-w-0 overflow-x-auto scrollbar-none">
          {openFiles.map(f => (
            <button
              key={f.id}
              onClick={() => onSelectTab(f.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-light border-r border-border/10 whitespace-nowrap transition-colors group shrink-0 ${
                f.id === activeFileId ? "bg-background text-foreground border-b-2 border-b-accent" : "text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5"
              }`}
            >
              <span className="truncate max-w-[100px] sm:max-w-[120px]">{f.name}</span>
              <X
                onClick={(e) => { e.stopPropagation(); onCloseTab(f.id); }}
                className="h-3 w-3 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
              />
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1 px-2 shrink-0">
          <button onClick={() => setWordWrap(w => !w)} className={`p-1 rounded transition-colors ${wordWrap ? "text-accent" : "text-muted-foreground/40 hover:text-foreground"}`} title="Word Wrap">
            <WrapText className="h-3 w-3" />
          </button>
          <button onClick={() => setShowMinimap(m => !m)} className={`p-1 rounded transition-colors hidden md:block ${showMinimap ? "text-accent" : "text-muted-foreground/40 hover:text-foreground"}`} title="Minimap">
            <AlignLeft className="h-3 w-3" />
          </button>
          <button onClick={handleFind} className="p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors" title="Find (Ctrl+F)">
            <Search className="h-3 w-3" />
          </button>
          <button onClick={handleCopyAll} className="p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors" title="Copy all">
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Monaco editor */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          path={activeFile?.id}
          language={monacoLang}
          value={content}
          onMount={handleMount}
          onChange={(v) => activeFile && onContentChange(activeFile.id, v ?? "")}
          theme="aureon-dark"
          options={{
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            minimap: { enabled: showMinimap },
            wordWrap: wordWrap ? "on" : "off",
            tabSize: 2,
            insertSpaces: true,
            scrollBeyondLastLine: false,
            renderLineHighlight: "line",
            smoothScrolling: true,
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            bracketPairColorization: { enabled: true },
            guides: { bracketPairs: true, indentation: true },
            automaticLayout: true,
            padding: { top: 12, bottom: 12 },
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
            stickyScroll: { enabled: true },
            quickSuggestions: { other: true, comments: false, strings: false },
            suggestOnTriggerCharacters: true,
            formatOnPaste: false,
            formatOnType: false,
          }}
          loading={<div className="h-full flex items-center justify-center text-[10px] text-muted-foreground/40">Loading editor…</div>}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-card/20 border-t border-border/10 text-[9px] font-light text-muted-foreground/40">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="shrink-0">{language}</span>
          <span className="hidden sm:inline">Ln {cursor.line}, Col {cursor.col}</span>
          <span className="hidden sm:inline">UTF-8</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span>{content.split("\n").length} lines</span>
          <span className="hidden sm:inline">{content.length} chars</span>
        </div>
      </div>
    </div>
  );
};

export default IdeCodeEditor;
