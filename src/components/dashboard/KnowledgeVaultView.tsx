// asherin.knowledge — your own documents, indexed on this device and cited.
//
// One column asks the corpus and reads the cited answer; the other adds to the
// corpus and lists what is in it. Every number in a result is a passage the
// operator can open. Nothing here calls a server: reading, cutting, ranking
// and storing happen in this browser; only the answer step talks to the
// connected model, and only with the passages it is about to cite.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload, FileText, Trash2, Database, Loader2, Search, Globe, AlertTriangle, PenSquare, ChevronDown, ChevronRight,
  MessageSquareQuote, Copy, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useIsV2 } from "@/lib/dashboardUiContext";
import {
  INGEST, askVault, answerFromPassages, deleteSource, getPassageContext, highlightSegments, ingestFile, ingestText, ingestWeb,
  listSources, modelReady, onVaultChange, retrieveVault,
  type ExtractProgress, type GroundedAnswer, type RetrieveResult, type VaultPassage, type VaultSource,
} from "@/lib/knowledgeVault/vault";
import { queueBoardDrop } from "@/lib/whiteboard/boardInbox";

const field = "h-9 rounded-xl border-border/25 bg-background/40 text-sm font-light";
const card = "rounded-2xl border border-border/25 bg-background/35 backdrop-blur-xl";
const head = "flex items-center gap-2 border-b border-border/20 px-4 py-3";
const h2 = "text-[11px] font-light lowercase tracking-[0.2em] text-foreground/80";

function progressLabel(p: ExtractProgress | null): string {
  if (!p) return "reading…";
  if (p.stage === "ocr") return `reading optically${p.fraction != null ? ` ${Math.round(p.fraction * 100)}%` : ""}${p.page ? ` · page ${p.page}` : ""}`;
  if (p.stage === "pages" && p.page && p.pages) return `reading page ${p.page} of ${p.pages}`;
  return "reading…";
}

export default function KnowledgeVaultView() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const v2 = useIsV2();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // corpus
  const [sources, setSources] = useState<VaultSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<number | null>(null);

  // add a source
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [textName, setTextName] = useState("");
  const [textBody, setTextBody] = useState("");
  const [webName, setWebName] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [webBlocked, setWebBlocked] = useState<{ url: string; name: string; why: string } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // ask
  const [query, setQuery] = useState("");
  const [retrieving, setRetrieving] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [result, setResult] = useState<RetrieveResult | null>(null);
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [openCite, setOpenCite] = useState<number | null>(null);
  const [context, setContext] = useState<{ n: number; before: string | null; after: string | null } | null>(null);
  const [canAnswer, setCanAnswer] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) { setLoading(false); setListError("this device has no identity yet — reload the page"); return; }
    setLoading(true);
    const r = await listSources(userId);
    if (!alive.current) return;
    setSources(r.sources);
    setListError(r.error);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let t: number | null = null;
    const off = onVaultChange(() => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => { void refresh(); }, 300);
    });
    return () => { off(); if (t) window.clearTimeout(t); };
  }, [refresh]);
  useEffect(() => {
    void modelReady().then((ok) => { if (alive.current) setCanAnswer(ok); });
  }, []);
  useEffect(() => () => { if (armTimer.current) window.clearTimeout(armTimer.current); }, []);

  /* ── add ── */

  const finishIngest = (label: string, r: { source: VaultSource | null; chunks: number; error: string | null }) => {
    if (r.error) { toast.error("source not added", { description: r.error }); return false; }
    if (r.source?.status === "empty") { toast.message(`“${r.source.name}” stored with no passages`, { description: r.source.error_message ?? undefined }); return true; }
    toast.success(`“${label}” indexed`, { description: `${r.chunks} passages, cut and ranked on this device.` });
    return true;
  };

  const handleText = async () => {
    if (!textName.trim() || !textBody.trim()) return toast.error("a name and some text are needed");
    setBusy("text");
    try {
      const r = await ingestText(userId, textName.trim(), textBody);
      if (!alive.current) return;
      if (finishIngest(textName.trim(), r)) { setTextName(""); setTextBody(""); }
    } finally { if (alive.current) setBusy(null); }
  };

  const handleFile = async (file: File) => {
    setBusy("file");
    setProgress(null);
    try {
      const r = await ingestFile(userId, file, (p) => { if (alive.current) setProgress(p); });
      if (!alive.current) return;
      finishIngest(file.name, r);
    } finally {
      if (alive.current) { setBusy(null); setProgress(null); }
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const handleWeb = async (viaReader: boolean, override?: { url: string; name: string }) => {
    const url = (override?.url ?? webUrl).trim();
    const name = (override?.name ?? webName).trim();
    if (!url) return toast.error("an address is needed");
    setBusy("web");
    setWebBlocked(null);
    try {
      const r = await ingestWeb(userId, name, url, viaReader);
      if (!alive.current) return;
      if (!r.source && !viaReader && (r.read.failure === "blocked" || r.read.failure === "http")) {
        setWebBlocked({ url, name, why: r.error ?? "the page could not be read directly" });
        return;
      }
      if (finishIngest(r.source?.name ?? name ?? url, r)) { setWebName(""); setWebUrl(""); }
    } finally { if (alive.current) setBusy(null); }
  };

  /* ── remove (two taps) ── */

  const remove = async (s: VaultSource) => {
    if (armed !== s.id) {
      setArmed(s.id);
      if (armTimer.current) window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => { if (alive.current) setArmed(null); }, 3500);
      return;
    }
    setArmed(null);
    const r = await deleteSource(userId, s.id);
    if (!alive.current) return;
    if (r.error) toast.error("source kept", { description: r.error });
    else {
      toast.success(`“${s.name}” removed`, { description: `${r.removedChunks} passages went with it.` });
      if (result?.passages.some((p) => p.sourceId === s.id)) { setResult(null); setAnswer(null); setOpenCite(null); }
    }
  };

  /* ── ask ── */

  const runRetrieve = async () => {
    const q = query.trim();
    if (!q) return;
    setRetrieving(true);
    setOpenCite(null);
    setContext(null);
    setAnswer(null);
    const r = await retrieveVault(userId, q, 8);
    if (!alive.current) return;
    setResult(r);
    setLastQuery(q);
    setRetrieving(false);
  };

  const runAnswer = async () => {
    if (!result?.passages.length || !lastQuery) return;
    setAnswering(true);
    const a = await answerFromPassages(lastQuery, result.passages);
    if (!alive.current) return;
    setAnswer(a);
    setAnswering(false);
  };

  const runAsk = async () => {
    const q = query.trim();
    if (!q) return;
    setRetrieving(true);
    setAnswering(true);
    setOpenCite(null);
    setContext(null);
    setAnswer(null);
    const { retrieved, answer: a } = await askVault(userId, q, 8);
    if (!alive.current) return;
    setResult(retrieved);
    setLastQuery(q);
    setAnswer(retrieved.passages.length ? a : null);
    setRetrieving(false);
    setAnswering(false);
  };

  const openPassage = async (p: VaultPassage) => {
    if (openCite === p.n) { setOpenCite(null); setContext(null); return; }
    setOpenCite(p.n);
    setContext(null);
    const ctx = await getPassageContext(userId, p.sourceId, p.chunkIndex);
    if (alive.current) setContext({ n: p.n, before: ctx.before, after: ctx.after });
    requestAnimationFrame(() => document.getElementById(`vault-cite-${p.n}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const dropToBoard = (passages: VaultPassage[]) => {
    if (!passages.length) return;
    queueBoardDrop({
      kind: "brief",
      source: "knowledge-vault",
      title: lastQuery.slice(0, 80) || "vault notes",
      bullets: passages.slice(0, 8).map((p) => `[${p.n}] ${p.sourceName} — ${p.content.slice(0, 220)}`),
    });
    toast.success("cited notes queued for the whiteboard.");
  };

  const copyBrief = async () => {
    if (!result) return;
    const md = result.passages.map((p) => `[${p.n}] ${p.sourceName}\n${p.content}`).join("\n\n");
    const head = answer?.text ? `${answer.text}\n\n` : "";
    try {
      await navigator.clipboard.writeText(`# ${lastQuery}\n\n${head}${md}`);
      toast.success("cited brief copied.");
    } catch {
      toast.error("the clipboard refused — copy from the passages below instead.");
    }
  };

  /* ── render helpers ── */

  const totalPassages = sources.reduce((n, s) => n + s.chunk_count, 0);
  const indexedSources = sources.filter((s) => s.status === "indexed").length;

  const renderAnswer = () => {
    if (!result?.passages.length && !answering) return null;
    const parts = answer?.text ? answer.text.split(/(\[\d{1,2}\])/g) : [];
    return (
      <div className="rounded-xl border border-border/30 bg-foreground/[0.03] p-3" aria-live="polite">
        <div className="flex items-center gap-2 text-xs font-light text-foreground/85">
          <MessageSquareQuote className="h-3.5 w-3.5" /> shepherd, from these passages
        </div>
        {answering ? (
          <p className="mt-2 text-xs font-light text-muted-foreground/75"><Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />reading the passages…</p>
        ) : answer?.error ? (
          <p className="mt-2 text-xs font-light text-muted-foreground/80">{answer.error}</p>
        ) : answer ? (
          <p className="mt-2 whitespace-pre-wrap text-[12.5px] font-light leading-relaxed text-foreground/90">
            {parts.map((seg, i) => {
              const m = seg.match(/^\[(\d{1,2})\]$/);
              if (!m) return <span key={i}>{seg}</span>;
              const n = Number(m[1]);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { const p = result?.passages.find((x) => x.n === n); if (p) void openPassage(p); }}
                  className="mx-0.5 rounded-md border border-border/40 px-1 py-0 text-[10px] font-light text-foreground/85 hover:bg-foreground/10"
                  aria-label={`open passage ${n}`}
                >
                  [{n}]
                </button>
              );
            })}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="rounded-xl text-[11px] font-light" onClick={runAnswer} disabled={canAnswer === false}>
              answer from these passages
            </Button>
            {canAnswer === false && (
              <span className="text-[10px] font-light text-muted-foreground/65">connect a model key in settings → ai keys to ask shepherd. retrieval works without one.</span>
            )}
          </div>
        )}
        {answer && !answer.error && answer.cited.length === 0 && (
          <p className="mt-2 text-[10px] font-light text-muted-foreground/60">no passage was cited — read the answer as unsupported.</p>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-background/20">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <div className={card}>
          {!v2 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-border/20 px-5 py-4">
              <div className="min-w-0">
                <h1 className="text-[13px] font-light lowercase tracking-[0.22em] text-foreground/90">asherin.knowledge</h1>
                <p className="mt-1 text-xs font-light text-muted-foreground/80">your own documents, indexed on this device and cited.</p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[11px] font-light leading-relaxed text-muted-foreground/70">
            <span>every answer points at the passage it came from. nothing is read, ranked or stored off this device; shepherd sees only the passages it is about to cite.</span>
            <span className="ml-auto whitespace-nowrap text-muted-foreground/60">{indexedSources} sources · {totalPassages} passages · isolated only for now</span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
          {/* ask */}
          <div className="space-y-4">
            <section className={card}>
              <div className={head}>
                <Search className="h-3.5 w-3.5 text-muted-foreground/70" />
                <h2 className={h2}>ask</h2>
                <span className="ml-auto text-[10px] font-light text-muted-foreground/55">numbered cites · tap to open</span>
              </div>
              <div className="p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="what do my documents say about …"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !retrieving) { e.preventDefault(); void runRetrieve(); } }}
                    disabled={retrieving}
                    aria-label="question for the corpus"
                    className={field}
                  />
                  <Button onClick={() => void runRetrieve()} disabled={retrieving || !query.trim()} className="h-9 rounded-xl" variant="outline" aria-label="find passages">
                    {retrieving && !answering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                  <Button
                    onClick={() => void runAsk()}
                    disabled={retrieving || !query.trim() || canAnswer === false}
                    className="h-9 rounded-xl text-[11px] font-light"
                    variant="outline"
                    title={canAnswer === false ? "connect a model key in settings → ai keys" : "find passages and answer from them"}
                  >
                    {answering ? <Loader2 className="h-4 w-4 animate-spin" /> : "ask shepherd"}
                  </Button>
                </div>
                <p className="mt-2 text-[10px] font-light text-muted-foreground/55">
                  enter finds passages without a model. “ask shepherd” also writes an answer from them.
                </p>

                {result && (
                  <div className="mt-4 space-y-3">
                    {result.error && (
                      <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs font-light text-destructive/80" role="alert">{result.error}</p>
                    )}

                    {renderAnswer()}

                    {result.contradictions.length > 0 && (
                      <div className="rounded-xl border border-border/30 bg-foreground/[0.03] p-3">
                        <div className="flex items-center gap-2 text-xs font-light text-foreground/85">
                          <AlertTriangle className="h-3.5 w-3.5" /> these passages may disagree
                        </div>
                        <ul className="mt-1 space-y-1 text-[11px] font-light text-muted-foreground/75">
                          {result.contradictions.map((c, i) => (
                            <li key={i}>[{c.a}] vs [{c.b}] — {c.reason}. both are shown; neither is merged away.</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {!result.error && result.passages.length === 0 ? (
                      <p className="rounded-xl border border-border/25 bg-background/30 p-4 text-xs font-light text-muted-foreground/75">
                        {result.indexed === 0
                          ? "nothing is indexed yet. add a source on the right, then ask again."
                          : `no passage in this corpus covers “${lastQuery}”. shepherd is not asked, so nothing is guessed.`}
                      </p>
                    ) : result.passages.length > 0 ? (
                      <>
                        <div className="divide-y divide-border/20 rounded-xl border border-border/25 bg-background/30">
                          {result.passages.map((p) => {
                            const open = openCite === p.n;
                            const cited = answer?.cited.includes(p.n);
                            return (
                              <div key={p.n} id={`vault-cite-${p.n}`} className="p-3">
                                <button
                                  type="button"
                                  onClick={() => void openPassage(p)}
                                  aria-expanded={open}
                                  className="flex w-full items-center gap-2 text-left"
                                >
                                  {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />}
                                  <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-light ${cited ? "border-foreground/40 text-foreground" : "border-border/30 text-foreground/80"}`}>[{p.n}]</span>
                                  <span className="truncate text-xs font-light text-foreground/90">{p.sourceName}</span>
                                  <span className="ml-auto shrink-0 text-[10px] font-light text-muted-foreground/60" title="bm25 score relative to the best passage in this result">
                                    relevance {(p.relevance * 100).toFixed(0)}%
                                  </span>
                                </button>
                                {open && (
                                  <div className="mt-2 rounded-lg bg-foreground/[0.03] p-3 text-[12px] font-light leading-relaxed text-muted-foreground/85">
                                    {context?.n === p.n && context.before && (
                                      <p className="mb-2 whitespace-pre-wrap text-muted-foreground/50">{context.before.slice(-240)}</p>
                                    )}
                                    <p className="whitespace-pre-wrap text-foreground/85">
                                      {highlightSegments(p.content, lastQuery).map((seg, i) =>
                                        seg.hit
                                          ? <mark key={i} className="rounded bg-foreground/15 px-0.5 text-foreground">{seg.text}</mark>
                                          : <span key={i}>{seg.text}</span>,
                                      )}
                                    </p>
                                    {context?.n === p.n && context.after && (
                                      <p className="mt-2 whitespace-pre-wrap text-muted-foreground/50">{context.after.slice(0, 240)}</p>
                                    )}
                                    <p className="mt-2 text-[10px] text-muted-foreground/55">passage {p.chunkIndex + 1} of “{p.sourceName}” · matched: {p.matched.join(", ") || "—"}</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="rounded-xl text-[11px] font-light" onClick={() => dropToBoard(result.passages)}>
                            <PenSquare className="mr-1.5 h-3.5 w-3.5" /> send cited notes to whiteboard
                          </Button>
                          <Button size="sm" variant="ghost" className="rounded-xl text-[11px] font-light" onClick={() => void copyBrief()}>
                            <Copy className="mr-1.5 h-3.5 w-3.5" /> copy as cited brief
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* add + corpus */}
          <div className="space-y-4">
            <section className={card}>
              <div className={head}>
                <Upload className="h-3.5 w-3.5 text-muted-foreground/70" />
                <h2 className={h2}>add a source</h2>
                {busy && <span className="ml-auto text-[10px] font-light text-muted-foreground/60"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />{busy === "file" ? progressLabel(progress) : busy === "web" ? "fetching…" : "indexing…"}</span>}
              </div>
              <div className="p-4">
                <Tabs defaultValue="text">
                  <TabsList className="flex h-auto flex-wrap gap-1 border border-border/25 bg-background/40 p-1">
                    <TabsTrigger value="text" className="rounded-lg text-[11px] font-light"><FileText className="mr-1 h-3.5 w-3.5" /> text</TabsTrigger>
                    <TabsTrigger value="file" className="rounded-lg text-[11px] font-light"><Upload className="mr-1 h-3.5 w-3.5" /> file</TabsTrigger>
                    <TabsTrigger value="web" className="rounded-lg text-[11px] font-light"><Globe className="mr-1 h-3.5 w-3.5" /> web</TabsTrigger>
                  </TabsList>

                  <TabsContent value="text" className="space-y-2 pt-3">
                    <Input placeholder="name" value={textName} onChange={(e) => setTextName(e.target.value)} aria-label="source name" className={field} />
                    <Textarea placeholder="paste any text — notes, transcripts, manuals…" rows={6} value={textBody} onChange={(e) => setTextBody(e.target.value)} aria-label="source text" className="rounded-xl border-border/25 bg-background/40 text-sm font-light" />
                    <Button onClick={() => void handleText()} disabled={!!busy} variant="outline" className="h-9 w-full rounded-xl text-[11px] font-light">
                      {busy === "text" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                      index on this device
                    </Button>
                  </TabsContent>

                  <TabsContent value="file" className="space-y-2 pt-3">
                    <Input
                      ref={fileInput}
                      type="file"
                      accept={INGEST.accept}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
                      disabled={!!busy}
                      aria-label="choose a file to index"
                      className="rounded-xl border-border/25 bg-background/40 text-sm font-light"
                    />
                    <p className="text-[10px] font-light text-muted-foreground/70">
                      pdfs (text or scanned), .docx, photos of text, plain text and markup · up to {INGEST.maxFileLabel}. read here with the same readers as asherin.extract; the bytes are not kept, only the text.
                    </p>
                  </TabsContent>

                  <TabsContent value="web" className="space-y-2 pt-3">
                    <Input placeholder="name (optional)" value={webName} onChange={(e) => setWebName(e.target.value)} aria-label="source name" className={field} />
                    <Input placeholder="https://example.com/article" value={webUrl} onChange={(e) => { setWebUrl(e.target.value); setWebBlocked(null); }} aria-label="page address" className={field} inputMode="url" />
                    <p className="text-[10px] font-light text-muted-foreground/70">
                      fetched by this browser and reduced to prose. only sites that allow cross-origin reads answer directly; for the rest you can choose a reader relay.
                    </p>
                    <Button onClick={() => void handleWeb(false)} disabled={!!busy} variant="outline" className="h-9 w-full rounded-xl text-[11px] font-light">
                      {busy === "web" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
                      fetch and index
                    </Button>
                    {webBlocked && (
                      <div className="rounded-xl border border-border/30 bg-foreground/[0.03] p-3 text-[11px] font-light text-muted-foreground/80" role="status">
                        <p>{webBlocked.why}.</p>
                        <p className="mt-1">the page can be read through r.jina.ai, a public reader. its address — not your documents — is sent to that service.</p>
                        <Button size="sm" variant="outline" className="mt-2 rounded-xl text-[11px] font-light" disabled={!!busy} onClick={() => void handleWeb(true, webBlocked)}>
                          read it through r.jina.ai
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </section>

            <section className={card}>
              <div className={head}>
                <Database className="h-3.5 w-3.5 text-muted-foreground/70" />
                <h2 className={h2}>corpus</h2>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={loading}
                  aria-label="refresh the corpus list"
                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-light text-muted-foreground/60 hover:text-foreground disabled:opacity-40"
                >
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> refresh
                </button>
              </div>
              {listError ? (
                <div className="px-4 py-6 text-center text-xs font-light text-muted-foreground/75" role="alert">
                  <p>{listError}</p>
                  <Button size="sm" variant="outline" className="mt-3 rounded-xl text-[11px] font-light" onClick={() => void refresh()}>try again</Button>
                </div>
              ) : loading && sources.length === 0 ? (
                <div className="px-4 py-10 text-center text-xs font-light text-muted-foreground/70">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />reading the corpus…
                </div>
              ) : sources.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs font-light text-muted-foreground/70">
                  nothing indexed yet. add a text, a file or a page above and ask it a question.
                </p>
              ) : (
                <ul className="divide-y divide-border/15">
                  {sources.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="rounded-md border border-border/25 px-1.5 py-0.5 text-[9px] lowercase tracking-wide text-muted-foreground/70">{s.source_type === "url" ? "web" : s.source_type}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-light text-foreground/90" title={s.origin ?? undefined}>{s.name}</div>
                        <div className="text-[10px] font-light text-muted-foreground/65">
                          {s.chunk_count} passages{s.method ? ` · ${s.method}` : ""}{s.truncated ? " · cut at 400k chars" : ""} · {new Date(s.created_at).toLocaleDateString()}
                        </div>
                        {s.error_message && <div className="mt-0.5 text-[10px] font-light text-destructive/75">{s.error_message}</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => void remove(s)}
                        aria-label={armed === s.id ? `confirm removing ${s.name}` : `remove ${s.name}`}
                        className={`inline-flex items-center gap-1 rounded-lg p-1.5 text-[10px] font-light transition-colors hover:bg-foreground/5 ${armed === s.id ? "text-destructive" : "text-muted-foreground/60 hover:text-foreground"}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />{armed === s.id && <span>sure?</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
