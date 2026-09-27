// Fetches same-cipher world matches from Wikipedia + Datamuse via edge function.
// Results are cached per (phrase|cipher|value) key for the lifetime of the tab
// so repeated cipher toggles don't refetch. Bundled corpus matches are computed
// synchronously in the component; this hook only handles the network layer.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CipherKey } from "@/lib/gematria";

export interface WorldMatch {
  phrase: string;
  source: "wikipedia" | "datamuse";
}

interface Payload {
  matches: WorldMatch[];
  counts: { candidates: number; matched: number };
}

const cache = new Map<string, Payload>();

export function useGematriaWorldMatches(phrase: string) {
  const [byCipher, setByCipher] = useState<Partial<Record<CipherKey, Payload>>>({});
  const [loading, setLoading] = useState<Partial<Record<CipherKey, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const activePhrase = useRef(phrase);

  useEffect(() => { activePhrase.current = phrase; setByCipher({}); }, [phrase]);

  const fetchFor = useCallback(async (cipher: CipherKey, value: number) => {
    if (!phrase || !Number.isFinite(value) || value <= 0) return;
    const key = `${phrase}|${cipher}|${value}`;
    const cached = cache.get(key);
    if (cached) { setByCipher((s) => ({ ...s, [cipher]: cached })); return; }
    setLoading((s) => ({ ...s, [cipher]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("gematria-matches", {
        body: { phrase, cipher, value },
      });
      if (error) throw error;
      const payload = (data ?? { matches: [], counts: { candidates: 0, matched: 0 } }) as Payload;
      cache.set(key, payload);
      if (activePhrase.current === phrase) {
        setByCipher((s) => ({ ...s, [cipher]: payload }));
      }
    } catch (e: any) {
      setError(e?.message ?? "world match fetch failed");
    } finally {
      setLoading((s) => ({ ...s, [cipher]: false }));
    }
  }, [phrase]);

  return { byCipher, loading, error, fetchFor };
}
