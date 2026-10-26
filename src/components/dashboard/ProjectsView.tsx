import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  FolderPlus, Layers, Trash2, Loader2, Globe, Lock, Target, FileText, Check,
  ChevronRight, ArrowLeft, MessageSquare, Upload, Save, Plus, AlertTriangle, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  listProjects, createProject, deleteProject, setProjectMode, loadScopeCounts, getActiveScope, setActiveScope,
  onScopeChange, reconcileScope, saveProjectInstructions, DIRECTIONS_BRIEF_CHARS, MAX_PROJECT_NAME, MAX_PROJECT_DESCRIPTION,
  type Project, type ProjectMode, type ProjectScope, type ScopeCounts,
} from "@/lib/projects/scope";
import { listLibrary, ingestFile, retryExtract, TEXT_STATUS_LABEL, formatBytes, type LibraryFile } from "@/lib/library/library";
import type { Conversation } from "@/components/dashboard/types";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";
import FilePreview from "@/components/dashboard/library/FilePreview";
import { scheduleFileDelete } from "@/components/dashboard/library/undoDelete";

const MODE_COPY: Record<ProjectMode, { label: string; detail: string; icon: typeof Lock }> = {
  isolated: {
    label: "isolated sources",
    detail: "answers ground on this project's files and directions only. where they fall short, shepherd says it is unsure.",
    icon: Lock,
  },
  web: {
    label: "web + corpus",
    detail: "project files stay primary; shepherd may add live sources and labels which is which.",
    icon: Globe,
  },
};

const card = "rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm";
const byNewest = (a: LibraryFile, b: LibraryFile) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);

interface ProjectsViewProps {
  conversations?: Conversation[];
  onOpenConversation?: (id: string) => void;
  onNewProjectConversation?: (projectId: string) => void;
}

type Tab = "conversations" | "files" | "directions";

const ProjectsView = ({ conversations = [], onOpenConversation, onNewProjectConversation }: ProjectsViewProps) => {
  const v2 = useIsV2();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<string, ScopeCounts>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [scope, setScope] = useState<ProjectScope | null>(() => getActiveScope());
  const [openId, setOpenId] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => onScopeChange(setScope), []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refreshCounts = useCallback(async (rows: Project[]) => {
    if (!user) return;
    const entries = await Promise.all(
      rows.map(async (p) => [p.id, await loadScopeCounts(user.id, p.id)] as const),
    );
    if (alive.current) setCounts(Object.fromEntries(entries));
  }, [user]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listProjects(user.id);
      if (!alive.current) return;
      setProjects(rows);
      setScope(reconcileScope(rows));
      void refreshCounts(rows);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "could not read your projects.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [user, refreshCounts]);

  useEffect(() => { void load(); }, [load]);

  const submitCreate = async () => {
    if (!user || !name.trim() || saving) return;
    setSaving(true);
    try {
      const created = await createProject(user.id, name, desc);
      setProjects((prev) => [created, ...prev]);
      setCounts((prev) => ({ ...prev, [created.id]: { files: 0, filesReadable: 0 } }));
      setName(""); setDesc(""); setCreating(false);
      // entering the new workspace makes it the active scope — see openProject.
      setActiveScope({ projectId: created.id, name: created.name, mode: created.mode });
      setOpenId(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "could not create the project.");
    } finally {
      setSaving(false);
    }
  };

  const removeProject = async (p: Project) => {
    const c = counts[p.id];
    const threads = conversations.filter((cv) => cv.projectId === p.id).length;
    const ok = window.confirm(
      `delete project "${p.name}"?\n\nits ${c?.files ?? 0} file${c?.files === 1 ? "" : "s"} stay in the library and its ${threads} conversation${threads === 1 ? "" : "s"} stay in chat — only the workspace and its directions go. this cannot be undone.`,
    );
    if (!ok) return;
    try {
      await deleteProject(p.id);
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
      if (openId === p.id) setOpenId(null);
      toast.success(`${p.name} deleted — its files and conversations were released, not removed.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "could not delete the project.");
    }
  };

  const toggleMode = async (p: Project) => {
    const next: ProjectMode = p.mode === "isolated" ? "web" : "isolated";
    setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, mode: next } : x)));
    try {
      await setProjectMode(p.id, next);
    } catch {
      setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, mode: p.mode } : x)));
      toast.error("could not change the answer mode.");
    }
  };

  const activate = (p: Project) => {
    if (scope?.projectId === p.id) { setActiveScope(null); toast(`scope cleared — new conversations and uploads are unscoped.`); return; }
    setActiveScope({ projectId: p.id, name: p.name, mode: p.mode });
    toast.success(`new conversations and uploads now belong to ${p.name}.`);
  };

  const openProject = (p: Project) => {
    // Entering a workspace makes it the active scope — otherwise the files and
    // directions on screen would not be the ones a new conversation uses.
    if (scope?.projectId !== p.id) setActiveScope({ projectId: p.id, name: p.name, mode: p.mode });
    setOpenId(p.id);
  };

  const opened = openId ? (projects.find((p) => p.id === openId) ?? null) : null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" aria-busy="true">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div role="alert" className="max-w-sm space-y-3 rounded-xl border border-destructive/30 bg-card/20 p-4 text-center">
          <AlertTriangle className="mx-auto h-5 w-5 text-destructive" />
          <p className="text-xs font-extralight text-muted-foreground">{error}</p>
          <button onClick={() => void load()} className="text-xs font-light text-foreground underline-offset-4 hover:underline">try again</button>
        </div>
      </div>
    );
  }

  if (opened) {
    return (
      <ProjectWorkspace
        project={opened}
        active={scope?.projectId === opened.id}
        counts={counts[opened.id]}
        conversations={conversations}
        onBack={() => setOpenId(null)}
        onToggleMode={() => void toggleMode(opened)}
        onOpenConversation={onOpenConversation}
        onNewConversation={() => onNewProjectConversation?.(opened.id)}
        onInstructionsSaved={(text) =>
          setProjects((prev) => prev.map((x) => (x.id === opened.id ? { ...x, instructions: text } : x)))
        }
        onCountsChanged={() => { void refreshCounts(projects); }}
      />
    );
  }

  const createForm = creating && (
    <form
      onSubmit={(e) => { e.preventDefault(); void submitCreate(); }}
      className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3"
      aria-label="new project"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_PROJECT_NAME}
        placeholder="project name"
        aria-label="project name"
        autoFocus
        className="w-full bg-transparent text-sm font-light text-foreground placeholder:text-muted-foreground/50 outline-none"
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        maxLength={MAX_PROJECT_DESCRIPTION}
        placeholder="description (optional)"
        aria-label="project description"
        className="w-full bg-transparent text-xs font-extralight text-muted-foreground placeholder:text-muted-foreground/50 outline-none"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={!name.trim() || saving} className="text-xs bg-foreground text-background px-3 py-1 rounded-lg disabled:opacity-40">
          {saving ? "creating…" : "create"}
        </button>
        <button type="button" onClick={() => { setCreating(false); setName(""); setDesc(""); }} className="text-xs text-muted-foreground">cancel</button>
      </div>
    </form>
  );

  if (projects.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl border border-border/20 bg-card/30 backdrop-blur-sm flex items-center justify-center">
            <Layers className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            {!v2 && <h2 className="text-xl font-extralight tracking-wide text-foreground mb-2">projects</h2>}
            <p className="text-sm font-extralight text-muted-foreground">
              a project is a workspace that keeps its own files, standing directions and conversations. walk in and the setup is already there.
            </p>
          </div>
          {createForm || (
            <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm px-5 py-2.5 text-sm font-light text-foreground hover:bg-foreground/5 transition-colors">
              <FolderPlus className="h-4 w-4" /> create your first project
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {v2 ? (
          <V2Action>
            <button onClick={() => setCreating(true)} className={v2ActionClass}>
              <FolderPlus className="h-3.5 w-3.5" /> new project
            </button>
          </V2Action>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-extralight tracking-wide text-foreground">projects</h2>
              <p className="text-sm font-extralight text-muted-foreground mt-1">
                one active workspace at a time. a conversation inside it reads only that project's files and directions.
              </p>
            </div>
            <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 px-4 py-2 text-xs font-light text-foreground hover:bg-foreground/5 transition-colors">
              <FolderPlus className="h-4 w-4" /> new project
            </button>
          </div>
        )}

        {createForm}

        <div className="space-y-2">
          {projects.map((p) => {
            const active = scope?.projectId === p.id;
            const c = counts[p.id];
            const mode = MODE_COPY[p.mode];
            const threads = conversations.filter((cv) => cv.projectId === p.id).length;
            return (
              <div key={p.id} className={`group rounded-xl border bg-card/20 backdrop-blur-sm p-4 space-y-3 transition-colors ${active ? "border-accent/40" : "border-border/20"}`}>
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => openProject(p)} className="min-w-0 text-left flex-1" aria-label={`open ${p.name}`}>
                    <p className="text-sm font-light text-foreground flex flex-wrap items-center gap-2">
                      <span className="truncate">{p.name}</span>
                      {active && <span className="text-[9px] uppercase tracking-widest text-accent">active scope</span>}
                    </p>
                    {p.description && <p className="text-xs font-extralight text-muted-foreground mt-0.5">{p.description}</p>}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-muted-foreground/50">
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {c ? `${c.filesReadable} of ${c.files} file${c.files === 1 ? "" : "s"} readable` : "…"}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {threads} conversation{threads === 1 ? "" : "s"}</span>
                      <span>{p.instructions?.trim() ? "directions set" : "no directions"}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => activate(p)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-light transition-colors ${
                        active ? "border-accent/40 text-accent" : "border-border/20 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {active ? <Check className="h-3 w-3" /> : <Target className="h-3 w-3" />}
                      {active ? "scoped" : "use scope"}
                    </button>
                    <button onClick={() => openProject(p)} aria-label={`open ${p.name}`} className="hidden sm:block p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => void removeProject(p)}
                      aria-label={`delete ${p.name}`}
                      title="delete project"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-all opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => void toggleMode(p)}
                  className="w-full text-left rounded-lg border border-border/20 bg-card/20 px-3 py-2 hover:bg-foreground/5 transition-colors"
                  aria-label={`answer mode: ${mode.label}. press to switch`}
                >
                  <span className="flex items-center gap-2 text-[11px] font-light text-foreground">
                    <mode.icon className="h-3 w-3" /> {mode.label}
                  </span>
                  <span className="block text-[10px] font-extralight text-muted-foreground/70 mt-1">{mode.detail}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── The workspace itself ──────────────────────────────────────────────────
interface WorkspaceProps {
  project: Project;
  active: boolean;
  counts?: ScopeCounts;
  conversations: Conversation[];
  onBack: () => void;
  onToggleMode: () => void;
  onOpenConversation?: (id: string) => void;
  onNewConversation: () => void;
  onInstructionsSaved: (text: string) => void;
  onCountsChanged: () => void;
}

const ProjectWorkspace = ({
  project, active, counts, conversations, onBack, onToggleMode,
  onOpenConversation, onNewConversation, onInstructionsSaved, onCountsChanged,
}: WorkspaceProps) => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("conversations");
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [directions, setDirections] = useState(project.instructions ?? "");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<LibraryFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setDirections(project.instructions ?? ""); }, [project.id, project.instructions]);

  const patchFile = useCallback((updated: LibraryFile) => {
    setFiles((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
  }, []);

  const loadFiles = useCallback(async () => {
    if (!user) return;
    setFilesLoading(true);
    setFilesError(null);
    try {
      const rows = await listLibrary(user.id, project.id);
      if (alive.current) setFiles(rows);
    } catch (e) {
      if (alive.current) setFilesError(e instanceof Error ? e.message : "could not read this project's files.");
    } finally {
      if (alive.current) setFilesLoading(false);
    }
  }, [user, project.id]);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const threads = useMemo(
    () => conversations.filter((c) => c.projectId === project.id),
    [conversations, project.id],
  );

  const upload = async (list: FileList | null) => {
    if (!user || !list || list.length === 0) return;
    setUploading(true);
    for (const f of Array.from(list)) {
      const res = await ingestFile(user.id, f, project.id, patchFile);
      if (res.error || !res.file) { toast.error(`${f.name}: ${res.error ?? "upload failed"}`); continue; }
      const added = res.file;
      setFiles((prev) => [added, ...prev]);
    }
    setUploading(false);
    onCountsChanged();
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (f: LibraryFile) => {
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
    if (preview?.id === f.id) setPreview(null);
    scheduleFileDelete(
      f,
      (restored) => setFiles((prev) => (prev.some((x) => x.id === restored.id) ? prev : [...prev, restored].sort(byNewest))),
      () => onCountsChanged(),
    );
  };

  const reExtract = async (f: LibraryFile) => {
    patchFile({ ...f, text_status: "pending" });
    const { status, chars } = await retryExtract(f);
    patchFile({ ...f, text_status: status, text_chars: chars });
    onCountsChanged();
  };

  const saveDirections = async () => {
    setSaving(true);
    try {
      await saveProjectInstructions(project.id, directions);
      onInstructionsSaved(directions);
      toast.success("directions saved. every conversation in this project follows them.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "could not save the directions.");
    } finally {
      setSaving(false);
    }
  };

  const mode = MODE_COPY[project.mode];
  const dirty = (project.instructions ?? "") !== directions;
  const overBrief = directions.length > DIRECTIONS_BRIEF_CHARS;

  const back = () => {
    if (dirty && !window.confirm("leave without saving the directions? the unsaved text will be lost.")) return;
    onBack();
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "conversations", label: "conversations", count: threads.length },
    { id: "files", label: "files", count: counts?.files ?? files.length },
    { id: "directions", label: "directions" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
        <button onClick={back} className="inline-flex items-center gap-1.5 text-[11px] font-light text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> all projects
        </button>

        <div className={`${card} p-4 sm:p-5 space-y-3`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-extralight tracking-wide text-foreground break-words">{project.name}</h2>
              {project.description && <p className="text-xs font-extralight text-muted-foreground mt-1">{project.description}</p>}
            </div>
            <span className={`shrink-0 text-[9px] uppercase tracking-widest ${active ? "text-accent" : "text-muted-foreground/50"}`}>
              {active ? "active scope" : "not active"}
            </span>
          </div>
          <button onClick={onToggleMode} className="w-full text-left rounded-lg border border-border/20 bg-card/20 px-3 py-2 hover:bg-foreground/5 transition-colors" aria-label={`answer mode: ${mode.label}. press to switch`}>
            <span className="flex items-center gap-2 text-[11px] font-light text-foreground">
              <mode.icon className="h-3 w-3" /> {mode.label}
            </span>
            <span className="block text-[10px] font-extralight text-muted-foreground/70 mt-1">{mode.detail}</span>
          </button>
        </div>

        <div className="flex items-center gap-1" role="tablist" aria-label="project sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-light transition-colors ${
                tab === t.id ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}{typeof t.count === "number" ? ` · ${t.count}` : ""}
            </button>
          ))}
        </div>

        {tab === "conversations" && (
          <div className="space-y-2" role="tabpanel">
            <button onClick={onNewConversation} className={`${card} w-full flex items-center gap-2 px-4 py-3 text-xs font-light text-foreground hover:bg-foreground/5 transition-colors`}>
              <Plus className="h-3.5 w-3.5" /> new conversation in this project
            </button>
            {threads.length === 0 ? (
              <p className="text-xs font-extralight text-muted-foreground/70 px-1 py-4">
                no conversations here yet. a new one starts with this project's files and directions already in place.
              </p>
            ) : threads.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenConversation?.(c.id)}
                className={`${card} w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-foreground/5 transition-colors`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-light text-foreground">{c.title}</span>
                  <span className="block text-[10px] font-extralight text-muted-foreground/60 mt-0.5">
                    {c.createdAt instanceof Date ? c.createdAt.toLocaleDateString() : ""}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              </button>
            ))}
          </div>
        )}

        {tab === "files" && (
          <div className="space-y-2" role="tabpanel">
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => void upload(e.target.files)}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className={`${card} w-full flex items-center gap-2 px-4 py-3 text-xs font-light text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50`}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? "adding files…" : "add files to this project"}
            </button>
            <p className="px-1 text-[10px] font-extralight text-muted-foreground/60">
              text, csv, json, yaml, xml, sql, logs, pdf, spreadsheets, zip and images, up to 500mb each. text-like files and pdfs are read on this device and become quotable; images, spreadsheets and archives are stored but not read.
            </p>
            {filesLoading ? (
              <div className="flex justify-center py-6" aria-busy="true"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : filesError ? (
              <div role="alert" className="px-1 py-4 text-xs font-extralight text-muted-foreground">
                {filesError} <button onClick={() => void loadFiles()} className="text-foreground underline-offset-4 hover:underline">try again</button>
              </div>
            ) : files.length === 0 ? (
              <p className="text-xs font-extralight text-muted-foreground/70 px-1 py-4">nothing uploaded yet.</p>
            ) : files.map((f) => (
              <div key={f.id} className={`${card} group flex items-center justify-between gap-3 px-4 py-3`}>
                <button onClick={() => setPreview(f)} className="min-w-0 flex-1 text-left" aria-label={`open ${f.file_name}`}>
                  <p className="truncate text-xs font-light text-foreground">{f.file_name}</p>
                  <p className="text-[10px] font-extralight text-muted-foreground/60 mt-0.5">
                    {formatBytes(f.file_size)} · {TEXT_STATUS_LABEL[f.text_status] ?? f.text_status}
                    {f.text_status === "ok" ? ` · ${f.text_chars.toLocaleString()} characters` : ""}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {(f.text_status === "failed" || f.text_status === "empty") && (
                    <button onClick={() => void reExtract(f)} aria-label={`read ${f.file_name} again`} title="read again" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => removeFile(f)}
                    aria-label={`remove ${f.file_name}`}
                    title="remove"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-all opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "directions" && (
          <div className="space-y-3" role="tabpanel">
            <div className={`${card} p-4 space-y-3`}>
              <p className="text-[11px] font-light text-foreground">standing directions</p>
              <p className="text-[10px] font-extralight text-muted-foreground/70">
                written once, in force before every conversation in this project. use it for role, tone, output shape, the frameworks to apply and what never to do. it shapes how answers are written; it never loosens honesty or sourcing.
              </p>
              <textarea
                value={directions}
                onChange={(e) => setDirections(e.target.value)}
                rows={14}
                placeholder="operate as… keep answers… never…"
                aria-label="standing directions"
                className="w-full resize-y rounded-lg border border-border/20 bg-background/20 p-3 text-xs font-extralight leading-relaxed text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border/40"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[10px] font-extralight text-muted-foreground/60">
                  {directions.length.toLocaleString()} characters
                  {overBrief ? ` · stored whole; the first ${DIRECTIONS_BRIEF_CHARS.toLocaleString()} reach shepherd each turn` : ""}
                  {dirty ? " · unsaved" : ""}
                </span>
                <button
                  onClick={() => void saveDirections()}
                  disabled={!dirty || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/20 bg-card/30 px-3 py-1.5 text-[11px] font-light text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-40"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {saving ? "saving…" : dirty ? "save directions" : "saved"}
                </button>
              </div>
            </div>
            <p className="flex items-start gap-2 px-1 text-[10px] font-extralight text-muted-foreground/60">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              text inside uploaded files is treated as material to read, never as instructions to follow. only this field changes behaviour.
            </p>
          </div>
        )}
      </div>
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
};

export default ProjectsView;
