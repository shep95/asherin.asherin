import { useState, useRef, useCallback, useEffect } from "react";
import { BookOpen, Upload, FileText, Sparkles, Download, Loader2, ArrowRight, ArrowLeft, Settings2, Eye, ChevronDown, ChevronUp, Trash2, GripVertical, Plus, FolderOpen, Clock, X } from "lucide-react";
import { streamChat } from "@/lib/ai";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { jsPDF } from "jspdf";
import { useToast } from "@/hooks/use-toast";
import type { EBookChapter, EBookMetadata, EBookSettings, EBookStep, EBookSession, EBookTextUpload } from "./types";

import { getWallpaperSrc } from "@/lib/wallpapers";
const heroBgDefault = getWallpaperSrc("default");
import { ALL_WALLPAPERS as WALLPAPERS } from "@/lib/wallpapers";

const PAGE_SIZES = {
  a4: { w: 595.28, h: 841.89, label: "A4 (210×297mm)" },
  letter: { w: 612, h: 792, label: "US Letter (8.5×11\")" },
  paperback: { w: 432, h: 648, label: "6×9\" Paperback" },
};

const DEFAULT_METADATA: EBookMetadata = {
  title: "", subtitle: "", author: "", description: "",
  dedication: "", copyright: "", aboutAuthor: "",
};

const DEFAULT_SETTINGS: EBookSettings = {
  buildMode: "ai",
  wallpaper: "default", pageSize: "a4", fontSize: 12, lineSpacing: 1.5,
  chapterCount: "auto", tone: "formal",
  includeTableOfContents: true, includeChapterSummaries: true,
  includeDedication: false, includeAboutAuthor: false, includeCopyright: true,
  rewriteForConsistency: false, fixGrammar: true, removeDuplicates: false,
  includeDiagrams: false,
};

const EBookGeneratorView = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Session management
  const [sessions, setSessions] = useState<EBookSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showSessionList, setShowSessionList] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // Current book state
  const [step, setStep] = useState<EBookStep>("upload");
  const [metadata, setMetadata] = useState<EBookMetadata>({ ...DEFAULT_METADATA });
  const [settings, setSettings] = useState<EBookSettings>({ ...DEFAULT_SETTINGS });
  const [chapters, setChapters] = useState<EBookChapter[]>([]);
  const [textUploads, setTextUploads] = useState<EBookTextUpload[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [exporting, setExporting] = useState(false);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fixingGrammar, setFixingGrammar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wallpaperSrc = WALLPAPERS.find(w => w.key === settings.wallpaper)?.src || heroBgDefault;
  const totalWords = textUploads.reduce((sum, u) => sum + u.wordCount, 0);
  const estimatedPages = Math.max(1, Math.ceil(totalWords / 250));

  // ── Load sessions on mount ──
  useEffect(() => {
    if (!user) return;
    loadSessions();
  }, [user]);

  const loadSessions = async () => {
    if (!user) return;
    setSessionsLoading(true);
    const { data } = await supabase
      .from("ebook_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (data) {
      setSessions(data.map(s => ({
        id: s.id,
        title: s.title,
        subtitle: s.subtitle || "",
        author: s.author || "",
        description: s.description || "",
        dedication: s.dedication || "",
        copyright: s.copyright || "",
        aboutAuthor: s.about_author || "",
        settings: (s.settings as unknown as EBookSettings) || { ...DEFAULT_SETTINGS },
        chapters: (s.chapters as unknown as EBookChapter[]) || [],
        status: s.status,
        createdAt: new Date(s.created_at),
        updatedAt: new Date(s.updated_at),
      })));
    }
    setSessionsLoading(false);
  };

  // ── Load a session's text uploads ──
  const loadTextUploads = async (sessionId: string) => {
    if (!user) return;
    const { data } = await supabase
      .from("ebook_text_uploads")
      .select("*")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (data) {
      setTextUploads(data.map(u => ({
        id: u.id,
        sessionId: u.session_id,
        fileName: u.file_name,
        content: u.content,
        wordCount: u.word_count,
        createdAt: new Date(u.created_at),
      })));
    }
  };

  // ── Create new session ──
  const createSession = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("ebook_sessions")
      .insert({ user_id: user.id, title: "Untitled Book", settings: DEFAULT_SETTINGS as any, chapters: [] as any })
      .select()
      .single();

    if (data) {
      const session: EBookSession = {
        id: data.id, title: data.title, subtitle: "", author: "", description: "",
        dedication: "", copyright: "", aboutAuthor: "",
        settings: { ...DEFAULT_SETTINGS }, chapters: [],
        status: "draft", createdAt: new Date(data.created_at), updatedAt: new Date(data.updated_at),
      };
      setSessions(prev => [session, ...prev]);
      openSession(session);
      toast({ title: "New book created" });
    }
  };

  // ── Open session ──
  const openSession = (session: EBookSession) => {
    setActiveSessionId(session.id);
    setMetadata({
      title: session.title, subtitle: session.subtitle, author: session.author,
      description: session.description, dedication: session.dedication,
      copyright: session.copyright, aboutAuthor: session.aboutAuthor,
    });
    setSettings(session.settings || { ...DEFAULT_SETTINGS });
    setChapters(session.chapters || []);
    setStep(session.chapters.length > 0 ? "preview" : "upload");
    setShowSessionList(false);
    setPasteText("");
    loadTextUploads(session.id);
  };

  // ── Delete session ──
  const deleteSession = async (id: string) => {
    await supabase.from("ebook_text_uploads").delete().eq("session_id", id);
    await supabase.from("ebook_sessions").delete().eq("id", id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setShowSessionList(true);
    }
    toast({ title: "Book deleted" });
  };

  // ── Auto-save session (debounced) ──
  const saveSession = useCallback(async () => {
    if (!activeSessionId || !user) return;
    setSaving(true);
    await supabase.from("ebook_sessions").update({
      title: metadata.title || "Untitled Book",
      subtitle: metadata.subtitle,
      author: metadata.author,
      description: metadata.description,
      dedication: metadata.dedication,
      copyright: metadata.copyright,
      about_author: metadata.aboutAuthor,
      settings: settings as any,
      chapters: chapters as any,
      status: chapters.length > 0 ? "structured" : "draft",
    }).eq("id", activeSessionId);
    setSaving(false);

    // Update local sessions list
    setSessions(prev => prev.map(s => s.id === activeSessionId ? {
      ...s, title: metadata.title || "Untitled Book", subtitle: metadata.subtitle,
      author: metadata.author, description: metadata.description,
      settings, chapters, updatedAt: new Date(),
    } : s));
  }, [activeSessionId, user, metadata, settings, chapters]);

  // Debounced auto-save on metadata/settings/chapters change
  useEffect(() => {
    if (!activeSessionId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveSession(), 1500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [metadata, settings, chapters, activeSessionId, saveSession]);

  // ── Add text upload (from file or paste) ──
  const addTextUpload = async (fileName: string, content: string) => {
    if (!activeSessionId || !user || !content.trim()) return;
    const wc = content.trim().split(/\s+/).filter(Boolean).length;
    const { data } = await supabase
      .from("ebook_text_uploads")
      .insert({ session_id: activeSessionId, user_id: user.id, file_name: fileName, content, word_count: wc })
      .select()
      .single();

    if (data) {
      setTextUploads(prev => [...prev, {
        id: data.id, sessionId: data.session_id, fileName: data.file_name,
        content: data.content, wordCount: data.word_count, createdAt: new Date(data.created_at),
      }]);
      toast({ title: `Added "${fileName}"`, description: `${wc.toLocaleString()} words` });
    }
  };

  const removeTextUpload = async (id: string) => {
    await supabase.from("ebook_text_uploads").delete().eq("id", id);
    setTextUploads(prev => prev.filter(u => u.id !== id));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string || "";
        addTextUpload(file.name, text);
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  };

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) return;
    addTextUpload(`pasted_text_${Date.now()}`, pasteText);
    setPasteText("");
  };

  // ── AI Structure ──
  const allRawText = textUploads.map(u => u.content).join("\n\n---\n\n");

  const structureBook = useCallback(async () => {
    if (!allRawText.trim() || !metadata.title.trim()) return;
    setProcessing(true);
    setProgress("Analyzing content structure…");
    setChapters([]);

    const chapterCountInstruction = settings.chapterCount === "auto"
      ? "Automatically determine the optimal number of chapters based on topic shifts and content volume."
      : `Create exactly ${settings.chapterCount} chapters.`;

    const toneMap = { formal: "formal and professional", casual: "conversational and approachable", technical: "technical and precise", narrative: "narrative and storytelling" };

    let result = "";
    try {
      const diagramInstruction = settings.includeDiagrams
        ? `\n9. DIAGRAMS & WORKFLOWS: After every 2-3 text chapters, insert a DIAGRAM chapter. For diagram chapters, set "type": "diagram" and include:
   - "title": A descriptive diagram title (e.g. "System Architecture Overview", "Workflow: Data Pipeline")
   - "content": A written explanation of the diagram (2-3 paragraphs)
   - "diagramDescription": A detailed textual description of the diagram structure — nodes, connections, hierarchy, and flow. Describe it as boxes/steps connected by arrows. Use format like: "[Box A] → [Box B] → [Box C]" or hierarchical lists.
   Create diagrams that visualize: processes, architectures, hierarchies, workflows, relationships, timelines, or concept maps from the content.`
        : "";

      await streamChat({
        messages: [{
          role: "user",
          content: `You are a strict copy-editor preparing a manuscript for publication. You are NOT a ghostwriter, rewriter, or summarizer.

BOOK TITLE: "${metadata.title}"
BOOK DESCRIPTION: "${metadata.description}"

ABSOLUTE RULES — DO NOT VIOLATE:
1. PRESERVE THE AUTHOR'S WORDING VERBATIM. Do NOT rewrite, paraphrase, restructure sentences, "improve" style, change voice, or substitute synonyms.
2. The ONLY edits you may make are: grammar errors, spelling errors, punctuation errors, capitalization, and obvious typos.
3. Do NOT add new sentences, examples, transitions, or content that was not already in the source.
4. Do NOT remove, summarize, condense, or shorten any content. Every sentence the author wrote must remain.
5. Do NOT merge or split paragraphs unless required to fix a clear punctuation/structure error.
6. ${settings.removeDuplicates ? "If a paragraph is repeated word-for-word, you may remove the exact duplicate. Otherwise keep everything." : "Keep all paragraphs even if they overlap."}

CHAPTER SPLITTING:
7. ${chapterCountInstruction}
8. Split the corrected text into chapters at natural topic boundaries that ALREADY exist in the source (existing headings, section breaks, or clear topic shifts). Do not invent transitions.
9. Each chapter title should be drawn from or directly summarize the source's existing heading for that section. Use a short, neutral title — do not embellish.
10. ${settings.includeChapterSummaries ? "Write a 2-3 sentence summary for each chapter that paraphrases (does not editorialize) what the chapter contains." : "No summaries."}${diagramInstruction}

OUTPUT FORMAT: Return ONLY a valid JSON array. Each element:
{
  "title": "Chapter Title",
  "content": "Full chapter text with proper paragraphs...",
  "summary": "Brief chapter summary (if requested)",
  "type": "text"
}
${settings.includeDiagrams ? 'For diagram chapters, use "type": "diagram" and include "diagramDescription": "detailed visual layout description"' : ""}

Do NOT wrap in markdown. Return ONLY the JSON array.

RAW TEXT TO STRUCTURE:
${allRawText}`,
        }],
        mode: "chat",
        onDelta: (chunk) => {
          result += chunk;
          if (result.length > 500) setProgress("Organizing chapters…");
          if (result.length > 2000) setProgress("Writing chapter content…");
          if (result.length > 5000) setProgress("Refining and polishing…");
        },
        onReplace: (text) => {
          result = text;
          if (result.length > 500) setProgress("Organizing chapters…");
          if (result.length > 2000) setProgress("Writing chapter content…");
          if (result.length > 5000) setProgress("Refining and polishing…");
        },
        onDone: () => {
          try {
            // Try full JSON array first
            const jsonMatch = result.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as EBookChapter[];
              const newChapters = parsed.map((ch, i) => ({ ...ch, id: `ch-${i}-${Date.now()}` }));
              setChapters(newChapters);
              setProgress("");
              setStep("preview");
            } else {
              // Truncation recovery: AI output was cut off mid-JSON
              // Try to find the start of the array and close it properly
              const arrayStart = result.indexOf("[");
              if (arrayStart !== -1) {
                let truncated = result.slice(arrayStart);
                // Find the last complete object by finding last "},"  or "}" before end
                const lastCompleteObj = truncated.lastIndexOf("}");
                if (lastCompleteObj > 0) {
                  truncated = truncated.slice(0, lastCompleteObj + 1);
                  // Close any unclosed array
                  if (!truncated.trim().endsWith("]")) truncated += "]";
                  // Remove trailing comma before ]
                  truncated = truncated.replace(/,\s*\]$/, "]");
                  try {
                    const parsed = JSON.parse(truncated) as EBookChapter[];
                    if (parsed.length > 0) {
                      const newChapters = parsed.map((ch, i) => ({ ...ch, id: `ch-${i}-${Date.now()}` }));
                      setChapters(newChapters);
                      setProgress("");
                      setStep("preview");
                      return;
                    }
                  } catch { /* final fallback below */ }
                }
              }
              setProgress("Failed to parse — trying again…");
            }
          } catch {
            // Truncation recovery on parse error
            const arrayStart = result.indexOf("[");
            if (arrayStart !== -1) {
              let truncated = result.slice(arrayStart);
              const lastCompleteObj = truncated.lastIndexOf("}");
              if (lastCompleteObj > 0) {
                truncated = truncated.slice(0, lastCompleteObj + 1);
                if (!truncated.trim().endsWith("]")) truncated += "]";
                truncated = truncated.replace(/,\s*\]$/, "]");
                try {
                  const parsed = JSON.parse(truncated) as EBookChapter[];
                  if (parsed.length > 0) {
                    const newChapters = parsed.map((ch, i) => ({ ...ch, id: `ch-${i}-${Date.now()}` }));
                    setChapters(newChapters);
                    setProgress(`Recovered ${parsed.length} chapters (response may have been truncated). You can regenerate for more.`);
                    setStep("preview");
                    setProcessing(false);
                    return;
                  }
                } catch { /* truly broken */ }
              }
            }
            setProgress("Error parsing AI response. Please try again.");
          }
          setProcessing(false);
        },
      });
    } catch {
      setProcessing(false);
      setProgress("Error connecting to AI. Please try again.");
    }
  }, [allRawText, metadata, settings]);

  // ── Fix Grammar on all chapters ──

  const fixAllGrammar = useCallback(async () => {
    if (chapters.length === 0) return;
    setFixingGrammar(true);
    setProgress("Aureon is fixing grammar across all chapters…");

    const chaptersPayload = chapters.map((ch, i) => ({
      index: i,
      title: ch.title,
      content: ch.content,
      summary: ch.summary || "",
    }));

    let result = "";
    try {
      await streamChat({
        messages: [{
          role: "user",
          content: `You are a professional book editor. Your ONLY task is to fix grammar, spelling, punctuation, sentence structure, and clarity across ALL chapters below. Make every sentence read naturally and make logical sense.

RULES:
1. Fix ALL grammar errors, typos, awkward phrasing, and unclear sentences.
2. Ensure proper punctuation — commas, periods, semicolons, quotation marks.
3. Fix run-on sentences by splitting them. Fix fragments by completing them.
4. Ensure subject-verb agreement and consistent tense.
5. Improve clarity — if a sentence is confusing, rewrite it so it makes sense.
6. Maintain the original meaning and tone — do NOT change the ideas, only fix the language.
7. Keep ALL content — do NOT remove or shorten anything.
8. Fix chapter titles too if they have grammar issues.

OUTPUT FORMAT: Return ONLY a valid JSON array with the same number of elements (${chapters.length} chapters). Each element:
{
  "title": "Corrected Chapter Title",
  "content": "Full corrected chapter text with proper paragraphs...",
  "summary": "Corrected summary"
}

Do NOT wrap in markdown. Return ONLY the JSON array.

CHAPTERS TO FIX:
${JSON.stringify(chaptersPayload).slice(0, 100000)}`,
        }],
        mode: "chat",
        onDelta: (chunk) => {
          result += chunk;
          if (result.length > 500) setProgress("Correcting grammar…");
          if (result.length > 3000) setProgress("Polishing sentences…");
          if (result.length > 8000) setProgress("Final review…");
        },
        onReplace: (text) => {
          result = text;
          if (result.length > 500) setProgress("Correcting grammar…");
          if (result.length > 3000) setProgress("Polishing sentences…");
          if (result.length > 8000) setProgress("Final review…");
        },
        onDone: () => {
          try {
            const jsonMatch = result.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as Array<{ title: string; content: string; summary?: string }>;
              setChapters(prev => prev.map((ch, i) => ({
                ...ch,
                title: parsed[i]?.title || ch.title,
                content: parsed[i]?.content || ch.content,
                summary: parsed[i]?.summary || ch.summary,
              })));
              setProgress("");
              toast({ title: "Grammar fixed", description: `All ${chapters.length} chapters have been corrected.` });
            } else {
              setProgress("Failed to parse corrected text.");
            }
          } catch {
            setProgress("Error parsing AI response.");
          }
          setFixingGrammar(false);
        },
      });
    } catch {
      setFixingGrammar(false);
      setProgress("Error connecting to AI.");
    }
  }, [chapters, toast]);

  const addChapter = () => {
    setChapters(prev => [...prev, { id: `ch-new-${Date.now()}`, title: `Chapter ${prev.length + 1}`, content: "", summary: "" }]);
  };

  const updateChapter = (id: string, field: keyof EBookChapter | "diagramDescription", value: string) => {
    setChapters(prev => prev.map(ch => ch.id === id ? { ...ch, [field]: value } : ch));
  };

  const removeChapter = (id: string) => {
    setChapters(prev => prev.filter(ch => ch.id !== id));
  };

  const moveChapter = (id: string, direction: "up" | "down") => {
    setChapters(prev => {
      const idx = prev.findIndex(ch => ch.id === id);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  };

  // ── Download Cover as Image ──
  const downloadCover = useCallback(async () => {
    const ps = PAGE_SIZES[settings.pageSize];
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = ps.w * scale;
    canvas.height = ps.h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);

    // Draw wallpaper
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve) => {
        img.onload = () => {
          // "cover" fit: fill canvas without squashing
          const imgRatio = img.naturalWidth / img.naturalHeight;
          const canvasRatio = ps.w / ps.h;
          let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
          if (imgRatio > canvasRatio) {
            sw = img.naturalHeight * canvasRatio;
            sx = (img.naturalWidth - sw) / 2;
          } else {
            sh = img.naturalWidth / canvasRatio;
            sy = (img.naturalHeight - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ps.w, ps.h);
          resolve();
        };
        img.onerror = () => { ctx.fillStyle = "#111"; ctx.fillRect(0, 0, ps.w, ps.h); resolve(); };
        img.src = wallpaperSrc;
      });
    } catch {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, ps.w, ps.h);
    }

    // Dark overlay
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, ps.w, ps.h);

    // Title
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(240,240,240,1)";
    ctx.font = "bold 36px Helvetica, Arial, sans-serif";
    const titleY = ps.h * 0.35;
    const maxW = ps.w - 108;
    const words = (metadata.title || "Untitled").split(" ");
    let lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else { cur = test; }
    }
    if (cur) lines.push(cur);
    lines.forEach((l, i) => ctx.fillText(l, ps.w / 2, titleY + i * 44));

    // Subtitle
    let nextY = titleY + lines.length * 44 + 10;
    if (metadata.subtitle) {
      ctx.font = "normal 18px Helvetica, Arial, sans-serif";
      ctx.fillStyle = "rgba(200,200,200,1)";
      ctx.fillText(metadata.subtitle, ps.w / 2, nextY);
      nextY += 26;
    }

    // Author
    if (metadata.author) {
      ctx.font = "italic 16px Helvetica, Arial, sans-serif";
      ctx.fillStyle = "rgba(180,180,180,1)";
      ctx.fillText(metadata.author, ps.w / 2, ps.h * 0.7);
    }

    // Download
    const a = document.createElement("a");
    a.download = `${(metadata.title || "book").replace(/[^a-z0-9]/gi, "_")}_cover.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();

    toast({ title: "Cover downloaded", description: "Your book cover has been saved as PNG." });
  }, [settings, metadata, wallpaperSrc, toast]);

  // ── PDF Export ──
  const exportPdf = useCallback(async () => {
    if (chapters.length === 0) return;
    setExporting(true);
    try {
      const ps = PAGE_SIZES[settings.pageSize];
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: [ps.w, ps.h] });
      const margin = { top: 72, bottom: 72, left: 54, right: 54 };
      const contentW = ps.w - margin.left - margin.right;
      const bodyFontSize = settings.fontSize;
      const chapterTitleSize = bodyFontSize + 14;
      const lineH = bodyFontSize * settings.lineSpacing;
      let pageNum = 0;

      // Pre-render wallpaper as a reusable JPEG data URL
      let bgDataUrl: string | null = null;
      try {
        const img = new Image(); img.crossOrigin = "anonymous";
        bgDataUrl = await new Promise<string | null>(resolve => {
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = Math.round(ps.w * 2);
            c.height = Math.round(ps.h * 2);
            const ctx = c.getContext("2d")!;
            // "cover" fit
            const imgRatio = img.naturalWidth / img.naturalHeight;
            const pageRatio = ps.w / ps.h;
            let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
            if (imgRatio > pageRatio) { sw = img.naturalHeight * pageRatio; sx = (img.naturalWidth - sw) / 2; }
            else { sh = img.naturalWidth / pageRatio; sy = (img.naturalHeight - sh) / 2; }
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
            resolve(c.toDataURL("image/jpeg", 0.85));
          };
          img.onerror = () => resolve(null);
          img.src = wallpaperSrc;
        });
      } catch { bgDataUrl = null; }

      // Helper: draw wallpaper bg + dark overlay on current page
      const drawPageBg = (overlayOpacity = 0.75) => {
        if (bgDataUrl) {
          pdf.addImage(bgDataUrl, "JPEG", 0, 0, ps.w, ps.h);
        } else {
          pdf.setFillColor(17, 17, 17);
          pdf.rect(0, 0, ps.w, ps.h, "F");
        }
        pdf.setFillColor(0, 0, 0);
        pdf.setGState(new (pdf as any).GState({ opacity: overlayOpacity }));
        pdf.rect(0, 0, ps.w, ps.h, "F");
        pdf.setGState(new (pdf as any).GState({ opacity: 1 }));
      };

      const addPage = () => { if (pageNum > 0) pdf.addPage(); pageNum++; drawPageBg(); return pageNum; };
      const drawPageNumber = (num: number) => {
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(180);
        const t = `${num}`; pdf.text(t, (ps.w - pdf.getTextWidth(t)) / 2, ps.h - 36);
      };
      const drawHeader = (l: string, r: string) => {
        pdf.setFont("helvetica", "italic"); pdf.setFontSize(8); pdf.setTextColor(140);
        pdf.text(l, margin.left, 40); pdf.text(r, ps.w - margin.right - pdf.getTextWidth(r), 40);
      };

      // Cover (less overlay for more wallpaper visibility)
      if (pageNum > 0) pdf.addPage(); pageNum++;
      drawPageBg(0.55);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(36); pdf.setTextColor(240);
      const titleLines = pdf.splitTextToSize(metadata.title, contentW);
      let ty = ps.h * 0.35;
      titleLines.forEach((l: string) => { pdf.text(l, (ps.w - pdf.getTextWidth(l)) / 2, ty); ty += 44; });
      if (metadata.subtitle) {
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(18); pdf.setTextColor(200);
        pdf.splitTextToSize(metadata.subtitle, contentW).forEach((l: string) => { pdf.text(l, (ps.w - pdf.getTextWidth(l)) / 2, ty + 10); ty += 26; });
      }
      if (metadata.author) {
        pdf.setFont("helvetica", "italic"); pdf.setFontSize(16); pdf.setTextColor(180);
        pdf.text(metadata.author, (ps.w - pdf.getTextWidth(metadata.author)) / 2, ps.h * 0.7);
      }

      // Copyright
      if (settings.includeCopyright) {
        addPage(); pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(180);
        const ct = metadata.copyright || `© ${new Date().getFullYear()} ${metadata.author || "Author"}. All rights reserved.`;
        pdf.text(pdf.splitTextToSize(ct, contentW), margin.left, ps.h * 0.6);
      }

      // Dedication
      if (settings.includeDedication && metadata.dedication.trim()) {
        addPage(); pdf.setFont("helvetica", "italic"); pdf.setFontSize(14); pdf.setTextColor(200);
        const dl = pdf.splitTextToSize(metadata.dedication, contentW * 0.6);
        dl.forEach((l: string, i: number) => { pdf.text(l, (ps.w - pdf.getTextWidth(l)) / 2, ps.h * 0.4 + i * 22); });
      }

      // TOC
      if (settings.includeTableOfContents) {
        addPage(); drawPageNumber(pageNum);
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(24); pdf.setTextColor(230);
        pdf.text("Table of Contents", margin.left, margin.top + 30);
        let tocY = margin.top + 80;
        chapters.forEach((ch, i) => {
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(12); pdf.setTextColor(200);
          pdf.text(`${i + 1}.  ${ch.title}`, margin.left + 20, tocY); tocY += 28;
          if (tocY > ps.h - margin.bottom) { addPage(); drawPageNumber(pageNum); tocY = margin.top + 30; }
        });
      }

      // Chapters
      chapters.forEach((chapter, chIdx) => {
        addPage();
        const isDiagram = chapter.type === "diagram";

        if (isDiagram) {
          // Diagram page layout
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(160);
          const dl = "DIAGRAM"; pdf.text(dl, (ps.w - pdf.getTextWidth(dl)) / 2, margin.top + 40);
          pdf.setFont("helvetica", "bold"); pdf.setFontSize(chapterTitleSize); pdf.setTextColor(240);
          const dtl = pdf.splitTextToSize(chapter.title, contentW);
          let dy = margin.top + 75;
          dtl.forEach((l: string) => { pdf.text(l, (ps.w - pdf.getTextWidth(l)) / 2, dy); dy += chapterTitleSize + 6; });
          pdf.setDrawColor(120); pdf.setLineWidth(0.5); pdf.line(ps.w * 0.3, dy + 10, ps.w * 0.7, dy + 10); dy += 35;

          // Draw diagram boxes from diagramDescription
          if (chapter.diagramDescription) {
            const nodes = chapter.diagramDescription.split(/→|->|➜|➔/).map(n => n.replace(/[\[\]]/g, "").trim()).filter(Boolean);
            const boxW = Math.min(contentW * 0.6, 240);
            const boxH = 32;
            const gap = 18;
            const startX = (ps.w - boxW) / 2;

            nodes.forEach((node, ni) => {
              if (dy + boxH + gap > ps.h - margin.bottom) { addPage(); drawHeader(metadata.title, chapter.title); drawPageNumber(pageNum); dy = margin.top + 30; }
              // Box
              pdf.setDrawColor(130, 80, 220); pdf.setLineWidth(1);
              pdf.setFillColor(40, 20, 60);
              pdf.roundedRect(startX, dy, boxW, boxH, 6, 6, "FD");
              pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(220);
              const nodeLines = pdf.splitTextToSize(node, boxW - 16);
              nodeLines.forEach((l: string, li: number) => {
                pdf.text(l, startX + (boxW - pdf.getTextWidth(l)) / 2, dy + 14 + li * 12);
              });
              dy += boxH;
              // Arrow
              if (ni < nodes.length - 1) {
                const arrowX = ps.w / 2;
                pdf.setDrawColor(130, 80, 220); pdf.setLineWidth(1.5);
                pdf.line(arrowX, dy, arrowX, dy + gap - 4);
                // arrowhead
                pdf.setFillColor(130, 80, 220);
                pdf.triangle(arrowX - 4, dy + gap - 6, arrowX + 4, dy + gap - 6, arrowX, dy + gap - 1, "F");
                dy += gap;
              } else {
                dy += 16;
              }
            });
          }

          // Content explanation below diagram
          dy += 10;
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(bodyFontSize); pdf.setTextColor(200);
          chapter.content.split(/\n\n+/).forEach(para => {
            const trimmed = para.trim(); if (!trimmed) return;
            pdf.splitTextToSize(trimmed, contentW).forEach((l: string) => {
              if (dy > ps.h - margin.bottom) { addPage(); drawHeader(metadata.title, chapter.title); drawPageNumber(pageNum); dy = margin.top + 20; }
              pdf.text(l, margin.left, dy); dy += lineH;
            }); dy += lineH * 0.5;
          });
        } else {
          // Standard text chapter
          pdf.setFont("helvetica", "normal"); pdf.setFontSize(12); pdf.setTextColor(160);
          const cn = `CHAPTER ${chIdx + 1}`; pdf.text(cn, (ps.w - pdf.getTextWidth(cn)) / 2, margin.top + 60);
          pdf.setFont("helvetica", "bold"); pdf.setFontSize(chapterTitleSize); pdf.setTextColor(240);
          const ctl = pdf.splitTextToSize(chapter.title, contentW);
          let cy = margin.top + 95;
          ctl.forEach((l: string) => { pdf.text(l, (ps.w - pdf.getTextWidth(l)) / 2, cy); cy += chapterTitleSize + 6; });
          pdf.setDrawColor(120); pdf.setLineWidth(0.5); pdf.line(ps.w * 0.3, cy + 10, ps.w * 0.7, cy + 10); cy += 35;

          if (settings.includeChapterSummaries && chapter.summary) {
            pdf.setFont("helvetica", "italic"); pdf.setFontSize(bodyFontSize - 1); pdf.setTextColor(170);
            pdf.splitTextToSize(chapter.summary, contentW - 40).forEach((l: string) => {
              if (cy > ps.h - margin.bottom) { addPage(); drawHeader(metadata.title, chapter.title); drawPageNumber(pageNum); cy = margin.top + 20; }
              pdf.text(l, margin.left + 20, cy); cy += lineH;
            }); cy += lineH;
          }

          pdf.setFont("helvetica", "normal"); pdf.setFontSize(bodyFontSize); pdf.setTextColor(220);
          chapter.content.split(/\n\n+/).forEach(para => {
            const trimmed = para.trim(); if (!trimmed) return;
            pdf.splitTextToSize(trimmed, contentW).forEach((l: string, li: number) => {
              if (cy > ps.h - margin.bottom) { addPage(); drawHeader(metadata.title, chapter.title); drawPageNumber(pageNum); cy = margin.top + 20; }
              pdf.text(l, margin.left + (li === 0 ? 20 : 0), cy); cy += lineH;
            }); cy += lineH * 0.5;
          });
        }
        drawPageNumber(pageNum);
      });

      // About Author
      if (settings.includeAboutAuthor && metadata.aboutAuthor.trim()) {
        addPage(); drawPageNumber(pageNum);
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(20); pdf.setTextColor(230);
        pdf.text("About the Author", margin.left, margin.top + 40);
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(bodyFontSize); pdf.setTextColor(200);
        let ay = margin.top + 80;
        pdf.splitTextToSize(metadata.aboutAuthor, contentW).forEach((l: string) => {
          if (ay > ps.h - margin.bottom) { addPage(); drawPageNumber(pageNum); ay = margin.top + 20; }
          pdf.text(l, margin.left, ay); ay += lineH;
        });
      }

      pdf.save(`${metadata.title.replace(/[^a-zA-Z0-9]/g, "_")}_ebook.pdf`);
    } catch (e) { console.error("PDF export error:", e); }
    setExporting(false);
  }, [chapters, metadata, settings, wallpaperSrc]);

  // ── Stats ──
  const totalChapterWords = chapters.reduce((sum, ch) => sum + ch.content.split(/\s+/).filter(Boolean).length, 0);
  const totalChapterPages = Math.max(1, Math.ceil(totalChapterWords / 250));

  // ── RENDER: Session List ──
  if (showSessionList) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex-shrink-0 border-b border-border/20 bg-card/20 backdrop-blur-sm px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-accent" />
              <div>
                <h1 className="text-lg font-extralight text-foreground">asherin.ebooks</h1>
                <p className="text-[10px] font-extralight text-muted-foreground/60 uppercase hidden sm:block">long-form publishing room</p>
              </div>
            </div>
            <button onClick={createSession}
              className="flex items-center gap-2 rounded-lg bg-accent/20 px-4 py-2 text-xs text-accent hover:bg-accent/30 transition-colors">
              <Plus className="h-3.5 w-3.5" /> New Book
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="max-w-2xl mx-auto space-y-3">
            {sessionsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 text-accent animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-20 space-y-4">
                <BookOpen className="h-12 w-12 text-muted-foreground/20 mx-auto" />
                <p className="text-sm font-light text-muted-foreground/50">No books yet. Create your first one.</p>
                <button onClick={createSession}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent/20 px-5 py-2.5 text-xs text-accent hover:bg-accent/30 transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Create Book
                </button>
              </div>
            ) : (
              sessions.map(session => (
                <div key={session.id}
                  className="group rounded-xl border border-border/20 bg-card/20 hover:bg-card/30 transition-colors cursor-pointer overflow-hidden"
                  onClick={() => openSession(session)}>
                  <div className="flex items-center gap-4 p-4">
                    <div className="flex-shrink-0 w-12 h-16 rounded-lg overflow-hidden border border-border/10">
                      <img src={WALLPAPERS.find(w => w.key === session.settings?.wallpaper)?.src || heroBgDefault}
                        alt="" className="w-full h-full object-cover opacity-60" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-light text-foreground truncate">{session.title}</p>
                      {session.author && <p className="text-[10px] font-light text-muted-foreground/50 italic">by {session.author}</p>}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[9px] font-light text-muted-foreground/40">{session.chapters.length} chapters</span>
                        <span className="text-[9px] font-light text-muted-foreground/40">
                          {session.status === "structured" ? "✓ Structured" : "Draft"}
                        </span>
                        <span className="text-[9px] font-light text-muted-foreground/40 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {session.updatedAt.toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); deleteSession(session.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/30 hover:text-destructive transition-all p-1.5">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER: Book Editor ──
  const steps: { id: EBookStep; label: string; icon: React.ElementType }[] = [
    { id: "upload", label: "Content", icon: Upload },
    { id: "settings", label: "Settings", icon: Settings2 },
    { id: "processing", label: "Generate", icon: Sparkles },
    { id: "preview", label: "Preview", icon: Eye },
  ];

  const canProceed = () => {
    if (step === "upload") return textUploads.length > 0 && metadata.title.trim().length > 0;
    if (step === "settings") return true;
    return false;
  };

  const buildManually = useCallback(() => {
    if (textUploads.length === 0) return;
    const newChapters: EBookChapter[] = textUploads.map((u, i) => {
      const rawTitle = (u.fileName || `Chapter ${i + 1}`)
        .replace(/\.[^/.]+$/, "")
        .replace(/^pasted_text_\d+$/, `Chapter ${i + 1}`)
        .replace(/[_-]+/g, " ")
        .trim();
      return {
        id: `ch-${i}-${Date.now()}`,
        title: rawTitle || `Chapter ${i + 1}`,
        content: u.content,
        type: "text" as const,
      };
    });
    setChapters(newChapters);
    setProgress("");
    setStep("preview");
  }, [textUploads]);

  const handleNext = () => {
    if (step === "upload") setStep("settings");
    else if (step === "settings") {
      if (settings.buildMode === "manual") {
        buildManually();
      } else {
        setStep("processing");
        structureBook();
      }
    }
  };

  const handleBack = () => {
    if (step === "settings") setStep("upload");
    if (step === "preview") setStep("settings");
  };

  const renderUploadStep = () => (
    <div className="space-y-6">
      {/* Metadata */}
      <div className="space-y-3">
        <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase">Book Details</p>
        <input value={metadata.title} onChange={e => setMetadata(prev => ({ ...prev, title: e.target.value }))}
          placeholder="Book Title *" className="w-full bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-sm font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/30" />
        <input value={metadata.subtitle} onChange={e => setMetadata(prev => ({ ...prev, subtitle: e.target.value }))}
          placeholder="Subtitle (optional)" className="w-full bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-sm font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/30" />
        <div className="grid grid-cols-2 gap-3">
          <input value={metadata.author} onChange={e => setMetadata(prev => ({ ...prev, author: e.target.value }))}
            placeholder="Author Name" className="bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-sm font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/30" />
          <input value={metadata.copyright} onChange={e => setMetadata(prev => ({ ...prev, copyright: e.target.value }))}
            placeholder="Copyright Notice" className="bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-sm font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/30" />
        </div>
        <textarea value={metadata.description} onChange={e => setMetadata(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Book Description — what's this book about? (helps AI organize content)" rows={3}
          className="w-full bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-sm font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/30 resize-none" />
      </div>

      {/* Text Uploads */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase">Source Text Files</p>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground/40">{totalWords.toLocaleString()} words · ~{estimatedPages} pages</span>
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-border/20 px-3 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              <Upload className="h-3 w-3" /> Upload Files
            </button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" multiple className="hidden" accept=".txt,.md,.csv,.json,.xml,.html,.rtf" onChange={handleFileUpload} />

        {/* Existing uploads */}
        {textUploads.length > 0 && (
          <div className="space-y-1.5">
            {textUploads.map(u => (
              <div key={u.id} className="flex items-center gap-3 rounded-lg border border-border/10 bg-card/10 px-3 py-2">
                <FileText className="h-3.5 w-3.5 text-accent/50 flex-shrink-0" />
                <span className="flex-1 text-xs font-light text-foreground truncate">{u.fileName}</span>
                <span className="text-[9px] text-muted-foreground/40 flex-shrink-0">{u.wordCount.toLocaleString()} words</span>
                <button onClick={() => removeTextUpload(u.id)} className="text-muted-foreground/30 hover:text-destructive transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Paste area */}
        <div className="space-y-2">
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
            placeholder="Paste additional text here and click 'Add Text' to append to your book sources…"
            rows={6}
            className="w-full bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/30 resize-none" />
          {pasteText.trim() && (
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-muted-foreground/40">{pasteText.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
              <button onClick={handlePasteSubmit}
                className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1.5 text-[10px] text-accent hover:bg-accent/25 transition-colors">
                <Plus className="h-3 w-3" /> Add Text
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderSettingsStep = () => (
    <div className="space-y-6">
      {/* Build mode toggle */}
      <div>
        <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-2">Build Mode</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSettings(prev => ({ ...prev, buildMode: "ai" }))}
            className={`rounded-xl border p-3 text-left transition-colors ${settings.buildMode !== "manual" ? "border-accent/40 bg-accent/10" : "border-border/20 bg-card/20 hover:border-border/40"}`}>
            <p className="text-xs font-light text-foreground flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> AI Structured</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">Aureon organizes your text into chapters, fixes grammar, and polishes.</p>
          </button>
          <button onClick={() => setSettings(prev => ({ ...prev, buildMode: "manual" }))}
            className={`rounded-xl border p-3 text-left transition-colors ${settings.buildMode === "manual" ? "border-accent/40 bg-accent/10" : "border-border/20 bg-card/20 hover:border-border/40"}`}>
            <p className="text-xs font-light text-foreground flex items-center gap-1.5"><BookOpen className="h-3 w-3" /> Manual</p>
            <p className="text-[10px] font-light text-muted-foreground/60 mt-1">Use your text exactly as-is. Each upload becomes a chapter. No AI.</p>
          </button>
        </div>
      </div>
      <div>
        <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-2">Cover Wallpaper</p>
        <div className="grid grid-cols-7 gap-2">
          {WALLPAPERS.map(wp => (
            <button key={wp.key} onClick={() => setSettings(prev => ({ ...prev, wallpaper: wp.key }))}
              className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-[3/4] ${settings.wallpaper === wp.key ? "border-accent/50 ring-1 ring-accent/20" : "border-border/20 hover:border-border/40"}`}>
              <img src={wp.src} alt={wp.label} className="w-full h-full object-cover" />
              <span className="absolute inset-0 flex items-end justify-center pb-0.5 bg-gradient-to-t from-black/60 to-transparent">
                <span className="text-[7px] font-light text-white/90">{wp.label}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-2">Page Size</p>
          <select value={settings.pageSize} onChange={e => setSettings(prev => ({ ...prev, pageSize: e.target.value as any }))}
            className="w-full bg-card/30 border border-border/20 rounded-xl px-3 py-2 text-xs font-light text-foreground outline-none">
            {Object.entries(PAGE_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-2">Font Size</p>
          <select value={settings.fontSize} onChange={e => setSettings(prev => ({ ...prev, fontSize: Number(e.target.value) as any }))}
            className="w-full bg-card/30 border border-border/20 rounded-xl px-3 py-2 text-xs font-light text-foreground outline-none">
            <option value={10}>10pt</option><option value={12}>12pt</option><option value={14}>14pt</option>
          </select>
        </div>
        <div>
          <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-2">Line Spacing</p>
          <select value={settings.lineSpacing} onChange={e => setSettings(prev => ({ ...prev, lineSpacing: Number(e.target.value) as any }))}
            className="w-full bg-card/30 border border-border/20 rounded-xl px-3 py-2 text-xs font-light text-foreground outline-none">
            <option value={1}>Single</option><option value={1.5}>1.5×</option><option value={2}>Double</option>
          </select>
        </div>
        <div>
          <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-2">Tone</p>
          <select value={settings.tone} onChange={e => setSettings(prev => ({ ...prev, tone: e.target.value as any }))}
            className="w-full bg-card/30 border border-border/20 rounded-xl px-3 py-2 text-xs font-light text-foreground outline-none">
            <option value="formal">Formal</option><option value="casual">Casual</option><option value="technical">Technical</option><option value="narrative">Narrative</option>
          </select>
        </div>
      </div>

      {settings.buildMode !== "manual" && (
        <div>
          <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-2">Chapter Count</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setSettings(prev => ({ ...prev, chapterCount: "auto" }))}
              className={`rounded-lg px-4 py-2 text-xs font-light transition-colors ${settings.chapterCount === "auto" ? "bg-accent/20 text-accent" : "bg-card/30 text-muted-foreground border border-border/20"}`}>
              Auto-detect
            </button>
            <input type="number" min={1} max={50} value={settings.chapterCount === "auto" ? "" : settings.chapterCount}
              placeholder="Custom #"
              onChange={e => setSettings(prev => ({ ...prev, chapterCount: e.target.value ? Number(e.target.value) : "auto" }))}
              className="w-24 bg-card/30 border border-border/20 rounded-xl px-3 py-2 text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none" />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-2">
          {settings.buildMode === "manual" ? "Front & Back Matter" : "Content Processing"}
        </p>
        {(settings.buildMode === "manual"
          ? ([
              ["includeTableOfContents", "Table of Contents"],
              ["includeCopyright", "Copyright page"],
              ["includeDedication", "Dedication page"],
              ["includeAboutAuthor", "About the Author page"],
            ] as const)
          : ([
              ["rewriteForConsistency", "Rewrite for consistency"],
              ["fixGrammar", "Fix grammar & spelling"],
              ["removeDuplicates", "Remove duplicates"],
              ["includeTableOfContents", "Table of Contents"],
              ["includeChapterSummaries", "Chapter summaries"],
              ["includeDiagrams", "Generate diagrams & workflow pages"],
              ["includeCopyright", "Copyright page"],
              ["includeDedication", "Dedication page"],
              ["includeAboutAuthor", "About the Author page"],
            ] as const)
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer group">
            <div className={`w-8 h-4 rounded-full transition-colors relative ${settings[key] ? "bg-accent/60" : "bg-border/30"}`}
              onClick={() => setSettings(prev => ({ ...prev, [key]: !prev[key] }))}>
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-foreground transition-all ${settings[key] ? "left-4.5" : "left-0.5"}`} />
            </div>
            <span className="text-xs font-light text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
          </label>
        ))}
      </div>

      {settings.includeDedication && (
        <textarea value={metadata.dedication} onChange={e => setMetadata(prev => ({ ...prev, dedication: e.target.value }))}
          placeholder="Dedication text…" rows={2}
          className="w-full bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/30 resize-none" />
      )}
      {settings.includeAboutAuthor && (
        <textarea value={metadata.aboutAuthor} onChange={e => setMetadata(prev => ({ ...prev, aboutAuthor: e.target.value }))}
          placeholder="About the Author…" rows={3}
          className="w-full bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-xs font-light text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-accent/30 resize-none" />
      )}
    </div>
  );

  const renderProcessingStep = () => (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      <div className="relative">
        <Loader2 className="h-12 w-12 text-accent animate-spin" />
        <BookOpen className="h-5 w-5 text-accent absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-sm font-light text-foreground">Aureon is writing your book…</p>
        <p className="text-xs font-light text-muted-foreground/60">{progress}</p>
      </div>
      <div className="w-64 h-1 bg-border/20 rounded-full overflow-hidden">
        <div className="h-full bg-accent/50 rounded-full animate-pulse" style={{ width: "60%" }} />
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Chapters", value: chapters.length },
          { label: "Words", value: totalChapterWords.toLocaleString() },
          { label: "Est. Pages", value: totalChapterPages },
          { label: "Reading Time", value: `${Math.ceil(totalChapterWords / 200)}m` },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border/20 bg-card/20 p-3 text-center">
            <p className="text-lg font-extralight text-foreground">{s.value}</p>
            <p className="text-[9px] font-light tracking-[0.1em] text-muted-foreground/50 uppercase">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Source files summary */}
      <div className="rounded-xl border border-border/20 bg-card/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase">Source Files ({textUploads.length})</p>
          <button onClick={() => { setStep("upload"); }}
            className="text-[9px] text-accent/60 hover:text-accent transition-colors">+ Add More Text</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {textUploads.map(u => (
            <span key={u.id} className="inline-flex items-center gap-1 rounded-md bg-card/30 px-2 py-0.5 text-[9px] text-muted-foreground/50">
              <FileText className="h-2.5 w-2.5" /> {u.fileName}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase">Chapters</p>
          <div className="flex items-center gap-2">
            <button onClick={fixAllGrammar} disabled={fixingGrammar || chapters.length === 0}
              className="flex items-center gap-1 rounded-lg border border-accent/20 bg-accent/10 px-2.5 py-1 text-[9px] text-accent hover:bg-accent/20 transition-colors disabled:opacity-40">
              {fixingGrammar ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
              {fixingGrammar ? "Fixing…" : "Fix All Grammar"}
            </button>
            <button onClick={addChapter} className="flex items-center gap-1 rounded-lg border border-border/20 px-2 py-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-2.5 w-2.5" /> Add Chapter
            </button>
          </div>
        </div>
        {chapters.map((ch, i) => (
          <div key={ch.id} className={`rounded-xl border overflow-hidden ${ch.type === "diagram" ? "border-accent/20 bg-accent/5" : "border-border/20 bg-card/20"}`}>
            <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => setExpandedChapter(expandedChapter === ch.id ? null : ch.id)}>
              <GripVertical className="h-3 w-3 text-muted-foreground/30" />
              <span className="text-[9px] font-light text-accent/60 w-6">
                {ch.type === "diagram" ? "◆" : `#${i + 1}`}
              </span>
              <span className="flex-1 text-xs font-light text-foreground truncate">{ch.title}</span>
              {ch.type === "diagram" && (
                <span className="text-[8px] font-light text-accent/50 bg-accent/10 rounded px-1.5 py-0.5">Diagram</span>
              )}
              <span className="text-[9px] text-muted-foreground/40">{ch.content.split(/\s+/).filter(Boolean).length} words</span>
              <div className="flex items-center gap-1">
                <button onClick={e => { e.stopPropagation(); moveChapter(ch.id, "up"); }} className="text-muted-foreground/30 hover:text-foreground p-0.5"><ChevronUp className="h-3 w-3" /></button>
                <button onClick={e => { e.stopPropagation(); moveChapter(ch.id, "down"); }} className="text-muted-foreground/30 hover:text-foreground p-0.5"><ChevronDown className="h-3 w-3" /></button>
                <button onClick={e => { e.stopPropagation(); removeChapter(ch.id); }} className="text-muted-foreground/30 hover:text-destructive p-0.5"><Trash2 className="h-3 w-3" /></button>
              </div>
              {expandedChapter === ch.id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />}
            </div>
            {expandedChapter === ch.id && (
              <div className="border-t border-border/10 p-3 space-y-2">
                <input value={ch.title} onChange={e => updateChapter(ch.id, "title", e.target.value)}
                  className="w-full bg-card/30 border border-border/20 rounded-lg px-3 py-2 text-xs font-light text-foreground outline-none" placeholder="Chapter Title" />
                {ch.summary !== undefined && (
                  <textarea value={ch.summary || ""} onChange={e => updateChapter(ch.id, "summary", e.target.value)}
                    className="w-full bg-card/30 border border-border/20 rounded-lg px-3 py-2 text-[11px] font-light text-muted-foreground outline-none resize-none" rows={2} placeholder="Chapter Summary" />
                )}
                {ch.type === "diagram" && (
                  <textarea value={ch.diagramDescription || ""} onChange={e => updateChapter(ch.id, "diagramDescription" as any, e.target.value)}
                    className="w-full bg-accent/5 border border-accent/20 rounded-lg px-3 py-2 text-[11px] font-light text-accent/80 outline-none resize-none" rows={3} placeholder="Diagram flow description (e.g. [Step A] → [Step B] → [Step C])" />
                )}
                <textarea value={ch.content} onChange={e => updateChapter(ch.id, "content", e.target.value)}
                  className="w-full bg-card/30 border border-border/20 rounded-lg px-3 py-2 text-xs font-light text-foreground outline-none resize-none min-h-[200px]" placeholder={ch.type === "diagram" ? "Diagram explanation text…" : "Chapter Content"} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Book Preview — Cover + Pages */}
      <div>
        <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground/60 uppercase mb-3">Book Preview</p>
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
          {/* Cover */}
          <div className="flex-shrink-0 relative rounded-xl overflow-hidden border border-border/20 w-[180px] aspect-[3/4] shadow-lg">
            <img src={wallpaperSrc} alt="Cover" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4 text-center">
              <p className="text-sm font-light text-white/90 leading-tight">{metadata.title || "Untitled"}</p>
              {metadata.subtitle && <p className="text-[9px] font-light text-white/60 mt-1">{metadata.subtitle}</p>}
              {metadata.author && <p className="text-[8px] font-light text-white/50 mt-4 italic">{metadata.author}</p>}
            </div>
            <div className="absolute bottom-1.5 left-0 right-0 text-center">
              <span className="text-[7px] font-light text-white/30 uppercase tracking-wider">Cover</span>
            </div>
          </div>

          {/* Page previews for each chapter */}
          {chapters.map((ch, i) => {
            const isDiagram = ch.type === "diagram";
            const words = ch.content.split(/\s+/).filter(Boolean);
            const previewText = isDiagram
              ? (ch.diagramDescription || ch.content).slice(0, 200)
              : words.slice(0, 80).join(" ") + (words.length > 80 ? "…" : "");
            return (
              <div key={ch.id} className="flex-shrink-0 rounded-xl overflow-hidden border border-border/20 w-[180px] aspect-[3/4] shadow-md flex flex-col cursor-pointer hover:shadow-lg transition-shadow relative"
                onClick={() => setExpandedChapter(expandedChapter === ch.id ? null : ch.id)}>
                <img src={wallpaperSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/75" />
                <div className="relative z-10 flex flex-col h-full p-4">
                  {isDiagram ? (
                    <>
                      <p className="text-[7px] font-normal text-accent/60 uppercase tracking-[0.15em] mb-1">Diagram</p>
                      <p className="text-[10px] font-semibold text-white/90 leading-tight mb-2 line-clamp-2">{ch.title}</p>
                      <div className="flex-1 flex flex-col items-center justify-center gap-2">
                        <div className="w-full rounded-lg border border-accent/20 bg-accent/5 p-2">
                          <div className="flex flex-col items-center gap-1">
                            {(ch.diagramDescription || "").split("→").slice(0, 4).map((node, ni) => (
                              <div key={ni} className="flex flex-col items-center">
                                <div className="rounded-md bg-accent/15 border border-accent/20 px-2 py-0.5 text-[6px] text-accent/80 text-center truncate max-w-full">
                                  {node.replace(/[\[\]]/g, "").trim().slice(0, 20) || "Process"}
                                </div>
                                {ni < Math.min((ch.diagramDescription || "").split("→").length - 1, 3) && (
                                  <div className="w-px h-2 bg-accent/30" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[7px] font-normal text-white/40 uppercase tracking-[0.15em] mb-1">Chapter {i + 1}</p>
                      <p className="text-[10px] font-semibold text-white/90 leading-tight mb-2 line-clamp-2">{ch.title}</p>
                      {ch.summary && (
                        <p className="text-[7px] italic text-white/40 leading-snug mb-2 line-clamp-2">{ch.summary}</p>
                      )}
                      <div className="h-px bg-white/10 mb-2" />
                      <p className="text-[7px] font-normal text-white/60 leading-relaxed flex-1 overflow-hidden line-clamp-[12]">{previewText}</p>
                    </>
                  )}
                  <div className="mt-auto pt-1 text-center">
                    <span className="text-[7px] text-white/30">{i + 1}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={downloadCover}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-border/20 bg-card/30 px-3 py-2 text-[10px] font-light text-muted-foreground hover:text-foreground hover:bg-card/50 transition-colors">
          <Download className="h-3 w-3" /> Download Cover
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border/20 bg-card/20 backdrop-blur-sm px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { saveSession(); setShowSessionList(true); }}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors">
              <FolderOpen className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-extralight tracking-wide text-foreground">{metadata.title || "Untitled Book"}</h1>
              <p className="text-[10px] font-extralight tracking-[0.15em] text-muted-foreground/60 uppercase hidden sm:block">
                {saving ? "Saving…" : "Auto-saved"} · {textUploads.length} source{textUploads.length !== 1 ? "s" : ""} · {totalWords.toLocaleString()} words
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step === "preview" && (
              <button onClick={exportPdf} disabled={chapters.length === 0 || exporting}
                className="flex items-center gap-2 rounded-lg bg-accent/20 px-4 py-2 text-xs text-accent hover:bg-accent/30 transition-colors disabled:opacity-40">
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Export PDF
              </button>
            )}
          </div>
        </div>

        {/* Steps */}
        <div className="flex items-center gap-2 mt-4">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              {i > 0 && <div className={`w-8 h-px ${steps.findIndex(st => st.id === step) >= i ? "bg-accent/40" : "bg-border/20"}`} />}
              <button
                onClick={() => {
                  if (s.id === "upload" || s.id === "settings") setStep(s.id);
                  if (s.id === "preview" && chapters.length > 0) setStep(s.id);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-light transition-colors ${
                  step === s.id ? "bg-accent/20 text-accent" : "text-muted-foreground/50 hover:text-muted-foreground"
                }`}>
                <s.icon className="h-3 w-3" />
                {s.label}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto">
          {step === "upload" && renderUploadStep()}
          {step === "settings" && renderSettingsStep()}
          {step === "processing" && renderProcessingStep()}
          {step === "preview" && renderPreviewStep()}
        </div>
      </div>

      {/* Footer */}
      {step !== "processing" && (
        <div className="flex-shrink-0 border-t border-border/20 bg-card/20 backdrop-blur-sm px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            <button onClick={handleBack} disabled={step === "upload"}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-20">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            {(step === "upload" || step === "settings") && (
              <button onClick={handleNext} disabled={!canProceed()}
                className="flex items-center gap-2 rounded-lg bg-accent/20 px-5 py-2 text-xs text-accent hover:bg-accent/30 transition-colors disabled:opacity-40">
                {step === "settings"
                  ? (settings.buildMode === "manual"
                      ? <><BookOpen className="h-3.5 w-3.5" /> Build Book</>
                      : <><Sparkles className="h-3.5 w-3.5" /> Generate Book</>)
                  : <><ArrowRight className="h-3.5 w-3.5" /> Next</>}
              </button>
            )}
            {step === "preview" && (
              <button onClick={() => setStep("settings")}
                className="flex items-center gap-2 rounded-lg border border-border/20 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Sparkles className="h-3.5 w-3.5" /> Regenerate
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EBookGeneratorView;
