```
room: asherin.agents   view id: zahten   files: src/components/asher/AsherZahtenModule.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

supporting files: `src/components/asher/AsherPublishedTabRenderer.tsx` (the published tab frame and run bridge), `src/lib/zahten/prompts.ts`, `src/lib/zahten/parse.ts`, `src/lib/zahten/store.ts`, `src/lib/zahten/runtime.ts`, `src/lib/zahten/scheduler.ts`, tests in `src/lib/zahten/__tests__/zahten.test.ts`.

## purpose & promise

asherin.agents is an agent forge that runs on this device. the operator describes an agent in a sentence or two; shepherd first checks the description for what is missing (`ASSESSOR_SYSTEM`, prompts.ts:49), then writes a spec, a numbered workflow, portable typescript and a test plan in up to six self-critiquing passes (`BUILDER_SYSTEM`, prompts.ts:8; `build`, AsherZahtenModule.tsx:371). the operator reviews and refines (AsherZahtenModule.tsx:434), runs the agent here — "run now", or every n minutes while asherin stays open in this browser tab (runtime.ts:32; scheduler.ts:51) — and can publish it as a tab inside asherin (store.ts:282) that lists in the sidebar under agents and runs the agent from its own button (AsherPublishedTabRenderer.tsx:53).

the promise the interface makes, in its own words (AsherZahtenModule.tsx:652–654): "an agent here is shepherd following a workflow you approved. it runs when you press run, or on an interval while asherin stays open. nothing fires from a closed tab." what it does not promise: cron, webhooks, a server, external credentials, or executing the generated code. a run is the model reasoning over the operator's pasted input and the agent's workflow (prompts.ts:69–79); steps that would need a service are marked "(not reachable from this device)" (prompts.ts:74).

## entry & navigation

- sidebar group "make", label `asherin.agents`, codename "agent forge", blurb "build and publish an agent", keywords agent/agents/zahten/forge/workflow/deploy (navIntents.ts:209–217).
- deep link `/dashboard/zahten`; `zahten` is in VALID_VIEWS (Dashboard.tsx ~188) and rendered by `case "zahten"` (Dashboard.tsx:1984). v.2 shell title comes from v2Titles.ts:35 (`title: "zahten"` — see shared-file patch 3; the room's own copy says asherin.agents everywhere).
- a published agent is its own view, `agent:<uuid>`, accepted by `resolveView` (Dashboard.tsx ~223) and rendered through `AsherPublishedTabRenderer` (Dashboard.tsx:1889) from the `publishedAgents` list loaded from `asher_agents` where `status = "published"` (Dashboard.tsx:1063–1082); the list refreshes on the `asher-agents-updated` event the store dispatches (store.ts:68, 310, 319).
- first load: `ensureSeeded` (store.ts:192) reads `zahten_agents`; if empty it imports the previous build's localStorage agents once (store.ts:197–210) or seeds two clearly marked examples (store.ts:88); the first agent becomes active (AsherZahtenModule.tsx:111–125). on a phone the list pane is what loads (pane state defaults to "list", AsherZahtenModule.tsx:93); on wider screens list and detail show together.

## workflow

happy path:
1. new agent — the shell's primary action (`V2Action`, AsherZahtenModule.tsx:600) or the list's own button when the shell slot is absent (AsherZahtenModule.tsx:611–615) → `createAgent` (store.ts:216) → detail pane, builder tab (AsherZahtenModule.tsx:238–248).
2. describe — textarea (AsherZahtenModule.tsx:713); saved 700 ms after typing stops (AsherZahtenModule.tsx:213–221). the agent name is editable in the header and committed on blur (AsherZahtenModule.tsx:265–277).
3. assess and build — one button (AsherZahtenModule.tsx:371–432). `assess` (291) checks a model is connected (`requireModel`, 75), asks shepherd with `ASSESSOR_SYSTEM`; READY continues straight into pass 1, CLARIFY shows 2–4 questions with optional answers (AsherZahtenModule.tsx:770–795) and a second press builds with the answers folded in (`enrichedObjective`, 321). passes stream into the log (`streamPass`, 327; `onDelta`, 343) through `streamChat` in code mode; each finished pass is saved as the agent's spec (`commitPass`, 350) and the loop stops at `STATUS: COMPLETE` or the pass limit (1–6, default 3; AsherZahtenModule.tsx:60–61, 724–735). the spec's own name and interval trigger are adopted when the operator has not set them (AsherZahtenModule.tsx:356–358); building clears the example mark (354).
4. review — spec tab: workflow steps, "needs outside this device", the full latest pass (AsherZahtenModule.tsx:859–895); code tab: the typescript block with copy (897–922). refine box re-emits a full pass from an instruction (`refine`, 434).
5. run — runs tab: standing input (saved, reused by every run; AsherZahtenModule.tsx:928, 222–230), run now (`runNow`, 478 → `runAgent`, runtime.ts:32), interval off/5/15/30/60/180 min (`setTrigger`, 501; scheduler.ts:51), history newest first with log, output, copy (AsherZahtenModule.tsx:975–1017).
6. publish — tab tab: preview in the real frame (`TabFrame`, AsherZahtenModule.tsx:1063), html editor saved on blur (1065–1073), "ask shepherd to change the page" (`askTab`, 520), publish / update tab (`publish`, 545 → store.ts:282), open tab (`openTab`, 576 → `/dashboard/agent:<id>`), unpublish (565 → store.ts:314).

secondary paths: stop a build (`stopBuild`, 473; the last good pass is kept, 423–427), stop a run (AsherZahtenModule.tsx:936–940), reset scope (759), reset the tab page to the default (`resetTab`, 512), remove an agent with inline confirm — also removes its tab and runs (AsherZahtenModule.tsx:679–688; store.ts:250–258), back to the list on a phone (AsherZahtenModule.tsx:666), copy code or output.

## state & data

| state | where | shape | lifetime | leaves the device? |
| --- | --- | --- | --- | --- |
| agents | IndexedDB table `zahten_agents` via the shim (store.ts:62) | `ZahtenAgent` (store.ts:25–44): id, name, objective, status draft/built/published, trigger manual/interval(minutes), spec_text, passes (last 8, store.ts:71), standing_input, tab_html or null, published_id, example, timestamps | until removed | no |
| runs | `zahten_runs` (store.ts:63) | `ZahtenRun` (store.ts:48–60): agent_id, source manual/interval/tab, status, input (≤60k chars, runtime.ts:22), log[], output, error, started/ended | newest 50 per agent (store.ts:70, 352) | no |
| published tab | `asher_agents` row (store.ts:64, 282–311): name, entry_html, status "published", visibility "private", metadata {zahten_agent_id, spec_text ≤40k, objective, trigger, workflow_steps} | until unpublished or the agent is removed | no |
| connect trace | `asherin_connect_pulls` row per run via `emitPull` (runtime.ts:55, 62): organ zahten, capability "agent run", masked quote = agent name | per connect's own rules | no |
| interval timers | module-level map in scheduler.ts:44 | agent id → minutes, handle, nextAt | while this browser tab lives; re-armed on room mount (AsherZahtenModule.tsx:132–141) | — |
| in-flight run guard | `inflight` set, runtime.ts:25 | agent ids | per run | — |
| react | objective, scope, passes, building, notice, followUp, runs, runInput, tabHtml, tabDirty, tabAsk, pane, tab, confirmRemove (AsherZahtenModule.tsx:144–166, 93–99) | — | per mount; reset on agent switch (168–189) | — |
| legacy | localStorage `zahten.agents.v1` / `zahten.activeAgentId.v1` (store.ts:73–74) | read once, imported, then removed (store.ts:197–210) | gone after first open | no |
| model key | the device vault (`getActiveModel`, keys.ts) — read by `src/lib/ai.ts`, never by this room | — | — | only inside the provider request |

nothing in this room is written to localStorage any more. no secret of any kind is collected: the earlier "secrets required" inputs are gone; the spec's "needs outside this device" line is shown as information only (AsherZahtenModule.tsx:881–885).

## logic

- `parseStatus` (parse.ts:17) accepts `STATUS: COMPLETE`, the older `MISSION_COMPLETE`, and `REFINING`; null when absent, which the builder treats as "not complete" and keeps iterating to the cap.
- `parseAssessor` (parse.ts:24) → READY with a restatement, CLARIFY with 1–5 questions; a malformed answer counts as ready (first 240 chars as the restatement) so a model that ignores the format never blocks the operator.
- `parseSpecName` / `parseSpecTrigger` (parse.ts:50, 58) read `- name:` and `- trigger:` lines; intervals are clamped to 5 min – 24 h (`clampInterval`, parse.ts:72) so a timer can never spin every second or sit beyond a day.
- `parseNeeds` (parse.ts:78) reads "needs outside this device" (and the old "secrets required") into ≤12 labels; none/n-a/— mean empty.
- `parseWorkflowSteps` (parse.ts:90) takes numbered lines under **WORKFLOW** up to the next heading, label cut at " — ", ": " or " | ", ≤80 chars, ≤16 steps.
- `extractCode` (parse.ts:106) first ```ts/```typescript block, else any fenced block, else empty.
- `parseRunReply` (parse.ts:121) splits a run into `step n · …` lines and the text after **OUTPUT**; a reply without the marker is kept whole as the output.
- `buildTabHtml` (parse.ts:171) escapes every model- or operator-provided string (`escapeHtml`, parse.ts:138), embeds the agent id in `<meta name="zahten-agent">`, a no-network CSP (`TAB_CSP`, parse.ts:142) and the postMessage bridge (parse.ts:237–245). `ensureCsp` (parse.ts:146) adds the policy to any page that lacks it.
- `diffSchedules` (scheduler.ts:23) computes which timers to start/stop so running timers match the stored agents; `desiredFrom` (scheduler.ts:36) only arms agents that have a spec and an interval.
- `migrateLegacy` (store.ts:126) imports the operator's own earlier agents and skips the three former demo ids; `runsToTrim` (store.ts:360) names the rows beyond the cap.
- `commitPass` (AsherZahtenModule.tsx:350) keeps the last 8 passes, promotes status draft→built (published stays published), adopts the spec name when the agent is still "untitled agent", adopts an interval trigger only if the operator left it manual.

## integrations & network

one kind of outbound call: the operator's model provider, through `src/lib/ai.ts` (`askModel` for the assessor, tab edits and runs; `streamChat` for build passes). the key is read from the device vault inside `resolveActiveModel` (ai.ts:60–95); this room never touches it. before each call the room checks a model is selected (`requireModel`, AsherZahtenModule.tsx:75) and, if not, opens the key dialog with the hint "connect a model key in settings → intelligence…" (62; also the builder hint, 762).

| call | where | payload | bound | abort |
| --- | --- | --- | --- | --- |
| scope assessor | AsherZahtenModule.tsx:289 | `ASSESSOR_SYSTEM` + the description | maxTokens 600 | AbortController per call (285–286) |
| build pass | AsherZahtenModule.tsx:331–346 | builder doctrine (+ routed operator brains ≤24k chars, 280–289) + objective/clarifications + prior passes | one call per pass, ≤6 passes | stop button aborts the controller (473) |
| refine | AsherZahtenModule.tsx:449–458 | objective, latest spec, instruction | one call | same controller |
| run | runtime.ts:50–51 | run doctrine + spec (≤24k) + input (≤60k) | maxTokens 4000 | signal from the runs tab (AsherZahtenModule.tsx:487–491); interval and tab runs carry none |
| tab edit | AsherZahtenModule.tsx:529 | `TAB_EDITOR_SYSTEM` + current html + instruction | maxTokens 8000 | none (single call) |

brains routing (`routeBrainsForPrompt`, asherBrainRouter.ts) reads the local `asher_brains` table only; no network. retries live in `completeLlm` (llm.ts:363: 3 attempts on rate-limit/busy). offline: the provider call fails with the lowercase LlmError from llm.ts ("could not reach …") and the room shows it inline. `supabase.functions.invoke` is not used anywhere in this room.

## security & privacy

- the published page runs in an iframe with `sandbox="allow-scripts"` only (AsherPublishedTabRenderer.tsx:84): opaque origin, no forms, no popups, no same-origin access to IndexedDB or the vault. every page gets a content-security-policy of `default-src 'none'` (parse.ts:142; injected when missing, AsherPublishedTabRenderer.tsx:31), so a model-written or operator-edited script cannot fetch, beacon or load anything.
- the only bridge is postMessage. the frame accepts messages only from its own `contentWindow` (AsherPublishedTabRenderer.tsx:42) and only two types; what it posts back is the run's log/output and the last ten runs (68) — never a key, a row id beyond the run's own, or the spec.
- the agent id travels in the page's meta tag (parse.ts:155) so a tab can name its agent; `resolveRunnable` (runtime.ts:72) takes the forge row or the spec stored at publish time, never anything the page sends.
- injection: everything placed into the default page is escaped (parse.ts:138, 172–176, tested). the model's spec text is rendered in `<pre>` as text, never as html. a hostile spec can only make a run reason badly, and the run is a read-only model call.
- secrets: none are asked for or stored. the hint copy names where the key lives (settings → intelligence) and nothing else. run input is kept in IndexedDB as typed — the room says so beside the box ("saved with the agent", AsherZahtenModule.tsx:932).
- exports/clipboard: copy buttons copy the generated code or a run output the operator chose (AsherZahtenModule.tsx:904, 1004); nothing is copied silently.
- the connect trace masks the quote (emitPull.ts `maskQuote`) and carries only the agent name.

## failure modes

| failure | what the operator sees |
| --- | --- |
| IndexedDB blocked / unavailable | list pane notice "could not open the agent store on this device: …" with try again (AsherZahtenModule.tsx:617–623); the shim falls back to memory for the session |
| no model key | key dialog plus inline "connect a model key in settings → intelligence…" (75–80, 293–296, 378–381) |
| assessor call fails | inline red notice "shepherd could not assess the scope: …", scope back to idle (313–316) |
| a pass fails | that pass marked error with the message appended, red notice "pass n failed: …", build stops, earlier passes kept (398–404) |
| build stopped by the operator | running pass marked "stopped by you", last good pass saved (423–427) |
| pass cap reached without COMPLETE | info notice "stopped at the pass limit (n). the spec is saved; refine it below…" (412–416) |
| pass written but not saved | red notice naming the storage error (366–368) |
| run fails (model error, offline) | run row status failed with the error text, toast "the run failed: …" (runtime.ts:57–63; AsherZahtenModule.tsx:493) |
| run while another is in flight | toast "this agent is already running…" (runtime.ts:33) |
| run with no spec | notice "build the agent first…" and the builder tab (480–484) |
| tab edit returns no page | "shepherd did not return a whole page. try a smaller change." (531) |
| publish fails | "could not publish: …" under the publish button (557) |
| published row deleted elsewhere | republish inserts a fresh row instead of failing (store.ts:300–306) |
| tab page without an agent id | the page shows "this page carries no agent id. publish it again from asherin.agents." (AsherPublishedTabRenderer.tsx:47) |
| agent behind a tab removed | "the agent behind this tab is gone. rebuild it in asherin.agents and publish again." (60) |
| no pass contains code / steps | spec and code tabs say so in a sentence instead of an empty box (870, 918) |

no raw stacks: every message is `e.message` in a sentence (`errText`, AsherZahtenModule.tsx:64). the only spinner is the first load, bounded by the store call resolving or failing (587–593).

## interface & accessibility

- desktop: a 256 px agents rail and a detail column (AsherZahtenModule.tsx:604, 660). detail = header (name input, status pill, example pill, remove with inline confirm) → horizontal tab strip (builder · spec · code · runs · tab) → scrolling content capped at 5xl.
- phone (<768 px): one pane at a time. the list is full-width; tapping an agent opens the detail; a back arrow returns (pane state, 93; classes at 604 and 660; back button `md:hidden`, 666). tabs scroll horizontally in one row with no wrapping (691–705). no letter-spaced uppercase labels remain, so no vertical columns of letters; body copy is normal-case sentences at 11–14 px. gutters are 16 px (`px-4`) rising to 24 px at `sm`.
- focus order follows the DOM: name → remove → tabs → content. tabs carry `role="tablist"`/`role="tab"`/`aria-selected` (691–699). icon-only buttons have `aria-label` (666, 685, 845, 1073, 1092). `role="status"` on notices (802, 1045).
- contrast: body text on `text-foreground/85` and `muted-foreground/70`; error text on red-300/400 over a red-500/5 tint; amber only for "needs outside this device" and "edited".
- motion: spinners on in-flight calls only; the pass log scrolls to its end while building (208–210). no pulsing dots, no fake heartbeats.
- empty states: no agents ("no agents yet. press new to describe one.", 626), no spec ("no spec yet. build the agent in the builder tab."), no runs ("no runs yet."), no code, no steps — each a sentence.

## performance

- mount: one IndexedDB read of `zahten_agents` (plus a one-time seed/migration), one `zahten_runs` read for the active agent. no polling.
- timers: interval runs use one `setInterval` per scheduled agent, 5 min minimum, kept in a module-level map (scheduler.ts:44) that outlives the room by design and is cleared when the browser tab closes. the room re-syncs the map from stored agents on every agents change (AsherZahtenModule.tsx:132–141); nothing is duplicated because `diffSchedules` only starts what changed.
- debounces: objective and standing input save 700 ms after typing stops; timers cleared on change (213–230).
- unmount: build and run controllers aborted (200–205); the message listener in `TabFrame` removed (AsherPublishedTabRenderer.tsx:76).
- large text: passes capped at 8 per agent, runs at 50, run input at 60k chars, spec in the run prompt at 24k, published spec at 40k. the pass log `<pre>` is max-h 420 px and scrolls.
- the iframe preview re-renders only when the html changes (`useMemo`, AsherPublishedTabRenderer.tsx:31).

## copy & voice

all copy on screen is lowercase except proper names and the model's own text. the model is "shepherd" throughout (builder hint, notices, tab chat placeholder). the key lives at "settings → intelligence" (KEY_HINT, AsherZahtenModule.tsx:62; builder hint 762). no plan, tier, team, organisation, sign-in, admin or "deploy live" language remains in the room. no "kernel offline" anywhere: every function has a device answer. what the device cannot do is said plainly where the operator would look for it — the interval card ("a browser cannot fire from a closed tab, so there is no cron or webhook here", 968), the code tab ("this device does not execute it", 913), the spec tab ("this device cannot reach them", 883).

## tests & proof

- `src/lib/zahten/__tests__/zahten.test.ts` (17 tests, all passing): status/assessor parsing, spec name/trigger/needs, interval clamp, workflow steps, code and spec extraction, run reply split, trigger label, published-page escaping and bridge markers, csp injection, schedule diffing and arming rules, legacy migration, example flags, run trimming, and a full store round-trip on fake IndexedDB: create → build → publish → republish same id → resolve from the tab's id → run row → unpublish → remove.
- `npx tsc --noEmit -p tsconfig.app.json`: no errors in `src/components/asher/**` or `src/lib/zahten/**` (other rooms' in-progress errors exist in the tree this round).
- `npx eslint` on the touched files: clean.
- end-to-end step: describe → assess and build → spec/code tabs → runs tab run now → tab tab publish → open tab → press run now inside the tab. drives `streamChat`/`askModel` against the operator's provider; not run here (no browser this round).
- screenshots at 1440×900 and 390×844: pending; the layout is written to the phone contract above and needs the eye.

## open gaps

- an interval only fires while asherin stays open in a browser tab; there is no cron, no webhook, no background worker. said on the interval card.
- the generated typescript is not executed on the device. a run is shepherd following the workflow; the code is portable for the operator to run elsewhere. said on the code tab.
- an agent cannot reach any service: no api calls, no mail, no chat posts. steps that need one are marked "(not reachable from this device)" in the run log. the spec tab lists them.
- the run input is one standing text per agent; there is no file attachment for runs yet.
- the published tab's run button works only while asherin hosts the frame (it is a postMessage bridge); the page has no life outside asherin by design.
- shared files still carry capitalised labels for published agents ("Deployed Agents" / "Agents") and the v.2 title says "zahten" rather than asherin.agents — patches proposed below, not applied from this room.

## review log

| # | finding | kind | fix | confirmed by |
| --- | --- | --- | --- | --- |
| 1 | room was framed as a Trigger.dev fork with cron/webhook/event triggers and "production-grade deployments"; none can run from a browser | defect | rewritten as a device-run forge: prompts.ts (builder, assessor, run doctrines), AsherZahtenModule.tsx header comment and all copy; trigger model is manual / interval-while-open (parse.ts:11, scheduler.ts) | tests + code read |
| 2 | classification dropdown (SECRET default), compliance matrix (FIPS/FedRAMP/ITAR…), gov integrations (JWICS, SIPRNet…), emergency protocols, "Platform" tab — theatre with no behaviour | defect | removed entirely; no classification is stored or sent | code read |
| 3 | three demo agents seeded as the operator's own with fabricated "cron 0 7 * * *", "webhook", "lastRun: 2h ago" | defect | two examples marked `example: true` with draft status and no history (store.ts:88–123), shown with an "example" pill (AsherZahtenModule.tsx:642, 677), removable, and the mark clears once shepherd builds them (354); legacy demo ids are skipped on migration (store.ts:138) | tests ("ships examples that are marked…", "carries the operator's legacy agents…") |
| 4 | "deploy live" started a fake heartbeat that synthesised runs every 12 s and marked steps green — invented execution | defect | removed; a run is a real model call recorded with log/output (runtime.ts:32–66) | code read |
| 5 | "secrets required" inputs stored secret values in plaintext localStorage and claimed they were "injected into the deployed agent" | defect | removed; no secret is collected; "needs outside this device" is information (AsherZahtenModule.tsx:881–885) | code read |
| 6 | admin tab listed "every agent ever published across all users" via owner-email hash; account/plan language (visibility team/organisation/public, "Sign in required", "Available on the Chat plan") | defect | admin tab and visibility picker removed; publish writes visibility "private" and needs no sign-in (store.ts:282–311); room copy has no account language | code read |
| 7 | agents persisted in localStorage; everything else in the app uses IndexedDB via the shim | defect | `zahten_agents` and `zahten_runs` tables (store.ts); one-time migration from the old keys (store.ts:192–214) | test "creates, builds, publishes…" |
| 8 | phone (390×844): two panes squeezed, "CLASSIFICATION" as a column of letters, builder text one word per line | defect | list→detail navigation under `md` with a back button (AsherZahtenModule.tsx:93, 604, 660, 666); horizontally scrolling tabs (691); no tracked-uppercase labels | layout read; screenshots pending |
| 9 | copy capitalised throughout ("Assess & Build", "Publish & Deploy", "House of Asher / ZAHTEN"), "AI" for the model, stale key location "Settings → Bring Your Own LLM Key" | defect | all lowercase, "shepherd", "settings → intelligence" (AsherZahtenModule.tsx:62, 762) | code read |
| 10 | errors surfaced only as toasts; a failed pass left "_Error: …_" markdown in the log | defect | inline `notice` with role=status for every failure (AsherZahtenModule.tsx:800–808), passes end with a sentence (400, 424) | code read |
| 11 | published tab iframe allowed forms/popups/modals and had no csp: a model-written page could post forms or open windows; `bg-white` behind a dark page | defect | `sandbox="allow-scripts"` and a `default-src 'none'` policy injected into every page (AsherPublishedTabRenderer.tsx:31, 84; parse.ts:142–153) | test "adds the policy…" |
| 12 | published tab was a static page: nothing in it could run the agent | defect | postMessage run bridge, source-checked (AsherPublishedTabRenderer.tsx:40–74), default page with run button, log, output, recent runs (parse.ts:171) | test "carries the agent id…" |
| 13 | published-tab header "◈ NAME · Published Tab" uppercase | defect | lowercase name, "published from asherin.agents · runs on this device" (AsherPublishedTabRenderer.tsx:94–96) | code read |
| 14 | zip (≤100 MB) / file / image / link attachments to the tab-editor chat, extracted with JSZip into the prompt | defect (scope creep, unbounded prompt) | removed; the tab editor takes one instruction and returns one page (AsherZahtenModule.tsx:520–543) | code read |
| 15 | up to 8 passes by default at "deep" depth per build | defect (cost, no bound in copy) | default 3, cap 6, "each pass is one model call" beside the control (AsherZahtenModule.tsx:60–61, 733) | code read |
| 16 | "Repository" link to an external github fork in the room's footer | defect | removed | code read |
| 17 | build loop and follow-up wrote passes to state on every delta and the whole agent list to localStorage on every change | defect (churn) | deltas update react state only; the store is written once per finished pass (`commitPass`, 350) | code read |
| 18 | first draft of this narrative claimed "assess then build needs two clicks" | wrong claim | `build` continues into pass 1 when the assessor says READY (AsherZahtenModule.tsx:373–378); narrative corrected | code read |
| 19 | first draft said "the room re-reads the agent list on an agents-changed event" — the listener was removed because it could overwrite a name mid-edit | wrong claim | listener removed; events still emitted for other consumers (store.ts:66, 77); narrative corrected | code read |
| 20 | interval "next at" was not shown until the next unrelated render | defect | the schedules effect bumps a render when timers moved (AsherZahtenModule.tsx:138–139) | code read |
| 21 | unit coverage: none for the room's parsing or persistence | defect | `src/lib/zahten/__tests__/zahten.test.ts`, 17 tests | `npx vitest run src/lib/zahten` |
| 22 | shared files: v2 title "zahten", sidebar "Deployed Agents"/"Your Zahten-deployed agents"/"Agents", renderer not given the agent id | defect (shared) | patches proposed in the report, not applied here | — |

## vision confirmation — 2026-10-26

screens: final3-d-zahten.png and final3-m-zahten.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: the agent list with its two examples and the builder (describe → assess and build) render; on phone the list stacks above the builder.
