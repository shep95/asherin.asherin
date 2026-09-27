import { useState, useEffect } from "react";
import {
  Mail, Calendar, DollarSign, Cake, MapPin, Car, Cloud,
  Moon, UtensilsCrossed, Dumbbell, Brain, ToggleRight,
  ToggleLeft, Zap, RefreshCw, Clock,
} from "lucide-react";
import { useGoogleApi } from "@/hooks/useGoogleApi";

interface Automation {
  icon: React.ElementType;
  name: string;
  desc: string;
  trigger: string;
  enabled: boolean;
}

const defaultAutomations: Automation[] = [
  { icon: Mail, name: "Email Auto-Responder", desc: "Auto-replies to emails from priority contacts in your style", trigger: "New email from priority contact", enabled: true },
  { icon: Calendar, name: "Smart Calendar Blocker", desc: "Auto-blocks focus time based on your productivity patterns", trigger: "Monday mornings reserved for deep work", enabled: true },
  { icon: DollarSign, name: "Bill Payment Reminder", desc: "Alerts 3 days before subscription charges", trigger: "3 days before subscription charge", enabled: true },
  { icon: Cake, name: "Birthday Auto-Greeter", desc: "Sends personalized birthday messages to contacts", trigger: "Friend's birthday detected", enabled: false },
  { icon: MapPin, name: "Location-Based Reminders", desc: "Triggers tasks at specific locations", trigger: "When near grocery store", enabled: false },
  { icon: Car, name: "Commute Optimizer", desc: "Suggests best departure time based on traffic + meetings", trigger: "Meeting in 2 hours", enabled: true },
  { icon: Moon, name: "Sleep Schedule Optimizer", desc: "Suggests optimal bedtime based on next-day schedule", trigger: "Based on tomorrow's first event", enabled: true },
  { icon: Dumbbell, name: "Workout Scheduler", desc: "Suggests optimal workout times from fitness patterns", trigger: "Based on step count patterns", enabled: true },
  { icon: Brain, name: "Stress Relief Trigger", desc: "Suggests breaks when high stress is detected", trigger: "Email volume + meeting density spike", enabled: true },
];

const AutomationSuite = () => {
  const { fetchGoogleData, isConnected } = useGoogleApi();
  const [automations, setAutomations] = useState(defaultAutomations);
  const [loading, setLoading] = useState(false);
  const [liveData, setLiveData] = useState<{ events: any[]; unread: number }>({ events: [], unread: 0 });

  const loadData = async () => {
    setLoading(true);
    try {
      const [calData, gmailStats] = await Promise.all([
        fetchGoogleData("calendar_events", { maxResults: 10 }).catch(() => ({ events: [] })),
        fetchGoogleData("gmail_stats").catch(() => ({ unread: 0 })),
      ]);
      setLiveData({ events: calData.events || [], unread: gmailStats.unread || 0 });
    } catch (err) {
      console.error("Failed to fetch automation data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) loadData();
  }, [isConnected]);

  const toggleAutomation = (name: string) => {
    setAutomations((prev) =>
      prev.map((a) => a.name === name ? { ...a, enabled: !a.enabled } : a)
    );
  };

  const enabledCount = automations.filter((a) => a.enabled).length;
  const hasLive = isConnected && (liveData.events.length > 0 || liveData.unread > 0);

  // Generate live automation timeline from real data
  const todayEvents = liveData.events.filter((e) => {
    const d = new Date(e.start);
    return d.toDateString() === new Date().toDateString();
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
          <Zap className="h-6 w-6 text-foreground/70" />
        </div>
        <div className="space-y-1 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-light tracking-wide text-foreground">Life Automation Suite</h3>
            {isConnected && (
              <button onClick={loadData} disabled={loading} className="flex items-center gap-1 rounded-lg bg-foreground/10 px-3 py-1.5 text-[10px] font-light text-foreground hover:bg-foreground/20 transition-all disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                Sync
              </button>
            )}
          </div>
          <p className="text-[10px] font-extralight text-muted-foreground">
            {enabledCount} of {automations.length} automations active
            {hasLive ? ` · ${liveData.unread} unread emails · ${todayEvents.length} events today` : ""}
          </p>
        </div>
      </div>

      {/* Live Today Timeline */}
      {hasLive && todayEvents.length > 0 && (
        <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-5 space-y-3">
          <h3 className="text-sm font-light tracking-wide text-foreground">Today's Smart Timeline (Live)</h3>
          <div className="space-y-2">
            {todayEvents.map((event) => (
              <div key={event.id} className="flex gap-3 py-1.5">
                <span className="text-[10px] font-light text-foreground/40 w-16 shrink-0">
                  {event.isAllDay ? "All Day" : new Date(event.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <div className="w-px bg-foreground/10 shrink-0" />
                <div className="space-y-0.5">
                  <span className="text-xs font-light text-foreground">{event.summary}</span>
                  {event.location && <p className="text-[10px] font-extralight text-muted-foreground">{event.location}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automation Toggles */}
      <div className="space-y-3">
        <h3 className="text-sm font-light tracking-wide text-foreground">All Automations</h3>
        <div className="space-y-2">
          {automations.map((a) => (
            <div key={a.name} className="flex items-center gap-3 rounded-2xl border border-border/20 bg-card/20 backdrop-blur-md p-4 hover:bg-foreground/5 transition-all">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5">
                <a.icon className="h-4 w-4 text-foreground/70" />
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <span className="text-xs font-light text-foreground">{a.name}</span>
                <p className="text-[10px] font-extralight text-muted-foreground">{a.desc}</p>
                <p className="text-[9px] font-extralight text-muted-foreground/40">Trigger: {a.trigger}</p>
              </div>
              <button onClick={() => toggleAutomation(a.name)} className="shrink-0">
                {a.enabled ? (
                  <ToggleRight className="h-6 w-6 text-emerald-400" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-muted-foreground/30" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AutomationSuite;
