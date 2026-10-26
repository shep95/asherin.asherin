export type SourceTier = 1 | 2 | 3 | 4 | 5;
/** The modes asherin.search can actually serve from the device. */
export type SearchMode = 'web' | 'news' | 'academic' | 'code' | 'data' | 'docs' | 'deep' | 'archive';

export interface TruthGraphNode {
  tier: SourceTier;
  tierLabel: string;
  provenanceScore: number;
  freshnessScore: number;
  hostileFlag: boolean;
  consensusWeight: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
  tier: SourceTier;
  tierLabel: string;
  publishDate?: string;
  readingTimeMin?: number;
  category: 'primary' | 'breaking' | 'analysis' | 'background' | 'community' | 'multimedia' | 'general';
  /** Tier-5 onion result. Never rendered as a clickable anchor. Kept for type continuity; no device provider returns one. */
  onion?: boolean;
  /** Engine that produced this hit. */
  engine?: string;
  /** Every engine that independently returned this URL. */
  engines?: string[];
  /** Retrieval layer: surface, deep, academic, code, social, vuln, archive. */
  layer?: string;
  /** 0-100 credibility estimate from the truth graph. */
  veracity?: number;
  truthGraph?: TruthGraphNode;
  /** 0..1 topical relevance against the query plan. */
  relevance?: number;
  /** Final ordering score. */
  score?: number;
  rank?: number;
  dataType?: string;
}

export interface InstantAnswer {
  type: string;
  title: string;
  value: string;
  source?: string;
  details?: Record<string, string>;
}

export interface FreshnessAlert {
  message: string;
  severity: 'warning' | 'info';
}

export interface SearchFilters {
  dateRange?: 'day' | 'week' | 'month' | 'year' | 'custom';
  dateFrom?: string;
  dateTo?: string;
  domainInclude?: string[];
  domainExclude?: string[];
  fileType?: string;
  sourceType?: string[];
  credibilityMin?: SourceTier;
  language?: string;
  region?: string;
  exactPhrase?: string;
  includeKeywords?: string[];
  excludeKeywords?: string[];
  contentLength?: 'short' | 'medium' | 'long';
  sortBy?: 'relevance' | 'date' | 'credibility';
  safeSearch?: 'off' | 'moderate' | 'strict';
  intitle?: string;
  inurl?: string;
}

/** What each engine did on a run — shown to the operator, never hidden. */
export interface EngineReport {
  id: string;
  label: string;
  status: 'ok' | 'empty' | 'failed' | 'skipped';
  hits: number;
  ms: number;
  reason?: string;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  builtQuery: string;
  mode: SearchMode;
  instantAnswer: InstantAnswer | null;
  instantAnswerType: string | null;
  results: SearchResult[];
  grouped: Record<string, SearchResult[]>;
  freshnessAlerts: Record<string, FreshnessAlert>;
  page: number;
  totalResults: number;
  engines: EngineReport[];
  error?: string;
}

export interface PagePreview {
  success: boolean;
  title: string;
  description: string;
  content: string;
  wordCount: number;
  readingTimeMin: number;
  isPaywalled: boolean;
  fetchedAt: string;
  /** Where the text came from: the reader relay or a direct fetch. */
  via?: 'reader' | 'direct';
  error?: string;
}

export interface BlockedDomain {
  domain: string;
  blockedAt: string;
}
