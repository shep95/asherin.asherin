/**
 * DEEP SEARCH — gather, validate, synthesise, all on the device.
 *
 *   gather    the deep-mode engines answer in parallel
 *   read      the strongest clearnet pages are read (bounded, concurrent)
 *   validate  tiers, provenance and hostile flags roll into a consensus grade
 *   answer    shepherd writes a sourced briefing, streamed, from those pages only
 *
 * the model never sees anything it is not told the source of, and the report
 * carries [source n] markers back to the list the operator can click.
 */
import { resolveActiveModel } from '@/lib/ai';
import { streamLlm } from '@/lib/local/llm';
import { buildSystemPrompt } from '@/lib/local/prompts';
import { runSearch } from './engine';
import { mapLimit } from './http';
import { readPage } from './reader';
import { calculateProvenance, extractDomain, getSourceTier, isHostile } from './tiering';
import type { SearchResult } from '@/components/dashboard/search/types';

export interface DeepSource {
  url: string;
  title: string;
  domain: string;
  tier: number;
  provenanceScore: number;
  hostile: boolean;
  snippet: string;
  /** Page text was read (true) or only the search snippet is known (false). */
  read: boolean;
  content: string;
}

export interface CrossValidation {
  totalSources: number;
  tier1Count: number;
  tier2Count: number;
  hostileCount: number;
  averageProvenance: number;
  consensusStrength: 'strong' | 'moderate' | 'weak' | 'insufficient';
  readCount: number;
}

export function crossValidateSources(sources: DeepSource[]): CrossValidation {
  const tier1Count = sources.filter((s) => s.tier === 1).length;
  const tier2Count = sources.filter((s) => s.tier === 2).length;
  const hostileCount = sources.filter((s) => s.hostile).length;
  const avg = sources.length ? sources.reduce((a, s) => a + s.provenanceScore, 0) / sources.length : 0;
  let consensusStrength: CrossValidation['consensusStrength'] = 'insufficient';
  if (sources.length >= 5 && tier1Count >= 2) consensusStrength = 'strong';
  else if (sources.length >= 3 && (tier1Count >= 1 || tier2Count >= 2)) consensusStrength = 'moderate';
  else if (sources.length >= 2) consensusStrength = 'weak';
  return {
    totalSources: sources.length,
    tier1Count,
    tier2Count,
    hostileCount,
    averageProvenance: Math.round(avg * 100) / 100,
    consensusStrength,
    readCount: sources.filter((s) => s.read).length,
  };
}

export function toDeepSource(r: SearchResult, content?: string): DeepSource {
  const domain = extractDomain(r.url);
  const tier = getSourceTier(domain);
  // reader output is markdown; the briefing and the card want prose
  const text = (content || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    url: r.url,
    title: r.title,
    domain,
    tier,
    provenanceScore: calculateProvenance(domain, tier, text || r.snippet),
    hostile: isHostile(domain),
    snippet: (text || r.snippet).slice(0, 320),
    read: !!text,
    content: text ? text.slice(0, 6000) : r.snippet,
  };
}

const DEEP_DIRECTIVE = `## deep search briefing
you are writing a sourced briefing from the numbered sources below and nothing else. cite with [source n] after every claim.
- a claim backed by two or more independent sources: mark ✅ validated
- one primary source only: mark 🔵 single primary
- one general source only: mark ⚠️ unverified
- sources that disagree: mark 🔴 contested, show both sides, say which is more likely and why
- never use a hostile-flagged source as the only evidence for anything
- do not add facts from memory. if the sources do not answer the question, say exactly what is missing

structure (lowercase headings):
## answer
two or three sentences that answer what was actually asked.
## what the sources establish
numbered findings, each with its marker and citations.
## where sources disagree
or "none found".
## gaps
what could not be determined from these pages and what source would settle it.
## confidence
high / moderate / low, with one line of justification.`;

export interface DeepRunHandlers {
  onPhase?: (phase: 'searching' | 'reading' | 'validating' | 'answering' | 'done') => void;
  onSources?: (sources: DeepSource[], totalFound: number, validation: CrossValidation) => void;
  onDelta?: (text: string) => void;
  onEngines?: (answered: string[], failed: string[]) => void;
}

export async function runDeepSearch(query: string, h: DeepRunHandlers, signal?: AbortSignal): Promise<{ sources: DeepSource[]; validation: CrossValidation; answer: string }> {
  h.onPhase?.('searching');
  const gathered = await runSearch({ query, mode: 'deep', signal, lean: true, limit: 30 });
  h.onEngines?.(
    gathered.engines.filter((e) => e.status === 'ok').map((e) => e.label),
    gathered.engines.filter((e) => e.status === 'failed').map((e) => e.label),
  );
  const candidates = gathered.results.filter((r) => !r.onion);

  h.onPhase?.('reading');
  const toRead = candidates.slice(0, 8);
  const bodies = await mapLimit(toRead, 3, async (r) => {
    const page = await readPage(r.url, { signal, timeoutMs: 9000 });
    return page.content;
  });

  const sources: DeepSource[] = [];
  const seen = new Set<string>();
  toRead.forEach((r, i) => {
    sources.push(toDeepSource(r, bodies[i] ?? undefined));
    seen.add(r.url);
  });
  for (const r of candidates.slice(8, 16)) if (!seen.has(r.url)) sources.push(toDeepSource(r));

  h.onPhase?.('validating');
  const validation = crossValidateSources(sources);
  h.onSources?.(sources, gathered.results.length, validation);

  if (signal?.aborted) return { sources, validation, answer: '' };
  if (!sources.length) {
    h.onPhase?.('done');
    return { sources, validation, answer: '' };
  }

  h.onPhase?.('answering');
  const blocks = sources
    .map((s, i) => {
      const tierLabel = s.tier === 1 ? 'primary' : s.tier === 2 ? 'established' : s.tier === 3 ? 'institutional' : 'general';
      return `[source ${i + 1}] ${tierLabel}${s.hostile ? ' · HOSTILE-FLAGGED' : ''} · provenance ${Math.round(s.provenanceScore * 100)}% · ${s.read ? 'page read' : 'snippet only'}\ntitle: ${s.title}\nurl: ${s.url}\n---\n${s.content}`;
    })
    .join('\n\n');
  const user = `question: ${query}

cross-validation: ${validation.totalSources} sources · ${validation.tier1Count} primary · ${validation.tier2Count} established · ${validation.hostileCount} hostile-flagged · consensus ${validation.consensusStrength} · ${validation.readCount} pages read in full

sources:

${blocks}

write the briefing now.`;

  let answer = '';
  const model = await resolveActiveModel();
  await streamLlm({
    provider: model.provider,
    model: model.model,
    apiKey: model.apiKey,
    signal,
    maxTokens: 2200,
    temperature: 0.2,
    messages: [
      { role: 'system', content: `${buildSystemPrompt({ mode: 'research', depth: 'deep', lastUserText: query })}\n\n${DEEP_DIRECTIVE}` },
      { role: 'user', content: user },
    ],
    onDelta: (t) => {
      answer += t;
      h.onDelta?.(t);
    },
  });
  h.onPhase?.('done');
  return { sources, validation, answer };
}
