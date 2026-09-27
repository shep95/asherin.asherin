import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { computeAll, normalize, type CipherKey } from "@/lib/gematria";

export interface GematriaEntry {
  id: string;
  phrase: string;
  normalized: string;
  ordinal: number;
  reduction: number;
  reverse_ordinal: number;
  chaldean: number;
  created_at: string;
}

const COLUMN: Record<CipherKey, keyof GematriaEntry> = {
  ordinal: "ordinal",
  reduction: "reduction",
  reverse: "reverse_ordinal",
  chaldean: "chaldean",
};

export function useGematria() {
  const [entries, setEntries] = useState<GematriaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("gematria_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) setError(error.message);
    else setEntries((data || []) as GematriaEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (phrase: string) => {
    const normalized = normalize(phrase);
    if (!normalized) return null;
    const all = computeAll(phrase);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) { setError("Sign in to save phrases."); return null; }
    const row = {
      user_id: uid,
      phrase: phrase.trim(),
      normalized,
      ordinal: all.ordinal.sum,
      reduction: all.reduction.sum,
      reverse_ordinal: all.reverse.sum,
      chaldean: all.chaldean.sum,
    };
    const { data, error } = await supabase
      .from("gematria_entries")
      .upsert(row, { onConflict: "user_id,normalized" })
      .select()
      .single();
    if (error) { setError(error.message); return null; }
    setEntries((prev) => {
      const filtered = prev.filter((e) => e.normalized !== normalized);
      return [data as GematriaEntry, ...filtered];
    });
    return data as GematriaEntry;
  }, []);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("gematria_entries").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const matchesFor = useCallback((cipher: CipherKey, value: number, excludeNormalized?: string) => {
    const col = COLUMN[cipher];
    return entries.filter(
      (e) => (e[col] as number) === value && e.normalized !== excludeNormalized,
    );
  }, [entries]);

  return { entries, loading, error, save, remove, matchesFor, reload: load };
}
