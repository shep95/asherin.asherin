// provider keys — the one control for which model answers and with which key.
// rendered by settings → intelligence and by connect. keys go through the
// query shim into the device vault (src/lib/local/keys.ts); the api_key column
// never comes back, so nothing here can display a saved key.

import { useState, useEffect, useMemo } from "react";
import { Key, Plus, Trash2, Check, Loader2, Eye, EyeOff, ChevronDown, Zap, Brain, Search, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStepUp } from "@/components/auth/StepUpProvider";
import { useToast } from "@/hooks/use-toast";
import KeyVaultLockCard from "@/components/dashboard/KeyVaultLockCard";
import { AI_PROVIDERS, type ProviderConfig } from "@/lib/aiProviders";

// Re-export for legacy imports — new code should import from "@/lib/aiProviders".
export { AI_PROVIDERS };
export type { ProviderConfig };

interface StoredKey {
  id: string;
  provider: string;
  is_active: boolean;
  created_at: string;
  last_used_at?: string | null;
}

interface ModelPreference {
  active_provider: string;
  active_model: string;
  fallback_to_default: boolean;
}

const lower = (s: string | undefined | null) => (s ?? "").toLowerCase();

const AIKeysSettings = () => {
  const { user } = useAuth();
  const stepUp = useStepUp();
  const { toast } = useToast();

  const [storedKeys, setStoredKeys] = useState<StoredKey[]>([]);
  const [preferences, setPreferences] = useState<ModelPreference>({
    active_provider: "default",
    active_model: "default",
    fallback_to_default: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPref, setSavingPref] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // the catalog is static: count once.
  const countryCount = useMemo(() => new Set(AI_PROVIDERS.map((p) => p.country)).size, []);

  const groupedProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? AI_PROVIDERS.filter((p) => p.name.toLowerCase().includes(q) || p.country.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      : AI_PROVIDERS;
    const byCountry = new Map<string, ProviderConfig[]>();
    for (const p of filtered) {
      const arr = byCountry.get(p.country);
      if (arr) arr.push(p);
      else byCountry.set(p.country, [p]);
    }
    return Array.from(byCountry.entries());
  }, [search]);

  useEffect(() => {
    if (!user) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    const [keysRes, prefRes] = await Promise.all([
      supabase.from("user_api_keys").select("id, provider, is_active, created_at, last_used_at").eq("user_id", user.id),
      supabase.from("user_model_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    if (keysRes.error || prefRes.error) {
      setLoadError(lower(keysRes.error?.message || prefRes.error?.message) || "the key vault could not be read.");
      setLoading(false);
      return;
    }
    setLoadError(null);
    setStoredKeys((keysRes.data as StoredKey[]) || []);
    if (prefRes.data) {
      setPreferences({
        active_provider: prefRes.data.active_provider || "default",
        active_model: prefRes.data.active_model || "default",
        fallback_to_default: prefRes.data.fallback_to_default ?? false,
      });
    }
    setLoading(false);
  };

  const saveKey = async (providerId: string) => {
    if (!user || !newKeyValue.trim()) return;
    // writing a provider credential is a dangerous act: a hijacked tab could
    // otherwise silently swap the key every request routes through.
    if (!(await stepUp("save this provider key"))) return;
    setSaving(true);
    const { error } = await supabase.from("user_api_keys").upsert(
      {
        user_id: user.id,
        provider: providerId,
        api_key: newKeyValue.trim(),
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    setSaving(false);
    if (error) {
      toast({ title: "key not saved", description: lower(error.message), variant: "destructive" });
    } else {
      toast({ title: "key saved", description: `${lower(AI_PROVIDERS.find((p) => p.id === providerId)?.name)} — sealed in this device's vault.` });
      setNewKeyValue("");
      setAddingProvider(null);
      void loadData();
    }
  };

  const deleteKey = async (providerId: string) => {
    if (!user) return;
    const { error } = await supabase.from("user_api_keys").delete().eq("user_id", user.id).eq("provider", providerId);
    if (error) {
      toast({ title: "key not removed", description: lower(error.message), variant: "destructive" });
    } else {
      if (preferences.active_provider === providerId) await updatePreference("default", "default", true);
      toast({ title: "key removed" });
      void loadData();
    }
  };

  const updatePreference = async (provider: string, model: string, quiet = false) => {
    if (!user) return;
    setSavingPref(true);
    const { error } = await supabase.from("user_model_preferences").upsert(
      {
        user_id: user.id,
        active_provider: provider,
        active_model: model,
        fallback_to_default: preferences.fallback_to_default,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSavingPref(false);
    if (error) {
      toast({ title: "model not changed", description: lower(error.message), variant: "destructive" });
    } else {
      setPreferences((prev) => ({ ...prev, active_provider: provider, active_model: model }));
      if (!quiet) {
        const providerName = lower(AI_PROVIDERS.find((p) => p.id === provider)?.name);
        toast({ title: "model changed", description: `${providerName}${model !== "default" ? ` → ${model}` : ""}` });
      }
    }
  };

  const hasKey = (providerId: string) => storedKeys.some((k) => k.provider === providerId);
  const keyFor = (providerId: string) => storedKeys.find((k) => k.provider === providerId);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" aria-label="loading" />;

  if (loadError) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-border/20 bg-card/20 p-5 text-xs text-muted-foreground">
        <p>the key vault could not be read — {loadError}</p>
        <button type="button" onClick={() => void loadData()} className="rounded-lg border border-border/30 px-3 py-1.5 text-[11px] text-foreground hover:bg-foreground/5">
          try again
        </button>
      </div>
    );
  }

  const activeProvider = AI_PROVIDERS.find((p) => p.id === preferences.active_provider);

  return (
    <div className="space-y-5 rounded-xl border border-border/20 bg-card/20 p-4 backdrop-blur-sm sm:p-5">
      <div className="flex items-center gap-3">
        <Key className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-light text-foreground">model keys</h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground/60">
            shepherd answers with a key you add here, straight from this device to the provider. asherin lends no shared key.
          </p>
        </div>
      </div>

      <KeyVaultLockCard />

      {/* which model answers */}
      <div className="rounded-lg border border-border/15 bg-card/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={`h-4 w-4 ${activeProvider ? "text-foreground/70" : "text-muted-foreground/40"}`} />
            <div>
              <p className="text-xs font-light text-foreground">answering now</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                {!activeProvider
                  ? storedKeys.filter((k) => k.is_active).length === 1
                    ? `${lower(AI_PROVIDERS.find((p) => p.id === storedKeys.find((k) => k.is_active)?.provider)?.name)} — the only saved key, so it answers`
                    : "no model chosen — add a key and pick a model below"
                  : `${lower(activeProvider.name)} → ${preferences.active_model}`}
              </p>
            </div>
          </div>
          {savingPref && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />}
        </div>
        <p className="mt-3 border-t border-border/10 pt-3 text-[10px] text-muted-foreground/60">
          a provider can be switched off for one conversation from the chat header; the key stays saved.
        </p>
      </div>

      {/* provider search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search providers by name or country…"
          aria-label="search providers"
          className="w-full rounded-lg border border-border/20 bg-background/50 py-2 pl-9 pr-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/30"
        />
      </div>

      <div className="space-y-4">
        <p className="text-[10px] font-light tracking-wider text-muted-foreground/50">
          {AI_PROVIDERS.length} providers across {countryCount} countries
        </p>
        {groupedProviders.length === 0 ? (
          <p className="px-1 py-4 text-[11px] text-muted-foreground/50">no provider matches “{search}”.</p>
        ) : (
          groupedProviders.map(([country, provs]) => (
            <div key={country} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Globe className="h-3 w-3 text-muted-foreground/40" />
                <p className="text-[10px] font-light tracking-[0.2em] text-muted-foreground/60">{country.toLowerCase()}</p>
                <span className="text-[9px] text-muted-foreground/40">· {provs.length}</span>
              </div>
              {provs.map((provider) => {
                const stored = hasKey(provider.id);
                const key = keyFor(provider.id);
                const isActive = preferences.active_provider === provider.id;
                const isExpanded = expandedProvider === provider.id;
                const isAdding = addingProvider === provider.id;

                return (
                  <div key={provider.id} className={`rounded-xl border transition-all ${isActive ? "border-foreground/30 bg-foreground/5" : "border-border/15 bg-card/10"}`}>
                    <button
                      onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center gap-3 p-3"
                    >
                      <span className="text-lg" aria-hidden>
                        {provider.icon}
                      </span>
                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-light text-foreground">{provider.name}</p>
                          {stored && (
                            <span className="flex items-center gap-1 text-[9px] text-foreground/60">
                              <Check className="h-2.5 w-2.5" /> key saved
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[10px] text-muted-foreground/50">
                          {provider.models.length} models
                          {key?.last_used_at ? ` · last used ${new Date(key.last_used_at).toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      {isActive && <Check className="h-4 w-4 shrink-0 text-foreground/70" aria-label="answering now" />}
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>

                    {isExpanded && (
                      <div className="space-y-3 border-t border-border/10 px-3 pb-3">
                        {!isAdding && !stored && (
                          <button
                            onClick={() => {
                              setAddingProvider(provider.id);
                              setNewKeyValue("");
                            }}
                            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border/20 bg-foreground/5 px-3 py-1.5 text-[11px] font-light text-foreground transition-colors hover:bg-foreground/10"
                          >
                            <Plus className="h-3 w-3" /> add a key
                          </button>
                        )}

                        {isAdding && (
                          <div className="mt-2 space-y-2">
                            <div className="relative">
                              <input
                                type={showKey ? "text" : "password"}
                                value={newKeyValue}
                                onChange={(e) => setNewKeyValue(e.target.value)}
                                placeholder={provider.placeholder}
                                aria-label={`${provider.name} key`}
                                autoComplete="off"
                                className="w-full rounded-lg border border-border/20 bg-background/50 px-3 py-2 pr-10 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-foreground/30"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                aria-label={showKey ? "hide the key" : "show the key"}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
                              >
                                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                            <p className="text-[10px] text-muted-foreground/50">
                              <a href={provider.helpUrl} target="_blank" rel="noopener noreferrer" className="text-foreground/60 underline underline-offset-2 hover:text-foreground">
                                {provider.helpText}
                              </a>
                            </p>
                            <p className="text-[10px] text-muted-foreground/60">sealed in this device's vault; sent only to {provider.name} with your requests. it is not shown again after saving.</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveKey(provider.id)}
                                disabled={!newKeyValue.trim() || saving}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-foreground/10 px-3 py-1.5 text-[11px] font-light text-foreground transition-colors hover:bg-foreground/15 disabled:opacity-30"
                              >
                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                {saving ? "saving…" : "save key"}
                              </button>
                              <button
                                onClick={() => {
                                  setAddingProvider(null);
                                  setNewKeyValue("");
                                }}
                                className="rounded-lg border border-border/20 px-3 py-1.5 text-[11px] font-light text-muted-foreground transition-colors hover:text-foreground"
                              >
                                cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {stored && !isAdding && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground/40" aria-label="key saved, never shown">
                              ••••••••••••
                            </span>
                            <button
                              onClick={() => {
                                setAddingProvider(provider.id);
                                setNewKeyValue("");
                              }}
                              className="text-[10px] text-foreground/60 underline underline-offset-2 transition-colors hover:text-foreground"
                            >
                              replace
                            </button>
                            <button onClick={() => deleteKey(provider.id)} className="flex items-center gap-1 text-[10px] text-destructive/60 transition-colors hover:text-destructive">
                              <Trash2 className="h-2.5 w-2.5" /> remove
                            </button>
                          </div>
                        )}

                        {stored && (
                          <div className="mt-2 space-y-1.5">
                            <p className="text-[10px] tracking-wider text-muted-foreground/50">model</p>
                            {(() => {
                              const withVision = provider.models.filter((m) => m.vision);
                              const textOnly = provider.models.filter((m) => !m.vision);
                              const groups =
                                withVision.length && textOnly.length
                                  ? [
                                      { label: "text + vision — reads images", models: withVision },
                                      { label: "text only", models: textOnly },
                                    ]
                                  : [{ label: null as string | null, models: provider.models }];
                              return groups.map((group) => (
                                <div key={group.label ?? "all"} className="space-y-1.5">
                                  {group.label && (
                                    <p className="pt-2 text-[9px] tracking-wider text-muted-foreground/45">
                                      {group.label} · {group.models.length}
                                    </p>
                                  )}
                                  {group.models.map((model) => {
                                    const isModelActive = isActive && preferences.active_model === model.id;
                                    return (
                                      <button
                                        key={model.id}
                                        onClick={() => updatePreference(provider.id, model.id)}
                                        aria-pressed={isModelActive}
                                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-all ${
                                          isModelActive ? "border border-foreground/20 bg-foreground/10" : "border border-transparent hover:bg-foreground/5"
                                        }`}
                                      >
                                        <Brain className={`h-3 w-3 shrink-0 ${isModelActive ? "text-foreground" : "text-muted-foreground/30"}`} />
                                        <div className="min-w-0 flex-1">
                                          <p className={`text-[11px] ${isModelActive ? "text-foreground" : "text-muted-foreground/70"}`}>{model.name}</p>
                                          <p className="text-[9px] text-muted-foreground/40">{model.description}</p>
                                        </div>
                                        {isModelActive && <Check className="h-3 w-3 shrink-0 text-foreground/70" />}
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
          ))
        )}
      </div>
    </div>
  );
};

export default AIKeysSettings;
