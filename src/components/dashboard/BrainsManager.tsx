import { useState, useEffect, useRef, useCallback } from "react";
import { Brain, Plus, Trash2, Pencil, X, Check, FileText, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { validateFile, sanitizeDisplayName, MAX_FILE_SIZE_DISPLAY } from "@/lib/file-security";

export interface BrainEntry {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  file_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface BrainFile {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
}

interface BrainsManagerProps {
  activeBrainId: string | null;
  onBrainChange: (brainId: string | null) => void;
}

const MAX_PROFILE_FILES = 10;
const MAX_DIRECTIVE_LENGTH = 12000;

const BrainsManager = ({ activeBrainId, onBrainChange }: BrainsManagerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [brains, setBrains] = useState<BrainEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formFiles, setFormFiles] = useState<BrainFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchBrains = useCallback(async () => {
    if (!user) {
      setBrains([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("brains")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setBrains((data as BrainEntry[] | null) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void fetchBrains();
  }, [fetchBrains]);

  useEffect(() => {
    if (!editingId) return;
    const brain = brains.find((entry) => entry.id === editingId);
    if (!brain) return;
    setFormName(brain.name);
    setFormDesc(brain.description);
    setFormPrompt(brain.system_prompt);
    if (brain.file_ids.length > 0) {
      void supabase
        .from("library_files")
        .select("id, file_name, file_size, file_type, storage_path")
        .in("id", brain.file_ids)
        .then(({ data }) => setFormFiles((data as BrainFile[] | null) ?? []));
    } else {
      setFormFiles([]);
    }
  }, [editingId, brains]);

  const resetForm = () => {
    setFormName("");
    setFormDesc("");
    setFormPrompt("");
    setFormFiles([]);
    setCreating(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!user || !formName.trim()) return;
    const payload = {
      name: formName.trim().slice(0, 120),
      description: formDesc.trim().slice(0, 300),
      system_prompt: formPrompt.trim().slice(0, MAX_DIRECTIVE_LENGTH),
      file_ids: formFiles.slice(0, MAX_PROFILE_FILES).map((file) => file.id),
    };
    const result = editingId
      ? await supabase.from("brains").update(payload).eq("id", editingId).eq("user_id", user.id)
      : await supabase.from("brains").insert({ ...payload, user_id: user.id });

    if (result.error) {
      toast({ title: "profile could not be saved", description: result.error.message, variant: "destructive" });
      return;
    }
    toast({ title: editingId ? "directive profile updated" : "directive profile created" });
    resetForm();
    await fetchBrains();
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("brains").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      toast({ title: "profile could not be deleted", description: error.message, variant: "destructive" });
      return;
    }
    if (activeBrainId === id) onBrainChange(null);
    setBrains((prev) => prev.filter((brain) => brain.id !== id));
    toast({ title: "directive profile deleted" });
  };

  const handleFileUpload = async (fileList: FileList) => {
    if (!user) return;
    const remaining = MAX_PROFILE_FILES - formFiles.length;
    if (remaining <= 0) {
      toast({ title: "profile file limit reached", description: `up to ${MAX_PROFILE_FILES} reference files can be attached.`, variant: "destructive" });
      return;
    }

    setUploading(true);
    for (const file of Array.from(fileList).slice(0, remaining)) {
      const validation = await validateFile(file);
      if (!validation.valid) {
        toast({ title: "file rejected", description: `${sanitizeDisplayName(file.name)}: ${validation.error}`, variant: "destructive" });
        continue;
      }
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("library").upload(path, file);
      if (uploadErr) {
        toast({ title: "upload failed", description: uploadErr.message, variant: "destructive" });
        continue;
      }
      const { data: row, error: rowError } = await supabase
        .from("library_files")
        .insert({
          user_id: user.id,
          file_name: sanitizeDisplayName(file.name),
          file_size: file.size,
          file_type: file.type || "application/octet-stream",
          storage_path: path,
        })
        .select("id, file_name, file_size, file_type, storage_path")
        .single();
      if (rowError) {
        toast({ title: "file record failed", description: rowError.message, variant: "destructive" });
        continue;
      }
      if (row) setFormFiles((prev) => [...prev, row as BrainFile]);
    }
    setUploading(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isFormOpen = creating || editingId !== null;
  const activeBrain = brains.find((brain) => brain.id === activeBrainId);

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel((open) => !open)}
        className={`p-1.5 rounded-md transition-colors ${activeBrainId ? "text-accent bg-accent/10 hover:bg-accent/20" : "text-muted-foreground/50 hover:text-foreground"}`}
        title={activeBrain ? `directive profile: ${activeBrain.name}` : "directive profiles"}
        aria-label={activeBrain ? `active directive profile: ${activeBrain.name}` : "open directive profiles"}
        aria-expanded={showPanel}
      >
        <Brain className="h-4 w-4" />
      </button>

      {showPanel && (
        <div className="absolute right-0 top-10 z-50 w-[min(380px,calc(100vw-1rem))] max-h-[520px] overflow-y-auto rounded-xl border border-border/30 bg-card/95 backdrop-blur-xl shadow-2xl animate-fade-in">
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(event) => { if (event.target.files) void handleFileUpload(event.target.files); event.target.value = ""; }} />

          <div className="p-4 border-b border-border/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-light text-foreground">directive profiles</h3>
              </div>
              <div className="flex items-center gap-1">
                {!isFormOpen && <button onClick={() => setCreating(true)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors" aria-label="create directive profile" title="create directive profile"><Plus className="h-4 w-4" /></button>}
                <button onClick={() => { setShowPanel(false); resetForm(); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors" aria-label="close directive profiles" title="close"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-1">give asherin directions and reference material for this chat.</p>
          </div>

          {isFormOpen && (
            <div className="p-4 space-y-3 border-b border-border/20">
              <input value={formName} onChange={(event) => setFormName(event.target.value)} maxLength={120} placeholder="profile name…" aria-label="profile name" className="w-full bg-transparent border border-border/20 rounded-lg px-3 py-2 text-xs font-light text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/50" />
              <input value={formDesc} onChange={(event) => setFormDesc(event.target.value)} maxLength={300} placeholder="short description (optional)…" aria-label="profile description" className="w-full bg-transparent border border-border/20 rounded-lg px-3 py-2 text-xs font-light text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/50" />
              <Textarea value={formPrompt} onChange={(event) => setFormPrompt(event.target.value)} maxLength={MAX_DIRECTIVE_LENGTH} placeholder="directions for asherin…" aria-label="directive profile directions" className="min-h-[120px] bg-transparent border-border/20 text-xs font-light resize-none focus:border-accent/50" />
              <p className="text-[9px] text-muted-foreground/40">directions guide the response. platform safety and higher-priority instructions still apply.</p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-light text-muted-foreground">reference files</span>
                  <button onClick={() => fileRef.current?.click()} disabled={uploading || formFiles.length >= MAX_PROFILE_FILES} className="flex items-center gap-1 text-[10px] font-light text-accent hover:text-accent/80 transition-colors disabled:opacity-40" aria-label="upload reference files" title="upload reference files">
                    {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} upload
                  </button>
                </div>
                {formFiles.length > 0 && <div className="space-y-1">{formFiles.map((file) => <div key={file.id} className="flex items-center gap-2 rounded-lg bg-foreground/5 px-2 py-1.5"><FileText className="h-3 w-3 text-muted-foreground shrink-0" /><span className="text-[10px] font-light text-foreground truncate flex-1">{file.file_name}</span><span className="text-[9px] text-muted-foreground/50">{formatSize(file.file_size)}</span><button onClick={() => setFormFiles((prev) => prev.filter((entry) => entry.id !== file.id))} className="p-0.5 text-muted-foreground hover:text-destructive transition-colors" aria-label={`remove ${file.file_name}`} title="remove file"><X className="h-3 w-3" /></button></div>)}</div>}
                <p className="text-[9px] text-muted-foreground/30">up to {MAX_PROFILE_FILES} files · max {MAX_FILE_SIZE_DISPLAY} each.</p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => void handleSave()} disabled={!formName.trim()} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-accent/20 text-accent px-3 py-2 text-xs font-light hover:bg-accent/30 transition-colors disabled:opacity-40"><Check className="h-3.5 w-3.5" />{editingId ? "update" : "create"}</button>
                <button onClick={resetForm} className="flex items-center gap-1.5 rounded-lg border border-border/20 px-3 py-2 text-xs font-light text-muted-foreground hover:text-foreground transition-colors">cancel</button>
              </div>
            </div>
          )}

          {activeBrain && (
            <div className="px-4 py-2 border-b border-border/20 bg-accent/5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-light text-accent truncate">active: {activeBrain.name}</span>
                <button onClick={() => onBrainChange(null)} className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors shrink-0">deactivate</button>
              </div>
            </div>
          )}

          <div className="p-2">
            {loading ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div> : brains.length === 0 && !isFormOpen ? <div className="text-center py-6"><Brain className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" /><p className="text-xs font-extralight text-muted-foreground/50">no directive profiles yet</p><p className="text-[10px] text-muted-foreground/30 mt-1">create one to give asherin custom directions.</p></div> : <div className="space-y-1">{brains.map((brain) => <div key={brain.id} className={`group flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-all ${activeBrainId === brain.id ? "bg-accent/15 border border-accent/30" : "hover:bg-foreground/5 border border-transparent"}`} onClick={() => onBrainChange(activeBrainId === brain.id ? null : brain.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onBrainChange(activeBrainId === brain.id ? null : brain.id); } }}>
              <Brain className={`h-3.5 w-3.5 shrink-0 ${activeBrainId === brain.id ? "text-accent" : "text-muted-foreground/50"}`} />
              <div className="flex-1 min-w-0"><p className="text-xs font-light text-foreground truncate">{brain.name}</p>{brain.description && <p className="text-[10px] text-muted-foreground/50 truncate">{brain.description}</p>}<div className="flex items-center gap-2 mt-0.5">{brain.system_prompt && <span className="text-[9px] text-accent/60">directions</span>}{brain.file_ids.length > 0 && <span className="text-[9px] text-accent/60">{brain.file_ids.length} file{brain.file_ids.length > 1 ? "s" : ""}</span>}</div></div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"><button onClick={(event) => { event.stopPropagation(); setEditingId(brain.id); }} className="p-1 rounded text-muted-foreground/50 hover:text-foreground transition-colors" aria-label={`edit ${brain.name}`} title="edit"><Pencil className="h-3 w-3" /></button><button onClick={(event) => { event.stopPropagation(); void handleDelete(brain.id); }} className="p-1 rounded text-muted-foreground/50 hover:text-destructive transition-colors" aria-label={`delete ${brain.name}`} title="delete"><Trash2 className="h-3 w-3" /></button></div>
            </div>)}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default BrainsManager;
