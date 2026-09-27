import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import SessionsList from "./SessionsList";
import SessionWorkspace from "./SessionWorkspace";

export interface ScrapperSession {
  id: string;
  name: string;
  status: string;
  total_files: number;
  total_text_length: number;
  created_at: string;
  updated_at: string;
}

export interface ScrapperFile {
  id: string;
  session_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  extracted_text: string | null;
  status: string;
  created_at: string;
}

const FileScrapperView = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<ScrapperSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("scrapper_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSessions(data || []);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const createSession = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("scrapper_sessions")
      .insert({ user_id: user.id, name: `Session ${sessions.length + 1}` })
      .select()
      .single();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setSessions((prev) => [data, ...prev]);
      setActiveSessionId(data.id);
    }
  };

  const deleteSession = async (id: string) => {
    // Storage-first: fetch every file's storage_path, remove the objects, then
    // delete the session. The CASCADE FK on scrapper_files.session_id auto-removes
    // the DB rows when the session row goes — but storage objects must be wiped
    // explicitly or they become orphans forever.
    const { data: childFiles, error: listErr } = await supabase
      .from("scrapper_files")
      .select("storage_path")
      .eq("session_id", id);
    if (listErr) {
      toast({ title: "Error", description: listErr.message, variant: "destructive" });
      return;
    }
    const paths = (childFiles ?? [])
      .map((f) => (f as any).storage_path as string | null)
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from("scrapper-uploads")
        .remove(paths);
      if (storageErr) {
        console.error("[scrapper] storage cleanup failed", storageErr);
        toast({
          title: "Storage cleanup failed",
          description: `${storageErr.message}. Session NOT deleted — retry or contact support.`,
          variant: "destructive",
        });
        return; // hard-fail — do not orphan storage
      }
    }
    const { error } = await supabase.from("scrapper_sessions").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) setActiveSessionId(null);
      toast({ title: `Session and ${paths.length} file(s) removed` });
    }
  };

  const renameSession = async (id: string, name: string) => {
    const { error } = await supabase.from("scrapper_sessions").update({ name }).eq("id", id);
    if (!error) {
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs font-extralight tracking-[0.2em] text-muted-foreground animate-pulse">
          opening asherin.extract…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      <SessionsList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
        onCreate={createSession}
        onDelete={deleteSession}
        onRename={renameSession}
      />
      <div className="flex-1 overflow-hidden">
        {activeSession ? (
          <SessionWorkspace session={activeSession} onUpdate={fetchSessions} />
        ) : (
          <div className="flex flex-1 h-full items-center justify-center">
            <div className="text-center space-y-3">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border/20 font-mono text-muted-foreground/40">EX</div>
              <h2 className="text-lg font-extralight text-foreground">
                asherin.extract
              </h2>
              <p className="text-xs font-extralight text-muted-foreground max-w-sm">
                Upload unstructured documents — PDFs, images, scanned files — and extract all text
                into a single downloadable TXT file.
              </p>
              <button
                onClick={createSession}
                className="mt-4 rounded-lg bg-accent text-accent-foreground px-5 py-2.5 text-xs font-light tracking-wide hover:bg-accent/90 transition-colors"
              >
                + New Session
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileScrapperView;
