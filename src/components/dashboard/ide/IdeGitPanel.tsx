import { useState, useEffect, useMemo, useCallback } from "react";
import {
  GitBranch, GitCommit, GitPullRequest, Upload, Download, FolderGit,
  Loader2, Check, X, RefreshCw, Plus, Trash2, ExternalLink, FileDiff,
} from "lucide-react";
import { useGitHub, type GitHubCommit, type GitHubBranch } from "@/hooks/useGitHub";
import { useToast } from "@/hooks/use-toast";
import type { IdeFile } from "./IdeFileTree";
import { emitPull } from "@/lib/connect/emitPull";

interface Props {
  files: IdeFile[];
  onImportFiles?: (files: IdeFile[]) => void;
}

// ── helpers ───────────────────────────────────────────────────────────

// Flatten workspace into { path -> content } map (skips binary/undefined)
function flattenForPush(files: IdeFile[], prefix = ""): { path: string; content: string }[] {
  const result: { path: string; content: string }[] = [];
  for (const f of files) {
    const p = prefix ? `${prefix}/${f.name}` : f.name;
    if (f.type === "file" && f.content !== undefined) result.push({ path: p, content: f.content });
    if (f.children) result.push(...flattenForPush(f.children, p));
  }
  return result;
}

// Compute git blob SHA-1 (matches GitHub's blob sha) — for change detection
async function gitBlobSha(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(header.length + bytes.length);
  all.set(header, 0); all.set(bytes, header.length);
  const hash = await crypto.subtle.digest("SHA-1", all);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Build nested IdeFile tree from a list of { path, content }
function buildIdeTree(entries: { path: string; content: string }[]): IdeFile[] {
  const root: IdeFile[] = [];
  for (const e of entries) {
    const parts = e.path.split("/");
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isFile = i === parts.length - 1;
      let node = cur.find(n => n.name === name && n.type === (isFile ? "file" : "folder"));
      if (!node) {
        node = isFile
          ? { id: `gh-${e.path}`, name, type: "file", content: e.content }
          : { id: `gh-dir-${parts.slice(0, i + 1).join("/")}`, name, type: "folder", children: [] };
        cur.push(node);
      }
      if (!isFile) cur = node.children!;
    }
  }
  return root;
}

type DiffStatus = "added" | "modified" | "unchanged" | "deleted";
interface ChangeRow { path: string; status: DiffStatus; content?: string; }

// ── component ─────────────────────────────────────────────────────────

const IdeGitPanel = ({ files, onImportFiles }: Props) => {
  const { toast } = useToast();
  const {
    connection, loading: connLoading, isConnected,
    connect, disconnect,
    listBranches, getCommits, pushFiles, listRepos, createRepo,
    getTreeRecursive, getBlobs, getPathShas,
    createBranch, deleteBranch, switchBranch,
    listPullRequests, createPullRequest,
  } = useGitHub();

  type TabId = "changes" | "branches" | "history" | "pulls" | "repos";
  const [tab, setTab] = useState<TabId>("changes");
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [pulls, setPulls] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Connect form
  const [showConnect, setShowConnect] = useState(false);
  const [token, setToken] = useState("");
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [branch, setBranch] = useState("main");

  // New repo form
  const [showNewRepo, setShowNewRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);

  // New branch form
  const [newBranchName, setNewBranchName] = useState("");

  // PR form
  const [showNewPr, setShowNewPr] = useState(false);
  const [prTitle, setPrTitle] = useState("");
  const [prBase, setPrBase] = useState("main");
  const [prBody, setPrBody] = useState("");
  const [prDraft, setPrDraft] = useState(false);

  // Changes (diff) state
  const [remoteShas, setRemoteShas] = useState<Record<string, string> | null>(null);
  const [localShas, setLocalShas] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [commitMsg, setCommitMsg] = useState("");

  const workspaceFiles = useMemo(() => flattenForPush(files), [files]);

  // Compute local blob shas whenever workspace changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, string> = {};
      for (const f of workspaceFiles) out[f.path] = await gitBlobSha(f.content);
      if (!cancelled) setLocalShas(out);
    })();
    return () => { cancelled = true; };
  }, [workspaceFiles]);

  // Refresh remote shas
  const refreshDiff = useCallback(async () => {
    if (!isConnected) return;
    setLoadingAction("diff");
    try {
      const r = await getPathShas();
      setRemoteShas(r.shas || {});
    } catch (err: any) {
      toast({ title: "Diff failed", description: err.message, variant: "destructive" });
    } finally { setLoadingAction(null); }
  }, [isConnected, getPathShas, toast]);

  useEffect(() => { if (isConnected && tab === "changes" && remoteShas === null) refreshDiff(); }, [isConnected, tab, remoteShas, refreshDiff]);
  useEffect(() => { if (isConnected && tab === "branches") loadBranches(); }, [isConnected, tab]);
  useEffect(() => { if (isConnected && tab === "history") loadCommits(); }, [isConnected, tab]);
  useEffect(() => { if (isConnected && tab === "pulls") loadPulls(); }, [isConnected, tab]);
  useEffect(() => { if (isConnected && tab === "repos") loadRepos(); }, [isConnected, tab]);

  const changes: ChangeRow[] = useMemo(() => {
    if (!remoteShas) return [];
    const rows: ChangeRow[] = [];
    const localPaths = new Set(Object.keys(localShas));
    for (const path of localPaths) {
      const local = localShas[path];
      const remote = remoteShas[path];
      const content = workspaceFiles.find(f => f.path === path)?.content;
      if (!remote) rows.push({ path, status: "added", content });
      else if (remote !== local) rows.push({ path, status: "modified", content });
      else rows.push({ path, status: "unchanged", content });
    }
    for (const path of Object.keys(remoteShas)) {
      if (!localPaths.has(path)) rows.push({ path, status: "deleted" });
    }
    return rows.sort((a, b) => a.path.localeCompare(b.path));
  }, [remoteShas, localShas, workspaceFiles]);

  const stagedChanges = useMemo(
    () => changes.filter(c => c.status === "added" || c.status === "modified"),
    [changes]
  );

  // Auto-select all staged when changes appear/change
  useEffect(() => {
    setSelected(new Set(stagedChanges.map(c => c.path)));
  }, [stagedChanges.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelected = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  // ── loaders ─────────────────────────────────────────────────────────
  const loadBranches = async () => {
    setLoadingAction("branches");
    try { const d = await listBranches(); setBranches(d.branches || []); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setLoadingAction(null);
  };
  const loadCommits = async () => {
    setLoadingAction("commits");
    try { const d = await getCommits(); setCommits(d.commits || []); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setLoadingAction(null);
  };
  const loadPulls = async () => {
    setLoadingAction("pulls");
    try { const d = await listPullRequests("open"); setPulls(d.pulls || []); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setLoadingAction(null);
  };
  const loadRepos = async () => {
    setLoadingAction("repos");
    try { const d = await listRepos(); setRepos(d.repos || []); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setLoadingAction(null);
  };

  // ── actions ─────────────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!token || !repoOwner || !repoName) return;
    setLoadingAction("connect");
    try {
      await connect(token, repoOwner, repoName, branch);
      setShowConnect(false); setToken("");
      toast({ title: "Connected to GitHub", description: `${repoOwner}/${repoName}` });
    } catch (err: any) { toast({ title: "Connection failed", description: err.message, variant: "destructive" }); }
    setLoadingAction(null);
  };

  const handleDisconnect = async () => {
    setLoadingAction("disconnect");
    try { await disconnect(); toast({ title: "Disconnected from GitHub" }); setRemoteShas(null); }
    catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
    setLoadingAction(null);
  };

  // Recursive pull: walk full tree, fetch every blob, build nested IdeFile[]
  const handleRecursivePull = async () => {
    setLoadingAction("import");
    try {
      const tree = await getTreeRecursive();
      const blobPaths = (tree.tree || []).filter((n: any) => n.type === "blob").map((n: any) => n.path);
      if (blobPaths.length === 0) { toast({ title: "Empty repo" }); setLoadingAction(null); return; }
      const blobs = await getBlobs(blobPaths);
      const ideTree = buildIdeTree(blobs.files);
      if (onImportFiles) onImportFiles(ideTree);
      toast({
        title: "Pulled from GitHub",
        description: `${blobs.files.length} files · ${blobs.errors.length} skipped (binary)`,
      });
      // Connect trace: repo + count only. No file bodies leave the browser.
      void emitPull({
        organ: "ide", capability: "git-pull", fromSurface: "ide-git", status: "ok",
        quote: `${connection?.repo_owner ?? "repo"}/${connection?.repo_name ?? "?"} · ${blobs.files.length} files`,
        meta: { files: blobs.files.length, skipped: blobs.errors.length },
      });
      await refreshDiff();
    } catch (err: any) {
      void emitPull({ organ: "ide", capability: "git-pull", fromSurface: "ide-git", status: "fail", quote: "pull failed" });
      toast({ title: "Pull failed", description: err.message, variant: "destructive" });
    }
    setLoadingAction(null);
  };

  const handleCommitSelected = async () => {
    const toPush = workspaceFiles.filter(f => selected.has(f.path));
    if (toPush.length === 0) { toast({ title: "Nothing selected" }); return; }
    setLoadingAction("push");
    try {
      const msg = commitMsg.trim() || `Commit ${toPush.length} file(s) from asherin IDE`;
      const r = await pushFiles(toPush, msg);
      toast({ title: "Committed & pushed", description: `${r.file_count} files · ${String(r.commit_sha).slice(0, 7)}` });
      void emitPull({
        organ: "ide", capability: "git-commit", fromSurface: "ide-git", status: "ok",
        quote: `${r.file_count} files → ${connection?.branch ?? "branch"} · ${String(r.commit_sha).slice(0, 7)}`,
        meta: { files: r.file_count },
      });
      setCommitMsg("");
      await refreshDiff();
    } catch (err: any) {
      void emitPull({ organ: "ide", capability: "git-commit", fromSurface: "ide-git", status: "fail", quote: "push failed" });
      toast({ title: "Push failed", description: err.message, variant: "destructive" });
    }
    setLoadingAction(null);
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;
    setLoadingAction("create-branch");
    try {
      await createBranch(newBranchName.trim());
      toast({ title: "Branch created", description: newBranchName });
      setNewBranchName("");
      await loadBranches();
    } catch (err: any) { toast({ title: "Failed", description: err.message, variant: "destructive" }); }
    setLoadingAction(null);
  };

  const handleSwitchBranch = async (name: string) => {
    if (name === connection?.branch) return;
    setLoadingAction(`switch-${name}`);
    try {
      await switchBranch(name);
      toast({ title: "Switched branch", description: name });
      setRemoteShas(null);
      await loadBranches();
    } catch (err: any) { toast({ title: "Switch failed", description: err.message, variant: "destructive" }); }
    setLoadingAction(null);
  };

  const handleDeleteBranch = async (name: string) => {
    if (name === connection?.branch) { toast({ title: "Cannot delete active branch" }); return; }
    if (!confirm(`Delete branch "${name}" on remote? This cannot be undone.`)) return;
    setLoadingAction(`del-${name}`);
    try { await deleteBranch(name); toast({ title: "Branch deleted", description: name }); await loadBranches(); }
    catch (err: any) { toast({ title: "Failed", description: err.message, variant: "destructive" }); }
    setLoadingAction(null);
  };

  const handleCreatePr = async () => {
    if (!prTitle.trim()) { toast({ title: "Title required" }); return; }
    setLoadingAction("create-pr");
    try {
      const r = await createPullRequest({ title: prTitle, base: prBase || "main", head: connection?.branch, body: prBody, draft: prDraft });
      toast({ title: "PR opened", description: `#${r.pull.number}` });
      setShowNewPr(false); setPrTitle(""); setPrBody("");
      await loadPulls();
    } catch (err: any) { toast({ title: "PR failed", description: err.message, variant: "destructive" }); }
    setLoadingAction(null);
  };

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) return;
    setLoadingAction("create-repo");
    try {
      const data = await createRepo(newRepoName, newRepoDesc, newRepoPrivate);
      setShowNewRepo(false); setNewRepoName(""); setNewRepoDesc("");
      toast({ title: "Repository created", description: data.repo.full_name });
      loadRepos();
    } catch (err: any) { toast({ title: "Failed", description: err.message, variant: "destructive" }); }
    setLoadingAction(null);
  };

  if (connLoading) {
    return <div className="flex items-center justify-center h-32"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" /></div>;
  }

  const statusColor = (s: DiffStatus) =>
    s === "added" ? "text-emerald-400" :
    s === "modified" ? "text-amber-400" :
    s === "deleted" ? "text-destructive" : "text-muted-foreground/40";
  const statusGlyph = (s: DiffStatus) =>
    s === "added" ? "A" : s === "modified" ? "M" : s === "deleted" ? "D" : "·";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-2 py-1.5 border-b border-border/10 flex items-center gap-1.5">
        <FolderGit className="h-3 w-3 text-muted-foreground/50" />
        <span className="text-[10px] font-light tracking-wider text-muted-foreground/60 uppercase">GitHub</span>
        {isConnected && (
          <span className="ml-auto text-[8px] text-emerald-500 flex items-center gap-0.5">
            <Check className="h-2 w-2" /> Connected
          </span>
        )}
      </div>

      {!isConnected ? (
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
          {!showConnect ? (
            <div className="text-center space-y-3 py-4">
              <FolderGit className="h-8 w-8 text-muted-foreground/20 mx-auto" />
              <p className="text-[10px] text-muted-foreground/50 font-light">Connect your GitHub account to import and export code</p>
              <button onClick={() => setShowConnect(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/20 bg-foreground/5 text-[10px] font-light text-foreground hover:bg-foreground/10 transition-colors">
                <GitBranch className="h-3 w-3" /> Connect GitHub
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[9px] font-light text-muted-foreground/50 uppercase tracking-wider">Connect Repository</p>
              <input value={token} onChange={e => setToken(e.target.value)} placeholder="GitHub Personal Access Token" type="password" className="w-full bg-card/20 border border-border/15 rounded-lg px-2 py-1.5 text-[10px] font-light text-foreground outline-none placeholder:text-muted-foreground/30" />
              <div className="flex gap-1.5">
                <input value={repoOwner} onChange={e => setRepoOwner(e.target.value)} placeholder="Owner" className="flex-1 bg-card/20 border border-border/15 rounded-lg px-2 py-1.5 text-[10px] font-light text-foreground outline-none placeholder:text-muted-foreground/30" />
                <input value={repoName} onChange={e => setRepoName(e.target.value)} placeholder="Repo name" className="flex-1 bg-card/20 border border-border/15 rounded-lg px-2 py-1.5 text-[10px] font-light text-foreground outline-none placeholder:text-muted-foreground/30" />
              </div>
              <input value={branch} onChange={e => setBranch(e.target.value)} placeholder="Branch (default: main)" className="w-full bg-card/20 border border-border/15 rounded-lg px-2 py-1.5 text-[10px] font-light text-foreground outline-none placeholder:text-muted-foreground/30" />
              <p className="text-[8px] text-muted-foreground/30 leading-relaxed">
                Create a token at github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens. Grant "Contents" + "Pull requests" read/write.
              </p>
              <div className="flex gap-1.5">
                <button onClick={handleConnect} disabled={!token || !repoOwner || !repoName || loadingAction === "connect"} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-foreground/10 text-foreground text-[10px] font-light py-1.5 hover:bg-foreground/15 transition-colors disabled:opacity-30">
                  {loadingAction === "connect" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Connect
                </button>
                <button onClick={() => setShowConnect(false)} className="px-3 py-1.5 rounded-lg border border-border/15 text-[10px] font-light text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Repo info */}
          <div className="px-2 py-1.5 border-b border-border/10 flex items-center gap-1.5">
            <span className="text-[9px] font-light text-foreground truncate">{connection?.repo_owner}/{connection?.repo_name}</span>
            <span className="text-[8px] text-muted-foreground/40 bg-card/30 rounded px-1 py-0.5">{connection?.branch}</span>
            <button onClick={handleDisconnect} className="ml-auto p-0.5 text-muted-foreground/30 hover:text-destructive transition-colors" title="Disconnect">
              <X className="h-2.5 w-2.5" />
            </button>
          </div>

          {/* Actions bar */}
          <div className="flex gap-1 px-2 py-1.5 border-b border-border/10">
            <button onClick={handleRecursivePull} disabled={!!loadingAction} className="flex items-center gap-0.5 px-2 py-1 rounded text-[9px] font-light text-foreground bg-foreground/5 hover:bg-foreground/10 transition-colors disabled:opacity-30">
              {loadingAction === "import" ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />} Pull (recursive)
            </button>
            <button onClick={refreshDiff} disabled={!!loadingAction} className="flex items-center gap-0.5 px-2 py-1 rounded text-[9px] font-light text-foreground bg-foreground/5 hover:bg-foreground/10 transition-colors disabled:opacity-30">
              {loadingAction === "diff" ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <FileDiff className="h-2.5 w-2.5" />} Diff
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border/10">
            {([
              { id: "changes" as const, label: "Changes", icon: FileDiff },
              { id: "branches" as const, label: "Branches", icon: GitBranch },
              { id: "history" as const, label: "History", icon: GitCommit },
              { id: "pulls" as const, label: "PRs", icon: GitPullRequest },
              { id: "repos" as const, label: "Repos", icon: FolderGit },
            ]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-0.5 py-1.5 text-[8px] font-light transition-colors ${tab === t.id ? "text-foreground border-b border-foreground/30" : "text-muted-foreground/40 hover:text-foreground"}`}
              >
                <t.icon className="h-2.5 w-2.5" /> {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
            {/* ── CHANGES ── */}
            {tab === "changes" && (
              <div className="space-y-2">
                {remoteShas === null ? (
                  <p className="text-[9px] text-muted-foreground/40 text-center py-4">Loading diff…</p>
                ) : stagedChanges.length === 0 ? (
                  <div className="rounded-lg border border-border/10 bg-card/10 p-3 text-center">
                    <Check className="h-4 w-4 text-emerald-500/60 mx-auto mb-1" />
                    <p className="text-[10px] text-foreground font-light">Working tree clean</p>
                    <p className="text-[8px] text-muted-foreground/40">{workspaceFiles.length} files in sync with {connection?.branch}</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-light text-muted-foreground/50 uppercase tracking-wider">
                        {stagedChanges.length} change{stagedChanges.length === 1 ? "" : "s"} · {selected.size} selected
                      </p>
                      <div className="flex gap-1">
                        <button onClick={() => setSelected(new Set(stagedChanges.map(c => c.path)))} className="text-[8px] text-muted-foreground/40 hover:text-foreground">All</button>
                        <button onClick={() => setSelected(new Set())} className="text-[8px] text-muted-foreground/40 hover:text-foreground">None</button>
                      </div>
                    </div>

                    <div className="space-y-0.5 max-h-64 overflow-y-auto">
                      {stagedChanges.map(c => (
                        <label key={c.path} className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-foreground/5 cursor-pointer">
                          <input type="checkbox" checked={selected.has(c.path)} onChange={() => toggleSelected(c.path)} className="h-3 w-3 shrink-0" />
                          <span className={`text-[10px] font-mono w-3 text-center ${statusColor(c.status)}`}>{statusGlyph(c.status)}</span>
                          <span className="text-[10px] font-light text-foreground truncate flex-1" title={c.path}>{c.path}</span>
                        </label>
                      ))}
                    </div>

                    <textarea
                      value={commitMsg}
                      onChange={e => setCommitMsg(e.target.value)}
                      placeholder="Commit message…"
                      rows={2}
                      className="w-full bg-card/20 border border-border/15 rounded-lg px-2 py-1.5 text-[10px] font-light text-foreground outline-none placeholder:text-muted-foreground/30 resize-none"
                    />

                    <button
                      onClick={handleCommitSelected}
                      disabled={!!loadingAction || selected.size === 0}
                      className="w-full flex items-center justify-center gap-1 rounded-lg bg-foreground/10 text-foreground text-[10px] font-light py-1.5 hover:bg-foreground/15 transition-colors disabled:opacity-30"
                    >
                      {loadingAction === "push" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      Commit {selected.size} & push to {connection?.branch}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ── BRANCHES ── */}
            {tab === "branches" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[9px] font-light text-muted-foreground/40 uppercase tracking-wider">Branches</p>
                  <button onClick={loadBranches} className="p-0.5 text-muted-foreground/30 hover:text-foreground transition-colors">
                    <RefreshCw className={`h-2.5 w-2.5 ${loadingAction === "branches" ? "animate-spin" : ""}`} />
                  </button>
                </div>

                <div className="flex gap-1.5">
                  <input
                    value={newBranchName}
                    onChange={e => setNewBranchName(e.target.value)}
                    placeholder={`New branch from ${connection?.branch}`}
                    className="flex-1 bg-card/20 border border-border/15 rounded px-2 py-1 text-[10px] font-light text-foreground outline-none placeholder:text-muted-foreground/30"
                  />
                  <button onClick={handleCreateBranch} disabled={!newBranchName.trim() || loadingAction === "create-branch"} className="px-2 py-1 rounded bg-foreground/10 text-[10px] font-light text-foreground hover:bg-foreground/15 transition-colors disabled:opacity-30">
                    {loadingAction === "create-branch" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  </button>
                </div>

                <div className="space-y-0.5">
                  {branches.map(b => {
                    const active = b.name === connection?.branch;
                    return (
                      <div key={b.name} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-light ${active ? "border-foreground/20 bg-foreground/5 text-foreground" : "border-border/10 text-muted-foreground/60"}`}>
                        <GitBranch className="h-2.5 w-2.5 shrink-0" />
                        <button onClick={() => handleSwitchBranch(b.name)} disabled={active || !!loadingAction} className="truncate flex-1 text-left hover:text-foreground transition-colors disabled:cursor-default">
                          {b.name}
                        </button>
                        {b.protected && <span className="text-[7px] text-muted-foreground/40 bg-card/30 rounded px-1">protected</span>}
                        {active ? <Check className="h-2.5 w-2.5 shrink-0" /> :
                          <>
                            {loadingAction === `switch-${b.name}` && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                            {!b.protected && (
                              <button onClick={() => handleDeleteBranch(b.name)} className="text-muted-foreground/30 hover:text-destructive transition-colors" title="Delete branch">
                                <Trash2 className="h-2.5 w-2.5" />
                              </button>
                            )}
                          </>
                        }
                      </div>
                    );
                  })}
                  {branches.length === 0 && !loadingAction && <p className="text-[9px] text-muted-foreground/30 text-center py-4">No branches loaded</p>}
                </div>
              </div>
            )}

            {/* ── HISTORY ── */}
            {tab === "history" && (
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[9px] font-light text-muted-foreground/40 uppercase tracking-wider">Commits · {connection?.branch}</p>
                  <button onClick={loadCommits} className="p-0.5 text-muted-foreground/30 hover:text-foreground transition-colors">
                    <RefreshCw className={`h-2.5 w-2.5 ${loadingAction === "commits" ? "animate-spin" : ""}`} />
                  </button>
                </div>
                {commits.map(c => (
                  <div key={c.sha} className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg border border-border/10">
                    <GitCommit className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-light text-foreground truncate">{c.message.split("\n")[0]}</p>
                      <p className="text-[8px] text-muted-foreground/40">{c.author} · {new Date(c.date).toLocaleString()}</p>
                    </div>
                    <span className="text-[7px] font-mono text-muted-foreground/30 shrink-0">{c.sha.slice(0, 7)}</span>
                  </div>
                ))}
                {commits.length === 0 && !loadingAction && <p className="text-[9px] text-muted-foreground/30 text-center py-4">No commits loaded</p>}
              </div>
            )}

            {/* ── PULL REQUESTS ── */}
            {tab === "pulls" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[9px] font-light text-muted-foreground/40 uppercase tracking-wider">Open Pull Requests</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowNewPr(!showNewPr)} className="p-0.5 text-muted-foreground/30 hover:text-foreground transition-colors" title="New PR">
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                    <button onClick={loadPulls} className="p-0.5 text-muted-foreground/30 hover:text-foreground transition-colors">
                      <RefreshCw className={`h-2.5 w-2.5 ${loadingAction === "pulls" ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>

                {showNewPr && (
                  <div className="rounded-lg border border-border/15 bg-card/10 p-2 space-y-1.5">
                    <p className="text-[8px] text-muted-foreground/50">From <span className="text-foreground">{connection?.branch}</span> →</p>
                    <input value={prBase} onChange={e => setPrBase(e.target.value)} placeholder="base branch (e.g. main)" className="w-full bg-card/20 border border-border/15 rounded px-2 py-1 text-[10px] font-light text-foreground outline-none placeholder:text-muted-foreground/30" />
                    <input value={prTitle} onChange={e => setPrTitle(e.target.value)} placeholder="PR title" className="w-full bg-card/20 border border-border/15 rounded px-2 py-1 text-[10px] font-light text-foreground outline-none placeholder:text-muted-foreground/30" />
                    <textarea value={prBody} onChange={e => setPrBody(e.target.value)} placeholder="Description (optional)" rows={3} className="w-full bg-card/20 border border-border/15 rounded px-2 py-1 text-[10px] font-light text-foreground outline-none placeholder:text-muted-foreground/30 resize-none" />
                    <label className="flex items-center gap-1.5 text-[9px] text-muted-foreground/50 cursor-pointer">
                      <input type="checkbox" checked={prDraft} onChange={e => setPrDraft(e.target.checked)} className="rounded" /> Draft
                    </label>
                    <button onClick={handleCreatePr} disabled={!prTitle.trim() || loadingAction === "create-pr"} className="w-full flex items-center justify-center gap-1 rounded bg-foreground/10 text-foreground text-[10px] font-light py-1 hover:bg-foreground/15 transition-colors disabled:opacity-30">
                      {loadingAction === "create-pr" ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <GitPullRequest className="h-2.5 w-2.5" />} Open PR
                    </button>
                  </div>
                )}

                {pulls.map(p => (
                  <a key={p.number} href={p.html_url} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg border border-border/10 hover:border-border/30 hover:bg-foreground/5 transition-colors">
                    <GitPullRequest className="h-2.5 w-2.5 text-emerald-400/70 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-light text-foreground truncate">#{p.number} {p.title}</p>
                      <p className="text-[8px] text-muted-foreground/40">{p.head} → {p.base} · {p.user}{p.draft ? " · draft" : ""}</p>
                    </div>
                    <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/30 shrink-0" />
                  </a>
                ))}
                {pulls.length === 0 && !loadingAction && <p className="text-[9px] text-muted-foreground/30 text-center py-4">No open PRs</p>}
              </div>
            )}

            {/* ── REPOS ── */}
            {tab === "repos" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-light text-muted-foreground/40 uppercase tracking-wider">Your Repos</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowNewRepo(!showNewRepo)} className="p-0.5 text-muted-foreground/30 hover:text-foreground transition-colors">
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                    <button onClick={loadRepos} className="p-0.5 text-muted-foreground/30 hover:text-foreground transition-colors">
                      <RefreshCw className={`h-2.5 w-2.5 ${loadingAction === "repos" ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>

                {showNewRepo && (
                  <div className="rounded-lg border border-border/15 bg-card/10 p-2 space-y-1.5">
                    <input value={newRepoName} onChange={e => setNewRepoName(e.target.value)} placeholder="Repository name" className="w-full bg-card/20 border border-border/15 rounded px-2 py-1 text-[10px] font-light text-foreground outline-none placeholder:text-muted-foreground/30" />
                    <input value={newRepoDesc} onChange={e => setNewRepoDesc(e.target.value)} placeholder="Description (optional)" className="w-full bg-card/20 border border-border/15 rounded px-2 py-1 text-[10px] font-light text-foreground outline-none placeholder:text-muted-foreground/30" />
                    <label className="flex items-center gap-1.5 text-[9px] text-muted-foreground/50 cursor-pointer">
                      <input type="checkbox" checked={newRepoPrivate} onChange={e => setNewRepoPrivate(e.target.checked)} className="rounded" /> Private
                    </label>
                    <button onClick={handleCreateRepo} disabled={!newRepoName.trim() || loadingAction === "create-repo"} className="w-full flex items-center justify-center gap-1 rounded bg-foreground/10 text-foreground text-[10px] font-light py-1 hover:bg-foreground/15 transition-colors disabled:opacity-30">
                      {loadingAction === "create-repo" ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Plus className="h-2.5 w-2.5" />} Create
                    </button>
                  </div>
                )}

                {repos.map(r => (
                  <div key={r.full_name} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] font-light transition-colors ${r.full_name === `${connection?.repo_owner}/${connection?.repo_name}` ? "border-foreground/20 bg-foreground/5" : "border-border/10 hover:border-border/20"}`}>
                    <FolderGit className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-foreground truncate block">{r.full_name}</span>
                      {r.description && <p className="text-[8px] text-muted-foreground/40 truncate">{r.description}</p>}
                    </div>
                    {r.private && <span className="text-[7px] text-muted-foreground/40 bg-card/30 rounded px-1">private</span>}
                  </div>
                ))}
                {repos.length === 0 && !loadingAction && <p className="text-[9px] text-muted-foreground/30 text-center py-4">No repos loaded</p>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default IdeGitPanel;
