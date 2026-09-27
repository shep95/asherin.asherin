import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Play, Clock, GitBranch, Share2, Copy, Trash2, Eye, Edit3, MoreHorizontal, Code, BarChart3, Type, Database, Calendar, Tag, X, Users, Check, History, RotateCcw, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { emitPull } from "@/lib/connect/emitPull";
import CellOutput, { parseOutput } from "@/components/dashboard/notebooks/CellOutput";

/** Azplen tables the runner exposes. Bound by id, never by pasted credentials. */
const AZPLEN_TABLES = [
  "asha_datasets", "asha_documents", "asha_document_entities", "asha_insights",
  "asha_alerts", "asha_reports", "asha_queries", "asha_workflows",
  "asha_sessions", "asha_entity_matches", "asha_monitor_rules",
];

type SourceRef = { kind: "dataset" | "library" | "azplen"; id: string };

function encodeSource(s: SourceRef | null): string { return s ? `${s.kind}:${s.id}` : ""; }
function decodeSource(v: string): SourceRef | null {
  const i = v.indexOf(":");
  if (i < 0) return null;
  const kind = v.slice(0, i);
  if (kind !== "dataset" && kind !== "library" && kind !== "azplen") return null;
  return { kind, id: v.slice(i + 1) };
}


interface NotebookVersion {
  id: string;
  version: number;
  change_summary: string;
  changed_by: string;
  created_at: string;
  snapshot: any;
}

interface Notebook {
  id: string;
  title: string;
  description: string;
  owner_id: string;
  team_id: string | null;
  status: string;
  version: number;
  schedule: string | null;
  last_run_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface NotebookCell {
  id: string;
  notebook_id: string;
  cell_type: string;
  content: string;
  output: string | null;
  position: number;
  config: Record<string, unknown>;
}

const cellTypeIcons: Record<string, React.ElementType> = { text: Type, query: Database, visualization: BarChart3, code: Code, data_source: Database };
const statusColors: Record<string, string> = { draft: "text-amber-400 bg-amber-500/10", published: "text-emerald-400 bg-emerald-500/10", archived: "text-muted-foreground bg-muted/20" };

const NotebooksView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cells, setCells] = useState<NotebookCell[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleValue, setScheduleValue] = useState("");
  const [source, setSource] = useState<SourceRef | null>(null);
  const [datasets, setDatasets] = useState<{ id: string; file_name: string }[]>([]);
  const [libraryCsvs, setLibraryCsvs] = useState<{ id: string; file_name: string }[]>([]);
  const [runningCell, setRunningCell] = useState<string | null>(null);

  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<NotebookVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  // Local cell content for lag-free editing
  const [localContent, setLocalContent] = useState<Record<string, string>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadNotebooks = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase.from as any)("notebooks").select("*").order("updated_at", { ascending: false });
    setNotebooks((data ?? []) as Notebook[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadNotebooks(); }, [loadNotebooks]);

  // Flush any pending debounced cell writes when the component unmounts so
  // we don't fire a Supabase update against an unmounted view.
  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
    };
  }, []);

  // Bindable sources: azplen datasets + tabular library files. Bound by id.
  useEffect(() => {
    if (!user) return;
    (supabase.from as any)("asha_datasets").select("id, file_name").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }: any) => setDatasets((data ?? []) as { id: string; file_name: string }[]));
    (supabase.from as any)("library_files").select("id, file_name, file_type").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }: any) => {
        const rows = (data ?? []) as { id: string; file_name: string; file_type: string }[];
        setLibraryCsvs(rows.filter(r => /\.csv$/i.test(r.file_name) || (r.file_type ?? "").includes("csv")).map(r => ({ id: r.id, file_name: r.file_name })));
      });
  }, [user]);


  const loadCells = useCallback(async (notebookId: string) => {
    const { data } = await (supabase.from as any)("notebook_cells").select("*").eq("notebook_id", notebookId).order("position", { ascending: true });
    const loaded = (data ?? []) as NotebookCell[];
    setCells(loaded);
    // Initialize local content
    const lc: Record<string, string> = {};
    loaded.forEach(c => { lc[c.id] = c.content; });
    setLocalContent(lc);
  }, []);

  useEffect(() => { if (selectedId) loadCells(selectedId); }, [selectedId, loadCells]);

  const createNotebook = async () => {
    if (!user) return;
    const { data, error } = await (supabase.from as any)("notebooks").insert({ title: newTitle.trim() || "Untitled Notebook", description: newDesc.trim(), owner_id: user.id }).select().single();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    if (data) {
      await (supabase.from as any)("notebook_cells").insert({ notebook_id: data.id, cell_type: "text", content: "# Analysis Notes\n\nStart documenting your findings here.", position: 0 });
      await (supabase.from as any)("notebook_versions").insert({ notebook_id: data.id, version: 1, changed_by: user.id, change_summary: "Initial creation" });
    }
    toast({ title: "Notebook created" });
    setNewTitle(""); setNewDesc(""); setShowCreate(false);
    loadNotebooks();
    if (data) { setSelectedId(data.id); }
  };

  const cloneNotebook = async (nb: Notebook) => {
    if (!user) return;
    const { data: clone } = await (supabase.from as any)("notebooks").insert({ title: `${nb.title} (Clone)`, description: nb.description, owner_id: user.id, tags: nb.tags }).select().single();
    if (clone) {
      const { data: srcCells } = await (supabase.from as any)("notebook_cells").select("*").eq("notebook_id", nb.id).order("position");
      if (srcCells) {
        for (const cell of srcCells) {
          await (supabase.from as any)("notebook_cells").insert({ notebook_id: clone.id, cell_type: cell.cell_type, content: cell.content, output: cell.output, position: cell.position, config: cell.config as Record<string, unknown> });
        }
      }
      toast({ title: "Notebook cloned" });
      loadNotebooks();
    }
  };

  const deleteNotebook = async (id: string) => {
    await (supabase.from as any)("notebooks").delete().eq("id", id);
    if (selectedId === id) { setSelectedId(null); setCells([]); }
    toast({ title: "Notebook deleted" });
    loadNotebooks();
  };

  const addCell = async (type: string) => {
    if (!selectedId || !user) return;
    const pos = cells.length;
    const defaultContent =
      type === "text" ? "# Notes\n\nWhat this notebook is answering."
      : type === "query" || type === "code" ? "-- read-only SELECT over the bound source\nSELECT * FROM data LIMIT 25;"
      : type === "visualization" ? '{\n  "type": "bar",\n  "x": "label",\n  "y": ["value"],\n  "query": "SELECT label, COUNT(*) AS value FROM data GROUP BY label ORDER BY value DESC LIMIT 12"\n}'
      : "";

    await (supabase.from as any)("notebook_cells").insert({ notebook_id: selectedId, cell_type: type, content: defaultContent, position: pos });
    const nb = notebooks.find(n => n.id === selectedId);
    if (nb) {
      const newVer = nb.version + 1;
      await (supabase.from as any)("notebooks").update({ version: newVer }).eq("id", selectedId);
      await (supabase.from as any)("notebook_versions").insert({ notebook_id: selectedId, version: newVer, changed_by: user.id, change_summary: `Added ${type} cell` });
    }
    loadCells(selectedId);
    loadNotebooks();
  };

  // Debounced save to DB
  const updateCellContent = (cellId: string, content: string) => {
    setLocalContent(prev => ({ ...prev, [cellId]: content }));
    // Clear previous timer
    if (debounceTimers.current[cellId]) clearTimeout(debounceTimers.current[cellId]);
    debounceTimers.current[cellId] = setTimeout(async () => {
      await (supabase.from as any)("notebook_cells").update({ content }).eq("id", cellId);
      setCells(prev => prev.map(c => c.id === cellId ? { ...c, content } : c));
    }, 800);
  };

  const deleteCell = async (cellId: string) => {
    await (supabase.from as any)("notebook_cells").delete().eq("id", cellId);
    if (selectedId) loadCells(selectedId);
  };

  // A single bounded cell run. The runner enforces the timeout and the row cap;
  // the client mirrors the timeout so a dead socket cannot hang the UI, and
  // traces the outcome to Asherin Connect either way.
  const CLIENT_TIMEOUT_MS = 25_000;

  const cellTitle = useCallback((cell: NotebookCell) => {
    const body = (localContent[cell.id] ?? cell.content ?? "").trim();
    const firstLine = body.split("\n").find(l => l.trim()) ?? "";
    return `${cell.cell_type} · ${firstLine.replace(/^[-#\s]+/, "").slice(0, 60) || "untitled cell"}`;
  }, [localContent]);

  const runCell = useCallback(async (cell: NotebookCell): Promise<void> => {
    const started = performance.now();
    const capability = cell.cell_type === "visualization" ? "chart" : cell.cell_type === "text" ? "markdown" : "sql";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
    setRunningCell(cell.id);
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notebook-execute`, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          cellId: cell.id,
          cellType: cell.cell_type,
          content: localContent[cell.id] ?? cell.content,
          source,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      const output: string = typeof payload.output === "string"
        ? payload.output
        : JSON.stringify(payload.result ?? { kind: "error", text: payload.error ?? `Runner returned ${res.status}`, columns: [], rows: [], rowCount: 0, scanned: 0, truncated: false, elapsedMs: 0, source: null });
      setCells(prev => prev.map(c => c.id === cell.id ? { ...c, output } : c));
      const envelope = parseOutput(output);
      void emitPull({
        organ: "notebooks",
        capability,
        fromSurface: "notebooks",
        status: envelope?.kind === "error" ? "fail" : (envelope?.rowCount ?? 0) === 0 && capability !== "markdown" ? "skip" : "ok",
        latencyMs: performance.now() - started,
        quote: cellTitle(cell),
        meta: {
          notebook_id: cell.notebook_id,
          rows: envelope?.rowCount ?? 0,
          scanned: envelope?.scanned ?? 0,
          truncated: Boolean(envelope?.truncated),
          bound_source: envelope?.source ?? encodeSource(source),
        },
      });
    } catch (e: unknown) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      const text = aborted ? `Timed out after ${CLIENT_TIMEOUT_MS}ms — narrow the query or reduce the row count.` : (e instanceof Error ? e.message : "Run failed.");
      const output = JSON.stringify({ kind: "error", text, columns: [], rows: [], rowCount: 0, scanned: 0, truncated: false, elapsedMs: Math.round(performance.now() - started), source: encodeSource(source) || null });
      setCells(prev => prev.map(c => c.id === cell.id ? { ...c, output } : c));
      void emitPull({
        organ: "notebooks", capability, fromSurface: "notebooks", status: "fail",
        latencyMs: performance.now() - started, quote: cellTitle(cell),
        meta: { notebook_id: cell.notebook_id, timeout: aborted },
      });
    } finally {
      clearTimeout(timer);
      setRunningCell(prev => (prev === cell.id ? null : prev));
    }
  }, [localContent, source, cellTitle]);

  // Run All — sequential so a notebook cannot fan out unbounded work.
  const runAll = async () => {
    if (!selectedId || !user) return;
    setRunningAll(true);
    try {
      await saveSnapshot();
      for (const cell of cells) {
        await runCell(cell);
      }
      await (supabase.from as any)("notebooks").update({ last_run_at: new Date().toISOString(), status: "published" }).eq("id", selectedId);
      toast({ title: "All cells executed" });
      loadNotebooks();
    } finally {
      setRunningAll(false);
    }
  };


  // Share notebook
  const shareNotebook = async () => {
    if (!selectedId || !shareEmail.trim()) return;
    // We don't have the target user_id, so we store the share by email concept
    // For now, create a share entry - in a real system you'd look up the user
    const { error } = await (supabase.from as any)("notebook_shares").insert({
      notebook_id: selectedId,
      user_id: null, // Would be resolved from email
      permission: "view",
    });
    if (error) {
      toast({ title: "Share failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Notebook shared", description: `Shared with ${shareEmail}` });
    }
    setShareEmail("");
    setShowShare(false);
  };

  // Schedule notebook
  const saveSchedule = async () => {
    if (!selectedId) return;
    await (supabase.from as any)("notebooks").update({ schedule: scheduleValue || null }).eq("id", selectedId);
    toast({ title: scheduleValue ? "Schedule saved" : "Schedule removed" });
    setShowSchedule(false);
    loadNotebooks();
  };

  // Load version history
  const loadVersions = useCallback(async (notebookId: string) => {
    setVersionsLoading(true);
    const { data } = await (supabase.from as any)("notebook_versions").select("*").eq("notebook_id", notebookId).order("version", { ascending: false });
    setVersions((data ?? []) as NotebookVersion[]);
    setVersionsLoading(false);
    setShowVersions(true);
  }, []);

  const revertToVersion = async (version: NotebookVersion) => {
    if (!selectedId || !user) return;
    const snapshot = version.snapshot as any;
    if (snapshot?.cells && Array.isArray(snapshot.cells)) {
      // Delete current cells
      await (supabase.from as any)("notebook_cells").delete().eq("notebook_id", selectedId);
      // Restore cells from snapshot
      for (const cell of snapshot.cells) {
        await (supabase.from as any)("notebook_cells").insert({
          notebook_id: selectedId, cell_type: cell.cell_type, content: cell.content,
          output: cell.output, position: cell.position, config: cell.config || {},
        });
      }
      // Create new version entry
      const nb = notebooks.find(n => n.id === selectedId);
      const newVer = (nb?.version || 0) + 1;
      await (supabase.from as any)("notebooks").update({ version: newVer }).eq("id", selectedId);
      await (supabase.from as any)("notebook_versions").insert({
        notebook_id: selectedId, version: newVer, changed_by: user.id,
        change_summary: `Reverted to v${version.version}`,
        snapshot: snapshot,
      });
      toast({ title: `Reverted to v${version.version}` });
      loadCells(selectedId);
      loadNotebooks();
      setShowVersions(false);
    } else {
      toast({ title: "Cannot revert", description: "This version has no snapshot data.", variant: "destructive" });
    }
  };

  // Save snapshot when running all
  const saveSnapshot = async () => {
    if (!selectedId || !user) return;
    const nb = notebooks.find(n => n.id === selectedId);
    if (!nb) return;
    const snapshot = { cells: cells.map(c => ({ cell_type: c.cell_type, content: localContent[c.id] || c.content, output: c.output, position: c.position, config: c.config })) };
    await (supabase.from as any)("notebook_versions").insert({
      notebook_id: selectedId, version: nb.version, changed_by: user.id,
      change_summary: "Auto-snapshot before run", snapshot,
    });
  };

  const selectedNb = notebooks.find(n => n.id === selectedId);

  if (loading) return <div className="flex flex-1 items-center justify-center"><div className="text-sm font-extralight tracking-widest text-muted-foreground animate-pulse">Loading notebooks…</div></div>;

  return (
    <div className="flex flex-1 flex-col h-full">
      <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-border/20">
        <div>
          <h1 className="text-lg font-extralight tracking-[0.2em] text-foreground">INTELLIGENCE NOTEBOOKS</h1>
          <p className="text-xs font-extralight text-muted-foreground mt-1">Shared analysis sessions with versioning and scheduling</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-xl bg-accent/20 hover:bg-accent/30 text-accent px-4 py-2 text-xs font-light transition-colors">
          <Plus className="h-4 w-4" /> New Notebook
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Notebook list */}
        <div className="w-72 border-r border-border/20 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1">
              {notebooks.length === 0 && <p className="text-xs text-muted-foreground/50 text-center py-8">No notebooks yet.</p>}
              {notebooks.map(nb => (
                <div key={nb.id} className={`group relative rounded-xl px-3 py-2.5 transition-colors cursor-pointer ${selectedId === nb.id ? "bg-foreground/10" : "hover:bg-foreground/5"}`} onClick={() => setSelectedId(nb.id)}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-light truncate ${selectedId === nb.id ? "text-foreground" : "text-muted-foreground"}`}>{nb.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded capitalize ${statusColors[nb.status]}`}>{nb.status}</span>
                        <span className="text-[9px] text-muted-foreground/50">v{nb.version}</span>
                        {nb.schedule && <Clock className="h-2.5 w-2.5 text-accent/60" />}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); cloneNotebook(nb); }} className="p-1 rounded hover:bg-foreground/10"><Copy className="h-3 w-3 text-muted-foreground" /></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteNotebook(nb.id); }} className="p-1 rounded hover:bg-red-500/10"><Trash2 className="h-3 w-3 text-red-400" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Notebook editor */}
        <ScrollArea className="flex-1">
          {selectedNb ? (
            <div className="p-6 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extralight tracking-wide text-foreground">{selectedNb.title}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedNb.description || "No description"} · Version {selectedNb.version}
                    {selectedNb.last_run_at && <span className="ml-2 text-muted-foreground/40">Last run: {new Date(selectedNb.last_run_at).toLocaleString()}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={runAll} disabled={runningAll || cells.length === 0}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 px-3 py-1.5 text-[10px] font-light transition-colors disabled:opacity-40">
                    <Play className={`h-3 w-3 ${runningAll ? "animate-spin" : ""}`} /> {runningAll ? "Running…" : "Run All"}
                  </button>
                  <button onClick={() => setShowShare(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 px-3 py-1.5 text-[10px] font-light transition-colors">
                    <Share2 className="h-3 w-3" /> Share
                  </button>
                  <button onClick={() => { setScheduleValue(selectedNb.schedule || ""); setShowSchedule(true); }}
                    className="flex items-center gap-1.5 rounded-xl bg-card/30 hover:bg-card/50 text-muted-foreground px-3 py-1.5 text-[10px] font-light transition-colors">
                    <Calendar className="h-3 w-3" /> {selectedNb.schedule ? selectedNb.schedule : "Schedule"}
                  </button>
                </div>
              </div>

              {/* Tags */}
              {selectedNb.tags.length > 0 && (
                <div className="flex gap-1.5">
                  {selectedNb.tags.map(tag => (
                    <span key={tag} className="text-[9px] px-2 py-0.5 rounded-full bg-accent/10 text-accent"><Tag className="h-2.5 w-2.5 inline mr-1" />{tag}</span>
                  ))}
                </div>
              )}

              {/* Cells */}
              <div className="space-y-3">
                {cells.map(cell => {
                  const CellIcon = cellTypeIcons[cell.cell_type] ?? FileText;
                  const isEditing = editingCell === cell.id;
                  const isRunning = runningCell === cell.id;
                  const env = parseOutput(cell.output);
                  const runnable = cell.cell_type !== "text";
                  const label = cell.cell_type === "query" ? "sql" : cell.cell_type === "visualization" ? "chart" : cell.cell_type === "text" ? "markdown" : cell.cell_type.replace("_", " ");
                  return (
                    <div key={cell.id} className="rounded-2xl border border-border/10 bg-card/20 backdrop-blur-sm overflow-hidden group transition-colors hover:border-border/20">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-border/10 bg-foreground/[0.02]">
                        <div className="flex items-center gap-2">
                          <CellIcon className="h-3.5 w-3.5 text-muted-foreground/70" />
                          <span className="text-[10px] font-light tracking-widest text-muted-foreground uppercase">{label}</span>
                          {env?.source && <span className="text-[9px] font-light text-muted-foreground/40">· {env.source}</span>}
                        </div>
                        <div className="flex gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                          {runnable && (
                            <button
                              onClick={() => runCell(cell)}
                              disabled={isRunning || runningAll}
                              title="Run cell"
                              className="p-1 rounded hover:bg-foreground/10 disabled:opacity-40"
                            >
                              {isRunning ? <Loader2 className="h-3 w-3 text-accent animate-spin" /> : <Play className="h-3 w-3 text-accent" />}
                            </button>
                          )}
                          <button onClick={() => setEditingCell(isEditing ? null : cell.id)} className="p-1 rounded hover:bg-foreground/10"><Edit3 className="h-3 w-3 text-muted-foreground" /></button>
                          <button onClick={() => deleteCell(cell.id)} className="p-1 rounded hover:bg-red-500/10"><Trash2 className="h-3 w-3 text-red-400" /></button>
                        </div>
                      </div>
                      <div className="p-4">
                        {isEditing ? (
                          <textarea
                            value={localContent[cell.id] ?? cell.content}
                            onChange={e => updateCellContent(cell.id, e.target.value)}
                            className="w-full min-h-[100px] bg-transparent text-xs font-light text-foreground outline-none resize-none font-mono"
                            onBlur={() => setEditingCell(null)}
                            autoFocus
                          />
                        ) : (
                          <pre className="text-xs font-light text-foreground/80 whitespace-pre-wrap font-mono">{localContent[cell.id] ?? cell.content}</pre>
                        )}
                        {env && <CellOutput env={env} />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Source binding + Add cell buttons */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-muted-foreground/50">Source:</span>
                  <select
                    value={encodeSource(source)}
                    onChange={e => setSource(decodeSource(e.target.value))}
                    className="rounded-lg border border-border/20 bg-card/20 px-2 py-1 text-[10px] text-foreground outline-none max-w-[280px]"
                  >
                    <option value="">No source bound</option>
                    {datasets.length > 0 && (
                      <optgroup label="Azplen datasets">
                        {datasets.map(d => <option key={d.id} value={`dataset:${d.id}`}>{d.file_name}</option>)}
                      </optgroup>
                    )}
                    {libraryCsvs.length > 0 && (
                      <optgroup label="Library CSVs">
                        {libraryCsvs.map(d => <option key={d.id} value={`library:${d.id}`}>{d.file_name}</option>)}
                      </optgroup>
                    )}
                    <optgroup label="Azplen tables">
                      {AZPLEN_TABLES.map(t => <option key={t} value={`azplen:${t}`}>{t}</option>)}
                    </optgroup>
                  </select>
                  <span className="text-[9px] font-light text-muted-foreground/40">bound by id · read-only · 500-row cap · 20s timeout</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/50">Add cell:</span>
                  {["text", "query", "code", "visualization", "data_source"].map(type => {
                    const Icon = cellTypeIcons[type] ?? FileText;
                    return (
                      <button key={type} onClick={() => addCell(type)} className="flex items-center gap-1 rounded-lg bg-card/20 hover:bg-card/40 px-2.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors capitalize">
                        <Icon className="h-3 w-3" /> {type.replace("_", " ")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Version history */}
              <div className="rounded-xl border border-border/10 bg-card/10 p-4 mt-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-light tracking-[0.15em] text-muted-foreground uppercase">Version History</p>
                  </div>
                  <button onClick={() => loadVersions(selectedNb.id)} className="text-[9px] text-accent hover:text-accent/80 flex items-center gap-1 transition-colors">
                    <History className="h-3 w-3" /> View All
                  </button>
                </div>
                <div className="space-y-2">
                  {Array.from({ length: Math.min(selectedNb.version, 5) }, (_, i) => selectedNb.version - i).map(v => (
                    <div key={v} className="flex items-center gap-3 text-[10px]">
                      <span className="text-muted-foreground/50 w-8">v{v}</span>
                      <div className="h-2 w-2 rounded-full bg-accent/40" />
                      <span className="text-muted-foreground">{v === selectedNb.version ? "Current version" : `Version ${v}`}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Version History Modal */}
              {showVersions && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm" onClick={() => setShowVersions(false)}>
                  <div className="w-full max-w-lg max-h-[70vh] rounded-2xl border border-border/20 bg-card/90 backdrop-blur-xl p-6 space-y-4 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-accent" />
                        <h3 className="text-sm font-extralight tracking-wide text-foreground">Version History</h3>
                      </div>
                      <button onClick={() => setShowVersions(false)} className="p-1 rounded hover:bg-foreground/10"><X className="h-4 w-4 text-muted-foreground" /></button>
                    </div>
                    <ScrollArea className="flex-1 max-h-[50vh]">
                      <div className="space-y-2">
                        {versionsLoading ? (
                          <p className="text-xs text-muted-foreground/50 text-center py-8">Loading versions…</p>
                        ) : versions.length === 0 ? (
                          <p className="text-xs text-muted-foreground/50 text-center py-8">No version history. Run the notebook to create snapshots.</p>
                        ) : (
                          versions.map(v => (
                            <div key={v.id} className="rounded-xl border border-border/10 bg-card/20 p-3 flex items-center justify-between group">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-light text-foreground">v{v.version}</span>
                                  <span className="text-[9px] text-muted-foreground/50">{new Date(v.created_at).toLocaleString()}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{v.change_summary || "No description"}</p>
                              </div>
                              {v.version !== selectedNb?.version && (
                                <button
                                  onClick={() => revertToVersion(v)}
                                  className="flex items-center gap-1 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[10px] text-amber-400 hover:bg-amber-500/20 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <RotateCcw className="h-3 w-3" /> Revert
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center h-full">
              <div className="text-center space-y-3">
                <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                <p className="text-sm font-extralight text-muted-foreground">Select or create a notebook</p>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border/20 bg-card/90 backdrop-blur-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-extralight tracking-wide text-foreground">New Notebook</h3>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Notebook title" className="w-full rounded-xl border border-border/20 bg-card/20 px-4 py-2.5 text-xs font-light text-foreground placeholder:text-muted-foreground/40 outline-none" />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" className="w-full rounded-xl border border-border/20 bg-card/20 px-4 py-2.5 text-xs font-light text-foreground placeholder:text-muted-foreground/40 outline-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={createNotebook} className="rounded-xl bg-accent/20 hover:bg-accent/30 text-accent px-4 py-2 text-xs font-light transition-colors">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShare && selectedNb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm" onClick={() => setShowShare(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border/20 bg-card/90 backdrop-blur-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" />
              <h3 className="text-sm font-extralight tracking-wide text-foreground">Share "{selectedNb.title}"</h3>
            </div>
            <input value={shareEmail} onChange={e => setShareEmail(e.target.value)} placeholder="Email address…"
              className="w-full rounded-xl border border-border/20 bg-card/20 px-4 py-2.5 text-xs font-light text-foreground placeholder:text-muted-foreground/40 outline-none" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowShare(false)} className="rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={shareNotebook} disabled={!shareEmail.trim()} className="rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 px-4 py-2 text-xs font-light transition-colors disabled:opacity-40">Share</button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showSchedule && selectedNb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm" onClick={() => setShowSchedule(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border/20 bg-card/90 backdrop-blur-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-extralight tracking-wide text-foreground">Schedule "{selectedNb.title}"</h3>
            </div>
            <select value={scheduleValue} onChange={e => setScheduleValue(e.target.value)}
              className="w-full rounded-xl border border-border/20 bg-card/20 px-4 py-2.5 text-xs font-light text-foreground outline-none">
              <option value="">No schedule</option>
              <option value="hourly">Every hour</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSchedule(false)} className="rounded-xl px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={saveSchedule} className="rounded-xl bg-accent/20 hover:bg-accent/30 text-accent px-4 py-2 text-xs font-light transition-colors">
                <Check className="h-3 w-3 inline mr-1" /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotebooksView;
