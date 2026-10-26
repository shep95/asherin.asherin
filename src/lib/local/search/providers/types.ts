import type { SearchMode } from '@/components/dashboard/search/types';

/** A hit exactly as a provider parsed it — before tiering, scoring or dedupe. */
export interface RawHit {
  title: string;
  url: string;
  snippet: string;
  publishDate?: string;
}

export interface ProviderContext {
  /** The operator's words, operators stripped. */
  query: string;
  /** Quoted phrases from the plan. */
  phrases: string[];
  mode: SearchMode;
  limit: number;
  signal?: AbortSignal;
  /** Resolved key for keyed providers; undefined when none is saved. */
  key?: string;
  /** Filter hints providers can pass upstream when they support them. */
  freshness?: 'day' | 'week' | 'month' | 'year';
}

export interface SearchProvider {
  id: string;
  label: string;
  /** Which modes this engine answers. */
  modes: SearchMode[];
  /** Retrieval layer tag carried on every hit. */
  layer: string;
  /** Search-key id (see keys.ts) when a key is required; undefined for keyless indexes. */
  keyId?: string;
  /** Keyless by default but widened by a key. */
  keyOptional?: boolean;
  /** Runs only when the query looks like this (e.g. vulnerability queries for NVD). */
  gate?: (query: string) => boolean;
  run: (ctx: ProviderContext) => Promise<RawHit[]>;
}

export const q = (s: string) => encodeURIComponent(s);

export function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

export function arr<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
