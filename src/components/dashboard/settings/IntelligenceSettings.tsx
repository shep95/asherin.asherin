// intelligence settings — the control surface for what asherin is allowed to
// remember and learn. every switch here is honest: memory off means nothing is
// retrieved, learning off means nothing is written, and shared contribution is
// opt-in and abstracted. nothing on this screen is simulated.

import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, Trash2, Check, X, RefreshCw } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  loadUserMemory,
  deleteMemory,
  updateMemoryContent,
  insertUserMemory,
  loadPendingCandidates,
  resolveCandidate,
  loadPatterns,
  loadLearningEvents,
} from "@/lib/intelligence/store";
import type { IntelligenceSettings as Settings, MemoryCandidate, MemoryRecord, PatternObject } from "@/lib/intelligence/types";
import { toast } from "sonner";

type LearningEvent = {
  id: string;
  stage: string;
  decision: string;
  reason: string | null;
  created_at: string;
};

const Toggle = ({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <div className="text-xs text-foreground/90">{label}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`shrink-0 w-10 h-5 rounded-full transition-colors ${value ? "bg-foreground/30" : "bg-border/30"} ${disabled ? "opacity-40" : ""}`}
    >
      <div className={`w-4 h-4 rounded-full bg-foreground transition-transform mx-0.5 ${value ? "translate-x-5" : ""}`} />
    </button>
  </div>
);

export default function IntelligenceSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [candidates, setCandidates] = useState<(MemoryCandidate & { id: string })[]>([]);
  const [patterns, setPatterns] = useState<PatternObject[]>([]);
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, m, c, p, e] = await Promise.all([
        loadSettings(),
        loadUserMemory(),
        loadPendingCandidates(),
        loadPatterns(),
        loadLearningEvents(25),
      ]);
      setSettings(s);
      setMemories(m);
      setCandidates(c);
      setPatterns(p);
      setEvents((e ?? []) as unknown as LearningEvent[]);
    } catch {
      toast.error("could not load intelligence settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = async (patch: Partial<Settings>) => {
    const prev = settings;
    setSettings({ ...settings, ...patch });
    setBusy(true);
    try {
      const next = await saveSettings(patch);
      setSettings(next);
    } catch {
      setSettings(prev);
      toast.error("could not save");
    } finally {
      setBusy(false);
    }
  };

  const addMemory = async () => {
    const content = draft.trim();
    if (!content) return;
    setBusy(true);
    try {
      await insertUserMemory({
        kind: "prefer",
        scope: "user",
        content,
        rationale: "entered directly by the account owner",
        confidence: 0.95,
        evidenceCount: 1,
        source: "user_stated",
        sourceConversationId: null,
        status: "active",
        projectId: null,
      } as MemoryRecord);
      setDraft("");
      await refresh();
      toast.success("saved");
    } catch {
      toast.error("could not save that rule");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id?: string) => {
    if (!id) return;
    setBusy(true);
    try {
      await deleteMemory("ai_user_memory", id);
      setMemories((m) => m.filter((x) => x.id !== id));
    } catch {
      toast.error("could not delete");
    } finally {
      setBusy(false);
    }
  };

  const commitEdit = async () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return;
    setBusy(true);
    try {
      await updateMemoryContent("ai_user_memory", editing.id, text);
      setMemories((m) => m.map((x) => (x.id === editing.id ? { ...x, content: text } : x)));
      setEditing(null);
    } catch {
      toast.error("could not update");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (c: MemoryCandidate & { id: string }, approve: boolean) => {
    setBusy(true);
    try {
      if (approve) {
        const newId = await insertUserMemory({
          kind: c.kind,
          scope: "user",
          content: c.content,
          rationale: c.rationale,
          confidence: Math.max(c.confidence, 0.8),
          evidenceCount: Math.max(1, c.evidence?.length ?? 1),
          source: "user_approved_candidate",
          sourceConversationId: c.conversationId ?? null,
          status: "active",
          projectId: null,
        } as MemoryRecord);
        await resolveCandidate(c.id, "promoted", "approved by the account owner", newId ? { to: "user", id: newId } : undefined);
      } else {
        await resolveCandidate(c.id, "rejected", "rejected by the account owner");
      }
      await refresh();
    } catch {
      toast.error("could not record that decision");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-sm font-light text-foreground">Memory &amp; learning</h3>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> refresh
        </button>
      </div>

      <div className="space-y-4">
        <Toggle
          label="Remember things about me"
          hint="off means nothing saved here is used in a conversation."
          value={settings.memoryEnabled}
          onChange={(v) => void update({ memoryEnabled: v })}
          disabled={busy}
        />
        <Toggle
          label="Learn from how conversations go"
          hint="records what worked and what failed. requires memory to be on before anything is stored about you."
          value={settings.learningEnabled}
          onChange={(v) => void update({ learningEnabled: v })}
          disabled={busy}
        />
        <Toggle
          label="Contribute anonymised lessons"
          hint="opt-in. only abstracted methods, never your text, names, files or identifiers."
          value={settings.globalContributionEnabled}
          onChange={(v) => void update({ globalContributionEnabled: v })}
          disabled={busy}
        />
      </div>

      {!settings.memoryEnabled && (
        <div className="text-[11px] text-muted-foreground border border-border/20 rounded-lg p-3">
          memory is off — saved rules below are kept but never used in a conversation.
        </div>
      )}

      {/* add a rule */}
      <div className="space-y-2">
        <div className="text-[11px] text-muted-foreground">Add a standing rule</div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addMemory();
            }}
            placeholder="e.g. keep answers short and skip preamble"
            className="flex-1 bg-background/40 border border-border/30 rounded-lg px-3 py-2 text-xs outline-none focus:border-border/60"
          />
          <button
            type="button"
            onClick={() => void addMemory()}
            disabled={busy || !draft.trim()}
            className="px-3 py-2 rounded-lg border border-border/30 text-xs hover:bg-foreground/5 disabled:opacity-40"
          >
            save rule
          </button>
        </div>
      </div>

      {/* stored memories */}
      <div className="space-y-2">
        <div className="text-[11px] text-muted-foreground">
          What asherin has stored about you ({memories.length})
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> loading
          </div>
        ) : memories.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">nothing stored yet.</div>
        ) : (
          <ul className="space-y-1.5">
            {memories.map((m) => (
              <li
                key={m.id}
                className="flex items-start gap-2 border border-border/20 rounded-lg px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  {editing?.id === m.id ? (
                    <input
                      value={editing.text}
                      autoFocus
                      onChange={(e) => setEditing({ id: m.id!, text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitEdit();
                        if (e.key === "Escape") setEditing(null);
                      }}
                      onBlur={() => void commitEdit()}
                      className="w-full bg-transparent text-xs outline-none border-b border-border/40"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditing({ id: m.id!, text: m.content })}
                      className="text-xs text-left text-foreground/90 hover:text-foreground w-full"
                    >
                      {m.content}
                    </button>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {m.kind} · confidence {Math.round(m.confidence * 100)}% · {m.source}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="delete"
                  onClick={() => void remove(m.id)}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* pending candidates */}
      {candidates.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] text-muted-foreground">Waiting for your decision ({candidates.length})</div>
          <ul className="space-y-1.5">
            {candidates.map((c) => (
              <li key={c.id} className="border border-border/20 rounded-lg px-3 py-2 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-foreground/90">{c.content}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {c.rationale ?? "observed in conversation"} · confidence {Math.round(c.confidence * 100)}%
                  </div>
                </div>
                <button type="button" aria-label="approve" onClick={() => void decide(c, true)} className="text-muted-foreground hover:text-foreground">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="reject" onClick={() => void decide(c, false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* procedures */}
      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">Procedures it can reuse ({patterns.length})</div>
        {patterns.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">none stored yet — they appear as conversations produce methods that worked.</div>
        ) : (
          <ul className="text-[11px] text-muted-foreground space-y-0.5 max-h-40 overflow-auto">
            {patterns.slice(0, 40).map((p) => (
              <li key={p.id}>
                {p.name} · {p.status} · used {p.successCount + p.failureCount}×
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* audit */}
      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">Recent decisions ({events.length})</div>
        {events.length === 0 ? (
          <div className="text-[11px] text-muted-foreground">no decisions recorded yet.</div>
        ) : (
          <ul className="text-[11px] text-muted-foreground space-y-0.5 max-h-40 overflow-auto">
            {events.map((e) => (
              <li key={e.id}>
                {new Date(e.created_at).toLocaleString()} · {e.stage} · {e.decision} — {e.reason ?? "no reason recorded"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
