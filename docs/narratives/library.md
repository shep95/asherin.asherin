```
room: asherin.library   view id: library   files: src/components/dashboard/LibraryView.tsx, src/components/dashboard/library/FilePreview.tsx, src/components/dashboard/library/undoDelete.ts, src/lib/library/library.ts
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

line numbers are as of this review. shared files (Dashboard.tsx, navIntents.ts, v2Titles.ts, file-security.ts, local/*.ts) are edited by other rooms concurrently; for those the symbol is the anchor and the line is a hint.

## purpose & promise

the library is where files live between conversations. a file dropped here is validated, stored as bytes in this device's blob store, recorded as a row, and then read on this device so it can be found by what it says, not only by what it is called. text-like files and pdfs become searchable; images, spreadsheets and archives are kept but honestly marked as not read. every file can be opened in a preview, moved into or out of a project, read again if the pass failed, and removed with an undo window. nothing leaves the device: there is no upload host, no indexing service, no model call anywhere in the room (`library.ts` imports only the local shim, the connect tracer and the validator — l.9-11; observed).

the interface promises exactly this: "files stay on this device across conversations and are searched by content, not just by name." and "max 500mb per file · credential-shaped text is masked before it is indexed" (`LibraryView.tsx:181-186`). each clause is backed under **security & privacy**.

## entry & navigation

- rail: group `keep`, label `Library`, blurb "Saved files and references" (`src/lib/navIntents.ts:237-243`). capitalised; patch proposed below.
- deep link `/dashboard/library`; `"library"` is in `VALID_VIEWS` (`Dashboard.tsx:161`) and rendered by `case "library"` (`Dashboard.tsx:2082`) inside `ErrorBoundary` + `Suspense`, lazily loaded (`Dashboard.tsx:34`). observed.
- v.2 shell title `library` / "files shepherd can search." (`v2Titles.ts:16`) — true after this review (the brief in projects and the brain loader are what hand file text to shepherd; the search itself is the operator's). in v.2 the room renders no hero; its one action (upload) is portalled into the shell slot (`LibraryView.tsx:176` `<V2Action>`).
- what loads first: a centred spinner marked `aria-busy` (`:138-144`), then `load()` (`:49-66`) reads the file rows and the project rows in parallel, reconciles the stored scope pointer against the projects that exist (`:57` `reconcileScope`), and resumes any extraction a closed tab left half-done (`:60`).

## workflow

happy path:
1. operator presses **upload** (desktop: header button; v.2: shell slot; both `aria-label="upload files"`, `:159-164`) or drops files anywhere on the room (`:168-172` drag ring + `onDrop`). the hidden `<input type=file multiple>` resets its value after each pick so the same file can be added twice (`:173`).
2. `uploadFiles` (`:87-102`) calls `ingestFile` per file (`library.ts:73`): `validateFile` (size ≤ 500 mb, extension allow-list, mime match, magic bytes, csv formula scan — `file-security.ts:102-193`), then the blob goes to bucket `library` under `userId/uuid.ext` (`library.ts:91-92`), then the row is inserted with `text_status: "pending"` from `COLUMN_DEFAULTS` (`postgrest.ts:75`), and the row is returned at once. a row that cannot be written removes the blob again (`:111-114`).
3. extraction runs after the return, fire-and-forget (`:131-146`): `extractLocally` → `readFileText` (`:390`) → `markStatus` writes `extracted_text`, `text_status`, `text_chars` onto the row; `onUpdate` patches the row on screen, so "reading…" becomes "searchable · 1,204 chars" without a reload. a thrown pass marks the row `failed` in the store as well as on screen (`:142-144`).
4. the toast reads "1 file added — reading text on this device." (`:101`).
5. operator types two or more characters; after 300 ms `searchLibrary` runs (`:70-86`); hits replace the list, each content hit carries a masked passage under the row (`:284-288`); the count reads "3 hits" (`:228`).
6. operator presses a row (`:249` `aria-label="open <name>"`) → `FilePreview` (`FilePreview.tsx`): image → `<img>`, pdf → `<iframe>` of a tab-local object url, text → the indexed (masked) text, anything else → "no preview for this format. download it to open it in another app." download is an `<a download>` on the same object url. escape or the close button closes; the url is revoked on close (`FilePreview.tsx:50`).
7. operator presses the trash (`:274-281` `aria-label="remove <name>"`): the row leaves the list at once and a 6-second toast offers **undo** (`undoDelete.ts:29-62`). when the window closes `deleteLibraryFile` deletes the row, then the blob, then re-reads to prove the row is gone (`library.ts:251-261`); a failure puts the row back with the store's message.

secondary paths:
- **project assignment**: the per-row `<select>` (`:259-267`, `aria-label="project for <name>"`) moves a file into a project or out of every project (`assignProject`, `library.ts:238`); optimistic, reverted with a toast on error (`:121-130`).
- **scope**: when a project is active (`getActiveScope`, `scope.ts:48`) a banner says "scoped to project X — new uploads land in this project." with an **all files** button that clears the scope (`:193-201`); the list and the search are filtered to that project (`:132`, `:78`).
- **read again**: rows marked `failed` or `empty` get a refresh button (`:269-273`) → `retryExtract` (`library.ts:285`) downloads the blob and runs the same pass; `unsupported` and `too_large` rows do not get it, because the answer would not change.
- **resume**: every `pending` row at mount is read again, one at a time, stopping if the room unmounts (`resumePendingExtraction`, `library.ts:149-162`).
- **try again** after a load error (`:146-156`).
- **500 cap**: when the list holds `LIBRARY_LIST_LIMIT` rows a line says "the newest 500 files are shown; search still covers all of them." (`:231-233`) — search reads with the same limit, see **open gaps**.

### machine narrative — upload / extract

| | |
| --- | --- |
| actor | the operator, in this room or a project's files tab |
| action | `ingestFile(userId, file, projectId, onUpdate)` (`library.ts:73`) |
| inputs | a `File`; the active project id or null |
| preconditions | device identity present (`useAuth().user`, always); `validateFile` passes |
| effects | blob at `library/<userId>/<uuid>.<ext>` in IndexedDB `blobs`; a `library_files` row (`pending`, 0 chars); one `asherin_connect_pulls` trace with the display name only; then a second write to the same row with `extracted_text` (masked, ≤ 400 000 chars), `text_status` ∈ ok · empty · unsupported · failed · too_large, `text_chars` |
| failure paths | validator refuses → `{file:null,error}` lowercased, nothing written (`:81-89`); blob write fails → same, nothing written (`:92-100`); row insert fails → blob removed, error returned (`:111-114`); extraction throws → row marked `failed`, upload still succeeded (`:142-144`) |
| invariants | the row exists before the pass starts, so a file is never "lost in extraction"; `extracted_text` is null unless status is `ok`; what is indexed has passed `maskCredentials` (`:349`); a text-like file is read from its first 2 mb only (`MAX_TEXT_BYTES`, `:316`); a pdf above 64 mb is never parsed (`MAX_PDF_BYTES`, `:318`) |

### machine narrative — search

| | |
| --- | --- |
| actor | the room, 300 ms after the last keystroke, for queries ≥ 2 chars |
| action | `searchLibrary(userId, query, projectId)` (`library.ts:196`) |
| inputs | the query; the active project id or null |
| effects | none on the store; one connect trace (first hit's filename or the query, masked) |
| logic | `searchTerms` lowercases, dedupes, drops one-letter terms, caps at 8 (`:173`); rows for the user (and project) are read newest-first up to 500 with `extracted_text`; a row hits when every term matches the name, or every term matches the name-or-text (`:216-218`); name hits rank before content hits, each band newest-first; at most 40 (`:44`); each hit carries `snippetFor` — the masked 220-char window around the first term found (`:178`) |
| failure paths | store error → thrown, the room toasts it and keeps the previous list (`LibraryView.tsx:79-83`); nothing matches → "nothing in the library matches that." |
| invariants | terms are escaped before becoming regexes (`:171`); the query never enters the shim's `.or()` filter grammar, so `(`, `,`, `%` and `.ilike.` are literal text (tested) |

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| `library_files` rows | IndexedDB `asherin_local_v1` → `tables` store via the shim (`postgrest.ts`) | `LibraryFile` (`library.ts:15`): id, user_id (filled by the shim), file_name (sanitised display name), file_size, file_type, storage_path, created_at, project_id, text_status, text_chars, folder; plus `extracted_text` on the row, never in the list projection (`SELECT_COLS`, `:46`) | until removed, or "delete my data" (`db.ts` `wipeLocalDb`) | no |
| file bytes | IndexedDB `blobs` store, key `library/<path>` (`db.ts:175-193`, `storage.ts:46-61`) | `BlobRecord` { blob, contentType, size, createdAt, updatedAt } | same | no |
| connect traces | `asherin_connect_pulls` rows (`emitPull.ts:86`) | organ, capability, status, latency, masked quote (filename or query), scalar meta | until wiped | no |
| active project pointer | localStorage `asherin_active_project` (`scope.ts:45`) | { projectId, name, mode } | until cleared or reconciled away | no |
| react | files, projects, scope, loading, error, uploading, search, hits, searching, dragOver, preview (`LibraryView.tsx:27-40`) | — | mount | no |
| pending deletes | module map in `undoDelete.ts:19` | file, timer, restore callback | 6 s each; survives the room unmounting on purpose (`undoDelete.ts:3-6`) | no |
| object urls | `FilePreview` effect (`FilePreview.tsx:39-55`) | one `blob:` url per open preview | revoked on close / unmount | no |

the file name is stored sanitised (`sanitizeDisplayName`, `file-security.ts:205`) and the storage path never contains it (`buildStoragePath`, `:95`), so a hostile name cannot traverse or collide.

## logic

- **validation** (`file-security.ts:102-193`, shared): size (0 < n ≤ 500 mb) → extension allow-list → blocked executables → mime must match the extension unless octet-stream → magic bytes for pdf/xlsx/xls/png/jpg/gif/webp/db → csv/text formula scan over the first 100 kb for files under 10 mb. `.md`, `.markdown`, `.tsv` and `.docx` are not on the allow-list today (patch proposed below); `.js`, `.py`, `.sh` are blocked by design.
- **reader selection** (`extractionKind`, `library.ts:376`): pdf by mime or extension; text by `text/*`, `application/json`, `+json`, `+xml`, or an extension in `TEXT_EXT` (`:306-310`); everything else `none` → `unsupported`.
- **bounds** (`readFileText`, `:390-407`): text read from `file.slice(0, 2 mb)` via `blobText` (Blob.text with a FileReader fallback, `:321`); pdf parsed in pdf.js's worker (`workerSrc`, `:362`) page by page until 400 000 chars with a running counter (`:365-371`), refused above 64 mb with status `too_large`; nul bytes stripped; whitespace-only → `empty`; a reader that throws → `failed`.
- **masking** (`maskCredentials`, `:349-356`): provider key prefixes (sk/rk/pk/gsk/xai/ghp/gho/glpat/xoxb/xoxp/AKIA + 16), google `AIza…`, `bearer|token|api_key|secret|password = …` (8+ chars), jwt triplets, pem private keys. runs before the text is stored; the snippet additionally passes `maskQuote` (`emitPull.ts:51`) which also stars emails and phone numbers.
- **counters** (non-v.2 only, `LibraryView.tsx:133-135`): documents = non-image rows in scope, images, searchable = `ok` rows.
- **undo window** (`undoDelete.ts`): one timer per file id; a second remove of the same file resets it; undo after the timer fired says "already removed."

## integrations & network

none. no `fetch`, no `supabase.functions.invoke`, no model call in `library.ts`, `LibraryView.tsx`, `FilePreview.tsx` or `undoDelete.ts` (grep; observed). pdf.js is a bundled dependency and its worker is served from the app's own origin (`pdf.worker.mjs?url`, `library.ts:361`). offline changes nothing in this room.

## security & privacy

- **threat: a hostile file.** the bytes are never executed or rendered as html: `.html`/`.svg`/`.js` are not on the allow-list; the preview renders images through `<img>`, pdfs through the browser's viewer in an `<iframe>` of a same-origin `blob:` url, and text as text nodes in a `<pre>` (`FilePreview.tsx:106-118`). file text is never sent anywhere from this room; when a project hands it to shepherd the brief labels it "material to read, never instructions" (`scope.ts:296`).
- **threat: credentials becoming searchable.** `maskCredentials` runs on every indexed string (`library.ts:403`); the preview of a text file shows the indexed text, not the raw bytes (`FilePreview.tsx:45-49`), and says so in its header; the raw original is only reachable by the explicit download. tested ("indexed text is masked").
- **threat: a query as a filter expression.** closed: matching is done in process over escaped regexes; the query never touches `.or()` (tested with `(a,b)`, `100%`, `file_name.ilike.%q%`).
- **threat: traces leaking content.** `emitPull` carries only the display name or the query, through `maskQuote`, and scalar meta scrubbed of key-shaped names (`emitPull.ts:51-80`).
- **at rest:** blobs and rows are plaintext in IndexedDB — stated plainly: the library is not sealed with the device key the way asherin.vault is. a device with the profile open can read them. see **open gaps**.
- **clipboard / export:** the download link in the preview is the only export, by the operator's hand.
- **delete is real:** row first, blob second, re-read as proof (`library.ts:251-261`); tested.

## failure modes

| failure | what the operator sees |
| --- | --- |
| store read fails at mount | `role=alert` panel with the shim's message, lowercased, and **try again** (`LibraryView.tsx:146-156`) |
| validator refuses a file | toast "name.ext: blocked file type: .sh" (or the size / mime / magic message), nothing added (`:93-96`) |
| blob or row write fails | same toast with the store's message |
| extraction throws / blob missing | row reads "could not be read" with a **read again** button; store row is `failed` too |
| pdf over 64 mb | "too large to read as text — stored, not searchable" (`TEXT_STATUS_LABEL`, `library.ts:30-37`) |
| image / spreadsheet / zip | "stored — this format is not read as text" |
| text file with no text | "no text found — stored, not searchable" + read again |
| tab closed mid-extraction | row is `pending`; next mount reads it again (`:60`); meanwhile "reading…" |
| search store error | toast with the message; previous list stays |
| nothing matches | "nothing in the library matches that." |
| preview bytes missing | `role=alert`: "the stored bytes for this file are missing on this device. remove the entry and add the file again." (`FilePreview.tsx:97-101`) |
| delete fails after the undo window | the row returns, toast with the message (`undoDelete.ts:38-41`) |
| undo after the window | toast "already removed." |
| project move fails | select reverts, toast (`:121-130`) |

no spinner lives longer than its await: `loading` clears in `finally` behind an `alive` ref (`:61-65`); the search spinner clears in `finally` (`:82-84`); the preview spinner ends in `ready` or `missing`.

## interface & accessibility

- desktop (1440, inferred from classes): one column, `max-w-3xl` (v.2 `max-w-4xl`), 24 px padding. order: title + promise + upload (v.2: shell title + slot), scope banner when scoped, three count tiles (not in v.2 — the list is the count), search bar, list. one focal point: the search bar sits between the summary and the rows; the drop ring appears only while dragging (`ring-2 ring-accent/50`).
- phone (390, inferred): padding drops to 16 px (`p-4 sm:p-6`, `:168`); the header wraps (`flex-wrap`, `:179`); tiles stay three-up at `p-3`; each row is `flex-wrap` with the name block at `min-w-[160px] flex-1` so the select / read-again / remove controls fall to a second line instead of crushing the name (`:248-282`); the remove button is visible at 70 % on touch and only on hover/focus from `sm:` up (`:278`). the preview is full-screen on phone and a centred panel from `sm:` (`FilePreview.tsx:67`).
- focus order: upload → (all files) → search → per row: open → project select → read again → remove. every control has a name (`aria-label`s at `:159`, `:197`, `:225`, `:249`, `:264`, `:272`, `:276`); the preview is `role=dialog aria-modal` and focuses its close button on open, escape closes (`FilePreview.tsx:57-62`); loading states are `aria-busy`; errors are `role=alert`.
- motion: spinners and the drag ring only; the undo toast is sonner's default.
- colour: accent only on the scope ring and the active drop ring; destructive red only on hover of remove and in the error panel — colour carries meaning, nothing else.
- type: 20 px title, 14 px promise, 12/10 px rows; lowercase throughout.
- empty states: unscoped "drop files here or press upload.", scoped "nothing in this project yet — …", search "nothing in the library matches that." — all inside a dashed drop target (`:236-243`).

## relationships

| edge | to | real in code? |
| --- | --- | --- |
| reads_from / writes_to | `library_files`, blob bucket `library`, `asherin_connect_pulls` | yes (`library.ts`) |
| reads_from | `projects` (for the select and the scope), localStorage scope pointer | yes (`LibraryView.tsx:55-57`) |
| writes_to | localStorage scope pointer (clear only, "all files") | yes (`:197`) |
| handed to | projects: a project's files tab lists this table filtered by `project_id` and shares `FilePreview`, `undoDelete`, `TEXT_STATUS_LABEL` | yes (`ProjectsView.tsx:14-19`) |
| handed to | chat: `composeProjectContext` reads `extracted_text` of a project's `ok` rows for a turn | lib ready (`scope.ts:309`); the chat-side call is the patch under **projects** |
| handed to | brains (`BrainsManager.tsx:80,148-154`): writes rows into the same table and loads raw blobs for a directive profile | yes, shared file; not this room's contract |
| verified_by | `src/lib/library/__tests__/library.test.ts` | yes |

## performance

- mount: two table reads (≤ 500 + projects), then at most one resumed extraction at a time.
- upload: validation reads ≤ 100 kb + 8 bytes; the blob is written once; extraction reads ≤ 2 mb of text or hands ≤ 64 mb to pdf.js's worker — the 500 mb case no longer touches `file.text()` or `arrayBuffer()` on the main thread (`library.ts:398-399`).
- search: 300 ms debounce; one table read; up to 500 × 400 000 chars regex-tested per term — ~200 m chars worst case, under half a second on a phone; no copies of the texts are made (`re.test`, not `toLowerCase`).
- timers: the search debounce (cleared on change), one 6 s undo timer per removed file (module level by design).
- unmount: `alive` ref gates every late `setState` (`:42`, `:56`, `:60`); object urls revoked (`FilePreview.tsx:55`).

## copy & voice

every visible string is lowercase; the model is not named in this room (nothing here talks to it). no "account", "sign in", "upload failed" in title case, no "kernel offline". toasts: "n files added — reading text on this device.", "removed name" + undo, "already removed.", error messages from the store lowercased at the first letter. the one remaining capitalised string on screen is the rail label/blurb from `navIntents.ts` (shared; patch below). `MAX_FILE_SIZE_DISPLAY` is lowercased at render (`:186`).

## tests & proof

- `src/lib/library/__tests__/library.test.ts` — 23 tests on the real on-device shim (fake-indexeddb): masking (keys, bearer, jwt, pem, AKIA; prose untouched); bounded reading (text ok, kind selection, unsupported, empty, 2 mb / 400 000 cap, pdf refused above 64 mb without calling the parser, pdf text masked, thrown reader → failed, nul stripped); terms and snippets; the loop: refused file writes nothing, add → pending → ok → content hit with snippet → name hit → two-char floor, ranking and all-terms, punctuation literal, project scoping and assign, masked index + openable handle, delete proven by re-read, pending resumed at mount, retry on a missing blob marks failed, store error thrown not swallowed.
- `npx vitest run src/lib/library src/lib/projects src/components/dashboard/library`: 3 files, 35 tests pass. `npx tsc --noEmit -p tsconfig.app.json`: exit 0. eslint on the room files: clean. (an earlier full run showed one failure in another room's in-progress `settings.test.ts`; not re-run at the end.)
- end-to-end: not driven this round. screenshots: pending.

## open gaps

1. **no screenshots this round**; phone and desktop claims are read from classes and marked inferred.
2. **plaintext at rest.** rows and blobs are not sealed with the device key. deliberate for now (search needs the text open); the narrative says so rather than implying otherwise.
3. **search reads the newest 500 rows**, same cap as the list; the on-screen line says search covers all of them — true up to 500 files. above that, older files are neither listed nor searched. a cursor over the table would close it.
4. **`.md`, `.tsv`, `.docx` cannot be added** until `file-security.ts` (shared) allows them; the projects copy no longer promises them.
5. **brains** (`BrainsManager.tsx`) loads raw blobs with `blob.text()` for up to 80 000 chars each and could reuse `extracted_text`; shared file, not patched here.
6. **deleting a file leaves `brains.file_ids` pointing at it**; the brain loader tolerates a missing row (`.in()` returns fewer rows). stated, not fixed here.

## proposed patches to shared files (not applied)

`src/lib/navIntents.ts:237-243`
```ts
// old
    label: "Library",
    codename: "Library",
    blurb: "Saved files and references",
// new
    label: "library",
    codename: "library",
    blurb: "files kept on this device, searched by what they say",
```

`src/lib/file-security.ts:7-22` — allow the formats the room can read:
```ts
// old
  ".txt": ["text/plain"],
// new
  ".txt": ["text/plain"],
  ".md": ["text/markdown", "text/plain"],
  ".markdown": ["text/markdown", "text/plain"],
  ".tsv": ["text/tab-separated-values", "text/plain"],
```

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | a 500 mb text file was read whole with `file.text()` and a 500 mb pdf with `arrayBuffer()` on the main thread; `pages.join("")` inside the pdf loop was quadratic | performance (VC-051) | cause | observed (old `library.ts:220-227`, `:245`) | defect | local correction | `library.ts:316-318` bounds, `:398-399` sliced read, `:365-371` running counter; status `too_large` | test "reads only the first MAX_TEXT_BYTES", "refuses to parse a pdf above MAX_PDF_BYTES" |
| 2 | the search query was spliced into the shim's `.or()` grammar; `%` and `,` were stripped but `(`, `)` and `.op.` were not, so punctuation changed what matched; no ordering, so the 40-row cap returned arbitrary rows | security · behavioral | cause | observed (old `:136`) | defect | boundary repair | `searchLibrary` matches in process over escaped regexes, ranked name → content, newest first (`:196-236`) | test "punctuation in a query is literal", "name hits rank first" |
| 3 | `listLibrary` swallowed store errors and returned `[]`, so a failed read rendered the "drop files here" empty state | state · interface | failure | observed (old `:33-34`, `LibraryView.tsx:55-60`) | defect | contract repair | `listLibrary` throws (`:55-61`); room shows `role=alert` + try again (`LibraryView.tsx:146-156`) | test "listLibrary throws on a store error" |
| 4 | a row left `pending` by a closed tab showed "reading…" forever, with no retry (retry was hidden for `pending`) | state · behavioral | cause | observed (old view `:237`) | defect | local correction | `resumePendingExtraction` at mount (`library.ts:149`, view `:60`) | test "a row left pending is read again at mount" |
| 5 | delete was instant from a hover-only icon: invisible on phone and to keyboard users, no confirm, no undo | interface (forcing functions record), accessibility | failure | observed (old view `:242`) | defect | local correction | undo window (`undoDelete.ts`), visible at 70 % below `sm`, `focus:opacity-100`, `aria-label` (`LibraryView.tsx:274-281`) | — (screenshots pending) |
| 6 | no way to open or preview a file — the core workflow's "open" step did not exist | requirements | failure | observed (no handler on the row) | defect | component addition | `FilePreview.tsx`, `openLibraryFile` (`library.ts:271`) | — |
| 7 | `deleteLibraryFile` removed the blob first and ignored the row delete's error; a failed row delete left a row pointing at nothing while the ui had already dropped it | data | cause | observed (old `:172-179`) | defect | local correction | row first, blob second, re-read proof, throws (`:251-261`) | test "delete removes the row and the blob, proven by re-read" |
| 8 | `assignProject` and `retryExtract` errors were silent; the select showed a move that had not happened | state | failure | observed (old `:164-170`, view `:112-115`) | defect | local correction | throw + revert + toast (`library.ts:238-247`, view `:121-130`); retry marks the store `failed` (`:285-303`) | test "retry on a missing blob marks the row failed" |
| 9 | copy in title case ("Your Library", "Documents", "Upload", "File rejected", "Search names and file contents…") against the lowercase doctrine | copy | failure | observed | defect | local correction | all strings lowercased (`LibraryView.tsx`) | — |
| 10 | select and trash had no accessible name; the trash had no focus state | interface · accessibility | failure | observed (old view `:228-244`) | defect | local correction | `aria-label`s (`:264`, `:272`, `:276`) | — |
| 11 | on a 390 px screen the row (icon + name + select + two buttons) left ~100 px for the name | interface (phone) | failure | inferred from widths | defect | local correction | `flex-wrap` row, `min-w-[160px]` name, controls wrap under (`:248-282`) | screenshots pending |
| 12 | the scope banner offered no way back to "all files" from inside the library | interface | failure | observed (old view `:171-176`) | defect | local correction | "all files" clears the scope (`:197`) | — |
| 13 | header comment claimed "name-only filtering stays local" — there was no name-only filter | wrong claim | — | observed (old view `:64-65`) | wrong claim | — | comment corrected (`:68`) | — |
| 14 | `TextStatus` labels lived in two rooms with different wording for the same state | semantic | failure | observed (old view `:26-32` vs `ProjectsView.tsx:447-455`) | defect | state consolidation | `TEXT_STATUS_LABEL` in the lib (`library.ts:30-37`), used by both | — |
| 15 | `Blob.text()` assumed present; absent on older safari (and jsdom), the pass failed silently as `failed` | dependency | cause | observed in the test run | defect | local correction | `blobText` / `blobBytes` with `FileReader` fallback (`:321-340`) | library tests run on jsdom |
| 16 | rail blurb and label are capitalised; `.md`/`.tsv` are refused while being the commonest text files | copy · requirements | failure | observed (`navIntents.ts:237-243`, `file-security.ts:7-22`) | defect (shared) | local correction | patches above, not applied | — |

## vision confirmation — 2026-10-26

screens: final3-d-library.png and final3-m-library.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: the empty library with upload, counters and content search renders at both widths; upload → content search is proven end to end.
