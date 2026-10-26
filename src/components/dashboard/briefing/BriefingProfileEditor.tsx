/**
 * asherin.briefing — the form view of the profile.
 *
 * The same nine fields the setup conversation fills, editable by hand. It
 * works without a model key: saving writes the local `briefing_profiles` row
 * (insert when there is none yet, update otherwise).
 */
import { useState } from "react";
import { X, Plus, Save, Loader2, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EMPTY_PROFILE, PROFILE_LABELS, PROFILE_LIST_KEYS, normalizeProfile, profileIsUsable, type BriefingProfile, type ProfileListKey } from "./briefingEngine";
import { saveProfile, type ProfileRow } from "./briefingStore";

const LIST_PLACEHOLDER: Record<ProfileListKey, string> = {
  competitors: "add a competitor",
  key_markets: "add a market or region",
  technology_stack: "add a technology",
  investment_interests: "add an interest",
  tracked_people: "add a person",
  regulatory_bodies: "add a regulator",
  custom_topics: "add a topic",
};

interface Props {
  initial: BriefingProfile | null;
  onClose: () => void;
  onSaved: (row: ProfileRow) => void;
}

const BriefingProfileEditor = ({ initial, onClose, onSaved }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<BriefingProfile>(() => normalizeProfile(initial ?? EMPTY_PROFILE));
  const [saving, setSaving] = useState(false);
  const [newItems, setNewItems] = useState<Partial<Record<ProfileListKey, string>>>({});

  const addItem = (key: ProfileListKey) => {
    const val = newItems[key]?.trim();
    if (!val) return;
    setProfile((p) => (p[key].some((x) => x.toLowerCase() === val.toLowerCase()) ? p : { ...p, [key]: [...p[key], val] }));
    setNewItems((prev) => ({ ...prev, [key]: "" }));
  };

  const removeItem = (key: ProfileListKey, index: number) => {
    setProfile((p) => ({ ...p, [key]: p[key].filter((_, i) => i !== index) }));
  };

  const usable = profileIsUsable(profile);

  const save = async () => {
    if (!user || saving) return;
    if (!usable) {
      toast({ title: "not enough to watch", description: "name a company or field, and add at least one item to a list.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const row = await saveProfile(user.id, profile);
      toast({ title: "profile saved", description: "the next briefing uses it." });
      onSaved(row);
    } catch (e) {
      toast({ title: "could not save the profile", description: e instanceof Error ? e.message : "unknown error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-border/20 bg-background/30 px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-accent/30";

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/20 p-3 sm:p-4">
        <button onClick={onClose} className="flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> back
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-light text-accent-foreground transition-all hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          save profile
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
          <div>
            <h2 className="mb-1 text-sm font-light tracking-wide text-foreground">what the briefing watches</h2>
            <p className="text-[11px] font-extralight text-muted-foreground">
              a company or field plus at least one list is enough. everything stays on this device; shepherd reads it only when writing a briefing.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 rounded-xl border border-border/20 bg-card/20 p-4">
              <span className="text-xs font-light tracking-wide text-foreground">{PROFILE_LABELS.company_name}</span>
              <input value={profile.company_name} onChange={(e) => setProfile((p) => ({ ...p, company_name: e.target.value }))} placeholder="e.g. your company, or the project you run" className={inputClass} />
            </label>
            <label className="space-y-2 rounded-xl border border-border/20 bg-card/20 p-4">
              <span className="text-xs font-light tracking-wide text-foreground">{PROFILE_LABELS.industry}</span>
              <input value={profile.industry} onChange={(e) => setProfile((p) => ({ ...p, industry: e.target.value }))} placeholder="e.g. cybersecurity, shipping, biotech" className={inputClass} />
            </label>
          </div>

          {PROFILE_LIST_KEYS.map((key) => (
            <div key={key} className="space-y-3 rounded-xl border border-border/20 bg-card/20 p-4">
              <p className="text-xs font-light tracking-wide text-foreground">{PROFILE_LABELS[key]}</p>
              <div className="flex flex-wrap gap-2">
                {profile[key].map((item, i) => (
                  <span key={`${item}-${i}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border/20 bg-background/20 px-2.5 py-1 text-[11px] font-extralight text-foreground">
                    {item}
                    <button onClick={() => removeItem(key, i)} className="text-muted-foreground transition-colors hover:text-destructive" aria-label={`remove ${item}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {profile[key].length === 0 && <span className="text-[11px] font-extralight italic text-muted-foreground/60">nothing tracked here</span>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={newItems[key] ?? ""}
                  onChange={(e) => setNewItems((prev) => ({ ...prev, [key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(key);
                    }
                  }}
                  placeholder={LIST_PLACEHOLDER[key]}
                  aria-label={LIST_PLACEHOLDER[key]}
                  className={`${inputClass} flex-1 py-1.5 text-[11px]`}
                />
                <button onClick={() => addItem(key)} className="rounded-lg border border-border/20 p-2 text-muted-foreground transition-colors hover:border-accent/30 hover:text-accent" aria-label={LIST_PLACEHOLDER[key]}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {!usable && (
            <p className="text-[11px] font-extralight text-muted-foreground">
              to save: name a {PROFILE_LABELS.company_name} or {PROFILE_LABELS.industry}, and add at least one item to any list.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default BriefingProfileEditor;
