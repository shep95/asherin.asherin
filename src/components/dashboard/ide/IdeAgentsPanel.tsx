// ============================================================
// IDE Agents Panel — Phase 3 deliverable.
// CRUD over `asher_code_agents`. Each agent has a goal and a trigger
// (manual | on_crash | on_save). The "Run" button hands the goal to
// the AI chat via onRunAgent. The "on_crash" trigger is auto-fired by
// the terminal crash hook in AureonIdeView.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Bot, Plus, Play, Trash2, Loader2, Power, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface IdeAgent {
  id: string;
  user_id: string;
  session_id: string | null;
  name: string;
  goal: string;
  trigger: "manual" | "on_crash" | "on_save";
  status: "idle" | "running" | "success" | "failed";
  enabled: boolean;
  last_run_at: string | null;
  last_result: unknown;
  created_at: string;
}

interface Props {
  sessionId: string | null;
  onRunAgent: (goal: string, agentName: string) => void;
  /** Exposes a callback so the parent can fire trigger="on_crash" agents. */
  onRegisterCrashHandler?: (handler: (crashSummary: string) => void) => void;
}

const TRIGGERS: { value: IdeAgent["trigger"]; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "on_crash", label: "On crash" },
  { value: "on_save", label: "On save" },
];

const IdeAgentsPanel = ({ sessionId, onRunAgent, onRegisterCrashHandler }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [agents, setAgents] = useState<IdeAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", goal: "", trigger: "manual" as IdeAgent["trigger"] });

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("asher_code_agents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load agents", description: error.message, variant: "destructive" });
    } else {
      setAgents((data ?? []) as IdeAgent[]);
    }
    setLoading(false);
  }, [user?.id, toast]);

  useEffect(() => { void load(); }, [load]);

  // Expose on_crash trigger to parent (terminal hooks into this).
  useEffect(() => {
    if (!onRegisterCrashHandler) return;
    onRegisterCrashHandler((crashSummary) => {
      const crashAgents = agents.filter(a => a.enabled && a.trigger === "on_crash");
      for (const a of crashAgents) {
        const goal = `${a.goal}\n\n[Auto-trigger: terminal crash detected]\n${crashSummary}`;
        void runAgent(a, goal);
      }
    });
  }, [agents, onRegisterCrashHandler]); // eslint-disable-line react-hooks/exhaustive-deps

  const createAgent = useCallback(async () => {
    if (!user?.id || !draft.name.trim() || !draft.goal.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("asher_code_agents")
      .insert({ user_id: user.id, session_id: sessionId, name: draft.name.trim(), goal: draft.goal.trim(), trigger: draft.trigger })
      .select("*")
      .single();
    setCreating(false);
    if (error) {
      toast({ title: "Failed to create agent", description: error.message, variant: "destructive" });
      return;
    }
    setAgents(prev => [data as IdeAgent, ...prev]);
    setDraft({ name: "", goal: "", trigger: "manual" });
    toast({ title: "Agent created", description: data.name });
  }, [user?.id, sessionId, draft, toast]);

  const toggleAgent = useCallback(async (a: IdeAgent) => {
    const { error } = await supabase
      .from("asher_code_agents")
      .update({ enabled: !a.enabled })
      .eq("id", a.id);
    if (!error) setAgents(prev => prev.map(x => x.id === a.id ? { ...x, enabled: !x.enabled } : x));
  }, []);

  const deleteAgent = useCallback(async (id: string) => {
    const { error } = await supabase.from("asher_code_agents").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setAgents(prev => prev.filter(a => a.id !== id));
  }, [toast]);

  const runAgent = useCallback(async (a: IdeAgent, overrideGoal?: string) => {
    const goal = overrideGoal ?? a.goal;
    await supabase.from("asher_code_agents").update({
      status: "running",
      last_run_at: new Date().toISOString(),
    }).eq("id", a.id);
    setAgents(prev => prev.map(x => x.id === a.id ? { ...x, status: "running", last_run_at: new Date().toISOString() } : x));
    try {
      onRunAgent(goal, a.name);
      // Optimistic: mark success once dispatched to chat. The chat itself owns retries/errors.
      await supabase.from("asher_code_agents").update({
        status: "success",
        last_result: { dispatched_at: new Date().toISOString(), goal_preview: goal.slice(0, 240) },
      }).eq("id", a.id);
      setAgents(prev => prev.map(x => x.id === a.id ? { ...x, status: "success" } : x));
    } catch (e: any) {
      await supabase.from("asher_code_agents").update({
        status: "failed",
        last_result: { error: String(e?.message || e) },
      }).eq("id", a.id);
      setAgents(prev => prev.map(x => x.id === a.id ? { ...x, status: "failed" } : x));
    }
  }, [onRunAgent]);

  return (
    <div className="flex flex-col h-full bg-card/5 text-foreground/90">
      <div className="px-3 py-2 border-b border-border/15 flex items-center gap-2">
        <Bot className="h-3.5 w-3.5 text-accent/80" />
        <span className="text-[10px] font-light tracking-[0.2em] uppercase">IDE Agents</span>
        <span className="ml-auto text-[9px] text-muted-foreground/60">{agents.length} agent{agents.length === 1 ? "" : "s"}</span>
      </div>

      {/* Create draft */}
      <div className="px-3 py-2 border-b border-border/15 space-y-1.5 bg-card/10">
        <input
          type="text"
          placeholder="Agent name (e.g. Crash Triage)"
          value={draft.name}
          onChange={(e) => setDraft(d => ({ ...d, name: e.target.value }))}
          className="w-full bg-background/40 border border-border/20 rounded px-2 py-1 text-[11px] outline-none focus:border-accent/50"
        />
        <textarea
          placeholder="Goal — what should this agent do when triggered? (e.g. 'Diagnose any TypeScript error, propose a minimal fix, and apply it.')"
          value={draft.goal}
          onChange={(e) => setDraft(d => ({ ...d, goal: e.target.value }))}
          rows={2}
          className="w-full bg-background/40 border border-border/20 rounded px-2 py-1 text-[11px] outline-none focus:border-accent/50 resize-none"
        />
        <div className="flex items-center gap-2">
          <select
            value={draft.trigger}
            onChange={(e) => setDraft(d => ({ ...d, trigger: e.target.value as IdeAgent["trigger"] }))}
            className="bg-background/40 border border-border/20 rounded px-2 py-1 text-[10px] outline-none"
          >
            {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button
            onClick={createAgent}
            disabled={creating || !draft.name.trim() || !draft.goal.trim()}
            className="ml-auto flex items-center gap-1 rounded bg-accent/20 hover:bg-accent/30 px-2.5 py-1 text-[10px] disabled:opacity-40"
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add agent
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-[10px] text-muted-foreground/60">
            <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> loading…
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[10px] text-muted-foreground/50 px-6 text-center">
            <Bot className="h-5 w-5 mb-2 opacity-40" />
            No agents yet. Create one above. Agents triggered by crashes will fire automatically when the terminal detects an error.
          </div>
        ) : (
          <ul className="divide-y divide-border/10">
            {agents.map(a => (
              <li key={a.id} className={`px-3 py-2 ${a.enabled ? "" : "opacity-50"}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    a.status === "running" ? "bg-accent animate-pulse"
                    : a.status === "success" ? "bg-green-500/70"
                    : a.status === "failed" ? "bg-red-500/70"
                    : "bg-muted-foreground/40"
                  }`} />
                  <span className="text-[11px] font-light truncate">{a.name}</span>
                  <span className="ml-1 text-[8.5px] uppercase tracking-widest text-muted-foreground/60">{a.trigger}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => runAgent(a)} title="Run now" className="p-1 rounded hover:bg-accent/15 text-accent/80">
                      <Play className="h-3 w-3" />
                    </button>
                    <button onClick={() => toggleAgent(a)} title={a.enabled ? "Disable" : "Enable"} className="p-1 rounded hover:bg-muted/20 text-muted-foreground/70">
                      <Power className="h-3 w-3" />
                    </button>
                    <button onClick={() => deleteAgent(a.id)} title="Delete" className="p-1 rounded hover:bg-red-500/15 text-red-400/70">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/70 mt-1 line-clamp-2 pl-3.5">{a.goal}</p>
                {a.last_run_at && (
                  <p className="text-[8.5px] text-muted-foreground/50 mt-0.5 pl-3.5">
                    last: {new Date(a.last_run_at).toLocaleTimeString()}
                    {a.status === "failed" && (
                      <span className="ml-1 inline-flex items-center text-red-400/80"><AlertCircle className="h-2.5 w-2.5 mr-0.5" /> failed</span>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default IdeAgentsPanel;
