import { useState, useEffect, useCallback } from "react";
import { X, Plus, Pencil, Trash2, Save, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProfileData {
  company_name: string;
  industry: string;
  competitors: string[];
  key_markets: string[];
  technology_stack: string[];
  investment_interests: string[];
  tracked_people: string[];
  regulatory_bodies: string[];
  custom_topics: string[];
}

const FIELD_CONFIG: { key: keyof ProfileData; label: string; type: "text" | "array"; placeholder: string }[] = [
  { key: "company_name", label: "Company Name", type: "text", placeholder: "e.g. Acme Corp" },
  { key: "industry", label: "Industry", type: "text", placeholder: "e.g. Cybersecurity" },
  { key: "competitors", label: "Competitors", type: "array", placeholder: "Add a competitor..." },
  { key: "key_markets", label: "Key Markets", type: "array", placeholder: "Add a market..." },
  { key: "technology_stack", label: "Technology Stack", type: "array", placeholder: "Add a technology..." },
  { key: "investment_interests", label: "Investment Interests", type: "array", placeholder: "Add an interest..." },
  { key: "tracked_people", label: "Tracked People", type: "array", placeholder: "Add a person..." },
  { key: "regulatory_bodies", label: "Regulatory Bodies", type: "array", placeholder: "Add a body..." },
  { key: "custom_topics", label: "Custom Topics", type: "array", placeholder: "Add a topic..." },
];

interface BriefingProfileEditorProps {
  onClose: () => void;
  onSaved: () => void;
}

const BriefingProfileEditor = ({ onClose, onSaved }: BriefingProfileEditorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData>({
    company_name: "", industry: "", competitors: [], key_markets: [],
    technology_stack: [], investment_interests: [], tracked_people: [],
    regulatory_bodies: [], custom_topics: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newItems, setNewItems] = useState<Record<string, string>>({});

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("briefing_profiles").select("*").eq("user_id", user.id).single();
    if (data) {
      setProfile({
        company_name: data.company_name || "",
        industry: data.industry || "",
        competitors: data.competitors || [],
        key_markets: data.key_markets || [],
        technology_stack: data.technology_stack || [],
        investment_interests: data.investment_interests || [],
        tracked_people: data.tracked_people || [],
        regulatory_bodies: data.regulatory_bodies || [],
        custom_topics: data.custom_topics || [],
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const updateTextField = (key: keyof ProfileData, value: string) => {
    setProfile(p => ({ ...p, [key]: value }));
  };

  const addArrayItem = (key: keyof ProfileData) => {
    const val = newItems[key]?.trim();
    if (!val) return;
    const current = profile[key] as string[];
    if (current.includes(val)) return;
    setProfile(p => ({ ...p, [key]: [...(p[key] as string[]), val] }));
    setNewItems(prev => ({ ...prev, [key]: "" }));
  };

  const removeArrayItem = (key: keyof ProfileData, index: number) => {
    setProfile(p => ({ ...p, [key]: (p[key] as string[]).filter((_, i) => i !== index) }));
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("briefing_profiles")
      .update(profile)
      .eq("user_id", user.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated", description: "Your briefing intelligence sources have been updated." });
      onSaved();
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col h-full">
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-border/20">
        <button onClick={onClose} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Briefings
        </button>
        <button
          onClick={saveProfile}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-accent text-accent-foreground px-4 py-2 text-xs font-light hover:bg-accent/90 transition-all disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Changes
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          <div>
            <h2 className="text-sm font-light tracking-wide text-foreground mb-1">Edit Intelligence Profile</h2>
            <p className="text-[10px] text-muted-foreground font-extralight">Add, edit, or remove topics, competitors, people, and more. Changes affect future briefings.</p>
          </div>

          {FIELD_CONFIG.map(field => (
            <div key={field.key} className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-4 space-y-3">
              <label className="text-xs font-light text-foreground tracking-wide">{field.label}</label>

              {field.type === "text" ? (
                <input
                  value={profile[field.key] as string}
                  onChange={(e) => updateTextField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-border/20 bg-background/30 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/30"
                />
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(profile[field.key] as string[]).map((item, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-border/20 bg-background/20 px-2.5 py-1 text-[10px] text-foreground font-extralight group">
                        {item}
                        <button
                          onClick={() => removeArrayItem(field.key, i)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    {(profile[field.key] as string[]).length === 0 && (
                      <span className="text-[10px] text-muted-foreground/50 font-extralight italic">No items added</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      value={newItems[field.key] || ""}
                      onChange={(e) => setNewItems(prev => ({ ...prev, [field.key]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addArrayItem(field.key); } }}
                      placeholder={field.placeholder}
                      className="flex-1 rounded-lg border border-border/20 bg-background/30 px-3 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-accent/30"
                    />
                    <button
                      onClick={() => addArrayItem(field.key)}
                      className="rounded-lg border border-border/20 p-1.5 text-muted-foreground hover:text-accent hover:border-accent/30 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default BriefingProfileEditor;
