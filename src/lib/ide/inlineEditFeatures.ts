// ============================================================
// Cursor / Claude-Code-style IDE features (shared)
// ------------------------------------------------------------
// NARRATIVE:
//   Aureon + Asher IDEs already have chat, agents, diagnostics,
//   checkpoints — but the three signature moves that make Cursor
//   and Claude Code feel "alive" were missing:
//
//     1. Cmd/Ctrl+K  — inline edit selection with a natural-
//        language instruction, then patch-in-place.
//     2. Tab ghost   — inline AI completions that stream in as
//        muted ghost text; Tab accepts them.
//     3. Cmd/Ctrl+L  — beam the current selection (or file) to
//        the chat panel as an @-reference.
//
// FLAWS FOUND IN THE OLD FLOW (pre-fix):
//   - No standard hotkeys → users had to open a side panel
//     and paste code manually.
//   - No inline completion provider → editor felt "dead".
//   - No selection → chat bridge → context loss on every ask.
//   - Cmd+K, if we used window.prompt, blocks the render loop
//     and looks nothing like the rest of the glass UI.
//
// NEW NARRATIVE (implemented below):
//   - Single `attachInlineEditFeatures(editor, monaco, opts)` call
//     from any Monaco mount installs all three moves + owns the
//     glass floating input widget for Cmd+K.
//   - Ghost text is debounced 450 ms and cancelled on typing.
//   - Cmd+L emits a `ide:add-to-chat` window event; each IDE's
//     chat panel listens and prepends the snippet.
//   - Returns a disposer so React `useEffect` can clean up.
// ============================================================

import type { editor as MonacoEditor, IDisposable, Position, Range } from "monaco-editor";
import type { Monaco } from "@monaco-editor/react";
import { callAsherCodeAi, extractCodeBlock } from "@/lib/asherCode/aiClient";

export interface InlineEditFile {
  id?: string;
  name: string;
  language?: string;
  content?: string;
}

export interface InlineEditOptions {
  getFile: () => InlineEditFile | null;
  /** Return {provider, model} for BYOK routing. */
  getByok?: () => { provider: string; model: string } | null;
  /** Enable inline ghost-text completions (default true). */
  ghostCompletions?: boolean;
  /** Debounce for ghost text in ms (default 450). */
  ghostDebounceMs?: number;
  /** Called when the user accepts an inline edit (Cmd+K). */
  onInlineEditApplied?: (info: { path: string; instruction: string }) => void;
  /**
   * Write gate. Chat mode answers only — the model may never mutate the
   * buffer behind the operator's back. When this returns false, ⌘K refuses
   * and ghost completions stay silent instead of failing quietly.
   */
  canWrite?: () => boolean;
  /** Told why a write was refused, so the surface can say it out loud. */
  onWriteBlocked?: (reason: string) => void;
  /** Called when a bridge-to-chat event is fired. */
  onSendToChat?: (payload: SendToChatPayload) => void;
}

export interface SendToChatPayload {
  path: string;
  language: string;
  snippet: string;
  startLine: number;
  endLine: number;
}

/* ── Cmd+L → chat bridge event ─────────────────────────── */
export const IDE_ADD_TO_CHAT_EVENT = "ide:add-to-chat";

export function onAddToChat(handler: (p: SendToChatPayload) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent<SendToChatPayload>).detail);
  window.addEventListener(IDE_ADD_TO_CHAT_EVENT, fn);
  return () => window.removeEventListener(IDE_ADD_TO_CHAT_EVENT, fn);
}

/* ── Public: install all Cursor-style features ─────────── */
export function attachInlineEditFeatures(
  editor: MonacoEditor.IStandaloneCodeEditor,
  monaco: Monaco,
  opts: InlineEditOptions,
): () => void {
  const disposers: Array<() => void> = [];

  // 1. Cmd/Ctrl+K → inline edit widget
  disposers.push(installInlineEditWidget(editor, monaco, opts));

  // 2. Cmd/Ctrl+L → send selection to chat
  disposers.push(installAddToChat(editor, monaco, opts));

  // 3. Tab ghost completions
  if (opts.ghostCompletions !== false) {
    disposers.push(installGhostCompletions(editor, monaco, opts));
  }

  return () => { for (const d of disposers) { try { d(); } catch { /* noop */ } } };
}

/* ── 1. Cmd+K inline edit ──────────────────────────────── */
function installInlineEditWidget(
  editor: MonacoEditor.IStandaloneCodeEditor,
  monaco: Monaco,
  opts: InlineEditOptions,
): () => void {
  let widget: MonacoEditor.IContentWidget | null = null;
  let inputEl: HTMLInputElement | null = null;
  let overlayEl: HTMLDivElement | null = null;
  let mounted = false;

  const close = () => {
    if (widget) { try { editor.removeContentWidget(widget); } catch { /* noop */ } widget = null; }
    inputEl = null; overlayEl = null; mounted = false;
    editor.focus();
  };

  const openAt = (pos: Position) => {
    if (mounted) return;
    mounted = true;

    overlayEl = document.createElement("div");
    overlayEl.className = "aureon-inline-edit";
    overlayEl.style.cssText = [
      "min-width:340px","max-width:520px","padding:8px 10px",
      "background:rgba(10,10,10,0.92)","backdrop-filter:blur(12px)",
      "border:1px solid rgba(255,255,255,0.14)","border-radius:8px",
      "box-shadow:0 20px 60px rgba(0,0,0,0.6)","display:flex","gap:8px","align-items:center",
    ].join(";");
    const badge = document.createElement("span");
    badge.textContent = "⌘K EDIT";
    badge.style.cssText = "font:10px ui-monospace,monospace;letter-spacing:.2em;color:#9ca3af;padding-right:8px;border-right:1px solid rgba(255,255,255,.1)";
    overlayEl.appendChild(badge);
    inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.placeholder = "Describe the change…";
    inputEl.style.cssText = "flex:1;background:transparent;border:0;outline:0;color:#e5e5e5;font:13px ui-sans-serif,system-ui;min-width:0";
    overlayEl.appendChild(inputEl);
    const hint = document.createElement("span");
    hint.textContent = "Enter · Esc";
    hint.style.cssText = "font:10px ui-monospace,monospace;color:#6b7280;white-space:nowrap";
    overlayEl.appendChild(hint);

    widget = {
      getId: () => "aureon.inlineEdit",
      getDomNode: () => overlayEl!,
      getPosition: () => ({
        position: pos,
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW, monaco.editor.ContentWidgetPositionPreference.ABOVE],
      }),
    };
    editor.addContentWidget(widget);
    setTimeout(() => inputEl?.focus(), 0);

    inputEl.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Enter") return;
      e.preventDefault();
      const instruction = inputEl!.value.trim();
      if (!instruction) return;
      await applyInlineEdit(editor, monaco, opts, instruction, () => {
        inputEl!.placeholder = "Applying…"; inputEl!.disabled = true;
      });
      close();
    });
  };

  const action = editor.addAction({
    id: "aureon.inlineEdit",
    label: "asherin: inline edit (⌘K)",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK],
    contextMenuGroupId: "1_modification",
    contextMenuOrder: 0,
    run: (ed) => {
      if (opts.canWrite && !opts.canWrite()) {
        opts.onWriteBlocked?.("inline edit needs Agent mode — Chat mode answers only.");
        return;
      }
      const pos = ed.getPosition();
      if (!pos) return;
      // Ensure some selection exists; if none, select current line.
      const sel = ed.getSelection();
      if (!sel || sel.isEmpty()) {
        const line = pos.lineNumber;
        const model = ed.getModel();
        if (model) {
          const end = model.getLineMaxColumn(line);
          ed.setSelection(new monaco.Range(line, 1, line, end));
        }
      }
      openAt(pos);
    },
  });
  return () => { close(); try { action.dispose(); } catch { /* noop */ } };
}

async function applyInlineEdit(
  editor: MonacoEditor.IStandaloneCodeEditor,
  monaco: Monaco,
  opts: InlineEditOptions,
  instruction: string,
  onStart: () => void,
) {
  const model = editor.getModel();
  const sel = editor.getSelection();
  const file = opts.getFile();
  if (!model || !sel || !file) return;
  const selectedText = model.getValueInRange(sel);
  onStart();
  try {
    const before = model.getValueInRange(new monaco.Range(1, 1, sel.startLineNumber, sel.startColumn));
    const after = model.getValueInRange(new monaco.Range(
      sel.endLineNumber, sel.endColumn,
      model.getLineCount(), model.getLineMaxColumn(model.getLineCount()),
    ));
    const res = await callAsherCodeAi({
      mode: "inline",
      byok: opts.getByok?.() ?? undefined,
      before, after, code: selectedText,
      path: file.name,
      language: file.language,
      instruction,
    });
    const replacement = extractCodeBlock(res.reply || "").trim();
    if (!replacement) return;
    editor.executeEdits("aureon.inlineEdit", [{
      range: sel,
      text: replacement,
      forceMoveMarkers: true,
    }]);
    opts.onInlineEditApplied?.({ path: file.name, instruction });
  } catch (e) {
    // Surface via console; the caller UI already closed.
    console.warn("[inlineEdit]", e);
  }
}

/* ── 2. Cmd+L send-to-chat ─────────────────────────────── */
function installAddToChat(
  editor: MonacoEditor.IStandaloneCodeEditor,
  monaco: Monaco,
  opts: InlineEditOptions,
): () => void {
  const action = editor.addAction({
    id: "aureon.addToChat",
    label: "asherin: add selection to chat (⌘L)",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL],
    contextMenuGroupId: "9_cutcopypaste",
    contextMenuOrder: 5,
    run: (ed) => {
      const model = ed.getModel(); const sel = ed.getSelection(); const file = opts.getFile();
      if (!model || !file) return;
      const range = sel && !sel.isEmpty()
        ? sel
        : new monaco.Range(1, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount()));
      const snippet = model.getValueInRange(range);
      const payload: SendToChatPayload = {
        path: file.name,
        language: file.language || "plaintext",
        snippet,
        startLine: range.startLineNumber,
        endLine: range.endLineNumber,
      };
      window.dispatchEvent(new CustomEvent(IDE_ADD_TO_CHAT_EVENT, { detail: payload }));
      opts.onSendToChat?.(payload);
    },
  });
  return () => { try { action.dispose(); } catch { /* noop */ } };
}

/* ── 3. Tab ghost completions ──────────────────────────── */
function installGhostCompletions(
  editor: MonacoEditor.IStandaloneCodeEditor,
  monaco: Monaco,
  opts: InlineEditOptions,
): () => void {
  const debounce = Math.max(150, opts.ghostDebounceMs ?? 450);
  let inflight: AbortController | null = null;
  let cache = new Map<string, string>();
  // Per-language guard so we only register once.
  const registered = new Set<string>();

  const provider = {
    async provideInlineCompletions(model: MonacoEditor.ITextModel, position: Position) {
      // Chat mode is read-only: no model text may enter the buffer.
      if (opts.canWrite && !opts.canWrite()) return { items: [] };
      const file = opts.getFile();
      if (!file) return { items: [] };
      // Only fire on active file
      if (model.uri.path.replace(/^\//, "") !== (file.id || file.name)) return { items: [] };
      const line = model.getLineContent(position.lineNumber);
      // Skip if the caret isn't at end of a meaningful line
      if (position.column <= line.length) return { items: [] };
      const before = model.getValueInRange(new monaco.Range(
        Math.max(1, position.lineNumber - 30), 1,
        position.lineNumber, position.column,
      ));
      const cacheKey = `${file.name}::${before.slice(-400)}`;
      if (cache.has(cacheKey)) {
        return { items: [{ insertText: cache.get(cacheKey)!, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }] };
      }
      // Debounce via sleep+abort
      inflight?.abort();
      const ctrl = new AbortController(); inflight = ctrl;
      try { await new Promise((r, j) => { const t = setTimeout(r, debounce); ctrl.signal.addEventListener("abort", () => { clearTimeout(t); j(new Error("aborted")); }); }); }
      catch { return { items: [] }; }

      try {
        const res = await callAsherCodeAi({
          mode: "inline",
          byok: opts.getByok?.() ?? undefined,
          before,
          after: "",
          code: "",
          path: file.name,
          language: file.language,
          instruction: "Continue the code at the cursor. Return ONLY the new code that comes next — no explanation, no fences, no repeats of prior lines. Keep it under 6 lines.",
        });
        let text = (res.reply || "").trim();
        // Strip fences if the model ignored the instruction
        text = extractCodeBlock(text);
        if (!text) return { items: [] };
        // Prevent runaway multi-page suggestions
        const lines = text.split("\n").slice(0, 6);
        text = lines.join("\n");
        cache.set(cacheKey, text);
        if (cache.size > 60) { const first = cache.keys().next().value; if (first) cache.delete(first); }
        return { items: [{ insertText: text, range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column) }] };
      } catch {
        return { items: [] };
      }
    },
    freeInlineCompletions() { /* noop */ },
  };

  const disposers: IDisposable[] = [];
  const register = (lang: string) => {
    if (!lang || registered.has(lang)) return;
    registered.add(lang);
    disposers.push(monaco.languages.registerInlineCompletionsProvider(lang, provider as any));
  };

  const langs = ["typescript","javascript","tsx","jsx","python","html","css","json","markdown","shell","yaml","sql","go","rust","java","c","cpp","php","ruby","plaintext"];
  langs.forEach(register);

  return () => { disposers.forEach(d => { try { d.dispose(); } catch { /* noop */ } }); inflight?.abort(); cache.clear(); };
}
