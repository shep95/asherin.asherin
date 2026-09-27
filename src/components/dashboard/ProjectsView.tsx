import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  FolderPlus, Layers, Trash2, Loader2, Globe, Lock, Target, FileText, Brain, Check,
  ChevronRight, ArrowLeft, MessageSquare, Upload, Save, Plus, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  listProjects, setProjectMode, loadScopeCounts, getActiveScope, setActiveScope, onScopeChange,
  saveProjectInstructions,
  type Project, type ProjectMode, type ProjectScope, type ScopeCounts,
} from "@/lib/projects/scope";
import { listLibrary, ingestFile, deleteLibraryFile, type LibraryFile } from "@/lib/library/library";
import type { Conversation } from "@/components/dashboard/types";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";

const MODE_COPY: Record<ProjectMode, { label: string; detail: string; icon: typeof Lock }> = {
  isolated: {
    label: "Isolated sources",
    detail: "Answers may only use this project's files and notes. Anything outside the corpus is returned as unsure.",
    icon: Lock,
  },
  web: {
    label: "Web + corpus",
    detail: "Project files stay primary, but the model may also reach live sources and must label which is which.",
    icon: Globe,
  },
};

const card = "rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm";

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
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [scope, setScope] = useState<ProjectScope | null>(() => getActiveScope());
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => onScopeChange(setScope), []);

  const refreshCounts = useCallback(async (rows: Project[]) => {
    if (!user) return;
    const entries = await Promise.all(
      rows.map(async (p) => [p.id, await loadScopeCounts(user.id, p.id)] as const),
    );
    setCounts(Object.fromEntries(entries));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    listProjects(user.id).then((rows) => {
      if (!alive) return;
      setProjects(rows);
      setLoading(false);
      void refreshCounts(rows);
    });
    return () => { alive = false; };
  }, [user, refreshCounts]);

  const createProject = async () => {
    if (!user || !name.trim()) return;
    const { data, error } = await supabase.from("projects")
      .insert({ user_id: user.id, name: name.trim(), description: desc.trim(), mode: "isolated" } as never)
      .select("id,name,description,instructions,mode,created_at").single();
    if (error) { toast.error("Could not create project: " + error.message); return; }
    const created = { ...(data as unknown as Project), instructions: (data as { instructions?: string })?.instructions ?? "" };
    setProjects((prev) => [created, ...prev]);
    setCounts((prev) => ({ ...prev, [created.id]: { files: 0, filesReadable: 0, memories: 0 } }));
    setName(""); setDesc(""); setCreating(false);
    setOpenId(created.id);
  };

  const deleteProject = async (id: string) => {
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) { toast.error("Could not delete project: " + error.message); return; }
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (openId === id) setOpenId(null);
    if (scope?.projectId === id) setActiveScope(null);
  };

  const toggleMode = async (p: Project) => {
    const next: ProjectMode = p.mode === "isolated" ? "web" : "isolated";
    setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, mode: next } : x)));
    try {
      await setProjectMode(p.id, next);
    } catch {
      setProjects((prev) => prev.map((x) => (x.id === p.id ? { ...x, mode: p.mode } : x)));
      toast.error("Could not change the answer mode.");
    }
  };

  const activate = (p: Project) => {
    if (scope?.projectId === p.id) { setActiveScope(null); return; }
    setActiveScope({ projectId: p.id, name: p.name, mode: p.mode });
    toast.success(`Chat, Library and Memory are now scoped to ${p.name}.`);
  };

  const openProject = (p: Project) => {
    // Entering a workspace makes it the active scope — otherwise the files and
    // directions on screen would not be the ones a new conversation uses.
    if (scope?.projectId !== p.id) setActiveScope({ projectId: p.id, name: p.name, mode: p.mode });
    setOpenId(p.id);
  };

  const opened = openId ? (projects.find((p) => p.id === openId) ?? null) : null;

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (opened) {
    return (
      <ProjectWorkspace
        project={opened}
        counts={counts[opened.id]}
        conversations={conversations}
        onBack={() => setOpenId(null)}
        onToggleMode={() => toggleMode(opened)}
        onOpenConversation={onOpenConversation}
        onNewConversation={() => onNewProjectConversation?.(opened.id)}
        onInstructionsSaved={(text) =>
          setProjects((prev) => prev.map((x) => (x.id === opened.id ? { ...x, instructions: text } : x)))
        }
        onCountsChanged={() => { void refreshCounts(projects); }}
      />
    );
  }

  if (projects.length === 0 && !creating) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center max-w-md space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl border border-border/20 bg-card/30 backdrop-blur-sm flex items-center justify-center">
            <Layers className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-extralight tracking-wide text-foreground mb-2">Projects</h2>
            <p className="text-sm font-extralight text-muted-foreground">
              A project is a workspace that keeps its own files, standing directions and conversations. Walk in and the setup is already there.
            </p>
          </div>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm px-5 py-2.5 text-sm font-light text-foreground hover:bg-foreground/5 transition-colors">
            <FolderPlus className="h-4 w-4" /> Create First Project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {v2 ? (
          <V2Action>
            <button onClick={() => setCreating(true)} className={v2ActionClass}>
              <FolderPlus className="h-3.5 w-3.5" /> new project
            </button>
          </V2Action>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extralight tracking-wide text-foreground">Projects</h2>
              <p className="text-sm font-extralight text-muted-foreground mt-1">
                One active workspace at a time. Nothing from another project is ever read.
              </p>
            </div>
            <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 px-4 py-2 text-xs font-light text-foreground hover:bg-foreground/5 transition-colors">
              <FolderPlus className="h-4 w-4" /> New Project
            </button>
          </div>
        )}

        {creating && (
          <div className="rounded-xl border border-border/30 bg-card/20 p-4 space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" className="w-full bg-transparent text-sm font-light text-foreground placeholder:text-muted-foreground/50 outline-none" />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" className="w-full bg-transparent text-xs font-extralight text-muted-foreground placeholder:text-muted-foreground/50 outline-none" />
            <div className="flex gap-2">
              <button onClick={createProject} className="text-xs bg-foreground text-background px-3 py-1 rounded-lg">Create</button>
              <button onClick={() => setCreating(false)} className="text-xs text-muted-foreground">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {projects.map((p) => {
            const active = scope?.projectId === p.id;
            const c = counts[p.id];
            const mode = MODE_COPY[p.mode];
            const threads = conversations.filter((cv) => cv.projectId === p.id).length;
            return (
              <div key={p.id} className={`group rounded-xl border bg-card/20 backdrop-blur-sm p-4 space-y-3 transition-colors ${active ? "border-accent/40" : "border-border/20"}`}>
                <div className="flex items-start justify-between gap-3">
                  <button onClick={() => openProject(p)} className="min-w-0 text-left flex-1">
                    <p className="text-sm font-light text-foreground flex items-center gap-2">
                      {p.name}
                      {active && <span className="text-[9px] uppercase tracking-widest text-accent">active scope</span>}
                    </p>
                    {p.description && <p className="text-xs font-extralight text-muted-foreground mt-0.5">{p.description}</p>}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-muted-foreground/50">
                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {c ? `${c.filesReadable}/${c.files} files readable` : "…"}</span>
                      <span className="flex items-center gap-1"><Brain className="h-3 w-3" /> {c ? `${c.memories} scoped memories` : "…"}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {threads} conversation{threads === 1 ? "" : "s"}</span>
                      <span>{p.instructions?.trim() ? "directions set" : "no directions"}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => activate(p)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-light transition-colors ${
                        active ? "border-accent/40 text-accent" : "border-border/20 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {active ? <Check className="h-3 w-3" /> : <Target className="h-3 w-3" />}
                      {active ? "Scoped" : "Use scope"}
                    </button>
                    <button onClick={() => openProject(p)} aria-label={`Open ${p.name}`} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button onClick={() => deleteProject(p.id)} aria-label={`Delete ${p.name}`} className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => toggleMode(p)}
                  className="w-full text-left rounded-lg border border-border/20 bg-card/20 px-3 py-2 hover:bg-foreground/5 transition-colors"
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
  project, counts, conversations, onBack, onToggleMode,
  onOpenConversation, onNewConversation, onInstructionsSaved, onCountsChanged,
}: WorkspaceProps) => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("conversations");
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [directions, setDirections] = useState(project.instructions ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDirections(project.instructions ?? ""); }, [project.id, project.instructions]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setFilesLoading(true);
    listLibrary(user.id, project.id).then((rows) => {
      if (!alive) return;
      setFiles(rows);
      setFilesLoading(false);
    });
    return () => { alive = false; };
  }, [user, project.id]);

  const threads = useMemo(
    () => conversations.filter((c) => c.projectId === project.id),
    [conversations, project.id],
  );

  const upload = async (list: FileList | null) => {
    if (!user || !list || list.length === 0) return;
    setUploading(true);
    for (const f of Array.from(list)) {
      const res = await ingestFile(user.id, f, project.id, (updated) =>
        setFiles((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))),
      );
      if (res.error || !res.file) { toast.error(`${f.name}: ${res.error ?? "upload failed"}`); continue; }
      const added = res.file;
      setFiles((prev) => [added, ...prev]);
    }
    setUploading(false);
    onCountsChanged();
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = async (f: LibraryFile) => {
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
    try {
      await deleteLibraryFile(f);
      onCountsChanged();
    } catch {
      setFiles((prev) => [f, ...prev]);
      toast.error("Could not remove that file.");
    }
  };

  const saveDirections = async () => {
    setSaving(true);
    try {
      await saveProjectInstructions(project.id, directions);
      onInstructionsSaved(directions);
      toast.success("Directions saved. Every conversation in this project follows them.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the directions.");
    } finally {
      setSaving(false);
    }
  };

  const mode = MODE_COPY[project.mode];
  const dirty = (project.instructions ?? "") !== directions;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "conversations", label: "Conversations", count: threads.length },
    { id: "files", label: "Files", count: counts?.files ?? files.length },
    { id: "directions", label: "Directions" },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[11px] font-light text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> All projects
        </button>

        <div className={`${card} p-5 space-y-3`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">{project.name}</h2>
              {project.description && <p className="text-xs font-extralight text-muted-foreground mt-1">{project.description}</p>}
            </div>
            <span className="shrink-0 text-[9px] uppercase tracking-widest text-accent">active scope</span>
          </div>
          <button onClick={onToggleMode} className="w-full text-left rounded-lg border border-border/20 bg-card/20 px-3 py-2 hover:bg-foreground/5 transition-colors">
            <span className="flex items-center gap-2 text-[11px] font-light text-foreground">
              <mode.icon className="h-3 w-3" /> {mode.label}
            </span>
            <span className="block text-[10px] font-extralight text-muted-foreground/70 mt-1">{mode.detail}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
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
          <div className="space-y-2">
            <button onClick={onNewConversation} className={`${card} w-full flex items-center gap-2 px-4 py-3 text-xs font-light text-foreground hover:bg-foreground/5 transition-colors`}>
              <Plus className="h-3.5 w-3.5" /> New conversation in this project
            </button>
            {threads.length === 0 ? (
              <p className="text-xs font-extralight text-muted-foreground/70 px-1 py-4">
                No conversations here yet. A new one starts with this project's files and directions already in place.
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
          <div className="space-y-2">
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
              {uploading ? "Adding files…" : "Add files to this project"}
            </button>
            <p className="px-1 text-[10px] font-extralight text-muted-foreground/60">
              Text, PDF, Word, spreadsheets, markdown, images and code. Uploaded once, read by every conversation in this project. Files only become quotable once they read as text.
            </p>
            {filesLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : files.length === 0 ? (
              <p className="text-xs font-extralight text-muted-foreground/70 px-1 py-4">Nothing uploaded yet.</p>
            ) : files.map((f) => (
              <div key={f.id} className={`${card} group flex items-center justify-between gap-3 px-4 py-3`}>
                <div className="min-w-0">
                  <p className="truncate text-xs font-light text-foreground">{f.file_name}</p>
                  <p className="text-[10px] font-extralight text-muted-foreground/60 mt-0.5">
                    {(f.file_size / 1024).toFixed(0)} KB ·{" "}
                    {f.text_status === "ok"
                      ? `readable · ${f.text_chars.toLocaleString()} characters`
                      : f.text_status === "pending"
                        ? "reading…"
                        : f.text_status === "empty"
                          ? "no text found — stored, but not quotable"
                          : f.text_status === "unsupported"
                            ? "stored, but this format cannot be read as text"
                            : "could not be read"}
                  </p>
                </div>
                <button onClick={() => void removeFile(f)} aria-label={`Remove ${f.file_name}`} className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-all">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "directions" && (
          <div className="space-y-3">
            <div className={`${card} p-4 space-y-3`}>
              <p className="text-[11px] font-light text-foreground">Standing directions</p>
              <p className="text-[10px] font-extralight text-muted-foreground/70">
                Written once, active before every conversation in this project. Use it for role, tone, output shape, the frameworks to apply and what never to do. It shapes how answers are written; it never loosens honesty or sourcing.
              </p>
              <textarea
                value={directions}
                onChange={(e) => setDirections(e.target.value)}
                rows={14}
                placeholder="Operate as… Keep answers… Never…"
                className="w-full resize-y rounded-lg border border-border/20 bg-background/20 p-3 text-xs font-extralight leading-relaxed text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border/40"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-extralight text-muted-foreground/60">
                  {directions.length.toLocaleString()} characters · no limit
                </span>
                <button
                  onClick={() => void saveDirections()}
                  disabled={!dirty || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/20 bg-card/30 px-3 py-1.5 text-[11px] font-light text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-40"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {saving ? "Saving…" : dirty ? "Save directions" : "Saved"}
                </button>
              </div>
            </div>
            <p className="flex items-start gap-2 px-1 text-[10px] font-extralight text-muted-foreground/60">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              Text inside uploaded files is treated as material to read, never as instructions to follow. Only this field changes behaviour.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsView;
