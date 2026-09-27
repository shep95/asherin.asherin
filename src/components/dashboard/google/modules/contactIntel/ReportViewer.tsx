import { useEffect, useRef } from "react";
import { X, Download, Copy } from "lucide-react";
import { toast } from "sonner";
import { downloadText } from "./localVault";

interface Props {
  name: string;
  text: string;
  /** Face imagery captured by the OSINT leg. URLs only; never hot-linked. */
  images?: Array<{ url: string; attributedTo: string }>;
  onClose: () => void;
}

/**
 * Face images are routed through the SSRF-guarded intel-avatar edge function
 * so the operator's browser never issues a request to a third-party host that
 * the collection layer surfaced. A null return degrades the tile to blank
 * rather than falling back to a direct fetch.
 */
function proxied(url: string): string | null {
  if (!url || !url.startsWith("https://")) return null;
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return null;
  return `${base}/functions/v1/intel-avatar?u=${encodeURIComponent(url)}`;
}


/**
 * Full-screen reader for a rendered contact report.
 *
 * The report is fixed-width ASCII, so it is presented in a monospace <pre>
 * that scrolls on both axes rather than being reflowed — reflowing would
 * destroy the column alignment the renderer works to guarantee.
 *
 * Focus is trapped for the lifetime of the overlay and restored to the
 * invoking control on close, and Escape dismisses, so the report is reachable
 * and escapable without a pointer.
 */
const ReportViewer = ({ name, text, images, onClose }: Props) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes?.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      restoreTo.current?.focus?.();
    };
  }, [onClose]);

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "contact";
  const stamp = new Date().toISOString().slice(0, 10);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Report copied.");
    } catch {
      // Clipboard is permission-gated and blocked outright in some embedded
      // frames; the download path below is always available, so say that.
      toast.error("Clipboard unavailable here — use Download instead.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Contact intelligence report for ${name}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-4xl max-h-full flex flex-col rounded-2xl border border-border/30 bg-card/80 backdrop-blur-md outline-none"
      >
        <header className="flex items-center gap-3 border-b border-border/20 px-4 py-3 shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-light text-foreground truncate">{name}</p>
            <p className="text-[10px] font-extralight text-muted-foreground/60">
              Contact intelligence report · personal / eyes only
            </p>
          </div>
          <button
            onClick={onCopy}
            className="flex items-center gap-1.5 rounded-lg bg-foreground/5 px-3 py-1.5 text-[10px] font-light text-muted-foreground hover:bg-foreground/10 transition-colors"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
          <button
            onClick={() => downloadText(`asherin-contact-report-${slug}-${stamp}.txt`, text)}
            className="flex items-center gap-1.5 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-colors"
          >
            <Download className="h-3 w-3" /> Download
          </button>
          <button
            onClick={onClose}
            aria-label="Close report"
            className="rounded-lg bg-foreground/5 p-1.5 text-muted-foreground hover:bg-foreground/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        {images && images.length > 0 && (
          <section className="border-b border-border/20 px-4 py-3 shrink-0" aria-label="Captured imagery">
            <p className="text-[10px] font-extralight text-muted-foreground/60 mb-2">
              Captured imagery — attributed to the identity cluster that published it, not confirmed as the subject.
            </p>
            <ul className="flex gap-3 overflow-x-auto pb-1">
              {images.map((img) => (
                <li key={img.url} className="shrink-0 w-24">
                  <img
                    src={proxied(img.url) ?? undefined}
                    alt={`Face image published alongside ${img.attributedTo}`}
                    loading="lazy"
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-lg object-cover bg-foreground/5 border border-border/20"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                  <p className="mt-1 text-[9px] font-extralight text-muted-foreground/60 truncate" title={img.attributedTo}>
                    {img.attributedTo}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="overflow-auto p-4">
          <pre className="font-mono text-[10.5px] leading-[1.5] text-foreground/85 whitespace-pre">{text}</pre>
        </div>

      </div>
    </div>
  );
};

export default ReportViewer;
