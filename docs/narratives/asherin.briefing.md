```
room: asherin.briefing   view id: briefing   files: src/components/dashboard/BriefingView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

files: `src/components/dashboard/BriefingView.tsx` (surface), `src/components/dashboard/briefing/briefingEngine.ts` (prompts, parsers, pure), `src/components/dashboard/briefing/briefingStore.ts` (local tables, model call), `src/components/dashboard/briefing/BriefingProfileEditor.tsx` (form), `src/test/briefingEngine.test.ts`. screenshots are not yet taken (another process owns the browsers), so the status block says so instead of claiming them.

## purpose & promise

the room writes a briefing for one operator from a profile of what they watch: a company or field, competitors, markets, technology, people, regulators, other topics. the writer is shepherd, the model the operator connected, called from this device with the key in the vault (`briefingStore.ts:164-218`). there are no live sources in this room: shepherd writes from model knowledge and the briefing has to say so in its own `## limits` section (`briefingEngine.ts:232-243`). the promise the interface makes is exactly that: "written by shepherd via <provider> · model knowledge, not live sources" on every report (`BriefingView.tsx:466-472`), "no daily delivery: asherin runs only while this tab is open" on the room page (`BriefingView.tsx:635-638`), and a `write now` button that does what it says or explains why it is off (`BriefingView.tsx:606-608`).

## entry & navigation

- sidebar group `find`, label `asherin.briefing`, keywords briefing/briefings/daily/digest/news (`src/lib/navIntents.ts:125-132`).
- v.2 shell title `asherin.briefing`, subtitle "scheduled reading, sourced." (`src/lib/dashboard/v2Titles.ts:36`) — see shared-file patches: the room neither schedules nor sources.
- `Dashboard.tsx:1972-1978` mounts `BriefingView` through `gatedView` inside an `ErrorBoundary` + `Suspense`; the title/description strings there ("Intelligence Briefings", "Personalized daily intelligence briefings…") only surface on the retired-room card and are account-era copy — see shared-file patches.
- in v.2 the shell owns the title, so the room's own `<h2>` is hidden and only a suffix like "setup" shows (`BriefingView.tsx:77-84`); in the current ui the room draws its own name line.
- what loads first: `loadData` reads the profile row and the newest 50 reports from IndexedDB in parallel (`BriefingView.tsx:148-170`, `briefingStore.ts:46-64, 92-101`). while that runs the room shows "reading this device's briefings…" with a small spinner (`BriefingView.tsx:387-393`). a read error shows the message and a `try again` button (`BriefingView.tsx:395-405`). a missing device identity (never expected, `useAuth` mints one) is handled the same way rather than spinning (`BriefingView.tsx:149-153`).
- no profile → the setup surface; profile → the room page; a chosen report → the reader (`BriefingView.tsx:423, 490`).

## workflow

happy path:
1. **setup conversation** (`BriefingView.tsx:490-583`). the first line is the room's own, not a model call: "i'll set up what this briefing watches…" (`briefingEngine.ts:133-134`). the operator types; `sendChatMessage` sends the system prompt from `buildSetupSystemPrompt(draft)` plus the transcript from the first user turn onward (`BriefingView.tsx:220-257`, `briefingEngine.ts:143-155`). shepherd answers with prose and one fenced json block carrying the whole profile so far; `parseSetupReply` strips the block from the prose and `mergeProfile` folds it into the draft (`briefingEngine.ts:166-205, 93-105`). once the draft has a subject and at least one list (`profileIsUsable`, `briefingEngine.ts:107-111`) a card shows what will be watched with `save profile`; when shepherd sets `profile_complete` the card says shepherd has what it needs, otherwise "enough to start with… or keep answering" (`BriefingView.tsx:538-551`). the conversation is capped at 40 turns with a plain message (`BriefingView.tsx:56, 223-226`).
2. **profile saved**: `saveProfile` inserts the one `briefing_profiles` row for this device, or updates it if one exists (`briefingStore.ts:66-83`); toast "profile saved" (`BriefingView.tsx:259-273`).
3. **write now**: `generateBriefing` streams shepherd's answer into a live card, parses it with `parseBriefingReport`, saves a `briefing_reports` row, opens it, and toasts the tier counts or the headings shepherd skipped (`BriefingView.tsx:284-324`). a `stop` button replaces `write now` while it runs and aborts the fetch (`BriefingView.tsx:326, 601-604`).
4. **read**: the reader shows title, provider, time, the "model knowledge" line, and nine tabs (full + the eight prompted sections) rendered from `sectionForTab` (`BriefingView.tsx:423-487`, `briefingEngine.ts:309-316`). a tab whose section the model skipped says so instead of showing an empty pane.
5. **delete**: in the list or the reader, the bin icon arms an inline "delete this briefing from this device? delete / keep" row; no browser `confirm()` (`BriefingView.tsx:473-479, 708-714, 330-341`).

secondary paths:
- **form instead of conversation**: `fill in a form instead` opens `BriefingProfileEditor` seeded with the chat draft or the saved profile (`BriefingView.tsx:407-421, 497-500`). the form works with no model key; it refuses to save an unusable profile with a toast and an inline hint (`BriefingProfileEditor.tsx:52-70, 143-147`).
- **edit profile**: pencil in the header or on the "watching" card → the same editor (`BriefingView.tsx:596-598, 627-629`).
- **change the profile with shepherd**: speech-bubble icon → `beginSetup(profile)` seeds the draft and opens with "this profile currently watches: … what should change?" (`BriefingView.tsx:211-218, 599-600`). `x` leaves setup and aborts any in-flight turn (`BriefingView.tsx:275-280`).
- **delete profile**: bin in the header arms "delete the profile? saved briefings stay." (`BriefingView.tsx:617-623, 343-353`).
- **download**: `# title` + body as `text/markdown`, named by `reportFileName` (slug + date) (`BriefingView.tsx:355-363`, `briefingEngine.ts:318-327`).
- **notebook**: copies the briefing into a new notebook row and one text cell through the shim (`BriefingView.tsx:365-385`); failure is a toast.
- **retry**: generation errors show in a dismissable row under the live card and `write now` is available again (`BriefingView.tsx:651-656`); setup errors show under the transcript and the input stays enabled (`BriefingView.tsx:533-536`).

## state & data

react state (`BriefingView.tsx:118-145`): `profile`, `reports`, `loading`, `loadError`; `shepherd` (readiness, refreshed on `VAULT_EVENT`, `BriefingView.tsx:172-186`); `showEditor`, `showSetup`, `activeReport`, `reportTab`; setup `chatTurns`, `chatInput`, `chatBusy`, `chatError`, `draft`, `draftComplete`, `savingProfile`; generation `generating`, `streamText`, `genError`; `confirmReportId`, `confirmProfile`. all of it dies with the component; nothing is in localStorage.

indexeddb, via the shim (`src/lib/local/postgrest.ts`):
- `briefing_profiles` — one row per device identity: `id, user_id, company_name, industry, competitors[], key_markets[], technology_stack[], investment_interests[], tracked_people[], regulatory_bodies[], custom_topics[], created_at, updated_at`. defaults for every column the room reads are in `COLUMN_DEFAULTS` (`postgrest.ts:77-80`) and `normalizeProfile` tolerates rows that predate them (`briefingEngine.ts:85-91`). lists are capped at 30 items of 80 chars, text at 120 (`briefingEngine.ts:59-61`).
- `briefing_reports` — `id, user_id, title, content, sources_checked (always 0), critical_items, significant_items, monitoring_items, provider, model, created_at` (`briefingStore.ts:120-145`, defaults `postgrest.ts:81`). read newest-first, 50 at most (`briefingStore.ts:36, 92-101`).
- `asherin_connect_pulls` — one trace row per generation with status, latency and a masked one-line quote; written by `emitPull`, never payload (`BriefingView.tsx:303, 317`, `src/lib/connect/emitPull.ts:86-111`).
- `notebooks` / `notebook_cells` — only when the operator asks for a notebook copy.

vault: never written here. `resolveShepherd` reads the active provider and decrypts its key only for the duration of the call (`briefingStore.ts:164-178`, `src/lib/local/keys.ts:129-134, 187-196`).

what leaves the device: the two prompts (setup system prompt + transcript; briefing system prompt + profile description) to the provider the operator chose, carrying that provider's key. nothing else.

## logic

- **profile normalisation** (`briefingEngine.ts:63-91`): strings trimmed and whitespace-collapsed; lists accept arrays or comma/semicolon/newline strings, dedupe case-insensitively, cap length and count.
- **merge** (`briefingEngine.ts:93-105`): text fields replaced only when the patch has a non-empty value; lists are the union, base first.
- **usable** (`briefingEngine.ts:107-111`): company or industry present, and at least one list item. `write now` is off until then (`BriefingView.tsx:206-207`).
- **setup reply parsing** (`briefingEngine.ts:166-205`): the last fenced block mentioning `"profile"` wins; unfenced, the last top-level object starting with `{"profile` is tried by shrinking from the end until it parses; the matched text is removed from the prose; missing or broken json → prose only, profile `null`, complete `false`.
- **briefing prompt** (`briefingEngine.ts:232-256`): eight fixed `## ` headings in order, tier tags `[critical]/[significant]/[monitoring]` on bullets in `## developments`, a mandatory `## limits`, under 900 words, no invented urls/citations/dates.
- **report parsing** (`briefingEngine.ts:259-316`): unwraps a whole-answer code fence, lifts the `# ` title (fallback `briefing — yyyy-mm-dd`), counts tier tags (inside `## developments` when present), lists prompted headings the model skipped. `extractSection` is case-insensitive, escapes the heading, stops at the next `## `, a `---`, or end.
- **relative time** (`briefingEngine.ts:329-340`): minutes / hours / days up to 13 d, then the iso date.

## integrations & network

exactly one kind of outbound call: `streamLlm` to the operator's provider (`briefingStore.ts:189-218` → `src/lib/local/llm.ts:347-360`). host and path are the provider's own api (`llm.ts:47-68`); method POST; payload system + messages, `max_tokens` 700 for a setup turn and 2200 for a briefing (`BriefingView.tsx:57-58`); the key goes in that request's header and nowhere else. abort: an `AbortController` per call, cancelled by `stop`, by `x`, by a new turn, and on unmount (`BriefingView.tsx:188-193, 232-235, 288-290, 326`); `readSse` turns an abort into an `AbortError` the room swallows (`llm.ts:112-121`). retry: none automatic in this room — `LlmError` codes become operator sentences ("busy or rate-limited. try again in a moment", "rejected the saved key", "could not be reached") and the button comes back (`briefingStore.ts:208-217`). offline: the provider fetch fails with `NETWORK` → that sentence; everything stored keeps working because reads and writes are local. no key: `resolveShepherd` says precisely what is missing ("connect a model key in settings → intelligence", "your key vault is locked…", "no saved key for <provider>") without opening the shared byok dialog (`briefingStore.ts:164-178`). the room never calls `supabase.functions.invoke`; `briefing-onboard` and `generate-briefing` are gone from it.

## security & privacy

- **injection surfaces**: the profile text goes into both prompts; it is the operator's own data on their own device, so a hostile profile only hurts its author. model output is rendered by `react-markdown` v10 with no raw-html pass-through and the default url transform (http/https/mailto only), so a reply cannot script the page; links are plain anchors. the setup json is parsed with `JSON.parse` and immediately normalised to the nine known fields — unknown keys are dropped (`briefingEngine.ts:85-91`).
- **key handling**: the key is read from the vault inside `resolveShepherd` and lives in a local variable for one `streamLlm` call. it is not in state, not in a trace row, not in a toast. `emitPull` masks its quote and strips secret-shaped substrings before insert (`emitPull.ts:36-67`); the quote the room passes is either a byte count or the error sentence.
- **storage at rest**: profile and reports are plain rows in this device's IndexedDB like every other room's data; they contain what the operator typed and what the model wrote.
- **export leakage**: download is a markdown file of the report the operator chose; the notebook copy stays on the device. no clipboard writes.
- **hostile response**: an answer with no json, broken json, no headings, or a fence around everything is handled (tests `briefingEngine.test.ts`); an empty briefing is refused with "shepherd returned an empty briefing. try again." (`BriefingView.tsx:301`).

## failure modes

| failure | what the operator sees |
| --- | --- |
| profile/report read fails | message + `try again` (`BriefingView.tsx:395-405`) |
| no device identity | "this device has no identity yet — reload the page." + `try again` (`BriefingView.tsx:149-153`) |
| no model connected | card "shepherd has no model to write with. connect a model key in settings → intelligence." + `open settings`; input disabled with the same hint; `write now` disabled with the reason as tooltip; empty state repeats it (`BriefingView.tsx:86-105, 566, 606, 665`) |
| vault locked | same card, "your key vault is locked. unlock it in settings → intelligence…" (`briefingStore.ts:172`) |
| provider auth / rate limit / network / other | setup: red row under the transcript, input re-enabled; generation: red row with `dismiss`, `write now` returns (`BriefingView.tsx:251-255, 311-320`) |
| operator stops | "stopped. nothing was saved." (`BriefingView.tsx:312-313`) |
| shepherd skips sections | toast lists the skipped headings; the tab for a missing section says shepherd did not write it (`BriefingView.tsx:307-310`, `briefingEngine.ts:314`) |
| shepherd's reply has no json | prose shown, draft unchanged, conversation continues (`briefingEngine.ts:197-204`) |
| setup runs 40 turns | "this setup conversation is long enough. save the profile, or fill in the form." (`BriefingView.tsx:223-226`) |
| save profile fails | destructive toast with the shim's message (`BriefingView.tsx:268-269`, `BriefingProfileEditor.tsx:63-64`) |
| delete fails | destructive toast; row stays (`BriefingView.tsx:336-340, 349-351`) |
| notebook copy fails | destructive toast (`BriefingView.tsx:380-381`) |
| profile row exists but is empty (legacy) | "watching: nothing yet — edit the profile…"; `write now` off with "the profile is empty…" (`BriefingView.tsx:207, 632-634`) |

no path shows a raw stack: every thrown error is converted to a sentence in `briefingStore.ts` or the component before it is displayed. no spinner is unbounded: the only spinners are tied to a fetch with an abort control (`stop`), or to the IndexedDB read which resolves or errors.

## interface & accessibility

- layout: every surface is `flex h-full flex-col` with a wrapping header row and a `ScrollArea` body; content columns are `max-w-3xl` (room, reader) and `max-w-2xl` (setup, form). headers use `flex-wrap gap-2` so at 390 px the icon buttons and `write now` wrap under the title instead of overflowing (`BriefingView.tsx:588-610`). the reader's tab strip scrolls horizontally with `whitespace-nowrap` (`BriefingView.tsx:446-461`). the editor's two text fields sit side by side only from `sm:` up (`BriefingProfileEditor.tsx:97-106`). `Dashboard.tsx:2361` pads `<main>` under the phone menu button, so the room header never sits beneath it.
- touch: list actions (download, delete) are always visible, not hover-only (`BriefingView.tsx:697-704`); every destructive action is a two-step inline confirm, so there is no reliance on `window.confirm`.
- labels: icon-only buttons carry `aria-label` and `title` (`BriefingView.tsx:596-603, 697-704`, `BriefingProfileEditor.tsx:115, 133-136`); the live card is `role="status" aria-live="polite"` (`BriefingView.tsx:643`); errors are `role="alert"`; tabs are `role="tab"` with `aria-selected` in a `role="tablist"`.
- keyboard: enter sends a setup turn, shift+enter does not (`BriefingView.tsx:559-564`); enter adds a list item in the form (`BriefingProfileEditor.tsx:124-129`); every control is a real `<button>` or `<input>` so tab order follows the dom: header actions → body → composer.
- motion: two `animate-spin` loaders and smooth scroll-into-view of the newest turn; nothing autoplays.
- empty states: "no briefings yet." with the next step, which depends on whether a model is connected (`BriefingView.tsx:661-667`); "nothing tracked here" in each empty list (`BriefingProfileEditor.tsx:120`).
- contrast: body text uses `text-foreground`/`text-muted-foreground` tokens; the destructive confirm uses `bg-destructive text-destructive-foreground`. unverified by eye — see status block.

## performance

mount: two IndexedDB reads in parallel and one vault read (`getActiveModel`, `getProviderKey`), all sub-10 ms on a warm cache. no intervals, no polling. one `VAULT_EVENT` listener, removed on unmount (`BriefingView.tsx:172-186`). streaming appends to a string in state; the live card caps its box at `max-h-48` and scrolls itself (`BriefingView.tsx:200-204, 648`). the report list is at most 50 rows. two abort controllers are cancelled on unmount (`BriefingView.tsx:188-193`). the markdown renderer runs once per tab change on a ≤900-word document.

## copy & voice

all copy is lowercase except proper names (provider names come from the vault as the operator saved them). the model is "shepherd" everywhere (`briefingEngine.ts:133, 145, 234`; `BriefingView.tsx:93, 528, 645`). no account-era words: no "activate", no "delivery time", no "intelligence brief", no "cross-validated", no "sources checked" shown. "kernel offline" does not appear; the device answer is spelled out instead. the two prompts instruct shepherd to stay lowercase and to say "unsure" rather than fill gaps (`briefingEngine.ts:146, 235-236`). the honest sentence about schedules is on the room page itself, not in a tooltip (`BriefingView.tsx:635-638`).

## tests & proof

- `src/test/briefingEngine.test.ts` — 15 tests: setup prompt contents, fenced and unfenced json extraction and stripping, no-json replies, merge and usability rules, normalisation caps, briefing prompt contents, report title/tier/missing-section parsing, fence unwrapping, case-insensitive section extraction with `&`, tab fallback text, file names, relative times, and the local tables (insert-then-update of the one profile row, newest-first reports with numeric counts and defaults, delete).
- `src/test/localShim.test.ts` still passes with the new `COLUMN_DEFAULTS` rows.
- end-to-end step and screenshots: not run here (the browsers belong to another process). the status block records that honestly.

## open gaps

- **no schedule, by nature**: a closed tab cannot write. the room says so and offers `write now`. a service worker could not call a provider with the vault key either without holding the key outside the vault, so this is a device-edition fact, not a todo.
- **no live sources**: shepherd writes from model knowledge. a future sourced version would need asherin.search results fed into the prompt, with citations the operator can open; until then every briefing ends with `## limits` and the reader labels it.
- **`open settings` lands on the "you" tab**, not "intelligence": `SettingsView` has no way to be told a tab (shared file; patch proposed).
- **prompt adherence varies by model**: a small local model may skip headings or the json block; the room degrades (prose shown, "shepherd did not write…" in a tab) rather than failing, and the toast names skipped headings.

## review log

| # | finding | kind | fix | confirmed by |
| --- | --- | --- | --- | --- |
| 1 | room invoked `briefing-onboard` and `generate-briefing`; the shim answers "kernel offline" for both, so setup fell to a canned line and `generate now` always errored | defect | setup and generation run on device through `askShepherd` → `streamLlm` (`briefingStore.ts:189-218`, `BriefingView.tsx:220-257, 284-324`) | tsc, eslint, unit tests; model path needs a key (not driven here) |
| 2 | profile/report saved only by the server function; the room could never write a `briefing_profiles` row itself (editor did `update` on a row that did not exist) | defect | `saveProfile` insert-or-update (`briefingStore.ts:66-83`); editor uses it | `briefingEngine.test.ts` "saves a profile once, then updates the same row" |
| 3 | `delivery_time` / timezone selects: written to a column nothing reads; "Daily at 8:00 AM PST" promised a delivery no browser can make | defect | selects removed; honest sentence + `last briefing …` on the room page (`BriefingView.tsx:635-638`); setup prompt forbids asking about schedules (`briefingEngine.ts:147`) | prompt test "not on a schedule" |
| 4 | "N sources • Cross-validated" on every row and "sources analyzed with cross-validation" toast: nothing was checked | defect | copy removed; `sources_checked` stored as 0 and not shown; reader line "model knowledge, not live sources"; prompt-mandated `## limits` (`BriefingView.tsx:471`, `briefingEngine.ts:240`) | report test checks `limits` is required/missing-detected |
| 5 | delete-profile button had no icon or text (invisible, zero-size control) | defect | bin icon with label, inline confirm (`BriefingView.tsx:601-603, 617-623`) | tsc; visual check pending |
| 6 | list download/delete were `opacity-0 group-hover:opacity-100` — unreachable on a phone | defect | always visible, 36 px targets (`BriefingView.tsx:697-704`) | visual check pending |
| 7 | report deleted on a single click with no confirm; profile deleted via `window.confirm` | defect | inline two-step confirms (`BriefingView.tsx:473-479, 617-623, 708-714`) | tsc |
| 8 | no state for "no model key": generation toasted the shim's error, setup silently showed a canned greeting | defect | `resolveShepherd` + `ShepherdNotice` card, disabled composer and `write now` with reasons (`briefingStore.ts:164-178`, `BriefingView.tsx:86-105`) | tsc; copy anchored |
| 9 | report tabs ("Verified", "Contested", "Perspectives", "Prediction Engine"…) read headings the new writer never produces | defect | tabs derive from `REPORT_SECTIONS`, the same list the prompt demands (`briefingEngine.ts:219-229`, `BriefingView.tsx:424`) | section tests |
| 10 | `extractSection` did not escape the heading and failed on `&`; tier counts were never computed (always 0) | defect | escaped, case-insensitive extractor; `countTiers` (`briefingEngine.ts:259-277`) | tests "extracts sections…", "parses title, tier counts" |
| 11 | capitalised copy everywhere ("Generate Now", "Back to Briefings", "Profile saved", "Edit Intelligence Profile", "Activate Briefings") | defect | all room copy lowercase | grep of the four files |
| 12 | `.single()` on the profile read errored when two rows existed; `loading` stayed `true` forever when `user` was null | defect | `order … limit(1)` and an identity guard with an error state (`briefingStore.ts:46-64`, `BriefingView.tsx:149-153`) | tsc |
| 13 | no abort on unmount or on leaving setup; a model stream kept running | defect | abort controllers, cancelled on unmount/`x`/`stop` (`BriefingView.tsx:188-193, 275-280, 326`) | tsc |
| 14 | room header duplicated the v.2 shell title | defect | `RoomTitle` hides the name under v.2 (`BriefingView.tsx:77-84`) | tsc |
| 15 | first draft of this narrative said the room called `askModel`; it calls `streamLlm` via `askShepherd` so the briefing can stream and the room can word its own key errors | wrong claim | narrative corrected (integrations) | re-read of `briefingStore.ts:189-218` |
| 16 | first draft claimed `RoomTitle` was a stable component; it was defined inside the render body (new identity each render) | defect | moved to module scope (`BriefingView.tsx:77-84`) | tsc |
| 17 | setup transcript sent to the provider began with the room's assistant line; some providers reject a leading assistant turn | defect | transcript sliced from the first user turn (`BriefingView.tsx:238-241`) | tsc |
| 18 | live generation card did not follow the newest text | defect | `streamRef` scroll on each delta (`BriefingView.tsx:200-204`) | tsc |
| 19 | `write now` enabled on an empty legacy profile → a briefing about nothing | defect | `writeBlocked` reason, note on the card (`BriefingView.tsx:206-207, 634`) | tsc |
| 20 | shim had no defaults for either table; readers took `.length` of undefined arrays | defect | `COLUMN_DEFAULTS` rows (`src/lib/local/postgrest.ts:77-81`) | `localShim.test.ts`, store tests |
| 21 | screenshots at 1440×900 and 390×844 | — | not taken: browsers owned by another process | pending |

### shared-file defects found (not edited here; proposed patches)

1. `src/lib/dashboard/v2Titles.ts:36` — `subtitle: "scheduled reading, sourced."` → `subtitle: "a written briefing from what you watch, on request."`
2. `src/lib/navIntents.ts:128-129` — `codename: "scheduled reading", blurb: "scheduled reading, sourced"` → `codename: "written briefing", blurb: "a briefing from what you watch, on request"`.
3. `src/pages/Dashboard.tsx:1976-1977` — `"Intelligence Briefings", "Personalized daily intelligence briefings — competitor tracking, regulatory monitoring, and market signals."` → `"asherin.briefing", "a written briefing from what you watch, on request."`
4. `src/components/ByokRequiredDialog.tsx:40-47` — "Bring Your Own API Key" / "The hosted model path is busy right now…" / "Settings → AI Keys" is account-era and names a tab that does not exist; the `panel=ai-keys` query string is read by nothing. propose: title `connect a model key`, body `shepherd writes from this device with a key you connect. add one under settings → intelligence.`, and navigate with `window.dispatchEvent(new CustomEvent("aureon:navigate", { detail: "settings" }))`.
5. `src/lib/ai.ts:71, 93`, `src/lib/local/llm.ts:350`, `src/lib/local/keys.ts:36` — "settings → ai keys" → "settings → intelligence" (the tab label at `src/components/dashboard/SettingsView.tsx:118`).
6. `src/components/dashboard/SettingsView.tsx` — no way to open a given tab. propose, after `const [tab, setTab] = useState<SettingsTab>("you");`:
   ```ts
   useEffect(() => {
     const h = (e: Event) => {
       const t = (e as CustomEvent<string>).detail;
       if (SETTINGS_TABS.some((x) => x.key === t)) setTab(t as SettingsTab);
     };
     window.addEventListener("asherin:settings-tab", h);
     return () => window.removeEventListener("asherin:settings-tab", h);
   }, []);
   ```
   the briefing room's `openSettings` (`BriefingView.tsx:68-74`) would then also dispatch `asherin:settings-tab` with `"intelligence"`.

## vision confirmation — 2026-10-26

screens: final3-d-briefing.png and final3-m-briefing.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: setup state with no model reads honestly (connect a key, open settings). defect seen and fixed: on phone the floating alert bell covered the send button, and the send button used the green reserved for live signals.
- fixed: floating bell removed; primary buttons tonal again (`[data-asherin-room]` no longer redefines `--accent`).
