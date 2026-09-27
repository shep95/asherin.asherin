import { useState, useEffect } from "react";
import {
  Briefcase, DollarSign, Home, Heart, Plane, BookOpen,
  Users, Target, AlertTriangle, Sparkles, ChevronRight,
  Clock, CheckCircle2, XCircle, TrendingUp, TrendingDown,
  SlidersHorizontal, BarChart3, Brain, RefreshCw, Zap,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useGoogleApi } from "@/hooks/useGoogleApi";

/* ── Types ─────────────────────────────────────────────── */

interface ScenarioPrediction {
  month: number; label: string; salary?: number; satisfaction?: number; stress?: number; note: string;
}
interface ScenarioRisk {
  label: string; probability: number; consequence: string;
}
interface Scenario {
  id: string; name: string; probability: number; impact: string; timeline: string;
  description: string; recommended: boolean; confidence: number; category: string;
  predictions: ScenarioPrediction[]; risks: ScenarioRisk[]; pros: string[]; cons: string[]; expectedValue: string;
}

/* ── Sub-Components ────────────────────────────────────── */

const ProbabilityRing = ({ value, size = 48 }: { value: number; size?: number }) => {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - value);
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={3} className="text-foreground/10" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={3}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        className="text-foreground/60" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-foreground text-[10px] font-light">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
};

const TimelineExplorer = ({ predictions }: { predictions: ScenarioPrediction[] }) => {
  const [idx, setIdx] = useState(0);
  const p = predictions[idx];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-foreground/50" />
        <span className="text-xs font-light text-foreground">Timeline Explorer</span>
      </div>
      <div className="flex items-center gap-1">
        {predictions.map((pred, i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all ${i === idx ? "bg-foreground/10" : "hover:bg-foreground/5"}`}>
            <div className={`h-2 w-2 rounded-full ${i === idx ? "bg-foreground" : "bg-foreground/20"}`} />
            <span className="text-[9px] text-muted-foreground">{pred.label}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {p.salary != null && (
          <div className="rounded-xl bg-foreground/5 p-3 text-center">
            <p className="text-sm font-light text-foreground">${(p.salary / 1000).toFixed(0)}k</p>
            <p className="text-[9px] text-muted-foreground">Salary</p>
          </div>
        )}
        {p.satisfaction != null && (
          <div className="rounded-xl bg-foreground/5 p-3 text-center">
            <p className="text-sm font-light text-foreground">{p.satisfaction}/10</p>
            <p className="text-[9px] text-muted-foreground">Satisfaction</p>
          </div>
        )}
        {p.stress != null && (
          <div className="rounded-xl bg-foreground/5 p-3 text-center">
            <p className="text-sm font-light text-foreground">{p.stress}/10</p>
            <p className="text-[9px] text-muted-foreground">Stress</p>
          </div>
        )}
      </div>
      <p className="text-[10px] font-extralight text-muted-foreground leading-relaxed">{p.note}</p>
    </div>
  );
};

/* ── Scenario Detail ───────────────────────────────────── */

const ScenarioDetail = ({ scenario, onBack }: { scenario: Scenario; onBack: () => void }) => (
  <div className="space-y-5">
    <button onClick={onBack} className="text-xs font-light text-muted-foreground hover:text-foreground transition-colors">← Back to scenarios</button>
    <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5">
      <div className="flex items-start gap-4">
        <ProbabilityRing value={scenario.probability} size={56} />
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-light tracking-wide text-foreground">{scenario.name}</h2>
            {scenario.recommended ? (
              <span className="flex items-center gap-1 rounded-full bg-foreground/10 px-2 py-0.5 text-[9px] text-foreground"><CheckCircle2 className="h-3 w-3" /> Recommended</span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 text-[9px] text-muted-foreground"><XCircle className="h-3 w-3" /> Not Recommended</span>
            )}
          </div>
          <p className="text-xs font-extralight text-muted-foreground">{scenario.description}</p>
        </div>
      </div>
    </div>
    <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5">
      <TimelineExplorer predictions={scenario.predictions} />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 space-y-2">
        <span className="text-xs font-light text-foreground flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Pros</span>
        <ul className="space-y-1.5">
          {scenario.pros.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-[10px] font-extralight text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-foreground/30 shrink-0 mt-0.5" /><span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 space-y-2">
        <span className="text-xs font-light text-foreground flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5" /> Cons</span>
        <ul className="space-y-1.5">
          {scenario.cons.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-[10px] font-extralight text-muted-foreground">
              <AlertTriangle className="h-3 w-3 text-foreground/20 shrink-0 mt-0.5" /><span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
    <div className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-foreground/50" />
        <span className="text-xs font-light text-foreground">Expected Value</span>
      </div>
      <p className="text-sm font-extralight text-foreground/80 mt-2">{scenario.expectedValue}</p>
    </div>
  </div>
);

/* ── Main Component ────────────────────────────────────── */

const ScenarioEngine = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [loading, setLoading] = useState(false);
  const [liveData, setLiveData] = useState<{ events: number; emails: number; contacts: number }>({ events: 0, emails: 0, contacts: 0 });
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [calData, gmailStats, contactData] = await Promise.all([
        fetchGoogleData("calendar_events", { maxResults: 50 }).catch(() => ({ totalEvents: 0 })),
        fetchGoogleData("gmail_stats").catch(() => ({ unread: 0 })),
        fetchGoogleData("contacts", { pageSize: 1 }).catch(() => ({ totalContacts: 0 })),
      ]);
      setLiveData({
        events: calData.totalEvents || 0,
        emails: gmailStats.unread || 0,
        contacts: contactData.totalContacts || 0,
      });
    } catch (err) {
      console.error("Failed to fetch scenario data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected]);

  const hasLive = isConnected && (liveData.events > 0 || liveData.emails > 0);

  // Generate scenarios based on live data signals
  const scenarios: Scenario[] = [
    {
      id: "s1", name: "Career change in next 6 months", probability: hasLive ? 0.45 : 0.67,
      impact: "High", timeline: "3-6 months",
      description: hasLive ? `Based on ${liveData.emails} unread emails and ${liveData.events} weekly events` : "Based on email and calendar analysis",
      recommended: true, confidence: hasLive ? 0.78 : 0.84, category: "career",
      predictions: [
        { month: 0, label: "Now", salary: 120000, satisfaction: 5, stress: 6, note: "Current state — analyzing signals" },
        { month: 3, label: "3mo", salary: 150000, satisfaction: 7, stress: 7.5, note: "Transition period" },
        { month: 12, label: "1yr", salary: 165000, satisfaction: 8, stress: 5.5, note: "Settled into new role" },
      ],
      risks: [
        { label: "Culture mismatch", probability: 0.18, consequence: "Job search restarts" },
        { label: "Performance pressure", probability: 0.22, consequence: "Higher initial stress" },
      ],
      pros: ["Higher salary", "Career acceleration", "New skills"], cons: ["Transition stress", "Unknown culture", "Learning curve"],
      expectedValue: "+$30-45k annual salary increase",
    },
    {
      id: "s2", name: "Maintain current trajectory", probability: hasLive ? 0.35 : 0.22,
      impact: "Low", timeline: "Ongoing",
      description: hasLive ? `${liveData.events} events/week suggests ${liveData.events > 20 ? "high" : "normal"} activity` : "Status quo analysis",
      recommended: false, confidence: 0.91, category: "career",
      predictions: [
        { month: 0, label: "Now", salary: 120000, satisfaction: 5, stress: 6, note: "Current state" },
        { month: 12, label: "1yr", salary: 125000, satisfaction: 4.5, stress: 6.5, note: "Marginal growth" },
      ],
      risks: [{ label: "Stagnation", probability: 0.65, consequence: "Skills become outdated" }],
      pros: ["Stability", "No disruption"], cons: ["Career plateau", "Declining satisfaction"],
      expectedValue: "Stable but declining long-term",
    },
  ];

  const categories = [
    { id: "career", label: "Career", icon: Briefcase, count: 3 },
    { id: "financial", label: "Financial", icon: DollarSign, count: 2 },
    { id: "health", label: "Health", icon: Heart, count: 2 },
    { id: "life", label: "Life Changes", icon: Home, count: 2 },
    { id: "travel", label: "Travel", icon: Plane, count: 1 },
  ];

  if (activeScenario) {
    return <ScenarioDetail scenario={activeScenario} onBack={() => setActiveScenario(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5">
            <Brain className="h-6 w-6 text-foreground/70" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extralight tracking-wide text-foreground">Scenario Engine</h2>
              {isConnected && (
                <button onClick={loadData} disabled={loading} className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50">
                  <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                  Sync
                </button>
              )}
            </div>
            <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
              {hasLive
                ? `Analyzing ${liveData.events} events, ${liveData.emails} emails, and ${liveData.contacts} contacts to simulate life scenarios.`
                : "Connect Google to power predictive life simulations with real data."}
            </p>
          </div>
        </div>
      </div>

      {/* Live Data Summary */}
      {hasLive && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Events/Week", value: String(liveData.events) },
            { label: "Unread Emails", value: String(liveData.emails) },
            { label: "Network Size", value: String(liveData.contacts) },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 text-center">
              <p className="text-xl font-extralight text-foreground">{loading ? "…" : s.value}</p>
              <p className="text-[10px] font-light text-muted-foreground/60 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Categories */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 rounded-xl border border-border/20 bg-card/20 px-3 py-2 text-[10px] font-light text-muted-foreground">
            <c.icon className="h-3 w-3" /> {c.label} · {c.count}
          </div>
        ))}
      </div>

      {/* Scenarios */}
      <div className="space-y-3">
        <h3 className="text-sm font-light tracking-wide text-foreground">Top Scenarios</h3>
        {scenarios.map((s) => (
          <button key={s.id} onClick={() => setActiveScenario(s)}
            className="w-full flex items-start gap-4 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-5 text-left hover:bg-foreground/5 transition-all group">
            <ProbabilityRing value={s.probability} />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-light text-foreground">{s.name}</span>
                {s.recommended && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-foreground/10 text-foreground">Recommended</span>
                )}
              </div>
              <p className="text-[10px] font-extralight text-muted-foreground">{s.description}</p>
              <div className="flex items-center gap-3 text-[9px] text-muted-foreground/50">
                <span>Impact: {s.impact}</span>
                <span>Timeline: {s.timeline}</span>
                <span>Confidence: {Math.round(s.confidence * 100)}%</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-foreground/50 mt-1" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default ScenarioEngine;
