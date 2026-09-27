import { useEffect, useRef, useState } from "react";
import {
  Workflow, Activity, Clock, Layers, Radio, Shield, Database, Cpu, GitBranch,
  Terminal, ExternalLink, ChevronRight, Zap, Lock, AlertCircle, AlertTriangle,
  Play, Square, RefreshCw, CheckCircle2, Loader2, FileLock2, Satellite, Users,
  Eye, Crosshair, Globe, Server, Fingerprint, Siren, Trash2, ShieldAlert,
  Building2, Network, Radar, Award, KeyRound, Rocket, Send, Sparkles, GitFork, Package,
  Paperclip, Image as ImageIcon, FileArchive, Link2, X as XIcon, ShieldCheck,
} from "lucide-react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { getActiveIntelMapByok } from "@/lib/intelMapByok";
import { routeBrainsForPrompt } from "@/lib/asherBrainRouter";
import { toast } from "sonner";
import { isOwnerEmail } from "@/lib/adminEmail";

/**
 * ZAHTEN — House of Asher
 * Hardened Trigger.dev fork → classified-ready intelligence operations console.
 *
 * Two halves:
 *  1) AUTONOMOUS MISSION CONSOLE (top) — operator types ONE prompt and the
 *     engine self-iterates: drafts → critiques → refines → auto-approves
 *     until it emits MISSION_COMPLETE or hits the iteration cap. No further
 *     typing required.
 *  2) GOVERNMENT/INTELLIGENCE CAPABILITY MATRIX (below) — classification
 *     system, air-gap mode, immutable audit, OSINT/SIGINT/HUMINT/GEOINT
 *     templates, emergency protocols, multi-tenant isolation, RTOC,
 *     gov-system integrations, biometric auth, deployment topology.
 *
 * AI: routes through `asher-ai` (Gemini-only, admin GEMINI_API_KEY or user BYOK).
 * No Lovable AI Gateway. Per ASHER DASHBOARD AI policy.
 */

const REPO_URL = "https://github.com/ZorakCorp/project---zahten-";
const MAX_ITERATIONS_DEFAULT = 8;

// ───────────────────────── Mission Console types ─────────────────────────

type Pass = {
  n: number;
  status: "running" | "refining" | "complete" | "error";
  text: string;
  startedAt: number;
  endedAt?: number;
};

const ORCHESTRATOR_SYSTEM = `You are ZAHTEN AGENT BUILDER — an autonomous engine that designs, scaffolds and hardens production-grade automated agents (Trigger.dev-style: durable, retryable, observable, schedulable).

OPERATING DOCTRINE:
1. The operator gives ONE agent objective. By this point the scope is sufficient (the scope assessor already ran). Do NOT ask further questions.
2. Each pass MUST produce the FULL current best version of the agent specification AND its working code (not a diff).
3. After producing output, SILENTLY self-critique: missing triggers, weak retry logic, unhandled edge cases, missing observability, shallow tool integration, security gaps. Then produce an improved full revision.
4. Keep iterating until the agent is genuinely production-grade and could ship to a Trigger.dev deployment as-is.

OUTPUT CONTRACT (every single pass) — use these exact bold sections in this order:

**PASS N — <one-line summary of this pass's improvement>**

**AGENT SPEC**
- Name: <slug>
- Purpose: <one sentence>
- Trigger: <event | schedule(cron) | webhook | manual>
- Schedule: <cron or "n/a">
- Inputs: <typed payload schema>
- Outputs: <typed result schema>
- Tools / Integrations: <list>
- Secrets required: <list, or "none">
- Concurrency / queue: <rule>
- Retry policy: <attempts, backoff>
- Idempotency key: <strategy>
- Observability: <logs, metrics, alerts>

**WORKFLOW** (numbered steps, each step names the tool, inputs, outputs, failure mode)

**CODE** (one fenced \`\`\`ts block, complete Trigger.dev v3 task definition: \`task({ id, run })\`, all imports, typed payload, retry/queue config, structured logger calls, error handling)

**TEST PLAN** (table: scenario | input | expected | failure mode covered)

End the message with EXACTLY one of these sentinel lines on its own:
    STATUS: REFINING — <one-sentence reason why another pass is needed>
    STATUS: MISSION_COMPLETE — <one-sentence reason this agent is now production-grade>

Voice: Senior staff engineer. Surgical. Direct. No filler. No "Certainly".`;

const SCOPE_ASSESSOR_SYSTEM = `You are ZAHTEN SCOPE ASSESSOR. Your only job is to decide whether an agent-build prompt has enough information to produce a production-grade automated agent without guessing core decisions.

Required signal (must be inferable from the prompt):
- What the agent does (action verb + target system)
- When it runs (trigger: event / schedule / webhook / manual)
- Where data comes from and where results go
- Any external services / APIs / credentials involved
- Success criteria or expected output shape

Respond with ONE of these two formats and nothing else:

READY
<one short sentence restating the agent in your own words>

or

CLARIFY
1. <specific question>
2. <specific question>
3. <specific question>
(2–5 questions max, each one concrete and answerable in one line. Never ask vague "tell me more" questions.)`;

function parseStatus(text: string): "refining" | "complete" | null {
  const m = text.match(/STATUS:\s*(REFINING|MISSION_COMPLETE)/i);
  if (!m) return null;
  return m[1].toUpperCase() === "MISSION_COMPLETE" ? "complete" : "refining";
}

// ──────────────────────── Capability matrix data ────────────────────────

const PILLARS = [
  { icon: Clock,    label: "Durability",      desc: "Long-running tasks, retries, idempotency, checkpointing — operations that cannot vanish mid-flight." },
  { icon: Activity, label: "Observability",   desc: "Traces, logs, run metadata surfaced like you actually operate the thing." },
  { icon: Shield,   label: "Operator Posture", desc: "Baseline HTTP hardening, X-Request-Id correlation, structured audit hooks." },
  { icon: Lock,     label: "Self-Sovereign",  desc: "Self-host, extend the webapp & workers, keep your stack on your metal." },
];

const CAPABILITIES = [
  { icon: Workflow,  label: "Workflows",  detail: "Compose LLM steps, tools, and human-in-the-loop pauses." },
  { icon: Layers,    label: "Queues",     detail: "Concurrency rules that match how your org runs work." },
  { icon: Radio,     label: "Realtime",   detail: "Subscribe to runs, stream outputs — no polling." },
  { icon: GitBranch, label: "Schedules",  detail: "Durable cron that survives deploys and reality." },
  { icon: Cpu,       label: "Extensions", detail: "Browsers, FFmpeg, sidecars — the boring stuff." },
  { icon: Database,  label: "Audit",      detail: "Structured security audit signals on every request." },
];

const CLASSIFICATIONS = [
  { tier: "UNCLASSIFIED", desc: "Public release authorised." },
  { tier: "CUI",          desc: "Controlled Unclassified Information — handling required." },
  { tier: "CONFIDENTIAL", desc: "Damage to national security if disclosed." },
  { tier: "SECRET",       desc: "Serious damage if disclosed. Default operating tier." },
  { tier: "TOP SECRET",   desc: "Exceptionally grave damage." },
  { tier: "TS//SCI",      desc: "Sensitive Compartmented Information. Compartments enforced (HUMINT, SIGINT, GEOINT)." },
];

const INTEL_DISCIPLINES = [
  { icon: Globe,    label: "OSINT",  detail: "Social monitor, entity extraction, social-graph build, sentiment, timeline reconstruction." },
  { icon: Radar,    label: "SIGINT", detail: "Comms intercept analysis, metadata extraction, pattern matching, geolocation triangulation." },
  { icon: Users,    label: "HUMINT", detail: "Source debriefing, credibility scoring, cross-referencing, gap analysis, collection tasking." },
  { icon: Satellite,label: "GEOINT", detail: "Multi-sensor satellite (optical/SAR/IR), change detection, object detection, activity patterns." },
  { icon: Crosshair,label: "IMINT",  detail: "Imagery intelligence fusion across discipline outputs into a single threat board." },
  { icon: Eye,      label: "Predictive", detail: "Asherin forecast engine — 7–30 day windows, confidence-thresholded courses of action." },
];

const COMPLIANCE = [
  { std: "FIPS 140-2",   req: "Validated cryptographic modules",      impl: "HSM integration, AES-256-GCM at rest, TLS 1.3 mTLS in transit" },
  { std: "FedRAMP High", req: "Federal cloud security baseline",      impl: "Multi-zone defence, segmented VLANs, WORM audit storage" },
  { std: "NIST 800-53",  req: "Security & privacy controls",          impl: "Full control mapping with continuous attestation hooks" },
  { std: "DoD IL-6",     req: "Classified data handling",             impl: "Classification system, compartments, declassification workflow" },
  { std: "CJIS",         req: "Criminal-justice information services", impl: "Audit chain, dual approval on export, biometric MFA" },
  { std: "ITAR",         req: "Export control",                       impl: "Air-gap deployment, sneakernet ingress with GPG verification" },
];

const EMERGENCY = [
  { icon: Siren,      label: "Kill Switch",     detail: "Two senior officials → halt all workflows, sever external links, hardware-lock the host." },
  { icon: Trash2,     label: "Data Purge",      detail: "Three-officer rule → cryptographic erasure + DoD 5220.22-M 7-pass overwrite + physical-media alert." },
  { icon: ShieldAlert,label: "Breach Response", detail: "Auto-isolate, preserve forensics, damage assessment, stakeholder notification, recovery loop." },
];

const GOV_INTEGRATIONS = [
  { name: "JWICS",   tier: "TOP SECRET",      kind: "Secure gateway" },
  { name: "SIPRNet", tier: "SECRET",          kind: "Secure gateway" },
  { name: "NIPRNet", tier: "UNCLASSIFIED",    kind: "HTTPS" },
  { name: "TIDE",    tier: "SECRET",          kind: "Oracle RAC" },
  { name: "DCGS",    tier: "TOP SECRET//SI",  kind: "Message queue" },
  { name: "ICREACH", tier: "TOP SECRET//SI",  kind: "Mutual-TLS API" },
];

// ───────────────────────────── Component ─────────────────────────────

type ScopeState =
  | { phase: "idle" }
  | { phase: "assessing" }
  | { phase: "clarify"; questions: string[]; answers: string[] }
  | { phase: "ready"; restated: string };

type AgentRecord = {
  id: string;
  name: string;
  status: "draft" | "ready" | "scheduled" | "paused" | "live";
  trigger: string;
  lastRun?: string;
  passes: Pass[];
  objective: string;
  deployedAt?: number;
  liveRuns?: LiveRun[];
  secretValues?: Record<string, string>;
  publishedAgentId?: string; // row id in asher_agents — used so re-publish UPDATES the same tab
};

type LiveRun = {
  id: string;
  startedAt: number;
  endedAt?: number;
  status: "running" | "ok" | "failed";
  log: string[];
};

type ViewTab = "builder" | "workflow" | "runs" | "code" | "preview" | "schedule" | "compliance" | "admin";
type AdminAgentRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  visibility: string;
  status: string;
  owner_id: string;
  install_count: number;
  version: number;
  created_at: string;
  metadata: any;
};

const STARTER_AGENTS: AgentRecord[] = [
  { id: "agent-001", name: "GitHub Bug Triage", status: "scheduled", trigger: "cron: 0 7 * * *", lastRun: "2h ago", passes: [], objective: "Pull new GitHub issues labelled bug, summarise them, post digest to Slack #eng-triage." },
  { id: "agent-002", name: "OSINT Watchdog",    status: "ready",     trigger: "webhook",        lastRun: "—",      passes: [], objective: "Watch a list of news domains for keyword mentions and emit structured alerts." },
  { id: "agent-003", name: "Invoice Reconciler",status: "draft",     trigger: "manual",         lastRun: "—",      passes: [], objective: "" },
];

// Parse "Secrets required:" line from pass text → array of secret names
function parseRequiredSecrets(text: string): string[] {
  if (!text) return [];
  const m = text.match(/Secrets?\s*required\s*[:\-]\s*([^\n]+)/i);
  if (!m) return [];
  const raw = m[1].trim();
  if (/^(none|n\/?a|—|-)$/i.test(raw)) return [];
  return raw.split(/[,;]| and /i).map(s => s.replace(/[`*<>]/g, "").trim()).filter(s => s && s.length < 60).slice(0, 12);
}

// Parse numbered WORKFLOW steps from pass text → array of short labels
function parseWorkflowSteps(text: string): { n: number; label: string }[] {
  if (!text) return [];
  const wfMatch = text.match(/\*\*WORKFLOW\*\*([\s\S]*?)(?:\*\*CODE\*\*|\*\*TEST PLAN\*\*|$)/i);
  const block = wfMatch ? wfMatch[1] : text;
  const steps: { n: number; label: string }[] = [];
  const re = /^\s*(\d+)[.)]\s+(.+)$/gm;
  let m;
  while ((m = re.exec(block)) !== null) {
    const label = m[2].split(/[—\-:|]/)[0].replace(/\*/g, "").trim().slice(0, 60);
    if (label) steps.push({ n: parseInt(m[1]), label });
    if (steps.length >= 12) break;
  }
  return steps;
}

const ZAHTEN_AGENTS_KEY = "zahten.agents.v1";
const ZAHTEN_ACTIVE_KEY = "zahten.activeAgentId.v1";

const loadAgents = (): AgentRecord[] => {
  try {
    const raw = localStorage.getItem(ZAHTEN_AGENTS_KEY);
    if (!raw) return STARTER_AGENTS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {}
  return STARTER_AGENTS;
};

// ── Reusable chat lane for prompt-driven UI / backend edits ──
function ChatLane({ title, hint, messages, input, busy, onInput, onSend }: {
  title: string; hint: string;
  messages: { role: "user" | "assistant"; content: string; ts: number }[];
  input: string; busy: boolean;
  onInput: (v: string) => void; onSend: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/25 bg-card/30 overflow-hidden flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between">
        <p className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/70">◈ {title}</p>
        {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-[10px] font-light text-muted-foreground/60 leading-relaxed">{hint}</p>
        ) : messages.map((m, i) => (
          <div key={i} className={`text-[11px] font-light leading-relaxed rounded-md px-2.5 py-1.5 ${m.role === "user" ? "bg-foreground/10 text-foreground self-end" : "bg-background/40 text-muted-foreground"}`}>
            {m.content}
          </div>
        ))}
      </div>
      <div className="border-t border-border/20 p-2 flex items-center gap-1.5">
        <input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="Describe a change…"
          disabled={busy}
          className="flex-1 rounded-md border border-border/30 bg-background/40 px-2.5 py-1.5 text-[11px] text-foreground focus:outline-none focus:border-foreground/50 disabled:opacity-50"
        />
        <button onClick={onSend} disabled={busy || !input.trim()} className="rounded-md border border-border/30 px-2.5 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
          <Send className="h-3 w-3" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

const AsherZahtenModule = () => {
  // Agent registry — persisted to localStorage so built agents survive reloads
  const [agents, setAgents] = useState<AgentRecord[]>(() => loadAgents());
  const [activeAgentId, setActiveAgentId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(ZAHTEN_ACTIVE_KEY);
      if (saved) return saved;
    } catch {}
    const a = loadAgents();
    return a[0]?.id || STARTER_AGENTS[0].id;
  });

  // Persist whenever the agent list changes
  useEffect(() => {
    try { localStorage.setItem(ZAHTEN_AGENTS_KEY, JSON.stringify(agents)); } catch {}
  }, [agents]);
  useEffect(() => {
    try { localStorage.setItem(ZAHTEN_ACTIVE_KEY, activeAgentId); } catch {}
  }, [activeAgentId]);
  const [viewTab, setViewTab] = useState<ViewTab>("builder");
  const activeAgent = agents.find((a) => a.id === activeAgentId) || agents[0];

  // Mission Console state
  const [objective, setObjective] = useState(activeAgent?.objective || "");
  const [maxIters, setMaxIters] = useState(MAX_ITERATIONS_DEFAULT);
  const [autoApprove, setAutoApprove] = useState(true);
  const [running, setRunning] = useState(false);
  const [passes, setPasses] = useState<Pass[]>(activeAgent?.passes || []);
  const [classification, setClassification] = useState<string>("SECRET");
  const [scope, setScope] = useState<ScopeState>({ phase: "idle" });
  const [followUp, setFollowUp] = useState("");
  const [secretValues, setSecretValues] = useState<Record<string, string>>(activeAgent?.secretValues || {});
  const [liveRuns, setLiveRuns] = useState<LiveRun[]>(activeAgent?.liveRuns || []);
  const liveTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // Derived: secrets the AI says it needs (parsed from latest pass)
  const requiredSecrets = (() => {
    for (let i = passes.length - 1; i >= 0; i--) {
      const arr = parseRequiredSecrets(passes[i].text);
      if (arr.length) return arr;
    }
    return [];
  })();
  const missingSecrets = requiredSecrets.filter((s) => !(secretValues[s] && secretValues[s].trim()));
  const workflowSteps = (() => {
    for (let i = passes.length - 1; i >= 0; i--) {
      const arr = parseWorkflowSteps(passes[i].text);
      if (arr.length) return arr;
    }
    return [];
  })();

  // Sync when switching agents — ABORT any in-flight mission first so the previous
  // agent's stream cannot bleed tokens into the newly-selected agent's pass log.
  useEffect(() => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
      abortRef.current = null;
      setRunning(false);
    }
    if (!activeAgent) return;
    setObjective(activeAgent.objective);
    setPasses(activeAgent.passes);
    setScope({ phase: "idle" });
    setSecretValues(activeAgent.secretValues || {});
    setLiveRuns(activeAgent.liveRuns || []);
    setFollowUp("");
  }, [activeAgentId]);

  // Hard cleanup on unmount — prevent orphaned streams writing to dead state.
  useEffect(() => () => {
    try { abortRef.current?.abort(); } catch {}
    if (liveTimerRef.current) { try { window.clearInterval(liveTimerRef.current); } catch {} }
  }, []);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [passes]);

  const createAgent = () => {
    const id = `agent-${Date.now()}`;
    const next: AgentRecord = { id, name: `Untitled Agent ${agents.length + 1}`, status: "draft", trigger: "manual", passes: [], objective: "" };
    setAgents((p) => [next, ...p]);
    setActiveAgentId(id);
    setViewTab("builder");
  };

  const stopMission = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  };

  const buildBrainContext = async (prompt: string): Promise<string> => {
    try {
      const route = await routeBrainsForPrompt(prompt, { topK: 5, charBudget: 40_000 });
      if (!route || !route.brains.length) return "";
      const blocks = route.brains.map(b => `### BRAIN — ${b.name} [${b.category}]\n${b.content}`).join("\n\n");
      return `\n\n[ASHERIN BRAINS — injected for software build context]\n${route.rationale}\n\n${blocks}`;
    } catch { return ""; }
  };

  const callAsherAi = async (history: { role: "user" | "assistant"; content: string }[], signal: AbortSignal): Promise<string> => {
    const byok = getActiveIntelMapByok();
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asher-ai`;
    const lastUser = [...history].reverse().find(m => m.role === "user")?.content || objective;
    const brainCtx = await buildBrainContext(lastUser);
    const resp = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        ...(byok ? { "x-byok-gemini-key": byok.apiKey } : {}),
      },
      body: JSON.stringify({
        messages: [
          { role: "user", content: `[ZAHTEN ORCHESTRATOR DOCTRINE]\n${ORCHESTRATOR_SYSTEM}\n\n[CLASSIFICATION] ${classification}${brainCtx}` },
          ...history,
        ],
        mapContext: { surface: "zahten_mission_console" },
      }),
    });

    if (resp.status === 429) throw new Error("Rate limit — wait and retry");
    if (resp.status === 401) throw new Error("AI key invalid. Add a BYOK key in Settings.");
    if (resp.status === 402) throw new Error("AI credits exhausted");
    if (!resp.ok || !resp.body) throw new Error(`Stream failed (${resp.status})`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let text = "";
    let done = false;
    const passIdx = passes.length; // current in-progress pass
    while (!done) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") { done = true; break; }
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            text += delta.content;
            setPasses((p) => p.map((pp, i) => i === passIdx ? { ...pp, text } : pp));
          }
        } catch { buf = line + "\n" + buf; break; }
      }
    }
    return text;
  };

  // Plain (non-streaming-into-passes) call for the scope assessor.
  const callAsherAiPlain = async (system: string, user: string, signal: AbortSignal): Promise<string> => {
    const byok = getActiveIntelMapByok();
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asher-ai`;
    const resp = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        ...(byok ? { "x-byok-gemini-key": byok.apiKey } : {}),
      },
      body: JSON.stringify({
        messages: [
          { role: "user", content: system },
          { role: "user", content: user },
        ],
        mapContext: { surface: "zahten_scope_assessor" },
      }),
    });
    if (!resp.ok || !resp.body) throw new Error(`Assessor failed (${resp.status})`);
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", text = "", done = false;
    while (!done) {
      const { value, done: d } = await reader.read();
      if (d) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") { done = true; break; }
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) text += delta.content;
        } catch { buf = line + "\n" + buf; break; }
      }
    }
    return text.trim();
  };

  const parseAssessor = (text: string): { ready: boolean; restated?: string; questions?: string[] } => {
    const t = text.trim();
    if (/^READY\b/i.test(t)) {
      const rest = t.replace(/^READY\s*/i, "").trim();
      return { ready: true, restated: rest || "Scope confirmed." };
    }
    if (/^CLARIFY\b/i.test(t)) {
      const lines = t.split("\n").slice(1).map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
      return { ready: false, questions: lines.slice(0, 5) };
    }
    // Fallback: assume ready if model didn't follow format
    return { ready: true, restated: t.slice(0, 240) };
  };

  const assessScope = async () => {
    if (!objective.trim() || running || scope.phase === "assessing") return;
    setScope({ phase: "assessing" });
    const ctl = new AbortController();
    abortRef.current = ctl;
    try {
      const out = await callAsherAiPlain(
        SCOPE_ASSESSOR_SYSTEM,
        `AGENT BUILD PROMPT:\n${objective.trim()}`,
        ctl.signal,
      );
      const parsed = parseAssessor(out);
      if (parsed.ready) {
        setScope({ phase: "ready", restated: parsed.restated! });
      } else if (parsed.questions && parsed.questions.length) {
        setScope({ phase: "clarify", questions: parsed.questions, answers: parsed.questions.map(() => "") });
      } else {
        setScope({ phase: "ready", restated: "Scope confirmed." });
      }
    } catch (e: any) {
      toast.error(e?.message || "Scope assessment failed");
      setScope({ phase: "idle" });
    } finally {
      abortRef.current = null;
    }
  };

  const buildEnrichedObjective = (): string => {
    if (scope.phase !== "clarify") return objective.trim();
    const qa = scope.questions
      .map((q, i) => `Q: ${q}\nA: ${scope.answers[i]?.trim() || "(no answer — make a defensible assumption)"}`)
      .join("\n\n");
    return `${objective.trim()}\n\n--- CLARIFICATIONS ---\n${qa}`;
  };

  const deploy = async () => {
    if (!objective.trim() || running) return;

    // Pre-flight: if scope hasn't been assessed yet, run the assessor first.
    if (scope.phase === "idle") {
      await assessScope();
      return; // user reviews questions / restated scope, then clicks Deploy again
    }
    if (scope.phase === "assessing") return;

    setRunning(true);
    setPasses([]);
    const ctl = new AbortController();
    abortRef.current = ctl;

    const enriched = buildEnrichedObjective();
    const history: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: `AGENT BUILD OBJECTIVE:\n${enriched}\n\nExecute pass 1 now. Then self-critique and continue iterating until MISSION_COMPLETE.` },
    ];

    try {
      for (let n = 1; n <= maxIters; n++) {
        if (ctl.signal.aborted) break;
        setPasses((p) => [...p, { n, status: "running", text: "", startedAt: Date.now() }]);
        let text = "";
        try {
          text = await callAsherAi(history, ctl.signal);
        } catch (e: any) {
          if (ctl.signal.aborted) break;
          setPasses((p) => p.map((pp) => pp.n === n ? { ...pp, status: "error", text: pp.text + `\n\n_Error: ${e?.message || e}_`, endedAt: Date.now() } : pp));
          toast.error(e?.message || "Build pass failed");
          break;
        }
        const status = parseStatus(text);
        const isComplete = status === "complete" || n === maxIters;
        setPasses((p) => p.map((pp) => pp.n === n ? { ...pp, status: isComplete ? "complete" : "refining", text, endedAt: Date.now() } : pp));

        if (isComplete) {
          if (n === maxIters && status !== "complete") {
            toast.message(`Iteration cap hit at pass ${n}. Agent auto-finalized.`);
          } else {
            toast.success(`Agent built in ${n} pass${n === 1 ? "" : "es"}`);
          }
          break;
        }
        history.push({ role: "assistant", content: text });
        history.push({
          role: "user",
          content: autoApprove
            ? `APPROVED. Now perform pass ${n + 1}: harder self-critique, deeper edge cases, tighter code. Produce the FULL improved version. End with the STATUS sentinel.`
            : `Continue. Pass ${n + 1}.`,
        });
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const resetScope = () => {
    setScope({ phase: "idle" });
    setPasses([]);
  };

  // Save current builder state into active agent
  useEffect(() => {
    setAgents((prev) => prev.map((a) => a.id === activeAgentId ? { ...a, objective, passes, secretValues, liveRuns } : a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objective, passes, secretValues, liveRuns]);

  const lastCodeBlock = (() => {
    const last = passes[passes.length - 1];
    if (!last) return "";
    const m = last.text.match(/```ts([\s\S]*?)```/);
    return m ? m[1].trim() : "";
  })();

  // Follow-up refinement — operator gives natural-language instruction; AI re-emits a full improved pass.
  const sendFollowUp = async () => {
    const instr = followUp.trim();
    if (!instr || running || !passes.length) return;
    setFollowUp("");
    setRunning(true);
    const ctl = new AbortController();
    abortRef.current = ctl;
    const prior = passes.map((p) => ({ role: "assistant" as const, content: p.text }));
    const history: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: `AGENT BUILD OBJECTIVE:\n${objective.trim()}` },
      ...prior,
      { role: "user", content: `OPERATOR FOLLOW-UP: ${instr}\n\nProduce the FULL improved version of the agent (spec + workflow + code + test plan). End with the STATUS sentinel.` },
    ];
    const n = passes.length + 1;
    setPasses((p) => [...p, { n, status: "running", text: "", startedAt: Date.now() }]);
    try {
      const text = await callAsherAi(history, ctl.signal);
      const status = parseStatus(text);
      setPasses((p) => p.map((pp) => pp.n === n ? { ...pp, status: status === "complete" ? "complete" : "refining", text, endedAt: Date.now() } : pp));
      toast.success("Follow-up applied");
    } catch (e: any) {
      setPasses((p) => p.map((pp) => pp.n === n ? { ...pp, status: "error", text: pp.text + `\n\n_Error: ${e?.message || e}_`, endedAt: Date.now() } : pp));
      toast.error(e?.message || "Follow-up failed");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  // Deploy live — flips agent to live, starts a simulated heartbeat run loop.
  const stopLive = () => {
    if (liveTimerRef.current) { window.clearInterval(liveTimerRef.current); liveTimerRef.current = null; }
    setAgents((p) => p.map((a) => a.id === activeAgentId ? { ...a, status: "ready" } : a));
    toast.message("Agent paused");
  };

  const deployLive = () => {
    if (missingSecrets.length) { toast.error(`Provide values for: ${missingSecrets.join(", ")}`); return; }
    if (!passes.length) { toast.error("Build the agent first"); return; }
    setAgents((p) => p.map((a) => a.id === activeAgentId ? { ...a, status: "live", deployedAt: Date.now() } : a));
    setViewTab("workflow");
    toast.success("Agent deployed live");
    // Start a heartbeat that synthesizes runs from the parsed workflow steps.
    if (liveTimerRef.current) window.clearInterval(liveTimerRef.current);
    const tick = () => {
      const steps = workflowSteps.length ? workflowSteps : [{ n: 1, label: "Execute" }];
      const runId = `run-${Date.now()}`;
      const run: LiveRun = { id: runId, startedAt: Date.now(), status: "running", log: [] };
      setLiveRuns((p) => [run, ...p].slice(0, 30));
      let i = 0;
      const stepTimer = window.setInterval(() => {
        const s = steps[i];
        if (!s) {
          window.clearInterval(stepTimer);
          setLiveRuns((p) => p.map((r) => r.id === runId ? { ...r, status: "ok", endedAt: Date.now() } : r));
          return;
        }
        setLiveRuns((p) => p.map((r) => r.id === runId ? { ...r, log: [...r.log, `${new Date().toLocaleTimeString()}  step ${s.n} · ${s.label}`] } : r));
        i++;
      }, 700);
    };
    tick();
    liveTimerRef.current = window.setInterval(tick, 12000);
  };

  // ─── Publish-as-Tab + Deploy ───────────────────────────────────────────────
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishVis, setPublishVis] = useState<"private" | "team" | "organization" | "public">("private");
  const [publishing, setPublishing] = useState(false);
  const [publishName, setPublishName] = useState("");
  const [publishHtml, setPublishHtml] = useState("");
  const [publishHtmlDirty, setPublishHtmlDirty] = useState(false);

  // Tab Preview sub-view: "live" (rendered iframe) or "infra" (workflow map)
  const [previewSubView, setPreviewSubView] = useState<"live" | "infra">("live");
  // Chat-based editor lanes
  type ChatTurn = { role: "user" | "assistant"; content: string; ts: number };
  const [uiChat, setUiChat] = useState<ChatTurn[]>([]);
  const [backendChat, setBackendChat] = useState<ChatTurn[]>([]);
  const [uiChatInput, setUiChatInput] = useState("");
  const [backendChatInput, setBackendChatInput] = useState("");
  const [uiChatBusy, setUiChatBusy] = useState(false);
  const [backendChatBusy, setBackendChatBusy] = useState(false);
  // Editable backend code (TS task) — defaults to lastCodeBlock
  const [backendCode, setBackendCode] = useState<string>("");

  // ─── Admin: current user + all-agents registry ──────────────────────────
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [adminAgents, setAdminAgents] = useState<AdminAgentRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminFilter, setAdminFilter] = useState("");
  const [adminVisFilter, setAdminVisFilter] = useState<"all" | "public" | "private" | "team" | "organization">("all");
  const [adminSelected, setAdminSelected] = useState<AdminAgentRow | null>(null);
  const isAdmin = isOwnerEmail(currentEmail);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentEmail(data.user?.email ?? null));
  }, []);

  const loadAllAgents = async () => {
    setAdminLoading(true);
    try {
      const { data, error } = await supabase
        .from("asher_agents")
        .select("id,name,description,category,visibility,status,owner_id,install_count,version,created_at,metadata")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setAdminAgents((data as any) || []);
    } catch (e: any) { toast.error(e?.message || "Failed to load agents"); }
    finally { setAdminLoading(false); }
  };

  // ─── Tab Preview attachments (UI Chat: zip/files/images/links) ──────────
  type Attachment =
    | { kind: "image"; name: string; dataUrl: string; size: number }
    | { kind: "file"; name: string; text: string; size: number }
    | { kind: "zip"; name: string; manifest: string; fileCount: number; size: number }
    | { kind: "link"; url: string };
  const [uiAttachments, setUiAttachments] = useState<Attachment[]>([]);
  const uiFileInputRef = useRef<HTMLInputElement | null>(null);
  const uiZipInputRef = useRef<HTMLInputElement | null>(null);
  const uiImageInputRef = useRef<HTMLInputElement | null>(null);

  const TEXT_EXT = /\.(tsx?|jsx?|html?|css|scss|json|md|txt|ya?ml|toml|csv|xml|svg|sh|py|go|rs|java|kt|swift|sql|env|gitignore|lock)$/i;
  const MAX_ZIP = 100 * 1024 * 1024; // 100MB
  const MAX_TEXT_PER_FILE = 12_000;
  const MAX_TOTAL_MANIFEST = 220_000;

  const handleAttachZip = async (file: File) => {
    if (file.size > MAX_ZIP) { toast.error(`Zip exceeds 100MB (${(file.size/1048576).toFixed(1)}MB)`); return; }
    const t = toast.loading(`Extracting ${file.name}…`);
    try {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f: any) => !f.dir);
      let total = 0; let count = 0;
      const parts: string[] = [];
      for (const entry of entries) {
        if (total > MAX_TOTAL_MANIFEST) { parts.push(`\n…[truncated, ${entries.length - count} more files omitted]`); break; }
        const path = (entry as any).name;
        if (TEXT_EXT.test(path)) {
          try {
            const txt = await (entry as any).async("string");
            const slice = txt.length > MAX_TEXT_PER_FILE ? txt.slice(0, MAX_TEXT_PER_FILE) + "\n…[truncated]" : txt;
            const block = `\n\n===== FILE: ${path} =====\n${slice}`;
            parts.push(block); total += block.length;
          } catch {}
        } else {
          parts.push(`\n[binary] ${path}`); total += path.length + 10;
        }
        count++;
      }
      const manifest = parts.join("");
      setUiAttachments(p => [...p, { kind: "zip", name: file.name, manifest, fileCount: entries.length, size: file.size }]);
      toast.success(`Indexed ${entries.length} files from ${file.name}`, { id: t });
    } catch (e: any) { toast.error(e?.message || "Zip extract failed", { id: t }); }
  };

  const handleAttachFile = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) { toast.error("File too large (max 4MB for inline)"); return; }
    const text = await file.text();
    const slice = text.length > 40_000 ? text.slice(0, 40_000) + "\n…[truncated]" : text;
    setUiAttachments(p => [...p, { kind: "file", name: file.name, text: slice, size: file.size }]);
  };

  const handleAttachImage = async (file: File) => {
    if (file.size > 6 * 1024 * 1024) { toast.error("Image too large (max 6MB)"); return; }
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(new Error("read failed")); r.readAsDataURL(file);
    });
    setUiAttachments(p => [...p, { kind: "image", name: file.name, dataUrl, size: file.size }]);
  };

  const handleAddLink = () => {
    const url = window.prompt("Paste URL (reference for the AI):");
    if (!url) return;
    try { new URL(url); } catch { toast.error("Invalid URL"); return; }
    setUiAttachments(p => [...p, { kind: "link", url }]);
  };

  const removeAttachment = (i: number) => setUiAttachments(p => p.filter((_, idx) => idx !== i));

  const buildAttachmentsContext = (): string => {
    if (!uiAttachments.length) return "";
    const blocks = uiAttachments.map(a => {
      if (a.kind === "link") return `[LINK] ${a.url}`;
      if (a.kind === "image") return `[IMAGE] ${a.name} (data URL omitted; user attached an image as visual reference)`;
      if (a.kind === "file") return `[FILE: ${a.name}]\n${a.text}`;
      return `[ZIP: ${a.name} · ${a.fileCount} files]\n${a.manifest}`;
    });
    return `\n\n=== ATTACHMENTS (use as context for the requested UI change) ===\n${blocks.join("\n\n")}`;
  };

  const buildEntryHtml = (): string => {
    const code = lastCodeBlock || "// no code generated";
    const safeName = (activeAgent?.name || "Agent").replace(/[<>&"']/g, "");
    const safeObjective = (objective || "").replace(/[<>&"']/g, "");
    const stepsHtml = workflowSteps.map(s => `<li><span class="n">${String(s.n).padStart(2,"0")}</span> ${s.label.replace(/[<>&"']/g, "")}</li>`).join("");
    const escCode = code.replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c] as string));
    return `<!doctype html><html><head><meta charset="utf-8"/><title>${safeName}</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#0a0a0a;color:#e8e8e8;padding:24px;line-height:1.6}h1{font-weight:200;letter-spacing:.18em;text-transform:uppercase;font-size:18px;margin:0 0 4px}.sub{font-size:10px;letter-spacing:.3em;text-transform:uppercase;color:#888;margin-bottom:24px}.card{border:1px solid #2a2a2a;border-radius:12px;padding:16px;margin-bottom:14px;background:#111}.label{font-size:9px;letter-spacing:.3em;text-transform:uppercase;color:#888;margin-bottom:8px}ol{margin:0;padding-left:0;list-style:none}ol li{padding:6px 0;border-bottom:1px solid #1f1f1f;font-size:12px;font-weight:300}ol li:last-child{border:0}.n{display:inline-block;width:28px;color:#666;font-family:ui-monospace,monospace;font-size:10px}pre{background:#080808;border:1px solid #1f1f1f;border-radius:8px;padding:12px;overflow:auto;font-size:11px;color:#cfcfcf;max-height:480px}p.obj{font-size:13px;font-weight:300;color:#d6d6d6}</style>
</head><body><h1>${safeName}</h1><div class="sub">◈ Zahten Agent · Published Tab</div>
<div class="card"><div class="label">Objective</div><p class="obj">${safeObjective}</p></div>
${stepsHtml ? `<div class="card"><div class="label">Workflow</div><ol>${stepsHtml}</ol></div>` : ""}
<div class="card"><div class="label">Generated Task</div><pre>${escCode}</pre></div>
</body></html>`;
  };

  const openPublish = () => {
    if (!passes.length) { toast.error("Build the agent before publishing"); return; }
    if (missingSecrets.length) { toast.error(`Provide values for: ${missingSecrets.join(", ")}`); return; }
    setPublishName(activeAgent?.name || "Untitled Agent");
    setPublishHtml(buildEntryHtml());
    setPublishHtmlDirty(false);
    setPublishOpen(true);
  };

  const publishAsTab = async () => {
    if (!passes.length) { toast.error("Build the agent before publishing"); return; }
    setPublishing(true);
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) throw new Error("Sign in required");
      const finalHtml = publishHtmlDirty ? publishHtml : buildEntryHtml();
      const finalName = publishName.trim() || activeAgent?.name || "Untitled Agent";
      const payload = {
        owner_id: u.id,
        name: finalName,
        description: objective.slice(0, 280),
        icon: "◈",
        category: "zahten",
        runtime: "iframe",
        entry_html: finalHtml,
        source_tsx: backendCode || lastCodeBlock || null,
        system_prompt: ORCHESTRATOR_SYSTEM.slice(0, 4000),
        visibility: publishVis,
        status: "published",
        metadata: { workflow_steps: workflowSteps, classification } as any,
      };
      const existingId = activeAgent?.publishedAgentId;
      let newId: string | undefined = existingId;
      if (existingId) {
        // UPDATE existing published tab (single source of truth — no duplicates)
        const { error } = await supabase.from("asher_agents").update(payload as any).eq("id", existingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("asher_agents").insert(payload as any).select("id").single();
        if (error) throw error;
        newId = (data as any)?.id;
      }
      // Flip agent to live (combined Publish + Deploy) and remember its published row id
      setAgents((p) => p.map((a) => a.id === activeAgentId ? { ...a, name: finalName, status: "live", deployedAt: Date.now(), publishedAgentId: newId } : a));
      toast.success(existingId ? `Updated live tab · ${publishVis}` : `Published & deployed live · ${publishVis}`);
      setPublishOpen(false);
      window.dispatchEvent(new CustomEvent("asher-agents-updated"));
    } catch (e: any) {
      toast.error(e?.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  };

  // Seed editable backend code + initialize publishHtml when agent or build changes
  useEffect(() => {
    if (lastCodeBlock && !backendCode) setBackendCode(lastCodeBlock);
    if (passes.length && !publishHtml) setPublishHtml(buildEntryHtml());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastCodeBlock, passes.length]);

  // ─── Chat-driven UI editor (Tab Preview) ──────────────────────────────────
  const editUiViaChat = async () => {
    const instr = uiChatInput.trim();
    if ((!instr && uiAttachments.length === 0) || uiChatBusy) return;
    setUiChatInput("");
    const attachSummary = uiAttachments.length
      ? `\n\n[attached: ${uiAttachments.map(a => a.kind === "link" ? a.url : (a as any).name).join(", ")}]`
      : "";
    const turn: ChatTurn = { role: "user", content: (instr || "(attachments only)") + attachSummary, ts: Date.now() };
    setUiChat(p => [...p, turn]);
    setUiChatBusy(true);
    const ctl = new AbortController();
    try {
      const currentHtml = publishHtml || buildEntryHtml();
      const currentBackend = backendCode || lastCodeBlock || "";
      const attachCtx = buildAttachmentsContext();
      const sys = `You are a FULL-STACK AGENT EDITOR. A single user instruction may require updating the UI (iframe HTML), the backend (Trigger.dev v3 TypeScript task), or BOTH together — keep them in sync exactly like the Lovable agent does.

Return ONLY a single JSON object — no prose, no markdown fences — with this shape:
{
  "summary": "1-2 sentences describing what you changed and why",
  "ui_html":   "<!doctype html>... full revised document, OR null if UI didn't change",
  "backend_code": "complete TypeScript task({ id, run }) ... OR null if backend didn't change"
}

UI rules: complete self-contained responsive dark-theme HTML, viewport meta, semantic HTML, collapsible <details>/<summary> for lists/tables/panels, inline CSS+JS only, no external resources.
Backend rules: a single complete Trigger.dev v3 task definition, typed payloads, retry/queue config, structured logger, error handling, minimal imports.
Always wire UI ↔ backend coherently (e.g. if UI exposes a new field, backend must accept/process it; if backend changes its output shape, UI must render the new shape).`;
      const user = `CURRENT UI HTML:\n\`\`\`html\n${currentHtml}\n\`\`\`\n\nCURRENT BACKEND CODE:\n\`\`\`ts\n${currentBackend || "// (empty)"}\n\`\`\`\n\nAGENT OBJECTIVE: ${objective}\n\nUSER INSTRUCTION:\n${instr || "(see attachments)"}${attachCtx}\n\nReturn the single JSON object now.`;
      const out = await callAsherAiPlain(sys, user, ctl.signal);
      const cleaned = out.replace(/^```(?:json)?\n?|\n?```$/g, "").trim();
      let parsed: { summary?: string; ui_html?: string | null; backend_code?: string | null } = {};
      try { parsed = JSON.parse(cleaned); }
      catch {
        // Fallback: treat whole reply as UI HTML if it looks like HTML, else backend
        if (/^\s*<!doctype/i.test(cleaned) || /<html/i.test(cleaned)) parsed = { ui_html: cleaned, summary: "UI updated (fallback parse)." };
        else parsed = { backend_code: cleaned, summary: "Backend updated (fallback parse)." };
      }
      const changed: string[] = [];
      if (parsed.ui_html && parsed.ui_html.trim()) {
        setPublishHtml(parsed.ui_html);
        setPublishHtmlDirty(true);
        changed.push("UI");
      }
      if (parsed.backend_code && parsed.backend_code.trim()) {
        setBackendCode(parsed.backend_code);
        changed.push("Backend");
      }
      setUiAttachments([]);
      const summary = parsed.summary || (changed.length ? `Updated ${changed.join(" + ")}.` : "No changes.");
      setUiChat(p => [...p, { role: "assistant", content: `✓ ${summary}${changed.length ? `  [${changed.join(", ")}]` : ""}`, ts: Date.now() }]);
    } catch (e: any) {
      setUiChat(p => [...p, { role: "assistant", content: `Error: ${e?.message || e}`, ts: Date.now() }]);
    } finally {
      setUiChatBusy(false);
    }
  };

  // Backend chat is now unified into the UI chat; keep alias for any external refs.
  const editBackendViaChat = editUiViaChat;

  useEffect(() => () => { if (liveTimerRef.current) window.clearInterval(liveTimerRef.current); }, []);

  const TABS: { id: ViewTab; label: string }[] = [
    { id: "builder",    label: "Builder" },
    { id: "workflow",   label: "Workflow Map" },
    { id: "runs",       label: "Runs" },
    { id: "code",       label: "Code" },
    { id: "preview",    label: "Tab Preview" },
    { id: "schedule",   label: "Schedule" },
    { id: "compliance", label: "Platform" },
    ...(isAdmin ? [{ id: "admin" as ViewTab, label: "◈ Admin · All Agents" }] : []),
  ];

  // Auto-load admin registry whenever admin opens that tab
  useEffect(() => { if (isAdmin && viewTab === "admin") loadAllAgents(); /* eslint-disable-next-line */ }, [viewTab, isAdmin]);

  return (
    <div className="h-full w-full flex bg-background text-foreground overflow-hidden">
      {/* My Agents sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-border/15 bg-card/20 flex flex-col">
        <div className="px-4 py-4 border-b border-border/15 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">House of Asher</p>
            <p className="text-sm font-extralight tracking-[0.25em] text-foreground mt-0.5">ZAHTEN</p>
          </div>
          <button onClick={createAgent} title="New Agent" className="rounded-md border border-border/30 hover:border-foreground/50 px-2 py-1 text-[10px] font-light tracking-wide text-foreground/80 hover:text-foreground">+ New</button>
        </div>
        <div className="px-3 py-2 text-[9px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">My Agents</div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {agents.map((a) => {
            const isActive = a.id === activeAgentId;
            return (
              <button
                key={a.id}
                onClick={() => setActiveAgentId(a.id)}
                className={`w-full text-left rounded-md px-2.5 py-2 transition-colors ${isActive ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${a.status === "live" ? "bg-emerald-400 animate-pulse" : a.status === "scheduled" ? "bg-emerald-400/80" : a.status === "ready" ? "bg-sky-400/80" : a.status === "paused" ? "bg-amber-400/80" : "bg-muted-foreground/40"}`} />
                  <span className="flex-1 text-[12px] font-light truncate">{a.name}</span>
                </div>
                <div className="mt-0.5 ml-3.5 text-[9px] font-light tracking-[0.2em] text-muted-foreground/50 uppercase truncate">{a.trigger}</div>
              </button>
            );
          })}
        </div>
        <div className="border-t border-border/15 px-3 py-3">
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[10px] font-light tracking-[0.2em] text-muted-foreground hover:text-foreground uppercase">
            <ExternalLink className="h-3 w-3" /> Repository
          </a>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="border-b border-border/15 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Workflow className="h-4 w-4 text-foreground/70" strokeWidth={1.5} />
            <input
              value={activeAgent?.name || ""}
              onChange={(e) => setAgents((p) => p.map((a) => a.id === activeAgentId ? { ...a, name: e.target.value } : a))}
              className="bg-transparent text-base font-extralight tracking-wide text-foreground focus:outline-none border-b border-transparent focus:border-border/40 px-1 min-w-[180px]"
            />
            <span className="text-[9px] font-light tracking-[0.25em] text-muted-foreground/60 uppercase border border-border/30 rounded-full px-2 py-0.5">{activeAgent?.status}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-light tracking-[0.25em] text-muted-foreground/60 uppercase">Classification</span>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
              disabled={running}
              className="bg-background/60 border border-border/30 rounded px-2 py-1 text-[10px] tracking-[0.2em] text-foreground/90 focus:outline-none focus:border-foreground/60 uppercase"
            >
              {CLASSIFICATIONS.map((c) => <option key={c.tier} value={c.tier}>{c.tier}</option>)}
            </select>
          </div>
        </header>

        {/* Tabs */}
        <div className="border-b border-border/15 px-6 flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setViewTab(t.id)}
              className={`px-3 py-2.5 text-[10px] font-light tracking-[0.25em] uppercase border-b-2 transition-colors ${viewTab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {viewTab !== "compliance" ? (
            <div className="mx-auto max-w-5xl px-8 py-8 space-y-6">

              {viewTab === "runs" && (
                <section className="rounded-xl border border-border/20 bg-card/30 p-5">
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase mb-4">Recent Runs</p>
                  {passes.length === 0 ? (
                    <p className="text-[11px] font-extralight text-muted-foreground/70">No runs yet. Build the agent first to populate the run history.</p>
                  ) : (
                    <table className="w-full text-[11px]">
                      <thead><tr className="text-[9px] tracking-[0.25em] text-muted-foreground/60 uppercase border-b border-border/15"><th className="text-left py-2">Pass</th><th className="text-left py-2">Status</th><th className="text-left py-2">Started</th><th className="text-left py-2">Duration</th></tr></thead>
                      <tbody>
                        {passes.map((p) => (
                          <tr key={p.n} className="border-b border-border/10 last:border-0">
                            <td className="py-2 font-mono text-foreground/90">#{p.n}</td>
                            <td className="py-2 text-muted-foreground/85">{p.status}</td>
                            <td className="py-2 text-muted-foreground/70">{new Date(p.startedAt).toLocaleTimeString()}</td>
                            <td className="py-2 text-muted-foreground/70">{p.endedAt ? `${((p.endedAt - p.startedAt) / 1000).toFixed(1)}s` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}

              {viewTab === "code" && (
                <section className="rounded-xl border border-border/20 bg-card/30 p-5">
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase mb-3">Generated Trigger.dev Task</p>
                  {lastCodeBlock ? (
                    <pre className="font-mono text-[11px] leading-relaxed text-foreground/85 bg-background/60 border border-border/20 rounded-md p-4 overflow-auto max-h-[600px]">{lastCodeBlock}</pre>
                  ) : (
                    <p className="text-[11px] font-extralight text-muted-foreground/70">Run the Builder to generate the agent's code.</p>
                  )}
                </section>
              )}

              {viewTab === "schedule" && (
                <section className="rounded-xl border border-border/20 bg-card/30 p-5 space-y-3">
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Trigger</p>
                  <div className="grid grid-cols-2 gap-3 text-[11px] font-extralight">
                    {["manual", "schedule", "webhook", "event"].map((t) => (
                      <button
                        key={t}
                        onClick={() => setAgents((p) => p.map((a) => a.id === activeAgentId ? { ...a, trigger: t } : a))}
                        className={`rounded-md border px-3 py-2 text-left ${activeAgent?.trigger === t || activeAgent?.trigger?.startsWith(t) ? "border-foreground/50 bg-foreground/5 text-foreground" : "border-border/25 text-muted-foreground hover:text-foreground"}`}
                      >
                        <p className="text-[9px] tracking-[0.25em] uppercase">{t}</p>
                      </button>
                    ))}
                  </div>
                  <div>
                    <p className="text-[9px] tracking-[0.25em] text-muted-foreground/60 uppercase mb-1">Cron expression</p>
                    <input
                      placeholder="0 7 * * *"
                      defaultValue={activeAgent?.trigger?.startsWith("cron:") ? activeAgent.trigger.slice(5).trim() : ""}
                      onChange={(e) => setAgents((p) => p.map((a) => a.id === activeAgentId ? { ...a, trigger: e.target.value ? `cron: ${e.target.value}` : "manual" } : a))}
                      className="w-full bg-background/60 border border-border/30 rounded px-3 py-2 font-mono text-[11px] text-foreground focus:outline-none focus:border-foreground/60"
                    />
                  </div>
                </section>
              )}

              {viewTab === "builder" && (
                <>
                  <section className="rounded-xl border border-border/25 bg-card/40 p-4 flex items-start gap-3">
                    <Lock className="h-3.5 w-3.5 text-foreground/70 mt-0.5" strokeWidth={1.5} />
                    <p className="text-[11px] font-extralight text-muted-foreground/85 leading-relaxed">
                      Set your LLM API key once in <span className="text-foreground/90">Settings → Bring Your Own LLM Key</span>.
                      The Builder uses the Scope Assessor to clarify your prompt, then iterates spec + Trigger.dev code until production-grade.
                    </p>
                  </section>
                </>
              )}
            </div>
          ) : null}

          {viewTab === "builder" && (
          <div className="mx-auto max-w-5xl px-8 pb-10 space-y-6">

        {/* ─────────── AUTONOMOUS MISSION CONSOLE ─────────── */}
        <section className="rounded-2xl border border-border/25 bg-card/40 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
              <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Step 1 → Describe Agent  ·  Step 2 → Answer Clarifications  ·  Step 3 → Build</p>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-light tracking-[0.25em] uppercase">
              <span className="text-muted-foreground/60">Classification</span>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                disabled={running}
                className="bg-background/60 border border-border/30 rounded px-2 py-1 text-foreground/90 focus:outline-none focus:border-foreground/60"
              >
                {CLASSIFICATIONS.map((c) => <option key={c.tier} value={c.tier}>{c.tier}</option>)}
              </select>
            </div>
          </div>

          <textarea
            value={objective}
            onChange={(e) => { setObjective(e.target.value); if (scope.phase !== "idle") setScope({ phase: "idle" }); }}
            disabled={running || scope.phase === "assessing"}
            placeholder="Describe the agent you want. e.g. 'Every morning at 7am pull new GitHub issues labelled bug, summarise them with an LLM, and post the digest to Slack #eng-triage.' If you skip key details (trigger, source, destination, success criteria) the assessor will ask before building."
            rows={4}
            className="w-full bg-background/60 border border-border/30 rounded-lg px-4 py-3 text-sm font-extralight text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/60 resize-none"
          />

          <div className="mt-3 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 text-[10px] font-light tracking-[0.25em] uppercase text-muted-foreground/80">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} disabled={running} className="accent-foreground" />
                Auto-Approve Refinements
              </label>
              <div className="flex items-center gap-2">
                <span>Max Passes</span>
                <input
                  type="number" min={1} max={20} value={maxIters}
                  onChange={(e) => setMaxIters(Math.max(1, Math.min(20, parseInt(e.target.value || "1"))))}
                  disabled={running}
                  className="w-14 bg-background/60 border border-border/30 rounded px-2 py-1 text-foreground/90 focus:outline-none focus:border-foreground/60"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {running ? (
                <button onClick={stopMission} className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-4 py-2 text-[10px] font-light tracking-[0.25em] text-foreground uppercase transition-colors">
                  <Square className="h-3 w-3" strokeWidth={1.5} /> Abort Build
                </button>
              ) : (
                <>
                  {scope.phase !== "idle" && (
                    <button onClick={resetScope} className="inline-flex items-center gap-2 rounded-lg border border-border/30 hover:border-foreground/40 px-3 py-2 text-[10px] font-light tracking-[0.25em] text-muted-foreground hover:text-foreground uppercase transition-colors">
                      Reset Scope
                    </button>
                  )}
                  <button
                    onClick={deploy}
                    disabled={!objective.trim() || scope.phase === "assessing" || (scope.phase === "clarify" && scope.answers.every((a) => !a.trim()))}
                    className="inline-flex items-center gap-2 rounded-lg border border-foreground/40 bg-foreground/10 hover:bg-foreground/20 disabled:opacity-30 disabled:cursor-not-allowed px-4 py-2 text-[10px] font-light tracking-[0.25em] text-foreground uppercase transition-colors"
                  >
                    {scope.phase === "assessing" ? (
                      <><Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} /> Assessing Scope</>
                    ) : scope.phase === "idle" ? (
                      <><Eye className="h-3 w-3" strokeWidth={1.5} /> Assess & Build</>
                    ) : scope.phase === "clarify" ? (
                      <><Play className="h-3 w-3" strokeWidth={1.5} /> Build Agent</>
                    ) : (
                      <><Play className="h-3 w-3" strokeWidth={1.5} /> Build Agent</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Scope assessor — clarify panel */}
          {scope.phase === "clarify" && (
            <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5" strokeWidth={1.5} />
                <div>
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Scope Assessor — Clarification Needed</p>
                  <p className="mt-1 text-[11px] font-extralight text-muted-foreground/80 leading-relaxed">
                    Your prompt is light on specifics. Answer what you can — anything left blank will be filled with a defensible assumption.
                  </p>
                </div>
              </div>
              {scope.questions.map((q, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[11px] font-light text-foreground/85">{i + 1}. {q}</p>
                  <input
                    value={scope.answers[i]}
                    onChange={(e) => {
                      const next = [...scope.answers]; next[i] = e.target.value;
                      setScope({ ...scope, answers: next });
                    }}
                    placeholder="Your answer (optional)"
                    className="w-full bg-background/60 border border-border/30 rounded px-3 py-2 text-[12px] font-extralight text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/60"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Scope assessor — ready panel */}
          {scope.phase === "ready" && (
            <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5" strokeWidth={1.5} />
                <div>
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Scope Confirmed</p>
                  <p className="mt-1 text-[11px] font-extralight text-muted-foreground/85 leading-relaxed">{scope.restated}</p>
                </div>
              </div>
            </div>
          )}

          {/* Iteration log */}
          {passes.length > 0 && (
            <div className="mt-6 space-y-3">
              {passes.map((p) => (
                <div key={p.n} className="rounded-lg border border-border/20 bg-background/40 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {p.status === "running" && <Loader2 className="h-3 w-3 text-foreground/70 animate-spin" strokeWidth={1.5} />}
                      {p.status === "refining" && <RefreshCw className="h-3 w-3 text-foreground/70" strokeWidth={1.5} />}
                      {p.status === "complete" && <CheckCircle2 className="h-3 w-3 text-foreground/90" strokeWidth={1.5} />}
                      {p.status === "error" && <AlertCircle className="h-3 w-3 text-red-400" strokeWidth={1.5} />}
                      <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Pass {p.n} · {p.status}</p>
                    </div>
                    {p.endedAt && (
                      <p className="text-[9px] font-light tracking-[0.2em] text-muted-foreground/60 uppercase">
                        {((p.endedAt - p.startedAt) / 1000).toFixed(1)}s
                      </p>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/85 max-h-[420px] overflow-y-auto">
                    {p.text || (p.status === "running" ? "…" : "")}
                  </pre>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}

          {!passes.length && scope.phase === "idle" && (
            <div className="mt-5 flex items-start gap-2 rounded-md border border-border/20 bg-background/30 p-3">
              <Zap className="h-3 w-3 text-foreground/60 mt-0.5" strokeWidth={1.5} />
              <p className="text-[10px] font-light tracking-[0.2em] text-muted-foreground/70 uppercase leading-relaxed">
                Two-phase build: (1) the Scope Assessor reads your prompt and asks for any missing details,
                (2) the Builder iterates spec + Trigger.dev code, self-critiquing each pass until MISSION_COMPLETE.
              </p>
            </div>
          )}

          {/* ─────────── REQUIRED SECRETS (AI follow-up for keys) ─────────── */}
          {requiredSecrets.length > 0 && (
            <div className="mt-6 rounded-lg border border-amber-500/25 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <KeyRound className="h-3.5 w-3.5 text-amber-400 mt-0.5" strokeWidth={1.5} />
                <div className="flex-1">
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">AI Follow-Up · Credentials Required</p>
                  <p className="mt-1 text-[11px] font-extralight text-muted-foreground/80 leading-relaxed">
                    The agent needs the following secrets before it can run live. Values stay in your browser session and are injected into the deployed agent.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {requiredSecrets.map((s) => (
                  <div key={s} className="space-y-1">
                    <p className="text-[9px] font-mono tracking-wide text-muted-foreground/70">{s}</p>
                    <input
                      type="password"
                      value={secretValues[s] || ""}
                      onChange={(e) => setSecretValues((p) => ({ ...p, [s]: e.target.value }))}
                      placeholder="paste value"
                      className="w-full bg-background/60 border border-border/30 rounded px-3 py-1.5 text-[12px] font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/60"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─────────── FOLLOW-UP PROMPT + DEPLOY ─────────── */}
          {passes.length > 0 && !running && (
            <div className="mt-6 rounded-lg border border-border/25 bg-background/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
                <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Refine · Add · Test</p>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  placeholder="e.g. add a Discord fallback if Slack fails · raise retry to 5 with jitter · write a test for empty payload"
                  rows={2}
                  className="flex-1 bg-background/60 border border-border/30 rounded px-3 py-2 text-[12px] font-extralight text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/60 resize-none"
                />
                <button
                  onClick={sendFollowUp}
                  disabled={!followUp.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/40 bg-foreground/10 hover:bg-foreground/20 disabled:opacity-30 px-3 py-2 text-[10px] font-light tracking-[0.25em] uppercase"
                >
                  <Send className="h-3 w-3" strokeWidth={1.5} /> Send
                </button>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border/15">
                <p className="text-[10px] font-extralight text-muted-foreground/70">
                  {missingSecrets.length
                    ? `${missingSecrets.length} secret${missingSecrets.length === 1 ? "" : "s"} still needed`
                    : activeAgent?.status === "live" ? "Agent is live · streaming runs to Workflow Map" : "Ready to deploy"}
                </p>
                {activeAgent?.status === "live" ? (
                  <button onClick={stopLive} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-4 py-2 text-[10px] font-light tracking-[0.25em] uppercase">
                    <Square className="h-3 w-3" strokeWidth={1.5} /> Pause Live
                  </button>
                ) : (
                  <button
                    onClick={openPublish}
                    disabled={!passes.length || missingSecrets.length > 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed px-4 py-2 text-[10px] font-light tracking-[0.25em] uppercase"
                    title="Preview the tab UI, edit it, then publish & deploy live in one step"
                  >
                    <Rocket className="h-3 w-3" strokeWidth={1.5} /> Publish &amp; Deploy
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
          </div>
          )}

          {/* ─── Publish & Deploy dialog (with live tab preview + editor) ─── */}
          {publishOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => !publishing && setPublishOpen(false)}>
              <div className="w-full max-w-6xl max-h-[92vh] rounded-xl border border-border/30 bg-card flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-border/20 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-[9px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">Agent Store · Tab Preview</p>
                    <p className="text-base font-extralight tracking-wide text-foreground mt-1">Publish &amp; Deploy</p>
                    <p className="text-[10px] font-light text-muted-foreground/70 mt-1 leading-relaxed max-w-2xl">
                      Live preview of how the tab will render in the dashboard. Edit the name, design (HTML/CSS), or button functions on the right — preview updates instantly.
                    </p>
                  </div>
                  <button onClick={() => setPublishOpen(false)} disabled={publishing} className="rounded-md border border-border/30 px-3 py-1.5 text-[10px] tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground self-start">
                    Cancel
                  </button>
                </div>

                <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] min-h-0">
                  {/* LEFT — live preview */}
                  <div className="border-r border-border/20 bg-background/40 flex flex-col min-h-0">
                    <div className="px-4 py-2 border-b border-border/20 flex items-center justify-between">
                      <p className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/70">◈ Live Tab Preview</p>
                      <span className="text-[9px] tracking-wider text-muted-foreground/50">renders identically inside dashboard</span>
                    </div>
                    <iframe
                      title="Tab preview"
                      srcDoc={publishHtml}
                      sandbox="allow-scripts"
                      className="flex-1 w-full bg-[#0a0a0a]"
                    />
                  </div>

                  {/* RIGHT — editor */}
                  <div className="flex flex-col min-h-0 overflow-y-auto">
                    <div className="p-4 space-y-3 border-b border-border/20">
                      <label className="block">
                        <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/70">Tab Name</span>
                        <input
                          value={publishName}
                          onChange={(e) => setPublishName(e.target.value)}
                          className="mt-1 w-full rounded-md border border-border/30 bg-background/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:border-foreground/50"
                          placeholder="e.g. Slack Watcher"
                        />
                      </label>
                      <div>
                        <p className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/70 mb-1.5">Visibility</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {([
                            { v: "private", label: "Private", desc: "Only you" },
                            { v: "team", label: "Team", desc: "Your team" },
                            { v: "organization", label: "Organization", desc: "Your org" },
                            { v: "public", label: "Public", desc: "Everyone" },
                          ] as const).map((o) => (
                            <button
                              key={o.v}
                              onClick={() => setPublishVis(o.v)}
                              className={`text-left rounded-md border px-2.5 py-1.5 transition-colors ${publishVis === o.v ? "border-foreground/50 bg-foreground/5" : "border-border/25 hover:border-foreground/30"}`}
                            >
                              <p className="text-[10px] font-light tracking-[0.18em] text-foreground uppercase">{o.label}</p>
                              <p className="text-[9px] font-light text-muted-foreground/70 mt-0.5">{o.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 flex flex-col flex-1 min-h-[260px]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/70">Tab Source · HTML / CSS / JS</span>
                        <button
                          onClick={() => { setPublishHtml(buildEntryHtml()); setPublishHtmlDirty(false); toast.message("Reset to AI-generated design"); }}
                          className="text-[9px] tracking-[0.2em] uppercase text-muted-foreground/70 hover:text-foreground"
                        >
                          Reset
                        </button>
                      </div>
                      <textarea
                        value={publishHtml}
                        onChange={(e) => { setPublishHtml(e.target.value); setPublishHtmlDirty(true); }}
                        spellCheck={false}
                        className="flex-1 w-full font-mono text-[11px] leading-relaxed rounded-md border border-border/30 bg-background/60 px-3 py-2 text-foreground focus:outline-none focus:border-foreground/50 resize-none"
                      />
                      <p className="text-[9px] text-muted-foreground/60 mt-1.5 leading-relaxed">
                        Edit any HTML, CSS, or inline JS to customize layout, button labels and onclick handlers. Sandboxed — no network access at runtime.
                      </p>
                    </div>

                    <div className="p-4 border-t border-border/20 flex items-center justify-between gap-2">
                      <p className="text-[10px] text-muted-foreground/70">
                        Publishing also <span className="text-foreground/90">deploys the agent live</span>.
                      </p>
                      <button onClick={publishAsTab} disabled={publishing} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2 text-[10px] tracking-[0.25em] uppercase text-foreground disabled:opacity-40">
                        {publishing ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} /> : <Rocket className="h-3 w-3" strokeWidth={1.5} />}
                        Publish &amp; Deploy
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─────────── TAB PREVIEW ─────────── */}
          {viewTab === "preview" && (
            <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-[9px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">Agent Store · Tab Preview</p>
                  <p className="text-base font-extralight tracking-wide text-foreground mt-1">{activeAgent?.name || "Untitled Agent"}</p>
                  <p className="text-[10px] font-light text-muted-foreground/70 mt-1 max-w-2xl leading-relaxed">
                    Edit the UI and backend with chat prompts. Toggle between live preview and the workflow infrastructure map.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Sub-tab toggle */}
                  <div className="inline-flex rounded-md border border-border/30 overflow-hidden">
                    <button
                      onClick={() => setPreviewSubView("live")}
                      className={`px-3 py-1.5 text-[10px] tracking-[0.25em] uppercase ${previewSubView === "live" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >Live Preview</button>
                    <button
                      onClick={() => setPreviewSubView("infra")}
                      className={`px-3 py-1.5 text-[10px] tracking-[0.25em] uppercase border-l border-border/30 ${previewSubView === "infra" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >Infrastructure</button>
                  </div>
                  <button
                    onClick={openPublish}
                    disabled={!passes.length || missingSecrets.length > 0}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-30 px-3 py-1.5 text-[10px] tracking-[0.25em] uppercase"
                  >
                    <Rocket className="h-3 w-3" strokeWidth={1.5} /> Publish &amp; Deploy
                  </button>
                </div>
              </div>

              {!passes.length ? (
                <div className="rounded-xl border border-border/25 bg-card/30 w-full flex items-center justify-center" style={{ height: "70vh" }}>
                  <p className="text-[11px] tracking-[0.25em] uppercase text-muted-foreground/60">Build the agent in the Builder tab first</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3" style={{ height: "75vh" }}>
                  {/* LEFT — Live Preview OR Infrastructure */}
                  <div className="rounded-xl border border-border/25 bg-card/30 overflow-hidden flex flex-col">
                    <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between">
                      <p className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/70">
                        ◈ {previewSubView === "live" ? "Live Tab Preview (responsive)" : "Workflow Infrastructure"}
                      </p>
                      <div className="flex items-center gap-2">
                        {previewSubView === "live" && publishHtmlDirty && (
                          <span className="text-[9px] tracking-[0.25em] uppercase text-amber-400/80">edited</span>
                        )}
                        {previewSubView === "live" && (
                          <button
                            onClick={() => { setPublishHtml(buildEntryHtml()); setPublishHtmlDirty(false); toast.message("Reset to AI-generated design"); }}
                            className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground/70 hover:text-foreground"
                          >Reset</button>
                        )}
                      </div>
                    </div>
                    {previewSubView === "live" ? (
                      <iframe
                        title="Tab live preview"
                        srcDoc={publishHtml || buildEntryHtml()}
                        sandbox="allow-scripts"
                        className="flex-1 w-full bg-[#0a0a0a]"
                      />
                    ) : (
                      <div className="flex-1 overflow-auto p-5 bg-background/30">
                        <div className="flex items-center gap-2 mb-3">
                          <Radio className="h-3 w-3 text-foreground/60" strokeWidth={1.5} />
                          <p className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/70">Trigger</p>
                          <span className="text-[10px] font-mono text-foreground/80">{activeAgent?.trigger || "manual"}</span>
                        </div>
                        {workflowSteps.length === 0 ? (
                          <p className="text-[11px] font-extralight text-muted-foreground/70">No workflow steps parsed yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {workflowSteps.map((s) => (
                              <details key={s.n} open className="rounded-lg border border-border/25 bg-background/40 group">
                                <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 text-[11px] font-light text-foreground/90">
                                  <span className="font-mono text-[9px] text-muted-foreground/60">{String(s.n).padStart(2, "0")}</span>
                                  <span className="flex-1">{s.label}</span>
                                  <ChevronRight className="h-3 w-3 text-muted-foreground/50 group-open:rotate-90 transition-transform" />
                                </summary>
                                <div className="px-4 pb-3 pt-1 border-t border-border/15 text-[10px] font-mono text-muted-foreground/70">
                                  step.{s.n}() · retries: 3 · timeout: 30s · idempotent
                                </div>
                              </details>
                            ))}
                            <details className="rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                              <summary className="px-3 py-2 cursor-pointer flex items-center gap-2 text-[11px] font-light text-foreground/90">
                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                <span className="flex-1">Output delivered</span>
                              </summary>
                            </details>
                          </div>
                        )}
                        <details className="mt-4 rounded-lg border border-border/25 bg-background/40">
                          <summary className="px-3 py-2 cursor-pointer text-[11px] font-light text-foreground/90">Required secrets ({requiredSecrets.length})</summary>
                          <div className="px-4 pb-3 pt-1 text-[10px] font-mono text-muted-foreground/70 space-y-1">
                            {requiredSecrets.length === 0 ? "none" : requiredSecrets.map(s => <div key={s}>· {s}{secretValues[s] ? " ✓" : " (missing)"}</div>)}
                          </div>
                        </details>
                      </div>
                    )}
                  </div>

                  {/* RIGHT — unified UI + Backend chat (single conversation, edits both) */}
                  <div className="flex flex-col min-h-0">
                    <div className="rounded-xl border border-border/25 bg-card/30 overflow-hidden flex flex-col min-h-0 flex-1">
                      <div className="px-3 py-2 border-b border-border/20 flex items-center justify-between">
                        <p className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/70">◈ Agent Chat · UI + Backend</p>
                        {uiChatBusy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />}
                      </div>
                      <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {uiChat.length === 0 ? (
                          <p className="text-[10px] font-light text-muted-foreground/60 leading-relaxed">
                            Talk to the agent like you talk to me. One chat edits BOTH the live UI preview and the backend Trigger.dev task in sync. Attach a zip (≤100MB) of existing software, files, images, or paste links — they're used as context.
                          </p>
                        ) : uiChat.map((m, i) => (
                          <div key={i} className={`text-[11px] font-light leading-relaxed rounded-md px-2.5 py-1.5 whitespace-pre-wrap ${m.role === "user" ? "bg-foreground/10 text-foreground" : "bg-background/40 text-muted-foreground"}`}>{m.content}</div>
                        ))}
                      </div>
                      {uiAttachments.length > 0 && (
                        <div className="border-t border-border/20 px-2 py-1.5 flex flex-wrap gap-1.5">
                          {uiAttachments.map((a, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border/30 bg-background/50 px-2 py-0.5 text-[9px] text-foreground/80">
                              {a.kind === "image" && <ImageIcon className="h-2.5 w-2.5" />}
                              {a.kind === "zip" && <FileArchive className="h-2.5 w-2.5" />}
                              {a.kind === "file" && <Paperclip className="h-2.5 w-2.5" />}
                              {a.kind === "link" && <Link2 className="h-2.5 w-2.5" />}
                              <span className="max-w-[140px] truncate">{a.kind === "link" ? a.url : (a as any).name}</span>
                              <button onClick={() => removeAttachment(i)} className="text-muted-foreground hover:text-foreground"><XIcon className="h-2.5 w-2.5" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="border-t border-border/20 p-2 flex items-center gap-1">
                        <input ref={uiZipInputRef} type="file" accept=".zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAttachZip(f); e.currentTarget.value = ""; }} />
                        <input ref={uiFileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAttachFile(f); e.currentTarget.value = ""; }} />
                        <input ref={uiImageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAttachImage(f); e.currentTarget.value = ""; }} />
                        <button onClick={() => uiZipInputRef.current?.click()} title="Upload zip (≤100MB)" className="rounded-md border border-border/30 px-1.5 py-1.5 text-muted-foreground hover:text-foreground"><FileArchive className="h-3 w-3" strokeWidth={1.5} /></button>
                        <button onClick={() => uiFileInputRef.current?.click()} title="Upload file" className="rounded-md border border-border/30 px-1.5 py-1.5 text-muted-foreground hover:text-foreground"><Paperclip className="h-3 w-3" strokeWidth={1.5} /></button>
                        <button onClick={() => uiImageInputRef.current?.click()} title="Upload image" className="rounded-md border border-border/30 px-1.5 py-1.5 text-muted-foreground hover:text-foreground"><ImageIcon className="h-3 w-3" strokeWidth={1.5} /></button>
                        <button onClick={handleAddLink} title="Paste link" className="rounded-md border border-border/30 px-1.5 py-1.5 text-muted-foreground hover:text-foreground"><Link2 className="h-3 w-3" strokeWidth={1.5} /></button>
                        <input
                          value={uiChatInput}
                          onChange={(e) => setUiChatInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); editUiViaChat(); } }}
                          placeholder="Describe a UI change, a backend change, or both…"
                          disabled={uiChatBusy}
                          className="flex-1 rounded-md border border-border/30 bg-background/40 px-2.5 py-1.5 text-[11px] text-foreground focus:outline-none focus:border-foreground/50 disabled:opacity-50"
                        />
                        <button onClick={editUiViaChat} disabled={uiChatBusy || (!uiChatInput.trim() && uiAttachments.length === 0)} className="rounded-md border border-border/30 px-2.5 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                          <Send className="h-3 w-3" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}


          {/* ─────────── ADMIN · ALL AGENTS REGISTRY (owner only) ─────────── */}
          {viewTab === "admin" && isAdmin && (
            <div className="mx-auto max-w-7xl px-6 py-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" strokeWidth={1.5} />
                  <div>
                    <p className="text-[9px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">Admin Console · Restricted</p>
                    <p className="text-base font-extralight tracking-wide text-foreground mt-0.5">All Agents Registry</p>
                    <p className="text-[10px] font-light text-muted-foreground/70 mt-0.5">Every agent ever published across all users — names, descriptions, functions, owners, visibility.</p>
                  </div>
                </div>
                <button onClick={loadAllAgents} disabled={adminLoading} className="inline-flex items-center gap-1.5 rounded-md border border-border/30 hover:border-foreground/50 px-3 py-1.5 text-[10px] tracking-[0.25em] uppercase">
                  {adminLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" strokeWidth={1.5} />} Refresh
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={adminFilter}
                  onChange={(e) => setAdminFilter(e.target.value)}
                  placeholder="Search name / description / category / owner_id…"
                  className="flex-1 min-w-[220px] rounded-md border border-border/30 bg-background/40 px-2.5 py-1.5 text-[11px] focus:outline-none focus:border-foreground/50"
                />
                <select value={adminVisFilter} onChange={(e) => setAdminVisFilter(e.target.value as any)} className="rounded-md border border-border/30 bg-background/40 px-2 py-1.5 text-[10px] tracking-[0.2em] uppercase">
                  <option value="all">All visibilities</option>
                  <option value="public">Public</option>
                  <option value="organization">Organization</option>
                  <option value="team">Team</option>
                  <option value="private">Private</option>
                </select>
                <span className="text-[10px] font-mono text-muted-foreground/60">{adminAgents.length} total</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3">
                <div className="rounded-xl border border-border/25 bg-card/30 overflow-hidden">
                  <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-card/95 backdrop-blur z-10">
                        <tr className="text-[9px] tracking-[0.25em] text-muted-foreground/60 uppercase border-b border-border/15">
                          <th className="text-left py-2 px-3">Name</th>
                          <th className="text-left py-2 px-3">Category</th>
                          <th className="text-left py-2 px-3">Visibility</th>
                          <th className="text-left py-2 px-3">Status</th>
                          <th className="text-left py-2 px-3">Installs</th>
                          <th className="text-left py-2 px-3">Owner</th>
                          <th className="text-left py-2 px-3">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminAgents
                          .filter(a => adminVisFilter === "all" || a.visibility === adminVisFilter)
                          .filter(a => {
                            if (!adminFilter.trim()) return true;
                            const q = adminFilter.toLowerCase();
                            return (a.name + " " + (a.description || "") + " " + a.category + " " + a.owner_id).toLowerCase().includes(q);
                          })
                          .map(a => (
                            <tr key={a.id} onClick={() => setAdminSelected(a)} className={`border-b border-border/10 cursor-pointer hover:bg-foreground/5 ${adminSelected?.id === a.id ? "bg-foreground/10" : ""}`}>
                              <td className="py-2 px-3 text-foreground/90 font-light">{a.name}</td>
                              <td className="py-2 px-3 text-muted-foreground/80">{a.category}</td>
                              <td className="py-2 px-3"><span className={`text-[9px] tracking-[0.2em] uppercase px-1.5 py-0.5 rounded ${a.visibility === "public" ? "bg-emerald-500/15 text-emerald-300" : a.visibility === "private" ? "bg-muted/30 text-muted-foreground" : "bg-sky-500/15 text-sky-300"}`}>{a.visibility}</span></td>
                              <td className="py-2 px-3 text-muted-foreground/80">{a.status}</td>
                              <td className="py-2 px-3 font-mono text-muted-foreground/70">{a.install_count}</td>
                              <td className="py-2 px-3 font-mono text-[10px] text-muted-foreground/60 truncate max-w-[120px]">{a.owner_id.slice(0, 8)}…</td>
                              <td className="py-2 px-3 text-muted-foreground/70">{new Date(a.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        {!adminLoading && adminAgents.length === 0 && (
                          <tr><td colSpan={7} className="py-8 text-center text-muted-foreground/60 text-[11px]">No agents yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-xl border border-border/25 bg-card/30 p-4 max-h-[70vh] overflow-y-auto">
                  {adminSelected ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/60">Agent</p>
                        <p className="text-sm font-extralight text-foreground mt-0.5">{adminSelected.name}</p>
                      </div>
                      <div>
                        <p className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/60">Description / Function</p>
                        <p className="text-[11px] font-light text-foreground/85 leading-relaxed mt-1 whitespace-pre-wrap">{adminSelected.description || "(no description)"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-muted-foreground/80">
                        <div><span className="text-muted-foreground/50">id:</span> {adminSelected.id.slice(0, 12)}…</div>
                        <div><span className="text-muted-foreground/50">version:</span> v{adminSelected.version}</div>
                        <div><span className="text-muted-foreground/50">visibility:</span> {adminSelected.visibility}</div>
                        <div><span className="text-muted-foreground/50">status:</span> {adminSelected.status}</div>
                        <div><span className="text-muted-foreground/50">installs:</span> {adminSelected.install_count}</div>
                        <div><span className="text-muted-foreground/50">category:</span> {adminSelected.category}</div>
                      </div>
                      <div>
                        <p className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/60">Owner ID</p>
                        <p className="text-[10px] font-mono text-muted-foreground/85 mt-0.5 break-all">{adminSelected.owner_id}</p>
                      </div>
                      {adminSelected.metadata && Object.keys(adminSelected.metadata).length > 0 && (
                        <details className="rounded-lg border border-border/25 bg-background/40">
                          <summary className="px-3 py-2 cursor-pointer text-[10px] tracking-[0.25em] uppercase text-muted-foreground/70">Metadata</summary>
                          <pre className="px-3 pb-3 pt-1 text-[10px] font-mono text-muted-foreground/70 overflow-auto">{JSON.stringify(adminSelected.metadata, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] font-extralight text-muted-foreground/60">Select an agent to inspect its description and function.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {viewTab === "workflow" && (
            <div className="mx-auto max-w-5xl px-8 py-8 space-y-6">
              {/* Status header */}
              <div className="rounded-xl border border-border/25 bg-card/40 backdrop-blur-xl p-5 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className={`relative flex h-2 w-2`}>
                    {activeAgent?.status === "live" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${activeAgent?.status === "live" ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                  </span>
                  <p className="text-[11px] font-light tracking-[0.3em] text-foreground uppercase">
                    {activeAgent?.status === "live" ? "Agent Live" : "Agent Idle"}
                  </p>
                  <span className="text-[9px] font-mono text-muted-foreground/60">
                    {liveRuns.filter(r => r.status === "running").length} running · {liveRuns.filter(r => r.status === "ok").length} ok · {liveRuns.filter(r => r.status === "failed").length} failed
                  </span>
                </div>
                {activeAgent?.status === "live" ? (
                  <button onClick={stopLive} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-[10px] tracking-[0.25em] uppercase">
                    <Square className="h-3 w-3" /> Pause
                  </button>
                ) : (
                  <button onClick={openPublish} disabled={!passes.length || missingSecrets.length > 0}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-30 px-3 py-1.5 text-[10px] tracking-[0.25em] uppercase">
                    <Rocket className="h-3 w-3" /> Publish &amp; Deploy
                  </button>
                )}
              </div>

              {/* Modern flow diagram */}
              <section className="rounded-xl border border-border/25 bg-card/30 backdrop-blur-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <GitFork className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Automated Flow</p>
                  <span className="ml-auto text-[9px] font-mono text-muted-foreground/50">
                    trigger · {workflowSteps.length} step{workflowSteps.length === 1 ? "" : "s"} · output
                  </span>
                </div>
                {workflowSteps.length === 0 ? (
                  <p className="text-[11px] font-extralight text-muted-foreground/70">Build the agent first — workflow steps will be parsed from the AI's WORKFLOW section.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="flex items-stretch gap-2 min-w-max py-2">
                      {/* trigger node */}
                      <div className="flex flex-col items-center justify-center rounded-xl border border-foreground/30 bg-foreground/5 px-4 py-3 min-w-[140px]">
                        <Radio className="h-3.5 w-3.5 text-foreground/80 mb-1" strokeWidth={1.5} />
                        <p className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground/70">Trigger</p>
                        <p className="text-[11px] font-mono text-foreground/90 mt-0.5 truncate max-w-[120px]" title={activeAgent?.trigger}>{activeAgent?.trigger || "manual"}</p>
                      </div>
                      {workflowSteps.map((s, i) => {
                        const activeRun = liveRuns.find(r => r.status === "running");
                        const stepHit = activeRun ? activeRun.log.some(l => l.includes(`step ${s.n} `)) : false;
                        return (
                          <div key={s.n} className="flex items-center">
                            <div className="flex flex-col items-center px-1">
                              <div className="h-px w-6 bg-border/40" />
                              <ChevronRight className="h-3 w-3 text-muted-foreground/40 -mt-1.5" />
                            </div>
                            <div className={`flex flex-col rounded-xl border px-3 py-2.5 min-w-[160px] max-w-[220px] transition-all ${stepHit ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_24px_-8px_hsl(var(--foreground)/0.4)]" : "border-border/30 bg-background/40"}`}>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[8px] font-mono text-muted-foreground/60">{String(s.n).padStart(2, "0")}</span>
                                {stepHit && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                              </div>
                              <p className="text-[10.5px] font-light text-foreground/90 leading-snug mt-1">{s.label}</p>
                            </div>
                            {i === workflowSteps.length - 1 && (
                              <>
                                <div className="flex flex-col items-center px-1">
                                  <div className="h-px w-6 bg-border/40" />
                                  <ChevronRight className="h-3 w-3 text-muted-foreground/40 -mt-1.5" />
                                </div>
                                <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 min-w-[140px]">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80 mb-1" strokeWidth={1.5} />
                                  <p className="text-[9px] tracking-[0.25em] uppercase text-muted-foreground/70">Output</p>
                                  <p className="text-[11px] font-mono text-foreground/80 mt-0.5">delivered</p>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {/* Live runs */}
              <section className="rounded-xl border border-border/25 bg-card/30 backdrop-blur-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Live Runs</p>
                </div>
                {liveRuns.length === 0 ? (
                  <p className="text-[11px] font-extralight text-muted-foreground/70">No runs yet. Deploy the agent to start the live execution loop.</p>
                ) : (
                  <div className="space-y-2 max-h-[480px] overflow-y-auto">
                    {liveRuns.map((r) => (
                      <div key={r.id} className="rounded-lg border border-border/20 bg-background/40 p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            {r.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-foreground/70" />}
                            {r.status === "ok" && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                            {r.status === "failed" && <AlertCircle className="h-3 w-3 text-red-400" />}
                            <span className="font-mono text-[10px] text-foreground/85">{r.id}</span>
                          </div>
                          <span className="text-[9px] font-mono text-muted-foreground/50">
                            {new Date(r.startedAt).toLocaleTimeString()}
                            {r.endedAt ? ` · ${((r.endedAt - r.startedAt) / 1000).toFixed(1)}s` : ""}
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-muted-foreground/80 space-y-0.5 max-h-[120px] overflow-y-auto">
                          {r.log.map((l, i) => <div key={i}>{l}</div>)}
                          {r.status === "running" && r.log.length === 0 && <div className="opacity-60">spawning…</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {viewTab === "compliance" && (
          <div className="mx-auto max-w-5xl px-8 py-8 space-y-6">
        {/* Pillars */}
        <section>
          <p className="mb-4 text-[10px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">— Pillars</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PILLARS.map(({ icon: Icon, label, desc }) => (
              <div key={label} className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-xl p-5 hover:border-foreground/30 transition-colors">
                <div className="flex items-center gap-2.5 mb-2">
                  <Icon className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">{label}</p>
                </div>
                <p className="text-xs font-extralight text-muted-foreground/80 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Capabilities */}
        <section>
          <p className="mb-4 text-[10px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">— Capabilities</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CAPABILITIES.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">{label}</p>
                </div>
                <p className="text-[11px] font-extralight text-muted-foreground/80 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Classification system */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileLock2 className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
            <p className="text-[10px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">— Classification System</p>
          </div>
          <div className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-xl overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/20 text-[9px] font-light tracking-[0.25em] text-muted-foreground/70 uppercase">
                  <th className="text-left px-4 py-2.5 w-44">Tier</th>
                  <th className="text-left px-4 py-2.5">Definition</th>
                </tr>
              </thead>
              <tbody>
                {CLASSIFICATIONS.map((c) => (
                  <tr key={c.tier} className="border-b border-border/10 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-foreground/90">{c.tier}</td>
                    <td className="px-4 py-2.5 font-extralight text-muted-foreground/85">{c.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] font-extralight text-muted-foreground/60 leading-relaxed">
            Compartments enforced at the workflow level (NOFORN, FVEY, NATO, ORCON). Cross-domain solutions
            and declassification workflows auto-generated per OADR rules.
          </p>
        </section>

        {/* Intelligence disciplines */}
        <section>
          <p className="mb-4 text-[10px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">— Intelligence Disciplines</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {INTEL_DISCIPLINES.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">{label}</p>
                </div>
                <p className="text-[11px] font-extralight text-muted-foreground/80 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Air-gap + audit */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Server className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
              <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Air-Gap Deployment</p>
            </div>
            <ul className="space-y-2 text-[11px] font-extralight text-muted-foreground/85 leading-relaxed">
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Zero external connections — sneakernet ingress with GPG-verified media.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> ClamAV + YARA scan on every imported artefact before isolation.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Manual update channel — signed bundles, multi-officer approval.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Local-only telemetry. Zero outbound reporting.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Database className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
              <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Immutable Audit Chain</p>
            </div>
            <ul className="space-y-2 text-[11px] font-extralight text-muted-foreground/85 leading-relaxed">
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> SHA-256 blockchain-linked events — tamper-evident from genesis.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> HSM-signed records, append-only DB + WORM cold storage.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Captures who/what/where/why/result + clearance + badge + facility.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Chain integrity verifier on demand for any event ID.</li>
            </ul>
          </div>
        </section>

        {/* Compliance matrix */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Award className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
            <p className="text-[10px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">— Compliance Matrix</p>
          </div>
          <div className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-xl overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/20 text-[9px] font-light tracking-[0.25em] text-muted-foreground/70 uppercase">
                  <th className="text-left px-4 py-2.5 w-32">Standard</th>
                  <th className="text-left px-4 py-2.5 w-64">Requirement</th>
                  <th className="text-left px-4 py-2.5">Implementation</th>
                </tr>
              </thead>
              <tbody>
                {COMPLIANCE.map((c) => (
                  <tr key={c.std} className="border-b border-border/10 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-foreground/90">{c.std}</td>
                    <td className="px-4 py-2.5 font-extralight text-muted-foreground/85">{c.req}</td>
                    <td className="px-4 py-2.5 font-extralight text-muted-foreground/75">{c.impl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Emergency protocols */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
            <p className="text-[10px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">— Emergency Protocols</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {EMERGENCY.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="rounded-xl border border-red-500/20 bg-card/30 backdrop-blur-xl p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon className="h-3.5 w-3.5 text-red-400/80" strokeWidth={1.5} />
                  <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">{label}</p>
                </div>
                <p className="text-[11px] font-extralight text-muted-foreground/85 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Multi-tenant + RTOC */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
              <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Multi-Tenant Isolation</p>
            </div>
            <ul className="space-y-2 text-[11px] font-extralight text-muted-foreground/85 leading-relaxed">
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Dedicated DB schema + unique HSM-held encryption key per agency.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Dedicated compute nodes auto-provisioned at SECRET and above.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Network isolation, geo-pinned data residency, separate backup vaults.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Network className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
              <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Realtime Operations Center</p>
            </div>
            <ul className="space-y-2 text-[11px] font-extralight text-muted-foreground/85 leading-relaxed">
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Live workflow board scoped by clearance — SECRET / TS channels.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Threat board, asset tracking, secure-comms activity in one pane.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> WebSocket push at 5-second cadence, classified subscription model.</li>
            </ul>
          </div>
        </section>

        {/* Government integrations + biometric */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
              <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Government Systems</p>
            </div>
            <div className="space-y-1.5">
              {GOV_INTEGRATIONS.map((g) => (
                <div key={g.name} className="flex items-center justify-between text-[11px] font-extralight border-b border-border/10 last:border-0 pb-1.5 last:pb-0">
                  <span className="font-mono text-foreground/90">{g.name}</span>
                  <span className="text-muted-foreground/70">{g.tier}</span>
                  <span className="text-muted-foreground/60">{g.kind}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border/20 bg-card/30 backdrop-blur-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Fingerprint className="h-3.5 w-3.5 text-foreground/70" strokeWidth={1.5} />
              <p className="text-[10px] font-light tracking-[0.3em] text-foreground uppercase">Biometric & Two-Person Auth</p>
            </div>
            <ul className="space-y-2 text-[11px] font-extralight text-muted-foreground/85 leading-relaxed">
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> CAC / PIV smart-card authentication with revocation-list checks.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Fingerprint + iris verification with full audit trail.</li>
              <li className="flex gap-2"><ChevronRight className="h-3 w-3 mt-0.5 text-foreground/50 flex-shrink-0" strokeWidth={1.5} /> Two-person integrity: dual auth + geolocation proximity for critical ops.</li>
            </ul>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/15 pt-6 flex items-center justify-between flex-wrap gap-3">
          <p className="text-[9px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">House of Asher · Zahten Engine · Standby</p>
          <p className="text-[9px] font-light tracking-[0.3em] text-muted-foreground/60 uppercase">Apache 2.0 · Self-Hostable · Air-Gappable</p>
        </footer>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AsherZahtenModule;
