```
room: asherin.arvision   view id: asherin-arvision   files: src/components/dashboard/arvision/AsherinArVisionView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (camera feed itself unverified; seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

files under review: the shell `AsherinArVisionView.tsx`; the optical layer `OpticalHudView.tsx` (a 2.4k-line `@ts-nocheck` head-up display transferred from the operator html); the spatial layer `spatial/**` with `src/lib/arvision/spatial/**` (vps, session, overpass, liveMap, guidance, voice); the eagle.eye layer `eagle/**`; the sensors layer `sensors/**` with `src/lib/arvision/sensors/**`; the safety layer `safety/**` with `src/lib/arvision/safety/**`; tests under `__tests__` in each. the main workflow narrated here is the optical layer; the other four are described to the depth their contracts need.

## purpose & promise

asherin.arvision is the camera room: five layers behind one pill row (`AsherinArVisionView.tsx:34-40`). **optical** is a live head-up display over the device camera — reticle, grid, horizon, motion, object and class detection, face mesh and pose on request, barcodes, ocr on a still, a frame-intel packet, a spectral and a thermal-estimate filter, a web-bluetooth probe. **spatial** places the operator on a plan, routes with spoken turns, and shares poses between asherin tabs on this device. **eagle.eye** watches several cameras for movement and posture patterns and hands a human a reviewable evidence package (`eagle/EagleEyeView.tsx:1-12`). **sensors** says which hardware is connected and which modes it can honestly serve. **safety** records rule firings, radio sightings, incidents and evidence, and says where evidence actually goes.

the room's promise, repeated in its own source: never Clearview, never a dmv owner, never a thermal fake (`OpticalHudView.tsx:5`); `CANNOT_RESOLVE` where nothing can be resolved (`:1252`, `:1258`, `:1380`); frames do not leave the device except where this narrative says so.

## entry & navigation

- sidebar group `watch`, label `asherin.arvision`, blurb `Live camera HUD — frame intel, freeze, barcode, honest cannot-resolve` (`src/lib/navIntents.ts:56-63`) — capitalised and it names a `freeze` control the hud no longer offers (see shared-file patches). keywords arvision / ar / vision / camera / hud / freeze / lens / look / see.
- view id `asherin-arvision` (`types.ts:144`); aliases `arvision`, `ar-vision` (`Dashboard.tsx:201-202`); `gatedView` → `ErrorBoundary` + `Suspense` (`Dashboard.tsx:1925-1930`); v.2 title `asherin.arvision`, `canvas: true` (`v2Titles.ts:26`); keep-list position 2 (`DashboardSidebarV2.tsx:46`).
- the pill row scrolls horizontally on a phone (`AsherinArVisionView.tsx:55`); the active hint shows at `sm+` (`:69-71`).
- what loads first: the optical layer, which asks for the camera at once (`OpticalHudView.tsx:2438-2440`) and starts the model downloads (`:2442`). spatial, sensors and safety mount when chosen (`AsherinArVisionView.tsx:90-139`); eagle.eye mounts on first visit and then stays mounted so its radio ledger survives switches (`:46-52`, `:102-117`). leaving the optical layer unmounts it and stops the camera (`:84-89`).

## workflow

### optical (main workflow)

1. **camera gate** — `startCam()` walks a ladder of constraints (`:741-773`): exact facing on a flip, device id, facing hint, then `true`. success hides the gate, applies the mirror for the selfie camera, records the field of view only when the track reports a focal length (`:788-803`), enables heading, and traces `camera-open ok` (`:809-816`). refusal: `haltCam` stops every track, writes the plain reason on the gate card itself and turns its button into `try again` (`:712-740`); `plainWhy` maps the browser's error names to sentences (`:702-711`). the gate button bypasses the halted latch so a retry is a real retry (`:2432-2435`).
2. **the loop** — `requestAnimationFrame(loop)` (`:1620-1839`, `:2447`) draws the frame, the reticle / grid / horizon, the motion heat, the detections, the pose, the face mesh (when those layers are on), the spectral or thermal pass into the stage or the corner box (`paintSpectral` `:605-679`), and the misb-analog block top-left. the analysis buffer shrinks when the frame rate drops (`:613-614`).
3. **layers** — eleven toggles in the strip across the top: reticle, grid, horizon, peaking, motion, mesh, objects, pose, rf, identity, classify (`layerChips` `:361-373`; defaults `:296-308`). face mesh and pose are off by default.
4. **talk bar** — `flip cam`, `shot`, `record` (`talkBtns` `:375-399`). `shot` saves a still into the inbox panel (≤ 24, localStorage `asherin-arvision-inbox`, `:2283-2300`); `record` uses MediaRecorder (`toggleRec` `:1318`).
5. **frame intel** — `runIntel` (`:1186-1300`) runs at most every 2.5 s: reads vins and plates out of the ocr + barcode text, looks up a vin at nhtsa vpic and a 6-character plate at rdw open data (`:1226-1258`), always with `owner: "CANNOT_RESOLVE"`; the packet (`:1340-1421`) is written to this device's `arvision_packets` table and downloaded as json — there is no server (`:1392-1420`).
6. **filters** — colorized / spectral / thermal switch (`:671-679`); the thermal pass is labelled `thermal estimate` and is derived from the camera's own channels (`:591`, `:404-412` comment).
7. **ocr** — `runOcr` loads tesseract from cdn.jsdelivr.net the first time, reads a still, keeps ≤ 400 characters (`:943-958`).
8. **reverse search** — saves a still to the device and says the operator may upload it to a reverse search themselves; it opens no tabs (`:929-941`).
9. **identity** — `enrollMe` stores ≤ 8 landmark embeddings of the operator's own face in localStorage `asherin-arvision-identity`, scope `this-box-operator-only` (`:1053-1090`); the identity layer then says whether the face in frame is the enrolled operator or `unknown` — one person, never a database.
10. **bluetooth** — `probeStrongest` opens the browser's device picker and reads public gatt (battery, device information) into a device log (≤ 80, `:2136-2200`); tabs, sms, dms and phone numbers are `CANNOT_RESOLVE` with the reason (`:2090-2096`).

### spatial

plan view of a loaded map (`MapCanvas.tsx`), `live map` built from openstreetmap ways around a gps fix (`liveMap.ts:51`, `overpass.ts:50-91`), building lookup (`building.ts`), route with spoken turns (`guidance.ts`, `voice.ts:67-88` via `speechSynthesis`), camera positioning — which this edition does not have: `getVpsStatus` answers `not configured` with the reason and `localizeFrame` answers `unavailable` without building or sending a frame (`vps.ts:29-50`); the setup panel shows that sentence (`SpatialView.tsx:183-191`). shared session: on this edition a `BroadcastChannel` named after the room key carries playerInfo / poseUpdate / leave at 20 Hz between open asherin tabs on this one device, and the status says `session live — other asherin tabs on this device only` (`session.ts:95-123`); a late joiner is answered with our name once (`:103-108`).

### eagle.eye

cameras attached one by one (`EagleEyeView.tsx:344-`), a per-camera detector loop (`detector.ts`, mediapipe), temporal scoring into observation / caution / alert tiers (`engine.ts`), zones, filters, a thermal path that is honest about what a webcam is (`thermal.ts`), evidence bundles with a sha-256 digest downloadable as zip (`evidence.ts`), radio sightings (`radioScan.ts`, `radioLedger.ts`). a capture calls `captureContext()` (`:407`), which resolves the public ip through `api.ipify.org` then `ipapi.co` with a 6 s timeout and a 10 min cache (`eagle/context.ts:34-61`) — the one off-device call in this layer, stated in the evidence manifest.

### sensors

registry of connected streams (`useSensorRegistry`), the mode matrix, fusion stages, world model, perception, service health (`services.ts`: a configured inference / prediction / recording url is probed at `/health` with a 6 s abort; positioning repeats the vps sentence `:57-61`), site authorisation. an edge bridge over websocket connects only when an endpoint is configured (`adapters/bridge.ts:158`, `:268-291`).

### safety

the console (`SafetyView.tsx`) over a tab-level hub (`safety/hub.ts`): vision events and zones, staff notifications with five channels of which only in-app and the operator inbox can deliver (`notify.ts:60-146`), radio awareness with an allowlist, incident timeline with review states, detector health, evidence buffer (`evidenceCapture.ts`: `session_only` unless a backend is configured), rules editor.

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| hud state `S` | module memory inside `bootArvision` (`OpticalHudView.tsx:281-340`) | stream, devices, facing, heading, geo, fps, detections, models, identity… | while the optical layer is mounted | no |
| operator identity samples | localStorage `asherin-arvision-identity` | `{ label, samples ≤ 8, enrolled_at, product, scope }` (`:1082-1090`) | until cleared | no |
| device log, inbox stills, person tags | localStorage `asherin-arvision-device-log` (≤ 80), `asherin-arvision-inbox` (≤ 24 jpeg data urls), `asherin-arvision-person-tags` (`:2052-2083`) | arrays / map | until cleared | no |
| intel packets | local table `arvision_packets` (`:1397`) + a downloaded json | `{ captured_at, packet }` | until cleared | the json file is the operator's |
| spatial pose, map, route, session | react + refs in `SpatialView.tsx` | `Vec3`, `NavigationGraph`, `GuidanceState`, peers | mount | poses to other tabs on this device via `BroadcastChannel` |
| eagle runtimes, evidence, ledger | refs / state in `EagleEyeView.tsx`; ledger in `radioLedger.ts` | per camera | while mounted (kept across layer switches after first visit) | zip only when the operator downloads |
| safety rules, allowlist, channels | localStorage `arvision.safety.rules.v1`, `arvision.safety.allowlist.v1`, `arvision.safety.channels.v1` (`hub.ts:49-50`, `notify.ts:148`) | json | until cleared | no |
| safety notifications → bell | local table `intel_notifications` (`notify.ts:89-108`) | one row per incident | until cleared | no |
| evidence frames | memory, `session_only` (`evidenceCapture.ts:1-13`) | data urls | this tab | no |
| connect traces | local table via `emitPull` | organ `arvision` | until cleared | no |

## logic

- **camera ladder** and the facing flip on phones, which request the opposite side directly because device ids recycle (`:839-900`).
- **field of view** is reported only from a real focal length; an assumed 54° was removed as a fake measurement (`:792-803`).
- **heading** prefers absolute orientation, then `webkitCompassHeading`, then gnss heading, and labels an unsure alpha as such (`:2372-2425`).
- **spectral filter**: channel ratios painted as a material map, iron palette for the thermal estimate, a scale bar drawn like a real imager (`:455-603`).
- **frame intel**: vin regex with letter+digit requirement, plate regex with a stop list of english words and all-letter / all-digit rejections (`:1120-1225`); makes from a token table; `this_is_unsure` flags.
- **eagle scoring** is in `engine.ts` with its own tests; **radio** sightings are merged by address and pruned (`radioScan.ts`); **vision events** and zones have their own engine and tests (`src/lib/arvision/vision/**`).
- **spatial**: corridor occlusion test over the walkable graph, geo ↔ local projection with an anchor (`geo.ts`, `projection.ts`), overpass mirror rotation with retry-after (`overpass.ts:50-91`).

## integrations & network

| call | layer | host | when | timeout / abort | offline |
| --- | --- | --- | --- | --- | --- |
| mediapipe tasks-vision esm + wasm | optical, eagle | cdn.jsdelivr.net (`OpticalHudView.tsx:1450-1452`, `eagle/detector.ts`) | at optical mount / eagle camera start | none | detections off; the hud still draws the frame and says the model status |
| face / pose / object / classifier models (~30 mb) | optical, eagle | storage.googleapis.com (`:1460-1497`) | at mount | none; gpu → cpu fallback for the face model | as above |
| tesseract.js | optical | cdn.jsdelivr.net (`:947`) | first ocr | none | `ocr could not run — the text engine did not load…` (`:957`) |
| nhtsa vpic vin decode | optical | vpic.nhtsa.dot.gov (`:1228`) | frame intel with a vin in the ocr text | none | `this_is_unsure: true` |
| rdw open data plate | optical | opendata.rdw.nl (`:1248`) | frame intel with a 6-char plate | none | `ok: false` |
| overpass | spatial | overpass-api.de, overpass.kumi.systems (`overpass.ts:12-15`) | live map / building lookup | 30 s abort, mirror rotation, retry-after | `the map request failed` / `timed out`, said in the panel |
| public ip | eagle | api.ipify.org, ipapi.co (`context.ts:36-37`) | on each evidence capture (10 min cache) | 6 s abort | `unavailable` in the manifest |
| configured service `/health` | sensors | operator-configured urls (`services.ts:44-54`) | refresh | 6 s abort | `the service is unreachable` |
| edge bridge | sensors | operator-configured websocket (`bridge.ts:277`) | when configured | exponential retry ≤ 30 s | status line |
| `asherin-arvision-vps` function | spatial, sensors | **none** — removed; the client answers statically (`vps.ts:29-50`) | — | — | — |
| `/api/packet` | optical | **none** — removed; packets go to the local table and a download (`:1392-1420`) | — | — | — |

the csp allows scripts and workers from cdn.jsdelivr.net and `connect-src https:` (`index.html`), so all of the above pass. no api key is carried anywhere in this room. "kernel offline" can no longer appear: the two shim calls that produced it were replaced with device answers.

## security & privacy

- **frames**: the camera frame is drawn to canvases on this device; mediapipe runs in the page / its own wasm; the vps frame encoder exists (`frameToBase64`, `vps.ts:52`) but its consumer never sends (`:41-50`). eagle evidence stays in the tab unless zipped by the operator.
- **what does leave**: ocr-derived vins and plates go to two public vehicle registries when frame intel runs with the ocr text containing them (`:1226-1258`) — a lookup the hud makes without a separate confirmation, stated here and as an open gap; the device's public ip is learned from ipify / ipapi on an evidence capture; overpass receives a coordinate and a radius; model downloads reveal nothing but the request.
- **identity**: eight landmark embeddings of the operator's own face, in localStorage, labelled `this-box-operator-only`; no database, no match against anyone else (`:1053-1090`). the identity layer is a toggle in the strip.
- **bluetooth**: the browser's own picker; public gatt only; the file says why tabs / sms / dms are impossible (`:2090-2096`).
- **injection**: the hud is dom built from a constant template (`HUD_BODY` `:244`); operator-visible strings are set with `textContent` (`note`, `:686-688`); the sheet uses `innerHTML` with values the hud computed, not model or network text (`:1913`); intel json is downloaded, not rendered as html.
- **storage at rest**: localStorage stills (jpeg data urls) and the device log are plaintext on the device; the evidence buffer is memory.
- **trust boundary with the theme**: the hud resolves colours from the app's css tokens; the one self-reference that made its buttons transparent is gone (`:19-22`).

## failure modes

| failure | operator sees | where |
| --- | --- | --- |
| camera permission refused | gate card: `the camera did not open — this site is blocked from the camera in the browser's site settings. fix that, then try again.` + `try again`; note line repeats it; `camera-open fail` trace | `:702-740`, `:757-760` |
| no camera | gate card with `no camera is attached to this device` | `:762-766` |
| camera held by another app | one 300 ms retry, then the gate card with `another app is holding the camera` | `:768-776` |
| flip to a side that does not exist | falls back to the other side; the note says so | `:839-900` |
| models blocked / offline | `S.models.status` stays loading; detections do not draw; `enroll` says `face model not live — wait for mesh, or models blocked` | `:1065-1068` |
| ocr engine cannot load | note `ocr could not run — the text engine did not load; check the connection and try again` | `:957` |
| vin / plate registry down | `this_is_unsure: true` / `ok: false` in the packet | `:1237-1256` |
| packet table refuses | `packet downloaded — the device table refused the copy` | `:1414` |
| bluetooth not in this browser | `this browser has no bluetooth picker` | `:2138` |
| spatial: camera fails | `camError` line in the field panel | `SpatialView.tsx:390-393` |
| spatial: positioning asked | `camera positioning needs a map service this device edition does not have — place yourself on the plan by hand, or use the live position` | `vps.ts:29-31`, `SpatialView.tsx:473-476` |
| spatial: overpass busy / down | the panel prints the mirror-rotation outcome sentence | `overpass.ts:62-91` |
| spatial: session on a browser without BroadcastChannel | `this browser cannot share a session between its own tabs, and this edition has no relay between devices` | `session.ts:96-99` |
| eagle: camera refused | toast `camera access refused` with the browser's reason | `EagleEyeView.tsx:333-340` |
| eagle: pairing cancelled | toast `pairing cancelled or unavailable` | `:313-316` |
| safety: push / email / sms | `not sent — no … provider is configured for this console` | `notify.ts:116-128` |
| safety: no device identity | `this device has no identity yet, so there is no inbox to write to` | `notify.ts:84-88` |
| lazy chunk fails | `lazyWithRetry` retries / surfaces | `AsherinArVisionView.tsx:18-29` |

no raw stack reaches the screen inside the room; the dashboard `ErrorBoundary` is the last net. the hud has no spinner at all: it says `loading` in the misb block while models load and draws the frame regardless.

## interface & accessibility

- **desktop (1440×900)**: misb block top-left (≤ 280 px), the layer strip centred across the top (`:67-71`), compass top-right, reading sheet right (280 px), inbox left, the spectral corner box bottom-left with its three-way switch, the talk bar bottom-centre, the note line above it (`:44-125`).
- **tablet ≤ 1100 cqi**: the strip moves beside the misb block and scrolls horizontally; panels tighten (`:127-143`).
- **phone ≤ 780 cqi**: misb full width at the top; the strip becomes a scrolling row just above the talk bar; sheet and inbox drop to the bottom at ≤ 38 cqh; the talk bar scrolls; the gate card tightens (`:145-181`). the layout uses container queries on the room, not the viewport, so it holds inside the dashboard pane.
- **short landscape ≤ 560 cqh**: smaller compass and corner box (`:184-189`, `:238-240`).
- **contrast**: the gate button, the talk buttons, the `on` toggles and the compass accents are `hsl(var(--accent))` on `card/62` glass — now a real colour (finding 1). the muted tokens are the app's.
- **affordances**: the gate has one button and it says what it does (`open camera` → `try again`); the filter switch is a `role="group"` with `aria-pressed` on each option (`:671-676`); the corner box is a button with a title. the layer toggles are buttons with their state in the `on` class — they lack `aria-pressed` (open gap).
- **motion**: the only motion is the camera and the overlays that follow it; no decorative animation.
- **copy**: lowercase; `CANNOT_RESOLVE` remains in the packet json as a field value, never on the screen since this pass.
- **other layers**: spatial / sensors / safety are scrolling columns at `max-w-5xl` with 12 px gutters on a phone (`SensorsView.tsx:27`, `SafetyView.tsx:34`); eagle is its own grid.

## relationships

| edge | target | real in code? |
| --- | --- | --- |
| calls | mediapipe (cdn), model store (googleapis), tesseract (cdn), nhtsa, rdw, overpass, ipify / ipapi, configured services | yes — table above |
| writes_to | local tables `arvision_packets`, `intel_notifications`, `asherin_connect_pulls` | yes |
| reads_from | asherin.sentinel observations | **claimed by copy** (`safety/CrossModalPanel.tsx:51`), not verified in this pass — unknown |
| reads_from | the notification bell (`intel_notifications`) | yes — safety writes; the shell's bell reads |
| depends_on | `lazyWithRetry`, `emitPull`, `useAuth`, `supabase` shim, `sonner` toasts | yes |
| trusts | the browser's permission model for camera, geolocation, bluetooth | yes |
| verified_by | `eagle.test.ts`, `radioLedger.test.ts`, `visionEvents.test.ts`, `sensors.test.ts`, `integrations.test.ts`, `console.test.ts`, `building.test.ts`, `arvisionSpatial.test.ts`, `deviceEdition.test.ts` | yes |
| calls | `asherin-arvision-vps`, `/api/packet` | **no longer** |

## performance

- optical mount: camera open, four model downloads (~30 mb, browser-cached afterwards), a 450 ms rf poll that only sets an engine label (`pollRf` `:2048-2050`, `:2445`), a geolocation watch and orientation listeners (`:2372-2425`), a rAF loop. all of it stops on unmount (`cleanup` `:2448-2453`) — and the optical layer now unmounts when another layer is chosen (`AsherinArVisionView.tsx:84-89`), so the camera light goes out.
- eagle: one geolocation watch and a device-list listener from mount (`EagleEyeView.tsx:320-332`), per-camera detector loops when cameras are attached; mounted on first visit only, then kept.
- spatial: a pose timer at 20 Hz while a session is live (`session.ts:27`); overpass calls on demand.
- safety hub: a sweep interval while a safety surface is mounted (`useSafetyConsole.ts:17-20`).
- the hud's spectral pass reads pixels from a ≤ 384 px buffer and shrinks to 256 px under 20 fps (`:613-614`).

## copy & voice

lowercase throughout the five layers; the model is not named because the room does not call shepherd. account-era phrases found and removed: `signed-in operator`, `no operator is signed in`, `unauthenticated session`, `over your account` (now `between open asherin tabs on this one device`). `this box` became `this device`. the packet still uses `CANNOT_RESOLVE` as a json value by design — it is the room's refusal word, and the narrative keeps it in that role.

## tests & proof

unit (`npx vitest run src/lib/arvision src/components/dashboard/arvision src/test/arvisionSpatial.test.ts`): eagle engine and ledger, vision events, sensors, integrations, console, building lookup, spatial maths, and the new `deviceEdition.test.ts` (6 tests): positioning is `not configured` with the reason and never `unreachable`; `localizeFrame` answers unavailable without a fetch; the sensors layer repeats the same sentence; `isDeviceEdition`; two sessions on one device hear each other's names and poses and `leave` removes the peer; a room key under three characters is refused. full run: 826 tests pass.

not proven by unit tests: the hud itself (`@ts-nocheck`, dom-built, no test harness), the css fix for the gate buttons, the layer strip on three widths, the model downloads. the end-to-end step: open the room → refuse the camera → read the reason on the card → allow → `try again` opens the camera → toggle `mesh` on the strip → switch to spatial → the camera light goes out. screenshots pending.

## open gaps

- the optical hud is 2.4k lines of untyped javascript inside a tsx file (`@ts-nocheck`); no unit can reach `plainWhy`, the ladder or the intel regexes until `bootArvision` is split into importable pieces.
- frame intel sends ocr-read vins and plates to two public registries without a separate confirmation; a toggle (`identity` is the nearest) should gate the lookups.
- the eagle evidence context learns the public ip from third parties on every capture (cached 10 min); an operator may not want that in a manifest.
- the layer toggles carry their state only as a class; `aria-pressed` is one line each.
- models and tesseract are cdn fetches; a device that has never been online has a frame and nothing else.
- the shared session reaches other tabs on this device only; there is no relay between devices in this edition, and the room says so.
- `CrossModalPanel` claims sentinel observations are published "on this account"; that edge was not verified here.

## shared-file patches (not applied — outside the room)

1. `src/lib/navIntents.ts:60` — capitalised blurb naming a `freeze` control that no longer exists.
   old: `    blurb: "Live camera HUD — frame intel, freeze, barcode, honest cannot-resolve",`
   new: `    blurb: "a live camera head-up display on this device — frame intel, filters, barcode, ocr, and cannot-resolve where nothing resolves",`
2. `src/lib/navIntents.ts:61` — drop the keyword `"freeze",` for the same reason.

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | the camera gate's button (and every accent control: talk bar, `on` toggles, compass marks) rendered transparent — `.arv-root { --accent: hsl(var(--accent)) }` references itself, a css custom-property cycle, so `--accent` is invalid at computed-value time and `background: hsl(var(--accent))` falls to `initial` | interface | cause: self-referential token | observed `OpticalHudView.tsx` old `:19`; the screenshot | defect | local correction | the redefinition removed; `.misb b` uses `hsl(var(--accent))` (`:19-22`, `:50`) | screenshots pending (css reasoning is observed) |
| 2 | the eleven layer toggles were built into `#layers` and then hidden with `display:none !important` — dead controls; mesh / pose / identity could not be switched | interface | failure: dead controls | observed old `:62` | defect | local correction | positioned strip, tablet and phone rules already existed (`:67-71`) | screenshots pending |
| 3 | after a refusal the gate card still read `allow the camera…` and its button called `startCam()` which returned early on the halted latch — the retry was dead and the reason sat under an 18 px blur | behavioral | cause: latch + z-order | observed old `:722-726`, `:2430` | defect | local correction | `plainWhy`, gate text + `try again`, `startCam(undefined, true)` (`:702-740`, `:2432-2435`) | code |
| 4 | `fetch("/api/packet")` — a server endpoint in a local-first build; `packet saved in asherin` could never be true | integration | cause: hosted-era call | observed | defect | component replacement | local table + download (`:1392-1420`) | code |
| 5 | `supabase.functions.invoke("asherin-arvision-vps")` answered "kernel offline" and the room translated it to `positioning service unreachable` — a transient-outage claim for a service that does not exist | semantic | cause | observed `vps.ts` old, `local/functions.ts:52` | defect | contract repair | static honest answer, no frame built (`vps.ts:29-50`); sensors repeats it (`services.ts:57-61`) | `deviceEdition.test.ts` |
| 6 | the shared session said `session live` over the shim channel that reports SUBSCRIBED and drops every message — a live session nobody could hear | behavioral | cause: shim semantics (`local/client.ts:74-112`) | observed | defect | component replacement | BroadcastChannel transport between tabs on this device, status says so (`session.ts:95-123`) | `deviceEdition.test.ts` two-tab test |
| 7 | the optical layer stayed mounted and the camera stayed open while the operator was in spatial / eagle / sensors / safety | execution | failure: unbounded media | observed old shell `:75-77` | defect | local correction | conditional mount (`AsherinArVisionView.tsx:84-89`) | code |
| 8 | eagle.eye mounted eagerly, starting a high-accuracy geolocation watch on room open for a layer never visited | performance | failure | observed `EagleEyeView.tsx:320-332` | defect | local correction | mount on first visit, then keep (`:46-52`, `:102-117`) | code |
| 9 | `reverseSearch` opened three third-party tabs (yandex, google, tineye) behind the operator and said `InVID workflow` | interface | failure: surprising + jargon | observed | defect | local correction | still saved, nothing opened (`:929-941`) | code |
| 10 | copy: `this box`, `CANNOT_RESOLVE` on screen, `companion for live ads`, `asherin.arvision halted — this box, not the feed` | interface | failure | observed | defect | local correction | `:712-776`, `:957`, `:2138` | grep |
| 11 | account-era language in safety and spatial: `signed-in operator`, `no operator is signed in`, `unauthenticated session`, `over your account` | interface | failure | observed | defect | local correction | `notify.ts:77`, `:85`; `SafetyView.tsx:28`; `SpatialView.tsx:901-904` | grep |
| 12 | `services.ts` imported the shim only for the vps probe | dependency | — | observed | defect | dependency restructuring | imports `getVpsStatus` (`:8`) | tsc |
| 13 | a late joiner of a same-device session saw the first tab as `peer` — names were announced once at join | behavioral | cause | observed by the new test failing first | defect | local correction | re-announce on an unknown peer (`session.ts:103-108`) | `deviceEdition.test.ts` |
| 14 | narrative v1 (nav blurb) promised a `freeze` control; no freeze exists in the hud | semantic | — | observed | wrong claim | — | shared-file patch 1 | grep |
| 15 | narrative v1 said eagle "never lets a frame leave the device" without mentioning the public-ip lookup on capture | semantic | — | observed `context.ts:34-61` | wrong claim | — | stated in integrations and open gaps | — |

## vision confirmation — 2026-10-26

screens: final3-d-asherin-arvision.png and final3-m-asherin-arvision.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: the hud tabs (optical, spatial, eagle.eye, sensors, safety) render. the test browser has no camera, and the room says so in place: "the camera did not open — no camera is attached to this device" with try again. the live camera overlay itself cannot be seen in this environment and stays unverified.
- fixed: safety alerts now land on the sidebar bell (one inbox, deduplicated per incident, honest about do-not-disturb), proven by `src/lib/arvision/safety/__tests__/notify.test.ts`. the floating second inbox is gone.
