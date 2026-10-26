// asherin.extract — sessions on the left, one open session on the right.
//
// The rows are the source of truth: the list subscribes to the sessions
// table, so a total the queue recomputes shows up here without a refetch
// chain. Nothing in this room talks to a server; every read and write lands
// in the device's own store.

import { useState, useEffect, useCallback } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { onTableChange } from "@/lib/local/db";
import { useIsV2 } from "@/lib/dashboardUiContext";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";
import SessionsList from "./SessionsList";
import SessionWorkspace from "./SessionWorkspace";
import { SESSIONS, listSessions, createSession, deleteSession, renameSession, type ScrapperSession } from "./store";

export type { ScrapperSession, ScrapperFile } from "./store";

const FileScrapperView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const v2 = useIsV2();
  const userId = user?.id ?? null;
  const [sessions, setSessions] = useState<ScrapperSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return { rows: [] as ScrapperSession[], error: "this device has no identity yet — reload the page" };
    const { sessions: rows, error } = await listSessions(userId);
    return { rows, error };
  }, [userId]);

  // rows: read once, then on every write to the table (the queue updates totals).
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const { rows, error } = await refresh();
      if (!alive) return;
      setSessions(rows);
      setLoadError(error);
      setLoading(false);
    };
    void run();
    const off = onTableChange(SESSIONS, () => {
      if (alive) void run();
    });
    return () => {
      alive = false;
      off();
    };
  }, [refresh]);

  const retryLoad = () => {
    setLoading(true);
    void refresh().then(({ rows, error }) => {
      setSessions(rows);
      setLoadError(error);
      setLoading(false);
    });
  };

  const create = async () => {
    if (!userId || creating) return;
    setCreating(true);
    const { session, error } = await createSession(userId, `session ${sessions.length + 1}`);
    setCreating(false);
    if (error || !session) {
      toast({ title: "session not created", description: error ?? "the local store refused the write", variant: "destructive" });
      return;
    }
    setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)]);
    setActiveSessionId(session.id);
  };

  const remove = async (id: string) => {
    const { removedFiles, error } = await deleteSession(id);
    if (error) {
      toast({ title: "session kept", description: error, variant: "destructive" });
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
    toast({ title: "session removed", description: `${removedFiles} stored file${removedFiles === 1 ? "" : "s"} gone with it.` });
  };

  const rename = async (id: string, name: string) => {
    const before = sessions.find((s) => s.id === id)?.name;
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    const error = await renameSession(id, name);
    if (error) {
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name: before ?? s.name } : s)));
      toast({ title: "name not saved", description: error, variant: "destructive" });
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  if (loading) {
    return (
      <div className="flex flex-1 h-full items-center justify-center p-6">
        <p className="text-xs font-extralight tracking-[0.2em] text-muted-foreground animate-pulse">opening asherin.extract…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-1 h-full items-center justify-center p-6">
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-xs font-extralight text-muted-foreground">{loadError}</p>
          <button
            type="button"
            onClick={retryLoad}
            className="rounded-lg border border-border/20 px-4 py-2 text-xs font-light text-foreground/80 hover:bg-foreground/5 transition-colors"
          >
            try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row flex-1 h-full min-h-0 overflow-hidden">
      {v2 && (
        <V2Action>
          <button type="button" onClick={create} disabled={creating} className={v2ActionClass}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            new session
          </button>
        </V2Action>
      )}
      <SessionsList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
        onCreate={create}
        onDelete={remove}
        onRename={rename}
      />
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        {activeSession && userId ? (
          <SessionWorkspace key={activeSession.id} session={activeSession} userId={userId} />
        ) : (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-sm space-y-3 text-center">
              <div
                className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border/20 font-mono text-[11px] text-muted-foreground/40"
                aria-hidden="true"
              >
                ex
              </div>
              <p className="text-xs font-extralight leading-relaxed text-muted-foreground">
                {sessions.length === 0
                  ? "pdfs, scanned pages, photos of text, .docx and plain text files — read on this device, returned as one .txt."
                  : "pick a session, or start a new one."}
              </p>
              <button
                type="button"
                onClick={create}
                disabled={creating}
                className="mt-2 rounded-lg bg-accent text-accent-foreground px-5 py-2.5 text-xs font-light tracking-wide hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                new session
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileScrapperView;
