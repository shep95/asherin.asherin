import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, Upload, Search, FolderOpen, Trash2, Image, FileCode, Loader2, RefreshCw, Layers, AlertTriangle, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { MAX_FILE_SIZE_DISPLAY } from "@/lib/file-security";
import {
  listLibrary, ingestFile, searchLibrary, assignProject, retryExtract, resumePendingExtraction,
  TEXT_STATUS_LABEL, LIBRARY_LIST_LIMIT, formatBytes,
  type LibraryFile, type LibraryHit,
} from "@/lib/library/library";
import { listProjects, getActiveScope, setActiveScope, onScopeChange, reconcileScope, type Project, type ProjectScope } from "@/lib/projects/scope";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";
import FilePreview from "@/components/dashboard/library/FilePreview";
import { scheduleFileDelete } from "@/components/dashboard/library/undoDelete";

const fileIcon = (type: string) => {
  if (type.startsWith("image/")) return Image;
  if (/javascript|typescript|json|html|css/.test(type)) return FileCode;
  return FileText;
};

const byNewest = (a: LibraryFile, b: LibraryFile) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);

const LibraryView = () => {
  const v2 = useIsV2();
  const { user } = useAuth();
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<ProjectScope | null>(() => getActiveScope());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<LibraryHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<LibraryFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);

  useEffect(() => onScopeChange(setScope), []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const patchFile = useCallback((next: LibraryFile) => {
    setFiles((prev) => prev.map((f) => (f.id === next.id ? { ...f, ...next } : f)));
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [f, p] = await Promise.all([listLibrary(user.id), listProjects(user.id)]);
      if (!alive.current) return;
      setFiles(f);
      setProjects(p);
      setScope(reconcileScope(p));
      // a row left "reading…" by a closed tab is read again now, one at a time.
      void resumePendingExtraction(f, patchFile, () => alive.current);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "could not read the library.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [user, patchFile]);

  useEffect(() => { void load(); }, [load]);

  // content search is debounced; under two characters the plain list shows.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setHits(null); setSearching(false); return; }
    if (!user) return;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchLibrary(user.id, q, scope?.projectId ?? null);
        if (alive.current) setHits(res);
      } catch (e) {
        if (alive.current) toast.error(e instanceof Error ? e.message : "search failed.");
      } finally {
        if (alive.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search, user, scope?.projectId]);

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!user) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(fileList)) {
      const { file: created, error: err } = await ingestFile(user.id, file, scope?.projectId ?? null, patchFile);
      if (err || !created) {
        toast.error(`${file.name}: ${err ?? "upload failed"}`);
        continue;
      }
      setFiles((prev) => [created, ...prev]);
      ok++;
    }
    setUploading(false);
    if (ok > 0) toast.success(`${ok} file${ok === 1 ? "" : "s"} added — reading text on this device.`);
  };

  const remove = (file: LibraryFile) => {
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    setHits((prev) => prev?.filter((f) => f.id !== file.id) ?? null);
    if (preview?.id === file.id) setPreview(null);
    scheduleFileDelete(file, (restored) => {
      setFiles((prev) => (prev.some((f) => f.id === restored.id) ? prev : [...prev, restored].sort(byNewest)));
    });
  };

  const reExtract = async (file: LibraryFile) => {
    patchFile({ ...file, text_status: "pending" });
    const { status, chars } = await retryExtract(file);
    patchFile({ ...file, text_status: status, text_chars: chars });
  };

  const setProject = async (file: LibraryFile, projectId: string | null) => {
    const before = file.project_id;
    patchFile({ ...file, project_id: projectId });
    try {
      await assignProject(file.id, projectId);
    } catch (e) {
      patchFile({ ...file, project_id: before });
      toast.error(e instanceof Error ? e.message : "could not move that file.");
    }
  };

  const scoped = scope ? files.filter((f) => f.project_id === scope.projectId) : files;
  const rows: (LibraryFile & { snippet?: string | null })[] = hits ?? scoped;
  const docCount = scoped.filter((f) => !f.file_type.startsWith("image/")).length;
  const imgCount = scoped.filter((f) => f.file_type.startsWith("image/")).length;
  const readable = scoped.filter((f) => f.text_status === "ok").length;

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

  const uploadButton = (cls: string, icon = "h-4 w-4") => (
    <button onClick={() => inputRef.current?.click()} disabled={uploading} className={cls} aria-label="upload files">
      {uploading ? <Loader2 className={`${icon} animate-spin`} /> : <Upload className={icon} />}
      upload
    </button>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div
        className={`${v2 ? "max-w-4xl" : "max-w-3xl"} mx-auto p-4 sm:p-6 space-y-6 ${dragOver ? "ring-2 ring-accent/50 ring-inset rounded-2xl" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files); }}
      >
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) void uploadFiles(e.target.files); e.target.value = ""; }} />

        {v2 ? (
          // v.2: the shell names the room and holds the one primary action.
          <V2Action>{uploadButton(v2ActionClass, "h-3.5 w-3.5")}</V2Action>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-extralight tracking-wide text-foreground">library</h2>
              <p className="text-sm font-extralight text-muted-foreground mt-1">
                files stay on this device across conversations and are searched by content, not just by name.
              </p>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">max {MAX_FILE_SIZE_DISPLAY.toLowerCase()} per file · credential-shaped text is masked before it is indexed</p>
            </div>
            {uploadButton("inline-flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm px-4 py-2 text-xs font-light text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50")}
          </div>
        )}

        {scope && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/20 bg-card/20 px-3 py-2 text-[11px] font-light text-muted-foreground">
            <Layers className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              scoped to project <span className="text-foreground">{scope.name}</span> — new uploads land in this project.
            </span>
            <button onClick={() => setActiveScope(null)} className="inline-flex items-center gap-1 rounded-lg border border-border/20 px-2 py-0.5 text-[10px] hover:text-foreground" aria-label="show every file">
              <X className="h-3 w-3" /> all files
            </button>
          </div>
        )}

        {!v2 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: FileText, label: "documents", value: `${docCount} file${docCount === 1 ? "" : "s"}` },
              { icon: Image, label: "images", value: `${imgCount} file${imgCount === 1 ? "" : "s"}` },
              { icon: Search, label: "searchable", value: `${readable} indexed` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-3 sm:p-4 text-left">
                <Icon className="h-5 w-5 text-muted-foreground mb-2" />
                <p className="text-xs font-light text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-3 flex items-center gap-2">
          {searching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Search className="h-4 w-4 text-muted-foreground" />}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search names and file contents…"
            aria-label="search the library"
            className="flex-1 bg-transparent text-xs font-extralight text-foreground placeholder:text-muted-foreground/50 outline-none"
          />
          {hits && <span className="text-[10px] text-muted-foreground/50">{hits.length} {hits.length === 1 ? "hit" : "hits"}</span>}
        </div>

        {files.length >= LIBRARY_LIST_LIMIT && !hits && (
          <p className="text-[10px] text-muted-foreground/50">the newest {LIBRARY_LIST_LIMIT} files are shown; search still covers all of them.</p>
        )}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/30 py-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-extralight text-muted-foreground">
              {hits ? "nothing in the library matches that." : scope ? "nothing in this project yet — drop files here or press upload." : "drop files here or press upload."}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((f) => {
              const Icon = fileIcon(f.file_type);
              return (
                <div key={f.id} className="group rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <button onClick={() => setPreview(f)} className="flex min-w-[160px] flex-1 items-center gap-3 text-left" aria-label={`open ${f.file_name}`}>
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-light text-foreground">{f.file_name}</span>
                        <span className="block text-[10px] text-muted-foreground/50">
                          {formatBytes(f.file_size)} · {new Date(f.created_at).toLocaleDateString()} · {TEXT_STATUS_LABEL[f.text_status] ?? f.text_status}
                          {f.text_chars > 0 ? ` · ${f.text_chars.toLocaleString()} chars` : ""}
                        </span>
                      </span>
                    </button>
                    <div className="ml-auto flex items-center gap-1">
                      <select
                        value={f.project_id ?? ""}
                        onChange={(e) => void setProject(f, e.target.value || null)}
                        className="text-[10px] bg-card/40 border border-border/20 rounded-lg px-1.5 py-1 text-muted-foreground outline-none max-w-[120px]"
                        aria-label={`project for ${f.file_name}`}
                      >
                        <option value="">no project</option>
                        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {(f.text_status === "failed" || f.text_status === "empty") && (
                        <button onClick={() => void reExtract(f)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors" aria-label={`read ${f.file_name} again`} title="read again">
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => remove(f)}
                        aria-label={`remove ${f.file_name}`}
                        title="remove"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-all opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {f.snippet && (
                    <p className="mt-2 ml-7 text-[11px] font-extralight text-muted-foreground/70 border-l border-border/20 pl-3">
                      …{f.snippet}…
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
};

export default LibraryView;
