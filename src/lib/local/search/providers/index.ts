import { KEYED_PROVIDERS } from './keyed';
import { OPEN_PROVIDERS } from './open';
import type { SearchProvider } from './types';

export const ALL_PROVIDERS: SearchProvider[] = [...OPEN_PROVIDERS, ...KEYED_PROVIDERS];

export function providersFor(mode: string): SearchProvider[] {
  return ALL_PROVIDERS.filter((p) => (p.modes as string[]).includes(mode));
}

export type { SearchProvider, RawHit, ProviderContext } from './types';
