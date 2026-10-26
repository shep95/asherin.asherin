```
room: asherin.search   view id: search   files: src/components/dashboard/search/AsherinSearchView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓
```

files under review: `src/components/dashboard/search/` — `AsherinSearchView.tsx` (the room), `SearchModeSelector.tsx`, `SearchOperatorsPanel.tsx`, `QuerySuggestions.tsx`, `FilterSidebar.tsx`, `SearchResultCard.tsx`, `SourceTierBadge.tsx`, `InstantAnswerCard.tsx`, `FusionPanel.tsx`, `DeepSearchPanel.tsx`, `IntelMapPanel.tsx`, `LocationMapPanel.tsx`, `ResolvePanel.tsx`, `UrlIntelMapPanel.tsx`, `PagePreviewPanel.tsx`, `SocialPostEmbed.tsx`, `SourcesPanel.tsx`, `ArchivePanel.tsx` + `archives/*`, `intel/*` (suite, five read panels, `useIntelAnalysis.ts`, three deterministic builders), `types.ts`; and `src/lib/local/search/` — `engine.ts`, `providers/{types,open,keyed,index}.ts`, `tiering.ts`, `queryPlan.ts`, `serpEntityEngine.ts`, `fusion.ts`, `instant.ts`, `reader.ts`, `urlIntel.ts`, `deep.ts`, `intel.ts`, `export.ts`, `keys.ts`, `http.ts`. tests: `src/test/searchProviders.test.ts`, `src/test/searchEngine.test.ts`.

evidence statuses used below: **verified** (a test or the end-to-end run exercised it), **observed** (read in the code or seen in a screenshot), **inferred** (follows from code but no run touched it), **unknown** (cannot be settled from this device).

## purpose & promise

asherin.search is sourced search with credibility tiers. an operator types a question, picks a mode (web, news, academic, code, data, docs, deep, archive) and gets back results from several public indexes at once, each badged by how trustworthy its source is, ranked by relevance to what was asked and by credibility, with the deterministic corpus analysis (claims, conflicts, stories, anomalies) laid over the set. a pasted link is mapped instead of searched. deep search reads the strongest pages and has shepherd write a briefing cited back to them.

the interface promises (verified unless marked): every engine is asked from this browser and no asherin server sits in between (`SourcesPanel.tsx:83`, `AsherinSearchView.tsx:419`); the operator can see which engines answered and why the others did not (`SourcesPanel.tsx`, the count line `AsherinSearchView.tsx:549-552`); keys are optional, stay encrypted on the device and travel only to their own provider (`SourcesPanel.tsx:128`; observed in code, see integrations); nothing a model wrote appears without its sources (deep search markers `deep.ts:88-114`; the fusion, resolve, intel map and intel report are model-free).

## entry & navigation

- sidebar group `find`, label `asherin.search`, codename `sourced search`, keywords include search, zophiel, osint, web, news, academic, code, archive, deep search, intel map (`src/lib/navIntents.ts:94-100`, main checkout). observed.
- view id `search` (`src/components/dashboard/types.ts:97`), lazy import `src/pages/Dashboard.tsx:43`, rendered by `case "search"` → `gatedView(...)` (`Dashboard.tsx:2008-2013`), wrapped in `ErrorBoundary` + `Suspense`. the room is not retired. observed.
- sidebar icon `Zap` (`DashboardSidebar.tsx:117`); v.2 shell title `search`, subtitle `sourced search with credibility tiers.` (`src/lib/dashboard/v2Titles.ts:31`). observed.
- connect organ id stays `zophiel` (`emitPull` calls in `AsherinSearchView.tsx:280`, `:307`), so the existing connect graph node lights; it is an internal id, never shown in this room. observed.
- what loads first: the idle hero (room title, one-line promise, mode row, search bar, recent searches, `sources & keys` and `press ? for shortcuts`), input focused (`AsherinSearchView.tsx:165-177`, `:412-500`). verified by `search-0-idle.png`.

## workflow

happy path (verified by the end-to-end run, steps named in tests & proof):
1. **choose a mode** — `SearchModeSelector.tsx` lists only modes that run on a device; each has a hint title. changing mode after a search re-asks the same words in the new mode (`changeMode` `AsherinSearchView.tsx:327-334`).
2. **type and press enter** — `search()` (`AsherinSearchView.tsx:210-315`): a link is mapped (`detectUrl` `:36-48` → `UrlIntelMapPanel`); `deep` hands off to `DeepSearchPanel`; `archive` opens its own panel; offline queues the words (`:247-253`) and the queue runs itself on reconnect (`:317-325`). otherwise the previous run is aborted (`:255-257`) and `runSearch` is called with mode, filters and operator overrides.
3. **read results** — the count line (`n results · ms · a of b engines answered · k unreachable`), optional instant answer, then cards grouped by category when more than one category is present (`:637-668`). each card: tier badge, domain, title link, cleaned url, snippet, date, reading time, freshness alert where the query is time-sensitive (`SearchResultCard.tsx`).
4. **inspect** — `preview` reads the page (`readPage`) into the side panel; `intel report` reads it and extracts entities, dates, money, figures, contacts and outbound links with no model (`SearchResultCard.tsx:73-110`, `intel/buildIntelReport.ts`); a detected place opens the map panel.
5. **analyse the set** — `corpus analysis` (fusion, collapsed by default) tabs quality, graph, stories, claims, conflicts, anomalies; `intel map` draws the entity graph; `resolve` reads the top eight pages and builds hop rings, identities and exposure; `intel suite` asks shepherd for five structured reads.
6. **export** — pdf, csv, json or markdown of the visible results (`export.ts`).

secondary paths: operators popover (`SearchOperatorsPanel.tsx`) adds include/exclude/phrase/site/filetype/date; the filter sidebar adds sort, length, date, credibility floor, source type, keywords, in-title/in-url, file type, language/region, saved profiles and blocked domains; query suggestions and quick chips apply their filter to the run they trigger (`handleSuggestionSelect` `:341-355`); recent searches re-run on click and clear on `clear`; `sources & keys` opens the engine report and key entry; keyboard `/` focus, `↑ ↓` move, `c` copy url, `esc` close, `?` shortcuts (`:356-385`).

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| query, mode, filters, operator overrides, results, grouped, instant answer, freshness alerts, fusion, engine report, panel toggles, split width | react state in `AsherinSearchView.tsx:72-107` | `types.ts` | mount | the query words go to each engine asked (see integrations) |
| recent searches | localStorage `zophiel_recent_searches` (key kept for continuity), max 8 (`:168`, `:179-187`) | string[] | until `clear` or a device wipe | no — **plain text at rest** (security & privacy) |
| blocked domains | localStorage `zophiel_blocked_domains` (`:170`, `:189-206`) | string[] | until unblocked | no |
| filter profiles | localStorage `zophiel_filter_profiles_v2` (`FilterSidebar.tsx`) | `{name, filters}[]` | until deleted | no |
| search keys | encrypted device vault, provider ids `search:<id>` (`keys.ts:18-27`; `src/lib/local/keys.ts` aes-gcm) | ciphertext | until removed | only to the matching provider |
| intel suite reads | module memory cache keyed by type + query + top-20 urls, max 40 (`intel/useIntelAnalysis.ts:12-20`) | normalised analysis objects | tab lifetime | no |
| archive saved searches | localStorage (`ArchivePanel.tsx`) | query list | until removed | no |
| connect trace | local `asherin_connect_pulls` via `emitPull`, quote masked by `maskQuote` | organ, status, latency, the top result title or "no results" | local store lifetime | no |

`getActiveModel` in `src/lib/local/keys.ts:197-199` ignores `search:` entries, so a search key can never become the chat model. verified by code read; no test.

## logic

- **query plan** (`queryPlan.ts` `buildQueryPlan`): required terms with confidence, optional context, negatives, quoted phrases, entity kind, query shape, relations, operators preserved verbatim. ported unchanged from the hosted organ. verified (`searchEngine.test.ts` "query plan and operator gate").
- **wire query** (`engine.ts:60-76` `buildWireQuery`): the operator's words plus exact phrase / include / in-title from filters. **operators never go on the wire** — open indexes do not understand `site:` and return nothing — they are stripped and applied locally. verified.
- **operator gate** (`engine.ts:97-133`): `site:` / `-site:` / domain include-exclude match the host or any subdomain; `filetype:`/`ext:` match the path suffix; `inurl:`/`intitle:` substring. verified.
- **date range** (`engine.ts:135-157`): drops a result outside the range only when its date is known. verified.
- **per-engine run** (`engine.ts:159-179` `runProvider`): gate check (nvd only on vulnerability-shaped queries), key lookup (keyed engines skip with "no key saved"), one bounded call, a report row with status, hits, ms and reason. observed + verified via the sources panel step.
- **assembly** (`engine.ts:181-228`): build a result (`tiering.ts:150-190`: a url with a foreign scheme is refused, a bare host gets `https://`, html stripped, title/snippet capped), apply the gate, date range and credibility floor, dedupe across engines by a normalised url (tracking params and fragment removed, `www` folded), merge the engine list and keep the longer snippet. consensus weight = share of other results sharing a two-word phrase; veracity nudged by it. verified.
- **tiering** (`tiering.ts:46-71`): tier 1 primary, 2 established, 3 institutional (.gov .edu .mil .int …), 4 general, 5 onion; subdomains inherit. provenance from tier plus citation phrases, ×0.2 for hostile domains; freshness by age bands. verified.
- **ranking** (`engine.ts:230-243`): `scoreRelevance` (title > url > snippet, variant-aware, confidence-weighted gate) and `finalScore` = 0.65·relevance + 0.35·credibility (floored at 0.5, distinct engine-class corroboration bonus, hostile ×0.35). verified ("ranks the page that names the subject…").
- **rescue** (`engine.ts:262-285`): a tight plan with fewer than five results or weak top relevance is re-asked relaxed, once, against up to three keyless engines that already answered. inferred (no test drives a weak plan).
- **mode boost and floor** (`engine.ts:287-306`): mode-relevant domains +0.08; results under relevance 0.12 pruned only while at least eight survive; cap 40. observed.
- **fusion** (`fusion.ts` `fuseCorpus` over `serpEntityEngine.ts`): entities, pagerank centrality, story clusters, claims with veracity, contradictions, benford and robust-z anomalies, data types. no model. verified ("fusion layer runs in the browser").
- **instant answers** (`instant.ts`): arithmetic by a shunting-yard evaluator (no `eval`), unit and temperature conversion, and a Wikipedia abstract for definition asks or short (≤4 word, operator-free) queries. verified.
- **reader** (`reader.ts:146-186`): relay first, then a direct https read; markdown flattened to prose (`markdownToText` `:64-79`); paywall hint; links kept for the url map. verified (unit + preview step).
- **deep search** (`deep.ts:116-…`): gather in `deep` mode lean, read the top eight at concurrency three (9 s each), add the next eight as snippet-only, grade consensus (strong ≥5 sources with ≥2 primary; moderate ≥3 with a primary or two established; weak ≥2; else insufficient), then stream a briefing whose system prompt is shepherd's plus a directive that forbids facts not in the numbered sources. verified.
- **intel suite** (`intel.ts`): one `askModel` json call per tab with shepherd's identity and a strict shape; `normalizeAnalysis` coerces every field so an omitted list is empty and an odd enum falls back. verified.
- **url intel** (`urlIntel.ts:72-157`): handles, hashtags, emails, phones, socials by host pattern, internal/outbound links, domain counts, headings, key sentences, proper-noun entities, all from the read page. verified.

## integrations & network

every call goes through `fetchTimeout` (`http.ts:27-54`): own AbortController, outer signal chained, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, non-2xx and timeouts become an `HttpFailure` with a plain reason. the page policy allows `connect-src https:` (index.html), so http targets are upgraded or refused.

| engine / call | host | method | deadline | key | modes |
| --- | --- | --- | --- | --- | --- |
| Jina web search | s.jina.ai | GET | 12 s | optional `search:jina`, bearer, only to jina | web news docs deep |
| Wikipedia | en.wikipedia.org | GET | 6 s | none | web news docs academic deep |
| GDELT news | api.gdeltproject.org | GET | 9 s | none | news web deep |
| Hacker News | hn.algolia.com | GET | 6 s | none | web news code deep |
| GitHub repositories | api.github.com | GET | 7 s | none | code web deep |
| GitHub code | api.github.com | GET | 8 s | `search:github` bearer, only to github | code |
| Stack Overflow | api.stackexchange.com | GET | 7 s | none | code docs |
| arXiv | export.arxiv.org | GET | 8 s | none | academic deep |
| Crossref / OpenAlex | api.crossref.org / api.openalex.org | GET | 8 s | none | academic (+deep) |
| Google Books / Open Library | www.googleapis.com / openlibrary.org | GET | 7 / 8 s | none | docs (+academic) |
| Wayback CDX | web.archive.org | GET | 9 s | none | archive web |
| NVD CVE 2.0 | services.nvd.nist.gov | GET | 9 s | none, gated to vuln queries | data web code |
| SEC EDGAR | efts.sec.gov | GET | 8 s | none | data |
| Tavily / Exa / Firecrawl / Serper | api.tavily.com / api.exa.ai / api.firecrawl.dev / google.serper.dev | POST | 12 s | each its own key, only to its own host | web news deep (+docs, academic) |
| Brave | api.search.brave.com | GET | 10 s | `search:brave` header | web news deep |
| reader relay | r.jina.ai | GET | 15 s default | optional jina key | preview, intel report, resolve, deep, url map |
| direct read | the page itself, https only | GET | ≤10 s | none | fallback for the above |
| instant abstract | en.wikipedia.org rest summary | GET | 5 s ×2 | none | short queries |
| archive panel | archive.org advancedsearch, web.archive.org cdx | GET | 15 s / 12 s per decade | none | archive |
| lost-page live check | each archived original host | HEAD, no-cors | 4 s, up to 30 at once | none | archive "lost knowledge" |
| map panel | nominatim.openstreetmap.org, router.project-osrm.org, basemaps.cartocdn.com tiles | GET | 10 / 12 s; tiles by leaflet | none | location chip |
| model | the operator's chosen provider via `@/lib/ai` | stream / json | provider layer | the chat model key | deep, intel suite |

offline: the run is queued and replays on `online` (verified only by code read: inferred). retries: none per engine; the rescue pass is the only re-ask. no engine's key reaches another engine: each provider reads its own key in `runProvider` and the request is built inside that provider's `run` (observed: `providers/keyed.ts`, `providers/open.ts:98-111`, `:432-450`).

## security & privacy

- **what leaves the device**: the query words to every engine in the mode; every url the operator previews, reports on, resolves or deep-reads to **r.jina.ai** (a third party that fetches the page on the operator's behalf). this is now said in the sources panel and under each preview (`SourcesPanel.tsx:83`, `PagePreviewPanel.tsx:50-54`). the archive "lost knowledge" pass sends up to thirty HEAD requests from the operator's ip to the archived hosts themselves. observed.
- **keys**: aes-gcm in the device vault; written only from `SourcesPanel.tsx:48` (`type="password"`, `autocomplete="off"`), deleted at `:65`; never logged, never in a url. a locked vault returns null from `getSearchKey` (keyed engines skip) — inferred.
- **hostile responses**: titles and snippets are html-stripped before render; result urls with a non-web scheme are refused (`tiering.ts:158-170`, verified); page previews render as text, not html (`PagePreviewPanel.tsx:49`, observed); social embeds only frame youtube/vimeo, matching `frame-src` (`SocialPostEmbed.tsx:139`, `:154`, verified); regexes in the entity engines are bounded and inputs length-capped (`serpEntityEngine.ts` header, `fusion.ts`). onion results cannot occur (no onion provider ships) but the card still refuses to make one clickable.
- **at rest**: recent searches, blocked domains and filter profiles are plaintext localStorage. this is a convenience list on the operator's own device; it is not encrypted. said here plainly; see open gaps.
- **traces**: the connect trace records the top result title or "no results", never the typed query, and `maskQuote` scrubs it (`AsherinSearchView.tsx:286-287`).
- **exports**: files are generated locally and named `asherin-search-<timestamp>`; they contain titles, urls and snippets of the results only.

## failure modes

| failure | what the operator sees | evidence |
| --- | --- | --- |
| one engine times out, refuses cors, returns non-2xx | its row in sources says `could not answer: <reason>`; the count line says `k unreachable`; other results stand | observed (`runProvider`), verified for skipped rows |
| every engine unreachable | `nothing came back.` and `no engine could be reached from this browser: …` with reasons, plus `see which engines answered` | observed `AsherinSearchView.tsx:295-302`, `:669-680` |
| no results but engines answered | `no results.` | observed |
| keyed engine without a key | row `skipped: no key saved` | verified (`search-2-sources.png`) |
| page cannot be read (relay and direct both fail) | amber line under the card: `could not read this page from the browser (reader: …; direct: …)` | observed `SearchResultCard.tsx` |
| deep search with no model connected | sources and validation render, then the model error (connect a key) and the byok dialog | inferred |
| intel suite model returns prose | `the model did not return a json analysis…` in the tab | observed `intel.ts:160` |
| url map on an unreadable page | the map renders with `partial: <reason>` and zero counts | verified (`intelFromPage` unit test) |
| offline | input placeholder `offline — queued until you are back`, queue panel, replay on reconnect | inferred |
| thrown error inside a panel | the dashboard `ErrorBoundary` card, not a blank | observed (`gatedView`) |
| archive fetch fails | the panel's error line with the plain reason | observed `ArchivePanel.tsx:211` |

no state leaves a spinner forever: every await is under a deadline and every `loading` is cleared in a `finally` that checks its own abort controller. observed.

## interface & accessibility

desktop (1440×900, `search-0-idle.png`, `search-1-web.png` … `search-13-archive.png`): one focal point at idle (the search bar under a two-line heading); after a search the bar rises, the mode row stays above it, the corpus analysis sits collapsed under the bar, then one line of counts and four quiet actions, then cards. side panels (map, resolve, suite) split the width with a drag handle; preview and sources slide over from the right. colour carries meaning only: tier badges (green primary, blue established, amber institutional, grey general), amber for freshness and unreadable pages, red for hostile. observed.

phone (390×844, `search-phone-0-idle.png`, `search-phone-1-web.png`, `search-phone-2-deep.png`): mode row wraps to two lines, the bar keeps its clear button and arrow, action buttons switch to short labels (`map`, `xks`, `intel`), deep-search phases wrap, and the run reports no sideways scroll at 390px. map/resolve/suite open full-screen on phone (`fixed inset-0 … lg:static`). verified.

keyboard: `/` focus, arrows move, `c` copies, `esc` closes, `?` lists them; every icon button has an aria-label; the mode buttons carry `aria-pressed`; the input is labelled `search`. focus returns to the input after clearing. observed. motion: the aurora breathe and pulse are decorative and paused under `prefers-reduced-motion` (index.css `.zophiel-aurora*`), and paused mid-scroll by the app-wide perf switch. observed. known weakness: panel width uses `window.innerWidth` at render, so rotating a tablet across 1024px keeps the old layout until the next render (open gaps).

## relationships

| edge | kind | real in code? |
| --- | --- | --- |
| search → device key vault | reads_from (`getSearchKey`), writes_to (`SourcesPanel` save/delete) | yes |
| search → chat model provider (`@/lib/ai`) | calls (deep briefing via `resolveActiveModel` + `streamLlm`; suite via `askModel`) | yes, verified (5 model calls, all with shepherd's identity) |
| search → shepherd doctrine | depends_on (`buildSystemPrompt` in deep, `SHEPHERD_IDENTITY` in intel) | yes |
| search → connect graph | writes_to (`emitPull` organ `zophiel`) | yes |
| chat → search | none: chat does not call this engine; it has its own research lane | observed (no import of `@/lib/local/search` outside the room) |
| search → library / projects / knowledge | none | observed |
| search → open indexes | calls, trusts as untrusted data | yes |
| key vault → chat | the vault filters `search:` keys out of `getActiveModel` | yes (`src/lib/local/keys.ts:197-199`) |
| tests → engine | verified_by (`searchProviders.test.ts`, `searchEngine.test.ts`, the end-to-end harness) | yes |

## performance

the room is lazy; heavy panels (filters, preview, deep, map, suite, fusion, url map, archive, resolve, sources) are separate lazy chunks. a run fans out to at most ~12 engines in parallel, each bounded; deep and resolve read eight pages at concurrency three. the fusion pass is O(docs × entities) over ≤40 results. leaflet loads only when a location chip is opened and its map is removed on unmount. keydown, online/offline and resize listeners are removed on unmount; the in-flight run is aborted on unmount (`:176`). suite reads are cached per corpus so revisiting a tab does not re-ask the model. observed.

## copy & voice

all room copy is lowercase except proper names (Wikipedia, GitHub, Tor Browser…) and acronyms (PDF, CSV, CVE). no "zophiel" or "aureon" reaches the screen (verified by the idle step's assertion); the old storage keys keep the name internally. the model is "shepherd" (`briefing by shepherd`, suite loading lines). no "kernel offline" anywhere in the room. sentences that make a promise now match the code: the sources panel no longer says "nothing routes through a server" (the reader relay is a server); it says no asherin server sits in between and names the relay. verified by grep and screenshots.

## tests & proof

unit (`npx vitest run src/test/searchProviders.test.ts src/test/searchEngine.test.ts`): **32 passed** — every provider parser against a fixture of its real response shape (15 open + keyed), garbage tolerance, query plan and operator gate, wire query, ranking, tiering, url scheme refusal, freshness, cross-engine dedupe, date-range drop, fusion, instant answers, intel normalisation, reader and direct html parsing, url intel, deep-search grading, csv/markdown escaping, suite cache key, embed frame policy.

end-to-end (`/tmp/claude-0/-home-user-asherin/87b54ac0-828a-5e54-b780-8a347c5bd14e/scratchpad/searchtest.mjs`, production build, chromium, every public index answered by canned responses of the real shapes via `page.route`, shepherd answered by the mock model on the LM Studio port): **17 / 17 passed** —

| # | step | result |
| --- | --- | --- |
| 1 | room opens idle, no legacy names | pass |
| 2 | web search returns tiered, deduped results from many engines | pass — 7 results · 6 of 6 engines answered |
| 3 | sources panel lists what each engine did | pass |
| 4 | fusion panel renders deterministic analysis | pass |
| 5 | academic mode re-asks the scholarly registries | pass — arXiv, Crossref, OpenAlex |
| 6 | code mode surfaces repositories and q&a | pass — GitHub, Stack Overflow |
| 7 | preview reads the page on the device, relay disclosed | pass |
| 8 | intel report (no model) extracts entities | pass |
| 9 | intel map draws the entity graph | pass |
| 10 | resolve builds hop rings from read bodies | pass — Jane Doe, Acme Corp from page text |
| 11 | intel suite asks shepherd, renders json reads | pass — timeline, credibility |
| 12 | deep search gathers, reads, validates, streams a sourced briefing | pass — consensus strong · 8 pages read |
| 13 | pasting a link maps its connections | pass — socials, domains, emails |
| 14 | instant answer computes on the device | pass — `= 84` |
| 15 | archive mode browses the internet archive | pass |
| 16 | phone width 390px: idle, results, deep fit with no sideways scroll | pass |
| 17 | no page errors or error boundaries across the run | pass — console errors are only the harness's own blocked hosts |

model calls 5, all carrying shepherd's identity. the brief's original count was 16 steps; the phone step was added in this review.

screenshots (read by eye after the fixes; all in `/tmp/claude-0/-home-user-asherin/87b54ac0-828a-5e54-b780-8a347c5bd14e/scratchpad/shots/`): desktop `search-0-idle.png`, `search-2-sources.png`, `search-3-academic.png`, `search-4-code.png`, `search-5-preview.png`, `search-6-intel-report.png`, `search-7-intel-map.png`, `search-8-resolve.png`, `search-9-intel-suite.png`, `search-10-deep.png`, `search-11-url-intel.png`, `search-12-instant.png`, `search-13-archive.png`; phone `search-phone-0-idle.png`, `search-phone-1-web.png`, `search-phone-2-deep.png`. (step 1-web is captured as the result of step 2; the earliest failed-run shots `search-FAIL-*` are from before the fixes in the log and are superseded.)

## open gaps

- live behaviour of each public index from a real browser is **unknown** here: the sandbox cannot reach them, so the parsers are proven against documented shapes, not live traffic. Brave's api and GitHub code search are the likeliest to be refused (cors or 401); the sources panel will say so.
- gone because they need a server organ: dark web/onion search, leak search, vpn audit, dorks (removed by the operator earlier), domain harvest, scribd, face search, code audit, image osint, the v2 two-pass serp scraper, sweep, shadow host discovery. none is reachable.
- recent searches and filter profiles are plaintext localStorage; encrypting them under the device key would need the vault to be unlocked to show recents. left as is and disclosed.
- the reader relay sees every url read through it; a fully private read is only possible for sites that allow a direct cross-origin fetch, which most do not.
- side-panel width reads `window.innerWidth` at render, not on resize.
- offline queue and replay are inferred from code; no run toggled the network.

## shared-file notes (outside the two directories — not edited)

- `src/pages/Dashboard.tsx:2008-2013` `case "search"` — fallback title only, unreachable while the room is live.
- `src/lib/local/keys.ts:197-199` — the `search:` filter in `getActiveModel` is what keeps search keys out of chat; any change to the vault must keep it.
- `index.html` / `vercel.json` `frame-src` — `SocialPostEmbed.tsx:139` must stay in step with it.

## review log

| # | finding | domain | level | evidence | kind (defect / wrong claim) | repair mode | fix (commit or file:line) | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | social embeds iframed X, Instagram, TikTok, Reddit, Facebook, Spotify, all refused by the page's `frame-src`: a promised preview rendered as an empty box | interface | domain → failure (blank box) → cause (embed list wider than csp) → repair | observed (csp vs `SocialPostEmbed.tsx`) | defect | contract repair | `SocialPostEmbed.tsx:139`, `:154-171` frameable set; others render a link card | unit "social embeds respect the page's frame policy" |
| 2 | page preview injected the page text as html (sanitised) although the reader always returns plain text — an injection surface with no use | security | domain → failure (markup from a hostile page) → cause (html render of text) → repair | observed | defect | local correction | `PagePreviewPanel.tsx:47-55` renders text; dompurify import removed | code; `search-5-preview.png` |
| 3 | sources panel said "nothing routes through a server" while every preview, report, resolve and deep read goes through the jina reader relay | security / semantic | domain → failure (false promise) → cause (copy written before the reader) → repair | contradicted (copy vs `reader.ts:146-172`) | wrong claim | requirement reconciliation | `SourcesPanel.tsx:83`; relay disclosure under each preview `PagePreviewPanel.tsx:50-54` | e2e step 7 asserts the disclosure |
| 4 | archive panel fetches (`advancedsearch`, cdx, per-decade) had no deadline: a stalled archive.org left the spinner forever | execution | domain → failure (spinner forever) → cause (bare `fetch`) → repair | observed | defect | local correction | `ArchivePanel.tsx:6`, `:155`, `:171`, `:193` via `fetchTimeout` | e2e step 15 |
| 5 | map panel geocode, reverse geocode and route fetches had no deadline | execution | as above | observed | defect | local correction | `LocationMapPanel.tsx:2`, `:61`, `:71`, `:85` | code (no run opens the map) |
| 6 | intel suite re-asked the model every time a tab was revisited (each tab unmounts) — repeated spend on the operator's key | performance | domain → failure (duplicate model calls) → cause (no memo across mounts) → repair | observed | defect | state consolidation | `intel/useIntelAnalysis.ts:12-55` per-corpus cache | unit "intel suite cache key" |
| 7 | a provider url with an explicit foreign scheme (`javascript:`, `data:`, `mailto:`, `ftp:`) was prefixed with `https://` rather than refused | security | domain → failure (malformed or misleading link) → cause (prefix-first normalisation) → repair | observed | defect | local correction | `tiering.ts:158-170` | unit "builds a result, rejects junk…" |
| 8 | arXiv ids arrive as `http://`; the direct read of such a url was mixed content and the page policy refused it (two csp errors in the run) | integration | domain → failure (read refused) → cause (http target under https page) → repair | observed (console in the end-to-end run) | defect | local correction | `providers/open.ts:146-147` upgrades arXiv; `reader.ts:171-175` direct read is https only | unit arxiv parser; e2e console clean of csp errors |
| 9 | at 390px, after a search, the clear button and the submit arrow were clipped off the search bar: the input could not shrink | interface | domain → failure (dead control on phone) → cause (`flex-1` without `min-w-0`) → repair | observed (`search-phone-1-web.png` before) | defect | local correction | `AsherinSearchView.tsx:448`, `:458`, `:468` | `search-phone-1-web.png` after; e2e step 16 |
| 10 | the connect trace quoted the raw query when nothing came back | security | domain → failure (typed words in a log) → cause (fallback to `q`) → repair | observed | defect | local correction | `AsherinSearchView.tsx:286-287` | code |
| 11 | capitalised copy left on cards and the suite (`Read more`, `Intel Report`, `Preview`, `Copy`, `Definition`, `Profiling sources…` etc.) and the suite never said who was reading | interface / copy | domain → failure → cause (copied panels) → repair | observed | defect | local correction | `InstantAnswerCard.tsx:18`, `:28`; `SearchResultCard.tsx:206-226`; `intel/*Panel.tsx` loading lines; `SocialPostEmbed.tsx:196` | screenshots; grep |
| 12 | narrative v1 (the port report) counted 16 end-to-end steps and no phone pass | verification | — | contradicted (phone untested) | wrong claim | requirement reconciliation | phone step added; 17 steps | e2e step 16 |
| 13 | the lost-page live check sends up to 30 HEAD requests from the operator's ip to archived hosts | security | domain → exposure | observed | not a defect — the feature; now disclosed | — | security & privacy section | — |
| 14 | side panel width read from `window.innerWidth` at render | interface | domain → failure (stale layout on rotate) | observed | defect, left open | — | open gaps | — |
