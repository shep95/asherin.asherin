import { Download, FileText, FileJson, FileSpreadsheet, Archive as ArchiveIcon, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

type ExportFormat = "pdf" | "csv" | "json" | "markdown" | "zip";

interface Props {
  resultCount: number;
  onExport: (format: ExportFormat, opts: { fullText: boolean; metadata: boolean; attachments: boolean; related: boolean }) => void;
  onClose: () => void;
}

const FORMATS: { id: ExportFormat; label: string; icon: LucideIcon }[] = [
  { id: "pdf", label: "PDF report (with metadata)", icon: FileText },
  { id: "csv", label: "CSV spreadsheet (structured data)", icon: FileSpreadsheet },
  { id: "json", label: "JSON (raw data for analysis)", icon: FileJson },
  { id: "markdown", label: "markdown (for documentation)", icon: FileText },
  { id: "zip", label: "ZIP archive (all original files)", icon: ArchiveIcon },
];

const ArchiveExportPanel = ({ resultCount, onExport, onClose }: Props) => {
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [fullText, setFullText] = useState(true);
  const [metadata, setMetadata] = useState(true);
  const [attachments, setAttachments] = useState(true);
  const [related, setRelated] = useState(false);

  return (
    <div className="rounded-xl border border-border/30 bg-card/40 backdrop-blur-xl px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-accent" />
          <span className="text-[11px] font-light text-foreground">export search results</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <p className="text-[10px] text-muted-foreground/60">Export {resultCount.toLocaleString()} results as:</p>

      <div className="space-y-1.5">
        {FORMATS.map(f => {
          const on = format === f.id;
          return (
            <button key={f.id} onClick={() => setFormat(f.id)} className={`flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-light transition-colors ${on ? "bg-accent/15 border border-accent/30 text-foreground" : "hover:bg-card/60 text-muted-foreground/70 border border-transparent"}`}>
              <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${on ? "border-accent" : "border-border/40"}`}>
                {on && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
              </span>
              <f.icon className="h-3 w-3" />
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="h-px bg-border/20" />

      <div className="space-y-1.5">
        <p className="text-[10px] text-muted-foreground/50">include:</p>
        {[
          { key: "fullText", label: "full text", val: fullText, set: setFullText },
          { key: "metadata", label: "metadata (dates, sources, confidence)", val: metadata, set: setMetadata },
          { key: "attachments", label: "attachments (code, pdfs, etc.)", val: attachments, set: setAttachments },
          { key: "related", label: "related resources", val: related, set: setRelated },
        ].map(item => (
          <button key={item.key} onClick={() => item.set(!item.val)} className="flex items-center gap-2 w-full text-left text-[11px] font-light text-muted-foreground/70 hover:text-foreground transition-colors">
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${item.val ? "bg-accent/30 border-accent/60 text-accent" : "border-border/40 text-transparent"}`}>{item.val && "✓"}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => onExport(format, { fullText, metadata, attachments, related })} className="rounded-xl bg-accent/20 px-4 py-1.5 text-[11px] font-light text-accent hover:bg-accent/30 transition-colors">
          Generate Export
        </button>
        <button onClick={onClose} className="rounded-xl px-4 py-1.5 text-[11px] font-light text-muted-foreground/60 hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ArchiveExportPanel;
