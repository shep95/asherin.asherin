/**
 * INTEL ANALYSIS — five structured reads over a result corpus, produced by
 * shepherd on the device model and normalised to the exact shapes the panels
 * render. a field the model omits becomes an empty list, never a crash, and a
 * model that returns prose instead of json is reported as such.
 */
import { askModel } from '@/lib/ai';
import { extractJson } from '@/lib/local/llm';
import { SHEPHERD_IDENTITY } from '@/lib/local/prompt/shepherdArchitecture';
import type { SearchResult } from '@/components/dashboard/search/types';
import { arr, rec, str } from './providers/types';

export type IntelAnalysisType = 'temporal' | 'credibility' | 'factcheck' | 'narrative' | 'investigative';

const SHAPES: Record<IntelAnalysisType, string> = {
  temporal: `{"timeline":[{"date":"iso or human date","source":"domain","headline":"...","type":"article|official_statement|leak|correction|social_post|analysis","keyFacts":["..."],"importance":0-100,"sentiment":-1..1}],"narrativeShifts":[{"date":"...","fromNarrative":"...","toNarrative":"...","trigger":"...","impact":"minor|moderate|major|paradigm_shift"}],"predictedDevelopments":[{"prediction":"...","confidence":0-100,"timeframe":"..."}]}`,
  credibility: `{"sources":[{"source":"domain","credibilityScore":0-100,"politicalBias":-100..100,"biasConfidence":0-100,"accuracyRate":0-100,"ownership":"...","fundingType":"...","hasFactChecking":true|false,"warnings":["..."],"strengths":["..."]}]}`,
  factcheck: `{"claims":[{"claim":"...","claimant":"...","verdict":"true|mostly_true|half_true|mostly_false|false|unverifiable","confidence":0-100,"supportingSources":["domain"],"contradictingSources":["domain"],"consensusView":"...","agreementPercent":0-100}],"contradictions":[{"claim1":"...","claim2":"...","level":"minor|moderate|severe|complete","explanation":"...","possibleReason":"..."}]}`,
  narrative: `{"sentimentDistribution":{"positive":0-100,"neutral":0-100,"negative":0-100},"emotionalLanguage":{"anger":0-100,"fear":0-100,"joy":0-100,"sadness":0-100,"neutral":0-100},"frames":[{"name":"...","description":"...","prevalence":0-100,"sentiment":-1..1,"emphasizes":["..."],"downplays":["..."],"ideologicalLean":-100..100,"sources":["domain"],"exampleHeadline":"..."}],"loadedTerms":[{"term":"...","count":1,"connotation":"positive|negative|neutral","implication":"..."}]}`,
  investigative: `{"confirmedFacts":["..."],"likelyFacts":["..."],"disputedFacts":["..."],"unansweredQuestions":["..."],"overallConfidence":0-100,"gaps":[{"description":"...","importance":0-100,"urgency":"low|medium|high|critical","whyItMatters":"...","likelyLocations":["..."],"difficulty":"easy|moderate|hard|very_hard","suggestedApproach":"...","suggestedQueries":["..."]}],"investigationPath":[{"phase":"...","steps":["..."],"expectedFindings":"...","estimatedTime":"..."}]}`,
};

const DIRECTIVES: Record<IntelAnalysisType, string> = {
  temporal: 'reconstruct a chronological timeline of how this story evolved from the sources given. identify narrative shifts (when the dominant framing changed) and what is structurally likely next. use only what the sources say; if dates are missing, infer relative order and say so in the date field.',
  credibility: 'for each distinct source domain, assess credibility (0-100), political bias (-100 left to +100 right), accuracy track record, ownership and funding as far as they are publicly known, and plain warnings. evidence over reputation; avoid us-centric assumptions; say "unknown" rather than guess.',
  factcheck: 'extract the most important verifiable claims from the sources. for each, give a verdict, confidence, which domains support or contradict it, and the consensus view. list contradictions between sources explicitly.',
  narrative: 'detect the dominant narrative frames competing across this coverage. for each frame say what it emphasises and downplays, its lean and sentiment, and which domains carry it. flag loaded or emotional terms with what they imply.',
  investigative: 'from the sources, separate what is confirmed, likely, disputed and unknown. name the critical information gaps, why each matters, where the answer likely lives, and a concrete investigation path with phases and the exact queries to run next.',
};

function userPrompt(query: string, results: SearchResult[]): string {
  const lines = results.slice(0, 20).map((r, i) => {
    const date = r.publishDate ? ` [${r.publishDate}]` : '';
    return `[${i + 1}]${date} ${r.source}${r.tier ? ` (tier ${r.tier})` : ''}\ntitle: ${r.title}\nsnippet: ${r.snippet || '(no snippet)'}\nurl: ${r.url}`;
  });
  return `query: "${query}"\n\nsources (${Math.min(20, results.length)}):\n\n${lines.join('\n\n')}\n\nreturn the json object now.`;
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && !isNaN(Number(v)) ? Number(v) : d);
const strs = (v: unknown) => arr<unknown>(v).map((x) => str(x)).filter(Boolean);

/** Coerce whatever the model returned into the panel's exact shape. Exported for tests. */
export function normalizeAnalysis(type: IntelAnalysisType, raw: unknown): unknown {
  const r = rec(raw);
  switch (type) {
    case 'temporal':
      return {
        timeline: arr<unknown>(r.timeline).map((x) => {
          const t = rec(x);
          return { date: str(t.date) || 'undated', source: str(t.source), headline: str(t.headline), type: str(t.type) || 'article', keyFacts: strs(t.keyFacts), importance: num(t.importance, 50), sentiment: Math.max(-1, Math.min(1, num(t.sentiment))) };
        }),
        narrativeShifts: arr<unknown>(r.narrativeShifts).map((x) => {
          const t = rec(x);
          return { date: str(t.date), fromNarrative: str(t.fromNarrative), toNarrative: str(t.toNarrative), trigger: str(t.trigger), impact: (['minor', 'moderate', 'major', 'paradigm_shift'].includes(str(t.impact)) ? str(t.impact) : 'moderate') as 'minor' | 'moderate' | 'major' | 'paradigm_shift' };
        }),
        predictedDevelopments: arr<unknown>(r.predictedDevelopments).map((x) => {
          const t = rec(x);
          return { prediction: str(t.prediction), confidence: num(t.confidence, 50), timeframe: str(t.timeframe) };
        }),
      };
    case 'credibility':
      return {
        sources: arr<unknown>(r.sources).map((x) => {
          const t = rec(x);
          return {
            source: str(t.source),
            credibilityScore: num(t.credibilityScore, 50),
            politicalBias: num(t.politicalBias),
            biasConfidence: num(t.biasConfidence, 50),
            accuracyRate: num(t.accuracyRate, 50),
            ownership: str(t.ownership) || 'unknown',
            fundingType: str(t.fundingType) || 'unknown',
            hasFactChecking: !!t.hasFactChecking,
            warnings: strs(t.warnings),
            strengths: strs(t.strengths),
          };
        }),
      };
    case 'factcheck': {
      const verdicts = ['true', 'mostly_true', 'half_true', 'mostly_false', 'false', 'unverifiable'];
      return {
        claims: arr<unknown>(r.claims).map((x) => {
          const t = rec(x);
          return {
            claim: str(t.claim),
            claimant: str(t.claimant) || 'unattributed',
            verdict: verdicts.includes(str(t.verdict)) ? str(t.verdict) : 'unverifiable',
            confidence: num(t.confidence, 50),
            supportingSources: strs(t.supportingSources),
            contradictingSources: strs(t.contradictingSources),
            consensusView: str(t.consensusView),
            agreementPercent: num(t.agreementPercent, 50),
          };
        }),
        contradictions: arr<unknown>(r.contradictions).map((x) => {
          const t = rec(x);
          return { claim1: str(t.claim1), claim2: str(t.claim2), level: (['minor', 'moderate', 'severe', 'complete'].includes(str(t.level)) ? str(t.level) : 'moderate') as 'minor' | 'moderate' | 'severe' | 'complete', explanation: str(t.explanation), possibleReason: str(t.possibleReason) };
        }),
      };
    }
    case 'narrative': {
      const sd = rec(r.sentimentDistribution);
      const el = rec(r.emotionalLanguage);
      return {
        sentimentDistribution: { positive: num(sd.positive), neutral: num(sd.neutral), negative: num(sd.negative) },
        emotionalLanguage: { anger: num(el.anger), fear: num(el.fear), joy: num(el.joy), sadness: num(el.sadness), neutral: num(el.neutral) },
        frames: arr<unknown>(r.frames).map((x) => {
          const t = rec(x);
          return {
            name: str(t.name),
            description: str(t.description),
            prevalence: num(t.prevalence),
            sentiment: Math.max(-1, Math.min(1, num(t.sentiment))),
            emphasizes: strs(t.emphasizes),
            downplays: strs(t.downplays),
            ideologicalLean: num(t.ideologicalLean),
            sources: strs(t.sources),
            exampleHeadline: str(t.exampleHeadline),
          };
        }),
        loadedTerms: arr<unknown>(r.loadedTerms).map((x) => {
          const t = rec(x);
          return { term: str(t.term), count: num(t.count, 1), connotation: (['positive', 'negative', 'neutral'].includes(str(t.connotation)) ? str(t.connotation) : 'neutral') as 'positive' | 'negative' | 'neutral', implication: str(t.implication) };
        }),
      };
    }
    case 'investigative':
      return {
        confirmedFacts: strs(r.confirmedFacts),
        likelyFacts: strs(r.likelyFacts),
        disputedFacts: strs(r.disputedFacts),
        unansweredQuestions: strs(r.unansweredQuestions),
        overallConfidence: num(r.overallConfidence, 50),
        gaps: arr<unknown>(r.gaps).map((x) => {
          const t = rec(x);
          return {
            description: str(t.description),
            importance: num(t.importance, 50),
            urgency: (['low', 'medium', 'high', 'critical'].includes(str(t.urgency)) ? str(t.urgency) : 'medium') as 'low' | 'medium' | 'high' | 'critical',
            whyItMatters: str(t.whyItMatters),
            likelyLocations: strs(t.likelyLocations),
            difficulty: (['easy', 'moderate', 'hard', 'very_hard'].includes(str(t.difficulty)) ? str(t.difficulty) : 'moderate') as 'easy' | 'moderate' | 'hard' | 'very_hard',
            suggestedApproach: str(t.suggestedApproach),
            suggestedQueries: strs(t.suggestedQueries),
          };
        }),
        investigationPath: arr<unknown>(r.investigationPath).map((x) => {
          const t = rec(x);
          return { phase: str(t.phase), steps: strs(t.steps), expectedFindings: str(t.expectedFindings), estimatedTime: str(t.estimatedTime) };
        }),
      };
  }
}

export async function runIntelAnalysis<T>(type: IntelAnalysisType, query: string, results: SearchResult[], signal?: AbortSignal): Promise<T> {
  if (!results.length) throw new Error('nothing to analyse yet — run a search first');
  const system = `${SHEPHERD_IDENTITY}\n\n## task directive (a task shape, not a character)\n${DIRECTIVES[type]}\n\nreturn only one json object, no prose, no markdown fence, matching this shape exactly:\n${SHAPES[type]}\nnumbers are numbers, not strings. every list may be empty but must be present.`;
  const raw = await askModel(userPrompt(query, results), { system, json: true, signal, maxTokens: 4000 });
  const parsed = extractJson<unknown>(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('the model did not return a json analysis. try again or pick a model that supports json output.');
  return normalizeAnalysis(type, parsed) as T;
}
