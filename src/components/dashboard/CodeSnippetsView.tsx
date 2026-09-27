import { useState, useEffect, useCallback } from "react";
import {
  FolderPlus, FilePlus, Trash2, ChevronRight, ChevronDown, Code2,
  Loader2, FolderOpen, Search, Tag, Copy, Check, Pencil,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface CodeFolder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

interface CodeSnippet {
  id: string;
  folder_id: string | null;
  title: string;
  language: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const LANGUAGES = [
  "plaintext", "javascript", "typescript", "python", "html", "css",
  "json", "bash", "sql", "rust", "go", "java", "c", "cpp", "ruby",
  "php", "swift", "kotlin", "yaml", "markdown", "xml",
];

const CodeSnippetsView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [folders, setFolders] = useState<CodeFolder[]>([]);
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [activeSnippet, setActiveSnippet] = useState<CodeSnippet | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewSnippet, setShowNewSnippet] = useState(false);
  const [newSnippet, setNewSnippet] = useState({ title: "", language: "javascript", content: "", tags: "" });
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [fRes, sRes] = await Promise.all([
        supabase.from("code_folders").select("*").eq("user_id", user.id).order("created_at"),
        supabase.from("code_snippets").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      setFolders((fRes.data as CodeFolder[]) ?? []);
      setSnippets((sRes.data as CodeSnippet[]) ?? []);
      setLoading(false);
    };
    load();
  }, [user]);

  const createFolder = async () => {
    if (!newFolderName.trim() || !user) return;
    const { data } = await supabase
      .from("code_folders")
      .insert({ user_id: user.id, name: newFolderName.trim(), parent_id: activeFolder })
      .select()
      .single();
    if (data) setFolders((p) => [...p, data as CodeFolder]);
    setNewFolderName("");
    setShowNewFolder(false);
  };

  const deleteFolder = async (id: string) => {
    await supabase.from("code_folders").delete().eq("id", id);
    setFolders((p) => p.filter((f) => f.id !== id));
    setSnippets((p) => p.map((s) => s.folder_id === id ? { ...s, folder_id: null } : s));
    if (activeFolder === id) setActiveFolder(null);
  };

  const createSnippet = async () => {
    if (!newSnippet.title.trim() || !user) return;
    const tags = newSnippet.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const { data } = await supabase
      .from("code_snippets")
      .insert({
        user_id: user.id,
        folder_id: activeFolder,
        title: newSnippet.title.trim(),
        language: newSnippet.language,
        content: newSnippet.content,
        tags,
      })
      .select()
      .single();
    if (data) {
      setSnippets((p) => [data as CodeSnippet, ...p]);
      setActiveSnippet(data as CodeSnippet);
    }
    setNewSnippet({ title: "", language: "javascript", content: "", tags: "" });
    setShowNewSnippet(false);
  };

  const updateSnippet = async () => {
    if (!activeSnippet) return;
    await supabase.from("code_snippets").update({
      title: activeSnippet.title,
      language: activeSnippet.language,
      content: activeSnippet.content,
      tags: activeSnippet.tags,
    }).eq("id", activeSnippet.id);
    setSnippets((p) => p.map((s) => s.id === activeSnippet.id ? activeSnippet : s));
    setEditing(false);
    toast({ title: "Snippet saved" });
  };

  const deleteSnippet = async (id: string) => {
    await supabase.from("code_snippets").delete().eq("id", id);
    setSnippets((p) => p.filter((s) => s.id !== id));
    if (activeSnippet?.id === id) setActiveSnippet(null);
  };

  const copyToClipboard = () => {
    if (!activeSnippet) return;
    navigator.clipboard.writeText(activeSnippet.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = snippets.filter((s) => {
    const matchesSearch = !search || s.title.toLowerCase().includes(search.toLowerCase()) || s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchesFolder = activeFolder === null || s.folder_id === activeFolder;
    return matchesSearch && (search ? true : matchesFolder);
  });

  const unfolderedSnippets = filtered.filter((s) => s.folder_id === null);
  const getFolderSnippets = (folderId: string) => filtered.filter((s) => s.folder_id === folderId);

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="h-full flex overflow-hidden">
      {/* Sidebar: folders + snippet list */}
      <div className="w-72 flex-shrink-0 border-r border-border/20 flex flex-col bg-card/10">
        <div className="p-3 border-b border-border/20 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extralight text-foreground">asherin.snippets</h2>
            <div className="flex gap-1">
              <button onClick={() => setShowNewFolder(true)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors" title="New folder">
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setShowNewSnippet(true)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors" title="New snippet">
                <FilePlus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/20 bg-card/20 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground/50" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search snippets…" className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none" />
          </div>
        </div>

        {showNewFolder && (
          <div className="p-3 border-b border-border/20 space-y-2">
            <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name…" className="w-full bg-card/30 border border-border/20 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none" onKeyDown={(e) => e.key === "Enter" && createFolder()} autoFocus />
            <div className="flex gap-1.5">
              <button onClick={createFolder} className="rounded-lg bg-foreground/10 px-3 py-1 text-[11px] text-foreground hover:bg-foreground/15 transition-colors">Create</button>
              <button onClick={() => setShowNewFolder(false)} className="rounded-lg border border-border/20 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {/* All snippets button */}
          <button
            onClick={() => { setActiveFolder(null); setActiveSnippet(null); }}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${activeFolder === null && !search ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}
          >
            <Code2 className="h-3.5 w-3.5" />
            All Snippets
            <span className="ml-auto text-[10px] text-muted-foreground/50">{snippets.length}</span>
          </button>

          {/* Folders */}
          {folders.filter((f) => f.parent_id === null).map((folder) => (
            <div key={folder.id}>
              <div className="group flex items-center">
                <button
                  onClick={() => { toggleFolder(folder.id); setActiveFolder(folder.id); setActiveSnippet(null); }}
                  className={`flex flex-1 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs transition-colors ${activeFolder === folder.id ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}
                >
                  {expandedFolders.has(folder.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <FolderOpen className="h-3.5 w-3.5" />
                  <span className="truncate">{folder.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/50">{getFolderSnippets(folder.id).length}</span>
                </button>
                <button onClick={() => deleteFolder(folder.id)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {expandedFolders.has(folder.id) && getFolderSnippets(folder.id).map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setActiveSnippet(s); setEditing(false); }}
                  className={`flex w-full items-center gap-2 rounded-lg pl-8 pr-2.5 py-1.5 text-[11px] transition-colors ${activeSnippet?.id === s.id ? "bg-accent/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}
                >
                  <Code2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{s.title}</span>
                  <span className="ml-auto text-[9px] text-muted-foreground/40">{s.language}</span>
                </button>
              ))}
            </div>
          ))}

          {/* Unfoldered snippets */}
          {(activeFolder === null || search) && unfolderedSnippets.map((s) => (
            <button
              key={s.id}
              onClick={() => { setActiveSnippet(s); setEditing(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${activeSnippet?.id === s.id ? "bg-accent/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}
            >
              <Code2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{s.title}</span>
              <span className="ml-auto text-[9px] text-muted-foreground/40">{s.language}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main: snippet detail or new snippet form */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {showNewSnippet ? (
          <div className="max-w-2xl mx-auto w-full p-6 space-y-4">
            <h3 className="text-lg font-extralight text-foreground">New Snippet</h3>
            <input value={newSnippet.title} onChange={(e) => setNewSnippet((p) => ({ ...p, title: e.target.value }))} placeholder="Snippet title…" className="w-full bg-card/30 border border-border/20 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none" autoFocus />
            <div className="flex gap-3">
              <select value={newSnippet.language} onChange={(e) => setNewSnippet((p) => ({ ...p, language: e.target.value }))} className="bg-card/30 border border-border/20 rounded-xl px-3 py-2 text-xs text-foreground outline-none">
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <input value={newSnippet.tags} onChange={(e) => setNewSnippet((p) => ({ ...p, tags: e.target.value }))} placeholder="Tags (comma-separated)…" className="flex-1 bg-card/30 border border-border/20 rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none" />
            </div>
            <textarea value={newSnippet.content} onChange={(e) => setNewSnippet((p) => ({ ...p, content: e.target.value }))} placeholder="Paste your code here…" rows={16} className="w-full bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 outline-none resize-none leading-relaxed" />
            <div className="flex gap-2">
              <button onClick={createSnippet} className="rounded-xl bg-foreground/10 px-5 py-2 text-xs text-foreground hover:bg-foreground/15 transition-colors">Save Snippet</button>
              <button onClick={() => setShowNewSnippet(false)} className="rounded-xl border border-border/20 px-5 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            </div>
          </div>
        ) : activeSnippet ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/20">
              <div className="flex items-center gap-3 min-w-0">
                {editing ? (
                  <input value={activeSnippet.title} onChange={(e) => setActiveSnippet({ ...activeSnippet, title: e.target.value })} className="bg-card/30 border border-border/20 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none" />
                ) : (
                  <h3 className="text-sm font-light text-foreground truncate">{activeSnippet.title}</h3>
                )}
                <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] text-accent">{activeSnippet.language}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={copyToClipboard} className="p-2 rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors" title="Copy">
                  {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
                </button>
                <button onClick={() => { if (editing) updateSnippet(); else setEditing(true); }} className="p-2 rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-colors" title={editing ? "Save" : "Edit"}>
                  {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                </button>
                <button onClick={() => deleteSnippet(activeSnippet.id)} className="p-2 rounded-lg text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Tags */}
            {activeSnippet.tags.length > 0 && (
              <div className="flex items-center gap-1.5 px-6 py-2 border-b border-border/10">
                <Tag className="h-3 w-3 text-muted-foreground/50" />
                {activeSnippet.tags.map((t) => (
                  <span key={t} className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] text-muted-foreground">{t}</span>
                ))}
              </div>
            )}

            {/* Code */}
            <div className="flex-1 overflow-auto p-6">
              {editing ? (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <select value={activeSnippet.language} onChange={(e) => setActiveSnippet({ ...activeSnippet, language: e.target.value })} className="bg-card/30 border border-border/20 rounded-lg px-3 py-1.5 text-xs text-foreground outline-none">
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <input
                      value={activeSnippet.tags.join(", ")}
                      onChange={(e) => setActiveSnippet({ ...activeSnippet, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                      placeholder="Tags…"
                      className="flex-1 bg-card/30 border border-border/20 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none"
                    />
                  </div>
                  <textarea
                    value={activeSnippet.content}
                    onChange={(e) => setActiveSnippet({ ...activeSnippet, content: e.target.value })}
                    className="w-full h-[calc(100vh-320px)] bg-card/30 border border-border/20 rounded-xl px-4 py-3 text-xs font-mono text-foreground outline-none resize-none leading-relaxed"
                  />
                </div>
              ) : (
                <pre className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 overflow-auto text-xs font-mono text-foreground leading-relaxed whitespace-pre-wrap">
                  <code>{activeSnippet.content || "// Empty snippet"}</code>
                </pre>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-2 border-t border-border/10 text-[10px] text-muted-foreground/40">
              Created {new Date(activeSnippet.created_at).toLocaleDateString()} · Updated {new Date(activeSnippet.updated_at).toLocaleDateString()}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <Code2 className="h-12 w-12 text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-extralight text-muted-foreground mb-2">Code Snippets</h3>
            <p className="text-xs font-extralight text-muted-foreground/60 max-w-sm mb-6">
              Organize your code into folders. Save reusable snippets, functions, and configurations.
            </p>
            <button onClick={() => setShowNewSnippet(true)} className="inline-flex items-center gap-2 rounded-xl border border-border/20 bg-card/30 px-4 py-2.5 text-xs text-foreground hover:bg-foreground/5 transition-colors">
              <FilePlus className="h-4 w-4" />
              Create First Snippet
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeSnippetsView;
