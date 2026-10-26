```
room: asherin.knowledge   view id: knowledge-vault   files: src/components/dashboard/KnowledgeVaultView.tsx, src/lib/knowledgeVault/{vault,store,chunk,retrieve,answer,web}.ts
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

line numbers are as of this review. shared files (`Dashboard.tsx`, `navIntents.ts`, `v2Titles.ts`) are edited by other rooms concurrently; for those the symbol is the anchor and the line a hint. evidence status is given per claim: **observed** (code read), **verified** (a unit test passes it), **inferred**, **unknown**.

files under review: `src/components/dashboard/KnowledgeVaultView.tsx` (the room), `src/lib/knowledgeVault/vault.ts` (entry point: retrieve, ingest, ask, contradictions, highlight, chat brief), `store.ts` (rows), `chunk.ts` (shaping, chunking, tokenizer), `retrieve.ts` (bm25), `answer.ts` (grounded answer), `web.ts` (page reader), `__tests__/{chunk,retrieve,vault}.test.ts`.

## purpose & promise

asherin.knowledge is the operator's private corpus: paste text, drop a file, or point at a web page; the room reads it on this device, cuts it into passages, and answers questions from those passages with numbered citations that open the passage. the interface promises exactly this: "your own documents, indexed on this device and cited." (`KnowledgeVaultView.tsx:302`, shown only outside the v.2 shell) and, always, "every answer points at the passage it came from. nothing is read, ranked or stored off this device; shepherd sees only the passages it is about to cite." (`:307`). each clause has code behind it: reading (`vault.ts:193` `ingestText`, `:205` `ingestFile`, `:229` `ingestWeb`), cutting (`chunk.ts:85` `chunkText`), ranking (`retrieve.ts:37` `LexicalIndex`), storing (`store.ts:110` `addSource`), citing (`answer.ts:77` `answerFromPassages`, `:38` `parseCitations`), opening (`KnowledgeVaultView.tsx:209` `openPassage` → `store.ts:172` `getPassageContext`). — observed; the ranking, chunking, citation and store contracts are verified by 32 unit tests.

what the room does **not** promise any more: embeddings (there is no embedding model in this build — no `transformers`/`@xenova` in `package.json`, `onnxruntime-web` is used only by the sentinel audio chain, and the hosted `vault-ingest`/`vault-retrieve` functions no longer exist), a "vault agent" that decides to "store · fetch · answer", video transcripts, api pulls, or a hybrid web mode. the counter line says "isolated only for now" (`:308`). — observed (grep over `src/` for `transformers|embedding|cosine`: hits only in sentinel audio, arvision, ide and vedic).

## entry & navigation

- rail: group `understand`, label `asherin.knowledge`, codename `private corpus`, blurb "private files asherin can cite", keywords knowledge / vault / corpus / rag / documents / cite (`src/lib/navIntents.ts:145-151`). the blurb says *asherin* (chat) can cite these files; until the chat hook below lands only this room cites them — shared-file patch proposed. — observed.
- view id `knowledge-vault` (`src/components/dashboard/types.ts:126`), in `VALID_VIEWS` (`Dashboard.tsx:189`), rendered by `case "knowledge-vault"` → `gatedView("knowledge-vault", KnowledgeVaultView, "Knowledge Vault (RAG)")` (`Dashboard.tsx:2075-2080`) inside `ErrorBoundary` + `Suspense` (`:1917-1925`). the room is not retired so `canAccess` is true and the capitalised "Knowledge Vault (RAG)" string reaches only the `RetiredRoom` fallback, never the screen — shared-file patch proposed anyway. — observed.
- v.2 shell title `knowledge` / "private files asherin can cite." (`src/lib/dashboard/v2Titles.ts:32`) rendered by `V2PageShell` (`Dashboard.tsx`, the `isV2` branch of the room frame). in v.2 the room hides its own hero (`KnowledgeVaultView.tsx:298` `!v2 &&`, `useIsV2` from `src/lib/dashboardUiContext.ts:22`) so there is one title per screen. `DEFAULT_DASHBOARD_UI` is `"current"` (`src/lib/dashboardUi.ts:14`), so today the room's own `h1 asherin.knowledge` shows. — observed.
- what loads first: the promise strip with counts, the `ask` card, `add a source` on the text tab, and `corpus` saying "reading the corpus…" until `listSources` returns (`:75-84`, `:519-522`). — observed.

## workflow

happy path (the end-to-end step the review demands):

1. **add a text source** — name + body → `index on this device` (`:108-116` `handleText` → `vault.ts:193` `ingestText` → `store.ts:110` `addSource`). the text is credential-masked (`src/lib/library/library.ts:208` `maskCredentials`), cleaned and capped at 400k chars (`chunk.ts:31` `cleanSourceText`), chunked (`chunk.ts:85`), and written as one `aureon_vault_sources` row plus n `aureon_vault_chunks` rows (`store.ts:122-146`). the source row is inserted first (`store.ts:128`), the chunks second (`:130-140`); if the chunk write fails the source row is removed again so nothing half-indexed shows as indexed (`:141-145`). toast: "“name” indexed — n passages, cut and ranked on this device." (`:104`). — verified (`vault.test.ts` "stores a text source…").
2. **add a file** — the picker accepts pdf, docx, images and text/markup (`vault.ts:184` `INGEST.accept`); `handleFile` (`:118-129`) → `vault.ts:205` `ingestFile`, which refuses over 100 mb before reading (`:209`), then reads through `extractFile` from asherin.extract (`src/components/dashboard/scrapper/extract.ts:400`: pdf text layer, scans read optically up to 20 pages, docx via jszip, photos via tesseract, plain text) and stores the text with `method` set to how it was read (`:219`). the bytes are not kept. progress shows in the card header ("reading page 3 of 12", "reading optically 62%", `:37-42` `progressLabel`). the picker value is reset after every pass so the same file can be added again (`:127`). — observed (the readers themselves are verified in asherin.extract's suite, 28 tests).
3. **add a web page** — `fetch and index` (`:131-147` `handleWeb(false)` → `vault.ts:229` `ingestWeb` → `web.ts:110` `readWebPage`). the browser fetches the page itself (`web.ts:87` `fetchText`, 20 s abort, 4 mb cap, `credentials: "omit"`), reduces html to prose (`web.ts:46` `htmlToText`: script/style/nav/footer/aside/form/header dropped, `main`/`article` preferred). a site that refuses cross-origin reads comes back `failure: "blocked"`; the card then offers, once, "read it through r.jina.ai" with the sentence "its address — not your documents — is sent to that service" (`:486-494`); only that tap calls the reader (`handleWeb(true)` → `web.ts:122`). — verified (`vault.test.ts` web suite: blocked / http / empty / consent / direct read).
4. **retrieve** — enter or the search button (`:169-181` `runRetrieve` → `vault.ts:82` `retrieveVault`). no model is involved: the chunks table is loaded into a `LexicalIndex` (`vault.ts:53` `loadIndex`, cached until either table changes, `:48` `watchForChanges`), bm25 ranks the top 8, each hit becomes a numbered `VaultPassage` with `relevance` relative to the best hit and the list of stems it matched (`:90-99`). — verified (`retrieve.test.ts`, `vault.test.ts` "finds the passage, numbers it…").
5. **ask shepherd** — `ask shepherd` (`:192-207` `runAsk` → `vault.ts:245` `askVault`) retrieves and then calls `answerFromPassages` (`answer.ts:77`): the model sees only the numbered passages (1,400 chars each, at most 8) and the question (`answer.ts:29` `buildAnswerPrompt`) under a system line that demands `[n]` after every claim and a plain "not covered" sentence otherwise (`answer.ts:22` `ANSWER_SYSTEM`); `askModel` from `src/lib/ai.ts:332` with a 60 s abort (`answer.ts:79-80`). the answer's `[n]` markers become buttons; a marker outside 1..k is stripped before display (`answer.ts:50` `stripBadCitations`). an answer with no citation carries the line "no passage was cited — read the answer as unsupported." (`:287-289`). when the retrieve step already found nothing, shepherd is not asked and the empty state says so (`:372-375`). if a model key is missing the button is disabled with the reason, and retrieval still works (`:283`, `:338-340`; `answer.ts:55` `modelReady` never raises the key dialog). a retrieve-only result offers `answer from these passages` afterwards (`:278-285` → `:183-190` `runAnswer`). — verified for the contract (`vault.test.ts` answer suite), observed for the wiring.
6. **open the cited passage** — tapping `[n]` in the answer or the passage row (`:209-216` `openPassage`) expands the passage with the matched words highlighted (`vault.ts:161` `highlightSegments`), the previous and next passage of the same source dimmed around it (`store.ts:172` `getPassageContext`), and the line "passage i of “source” · matched: …" (`:412`); the row scrolls into view (`:215`); the position line is `:412`. — observed; highlight verified.
7. **delete a source** — the trash arms (`sure?`, 3.5 s), the second tap deletes chunks then the row and re-reads to prove it (`:150-166` `remove` → `store.ts:151` `deleteSource`). toast names how many passages went with it; a result that cited the source is cleared (`:163`). — verified (`vault.test.ts` "deletes a source and every passage…").

secondary paths:
- **send cited notes to whiteboard** → `queueBoardDrop({ kind: "brief", source: "knowledge-vault", … })` (`:218-227`, `src/lib/whiteboard/boardInbox.ts:46`). — observed, real.
- **copy as cited brief** → clipboard markdown with the answer (if any) and every `[n]` passage; a refused clipboard says so (`:229-239`). — observed.
- **refresh** the corpus list by hand (`:504-512`); the list also refreshes itself 300 ms after any write to either table (`:86-93` `onVaultChange`). — observed.
- **legacy rows**: a hosted-era source (no `method`, no local chunks) is shown as failed with "indexed in the hosted era — its passages are not on this device. remove it and add the source again." (`store.ts:65-88` `normaliseSource`). — verified.

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| sources | indexeddb table `aureon_vault_sources` via the postgrest shim | `VaultSource` (`store.ts:19-35`): id, user_id, name, source_type text/file/url, status indexed/empty/failed, chunk_count, char_count, method, origin, truncated, error_message, created_at | until deleted | no |
| passages | indexeddb table `aureon_vault_chunks` | `VaultChunkRow` (`store.ts:37-46`): id, user_id, source_id, chunk_index, content, start, end, created_at | until the source is deleted | only the ≤8 passages chosen for an answer, to the connected model (`answer.ts:29`) |
| lexical index | module memory (`vault.ts:45` `cached`), rebuilt on first search after any table write | `LexicalIndex` (tf per passage, df, lengths) | tab lifetime | no |
| ui | react: sources, loading, listError, armed delete id, busy kind + extract progress, text/web fields, blocked-page offer, query, result, answer, open cite + neighbours, canAnswer | mount | no |
| identity | `user.id` from `useAuth()` (`src/contexts/AuthContext.tsx:32`) | forever | no |

every read and write is scoped `.eq("user_id", userId)` (`store.ts:54-55`, `:152`, `:154`, `:164`, `:176`; `vault.ts:59`), so two identities on one device do not see each other's rows. nothing is kept in localStorage any more: the old `asherin_vault_mode` key is neither read nor written (a stale value is inert). file bytes are not stored (the library and extract rooms keep bytes; this room keeps text only). — observed.

a connect trace (`src/lib/connect/emitPull.ts:86`) is written on every ingest, retrieve and answer, carrying titles, counts and status — never a passage (`vault.ts:101-109`, `:188-191`, `:251-259`). — observed.

## logic

- **shaping** (`chunk.ts:31` `cleanSourceText`): nul bytes dropped, `\r\n`→`\n`, trailing spaces trimmed, ≥3 blank lines collapsed to one blank line, cut at 400,000 chars with `truncated: true` (shown as "cut at 400k chars", `KnowledgeVaultView.tsx:535`). — verified.
- **chunking** (`chunk.ts:85` `chunkText`): units are paragraphs (blank-line separated); a paragraph over 1,400 chars is split at sentence ends; a run with no sentence ends is hard-cut at whitespace near 1,400. units are packed up to a 900-char target; the next passage starts up to 120 chars before the previous one ended, snapped to a word, never pushing a passage past 1,400 (`:107-116`). each chunk carries `[start, end)` into the cleaned text and `text.slice(start, end) === content` holds (`:120-126`). at most 2,000 passages per source. deterministic. — verified (5 tests).
- **tokenizer** (`chunk.ts:158` `tokenize`): lowercase, nfkd + accent strip, non-alphanumerics to spaces, tokens of length >1, ~70 stop words dropped, light suffix stemming (`:144` `stem`: ies→y, sses→ss, ness, ing, ed, ly, es, s). "running"→"runn", "policies"→"policy", "glass" unchanged. — verified.
- **ranking** (`retrieve.ts:37` `LexicalIndex`): bm25 with k1 = 1.2, b = 0.75 (`:29`), idf floored at 0 (`:60-65`), plus a flat 0.6 bonus per query stem found in the source name (`:84`). a passage must match at least one stem in its body to be returned (`:87`). ties break on id (`:89`). `relevance = score / best` (`:92`) — a fraction of the best hit in *this* result, which is why the label is "relevance", not "similarity" or "match %". — verified (7 tests, including tf saturation: forty repeats of one word do not beat a passage that answers).
- **contradictions** (`vault.ts:140` `findContradictions`): for passages from different sources, stem overlap ≥ 0.35 (`:127` `overlapRatio`) with exactly one side matching the negator list (`:121`) → "same subject, opposite polarity — a vs b"; at most 6 pairs; labelled "these passages may disagree" (`KnowledgeVaultView.tsx:360`) because it is a lexical hint, not a judgement. — verified.
- **highlight** (`vault.ts:161` `highlightSegments`): walks words in the passage, marks those whose stem is in the question's stems, keeps the text intact. — verified.
- **answer parsing** (`answer.ts:38` `parseCitations`, `:50` `stripBadCitations`): `[n]` with 1 ≤ n ≤ k kept, sorted, deduplicated; others removed from the shown text. — verified.
- **chat brief** (`vault.ts:268` `composeKnowledgeContext`): top 4, kept only when a passage matched ≥ 2 stems or has relevance ≥ 0.6; numbered `[k1]…` so vault cites never collide with web source numbers; "" when nothing qualifies. not called by chat yet — see the patch. — verified for shape.

## integrations & network

no server. every row call resolves in `src/lib/local/postgrest.ts`; `supabase.functions.invoke` is no longer called anywhere in this room, so "kernel offline" cannot appear here. — observed (grep).

off-device calls, all operator-initiated:
- **the connected model** — `askModel` (`src/lib/ai.ts:332` → `completeLlm` in `src/lib/local/llm.ts`) with the provider and key the operator saved under settings → ai keys; the payload is the system line, ≤8 passages × 1,400 chars and the question (`answer.ts:29-36`); 60 s abort (`answer.ts:79-80`); `maxTokens: 700`. no retry. offline: the error sentence from the llm layer, lowercased first letter, shown in the answer card (`answer.ts:87-90`, `KnowledgeVaultView.tsx:256-257`). — observed.
- **the page itself** (web tab, direct) — `GET url`, `accept: text/html,text/plain`, `credentials: "omit"`, follow redirects, 20 s abort, 4 mb cap on `content-length` and on the body (`web.ts:87-103`). a cors refusal is a `TypeError` → `blocked` (`:100`); non-2xx → `http` with the status (`:92`). — verified with a mocked `fetch`.
- **r.jina.ai** (web tab, only after the explicit tap) — `GET https://r.jina.ai/<url>`, `accept: text/plain`, same timeout and cap (`web.ts:122`). the page's address is sent to that service; the card says so before the tap (`KnowledgeVaultView.tsx:489`). — verified (the mock asserts the reader is not called on the first attempt).
- **ocr assets** (file tab, images and scanned pdf pages only, first time in a tab) — tesseract's wasm core and english model from `cdn.jsdelivr.net`, exactly as documented in asherin.extract's narrative; the csp allows it (`index.html:20`). — observed.

the csp's `connect-src … https:` (`index.html:20`) permits all of the above. no api key is carried on any of them except the model call, which carries the operator's own provider key to that provider.

## security & privacy

- **threat: a hostile document.** text is never set as html: passages render as react text nodes inside `<p>`/`<mark>` (`KnowledgeVaultView.tsx:404-410`). a web page is parsed by `DOMParser` with scripts and iframes removed before any text is taken (`web.ts:50`); the parsed document is never attached to the page. pdf/docx/images go through the extract readers' workers. a hostile passage can still carry prompt-injection text to the model; the system line scopes the answer to citing passages, and the answer is shown as text, never acted on. — observed.
- **threat: a pasted secret.** `maskCredentials` runs before storage (`store.ts:113`), so a key pasted into a source becomes `[masked key]` in every passage. — verified.
- **threat: a hostile url.** only http(s), no embedded credentials, hostnames must contain a dot or be `localhost` (`web.ts:27` `normaliseUrl`). fetches go without cookies (`credentials: "omit"`). a fetch cannot reach beyond what the browser already allows this origin; the reader relay sees only the url and only after consent. — verified.
- **storage at rest.** passages sit unencrypted in this origin's indexeddb, like the library's extracted text and unlike asherin.vault's sealed rows; the promise copy says "stored on this device", not "sealed". — observed; stated plainly.
- **the model boundary.** only the passages about to be cited leave, not the corpus; the trace carries titles only (`vault.ts:106-107`). — observed.
- **clipboard / export.** the brief is copied only on tap; the whiteboard drop stays on device (`boardInbox.ts`). — observed.
- **scope.** every query is `user_id`-scoped (see state & data); a `remove` is proven by a re-read before the toast says "removed" (`store.ts:157-159`). — verified.

## failure modes

| failure | operator sees | where |
| --- | --- | --- |
| no device identity | corpus card: "this device has no identity yet — reload the page" + `try again` | `KnowledgeVaultView.tsx:76`, `store.ts:52` |
| sources table unreadable | the store's message + `try again`, no spinner | `:514-518` |
| name or text missing | toast "a name and some text are needed" | `:109` |
| text held nothing | source stored as `empty` with "no text to index — the source was read but held nothing"; toast "stored with no passages" | `store.ts:126`, `:103` |
| file over 100 mb | toast "source not added — this file is n mb and the limit is 100 mb"; nothing read | `vault.ts:209-212` |
| file kind with no reader / password pdf / broken docx / ocr engine offline | toast "source not added" + the extract reader's exact sentence | `vault.ts:215-219`, `extract.ts:327-342` |
| row or chunk write refused | toast "source not added" + the store message; a half-written source row is removed | `store.ts:128-145` |
| address not http(s) | toast "source not added — that is not an http(s) address" | `web.ts:112` |
| site refuses cors / non-2xx | inline offer card with the reason and the reader button; no toast storm | `:138-141`, `:486-494`; `web.ts:92`, `:100` |
| page empty / over 4 mb / 20 s timeout | toast "source not added" + the sentence | `web.ts:92-99`, `:118` |
| reader unreachable | toast "the reader could not be reached" | `web.ts:122-125` |
| nothing indexed and a question asked | "nothing is indexed yet. add a source on the right, then ask again." | `:372-373` |
| indexed but no match | "no passage in this corpus covers “q”. shepherd is not asked, so nothing is guessed." | `:374` |
| index could not load | red `role=alert` line with the message | `:351-353` |
| no model key | `ask shepherd` disabled with a title; after a retrieve, the answer button is disabled with "connect a model key in settings → ai keys to ask shepherd. retrieval works without one." | `:337-340`, `:283` |
| model error / offline / 60 s | the sentence in the answer card | `answer.ts:87-91`, `:256-257` |
| model answers without citing | "no passage was cited — read the answer as unsupported." | `:287-289` |
| model returns blank | "shepherd returned nothing" | `answer.ts:85` |
| delete refused or row still present | toast "source kept" + reason | `:160`, `store.ts:157-159` |
| clipboard refused | toast "the clipboard refused — copy from the passages below instead." | `:237` |
| hosted-era row | status failed + "indexed in the hosted era — its passages are not on this device. remove it and add the source again." | `store.ts:70-73` |
| unmount mid-call | `alive` ref prevents every late `setState` | `:44-45`, each handler |

no path renders a raw stack; `ErrorBoundary` around the lazy view (`Dashboard.tsx:1920`) is the last net. spinners are tied to a state that ends: `busy` (ingest), `retrieving`, `answering` (60 s abort), `loading` (one table read).

## interface & accessibility

- **desktop (1440×900):** promise strip across the top; two columns `lg:grid-cols-[minmax(0,1fr)_23rem]` (`:312`) — ask (focal) on the left, add-a-source and corpus on the right. one heading weight (`text-[11px] lowercase tracking-[0.2em]`, `:31`), one card skin (`:30`), colour only for meaning (destructive red on errors and the armed trash; `mark` for matched words; a stronger border on a cited `[n]`, `:391`). — observed.
- **phone (390×844):** the grid stacks (ask, then add, then corpus); the promise strip wraps its counter onto its own line (`flex-wrap`, `:306-309`); the tab list wraps (`flex-wrap`, `:446`); the three ask controls sit in one row — input flexes, two 36px buttons — fitting 358px of content width; the file hint and web hint wrap at 10px. nothing is hidden on phone that is shown on desktop except the hero, which v.2 hides. — inferred from classes; screenshot pending.
- **keyboard / screen reader:** enter in the question runs retrieve (`:327`); the search button is `aria-label="find passages"` (`:332`); each passage row is a real `<button>` with `aria-expanded` (`:387`); citation chips are buttons labelled "open passage n" (`:270`); the answer card is `aria-live="polite"` (`:250`); errors are `role="alert"` (`:352`, `:515`), the reader offer `role="status"` (`:487`); inputs carry `aria-label`s (`:329`, `:453-454`, `:468`, `:477-478`); the trash's label changes to "confirm removing …" when armed (`:542`); the corpus is a `<ul>` (`:528`). — observed.
- **motion:** `animate-spin` on four loaders, `scrollIntoView({ behavior: "smooth" })` to the opened passage (`:215`); nothing decorative. — observed.
- **empty / loading states:** "reading the corpus…", "nothing indexed yet. add a text, a file or a page above and ask it a question.", "nothing is indexed yet. add a source on the right, then ask again.", the no-match sentence, "reading the passages…". — observed.
- **one focal point:** the ask input is the only `h-9` row with two actions; the add panel's buttons are full-width secondary (`variant="outline"`), so weight follows importance. — observed.

## relationships

| edge | target | real in code? |
| --- | --- | --- |
| reads_from / writes_to | `aureon_vault_sources`, `aureon_vault_chunks` via `src/lib/local/postgrest.ts` | yes (`store.ts`) |
| depends_on | asherin.extract's readers `extractFile` (`src/components/dashboard/scrapper/extract.ts:400`) | yes (`vault.ts:213`) |
| depends_on | library's `maskCredentials` (`src/lib/library/library.ts:208`) | yes (`store.ts:113`) |
| calls | `askModel` (`src/lib/ai.ts:332`) — the connected model, "shepherd" | yes (`answer.ts:74`) |
| calls | `getActiveModel` / `hasProviderKey` (`src/lib/local/keys.ts`) for readiness | yes (`answer.ts:55`) |
| writes_to | whiteboard inbox `queueBoardDrop` | yes (`:218`) |
| writes_to | connect traces `emitPull` (organ `knowledge-vault`, already in the `Organ` union `emitPull.ts:19`) | yes |
| trusts | the operator's own documents; the model's answer only as text | — |
| hands to chat | `composeKnowledgeContext` (`vault.ts:268`) | **not yet** — the hook is a `Dashboard.tsx` patch below |
| hybrid / web search | — | **no**: no web search path exists on the device; "isolated only for now" (`:308`) |
| verified_by | `src/lib/knowledgeVault/__tests__/*` (32 tests) | yes |

## performance

- mount: two table reads (sources, chunk ids) in parallel (`store.ts:54-57`), one `modelReady` probe (`:94-96`); all served from the shim's in-memory cache after the first indexeddb read.
- the lexical index is built once per corpus change and kept in module memory (`vault.ts:45-73`); a search is o(passages × query stems) over maps — thousands of passages answer in milliseconds. the corpus is bounded by 400k chars and 2,000 passages per source.
- every chunk write persists the whole `aureon_vault_chunks` array (`src/lib/local/db.ts:115-122`); a corpus of tens of large sources makes each ingest write heavier. the bound is stated; a per-source table split is listed under open gaps.
- subscriptions: `onVaultChange` (two table listeners) removed on unmount with its debounce timer (`:86-93`); the delete-arm timer cleared on unmount (`:97`); the index watcher is module-level and lives for the tab.
- pdfjs / tesseract / jszip are dynamic imports inside the extract readers, so the room's chunk stays small until a pdf, image or docx arrives.

## copy & voice

all on-screen copy is lowercase except names the operator typed, "r.jina.ai" and "settings → ai keys" as written in settings. the model is "shepherd" ("ask shepherd", "shepherd, from these passages", `:342`, `:252`). toasts: "“name” indexed", "source not added", "stored with no passages", "“name” removed", "source kept", "cited notes queued for the whiteboard.", "cited brief copied.", "a name and some text are needed", "an address is needed". statuses: "indexed" / "empty" / "failed" with sentences, never codes. no account-era language, no "embedded", no "agent", no intent badges, no "kernel offline" (no path can produce it). "relevance n%" replaces "match n%" / "sim n%" because the number is relative, not a similarity. — observed.

shared-file copy that is not this room's to edit (nav blurb, v.2 subtitle, the gated title) is listed under patches.

## tests & proof

unit (`npx vitest run src/lib/knowledgeVault`, 32 tests, all passing):
- `__tests__/chunk.test.ts` (8) — shaping (nul, `\r\n`, blank runs, 400k cap); short paragraphs merge; long documents produce ≤1,400-char passages whose offsets slice back to their own text and index in order; overlap exists and is ≤120; one enormous paragraph splits at sentences and a sentence-less run hard-cuts under the cap; determinism and blank input; tokenizer and stemmer cases.
- `__tests__/retrieve.test.ts` (7) — empty query / empty index / stop-words-only; coverage beats repetition; tf saturation (forty "backup"s lose to the passage that answers); relevance as a fraction of the best with k respected; stem matching across forms ("pruning" ↔ "pruned"); source-name bonus; deterministic ties.
- `__tests__/vault.test.ts` (17, fake-indexeddb, model and `fetch` mocked) — add/list/recount with credential masking; empty source; delete with proof and no cascade left behind; missing identity; legacy-row normalisation; retrieve end-to-end with index invalidation and the chat brief; prompt shape with the 8-passage cap; citation parsing and stripping; injected-ask answer, no-passage refusal, error lowercasing, blank answer; `modelReady` false without a key; url normalisation; html → prose; reader parsing; blocked / http / empty / consent / bad-url paths; a direct html read; highlight; contradictions.

not proven by unit tests, by design: the real pdf/ocr/docx readers (proven in asherin.extract's suite), a real cors response, the connected model. the end-to-end step: paste a text → drop `mini.pdf` → fetch a cors-friendly page (e.g. a raw github readme) → ask "what does … say about …" → `ask shepherd` → tap `[1]` → the passage opens with its neighbours → trash twice. screenshots at 1440×900 and 390×844 are pending; another process owns the browsers this round.

## open gaps

- **no semantic retrieval.** ranking is lexical (bm25 over stems). a question phrased with none of the document's words finds nothing, and the room says so rather than guess. an on-device embedding model (transformers.js, ~25 mb) would close this; it is not in the build.
- **web pages need cors or consent.** most sites refuse a browser read; the r.jina.ai relay works for public pages but sends the address to a third party, which is why it is per-page and explicit. a local reader (asherin.search's port, in another worktree) would remove the relay.
- **no video, no api.** the hosted caption fetcher and header-carrying api puller are gone; a browser cannot fetch youtube captions cross-origin, and an api tab would send the operator's bearer tokens to arbitrary hosts. both tabs were removed rather than left as dead controls.
- **hybrid mode is gone until a web search path exists on the device.** the room says "isolated only for now".
- **chat does not cite the corpus yet.** `composeKnowledgeContext` is ready; the hook is a shared-file patch (below).
- **passages are stored in one table array**; very large corpora make each write heavier (see performance).
- **english stemming and stop words only.** other languages are tokenised but not stemmed.

## proposed patches to shared files (not applied)

1. `src/lib/navIntents.ts:148` — the blurb promises chat citation that no code performs until patch 4 lands.
   - old: `    blurb: "private files asherin can cite",`
   - new: `    blurb: "your documents, indexed on this device and cited",`
   - (if patch 4 is applied, the old blurb becomes true and may stay.)
2. `src/lib/dashboard/v2Titles.ts:32`
   - old: `  "knowledge-vault": { title: "knowledge", subtitle: "private files asherin can cite." },`
   - new: `  "knowledge-vault": { title: "asherin.knowledge", subtitle: "your documents, indexed on this device and cited." },`
3. `src/pages/Dashboard.tsx:2075-2080` (`case "knowledge-vault"`) — capitalised, server-era title (only reaches the `RetiredRoom` fallback).
   - old: `          "Knowledge Vault (RAG)",`
   - new: `          "asherin.knowledge",`
4. `src/pages/Dashboard.tsx` — the smallest honest chat hook, directly after the asherin.vault brief block (`:1326-1333`, the `try { const { composeVaultContext } = await import("@/lib/memory/vault"); … }` block):
   - old:
     ```
         } catch (e) {
           console.warn("[vault] brief skipped:", e);
         }
     ```
   - new:
     ```
         } catch (e) {
           console.warn("[vault] brief skipped:", e);
         }
         // asherin.knowledge — numbered passages from the operator's own documents; chat cites them as [k<n>].
         try {
           const { composeKnowledgeContext } = await import("@/lib/knowledgeVault/vault");
           const kb = await composeKnowledgeContext(user.id, content, 4);
           if (kb.brief) {
             intelligenceContext = `${intelligenceContext ?? ""}\n\n${kb.brief}`.trim();
             thinkingStore.step(assistantId, "memory", `${kb.passages.length} passage(s) from asherin.knowledge in context`, "done");
           }
         } catch (e) {
           console.warn("[knowledge] brief skipped:", e);
         }
     ```
   - this makes the nav blurb true. it does not add rows to the message's `sources` (those are `{title,url}` web sources, `Dashboard.tsx:850`); a follow-up could map `kb.passages` to `{ title: "[k1] source name", url: "/dashboard/knowledge-vault" }` so the chat footer lists them.

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | every ingest went to `supabase.functions.invoke("vault-ingest")` and every retrieve to `"vault-retrieve"`, both of which the shim answers with "kernel offline" (`src/lib/local/functions.ts:59-61`). the room could not add or find anything. | dependency | cause: hosted organ removed, caller kept | observed | defect | component replacement | on-device pipeline: `store.ts`, `chunk.ts`, `retrieve.ts`, `vault.ts:82` `retrieveVault`, `:193-243` ingest | 32 unit tests |
| 2 | the "vault agent — store · fetch · answer" called `"vault-agent"` (gone) and labelled the server's reply "shepherd" with uppercase intent badges. | semantic / interface | failure: promise with no code | observed | defect | component replacement | replaced by `ask shepherd` → `askVault` (`vault.ts:245`) grounded on retrieved passages with `[n]` cites (`answer.ts`) | answer suite |
| 3 | promise copy "embedded and cited", toast "n passages embedded", button "embed and index": no embedding exists in the build (no transformers, no hosted function). | semantic | failure: claim the code cannot back | observed (grep) | wrong claim → code + copy | requirement reconciliation | copy says "indexed on this device"; ranking is bm25 and the narrative says so | code read |
| 4 | `handleFile` read every file with `file.text()` — a pdf or docx became binary garbage, an image became noise. | behavioral | cause: wrong reader | observed | defect | dependency restructuring | `ingestFile` (`vault.ts:205`) uses asherin.extract's `extractFile`; accept list widened to pdf/docx/images | code read; extract suite |
| 5 | "video" and "api" tabs: youtube captions cannot be fetched cross-origin; the api tab would send operator bearer tokens to arbitrary hosts; both backed by a dead function. | security / requirements | failure: dead and unsafe controls | observed | defect | requirement reconciliation | tabs removed; stated under open gaps | code read |
| 6 | isolated/hybrid toggle wrote `asherin_vault_mode` and dispatched an event nobody listened to; "live web runs as a labelled second tool" had no code. | state / semantic | failure: state written, never read | observed (grep: no readers) | defect | state consolidation | toggle removed; "isolated only for now" (`:308`) | code read |
| 7 | web tab copy "fetched server side … private and loopback addresses are refused" described a server. | semantic | wrong claim | observed | wrong claim | contract repair | `web.ts`: browser fetch with cors, explicit per-page reader consent; copy rewritten (`:479-481`, `:489`) | web suite |
| 8 | `refresh` and `remove` were not `user_id`-scoped; the shim fills `user_id` on insert, so two identities on one device would see each other's sources. | security | failure: trust boundary | observed | defect | boundary repair | every query `.eq("user_id", userId)` (`store.ts`) | store suite |
| 9 | delete was one tap with no confirm and the toast fired on any non-error without proof; chunks (hosted cascade) would have been orphaned. | behavioral / data | cause: no cascade in the local store | observed | defect | local correction | two-tap arm (`:150-158`); `deleteSource` removes chunks, then the row, then re-reads (`store.ts:151-160`) | "deletes a source…" test |
| 10 | file input never reset its value: the same file could not be added twice. | behavioral | failure | observed | defect | local correction | `fileInput.current.value = ""` (`:127`) | code read |
| 11 | async `setState` after unmount in every handler (no guard). | state | failure: lifecycle | observed | defect | local correction | `alive` ref (`:44-45`) checked after every await | code read |
| 12 | raw `toast.error(error.message)` on a failed list, spinner "loading" with no retry. | interface | failure | observed | defect | local correction | inline `role=alert` + `try again` (`:514-518`); "reading the corpus…" only while the first read runs | code read |
| 13 | capitalised copy: "Ingest failed", "Indexed “…”", "Name and content required", "URL required", "Source removed", "No passage…", "Isolated —", "Hybrid —", "Done.", "Agent error", "Cited notes queued"; `h1` and `h2` rendered `uppercase`. | interface (copy) | failure: doctrine | observed | defect | local correction | all lowercase; headings `lowercase` class (`:31`, `:301`) | code read |
| 14 | "match n%" / "sim n%" labelled a server cosine that no longer exists. | semantic | wrong claim | observed | wrong claim | contract repair | "relevance n%" = score / best, with a title explaining it (`:393-395`) | retrieve suite |
| 15 | in v.2 the shell showed `knowledge` above the room's own hero `ASHERIN.KNOWLEDGE` — two titles. | interface | failure | observed | defect | local correction | hero hidden under `useIsV2()` (`:298`) | code read |
| 16 | no readiness check: asking with no model key would raise the byok dialog from inside the room. | behavioral | failure | observed | defect | local correction | `modelReady` (`answer.ts:55`) → disabled button with the reason (`:283`, `:337`) | "stays quiet…" test |
| 17 | the model could invent `[9]`; nothing validated citations. | data | failure: integrity | hypothesized → tested | defect | contract repair | `parseCitations` / `stripBadCitations` (`answer.ts:38-53`); uncited answers flagged (`:287`) | answer suite |
| 18 | citations could not be opened in context; only the passage body toggled. | requirements | failure: "open the cited passage" | observed | defect | local correction | `getPassageContext` neighbours + chunk position line (`:209-216`, `:397-413`) | store read |
| 19 | hosted-era rows (youtube/api kinds, server chunk counts) would list as "indexed" with passages that are not on the device. | data | failure: migration | inferred | defect | contract repair | `normaliseSource` marks them failed with the reason (`store.ts:65-88`) | "reads a hosted-era row…" test |
| 20 | a pasted secret would be stored verbatim in passages and sent to the model. | security | failure | observed | defect | boundary repair | `maskCredentials` before storage (`store.ts:113`) | store test |
| 21 | icon buttons without names; passage toggles without `aria-expanded`; no live region for the answer. | interface (a11y) | failure | observed | defect | local correction | `aria-label`s, `aria-expanded`, `aria-live`, `role=alert/status` | code read |
| 22 | nav blurb / v.2 subtitle promise chat citation; `Dashboard.tsx` title capitalised; no chat hook. | semantic (shared files) | failure | observed | defect in shared files | — | patches 1-4 above, not applied | — |
| 23 | no unit tests covered the room. | verification | failure | observed | defect | — | 32 tests in `__tests__/` | `npx vitest run src/lib/knowledgeVault` |
| 24 | screenshots at 1440×900 and 390×844. | verification | — | unknown | pending | — | not run this round (browsers owned elsewhere) | — |

## vision confirmation — 2026-10-26

screens: final3-d-knowledge-vault.png and final3-m-knowledge-vault.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: ask, add a source (text, file, web) and the corpus card render at both widths. the knowledge → chat connection is proven end to end (a passage reached the chat prompt).
