import { useState, useRef, useCallback } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Presentation, Upload, Download, Sparkles, Image, Loader2, Trash2, Plus, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { streamChat } from "@/lib/ai";
import { ALL_WALLPAPERS, getWallpaperSrc } from "@/lib/wallpapers";

const WALLPAPER_KEYS = ["default", "raven", "eclipse", "glitch"] as const;
const WALLPAPERS = WALLPAPER_KEYS.map((k) => {
  const wp = ALL_WALLPAPERS.find((w) => w.key === k)!;
  return { key: wp.key, label: wp.label, src: wp.src };
});


interface Slide {
  id: string;
  title: string;
  body: string;
  layout: "title" | "content" | "two-column" | "bullets" | "quote";
}

const LAYOUTS: { value: Slide["layout"]; label: string }[] = [
  { value: "title", label: "Title Slide" },
  { value: "content", label: "Content" },
  { value: "two-column", label: "Two Column" },
  { value: "bullets", label: "Bullet Points" },
  { value: "quote", label: "Quote" },
];

const SlideshowGeneratorView = () => {
  const [rawData, setRawData] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selectedWallpaper, setSelectedWallpaper] = useState("default");
  const [generating, setGenerating] = useState(false);
  const [aiStructuring, setAiStructuring] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  const wallpaperSrc = WALLPAPERS.find(w => w.key === selectedWallpaper)?.src || getWallpaperSrc("default");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setRawData(ev.target?.result as string);
    reader.readAsText(file);
    e.target.value = "";
  };

  const structureWithAI = useCallback(async () => {
    if (!rawData.trim()) return;
    setAiStructuring(true);
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
${rawData.slice(0, 8000)}

Return ONLY the JSON array, no markdown wrapping.`
        }],
        mode: "chat",
        onDelta: (chunk) => { result += chunk; },
        onReplace: (text) => { result = text; },
        onDone: () => {
          try {
            const jsonMatch = result.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as Slide[];
              setSlides(parsed.map((s, i) => ({ ...s, id: `sl-${i}-${Date.now()}` })));
              setActiveSlide(0);
            }
          } catch {
            setSlides([{ id: `sl-0-${Date.now()}`, title: "Slide 1", body: result, layout: "content" }]);
          }
          setAiStructuring(false);
        },
      });
    } catch {
      setAiStructuring(false);
    }
  }, [rawData]);

  const addSlide = (layout: Slide["layout"]) => {
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
    if (slides.length === 0) return;
    setGenerating(true);
    try {
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, 1080] });
      for (let i = 0; i < slides.length; i++) {
        setActiveSlide(i);
        await new Promise(r => setTimeout(r, 150));
        if (!slideRef.current) continue;
        const canvas = await html2canvas(slideRef.current, { scale: 2, useCORS: true, backgroundColor: null });
        const imgData = canvas.toDataURL("image/png");
        if (i > 0) pdf.addPage([1920, 1080], "landscape");
        pdf.addImage(imgData, "PNG", 0, 0, 1920, 1080);
      }
      pdf.save("asherin-slides.pdf");
    } catch (e) {
      console.error("Slideshow export error:", e);
    }
    setGenerating(false);
  }, [slides]);

  const currentSlide = slides[activeSlide];

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      fullscreenRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
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
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border/20 bg-card/20 backdrop-blur-sm px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Presentation className="h-5 w-5 text-accent" />
            <div>
              <h1 className="text-lg font-extralight text-foreground">asherin.slides</h1>
              <p className="text-[10px] font-extralight text-muted-foreground/60 uppercase hidden sm:block">presentation builder</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {slides.length > 0 && (
              <button onClick={toggleFullscreen}
                className="flex items-center gap-2 rounded-lg border border-border/20 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Maximize2 className="h-3.5 w-3.5" /> Present
              </button>
            )}
            <button onClick={exportSlideshow} disabled={slides.length === 0 || generating}
              className="flex items-center gap-2 rounded-lg bg-accent/20 px-4 py-2 text-xs text-accent hover:bg-accent/30 transition-colors disabled:opacity-40">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download PDF
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Input Panel */}
        <div className="w-full lg:w-[380px] xl:w-[420px] border-r border-border/10 flex flex-col overflow-y-auto p-4 space-y-4">
          {/* Wallpaper Selector */}
          <div>
            <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-2">Background Theme</p>
            <div className="flex gap-2">
              {WALLPAPERS.map(wp => (
                <button key={wp.key} onClick={() => setSelectedWallpaper(wp.key)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all w-16 h-10 ${selectedWallpaper === wp.key ? "border-accent/50 ring-1 ring-accent/20" : "border-border/20 hover:border-border/40"}`}>
                  <img src={wp.src} alt={wp.label} className="w-full h-full object-cover" />
                  <span className="absolute inset-0 flex items-end justify-center pb-0.5 bg-gradient-to-t from-black/60 to-transparent">
                    <span className="text-[8px] font-light text-white/90">{wp.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Raw Data Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase">Raw Data</p>
              <div className="flex gap-2">
                <button onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-lg border border-border/20 px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <Upload className="h-3 w-3" /> Upload
                </button>
                <button onClick={structureWithAI} disabled={!rawData.trim() || aiStructuring}
                  className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-[10px] text-accent hover:bg-accent/25 transition-colors disabled:opacity-40">
                  {aiStructuring ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Generate Slides
                </button>
              </div>
            </div>
            <input ref={fileInputRef} type="file" className="hidden" accept=".txt,.md,.csv,.json,.xml" onChange={handleFileUpload} />
            <textarea value={rawData} onChange={e => setRawData(e.target.value)}
              placeholder="Paste or upload data… AI will structure it into presentation slides."
              className="w-full h-32 bg-card/30 border border-border/20 rounded-xl p-3 text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/30 resize-none" />
          </div>

          {/* Add Slide */}
          <div>
            <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-2">Add Slide</p>
            <div className="flex flex-wrap gap-1">
              {LAYOUTS.map(l => (
                <button key={l.value} onClick={() => addSlide(l.value)}
                  className="flex items-center gap-1 rounded-lg border border-border/20 px-2.5 py-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="h-2.5 w-2.5" /> {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Slide List */}
          <div className="space-y-2 flex-1">
            {slides.map((slide, idx) => (
              <button key={slide.id} onClick={() => setActiveSlide(idx)}
                className={`w-full text-left rounded-xl border p-3 transition-all ${idx === activeSlide ? "border-accent/40 bg-accent/5" : "border-border/20 bg-card/20 hover:border-border/40"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-light tracking-[0.1em] text-accent/60 uppercase">Slide {idx + 1} · {slide.layout}</span>
                  <button onClick={e => { e.stopPropagation(); removeSlide(slide.id); }} className="text-muted-foreground/30 hover:text-destructive transition-colors">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs font-light text-foreground truncate">{slide.title || "Untitled"}</p>
              </button>
            ))}
            {slides.length === 0 && (
              <div className="text-center py-8 text-muted-foreground/30 text-xs font-light">
                Paste data and click "Generate Slides" or add slides manually
              </div>
            )}
          </div>
        </div>

        {/* Right: Slide Preview + Editor */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
          {/* Slide Canvas */}
          <div className="flex-1 min-h-0 flex items-center justify-center" ref={fullscreenRef}>
            <div className="relative w-full" style={{ maxWidth: 960, aspectRatio: "16/9" }}>
              <div ref={slideRef}
                className="absolute inset-0 rounded-xl overflow-hidden"
                style={{ aspectRatio: "16/9" }}>
                {/* Wallpaper - VISIBLE, not dimmed */}
                <img src={wallpaperSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
                {/* Light overlay for text readability */}
                <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.35)" }} />
                {/* Slide content */}
                <div className="relative z-10 w-full h-full">
                  {currentSlide ? renderSlideContent(currentSlide) : (
                    <div className="flex flex-col items-center justify-center h-full text-white/20">
                      <Image className="h-12 w-12 mb-3" />
                      <p className="text-sm font-light">Slide preview</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          {slides.length > 0 && (
            <div className="flex items-center justify-center gap-4">
              <button onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))} disabled={activeSlide === 0}
                className="rounded-lg border border-border/20 p-2 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-light text-muted-foreground tracking-wide">
                {activeSlide + 1} / {slides.length}
              </span>
              <button onClick={() => setActiveSlide(Math.min(slides.length - 1, activeSlide + 1))} disabled={activeSlide === slides.length - 1}
                className="rounded-lg border border-border/20 p-2 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Inline Editor for active slide */}
          {currentSlide && (
            <div className="rounded-xl border border-border/20 bg-card/20 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <select value={currentSlide.layout}
                  onChange={e => updateSlide(currentSlide.id, "layout", e.target.value)}
                  className="bg-card/30 border border-border/20 rounded-lg px-2 py-1 text-[10px] font-light text-foreground outline-none">
                  {LAYOUTS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <input value={currentSlide.title}
                  onChange={e => updateSlide(currentSlide.id, "title", e.target.value)}
                  placeholder="Slide title…"
                  className="flex-1 bg-transparent text-sm font-light text-foreground outline-none placeholder:text-muted-foreground/30" />
              </div>
              <textarea value={currentSlide.body}
                onChange={e => updateSlide(currentSlide.id, "body", e.target.value)}
                placeholder="Slide body content…"
                className="w-full bg-transparent text-xs font-light text-foreground outline-none resize-none min-h-[80px] placeholder:text-muted-foreground/30" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SlideshowGeneratorView;
