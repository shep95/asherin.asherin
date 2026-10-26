// one preview for a library file, used by the library and by a project's files tab.
//
// Images and pdfs render from the stored blob through a tab-local object url
// (revoked on close). Text-like files show the indexed text — credential-shaped
// runs already masked — and the original is one download away. Anything else
// says so and offers the download.

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import {
  extractionKind, loadExtractedText, maskCredentials, openLibraryFile, blobText, formatBytes, MAX_TEXT_BYTES,
  type LibraryFile, type OpenedFile,
} from "@/lib/library/library";

interface Props {
  file: LibraryFile;
  onClose: () => void;
}

type Kind = "image" | "pdf" | "text" | "other";

const kindOf = (f: LibraryFile): Kind => {
  if (f.file_type.startsWith("image/")) return "image";
  const k = extractionKind(f.file_name, f.file_type);
  if (k === "pdf") return "pdf";
  if (k === "text") return "text";
  return "other";
};

const FilePreview = ({ file, onClose }: Props) => {
  const kind = kindOf(file);
  const [opened, setOpened] = useState<OpenedFile | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let alive = true;
    let handle: OpenedFile | null = null;
    (async () => {
      const o = await openLibraryFile(file);
      if (!alive) { o?.revoke(); return; }
      if (!o) { setState("missing"); return; }
      handle = o;
      setOpened(o);
      if (kind === "text") {
        let t = file.text_status === "ok" ? await loadExtractedText(file.id) : "";
        if (!t) {
          try { t = maskCredentials(await blobText(o.blob.slice(0, MAX_TEXT_BYTES))); } catch { t = ""; }
        }
        if (alive) setText(t);
      }
      if (alive) setState("ready");
    })();
    return () => { alive = false; handle?.revoke(); };
  }, [file, kind]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`preview of ${file.file_name}`}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex h-full w-full max-w-3xl flex-col border-border/20 bg-background sm:my-6 sm:h-[calc(100%-3rem)] sm:rounded-2xl sm:border"
      >
        <div className="flex items-center gap-3 border-b border-border/15 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-light text-foreground">{file.file_name}</p>
            <p className="text-[10px] text-muted-foreground/60">
              {formatBytes(file.file_size)} · {file.file_type || "unknown type"}
              {kind === "text" && file.text_status === "ok" ? " · indexed text, credential-shaped runs masked" : ""}
            </p>
          </div>
          {opened && (
            <a
              href={opened.url}
              download={file.file_name}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/20 px-2.5 py-1.5 text-[11px] font-light text-foreground hover:bg-foreground/5"
            >
              <Download className="h-3.5 w-3.5" /> download
            </a>
          )}
          <button ref={closeRef} onClick={onClose} aria-label="close preview" className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {state === "loading" && (
            <div className="flex h-full items-center justify-center" aria-busy="true">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {state === "missing" && (
            <p role="alert" className="text-xs font-extralight text-muted-foreground">
              the stored bytes for this file are missing on this device. remove the entry and add the file again.
            </p>
          )}
          {state === "ready" && opened && kind === "image" && (
            <img src={opened.url} alt={file.file_name} className="mx-auto max-h-full max-w-full object-contain" />
          )}
          {state === "ready" && opened && kind === "pdf" && (
            <iframe src={opened.url} title={file.file_name} className="h-full min-h-[60vh] w-full rounded-lg border border-border/15 bg-white" />
          )}
          {state === "ready" && kind === "text" && (
            text
              ? <pre className="whitespace-pre-wrap break-words text-xs font-extralight leading-relaxed text-foreground">{text}</pre>
              : <p className="text-xs font-extralight text-muted-foreground">no text could be read from this file.</p>
          )}
          {state === "ready" && kind === "other" && (
            <p className="text-xs font-extralight text-muted-foreground">
              no preview for this format. download it to open it in another app.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilePreview;
