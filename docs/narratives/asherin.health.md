```
room: asherin.health   view id: asherin-health   files: src/components/dashboard/health/AsherinHealthView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

version 1 was written against the code as found; its hostile read produced the defects in the
review log at the end, every one of which is now fixed in the room's own files. this is the
replaced narrative, written against the corrected code. every claim names a file and a line and
carries an evidence status (observed · inferred · hypothesized · contradicted · unknown ·
verified). the screenshot pass (method step 5) did not run this round because the browser and
dev server are owned by another process; the status block says so. the person's own screenshots
from today (desktop and 390×844) and the earlier end-to-end run that proved the labs read-out and
reload persistence are cited as evidence where used.

## purpose & promise

asherin.health is a personal health record held in this browser, read back to the person as
anatomy: every value, medicine, gene, exposure, surgery, family condition, symptom, pain report,
herb and live-sensor reading becomes a `Finding` that names the body territories it implicates,
the mechanism, and a next step (`src/lib/health/model.ts:23-40` — observed). the room explains and
orients; it does not diagnose, and the type has no field a diagnosis could be stored in
(`model.ts:27`, `photoRead.ts:10-16` — observed). shepherd sits in the room: every record change
raises a question written from real record content, and the person can ask anything about their
own record (`AsherinHealthView.tsx:297-325` — observed).

the promise the interface makes: "N entries · held on this device only" (`:455`), "nothing here
is uploaded by this room; what you ask shepherd goes to the model provider you connected, and
nowhere else" (`:853-855`), "this room explains and orients — it does not diagnose, and it does
not replace a clinician" (`:1122`). in the local edition the room keeps that promise: the record
lives in `localStorage` (`src/lib/health/store.ts:115-153`), and the only outbound calls are the
model calls the person triggers, made directly from this tab with the key in the device vault
(`src/lib/health/shepherd.ts:74-106` — observed). the 3d atlas of the earlier edition was removed
(`git log 63b262f`); territories are now named in a "looking at" panel instead of painted
(`:412-441`), and the copy no longer mentions a mesh or a drawn body (review log 6).

## entry & navigation

- sidebar / command palette intent: `src/lib/navIntents.ts:152-159` — view `asherin-health`,
  label `asherin.health`, group "understand", lowercase blurb (observed).
- deep-link aliases `health` and `asherin.health` → `asherin-health` (`src/pages/Dashboard.tsx:209-210`
  — observed).
- wired at `Dashboard.tsx:1919-1923` via `gatedView("asherin-health", AsherinHealthView,
  "asherin.health")`; framed room (`:194`); lazy (`:65`). the `userId` prop is never passed by the
  dashboard, so the storage scope is the unscoped key `asherin.health.record` (`store.ts:115-118`
  — observed; the device identity from `useAuth()` is not used here, which is correct because the
  record belongs to the browser profile, not to an account).
- v.2 shell title: `src/lib/dashboard/v2Titles.ts:28` — "asherin.health" / "your own anatomy,
  read from your own record.", `canvas: true` so the room owns its scroll (observed; the view's
  `ScrollArea` at `:495` is that scroll).
- first paint: the "record" panel (`:144`), with the rail of twelve layers on the left. on
  screens ≥ 1280 px the right column holds shepherd and "looking at" (`:597-603`); below that the
  same two live behind the rail's "shepherd" entry (`:483`, `:501-506`), which is hidden at `xl:`
  (`narrowOnly`).

## workflow

happy path — **record a value → read-out** (machine narrative below):

1. "record" panel → paste bloodwork lines → "read these values" (`:619-633`). `parseLabText`
   matches each line against the analyte aliases (`src/lib/health/labs.ts:346-375`), an undated
   paste replaces any earlier undated value for the same analyte while dated history from intake
   is kept (`:627`), `persist` saves to `localStorage` and toasts "N values read, M lines not
   recognised" (`:629-631`).
2. the chips under the textarea show every value, amber when outside the reference interval,
   each with its date when it has one and an × to remove it (`:669-690`).
3. the findings pipeline recomputes (`:221-237`): `labFindings` emits a finding only for values
   outside the interval, with mechanism, next step and territories from the catalogue
   (`labs.ts:389-412`).
4. "read-out" panel lists findings red-flags-first then by weight (`sortFindings`, `model.ts:68`),
   each with layer, detail, mechanism, next step, source, and "look here" (`:1052-1125`).
5. "look here" → `focusTerritories` names the territories, reads the record for them and raises
   shepherd with a question built from the real labels (`:246-260`).
6. reload → `loadRecord` merges defaults over the saved record (`store.ts:121-143`); the earlier
   end-to-end run proved this persistence (operator's evidence).

secondary paths (each writes through `persist` only):

- **intake**: genetics file (23andme/ancestry/vcf, 40 MB cap, `import/geneticsFile.ts:7,117`),
  wearable export (apple health xml, oura/whoop/dexcom/libre csv, downsampled past 5000 points,
  `import/wearables.ts:6,214`), pasted lab report with unit conversion
  (`import/labsDocument.ts:81`), photographed lab report read by shepherd's vision model
  (`IntakePanel.tsx:318-335`, `shepherd.ts:195-209`), and history entries (`:439-...`).
- **pain**: guided interview with red flags first, ranked tissue pattern, copyable
  non-diagnostic package (`PainStudioPanel.tsx`); saving raises shepherd (`:98`); a new pain
  report also raises shepherd from the view's own watcher (`AsherinHealthView.tsx:329-346`).
- **herbs**: browse by tradition or territory; adding runs `safetyReview` against medications,
  conditions and pregnancy and shows blocking warnings first (`HerbalPanel.tsx`,
  `herbs.ts:1569`).
- **systems**: inflammation/stress/circadian/posture overlays, interdependency network, causal
  chains, reverse symptom map, every number restating inputs and confidence
  (`FunctionalPanel.tsx`).
- **over time**: dated timeline, snapshots and diffs, straight-line trajectories with widening
  bands, what-if table of textbook directions (`TimelinePanel.tsx`, `temporal/*`).
- **live**: device registry for heart rate / eeg / motion / microphone, session recording, baseline
  comparison, longitudinal patterns (`LiveSensingPanel.tsx`), plus the simpler ble heart rate +
  device-motion steadiness panel (`AsherinHealthView.tsx:349-410, :979-1049`).
- **photos**: up to four photographs shrunk on device to 1280 px (`PhotoReadPanel.tsx:32-56`),
  read by shepherd's vision model (`:113-146`, `shepherd.ts:225-247`), normalised and bounded
  (`photoRead.ts:121-163`), kept as a bounded log of 20 (`:128`), each line quotable into shepherd
  (`:366`).
- **share**: clinical package and family atlas as markdown (copy / download), full json export /
  import, two-step erase (`SharePanel.tsx`, `output/clinicalPackage.ts`).
- **erase** (record panel): now two-step with a warning line (`:894-921`), consistent with share.

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| `record` | react, mirrored to `localStorage["asherin.health.record"]` on every `persist` (`:200-206`, `store.ts:145-153`) | `HealthRecord` v1 (`store.ts:73-92`): labs, medications, genes, nutrition, exposures, surgeries, family, pain, symptoms, herbs, photoReads (with jpeg data urls), snapshots, wearables, sessions, settings | until erased | no — only by export, or by the person asking shepherd (compact excerpt) or starting a photo/lab read (the images) |
| `turns`, `busy`, `unseen`, `unavailable` | react (`:168-171`) | `AssistantTurn[]` | component — the thread is not persisted | no |
| `panel`, `focus`, `panelHighlights`, `activeLayers`, `assistantTrigger` | react | primitives | component | no |
| live sensor buffers | refs (`:179-183`) | samples | component; ble disconnected and motion timer cleared on unmount (`:208-213`) | no |
| usage ledger row per model call | indexeddb `ai_usage_events` via the postgrest shim (`src/lib/usage/ledger.ts:80-104`) | tool, provider, model, status | persistent | no |
| model key | device key vault (`src/lib/local/keys.ts`) — read, never stored by this room | — | — | to the provider, in the request header, by `src/lib/local/llm.ts` |

photo reads hold full jpeg data urls inside `localStorage`; four 1280 px photos at q0.82 are
roughly 1–2 MB per read, and the log is capped at 20 reads (`PhotoReadPanel.tsx:128`), so a full
log can approach the 5–10 MB `localStorage` ceiling on some browsers. `saveRecord` returns false
when the write throws and the room says so ("this device is blocking local storage, so the
record stays in memory only.", `:203`) — the failure is visible, not silent, but the cap and the
quota are an open gap stated below.

## logic

- **lab parsing** (`labs.ts:343-375`): line-wise, lowercase, alias regex with up to 24 non-digit
  characters between name and number, decimal comma accepted, first match per analyte wins;
  lines with digits that match nothing are returned as `unrecognised` (shown as a count).
- **lab findings** (`labs.ts:389-412`): only out-of-interval values produce a finding; weight
  `0.35 + deviation·0.6`.
- **drug interactions** (`medications.ts`), **herb safety** (`herbs.ts:1569`): pairwise checks
  against catalogue keys; absence of a hit is stated as "not the same as no interaction existing"
  in the clinical package (`clinicalPackage.ts:61`).
- **red flags** (`pain.ts:161-250, :368-395`): rule-based; `redFlag: true` sorts first and
  paints the amber banner (`AsherinHealthView.tsx:262, :459-471`).
- **snapshots & diff** (`temporal/timeline.ts:277-321`): added / resolved / worsened / improved by
  finding id and weight delta > 0.05.
- **trajectories** (`temporal/trajectory.ts`): least-squares line per series with ≥ 4 wearable
  points or ≥ 3 dated labs of one analyte; band widens `(1 + months/6)`; confidence capped 0.75;
  assumptions printed. **what-if** is a fixed table of textbook directions, never fitted to the
  person (`:452-515`).
- **shepherd context** (`:266-291`): last six pain reports, labs, medications, symptoms, herbs,
  live heart, first twelve findings, highlights and focus — a compact excerpt, so the model can
  only answer from what the room shows.
- **shepherd calls** (`shepherd.ts`): `resolveHealthShepherd` reads the active model and its key
  from the vault and never opens a dialog (`:26-41`); `call` runs `completeLlm` at temperature
  0.3 with a system prompt that forbids diagnosis and prescribes lowercase prose (`:74-106,
  :109-115`); `readLabPhoto` and `readPhotos` request json and pass it through `extractJson`
  then the pure bounders `normaliseLabRead` (`:160-183`) and `normaliseRead`
  (`photoRead.ts:121-163`); every provider failure becomes one lowercase sentence via
  `describeModelFailure` (`:43-66`).
- **shepherd placement** (`:126-141, :297-325`): a `matchMedia("(min-width: 1280px)")` hook
  decides whether the thread is in the side column or behind the rail; answers that arrive while
  the panel is closed on a narrow screen increment a badge on the rail entry (`:311`, `:485-489`).

## integrations & network

| call | host | method | payload | timeout/abort | retry | offline | key |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `askHealthShepherd` (`shepherd.ts:117-127`) | the provider the person connected (`src/lib/local/llm.ts:47-70`: openai, anthropic, google, openrouter, ollama/lm studio on localhost, …) | POST, provider's chat api | system prompt + record excerpt + question, max 900 tokens | optional `AbortSignal` (not wired to a cancel control yet — open gap) | `completeLlm` retries RATE_LIMIT / UPSTREAM_BUSY up to 3× (`llm.ts:363-376`) | `LlmError NETWORK` → "the provider could not be reached from this device. check the connection." shown as a failed turn | device vault key, read by `getProviderKey`, sent by `llm.ts` |
| `readLabPhoto` (`:195-209`) | same | same, with one image | one jpeg/png/webp, json requested, max 1800 tokens | as above | as above | as above, shown in the intake panel's error line | same |
| `readPhotos` (`:225-247`) | same | same, with ≤ 4 images | 1280 px jpegs, json requested, max 2200 tokens | as above | as above | as above, toast | same |
| usage ledger (`recordAiCall`) | none — local table | — | tool/provider/model/status | — | — | local | none |

there is no edge function and no relay: v1 called `supabase.functions.invoke("asherin-health-ai")`
through `invokeWithByokRetry` for all three, and the local shim has no handler of that name
(`src/lib/local/functions.ts:27-49`), so every one of them answered "asherin-health-ai needs a
server-side organ … kernel offline" — the side panel "shepherd, in this room" could not answer
a single question (contradicted; review log 1). v1 also resolved a "byok" key by reading the
account-era tables `user_model_preferences` and `user_api_keys` from the shim
(`AsherinHealthView.tsx` v1 `:76-100`), which are empty on a device; removed.

## security & privacy

- **injection surfaces**: the record is the person's own text; it is rendered as react text
  nodes, never as html (observed throughout). model replies are rendered as text in
  `whitespace-pre-wrap` (`HealthAssistant.tsx:77`). the json the vision model returns is bounded
  field by field before it reaches the record (`photoRead.ts:121-163`, `shepherd.ts:160-183` —
  verified by `photoRead.test.ts` and `shepherd.test.ts`): strings capped, numbers clamped,
  enums checked, system ids checked against the atlas, unattributed findings dropped.
- **what a hostile model reply could do**: at most put bounded text into the record that the
  person then reads; it cannot change settings, trigger a call, or escape the text fields.
- **key handling**: the room never sees the key as a value it stores or logs; `shepherd.ts`
  passes it to `completeLlm` and discards it. the vault may be locked, in which case the room
  says "your key vault is locked. unlock it in settings → intelligence" (`:34`).
- **what leaves**: the compact excerpt (`:266-291`) with every question; the photographs with a
  read; nothing else, and only on the person's action. the copy says so in three places
  (`:59-60` of the assistant, `IntakePanel.tsx:399-401`, `PhotoReadPanel.tsx:206-210`).
- **storage at rest**: plaintext `localStorage`; anyone with the browser profile can read it.
  the room says "held in this browser's storage only" (`:853`), not "encrypted". an open gap.
- **clipboard / export**: copy actions are explicit and now report refusal
  (`PainStudioPanel.tsx:115-122`, `SharePanel.tsx:35-42`); exports are downloads the person
  starts.
- **a hostile import file**: `importRecord` parses json and merges over the empty record
  (`store.ts:168-188`); unknown fields are carried along, oversized files are not rejected — an
  open gap stated below.

## failure modes

| failure | what the operator sees | anchor |
| --- | --- | --- |
| no model key / vault locked / key unreadable | the shepherd panel shows the reason in place of the composer ("shepherd has no model to answer with on this device. connect a model key in settings → intelligence.") and the same sentence as a failed turn if a record change raises a question | `:189-197`, `HealthAssistant.tsx:87-88`, `shepherd.ts:26-41` |
| provider auth / rate limit / busy / network / bad request | one lowercase sentence as a failed turn marked "no answer" (assistant), or as the panel's error line (intake), or a toast (photos) | `shepherd.ts:43-66`, `HealthAssistant.tsx:76`, `IntakePanel.tsx:328-330`, `PhotoReadPanel.tsx:137` |
| model returns unusable json | "the reading came back in a shape that could not be used. try a sharper photograph." | `shepherd.ts:207, :245` |
| model returns no findings | "nothing in those photographs could be read into a finding. try closer, in even light." | `PhotoReadPanel.tsx:122-125` |
| a pdf offered to the lab scan | "that file is not a photograph. take a photo or screenshot of the report — jpeg, png or webp." (the file picker also only offers images) | `IntakePanel.tsx:322, :404` |
| `localStorage` blocked or full | toast "this device is blocking local storage, so the record stays in memory only." | `:203` |
| no analytes recognised in a paste | toast "no recognised analytes were found in that text." | `:622` |
| bluetooth unavailable / cancelled / motion declined | lowercase toasts; cancel is silent | `:349-378`, `:380-400` |
| clipboard refused | toast "the browser refused clipboard access, so nothing was copied." | `PainStudioPanel.tsx:120`, `SharePanel.tsx:40` |
| lazy panel loading | "opening this layer" / "opening the photo reader" with a spinner | `:508-512`, `:583-587` |
| nothing recorded yet | read-out: "nothing to read yet. add bloodwork, medication or a pain report…"; looking at: "choose a region from any layer…" | `:1097-1099`, `:415-417` |

no raw error, stack or "kernel offline" string reaches the screen (verified: `shepherd.test.ts`
"never leaks a raw stack or an uppercase provider message"; grep for "kernel" in the health
directories → none).

## interface & accessibility

- **layout**: header (`:447-457`) · optional amber red-flag banner (`:459-471`) · a 64 px icon
  rail with 9 px labels (`:474-493`) · a scrolling content column capped at `max-w-2xl` with
  `p-4 sm:p-6` (`:495-596`) · a 380 px side column from 1280 px (`:597-603`). at 390×844 the rail
  takes 64 px and the column the rest; the side column is hidden and the rail gains a twelfth
  entry, "shepherd", with an unread badge (`:483-489`). the person's phone screenshot from today
  showed the rail and column laid out correctly; v1 had no shepherd below 1280 px at all (review
  log 2), so the phone could record a pain report, trigger a question, and never see the answer.
- **one focal point**: the content column; the side column is quieter (smaller type, lower
  contrast) and the header is a single line. the red-flag banner is the one deliberately salient
  element and appears only when a red flag exists (records 012/013; record 029 — an alarm that
  is always on is not seen).
- **colour**: amber carries "out of range / red flag / destructive-armed"; the shepherd panel's
  warm border (`#e78a2e`) marks the one place the person is talking to the model; everything
  else is foreground tints (record 041 accent economy). every amber meaning is paired with a
  word.
- **type**: body 11–13 px light; micro-labels 9–10 px uppercase tracked (record 042 allows
  uppercase micro-labels); no uppercase paragraphs. the one `capitalize` class (herb tradition
  chips) is removed (review log 9).
- **controls**: destructive actions are two-step (share erase `SharePanel.tsx:132-156`; record
  erase `:894-921`) — record 038. per-item removal now has a visible × and an `aria-label`
  ("remove haemoglobin 13.1", `:677`) instead of a bare chip whose only behaviour was delete (review log
  4). chips and rail buttons carry `aria-pressed` (`:480`, `:954`, `:1073`); the shepherd
  composer and the record inputs carry `aria-label`s.
- **motion**: spinners only while something loads or reads; the live panel's pulse animations
  are tied to real beats and breaths (`LiveSensingPanel.tsx:436-470`) — record 037.
- **loading / empty**: see failure modes; every panel has an empty sentence.
- **no dark pattern**: nothing nags, nothing is pre-checked, erase cannot happen in one click.

## relationships

| edge | target | real in code? |
| --- | --- | --- |
| depends_on | `@/lib/health/*` (labs, medications, genetics, records, pain, symptoms, herbs, signals, store, model, panel, shepherd, photoRead, temporal/*, functional/*, live/*, import/*, output/*) | yes (`:29-61`) |
| calls | the connected model provider, directly from the tab | yes (`shepherd.ts:74-106` → `src/lib/local/llm.ts`) |
| reads_from | device key vault (`getActiveModel`, `getProviderKey`) | yes (`shepherd.ts:12, :26-41`) |
| owns_state | `localStorage["asherin.health.record"]` | yes (`store.ts:115-153`) |
| writes_to | usage ledger `ai_usage_events` | yes (`shepherd.ts:99, :102`) |
| trusts | the provider the person chose; the browser's storage | — |
| verified_by | 11 test files, 109 tests under `src/lib/health/**/__tests__` and `src/components/dashboard/health/__tests__` | yes |
| chat / vault / library / projects / other rooms | none — the room shares no state and no code path with them (the connect graph's `Organ` union does not list health; the room does not emit pulls) | verified by grep |

## performance

- mount: synchronous load of the record from `localStorage` (`:185-187`), one async vault read
  (`:189-197`), `registerTerritoryDefs` once (`:216-218`); panels are `React.lazy` (`:63-71`).
- findings recompute on every record / sensor / layer change (`:221-237`); the catalogues are
  small (20 analytes, ~60 territories) and this is cheap.
- timers: the 12 s motion sample window is held in a ref and cleared on unmount (`:181, :208-213,
  :402-409`); ble notifications are unsubscribed on unmount (`:209`); the live panel disconnects
  all adapters on unmount (`LiveSensingPanel.tsx:176-178`).
- media: photographs are downscaled on device before anything happens (`PhotoReadPanel.tsx:32-56`)
  and the log is capped at 20 reads.
- large lists: the timeline is capped by `max-h-96` scrolling; the deep-anatomy lists are inside
  420 px scroll areas.
- `assistantContext` is memoised and read through a ref inside `ask` so a reply does not re-create
  the callback (`:293-297`).

## copy & voice

every sentence on screen is lowercase apart from proper names and standard abbreviations
(hba1c, rmssd, eeg, ble, vcf, csv, 23andme). the model is named "shepherd" everywhere it is
spoken of ("shepherd, in this room", "ask shepherd about this", "read by shepherd"); the v1
strings "ask asherin about this", role label "asherin", "the assistant's vision model" and "a
body solve" are gone (review log 7). no "kernel offline", "account", "sign in", "pro" or "upload"
language remains (grep). medical claims stay inside "not a diagnosis": the room, the pain panel,
the photo panel, the live panel, the clinical package and the trajectory panel each say so in
their own words, and the shepherd system prompt forbids naming a disease as fact about the
person (`shepherd.ts:109-115`).

## tests & proof

- `src/lib/health/__tests__/shepherd.test.ts` (5, new): `normaliseLabRead` bounds and maps
  catalogue keys; dates must be yyyy-mm-dd; garbage survives; `describeModelFailure` writes one
  lowercase sentence per provider failure and never leaks a stack; with no model connected the
  resolver and `askHealthShepherd` both say "connect a model key in settings → intelligence"
  rather than anything about a kernel.
- `src/components/dashboard/health/__tests__/photoReadPanel.test.tsx` (4): read-out rendering with
  provenance and limits; quoting into shepherd; run disabled without photographs; the copy names
  shepherd and the device-held key and never a server.
- existing suites (100): photoRead bounding, pain red flags and herb safety, maps search,
  functional overlays and causal chains, imports (genetics, wearables, labs documents incl.
  downsampling), live analysis / baseline / contact / patterns.
- end-to-end: the operator's earlier run proved paste → read-out → reload persistence. the
  shepherd path is not driven end-to-end this round (no dev server by rule); it is proven at the
  unit boundary and by type.

## open gaps

- the record is plaintext in `localStorage`; it is not sealed with the device key the vault has.
  a photo log of 20 reads can approach the storage quota on some browsers; the failure is
  visible but the cap is coarse.
- `importRecord` accepts any json with `version: 1` and does not bound field sizes.
- no cancel control on an in-flight shepherd question (the lib accepts an `AbortSignal`; the view
  does not yet pass one).
- the shepherd thread is not persisted across reloads.
- a pdf lab report cannot be read; the person photographs or screenshots the page.
- the vision pass (desktop 1440×900 and phone 390×844 after the fix) is still owed.

## machine narrative — record a value → read-out

```
actor         the person, in this browser
action        paste bloodwork lines and press "read these values"; open "read-out"
inputs        free text, one analyte per line (labs.ts:346)
preconditions none; the room is mounted and loadRecord has run (:185-187)
effects       record.labs replaced for the undated values of the pasted analytes, dated history kept (:627);
              localStorage["asherin.health.record"] rewritten with updatedAt (store.ts:145-153);
              findings recomputed (:221-237); chips re-rendered (:669-690); toast with counts (:629-631);
              no network call, no ledger row — recording is local
failure paths no analyte matched → toast, nothing written (:620-623);
              localStorage throws → record kept in memory, toast says so (:203);
              a value outside the interval → an amber chip and a finding, never a diagnosis (labs.ts:389-412)
invariants    every lab value has a catalogue key (unknown lines are returned, not stored);
              a finding exists only for a value outside [low, high];
              the record never leaves the device on this path; reload restores it (store.ts:121-143)
```

## machine narrative — a record change raises shepherd

```
actor         the room, on behalf of the person
action        a panel calls onEvent(question) or a pain report is appended → ask(question, automatic=true)
inputs        the question text; the compact record excerpt (:266-291) at the moment of asking
preconditions a model is connected and its key readable (shepherd.ts:26-41); otherwise the turn fails in place
effects       one "you" turn marked "raised from your record" and one "shepherd" turn (:297-312);
              one ai_usage_events row {tool:"asherin-health", status:"ok"|"error"} (shepherd.ts:99-102);
              on a narrow screen with the panel closed, the rail badge increments (:311, :485-489)
failure paths resolver not ok → failed turn with the reason, unavailable notice in the composer slot;
              LlmError → failed turn with one lowercase sentence (shepherd.ts:43-66)
invariants    the excerpt is the only record content sent; the reply is rendered as text;
              nothing in the record changes because of a reply
```

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | "shepherd, in this room", the photographed-lab scan and the photo reader all called `supabase.functions.invoke("asherin-health-ai")`; the local shim has no such handler, so every call answered "kernel offline" — the side panel could not answer anything, and the room's byok lookup read account-era tables | integrations / requirements | domain → failure (dead control) → cause: hosted-era edge call in `HealthAssistant.tsx:39`, `IntakePanel.tsx:340`, `PhotoReadPanel.tsx:119`; no handler in `functions.ts:27-49` | contradicted (copy promised answers; code could not) | defect | component replacement | new `src/lib/health/shepherd.ts`: device-vault resolution, direct provider call via `completeLlm`, vision json bounded, lowercase failure copy; the three callers rewired; `resolveByok` and the `supabase` import removed from the view and from `HealthPanelProps` | `shepherd.test.ts`; `photoReadPanel.test.tsx` "never a server"; tsc |
| 2 | the side column (shepherd + "looking at") is `hidden … xl:flex`, so below 1280 px — every phone and most laptops — there was no shepherd at all while every panel kept raising questions into nothing | interface / behavioral | cause: `aside` hidden with no alternative mount; thread state lived inside the hidden component | observed | defect | state consolidation | thread (`turns`, `busy`) lifted into the view (`:168-171, :297-312`); `HealthAssistant` is controlled; a "shepherd" rail entry (`xl:hidden`) mounts the same thread and "looking at" on narrow screens with an unread badge (`:483-489, :501-506`) | code read; `matchMedia` mocked in `src/test/setup.ts` so the suite renders |
| 3 | when no model key exists the person saw nothing until a question failed | failure modes | cause: no up-front resolution | observed | defect | local correction | `resolveHealthShepherd` on mount; the reason replaces the composer (`:189-197`, `HealthAssistant.tsx:87-88`) | `shepherd.test.ts` reason text |
| 4 | lab chips, medication rows and gene rows deleted on a plain click with no affordance; chips keyed by `l.key` collided once intake added dated history; record-panel "erase" was one click while share's was two | interface (error prevention) / data | cause: `:613-623, :654-660, :830-841` in v1 | observed | defect | local correction | × glyph + `aria-label` + title on every removal; index-based keys and deletion; two-step erase with warning (`:669-690, :928-938, :894-921`) | code read |
| 5 | `recordCount` omitted photo reads, so "N entries" under-counted | data | cause: `store.ts:190-206` | observed | defect | local correction | `photoReads.length` added (`store.ts:202`) | code read |
| 6 | deep-anatomy copy claimed "the loaded reference geometry is an adult male body … not represented in the mesh"; functional copy "paint this overlay on the body", "look at it on the body"; comments in `panel.ts`/`model.ts` spoke of the atlas — the atlas was removed | semantic / copy | cause: strings left from the 3d edition | contradicted | wrong claim | local correction | copy rewritten to the territory map / "looking at" panel (`DeepAnatomyPanel.tsx:165, :185-186`, `FunctionalPanel.tsx:166, :173`, `panel.ts`, `model.ts`) | grep for `mesh|atlas|on the body` in health → none on screen |
| 7 | the model was called "asherin" ("ask asherin about this", role label), "the assistant's vision model", and the intro mentioned "a body solve" (a removed feature) | copy & voice | cause: v1 strings | observed | wrong claim | local correction | "shepherd" throughout; intro rewritten (`PhotoReadPanel.tsx:366`, `HealthAssistant.tsx:57-61`) | `photoReadPanel.test.tsx` |
| 8 | the lab scan accepted `application/pdf` though the vision path can only read images; copy said "photo or pdf" | requirements / semantic | cause: `IntakePanel.tsx` v1 accept + copy | contradicted | defect + wrong claim | requirement reconciliation | accept images only; non-image rejected with a sentence; copy says a pdf is not read (`IntakePanel.tsx:322, :399-404`) | code read |
| 9 | herb tradition chips used `capitalize`; trajectory and timeline copy referred to "body solves" | copy & voice | cause: `HerbalPanel.tsx:163`, `TimelinePanel.tsx:249`, `trajectory.ts:78` | observed | wrong claim | local correction | class removed; copy states the real inputs (three dated repeats of one lab, or a wearable series) | grep |
| 10 | clipboard writes were unguarded; a refusal rejected silently | failure modes | cause: `PainStudioPanel.tsx:115`, `SharePanel.tsx:35` | observed | defect | local correction | try/catch with a toast | code read |
| 11 | the 12 s motion timer could fire after unmount and call setState | performance / state | cause: `:351` v1 | hypothesized → observed in code | defect | local correction | timer in a ref, cleared on unmount (`:181, :208-213, :402-409`) | code read |
| 12 | surgery and family chips in the record panel saved `territoryKeys: []`, so their findings never named a territory even when the preset had one | data | cause: `:748, :763` v1 | observed | defect | local correction | preset territories looked up on toggle (`:808, :825`) | code read |
| 13 | pre-existing lint in the room's libs: `any` in `signals.ts:196`, unused imports (`newId`, `useMemo`, `findDrug`), a hook with a per-render constant dependency | verification | — | observed | defect | local correction | typed/annotated, imports pruned, `PATTERN_METRICS` hoisted (`LiveSensingPanel.tsx:22`) | eslint clean on both directories |

### shared-file patches proposed (not edited — outside the room's directories)

none required. `src/pages/Dashboard.tsx:1919-1923`, `src/lib/navIntents.ts:152-159` and
`src/lib/dashboard/v2Titles.ts:28` are lowercase and true to the room. `src/lib/local/functions.ts`
needs no `asherin-health-ai` handler because the room no longer calls `functions.invoke`;
`src/lib/byokInvoke.ts` is no longer imported by this room. one optional follow-up for the
connect graph owner: `src/lib/connect/emitPull.ts:16-23` `Organ` could gain `"health"` if the
graph should show this room's model calls; today they are recorded in the usage ledger only.

## vision confirmation — 2026-10-26

screens: final3-d-asherin-health.png and final3-m-asherin-health.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: bloodwork, medication, genetics and nutrition panels and the side rail render; the phone layout keeps the rail and the form side by side without overflow.
