import { useEffect, useState } from "react";
import { Users, Plus, Trash2, Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "analyst" | "viewer";
  status: "invited" | "active" | "suspended";
  invited_at: string;
  last_active_at: string | null;
}

const ROLES: { value: Member["role"]; label: string; desc: string }[] = [
  { value: "admin",   label: "Admin",   desc: "Full control — scans, findings, settings, team" },
  { value: "analyst", label: "Analyst", desc: "Run scans, triage findings, export reports" },
  { value: "viewer",  label: "Viewer",  desc: "Read-only access to dashboards & reports" },
];

const TeamScreen = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Member["role"]>("analyst");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("zerlal_team_members")
      .select("*")
      .order("invited_at", { ascending: false });
    if (error) toast({ title: "Failed to load team", description: error.message, variant: "destructive" });
    setMembers((data ?? []) as Member[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const invite = async () => {
    if (!user) return;
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast({ title: "Invalid email", variant: "destructive" }); return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("zerlal_team_members").insert({
      owner_id: user.id, email: e, name: name.trim() || null, role,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Failed", description: error.message.includes("duplicate") ? "Already invited" : error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Invitation sent", description: e });
    setEmail(""); setName(""); setRole("analyst"); setComposing(false);
    load();
  };

  const updateRole = async (id: string, newRole: Member["role"]) => {
    const { error } = await supabase.from("zerlal_team_members").update({ role: newRole }).eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else load();
  };

  const updateStatus = async (id: string, newStatus: Member["status"]) => {
    const { error } = await supabase.from("zerlal_team_members").update({ status: newStatus }).eq("id", id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("zerlal_team_members").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-foreground/70" strokeWidth={1.4} />
              <h2 className="text-sm font-light tracking-[0.15em] text-foreground/90 uppercase">Team Management</h2>
            </div>
            <p className="text-[11px] font-light text-muted-foreground/60">
              Invite analysts to your ZERLAL workspace. Roles control what they can see and do.
            </p>
          </div>
          {!composing && (
            <button onClick={() => setComposing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground/[0.06] border border-border/[0.1] text-[10px] text-foreground/70 hover:bg-foreground/[0.1]">
              <Plus className="h-3 w-3" /> Invite Member
            </button>
          )}
        </div>

        {composing && (
          <div className="mb-6 rounded-2xl border border-border/15 bg-card/30 backdrop-blur-md p-5 space-y-3">
            <p className="text-[10px] font-light tracking-[0.25em] text-muted-foreground/70 uppercase">New Invitation</p>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@org.com"
              className="w-full bg-transparent border-b border-border/20 pb-2 text-sm font-light text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-foreground/40" />
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Display name (optional)"
              className="w-full bg-transparent border-b border-border/20 pb-2 text-sm font-light text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-foreground/40" />
            <div className="grid grid-cols-3 gap-2 pt-2">
              {ROLES.map(r => (
                <button key={r.value} onClick={() => setRole(r.value)}
                  className={`text-left rounded-xl border p-3 transition-all ${
                    role === r.value ? "border-foreground/40 bg-foreground/[0.06]" : "border-border/15 bg-card/20 hover:border-border/30"
                  }`}>
                  <p className="text-[11px] font-light text-foreground/90">{r.label}</p>
                  <p className="text-[9px] font-light text-muted-foreground/60 leading-relaxed mt-0.5">{r.desc}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-border/10">
              <button onClick={() => { setComposing(false); setEmail(""); setName(""); }}
                className="text-[10px] font-light tracking-[0.2em] text-muted-foreground/70 hover:text-foreground uppercase">Cancel</button>
              <button onClick={invite} disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/30 bg-foreground/10 px-3 py-1.5 text-[10px] font-light tracking-[0.2em] text-foreground hover:bg-foreground/20 uppercase disabled:opacity-50">
                {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />} Send Invite
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" /></div>
        ) : members.length === 0 ? (
          <div className="rounded-2xl border border-border/15 bg-card/20 p-12 text-center">
            <Users className="h-6 w-6 text-muted-foreground/30 mx-auto mb-3" strokeWidth={1.2} />
            <p className="text-[12px] font-light text-muted-foreground/60">No team members yet. Invite your first analyst.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {members.map(m => (
              <div key={m.id} className="rounded-xl border border-border/15 bg-card/30 backdrop-blur-md p-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-foreground/[0.05] border border-border/[0.08] flex items-center justify-center text-[11px] font-light text-foreground/70 uppercase">
                  {(m.name?.[0] ?? m.email[0])}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-light text-foreground truncate">{m.name ?? m.email.split("@")[0]}</p>
                  <p className="text-[10px] font-light text-muted-foreground/60 truncate">{m.email}</p>
                </div>
                <select value={m.role} onChange={e => updateRole(m.id, e.target.value as Member["role"])}
                  className="bg-card/40 border border-border/20 rounded-md text-[10px] font-light text-foreground/80 px-2 py-1 outline-none">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <select value={m.status} onChange={e => updateStatus(m.id, e.target.value as Member["status"])}
                  className="bg-card/40 border border-border/20 rounded-md text-[10px] font-light text-foreground/80 px-2 py-1 outline-none">
                  <option value="invited">Invited</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
                <button onClick={() => remove(m.id)} className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground/40 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamScreen;
