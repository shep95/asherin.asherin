// asherin.extract — one open session: upload, watch the pass, read, download.
//
// The file rows are the source of truth. This component subscribes to the
// files table and to the queue's progress, so whatever closure wrote the row
// (this mount, an earlier one, a pass that outlived a session switch) the
// cards show what is stored.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Upload, Download, Copy, Check, Loader2, Trash2, FileText, Eye, EyeOff, RotateCcw, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { onTableChange } from "@/lib/local/db";
import { FILES, listFiles, addFile, deleteFile, type ScrapperSession, type ScrapperFile, type FileStatus } from "./store";
import { enqueue, dequeue, subscribeProgress, progressOf, isQueued } from "./queue";
import {
  classifyFile, unsupportedReason, combineText, safeFileName, formatBytes, formatChars, LIMITS, MAX_FILE_BYTES_LABEL,
  type ExtractProgress,
} from "./extract";

interface Props {
  session: ScrapperSession;
  userId: string;
}

const STATUS_LABEL: Record<FileStatus, string> = {
  queued: "waiting",
  extracting: "reading…",
  completed: "text extracted",
  empty: "no text found",
  unsupported: "not readable here",
  failed: "failed",
};

const ACCEPT = [
  "application/pdf", ".pdf", "image/*", ".docx", "text/*", ".txt", ".md", ".csv", ".tsv", ".json", ".jsonl",
  ".xml", ".html", ".htm", ".svg", ".log", ".rtf", ".srt", ".vtt", ".yaml", ".yml", ".toml", ".ini", ".sql",
].join(",");

function progressLabel(p: ExtractProgress | undefined): string {
  if (!p) return STATUS_LABEL.extracting;
  if (p.stage === "ocr") {
    const pct = typeof p.fraction === "number" ? ` ${Math.round(p.fraction * 100)}%` : "";
    return p.page ? `reading page ${p.page} of ${p.pages} optically${pct}` : `reading optically${pct}`;
  }
  if (p.stage === "pages" && p.page) return `reading page ${p.page} of ${p.pages}`;
  return "reading…";
}

const SessionWorkspace = ({ session, userId }: Props) => {
  const { toast } = useToast();
  const { copy, copied } = useCopyToClipboard();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<ScrapperFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [, setTick] = useState(0);

  const reload = useCallback(async () => {
    const { files: rows, error } = await listFiles(session.id);
    return { rows, error };
  }, [session.id]);

  // rows: read once, then on every write to the table (from any closure).
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const { rows, error } = await reload();
      if (!alive) return;
      setFiles(rows);
      setFilesError(error);
      setLoadingFiles(false);
      // a reload mid-pass leaves rows at "queued" or a stale "extracting";
      // both go back on the queue, which skips anything already running.
      const resume = rows.filter((r) => (r.status === "queued" || r.status === "extracting") && !isQueued(r.id)).map((r) => r.id);
      if (resume.length) enqueue(resume);
    };
    void run();
    const off = onTableChange(FILES, () => {
      if (alive) void run();
    });
    return () => {
      alive = false;
      off();
    };
  }, [reload]);

  // progress: redraw when the queue reports a page or a percentage.
  useEffect(() => subscribeProgress(() => setTick((t) => t + 1)), []);

  // the join can run over megabytes; progress ticks must not redo it.
  const combinedText = useMemo(() => combineText(files), [files]);
  const previewText = useMemo(
    () => (combinedText.length > LIMITS.previewChars ? combinedText.slice(0, LIMITS.previewChars) : combinedText),
    [combinedText],
  );
  const extractedCount = files.filter((f) => f.status === "completed").length;

  const handleFiles = async (list: FileList | File[]) => {
    const picked = Array.from(list);
    if (!picked.length) return;
    setUploading(true);
    const queued: string[] = [];
    let refused = 0;
    try {
      for (const file of picked) {
        if (file.size > LIMITS.maxFileBytes) {
          refused++;
          toast({
            title: "file too large",
            description: `${file.name} is ${formatBytes(file.size)}; the limit is ${MAX_FILE_BYTES_LABEL}.`,
            variant: "destructive",
          });
          continue;
        }
        const kind = classifyFile(file.name, file.type);
        const unsupported = kind === "unsupported" ? unsupportedReason(file.name, file.type) : undefined;
        const { file: row, error } = await addFile(userId, session.id, file, { unsupported });
        if (error || !row) {
          refused++;
          toast({ title: "file not stored", description: `${file.name}: ${error ?? "unknown error"}`, variant: "destructive" });
          continue;
        }
        if (!unsupported) queued.push(row.id);
      }
      if (queued.length) enqueue(queued);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    if (picked.length > 1 && refused === 0) {
      toast({ title: `${queued.length} file${queued.length === 1 ? "" : "s"} queued`, description: "each one is read here, on this device." });
    }
  };

  const retry = (file: ScrapperFile) => enqueue([file.id]);

  const remove = async (file: ScrapperFile) => {
    dequeue(file.id);
    const error = await deleteFile(file);
    if (error) toast({ title: "file kept", description: error, variant: "destructive" });
  };

  const downloadTxt = () => {
    const blob = new Blob([combinedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFileName(session.name)}-extracted.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // safari aborts a download whose url is revoked in the same tick
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const openPicker = () => fileInputRef.current?.click();

  const actionClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-border/15 px-3 py-1.5 text-[10px] font-light text-foreground/70 hover:bg-foreground/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* header */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-b border-border/10 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="text-sm font-light tracking-wide text-foreground truncate">{session.name}</h2>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">
            {files.length} file{files.length !== 1 ? "s" : ""} · {extractedCount} with text · {formatChars(combinedText.length)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            disabled={!combinedText}
            aria-pressed={showPreview}
            className={actionClass}
          >
            {showPreview ? <EyeOff className="h-3 w-3" aria-hidden="true" /> : <Eye className="h-3 w-3" aria-hidden="true" />}
            {showPreview ? "hide text" : "show text"}
          </button>
          <button type="button" onClick={() => copy(combinedText)} disabled={!combinedText} className={actionClass}>
            {copied ? <Check className="h-3 w-3 text-emerald-400" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
            {copied ? "copied" : "copy all"}
          </button>
          <button
            type="button"
            onClick={downloadTxt}
            disabled={!combinedText}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground px-3 py-1.5 text-[10px] font-light hover:bg-accent/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            download .txt
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        {/* files */}
        <div className={`${showPreview ? "md:w-1/2" : "w-full"} flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-3`}>
          <input ref={fileInputRef} type="file" multiple accept={ACCEPT} onChange={(e) => e.target.files && handleFiles(e.target.files)} className="hidden" />
          <div
            role="button"
            tabIndex={0}
            aria-label="add files"
            onClick={openPicker}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card/5 p-6 md:p-8 cursor-pointer transition-colors group outline-none focus-visible:ring-1 focus-visible:ring-accent/50 ${
              dragOver ? "border-accent/50" : "border-border/20 hover:border-accent/30"
            }`}
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 text-accent animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground/30 group-hover:text-accent/60 transition-colors" aria-hidden="true" />
            )}
            <p className="text-xs font-extralight text-muted-foreground/60 mt-3 text-center">
              {uploading ? "storing…" : "drop files here, or tap to choose"}
            </p>
            <p className="text-[9px] text-muted-foreground/40 mt-1 text-center">
              pdfs (text or scanned), png/jpg/webp photos of text, .docx, plain text · up to {MAX_FILE_BYTES_LABEL} each
            </p>
          </div>

          {loadingFiles && <p className="text-[10px] text-muted-foreground/40 text-center animate-pulse">reading the session…</p>}
          {filesError && <p className="text-[10px] text-destructive/80 text-center">{filesError}</p>}
          {!loadingFiles && !filesError && files.length === 0 && (
            <p className="text-[10px] text-muted-foreground/40 text-center py-4">nothing in this session yet.</p>
          )}

          {files.map((file) => {
            const busy = file.status === "extracting" || (file.status === "queued" && isQueued(file.id));
            const Icon = file.file_type.startsWith("image/") ? ImageIcon : FileText;
            const notes: string[] = [];
            if (file.status === "completed" && file.method) notes.push(file.method);
            if (file.truncated) notes.push(`cut at ${formatChars(LIMITS.maxTextChars)}`);
            return (
              <div key={file.id} className="rounded-lg border border-border/10 bg-card/5 p-3 md:p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-light text-foreground truncate">{file.file_name}</p>
                  <p className="text-[9px] text-muted-foreground/40 mt-0.5">
                    {formatBytes(file.file_size)} · {busy ? progressLabel(progressOf(file.id)) : STATUS_LABEL[file.status]}
                    {file.status === "completed" ? ` · ${formatChars(file.text_chars)}` : ""}
                    {notes.length ? ` · ${notes.join(" · ")}` : ""}
                  </p>
                  {file.error && !busy && (
                    <p className={`text-[9px] mt-1 ${file.status === "failed" ? "text-destructive/80" : "text-muted-foreground/60"}`}>{file.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {busy && <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" aria-label="reading" />}
                  {!busy && (file.status === "failed" || file.status === "empty") && file.storage_path && (
                    <button
                      type="button"
                      onClick={() => retry(file)}
                      aria-label={`retry ${file.file_name}`}
                      title="read again"
                      className="inline-flex items-center gap-1 text-[9px] text-accent hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(file)}
                    aria-label={`remove ${file.file_name}`}
                    title="remove"
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* preview */}
        {showPreview && (
          <div className="md:w-1/2 flex-1 min-h-0 border-t md:border-t-0 md:border-l border-border/10 overflow-y-auto p-4 md:p-6">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h3 className="text-xs font-light tracking-[0.12em] text-foreground/80">extracted text</h3>
              <button type="button" onClick={() => copy(combinedText)} className="text-[9px] text-accent hover:underline">
                {copied ? "copied" : "copy all"}
              </button>
            </div>
            {combinedText ? (
              <>
                <pre className="text-xs font-mono font-extralight text-foreground/80 whitespace-pre-wrap break-words leading-relaxed bg-background/30 rounded-lg p-4 border border-border/10">
                  {previewText}
                </pre>
                {previewText.length < combinedText.length && (
                  <p className="text-[9px] text-muted-foreground/50 mt-2">
                    showing the first {formatChars(LIMITS.previewChars)} of {formatChars(combinedText.length)} — the download holds everything.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[10px] text-muted-foreground/40 text-center py-12">no text extracted yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionWorkspace;
