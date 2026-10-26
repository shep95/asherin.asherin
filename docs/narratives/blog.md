```
room: blog (public reading room)   routes: /blog, /blog/<slug> ×22   files: src/pages/Blog.tsx · src/components/seo/ArticleShell.tsx · src/components/seo/RelatedLinks.tsx · src/components/seo/SeoJsonLd.tsx · src/data/blogCatalog.ts · src/pages/blog/*.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

files this narrative covers (nothing else imports them, confirmed with `grep -rln`): `src/pages/Blog.tsx`, `src/components/seo/ArticleShell.tsx`, `src/components/seo/RelatedLinks.tsx`, `src/components/seo/SeoJsonLd.tsx`, `src/data/blogCatalog.ts`, the 22 files under `src/pages/blog/`, and the `/blog*` entries of `src/lib/routeSeoData.ts` and `public/sitemap.xml`.

shared modules it reads but does not own: `Header`, `SiteFooter`, `LandingBackground`, `HumbleTypography` (lowercase at paint on public routes), `RouteSeo` (head tags from `routeSeoData.ts`), `src/lib/geo/schema.ts` (route json-ld graph), `src/index.css` (`journal-*`, `arrive`, reduced-motion), `App.tsx` (routes, redirects), `Dashboard.tsx` (`VALID_VIEWS`, `VIEW_ALIASES`), `public/robots.txt`, `public/llms.txt`.

line anchors are from the files as they stand after the fixes in this pass.

## purpose & promise

the blog is the only public surface that explains the rooms in long form. the index promises "public notes. with boundaries." and "current functions, archived concepts, method notes, and the limits that keep each claim honest" (`Blog.tsx:128-135`) [observed]. every article carries a status column — one of `current · archived · research · reference` with a plain label ("current capability", "archived design note", "retired composer mode", "method note") and three boundary lines — drawn from `ARTICLE_DISCLOSURES` by pathname (`blogCatalog.ts:237-321`, rendered `ArticleShell.tsx:91-106`) [observed]. the promise is that the blog does not oversell: a reader can tell a shipped room from an archived design from an essay before the first paragraph, and the first paragraph of every archived note now says so again in words (`<strong>status.</strong>` lines, eight articles — see review log) [observed].

after this pass the catalog's truth is: 1 release (asher.fold-memory, a described package), 1 current room note (the supervised research loop), 3 method notes, 3 guides, 1 founder note, 1 essay, 2 security guides, and 9 archived notes (zaxin, axrlen, forecasting, transit guardian, bulwark, asherin engine, cloud intelligence, asherin maps, law mode, C-SEO) [observed, `blogCatalog.ts:20-219`].

## entry & navigation

- header "Blog" (desktop and mobile, `Header.tsx:70-73, 175-179`), footer "blog" (`SiteFooter.tsx:13`), masthead eyebrow "asherin · blog" (`Blog.tsx:127`), shell breadcrumb and back link "blog" (`ArticleShell.tsx:34`), every article's breadcrumb json-ld `{ name: "blog", url: "/blog" }` — one name for the room now (was "notes" / "Blog" / "Journal" / "journal") [observed, fixed].
- routes: `/blog` → `Blog`; `/blog/<slug>` from `BLOG_ROUTES` (22 entries, `App.tsx:71-94`). old paths redirect in `App.tsx:97-126` and `vercel.json:14-26` (`/updates`, `/sources`, `/glossary/*`, `/blog/predictions/*` → `/blog`; `/feature/*`, `/houseofasher/*` → `/software`); `/house-of-asher` (hyphenated) is in neither and was a 404 from one article until this pass [observed].
- what loads first on the index: masthead → lead record → the other two pinned records → the filter line → the archive bucketed by month (`Blog.tsx:124-272`). on an article: breadcrumb → title block with the status aside → optional image → prose → faq slot → back link (`ArticleShell.tsx:68-124`) [observed].
- header is `fixed` (`Header.tsx:11`), so both pages start at `pt-32 sm:pt-40` [observed].

## workflow

happy path: open /blog → read the lead → or narrow with a tag word, the sort toggle, or the search field → open a record → read → "read next" (`RelatedLinks`) or the back link. secondary paths: `clear` resets all three controls (`Blog.tsx:95-99`, shown only while filtering, `:218-224`); the empty state is "nothing matches those words." with its own clear (`:262-270`) [observed]. there is no edit, delete, export or retry: the room is static and read-only.

## state & data

- react state only: `tagFilter`, `sort`, `query` (`Blog.tsx:31-33`); `progress` in the shell (`ArticleShell.tsx:38`). nothing is persisted; no localStorage, no indexeddb; nothing leaves the device [observed].
- content is `BLOG_POSTS` (22 posts, `blogCatalog.ts:20-219`) plus `ARTICLE_DISCLOSURES` (`:237-317`, fallback `DEFAULT_DISCLOSURE` `:221-229`). four hand-kept lists must agree: the catalog, `BLOG_ROUTES`, `ROUTE_SEO` `/blog/*` entries, `sitemap.xml`. they agree today (22/22/22/21 — bulwark is `excludeFromSitemap`) [observed by eye]; no test asserts it [observed — open gap].
- `BlogPost.featured` is set on 13 posts and read nowhere [observed: written-never-read; left as data, noted].

## logic

- date parsing: `toIso` appends `T00:00:00Z` to date-only strings so both catalog formats parse as utc (`Blog.tsx:17`); `fmtDate` / `fmtBucket` format `en-US` and lowercase (`:19-25`) [observed].
- tags: `tagsOf` = sorted distinct `p.tag`. after this pass there are 8 tags — archive, essay, founder notes, guide, method, product, release, security — so the filter line is 9 words instead of 16 (`Blog.tsx:27, 61`; `blogCatalog.ts` `tag:` fields) [observed, fixed: RECORD 026, informative categories, not arbitrary counts].
- filter → search → sort (`Blog.tsx:63-72`): tag equality, then a lowercase substring match over `title + dek + tag + statusLabel`, then `Date.parse` sort. search is substring, not tokenised: "ai osint" matches, "osint ai" does not [observed, accepted for 22 records].
- lead: `pinnedPosts[0]` (`:74-78`); the dead `tag !== "Live Prediction"` filter is gone [fixed]. pinned records leave the archive list unless the reader is filtering (`:80-82`) [observed].
- buckets: `Map<month, posts[]>` from the already-sorted list, so insertion order follows the sort (`:84-93`) [observed].
- reading progress: `scrollTop / (scrollHeight − clientHeight)`, passive scroll + resize listeners, removed on unmount (`ArticleShell.tsx:41-53`) [observed].
- disclosure lookup is by `window.location.pathname` at render (`ArticleShell.tsx:39`); an unregistered slug falls to "public reference" [observed].

## integrations & network

- the blog code makes no network call. no fetch, no key, no timer beyond the scroll listener [observed].
- outbound only through links. every `to`/`href` in the 22 articles now resolves to a route in `App.tsx` or a dashboard view id/alias (checked by script against `BLOG_ROUTES`, `VALID_VIEWS`, `VIEW_ALIASES`: 0 broken) [verified]. targets used: `/blog/*`, `/software`, `/founder`, `/dashboard`, `/dashboard/search`, `/dashboard/zerlal`, `/dashboard/google`, `/dashboard/api-keys`, `/dashboard/asherin-adam`, `/dashboard/asherin-defender`.
- head: `RouteSeo` is now the only writer of `<title>`, description, canonical and og for every `/blog*` path (`RouteSeo.tsx:27-155` from `routeSeoData.ts:108-249`). the seven articles that also called `applySeoHead` with a different title no longer do (see log #8) [fixed]. `HumbleTypography` lowercases title and meta afterwards on every public route (`HumbleTypography.tsx:85-91`) [observed].
- json-ld: `ArticleJsonLd`, `FaqJsonLd`, `BreadcrumbJsonLd` append `<script>`s to `<head>` and remove them on unmount (`SeoJsonLd.tsx`). `RouteSeo` also emits an Article node when `ogType === "article"` (`geo/schema.ts:100-114`), so each article ships two Article nodes with the same headline source — redundant, not contradictory now that the per-article author is the shell's byline (log #9) [observed, hypothesized harmless; shared file, not changed].

## security & privacy

- no input reaches the network: the search field filters an in-memory array; no `dangerouslySetInnerHTML` in the blog files [observed].
- `ArticleShell` compares `pathname` against a static record; a crafted path cannot inject [observed].
- the only image dependency is the bundled wallpaper (`LandingBackground.tsx:24-28`) and two bundled article images (`AsherFoldMemory.tsx`, `EliteCorporationsAlgorithmsVsAxrlen.tsx`) [observed].
- copy no longer claims storage or processing asherin does not do: "isolated to the signed-in owner", "browsers you sign in on", "managed model access", "uploads"-style claims are gone (log #1-#7) [verified by grep].

## failure modes

- empty filter result → "nothing matches those words." + clear (`Blog.tsx:262-270`) [observed].
- unknown `/blog/<slug>` → `NotFound` (`App.tsx:242`) [observed].
- a `read next` target that redirects would drop the reader on `/blog` or `/software` unexplained; none remain (log #10-#12) [verified].
- `/dashboard/<id>` with an id that is neither a view nor an alias collapses to chat (`Dashboard.tsx:229-234`); `asherin.search` was such an id and is now `search` (log #10) [fixed].
- offline: the page is static; nothing degrades except the wallpaper if it is not cached [inferred].

## interface & accessibility — judged against the aesthetic records

- **figure-ground, negative space before borders (004, 007, 018).** hairlines at 8% (`journal-rule`), no cards on the index, rows separated by rules and `py-7`; the article header's status aside is a rule, not a box (`ArticleShell.tsx:91-94`) [observed, holds]. figures in `AsherFoldMemory.tsx` and `PersonalitiesToThinkingPatterns.tsx` are bordered `rounded-2xl` panels: each is a genuine diagram (a bar chart, three donuts, a six-step loop, two flow rows), which 007 allows; their `backdrop-blur-md` is neutralised by `.landing-perf` (`index.css:539-543`) [observed, accepted].
- **one focal point, hierarchy, visual weight (012, 013, 030).** masthead h1 `text-4xl sm:text-5xl` (`Blog.tsx:128`), lead title `text-3xl sm:text-4xl` (`:145`), pinned titles `text-xl` (`:166`), archive row titles `text-lg sm:text-xl` (`:243`). the scale now descends with importance — room name › lead › pinned › archive — where before the lead (5xl) fought the masthead (6xl) and the archive rows (2xl) outweighed the pinned set (xl) (log #13, #14) [fixed; inferred from classes].
- **type scale (020, 043).** index after the pass: 11px / 12px / sm / base / lg / xl / 3xl-4xl / 4xl-5xl — one fewer step and no 6xl or 2xl; roles: eyebrow 11px tracked, control 12px, meta 11px, dek sm/base, row title lg→xl, lead 3xl→4xl, masthead 4xl→5xl [observed]. the shell keeps title 3xl→5xl, status label xl, body 1.02rem, h2 1.75rem (`index.css:78-85`) [observed].
- **measure (042).** article prose `max-w-[38rem]` at 1.02rem ≈ 74 characters a line (`ArticleShell.tsx:110`; was 44rem ≈ 86); the faq slot, back link and `RelatedLinks` share the same column (`ArticleShell.tsx:114-115`, `RelatedLinks.tsx:24`); article dek `max-w-xl` (`ArticleShell.tsx:88`); lead dek `max-w-xl` at 16px ≈ 72 (`Blog.tsx:148`); pinned and row deks `max-w-lg` at 14px ≈ 73 (`:169, 246`; were `max-w-2xl` ≈ 95) (log #15) [fixed; inferred from widths].
- **continuity (009).** on the phone the two "also pinned" records now have a rule between them like every archive row (`border-t` for `i > 0`, `sm:border-t-0` for the right-hand column, `Blog.tsx:163`) (log #16) [fixed].
- **signal-to-noise (014).** each row's meta is `tag · read time · status` (`:247-253`); tag and status overlap only for the archive tag, where the status is the more specific word. accepted. the lead's meta adds "lead record", the pinned adds "pinned" (`:105-117`) — a label, not a badge [observed].
- **link signifiers, similarity (006, 034).** whole-block links dimmed only on hover and had `focus-visible:outline-none` with nothing in its place — keyboard focus was invisible on the lead, the pinned set, every row and every read-next item. all now share one hairline focus outline, offset 4px, at 40% (`blockLink`, `Blog.tsx:101-104`; controls `:188, 199`; `RelatedLinks.tsx:31`) (log #17) [fixed]. in-body links use the house rule — underline at 30%, full on hover (`index.css:88-96`); the `text-accent hover:underline` and bare `underline` utilities that overrode it in four articles are gone (log #18) [fixed].
- **accent economy (041).** accent is `0 0% 82%` on public pages and becomes the live-signal green only inside `[data-asherin-room]` (`index.css:283, 1105`); on the blog it appeared on prose links and a blockquote border, both now removed. the fold-memory bars and donuts keep `bg-accent/70` / `stroke-accent/70` as data marks against muted siblings [observed, accepted].
- **motion as state (037).** `.arrive` opacity + 4px settle, 360ms, house easing, on the masthead and lead (`index.css:36-40, 119-123`); progress hairline `transition-[width] 150ms` (`ArticleShell.tsx:64-65`); both collapse under `prefers-reduced-motion` (`index.css:48-55`) [observed, holds]. the fold-memory bars no longer animate from 0 to their value on mount (a 1s performance, not a state change) — they draw at their value (log #19) [fixed].
- **caps.** rendered copy is lowercased by the `lowercase` utility and by `HumbleTypography` on every public route (`HumbleTypography.tsx:60-69, 77-92`). four figcaptions used `uppercase`, which re-capitalised after the filter; they are lowercase now (log #20) [fixed]. catalog titles and deks are lowercase at the source except proper names and acronyms (AI, OSINT, SAST/DAST, C-SEO, Indian, Bible) [fixed]. article bodies remain mixed-case at the source; the paint filter also flattens proper names — a shell-level choice, logged under open gaps.
- **phone 390×844 (033, 053).** `px-5` gives 350px of column. masthead 36px h1 wraps to two lines; the count sits under the standfirst (`flex-col gap-3`, `Blog.tsx:131`); the filter line stacks (`flex-col gap-5`, `:176`), nine 12px words wrap in two rows, the sort word and the 128px search field share one baseline row (`:195-213`); rows are single-column with the date above the title (`sm:grid-cols-[7rem_1fr]`, `:235`); the article header is single-column with the status aside under a top rule (`lg:` breakpoint only, `ArticleShell.tsx:81, 93`); `pre` boxes scroll horizontally at 0.68rem (`index.css:114-117`); the 38rem prose column is narrower than the viewport so it is simply full width. tap targets: tag words are 12px text with `py-0` — small (033); accepted for a filter line of nine words, logged [inferred from classes; not screenshot-confirmed].
- **a11y.** `aria-pressed` on tag words, `sr-only` label on the search field, `aria-label` on each section (`"Lead article"`, `"Also pinned"`, `"Filter articles"`, `"All articles"`, `"read next"`), `<time dateTime>`, `role="img"` + label on the donut svg; heading order h1 → h2 lead → h3 pinned → h2 month → h3 rows [observed, holds]. byline "asher newton" in the shell (`ArticleShell.tsx:89`) and json-ld author default "Asher Newton" (`SeoJsonLd.tsx:29`) agree now that no article overrides it (log #9) [fixed].
- **trust cues (045).** every archived note opens with a `status.` paragraph that names what shipped instead and links to it; the status column repeats it in three lines. where the article once promised ("ships with the app", "monitors targets continuously", "allowlists ClaudeBot"), it now states ("not built; asherin.search shipped", "a browser's view of the code you gave it", "robots.txt now refuses") [observed].

## relationships

- reads_from `blogCatalog.ts` (posts, disclosures) — real.
- hands to `/dashboard/<view>` via links — real for `search`, `zerlal`, `google`, `api-keys`, `asherin-adam`, `asherin-defender` (all in `VALID_VIEWS`, `Dashboard.tsx:167-202`) [verified].
- depends_on `Header`, `SiteFooter`, `LandingBackground`, `HumbleTypography`, `RouteSeo` — real, shell-owned.
- trusts `public/robots.txt` to say what the C-SEO note now says it says (`robots.txt:28` ClaudeBot disallowed) [verified].
- verified_by: nothing automated for the blog's own logic; `seoSmoke.test.ts` covers the built sitemap and prerender [observed].

## performance

- index: one `useEffect` for json-ld, three memos, 22 records; no virtualisation needed [observed].
- shell: one passive scroll listener + resize, removed on unmount; `setProgress` re-renders the shell every scroll frame — children are the same element references so react bails out of the body [observed, acceptable].
- wallpaper is a fixed `background-image` promoted with `translateZ(0)` under `.landing-perf` (`index.css:545-548`); `backdrop-filter` is disabled under the same class [observed].
- seven articles no longer run a second head-writing effect on mount [fixed].

## copy & voice

- the model is "shepherd" wherever the articles mean the model (voice stack, research loop, code loop, legal frame, sovereign path); "Asherin" remains for the app and the company [fixed, grep].
- gone: "managed model access", "free trial", "pricing pages", "subscribe below", "newsletter", "signed-in owner", "browsers you sign in on", "admin routing", "Asherin Eye", "Cloud Intelligence" as a live room, "Every persona (Asherin, Asher, Zophiel)", "chat agents (Asherin, Asher, Axrlen)", "LAW pill… glows when active", "ZERLAL monitors targets continuously", "AI-crawler allowlist", "$99 one-time pack", "tier by tier", "Related in the operator stack" [verified by grep; see log #1-#7, #21-#25].
- residual mixed-case bodies in older articles are flattened at paint; the index, shell, catalog and every eyebrow/title/dek touched in this pass are lowercase at the source.

## tests & proof

- `npx tsc --noEmit -p tsconfig.app.json` — clean after the pass. `npx eslint` on every touched file — 0 errors, 1 pre-existing warning (`AsherFoldMemory.tsx:16` unused `PUBLISHED`, present before this pass).
- link check: a script resolved every `to`/`href` in `src/pages/blog/*.tsx` against `BLOG_ROUTES`, the static routes, `VALID_VIEWS` and `VIEW_ALIASES` → 0 broken.
- `src/test/seoSmoke.test.ts` (needs `dist/`) checks every sitemap url resolves 200 and that `/blog` prerender carries no crawler-only markup [observed, not run here].
- screenshots at 1440×900 and 390×844: not taken in this session; the phone claims above are read from the classes.

## open gaps

- no test ties the four hand-kept lists (catalog, routes, seo, sitemap) together, and `RelatedLink.to` is an untyped string — a typed union over `BLOG_ROUTES` + static routes would make the link check permanent.
- lowercase is applied at paint by `HumbleTypography`, which also flattens proper names (India, Google, the Bible); the doctrine wants lowercase at the source with proper names kept. the index, shell and catalog comply; older article bodies do not.
- two Article json-ld nodes per article (`ArticleJsonLd` + `RouteSeo`'s route graph): redundant, shared file, left for the shell pass.
- `public/llms.txt` still says "one account opens the chat", "what a signed-in account can open", lists "team", and names "asherin.eye" (`llms.txt:3, 5, 11`) — shared with the landing pass; patch handed to the main session, not applied here.
- `Header.tsx` nav words are `uppercase tracking-[0.22em]` ("Software", "Blog") — shell-owned; the only caps left on the blog screen come from the header.
- `BlogPost.featured` is written and never read.

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | "managed model access", "Asherin can apply service rules", "no free trial… pricing pages" — accounts and tiers that do not exist | requirements | cause | `AiWithoutRestrictions.tsx` (sovereign path, policy checks, faq), `SovereignAiPlatforms.tsx` (where asherin sits, faq) | defect | requirement reconciliation | rewritten to the key-you-bring truth; read-next → existing routes | grep for `managed access\|free trial\|pricing` in blog → 0 asherin claims |
| 2 | "Subscribe below. It's free to start." / "this newsletter … every week" — no form, no newsletter | requirements | failure | `AiStackForIndianStartups.tsx:117-122` (old) | defect | local correction | paragraphs replaced with one honest sentence | read |
| 3 | asherin engine, cloud intelligence, asherin maps described as shipped rooms with "signed-in owner", "browsers you sign in on", "Asherin Eye", "Cloud Intelligence" stack; none of GHOST HARVEST / DOT cameras / device roster / recovery rings exists in `src` (`grep` → only the catalog); asherin.google reads nothing on this device (`docs/narratives/asherin.google.md`) | semantic | cause | `AsherinEngineDeepTime.tsx`, `CloudIntelligenceSuite.tsx`, `AsherinMapsFindMy.tsx`; `src/components/dashboard/search/LocationMapPanel.tsx`, `src/lib/asher/directions.ts` (routing is real) | defect | requirement reconciliation | status "archived design note" in catalog; `status.` paragraph at the top of each naming what shipped; faq and closing answers rewritten; stack diagram relabelled | `blogCatalog.ts:256-270`; `*:88` status lines |
| 4 | LAW / NAR composer pills — "glows when active", "ships to every operator" — nothing in `src` (`grep -rn '"LAW"\|legal mode' src` → only this article and the catalog) | semantic | cause | `AureonLegalAdvisor.tsx` whole premise | defect | requirement reconciliation | archived "retired composer mode"; status paragraph; "how to get the same frame today" replaces the click-through; title, dek, json-ld, routeSeo title aligned | `blogCatalog.ts:271`; `AureonLegalAdvisor.tsx:74` |
| 5 | "AI-crawler allowlist in robots.txt … ClaudeBot, GPTBot, PerplexityBot … explicitly allowed" — `public/robots.txt` disallows every one of them; "glossary cluster", "LLM Guidance headers", "public hit-or-miss record" do not exist | semantic | cause | `HowAureonUsesCseoResearch.tsx` (old :302-361, :379-381); `robots.txt:13-40` | defect | requirement reconciliation | archived "archived publishing note"; implementation section rewritten as "applied, and what changed"; faq answer reversed; verification paragraph made honest | `robots.txt:28`; `blogCatalog.ts:305` |
| 6 | ZERLAL "monitors targets continuously", "ships every report with a limitation block", "internal benchmarks against bug-bounty corpora"; asherin.cyber is a local code scanner, log correlator, device check and sigma converter (`docs/narratives/asherin.cyber.md`) | semantic | cause | `AiVulnerabilityScanningExplained.tsx`, `VulnerabilityChainingExplained.tsx` | defect | requirement reconciliation | "what asherin does today" section; benchmark claim replaced with published write-ups; links → `/dashboard/zerlal` | read; link script |
| 7 | voice and code notes name "Asherin, Asher, Zophiel / Axrlen" as personas and "admin routing", "gemini-2.5-flash-lite in production", a 47s-vs-34min benchmark that the faq itself denies; the model is shepherd on the operator's key | semantic | cause | `HowWeMakeAureonSoundHuman.tsx`, `CodeNarrativeQuantumCollapse.tsx` | defect | requirement reconciliation | shepherd throughout; status paragraph dating the voice note before the thinking-pattern conversion; benchmark paragraph replaced with the faq's truth; "bug reports from users" → exported asherin.bugs entries | read |
| 8 | two writers for one `<title>`: `RouteSeo` from `routeSeoData.ts` and a per-article `applySeoHead` effect with a different title (e.g. "Asherin Legal Advisor (LAW Mode) … \| Asherin" vs "Multi-jurisdictional legal research in asherin") | state | cause | seven articles' `useEffect(() => applySeoHead(...))`; `RouteSeo.tsx:140-155` | defect | state consolidation | effects and imports removed; `routeSeoData.ts` is the single source and its `/blog/*` titles were aligned to the visible titles | `grep applySeoHead src/pages/blog` → 0; tsc clean |
| 9 | visible byline "asher newton" vs json-ld `author="Asherin R&D"` on six articles | data | failure | `ArticleShell.tsx:89`; six `ArticleJsonLd` props | defect | local correction | `author` prop removed → default "Asher Newton" | `grep "Asherin R&D"` → 0 |
| 10 | `/dashboard/asherin.search` is neither a view id nor an alias → collapses to chat | behavioral | cause | `Dashboard.tsx:167-234`; `WhatIsAiOsint.tsx`, `HowAiPredictiveForecastingWorks.tsx` | defect | local correction | → `/dashboard/search` | link script: 0 broken |
| 11 | `/house-of-asher` → 404; `/blog/the-crypto-dump-october-2026` → 404 | behavioral | failure | `CodeNarrativeQuantumCollapse.tsx` (old :432), `TheTruthAndRealityOfWars.tsx` (old :698); `App.tsx` routes | defect | local correction | replaced with existing records / `/founder` | link script |
| 12 | 14 read-next targets that only redirect (`/glossary/*`, `/feature/zerlal`, `/blog/predictions/*`, `/houseofasher/theories`, `/updates`) — the reader lands on `/blog` or `/software` unexplained | behavioral | failure | `App.tsx:97-126`, `vercel.json:14-26`; eleven articles | defect | local correction | every target now a live route or view; `RelatedLinks.tsx` header comment states the rule | link script |
| 13 | two focal points: masthead `sm:text-6xl` against lead `sm:text-5xl` | interface | cause | old `Blog.tsx:125, 139` | defect | local correction | masthead `sm:text-5xl`, lead `sm:text-4xl` | `Blog.tsx:128, 145` |
| 14 | archive rows (`sm:text-2xl`) outweighed the pinned set (`text-xl`) | interface | cause | old `Blog.tsx:168, 220` | defect | local correction | rows `text-lg sm:text-xl`; pinned unchanged | `Blog.tsx:166, 243` |
| 15 | measure: prose 44rem ≈ 86 chars; deks `max-w-2xl` ≈ 95 chars at 14px | interface | cause | old `ArticleShell.tsx:112`, `Blog.tsx:147, 222` | defect | local correction | prose column 38rem (shell, faq slot, back link, read-next); lead dek `max-w-xl`; row/pinned deks `max-w-lg` | `ArticleShell.tsx:88, 110-115`; `Blog.tsx:148, 169, 246`; `RelatedLinks.tsx:24` |
| 16 | phone: stacked pinned records with no rule between them while every row has one | interface | failure | old `Blog.tsx:160` | defect | local correction | `border-t` for `i > 0`, `sm:border-t-0` for the right column | `Blog.tsx:163` |
| 17 | `focus-visible:outline-none` with no replacement on every block link — keyboard focus invisible (RECORD 049) | interface | cause | old `Blog.tsx:137, 162, 213`; `RelatedLinks.tsx:28` | defect | local correction | one `blockLink` outline (hairline, offset 4, 40%) on lead, pinned, rows, controls, read-next | `Blog.tsx:101-104`; `RelatedLinks.tsx:31` |
| 18 | `text-accent hover:underline` / bare `underline` on prose links and `border-accent/60` on a blockquote — accent on ordinary links against RECORD 041, overriding the house link rule | interface | cause | `AiVulnerabilityScanningExplained.tsx`, `VulnerabilityChainingExplained.tsx`, `HowAureonUsesCseoResearch.tsx`, `CodeNarrativeQuantumCollapse.tsx`, `HowWeMakeAureonSoundHuman.tsx` | defect | local correction | utilities removed; `.journal-body a` / `blockquote` rules apply | `grep text-accent src/pages/blog` → 0 |
| 19 | bar charts animate 0→value for 1s on mount — decoration, not state (RECORD 037) | interface | cause | old `AsherFoldMemory.tsx:666-683` | defect | local correction | width drawn directly; `useEffect`/`useState` and the unused `Check` import removed | read; eslint |
| 20 | `uppercase` figcaptions re-capitalise after the lowercase paint filter | interface | failure | `PersonalitiesToThinkingPatterns.tsx:342`, `AsherFoldMemory.tsx:694, 751, 781` (old) | defect | local correction | `lowercase`, tracking reduced to the house 0.12em | read |
| 21 | 16 filter words from 15 tags, several with one member (Landscape, Predictive, Voice Design, AI Search, Analysis…) — RECORD 026 | interface | cause | old `blogCatalog.ts` `tag:` fields | defect | requirement reconciliation | 8 tags: archive, essay, founder notes, guide, method, product, release, security | `grep -c 'tag: "' blogCatalog.ts` by value |
| 22 | four names for one room: "notes" (shell), "Blog" (header), "Journal"/"journal"/"Blog" (breadcrumb json-ld) — RECORD 027/032 | interface | cause | `ArticleShell.tsx:33` (old), articles' `BreadcrumbJsonLd` | defect | local correction | "blog" everywhere the blog owns the word; header left to the shell pass | grep `name: "Journal"` → 0 |
| 23 | dead code: `tag !== "Live Prediction"` filter on the lead; `heroPinned` | structural | failure | old `Blog.tsx:74-78` | defect | local correction | removed | `Blog.tsx:74-78` |
| 24 | "$99 one-time pack" in the fold-memory seo description while the disclosure says "described, not sold" | semantic | failure | old `routeSeoData.ts:246` | defect | local correction | "described here, not sold." | `routeSeoData.ts` |
| 25 | transit guardian faq "Can I share a trip live? Yes." contradicting §7 "not a currently available sharing service"; bulwark notification pipeline described in the present tense | semantic | failure | `TransitGuardian.tsx`, `BulwarkCounterSurveillance.tsx` | defect | local correction | answers moved to the past/conditional with the reason (no relay server); status paragraphs added naming `asherin.defender` / `asherin.adam` | read |
| 26 | v1 claim: "FaqJsonLd portals into #asherin-article-faq-root" (shell header comment) — `FaqJsonLd` only writes `<head>` | semantic | failure | old `ArticleShell.tsx:1-8`; `SeoJsonLd.tsx:63-85` | wrong claim | local correction | comment rewritten: the root is an optional slot | `ArticleShell.tsx:1-9` |
| 27 | v1 claim: catalog↔routes↔seo↔sitemap "kept in step by hand" — true, but the count was unstated | verification | domain | the four lists | wrong claim | — | counted: 22/22/22/21 (bulwark excluded from sitemap on purpose) | by eye |
| 28 | sitemap `lastmod` stale for every edited record | data | failure | `public/sitemap.xml` | defect | local correction | 21 entries → 2026-10-25 | script count |

## vision confirmation — 2026-10-26

screens: final3-d-blog.png and final3-m-blog.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: the index (lead, pinned, all articles) and two articles render at both widths; the article measure stays readable and the index → article → index round trip works.
