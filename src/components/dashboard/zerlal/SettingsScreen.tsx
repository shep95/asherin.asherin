import { useEffect, useState } from "react";
import { Shield, Save, Loader2, Bell, Clock, Database, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Settings {
  scan_frequency: "hourly" | "daily" | "weekly" | "manual";
  severity_threshold: "low" | "medium" | "high" | "critical";
  alert_email: string | null;
  slack_webhook: string | null;
  auto_remediation: boolean;
  retention_days: number;
  weekly_report: boolean;
  notify_critical: boolean;
}

const DEFAULTS: Settings = {
  scan_frequency: "daily",
  severity_threshold: "medium",
  alert_email: "",
  slack_webhook: "",
  auto_remediation: false,
  retention_days: 90,
  weekly_report: true,
  notify_critical: true,
};

const SettingsScreen = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("zerlal_settings")
        .select("scan_frequency, severity_threshold, auto_remediation, retention_days, weekly_report, notify_critical")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setS({
        scan_frequency: data.scan_frequency as Settings["scan_frequency"],
        severity_threshold: data.severity_threshold as Settings["severity_threshold"],
        alert_email: "",
        slack_webhook: "",
        auto_remediation: data.auto_remediation,
        retention_days: data.retention_days,
        weekly_report: data.weekly_report,
        notify_critical: data.notify_critical,
      });
      setLoading(false);
    })();
  }, [user?.id]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    // Build payload; only include alert_email / slack_webhook when the user
    // entered a new value this session — leaving them empty preserves the
    // server-stored value (which the client can no longer read back).
    const payload: Record<string, unknown> = {
      user_id: user.id,
      scan_frequency: s.scan_frequency,
      severity_threshold: s.severity_threshold,
      auto_remediation: s.auto_remediation,
      retention_days: s.retention_days,
      weekly_report: s.weekly_report,
      notify_critical: s.notify_critical,
    };
    if (s.alert_email?.trim()) payload.alert_email = s.alert_email.trim();
    if (s.slack_webhook?.trim()) payload.slack_webhook = s.slack_webhook.trim();

    const { error } = await supabase.from("zerlal_settings").upsert(payload as any);
    setSaving(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Settings saved" });
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" /></div>;
  }

  const Section = ({ icon: Icon, title, children }: { icon: typeof Shield; title: string; children: React.ReactNode }) => (
    <div className="rounded-2xl border border-border/15 bg-card/30 backdrop-blur-md p-5 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border/10">
        <Icon className="h-3.5 w-3.5 text-foreground/60" strokeWidth={1.4} />
        <p className="text-[10px] font-light tracking-[0.25em] text-foreground/80 uppercase">{title}</p>
      </div>
      {children}
    </div>
  );

  const Toggle = ({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc: string }) => (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="text-[11px] font-light text-foreground/90">{label}</p>
        <p className="text-[10px] font-light text-muted-foreground/60 mt-0.5">{desc}</p>
      </div>
      <button onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? "bg-foreground/40" : "bg-foreground/10"}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-foreground transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-foreground/70" strokeWidth={1.4} />
              <h2 className="text-sm font-light tracking-[0.15em] text-foreground/90 uppercase">ZERLAL Settings</h2>
            </div>
            <p className="text-[11px] font-light text-muted-foreground/60">Configure scanning cadence, alerts, and data retention.</p>
          </div>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/30 bg-foreground/10 px-3 py-1.5 text-[10px] font-light tracking-[0.2em] text-foreground hover:bg-foreground/20 uppercase disabled:opacity-50">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
          </button>
        </div>

        <Section icon={Clock} title="Scan Cadence">
          <div>
            <label className="text-[10px] font-light text-muted-foreground/70 uppercase tracking-[0.15em]">Scan frequency</label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {(["hourly","daily","weekly","manual"] as const).map(v => (
                <button key={v} onClick={() => setS({ ...s, scan_frequency: v })}
                  className={`px-3 py-2 rounded-lg border text-[10px] font-light uppercase tracking-[0.15em] transition-all ${
                    s.scan_frequency === v ? "border-foreground/40 bg-foreground/[0.06] text-foreground" : "border-border/15 bg-card/20 text-muted-foreground/70 hover:border-border/30"
                  }`}>{v}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-light text-muted-foreground/70 uppercase tracking-[0.15em]">Minimum severity to surface</label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {(["low","medium","high","critical"] as const).map(v => (
                <button key={v} onClick={() => setS({ ...s, severity_threshold: v })}
                  className={`px-3 py-2 rounded-lg border text-[10px] font-light uppercase tracking-[0.15em] transition-all ${
                    s.severity_threshold === v ? "border-foreground/40 bg-foreground/[0.06] text-foreground" : "border-border/15 bg-card/20 text-muted-foreground/70 hover:border-border/30"
                  }`}>{v}</button>
              ))}
            </div>
          </div>
        </Section>

        <Section icon={Bell} title="Alerts & Notifications">
          <div>
            <label className="text-[10px] font-light text-muted-foreground/70 uppercase tracking-[0.15em]">Alert email</label>
            <input type="email" value={s.alert_email ?? ""} onChange={e => setS({ ...s, alert_email: e.target.value })}
              placeholder="alerts@yourdomain.com"
              className="w-full mt-1 bg-transparent border-b border-border/20 pb-2 text-sm font-light text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-foreground/40" />
          </div>
          <div>
            <label className="text-[10px] font-light text-muted-foreground/70 uppercase tracking-[0.15em]">Slack webhook URL</label>
            <input value={s.slack_webhook ?? ""} onChange={e => setS({ ...s, slack_webhook: e.target.value })}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full mt-1 bg-transparent border-b border-border/20 pb-2 text-sm font-light text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-foreground/40" />
          </div>
          <Toggle checked={s.notify_critical} onChange={v => setS({ ...s, notify_critical: v })}
            label="Page on critical findings" desc="Immediate notification when CVSS ≥ 9.0 or active exploit detected" />
          <Toggle checked={s.weekly_report} onChange={v => setS({ ...s, weekly_report: v })}
            label="Weekly executive report" desc="Mondays at 09:00 — risk posture summary delivered to alert email" />
        </Section>

        <Section icon={Zap} title="Automation">
          <Toggle checked={s.auto_remediation} onChange={v => setS({ ...s, auto_remediation: v })}
            label="Auto-remediate low-risk findings" desc="ZERLAL can auto-apply patches for findings below the severity threshold (requires integration)" />
        </Section>

        <Section icon={Database} title="Data Retention">
          <div>
            <label className="text-[10px] font-light text-muted-foreground/70 uppercase tracking-[0.15em]">
              Retain findings for {s.retention_days} days
            </label>
            <input type="range" min={7} max={730} step={1} value={s.retention_days}
              onChange={e => setS({ ...s, retention_days: parseInt(e.target.value) })}
              className="w-full mt-2 accent-foreground/60" />
            <div className="flex justify-between text-[9px] font-light text-muted-foreground/40 uppercase tracking-[0.15em] mt-1">
              <span>7d</span><span>90d</span><span>365d</span><span>730d</span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
};

export default SettingsScreen;
