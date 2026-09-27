import { useState, useEffect, useCallback, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import { Send, Square, Bug, Zap, TestTubes, FileText, Link, Search, BarChart3, Code, Lock, X, WifiOff, Paperclip, Mic, ClipboardPaste, FileUp, Image as ImageLucide, Video, FileIcon, Files } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { saveDraft, getDraft, deleteDraft } from "@/lib/messageQueue";
import VoiceRecordingOrb from "./VoiceRecordingOrb";
import { classifyMessage, buildRoutingHint, detectLegalSpeechAct } from "@/lib/adaptiveIntent";
import { expandPromptToLegal } from "@/lib/legalAdvisor";
import { emitPull } from "@/lib/connect/emitPull";
import { setModelPromptOverride } from "@/lib/promptOverrideMap";

import type { FileAttachment } from "./types";

const LONG_PASTE_THRESHOLD = 500; // chars

type InputIntent = "text" | "code" | "url" | "image" | "file";

export interface AdaptiveInputBarHandle {
  insertText: (text: string) => void;
}

interface AdaptiveInputBarProps {
  onSendMessage: (content: string, attachments?: FileAttachment[]) => void;
  onStop?: () => void;
  onQuickAction?: (action: string, content: string) => void;
  isStreaming: boolean;
  disabled?: boolean;
  conversationId?: string;
}

function detectIntent(text: string): InputIntent {
  const trimmed = text.trim();
  // URL detection
  if (/^https?:\/\/\S+$/i.test(trimmed)) return "url";
  // Code detection (multi-line with brackets/semicolons or language markers)
  if (
    (trimmed.includes("\n") && (trimmed.includes("{") || trimmed.includes("=>") || trimmed.includes("import ") || trimmed.includes("def ") || trimmed.includes("function "))) ||
    trimmed.startsWith("```")
  ) return "code";
  return "text";
}

const quickActions: Record<InputIntent, { id: string; icon: React.ElementType; label: string }[]> = {
  text: [],
  code: [
    { id: "debug", icon: Bug, label: "Debug" },
    { id: "explain", icon: FileText, label: "Explain" },
    { id: "optimize", icon: Zap, label: "Optimize" },
    { id: "test", icon: TestTubes, label: "Add Tests" },
  ],
  url: [
    { id: "summarize", icon: FileText, label: "Summarize" },
    { id: "fact-check", icon: Search, label: "Fact Check" },
    { id: "extract", icon: BarChart3, label: "Extract Data" },
  ],
  image: [
    { id: "describe", icon: FileText, label: "Describe" },
    { id: "extract-text", icon: FileText, label: "Extract Text" },
    { id: "analyze", icon: Search, label: "Analyze" },
  ],
  file: [
    { id: "summarize", icon: FileText, label: "Summarize" },
    { id: "extract", icon: BarChart3, label: "Key Points" },
  ],
};

const AdaptiveInputBar = forwardRef<AdaptiveInputBarHandle, AdaptiveInputBarProps>(({ onSendMessage, onStop, onQuickAction, isStreaming, disabled, conversationId }, ref) => {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [longPasteText, setLongPasteText] = useState<string | null>(null);
  const onAttachmentsChange = setAttachments;
  const onChange = setValue;

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => setValue(prev => prev + text),
  }), []);
  const [intent, setIntent] = useState<InputIntent>("text");
  const [draftSaved, setDraftSaved] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isMobile, setIsMobile] = useState(() =>
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );
  useEffect(() => {
    const onResize = () => setIsMobile(
      /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      window.innerWidth < 768
    );
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [btnShape, setBtnShape] = useState(() => localStorage.getItem("aureon_send_btn_shape") || "circle");
  useEffect(() => {
    const handler = () => {
      setBtnShape(localStorage.getItem("aureon_send_btn_shape") || "circle");
    };
    window.addEventListener("aureon-border-color-change", handler);
    return () => window.removeEventListener("aureon-border-color-change", handler);
  }, []);

  useEffect(() => {
    setIntent(detectIntent(value));
  }, [value]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 128) + "px";
  }, [value]);

  // Online/offline tracking
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Load draft on mount / conversation change
  useEffect(() => {
    const key = conversationId || "global";
    getDraft(key).then(draft => {
      if (draft && draft.content && !value) {
        onChange(draft.content);
        setDraftSaved(`Restored from ${new Date(draft.updatedAt).toLocaleTimeString()}`);
        setTimeout(() => setDraftSaved(null), 3000);
      }
    }).catch(() => {});
  }, [conversationId]);

  // Auto-save draft every 500ms
  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    if (!value.trim()) {
      setDraftSaved(null);
      return;
    }
    draftTimerRef.current = setTimeout(() => {
      const key = conversationId || "global";
      saveDraft({ id: key, content: value, updatedAt: Date.now() }).then(() => {
        setDraftSaved("Draft saved");
        setTimeout(() => setDraftSaved(null), 2000);
      }).catch(() => {});
    }, 500);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [value, conversationId]);

  // Clear draft on send
  const handleSend = () => {
    if (!value.trim() && attachments.length === 0) return;
    const key = conversationId || "global";
    deleteDraft(key).catch(() => {});
    setDraftSaved(null);
    // Per-message adaptation. The visible/stored user message stays raw; only the
    // MODEL payload carries the directive + routing hint, so the transcript never
    // echoes prompt scaffolding back at the operator.
    const raw = value.trim();
    const send = classifyMessage(raw);
    let outbound = raw;
    const hint = buildRoutingHint(send);
    if (hint) outbound = `${hint}\n\n${outbound}`;

    // Legal organ arms itself off the speech-act of THIS message — no chip, no
    // stored mode. It stands down on the next turn simply by not matching.
    const legal = detectLegalSpeechAct(raw);
    if (legal.arm) {
      const expanded = expandPromptToLegal(outbound);
      if (expanded.wrapped) {
        outbound = expanded.transformed;
        void emitPull({
          organ: "chat",
          capability: "legal-arm",
          fromSurface: "composer",
          status: "ok",
          quote: legal.reason,
        }).catch(() => {});
      }
    }

    if (outbound !== raw) setModelPromptOverride(raw, outbound);

    onSendMessage(raw, attachments.length > 0 ? attachments : undefined);
    setValue("");
    setAttachments([]);

  };

  // Handle paste from clipboard (images)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // Detect long-text paste first so we still surface the Safe Paste UI even
    // in contexts that don't support attachments.
    const textData = e.clipboardData?.getData("text/plain") || "";
    if (textData.length > LONG_PASTE_THRESHOLD) {
      e.preventDefault();
      setLongPasteText(textData);
      return;
    }

    if (!onAttachmentsChange) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems: DataTransferItem[] = [];
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) imageItems.push(item);
    }
    if (imageItems.length === 0) return;

    e.preventDefault();
    const maxSize = 20 * 1024 * 1024;
    const maxSlots = Math.max(0, 3 - attachments.length);

    imageItems.slice(0, maxSlots).forEach(async (item) => {
      const file = item.getAsFile();
      if (!file || file.size > maxSize || file.size === 0) return;
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const commaIdx = result.indexOf(",");
            resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
        const previewUrl = URL.createObjectURL(file);
        const name = file.name || `pasted-image-${Date.now()}.png`;
        onAttachmentsChange([...attachments, { name, type: file.type, size: file.size, base64, previewUrl }]);
      } catch (err) {
        console.error("Failed to paste image:", err);
      }
    });
  }, [attachments, onAttachmentsChange]);

  const handleLongPasteInline = () => {
    if (longPasteText) {
      onChange(value + longPasteText);
      setLongPasteText(null);
    }
  };

  const handleLongPasteAsFile = () => {
    if (longPasteText && onAttachmentsChange) {
      const blob = new Blob([longPasteText], { type: "text/plain" });
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const commaIdx = result.indexOf(",");
        const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
        const name = `pasted-text-${Date.now()}.txt`;
        onAttachmentsChange([...attachments, { name, type: "text/plain", size: blob.size, base64 }]);
        setLongPasteText(null);
      };
      reader.readAsDataURL(blob);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearDraft = () => {
    const key = conversationId || "global";
    onChange("");
    deleteDraft(key).catch(() => {});
    setDraftSaved(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !onAttachmentsChange) return;

    const maxSize = 20 * 1024 * 1024; // 20MB
    const newAttachments: FileAttachment[] = [];
    const maxSlots = Math.max(0, 10 - attachments.length);

    const filesToProcess: File[] = [];

    // Check for ZIP files and extract them
    for (const file of Array.from(files).slice(0, maxSlots)) {
      if (file.size > maxSize) {
        console.warn(`File "${file.name}" skipped: exceeds 20MB limit`);
        continue;
      }
      if (file.size === 0) {
        console.warn(`File "${file.name}" skipped: empty file`);
        continue;
      }

      const ext = file.name.toLowerCase().split(".").pop();
      if (ext === "zip") {
        // Auto-extract ZIP files
        try {
          const JSZip = (await import("jszip")).default;
          const zip = await JSZip.loadAsync(file);
          const entries = Object.entries(zip.files);
          for (const [path, entry] of entries) {
            if (entry.dir || path.startsWith("__MACOSX") || path.startsWith(".")) continue;
            const blob = await entry.async("blob");
            if (blob.size === 0 || blob.size > maxSize) continue;
            const fileName = path.split("/").pop() || path;
            const extracted = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
            filesToProcess.push(extracted);
          }
        } catch (err) {
          console.error(`Failed to extract ZIP "${file.name}":`, err);
          // Fall back to attaching the ZIP itself
          filesToProcess.push(file);
        }
      } else {
        filesToProcess.push(file);
      }
    }

    for (const file of filesToProcess.slice(0, Math.max(0, 10 - attachments.length))) {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const commaIdx = result.indexOf(",");
            resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });

        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        newAttachments.push({ name: file.name, type: file.type || "application/octet-stream", size: file.size, base64, previewUrl });
      } catch (err) {
        console.error(`Failed to read file "${file.name}":`, err);
      }
    }

    if (newAttachments.length > 0) {
      onAttachmentsChange([...attachments, ...newAttachments]);
    }
    // Reset input so re-selecting the same file triggers onChange again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (idx: number) => {
    if (!onAttachmentsChange) return;
    const updated = attachments.filter((_, i) => i !== idx);
    onAttachmentsChange(updated);
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
        setRecordingTime(0);

        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size === 0 || !onAttachmentsChange) return;

        const ext = mimeType.includes("webm") ? "webm" : "m4a";
        const fileName = `voice-message-${Date.now()}.${ext}`;

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const commaIdx = result.indexOf(",");
            resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
          };
          reader.onerror = () => reject(new Error("Failed to read audio"));
          reader.readAsDataURL(blob);
        });

        onAttachmentsChange([...attachments, { name: fileName, type: mimeType, size: blob.size, base64 }]);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err: any) {
      console.error("Mic error:", err);
    }
  }, [attachments, onAttachmentsChange]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const actions = quickActions[intent];

  return (
    <div
      className="px-2 sm:px-4 pt-1"
      style={{
        // Home-indicator safe area plus the live soft-keyboard inset published
        // by the dashboard. The composer rides above the keyboard, never under.
        paddingBottom:
          "calc(env(safe-area-inset-bottom, 0px) + var(--kb-inset, 0px) + 0.75rem)",
      }}
    >
      <div className="mx-auto max-w-3xl min-w-0">
        {/* Quick action pills */}
        {actions.length > 0 && value.trim() && (
          <div className="flex items-center gap-1.5 mb-2 animate-fade-in">
            {intent === "code" && <Code className="h-3 w-3 text-accent mr-1" />}
            {intent === "url" && <Link className="h-3 w-3 text-accent mr-1" />}
            {actions.map((a) => (
              <button
                key={a.id}
                onClick={() => onQuickAction?.(a.id, value)}
                className="flex items-center gap-1.5 rounded-lg border border-border/20 bg-card/40 backdrop-blur-sm px-2.5 py-1 text-[11px] font-light text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-all hover:scale-[1.02]"
              >
                <a.icon className="h-3 w-3" />
                {a.label}
              </button>
            ))}
          </div>
        )}

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2 animate-fade-in">
            {attachments.map((file, idx) => (
              <div key={idx} className="relative group flex items-center gap-2 rounded-lg border border-border/30 bg-secondary/30 px-2.5 py-1.5 text-xs">
                {file.previewUrl ? (
                  <img src={file.previewUrl} alt={file.name} className="h-8 w-8 rounded object-cover" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-muted-foreground truncate max-w-[120px]">{file.name}</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="ml-1 p-0.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={`flex flex-wrap items-end gap-2 sm:gap-3 rounded-2xl border ${online ? "border-border/30" : "border-amber-500/30"} bg-card/40 backdrop-blur-xl p-2 sm:p-3 transition-all min-w-0`}>
          {/* Attach button — categorized tabs (Photos / Videos / Documents / Files) */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <Popover>
            <PopoverTrigger asChild>
              <button
                disabled={disabled || isStreaming || isRecording}
                className="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-all disabled:opacity-30"
                title="Attach files, images, videos, or documents"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="top"
              sideOffset={8}
              className="w-64 p-2 bg-card/95 backdrop-blur-xl border-border/40 rounded-2xl"
            >
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: "Photos", icon: ImageLucide, accept: "image/*" },
                  { label: "Videos", icon: Video, accept: "video/*" },
                  { label: "Documents", icon: FileIcon, accept: ".pdf,.doc,.docx,.txt,.md,.csv,.json,.xml,.xlsx,.xls,.ppt,.pptx,.rtf" },
                  { label: "All Files", icon: Files, accept: "*/*" },
                ].map(({ label, icon: Icon, accept }) => (
                  <button
                    key={label}
                    onClick={() => {
                      const el = fileInputRef.current;
                      if (!el) return;
                      el.setAttribute("accept", accept);
                      el.click();
                      // close popover by blurring
                      (document.activeElement as HTMLElement | null)?.blur();
                    }}
                    className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border border-border/30 bg-background/40 hover:bg-foreground/5 hover:border-border/60 transition-all text-xs font-light text-foreground"
                  >
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/60 text-center mt-2 px-1">
                Up to 20MB per file · 10 files max
              </p>
            </PopoverContent>
          </Popover>

          {/* Voice record — orb when active, mic icon when idle */}
          {isRecording ? (
            <VoiceRecordingOrb
              size={32}
              isActive
              onClick={stopRecording}
              seconds={recordingTime}
            />
          ) : (
            <button
              onClick={startRecording}
              disabled={disabled || isStreaming}
              className="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-all disabled:opacity-30"
              title="Record voice message"
            >
              <Mic className="h-4 w-4" />
            </button>
          )}

          <div className="relative min-w-0 order-[-1] w-full sm:order-none sm:w-auto sm:flex-1">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={online ? "Message asherin…" : "Offline — messages will queue…"}
              rows={1}
              className="w-full resize-none bg-transparent text-sm font-light text-foreground placeholder:text-muted-foreground/50 outline-none max-h-32"
            />
          </div>
          {value.trim() && (
            <button onClick={clearDraft} className="shrink-0 p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="Clear draft">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {isStreaming ? (
            <button
              onClick={onStop}
              className="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl bg-destructive text-destructive-foreground transition-all hover:bg-destructive/90 active:scale-95"
              title="Stop generating"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!value.trim() && attachments.length === 0) || disabled}
              className={`shrink-0 relative ${btnShape === "square" ? "rounded-xl" : "rounded-full"} w-11 h-11 flex items-center justify-center border border-accent/30 bg-background/60 text-accent/80 hover:text-accent hover:border-accent/60 hover:bg-accent/10 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all motion-reduce:transition-none`}
              title="Send"
              data-no-ripple
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {!online && <WifiOff className="h-3 w-3 text-amber-400/70" />}
          <Lock className="h-3 w-3 text-emerald-500/50" />
          <p className="text-xs font-extralight text-muted-foreground/50">
            {!online ? "Offline · messages queued" : "Account-synced encryption"}{draftSaved ? ` · ${draftSaved}` : ""} · asherin may make mistakes
          </p>
        </div>
      </div>

      {/* Long paste modal */}
      {longPasteText && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/60 backdrop-blur-sm animate-fade-in">
          <div className="w-[420px] rounded-2xl border border-border/30 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/20">
              <ClipboardPaste className="h-4 w-4 text-accent" />
              <span className="text-sm font-light text-foreground">Large Clipboard Content</span>
              <button onClick={() => setLongPasteText(null)} className="ml-auto p-1 rounded text-muted-foreground/50 hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground/60 mb-2">
                {longPasteText.length.toLocaleString()} characters detected. How would you like to handle this?
              </p>
              <div className="rounded-lg border border-border/20 bg-background/30 p-2 max-h-[120px] overflow-y-auto">
                <p className="text-[10px] text-muted-foreground/40 font-mono whitespace-pre-wrap break-all line-clamp-6">
                  {longPasteText.slice(0, 600)}{longPasteText.length > 600 ? "…" : ""}
                </p>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border/20 flex items-center gap-2">
              <button
                onClick={handleLongPasteAsFile}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-light bg-accent/15 text-accent hover:bg-accent/25 transition-colors border border-accent/20"
              >
                <FileUp className="h-3.5 w-3.5" />
                Attach as file
              </button>
              <button
                onClick={handleLongPasteInline}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-light bg-foreground/5 text-foreground/70 hover:bg-foreground/10 transition-colors border border-border/20"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste inline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

AdaptiveInputBar.displayName = "AdaptiveInputBar";

export default AdaptiveInputBar;
