```
room: asherin.notebooks   view id: notebooks   files: src/components/dashboard/NotebooksView.tsx, src/components/dashboard/notebooks/notebookStore.ts, src/components/dashboard/notebooks/CellOutput.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

line numbers are as of this review. shared files (`Dashboard.tsx`, `navIntents.ts`, `v2Titles.ts`, `CommandPalette.tsx`, `ConnectView.tsx`) are edited by other rooms concurrently; for those the symbol is the anchor and the line is a hint. evidence status per claim: **observed** (read in code), **verified** (unit-tested), **inferred**, **unknown**.

## purpose & promise

asherin.notebooks keeps notebooks of ordered cells on this device. four cell types exist (`notebookStore.ts:18-20`, observed): **text** renders as markdown; **prompt** is a question shepherd answers in place, with the cells above it as context; **code** and **sql** are kept as text — no sql engine (sql.js, duckdb-wasm, alasql) is in `package.json`, so nothing runs, and the sql cell says so under its body (`NotebooksView.tsx:709`, observed). a version is a snapshot of the cells kept on request and restorable (`notebookStore.ts:344, 378`, verified). a notebook exports to one markdown file (`notebookStore.ts:171`, verified).

the interface promises exactly this: the room line reads "cells of notes, code and questions for shepherd, kept on this device." (`NotebooksView.tsx:775`), the empty list says "a notebook is a column of cells: notes, code, and questions shepherd answers in place. everything stays on this device." (`:522`), and each cell header carries a hint — "markdown, rendered here", "a question shepherd answers in place", "kept as text", "kept as text — no sql engine in this build" (`:39-44`). it no longer promises sharing, scheduling, running or a "kernel" (review log #1-#4).

## entry & navigation

- rail: group `understand`, label `asherin.notebooks`, codename "shared analysis", blurb "shared analysis sessions with versions", keyword "collaborate" (`src/lib/navIntents.ts:168-175`, observed) — hosted-era wording; patch proposed below.
- deep link `/dashboard/notebooks`; `"notebooks"` is in `VALID_VIEWS` (`src/pages/Dashboard.tsx:171`) and rendered by `case "notebooks"` through `gatedView("notebooks", NotebooksView, "Intelligence Notebooks")` inside `ErrorBoundary` + `Suspense` (`Dashboard.tsx:1968-1972`, lazy at `:49`). the title string only surfaces on the retired-room card and is capitalised hosted-era copy; patch below.
- v.2 shell title `notebooks` / "saved analysis sessions." (`src/lib/dashboard/v2Titles.ts:37`) — the label the rail uses is `asherin.notebooks`; patch below.
- command palette entry "Notebooks" with keyword "note" (`src/components/dashboard/CommandPalette.tsx:71`); connect graph organ "Notebooks" (`connect/ConnectView.tsx:50`); usage settings counts `notebooks` among rooms that spend model tokens (`settings/UsageSettings.tsx:36`) — true now only for prompt cells.
- in v.2 the room renders no hero; its one primary action (`new notebook`) is portalled into the shell slot (`NotebooksView.tsx:770` `<V2Action>`). in the current ui it renders its own lowercase name line and the same button (`:773-778`).
- what loads first: "reading this device's notebooks…" with a small spinner (`:502-508`), then `refreshList` reads `notebooks` for this owner (`:119-134` → `notebookStore.ts:208`). an identity that is missing (never in practice: `useAuth` mints one) or a read error shows a `role=alert` panel with `try again` in the list pane instead of spinning (`:120-124, 513-518`).
- the list refreshes itself when another room writes a notebook (asherin.briefing's "notebook" button writes `notebooks` + `notebook_cells`): `onNotebooksChange` → debounced 400 ms `refreshList` (`:139-142`, `notebookStore.ts:392`).

## workflow

happy path:
1. **new notebook** (`:496-500` button → `:786-801` dialog): title (≤120) and optional description (≤240); enter creates, escape closes; `createNotebook` writes one row with `version: 1`, `tags: []`, `updated_at` set (`notebookStore.ts:216-232`, verified). the list reloads and the new notebook opens (`:202-216`).
2. **add cells** (`:741-752` → `:270-280`): `add a cell: text · prompt · code · sql`; `addCell` inserts at position `cells.length` with the type's default body (`notebookStore.ts:252-261, 126-133`) and the new cell opens in edit mode.
3. **write**: a textarea per cell (`:680-692`). each keystroke updates the draft and arms an 800 ms debounced write (`:282-304` `edit`, `SAVE_DEBOUNCE_MS :46`); leaving the cell (done / blur / escape) flushes immediately (`:306-316`); switching notebooks flushes (`:150-157` `flushPending` in `openCells`); unmount flushes rather than dropping (`:187-199`). a failed write shows "not saved: …" under the cell (`:296, 315`).
4. **ask shepherd in a prompt cell** (`:358-436` `ask`; play button `:659`; ⌘/ctrl+enter in the textarea `:686`): the pending draft is flushed, then `streamChat` runs with the question as the single user message, `mode: "chat"`, `depth: "standard"`, and the cells above as `brainContext.prompt` (`:386-404`; context built by `promptContext`, `notebookStore.ts:148-169`, verified: cells above only, in order, prompt cells contribute question + answer, bounded to 12 000 chars keeping the end). the answer streams into the cell under a "shepherd" label (`:713-723`), the live pane follows the newest text (`:440-442`), `stop` aborts (`:438, 657`). on completion the text is written to `notebook_cells.output` (`:417-423`); an abort keeps what arrived.
5. **save a version** (`:589-628` panel, `:458-473` `keepVersion`): optional summary (≤160), `keep as v{n+1}` snapshots the cells (content, output, type, position) into `notebook_versions` and bumps `notebooks.version` (`notebookStore.ts:344-376`, verified).
6. **reopen**: the list orders by `updated_at` then `created_at` (`notebookStore.ts:212`); selecting loads cells by position (`:246-250`); drafts are seeded from stored content (`:159-176`).

secondary paths:
- **rename / describe** (`:244-260`, pencil `:582`): inline inputs, enter saves, escape cancels.
- **reorder** (`:335-345`, arrows `:665-666`): swap positions and rewrite `position` 0..n-1 (`notebookStore.ts:284-292`, verified).
- **delete a cell** (`:670` → inline confirm `:676` → `:318-333`): removes the row, renumbers the rest.
- **copy** a code/sql body or a shepherd answer (`:347-356`, `:663, 721`): clipboard with a toast; a refused clipboard says "select the text and copy it by hand."
- **restore a version** (`:619-623` confirm → `:475-494`): the current cells are kept as a version first ("before restoring v{n}"), then the snapshot's cells replace them (`notebookStore.ts:378-390`, verified). a version row without a snapshot shows "no snapshot" and cannot be restored (`:614-616`).
- **copy a notebook** (`:218-230`, `:538`): a new notebook "{title} (copy)" with every cell (`notebookStore.ts:306-316`, verified).
- **delete a notebook** (`:539` → inline confirm `:541` → `:232-242`): cells, versions and the row go together; the delete is proven by a re-read (`notebookStore.ts:294-304`, verified).
- **download** (`:262-267`, `:583`): `{slug}-{date}.md` — text as-is, questions as block quotes followed by the answer, code/sql fenced (`notebookStore.ts:171-189`, verified).
- **legacy rows** written by the hosted build load with `query`→sql, `visualization`/`data_source`→code (`notebookStore.ts:81-87`, verified). a stored *table* envelope from an old run still renders through `CellOutput` (`:645-646, 726`); an old *error* envelope ("kernel offline") is never shown.
- **retry**: list read, cell read and versions read each have a `try again` (`:516, 598-602, 631-636`).

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| `notebooks` rows | IndexedDB `asherin_local_v1` → `tables`, via the shim (`src/lib/local/postgrest.ts`) | `id, title, description, owner_id, version, tags[], created_at, updated_at`; `COLUMN_DEFAULTS` fills `tags/status/version` for rows written elsewhere (`postgrest.ts:74`); `normalizeNotebook` tolerates missing fields (`notebookStore.ts:101-113`) | until deleted or "delete my data" (`db.ts:231`) | no |
| `notebook_cells` rows | same | `id, notebook_id, cell_type, content (≤60 000), output, position, created_at` (`notebookStore.ts:43-51, 89-99`) | with the notebook | no |
| `notebook_versions` rows | same | `id, notebook_id, version, change_summary (≤160), changed_by, created_at, snapshot: { cells[] }` (`:53-67, 318-342`) | with the notebook; 50 newest shown | no |
| `asherin_connect_pulls` row | same, via `emitPull` | organ `notebooks`, capability `prompt`, status, latency, masked quote = cell title, meta `{notebook_id, answered, context_chars}` (`NotebooksView.tsx:427-436`, `src/lib/connect/emitPull.ts:86`) | until wiped | no |
| react: notebooks, loading, loadError, selectedId, cells, cellsError, drafts, editingCell, confirmCell, cellErrors, running, liveAnswer, creating/newTitle/newDesc, busy, confirmNotebook, renaming/renameTitle/renameDesc, versionsOpen/versions/versionsLoading/versionsError/versionSummary/confirmRestore | component (`:79-109`) | mount | no |
| refs: `alive`, `abortRef`, `pending` (debounce timers + unsaved content), `liveRef` | component (`:111-114`) | mount; `pending` is flushed on unmount | no |
| nothing in localStorage or sessionStorage | — | — | — | — |

columns written by the hosted build and no longer read: `status`, `schedule`, `last_run_at`, `team_id`, `notebook_shares` (never written now). `owner_id` is the device identity (`useAuth().user.id`); the shim also fills `user_id` on insert.

what leaves the device: for a prompt cell only — the question, the bounded notebook context and the system prompt, to the provider the operator connected, carrying that provider's key (`streamChat` → `resolveActiveModel`, `src/lib/ai.ts:59, 133`). nothing else, ever.

## logic

- **cell types** (`notebookStore.ts:81-87`): whitelist of four; `query`→`sql`; `visualization`/`data_source`→`code`; anything else → `text` so no row is dropped (verified).
- **cell title** (`:120-124`): `{label} · {first non-empty line}` with `-#/*>` markers stripped, 60 chars, "untitled cell" fallback; used only as the masked connect quote (verified).
- **prompt context** (`:148-169`): sort by position, take the cells before the asked cell (by id; by position if the id is not found), skip empty ones, render text raw, prompt as `question:/answer:`, others fenced with the type; join; if over the limit keep the tail with a leading "…" (verified, incl. bound).
- **snapshot** (`:135-146`): cells sorted by position, four fields each.
- **restore** (`:378-390`): refuse without a snapshot; save current as a version; delete all cells of the notebook; insert the snapshot's cells; reload. the intermediate state (cells deleted, insert failing) is possible but the version saved first makes it recoverable (open gap 4).
- **ordering** (`:208-214`): list newest `updated_at` (falls back to `created_at`) first; `touch` bumps `updated_at` on every cell write (`:242-244`).
- **export** (`:171-189`): heading, description, then cells in position order; slug + date filename (verified).
- **failure words** (`:191-198`): abort → "stopped."; key/vault/settings messages pass through lowercased so the BYOK reason reads as written; network → "could not be reached…"; busy/rate → "busy right now"; else a generic line (verified).
- **debounce** (`NotebooksView.tsx:282-316`): one timer per cell id; the latest content wins; a flush cancels the timer and writes once.

## integrations & network

- the only outbound call is shepherd: `streamChat` (`src/lib/ai.ts:133`) → `streamLlm` (`src/lib/local/llm.ts:347`) to the provider the operator selected, with the key read from the device key vault for the duration of the call. no timeout of its own; the operator's `stop` and unmount abort via `AbortController` (`NotebooksView.tsx:381-382, 189`). `streamChat` retries transient provider errors up to 3 times and continues cut-off answers (`ai.ts:229-247, 304-318`).
- no key / no provider: `resolveActiveModel` raises the BYOK dialog and throws (`ai.ts:45-54, 71`); the cell shows the reason in place with an `open settings` button (`:728-734`, `describeModelFailure` passes key wording through).
- `supabase.functions.invoke` is not called anywhere in the room or its store (grep) — "kernel offline" cannot appear. the previous build invoked a runner for sql/chart cells and answered a kernel-offline envelope on this device (review log #1).
- `emitPull` writes one local trace row per prompt run; it never throws and never blocks (`emitPull.ts:86-111`).
- offline: every read and write is IndexedDB; only a prompt cell needs the network, and a failure to reach the provider is worded in place.

## security & privacy

- **hostile model reply**: rendered through `ReactMarkdown` as text nodes — no `dangerouslySetInnerHTML`, no html passthrough (`:696, 718`); stored as a string capped at 60 000 chars (`updateCell` clip, `notebookStore.ts:263-268`).
- **hostile stored row**: every field is normalised on read (`normalizeCell`, `normalizeNotebook`, `listVersions`); a snapshot that is not an array yields `snapshot: null` and a "no snapshot" label rather than a crash (`:318-342`).
- **what reaches the provider**: the question and the cells above it. the operator chose to put them in the notebook; the room does not add vault, library or memory content of its own. the standard chat system prompt is used (`buildSystemPrompt` via `streamChat`), which may carry the operator's memory brief as it does in chat — stated here so it is not a surprise (open gap 3).
- **key handling**: the room never touches a key; `streamChat` resolves it inside `src/lib/ai.ts`.
- **clipboard / export**: copy and download are explicit operator actions on the operator's own text.
- **at rest**: plain text in IndexedDB like every other room's rows, not sealed; stated in open gaps.
- **injection surfaces**: none that execute — code and sql cells are never evaluated.

## failure modes

| failure | what the operator sees |
| --- | --- |
| no device identity | list pane: "this device has no identity yet — open chat once and come back." + try again (`:120-124, 513-517`) |
| `notebooks` read fails | the shim's message, lowercased, `role=alert`, try again (`:127, 513-518`) |
| cells read fails | "the cells could not be read: …" + try again above the (empty) cell list (`:631-636`) |
| create / copy / delete / rename notebook fails | destructive toast with the shim's message (`:207, 223, 235, 254`) |
| add / reorder / delete cell fails | destructive toast (`:273, 326, 343`) |
| debounced or final cell write fails | "not saved: …" under that cell, body kept in the draft (`:296, 315`) |
| empty prompt | "write the question first." (`:362`) |
| no model key / vault locked / provider switched off | the BYOK dialog (from `ai.ts`) and the reason in the cell with `open settings` (`:411, 728-734`) |
| provider unreachable / busy / other | worded by `describeModelFailure` in the cell (`notebookStore.ts:191-198`) |
| empty answer | "no answer came back." (`:406`) |
| stop while streaming | the partial answer stays and is saved; nothing is marked as an error (`:409-412, 417`) |
| answer saved fails | the answer is shown, with "the answer is shown but was not saved: …" (`:420`) |
| versions read fails | message + try again inside the versions panel (`:598-602`) |
| keep / restore version fails | destructive toast (`:466, 484`) |
| version has no snapshot | "no snapshot" label, no restore button (`:614-616`) |
| clipboard refused | toast "the clipboard is not available here — select the text and copy it by hand." (`:352`) |
| delete reports success but the row is still there | "that notebook is still here — try again." (`notebookStore.ts:302`) |

no spinner outlives its await: `loading` is set once after the first read (`:133`), the live pane shows "thinking…" only while `running` is that cell and nothing has arrived (`:715-717`), and `alive` guards every state write after an await (`:126, 162, 291, 313, 406, 418, 452`).

## interface & accessibility

- **desktop (1440)**: two panes — a 288 px list (`md:w-72`, `:511`) and a detail pane whose content is centred at `max-w-3xl` (`:556`). in v.2 the shell owns the title and the `new notebook` action; in the current ui a lowercase header row owns both (`:769-779`). one focal point: the selected notebook's cells; the versions panel opens only on request (`:589`).
- **phone (390)**: list → detail. with nothing selected the list is full width and the detail pane is hidden (`hidden md:flex`, `:553`); with a notebook selected the list hides (`:511`) and a `back to the list` chevron appears (`:559`, `md:hidden`). cell header controls wrap (`flex-wrap`, `:650`); the hint text is hidden below `sm` so the row fits (`:653`); the create dialog docks to the bottom edge (`items-end sm:items-center`, `:787`). inferred from classes; screenshots pending.
- **focus order**: new notebook → list rows (button per row, copy, delete) → back (phone) → rename / download / versions → per cell: ask/stop, copy, up, down, edit, delete → add-cell buttons. every icon button has an `aria-label` (`:538-539, 559, 582-584, 657-670`); the list row carries `aria-current`; the edit toggle `aria-pressed`; the versions toggle `aria-expanded`; the live answer is `aria-live="polite"` and `aria-busy` while streaming (`:713`); confirms are `role=alertdialog`; the create dialog is `role=dialog aria-modal aria-labelledby` (`:788`).
- **keyboard**: enter creates / saves a rename / keeps a version; escape closes the dialog, cancels a rename, leaves a cell; ⌘/ctrl+enter in a prompt cell asks (`:685-688`); double-click on a rendered cell opens it for editing (`:696-700`).
- **colour**: red only on delete confirms and the destructive hover; accent only on the ask/stop control and primary action. status badges and the five-dot fake "version history" timeline are gone (review log #6).
- **motion**: the loading spinner and the live answer scroll only.
- **type**: 12–13 px body, 10 px labels with tracking for cell types, markdown prose capped at `max-w-3xl` measure.
- **copy**: lowercase throughout except "asherin.notebooks" and "shepherd" as the model's name.
- **empty states**: list (`:519-524`), detail with nothing selected (`:757-762`), empty cell body (`:702-706`), no versions (`:604`).

## relationships

| edge | to | real in code? |
| --- | --- | --- |
| calls | shepherd via `streamChat` (`src/lib/ai.ts:133`) | yes (`NotebooksView.tsx:386`) |
| reads_from / writes_to | `notebooks`, `notebook_cells`, `notebook_versions` through the shim | yes (`notebookStore.ts:208-390`) |
| writes_to | `asherin_connect_pulls` via `emitPull` | yes (`:427`); read by asherin.connect (`connect/ConnectView.tsx:50`) |
| reads_from (incoming) | asherin.briefing writes a notebook + one text cell (`BriefingView.tsx:365-385`) | yes; the list refreshes via `onNotebooksChange` (`:139`) |
| trusts | the device key vault (indirectly, through `ai.ts`) | yes |
| owns_state | nothing outside its three tables | — |
| depends_on | `CellOutput` for legacy table envelopes only (`:726`) | yes |
| verified_by | `notebooks/__tests__/notebookStore.test.ts` | yes (9 tests) |
| no longer | `notebook_shares`, `asha_datasets`, `library_files`, azplen tables, a runner function | removed (review log #1-#3) |

## performance

- mount: one table read; selecting a notebook: one read; versions: one read on request (≤50 rows). no decrypts.
- timers: one debounce per edited cell (cleared on flush/unmount), one 400 ms list-refresh debounce (cleared on unmount), one 1 s `revokeObjectURL` after download.
- streaming: one `setLiveAnswer` per delta re-renders the open notebook; answers are markdown-rendered live. acceptable for a single cell; a very long answer in a long notebook will cost a re-render per chunk (open gap 5).
- unmount: abort the stream, flush pending writes, remove the table listener, flip `alive` (`:143-147, 187-199`).
- restore / clone write one row per cell sequentially through the shim's serialised mutation queue; fine for notebooks of tens of cells.

## copy & voice

every visible string is lowercase except "asherin.notebooks" and "shepherd". no "share", "schedule", "team", "run all", "published", "kernel", "Asherin Connect" or "Azplen". toasts: "copied", "notebook removed", "v{n} kept", "restored v{n}", and the error lines above. the sql cell states its limit in one sentence instead of pretending to run. three shared strings still carry the old voice and are patched below.

## tests & proof

- `src/components/dashboard/notebooks/__tests__/notebookStore.test.ts` — 9 tests against the real on-device shim (fake-indexeddb): type normalisation, cell titles, prompt context (order, answers, exclusion of cells below, bound), export markdown and filename, failure wording; and the whole device workflow: create (defaults, `updated_at`), add three cells, update content and output, keep a version (bump to v2), delete and reorder cells, restore v2 (three cells back, pre-restore state kept as v3 with the right summary), rename, delete with no orphan cells or versions; clone copies cells; legacy `query`/`visualization` rows normalise.
- `npx vitest run src/components/dashboard/notebooks`: 9 passed. full suite: 670 passed, 1 failed in `google/__tests__/offline.test.ts` (another room, edited concurrently; not touched here).
- `npx tsc --noEmit -p tsconfig.app.json`: no errors in the room's files. `npx eslint` on the four room files and two test files: exit 0.
- end-to-end step (create → add cells → ask → save → reopen): the store half is driven by the unit test; the model half needs a key and a browser and was not driven this round. screenshots: pending.

## open gaps

1. **no sql engine.** sql cells are text. adding sql.js or duckdb-wasm is a dependency decision outside this room; until then the cell says so.
2. **no chart cells.** the hosted chart runner is gone; a legacy table envelope still renders, nothing new is produced. a future device-side chart would need the sql engine first.
3. **the prompt cell uses chat's system prompt** (`buildSystemPrompt` through `streamChat`), so chat-level memory and doctrine context may ride along as they do in chat. stated; not changed here.
4. **restore is not atomic**: the current cells are kept as a version first, so an insert failing mid-restore loses nothing, but the operator may see a partial cell list until they restore again.
5. **live markdown render per delta** may be heavy for very long answers; a plain-text live pane with a final markdown render is the next step if it shows.
6. **plain text at rest**, like every other room's rows except the vault.
7. **no screenshots this round.**

## proposed patches to shared files (not applied)

1. `src/lib/navIntents.ts:168-175`
```ts
// old
    codename: "shared analysis",
    blurb: "shared analysis sessions with versions",
    keywords: ["notebook", "notebooks", "analysis", "session", "collaborate", "versions"],
// new
    codename: "notebooks",
    blurb: "cells of notes, code and questions for shepherd, with versions",
    keywords: ["notebook", "notebooks", "analysis", "cells", "prompt", "versions"],
```
2. `src/lib/dashboard/v2Titles.ts:37`
```ts
// old
   notebooks: { title: "notebooks", subtitle: "saved analysis sessions." },
// new
  notebooks: { title: "asherin.notebooks", subtitle: "cells of notes, code and questions for shepherd, kept on this device." },
```
3. `src/pages/Dashboard.tsx:1968-1972`
```ts
// old
          "Intelligence Notebooks",
// new
          "asherin.notebooks",
```
4. `src/components/dashboard/CommandPalette.tsx:71` — `label: "Notebooks"` → `label: "asherin.notebooks"`, keywords add `"cells"`.
5. `src/components/dashboard/connect/ConnectView.tsx:50` — `label: "Notebooks"` → `label: "notebooks"` (the graph's other organs are lowercase).

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sql / chart / data-source cells "ran" by writing a kernel-offline error envelope into `output` on this device; `CLIENT_TIMEOUT_MS`, `AbortController` and a connect trace framed a call that never happened | semantic, behavioral | cause | old `NotebooksView.tsx:200-266` | defect | component replacement | cell types are text / prompt / code / sql; nothing claims to run; sql says so in place (`NotebooksView.tsx:709`, `notebookStore.ts:18-20, 81-87`) | tests "maps the hosted build's cell types"; grep: no `functions.invoke`, no "kernel" |
| 2 | share dialog inserted a `notebook_shares` row with `user_id: null` and toasted "Shared with {email}" — nothing was shared with anyone | requirements, security | failure | old `:285-301` | defect | requirement reconciliation | removed; room makes no sharing claim | grep |
| 3 | schedule dialog wrote `notebooks.schedule` that nothing reads; "Shared analysis sessions with versioning and scheduling" | requirements, state | failure | old `:304-311, 374` | defect | requirement reconciliation | removed; header line names what the room does (`:775`) | grep |
| 4 | "Run All" set `status: "published"` and `last_run_at` after running nothing | semantic | failure | old `:267-281` | defect | component replacement | removed with the status badge | grep |
| 5 | source selector listed azplen tables and library csvs "bound by id · read-only · 500-row cap · 20s timeout" for a runner that is not here | semantic, interface | failure | old `:509-534` | defect | component replacement | removed | grep |
| 6 | "Version History" drew `Array.from({length: version})` dots — fabricated rows; real `notebook_versions` rows were only shown in a modal | data, interface | cause | old `:538-560` | defect | local correction | versions panel lists real rows, each with its summary, time and `restore` where a snapshot exists (`:589-628`) | test "creates, fills, versions, restores…" |
| 7 | version rows written on every "add cell" carried no snapshot, so "Revert" said "This version has no snapshot data" for most rows | state | cause | old `:181-186, 320-322` | defect | contract repair | versions are kept on request and always carry a snapshot (`notebookStore.ts:344-376`); rows without one are labelled "no snapshot" | same test |
| 8 | revert deleted cells without keeping the current state | state | failure | old `:325-351` | defect | state consolidation | `restoreVersion` saves the current cells as a version first (`:378-390`) | test asserts v3 "before restoring v2" |
| 9 | deleting a notebook left its cells and versions in IndexedDB (the shim has no cascade) | data | cause | old `:166-171`, `postgrest.ts:498` | defect | boundary repair | `deleteNotebook` removes cells, versions, then the row, and proves it (`:294-304`) | test asserts both tables empty |
| 10 | debounced cell writes were *cleared* on unmount — the last 800 ms of typing was lost | state | cause | old `:106-112` | defect | local correction | unmount and notebook switch flush pending writes (`NotebooksView.tsx:150-157, 187-199`) | tsc; logic read |
| 11 | `loading` never cleared when `user` was null; no error state for a failed read; `Loading notebooks…` | behavioral | failure | old `:95-99, 355` | defect | local correction | identity guard + `role=alert` with try again (`:119-134, 513-518`) | tsc |
| 12 | fixed `w-72` list + flex detail at 390 px squeezed the editor to a sliver | interface | failure | old `:367` | defect | structural | list → detail below `md` with a back button (`:511, 553, 559`) | class read; screenshot pending |
| 13 | list actions `opacity-0 group-hover:opacity-100` — unreachable on touch | interface | failure | old `:388` | defect | local correction | always visible, labelled (`:538-539`) | class read |
| 14 | delete notebook and delete cell on one click, no confirm | interface | failure | old `:389, 462` | defect | local correction | inline two-step confirms (`:541, 676`) | tsc |
| 15 | text cells never rendered markdown despite "markdown" label; `# Analysis Notes` default | semantic, interface | failure | old `:481` | defect | local correction | `ReactMarkdown` render, edit on double-click (`:696`) | tsc |
| 16 | capitalised copy throughout ("INTELLIGENCE NOTEBOOKS", "New Notebook", "Run All", "Share", "Schedule", "Version History", "Current version", "Notebook created", "Error") | interface, copy | failure | old file | defect | local correction | all room copy lowercase | grep of the file |
| 17 | `.insert(…).select().single()` errors from `notebook_cells`/`notebook_versions` writes were ignored | behavioral | failure | old `:138-141` | defect | contract repair | every store call returns `{data, error}` and the view shows each (`notebookStore.ts:69-72`) | tsc |
| 18 | no way to ask shepherd anything; the room spent nothing but `UsageSettings` counted it as a model room | requirements | failure | `UsageSettings.tsx:36` | defect | component replacement | prompt cells call `streamChat` with bounded context (`NotebooksView.tsx:358-436`) | prompt-context tests; model path needs a key |
| 19 | `updated_at` never set on insert; the shim only maintains it when the key exists, so list ordering by `updated_at` was by nulls | data | cause | `postgrest.ts:474-487`, old `:141` | defect | local correction | `createNotebook` sets it; `touch` bumps it on every cell write (`:216-244`) | test asserts `updated_at` truthy |
| 20 | window-level `confirm`/alerts: none, but errors surfaced as raw `error.message` in title-case toasts | interface | failure | old `:143` | defect | local correction | messages lowercased, named by action | tsc |
| 21 | export existed nowhere | requirements | failure | — | defect | local correction | markdown download (`:262-267`, `notebookStore.ts:171-189`) | export test |
| 22 | first draft of this narrative said the shim cascaded deletes | — | — | `postgrest.ts:498-510` | wrong claim | narrative corrected | — | shim read |
| 23 | first draft said "the room reads `user_id`"; it reads `owner_id` and the shim fills `user_id` separately | — | — | `notebookStore.ts:208` | wrong claim | narrative corrected | — | code read |
| 24 | screenshots at 1440×900 and 390×844 | verification | — | — | — | — | not taken: browsers owned by another process | pending |

## vision confirmation — 2026-10-26

screens: final3-d-notebooks.png and final3-m-notebooks.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: the list and the empty editor render; creating a notebook works end to end. open item: on desktop two empty states show at once (list and editor); they say different true things, so it stays.
