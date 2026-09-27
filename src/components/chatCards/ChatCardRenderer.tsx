// Dispatch layer for the Card Protocol. Given a parsed CardSegment, renders
// the correct card component. Central registry so adding a new card type is
// one entry here + one entry in parseChatCards.KNOWN.

import GematriaResultCard from "@/components/gematria/GematriaResultCard";
import GematriaCompareCard from "@/components/chatCards/GematriaCompareCard";
import NumberLookupCard from "@/components/chatCards/NumberLookupCard";
import { SymbolicPassageCard, SymbolicSpineCard } from "@/components/chatCards/SymbolicCards";
import {
  InfoCard,
  EntityCard,
  RelationshipCard,
  TimelineCard,
  ComparisonCard,
  StatCard,
  QuoteCard,
  SourcesCard,
  ListCard,
  WarningCard,
} from "@/components/chatCards/UniversalCards";
import { CandidatesCard } from "@/components/chatCards/CandidatesCard";
import type { CardSegment, CreamDoc, UnknownCardSegment } from "@/lib/chatCards/parseChatCards";
import { compileCreamPdf, creamDocFromPayload } from "@/lib/chatCards/parseChatCards";
import { AlertCircle, Download, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function toPdfBlob(bytes: Uint8Array): Blob {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return new Blob([ab], { type: "application/pdf" });
}

const PAPER = "#F6F0E4";
const INK = "#3B2F28";
const MUTED = "#9A8B7C";

function CreamPdfCard({ doc, origin }: { doc: CreamDoc; origin?: string }) {
  const built = useMemo(() => {
    try {
      return compileCreamPdf(doc);
    } catch {
      return null;
    }
  }, [doc]);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!built) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(toPdfBlob(built.bytes));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [built]);

  if (!built) return null;

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = built.filename;
    a.click();
  };

  const speciesLabel =
    doc.species === "intelligence"
      ? "intelligence file"
      : doc.species === "resume"
        ? "resume"
        : doc.species === "convo"
          ? "conversation"
          : "brief";

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/25 bg-foreground/[0.02]">
      <div
        className="relative mx-3 mt-3 overflow-hidden rounded-md border border-black/10"
        style={{ background: PAPER, color: INK, aspectRatio: "8.5 / 11" }}
      >
        <div className="absolute inset-0 p-[8%] font-serif">
          <div className="text-[9px] uppercase tracking-[0.22em]" style={{ color: MUTED }}>
            creamy pdf · {speciesLabel}
          </div>
          <div className="mt-2 text-[15px] leading-tight">{doc.title}</div>
          <div className="mt-2 h-px w-full" style={{ background: "rgba(196,163,106,0.7)" }} />
          <div className="mt-3 space-y-2 text-[10px] leading-relaxed opacity-80">
            {(doc.sections[0]?.body || doc.classification || "").split(/\s+/).slice(0, 42).join(" ")}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <FileText className="h-3 w-3" strokeWidth={1.5} />
            cream paper · {built.pages} page{built.pages === 1 ? "" : "s"}
          </div>
          <div className="truncate text-[11px] text-muted-foreground/80">{built.filename}</div>
        </div>
        <button
          type="button"
          onClick={download}
          disabled={!url}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/30 px-2.5 py-1.5 text-[11px] font-light text-foreground/90 hover:bg-foreground/5 disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
          download pdf
        </button>
      </div>
      {origin ? (
        <div className="border-t border-border/15 px-3 py-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
          {origin}
        </div>
      ) : null}
    </div>
  );
}

type Source = "chat:aureon" | "chat:asher";

interface Props {
  segment: CardSegment | UnknownCardSegment;
  source: Source;
}

export default function ChatCardRenderer({ segment, source }: Props) {
  if (segment.type === "card-unknown") {
    return (
      <div className="my-2 inline-flex items-center gap-2 rounded border border-border/30 bg-foreground/[0.02] px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
        <AlertCircle className="h-3 w-3" strokeWidth={1.5} />
        Unsupported card: {segment.rawType}
      </div>
    );
  }

  const { payload } = segment;

  switch (segment.cardType) {
    // ── gematria family ──────────────────────────────
    case "gematria": {
      const phrase = String(payload.phrase ?? "").slice(0, 200);
      if (!phrase.trim()) return null;
      return <GematriaResultCard phrase={phrase} source={source} />;
    }
    case "gematria-compare": {
      const raw = payload.phrases;
      const phrases = Array.isArray(raw) ? raw.map((p) => String(p ?? "").slice(0, 200)).filter((p) => p.trim()) : [];
      if (phrases.length < 2) return null;
      return <GematriaCompareCard phrases={phrases.slice(0, 4)} source={source} />;
    }
    case "number-lookup": {
      const value = Number(payload.value);
      const cipherRaw = String(payload.cipher ?? "ordinal");
      const cipher = ["ordinal", "reduction", "reverse", "chaldean"].includes(cipherRaw)
        ? (cipherRaw as "ordinal" | "reduction" | "reverse" | "chaldean")
        : "ordinal";
      if (!Number.isFinite(value) || value <= 0 || value > 10000) return null;
      return <NumberLookupCard value={value} cipher={cipher} source={source} />;
    }
    // ── symbolic-exegesis family ─────────────────────
    case "symbolic":
      return <SymbolicPassageCard payload={payload} source={source} />;
    case "symbolic-spine":
      return <SymbolicSpineCard payload={payload} source={source} />;
    // ── universal shape cards ────────────────────────
    case "info":
      return <InfoCard payload={payload} source={source} />;
    case "entity":
      return <EntityCard payload={payload} source={source} />;
    case "relationship":
      return <RelationshipCard payload={payload} source={source} />;
    case "timeline":
      return <TimelineCard payload={payload} source={source} />;
    case "comparison":
      return <ComparisonCard payload={payload} source={source} />;
    case "stat":
      return <StatCard payload={payload} source={source} />;
    case "quote":
      return <QuoteCard payload={payload} source={source} />;
    case "sources":
      return <SourcesCard payload={payload} source={source} />;
    case "list":
      return <ListCard payload={payload} source={source} />;
    case "warning":
      return <WarningCard payload={payload} source={source} />;
    case "candidates":
      return <CandidatesCard payload={payload} source={source} />;
    case "cream-pdf": {
      const doc = creamDocFromPayload(payload);
      if (!doc.title && !(doc.sections && doc.sections.length) && !(doc.turns && doc.turns.length)) return null;
      return <CreamPdfCard doc={doc} origin={source} />;
    }
    default:
      return null;
  }
}
