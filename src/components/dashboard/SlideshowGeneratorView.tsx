// asherin.pages — deck kind.
//
// raw notes in, a 16:9 deck out. shepherd proposes the slide split; the
// operator edits every slide by hand; the pdf is a screenshot of each slide at
// 1920×1080, made on this device with html2canvas + jspdf. nothing is uploaded.

import { useState, useRef, useCallback, useEffect } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Presentation, Upload, Download, Sparkles, Image, Loader2, Trash2, Plus, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { streamChat } from "@/lib/ai";
import { ALL_WALLPAPERS, getWallpaperSrc } from "@/lib/wallpapers";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { DECK_LIMITS, LAYOUTS, parseSlides, type Slide } from "@/lib/pages/deck";

const WALLPAPER_KEYS = ["default", "raven", "eclipse", "glitch"] as const;
// a missing key must never crash the room at module load; it is simply not offered.
const WALLPAPERS = WALLPAPER_KEYS.flatMap((k) => {
  const wp = ALL_WALLPAPERS.find((w) => w.key === k);
  return wp ? [{ key: wp.key, label: wp.label.toLowerCase(), src: wp.src }] : [];
});

const SlideshowGeneratorView = () => {
  const isV2 = useIsV2();
  const [rawData, setRawData] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selectedWallpaper, setSelectedWallpaper] = useState("default");
  const [generating, setGenerating] = useState(false);
  const [aiStructuring, setAiStructuring] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const wallpaperSrc = WALLPAPERS.find(w => w.key === selectedWallpaper)?.src || getWallpaperSrc("default");

  // the browser owns fullscreen: escape leaves it without telling our state,
  // so the state follows the document instead of the button.
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > DECK_LIMITS.fileBytes) {
      setNotice(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} mb — notes over 2 mb are not read. paste the part that matters.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setRawData(String(ev.target?.result || ""));
      setNotice(null);
    };
    reader.onerror = () => setNotice(`${file.name} could not be read as text.`);
    reader.readAsText(file);
  };

  const structureWithAI = useCallback(async () => {
    if (!rawData.trim() || aiStructuring) return;
    setAiStructuring(true);
    setNotice(rawData.length > DECK_LIMITS.promptChars ? `only the first ${DECK_LIMITS.promptChars.toLocaleString()} characters of the notes are sent to shepherd.` : null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let result = "";
    try {
      await streamChat({
        messages: [{
          role: "user",
          content: `You are an elite presentation designer who applies cognitive psychology to create maximum-impact slideshows rendered at 1920×1080 (16:9).

PSYCHOLOGY RULES YOU MUST FOLLOW:
1. **Miller's Law**: Max 7±2 items per slide. Bullet slides must have 3-6 points, never more.
2. **Picture Superiority**: Titles must be punchy (≤8 words). Body text ≤25 words per block.
3. **Serial Position Effect**: Put the most important point FIRST and LAST in any list.
4. **Cognitive Load Theory**: One idea per slide. Never cram two concepts together.
5. **Contrast Principle**: Use "quote" layout for the single most powerful insight to create contrast.
6. **Rule of Three**: Group ideas in threes when possible.
7. **Primacy/Recency**: First slide = bold hook. Last slide = memorable call-to-action or takeaway.
8. **Progressive Disclosure**: Build complexity gradually across slides.

TEXT FITTING RULES (critical for 16:9 @ 1920×1080):
- Title slide: title ≤60 chars, subtitle ≤120 chars
- Content slide: title ≤50 chars, body ≤200 chars (3-4 short sentences)
- Bullets slide: title ≤50 chars, each bullet ≤80 chars, max 5 bullets
- Two-column slide: title ≤50 chars, each column 3-4 lines, each line ≤60 chars
- Quote slide: label ≤30 chars, quote ≤150 chars

Return ONLY a valid JSON array. Each slide: { title: string, body: string (use \\n for line breaks), layout: "title" | "content" | "two-column" | "bullets" | "quote" }. Create 5-12 slides. First slide layout "title". Use "bullets" for lists (prefix "- "). Use "quote" for key insights.

Raw data:
${rawData.slice(0, DECK_LIMITS.promptChars)}

Return ONLY the JSON array, no markdown wrapping.`
        }],
        mode: "chat",
        signal: ctrl.signal,
        onDelta: (chunk) => { result += chunk; },
        onReplace: (text) => { result = text; },
        onDone: () => {},
      });
      const parsed = parseSlides(result);
      if (parsed.length) {
        setSlides(parsed);
        setActiveSlide(0);
        setNotice(`${parsed.length} slides proposed — edit any of them below.`);
      } else {
        setNotice("shepherd did not answer with slides this time. send it again, or add slides by hand.");
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        const msg = e instanceof Error ? e.message : "no answer";
        setNotice(`shepherd could not run: ${msg.charAt(0).toLowerCase()}${msg.slice(1)}`);
      }
    }
    if (abortRef.current === ctrl) abortRef.current = null;
    setAiStructuring(false);
  }, [rawData, aiStructuring]);

  const addSlide = (layout: Slide["layout"]) => {
    if (slides.length >= DECK_LIMITS.maxSlides) {
      setNotice(`a deck here holds at most ${DECK_LIMITS.maxSlides} slides.`);
      return;
    }
    const newSlide = { id: `sl-${Date.now()}`, title: "", body: "", layout };
    setSlides(prev => [...prev, newSlide]);
    setActiveSlide(slides.length);
  };

  const updateSlide = (id: string, field: "title" | "body" | "layout", value: string) => {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeSlide = (id: string) => {
    setSlides(prev => {
      const next = prev.filter(s => s.id !== id);
      if (activeSlide >= next.length) setActiveSlide(Math.max(0, next.length - 1));
      return next;
    });
  };

  const exportSlideshow = useCallback(async () => {
    if (slides.length === 0 || generating) return;
    setGenerating(true);
    setNotice(null);
    const remembered = activeSlide;
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, 1080] });
      for (let i = 0; i < slides.length; i++) {
        setActiveSlide(i);
        setNotice(`rendering slide ${i + 1} of ${slides.length}…`);
        await new Promise(r => setTimeout(r, 150));
        if (!slideRef.current) continue;
        const canvas = await html2canvas(slideRef.current, { scale: 2, useCORS: true, backgroundColor: null });
        const imgData = canvas.toDataURL("image/png");
        if (i > 0) pdf.addPage([1920, 1080], "landscape");
        pdf.addImage(imgData, "PNG", 0, 0, 1920, 1080);
      }
      pdf.save("asherin-deck.pdf");
      setNotice(`asherin-deck.pdf saved — ${slides.length} slides.`);
    } catch (e) {
      setNotice(`the deck could not be rendered: ${e instanceof Error ? e.message : "unknown error"}`);
    }
    setActiveSlide(remembered);
    setGenerating(false);
  }, [slides, generating, activeSlide]);

  const currentSlide = slides[activeSlide];

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      fullscreenRef.current?.requestFullscreen?.().catch(() => setNotice("this browser refused fullscreen."));
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  };

  const renderSlideContent = (slide: Slide) => {
    const title = typeof slide.title === "string" ? slide.title : String(slide.title ?? "");
    const body = typeof slide.body === "string" ? slide.body : String(slide.body ?? "");

    switch (slide.layout) {
      case "title":
        return (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ padding: "0 12%" }}>
            <h1 style={{ fontSize: "clamp(32px, 4vw, 56px)", fontWeight: 200, letterSpacing: "0.08em", color: "#fff", marginBottom: 28, lineHeight: 1.15, maxWidth: "85%" }}>{title}</h1>
            <div style={{ width: 60, height: 1, background: "rgba(255,255,255,0.25)", marginBottom: 28 }} />
            <p style={{ fontSize: "clamp(16px, 1.8vw, 22px)", fontWeight: 300, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, maxWidth: "65%" }}>{body}</p>
          </div>
        );
      case "quote":
        return (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ padding: "0 14%" }}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(255,255,255,0.35)", marginBottom: 36, fontWeight: 400 }}>{title}</div>
            <blockquote style={{ fontSize: "clamp(22px, 2.8vw, 34px)", fontWeight: 200, fontStyle: "italic", color: "#fff", lineHeight: 1.55, maxWidth: "75%", borderLeft: "2px solid rgba(255,255,255,0.2)", paddingLeft: 36 }}>
              "{body}"
            </blockquote>
          </div>
        );
      case "bullets": {
        const items = body.split("\n").filter(l => l.trim());
        return (
          <div className="flex flex-col justify-center h-full" style={{ padding: "0 10% 0 12%" }}>
            <h2 style={{ fontSize: "clamp(24px, 3vw, 38px)", fontWeight: 200, letterSpacing: "0.05em", color: "#fff", marginBottom: 44 }}>{title}</h2>
            <ul style={{ paddingLeft: 0, listStyle: "none", maxWidth: "90%" }}>
              {items.slice(0, 6).map((item, i) => (
                <li key={i} style={{ fontSize: "clamp(15px, 1.6vw, 21px)", fontWeight: 300, lineHeight: 1.6, color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "baseline", gap: 18, marginBottom: 16 }}>
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.35)", flexShrink: 0, marginTop: 10 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.replace(/^[-•*]\s*/, "")}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      }
      case "two-column": {
        const lines = body.split("\n").filter(l => l.trim());
        const mid = Math.ceil(lines.length / 2);
        return (
          <div className="flex flex-col justify-center h-full" style={{ padding: "0 10% 0 12%" }}>
            <h2 style={{ fontSize: "clamp(24px, 3vw, 38px)", fontWeight: 200, letterSpacing: "0.05em", color: "#fff", marginBottom: 44 }}>{title}</h2>
            <div style={{ display: "flex", gap: 48 }}>
              <div style={{ flex: 1 }}>
                {lines.slice(0, mid).map((l, i) => (
                  <p key={i} style={{ fontSize: "clamp(14px, 1.4vw, 18px)", fontWeight: 300, lineHeight: 1.85, color: "rgba(255,255,255,0.8)", marginBottom: 14, overflow: "hidden", textOverflow: "ellipsis" }}>{l}</p>
                ))}
              </div>
              <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />
              <div style={{ flex: 1 }}>
                {lines.slice(mid).map((l, i) => (
                  <p key={i} style={{ fontSize: "clamp(14px, 1.4vw, 18px)", fontWeight: 300, lineHeight: 1.85, color: "rgba(255,255,255,0.8)", marginBottom: 14, overflow: "hidden", textOverflow: "ellipsis" }}>{l}</p>
                ))}
              </div>
            </div>
          </div>
        );
      }
      default:
        return (
          <div className="flex flex-col justify-center h-full" style={{ padding: "0 10% 0 12%" }}>
            <h2 style={{ fontSize: "clamp(24px, 3vw, 38px)", fontWeight: 200, letterSpacing: "0.05em", color: "#fff", marginBottom: 36 }}>{title}</h2>
            <p style={{ fontSize: "clamp(15px, 1.6vw, 20px)", fontWeight: 300, lineHeight: 1.85, color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap", maxWidth: "85%" }}>{body}</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* header — in v.2 the shell already names the room; keep only the actions */}
      <div className="flex-shrink-0 border-b border-border/20 bg-card/20 backdrop-blur-sm px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {!isV2 && <Presentation className="h-5 w-5 text-accent" />}
            <div className="min-w-0">
              {!isV2 && <h1 className="text-lg font-extralight text-foreground">deck</h1>}
              <p className="truncate text-[10px] font-extralight text-muted-foreground/60">
                {slides.length ? `${slides.length} slides · 16:9 · rendered on this device` : "slides you present. you keep the pdf."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {slides.length > 0 && (
              <button onClick={toggleFullscreen} type="button" aria-pressed={isFullscreen}
                className="flex items-center gap-2 rounded-lg border border-border/20 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Maximize2 className="h-3.5 w-3.5" /> {isFullscreen ? "leave" : "present"}
              </button>
            )}
            <button onClick={exportSlideshow} type="button" disabled={slides.length === 0 || generating}
              title={slides.length === 0 ? "add a slide first" : "render every slide to one pdf"}
              className="flex items-center gap-2 rounded-lg bg-accent/20 px-4 py-2 text-xs text-accent hover:bg-accent/30 transition-colors disabled:opacity-40">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {generating ? "rendering…" : "compile pdf"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* left: notes */}
        <div className="w-full lg:w-[380px] xl:w-[420px] border-b lg:border-b-0 lg:border-r border-border/10 flex flex-col overflow-y-auto p-4 space-y-4 max-h-[46dvh] lg:max-h-none">
          <div>
            <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 mb-2">background</p>
            <div className="flex gap-2">
              {WALLPAPERS.map(wp => (
                <button key={wp.key} type="button" onClick={() => setSelectedWallpaper(wp.key)} aria-pressed={selectedWallpaper === wp.key}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all w-16 h-10 ${selectedWallpaper === wp.key ? "border-accent/50 ring-1 ring-accent/20" : "border-border/20 hover:border-border/40"}`}>
                  <img src={wp.src} alt={wp.label} className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-end justify-center pb-0.5 bg-gradient-to-t from-black/60 to-transparent">
                    <span className="text-[8px] font-light text-white/90">{wp.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60">notes</p>
              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()} type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-border/20 px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <Upload className="h-3 w-3" /> open a text file
                </button>
                <button onClick={structureWithAI} type="button" disabled={!rawData.trim() || aiStructuring}
                  title={!rawData.trim() ? "paste some notes first" : "ask shepherd to split the notes into slides"}
                  className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-[10px] text-accent hover:bg-accent/25 transition-colors disabled:opacity-40">
                  {aiStructuring ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {aiStructuring ? "splitting…" : "propose slides"}
                </button>
              </div>
            </div>
            <input ref={fileInputRef} type="file" className="hidden" accept=".txt,.md,.csv,.json,.xml" onChange={handleFileUpload} />
            <textarea value={rawData} onChange={e => setRawData(e.target.value)}
              aria-label="notes for the deck"
              placeholder="paste notes. shepherd proposes the slides; you edit them."
              className="w-full h-32 bg-card/30 border border-border/20 rounded-xl p-3 text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/30 resize-none" />
            {notice && (
              <p role="status" aria-live="polite" className="mt-2 text-[11px] font-light text-muted-foreground/80">{notice}</p>
            )}
          </div>

          <div>
            <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 mb-2">add a slide</p>
            <div className="flex flex-wrap gap-1">
              {LAYOUTS.map(l => (
                <button key={l.value} type="button" onClick={() => addSlide(l.value)}
                  className="flex items-center gap-1 rounded-lg border border-border/20 px-2.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="h-2.5 w-2.5" /> {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* slide list — a row is a button; the trash is a sibling, never a button inside a button */}
          <div className="space-y-2 flex-1" role="list" aria-label="slides">
            {slides.map((slide, idx) => (
              <div key={slide.id} role="listitem"
                className={`flex w-full items-start gap-2 rounded-xl border p-3 transition-all ${idx === activeSlide ? "border-accent/40 bg-accent/5" : "border-border/20 bg-card/20 hover:border-border/40"}`}>
                <button type="button" onClick={() => setActiveSlide(idx)} aria-current={idx === activeSlide ? "true" : undefined} className="min-w-0 flex-1 text-left">
                  <span className="block text-[9px] font-light tracking-[0.1em] text-accent/60 mb-1">slide {idx + 1} · {LAYOUTS.find((l) => l.value === slide.layout)?.label ?? slide.layout}</span>
                  <span className="block text-xs font-light text-foreground truncate">{slide.title || "untitled"}</span>
                </button>
                <button type="button" onClick={() => removeSlide(slide.id)} aria-label={`remove slide ${idx + 1}`}
                  className="min-h-8 min-w-8 inline-flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-destructive transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {slides.length === 0 && (
              <div className="text-center py-8 text-muted-foreground/40 text-xs font-light">
                no slides yet. paste notes and tap “propose slides”, or add one by hand.
              </div>
            )}
          </div>
        </div>

        {/* right: preview + editor */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto p-4 gap-4">
          <div className="flex-1 min-h-0 flex items-center justify-center" ref={fullscreenRef}>
            <div className="relative w-full" style={{ maxWidth: 960, aspectRatio: "16/9" }}>
              <div ref={slideRef}
                className="absolute inset-0 rounded-xl overflow-hidden"
                style={{ aspectRatio: "16/9" }}>
                <img src={wallpaperSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.35)" }} />
                <div className="relative z-10 w-full h-full">
                  {currentSlide ? renderSlideContent(currentSlide) : (
                    <div className="flex flex-col items-center justify-center h-full text-white/30">
                      <Image className="h-12 w-12 mb-3" aria-hidden="true" />
                      <p className="text-sm font-light">the slide shows here</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {slides.length > 0 && (
            <div className="flex items-center justify-center gap-4">
              <button type="button" aria-label="previous slide" onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))} disabled={activeSlide === 0}
                className="rounded-lg border border-border/20 p-2 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-light text-muted-foreground tracking-wide">
                {activeSlide + 1} / {slides.length}
              </span>
              <button type="button" aria-label="next slide" onClick={() => setActiveSlide(Math.min(slides.length - 1, activeSlide + 1))} disabled={activeSlide === slides.length - 1}
                className="rounded-lg border border-border/20 p-2 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {currentSlide && (
            <div className="rounded-xl border border-border/20 bg-card/20 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <select value={currentSlide.layout} aria-label="slide layout"
                  onChange={e => updateSlide(currentSlide.id, "layout", e.target.value)}
                  className="bg-card/30 border border-border/20 rounded-lg px-2 py-1 text-[10px] font-light text-foreground outline-none">
                  {LAYOUTS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <input value={currentSlide.title} aria-label="slide title"
                  onChange={e => updateSlide(currentSlide.id, "title", e.target.value)}
                  placeholder="slide title"
                  className="flex-1 bg-transparent text-sm font-light text-foreground outline-none placeholder:text-muted-foreground/30" />
              </div>
              <textarea value={currentSlide.body} aria-label="slide body"
                onChange={e => updateSlide(currentSlide.id, "body", e.target.value)}
                placeholder="slide body — one line per bullet or column row"
                className="w-full bg-transparent text-xs font-light text-foreground outline-none resize-none min-h-[80px] placeholder:text-muted-foreground/30" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SlideshowGeneratorView;
