```
room: asherin.adam   view id: asherin-adam   files: src/components/dashboard/adam/AsherinAdamView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓
```

version 1 was written against the room as first committed (329908b). its review
produced the defects in the log at the end; this is the replaced narrative,
written against the corrected code. the room has two halves that live in
different places, and every claim says which:

- **the room** — `src/components/dashboard/adam/AsherinAdamView.tsx` (this repo),
  its header rules in `vercel.json` (the three `/adam…` entries, lines 79-96)
  and its build note `docs/asherin-adam.md`.
- **the bundle** — `public/adam/` (32 MB, 489 files), built from the ADAM
  checkout (shep95/adam at 0aa5db6) with the embed profile: `embed/vite.config.js`,
  `src/embed/profile.js`, `src/embed/weather.js`, `src/embed/asherin.css`, plus
  the gated edits listed in `docs/asherin-adam.md`. adam-side paths below are
  relative to that checkout.

evidence statuses: **observed** (read in the code), **verified** (exercised in
the browser run named in tests & proof), **inferred** (follows from the code but
was not exercised), **unknown**, **contradicted** (the code or copy says
otherwise).

## purpose & promise

asherin.adam is a 3d globe that runs on this device: esri world imagery over
keyless terrain, with the layers that need no server — usgs earthquakes, nasa
recent imagery, bundled data centres, dams, submarine cables and airspace
regions — plus the sky (sun, moon, local time), astrocartography, display
styles, measuring, snapshot and record. it is the ADAM console pruned to what a
static file can do, shown in a frame inside the room. *(observed:
`src/embed/profile.js:11-24`; `src/app/tools.js`, 25 `if (!EMBED)` gates)*

the room promises, in its header: "a live globe on this device — imagery,
terrain, earthquakes, recent satellite passes. what leaves: map tiles, and only
the places and weather you ask for." (`AsherinAdamView.tsx:23-24`). *verified*
for a plain boot — the only hosts contacted were `services.arcgisonline.com`,
`terrain.reearth.land` and `tile.openstreetmap.org` (the esri→osm fallback,
`src/maps/defaultSources.js`); photon appeared only when places were plotted.
the copy names the categories, not every host; the hosts are in integrations &
network.

## entry & navigation

- sidebar group "watch", label `asherin.adam`, codename "live globe", globe
  icon (`src/lib/navIntents.ts:49-55`; `DashboardSidebar.tsx:113`;
  `DashboardSidebarV2.tsx:38,47`). *observed*
- deep link `/dashboard/asherin-adam`; aliases `adam`, `asherin.adam`, and the
  retired room's `eye`, `asherin.eye`, `asherin-eye`, so old links still land
  here (`src/pages/Dashboard.tsx:210-215`). *observed*
- command palette: built from `NAV_INTENTS`, so the keywords adam, eye, globe,
  map, earth, satellite, terrain, earthquakes, imagery find it. *observed*
- title: `v2Titles.ts:27` marks the room `canvas: true` (no shell title); the
  room renders its own `<h1>` (`AsherinAdamView.tsx:218-221`). *verified*
- what loads first: the lazy room chunk, then the frame `/adam/index.html`,
  which on vercel is 308-redirected by `cleanUrls` to `/adam` and serves the
  bundle's page; that page loads `/adam/cesium/Cesium.js` (5.5 MB) and one
  2.5 MB entry module, then panels lazily. *verified in the emulated server;
  vercel's own redirect inferred.*

## workflow

1. **open** — the room probes for webgl (`hasWebGl`, `:45-55`); without it the
   frame is never mounted and the room says why (`:102-105`, copy `:208`).
2. **load** — the frame mounts (`:255-265`); a veil "bringing the globe up…"
   covers it (`:267-282`). at 15 s the veil explains the 30 mb first fetch
   (`:26`, `:106`); at 60 s the room shows its failure card but keeps the frame
   mounted, so a late load still replaces the card with the globe (`:28`,
   `:107-110`, `:168`). *slow and timeout paths: observed, not exercised.*
3. **ready** — on `load`, the room accepts only a document that contains
   `#cesiumContainer` (`:150-169`); then it watches ADAM's own loader line and,
   if ADAM writes `Error: …` there (`src/main.js` in the bundle), names the
   failure instead of leaving a frame that cannot draw (`:132-148`). *verified
   for the ready path; the boot-error path observed only.*
4. **use the globe** — everything inside the frame is ADAM's: drag/zoom, the
   top action bar, the rail (intel ▾ → astro, sky, maps, keys = keyboard
   shortcuts, settings), data layers, location search. *verified: rail and
   layer list read from the frame's dom.*
5. **places from google** — "plot on map" (location prophet) and "plot
   contacts" / per-contact "plot on map" (contact intelligence) leave a list in
   `localStorage` and open this room. the room reads it once, clears it at
   once, and shows a strip: "n places came over from google. plotting looks
   each place name up at photon.komoot.io; names and emails stay here." with
   **plot them** (enabled once the globe is ready) and **dismiss**
   (`:61-76`, `:85`, `:96`, `:223-245`). plotting hands each place string to
   ADAM's annotation engine on the frame's window (`:178-206`), which flies to
   and pins what it finds; the room then says "plotted x of n · y could not be
   found by name." (`:246-251`). *verified: strip, storage cleared, result line
   (0 of 2 — lookups are blocked in this sandbox). success path inferred.*
6. **retry** — "try again" remounts the frame with a fresh key and fresh clocks
   (`:171-176`, `:256`); "open on its own" opens `/adam/index.html` in a new
   tab (`:301-308`). *observed*
7. **leave** — unmounting blanks the frame and drops it, which stops its render
   loop and workers (`:117-127`). *verified: no `/adam` frame remains after
   navigating to another room.*

### machine narrative

```
actor          operator in the dashboard
action         open asherin.adam; optionally plot places handed over by google
inputs         none typed in the room; localStorage asher-cloud-venues-pending,
               asher-cloud-contacts-pending (written by google modules)
preconditions  webgl; /adam bundle present on this origin
effects        frame /adam mounted; hand-off keys removed on mount; on plot,
               pins in the frame + one connect ledger row (counts only)
failure paths  no webgl → card, no frame · non-console document → card ·
               ADAM "Error:" → card with its message · 60 s → card over a
               still-loading frame · plot lookups fail → "plotted 0 of n"
invariants     contact emails are never read; place names never go on the
               ledger; a slow frame is never torn down by a timer; the room
               never shows a blank or a spinner without a bound
```

## state & data

| state | where | shape | lifetime | leaves the device? |
| --- | --- | --- | --- | --- |
| `state`, `failure`, `attempt`, `plot` | react (`:80-86`) | enums + counts | the visit | no |
| `places` | react, read from the hand-off (`:85`) | `{target, label}[]`, ≤25 (`:30`) | the visit | targets go to photon only on **plot them** |
| hand-off keys | `localStorage` `asher-cloud-venues-pending` / `-contacts-pending` (`src/lib/cloudIntel/mapBridge.ts:413-461`) | venues `{label, physical…}`, contacts `{name, email, location, organization}` | until this room mounts, then removed (`:96`) | no |
| globe settings, layer state, track archive | the bundle's own `localStorage` keys (`adam.settings.v1`, `gev:layer-state:v2`, …) and IndexedDB, **on asherin's origin** | adam's | until cleared | no |
| frame location hash | the frame's url (camera, style, layers) | adam share-state | the frame | no |
| connect ledger row | `asherin_connect_pulls` via `emitPull` (`:197-205`) | organ `adam`, capability `plot-places`, `{asked, drawn}` | the local ledger | no |

## logic

- **hand-off reading** (`readHandoff`, `:61-72`): venues with `physical === false`
  (meeting links) are skipped; contacts without a `location` are skipped; each
  target is trimmed to 160 characters, each label to 60; at most 25 places.
  the read happens in the state initializer so react's strict-mode double
  effect cannot read-after-clear (`:84-85`). *observed*
- **console detection** (`:160`): a load counts only if the document has
  `#cesiumContainer`; this rejects a 404 page, the app shell served by a dev
  fallback, and `about:blank`. *verified for the 404 case.*
- **boot-error detection** (`:136-139`): `^error\b` on ADAM's loader line;
  the message after "error:" is shown, cut to 160 characters, as text. *observed*
- **inside the bundle**: layers outside the allowlist are neither listed
  (`src/app/layerPresentation.js:43`) nor enableable from links or stored
  state (`src/data/lifecycle.js:1109`); rail chips outside the allowlist are
  hidden (`src/ui/adam/railGroups.js`); the application request services answer
  503 locally instead of calling `/api/*` (`src/embed/profile.js:38`). *verified
  for the panel list and rail; the lifecycle refusal observed.*

## integrations & network

no request carries a key: none is compiled into the bundle and the room has none.

| host | when | payload | bounded by |
| --- | --- | --- | --- |
| this origin `/adam/*` | open | the bundle | the browser; `no-cache` on the page, a day on files, a year on hashed assets (`vercel.json:79-96`) |
| `services.arcgisonline.com` | always, as the camera moves | tile coordinates | cesium's tile queue; esri→osm after 2 failures |
| `tile.openstreetmap.org` | when esri fails | tile coordinates | same |
| `terrain.reearth.land` | always | terrain tile coordinates | cesium |
| `earthquake.usgs.gov` | only with the earthquakes layer on | none (feed) | the layer's refresh |
| `cmr.earthdata.nasa.gov`, `wvs.earthdata.nasa.gov`, `gibs.earthdata.nasa.gov` | only with recent imagery / gibs overlays in use | the box or tile | the panel |
| `photon.komoot.io` | location search, or **plot them** | the place string typed or handed over | adam's geocoder |
| `api.open-meteo.com` | only while the sky panel is open (`src/ui/adam/skyPanel.js:473-478`) | view centre rounded to 0.01° (`src/embed/weather.js:15-16`) | the panel's 10-minute cache |

*verified*: a plain boot contacted only arcgis, reearth and osm. *observed*: the
other rows. offline: tiles fail and the globe shows its bare ellipsoid; the room
itself needs nothing from the network after the bundle is cached.

## security & privacy

- **headers.** the site sends `frame-ancestors 'none'` and `X-Frame-Options:
  DENY` everywhere; three later rules apply to the globe: `/adam/:path*` gets
  `frame-ancestors 'self'` + `SAMEORIGIN` (the rest of the csp unchanged),
  `/adam/assets/*` immutable caching, and the page `no-cache`. `:path*` matches
  `/adam` itself, which is where `cleanUrls` serves the frame's document.
  *verified against an emulation of `vercel.json` in the test server (headers
  on `/adam`: SAMEORIGIN, `'self'`, `no-cache`); vercel's matching inferred.*
- **csp inside the frame.** the bundle carries no inline script and no meta
  csp, so asherin's served policy governs it; the globe booted under it with no
  csp violation in the console. *verified (emulated headers).*
- **the frame is not a trust boundary.** it is same-origin and unsandboxed, so
  the bundle — ADAM's code and its dependencies (cesium, hls.js, satellite.js,
  …) — runs with asherin's authority: it can read this origin's `localStorage`
  and IndexedDB and reach the parent document. it is first-party code built
  from a pinned commit and lockfile, but the boundary is a page boundary only.
  an opaque-origin sandbox with a `postMessage` hand-off is the real repair and
  is not done (open gaps). *observed*
- **contact data at rest.** the google hand-off used to leave names, emails and
  places in `localStorage` indefinitely; the room now removes both keys on
  mount, reads no email, and sends only the place strings, only on **plot
  them**, to a host it names. *verified: both keys null after mount.*
- **ledger.** the plot row carries counts, never names (`:197-205`); `emitPull`
  also masks secret-shaped strings. *observed*
- **inside the bundle.** adam's capture guard and tamper watch run in the frame's
  window only; the voice, shepherd and key settings are not in the bundle.
  *observed*

## failure modes

| failure | what the operator sees |
| --- | --- |
| no webgl | card: "this browser has no webgl…", no frame, no retry (`:208`) — *observed* |
| `/adam` missing or not the console | card: "the globe's files are not on this deployment…", try again, open on its own — *verified* |
| ADAM fails to start | card: "the globe loaded but could not start on this device." + ADAM's message — *observed* |
| slow first load | veil, then at 15 s "still coming — … about 30 mb…" — *observed* |
| no answer in 60 s | card over the still-loading frame; a late load clears it — *observed* |
| tiles blocked | the globe without imagery; adam's own source chip shows the fallback — *verified (this sandbox)* |
| plot lookups fail | "plotted 0 of n · n could not be found by name." — *verified* |
| room left mid-load | frame blanked and removed — *verified* |

## interface & accessibility

- **layout.** desktop: header (title + one-line blurb), optional hand-off strip,
  then the frame in a 16px-radius hairline panel filling the rest. phone: title
  only, the frame edge to edge under a top hairline; the blurb returns at `sm`
  (`:216-221`, `:253`). *verified at 1440×900 and 390×844.*
- **one focal point.** the globe. the double name is gone: the frame no longer
  shows ADAM's own "asherin.adam" title box (`src/embed/asherin.css:179-182`).
  *verified (`#title-bar` computed `display: none`; screenshots).*
- **colour only for meaning.** inside the frame the palette is the room's:
  near-black, white at low alpha, thin type, lowercase; amber and red remain
  only on warn/critical states. the blue ellipsoid is cesium's untextured globe
  when tiles cannot load, not chrome. *verified by eye.*
- **states.** the veil is `aria-live="polite"`, the card and the plot result are
  `role="status"`; the spinner turns only under `motion-safe`. *observed*
- **keyboard.** the frame takes focus like any element; adam's shortcuts (`?`
  for the list) act only while focus is inside it. *inferred*
- **copy.** lowercase throughout; proper names only in adam's attribution.

## relationships

| edge | type | real in code? |
| --- | --- | --- |
| google (location prophet, contact intelligence) → adam | writes_to the hand-off, then navigates (`LocationProphet.tsx:258-260`, `ContactIntelligence.tsx:827-833`, `:997-999`) | **yes, now.** it was written and never read; the room reads, clears and plots it (`:61-96`, `:178-206`) — *verified* |
| adam → connect | writes_to the pull ledger, organ `adam` (`:197-205`), shown under the room by `src/lib/connect/graph.ts:98-99` | yes for plotting; tile traffic inside the frame is not on the ledger — *observed* |
| chat → adam | reads_from: shepherd's system prompt names the room (`src/lib/local/prompts.ts:19`) | name only. chat does not open the room or hand it a place; `inferChatConfig` has no globe branch — *observed* |
| sentinel's environment panel ↔ adam | none | **no edge.** the panel records location fixes and bluetooth sightings in sentinel's own tables and offers "name this place" through nominatim; it never hands a fix to the globe, and the globe never reads sentinel — *observed* (open gaps) |
| sidebar, palette, aliases → adam | calls (navigation) | yes — *verified* |
| adam → vault, library, projects, key vault | none | none: the room stores nothing and needs no key — *observed* |
| adam → the bundle | depends_on, trusts (same origin) | yes; see security — *observed* |
| the bundle → ADAM upstream | depends_on (a patched build of 0aa5db6) | yes, but the patch lives only in the build checkout (open gaps) |

## performance

- mount: one small room chunk; the frame pulls ~5.5 MB cesium + ~2.5 MB entry,
  then lazy panels and bundled geojson on use; first open ~30 MB at most, then
  cached (`vercel.json:79-96`). *observed sizes*
- timers: two per attempt (15 s, 60 s), cleared on retry and unmount
  (`:102-114`); one mutation observer on adam's loader line, disconnected on
  retry and unmount (`:132-149`). the webgl probe context is released at once
  (`:50`). *observed*
- unmount: the frame is blanked and removed, which ends cesium's render loop,
  its workers and adam's intervals with the browsing context. *verified (no
  frame left)*

## copy & voice

header, veil, strip, result line and card are lowercase and say what happens
and where data goes. remaining off-key words are inside the bundle: the
view-mode chip top right reads "orbital view · normal style · detection on",
and "detection" means contact detection, which this build has no contacts for
(open gaps). the old line "nothing leaves except the tile requests" still stands
in two places outside the room — `src/lib/navIntents.ts:52` and
`src/pages/Software.tsx:62` — and is **contradicted** by the photon and
open-meteo rows above (review log #2).

## tests & proof

- `scratchpad/adamtest2.mjs` (playwright, chromium): serves `dist/` with the
  headers of `vercel.json` applied in order and `cleanUrls`' 308 for
  `/adam/index.html`; opens the room at 1440×900 and 390×844; reads the frame's
  dom (title bar hidden, loading cover lifted, webgl canvas, annotation engine
  present); seeds a google hand-off and plots it; serves a 404 for the bundle
  (service workers blocked so the route applies) to see the card; leaves the
  room and counts frames; logs every outbound host and every console error that
  is not a blocked-network failure. result: no console errors; hosts as in
  integrations; headers on `/adam` SAMEORIGIN / `'self'` / `no-cache`.
- screenshots: `shots/adam-desktop.png`, `adam-phone.png`,
  `adam-handoff-strip.png`, `adam-handoff.png`, `adam-fallback.png` (in the
  session scratchpad).
- `npx tsc --noEmit -p tsconfig.app.json`: no error in the room;
  `npx eslint AsherinAdamView.tsx`: clean; `npm run build`: green.
- no unit test covers `readHandoff` or the failure classification (open gaps).

## open gaps

- **trust boundary.** the bundle shares asherin's origin. isolating it needs an
  opaque-origin sandbox, storage that tolerates denial, and a `postMessage`
  contract for ready/failed/plot instead of reading the frame's dom.
- **provenance.** `public/adam/` is built from a patched ADAM checkout whose
  changes (74 files: the embed profile, the gates, the restyle) are not in this
  repo; without them the bundle cannot be rebuilt. the patch was exported to
  the session scratchpad as `adam-embed.patch`.
- **sentinel ↔ globe.** a location fix in sentinel's environment panel could be
  handed over the way google's places are; nothing does that today.
- **chat ↔ globe.** chat knows the room's name but cannot open it at a place.
- **live data.** flights, ships, satellites, weather radar, fires, cameras and
  every intel panel need a gateway this edition does not have; they are absent,
  not broken.
- **"detection on"** in the bundle's view-mode chip names a feature this build
  lacks.
- **vercel itself.** the header order, `:path*` matching `/adam` and the
  `cleanUrls` redirect are verified only against an emulation, not a deployment.

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | the frame showed ADAM's own "asherin.adam" title box under the room's header: two names, two focal points | interface | repair | observed (v1 screenshots) | defect | local correction | adam `src/embed/asherin.css:179-182`; bundle rebuilt | `#title-bar` display none in the frame; desktop and phone screenshots |
| 2 | header promised "nothing leaves except the tile requests"; photon (search, plot) and open-meteo (sky) also leave | semantic | repair (room); cause (elsewhere) | contradicted by the host log and code | wrong claim | requirement reconciliation | `AsherinAdamView.tsx:23-24`. **still open** in `src/lib/navIntents.ts:52` and `src/pages/Software.tsx:62` (shared files, left to the main session) | header text in the run |
| 3 | the sky panel asked open-meteo for conditions on every camera settle below 300 km, panel closed or not, with the view centre to ~11 m | security | repair | observed (`skyPanel.js` move handler) | defect | contract repair | adam `src/ui/adam/skyPanel.js:473-478` (embed: only while open); `src/embed/weather.js:15-16` (0.01°) | boot host log has no open-meteo; low-altitude case inferred |
| 4 | a 20 s timer replaced a merely slow frame with a failure card, killing a 30 mb first load on a slow link | behavioral | repair | observed | defect | local correction | `AsherinAdamView.tsx:26-28`, `:102-114`, `:168` (slow note at 15 s, card at 60 s over a still-mounted frame) | code read; not exercised |
| 5 | the card blamed webgl but nothing checked it; a frame that loaded but could not start showed ADAM's red "Error:" while the room said ready | behavioral | repair | observed | defect | contract repair | `hasWebGl` `:45-55`, `:102-105`; `watchBoot` `:132-148` | 404 path verified; webgl and boot paths code read |
| 6 | "reload" reloaded the whole dashboard to retry one frame | interface | repair | observed | defect | local correction | `retry` `:171-176`, `key={attempt}` `:256` | code read |
| 7 | google's "plot on map" / "plot contacts" wrote names, emails and places to localStorage and opened a room that never read them: a dead control and contact data left at rest | state | repair | observed (`mapBridge.ts:413-461`; no reader) | defect | contract repair | `:61-96` read once and clear; `:178-206` consented plot via the frame's annotation engine; emails never read | run: strip shown, both keys null, "plotted 0 of 2" |
| 8 | under strict mode the effect would read, clear, then re-read empty, losing the hand-off | state | repair | inferred (react double effects) | defect | local correction | read in the state initializer `:84-85`, clear in the effect `:95-97` | code read; strip shown in the run |
| 9 | nothing put the room on the connect ledger (the retired eye view did; the new room did not) | dependency | repair | observed | defect | local correction | `emitPull` on plot `:197-205`, counts only | code read; ledger row not inspected |
| 10 | the header rule `/adam/(.*)` does not match `/adam`, where `cleanUrls` serves the frame's page: on vercel the frame would be refused under DENY | security | repair | inferred from vercel's documented `cleanUrls` | defect | boundary repair | `vercel.json:79` → `/adam/:path*` | emulated headers on `/adam`: SAMEORIGIN, `'self'`; deployment unverified |
| 11 | the bundle's page was cached 30 days: after a redeploy it points at hashed files that no longer exist | performance | repair | observed | defect | contract repair | `vercel.json:79-96` (day default, hashed assets immutable, page no-cache) | emulated `no-cache` on `/adam` |
| 12 | the room root reused the dashboard wrapper's class `asherin-adam-pane` | structural | repair | observed | defect | local correction | root class `asherin-adam-room` `:216` | code read |
| 13 | the webgl probe left a live context behind | performance | repair | observed | defect | local correction | `loseContext()` `:50` | code read |
| 14 | the frame is same-origin and unsandboxed: the bundle has asherin's authority over storage and the parent page | security | cause | observed | defect (accepted for now) | architectural migration (not done) | documented in the room header comment and here | — |
| 15 | the bundle's source patch lives only in the build checkout | verification | cause | observed | defect | dependency restructuring (not done) | patch exported to the session scratchpad | — |
| 16 | "detection on" in the bundle's view-mode chip names contact detection, which this build lacks | semantic | cause | observed | defect | local correction (not done, adam-side) | — | — |
| 17 | no unit test covers the hand-off reader or failure classification | verification | cause | observed | defect | — | — | — |
