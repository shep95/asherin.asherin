/**
 * asherin.agents — an agent forge that runs on this device.
 *
 * describe an agent → shepherd scopes it, then drafts a spec, a workflow,
 * portable code and a test plan in a few passes → the operator reviews and
 * refines → the agent runs here (run now, or every n minutes while asherin
 * stays open) → it can be published as a tab inside asherin.
 *
 * what leaves the device: the model calls, carrying the key saved in
 * settings → intelligence. nothing else. there is no server, no cron, no
 * webhook; the published tab is a sandboxed page with no network.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, ExternalLink, Loader2, Play, Plus, RefreshCw, Rocket, Send, Square, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { routeBrainsForPrompt } from "@/lib/asherBrainRouter";
import { getActiveModel } from "@/lib/local/keys";
import { triggerByokRequired } from "@/components/ByokRequiredDialog";
import { V2Action, v2ActionClass } from "@/components/dashboard/v2/V2PageShell";
import { ASSESSOR_SYSTEM, BUILDER_SYSTEM, TAB_EDITOR_SYSTEM } from "@/lib/zahten/prompts";
import {
  clampInterval, ensureCsp, extractCode, parseAssessor, parseNeeds, parseSpecName, parseSpecTrigger, parseStatus, parseWorkflowSteps,
  readTabAgentId, triggerLabel, type Trigger,
} from "@/lib/zahten/parse";
import {
  MAX_PASSES_KEPT, RUNS_CHANGED_EVENT, createAgent, defaultTabHtml, deleteAgent, ensureSeeded, listAgents, listRuns,
  publishAgent, unpublishAgent, updateAgent, type Pass, type ZahtenAgent, type ZahtenRun,
} from "@/lib/zahten/store";
import { isRunning, runAgent } from "@/lib/zahten/runtime";
import { desiredFrom, nextRunAt, setFireHandler, syncSchedules } from "@/lib/zahten/scheduler";
import { TabFrame } from "./AsherPublishedTabRenderer";

type Tab = "builder" | "spec" | "code" | "runs" | "tab";
type Pane = "list" | "detail";
type Scope =
  | { phase: "idle" }
  | { phase: "assessing" }
  | { phase: "clarify"; questions: string[]; answers: string[] }
  | { phase: "ready"; restated: string };

const TABS: { id: Tab; label: string }[] = [
  { id: "builder", label: "builder" },
  { id: "spec", label: "spec" },
  { id: "code", label: "code" },
  { id: "runs", label: "runs" },
  { id: "tab", label: "tab" },
];

const INTERVALS: { minutes: number; label: string }[] = [
  { minutes: 5, label: "5 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 180, label: "3 hours" },
];

const MAX_PASSES_DEFAULT = 3;
const MAX_PASSES_CAP = 6;
const KEY_HINT = "connect a model key in settings → intelligence. shepherd drafts and runs agents from this device with it.";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const label = "text-[10px] font-light tracking-[0.14em] text-muted-foreground/70";
const card = "rounded-xl border border-border/20 bg-card/30 p-4 sm:p-5";
const field = "w-full rounded-lg border border-border/30 bg-background/60 px-3 py-2 text-sm font-extralight text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/50";
const btn = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-light transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const btnPrimary = `${btn} border-foreground/40 bg-foreground/10 text-foreground hover:bg-foreground/20`;
const btnQuiet = `${btn} border-border/30 text-muted-foreground hover:border-foreground/40 hover:text-foreground`;
const btnDanger = `${btn} border-red-500/40 bg-red-500/10 text-foreground hover:bg-red-500/20`;

/** one request can leave the device per call; say where the key lives before the dialog does. */
async function requireModel(): Promise<boolean> {
  const active = await getActiveModel().catch(() => null);
  if (active) return true;
  triggerByokRequired({ source: "asherin.agents", reason: KEY_HINT });
  return false;
}

const AsherZahtenModule = () => {
  const navigate = useNavigate();

  const [agents, setAgents] = useState<ZahtenAgent[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("list");
  const [tab, setTab] = useState<Tab>("builder");
  const [confirmRemove, setConfirmRemove] = useState(false);
  // the v.2 shell owns the primary action slot; outside it the list keeps its own "new" button.
  const [hasShellSlot, setHasShellSlot] = useState(false);
  const [, bump] = useState(0);

  const agentsRef = useRef<ZahtenAgent[]>([]);
  agentsRef.current = agents;
  const active = useMemo(() => agents.find((a) => a.id === activeId) ?? null, [agents, activeId]);

  /* ── load ─────────────────────────────────────────────────────────────── */
  const reload = useCallback(async () => {
    try {
      const rows = await listAgents();
      setAgents(rows);
      setLoadError(null);
    } catch (e) {
      setLoadError(errText(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await ensureSeeded();
        if (cancelled) return;
        setAgents(rows);
        setActiveId((cur) => cur ?? rows[0]?.id ?? null);
      } catch (e) {
        if (!cancelled) setLoadError(errText(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    setHasShellSlot(!!document.getElementById("v2-action-slot"));
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── interval timers: armed from the stored agents, firing while asherin stays open ── */
  useEffect(() => {
    setFireHandler((agentId) => {
      const a = agentsRef.current.find((x) => x.id === agentId);
      if (!a || isRunning(a.id)) return;
      void runAgent(a, a.standing_input, "interval").catch(() => undefined);
    });
    const diff = syncSchedules(desiredFrom(agents));
    if (diff.start.length || diff.stop.length) bump((n) => n + 1);
    // the handler is left in place on unmount on purpose: timers outlive the room, not the tab.
  }, [agents]);

  /* ── per-agent editable state, synced on switch ──────────────────────── */
  const [objective, setObjective] = useState("");
  const [scope, setScope] = useState<Scope>({ phase: "idle" });
  const [passes, setPasses] = useState<Pass[]>([]);
  const [building, setBuilding] = useState(false);
  const [maxPasses, setMaxPasses] = useState(MAX_PASSES_DEFAULT);
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [followUp, setFollowUp] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const [runs, setRuns] = useState<ZahtenRun[]>([]);
  const [runInput, setRunInput] = useState("");
  const [runBusy, setRunBusy] = useState(false);
  const runAbortRef = useRef<AbortController | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);

  const [tabHtml, setTabHtml] = useState("");
  const [tabDirty, setTabDirty] = useState(false);
  const [tabAsk, setTabAsk] = useState("");
  const [tabAskBusy, setTabAskBusy] = useState(false);
  const [tabNotice, setTabNotice] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [tabMode, setTabMode] = useState<"preview" | "html">("preview");

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runAbortRef.current?.abort();
    runAbortRef.current = null;
    setBuilding(false);
    setRunBusy(false);
    setScope({ phase: "idle" });
    setNotice(null);
    setTabNotice(null);
    setFollowUp("");
    setConfirmRemove(false);
    setOpenRun(null);
    const a = agentsRef.current.find((x) => x.id === activeId);
    setObjective(a?.objective ?? "");
    setPasses(a?.passes ?? []);
    setRunInput(a?.standing_input ?? "");
    setTabHtml(a ? (a.tab_html ?? defaultTabHtml(a)) : "");
    setTabDirty(!!a?.tab_html);
    if (activeId) void listRuns(activeId).then(setRuns);
    else setRuns([]);
  }, [activeId]);

  useEffect(() => {
    const onRuns = (e: Event) => {
      const id = (e as CustomEvent<{ agent_id?: string }>).detail?.agent_id;
      if (activeId && (!id || id === activeId)) void listRuns(activeId).then(setRuns);
    };
    window.addEventListener(RUNS_CHANGED_EVENT, onRuns);
    return () => window.removeEventListener(RUNS_CHANGED_EVENT, onRuns);
  }, [activeId]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      runAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (building) logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [passes, building]);

  // the objective and the standing input are saved a moment after typing stops.
  useEffect(() => {
    if (!active || objective === active.objective) return;
    const t = window.setTimeout(() => {
      void updateAgent(active.id, { objective })
        .then((saved) => setAgents((p) => p.map((a) => (a.id === saved.id ? { ...a, objective: saved.objective } : a))))
        .catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(t);
  }, [objective, active]);
  useEffect(() => {
    if (!active || runInput === active.standing_input) return;
    const t = window.setTimeout(() => {
      void updateAgent(active.id, { standing_input: runInput })
        .then((saved) => setAgents((p) => p.map((a) => (a.id === saved.id ? { ...a, standing_input: saved.standing_input } : a))))
        .catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(t);
  }, [runInput, active]);

  const derived = useMemo(() => {
    const text = active?.spec_text ?? "";
    return { steps: parseWorkflowSteps(text), code: extractCode(text), needs: parseNeeds(text) };
  }, [active?.spec_text]);

  /* ── agent list actions ──────────────────────────────────────────────── */
  const newAgent = async () => {
    try {
      const a = await createAgent();
      setAgents((p) => [a, ...p]);
      setActiveId(a.id);
      setPane("detail");
      setTab("builder");
    } catch (e) {
      toast.error(`could not create the agent: ${errText(e)}`);
    }
  };

  const removeActive = async () => {
    if (!active) return;
    try {
      await deleteAgent(active.id);
      const rest = agentsRef.current.filter((a) => a.id !== active.id);
      setAgents(rest);
      setActiveId(rest[0]?.id ?? null);
      setConfirmRemove(false);
      if (!rest.length) setPane("list");
      toast.message("agent removed");
    } catch (e) {
      toast.error(`could not remove the agent: ${errText(e)}`);
    }
  };

  const renameActive = (name: string) => {
    if (!active) return;
    setAgents((p) => p.map((a) => (a.id === active.id ? { ...a, name } : a)));
  };
  const commitName = () => {
    if (!active) return;
    const name = active.name.trim() || "untitled agent";
    if (!active.tab_html) {
      setTabHtml(defaultTabHtml({ ...active, name }));
      setTabDirty(false);
    }
    void updateAgent(active.id, { name }).catch(() => undefined);
  };

  /* ── scope + build ───────────────────────────────────────────────────── */
  const brainContext = async (prompt: string): Promise<string> => {
    try {
      const route = await routeBrainsForPrompt(prompt, { topK: 4, charBudget: 24_000 });
      if (!route || !route.brains.length) return "";
      const blocks = route.brains.map((b) => `### brain — ${b.name} [${b.category}]\n${b.content}`).join("\n\n");
      return `\n\n[operator brains, for context]\n${route.rationale}\n\n${blocks}`;
    } catch {
      return "";
    }
  };

  const assess = async (): Promise<boolean> => {
    if (!active || !objective.trim()) return false;
    if (!(await requireModel())) {
      setNotice({ kind: "info", text: KEY_HINT });
      return false;
    }
    setScope({ phase: "assessing" });
    setNotice(null);
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const { askModel } = await import("@/lib/ai");
      const out = await askModel(`AGENT DESCRIPTION:\n${objective.trim()}`, { system: ASSESSOR_SYSTEM, signal: ctl.signal, maxTokens: 600 });
      const parsed = parseAssessor(out);
      if (parsed.ready === false) {
        const questions = parsed.questions;
        setScope({ phase: "clarify", questions, answers: questions.map(() => "") });
        return false;
      }
      setScope({ phase: "ready", restated: parsed.restated });
      return true;
    } catch (e) {
      if (!ctl.signal.aborted) setNotice({ kind: "error", text: `shepherd could not assess the scope: ${errText(e)}` });
      setScope({ phase: "idle" });
      return false;
    } finally {
      abortRef.current = null;
    }
  };

  const enrichedObjective = (): string => {
    if (scope.phase !== "clarify") return objective.trim();
    const qa = scope.questions.map((q, i) => `q: ${q}\na: ${scope.answers[i]?.trim() || "(no answer — make a defensible assumption)"}`).join("\n\n");
    return `${objective.trim()}\n\n--- clarifications ---\n${qa}`;
  };

  const streamPass = async (history: { role: "user" | "assistant"; content: string }[], n: number, signal: AbortSignal): Promise<string> => {
    const { streamChat } = await import("@/lib/ai");
    const brains = await brainContext(objective);
    let text = "";
    await streamChat({
      messages: [
        { role: "user", content: `[builder doctrine]\n${BUILDER_SYSTEM}${brains}` },
        { role: "assistant", content: "understood." },
        ...history,
      ],
      mode: "code",
      depth: "standard",
      signal,
      onDelta: (d) => {
        text += d;
        setPasses((p) => p.map((pp) => (pp.n === n ? { ...pp, text } : pp)));
      },
      onDone: () => undefined,
    });
    return text;
  };

  /** persist a finished pass as the agent's current spec. */
  const commitPass = async (text: string, allPasses: Pass[]) => {
    if (!active) return;
    const kept = allPasses.slice(-MAX_PASSES_KEPT);
    const patch: Partial<ZahtenAgent> = { spec_text: text, passes: kept, status: active.status === "published" ? "published" : "built", example: false };
    const specName = parseSpecName(text);
    if (specName && (active.name === "untitled agent" || !active.name.trim())) patch.name = specName;
    const specTrigger = parseSpecTrigger(text);
    if (specTrigger && active.trigger.kind === "manual" && specTrigger.kind === "interval") patch.trigger = specTrigger;
    if (!active.tab_html) patch.tab_html = null;
    try {
      const saved = await updateAgent(active.id, patch);
      setAgents((p) => p.map((a) => (a.id === saved.id ? saved : a)));
      if (!saved.tab_html) {
        setTabHtml(defaultTabHtml(saved));
        setTabDirty(false);
      }
    } catch (e) {
      setNotice({ kind: "error", text: `the pass was written but could not be saved on this device: ${errText(e)}` });
    }
  };

  const build = async () => {
    if (!active || !objective.trim() || building) return;
    if (scope.phase === "assessing") return;
    if (scope.phase === "idle") {
      // clear scope → straight into the first pass; questions → wait for answers.
      const ready = await assess();
      if (!ready) return;
    } else if (!(await requireModel())) {
      setNotice({ kind: "info", text: KEY_HINT });
      return;
    }
    setBuilding(true);
    setNotice(null);
    setPasses([]);
    const ctl = new AbortController();
    abortRef.current = ctl;
    const history: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: `AGENT TO BUILD:\n${enrichedObjective()}\n\nwrite pass 1 now. then self-critique and continue until STATUS: COMPLETE.` },
    ];
    let local: Pass[] = [];
    try {
      for (let n = 1; n <= maxPasses; n++) {
        if (ctl.signal.aborted) break;
        local = [...local, { n, status: "running", text: "", started_at: Date.now() }];
        setPasses(local);
        let text = "";
        try {
          text = await streamPass(history, n, ctl.signal);
        } catch (e) {
          if (ctl.signal.aborted) break;
          local = local.map((p) => (p.n === n ? { ...p, status: "error", text: `${p.text}\n\n— shepherd stopped: ${errText(e)}`, ended_at: Date.now() } : p));
          setPasses(local);
          setNotice({ kind: "error", text: `pass ${n} failed: ${errText(e)}` });
          break;
        }
        const status = parseStatus(text);
        const done = status === "complete" || n === maxPasses;
        local = local.map((p) => (p.n === n ? { ...p, status: done ? "complete" : "refining", text, ended_at: Date.now() } : p));
        setPasses(local);
        await commitPass(text, local);
        if (done) {
          setNotice(
            n === maxPasses && status !== "complete"
              ? { kind: "info", text: `stopped at the pass limit (${n}). the spec is saved; refine it below if it needs more.` }
              : { kind: "info", text: `built in ${n} pass${n === 1 ? "" : "es"}. review the spec and code, then run it or publish it as a tab.` },
          );
          break;
        }
        history.push({ role: "assistant", content: text });
        history.push({ role: "user", content: `approved. pass ${n + 1}: harder self-critique, tighter steps, sharper output shape. produce the full improved version and end with the status line.` });
      }
    } finally {
      if (ctl.signal.aborted) {
        local = local.map((p) => (p.status === "running" ? { ...p, status: "error", text: `${p.text}\n\n— stopped by you.`, ended_at: Date.now() } : p));
        setPasses(local);
        const last = [...local].reverse().find((p) => p.status !== "error" && p.text.trim());
        if (last) await commitPass(last.text, local.filter((p) => p.status !== "error"));
      }
      setBuilding(false);
      abortRef.current = null;
    }
  };

  const refine = async () => {
    const instr = followUp.trim();
    if (!active || !instr || building || !active.spec_text) return;
    if (!(await requireModel())) {
      setNotice({ kind: "info", text: KEY_HINT });
      return;
    }
    setFollowUp("");
    setBuilding(true);
    setNotice(null);
    const ctl = new AbortController();
    abortRef.current = ctl;
    const n = (passes[passes.length - 1]?.n ?? 0) + 1;
    const local: Pass[] = [...passes, { n, status: "running", text: "", started_at: Date.now() }];
    setPasses(local);
    const history = [
      { role: "user" as const, content: `AGENT TO BUILD:\n${objective.trim()}` },
      { role: "assistant" as const, content: active.spec_text },
      { role: "user" as const, content: `operator follow-up: ${instr}\n\nproduce the full improved version (spec, workflow, code, test plan) and end with the status line.` },
    ];
    try {
      const text = await streamPass(history, n, ctl.signal);
      const finished = local.map((p) => (p.n === n ? { ...p, status: parseStatus(text) === "complete" ? "complete" : "refining", text, ended_at: Date.now() } : p)) as Pass[];
      setPasses(finished);
      await commitPass(text, finished);
      setNotice({ kind: "info", text: "refinement applied." });
    } catch (e) {
      if (!ctl.signal.aborted) {
        setPasses(local.map((p) => (p.n === n ? { ...p, status: "error", text: `${p.text}\n\n— shepherd stopped: ${errText(e)}`, ended_at: Date.now() } : p)));
        setNotice({ kind: "error", text: `the refinement failed: ${errText(e)}` });
      } else {
        setPasses(passes);
      }
    } finally {
      setBuilding(false);
      abortRef.current = null;
    }
  };

  const stopBuild = () => {
    abortRef.current?.abort();
  };

  /* ── runs ────────────────────────────────────────────────────────────── */
  const runNow = async () => {
    if (!active || runBusy) return;
    if (!active.spec_text.trim()) {
      setNotice({ kind: "info", text: "build the agent first; there is no spec to run." });
      setTab("builder");
      return;
    }
    if (!(await requireModel())) return;
    setRunBusy(true);
    const ctl = new AbortController();
    runAbortRef.current = ctl;
    try {
      const run = await runAgent(active, runInput, "manual", ctl.signal);
      setOpenRun(run.id);
      if (run.status === "failed") toast.error(`the run failed: ${run.error}`);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setRunBusy(false);
      runAbortRef.current = null;
    }
  };

  const setTrigger = async (t: Trigger) => {
    if (!active) return;
    try {
      const saved = await updateAgent(active.id, { trigger: t });
      setAgents((p) => p.map((a) => (a.id === saved.id ? saved : a)));
    } catch (e) {
      toast.error(`could not save the schedule: ${errText(e)}`);
    }
  };

  /* ── tab ─────────────────────────────────────────────────────────────── */
  const resetTab = () => {
    if (!active) return;
    setTabHtml(defaultTabHtml(active));
    setTabDirty(false);
    setTabNotice(null);
    void updateAgent(active.id, { tab_html: null }).catch(() => undefined);
  };

  const askTab = async () => {
    const instr = tabAsk.trim();
    if (!active || !instr || tabAskBusy) return;
    if (!(await requireModel())) return;
    setTabAsk("");
    setTabAskBusy(true);
    setTabNotice(null);
    try {
      const { askModel } = await import("@/lib/ai");
      const out = await askModel(`CURRENT PAGE:\n${tabHtml}\n\nCHANGE REQUESTED:\n${instr}`, { system: TAB_EDITOR_SYSTEM, maxTokens: 8000 });
      let html = out.replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
      if (!/<html[\s>]/i.test(html)) throw new Error("shepherd did not return a whole page. try a smaller change.");
      if (!readTabAgentId(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}<meta name="zahten-agent" content="${active.id}">`);
      html = ensureCsp(html);
      setTabHtml(html);
      setTabDirty(true);
      await updateAgent(active.id, { tab_html: html });
      setTabNotice("page updated. it is saved with the agent; publish to put it in the sidebar.");
    } catch (e) {
      setTabNotice(`could not change the page: ${errText(e)}`);
    } finally {
      setTabAskBusy(false);
    }
  };

  const publish = async () => {
    if (!active || publishing) return;
    if (!active.spec_text.trim()) {
      setTabNotice("build the agent first; a tab needs a spec to run.");
      return;
    }
    setPublishing(true);
    setTabNotice(null);
    try {
      const html = ensureCsp(tabHtml);
      const id = await publishAgent({ ...active, name: active.name.trim() || "agent" }, html);
      setAgents((p) => p.map((a) => (a.id === active.id ? { ...a, published_id: id, status: "published", tab_html: html } : a)));
      setTabNotice(active.published_id ? "tab updated." : "published. it is in the sidebar under agents.");
    } catch (e) {
      setTabNotice(`could not publish: ${errText(e)}`);
    } finally {
      setPublishing(false);
    }
  };

  const unpublish = async () => {
    if (!active?.published_id) return;
    try {
      await unpublishAgent(active.id, active.published_id);
      setAgents((p) => p.map((a) => (a.id === active.id ? { ...a, published_id: null, status: "built" } : a)));
      setTabNotice("tab removed from the sidebar. the agent is still here.");
    } catch (e) {
      setTabNotice(`could not unpublish: ${errText(e)}`);
    }
  };

  const openTab = () => {
    if (!active?.published_id) return;
    navigate(`/dashboard/agent:${active.published_id}`);
  };

  /* ── render ──────────────────────────────────────────────────────────── */
  const statusDot = (a: ZahtenAgent) =>
    a.status === "published" ? "bg-emerald-400/90" : a.status === "built" ? "bg-sky-400/80" : "bg-muted-foreground/40";

  const canBuild = !!active && !!objective.trim() && !building && scope.phase !== "assessing";

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[11px] font-light text-muted-foreground/70">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> opening your agents…
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-foreground">
      <V2Action>
        <button onClick={newAgent} className={v2ActionClass}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> new agent
        </button>
      </V2Action>

      {/* agents list — the whole screen on a phone, a rail on wider screens */}
      <aside className={`${pane === "list" ? "flex" : "hidden"} w-full min-w-0 flex-col border-border/15 bg-card/20 md:flex md:w-64 md:flex-shrink-0 md:border-r`}>
        <div className="flex items-center justify-between border-b border-border/15 px-4 py-3">
          <div>
            <p className="text-sm font-light text-foreground">agents</p>
            <p className="text-[10px] font-extralight text-muted-foreground/60">built and run on this device</p>
          </div>
          {!hasShellSlot && (
            <button onClick={newAgent} className={btnQuiet}>
              <Plus className="h-3 w-3" strokeWidth={1.5} /> new
            </button>
          )}
        </div>
        {loadError && (
          <div className="m-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-[11px] font-light text-foreground/85">
            could not open the agent store on this device: {loadError}
            <button onClick={() => void reload()} className={`${btnQuiet} mt-2`}>
              <RefreshCw className="h-3 w-3" /> try again
            </button>
          </div>
        )}
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 pt-2">
          {agents.length === 0 && !loadError && (
            <p className="px-2 py-6 text-center text-[11px] font-extralight text-muted-foreground/60">no agents yet. press new to describe one.</p>
          )}
          {agents.map((a) => {
            const isActive = a.id === activeId;
            return (
              <button
                key={a.id}
                onClick={() => {
                  setActiveId(a.id);
                  setPane("detail");
                }}
                className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${isActive ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statusDot(a)}`} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-light">{a.name}</span>
                  {a.example && <span className="flex-shrink-0 rounded border border-border/30 px-1 text-[9px] text-muted-foreground/70">example</span>}
                  <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground/40 md:hidden" />
                </div>
                <div className="ml-3.5 mt-0.5 truncate text-[10px] font-extralight text-muted-foreground/55">
                  {a.status} · {triggerLabel(a.trigger)}
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-t border-border/15 px-4 py-3 text-[10px] font-extralight leading-relaxed text-muted-foreground/60">
          an agent here is shepherd following a workflow you approved. it runs when you press run, or on an interval while asherin stays open. nothing fires from a closed tab.
        </div>
      </aside>

      {/* detail */}
      <div className={`${pane === "detail" ? "flex" : "hidden"} min-w-0 flex-1 flex-col overflow-hidden md:flex`}>
        {!active ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-[11px] font-extralight text-muted-foreground/60">
            pick an agent, or press new to describe one.
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-2 border-b border-border/15 px-4 py-3 sm:px-6">
              <button onClick={() => setPane("list")} className={`${btnQuiet} md:hidden`} aria-label="back to agents">
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <input
                value={active.name}
                onChange={(e) => renameActive(e.target.value)}
                onBlur={commitName}
                aria-label="agent name"
                className="min-w-0 flex-1 border-b border-transparent bg-transparent px-1 text-base font-extralight text-foreground focus:border-border/40 focus:outline-none"
              />
              <span className="rounded-full border border-border/30 px-2 py-0.5 text-[10px] font-light text-muted-foreground/70">{active.status}</span>
              {active.example && <span className="rounded-full border border-border/30 px-2 py-0.5 text-[10px] font-light text-muted-foreground/70">example</span>}
              {confirmRemove ? (
                <span className="flex items-center gap-1.5 text-[11px] font-light text-muted-foreground">
                  remove this agent{active.published_id ? " and its tab" : ""}?
                  <button onClick={removeActive} className={btnDanger}>yes, remove</button>
                  <button onClick={() => setConfirmRemove(false)} className={btnQuiet}>keep</button>
                </span>
              ) : (
                <button onClick={() => setConfirmRemove(true)} className={btnQuiet} aria-label="remove agent" title="remove agent">
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              )}
            </header>

            <div className="flex gap-1 overflow-x-auto border-b border-border/15 px-4 sm:px-6" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-[11px] font-light transition-colors ${tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {t.label}
                  {t.id === "runs" && runs.length > 0 && <span className="ml-1 text-muted-foreground/50">{runs.length}</span>}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-5xl space-y-4 px-4 py-4 sm:px-6 sm:py-6">
                {/* ── builder ── */}
                {tab === "builder" && (
                  <>
                    <section className={card}>
                      <p className={label}>1 · describe the agent</p>
                      <textarea
                        value={objective}
                        onChange={(e) => {
                          setObjective(e.target.value);
                          if (scope.phase !== "idle") setScope({ phase: "idle" });
                        }}
                        disabled={building || scope.phase === "assessing"}
                        rows={4}
                        placeholder="what should it do, over what input, and what should come out? e.g. take pasted support emails and sort them into bug / billing / question with a one-line reply draft each."
                        className={`${field} mt-2 resize-none disabled:opacity-60`}
                      />
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-[11px] font-light text-muted-foreground/80">
                          passes
                          <input
                            type="number"
                            min={1}
                            max={MAX_PASSES_CAP}
                            value={maxPasses}
                            onChange={(e) => setMaxPasses(Math.max(1, Math.min(MAX_PASSES_CAP, parseInt(e.target.value || "1", 10) || 1)))}
                            disabled={building}
                            className="w-14 rounded border border-border/30 bg-background/60 px-2 py-1 text-foreground/90 focus:border-foreground/60 focus:outline-none"
                          />
                          <span className="text-muted-foreground/50">each pass is one model call</span>
                        </label>
                        <div className="flex items-center gap-2">
                          {building ? (
                            <button onClick={stopBuild} className={btnDanger}>
                              <Square className="h-3 w-3" strokeWidth={1.5} /> stop
                            </button>
                          ) : (
                            <>
                              {scope.phase !== "idle" && (
                                <button onClick={() => setScope({ phase: "idle" })} className={btnQuiet}>reset scope</button>
                              )}
                              <button onClick={build} disabled={!canBuild} className={btnPrimary}>
                                {scope.phase === "assessing" ? (
                                  <><Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} /> assessing scope</>
                                ) : scope.phase === "idle" ? (
                                  <><Play className="h-3 w-3" strokeWidth={1.5} /> assess and build</>
                                ) : (
                                  <><Play className="h-3 w-3" strokeWidth={1.5} /> build with shepherd</>
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <p className="mt-3 text-[11px] font-extralight leading-relaxed text-muted-foreground/70">
                        shepherd first checks the description for what is missing, then writes the spec, workflow, portable code and a test plan, self-critiquing each pass. it uses the model key saved in settings → intelligence; each pass is one call from this device.
                      </p>
                    </section>

                    {scope.phase === "clarify" && (
                      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
                        <p className={label}>2 · a few things shepherd needs to know</p>
                        <p className="mt-1 text-[11px] font-extralight text-muted-foreground/80">answer what you can; anything left blank becomes a stated assumption.</p>
                        <div className="mt-3 space-y-3">
                          {scope.questions.map((q, i) => (
                            <div key={i}>
                              <p className="text-[12px] font-light text-foreground/85">{i + 1}. {q}</p>
                              <input
                                value={scope.answers[i]}
                                onChange={(e) => {
                                  const answers = [...scope.answers];
                                  answers[i] = e.target.value;
                                  setScope({ ...scope, answers });
                                }}
                                placeholder="your answer (optional)"
                                className={`${field} mt-1`}
                              />
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {scope.phase === "ready" && (
                      <section className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" strokeWidth={1.5} />
                        <div>
                          <p className={label}>2 · scope confirmed</p>
                          <p className="mt-1 text-[12px] font-extralight leading-relaxed text-foreground/85">{scope.restated}</p>
                        </div>
                      </section>
                    )}

                    {notice && (
                      <div
                        role="status"
                        className={`flex items-start gap-2 rounded-lg border p-3 text-[11px] font-light leading-relaxed ${notice.kind === "error" ? "border-red-500/30 bg-red-500/5 text-foreground/85" : "border-border/25 bg-background/40 text-muted-foreground"}`}
                      >
                        {notice.kind === "error" && <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" strokeWidth={1.5} />}
                        <span className="min-w-0 break-words">{notice.text}</span>
                      </div>
                    )}

                    {passes.length > 0 && (
                      <section className="space-y-3">
                        <p className={label}>3 · passes</p>
                        {passes.map((p) => (
                          <div key={p.n} className="rounded-xl border border-border/20 bg-background/40 p-4">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-[11px] font-light text-foreground">
                                {p.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-foreground/70" strokeWidth={1.5} />}
                                {p.status === "refining" && <RefreshCw className="h-3 w-3 text-foreground/70" strokeWidth={1.5} />}
                                {p.status === "complete" && <CheckCircle2 className="h-3 w-3 text-foreground/90" strokeWidth={1.5} />}
                                {p.status === "error" && <AlertCircle className="h-3 w-3 text-red-400" strokeWidth={1.5} />}
                                pass {p.n} · {p.status}
                              </div>
                              {p.ended_at && <span className="text-[10px] font-light text-muted-foreground/60">{((p.ended_at - p.started_at) / 1000).toFixed(1)}s</span>}
                            </div>
                            <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/85">
                              {p.text || (p.status === "running" ? "…" : "")}
                            </pre>
                          </div>
                        ))}
                        <div ref={logEndRef} />
                      </section>
                    )}

                    {active.spec_text && !building && (
                      <section className={card}>
                        <p className={label}>4 · refine</p>
                        <div className="mt-2 flex items-end gap-2">
                          <textarea
                            value={followUp}
                            onChange={(e) => setFollowUp(e.target.value)}
                            rows={2}
                            placeholder="e.g. output as a table · add a step that flags duplicates · make the input a csv"
                            className={`${field} resize-none`}
                          />
                          <button onClick={refine} disabled={!followUp.trim()} className={btnPrimary} aria-label="send refinement">
                            <Send className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/15 pt-3">
                          <button onClick={() => setTab("runs")} className={btnQuiet}><Play className="h-3 w-3" strokeWidth={1.5} /> run it</button>
                          <button onClick={() => setTab("tab")} className={btnQuiet}><Rocket className="h-3 w-3" strokeWidth={1.5} /> publish as a tab</button>
                        </div>
                      </section>
                    )}
                  </>
                )}

                {/* ── spec ── */}
                {tab === "spec" && (
                  <>
                    {!active.spec_text ? (
                      <section className={card}>
                        <p className="text-[11px] font-extralight text-muted-foreground/70">no spec yet. build the agent in the builder tab.</p>
                      </section>
                    ) : (
                      <>
                        <section className={card}>
                          <p className={label}>workflow · {triggerLabel(active.trigger)}</p>
                          {derived.steps.length === 0 ? (
                            <p className="mt-2 text-[11px] font-extralight text-muted-foreground/70">shepherd wrote no numbered workflow steps in this pass. refine it and ask for a numbered workflow.</p>
                          ) : (
                            <ol className="mt-3 space-y-1.5">
                              {derived.steps.map((s) => (
                                <li key={s.n} className="flex items-start gap-3 border-b border-border/10 pb-1.5 text-[12px] font-light text-foreground/90 last:border-0">
                                  <span className="w-6 flex-shrink-0 font-mono text-[10px] text-muted-foreground/60">{String(s.n).padStart(2, "0")}</span>
                                  <span className="min-w-0 break-words">{s.label}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                          {derived.needs.length > 0 && (
                            <p className="mt-3 text-[11px] font-light leading-relaxed text-amber-300/80">
                              needs outside this device: {derived.needs.join(", ")}. this device cannot reach them; a run will reason over your input and mark those steps as not reachable.
                            </p>
                          )}
                        </section>
                        <section className={card}>
                          <p className={label}>full spec · latest pass</p>
                          <pre className="mt-2 max-h-[70vh] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/85">{active.spec_text}</pre>
                        </section>
                      </>
                    )}
                  </>
                )}

                {/* ── code ── */}
                {tab === "code" && (
                  <section className={card}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={label}>portable code · typescript</p>
                      {derived.code && (
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(derived.code).then(() => toast.message("code copied")).catch(() => toast.error("could not copy"));
                          }}
                          className={btnQuiet}
                        >
                          copy
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] font-extralight leading-relaxed text-muted-foreground/70">
                      a module you can take anywhere. this device does not execute it; a run here is shepherd following the workflow over your input.
                    </p>
                    {derived.code ? (
                      <pre className="mt-3 max-h-[70vh] overflow-auto rounded-lg border border-border/20 bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/85">{derived.code}</pre>
                    ) : (
                      <p className="mt-3 text-[11px] font-extralight text-muted-foreground/70">{active.spec_text ? "this pass has no code block. refine and ask for the code." : "build the agent first."}</p>
                    )}
                  </section>
                )}

                {/* ── runs ── */}
                {tab === "runs" && (
                  <>
                    <section className={card}>
                      <p className={label}>input</p>
                      <textarea
                        value={runInput}
                        onChange={(e) => setRunInput(e.target.value)}
                        rows={5}
                        placeholder="paste what the agent works on. saved with the agent; every run, manual or on the interval, starts from it."
                        className={`${field} mt-2 resize-y`}
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {runBusy ? (
                          <button onClick={() => runAbortRef.current?.abort()} className={btnDanger}>
                            <Square className="h-3 w-3" strokeWidth={1.5} /> stop
                          </button>
                        ) : (
                          <button onClick={runNow} disabled={!active.spec_text.trim()} className={btnPrimary}>
                            <Play className="h-3 w-3" strokeWidth={1.5} /> run now
                          </button>
                        )}
                        <span className="text-[11px] font-extralight text-muted-foreground/60">
                          {active.spec_text.trim() ? "one model call; log and output are kept on this device." : "build the agent first."}
                        </span>
                      </div>
                    </section>

                    <section className={card}>
                      <p className={label}>interval</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button onClick={() => setTrigger({ kind: "manual" })} className={`${btnQuiet} ${active.trigger.kind === "manual" ? "border-foreground/50 bg-foreground/5 text-foreground" : ""}`}>off</button>
                        {INTERVALS.map((o) => (
                          <button
                            key={o.minutes}
                            onClick={() => setTrigger({ kind: "interval", minutes: clampInterval(o.minutes) })}
                            className={`${btnQuiet} ${active.trigger.kind === "interval" && active.trigger.minutes === o.minutes ? "border-foreground/50 bg-foreground/5 text-foreground" : ""}`}
                          >
                            every {o.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-3 text-[11px] font-extralight leading-relaxed text-muted-foreground/70">
                        {active.trigger.kind === "interval"
                          ? `runs every ${active.trigger.minutes} minutes from the input above while asherin stays open in this browser tab${nextRunAt(active.id) ? ` · next at ${new Date(nextRunAt(active.id) as number).toLocaleTimeString()}` : active.spec_text.trim() ? "" : " · armed once the agent is built"}. it stops when the tab closes and arms again the next time you open this room.`
                          : "a browser cannot fire from a closed tab, so there is no cron or webhook here. an interval runs while this asherin tab is open."}
                      </p>
                    </section>

                    <section className={card}>
                      <p className={label}>history · newest first</p>
                      {runs.length === 0 ? (
                        <p className="mt-2 text-[11px] font-extralight text-muted-foreground/70">no runs yet.</p>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {runs.map((r) => {
                            const open = openRun === r.id;
                            return (
                              <div key={r.id} className="rounded-lg border border-border/20 bg-background/40">
                                <button onClick={() => setOpenRun(open ? null : r.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
                                  {r.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-foreground/70" />}
                                  {r.status === "ok" && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                                  {r.status === "failed" && <AlertCircle className="h-3 w-3 text-red-400" />}
                                  <span className="min-w-0 flex-1 truncate text-[11px] font-light text-foreground/85">
                                    {new Date(r.started_at).toLocaleString()} · {r.source}
                                    {r.ended_at ? ` · ${((Date.parse(r.ended_at) - Date.parse(r.started_at)) / 1000).toFixed(1)}s` : ""}
                                  </span>
                                  <ChevronRight className={`h-3 w-3 text-muted-foreground/50 transition-transform ${open ? "rotate-90" : ""}`} />
                                </button>
                                {open && (
                                  <div className="space-y-2 border-t border-border/15 px-3 py-2">
                                    {r.log.length > 0 && (
                                      <pre className="whitespace-pre-wrap break-words font-mono text-[10px] text-muted-foreground/80">{r.log.join("\n")}</pre>
                                    )}
                                    {r.status === "failed" ? (
                                      <p className="text-[11px] font-light text-red-300/90">{r.error || "the run failed."}</p>
                                    ) : (
                                      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/85">{r.output || (r.status === "running" ? "…" : "(empty output)")}</pre>
                                    )}
                                    {r.output && (
                                      <button
                                        onClick={() => navigator.clipboard?.writeText(r.output).then(() => toast.message("output copied")).catch(() => toast.error("could not copy"))}
                                        className={btnQuiet}
                                      >
                                        copy output
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </>
                )}

                {/* ── tab ── */}
                {tab === "tab" && (
                  <>
                    <section className={card}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className={label}>published tab</p>
                          <p className="mt-1 text-[11px] font-extralight leading-relaxed text-muted-foreground/70">
                            a page of your own inside asherin, listed in the sidebar under agents. it runs the agent from its own run button. sandboxed: no network, only a message to asherin.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {active.published_id && (
                            <>
                              <button onClick={openTab} className={btnQuiet}><ExternalLink className="h-3 w-3" strokeWidth={1.5} /> open tab</button>
                              <button onClick={unpublish} className={btnQuiet}>unpublish</button>
                            </>
                          )}
                          <button onClick={publish} disabled={publishing || !active.spec_text.trim()} className={btnPrimary}>
                            {publishing ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} /> : <Rocket className="h-3 w-3" strokeWidth={1.5} />}
                            {active.published_id ? "update tab" : "publish tab"}
                          </button>
                        </div>
                      </div>
                      {tabNotice && <p role="status" className="mt-3 text-[11px] font-light text-foreground/85">{tabNotice}</p>}
                      {!active.spec_text.trim() && <p className="mt-3 text-[11px] font-extralight text-muted-foreground/70">build the agent first; the page is written from its spec.</p>}
                    </section>

                    {active.spec_text.trim() && (
                      <section className="overflow-hidden rounded-xl border border-border/20 bg-card/30">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/15 px-3 py-2">
                          <div className="inline-flex overflow-hidden rounded-md border border-border/30">
                            <button onClick={() => setTabMode("preview")} className={`px-3 py-1.5 text-[11px] font-light ${tabMode === "preview" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>preview</button>
                            <button onClick={() => setTabMode("html")} className={`border-l border-border/30 px-3 py-1.5 text-[11px] font-light ${tabMode === "html" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>html</button>
                          </div>
                          <div className="flex items-center gap-2">
                            {tabDirty && <span className="text-[10px] font-light text-amber-300/80">edited</span>}
                            <button onClick={resetTab} className={btnQuiet}>reset to default page</button>
                          </div>
                        </div>
                        <div className="h-[60vh] min-h-[360px]">
                          {tabMode === "preview" ? (
                            <TabFrame html={tabHtml} agentId={active.id} title={`${active.name} preview`} className="h-full w-full border-0 bg-background" />
                          ) : (
                            <textarea
                              value={tabHtml}
                              onChange={(e) => {
                                setTabHtml(e.target.value);
                                setTabDirty(true);
                              }}
                              onBlur={() => void updateAgent(active.id, { tab_html: tabHtml }).catch(() => undefined)}
                              spellCheck={false}
                              aria-label="tab html"
                              className="h-full w-full resize-none bg-background/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground focus:outline-none"
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2 border-t border-border/15 p-2">
                          <input
                            value={tabAsk}
                            onChange={(e) => setTabAsk(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void askTab();
                              }
                            }}
                            disabled={tabAskBusy}
                            placeholder="ask shepherd to change the page, e.g. show the output as a table"
                            className={`${field} py-1.5 text-[12px]`}
                          />
                          <button onClick={askTab} disabled={tabAskBusy || !tabAsk.trim()} className={btnQuiet} aria-label="ask shepherd">
                            {tabAskBusy ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} /> : <Send className="h-3 w-3" strokeWidth={1.5} />}
                          </button>
                        </div>
                      </section>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AsherZahtenModule;
