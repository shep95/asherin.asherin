import { useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, MessageSquareQuote, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { invokeWithByokRetry } from "@/lib/byokInvoke";
import type { HealthRecord } from "@/lib/health/store";
import {
  CATEGORY_LABEL,
  SEVERITY_LABEL,
  confidencePhrase,
  dropPhotoFromRead,
  groupFindings,
  needsClinician,
  normaliseRead,
  quoteFinding,
  replacePhotoInRead,
  type PhotoInRead,
} from "@/lib/health/photoRead";

const MAX_PHOTOS = 4;

interface Props {
  record: HealthRecord;
  persist: (r: HealthRecord) => void;
  resolveByok: () => Promise<Record<string, string> | undefined>;
  /** hands a line to the room's assistant — this is how a quoted finding gets answered. */
  onAsk: (line: string) => void;
}

/** photographs are shrunk on device before they leave it: smaller payload, faster read, less exposed. */
async function fileToPhoto(file: File): Promise<PhotoInRead> {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1280;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw new Error("this browser could not process the photograph.");
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    label: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "photograph",
    width: w,
    height: h,
    dataUrl: canvas.toDataURL("image/jpeg", 0.82),
  };
}

function splitDataUrl(dataUrl: string): { mime: string; b64: string } {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  return { mime, b64: b64 ?? "" };
}

const SEVERITY_STYLE = {
  clinician: "border-amber-400/30 bg-amber-400/[0.07] text-amber-100/90",
  watch: "border-white/10 bg-white/[0.04] text-foreground/80",
  routine: "border-white/[0.06] bg-white/[0.02] text-foreground/70",
} as const;

/**
 * the room's open door for photographs. the person brings whatever they have,
 * says what they want looked at, and the read-out comes back organised: plain
 * first, detail underneath, every line traceable to the photograph it came from
 * and quotable straight into the assistant.
 */
export default function PhotoReadPanel({ record, persist, resolveByok, onAsk }: Props) {
  const [photos, setPhotos] = useState<PhotoInRead[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [askDraft, setAskDraft] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const swapInput = useRef<HTMLInputElement>(null);
  // which staged photo, or which photograph inside which stored read-out, the
  // next file picked should stand in for.
  const [swapTarget, setSwapTarget] = useState<{ kind: "staged"; id: string } | { kind: "read"; readId: string; index: number } | null>(null);

  const reads = record.photoReads ?? [];
  const latest = reads[0];
  const groups = useMemo(() => (latest ? groupFindings(latest.findings) : []), [latest]);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      toast.error(`four photographs at a time. remove one first.`);
      return;
    }
    const chosen = Array.from(files).slice(0, room);
    const skipped = Array.from(files).length - chosen.length;
    try {
      const next = await Promise.all(chosen.filter((f) => f.type.startsWith("image/")).map(fileToPhoto));
      if (next.length === 0) {
        toast.error("those files are not images. jpeg, png or webp.");
        return;
      }
      setPhotos((p) => [...p, ...next]);
      if (skipped > 0) toast.message(`${skipped} photo${skipped > 1 ? "s" : ""} left out — four at a time.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "those photographs could not be opened.");
    }
  };

  const run = async () => {
    if (photos.length === 0 || busy) return;
    setBusy(true);
    try {
      const byok = await resolveByok();
      const data = await invokeWithByokRetry<Record<string, unknown>>("asherin-health-ai", {
        body: {
          action: "photo.read",
          prompt,
          images: photos.map((p) => ({ view: p.label.slice(0, 12), ...splitDataUrl(p.dataUrl) })),
          ...(byok ? { byok } : {}),
        },
      });
      if (data?.error) throw new Error(String(data.error));
      const read = normaliseRead(data, photos, prompt);
      if (read.findings.length === 0) {
        toast.error("nothing in those photographs could be read into a finding. try closer, in even light.");
        return;
      }
      // newest first, and the log is bounded: a health record that grows without
      // limit stops opening on the device it is meant to live on.
      persist({ ...record, photoReads: [read, ...reads].slice(0, 20) });
      setOpenId(read.findings[0]?.id ?? null);
      setPhotos([]);
      setPrompt("");
      onAsk(
        `i just had ${read.photos.length} photograph${read.photos.length > 1 ? "s" : ""} read. the read-out says: ${read.summary || read.findings[0].plain}. tell me what matters most in that and what to do next.`,
      );
      if (needsClinician(read)) toast.warning("something in that read-out belongs in front of a clinician.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "the reading failed.");
    } finally {
      setBusy(false);
    }
  };

  const applySwap = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !swapTarget) return;
    if (!file.type.startsWith("image/")) {
      toast.error("that file is not an image. jpeg, png or webp.");
      return;
    }
    try {
      const next = await fileToPhoto(file);
      if (swapTarget.kind === "staged") {
        setPhotos((list) => list.map((x) => (x.id === swapTarget.id ? { ...next, id: x.id } : x)));
        toast.message("photograph swapped.");
      } else {
        const target = reads.find((r) => r.id === swapTarget.readId);
        if (!target) return;
        const updated = replacePhotoInRead(target, swapTarget.index, next);
        persist({ ...record, photoReads: reads.map((r) => (r.id === updated.id ? updated : r)) });
        toast.message("photograph replaced — the lines read from the old one were removed with it.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "that photograph could not be opened.");
    } finally {
      setSwapTarget(null);
    }
  };

  const pickSwap = (target: NonNullable<typeof swapTarget>) => {
    setSwapTarget(target);
    swapInput.current?.click();
  };

  const removeReadPhoto = (readId: string, index: number) => {
    const target = reads.find((r) => r.id === readId);
    if (!target) return;
    const updated = dropPhotoFromRead(target, index);
    persist({
      ...record,
      photoReads: updated
        ? reads.map((r) => (r.id === readId ? updated : r))
        : reads.filter((r) => r.id !== readId),
    });
    toast.message(updated ? "photograph deleted, along with the lines read from it." : "that was the last photograph, so the read-out went with it.");
  };

  return (
    <div className="space-y-4">
      <input
        ref={swapInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          void applySwap(e.target.files);
          e.target.value = "";
        }}
      />
      <div>
        <p className="text-[11px] font-light leading-relaxed text-foreground/55">
          hand over photographs and say what you want looked at. the read-out comes back in plain words, every line tied to the
          photograph it came from. this describes what is visible — it does not diagnose, and the photographs stay on this device
          apart from the single reading you start.
        </p>
      </div>

      <div className="space-y-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full justify-start gap-2 text-xs"
          disabled={busy || photos.length >= MAX_PHOTOS}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {photos.length === 0 ? "add photographs" : `add more · ${photos.length}/${MAX_PHOTOS}`}
        </Button>

        {photos.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {photos.map((p) => (
              <div key={p.id} className="group relative overflow-hidden rounded-lg border border-white/10">
                <img src={p.dataUrl} alt={p.label} className="h-16 w-full object-cover" />
                <div className="absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    onClick={() => pickSwap({ kind: "staged", id: p.id })}
                    className="rounded-full bg-black/70 p-0.5 text-foreground/70 hover:text-foreground"
                    aria-label={`replace ${p.label}`}
                    title="replace this photograph"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setPhotos((list) => list.filter((x) => x.id !== p.id))}
                    className="rounded-full bg-black/70 p-0.5 text-foreground/70 hover:text-foreground"
                    aria-label={`remove ${p.label}`}
                    title="remove this photograph"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
          placeholder="what do you want looked at? e.g. does my left shoulder sit lower, and is this patch on my arm changing?"
          className="min-h-[74px] resize-none border-white/10 bg-white/[0.02] text-xs font-light"
          disabled={busy}
        />

        <Button size="sm" className="h-8 w-full gap-2 text-xs" disabled={busy || photos.length === 0} onClick={() => void run()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {busy ? "reading the photographs" : "read these"}
        </Button>
      </div>

      {latest && (
        <div className="space-y-3 border-t border-white/[0.06] pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">read-out</p>
            <p className="text-[10px] font-light text-foreground/35">{new Date(latest.createdAt).toLocaleString()}</p>
          </div>

          {latest.summary && <p className="text-[11px] font-light leading-relaxed text-foreground/75">{latest.summary}</p>}

          <div className="grid grid-cols-4 gap-1.5">
            {latest.photos.map((p, i) => (
              <div key={p.id} className="group relative overflow-hidden rounded-lg border border-white/10">
                <img src={p.dataUrl} alt={p.label} className="h-16 w-full object-cover" />
                <div className="absolute right-0.5 top-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    onClick={() => pickSwap({ kind: "read", readId: latest.id, index: i })}
                    className="rounded-full bg-black/70 p-0.5 text-foreground/70 hover:text-foreground"
                    aria-label={`replace ${p.label}`}
                    title="replace this photograph"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeReadPhoto(latest.id, i)}
                    className="rounded-full bg-black/70 p-0.5 text-foreground/70 hover:text-foreground"
                    aria-label={`delete ${p.label}`}
                    title="delete this photograph"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] font-light leading-relaxed text-foreground/40">
            deleting a photograph also removes the lines that were read from it — a finding with no image behind it is a claim
            nothing can back up.
          </p>

          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-[10px] text-foreground/50"
              onClick={() => persist({ ...record, photoReads: reads.filter((r) => r.id !== latest.id) })}
            >
              <Trash2 className="h-3 w-3" /> delete this read-out
            </Button>
          </div>

          {groups.map((g) => (
            <div key={g.category} className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/35">{CATEGORY_LABEL[g.category]}</p>
              {g.items.map((f) => {
                const open = openId === f.id;
                const photo = f.photoIndex >= 0 ? latest.photos[f.photoIndex] : undefined;
                return (
                  <div key={f.id} className={cn("rounded-xl border p-2.5", SEVERITY_STYLE[f.severity])}>
                    <button className="w-full text-left" onClick={() => setOpenId(open ? null : f.id)}>
                      <p className="text-[11px] font-light">{f.title}</p>
                      <p className="mt-1 text-[11px] font-light leading-relaxed opacity-80">{f.plain}</p>
                    </button>
                    <p className="mt-1.5 text-[10px] font-light opacity-55">
                      {SEVERITY_LABEL[f.severity]} · {confidencePhrase(f)}
                      {photo ? ` · from "${photo.label}"` : " · photograph not identified"}
                    </p>

                    {open && (
                      <div className="mt-2 space-y-2 border-t border-white/[0.07] pt-2">
                        {f.detail && <p className="text-[11px] font-light leading-relaxed opacity-75">{f.detail}</p>}
                        {photo && <img src={photo.dataUrl} alt={photo.label} className="max-h-40 w-full rounded-lg object-contain" />}
                        {f.regions.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {f.regions.map((r) => (
                              <span key={r} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-light opacity-70">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                        <Textarea
                          value={askDraft[f.id] ?? ""}
                          onChange={(e) => setAskDraft((d) => ({ ...d, [f.id]: e.target.value.slice(0, 400) }))}
                          placeholder="ask about this line…"
                          className="min-h-[46px] resize-none border-white/10 bg-black/20 text-[11px] font-light"
                        />
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 text-[10px]"
                            onClick={() => onAsk(quoteFinding(latest, f, askDraft[f.id]))}
                          >
                            <MessageSquareQuote className="h-3 w-3" /> ask asherin about this
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="space-y-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/35">what this could not see</p>
            {latest.limits.map((l) => (
              <p key={l} className="text-[10px] font-light leading-relaxed text-foreground/55">
                {l}
              </p>
            ))}
          </div>

          {latest.questions.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/35">to get further</p>
              {latest.questions.map((q) => (
                <button
                  key={q}
                  onClick={() => onAsk(q)}
                  className="block w-full rounded-lg border border-white/[0.06] px-2 py-1.5 text-left text-[10px] font-light text-foreground/60 hover:bg-white/[0.03]"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {reads.length > 1 && (
        <div className="space-y-1 border-t border-white/[0.06] pt-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/35">earlier read-outs</p>
          {reads.slice(1).map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <p className="flex-1 text-[10px] font-light text-foreground/45">
                {new Date(r.createdAt).toLocaleDateString()} · {r.photos.length} photo{r.photos.length > 1 ? "s" : ""} ·{" "}
                {r.findings.length} finding{r.findings.length > 1 ? "s" : ""}
              </p>
              <button
                onClick={() => persist({ ...record, photoReads: reads.filter((x) => x.id !== r.id) })}
                className="rounded-full p-1 text-foreground/40 hover:text-foreground/80"
                aria-label="delete this read-out"
                title="delete this read-out"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
