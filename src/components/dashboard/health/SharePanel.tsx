// turns the on-device record into something a person can actually hand to someone: a
// printable clinical package, a family risk atlas, and a full json export/import. erasing
// everything is a deliberate, explicit, two-step action — never a single misclick.
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Copy, Download, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { HealthPanelProps } from "@/lib/health/panel";
import { EMPTY_RECORD, exportRecord, importRecord, recordCount } from "@/lib/health/store";
import { buildClinicalPackage, buildFamilyAtlas } from "@/lib/health/output/clinicalPackage";

type Tab = "clinical" | "family" | "data";

function download(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SharePanel({ record, persist }: HealthPanelProps) {
  const [tab, setTab] = useState<Tab>("clinical");
  const [eraseArmed, setEraseArmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const clinicalMarkdown = useMemo(() => buildClinicalPackage(record), [record]);
  const familyMarkdown = useMemo(() => buildFamilyAtlas(record), [record]);

  const activeMarkdown = tab === "family" ? familyMarkdown : clinicalMarkdown;

  const copyActive = async () => {
    await navigator.clipboard.writeText(activeMarkdown);
    toast.success("copied.");
  };

  const downloadActive = () => {
    download(tab === "family" ? "family-atlas.md" : "clinical-package.md", activeMarkdown, "text/markdown");
  };

  const exportJson = () => {
    download("asherin-health-record.json", exportRecord(record), "application/json");
    toast.success("record exported.");
  };

  const importJson = async (file: File) => {
    const text = await file.text();
    const { record: imported, error } = importRecord(text);
    if (error || !imported) {
      toast.error(error ?? "could not read that file.");
      return;
    }
    persist(imported);
    toast.success("record imported. it stays on this device.");
  };

  const eraseEverything = () => {
    persist(EMPTY_RECORD);
    setEraseArmed(false);
    toast.success("everything on this device has been erased.");
  };

  return (
    <div className="space-y-5">
      <p className="text-[11px] font-light leading-relaxed text-foreground/50">
        everything here is built from what is already on this device. nothing is sent anywhere unless you copy,
        download or import it yourself.
      </p>

      <div className="flex gap-2">
        {([
          ["clinical", "clinical package"],
          ["family", "family atlas"],
          ["data", "your data"],
        ] as [Tab, string][]).map(([value, label]) => (
          <Button key={value} size="sm" variant={tab === value ? "default" : "outline"} className="h-7 text-[10px]" onClick={() => setTab(value)}>
            {label}
          </Button>
        ))}
      </div>

      {tab !== "data" ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[10px]" onClick={copyActive}>
              <Copy className="h-3 w-3" /> copy markdown
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[10px]" onClick={downloadActive}>
              <Download className="h-3 w-3" /> download .md
            </Button>
          </div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-[11px] font-light leading-relaxed text-foreground/70">
            {activeMarkdown}
          </pre>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">export / import</p>
            <p className="text-[11px] font-light leading-relaxed text-foreground/55">
              {recordCount(record)} recorded items on this device. export makes a full json copy; import replaces the
              current record with a previously exported file.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[10px]" onClick={exportJson}>
                <Download className="h-3 w-3" /> export record
              </Button>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[10px]" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3 w-3" /> import record
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importJson(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <div className={cn("space-y-2 rounded-2xl border p-3", eraseArmed ? "border-amber-400/40 bg-amber-400/[0.08]" : "border-white/[0.06] bg-white/[0.03]")}>
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-amber-300/90">
              <AlertTriangle className="h-3.5 w-3.5" /> erase everything on this device
            </p>
            <p className="text-[11px] font-light leading-relaxed text-foreground/55">
              this permanently deletes every recorded item in this browser. export a copy first if you want to keep it —
              this cannot be undone.
            </p>
            {!eraseArmed ? (
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[10px] text-amber-300" onClick={() => setEraseArmed(true)}>
                <Trash2 className="h-3 w-3" /> erase everything
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" className="h-7 gap-1.5 bg-amber-500 text-[10px] text-black hover:bg-amber-400" onClick={eraseEverything}>
                  <Trash2 className="h-3 w-3" /> yes, erase permanently
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setEraseArmed(false)}>
                  cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
