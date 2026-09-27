import { useState, useEffect, useMemo } from "react";
import { Key, Plus, Trash2, Check, Loader2, Eye, EyeOff, ChevronDown, Zap, AlertTriangle, Brain, Search, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStepUp } from "@/components/auth/StepUpProvider";

import { useToast } from "@/hooks/use-toast";
import KeyVaultLockCard from "@/components/dashboard/KeyVaultLockCard";
import { AI_PROVIDERS, type ProviderConfig } from "@/lib/aiProviders";

// Re-export for legacy imports — new code should import from "@/lib/aiProviders".
export { AI_PROVIDERS };
export type { ProviderConfig };


/** Presence flags from the key-status edge function. No key material. */
interface KeyStatusRow {
  provider: string;
  byok: boolean;
  platform: boolean;
  effective: boolean;
}

interface StoredKey {
  id: string;
  provider: string;
  is_active: boolean;
  created_at: string;
}

interface ModelPreference {
  active_provider: string;
  active_model: string;
  fallback_to_default: boolean;
}

const AIKeysSettings = () => {
  const { user } = useAuth();
  const stepUp = useStepUp();
  const { toast } = useToast();

  const [storedKeys, setStoredKeys] = useState<StoredKey[]>([]);
  const [preferences, setPreferences] = useState<ModelPreference>({
    active_provider: "default",
    active_model: "default",
    fallback_to_default: true,
  });
  const [loading, setLoading] = useState(true);
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPref, setSavingPref] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Booleans only — the key-status function returns presence flags, never values.
  const [keyStatus, setKeyStatus] = useState<KeyStatusRow[] | null>(null);
  const [keyStatusError, setKeyStatusError] = useState<string | null>(null);

  // Country count is a constant of the static provider catalog — compute once.
  const countryCount = useMemo(() => new Set(AI_PROVIDERS.map(p => p.country)).size, []);

  // Filter + group only when search changes (was recomputed on every keystroke,
  // expand, save, etc. — touching ~50 providers + a fresh Map every render).
  const groupedProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? AI_PROVIDERS.filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.country.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q))
      : AI_PROVIDERS;
    const byCountry = new Map<string, ProviderConfig[]>();
    for (const p of filtered) {
      const arr = byCountry.get(p.country);
      if (arr) arr.push(p); else byCountry.set(p.country, [p]);
    }
    return Array.from(byCountry.entries());
  }, [search]);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  // Presence check. Failure is reported as "offline", never as a fake yes.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("key-status", { body: {} });
        if (cancelled) return;
        if (error) throw error;
        const rows = Array.isArray((data as any)?.providers) ? ((data as any).providers as KeyStatusRow[]) : [];
        setKeyStatus(rows);
        setKeyStatusError(null);
      } catch (e: any) {
        if (cancelled) return;
        setKeyStatus([]);
        setKeyStatusError(String(e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [keysRes, prefRes] = await Promise.all([
      supabase.from("user_api_keys").select("id, provider, is_active, created_at").eq("user_id", user.id),
      supabase.from("user_model_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    setStoredKeys((keysRes.data as StoredKey[]) || []);
    if (prefRes.data) {
      const pref = {
        active_provider: prefRes.data.active_provider || "default",
        active_model: prefRes.data.active_model || "default",
        fallback_to_default: prefRes.data.fallback_to_default ?? true,
      };
      setPreferences(pref);
      localStorage.setItem("aureon_byok_active", JSON.stringify({ provider: pref.active_provider, model: pref.active_model }));
    } else {
      localStorage.setItem("aureon_byok_active", JSON.stringify({ provider: "default", model: "default" }));
    }
    setLoading(false);
  };

  const saveKey = async (providerId: string) => {
    if (!user || !newKeyValue.trim()) return;
    // Writing a provider credential is a dangerous act: a hijacked tab could
    // otherwise silently swap the key every request routes through.
    if (!(await stepUp("save this provider key"))) return;
    setSaving(true);

    const { error } = await supabase.from("user_api_keys").upsert({
      user_id: user.id,
      provider: providerId,
      api_key: newKeyValue.trim(),
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider" });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save key", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "API key saved", description: `${AI_PROVIDERS.find(p => p.id === providerId)?.name} key stored securely.` });
      setNewKeyValue("");
      setAddingProvider(null);
      loadData();
    }
  };

  const deleteKey = async (providerId: string) => {
    if (!user) return;
    const { error } = await supabase.from("user_api_keys").delete().eq("user_id", user.id).eq("provider", providerId);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      // If deleted provider was active, reset to default
      if (preferences.active_provider === providerId) {
        await updatePreference("default", "default");
      }
      toast({ title: "API key removed" });
      loadData();
    }
  };

  const updatePreference = async (provider: string, model: string) => {
    if (!user) return;
    setSavingPref(true);
    const { error } = await supabase.from("user_model_preferences").upsert({
      user_id: user.id,
      active_provider: provider,
      active_model: model,
      fallback_to_default: preferences.fallback_to_default,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSavingPref(false);
    if (error) {
      toast({ title: "Failed to update preference", description: error.message, variant: "destructive" });
    } else {
      setPreferences(prev => ({ ...prev, active_provider: provider, active_model: model }));
      // Sync to localStorage for streamChat to read
      localStorage.setItem("aureon_byok_active", JSON.stringify({ provider, model }));
      const providerName = provider === "default" ? "No model selected" : AI_PROVIDERS.find(p => p.id === provider)?.name;
      toast({ title: "Model updated", description: `Now using ${providerName}${model !== "default" ? ` → ${model}` : ""}` });
    }
  };

  const toggleFallback = async () => {
    if (!user) return;
    const newVal = !preferences.fallback_to_default;
    const { error } = await supabase.from("user_model_preferences").upsert({
      user_id: user.id,
      active_provider: preferences.active_provider,
      active_model: preferences.active_model,
      fallback_to_default: newVal,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (!error) {
      setPreferences(prev => ({ ...prev, fallback_to_default: newVal }));
    }
  };

  const hasKey = (providerId: string) => {
    const cfg = AI_PROVIDERS.find(p => p.id === providerId);
    if (cfg?.isPlatform) return true; // platform providers never need a user key
    return storedKeys.some(k => k.provider === providerId);
  };

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />;

  return (
    <div className="rounded-xl border border-border/20 bg-card/20 backdrop-blur-sm p-5 space-y-5">
      <div className="flex items-center gap-3">
        <Key className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-light text-foreground">AI Model Keys</h3>
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">Bring your own API keys. Aureon never lends out a shared key — every request runs on the keys you add here.</p>
        </div>
      </div>

      {/* Detected key bindings — booleans only. The endpoint returns yes/no per
          provider and never any key material, for BYOK or platform secrets. */}
      <div className="rounded-lg border border-border/15 bg-card/10 p-4">
        <p className="text-xs font-light text-foreground">Detected key bindings</p>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
          Resolution order per call: your saved key → platform key → keyless public source → offline.
          Values are never displayed here.
        </p>
        {keyStatusError ? (
          <p className="text-[10px] text-muted-foreground/50 mt-3">Key status offline — {keyStatusError}</p>
        ) : keyStatus === null ? (
          <p className="text-[10px] text-muted-foreground/40 mt-3">Checking…</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {keyStatus.map((s) => (
              <span
                key={s.provider}
                className={`text-[10px] font-light rounded-md border px-2 py-1 ${
                  s.effective
                    ? "border-border/30 text-foreground/80"
                    : "border-border/15 text-muted-foreground/40"
                }`}
              >
                {s.provider}={s.effective ? "yes" : "no"}
                {s.effective && (
                  <span className="text-muted-foreground/40"> · {s.byok ? "your key" : "platform"}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <KeyVaultLockCard />

      {/* Active Model Display */}
      <div className="rounded-lg border border-border/15 bg-card/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400/70" />
            <div>
              <p className="text-xs font-light text-foreground">Active Model</p>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                {preferences.active_provider === "default"
                  ? "No key selected — pick a provider below"
                  : `${AI_PROVIDERS.find(p => p.id === preferences.active_provider)?.name} → ${preferences.active_model}`
                }
              </p>
            </div>
          </div>
          {savingPref && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />}
        </div>

        <div className="mt-3 pt-3 border-t border-border/10 flex items-start gap-2 text-[10px] text-muted-foreground/60">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-400/60" />
          <span>You can enable multiple providers at once and toggle them per-conversation from the chat header. Aureon does not provide a shared/default key.</span>
        </div>
      </div>

      {/* Provider search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search providers by company or country (e.g. Sarvam, India, Brazil)…"
          className="w-full bg-background/50 border border-border/20 rounded-lg pl-9 pr-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-foreground/30 transition-colors"
        />
      </div>

      {/* Provider list grouped by country */}
      <div className="space-y-4">
        <p className="text-[10px] font-light tracking-wider text-muted-foreground/40 uppercase">Available Providers · {AI_PROVIDERS.length} companies across {countryCount} countries</p>
        {groupedProviders.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/40 px-1 py-4">No providers match “{search}”.</p>
        ) : groupedProviders.map(([country, provs]) => (
            <div key={country} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Globe className="h-3 w-3 text-muted-foreground/40" />
                <p className="text-[10px] font-light tracking-[0.2em] text-muted-foreground/60 uppercase">{country}</p>
                <span className="text-[9px] text-muted-foreground/30">· {provs.length}</span>
              </div>
              {provs.map(provider => {
          const stored = hasKey(provider.id);
          const isActive = preferences.active_provider === provider.id;
          const isExpanded = expandedProvider === provider.id;
          const isAdding = addingProvider === provider.id;

          return (
            <div key={provider.id} className={`rounded-xl border transition-all ${isActive ? "border-foreground/30 bg-foreground/5" : "border-border/15 bg-card/10"}`}>
              {/* Provider header */}
              <button
                onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                className="w-full flex items-center gap-3 p-3"
              >
                <span className="text-lg">{provider.icon}</span>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-light text-foreground">{provider.name}</p>
                    {stored && (
                      <span className="flex items-center gap-1 text-[9px] text-emerald-500/70">
                        <Check className="h-2.5 w-2.5" /> Key Added
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/40 truncate">{provider.models.length} models available</p>
                </div>
                {isActive && <Check className="h-4 w-4 text-emerald-500/70 shrink-0" />}
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/30 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-border/10">
                  {/* Platform provider — no API key required */}
                  {provider.isPlatform && (
                    <div className="mt-2 rounded-lg border border-foreground/15 bg-foreground/5 p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-emerald-400/70" />
                        <p className="text-[11px] font-light text-foreground">Platform-hosted — no key required</p>
                      </div>
                      {provider.platformNote && (
                        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">{provider.platformNote}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/40">
                        <a href={provider.helpUrl} target="_blank" rel="noopener noreferrer" className="text-foreground/60 underline underline-offset-2 hover:text-foreground">{provider.helpText}</a>
                      </p>
                    </div>
                  )}

                  {/* Add/Update key — only for BYOK providers */}
                  {!provider.isPlatform && !isAdding && !stored && (
                    <button
                      onClick={() => { setAddingProvider(provider.id); setNewKeyValue(""); }}
                      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border/20 bg-foreground/5 px-3 py-1.5 text-[11px] font-light text-foreground hover:bg-foreground/10 transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Add API Key
                    </button>
                  )}

                  {!provider.isPlatform && isAdding && (
                    <div className="mt-2 space-y-2">
                      <div className="relative">
                        <input
                          type={showKey ? "text" : "password"}
                          value={newKeyValue}
                          onChange={e => setNewKeyValue(e.target.value)}
                          placeholder={provider.placeholder}
                          className="w-full bg-background/50 border border-border/20 rounded-lg px-3 py-2 pr-10 text-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-foreground/30 transition-colors"
                          autoFocus
                        />
                        <button onClick={() => setShowKey(!showKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground">
                          {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="text-[10px] text-muted-foreground/40">
                        <a href={provider.helpUrl} target="_blank" rel="noopener noreferrer" className="text-foreground/60 underline underline-offset-2 hover:text-foreground">{provider.helpText}</a>
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex items-start gap-1.5 text-[9px] text-amber-400/60">
                          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                          <span>Your key is stored encrypted and never shared. Only used for your requests.</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveKey(provider.id)}
                          disabled={!newKeyValue.trim() || saving}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/10 px-3 py-1.5 text-[11px] font-light text-foreground hover:bg-foreground/15 transition-colors disabled:opacity-30"
                        >
                          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          {saving ? "Saving…" : "Save Key"}
                        </button>
                        <button
                          onClick={() => { setAddingProvider(null); setNewKeyValue(""); }}
                          className="rounded-lg border border-border/20 px-3 py-1.5 text-[11px] font-light text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Key management if stored — BYOK only */}
                  {!provider.isPlatform && stored && !isAdding && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground/40 font-mono">••••••••••••</span>
                      <button
                        onClick={() => { setAddingProvider(provider.id); setNewKeyValue(""); }}
                        className="text-[10px] text-foreground/60 hover:text-foreground underline underline-offset-2 transition-colors"
                      >
                        Update
                      </button>
                      <button
                        onClick={() => deleteKey(provider.id)}
                        className="text-[10px] text-destructive/60 hover:text-destructive transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="h-2.5 w-2.5" /> Remove
                      </button>
                    </div>
                  )}

                  {/* Model selection */}
                  {stored && (
                    <div className="space-y-1.5 mt-2">
                      <p className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Select Model</p>
                      {(() => {
                        const withVision = provider.models.filter(m => m.vision);
                        const textOnly = provider.models.filter(m => !m.vision);
                        const groups = withVision.length && textOnly.length
                          ? [
                              { label: "Text + vision — reads images", models: withVision },
                              { label: "Text only", models: textOnly },
                            ]
                          : [{ label: null as string | null, models: provider.models }];
                        return groups.map(group => (
                          <div key={group.label ?? "all"} className="space-y-1.5">
                            {group.label && (
                              <p className="pt-2 text-[9px] uppercase tracking-wider text-muted-foreground/35">
                                {group.label} · {group.models.length}
                              </p>
                            )}
                            {group.models.map(model => {
                              const isModelActive = isActive && preferences.active_model === model.id;
                              return (
                                <button
                                  key={model.id}
                                  onClick={() => updatePreference(provider.id, model.id)}
                                  className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-all ${
                                    isModelActive
                                      ? "bg-foreground/10 border border-foreground/20"
                                      : "border border-transparent hover:bg-foreground/5"
                                  }`}
                                >
                                  <Brain className={`h-3 w-3 shrink-0 ${isModelActive ? "text-foreground" : "text-muted-foreground/30"}`} />
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-[11px] ${isModelActive ? "text-foreground" : "text-muted-foreground/60"}`}>{model.name}</p>
                                    <p className="text-[9px] text-muted-foreground/30">{model.description}</p>
                                  </div>
                                  {isModelActive && <Check className="h-3 w-3 text-emerald-500/70 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
              })}
            </div>
          ))}
      </div>

    </div>
  );
};

export default AIKeysSettings;
