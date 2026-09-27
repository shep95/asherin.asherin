import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GitHubConnection {
  id: string;
  repo_owner: string;
  repo_name: string;
  branch: string;
  status: string;
  last_sync_at: string | null;
  created_at: string;
}

export interface GitHubRepo {
  full_name: string;
  name: string;
  owner: string;
  default_branch: string;
  private: boolean;
  description: string | null;
  updated_at: string;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
}

export function useGitHub() {
  const [connection, setConnection] = useState<GitHubConnection | null>(null);
  const [loading, setLoading] = useState(true);

  // [Finding #12] — Track fetch generation to discard stale responses
  const fetchGenRef = useRef(0);

  const fetchConnection = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const { data } = await supabase
      .from("github_connections")
      .select("id, user_id, repo_owner, repo_name, branch, last_sync_at, status, created_at, updated_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Only apply if this is still the latest fetch
    if (gen === fetchGenRef.current) {
      setConnection(data as GitHubConnection | null);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnection();
    // Cleanup: bump generation on unmount to discard inflight
    return () => { fetchGenRef.current++; };
  }, [fetchConnection]);

  const callGitHub = useCallback(async (action: string, extra?: Record<string, any>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await supabase.functions.invoke("github-api", {
      body: { action, connection_id: connection?.id, ...extra },
    });

    if (res.error) throw new Error(res.error.message);
    if (res.data?.error) throw new Error(res.data.error);
    return res.data;
  }, [connection]);

  const connect = useCallback(async (token: string, repoOwner: string, repoName: string, branch = "main") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");

    const res = await supabase.functions.invoke("github-api", {
      body: { action: "validate_token", token },
    });
    if (res.data?.error) throw new Error(res.data.error);

    await supabase.from("github_connections").delete().eq("user_id", session.user.id);

    const { data, error } = await supabase.from("github_connections").insert({
      user_id: session.user.id,
      repo_owner: repoOwner,
      repo_name: repoName,
      branch,
      github_token: token,
    }).select("id, user_id, repo_owner, repo_name, branch, last_sync_at, status, created_at, updated_at").single();

    if (error) throw new Error(error.message);
    setConnection(data as GitHubConnection);
    return { user: res.data.user, connection: data };
  }, []);

  const disconnect = useCallback(async () => {
    if (!connection) return;
    await supabase.from("github_connections").delete().eq("id", connection.id);
    setConnection(null);
  }, [connection]);

  const listRepos = useCallback(() => callGitHub("list_repos"), [callGitHub]);
  const getContents = useCallback((path?: string, branch?: string) => callGitHub("get_contents", { path, branch }), [callGitHub]);
  const getFile = useCallback((path: string, branch?: string) => callGitHub("get_file", { path, branch }), [callGitHub]);
  const pushFile = useCallback((path: string, content: string, message?: string) => callGitHub("push_file", { path, content, message }), [callGitHub]);
  const pushFiles = useCallback((files: { path: string; content: string }[], message?: string) => callGitHub("push_files", { files, message }), [callGitHub]);
  const listBranches = useCallback(() => callGitHub("list_branches"), [callGitHub]);
  const getCommits = useCallback((branch?: string) => callGitHub("get_commits", { branch }), [callGitHub]);
  const createRepo = useCallback((name: string, description?: string, is_private?: boolean) => callGitHub("create_repo", { name, description, is_private }), [callGitHub]);
  const deleteFile = useCallback((path: string, message?: string) => callGitHub("delete_file", { path, message }), [callGitHub]);
  const getTreeRecursive = useCallback((branch?: string) => callGitHub("get_tree_recursive", { branch }), [callGitHub]);
  const getBlobs = useCallback((paths: string[], branch?: string) => callGitHub("get_blobs", { paths, branch }), [callGitHub]);
  const getPathShas = useCallback((branch?: string) => callGitHub("get_path_shas", { branch }), [callGitHub]);
  const createBranch = useCallback((name: string, from?: string) => callGitHub("create_branch", { name, from }), [callGitHub]);
  const deleteBranch = useCallback((name: string) => callGitHub("delete_branch", { name }), [callGitHub]);
  const switchBranch = useCallback(async (name: string) => {
    const r = await callGitHub("switch_branch", { name });
    await fetchConnection();
    return r;
  }, [callGitHub, fetchConnection]);
  const listPullRequests = useCallback((state: "open" | "closed" | "all" = "open") => callGitHub("list_pull_requests", { state }), [callGitHub]);
  const createPullRequest = useCallback((args: { head?: string; base?: string; title: string; body?: string; draft?: boolean }) => callGitHub("create_pull_request", args), [callGitHub]);

  return {
    connection,
    loading,
    isConnected: !!connection,
    connect,
    disconnect,
    fetchConnection,
    listRepos,
    getContents,
    getFile,
    pushFile,
    pushFiles,
    listBranches,
    getCommits,
    createRepo,
    deleteFile,
    getTreeRecursive,
    getBlobs,
    getPathShas,
    createBranch,
    deleteBranch,
    switchBranch,
    listPullRequests,
    createPullRequest,
  };
}
