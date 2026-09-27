// asherin.pages — one document studio.
//
// Slides, ebooks and pdf pages used to be three separate rooms with three
// prompt boxes doing the same job. They are now one room where the output type
// is a choice, so history and habits live in one place. Each output still uses
// its own proven generator underneath — nothing was reimplemented.

import { Suspense, lazy, useState } from "react";
import { FileText, Presentation, BookOpen, Loader2 } from "lucide-react";
import ErrorBoundary from "@/components/ErrorBoundary";

const PdfGeneratorView = lazy(() => import("./PdfGeneratorView"));
const SlideshowGeneratorView = lazy(() => import("./SlideshowGeneratorView"));
const EBookGeneratorView = lazy(() => import("./ebook/EBookGeneratorView"));

export type DocumentKind = "page" | "deck" | "book";

const KINDS: { id: DocumentKind; label: string; hint: string; icon: typeof FileText }[] = [
  { id: "page", label: "page", hint: "report, letter, pdf", icon: FileText },
  { id: "deck", label: "deck", hint: "slides you present", icon: Presentation },
  { id: "book", label: "book", hint: "long form, chapters", icon: BookOpen },
];

interface Props {
  /** which output the user arrived for — deep links keep their meaning. */
  initialKind?: DocumentKind;
}

export default function DocumentStudioView({ initialKind = "page" }: Props) {
  const [kind, setKind] = useState<DocumentKind>(initialKind);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/15 px-4 py-2.5 sm:px-6">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/40">
          asherin.pages
        </span>
        {KINDS.map((k) => {
          const active = k.id === kind;
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-light transition-colors ${
                active
                  ? "border-border/40 bg-foreground/[0.07] text-foreground"
                  : "border-border/20 bg-card/20 text-muted-foreground hover:bg-foreground/[0.04]"
              }`}
            >
              <k.icon className="h-3.5 w-3.5" />
              <span>{k.label}</span>
              <span className="hidden text-[10px] text-muted-foreground/50 sm:inline">{k.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            {kind === "page" && <PdfGeneratorView />}
            {kind === "deck" && <SlideshowGeneratorView />}
            {kind === "book" && <EBookGeneratorView />}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
