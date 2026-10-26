// asherin.snippets — saved code on this device: folders, snippets, search, copy, export.
//
// Two panes on a desktop (folders and snippets on the left, one snippet on the
// right); below md it is list → detail with a back button. Every write goes to
// IndexedDB through the shim; nothing is sent anywhere. Deleting a folder
// unfiles its snippets; deleting a snippet asks first, inline.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  FolderPlus, FilePlus, Trash2, ChevronRight, ChevronDown, Code2, Loader2, Folder,
  Search, Tag, Copy, Check, Pencil, X, ChevronLeft, Download, Plus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";
import {
  LANGUAGES, LIMITS, copyText, createFolder, createSnippet, deleteFolder, deleteSnippet, effectiveFolder,
  exportMarkdown, filterSnippets, loadAll, onSnippetsChange, renameFolder, snippetFileName, updateSnippet,
  type CodeFolder, type CodeSnippet,
} from "@/components/dashboard/snippets/snippetStore";

const ICON_BTN = "rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-40";
const QUIET_BTN = "inline-flex items-center gap-1.5 rounded-lg border border-border/20 px-3 py-1.5 text-xs font-light text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50";
const PRIMARY_BTN = "inline-flex items-center gap-2 rounded-xl bg-accent text-accent-foreground px-4 py-2 text-xs font-light hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const INPUT = "w-full rounded-xl border border-border/20 bg-card/20 px-3 py-2 text-xs font-light text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border/40";
const SELECT = "rounded-xl border border-border/20 bg-card/20 px-3 py-2 text-xs font-light text-foreground outline-none";

function downloadText(name: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const InlineConfirm = ({ text, onYes, onNo }: { text: string; onYes: () => void; onNo: () => void }) => (
  <div role="alertdialog" className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] font-light text-foreground">
    <span className="min-w-0 flex-1">{text}</span>
    <button onClick={onYes} className="rounded-md bg-red-500/15 px-2.5 py-1 text-red-300 hover:bg-red-500/25">delete</button>
    <button onClick={onNo} className="rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground">keep</button>
  </div>
);

type Draft = { title: string; language: string; content: string; tags: string };
const EMPTY_DRAFT: Draft = { title: "", language: "plaintext", content: "", tags: "" };

const CodeSnippetsView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const v2 = useIsV2();

  const [folders, setFolders] = useState<CodeFolder[]>([]);
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmFolder, setConfirmFolder] = useState<string | null>(null);

  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<Draft>(EMPTY_DRAFT);
  const [confirmSnippet, setConfirmSnippet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const alive = useRef(true);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const folderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);
  const active = useMemo(() => snippets.find((s) => s.id === activeId) ?? null, [snippets, activeId]);
  const visible = useMemo(() => filterSnippets(snippets, { search, folderId: activeFolder, folderIds }), [snippets, search, activeFolder, folderIds]);
  const searching = search.trim().length > 0;
  const unfiled = useMemo(() => visible.filter((s) => effectiveFolder(s, folderIds) === null), [visible, folderIds]);
  const inFolder = useCallback((id: string) => visible.filter((s) => effectiveFolder(s, folderIds) === id), [visible, folderIds]);

  /* ── loading ─────────────────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    if (!user) {
      setLoadError("this device has no identity yet — open chat once and come back.");
      setLoading(false);
      return;
    }
    const res = await loadAll(user.id);
    if (!alive.current) return;
    if (res.error || !res.data) setLoadError((res.error ?? "the store could not be read").toLowerCase());
    else {
      setLoadError(null);
      setFolders(res.data.folders);
      setSnippets(res.data.snippets);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = onSnippetsChange(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void refresh(), 400);
    });
    return () => {
      alive.current = false;
      off();
      if (t) clearTimeout(t);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, [refresh]);

  /* ── folders ─────────────────────────────────────────────────────────── */

  const addFolder = async () => {
    if (!user || busy) return;
    setBusy(true);
    const res = await createFolder(user.id, newFolderName);
    setBusy(false);
    if (res.error || !res.data) {
      toast({ title: "the folder was not created", description: res.error ?? undefined, variant: "destructive" });
      return;
    }
    setFolders((p) => [...p, res.data!]);
    setExpanded((p) => new Set(p).add(res.data!.id));
    setActiveFolder(res.data.id);
    setNewFolderName("");
    setNewFolderOpen(false);
  };

  const commitRename = async (id: string) => {
    const res = await renameFolder(id, renameValue);
    if (res.error) {
      toast({ title: "the folder was not renamed", description: res.error, variant: "destructive" });
      return;
    }
    setFolders((p) => p.map((f) => (f.id === id ? { ...f, name: renameValue.trim() } : f)));
    setRenamingFolder(null);
  };

  const removeFolder = async (id: string) => {
    setConfirmFolder(null);
    const res = await deleteFolder(id);
    if (res.error) {
      toast({ title: "the folder was not removed", description: res.error, variant: "destructive" });
      return;
    }
    setFolders((p) => p.filter((f) => f.id !== id));
    setSnippets((p) => p.map((s) => (s.folder_id === id ? { ...s, folder_id: null } : s)));
    if (activeFolder === id) setActiveFolder(null);
    toast({ title: "folder removed", description: "its snippets are unfiled, not deleted." });
  };

  const toggleFolder = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ── snippets ────────────────────────────────────────────────────────── */

  const startCompose = () => {
    setDraft(EMPTY_DRAFT);
    setComposing(true);
    setEditing(false);
    setActiveId(null);
  };

  const create = async () => {
    if (!user || busy) return;
    setBusy(true);
    const res = await createSnippet(user.id, { ...draft, folder_id: activeFolder });
    setBusy(false);
    if (res.error || !res.data) {
      toast({ title: "the snippet was not saved", description: res.error ?? undefined, variant: "destructive" });
      return;
    }
    setSnippets((p) => [res.data!, ...p]);
    if (res.data.folder_id) setExpanded((p) => new Set(p).add(res.data!.folder_id!));
    setActiveId(res.data.id);
    setComposing(false);
    setDraft(EMPTY_DRAFT);
    toast({ title: "snippet saved" });
  };

  const startEdit = () => {
    if (!active) return;
    setEdit({ title: active.title, language: active.language, content: active.content, tags: active.tags.join(", ") });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!active || busy) return;
    setBusy(true);
    const res = await updateSnippet(active.id, edit);
    setBusy(false);
    if (res.error || !res.data) {
      toast({ title: "the snippet was not saved", description: res.error ?? undefined, variant: "destructive" });
      return;
    }
    setSnippets((p) => p.map((s) => (s.id === active.id ? res.data! : s)));
    setEditing(false);
    toast({ title: "snippet saved" });
  };

  const moveTo = async (folderId: string | null) => {
    if (!active) return;
    const res = await updateSnippet(active.id, { folder_id: folderId });
    if (res.error || !res.data) {
      toast({ title: "the snippet was not moved", description: res.error ?? undefined, variant: "destructive" });
      return;
    }
    setSnippets((p) => p.map((s) => (s.id === active.id ? res.data! : s)));
    if (folderId) setExpanded((p) => new Set(p).add(folderId));
  };

  const remove = async (id: string) => {
    setConfirmSnippet(null);
    const res = await deleteSnippet(id);
    if (res.error) {
      toast({ title: "the snippet was not removed", description: res.error, variant: "destructive" });
      return;
    }
    setSnippets((p) => p.filter((s) => s.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setEditing(false);
    }
    toast({ title: "snippet removed" });
  };

  const copy = async () => {
    if (!active) return;
    const ok = await copyText(active.content);
    if (!alive.current) return;
    if (!ok) {
      toast({ title: "the clipboard is not available here", description: "select the code and copy it by hand.", variant: "destructive" });
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => alive.current && setCopied(false), 1600);
  };

  const downloadOne = () => {
    if (!active) return;
    downloadText(snippetFileName(active), active.content);
  };

  const exportAll = () => {
    if (snippets.length === 0) return;
    downloadText(`asherin-snippets-${new Date().toISOString().slice(0, 10)}.md`, exportMarkdown(snippets, folders), "text/markdown");
  };

  const open = (s: CodeSnippet) => {
    setActiveId(s.id);
    setEditing(false);
    setComposing(false);
  };

  /* ── surfaces ────────────────────────────────────────────────────────── */

  const newButton = (
    <button onClick={startCompose} className={v2 ? v2ActionClass : PRIMARY_BTN} disabled={!!loadError}>
      <Plus className="h-3.5 w-3.5" /> new snippet
    </button>
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 p-6 text-xs font-extralight text-muted-foreground" aria-busy="true">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> reading this device's snippets…
      </div>
    );
  }

  const showDetail = composing || !!active;

  const snippetRow = (s: CodeSnippet, indent: boolean) => (
    <li key={s.id}>
      <button
        onClick={() => open(s)}
        className={`flex w-full items-center gap-2 rounded-lg py-2 pr-2.5 text-left text-xs transition-colors ${indent ? "pl-8" : "px-2.5"} ${activeId === s.id ? "bg-accent/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}
        aria-current={activeId === s.id ? "true" : undefined}
      >
        <Code2 className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{s.title}</span>
        <span className="shrink-0 text-[9px] text-muted-foreground/50">{s.language}</span>
      </button>
    </li>
  );

  const listPane = (
    <aside className={`${showDetail ? "hidden md:flex" : "flex"} w-full flex-col border-border/20 bg-card/10 md:w-72 md:shrink-0 md:border-r`} aria-label="folders and snippets">
      <div className="space-y-2 border-b border-border/20 p-3">
        <div className="flex items-center gap-1">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/20 bg-card/20 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" aria-hidden="true" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search title, tags, code…" className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none" aria-label="search snippets" />
            {search && <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground" aria-label="clear search"><X className="h-3 w-3" /></button>}
          </label>
          <button onClick={() => { setNewFolderOpen(true); setRenamingFolder(null); }} className={ICON_BTN} aria-label="new folder"><FolderPlus className="h-3.5 w-3.5" /></button>
          <button onClick={exportAll} className={ICON_BTN} aria-label="export all snippets as markdown" disabled={snippets.length === 0}><Download className="h-3.5 w-3.5" /></button>
        </div>
        {newFolderOpen && (
          <div className="space-y-2">
            <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="folder name" className={INPUT} maxLength={LIMITS.folder} aria-label="folder name" onKeyDown={(e) => { if (e.key === "Enter") void addFolder(); if (e.key === "Escape") setNewFolderOpen(false); }} autoFocus />
            <div className="flex gap-1.5">
              <button onClick={() => void addFolder()} className={QUIET_BTN} disabled={busy || !newFolderName.trim()}>create</button>
              <button onClick={() => setNewFolderOpen(false)} className={QUIET_BTN}>cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loadError ? (
          <div role="alert" className="space-y-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs font-light text-foreground">
            <p>{loadError}</p>
            <button onClick={() => void refresh()} className={QUIET_BTN}>try again</button>
          </div>
        ) : (
          <ul className="space-y-0.5">
            <li>
              <button
                onClick={() => { setActiveFolder(null); setActiveId(null); setComposing(false); }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${activeFolder === null && !searching ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}
                aria-pressed={activeFolder === null}
              >
                <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                {searching ? "matches" : "all snippets"}
                <span className="ml-auto text-[10px] text-muted-foreground/50">{searching ? visible.length : snippets.length}</span>
              </button>
            </li>

            {folders.map((folder) => {
              const items = inFolder(folder.id);
              const isOpen = expanded.has(folder.id) || searching;
              return (
                <li key={folder.id}>
                  {renamingFolder === folder.id ? (
                    <div className="flex items-center gap-1 px-1 py-1">
                      <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className={INPUT} maxLength={LIMITS.folder} aria-label="folder name" onKeyDown={(e) => { if (e.key === "Enter") void commitRename(folder.id); if (e.key === "Escape") setRenamingFolder(null); }} autoFocus />
                      <button onClick={() => void commitRename(folder.id)} className={ICON_BTN} aria-label="save folder name"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setRenamingFolder(null)} className={ICON_BTN} aria-label="cancel"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <button
                        onClick={() => { toggleFolder(folder.id); setActiveFolder(folder.id); setActiveId(null); setComposing(false); }}
                        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs transition-colors ${activeFolder === folder.id && !searching ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}
                        aria-expanded={isOpen}
                      >
                        {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />}
                        <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{folder.name}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground/50">{items.length}</span>
                      </button>
                      <button onClick={() => { setRenamingFolder(folder.id); setRenameValue(folder.name); }} className={ICON_BTN} aria-label={`rename ${folder.name}`}><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => setConfirmFolder(folder.id)} className={`${ICON_BTN} hover:text-red-300`} aria-label={`delete folder ${folder.name}`}><Trash2 className="h-3 w-3" /></button>
                    </div>
                  )}
                  {confirmFolder === folder.id && (
                    <div className="px-1 py-1">
                      <InlineConfirm text={`delete the folder "${folder.name}"? its snippets stay, unfiled.`} onYes={() => void removeFolder(folder.id)} onNo={() => setConfirmFolder(null)} />
                    </div>
                  )}
                  {isOpen && items.length > 0 && <ul className="space-y-0.5">{items.map((s) => snippetRow(s, true))}</ul>}
                  {isOpen && items.length === 0 && !searching && activeFolder === folder.id && (
                    <p className="pl-8 pr-2 py-1.5 text-[11px] font-extralight text-muted-foreground/50">empty — new snippets go here while this folder is selected.</p>
                  )}
                </li>
              );
            })}

            {(activeFolder === null || searching) && unfiled.length > 0 && (
              <>
                {folders.length > 0 && <li className="px-2.5 pt-3 pb-1 text-[10px] font-extralight tracking-widest text-muted-foreground/50">unfiled</li>}
                {unfiled.map((s) => snippetRow(s, false))}
              </>
            )}

            {snippets.length === 0 && (
              <li className="px-2 py-8 text-center">
                <Code2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" aria-hidden="true" />
                <p className="text-xs font-extralight text-muted-foreground">no snippets yet.</p>
                <p className="mt-1 text-[11px] font-extralight text-muted-foreground/60">code you want to find again, in folders, with a language label. kept on this device.</p>
                <button onClick={startCompose} className={`${QUIET_BTN} mt-4`}><FilePlus className="h-3.5 w-3.5" /> new snippet</button>
              </li>
            )}
            {snippets.length > 0 && searching && visible.length === 0 && (
              <li className="px-2.5 py-6 text-center text-xs font-extralight text-muted-foreground">nothing matches "{search.trim()}".</li>
            )}
          </ul>
        )}
      </div>
    </aside>
  );

  const backButton = (
    <button onClick={() => { setActiveId(null); setComposing(false); setEditing(false); }} className={`${ICON_BTN} md:hidden`} aria-label="back to the list"><ChevronLeft className="h-4 w-4" /></button>
  );

  const detailPane = (
    <section className={`${showDetail ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`} aria-label="snippet">
      {composing ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-2xl space-y-3 p-4 sm:p-6">
            <div className="flex items-center gap-2">
              {backButton}
              <h3 className="text-sm font-light text-foreground">new snippet</h3>
              {activeFolder && <span className="text-[11px] font-extralight text-muted-foreground">· in {folders.find((f) => f.id === activeFolder)?.name ?? "folder"}</span>}
            </div>
            <input value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} placeholder="title" className={INPUT} maxLength={LIMITS.title} aria-label="title" autoFocus />
            <div className="flex flex-wrap gap-2">
              <select value={draft.language} onChange={(e) => setDraft((p) => ({ ...p, language: e.target.value }))} className={SELECT} aria-label="language">
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <input value={draft.tags} onChange={(e) => setDraft((p) => ({ ...p, tags: e.target.value }))} placeholder="tags, comma-separated (optional)" className={`${INPUT} min-w-[10rem] flex-1`} aria-label="tags" />
            </div>
            <textarea value={draft.content} onChange={(e) => setDraft((p) => ({ ...p, content: e.target.value }))} placeholder="paste the code" rows={14} className={`${INPUT} resize-y font-mono leading-relaxed`} maxLength={LIMITS.content} aria-label="code" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void create()} className={PRIMARY_BTN} disabled={busy || !draft.title.trim()}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} save</button>
              <button onClick={() => setComposing(false)} className={QUIET_BTN}>cancel</button>
            </div>
          </div>
        </div>
      ) : active ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/20 px-4 py-3 sm:px-6">
            {backButton}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {editing ? (
                <input value={edit.title} onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))} className={INPUT} maxLength={LIMITS.title} aria-label="title" />
              ) : (
                <>
                  <h3 className="truncate text-sm font-light text-foreground">{active.title}</h3>
                  <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] text-accent">{active.language}</span>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button onClick={() => void copy()} className={ICON_BTN} aria-label="copy code" disabled={editing}>
                {copied ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
              </button>
              <button onClick={downloadOne} className={ICON_BTN} aria-label="download as a file" disabled={editing}><Download className="h-4 w-4" /></button>
              {editing ? (
                <>
                  <button onClick={() => void saveEdit()} className={ICON_BTN} aria-label="save" disabled={busy || !edit.title.trim()}><Check className="h-4 w-4" /></button>
                  <button onClick={() => setEditing(false)} className={ICON_BTN} aria-label="cancel editing"><X className="h-4 w-4" /></button>
                </>
              ) : (
                <button onClick={startEdit} className={ICON_BTN} aria-label="edit"><Pencil className="h-4 w-4" /></button>
              )}
              <button onClick={() => setConfirmSnippet(active.id)} className={`${ICON_BTN} hover:text-red-300`} aria-label="delete"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>

          {confirmSnippet === active.id && (
            <div className="px-4 pt-3 sm:px-6">
              <InlineConfirm text={`delete "${active.title}" from this device?`} onYes={() => void remove(active.id)} onNo={() => setConfirmSnippet(null)} />
            </div>
          )}

          {!editing && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/10 px-4 py-2 sm:px-6">
              <Tag className="h-3 w-3 text-muted-foreground/50" aria-hidden="true" />
              {active.tags.length === 0 && <span className="text-[10px] font-extralight text-muted-foreground/50">no tags</span>}
              {active.tags.map((t) => (
                <button key={t} onClick={() => setSearch(t)} className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground" aria-label={`search tag ${t}`}>{t}</button>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-[10px] font-extralight text-muted-foreground/60">
                folder
                <select value={effectiveFolder(active, folderIds) ?? ""} onChange={(e) => void moveTo(e.target.value || null)} className="rounded-lg border border-border/20 bg-card/20 px-2 py-1 text-[10px] text-foreground outline-none" aria-label="move to folder">
                  <option value="">unfiled</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {editing ? (
              <div className="flex h-full min-h-[18rem] flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <select value={edit.language} onChange={(e) => setEdit((p) => ({ ...p, language: e.target.value }))} className={SELECT} aria-label="language">
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <input value={edit.tags} onChange={(e) => setEdit((p) => ({ ...p, tags: e.target.value }))} placeholder="tags, comma-separated" className={`${INPUT} min-w-[10rem] flex-1`} aria-label="tags" />
                </div>
                <textarea value={edit.content} onChange={(e) => setEdit((p) => ({ ...p, content: e.target.value }))} className={`${INPUT} min-h-[14rem] flex-1 resize-y font-mono leading-relaxed`} maxLength={LIMITS.content} aria-label="code" />
              </div>
            ) : active.content.trim() ? (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-border/20 bg-card/20 p-4 font-mono text-xs leading-relaxed text-foreground sm:p-5"><code>{active.content}</code></pre>
            ) : (
              <p className="text-xs font-extralight text-muted-foreground">this snippet is empty. edit it to add code.</p>
            )}
          </div>

          <div className="border-t border-border/10 px-4 py-2 text-[10px] font-extralight text-muted-foreground/50 sm:px-6">
            created {new Date(active.created_at).toLocaleDateString()} · updated {new Date(active.updated_at).toLocaleDateString()} · {active.content.length.toLocaleString()} chars
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <Code2 className="mb-4 h-10 w-10 text-muted-foreground/20" aria-hidden="true" />
          <p className="text-sm font-extralight text-muted-foreground">pick a snippet, or save a new one.</p>
          <p className="mt-1 max-w-xs text-[11px] font-extralight text-muted-foreground/60">folders, a language label and tags make it findable; copy or download it when you need it. nothing leaves this device.</p>
          {!v2 && <button onClick={startCompose} className={`${QUIET_BTN} mt-5`}><FilePlus className="h-3.5 w-3.5" /> new snippet</button>}
        </div>
      )}
    </section>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {v2 ? (
        <V2Action>{newButton}</V2Action>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/20 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="text-sm font-light text-foreground">asherin.snippets</h1>
            <p className="mt-0.5 text-[11px] font-extralight text-muted-foreground">saved code, in folders, kept on this device.</p>
          </div>
          {newButton}
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {listPane}
        {detailPane}
      </div>
    </div>
  );
};

export default CodeSnippetsView;
