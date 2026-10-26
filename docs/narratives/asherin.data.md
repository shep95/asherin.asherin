```
room: asherin.data   view id: azplen   files: src/components/dashboard/data/AsherinDataView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

files under review: `src/components/dashboard/data/` — `AsherinDataView.tsx` (shell: workspace, tabs, shared load), `DataTab.tsx` (upload, staged review, sources, profile, dictionary, joins), `AskTab.tsx`, `VisualsTab.tsx`, `AlertsTab.tsx`, `ReportsTab.tsx`, `SettingsTab.tsx`, `ChartRender.tsx`, `room.ts`, `ui.ts`, `useVersionRows.ts`; `src/lib/data/` — `parse.ts` (readers), `validate.ts` (profiling, quality), `clean.ts`, `join.ts`, `charts.ts`, `theme.ts`, `analyze.ts` (deterministic arithmetic, alerts, reports), `ask.ts` (shepherd pipeline), `store.ts` (indexeddb), `live.ts` (public url pull), `download.ts`, `types.ts`; tests in `src/lib/data/__tests__/` and `src/__tests__/dataPlatform.test.ts`. `src/lib/data/parse.ts` and `validate.ts` are also consumed by the public tool at `/asherin.acatalepsy` (`src/lib/acatalepsy/parser.ts:3`, `engine.ts:2`); their exported contract (`parseDataFile`, `ACCEPTED_EXTENSIONS`, `MAX_UPLOAD_BYTES`, `ParsedFile`) is unchanged.

## purpose & promise

asherin.data takes a table or a document the operator already has — csv, tsv, xlsx, json, parquet, a sql dump, a pdf's text layer, a photo of text — reads it on this device, shows what it is (columns, types, completeness, duplicates, a quality score) before anything else happens, keeps it as a versioned source in this browser's storage, and then lets the operator ask shepherd about it in plain english. the interface promises four things, each kept in code: the file is read here (`DataTab.tsx:139` "reading on this device…"; `parse.ts` has no network call except the first-time ocr engine fetch, see integrations); the arithmetic behind an answer is computed here, not by the model (`ask.ts:144-146` → `analyze.ts:164` `runPlan`; the answer card says "computed on this device · sum of revenue by region (top 12) · 4,812 rows" `AskTab.tsx:154`); a chart is drawn from the stored rows and only when the data supports one (`charts.ts:316` `buildChart` returns null otherwise; `ChartRender.tsx:191` "no visual was drawn for this answer — the data did not support one."); reports and exports are files the operator downloads (`download.ts:10`). shepherd is the only model name on screen (`AskTab.tsx:16-20`, `:125`; `ReportsTab.tsx:82`). nothing in the room mentions accounts, plans, keys to generate, or a hosted kernel. evidence: observed.

## entry & navigation

- sidebar group `understand`, label `asherin.data`, codename `datasets`, blurb `datasets, analysis and charts`, keywords data / azplen / dataset / ontology / chart / table (`src/lib/navIntents.ts:136-143`). the keyword `ontology` has no feature behind it (shared-file patch 2). observed.
- view id `azplen` (`src/components/dashboard/types.ts:98`), lazy-loaded and rendered by `case "azplen"` → `gatedView("azplen", AsherinDataView, "Asherin Data")` (`src/pages/Dashboard.tsx:1955-1959`), which wraps the component in `ErrorBoundary` + `Suspense` (`Dashboard.tsx:1867-1875`). the capitalised fallback title only reaches the screen for a retired room, which this is not (shared-file patch 1). observed.
- v.2 shell title `asherin.data`, subtitle `datasets, analysis and charts.` (`src/lib/dashboard/v2Titles.ts:33`), rendered in the 56px header by `V2PageShell` (`Dashboard.tsx:2436`). the room no longer renders a second header of its own; its first row is the tab strip with the workspace selector at its right (`AsherinDataView.tsx:159-199`). observed.
- sidebar icon `Database` (`DashboardSidebar.tsx:109`); connect graph node id `azplen`, label `Azplen` (`ConnectView.tsx:47`, shared-file patch 3).
- what loads first: `opening asherin.data…` (`AsherinDataView.tsx:136-140`) while workspaces are read from the local table; the first visit creates `my workspace` (`:68`); the last-opened workspace is remembered per browser in localStorage under `azplen:last-workspace` (`:44`, `:71`, `:83`). then the data tab: the drop zone, the empty `your data` card, and — once a source is selected — the profile rail. observed.

## workflow

happy path (the one this review had to make real):
1. **drop a file** — the zone is a `role="button"` with enter/space (`DataTab.tsx:126-134`); drop or picker → `handleFile` (`:41-74`). anything over 100 mb is refused before a byte is read, with the size in the toast (`:42-44`). `parseDataFile` (`parse.ts:344`) routes on extension; the result is profiled (`validate.ts:201` `buildDatasetProfile`) and scored (`validate.ts:140` `buildQualityReport`) on the main thread, then shown as a **staged** card — not yet stored.
2. **see rows and profile** — the staged card (`DataTab.tsx:176-273`) shows the file name, `quality n/100`, rows · columns · % filled · duplicates · `read as csv`, the parser's warnings (row cap, skipped sheets, skipped json lines) and up to eight quality issues, cleaning chips (remove duplicates / empty rows, fill a measure's missing values with the median, drop out-of-range rows — each a pure op from `clean.ts:266` that re-profiles the staged rows, `DataTab.tsx:76-86`), and a 40-row × 14-column preview with the inferred type beside each header (`:229-248`); a document shows its first 4,000 characters (`:250-253`).
3. **keep** — `keep as a new source`, or `…or as a new version of <source>` + `keep as new version`, or `discard` (`:255-269`). `commit` (`:88-110`) → `store.ingest` (`store.ts:153`): source row created or touched, version row `n = max+1`, the rows written as one kv record `azplen/rows/<versionId>` (`:198`) *before* the version row is kept (a write failure deletes the version row and reports, `:199-202`), dictionary rows added for new columns with existing definitions kept (`:214-232`). the toast says `version n stored on this device`. the source is selected; the profile rail fills.
4. **ask** — ask tab (`AskTab.tsx`). the question runs against the selected source's latest version; its rows are read from the kv store (`useVersionRows.ts`) and the input stays disabled until they are (`:44` `ready`). `answerQuestion` (`ask.ts:121`) does three stages, each named on screen (`AskTab.tsx:16-20`): **planning** — shepherd is shown the grounding (`analyze.ts:219` `buildGrounding`: source, row count, quality, standing directions, every column with type / completeness / distinct / min / max / mean / median / date range / top values / the operator's definition, and 20 sample rows) and asked for one json plan: aggregate, measure, dimension, date column, grain, filter, limit (`ask.ts:22-30`, `:83-89`); the plan is validated against the real columns and a measure must be a profiled measure (`analyze.ts:125-154`); **computing** — `runPlan` (`analyze.ts:164-190`) filters, groups or buckets by period on this device; **narrating** — shepherd is shown the grounding plus the computed table and asked for json: finding, evidence lines, pattern, projection, clarification, chart axes (`ask.ts:32-41`, `:150-156`). the card shows the finding, the evidence lines, the computed table (open when ≤ 6 rows), the pattern, the chart (drawn by `buildChart` from the stored rows using shepherd's axes if they exist, else the plan's, `ask.ts:91-119`), what to watch, any clarification, confidence with its drivers, and `how this answer was reached` (`AskTab.tsx:141-200`). the question and finding go to the local log (`store.ts:288`) and appear under `recent questions`.
5. **draw a chart** — visuals tab (`VisualsTab.tsx`): source (tables only), intent, group-by, measure, a second measure for `relationship`, theme. `buildChart` runs over the stored rows (`:39-53`); when the choice has nothing behind it the card says which kind of column to pick (`:89-93`).
6. **export a report** — reports tab (`ReportsTab.tsx`): `overview` / `quality` / `trend` / `anomaly` built by `buildReportMarkdown` (`analyze.ts:311`) from the stored rows (`:40-67`); `add shepherd's commentary` appends three to five sentences from the model, or a sentence saying shepherd could not be reached (`:52-57`); the report is kept (`store.ts:352`) and `download .md` saves it (`:69`, `:107`). the data tab also has a per-source `download` that saves the latest version's rows as `.csv` (or a document as `.txt`) (`DataTab.tsx:304-315`).

secondary paths:
- **new version from the same source** — step 3's select; version numbers climb; the dictionary keeps edited definitions (`store.test.ts` "numbers a second version…").
- **delete a source** — two taps: trash arms `sure?` for 3.5 s, the second tap deletes (`DataTab.tsx:280-300`): kv rows, version rows, dictionary rows, alert rules and their events, then the source row (`store.ts:257-270`); warm row caches are forgotten (`:292`).
- **define a column** — dictionary rail, one input per column, saved on blur (`DataTab.tsx:412-447`); definitions ride into the grounding as `meaning: …` (`analyze.ts:227`).
- **connect two sources** — rail panel appears with ≥ 2 table sources; `suggestJoinKeys` over up to 5,000 rows each proposes keys with overlap and cardinality (`DataTab.tsx:450-491`, `join.ts:148`).
- **watch a number** — alerts tab (`AlertsTab.tsx`): threshold / change-between-versions / anomaly rules on a profiled measure (`:159-222`), evaluated by `evaluateRule` (`analyze.ts:253-285`) on tab open, once per distinct set of latest versions (`:73-78`), after a rule is created (`:94`), and on `check now` (`:126`); one event per rule per version (`store.ts:336-343`); pause / resume / remove.
- **live url** — settings tab (`SettingsTab.tsx:131-162`): a public https csv/tsv/json url is fetched by this browser (`live.ts:38`), parsed with the same readers, stored as a source with `connector: "url"` and `config.url`; `pull again` stores the next version; a failure is written to `last_sync_error` and shown on the source row (`DataTab.tsx:343`).
- **standing directions** — settings, saved on the workspace row, injected into every grounding (`SettingsTab.tsx:74-103`, `analyze.ts:222`).
- **theme** — settings or the visuals select; four presets with a wcag 3:1 check per series (`theme.ts:117`, `SettingsTab.tsx:123-128`).
- **retry** — every read-error card has `try again` (`AsherinDataView.tsx:143-151`, `:202-206`; `AskTab.tsx:135-138`).
- **stop** — a running question can be stopped; the abort reaches the model call (`AskTab.tsx:83`, `:108`; `ask.ts` passes `signal`).

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| workspaces | indexeddb table `data_workspaces` via the postgrest shim | `Workspace` (`store.ts:26-33`): id, owner_id (device id), name, instructions, theme `{id}`, created_at | until the local db is wiped (no delete control yet — open gaps) | no |
| sources | table `data_sources` | `DataSourceRow` (`types.ts:78-90`): id, workspace_id, name, kind, connector `"url" \| null`, config `{url?}`, last_sync_at, last_sync_error, status, created_at | until deleted | no |
| versions | table `data_versions` | `DataVersionRow` (`types.ts:92-110`): …, version, file_name, mime, byte_size, row_count, column_count, columns[], quality, profile, note, text (documents only), created_at | until the source is deleted | no |
| rows | indexeddb kv store, key `azplen/rows/<versionId>` (`store.ts:24`) | `DataRow[]`, ≤ 50,000 rows (`parse.ts:11`) | until the version's source is deleted | no |
| dictionary | table `data_dictionary` | `DictionaryRow` (`types.ts:112-120`) | with the source | definitions go into the grounding sent to the model provider |
| question log | table `data_queries` | `QueryLogRow` (`store.ts:35-43`): question, finding, confidence | with the workspace | no |
| alert rules / events | tables `data_alert_rules`, `data_alert_events` | `AlertRuleRow` (`store.ts:47-56`), `AlertEventRow` (`:58-67`) | with the source | no |
| reports | table `data_reports` | `ReportRow` (`store.ts:69-77`): name, template, markdown | until removed | the markdown goes to the model only when commentary is ticked |
| staged file | react (`DataTab.tsx:28-40`) | parsed rows, text, warnings, quality, profile, cleaning history | until kept or discarded | no |
| warm rows | module memory (`useVersionRows.ts:9-10`), three versions | `Map<versionId, DataRow[]>` | tab lifetime | no |
| last workspace | localStorage `azplen:last-workspace` | id | until cleared | no |
| ui | react: tab, naming state, stages, answer, errors, armed delete | mount | no |

the original file bytes are *not* kept (the hosted build uploaded them to a `data-uploads` bucket; the local edition keeps the parsed rows only — a smaller, readable, exportable store). every table write persists the whole table array to one indexeddb key (`src/lib/local/db.ts:115-122`), which is why rows live in the kv store as one record per version instead of one table row per data row. observed.

## logic

- **routing** (`parse.ts:344-370`): by extension. `.csv` / `.tsv` → papaparse streamed from the `File` in chunks with `header: true`, `skipEmptyLines: "greedy"`, aborting at `MAX_ROWS` (`:60-100`); `.txt` → the first 64 kb are sniffed (`sniffDelimited` `:103-116`: papaparse's delimiter guess, ≥ 2 fields, ≥ 80 % of the first 30 lines agree on the field count) and the file is read as a table or kept as a document (`:118-123`); `.xlsx` / `.xls` → sheetjs with `sheetRows: MAX_ROWS + 2`, first sheet, others reported (`:128-142`); `.json` / `.ndjson` → array, newline-delimited objects (bad lines counted), or the first array of objects inside an object (`:159-191`); `.parquet` → hyparquet (pure js, no wasm) reading `rowEnd = min(num_rows, MAX_ROWS)` (`:197-209`); `.pdf` → pdfjs text layer rebuilt into lines by baseline, ≤ 400 pages, ≤ 1,000,000 characters, password and not-a-pdf named (`:214-262`); `.png` / `.jpg` / `.jpeg` → tesseract english, progress forwarded (`:264-285`); `.sql` → `INSERT INTO … VALUES` tuples, quotes with `''` escapes, largest table wins (`:289-336`); `.md` → document. an empty file, a table with no rows, a document with no text, and an unknown extension each fail with one sentence (`:348`, `:362-369`).
- **coercion** (`parse.ts:25-34`): numbers kept, bigints and dates converted, nested objects stringified, `""` / `null` / `n/a` / `-` → null, strings trimmed. column names come from the first 500 rows (`:36-47`).
- **profiling** (`validate.ts:77-127`): per column the dominant pattern (currency, percent, number, boolean, date, text) with `typeDrift` = share not matching it; integer vs number; `id` by name + > 90 % distinct; `geo` by name; `category` when distinct ≤ max(20, 5 %); quantiles, mean, stddev, iqr outliers (≥ 8 numbers), top values, five samples. `buildDatasetProfile` (`:201`) splits measures / dimensions / dateColumns and detects domains by name and type (`:186`).
- **quality** (`validate.ts:140-179`): `0.45·completeness + 0.35·typeConsistency + 0.15·(100 − dupe%) + 0.05·(100 − 10·min(10, outlier%))`, issues per column by severity.
- **cleaning** (`clean.ts:266`): pure ops returning rows + a note; the staged card re-profiles after each.
- **plans** (`analyze.ts:125-154`): unknown columns dropped, a measure must be in `profile.measures`, the dimension cannot equal the date column, grain defaults to month when a date column is set, filter needs a real column / known op / string-or-number value, limit clamped to 40; an empty plan is null. `runPlan` (`:164-190`): date → `byPeriod` (last 40 periods), dimension → `groupBy` sorted desc (top `limit`), measure alone → one stats row, nothing → the filtered row count. sums rounded to 2 dp, averages to 4.
- **grounding** (`analyze.ts:192-245`): up to 60 columns described, 24 columns × 20 sample rows (cells cut at 60 chars), document text cut at 12,000 chars; the computed table is prefixed `computed on this device — <plan> — from n rows`.
- **confidence** (`ask.ts:73-81`): graded here, not by the model — completeness ≥ 90 → 2 (≥ 70 → 1), rows ≥ 200 → 2 (≥ 30 → 1), a computation ran → 2, a clarification → −1; ≥ 5 high, ≥ 3 moderate, else low; an unstructured reply is always low.
- **chart choice** (`charts.ts:243` `renderForIntent`, `:316` `buildChart`): distribution → histogram (≥ 5 numbers), relationship → scatter (two measures, ≥ 3 points, ≤ 2,000), summary → kpi, date + measure → line/area, dimension + measure → bar / pie (≤ 8) / treemap, dimension alone → counts; continuous axes are sorted before render (`ChartRender.tsx:46-59`).
- **alerts** (`analyze.ts:253-285`): threshold compares sum or avg of the metric with `>`/`<`; change needs the previous version and fires on `±threshold %`; anomaly flags values beyond `sigma` (3) standard deviations when ≥ 8 numbers and sd > 0.
- **reports** (`analyze.ts:311-416`): markdown tables of quality issues, columns, measure stats, top groups, periods (grain chosen from the date span: > 800 days year, > 70 month, else day), out-of-range values, change since the previous version; the footer states that nothing was estimated by a model.
- **live urls** (`live.ts:12-23`): https only (http for localhost), credentials in the url refused; the file name for routing comes from the path or the content type (`:25-36`).

## integrations & network

no server of asherin's. every row read and write resolves in `src/lib/local/postgrest.ts` and `src/lib/local/db.ts`. `supabase.functions.invoke` is not called anywhere in this room any more, so "kernel offline" cannot appear here (verified by grep over `src/lib/data` and `src/components/dashboard/data`).

off-device calls, each made by this browser and each stated on screen:
- **the model provider** — `askModel` (`src/lib/ai.ts:332`) → `completeLlm` (`src/lib/local/llm.ts:363`) with the provider, model and key the operator saved in settings → ai keys (`resolveActiveModel` `ai.ts:59`). two calls per question on a table (plan ≤ 400 tokens, narration ≤ 900), one on a document, one per report commentary (≤ 400). payload: the grounding (column names, statistics, 20 sample rows, definitions, standing directions, or 12,000 characters of a document) and the computed table. abort: the ask tab's `AbortController` (`AskTab.tsx:49-51`, `:83`). retry: `completeLlm` retries rate-limit / busy up to three times; the card offers `try again`. no key: `resolveActiveModel` raises the byok dialog and throws `connect a model key in settings → ai keys…`, which the card shows as its error line (`AskTab.tsx:135`). offline: the provider call fails with the llm layer's message in the same line. the key never passes through this room's code.
- **a live url** — `fetch(url, { credentials: "omit", cache: "no-store" })` with a 30 s abort (`live.ts:42-47`), 100 mb cap by header and by body (`:61-64`). offline → "this device is offline…" (`:53`); cors / dns / refused → "the browser could not read that url — it must be public and allow cross-origin reads…" (`:54`); non-2xx → the status (`:60`).
- **the pdf worker** — own origin, an asset of this build (`parse.ts:217-219`).
- **the ocr engine** — tesseract's worker script is an asset of this build; its wasm core and english model come from `cdn.jsdelivr.net` the first time an image is read in a tab (tesseract's defaults, allowed by the csp in `index.html:20`), then cached by tesseract in indexeddb. cold cache offline → "the text reader could not load — it needs one network fetch the first time…" (`parse.ts:274`).

no analytics, no connect trace (the connect graph's `azplen` node is not lit by this room — open gaps).

## security & privacy

- **threat: a hostile file.** parsed by papaparse / sheetjs / hyparquet / pdfjs (in its worker) / tesseract (in its worker); values are react text nodes everywhere (`DataTab.tsx:242`, `AskTab.tsx:160`, `ChartRender.tsx:37`); nothing is set as html; the sql reader is a tokenizer, not an executor (`parse.ts:289`). a crafted header can only become a column name on screen and in a prompt.
- **threat: prompt injection through data.** cell values and column names reach the model inside the grounding. the system prompts tell shepherd the grounding is data and to answer as json (`ask.ts:22-41`); the reply is parsed with `extractJson` and every field is type-checked and length-capped (`ask.ts:63`, `:157-170`); the chart axes and plan columns are checked against the real profile (`analyze.ts:125`, `ask.ts:98-101`). a reply that tries to be something else is shown as plain text with confidence low — it cannot trigger an action, because the room has no model-driven actions.
- **key handling.** the provider key is read by `src/lib/ai.ts` from the key vault and never enters this room's modules; no key is generated, stored or displayed here (the hosted-era "push api key" panel is gone).
- **storage at rest.** rows, text, definitions, directions, questions and findings sit unencrypted in this origin's indexeddb, the same place the file itself sits. the settings tab says so in one paragraph (`SettingsTab.tsx:166-169`).
- **what leaves.** only on an explicit action: ask (grounding + computed table), report commentary (the report), live pull (a GET to the operator's own url with no credentials). the ask tab states the payload under the input (`AskTab.tsx:125`).
- **exports.** downloads are operator actions on operator data; file names are reduced to `[\w.-]`, 60 chars (`download.ts:5-8`).
- **bounded work.** 100 mb, 50,000 rows, 400 pdf pages, 1,000,000 document characters, 30 s url timeout, 40 computed rows, 20 sample rows, 12,000 document characters in a prompt.

## failure modes

| failure | operator sees | where |
| --- | --- | --- |
| workspaces table unreadable | error card with the store's sentence and `try again`, no spinner | `AsherinDataView.tsx:143-151` |
| sources or versions unreadable | red line above the tabs' body with `try again` | `AsherinDataView.tsx:202-206` |
| file over 100 mb | toast `file too large` with size and limit; nothing read | `DataTab.tsx:42-44`, `parse.ts:345-347` |
| unknown extension / empty file / no rows / no text / invalid json / no insert statements / not a pdf / password pdf / workbook without sheets / parquet not understood | toast `file not read` with the exact sentence | `parse.ts:161`, `:200-203`, `:227-228`, `:362-369`; `DataTab.tsx:69` |
| file past the row cap | staged warning naming the cap; the first 50,000 rows are kept | `parse.ts:22`, `:89`, `:136`, `:181` |
| scanned pdf | warning pointing to asherin.extract, document still kept | `parse.ts:259` |
| ocr engine cold and offline | toast with "needs one network fetch the first time" | `parse.ts:274` |
| rows could not be written to indexeddb | version row removed again, toast `not stored` with the reason | `store.ts:199-202` |
| version row points at missing rows | ask / visuals / export say "the rows for this version are not on this device any more — upload the file again" | `store.ts:242`, `AskTab.tsx:123`, `VisualsTab.tsx:88` |
| no model key | ask card: `connect a model key in settings → ai keys…` + `try again`; the byok dialog opens | `AskTab.tsx:135-138`, `ai.ts:71` |
| provider unreachable / rate limited | the llm layer's sentence on the card after its retries | `AskTab.tsx:135` |
| plan call fails | absorbed; the narration still runs from the profile and sample rows (`reasoning.plan` says so) | `ask.ts:136-142` |
| plan names columns that do not exist | dropped; no computation; shepherd's clarification shown | `analyze.ts:125-154`, `ask.test.ts` "ignores a plan…" |
| reply is not json | shown as written; confidence low; clarification "shepherd's reply was not structured" | `ask.ts:159-165` |
| chart axes do not exist | no chart; the finding stands | `ask.ts:98-117`, `ask.test.ts` "drops a chart…" |
| question stopped | card cleared; nothing logged | `AskTab.tsx:83` |
| visual with nothing behind it | card naming what kind of column to pick | `VisualsTab.tsx:89-93` |
| alert rule's source has no table / rows unreadable | listed under the check as skipped, with the reason | `AlertsTab.tsx:48`, `:62`, `:135-136` |
| url invalid / not https / has credentials | inline sentence under the field before any fetch | `live.ts:12-23`, `SettingsTab.tsx:143` |
| url offline / cors / 4xx / too big / not a table / timeout | inline sentence; for a known source also `last pull failed: …` on its row | `live.ts:48-69`, `SettingsTab.tsx:66`, `DataTab.tsx:343` |
| shepherd unreachable for a commentary | the report is still written and says it carries no commentary | `ReportsTab.tsx:52-57` |
| dictionary unreadable | one red line in the rail | `DataTab.tsx:419`, `:423` |
| another tab stores or removes a version | this tab's lists follow the table change | `AsherinDataView.tsx:103-107` |

no path renders a raw stack; the `ErrorBoundary` around the lazy view (`Dashboard.tsx:1870`) is the last net. the only spinners are tied to a stage that ends: reading a file, storing, the three ask stages, a pull, a check, a report.

## interface & accessibility

- **desktop (1440×900):** tab strip with six tabs and the workspace selector at the right (`AsherinDataView.tsx:159-199`); data tab in two columns, the right rail 320px (`DataTab.tsx:122`); ask tab a 768px column (`AskTab.tsx:87`); alerts and settings two columns (`AlertsTab.tsx:82`, `SettingsTab.tsx:72`). one focal point per screen: the drop zone until a file is staged, then the staged card; on ask, the input, then the finding at 15px above 12px evidence.
- **phone (390×844):** the tab strip scrolls horizontally (`overflow-x-auto`, `shrink-0` tabs); every grid collapses to one column (`lg:` / `sm:` prefixes); source rows wrap their name onto its own line above the actions (`DataTab.tsx:340` `basis-full sm:basis-auto`); the live-url row does the same (`SettingsTab.tsx:148`); kpi tiles stack (`ChartRender.tsx:75` `sm:grid-cols-3`); the preview table and computed table scroll inside their own frames (`overflow-auto`); the bar chart tilts labels at > 8 categories (`ChartRender.tsx:172`). paddings step down to 16px (`px-4 sm:px-6`). the workspace controls share the strip and scroll with it on a narrow screen — acceptable, noted under open gaps.
- **keyboard:** the drop zone is a button with enter/space (`DataTab.tsx:126-131`); source rows are `role="button"` with `aria-pressed` and enter/space (`:331-337`); every icon button has an `aria-label` (`:354`, `:363`; `ReportsTab.tsx:107`, `:110`; `AskTab.tsx:116`); every select has a label; tabs carry `role="tab"` / `aria-selected`; errors are `role="alert"`, stages `role="status"`; the new-workspace input takes enter / escape (`AsherinDataView.tsx:184`).
- **motion:** `animate-spin` loaders and a width transition on the ocr bar; charts render without animation (`isAnimationActive={false}` throughout `ChartRender.tsx`). nothing decorates.
- **contrast:** copy on the room's dark glass follows the house scale (11–12px `text-white/60–85`, 10–11px `text-white/35–45` for secondary); theme series are checked against their surface at 3:1 and failures are listed, not hidden (`SettingsTab.tsx:123-128`).
- **colour carries meaning only:** quality score tones (`ui.ts:9-13`), amber warnings, rose errors, chart series from the theme tokens.
- **lowercase:** every string the room renders is lowercase except names the operator typed and column names from the data; the eyebrows and kpi labels no longer use css `uppercase` (`ui.ts:7`, `ChartRender.tsx:78`).
- **empty states:** `nothing here yet. drop a file above, or add a public csv/json url under settings.`, `add data first — there is nothing to answer from.`, `add a table first — a document has no rows to draw.`, `nothing has fired yet. a rule fires once per stored version.`, `no reports yet.`
- **no dark patterns:** delete is two taps with a visible `sure?`, nothing is pre-ticked except the empty commentary box, nothing nags.

## relationships

| edge | to | real in code? |
| --- | --- | --- |
| depends_on | `src/lib/local/postgrest.ts`, `src/lib/local/db.ts` (kv), `src/lib/ai.ts` (`askModel`), `src/lib/local/llm.ts` (`extractJson`) | yes (`store.ts:7-8`, `ask.ts:14-15`) |
| calls | the operator's model provider (two calls per question), the operator's live url | yes |
| owns_state | tables `data_*`, kv `azplen/rows/*`, localStorage `azplen:last-workspace` | yes |
| reads_from | the key vault — only through `ai.ts`; never directly | yes |
| writes_to | downloads (`.csv`, `.txt`, `.md`) on the operator's disk | yes |
| trusts | the model's json only after validation against the profile; the url's bytes only through the same parsers as a file | yes |
| shares code with | `/asherin.acatalepsy` (`parse.ts`, `validate.ts`, `types.ts`) — the public deterministic tool reads the same formats with the same caps | yes (`src/lib/acatalepsy/parser.ts:3`) |
| verified_by | `src/lib/data/__tests__/*`, `src/__tests__/dataPlatform.test.ts`, `src/__tests__/acatalepsy.test.ts` | yes |
| not connected | chat, the library, projects, the connect graph (`azplen` node exists but is never lit) | stated, not claimed |

## performance

- mount: one table read for workspaces, then sources + versions in parallel (`AsherinDataView.tsx:90-92`); the store's in-memory table cache serves repeats.
- parsing is on the main thread but bounded: csv streams in papaparse's 10 mb file chunks and yields between them, aborting at 50,000 rows (`parse.ts:60-100`); xlsx materialises at most 50,002 rows per sheet (`:132`); parquet reads at most 50,000 rows (`:206`); json is parsed whole (native, fast) then cut; pdf stops at 400 pages / 1m characters. a 100 mb csv is read to the cap and then stops; a 100 mb xlsx still has to be unzipped whole by sheetjs — the honest worst case (open gaps).
- profiling (`validate.ts:77`) is O(rows × columns) with one sort per numeric column; on 50,000 × 30 it is sub-second on a laptop, a few seconds on a phone (inferred, not measured — see tests & proof).
- rows are one kv read per version (`store.ts:241`), warm for the last three versions (`useVersionRows.ts:10`); charts aggregate over the full stored rows in memory (`VisualsTab.tsx:41`), scatter capped at 2,000 points (`charts.ts:337`), bars at 40 categories (`:358`).
- subscriptions: two `onTableChange` listeners removed on unmount (`AsherinDataView.tsx:103-107`); the delete-arm timer is cleared on unmount (`DataTab.tsx:279`); the ask abort controller is aborted on unmount (`AskTab.tsx:42`); the url pull's is too (`SettingsTab.tsx:21`).
- dynamic imports keep papaparse, sheetjs, hyparquet, pdfjs and tesseract out of the room's chunk until a file of that kind arrives (`parse.ts:63`, `:128`, `:198`, `:215`, `:265`).
- the tesseract worker is created per image and terminated after (`parse.ts:283`); the pdf task is destroyed after each file (`:254`).

## copy & voice

all on-screen copy is lowercase except file, source, workspace and column names the operator supplied. the model is `shepherd` everywhere it is named (`AskTab.tsx:16-20`, `:125`, `:198`; `ReportsTab.tsx:82`, `:56`; `DataTab.tsx:427`). no `kernel offline`, no `sign in`, no account, plan, tier or "available on" language in the room's files (grep, review log #28). toasts are two-part and lowercase: `file not read` / `not stored` / `version 2 stored on this device` / `watching` / `rule not saved` / `report not written` / `not removed` / `directions saved` / `theme not saved`. no native `prompt()` / `confirm()` / `alert()` remains (grep). the one capitalised string reachable from this room is the shell's own `ACTIVE` status chip, which belongs to `V2PageShell`, not to the room.

## tests & proof

unit (`npx vitest run src/lib/data`, 41 tests, plus `src/__tests__/dataPlatform.test.ts` 17 and `src/__tests__/acatalepsy.test.ts` 4 for the shared profiler and parser):
- `__tests__/parse.test.ts` (12) — csv header / trim / null, tsv, **a 50,025-row csv stops at the cap with the warning**, prose `.txt` → document and delimited `.txt` → table, delimiter sniffing, json array / ndjson with a bad line / object-with-array, invalid json sentence, **a real xlsx written by sheetjs** with a skipped second sheet, sql dump with `''` escapes and the largest-table rule, markdown as document, refusals (unknown extension, empty, header-only, over-limit without reading), the accepted-extension list.
- `__tests__/analyze.test.ts` (15) — stats, group-by, month buckets, numeric vs textual filters, plan validation (unknown columns dropped, text column refused as a measure, limit clamp, null plan), plan description, grouped / time / bare-measure plans, grounding contents, threshold / change / anomaly rules, overview / trend-without-date / anomaly-with-previous reports.
- `__tests__/store.test.ts` (6, fake-indexeddb) — workspace defaults, ingest → kv record + version + source + dictionary, second version keeps definitions, document text on the version row with no kv record, **delete cascades** rows / versions / dictionary / rules / events, query log order and reports.
- `__tests__/ask.test.ts` (8, `askModel` mocked) — plan → compute → narrate with stages, chart drawn from real rows with shepherd's title, the narration prompt carries the computed table, a plan with ghost columns is ignored, an unstructured reply is shown as written at low confidence, a chart with ghost axes is dropped, a model refusal surfaces (plan absorbed, narration raised), a document is answered in one call, confidence grading, report commentary null on failure.

not proven by unit tests, by design or by environment: the parquet reader (no fixture writer in the repo — hyparquet cannot write; the call shape is typed against hyparquet 1.31 and `rowEnd` / `num_rows` exist in its `types.d.ts`), pdfjs in a browser (the extract room proves the same import path), tesseract in a browser, recharts drawing, the live fetch against a real cors endpoint, the time a 50,000 × 30 profile takes on a phone. those are the end-to-end step: drop `sales.csv` → staged card shows quality and rows → `keep as a new source` → ask "which region leads on revenue?" → three stages → finding + evidence + computed table + bar chart → visuals: trend by month → reports: overview → `download .md`. screenshots at 1440×900 and 390×844 are pending; this pass was not allowed to start the dev server or playwright.

## open gaps

- **no screenshots yet.** desktop ☐ phone ☐ until the browsers are available.
- **parsing runs on the main thread.** csv, parquet and xlsx are bounded by row caps, but a 100 mb xlsx is still inflated whole by sheetjs before the cap applies; json is parsed whole. a worker would remove the stall; the caps remove the runaway.
- **one table at a time.** a workbook's other sheets and a dump's other tables are reported and skipped; load them by uploading again.
- **ocr needs one off-device fetch per tab** (cdn.jsdelivr.net) for the engine and english model; english only. same gap as asherin.extract.
- **a live url is pulled only on a tap.** there is no timer; the settings copy says so. a browser cannot poll while the room is closed.
- **alerts run only while the alerts tab is open** or when a rule is created; the tab says so. nothing watches in the background.
- **the connect graph's `azplen` node is never lit** — no `emitPull` trace from this room (chosen: a question's text is operator data; a masked trace could be added as the extract room does).
- **no workspace rename or delete**; the first workspace is created automatically and others can be added.
- **no join execution** — `joinSources` exists (`join.ts:190`) but the rail only proposes keys; a joined source is not stored yet.
- **the workspace selector shares the scrolling tab strip on a phone**, so it may sit off-screen to the right until the strip is scrolled.
- **parquet is not unit-tested** (no writer available in the repo).

## shared-file patches (not applied — outside the room)

1. `src/pages/Dashboard.tsx:1955-1959` — retired-room fallback title is capitalised (unreachable in this edition, but wrong).
   old:
   ```
      case "azplen":
        return gatedView(
          "azplen",
          AsherinDataView,
          "Asherin Data",
        );
   ```
   new:
   ```
      case "azplen":
        return gatedView(
          "azplen",
          AsherinDataView,
          "asherin.data",
        );
   ```
2. `src/lib/navIntents.ts:141` — `ontology` is a keyword with no feature behind it; `csv`, `spreadsheet` and `ask` are what operators type.
   old: `    keywords: ["data", "azplen", "dataset", "ontology", "chart", "table"],`
   new: `    keywords: ["data", "azplen", "dataset", "csv", "spreadsheet", "chart", "table", "ask"],`
3. `src/components/dashboard/connect/ConnectView.tsx:47` — capitalised organ label.
   old: `  { id: "azplen", label: "Azplen", x: 27, y: 78 },`
   new: `  { id: "azplen", label: "asherin.data", x: 27, y: 78 },`

## machine narrative

```
actor: operator (device identity, always present)
action: keep_source
inputs: file (≤ 100 mb, accepted extension) | public https url
preconditions: file parses to ≥ 1 row or ≥ 1 character; workspace exists
effects: version row n = max+1; kv azplen/rows/<versionId> = rows (tables); dictionary rows for new columns; source.status = ready
failure: refuse_over_limit (before read) · refuse_unknown_format · refuse_empty · rows_not_stored (version row removed again)
invariant: a version row never exists without its rows record, except a document (text on the row)

action: ask
inputs: question (3–1000 chars), selected source's latest version, saved model key
preconditions: rows readable from kv (tables); profile present
effects: ≤ 2 provider calls; computed table from runPlan on device; answer card; data_queries row
failure: no_key (byok dialog + card line) · provider_error (card line + try again) · unstructured_reply (shown as written, confidence low) · plan_invalid (dropped, narration still runs)
invariant: every number in a computed table comes from analyze.ts over the stored rows; chart axes exist in the profile or no chart is drawn

action: evaluate_alerts
inputs: active rules, each source's latest (and previous) version rows
preconditions: alerts tab open, or a rule just created
effects: ≤ 1 data_alert_events row per rule per version
failure: source_without_table (skipped, listed) · rows_unreadable (skipped, listed)
invariant: checking twice never fires twice

action: write_report
inputs: template, latest version rows (+ previous for anomaly), optional commentary flag
effects: data_reports row with markdown computed on device; optional 1 provider call appended or a sentence saying it failed
invariant: the report is complete and downloadable whether or not shepherd answered
```

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ingest`, `ask`, `runAlerts`, `generateReport`, `pullConnector` all called `supabase.functions.invoke`, which the local shim answers with "kernel offline" — a parsed file could never be kept, so ask / visuals / alerts / reports were empty forever | requirements | repair | observed (`api.ts:21-35`, `functions.ts:59-61`) | defect | component replacement | `store.ts` (indexeddb), `analyze.ts` + `ask.ts` (on-device pipeline), `api.ts` removed | `store.test.ts`, `ask.test.ts` |
| 2 | the view fetched a connector list with `functions.invoke("asherin-data-sync")` and offered google-sheets etc. with a secret field "sent for this pull only" — nothing could be sent anywhere | interface | repair | observed (old view `:169-178`, `:913-978`) | defect | requirement reconciliation | replaced by a browser-side public-url pull (`live.ts`, `SettingsTab.tsx:131-162`) | code; `live.ts` validation |
| 3 | "push api — generate a key" wrote a sha-256 digest to the workspace row and copied a secret to the clipboard while the panel admitted "nothing listens for it yet" | security | repair | observed (old view `:980-1013`) | defect | component replacement | panel removed; no key is generated in the room | grep `api_key` → none |
| 4 | `createWorkspace` threw "sign in first" and the api header spoke of "the user's session" | semantic | failure | observed (`api.ts:48`) | defect | local correction | `store.ts:91-100` uses the device identity, never refuses | `store.test.ts` |
| 5 | rows were meant for a `data_records` table where every insert rewrites the whole table array (`db.ts:115-122`) — 50,000 rows × n writes | performance | cause | inferred (schema + shim) | defect | architectural migration | rows as one kv record per version (`store.ts:24`, `:198`) | `store.test.ts` kv round trip |
| 6 | `parseCsv` read the whole file with `file.text()` and parsed it synchronously; a 100 mb csv froze the tab before the 50,000-row cap applied | performance | cause | observed (old `parse.ts:218-232`) | defect | local correction | chunked papaparse with `parser.abort()` at the cap (`parse.ts:60-100`) | `parse.test.ts` "stops a big csv…" |
| 7 | xlsx and parquet were read in full and sliced afterwards | performance | cause | observed | defect | local correction | `sheetRows` (`parse.ts:132`), `rowEnd` (`:206`) | code; `parse.test.ts` xlsx |
| 8 | `.txt` was always parsed as csv; a prose file became a one-column table or "no rows were found" | behavioral | failure | observed (old `parse.ts:397`) | defect | local correction | `sniffDelimited` + document fallback (`parse.ts:103-123`) | `parse.test.ts` "keeps a prose .txt…" |
| 9 | ndjson detection required a leading `{` and *any* newline, so a pretty-printed single object was split by line and every line "skipped" | behavioral | cause | observed (old `parse.ts:257`) | defect | local correction | `/\}\s*\n\s*\{/` test (`parse.ts:174`) | `parse.test.ts` json cases |
| 10 | pdf read every page with no cap; a 5,000-page pdf ran unbounded; a password pdf surfaced pdfjs's raw message | execution | failure | observed | defect | local correction | 400 pages / 1m chars, named password / not-a-pdf errors (`parse.ts:214-262`) | code |
| 11 | `uploadOriginal` stored the original bytes from `fileInput.files[0]`, which is empty for a dropped file, so storage depended on how the file arrived; nothing ever read the bytes back | data | cause | observed (old view `:226-229`) | defect | component replacement | originals are not kept; parsed rows are the store | narrative states it |
| 12 | alert rules were inserted without `active`, so a new rule read as paused and the first "pause" tap activated it | state | cause | observed (old view `:740-747`, `:759`) | defect | local correction | `active: true` on insert (`store.ts:313`) | `store.test.ts` "deleting a source…" asserts `active === true` |
| 13 | alert rules could be created but never evaluated (kernel offline) | requirements | repair | observed | defect | component replacement | `evaluateRule` on device, run on tab open / rule create / version change / check now (`analyze.ts:253`, `AlertsTab.tsx:38-78`) | `analyze.test.ts` alerts |
| 14 | the same rule would fire again on every check | state | failure | hypothesized from the server contract | defect | contract repair | one event per rule per version (`store.ts:336-343`) | `store.test.ts` |
| 15 | reports were requested from a server function; none could be written or downloaded | requirements | repair | observed | defect | component replacement | `buildReportMarkdown` + `download .md` (`analyze.ts:311`, `ReportsTab.tsx:69`) | `analyze.test.ts` reports |
| 16 | the dictionary rail never appeared because dictionary rows were created server-side | data | cause | observed | defect | contract repair | `syncDictionary` on ingest, definitions kept across versions (`store.ts:214-232`) | `store.test.ts` |
| 17 | native `prompt()` for workspace names and `confirm()` for delete — browser chrome, capitalised, blocked in some webviews | interface | failure | observed (old view `:329`, `:516`) | defect | local correction | inline name field (`AsherinDataView.tsx:176-189`), two-tap delete with `sure?` (`DataTab.tsx:280-300`) | grep → none |
| 18 | the room rendered its own `asherin.data` header under the v.2 shell's `asherin.data` header | interface | failure | observed (old view `:312-340` + `Dashboard.tsx:2436`) | defect | boundary repair | header removed; workspace controls join the tab strip | code |
| 19 | the delete control was a `<span role="button">` nested inside a `<button>` — invalid nesting, double activation | interface | cause | observed (old view `:494-525`) | defect | local correction | row is a `div role="button"`, controls are real buttons (`DataTab.tsx:329-369`) | code |
| 20 | the sources effect depended on `workspaces`, so saving directions re-fetched sources and reset the theme from a stale row | state | cause | observed (old view `:130-145`) | defect | state consolidation | `refresh` keyed on `workspaceId`; `patchWorkspace` updates the row in state (`AsherinDataView.tsx:86-120`) | code |
| 21 | `refreshSources` read versions one source at a time and only for the first 25 | performance | failure | observed (old view `:104-106`) | defect | local correction | `listWorkspaceVersions` in one read (`store.ts:121`) | code |
| 22 | kpi tiles were `grid-cols-3` at 390px — three 2xl numbers in ~110px each | interface | failure | observed (`ChartRender.tsx` old `:75`) | defect | local correction | `sm:grid-cols-3` | code |
| 23 | `layout={n > 12 ? "horizontal" : "horizontal"}` dead ternary | semantic | failure | observed | defect | local correction | removed | code |
| 24 | eyebrows and kpi labels used css `uppercase` where the doctrine wants lowercase | interface | failure | observed | defect | local correction | `ui.ts:7`, `ChartRender.tsx:78` | grep `uppercase` → none |
| 25 | confidence and "confidence drivers" were whatever the server returned; the model effectively graded itself | semantic | cause | observed (types) | defect | contract repair | graded on device from completeness, rows, computation, reply shape (`ask.ts:73-81`) | `ask.test.ts` grading |
| 26 | a chart requested by the model was drawn whenever its fields matched, with no record of the arithmetic behind the answer | requirements | failure | observed | defect | contract repair | plan → compute → narrate; the computed table is shown on the card (`AskTab.tsx:152-168`) | `ask.test.ts` first case |
| 27 | errors in the ask tab were toasts over an empty card; a missing model key was a toast | interface | failure | observed (old view `:288`) | defect | local correction | inline `role="alert"` card with `try again` (`AskTab.tsx:135-138`) | code |
| 28 | empty state promised "connect a live source" when none could be connected | semantic | failure | observed (old view `:488`) | wrong claim → defect | requirement reconciliation | copy now points at the file and the public-url panel that exists (`DataTab.tsx:321`) | code |
| 29 | the drop zone listed `.parquet` — correct: hyparquet 1.31 (pure js) is installed; v1 of this narrative doubted it | — | — | observed (`package.json`, `node_modules/hyparquet/src/index.js`) | wrong claim (narrative) | — | narrative corrected; reader bounded with `rowEnd` | types.d.ts |
| 30 | the header comment claimed arithmetic was "computed deterministically on the server" | semantic | failure | observed (old view `:9-10`) | wrong claim | — | comment and narrative say "on this device" and point at `analyze.ts` | code |
| 31 | fallback title "Asherin Data", connect label "Azplen", nav keyword "ontology" | semantic | failure | observed | defect (shared files) | local correction | shared-file patches 1–3 | — |
| 32 | no unit tests for parsing, the store or the ask pipeline | verification | repair | observed | defect | — | 41 tests in `src/lib/data/__tests__/` | `npx vitest run` 800/800 |

## vision confirmation — 2026-10-26

screens: final3-d-azplen.png and final3-m-azplen.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: dropzone with the accepted formats and limits, and the empty "your data" card render; the tab strip scrolls sideways on phone without page overflow.
