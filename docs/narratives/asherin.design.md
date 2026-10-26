room: asherin.design   view id: zali   files: src/components/dashboard/zali/ZaliView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)

## purpose & promise

asherin.design is a design workspace that lives on this device. the operator keeps design projects; each project has a conversation with shepherd, a record (specifications, cost analysis, manufacturing, simulation results) that shepherd fills by emitting a validated ```design_output fence, a viewport that lays out whatever the record names (materials, components, key features), two libraries the operator curates (materials, components) that can be attached to the active project, an analysis tab where shepherd estimates and says what it assumed, a research tab that collects the domain facts shepherd tagged, and a one-file markdown export. the interface promises exactly that and no more: nothing is simulated, nothing is looked up, nothing is encrypted beyond what the browser gives IndexedDB, and only the model call leaves the device (`ZaliView.tsx:382-398`, header copy `ZaliView.tsx:551-558`).

## entry & navigation

- rail/palette entry: `src/lib/navIntents.ts:202-209` — view `zali`, label `asherin.design`, codename `design lab`, group `make`, keywords design/zali/ui/lab/sketch.
- title under the v.2 shell: `src/lib/dashboard/v2Titles.ts:39` — `asherin.design` / `design exploration.`
- mount: `src/pages/Dashboard.tsx:46` lazy-imports `ZaliView`; `src/pages/Dashboard.tsx:1943-1948` renders it through `gatedView("zali", ZaliView, "ZANOEM Design Lab")` (that fallback title is account-era copy and is listed under shared-file patches below). the room is a `data-asherin-room` surface (`Dashboard.tsx:2420`).
- what loads first: a one-line "reading projects on this device…" status (`ZaliView.tsx:535-539`) while `zali_projects` is read from the device store (`ZaliView.tsx:166-180`); the newest project becomes active (`ZaliView.tsx:177`). under the v.2 shell the room's own title row is hidden because the shell owns it (`ZaliView.tsx:91`, `ZaliView.tsx:548`); tabs and the phone chat toggle remain.
- six tabs, lowercase: workspace · specs · materials · components · analysis · research (`ZaliView.tsx:48-55`), rendered as a `role="tablist"` (`ZaliView.tsx:562-581`); the active tab scrolls itself into view when the strip overflows (`ZaliView.tsx:128-131`).

## workflow

happy path:
1. **create a project** — "+" / "new project" opens the inline form (`ZaliProjectSelector.tsx:60-67`, form `ZaliProjectSelector.tsx:72-113`); enter a name and a design type (`DESIGN_TYPES` `ZaliProjectSelector.tsx:14-23`). `createProject` inserts into `zali_projects` with `phase: understanding`, selects it, clears conversation/code state, switches to workspace (`ZaliView.tsx:220-242`).
2. **write a spec with shepherd** — type in the chat (`ZaliChatPanel.tsx:259-265`) or pick an example prompt (`ZaliChatPanel.tsx:24-29`). `sendMessage` (`ZaliView.tsx:291-491`) stores the operator turn, streams shepherd's reply through `streamChat` (`ZaliView.tsx:386-398`) with a leading directive turn built by `buildDesignDirective` (`zaliPrompt.ts:165-190`) that carries the project record, the operator's library names, and the contract: ask with a ```options fence, record with one ```design_output fence, tag facts `[RESEARCH: domain]`, label every number an estimate. shepherd's ```options fence becomes clickable choices (`zaliPrompt.ts:66-96`, `ZaliQuestionOptions.tsx`). a ```design_output fence is validated by `extractDesignOutput` (`src/lib/zanoem/designOutputSchema.ts:72`) and written to the project row and state (`ZaliView.tsx:413-445`); the viewport opens on its own (`ZaliView.tsx:439`).
3. **add a component / material** — the materials tab (`MaterialIntelligencePanel.tsx`) and components tab (`ComponentLibraryPanel.tsx`) are device-local libraries (`zali_materials`, `zali_components`). each row has "add to <project>" (`MaterialIntelligencePanel.tsx:189-203`, `ComponentLibraryPanel.tsx:175-189`), which calls `attachToProject` (`ZaliView.tsx:277-289`) → `attachToSpec` (`zaliPrompt.ts:108-118`) appends the name to `specifications.materials` / `.components` without duplicates, persists it, and opens the viewport.
4. **see it in the viewport** — workspace → "open viewport" (`ZaliWorkspace.tsx:146-162`) or automatic after a spec/attach (`ZaliWorkspace.tsx:36-38`). `Zali3DModel` lays out every spec material, component and key feature around a core, colour-coded by kind with a legend (`Zali3DModel.tsx:18-21`, `Zali3DModel.tsx:95-150`); assembled/exploded changes the radius (`ZaliWorkspace.tsx:74-90`, `Zali3DModel.tsx:38-40`). "on record" below shows the scalar fields and chips (`ModelDetailsPanel.tsx:15-31`, `:33-40`). the materials sub-view joins spec materials to the operator's library by name (`ZaliMaterialsView.tsx:45`, `:105-125`).
5. **export** — specs tab → "export .md" (`ZaliSpecsPanel.tsx:27-30`, `:40-47`) builds one markdown file: record, lists, each section as json, then the conversation (`zaliPrompt.ts:204-245`), saved via a blob download (`zaliPrompt.ts:247-255`). the chat header's download gives the conversation alone (`ZaliChatPanel.tsx:125-132`).

secondary paths:
- rename (`ZaliProjectSelector.tsx:117-135` → `ZaliView.tsx:269-275`), delete with confirmation dialog (`ZaliView.tsx:244-267`, dialog `ZaliView.tsx:675-692`) which also deletes the project's `zali_messages`, `zali_research`, `zali_analyses` rows because the device store has no cascade (`ZaliView.tsx:258-262`).
- stop a reply: the stop button aborts (`ZaliChatPanel.tsx:267-269`, `ZaliView.tsx:500-502`); what arrived is kept and stored (`ZaliView.tsx:468-475`).
- retry: a failed turn shows "last turn failed. retry" above the chat on desktop and phone (`ZaliView.tsx:639-647`, `:659-667`, `retryLastTurn` `:493-498`).
- software projects (`isSoftwareProject` `zaliPrompt.ts:139-148`): the workspace becomes a code panel (`ZaliWorkspace.tsx:56-62`, `ZaliCodeOutputPanel.tsx`), the chat gains "generate code" (`ZaliChatPanel.tsx:245-256`), fenced files are extracted by `extractZanoemCodeFiles` (`zanoemOutput.ts:60`) into the panel (`ZaliView.tsx:406-410`); copy and "download all" (one download per file, `ZaliCodeOutputPanel.tsx:126-134`).
- analysis tab (`ZaliAnalysisPanel.tsx`): estimates per type (`runEstimate` `:76-84`), manufacturability (`runManufacturing` `:86-94`), three weighted proposals (`runProposals` `:96-104`, weights `:106-109`). each result is persisted to `zali_analyses` (`:69-72`) and the latest per kind reloads with the project (`:50-67`).
- materials review: shepherd lists failure modes and substitutions over the operator's library (`MaterialIntelligencePanel.tsx:89-101`, `:243-321`).

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| projects | IndexedDB table `zali_projects` via the PostgREST shim (`src/lib/local/postgrest.ts:431-441` fills `id`, `created_at`, `user_id`) | `{id, user_id, name, design_type, phase, status, specifications, cost_analysis, manufacturing, simulation_results, created_at, updated_at}` mapped by `mapProject` (`ZaliView.tsx:72-86`) | until deleted | name, description, record and phase go to the model inside the directive (`zaliPrompt.ts:168-174`) |
| conversation | `zali_messages` | `{id, project_id, user_id, role, content, created_at}` (`ZaliView.tsx:303-305`, `:401-403`) | until project deleted | the whole history is the prompt (`ZaliView.tsx:340`) |
| findings | `zali_research` | `{project_id, user_id, domain, title}` (`ZaliView.tsx:461-463`) | until project deleted | no |
| analyses | `zali_analyses` | `{project_id, user_id, kind, sub_kind, result, created_at}` (`ZaliAnalysisPanel.tsx:71`) | until project deleted | the request carries the record (`zaliAnalysis.ts:211-221`) |
| materials library | `zali_materials` | `{id, user_id, name, category, avg_cost, top_use, failure_mode}` (`MaterialIntelligencePanel.tsx:11-19`) | until removed | names only, up to 40, ride in the directive (`ZaliView.tsx:373-380`); full rows go in a materials review (`zaliAnalysis.ts:252-258`) |
| components library | `zali_components` | `{id, user_id, name, type, description, cost, lead_days, supplier}` (`ComponentLibraryPanel.tsx:10-19`) | until removed | names only, up to 40, in the directive |
| chat panel width | `localStorage["zali_chat_width"]` (`ZaliView.tsx:58-67`) | integer px 260–600 | per browser | no |
| active brain id | `localStorage["aureon_active_brain_id"]` read only (`ZaliView.tsx:344`); brain prompt/files from `brains`, `library_files` and the local `library` bucket (`ZaliView.tsx:347-367`) | text, capped 40 KB/file, 200 KB total, secrets redacted (`src/lib/zanoem/redact.ts:49`) | owned by the brains room | yes, redacted, inside the directive |
| device identity | `useAuth()` → `getLocalUser()` (`src/lib/local/auth.ts`); never null | `user.id` scopes every row | forever | no |
| react state | messages, findings, codeFiles, activeTab, isStreaming, deleteTarget, lastTurnFailedAt, autoBuildModel (`ZaliView.tsx:92-105`) | — | mount | no |

the hosted-era `zali_simulation_results`, `zali_mfg_results`, `zali_optimization_results` tables are no longer written or read.

## logic

- **design directive** (`zaliPrompt.ts:165-190`): json previews of the four record sections are truncated at 6 000 chars each (`zaliPrompt.ts:151-157`); the software clause appears only for software projects. it is sent as the first user turn followed by a fixed "understood." (`ZaliView.tsx:387-392`) because `streamChat` has no task-directive input (shared patch proposed below).
- **design_output** (`src/lib/zanoem/designOutputSchema.ts:37-70`): root must be an object, unknown keys dropped, `phase` enum, `design_type` ≤64 alnum/`_-`, the four sections must be plain objects, serialized size ≤32 KB (`:30`). a rejection is shown as "spec update ignored" with the reason (`ZaliView.tsx:443-444`).
- **options** (`zaliPrompt.ts:66-96`): fence tolerant of a language suffix and crlf; lines `[RECOMMENDED] choice — why`; at most 8 options.
- **research findings** (`zaliPrompt.ts:41-56`): `[RESEARCH: domain] line`; domain normalised through aliases to eight keys (`:8-29`); unknown domains dropped; title ≤160 chars; de-duplicated per reply and against existing state (`ZaliView.tsx:455-464`).
- **attach** (`zaliPrompt.ts:108-118`): trims, case-insensitive duplicate check, never mutates the input.
- **software detection** (`zaliPrompt.ts:139-148`): whole-token match, "full"+"stack" special-cased, so "appetite"/"botany" do not flip the workspace.
- **viewport layout** (`Zali3DModel.tsx:28-40`): items = materials, components, key features, first 12 shown with "+n more" in the legend (`:148`); angle = i/n·360−90; radius by mode and screen width (`useIsMobile`, 768px); connection lines are an svg sized `2·radius+40` centred with px coordinates (`:63-89`) — the previous `calc()` in svg attributes never rendered.
- **analysis** (`zaliAnalysis.ts`): `parseModelJson` finds the json in a fenced, bare or prose-wrapped reply (`:77-94`); each validator clamps enums, caps lists at 12 and strings at 400 chars, and returns null when nothing drawable remains (`:106-200`); `runAnalysis` throws one readable sentence on an unreadable reply (`:263`, `:266-279`). proposal scores clamp 0–100, at most six variants.
- **code extraction** (`zanoemOutput.ts:60-84`): ```code_output json first, then labelled fences; `sanitizeZanoemAssistantContent` (`:86`) strips fences from the bubble and counts them.
- **streaming** (`ZaliView.tsx:325-336`): deltas batch into one state write per animation frame; `onReplace` handles a provider restart (`:396`).
- **used in n projects** (`MaterialIntelligencePanel.tsx:105-114`, `ComponentLibraryPanel.tsx:88-96`): counted from the projects' spec lists on this device, not a stored counter.

## integrations & network

- the only outbound call is the model provider, through `streamChat` (`src/lib/ai.ts:133`) for chat and `askModel` (`src/lib/ai.ts:332`) for analysis, with the key the operator saved in settings → intelligence; `resolveActiveModel` raises "connect a model key…" when none is set (`src/lib/ai.ts:71`). asherin.design never reads a key itself.
- chat abort: stop button or a 120 s wall clock (`STREAM_TIMEOUT_MS` `ZaliView.tsx:57`, `:316-322`); the clock case tells the operator "shepherd stopped after two minutes… what arrived is kept" (`:477-479`). analysis calls pass no signal and rely on the provider's own timeout; the button is disabled while one runs (`ZaliAnalysisPanel.tsx:156`, `:216`, `:356`).
- retry: `streamChat` retries transient provider errors itself; the room offers a manual retry of the last prompt (`ZaliView.tsx:493-498`).
- offline: every library/record action works (IndexedDB); a chat or analysis attempt fails with the provider's message as a toast or inline alert, the conversation is kept, nothing spins forever.
- no `supabase.functions.invoke` remains in the room (the old `zali-chat` / `zali-analyze` edge calls, which could only answer "kernel offline", are gone). `supabase.channel` realtime is gone too: on a single device there is no second writer to listen for.
- supplier links in the materials view are plain search urls opened in a new tab with `rel="noopener noreferrer"` (`ZaliMaterialsView.tsx:17-25`, `:87-95`); they claim nothing about stock or price.

## security & privacy

- injection surfaces: model output is rendered through `react-markdown` without raw html (`ZaliChatPanel.tsx:5`, `:196-213`), code through `DOMPurify.sanitize` over a regex highlighter (`ZaliCodeOutputPanel.tsx:69-102`, `:205`). spec fields reach the DOM as text. a hostile ```design_output cannot grow the row past 32 KB or set an unknown phase/key.
- a hostile reply can still write arbitrary strings into `specifications.*` within the size cap and tag bogus `[RESEARCH:]` lines; both are shown as shepherd's claims, not facts, and the export labels the sections as "what shepherd recorded".
- key handling: none in this room. brain text is scrubbed of api keys, jwts, bearer headers, pem blocks and emails before it is inlined (`src/lib/zanoem/redact.ts`).
- storage at rest: IndexedDB, unencrypted, scoped to the browser profile. the room says "stored on this device" (`ZaliView.tsx:558`) and no longer shows an "encrypted" badge.
- leakage: the directive sends the project record, up to 40 material and 40 component names, the brain text and the full conversation to the chosen provider on every turn (`ZaliView.tsx:340`, `:373-384`). the export and the conversation download write the same to a file the operator chooses to keep. copy buttons use the clipboard only on click.
- a hostile brain file is bounded (40 KB each, 200 KB total) and redacted; it still becomes prompt text, which is the point of a brain.

## failure modes

| failure | what the operator sees | where |
| --- | --- | --- |
| project list cannot be read | toast "could not read projects" + reason; empty room still usable | `ZaliView.tsx:174` |
| create/rename/delete fails | toast with the store's message; state untouched | `ZaliView.tsx:228-230`, `:254-257`, `:270-271` |
| attach when no project | toast "pick a project first" | `ZaliView.tsx:278` |
| attach duplicate | toast "already in <project>" | `ZaliView.tsx:280` |
| no model key / provider error | toast "shepherd could not answer" + provider sentence; empty bubble removed; "last turn failed. retry" bar | `ZaliView.tsx:480-485`, `:639-647` |
| reply longer than 120 s | partial reply kept and stored; toast explains | `ZaliView.tsx:468-479` |
| operator presses stop | partial reply kept; no error | `ZaliView.tsx:468-475` |
| design_output rejected | toast "spec update ignored" + reason; record untouched | `ZaliView.tsx:443-444` |
| spec row write fails after a valid fence | toast "spec not saved"; in-memory state still updated for this session | `ZaliView.tsx:426-427` |
| analysis unreadable / provider error | inline `role="alert"` sentence; previous result stays | `ZaliAnalysisPanel.tsx:147`, `MaterialIntelligencePanel.tsx:255`, `:314` |
| library read/write fails | sonner toast "could not read/add/remove…" | `MaterialIntelligencePanel.tsx:51`, `:68`, `:79`; `ComponentLibraryPanel.tsx:48`, `:65`, `:77` |
| a panel throws | boundary: "this panel hit an error — try again" (per tab, keyed so switching tabs resets it) | `ZaliView.tsx:28-46`, `:602-604` |
| record has data but no viewport-known lists | viewport says so and points at "on record"; panel says see the specs tab | `Zali3DModel.tsx:43-49`, `ModelDetailsPanel.tsx:76-78` |
| clipboard refused | copy silently does not flip to "copied" | `ZaliChatPanel.tsx:34`, `:48`; `ZaliCodeOutputPanel.tsx:52` |
| private-mode localStorage | width falls back to 360 and is not remembered | `ZaliView.tsx:60-67` |

no path leaves a blank panel, a raw stack, or an endless spinner: the only spinners are the initial project read (text beside it) and the analysis buttons, which are disabled while a request is in flight and re-enabled in `finally`.

## interface & accessibility

- desktop (≥768px): header (title row unless v.2, tab strip, "stored on this device"), project bar, then tab content left and the chat panel right, resizable 260–600px by mouse drag or keyboard on a `role="separator"` (`ZaliView.tsx:611-633`; ←/→ 32px, shift 64px, home/end).
- phone (390×844): the chat panel is hidden; a chat toggle in the header opens a full-height overlay with its own close button and the retry bar (`ZaliView.tsx:583-590`, `:652-670`); escape closes it (`:117-125`). the six-tab strip is about 370px of buttons at 390px, so it scrolls under the `aureon-scroll-fade` mask and the active tab is scrolled into view (`:128-131`, `:562`). the viewport radius drops to 68/95px (`Zali3DModel.tsx:39`). library forms collapse to one column (`MaterialIntelligencePanel.tsx:155`). project rename/delete controls are always visible, not hover-only (`ZaliProjectSelector.tsx:149-157`).
- focus & keyboard: tabs are buttons with `role="tab"`/`aria-selected` and a visible focus ring; viewport items are buttons with `aria-label="<kind>: <label>"` and show their tooltip on focus (`Zali3DModel.tsx:108-131`); every icon-only button has an `aria-label`; enter sends, escape cancels forms.
- motion: ring/core spins are `motion-safe:` only (`Zali3DModel.tsx:57-58`, `:93`); no `animate-ping`, no pulsing dots.
- copy is lowercase except proper names (McMaster-Carr, Digi-Key, Mouser, RS) and protocol tokens (`[RESEARCH:`, ```design_output).
- empty states: no project (`ZaliWorkspace.tsx:41-53`), no spec (`:132-139`), nothing to lay out (`Zali3DModel.tsx:43-49`), no materials/components (`MaterialIntelligencePanel.tsx:181-185`, `ComponentLibraryPanel.tsx:167-171`), no findings (`ZaliResearchPanel.tsx:63-66`), no code (`ZaliCodeOutputPanel.tsx:112-120`).
- contrast: body copy is `text-foreground` / `text-muted-foreground`; the 9–10px helper lines at `/40–/50` opacity are below AA for small text and are a known debt (see open gaps).

## performance

- mount: one `zali_projects` read, then per project one `zali_messages` and one `zali_research` read (`ZaliView.tsx:183-218`); the analysis tab reads `zali_analyses` on open (`ZaliAnalysisPanel.tsx:50-67`); each library tab reads its table on open.
- no intervals. one `requestAnimationFrame` batcher during streaming (`ZaliView.tsx:325-336`), cancelled in `settle`. a single 120 s timeout cleared in `finally` (`:488`).
- listeners: keydown for escape (removed on change/unmount), drag listeners removed on mouseup and on unmount (`ZaliView.tsx:135-158`), `useIsMobile`'s media query listener (`src/hooks/use-mobile.tsx`).
- in-flight stream aborted on unmount (`ZaliView.tsx:115`); loads guard against late resolution with a `cancelled` flag.
- large lists: viewport caps at 12 items; library lists render in full (operator-sized); conversation renders in full (as before).
- media: none. workers: none.

## copy & voice

- "shepherd" everywhere the model is meant (`ZaliChatPanel.tsx:133`, `:162`, `:262`; `ZaliAnalysisPanel.tsx:127`; `MaterialIntelligencePanel.tsx:141`). "ZANOEM" survives only as internal identifiers (`zanoemOutput.ts`, `src/lib/zanoem/*`).
- no sign-in, account, or "kernel offline" language remains in the room. the delete dialog says "removed from this device" (`ZaliView.tsx:680`).
- estimates are called estimates on the result card itself (`ZaliAnalysisPanel.tsx:183`, `:231`, `:313`) and the summary tab says "nothing here is measured or looked up" (`ComponentLibraryPanel.tsx:241`).

## tests & proof

- unit: `zaliPrompt.test.ts` (findings parser, domain aliases, options fence, attach, spec lists, software detection, directive contents and truncation, export markdown, slug) — 13 tests; `zaliAnalysis.test.ts` (json extraction, four validators, prompt contents, `runAnalysis` with a mocked `askModel` for success / unreadable / key error) — 10 tests; `zanoemOutput.test.ts` — 5 tests. `npx vitest run src/components/dashboard/zali` → 28 passed.
- type check: `npx tsc --noEmit -p tsconfig.app.json` → exit 0.
- lint: `npx eslint` on every touched file → exit 0.
- end-to-end step (to drive once a browser is available): create "pocket lens" (physical product) → send "design a pocket magnifier with a glass lens and a brass ring" → pick an option → confirm a ```design_output lands (specs tab shows the json, workspace opens the viewport) → materials tab: add "glass", "add to pocket lens" → viewport shows a blue block labelled glass → specs → export .md → file contains `- materials: glass`.
- screenshots: not taken in this session (no browser allowed); the status block says so.

## open gaps

- no browser confirmation yet at 1440×900 and 390×844; the status line stays unconfirmed until the vision pass.
- the design contract rides in a leading user turn because `streamChat` exposes no `taskDirective`; `src/lib/local/prompts.ts` already has the slot. patch proposed below.
- the viewport is a 2-d orbit of labelled blocks drawn with css/svg; there is no three.js in `package.json` and no geometry in the record to render, so there is no 3-d model. the copy never calls it one.
- analysis is reasoning, not simulation; the tab says so, and an operator who needs a solver still needs a solver.
- helper text at 9–10px with 40–50% opacity is below AA contrast; a type-scale pass across rooms should lift it.
- "download all" in the code panel fires one download per file; the browser may ask to allow multiple downloads.
- the materials review asks shepherd about the whole library in one call; a library past a few hundred rows should be chunked.
- the first tab sits inside the 24px scroll-fade mask and reads slightly dimmed at rest; the mask is a shared class.

## review log

| # | finding | kind | fix | confirmed by |
| --- | --- | --- | --- | --- |
| 1 | "Sign in required — please sign in again" toast although a device identity always exists; `supabase.auth.getSession()` gate on every send | defect | gate removed; send uses the device identity directly (`ZaliView.tsx:291-305`) | tsc, read |
| 2 | chat sent only `[ZALI PROJECT] name…` as context: no instruction about ```design_output / ```options / research tags, so the specs, viewport and research tabs could never fill from a plain model | defect | `buildDesignDirective` carries the record, libraries and the fence contract (`zaliPrompt.ts:165-190`), sent as the first turn (`ZaliView.tsx:382-392`); unit-tested | vitest |
| 3 | "Encrypted" badge and "End-to-end encrypted" pill over unencrypted IndexedDB | defect | badge and pill removed; "stored on this device" (`ZaliView.tsx:558`) | read |
| 4 | admin "Blueprint" download fetched `/docs/ZALI_BLUEPRINT.md` which does not exist, gated on an owner email a device identity never has | defect (dead control) | removed | grep |
| 5 | realtime `supabase.channel` subscription whose handler ignored every event (all rows are this device's) | defect (dead code) | removed | grep |
| 6 | god mode tab: solfeggio frequencies, sacred geometry, "zero-point energy harvester", "third eye resonator" backed by nothing; its only calls were `zali-chat` invokes that answer "kernel offline" | defect (decorative claim, server call) | `GodModePanel.tsx` deleted, tab removed | ls |
| 7 | agents tab: six "available" specialist agents with no delegation code behind them | defect (decorative claim) | `ZaliAgentsPanel.tsx` deleted; research findings now come from `[RESEARCH: domain]` tags shepherd is instructed to emit | vitest |
| 8 | community tab duplicated the separate community room inside design and promised "join the community" on a single device | defect | tab removed from design; `CommunityView.tsx` left for its own room | read |
| 9 | simulations / manufacturing / optimize tabs called the `zali-analyze` edge function → always "kernel offline", toast "AI analysis failed"; passed `project.specs`/`project.materials` which were never set | defect (server call, state never written) | one analysis tab on `askModel` with validated json and persisted results (`zaliAnalysis.ts`, `ZaliAnalysisPanel.tsx`); results read back on open | vitest, tsc |
| 10 | materials "trends" tab claimed live trends the model cannot know; results written to tables never read | defect | review tab limited to failure modes and substitutions over the operator's own rows, with assumptions shown (`MaterialIntelligencePanel.tsx:243-321`) | vitest |
| 11 | materials view fabricated prices ("$12.49/kg"), density/hardness/yield figures and templated assembly steps from the array index | defect (invented data) | removed; view joins the spec to the operator's library and offers supplier searches only (`ZaliMaterialsView.tsx`) | read |
| 12 | components "compatibility" tab showed two hard-coded conflicts for any library; "hours saved" = reuses×4 from a column nothing writes; `success_rate`/`times_used` never written | defect (invented data) | removed; summary shows count, cost, longest lead, by type; "used in n projects" is computed (`ComponentLibraryPanel.tsx:88-109`) | read |
| 13 | viewport showed placeholder "Core Module / Power Unit / Interface Layer / Sensor Array" when the spec had nothing | defect (invented data) | honest empty state (`Zali3DModel.tsx:43-49`) | read |
| 14 | svg connection lines used `calc()` in `x2`/`y2` attributes, which svg does not evaluate | defect | px coordinates in a centred, sized svg (`Zali3DModel.tsx:63-89`) | read |
| 15 | scale bar "product → quantum (sub-Å)" and view modes "x-section / simulation" did nothing; "describe model appearance" input only echoed itself as a label | defect (dead controls) | removed; assembled/exploded remain and change the layout | read |
| 16 | no way to get a library item into the project; "add a component → see it in the viewport" impossible | defect | `attachToProject` + "add to <project>" buttons; viewport renders `specifications.components` | vitest (attachToSpec), tsc |
| 17 | specs "Export" button had no handler | defect (dead control) | `buildProjectExport` + download (`ZaliSpecsPanel.tsx:27-30`); unit-tested | vitest |
| 18 | delete dialog promised to remove messages and findings; the device store has no cascade, rows were orphaned | wrong claim + defect | cascade deletes added (`ZaliView.tsx:258-262`); dialog says "from this device" | read |
| 19 | 60 s wall clock aborted long replies silently; aborted partial replies were never stored | defect | 120 s with an explaining toast; partial reply kept and stored on any abort (`ZaliView.tsx:316-322`, `:468-479`) | read |
| 20 | research tag scan keyed on `[OPTIMUS]`-style agent names with a constant 0.8 "confidence"; "general" domain never displayed; engineering/sustainability never produced | defect | `extractResearchFindings` with eight domains and aliases, no invented confidence (`zaliPrompt.ts:8-56`) | vitest |
| 21 | capitalised copy throughout (Workspace, Materials DB, No Project Selected, New Project, UNDERSTANDING, Build 3D Model, Download All, "ZANOEM Design Intelligence", "Message ZANOEM…") | defect (copy) | lowercase; "shepherd" for the model; file names `asherin-design-*` | grep |
| 22 | phase descriptions overclaimed ("atomic-level design synthesis", "multi-scale physics simulation", "socratic questioning") | wrong claim | plain descriptions (`ZaliWorkspace.tsx:11-18`) | read |
| 23 | "Create a project to activate the holographic viewport" / "3D model" with no three.js and no geometry | wrong claim | "open the viewport"; narrative says what the viewport is | read |
| 24 | project rename/delete were `opacity-0` until hover → unreachable on a phone | defect | always visible (`ZaliProjectSelector.tsx:149-157`) | read |
| 25 | eleven tabs overflowed the 390px strip with the active one often off-screen | defect | six tabs, `role="tablist"`, active tab `scrollIntoView` (`ZaliView.tsx:128-131`) | read |
| 26 | title row duplicated the v.2 shell's title | defect | hidden under v.2 via `useIsV2` (`ZaliView.tsx:91`, `:548`) | read |
| 27 | two divergent `isSoftwareProject` implementations (substring vs token) | defect | one tokenised helper (`zaliPrompt.ts:139-148`), tested | vitest |
| 28 | `useAccess` imported and unused; `parseQuestionOptions` exported from a component file (fast-refresh warning) | defect (lint) | import removed; parser moved to `zaliPrompt.ts` with tests | eslint |
| 29 | `types.ts` carried stale tab ids and `specs`/`materials` fields no code set | defect | trimmed (`types.ts`) | tsc |
| 30 | raw error paths: `toast.error("AI analysis failed")` with no reason; `Turn failed` with raw message | defect | readable sentences inline with `role="alert"`; provider sentence passed through | read |

### shared-file patches (not applied; files owned outside this room — re-read 2026-10-25 before writing these)

1. `src/pages/Dashboard.tsx:1943-1948` — account-era fallback title.
   old:
   ```
         case "zali":
           return gatedView(
             "zali",
             ZaliView,
             "ZANOEM Design Lab",
           );
   ```
   new:
   ```
         case "zali":
           return gatedView(
             "zali",
             ZaliView,
             "asherin.design",
           );
   ```
2. `src/lib/dashboard/v2Titles.ts:39` — subtitle should say what the room is.
   old: `  zali: { title: "asherin.design", subtitle: "design exploration." },`
   new: `  zali: { title: "asherin.design", subtitle: "projects, specs, materials and a viewport, with shepherd." },`
3. `src/lib/navIntents.ts:206-207` — blurb and keywords.
   old:
   ```
       blurb: "design exploration",
       keywords: ["design", "zali", "ui", "lab", "sketch"],
   ```
   new:
   ```
       blurb: "design projects with shepherd on this device",
       keywords: ["design", "zali", "spec", "materials", "components", "viewport", "lab"],
   ```
4. `src/lib/ai.ts` — let a room hand `streamChat` a task directive for the system prompt (`buildSystemPrompt` already accepts `taskDirective`, `src/lib/local/prompts.ts:135`, `:150`). three edits:
   old (destructure, after `intelligenceContext,` at `src/lib/ai.ts:139`): `  intelligenceContext,`
   new: `  intelligenceContext,\n  taskDirective,`
   old (type, `src/lib/ai.ts:157`): `  intelligenceContext?: string;`
   new: `  intelligenceContext?: string;\n  taskDirective?: string;`
   old (`src/lib/ai.ts:209`): `    intelligenceContext,`
   new: `    intelligenceContext,\n    taskDirective,`
   once applied, `ZaliView.tsx:386-392` can pass `taskDirective: directive` and drop the synthetic "understood." turn.
5. `src/components/dashboard/EncryptionBadge.tsx` — says "Encrypted" / "E2E Encrypted" over IndexedDB for every room that still mounts it; this room stopped mounting it. owners of the other rooms should decide whether the component survives.
6. `src/components/dashboard/zali/CommunityView.tsx` — belongs to the community room: four `no-explicit-any` lint errors (`:68`, `:82`, `:97`, `:157`) and an unused `Filter` import (`:4`). not touched here.

## vision confirmation — 2026-10-26

screens: final3-d-zali.png and final3-m-zali.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: workspace tabs and the empty "create a project" state render. defect seen and fixed: the "new project" button and room icon used the live-signal green, and the screen was shifted up 12 px by a scroll-into-view acting on the overflowing shell.
- fixed: green removed from primary actions; the sidebar card no longer overflows the window, so the shell cannot shift (the sweep now measures this and reads 0 px on every target).
