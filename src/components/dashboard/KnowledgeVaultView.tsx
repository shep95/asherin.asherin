import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload, FileText, Link as LinkIcon, Trash2, Database, Sparkles, Loader2, Wand2, Send,
  Search, Youtube, Globe, AlertTriangle, PenSquare, ChevronDown, ChevronRight, Lock, Network,
} from "lucide-react";
import { toast } from "sonner";
import {
  ingestVault, retrieveVault, getVaultMode, setVaultMode, highlightSegments,
  type VaultMode, type VaultPassage, type RetrieveResult,
} from "@/lib/knowledgeVault/vault";
import { queueBoardDrop } from "@/lib/whiteboard/boardInbox";

type VaultSource = {
  id: string;
  name: string;
  source_type: "text" | "file" | "api" | "url" | "youtube";
  chunk_count: number | null;
  status: string;
  created_at: string;
  error_message: string | null;
};

export default function KnowledgeVaultView() {
  const [sources, setSources] = useState<VaultSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [textName, setTextName] = useState("");
  const [textBody, setTextBody] = useState("");

  const [apiName, setApiName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiHeaders, setApiHeaders] = useState("");

  const [webName, setWebName] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [ytName, setYtName] = useState("");
  const [ytUrl, setYtUrl] = useState("");

  // Retrieval console — numbered cites, jump-to passage, contradiction pairs.
  const [mode, setMode] = useState<VaultMode>(getVaultMode());
  const [query, setQuery] = useState("");
  const [retrieving, setRetrieving] = useState(false);
  const [result, setResult] = useState<RetrieveResult | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const [openCite, setOpenCite] = useState<number | null>(null);

  // Natural-language agent
  type AgentTurn = { role: "user" | "asherin"; text: string; intent?: string; matches?: { sourceName: string; similarity: number; content: string }[] };
  const [agentCmd, setAgentCmd] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentLog, setAgentLog] = useState<AgentTurn[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("aureon_vault_sources")
      .select("id,name,source_type,chunk_count,status,created_at,error_message")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setSources(((data as unknown) as VaultSource[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const ingest = async (payload: Parameters<typeof ingestVault>[0]) => {
    setBusy(true);
    try {
      const r = await ingestVault(payload);
      if (!r.ok) { toast.error(`Ingest failed: ${r.error}`); return false; }
      toast.success(`Indexed “${payload.name}” — ${r.chunkCount ?? 0} passages embedded`);
      await refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const handleText = async () => {
    if (!textName.trim() || !textBody.trim()) return toast.error("Name and content required");
    if (await ingest({ sourceType: "text", name: textName.trim(), content: textBody })) {
      setTextName(""); setTextBody("");
    }
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    await ingest({ sourceType: "file", name: file.name, content: text });
  };

  const handleWeb = async () => {
    if (!webUrl.trim()) return toast.error("URL required");
    const name = webName.trim() || webUrl.trim().replace(/^https?:\/\//, "").slice(0, 80);
    if (await ingest({ sourceType: "url", name, url: webUrl.trim() })) {
      setWebName(""); setWebUrl("");
    }
  };

  const handleYoutube = async () => {
    if (!ytUrl.trim()) return toast.error("YouTube URL required");
    const name = ytName.trim() || "youtube transcript";
    if (await ingest({ sourceType: "youtube", name, url: ytUrl.trim() })) {
      setYtName(""); setYtUrl("");
    }
  };

  const handleApi = async () => {
    if (!apiName.trim() || !apiUrl.trim()) return toast.error("Name and URL required");
    let apiHeadersObj: Record<string, string> | undefined;
    if (apiHeaders.trim()) {
      try { apiHeadersObj = JSON.parse(apiHeaders); } catch { return toast.error("Headers must be valid JSON"); }
    }
    if (await ingest({ sourceType: "api", name: apiName.trim(), apiUrl: apiUrl.trim(), apiHeaders: apiHeadersObj })) {
      setApiName(""); setApiUrl(""); setApiHeaders("");
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("aureon_vault_sources").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Source removed"); refresh(); }
  };

  const runRetrieve = async () => {
    const q = query.trim();
    if (!q) return;
    setRetrieving(true);
    setOpenCite(null);
    const r = await retrieveVault(q, 8);
    setResult(r);
    setLastQuery(q);
    setRetrieving(false);
    if (r.error) toast.error(r.error);
    else if (!r.passages.length) toast.message("No passage in the corpus covers that.");
  };

  const changeMode = (next: VaultMode) => {
    setMode(next);
    setVaultMode(next);
    toast.success(next === "isolated"
      ? "Isolated — answers come from vault passages or say unsure."
      : "Hybrid — live web runs as a labelled second tool.");
  };

  const dropToBoard = (passages: VaultPassage[]) => {
    if (!passages.length) return;
    queueBoardDrop({
      kind: "brief",
      source: "knowledge-vault",
      title: lastQuery.slice(0, 80) || "vault notes",
      bullets: passages.slice(0, 8).map((p) => `[${p.n}] ${p.sourceName} — ${p.content.slice(0, 220)}`),
    });
    toast.success("Cited notes queued for the whiteboard.");
  };

  const runAgent = async () => {
    const cmd = agentCmd.trim();
    if (!cmd) return;
    setAgentLog((l) => [...l, { role: "user", text: cmd }]);
    setAgentCmd("");
    setAgentBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("vault-agent", { body: { command: cmd } });
      if (error) throw error;
      const r = data as { intent?: string; message?: string; answer?: string; matches?: AgentTurn["matches"] };
      const text = r?.intent === "QUERY" ? (r.answer ?? r.message ?? "") : (r?.message ?? "Done.");
      setAgentLog((l) => [...l, { role: "asherin", text, intent: r?.intent, matches: r?.matches }]);
      if (r?.intent === "WRITE" || r?.intent === "FETCH_WRITE") await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAgentLog((l) => [...l, { role: "asherin", text: `Agent error: ${msg}` }]);
      toast.error(msg);
    } finally {
      setAgentBusy(false);
    }
  };

  const totalPassages = sources.reduce((n, s) => n + (s.chunk_count ?? 0), 0);

  return (
    <div className="h-full overflow-y-auto bg-background/20">
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        {/* header: one hairline strip, product voice, no gradient wash */}
        <div className="rounded-2xl border border-border/25 bg-background/40 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-3 border-b border-border/20 px-5 py-4">
            <div className="min-w-0">
              <h1 className="text-[13px] font-light uppercase tracking-[0.22em] text-foreground/90">asherin.knowledge</h1>
              <p className="mt-1 text-xs font-light text-muted-foreground/80">
                your own documents, embedded and cited. every answer points at the passage it came from.
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-[11px] font-light text-muted-foreground/60 sm:inline">
                {sources.length} sources · {totalPassages} passages
              </span>
              <div className="flex rounded-xl border border-border/25 bg-background/40 p-1">
                {(["isolated", "hybrid"] as VaultMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => changeMode(m)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-light transition-colors ${
                      mode === m ? "bg-foreground/10 text-foreground" : "text-muted-foreground/70 hover:text-foreground"
                    }`}
                  >
                    {m === "isolated" ? <Lock className="h-3.5 w-3.5" /> : <Network className="h-3.5 w-3.5" />}
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="px-5 py-3 text-[11px] font-light leading-relaxed text-muted-foreground/70">
            {mode === "isolated"
              ? "isolated · answers come only from vault passages. if the corpus does not cover it, asherin says unsure instead of reaching for the web."
              : "hybrid · the vault answers first. live web runs as an explicit second tool and stays labelled, never blended into a vault citation."}
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
          {/* left column: ask the corpus, then talk to it */}
          <div className="space-y-4">
            <section className="rounded-2xl border border-border/25 bg-background/35 backdrop-blur-xl">
              <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
                <Search className="h-3.5 w-3.5 text-muted-foreground/70" />
                <h2 className="text-[11px] font-light uppercase tracking-[0.2em] text-foreground/80">retrieve</h2>
                <span className="ml-auto text-[10px] font-light text-muted-foreground/55">numbered cites · click to open</span>
              </div>
              <div className="p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="ask the corpus — what do my documents say about …"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !retrieving) { e.preventDefault(); runRetrieve(); } }}
                    disabled={retrieving}
                    className="h-9 rounded-xl border-border/25 bg-background/40 text-sm font-light"
                  />
                  <Button onClick={runRetrieve} disabled={retrieving || !query.trim()} className="h-9 rounded-xl" variant="outline">
                    {retrieving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {result && (
                  <div className="mt-4 space-y-3">
                    {result.contradictions.length > 0 && (
                      <div className="rounded-xl border border-border/30 bg-foreground/[0.03] p-3">
                        <div className="flex items-center gap-2 text-xs font-light text-foreground/85">
                          <AlertTriangle className="h-3.5 w-3.5" /> the corpus disagrees with itself
                        </div>
                        <ul className="mt-1 space-y-1 text-[11px] font-light text-muted-foreground/75">
                          {result.contradictions.map((c, i) => (
                            <li key={i}>[{c.a}] vs [{c.b}] — {c.reason}. both are cited; neither is merged away.</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {result.passages.length === 0 ? (
                      <p className="rounded-xl border border-border/25 bg-background/30 p-4 text-xs font-light text-muted-foreground/75">
                        no passage in this corpus covers that. in isolated mode asherin says unsure rather than guess.
                      </p>
                    ) : (
                      <>
                        <div className="divide-y divide-border/20 rounded-xl border border-border/25 bg-background/30">
                          {result.passages.map((p) => {
                            const open = openCite === p.n;
                            return (
                              <div key={p.n} className="p-3">
                                <button
                                  type="button"
                                  onClick={() => setOpenCite(open ? null : p.n)}
                                  className="flex w-full items-center gap-2 text-left"
                                >
                                  {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />}
                                  <span className="rounded-md border border-border/30 px-1.5 py-0.5 text-[10px] font-light text-foreground/80">[{p.n}]</span>
                                  <span className="truncate text-xs font-light text-foreground/90">{p.sourceName}</span>
                                  <span className="ml-auto shrink-0 text-[10px] font-light text-muted-foreground/60">
                                    match {(p.similarity * 100).toFixed(0)}%
                                  </span>
                                </button>
                                {open && (
                                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-foreground/[0.03] p-3 text-[12px] font-light leading-relaxed text-muted-foreground/85">
                                    {highlightSegments(p.content, lastQuery).map((seg, i) =>
                                      seg.hit
                                        ? <mark key={i} className="rounded bg-foreground/15 px-0.5 text-foreground">{seg.text}</mark>
                                        : <span key={i}>{seg.text}</span>,
                                    )}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" className="rounded-xl text-[11px] font-light" onClick={() => dropToBoard(result.passages)}>
                            <PenSquare className="mr-1.5 h-3.5 w-3.5" /> send cited notes to whiteboard
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-xl text-[11px] font-light"
                            onClick={() => {
                              const md = result.passages
                                .map((p) => `[${p.n}] ${p.sourceName}\n${p.content}`)
                                .join("\n\n");
                              navigator.clipboard.writeText(`# ${lastQuery}\n\n${md}`);
                              toast.success("cited passages copied.");
                            }}
                          >
                            copy as cited brief
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border/25 bg-background/35 backdrop-blur-xl">
              <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
                <Wand2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                <h2 className="text-[11px] font-light uppercase tracking-[0.2em] text-foreground/80">vault agent</h2>
                <span className="ml-auto text-[10px] font-light text-muted-foreground/55">store · fetch · answer</span>
              </div>
              <div className="p-4">
                {agentLog.length > 0 && (
                  <div className="mb-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-border/20 bg-background/30 p-3">
                    {agentLog.map((t, i) => (
                      <div key={i} className="text-xs font-light text-muted-foreground/85">
                        <span className="text-foreground/90">{t.role === "user" ? "you" : "asherin"}</span>
                        {t.intent && <span className="ml-2 rounded border border-border/30 px-1 py-0.5 text-[9px] uppercase">{t.intent}</span>}
                        <div className="mt-1 whitespace-pre-wrap">{t.text}</div>
                        {t.matches && t.matches.length > 0 && (
                          <div className="mt-2 space-y-1 text-[10px]">
                            {t.matches.slice(0, 3).map((m, j) => (
                              <div key={j} className="truncate">
                                <span className="text-foreground/80">[{m.sourceName}]</span> · sim {(m.similarity * 100).toFixed(0)}% · {m.content.slice(0, 140)}…
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="talk to the vault — asherin decides whether to store, fetch, or answer."
                    value={agentCmd}
                    onChange={(e) => setAgentCmd(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !agentBusy) { e.preventDefault(); runAgent(); } }}
                    disabled={agentBusy}
                    className="h-9 rounded-xl border-border/25 bg-background/40 text-sm font-light"
                  />
                  <Button onClick={runAgent} disabled={agentBusy || !agentCmd.trim()} variant="outline" className="h-9 rounded-xl">
                    {agentBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </section>
          </div>

          {/* right column: what is in the corpus, and how to add to it */}
          <div className="space-y-4">
            <section className="rounded-2xl border border-border/25 bg-background/35 backdrop-blur-xl">
              <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
                <Upload className="h-3.5 w-3.5 text-muted-foreground/70" />
                <h2 className="text-[11px] font-light uppercase tracking-[0.2em] text-foreground/80">add a source</h2>
              </div>
              <div className="p-4">
                <Tabs defaultValue="text">
                  <TabsList className="flex h-auto flex-wrap gap-1 border border-border/25 bg-background/40 p-1">
                    <TabsTrigger value="text" className="rounded-lg text-[11px] font-light"><FileText className="mr-1 h-3.5 w-3.5" /> text</TabsTrigger>
                    <TabsTrigger value="file" className="rounded-lg text-[11px] font-light"><Upload className="mr-1 h-3.5 w-3.5" /> file</TabsTrigger>
                    <TabsTrigger value="web" className="rounded-lg text-[11px] font-light"><Globe className="mr-1 h-3.5 w-3.5" /> web</TabsTrigger>
                    <TabsTrigger value="youtube" className="rounded-lg text-[11px] font-light"><Youtube className="mr-1 h-3.5 w-3.5" /> video</TabsTrigger>
                    <TabsTrigger value="api" className="rounded-lg text-[11px] font-light"><LinkIcon className="mr-1 h-3.5 w-3.5" /> api</TabsTrigger>
                  </TabsList>

                  <TabsContent value="text" className="space-y-2 pt-3">
                    <Input placeholder="name" value={textName} onChange={(e) => setTextName(e.target.value)} className="h-9 rounded-xl border-border/25 bg-background/40 text-sm font-light" />
                    <Textarea placeholder="paste any text — notes, transcripts, manuals…" rows={6} value={textBody} onChange={(e) => setTextBody(e.target.value)} className="rounded-xl border-border/25 bg-background/40 text-sm font-light" />
                    <Button onClick={handleText} disabled={busy} variant="outline" className="h-9 w-full rounded-xl text-[11px] font-light">
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      embed and index
                    </Button>
                  </TabsContent>

                  <TabsContent value="file" className="space-y-2 pt-3">
                    <Input
                      type="file"
                      accept=".txt,.md,.csv,.json,.log,.html,.xml,.yaml,.yml"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                      disabled={busy}
                      className="rounded-xl border-border/25 bg-background/40 text-sm font-light"
                    />
                    <p className="text-[10px] font-light text-muted-foreground/70">text-based formats only (.txt, .md, .csv, .json, .log, .html, .xml, .yaml).</p>
                  </TabsContent>

                  <TabsContent value="web" className="space-y-2 pt-3">
                    <Input placeholder="name (optional)" value={webName} onChange={(e) => setWebName(e.target.value)} className="h-9 rounded-xl border-border/25 bg-background/40 text-sm font-light" />
                    <Input placeholder="https://example.com/article" value={webUrl} onChange={(e) => setWebUrl(e.target.value)} className="h-9 rounded-xl border-border/25 bg-background/40 text-sm font-light" />
                    <p className="text-[10px] font-light text-muted-foreground/70">fetched server side and reduced to readable prose. private and loopback addresses are refused.</p>
                    <Button onClick={handleWeb} disabled={busy} variant="outline" className="h-9 w-full rounded-xl text-[11px] font-light">
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}
                      fetch and index
                    </Button>
                  </TabsContent>

                  <TabsContent value="youtube" className="space-y-2 pt-3">
                    <Input placeholder="name (optional)" value={ytName} onChange={(e) => setYtName(e.target.value)} className="h-9 rounded-xl border-border/25 bg-background/40 text-sm font-light" />
                    <Input placeholder="https://www.youtube.com/watch?v=…" value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} className="h-9 rounded-xl border-border/25 bg-background/40 text-sm font-light" />
                    <p className="text-[10px] font-light text-muted-foreground/70">uses the caption track the video publishes. if none exists the ingest fails plainly rather than storing an empty document.</p>
                    <Button onClick={handleYoutube} disabled={busy} variant="outline" className="h-9 w-full rounded-xl text-[11px] font-light">
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Youtube className="mr-2 h-4 w-4" />}
                      pull transcript
                    </Button>
                  </TabsContent>

                  <TabsContent value="api" className="space-y-2 pt-3">
                    <Input placeholder="source name" value={apiName} onChange={(e) => setApiName(e.target.value)} className="h-9 rounded-xl border-border/25 bg-background/40 text-sm font-light" />
                    <Input placeholder="https://api.example.com/endpoint" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} className="h-9 rounded-xl border-border/25 bg-background/40 text-sm font-light" />
                    <Textarea placeholder='optional headers as json, e.g. {"Authorization":"Bearer …"}' rows={3} value={apiHeaders} onChange={(e) => setApiHeaders(e.target.value)} className="rounded-xl border-border/25 bg-background/40 text-sm font-light" />
                    <Button onClick={handleApi} disabled={busy} variant="outline" className="h-9 w-full rounded-xl text-[11px] font-light">
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                      pull and index
                    </Button>
                  </TabsContent>
                </Tabs>
              </div>
            </section>

            <section className="rounded-2xl border border-border/25 bg-background/35 backdrop-blur-xl">
              <div className="flex items-center gap-2 border-b border-border/20 px-4 py-3">
                <Database className="h-3.5 w-3.5 text-muted-foreground/70" />
                <h2 className="text-[11px] font-light uppercase tracking-[0.2em] text-foreground/80">corpus</h2>
                <button
                  type="button"
                  onClick={refresh}
                  disabled={loading}
                  className="ml-auto text-[10px] font-light text-muted-foreground/60 hover:text-foreground disabled:opacity-40"
                >
                  refresh
                </button>
              </div>
              {loading ? (
                <div className="px-4 py-10 text-center text-xs font-light text-muted-foreground/70">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />loading
                </div>
              ) : sources.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs font-light text-muted-foreground/70">
                  nothing indexed yet. add a source and asherin starts citing it.
                </p>
              ) : (
                <div className="divide-y divide-border/15">
                  {sources.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="rounded-md border border-border/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/70">{s.source_type}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-light text-foreground/90">{s.name}</div>
                        <div className="text-[10px] font-light text-muted-foreground/65">
                          {s.chunk_count ?? 0} passages · {s.status}
                          {s.error_message ? ` · ${s.error_message}` : ""} · {new Date(s.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(s.id)}
                        aria-label={`remove ${s.name}`}
                        className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
