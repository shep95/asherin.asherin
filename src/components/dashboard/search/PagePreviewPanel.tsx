import { X, ExternalLink, Lock, Clock } from "lucide-react";
import type { PagePreview } from "./types";

interface PagePreviewPanelProps {
  preview: PagePreview;
  url: string;
  onClose: () => void;
}

const PagePreviewPanel = ({ preview, url, onClose }: PagePreviewPanelProps) => {
  return (
    <>
      {/* Backdrop on mobile */}
      <div className="fixed inset-0 z-40 bg-background/60 sm:hidden" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 w-full sm:max-w-lg z-50 bg-card/95 backdrop-blur-xl border-l border-border/20 shadow-2xl flex flex-col animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/15">
          <div className="min-w-0 flex-1 mr-3">
            <h3 className="text-sm font-normal text-foreground truncate">{preview.title}</h3>
            <p className="text-[10px] text-muted-foreground/40 font-mono truncate">{url}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <a href={url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors">
              <ExternalLink className="h-4 w-4" />
            </a>
            <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border/10 text-[10px] text-muted-foreground/50 flex-wrap">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{preview.readingTimeMin} min read</span>
          <span>{preview.wordCount.toLocaleString()} words</span>
          {preview.isPaywalled && (
            <span className="flex items-center gap-1 text-amber-400"><Lock className="h-3 w-3" /> paywall detected</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
          {preview.description && (
            <p className="text-xs font-light text-muted-foreground italic mb-4 border-l-2 border-accent/30 pl-3">{preview.description}</p>
          )}
          {/* the reader returns plain text (markdown flattened, html stripped), so it is
              rendered as text: a hostile page can put angle brackets in its copy, never markup */}
          <div className="text-sm font-light text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">{preview.content}</div>
          {preview.via && (
            <p className="mt-4 text-[10px] text-muted-foreground/40">
              {preview.via === "reader" ? "read through the jina reader relay, which fetched this address on your behalf." : "read directly by this browser."}
            </p>
          )}
        </div>
      </div>
    </>
  );
};

export default PagePreviewPanel;
