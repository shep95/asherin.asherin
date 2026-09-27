import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { FileText, Download, Check, Eye, Copy, ExternalLink } from "lucide-react";
import { buildIntelReport, formatBytes, type IntelReportInput } from "@/lib/intelligenceReport";

interface IntelReportCardProps extends IntelReportInput {}

/**
 * Downloadable artifact card for an intelligence report.
 *
 * The file is materialised only on click: holding a Blob URL per rendered
 * message would leak object URLs for the whole session, and the report text is
 * a pure function of props so it can be rebuilt instantly. The URL created for
 * a download is revoked on the next frame, after the click has been consumed.
 */
const IntelReportCard = (props: IntelReportCardProps) => {
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);
  // Object URLs opened in a tab must outlive the click; revoke on unmount only.
  const openedUrls = useRef<string[]>([]);
  useEffect(() => () => { openedUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const report = useMemo(
    () =>
      buildIntelReport({
        content: props.content,
        request: props.request,
        conversationTitle: props.conversationTitle,
        timestamp: props.timestamp,
        sources: props.sources,
      }),
    [props.content, props.request, props.conversationTitle, props.timestamp, props.sources],
  );

  const handleDownload = useCallback(() => {
    // BOM keeps the box-drawing/typographic characters intact in Windows Notepad.
    const blob = new Blob(["\uFEFF", report.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = report.filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    requestAnimationFrame(() => URL.revokeObjectURL(url));
    setDone(true);
    window.setTimeout(() => setDone(false), 2400);
  }, [report]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(report.text);
    } catch {
      // Clipboard API is unavailable on insecure origins / older Safari.
      const ta = document.createElement("textarea");
      ta.value = report.text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* nothing left to try */ }
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [report]);

  const handleOpen = useCallback(() => {
    const blob = new Blob(["\uFEFF", report.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    openedUrls.current.push(url);
    window.open(url, "_blank", "noopener,noreferrer");
  }, [report]);

  return (
    <div className="mt-2 animate-fade-in">
      <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-xl overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <div className="shrink-0 h-9 w-9 rounded-lg border border-border/40 bg-foreground/5 flex items-center justify-center">
            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-light text-foreground truncate" title={report.filename}>
              {report.filename}
            </div>
            <div className="text-[10px] font-light text-muted-foreground/60 truncate">
              Plain text · {formatBytes(report.bytes)} · Ref HOA-{report.reference} · #houseofasher #zia
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            aria-expanded={preview}
            className="shrink-0 flex items-center gap-1 rounded-md border border-border/30 px-2 py-1 text-[10px] font-light text-muted-foreground/70 hover:text-foreground hover:border-border/60 transition-colors"
          >
            <Eye className="h-3 w-3" aria-hidden="true" />
            {preview ? "Hide" : "Preview"}
          </button>
          <button
            type="button"
            onClick={handleOpen}
            title="Open the full report in a new tab"
            className="shrink-0 flex items-center gap-1 rounded-md border border-border/30 px-2 py-1 text-[10px] font-light text-muted-foreground/70 hover:text-foreground hover:border-border/60 transition-colors"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            View
          </button>
          <button
            type="button"
            onClick={handleCopy}
            title="Copy the full report text"
            className="shrink-0 flex items-center gap-1 rounded-md border border-border/30 px-2 py-1 text-[10px] font-light text-muted-foreground/70 hover:text-foreground hover:border-border/60 transition-colors"
          >
            {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="shrink-0 flex items-center gap-1.5 rounded-md border border-border/40 bg-foreground/5 px-2.5 py-1 text-[10px] font-light text-foreground hover:bg-foreground/10 transition-colors"
          >
            {done ? <Check className="h-3 w-3" aria-hidden="true" /> : <Download className="h-3 w-3" aria-hidden="true" />}
            {done ? "Saved" : "Download .txt"}
          </button>
        </div>
        {preview && (
          <pre className="max-h-72 overflow-auto border-t border-border/30 bg-background/40 px-3 py-2 text-[10px] leading-[1.45] font-mono text-muted-foreground whitespace-pre">
            {report.text.slice(0, 6000)}
            {report.text.length > 6000 ? "\n… (truncated preview — full text in the file)" : ""}
          </pre>
        )}
      </div>
      <div className="sr-only" role="status">
        Intelligence report {report.filename} ready to download.
      </div>
    </div>
  );
};

export default IntelReportCard;
