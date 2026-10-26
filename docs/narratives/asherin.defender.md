```
room: asherin.defender   view id: asherin-defender   files: src/components/dashboard/defender/AsherinDefenderView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

version 1 was written against the code as found; its hostile read produced the defects in the
review log at the end, every one of which is now fixed in the room's own files. this is the
replaced narrative, written against the corrected code. every claim names a file and a line and
carries an evidence status (observed · inferred · hypothesized · contradicted · unknown · verified).
the screenshot pass (method step 5) did not run this round because the browser and dev server are
owned by another process; the status block says so instead of claiming it. the person's own
screenshots from today (desktop and 390×844) were read as evidence for layout claims and are
cited where used.

## purpose & promise

asherin.defender is a device-security posture room with exactly one measuring surface: the browser
tab it runs in. it holds a register of 186 named protections across 18 categories
(`src/lib/defender/protections.ts:68-290`, count exported at `:338` — observed), asks the page to
measure every protection a tab can genuinely see (`src/lib/defender/browserProbe.ts:108` —
observed), and shows the rest as `unmeasured`, never green (`src/lib/defender/posture.ts:39-62`
— observed, verified by `posture.test.ts` "marks anything nobody measured as unmeasured"). it
offers two local counter-measures that reach this page only — a bunker that freezes tracker
beacons sent from this origin (`signals.ts:90`) and a covert-camera law that stops a video track
this page opens with no visible preview (`src/lib/defender/covertCamera.ts:58-110`) — and it
exports every reading as plain, unsigned json (`posture.ts:122-146`).

the promise the interface makes: "186 named protections. N of them have a reading from this
browser (x%) — the other M are outside what a browser tab can read, and stay unmeasured rather
than green" (`AsherinDefenderView.tsx:196-199` — observed). the score is shown as "/ 1000 ·
across the N measured" (`:205`) and is withheld ("—") when nothing was measured. the earlier
edition shipped a device agent and a native companion; both were removed before this review
(`git log 63b262f`), and the room no longer names either (verified by grep: no "agent",
"companion" or "arm this tab" copy remains in `src/components/dashboard/defender` or
`src/lib/defender` outside the type name `FindingSource = "agent"` at `posture.ts:12`, which is
documented there as the surface this edition does not have).

## entry & navigation

- sidebar / command palette intent: `src/lib/navIntents.ts:72-80` — view `asherin-defender`,
  label `asherin.defender`, group "watch" (observed). its blurb still reads "Your device — 186
  named protections, measured honestly from this browser" with a capital Y and a hard-coded
  count: shared file, patch proposed below.
- deep-link aliases: `src/pages/Dashboard.tsx:200` maps `defender` → `asherin-defender`
  (observed).
- wired at `src/pages/Dashboard.tsx:1897-1901` through `gatedView("asherin-defender",
  AsherinDefenderView, "asherin.defender")` (observed); `asherin-defender` is listed among the
  framed `data-asherin-room` rooms at `Dashboard.tsx:190` (observed). `canAccess` is always
  true for a non-retired view (inferred from `gatedView`'s fallback at `:1876-1879` being the
  retired-room branch only).
- v.2 shell title: `src/lib/dashboard/v2Titles.ts:25` — "asherin.defender" / "your own device,
  watched honestly." (observed).
- lazy-loaded via `lazyWithRetry` (`Dashboard.tsx:62` — observed).
- first paint: the posture tab, "needs attention" filter, with the headline "measuring what this
  browser can see." until the first probe resolves (`AsherinDefenderView.tsx:177-178` —
  observed). the probe starts from the `armed` effect on mount (`:131-133`).

## workflow

happy path — **rescan → export evidence** (the machine narrative below states the contract):

1. mount → `scan()` (`AsherinDefenderView.tsx:66-87`) calls `probeBrowser()`
   (`browserProbe.ts:108`), which pushes one `Finding` per protection it could read and one
   explicit `gap` per protection it looked at and found it cannot read (`browserProbe.ts:20`).
2. `buildPosture(browserFindings)` lays the readings over the register (`posture.ts:39`);
   `scorePosture` tallies pass/warn/fail/unmeasured, the measured count and the weighted score
   over measured rows only (`posture.ts:77-97`).
3. the header shows headline, counts, score; the "needs attention" list shows fail and warn rows
   worst-first (`triage`, `posture.ts:110`); "full register" groups all 186 by category with a
   per-category "n/m measured" (`:288-304`).
4. "rescan browser" re-runs the probe; the button is disabled and reads "measuring" while a scan
   is in flight (`:228-233`).
5. "export evidence" writes `asherin-defender-<timestamp>.json` with register size, score,
   `signed: false`, `measured_by: { surface: "browser", bunker: off|dry-run|applied }` and every
   row's state, source, observed text, action and timestamp (`:106-116`, `posture.ts:122-146`).

secondary paths:

- **bunker** (`this browser` tab): the switch and the dry-run/apply toggle together produce
  `armed = bunker && !dryRun` (`:93`). only when armed does the room install the fetch/sendBeacon
  wrapper and switch covert-camera enforcement on; otherwise it restores (`:94-98`). any change
  to `armed` rescans (`:131-133`) so `br.tracker-blocking` and `br.devtools-hooks` reflect the
  new state. the header copy distinguishes "frozen" / "rehearsing — nothing is frozen yet" /
  "not frozen" (`:334-340`).
- **grant a device to measure it**: two pickers, bluetooth (`signals.ts:30`) and hid
  (`signals.ts:44`); each is followed by a rescan so `bt.paired-inventory` and
  `per.hid-duplicate` can read the newly granted device (`:135-156`). a cancelled picker says
  "no device was chosen." (`:140`, `:151`).
- **covert-camera law**: `watchCamera` subscribes on mount and polls every 1.5 s
  (`covertCamera.ts:142`); the card shows the verdict detail and whether enforcement is on
  (`:404-427`).
- no delete, edit or retry paths exist beyond rescan; there is nothing stored to delete.

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| `browserFindings`, `scanning`, `scanFailed`, `tab`, `only`, `bunker`, `dryRun`, `note`, `camera` | react (`AsherinDefenderView.tsx:57-64`) | primitives + `Finding[]` + `CameraState` | component | no |
| bunker module state: `bunkerOn`, `fetchOrig`, `beaconOrig`, `blocked` | module singletons (`signals.ts:62-65`) | booleans, bound functions, counter | tab lifetime (survives unmount; wrapper never uninstalled) | no |
| camera watch: `tracked` tracks, `listeners`, `enforcing` | module singletons (`covertCamera.ts:33-37`) | sets, boolean | tab lifetime | no |
| connect ledger row per scan / bunker toggle | indexeddb table `asherin_connect_pulls` via the postgrest shim (`src/lib/connect/emitPull.ts:86-110`, `src/lib/local/postgrest.ts:431-444`) | masked quote, status, latency | persistent | no |
| evidence export | a blob the operator downloads (`:106-116`) | json | operator's filesystem | only by the operator's own action |

nothing in this room writes `localStorage` any more (the "armed tab" flag and the key-poison
history were removed with the dead control — verified by grep for `localStorage` in
`src/lib/defender`: no hits). no react state is written but never read (the previous
`companionTick`/`proActions` pair was; removed).

## logic

- **register merge** (`posture.ts:39-62`): readings with an unknown id are dropped; a later
  reading replaces an earlier one only if the earlier was `unmeasured` or the later is `fail`;
  anything without a reading gets `{state:"unmeasured", source:"none"}` with copy that depends on
  whether the protection is agent-only ("a browser tab cannot read this") or browser-readable
  ("this browser gave no reading for it"). an explicit `gap` from the probe (`source:"browser"`,
  `state:"unmeasured"`) lands so its explanation shows, and is replaced by any real reading
  (verified: `browserProbe.test.ts` "a real reading replaces an explicit gap").
- **score** (`posture.ts:77-97`): severity weights critical 8 / high 5 / medium 3 / low 1; pass
  earns full weight, warn 40 %, fail 0; unmeasured rows are skipped for both earned and possible,
  and counted in `coverage` and `measured`. `score` is 0 when `possible` is 0 and the view then
  shows "—" and "no score without a reading" (`AsherinDefenderView.tsx:204-206`; verified:
  `posture.test.ts` "gives no score at all when nothing was measured").
- **triage** (`posture.ts:110-119`): fail → warn → unmeasured → pass, then severity, then id.
- **probe rules** (`browserProbe.ts`): every `pass` corresponds to a protection whose title the
  measurement honestly satisfies. readings that were merely observations in v1 are now either
  explicit gaps (`net.captive-portal :167`, `br.background-tabs :334`, `srv.covert-mic :374`,
  `net.link-quality` when the api is absent `:148`, `dev.clock-skew` when no date header `:134`)
  or protections whose title was corrected in the register (`dev.locale-leak` → "locale and
  timezone recorded", `br.cookie-scope` → "cookie state on this origin known",
  `protections.ts`). `br.devtools-hooks` treats a fetch wrapped by defender as defender's own
  (`isFetchPatchedByDefender`, `signals.ts:131`; `browserProbe.ts:243-256`), so turning the
  bunker off no longer produces a false "replaced by something other than defender" warning.
- **browser floor** (`browserProbe.ts:78-93`): pure `browserVersionReading(ua)`; edge is matched
  before chrome (verified by `browserProbe.test.ts`).
- **bunker predicate** (`signals.ts:72-85`): `shouldFreeze(url, ownHost)` is false for non-http
  schemes, the page's own hostname and loopback, true when the tracker pattern matches
  hostname+pathname (verified by `signals.test.ts`).
- **covert-camera verdict** (`covertCamera.ts:58-110`): idle when this tab holds no live video
  track; previewed when at least one visible `<video>` ≥ 64×64 paints a live track; otherwise
  covert-blocked. "unknown" only without a document.

## integrations & network

| call | host | method | payload | timeout/abort | retry | offline | key |
| --- | --- | --- | --- | --- | --- | --- | --- |
| clock skew (`browserProbe.ts:95-106`) | the page's own origin, `/favicon.png` | HEAD, `cache: no-store` | none | 4 s via `AbortController` | none | caught → explicit gap "sent no date header" | none |
| webrtc leak (`:43-75`) | none — a loopback `RTCPeerConnection` with no ice servers | — | — | 1.2 s timer, connection closed | none | works offline | none |
| model calls | none | — | — | — | — | — | — |
| connect ledger (`emitPull`) | none — local table | — | masked quote | — | — | local | none |

the third-party captive-portal probe to `www.gstatic.com/generate_204` that v1 made on every scan
(and therefore on every room open) is removed; `net.captive-portal` is an explicit gap that says
why (`browserProbe.ts:167` — observed). no secret, key or token is read or sent by this room
(verified by grep for `apiKey|getProviderKey|supabase.functions` in both directories: none).

## security & privacy

- **threat model**: a hostile page cannot reach this room's state (module singletons are not on
  `window`). a hostile extension or injected script on this origin is exactly what the bunker is
  for: the wrapper rejects matching requests with a `TypeError` (`signals.ts:94-100`) and
  `sendBeacon` returns false (`:105-110`). nothing stops a script that captured `window.fetch`
  before the wrapper was installed; the narrative says so and the probe's `br.devtools-hooks`
  reports a foreign wrapper (`browserProbe.ts:243-256`).
- **effect of the fetch wrapper on the rest of the app** (the item the brief asked for): it is
  installed only when the bunker is on *and* set to apply (`AsherinDefenderView.tsx:93-98`);
  until then `window.fetch` is untouched. once installed it is never removed; `restoreBunker`
  only flips `bunkerOn`, after which every request passes to the bound original
  (`signals.ts:118`; verified by `signals.test.ts` "restoring switches the freeze off but leaves
  the wrapper installed"). while on, the only requests it refuses are those whose host or path
  matches the tracker pattern and are not the page's own origin or loopback (`:72-85`). the
  model-provider hosts the app calls from `src/lib/local/llm.ts` (`api.openai.com`,
  `api.anthropic.com`, `generativelanguage.googleapis.com`, `openrouter.ai`, local ollama / lm
  studio) do not match, and the test pins the two most common plus loopback. the v1 exemption
  list named account-era hosts (`supabase|stripe|asherin.com|lovable|cursor.sh`) and claimed to
  freeze `mailto:` links, which a fetch wrapper never sees; both corrected. a request the wrapper
  refuses looks to the caller like a network failure, which is the right shape for a blocked
  beacon. the wrapper does not alter `this`, headers or bodies.
- **camera enforcement**: `installCameraWatch` wraps `getUserMedia` once and never swallows the
  caller's promise (`covertCamera.ts:115-129`); enforcement stops tracks only when
  `armed` (`AsherinDefenderView.tsx:94-98`). a legitimate page video call with a visible preview
  is not stopped (`isVisible`, `covertCamera.ts:40-49`).
- **export leakage**: the evidence file contains hostnames of granted bluetooth devices, the
  timezone and locale, the storage footprint and the user agent's browser version. none of that
  is a secret, and the export happens only on the operator's click; the file says `signed:
  false` so nobody mistakes it for attested evidence.
- **storage at rest**: nothing but the connect ledger rows, which carry a masked quote
  (`emitPull.ts:51-67`).

## failure modes

| failure | what the operator sees | anchor |
| --- | --- | --- |
| `probeBrowser` throws | headline "the browser refused the scan, so nothing here is measured." when there is no earlier reading; otherwise the previous reading stays and an amber line says "the last scan was refused by the browser… rescan to try again." | `:179-180`, `:242-246` |
| a single reading unavailable (api missing, permission query throws) | the row stays unmeasured with either the probe's explicit reason or the register's default copy; never a blank | `browserProbe.ts` try/catch blocks; `posture.ts:52-60` |
| no reading at all | score shows "—" and "no score without a reading" | `:204-206` |
| first scan in flight | headline "measuring what this browser can see."; attention list "measuring — the first reading takes a few seconds."; rescan button disabled and labelled "measuring" | `:177`, `:293-295`, `:228-233` |
| picker cancelled / refused / unavailable | one lowercase note line under the tabs | `:135-156` |
| bunker on in dry-run | header says "rehearsing — nothing is frozen yet."; probe still reports trackers not frozen with the action "turn bunker on (apply, not dry-run)" | `:338`, `browserProbe.ts:324-332` |
| connect ledger write fails | silent by design; tracing never fails the feature | `emitPull.ts:107-109` |
| no raw error text reaches the screen | picker messages are truncated to 80 chars and lowercased | `:144`, `:155` |

## interface & accessibility

- **layout**: one scroll container (`:188`), content column `max-w-5xl` with `px-4 py-6` on phone
  and `sm:px-8 sm:py-8` from 640 px (`:189`). the header card stacks on phone
  (`flex-col gap-5 sm:flex-row`, `:191`); the score block right-aligns from `sm:` only (`:202`).
  pills, tab buttons and filter buttons wrap (`flex-wrap`), all with `min-h-[36px]` or
  `min-h-[32px]` targets; the bunker switch is `min-h-[56px] min-w-[168px]` (`:351`). the
  person's phone screenshot from today showed the header stacking correctly and the pill row
  wrapping to two lines (observed by the operator; not re-shot after the fix — status block).
- **one focal point**: the headline sentence carries the state (`text-2xl font-extralight`,
  `:194`); the score is the only other large element and is explicitly subordinated by its label
  "/ 1000 · across the N measured" (`:205`). record 013 (visual hierarchy) and record 045
  (trust cues): v1 put two numbers of different kinds — a weighted score and a coverage
  percentage — in the same visual rank with labels that read as the same unit ("981 of 1000
  measured" beside "17 % were actually measured"). that is the contradiction the brief named. the
  code was computing both honestly (`scorePosture`), but the label "of 1000 measured" was a
  wrong claim: 981 was a score over measured rows, not a count of measured rows. the fix renames
  the label, states the measured count as a count in the sentence beside it, and withholds the
  score entirely when nothing was measured.
- **colour carries meaning only**: four state dots (`STATE_DOT`, `:47-52`) are paired with the
  words failing / watch / holding / unmeasured and a mono micro-label per row, so colour is never
  the only channel (quality gate 07). unmeasured is deliberately the dullest tone, never green.
- **type**: body `text-sm font-extralight leading-relaxed`; mono `text-[10px] uppercase
  tracking-[0.16em…0.3em]` is used only for micro-labels (record 042 allows uppercase micro-labels
  and warns only against uppercase paragraphs). the shepherd aesthetic record's "thin lowercase
  typography" holds for every sentence.
- **motion**: the only animation is the spinner inside the rescan button while a scan runs
  (`animate-spin`, `:232`), which explains a state change (record 037).
- **keyboard / focus**: every control is a `<button type="button">`; tab and filter buttons carry
  `aria-pressed` (`:264`, `:285`); the bunker switch and dry-run toggle carry `aria-pressed`
  (`:350`, `:367`). focus rings come from the shell's global button styles (inferred — not
  re-verified in this round).
- **empty / loading**: both have copy (see failure modes); the "full register" always has 186
  rows, so it is never empty.
- **no dark pattern**: the bunker defaults to off and to dry-run; the copy states that on a clean
  page it blocks nothing (`:342-345`); nothing nags.

## relationships

| edge | target | real in code? |
| --- | --- | --- |
| depends_on | `@/lib/defender/{protections,posture,browserProbe,signals,covertCamera}` | yes (`:21-45`) |
| writes_to | connect ledger (`asherin_connect_pulls`) via `emitPull` | yes (`:73-84`, `:121-127`) |
| reads_from | browser apis only: `navigator.permissions/bluetooth/hid/storage/serviceWorker/mediaDevices/getBattery`, `RTCPeerConnection`, `document`, `Intl` | yes (`browserProbe.ts`) |
| calls | own origin HEAD `/favicon.png` | yes (`browserProbe.ts:95-106`) |
| owns_state | bunker and camera singletons | yes (`signals.ts:62-65`, `covertCamera.ts:33-37`) |
| trusts | the browser's permission model; the operator's own choice to apply | — |
| verified_by | `src/lib/defender/__tests__/{posture,signals,browserProbe}.test.ts` | yes, 20 tests |
| chat / vault / library / projects / key vault / other rooms | none — this room has no edge to any of them | verified by grep |

the `asherin.cyber` room (`zerlal`) has its own device-posture scanner
(`DeviceSecurityScanner.tsx`, 19 checks) that overlaps in intent; the two share no code (observed).

## performance

- mount: one probe (~1.5–3 s dominated by the 1.2 s webrtc timer and permission queries), one
  `RTCPeerConnection` opened and closed, one HEAD request; no bundles beyond the view's own
  (lazy-loaded by the dashboard).
- timers: `watchCamera` interval 1.5 s, cleared on unmount (`covertCamera.ts:142-150`,
  `AsherinDefenderView.tsx:89`); the webrtc 1.2 s timer and the 4 s HEAD abort timer are cleared
  in their own paths.
- lists: 186 rows rendered at once in "full register"; fine without virtualisation.
- memoised: `rows`, `score`, `grouped`, `attention` (`:100-103`).
- on unmount the bunker wrapper stays installed if it was ever applied (documented in logic and
  security); the camera `getUserMedia` wrapper likewise. both are idempotent and pass through
  when off (verified: `signals.test.ts` "installs the wrapper once").

## copy & voice

every sentence on screen is lowercase apart from proper names inside the residual-blind-spot list
("GetAsyncKeyState", "TEMPEST", "HID", "BIOS/TPM" — product and standard names). the model is not
named in this room because it is never called. no "kernel offline", "pro", "account", "sign-in",
"agent" or "companion" copy remains (verified by grep). v1 carried: "stop using the account"
(`rec.incident-plan`), "sign-in will not persist" (`br.cookie-scope`), "rescan with the agent",
"other processes need the agent", "exports as signed json", "outbound is frozen on this origin"
(while only a tracker list was frozen, and in dry-run nothing was), and the dead "arm this tab"
control that opened two device pickers and set a flag nothing read — all removed or corrected
(review log 1–12).

## tests & proof

- `src/lib/defender/__tests__/posture.test.ts` (9): register ids unique; unmeasured never pass;
  unknown ids dropped; fail overrides pass; score over measured only with `measured` count;
  no score without a reading; fail < warn; triage order; export json shape incl. `signed:
  false`.
- `src/lib/defender/__tests__/signals.test.ts` (6, new): `shouldFreeze` on tracker hosts, own
  origin, loopback, provider hosts, `mailto:`; wrapper passes through until applied and freezes
  only trackers while on; restore keeps the wrapper installed and passes everything; single
  installation.
- `src/lib/defender/__tests__/browserProbe.test.ts` (5, new): browser floor reading incl.
  edge-before-chrome and unrecognised → null; explicit gaps do not score and are replaced by real
  readings.
- end-to-end: not driven this round (no dev server / playwright by rule). the brief's screenshots
  from today are the only vision evidence; they predate the fixes.

## open gaps

- a browser tab cannot read the operating system, disk, files, processes, installed apps, other
  browsers, accounts, firmware or usb tree; 148 of the 186 protections are agent-only and will
  stay unmeasured on a device with no agent. the room says so in every row of them.
- captive-portal detection is not possible without a third-party host; left unmeasured by choice.
- the bunker cannot see or stop requests from other tabs, extensions' own background contexts,
  or anything that captured `fetch` before it did.
- the evidence export is not signed; a signed export would need a device key the room does not
  hold.
- the vision pass (desktop 1440×900 and phone 390×844 after the fix) is still owed.

## machine narrative — rescan → export evidence

```
actor         the operator, in this tab
action        rescan browser, then export evidence
inputs        none from the operator; browser apis as present; current bunker/dry-run state
preconditions the room is mounted (AsherinDefenderView.tsx:131-133 runs the first scan)
effects       browserFindings replaced (:71); rows/score/grouped/attention recomputed (:100-103);
              one connect ledger row {organ:"defender", capability:"device-scan", status:"ok"|"fail"} (:73-84);
              on export, a json blob is downloaded (:106-116) — nothing is written to storage
failure paths probeBrowser throws → scanFailed=true, previous findings kept, amber notice (:83-85, :242-246);
              a single api missing → that protection unmeasured with a reason, never a pass;
              own-origin HEAD fails or times out (4 s) → dev.clock-skew is an explicit gap (browserProbe.ts:134)
invariants    every row has exactly one state; unmeasured rows never contribute to score (posture.ts:84);
              score is 0 and shown as "—" when measured === 0 (:204-206); coverage + unmeasured/total === 1;
              only the page's own origin is called; no key is read; export carries signed:false
```

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | "981 of 1000 measured" beside "17 % were actually measured": the big number was a weighted score over measured rows, labelled as if it were a count; two numbers of different kinds at equal rank | interface / semantic | domain → failure → cause: label text at v1 `:198`; score and coverage both computed correctly in `scorePosture` | contradicted (code vs copy) | wrong claim in copy | local correction | `AsherinDefenderView.tsx:196-206`: sentence states measured count as a count; label "/ 1000 · across the N measured"; "—" when nothing measured; `posture.ts:69,93` adds `measured` | `posture.test.ts` "no score at all when nothing was measured"; code read |
| 2 | every scan called `https://www.gstatic.com/generate_204` — a third-party host contacted on every room open in a local-first app, no timeout | security / integrations | cause: v1 `browserProbe.ts:144` | observed | defect | boundary repair | probe removed; `net.captive-portal` is an explicit gap that says why (`browserProbe.ts:167`) | code read; grep for `gstatic` → none |
| 3 | observation-only readings scored as `pass` (`dev.locale-leak` "consistent", `br.background-tabs`, `srv.covert-mic`, `net.link-quality` with the api absent, `br.cookie-scope` measuring first-party cookies under a "third-party cookies restricted" title) — the scan reported states it did not measure | semantic / data | cause: `f(id,"pass",…)` where nothing was measured | contradicted | defect | contract repair | explicit `gap()` readings (`browserProbe.ts:20, :148, :167, :334, :374`); register titles corrected for `dev.locale-leak`, `br.cookie-scope` (`protections.ts`) | `browserProbe.test.ts` "explicit gaps … never count"; code read |
| 4 | bunker "on" in dry-run showed "outbound is frozen on this origin" while nothing was frozen, and covert-camera enforcement was applied in dry-run (so "dry-run — nothing is applied" was false) | behavioral / state | cause: v1 `toggleBunker` set enforcement from `next`, not from `next && !dryRun`; header copy keyed on `bunker` alone | contradicted | defect | state consolidation | single `armed = bunker && !dryRun` drives apply/restore, enforcement, header copy and rescan (`AsherinDefenderView.tsx:93-98, :131-133, :334-340`) | code read |
| 5 | "outbound is frozen" overclaimed: only a tracker hostname/path list is frozen; `BUNKER_TARGETS` also claimed "mailto links", which a fetch wrapper never sees; `NEVER_FREEZE` listed account-era hosts (supabase, stripe, lovable, cursor.sh) | semantic / copy | cause: v1 `signals.ts:271-284, :584-586` | contradicted | wrong claim + defect | local correction | `shouldFreeze` exempts own origin and loopback only, non-http schemes false; copy names "tracker beacons" and admits a clean page blocks nothing (`signals.ts:72-85, :146-148`; view `:342-345`) | `signals.test.ts` |
| 6 | after bunker on → off, `br.devtools-hooks` warned "fetch replaced by something other than defender" because the wrapper stays installed while `isBunkerOn()` is false | behavioral | cause: v1 `browserProbe.ts:227` keyed on `isBunkerOn()` | observed | defect | local correction | `isFetchPatchedByDefender()` (`signals.ts:131`) used at `browserProbe.ts:243-256` | `signals.test.ts` "restoring … leaves the wrapper installed" |
| 7 | "arm this tab" opened bluetooth + hid pickers and set a localStorage flag nothing read except a label; key-poison, spy-family heuristics, native companion detection and `collectSignals` were dead code | interface / structural | cause: leftovers from the removed agent/companion | observed | defect (dead control) | component replacement | control replaced by "grant a device to measure it" (two pickers, each followed by a rescan, `AsherinDefenderView.tsx:135-156, :377-401`); dead code removed from `signals.ts` | code read; grep for `collectSignals|armTab|Capacitor` in defender → none |
| 8 | agent-era copy on screen: "rescan with the agent", "other processes need the agent", "the agent reads the browser's own process list", "native companion present" | copy & voice | cause: strings in v1 probe/view | observed | wrong claim | local correction | reworded to "outside a tab's reach" (`browserProbe.ts:210-214, :356-369`) | grep |
| 9 | account-era copy: "stop using the account", "sign-in will not persist", `proActions` ("pro") gate that was always true | copy & voice / requirements | cause: hosted-era strings | observed | wrong claim | requirement reconciliation | `rec.incident-plan` and `br.cookie-scope` copy rewritten; `proActions` removed | grep for `pro\b|account|sign-in` in defender → none |
| 10 | "exports as signed json" — the export is not signed | security / semantic | cause: v1 `browserProbe.ts:389` | contradicted | wrong claim | local correction | copy "plain json … not signed"; export carries `signed: false` (`posture.ts:128`) | `posture.test.ts` export shape |
| 11 | `acct.mfa` marked `both` (browser-measurable) though a tab cannot know; register header comment said "140 named protections" against 186 | data / semantic | cause: register entries | contradicted | wrong claim | local correction | `src:"agent"`, title "second factor on your accounts"; comment corrected (`protections.ts:64, :199`) | `posture.test.ts` count test |
| 12 | own-origin HEAD had no timeout; a hung host would hang the scan | performance / execution | cause: v1 `browserProbe.ts:94` | hypothesized → observed in code | defect | local correction | 4 s `AbortController` (`browserProbe.ts:95-106`) | code read |
| 13 | first scan showed "this device is mostly unmeasured." before any reading existed, and a thrown probe left no message at all | failure modes / interface | cause: no `firstScan`/`scanFailed` state | observed | defect | local correction | headline states, amber notice, disabled rescan button (`:177-181, :228-233, :242-246`) | code read |
| 14 | first scan ran twice on mount (mount effect + bunker effect) | performance | cause: two effects both calling `scan()` | observed during fix | defect | local correction | one effect keyed on `armed` (`:131-133`) | code read |
| 15 | `navIntents.ts:76` blurb capitalised and hard-codes the count | copy & voice (shared file) | — | observed | wrong claim | local correction | patch proposed below; not edited | — |

### shared-file patches proposed (not edited — outside the room's directories)

1. `src/lib/navIntents.ts:76`

   old:
   ```
       blurb: "Your device — 186 named protections, measured honestly from this browser",
   ```
   new:
   ```
       blurb: "your own device — a register of named protections; the browser measures what it can and names what it cannot",
   ```

2. `src/pages/Dashboard.tsx:1897-1901`, `src/lib/dashboard/v2Titles.ts:25`, `src/lib/local/functions.ts` — no change needed. the room makes no `functions.invoke` call, the title and subtitle are lowercase and true, and the `gatedView` wrapper is correct.

## vision confirmation — 2026-10-26

screens: final3-d-asherin-defender.png and final3-m-asherin-defender.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: the score, the failing/watch/holding/unmeasured counts, rescan and export render; unmeasured is grey, never green. phone fits.
