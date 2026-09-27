import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, Upload, Search, FolderOpen, Trash2, Image, FileCode, Loader2, RefreshCw, Layers } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { MAX_FILE_SIZE_DISPLAY } from "@/lib/file-security";
import {
  listLibrary, ingestFile, searchLibrary, deleteLibraryFile, assignProject, retryExtract,
  type LibraryFile, type LibraryHit, type TextStatus,
} from "@/lib/library/library";
import { listProjects, getActiveScope, onScopeChange, type Project, type ProjectScope } from "@/lib/projects/scope";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";

const fileIcon = (type: string) => {
  if (type.startsWith("image/")) return Image;
  if (/javascript|typescript|json|html|css/.test(type)) return FileCode;
  return FileText;
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const STATUS_LABEL: Record<TextStatus, string> = {
  pending: "reading…",
  ok: "searchable",
  empty: "no text found",
  unsupported: "text not extractable",
  failed: "extraction failed",
};

const LibraryView = () => {
  const v2 = useIsV2();
  const { user } = useAuth();
  const { toast } = useToast();
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<ProjectScope | null>(() => getActiveScope());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<LibraryHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => onScopeChange(setScope), []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoading(true);
    Promise.all([listLibrary(user.id), listProjects(user.id)]).then(([f, p]) => {
      if (!alive) return;
      setFiles(f);
      setProjects(p);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user]);

  // Content search is debounced and hits the database; name-only filtering
  // stays local so typing never feels laggy.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setHits(null); setSearching(false); return; }
    if (!user) return;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchLibrary(user.id, q, scope?.projectId ?? null);
      setHits(res);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search, user, scope?.projectId]);

  const patchFile = useCallback((next: LibraryFile) => {
    setFiles((prev) => prev.map((f) => (f.id === next.id ? { ...f, ...next } : f)));
  }, []);

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!user) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(fileList)) {
      const { file: created, error } = await ingestFile(user.id, file, scope?.projectId ?? null, patchFile);
      if (error || !created) {
        toast({ title: "File rejected", description: error ?? "Upload failed", variant: "destructive" });
        continue;
      }
      setFiles((prev) => [created, ...prev]);
      ok++;
    }
    setUploading(false);
    if (ok > 0) toast({ title: `${ok} file(s) added`, description: "Text extraction runs in the background." });
  };

  const remove = async (file: LibraryFile) => {
    await deleteLibraryFile(file);
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    setHits((prev) => prev?.filter((f) => f.id !== file.id) ?? null);
  };

  const reExtract = async (file: LibraryFile) => {
    patchFile({ ...file, text_status: "pending" });
    const status = await retryExtract(file);
    patchFile({ ...file, text_status: status });
  };

  const setProject = async (file: LibraryFile, projectId: string | null) => {
    patchFile({ ...file, project_id: projectId });
    await assignProject(file.id, projectId);
  };

  const scoped = scope ? files.filter((f) => f.project_id === scope.projectId) : files;
  const rows: (LibraryFile & { snippet?: string | null })[] = hits ?? scoped;
  const docCount = scoped.filter((f) => !f.file_type.startsWith("image/")).length;
  const imgCount = scoped.filter((f) => f.file_type.startsWith("image/")).length;
  const readable = scoped.filter((f) => f.text_status === "ok").length;

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div
        className={`${v2 ? "max-w-4xl" : "max-w-3xl"} mx-auto p-6 space-y-6 ${dragOver ? "ring-2 ring-accent/50 ring-inset rounded-2xl" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); }}
      >
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ""; }} />

        {v2 ? (
          // v.2: the shell names the room and holds the one primary action.
          // Vanity counters (documents / images / searchable) are dropped —
          // the file list is the count.
          <V2Action>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className={v2ActionClass}
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              upload
            </button>
          </V2Action>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-extralight tracking-wide text-foreground">Your Library</h2>
              <p className="text-sm font-extralight text-muted-foreground mt-1">
                Files persist across conversations and are searched by content, not just by name.
              </p>
              <p className="text-[10px] text-muted-foreground/40 mt-0.5">Max {MAX_FILE_SIZE_DISPLAY} per file · Credential-shaped text is masked before it is indexed</p>
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 backdrop-blur-sm px-4 py-2 text-xs font-light text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload
            </button>
          </div>
        )}

        {scope && (
          <div className="flex items-center gap-2 rounded-xl border border-border/20 bg-card/20 px-3 py-2 text-[11px] font-light text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            Scoped to project <span className="text-foreground">{scope.name}</span> — new uploads land in this project.
          </div>
        )}

        {!v2 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: FileText, label: "Documents", value: `${docCount} files` },
            { icon: Image, label: "Images", value: `${imgCount} files` },
            { icon: Search, label: "Searchable", value: `${readable} indexed` },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-4 text-left">
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
            placeholder="Search names and file contents…"
            className="flex-1 bg-transparent text-xs font-extralight text-foreground placeholder:text-muted-foreground/50 outline-none"
          />
          {hits && <span className="text-[10px] text-muted-foreground/50">{hits.length} hit(s)</span>}
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-extralight text-muted-foreground">
              {hits ? "Nothing in the library matches that." : "Drop files here or click Upload"}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((f) => {
              const Icon = fileIcon(f.file_type);
              return (
                <div key={f.id} className="group rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-light text-foreground truncate">{f.file_name}</p>
                      <p className="text-[10px] text-muted-foreground/50">
                        {formatSize(f.file_size)} · {new Date(f.created_at).toLocaleDateString()} · {STATUS_LABEL[f.text_status] ?? f.text_status}
                        {f.text_chars > 0 ? ` · ${f.text_chars.toLocaleString()} chars` : ""}
                      </p>
                    </div>
                    <select
                      value={f.project_id ?? ""}
                      onChange={(e) => setProject(f, e.target.value || null)}
                      className="text-[10px] bg-card/40 border border-border/20 rounded-lg px-1.5 py-1 text-muted-foreground outline-none max-w-[130px]"
                      title="Project scope"
                    >
                      <option value="">No project</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {f.text_status !== "ok" && f.text_status !== "pending" && (
                      <button onClick={() => reExtract(f)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors" title="Re-run extraction">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => remove(f)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
    </div>
  );
};

export default LibraryView;
