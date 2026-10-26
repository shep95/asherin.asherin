/**
 * Search-engine keys live in the same encrypted device vault as model keys,
 * under a `search:` prefix so the chat provider picker never mistakes one for
 * a model. Every key is optional: the engine runs keyless on open indexes and
 * only widens when the operator adds a provider.
 */
import { getProviderKey, hasProviderKey } from '@/lib/local/keys';

export interface SearchKeyProvider {
  id: string;
  label: string;
  /** Vault provider id. */
  vault: string;
  where: string;
  unlocks: string;
}

export const SEARCH_KEY_PROVIDERS: SearchKeyProvider[] = [
  { id: 'tavily', label: 'Tavily', vault: 'search:tavily', where: 'app.tavily.com', unlocks: 'full-web and news retrieval with snippets' },
  { id: 'exa', label: 'Exa', vault: 'search:exa', where: 'dashboard.exa.ai', unlocks: 'neural web search with page text' },
  { id: 'firecrawl', label: 'Firecrawl', vault: 'search:firecrawl', where: 'firecrawl.dev', unlocks: 'web search with scraped page content' },
  { id: 'serper', label: 'Serper', vault: 'search:serper', where: 'serper.dev', unlocks: 'google-derived web and news results' },
  { id: 'brave', label: 'Brave Search', vault: 'search:brave', where: 'api.search.brave.com', unlocks: 'independent web index (the browser may refuse the call)' },
  { id: 'jina', label: 'Jina', vault: 'search:jina', where: 'jina.ai', unlocks: 'higher limits on the keyless reader and web search' },
  { id: 'github', label: 'GitHub token', vault: 'search:github', where: 'github.com/settings/tokens', unlocks: 'code search inside repositories (repo search is keyless)' },
];

export const SEARCH_KEY_PREFIX = 'search:';

export function isSearchKeyProvider(vaultId: string): boolean {
  return vaultId.startsWith(SEARCH_KEY_PREFIX);
}

/** The saved key, or null when none is saved or the vault is locked. Never throws. */
export async function getSearchKey(id: string): Promise<string | null> {
  const p = SEARCH_KEY_PROVIDERS.find((x) => x.id === id);
  if (!p) return null;
  try {
    return await getProviderKey(p.vault);
  } catch {
    return null;
  }
}

export async function hasSearchKey(id: string): Promise<boolean> {
  const p = SEARCH_KEY_PROVIDERS.find((x) => x.id === id);
  if (!p) return false;
  try {
    return await hasProviderKey(p.vault);
  } catch {
    return false;
  }
}
