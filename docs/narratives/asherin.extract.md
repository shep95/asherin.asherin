```
room: asherin.extract   view id: file-scrapper   files: src/components/dashboard/scrapper/FileScrapperView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

files under review: `src/components/dashboard/scrapper/` — `FileScrapperView.tsx` (shell), `SessionsList.tsx` (strip), `SessionWorkspace.tsx` (one session), `store.ts` (rows + blobs), `queue.ts` (the pass), `extract.ts` (the readers), `__tests__/extract.test.ts`, `__tests__/store.test.ts`, `__tests__/blobPolyfill.ts`.

## purpose & promise

asherin.extract takes documents an operator cannot search — pdfs with a text layer, pdfs that are scans, photographs of text, `.docx`, and plain-text files — and gives back their text as one `.txt` per session. the interface promises three things: the file is read on this device (`FileScrapperView.tsx:160` "read on this device, returned as one .txt."; `SessionWorkspace.tsx:134` "each one is read here, on this device."), the result is one downloadable file (`SessionWorkspace.tsx:196` "download .txt"), and nothing is guessed: a page that cannot be read says so on its card (`SessionWorkspace.tsx:267-269`). the room is not a model room — shepherd is never called; no key is read.

## entry & navigation

- sidebar group `find`, label `asherin.extract`, codename `document text`, keywords extract / scrapper / scraper / parse / pdf / ocr / file (`src/lib/navIntents.ts:117-124`).
- view id `file-scrapper` (`src/components/dashboard/types.ts:133`), lazy-loaded at `src/pages/Dashboard.tsx:71`, rendered by `case "file-scrapper"` → `gatedView(...)` (`Dashboard.tsx:2015-2020`), which wraps the component in `ErrorBoundary` + `Suspense` (`Dashboard.tsx:1879-1887`). the room is not retired, so `canAccess` is always true (`src/hooks/useAccess.ts:16`); the capitalised title/description strings at `Dashboard.tsx:2019-2020` are only used by the `RetiredRoom` fallback and never reach the screen in this edition (see shared-file patches).
- v.2 shell title `asherin.extract`, subtitle `pull text out of documents.` (`src/lib/dashboard/v2Titles.ts:38`), rendered in the 56px header by `V2PageShell` (`src/components/dashboard/v2/V2PageShell.tsx:31-50`); the room portals its one primary action, `new session`, into the shell's slot (`FileScrapperView.tsx:130-137`).
- sidebar icon `FileText` (`src/components/dashboard/DashboardSidebar.tsx:127`); connect graph node id `file-scrapper` (`src/components/dashboard/connect/ConnectView.tsx:57`).
- what loads first: `opening asherin.extract…` (`FileScrapperView.tsx:103-109`) while `listSessions` reads the local table; then the strip plus either the open session or the empty-state card (`FileScrapperView.tsx:146-174`).

## workflow

happy path:
1. **new session** — header slot or strip `+` or the empty-state button → `createSession(userId, "session n")` (`FileScrapperView.tsx:67-78` → `store.ts:112-121`). the row is inserted with `total_files: 0`, `total_text_length: 0` and an explicit `updated_at` (`store.ts:113-118`), becomes active at once.
2. **upload** — drop onto the zone or tap/press enter/space to open the picker (`SessionWorkspace.tsx:205-241`). `handleFiles` (`:101-136`) refuses anything over 100 mb before touching it (`:109-116`), classifies the rest (`:118`), stores bytes under a random path and a row with status `queued` (`store.ts:172-209`), and puts the ids on the queue (`:128`). a kind with no reader gets a row with status `unsupported` and the reason, and no blob (`store.ts:178-182`, `:194-197`).
3. **extract** — the queue runs one file at a time (`queue.ts:60-71`): mark `extracting` (`store.ts:218-220`), load the blob (`store.ts:211-216`), `extractFile` (`extract.ts:400-428`), save the result onto the row (`store.ts:222-233`), recompute the session totals (`store.ts:145-154`), write one connect trace carrying the file name and counts only (`queue.ts:105-114`). the card shows `reading page 3 of 12`, `reading page 4 of 12 optically 62%`, or `reading…` (`SessionWorkspace.tsx:39-47`).
4. **view** — `show text` opens the preview panel with the combined text, capped at 200k characters with a line saying the download holds the rest (`SessionWorkspace.tsx:301-323`); `copy all` puts the full text on the clipboard (`:185-188`, `:305-307`).
5. **download .txt** — a `text/plain;charset=utf-8` blob named `<safe session name>-extracted.txt`, object url revoked ten seconds later so safari finishes the save (`SessionWorkspace.tsx:146-157`; `safeFileName` `extract.ts:446-454`).

secondary paths:
- **rename** — pencil button or double-click, enter commits, escape cancels, blur commits (`SessionsList.tsx:100-125`, `:131-144`); optimistic with revert on a store error (`FileScrapperView.tsx:91-99`).
- **delete session** — two taps: the first arms the trash (`sure?` for 3.5 s), the second deletes (`SessionsList.tsx:44-54`, `:145-159`). blobs, then file rows, then the session row (`store.ts:129-143`); the toast names how many stored files went with it (`FileScrapperView.tsx:88`).
- **remove file** — dequeues if waiting, removes blob and row (`SessionWorkspace.tsx:140-144`, `store.ts:235-242`).
- **retry** — shown on `failed` and `empty` cards that still have bytes; re-enqueues (`SessionWorkspace.tsx:273-283`).
- **resume** — on open, rows left at `queued` or a stale `extracting` (a reload mid-pass) go back on the queue; ids already running are skipped (`SessionWorkspace.tsx:75-78`, `queue.ts:42-53`).

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| sessions | indexeddb table `scrapper_sessions` via the postgrest shim | `ScrapperSession` (`store.ts:16-24`): id, user_id, name, total_files, total_text_length, created_at, updated_at | until deleted | no |
| files | indexeddb table `scrapper_files` | `ScrapperFile` (`store.ts:36-51`): id, session_id, user_id, file_name, file_size, file_type, storage_path, extracted_text, status, method, error, truncated, text_chars, created_at | until file or session deleted | no (the connect trace carries the file name and counts: `queue.ts:105-114`) |
| bytes | indexeddb blob bucket `scrapper-uploads`, key `<user>/<session>/<uuid>` | `BlobRecord` (`src/lib/local/db.ts:167-173`) | until file or session deleted | no |
| queue | module memory (`queue.ts:13-18`): pending ids, in-flight set, per-file progress | tab lifetime | no |
| ocr worker | module memory (`extract.ts:231-234`), released after 60 s idle (`extract.ts:259-280`) | tab lifetime, bounded | no |
| ui | react: active session id, preview toggle, drag state, rename/arm state, `files`, `sessions` | mount | no |
| identity | `user.id` from the device identity in localStorage (`src/lib/local/auth.ts:66-76`) | forever | no |

the hosted schema's `status` column on sessions is neither written nor read (the interface no longer declares it). a hosted-era row with status `uploaded` reads as `queued` (`store.ts:56-68`), so old rows are picked up and read on this device the first time the session is opened. nothing is kept in localStorage by this room.

## logic

- **classification** (`extract.ts:112-125`): mime first, then extension. pdf → pdfjs; `image/png|jpeg|webp|bmp|gif|tiff|pnm` (or those extensions with no/octet mime) → ocr; `image/svg+xml` → text (it is xml, never rendered); `.docx` → jszip; `text/*`, json/xml families and a long extension list (`:89-95`) → utf-8 decode; everything else → `unsupported` with a reason (`:127-135`).
- **pdf** (`extract.ts:344-397`): per page, rebuild lines from the text layer by baseline (`linesFromTextItems` `:138-160`, breaks on a y change > 2 or `hasEOL`). a page whose layer is under 20 characters (`LIMITS.scanThresholdChars` `:80`) is a scan: rendered at scale 1.5 to a canvas (`:206-219`) and read optically, at most 20 pages per pdf (`LIMITS.maxOcrPages` `:78`); further scans are counted and reported, not guessed (`:360-361`, `:382`). a pdf where every page needed ocr is labelled `pdf ocr`, otherwise `pdf text layer` with a note like `2 scanned pages read optically` (`:379-385`). pages stop once the text cap is reached (`:354`).
- **image** (`extract.ts:415-419`): one tesseract pass, english model, lstm engine, progress forwarded.
- **docx** (`extract.ts:169-189`, `:294-300`): `word/document.xml` → paragraphs to newlines, tabs/cells to tabs, tags stripped, entities decoded.
- **shaping** (`cleanText` `extract.ts:162-166`): nul bytes dropped, `\r\n`/`\r` → `\n`, cap 1,000,000 characters per file with `truncated: true` (shown as `cut at 1.0m chars`, `SessionWorkspace.tsx:254`).
- **empty vs completed** (`finish` `extract.ts:314-325`): whitespace-only output is `empty` with a reason.
- **errors** (`describeError` `extract.ts:327-342`): password-protected pdf, not-a-pdf, pdf reader could not start, ocr engine could not load, not-a-docx; anything else is `extraction failed: <message, lowercased first letter, ≤160 chars>`.
- **combined text** (`combineText` `extract.ts:438-444`): only files with non-blank text, upload order, `=== name ===` banner each.
- **totals** (`recomputeTotals` `store.ts:145-154`): files in the session and sum of `text_chars`; `updated_at` bumps so the most recently worked session sorts first (`store.ts:108`).

## integrations & network

no server. every row and blob call resolves in `src/lib/local/postgrest.ts` and `src/lib/local/storage.ts`. `supabase.functions.invoke` is no longer called anywhere in this room, so the "kernel offline" answer can no longer appear here.

off-device fetches, all made by the ocr worker and only the first time an image or a scanned page is read in a tab:
- the pdfjs worker: own origin, an asset of this build (`extract.ts:194-197`, `pdfjs-dist/build/pdf.worker.mjs?url`).
- the tesseract worker script: own origin, an asset of this build (`extract.ts:242-245`, `tesseract.js/dist/worker.min.js?url`, `workerBlobURL: false`).
- the tesseract wasm core: `https://cdn.jsdelivr.net/npm/tesseract.js-core@v7.0.0/…` (tesseract's default `corePath`, `node_modules/tesseract.js/src/worker-script/browser/getCore.js:14`), loaded by `importScripts` from the worker.
- the english model: `https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz` (tesseract's default `langPath`, `worker-script/index.js:130`), cached by tesseract in indexeddb after the first fetch.

the csp allows exactly this: `script-src 'self' 'wasm-unsafe-eval' blob: https://cdn.jsdelivr.net`, `worker-src 'self' blob: https://cdn.jsdelivr.net`, `connect-src … https:` (`index.html:20`, `vercel.json:44`). no timeout or abort is applied to these fetches; tesseract rejects on a failed load and the card says `the ocr engine could not load — it needs one network fetch the first time; check the connection and retry` (`extract.ts:336`). offline with a warm cache, ocr works; offline with a cold cache, images and scans fail with that sentence and the retry stays; pdfs with a text layer, docx and text files never need the network. no api key is read or carried; the image bytes never leave the worker.

the connect trace (`queue.ts:105-114`) is an insert into the local `asherin_connect_pulls` table via `emitPull` (`src/lib/connect/emitPull.ts:86-110`), masked and best-effort; it is not a network call.

## security & privacy

- **threat: a hostile file.** pdfs are parsed in pdfjs's own worker; images in tesseract's worker; docx is unzipped in the page but only `word/document.xml` is read as a string and markup is stripped (`extract.ts:169-177`); svg is decoded as text and never rendered. no file content is ever set as html: the preview is a `<pre>` text node (`SessionWorkspace.tsx:311-313`), names are react text nodes. a crafted file name can only put `=== name ===` lines into the txt.
- **bounded work.** 100 mb refusal before storage (`SessionWorkspace.tsx:109`), 1,000,000 characters per file (`extract.ts:76`), 20 ocr pages per pdf (`:78`), 200k characters in the preview (`:84`), one pass at a time (`queue.ts:60-71`), the ocr worker released after a minute idle (`extract.ts:259-265`). the pdf page loop stops at the character cap (`extract.ts:354`).
- **storage at rest.** bytes and extracted text sit unencrypted in this origin's indexeddb, the same place the file itself sits. unlike the library room, the text is *not* credential-masked (`src/lib/library/library.ts:207-214`): the room's promise is a verbatim txt, the text is never indexed for shepherd, and masking would silently alter the deliverable. the consequence is stated plainly: a key printed in a pdf is a key in indexeddb until the session is deleted.
- **clipboard / export.** `copy all` and the download are operator actions on operator data; nothing is copied or saved without a click.
- **paths.** storage keys are `<user>/<session>/<uuid>` (`store.ts:180`), so a file name never becomes a key; the download name is reduced to `[\w.-]`, 60 characters (`extract.ts:446-454`).
- **tracing.** the connect row carries file name (masked by `maskQuote`), counts and method, never text (`queue.ts:105-114`).

## failure modes

| failure | operator sees | where |
| --- | --- | --- |
| sessions table unreadable | the store's message and a `try again` button, no spinner | `FileScrapperView.tsx:111-126` |
| no device identity | "this device has no identity yet — reload the page" + try again | `FileScrapperView.tsx:33` |
| session insert / rename / delete refused | lowercase destructive toast with the store's message; rename reverts | `FileScrapperView.tsx:72-74`, `:82-85`, `:95-98` |
| files table unreadable | one red line under the upload zone | `SessionWorkspace.tsx:244` |
| file over 100 mb | toast `file too large` with the size and the limit; nothing stored | `SessionWorkspace.tsx:109-116` |
| blob or row write refused | toast `file not stored`; a stored blob is removed again | `SessionWorkspace.tsx:121-125`, `store.ts:204-206` |
| kind with no reader | card status `not readable here` + reason, no retry (nothing would change) | `store.ts:194-197`, `SessionWorkspace.tsx:267-269` |
| file holds no text | card `no text found` + reason, retry offered | `extract.ts:314-323` |
| password-protected / broken pdf | card `failed` + the exact sentence, retry offered | `extract.ts:331-332` |
| ocr engine cannot load (cold cache, offline) | card `failed` + "needs one network fetch the first time", retry offered | `extract.ts:336` |
| pdf scans beyond 20 pages | completed with a note counting the skipped pages | `extract.ts:382` |
| scanned page but no canvas | counted and reported as unrenderable, status `empty` if nothing else | `extract.ts:362-367`, `:383` |
| text cut at the cap | card note `cut at 1.0m chars` | `SessionWorkspace.tsx:254` |
| stored bytes missing | `failed` + "upload the file again" | `queue.ts:73-81`, `:92-98` |
| reader throws unexpectedly | `failed` + "the pass stopped unexpectedly — retry" | `queue.ts:114-116` |
| reload mid-pass | the row resumes from `queued`/stale `extracting` on next open | `SessionWorkspace.tsx:75-78` |
| session switched mid-pass | the pass finishes in the background and writes the row; the other session's cards show it when reopened | `queue.ts` is module-level; `SessionWorkspace.tsx:81-83` |
| nothing extracted yet | preview says `no text extracted yet.`; copy/download/show-text disabled | `SessionWorkspace.tsx:321`, `:174-197` |

no path renders a raw stack; the `ErrorBoundary` around the lazy view (`Dashboard.tsx:1882`) is the last net. the only spinners are the upload zone while bytes are being stored (`:230-234`) and the per-card spinner while a pass is running (`:272`), each tied to a state that ends.

## interface & accessibility

- **desktop (1440×900):** 256px session column (`SessionsList.tsx:59` `md:w-64`), workspace to the right; header row with name, counts and three actions; upload zone, cards; `show text` splits the body into two equal scrolling halves (`SessionWorkspace.tsx:203`, `:302`).
- **phone (390×844):** `flex-col` (`FileScrapperView.tsx:129`); the strip is a full-width scrolling band at most 176px tall (`SessionsList.tsx:59` `max-h-44`) with a tighter header (`:61`); the workspace header wraps its buttons under the title (`SessionWorkspace.tsx:167`, `:174`); the body stacks files above the preview, each its own scroll region (`:201-203`, `:302`); paddings step down to 16px (`p-4 md:p-6`).
- **touch:** rename and delete are always visible on a phone and hover/focus-revealed on desktop (`SessionsList.tsx:130`); delete needs two taps (`:44-54`).
- **keyboard:** session rows are `role="button"`, tabbable, enter/space select, inner controls keep their own keys (`SessionsList.tsx:81-97`); the upload zone is `role="button"` with enter/space (`SessionWorkspace.tsx:205-215`); every icon button has an `aria-label` (`SessionsList.tsx:66`, `:138`, `:151`; `SessionWorkspace.tsx:208`, `:277`, `:288`); `show text` carries `aria-pressed` (`:179`); focus rings on rows and the zone (`focus-visible:ring-1`).
- **motion:** two `animate-spin` loaders and one `animate-pulse` line, nothing else moves.
- **contrast:** copy in `text-muted-foreground` at 9–12px on the room's dark glass is the house scale (same as library); error lines use `text-destructive/80`.
- **empty states:** `no sessions yet` (`SessionsList.tsx:75`), `nothing in this session yet.` (`SessionWorkspace.tsx:246`), `no text extracted yet.` (`:321`), and the first-run card copy (`FileScrapperView.tsx:159-161`).
- **loading states:** `opening asherin.extract…`, `reading the session…`, `storing…`, per-card progress.

## performance

- mount: one table read for sessions, one for the open session's files; both served from the store's in-memory cache after the first indexeddb read.
- subscriptions: `onTableChange(SESSIONS)` (`FileScrapperView.tsx:49`), `onTableChange(FILES)` (`SessionWorkspace.tsx:81`) and `subscribeProgress` (`:91`), each removed on unmount (`FileScrapperView.tsx:52-55`, `SessionWorkspace.tsx:84-87`); the delete-arm timer is cleared on unmount (`SessionsList.tsx:27-32`).
- the combined text is memoised on `files` so progress ticks do not re-join megabytes (`SessionWorkspace.tsx:93-98`); the preview renders at most 200k characters.
- pdfjs and tesseract are dynamic imports (`extract.ts:193`, `:239`), so the room's chunk stays small until a pdf or an image arrives; the pdf document is destroyed after each file (`extract.ts:387-393`); page canvases are zeroed after `toBlob` (`:216-217`); the ocr worker is reused across a batch and terminated after 60 s idle (`:259-280`).
- large lists: a session's cards are rendered flat; the room is sized for tens of files, not thousands (a cap is not enforced — see open gaps).
- every row write persists the whole `scrapper_files` array (`src/lib/local/db.ts:115-122`), so text totals in the tens of megabytes make each status write heavier; the 1m-character cap per file is the bound.

## copy & voice

all on-screen copy is lowercase except file and session names the operator typed: `sessions`, `no sessions yet`, `new session`, `drop files here, or tap to choose`, `pdfs (text or scanned), png/jpg/webp photos of text, .docx, plain text · up to 100 mb each`, `show text` / `hide text`, `copy all` / `copied`, `download .txt`, `extracted text`, `no text extracted yet.`, statuses `waiting` / `reading…` / `text extracted` / `no text found` / `not readable here` / `failed` (`SessionWorkspace.tsx:25-32`), toasts `file too large`, `file not stored`, `n files queued`, `file kept`, `session not created`, `session kept`, `session removed`, `name not saved`. no account-era language (`available on …`, tiers, plans) anywhere in the room. "kernel offline" cannot appear: every path has a device answer. shepherd is not named because shepherd is not used.

remaining shared-file copy that is not this room's to edit is listed under shared-file patches.

## tests & proof

unit (`npx vitest run src/components/dashboard/scrapper`, 28 tests):
- `__tests__/extract.test.ts` — classification and reasons; baseline line rebuilding; nul/`\r\n`/cap shaping; docx xml to text; utf-8 decode; whitespace-only → empty; zero-byte and over-limit refusals; **a real one-page pdf read through pdfjs** (legacy build aliased because node 22 lacks the es2025 typed-array helpers the browser build expects); broken pdf → the exact sentence; mixed pdf where only the blank page is sent to ocr; a fully scanned pdf stops at the 20-page budget and reports the rest; unrenderable scans reported; image → ocr with progress 0 → 0.5 → 1; ocr load failure sentence; docx via jszip; not-a-zip docx; unsupported kind; `combineText` order and banners; `safeFileName`; `formatChars`.
- `__tests__/store.test.ts` (fake-indexeddb) — create / newest-first list / rename / delete; random storage path and original name on the row; unsupported row with no blob; mark → save → totals; session delete removes blobs and rows (no cascade in the local store); legacy status mapping.
- `__tests__/blobPolyfill.ts` gives jsdom 20's `Blob` the `text()` / `arrayBuffer()` every browser has.

not proven by unit tests, by design: the tesseract worker in a real browser, canvas rendering of a pdf page, blob round-trip through real indexeddb (fake-indexeddb cannot clone a jsdom blob). those are the end-to-end step: new session → drop `mini.pdf` + a png photo of print → cards reach `text extracted` → `show text` → `download .txt` opens as utf-8. screenshots at 1440×900 and 390×844 are pending; another process owns the browsers during this pass.

## open gaps

- ocr needs one off-device fetch per tab for the engine and the english model (cdn.jsdelivr.net); a device that has never been online cannot read images or scans. serving `tesseract.js-core` and `eng.traineddata` from this origin would close it at ~15 mb of extra assets.
- english only. other scripts come out as noise, labelled `text extracted`; tesseract's language packs are a config change, not yet exposed.
- no table reconstruction: a pdf table becomes lines in reading order. the nav blurb's "tables" is a shared-file wrong claim (patch below).
- `.doc`, `.pptx`, `.xlsx`, `.epub`, `.heic` are reported as `not readable here`, not read.
- a session is rendered flat; thousands of files would be slow. no cap is enforced.
- the toast layer shows one toast at a time (`src/hooks/use-toast.ts:5`), so dropping several over-limit files shows only the last refusal; rows for unsupported kinds carry their reason inline so they do not depend on it.
- desktop and phone screenshots are not yet in this narrative.

## shared-file patches (not applied — outside the room)

1. `src/pages/Dashboard.tsx:2019-2020` — retired-room fallback strings carry account-era language.
   old:
   ```
          "File Scrapper",
          "Upload unstructured documents and extract all text into a single downloadable TXT file. Available on Asherin and above.",
   ```
   new:
   ```
          "asherin.extract",
          "pdfs, scans, photos of text, .docx and plain text, read on this device and returned as one .txt.",
   ```
2. `src/lib/navIntents.ts:121` — the room does not reconstruct tables.
   old: `    blurb: "pull text and tables out of documents",`
   new: `    blurb: "pull text out of documents",`
3. `src/components/dashboard/connect/ConnectView.tsx:57` — capitalised organ label.
   old: `  { id: "file-scrapper", label: "File Scrapper", x: 62, y: 38 },`
   new: `  { id: "file-scrapper", label: "asherin.extract", x: 62, y: 38 },`

## review log

| # | finding | kind | fix | confirmed by |
| --- | --- | --- | --- | --- |
| 1 | extraction called `supabase.functions.invoke("scrapper-extract")`, which the local shim answers with "kernel offline" — the core promise never worked on a device | defect | on-device readers in `extract.ts` (pdfjs text layer, pdf page ocr, tesseract for images, jszip for docx, utf-8 decode); `queue.ts:83-121` | unit: 28 tests incl. a real pdf through pdfjs |
| 2 | extracted text and status were only set in react state, never written to the row; reopening a session lost everything | defect | `saveExtraction` `store.ts:222-233`, rows are the source of truth, the view subscribes (`SessionWorkspace.tsx:66-88`) | `store.test.ts` "saves a pass onto the row" |
| 3 | `total_files` / `total_text_length` were never updated (hosted trigger gone) — the strip read `0 files · 0.0k chars` forever | defect | `recomputeTotals` `store.ts:145-154`, called after every pass | `store.test.ts` totals |
| 4 | session delete relied on a cascade fk that the local store does not have — file rows were orphaned | defect | `deleteSession` removes blobs, file rows, then the session (`store.ts:129-143`) | `store.test.ts` "deleting a session removes…" |
| 5 | the bytes were base64-encoded with a per-byte string `reduce` (quadratic) before being sent nowhere | defect | gone; bytes go straight to the reader | code |
| 6 | no size limit, `accept="*/*"`, no kind check — a 2 gb video was stored and "extracted" | defect | 100 mb refusal before storage; classification; unsupported rows with a reason and no blob | `extract.test.ts` refusals; `store.test.ts` unsupported row |
| 7 | no cap on text or pages; a 5,000-page pdf ran unbounded | defect | 1m chars per file, 20 ocr pages per pdf, loop stops at the cap (`extract.ts:72-85`, `:354`) | `extract.test.ts` budget tests |
| 8 | `extracting` was a single id; uploading several files ran extractions concurrently and showed the spinner on the wrong card | defect | one device-wide queue, one pass at a time (`queue.ts`) | code; `isQueued`/progress per id |
| 9 | "Drop files or click to upload" but the zone had no drop handlers (dropping navigated the tab to the file) | defect | `onDragOver`/`onDrop` on the zone (`SessionWorkspace.tsx:216-225`) | code |
| 10 | storage path `${Date.now()}_${file.name}` — two same-named files in one tick collided with a 409 | defect | `<user>/<session>/<uuid>` (`store.ts:180`) | `store.test.ts` path regex |
| 11 | `URL.revokeObjectURL` in the same tick as `a.click()` aborts the download in safari | defect | revoke after 10 s (`SessionWorkspace.tsx:156`) | code |
| 12 | preview at phone width split into two `w-1/2` columns 170px wide each; header actions overflowed at 390px | defect | `flex-col md:flex-row` body, `md:w-1/2`, wrapping header (`SessionWorkspace.tsx:167`, `:201-203`, `:302`) | screenshots pending |
| 13 | delete button was `opacity-0 group-hover:opacity-100` — invisible on touch; rename was double-click only — unreachable on touch and keyboard | defect | visible on phone, pencil button, keyboard rows, two-tap delete (`SessionsList.tsx:81-161`) | code |
| 14 | session delete had no confirmation | defect | inline arm + `sure?` for 3.5 s (`SessionsList.tsx:44-54`) | code |
| 15 | a files-table read error was swallowed: empty list, no message | defect | `filesError` line (`SessionWorkspace.tsx:244`) | code |
| 16 | a sessions-table read error was a toast over a blank room | defect | error card with `try again` (`FileScrapperView.tsx:111-126`) | code |
| 17 | raw statuses (`uploaded`, `completed`) and capitalised copy everywhere (`Sessions`, `+ New Session`, `Copy All`, `Download TXT`, `PDFs, images…`, toast titles `Error`) | defect | lowercase labels and status map (`SessionWorkspace.tsx:25-32`), all copy rewritten | grep of the three components |
| 18 | the preview rendered the whole combined text in one `<pre>`, megabytes at a time | defect | 200k-character preview with a note; full text in the download (`SessionWorkspace.tsx:95-98`, `:316`) | code |
| 19 | the combined text was re-joined on every render | defect | memoised on `files` (`SessionWorkspace.tsx:94`) | code |
| 20 | hidden `<input type=file>` inside a `<label>` — not keyboard-reachable; icon buttons without names | defect | `role="button"` zone with enter/space; `aria-label` on every icon button | code |
| 21 | sessions were inserted without `updated_at`, so "newest first" ordering was undefined | defect | explicit `updated_at` on insert and on every total recompute (`store.ts:116`, `:149`) | `store.test.ts` newest-first |
| 22 | narrative v1 claimed the room "shows a kernel offline message for images" — in fact every kind failed the same way because the function did not exist | wrong claim | narrative rewritten against the new readers | — |
| 23 | narrative v1 claimed credential masking "as in the library" | wrong claim | the room deliberately does not mask; stated under security & privacy | — |
| 24 | nav blurb promises tables; the room reads text | wrong claim (shared file) | shared-file patch 2 | — |
| 25 | `Dashboard.tsx` fallback strings say "Available on Asherin and above" | defect (shared file, unreachable in this edition) | shared-file patch 1 | — |
| 26 | connect organ label `File Scrapper` | defect (shared file) | shared-file patch 3 | — |
| 27 | a mid-pass reload left rows at `extracting` forever | defect | stale `extracting` re-enqueued on open (`SessionWorkspace.tsx:75-78`) | code |
| 28 | no connect trace: the organ was never lit although it is on the graph | defect | one masked trace per pass (`queue.ts:105-114`) | code |

## vision confirmation — 2026-10-26

screens: final3-d-file-scrapper.png and final3-m-file-scrapper.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: sessions list and the empty state with what is read on this device render. defect seen and fixed: "new session" was green.
- fixed: tonal primary button.
