```
room: asherin.vedic   view id: vedic-astrology   files: src/components/dashboard/VedicAstrologyView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

files: `src/components/dashboard/VedicAstrologyView.tsx` (surface, form, wheel, timeline), `src/components/dashboard/vedic/ShepherdChatPanel.tsx` (shepherd beside the chart, notes), `src/components/dashboard/vedic/{TransitsPanel,WealthHousesPanel,SwvPanel,CompatibilityPanel,DashaNode,CustomChartBuilder,GlobalChartTab,GlobalPredictionsTab,TimelineZoomer,WW3Dossier}.tsx`, `src/components/vedic/VedicGodsCompat.tsx`, `src/lib/vedic/*` (ephemeris wrapper, dasha, transits, readings, validation, date extraction), `src/data/vedic/*` (country, leader, company, eclipse and prediction tables). screenshots are not yet taken (another process owns the browsers in this pass), so the status block says so instead of claiming them.

## purpose & promise

the room casts a sidereal (Lahiri) vedic birth chart on this device with the Swiss Ephemeris compiled to wasm (`src/lib/vedic/sweChart.ts:46-62, 64-114`), reads it with rule-based engines (whole-sign houses, Vimshottari dashas, yogas, strengths and vulnerabilities, archetypes), forecasts the Moon's transits against it, and lets the operator ask shepherd — the model they connected — about that one chart. nothing in the room is a server call except two public lookups the operator triggers by typing a city: a place search and a time-zone lookup, both bounded and both optional (`VedicAstrologyView.tsx:256-294`, `src/lib/vedic/timezoneLookup.ts:21-45`). the interface promises exactly that: the header reads "Swiss Ephemeris · sidereal Lahiri · computed on this device" (`VedicAstrologyView.tsx:854-857`), the empty state says "nothing leaves this device until you ask shepherd" (`:1497`), and the shepherd panel says where the question goes before the first one is sent (`ShepherdChatPanel.tsx:223`). saved charts and notes live in the device store and reopen without an account (`:210-221`, `ShepherdChatPanel.tsx:87-97`).

## entry & navigation

- sidebar group `understand`, label `asherin.vedic`, codename `transits`, blurb "moon-driven transits and timing", keywords vedic/astrology/transit/dasha/chart (`src/lib/navIntents.ts:160-167`).
- `Dashboard.tsx:39` lazy-loads the view with retry; `:185` lists `vedic-astrology` among the rooms that stay mounted as rooms (not chat); `:2092-2096` renders `<VedicAstrologyView />` inside `ErrorBoundary` + `Suspense`.
- v.2 shell title is `vedic` with no subtitle (`src/lib/dashboard/v2Titles.ts:40`) — see shared-file patches. the default chrome is `current` (`src/lib/dashboardUi.ts:14`), so the room draws its own header line (`VedicAstrologyView.tsx:848-858`).
- what loads first: the `my charts` tab with the birth form, and one read of `vedic_charts` from IndexedDB ordered newest first (`:210-225`). no ephemeris work happens until a chart is asked for; the wasm module is fetched on the first computation and cached for the session (`sweChart.ts:46-62`). the service worker precaches `/wasm/swisseph.wasm` so a second visit computes offline (`public/sw.js:7`).
- seven tabs in a `role="tablist"` strip (`:861-882`): my charts, country charts, company charts, global predictions, global chart, custom chart, mythology match. the chart sections below the tabs render whenever a chart exists, whichever tab is open (`:1211-1500`).

## workflow

happy path:
1. **birth data** (`:1085-1200`). date, local time, utc offset, city, latitude, longitude. typing two or more characters into the city field debounces 350 ms and queries nominatim (`:282-297`, `:256-294`); picking a result fills latitude and longitude to four decimals (`:1151`). once date, latitude and longitude exist the utc offset resolves itself after 300 ms through `resolveBirthTimezone` (`:306-330`): the iana zone name shows under the field when the zone service answered (`:1121-1123`); when it did not, the offset is a longitude estimate and the field says so in amber — "estimated from longitude — the zone service was unreachable, check this value" (`:1124-1126`, state at `:167, 321`). `override` switches to manual entry; typing in the offset field also switches to manual (`:1096-1104, 1113`).
2. **generate chart** (`:343-357`). `validateChartInput` checks the date shape, the time shape, both coordinates and their ranges, and the offset range, and names the missing field in lowercase (`src/lib/vedic/chartInput.ts:18-32`). the ephemeris then returns nine bodies (Sun…Saturn, Rahu; Ketu as Rahu + 180°), the ascendant, the Lahiri ayanamsa and the julian day (`sweChart.ts:64-114`). the form's active name is cleared so the chart is "unsaved · date time" (`:346-348`, `:504-508`).
3. **read it**. the south-indian style wheel with sign and house per cell (`:76-140`, `:1215`); lagna card; Moon nakshatra and pada with its deity and a description (`:1227-1234`); planetary positions with house, sign, nakshatra, pada and degree (`:1236-1253`); mythological archetype match from placements (`:1258-1277`, `VedicGodsCompat.tsx:50-58`); the moon-driven transit forecast (`:1280-1292`); whole-sign houses with per-house readings and transit triggers (`:1294`); strengths · weaknesses · vulnerabilities (`:1296`); the deterministic reading (`:1299-1324`); the Vimshottari timeline with the active path down to prana, influence windows and 14 mahadashas that drill down on demand (`:1326-1491`).
4. **save named chart** (`:359-396`). requires a name and a computed chart; writes one `vedic_charts` row through the local PostgREST shim, which stamps `id`, `created_at` and the device `user_id` itself (`src/lib/local/postgrest.ts:437-439`); the new row becomes the active chart (`:376-379`) so shepherd's context key is `user:<id>` (`:497-502`); toast "saved <name>". enter in the name field saves too (`:1154`).
5. **reopen it**. `saved (n)` opens the list (`:1158-1160, 1166-1193`); each row shows date, time, place (`:1175`) and a compact placement strip computed lazily for every saved row (`:228-255`); tapping a row (`:1173`) runs `loadChart`, which honours the saved offset exactly (`tzAuto` off, `:398-427`) and toasts "loaded <name>".
6. **ask shepherd** (`:1506-1522`, `ShepherdChatPanel.tsx`). the floating button is disabled with a title "generate or load a chart first" until a chart exists (`:1506-1508`). the panel is a right-side dialog; the question goes to `streamChat` with the chart context fenced as the only ground (`ShepherdChatPanel.tsx:118-141`), the answer streams in, `stop` aborts it (`:158`), and any date shepherd writes (iso, us slash, "April 12, 2031", "12 April 2031", "April 2031") is lifted by `extractDates` and marked on the Vimshottari strip as "shepherd markers" (`:143-144`, `src/lib/vedic/extractDates.ts:36-61`, `VedicAstrologyView.tsx:1343-1385`). any answer can be kept as a note (`:232-237`, `:160-168`).

secondary paths:
- **country / company / leader / founder charts**: each card is a button that loads that foundation or natal moment into the form and computes it (`:429-456, 674-702, 775-831`); the lagna and placement strips on the cards are computed lazily for all 65 countries, 65 leaders, 25 companies and their founders the first time each tab opens (`:597-672, 702-773`). when the operator has a chart, leader and founder names are coloured by lagna relationship to it (soulmate / friend / enemy / neutral, `src/lib/vedic/lagnaRelationship.ts`), with a legend above the grid (`:898-905, 1001-1008`).
- **compatibility** (`:1204-1210`, `CompatibilityPanel.tsx`): ashta-koota (36 points) between the active chart and a country or another saved chart (`src/lib/vedic/compatibility.ts:143-165`); the saved option is empty until a second chart is saved and says so (`CompatibilityPanel.tsx:54, 108`).
- **delete a saved chart**: the bin arms an inline `remove / keep` pair; the second tap deletes and, if it was the active chart, clears the active name (`:457-475`, `:1177-1186`). no browser `confirm()`.
- **transit forecast navigation**: week/month granularity, previous/next period, previous/next year, `now`; a company chart can replace the operator's own as the subject (`TransitsPanel.tsx:307-370`).
- **custom chart**: drag a planet onto a house, or tap a planet then tap a house (touch screens have no html drag), pick the lagna sign, set retrograde and nakshatra per planet, `read chart` runs the same deterministic engine, `save` keeps up to any number of boards in localStorage (`CustomChartBuilder.tsx:96-106, 164-196, 262-300`).
- **global predictions / global chart**: read-only tabs — editorial tables (`src/data/vedic/globalPredictions.ts`, `solarEclipses.ts`) and a live Mesha Sankranti world chart with current transits (`GlobalChartTab.tsx:60-74, 109-127`).
- **retry**: a failed city lookup leaves the typed coordinates editable (`:1152-1155`); a failed chart shows one line and keeps the form (`:1195`); a failed world chart shows one line (`GlobalChartTab.tsx:233-239`); a failed shepherd turn is marked in the thread and the next send drops it from history (`ShepherdChatPanel.tsx:110, 146-151`).

## state & data

react state (`VedicAstrologyView.tsx:162-203`): the form fields as strings; `tzZoneName`, `tzAuto`, `tzResolving`, `tzSource`; `cityResults`, `searching`; `chart: SweVedicChart | null`; `expandedDasha` map; `loadingChart`, `error`; `savedCharts`, `chartName`, `showSaved`, `saving`, `pendingDeleteId`; `tab`; `showCompat`; `activeCountry`, `activeSavedId`, `activeName`; `chatOpen`; `asherDates` (dates shepherd named); lagna and placement caches per country/leader/company/founder/saved row; `transitIngresses` published up from the transits panel for the houses panel (`:1290, 1294`). all of it dies with the component.

derived (`useMemo`): `dashaTimeline` — 14 mahadashas from the dasha Moon (`:477-480`); `currentDasha` (`:482`); `reading` (`:484-494`); `chartKey` — `country:<code>` | `user:<id>` | `adhoc:<date_time_lat_lon>` (`:497-502`); `chartLabel`; `chartContext` — the plain-text ground shepherd receives (`:510-538`); `influenceMarkers` (`:567-597`).

indexeddb, through the shim (`src/lib/local/postgrest.ts`), table store `asherin_local_v1`:
- `vedic_charts` rows `{ id, user_id, name, birth_date, birth_time, tz_offset, latitude, longitude, city_label|null, created_at }` (`:359-383`). lifetime: until the operator removes the row. never leaves the device.
- `chart_notes` rows `{ id, user_id, chart_key, chart_label, note, source: "shepherd", created_at }` (`ShepherdChatPanel.tsx:160-168`). same lifetime; never leaves the device.

localStorage: `asher_vedic_custom_charts_v1` — the custom boards, shape-checked on read so a hand-edited value cannot break the tab (`CustomChartBuilder.tsx:51-74`). the legacy keys `asher_vedic_keys_v2` / `asher_vedic_keys`, where the hosted build kept raw provider keys, are removed on the panel's first mount (`ShepherdChatPanel.tsx:37, 63-67`).

vault: never touched by this room. `streamChat` resolves the active provider and its key from the device vault internally (`src/lib/ai.ts:59-96`); the room sees neither.

in-memory caches: the wasm module promise (`sweChart.ts:42`), the zone lookup cache keyed by rounded coordinates (`timezoneLookup.ts:18`), the ingress and moon-event caches per subject (`TransitsPanel.tsx:142, 197`).

what leaves the device: the typed city string (nominatim), the birth coordinates (timeapi.io), and — only when the operator sends a question — the chart context plus the question to the connected model provider (`ShepherdChatPanel.tsx:118-141`). nothing else.

## logic

- **ephemeris** (`sweChart.ts`): local wall time minus the utc offset gives ut hours and the birth instant; julian day; sidereal mode Lahiri; topocentric flag with the birth coordinates; nine bodies; houses with the whole-sign system ("W") and the ascendant corrected by the ayanamsa (`:66-113`). the fractional offset is kept (+5.5, +5.75) — truncating it was an earlier defect noted in the file (`:71-73`). a failed wasm load clears the cached promise so the next attempt retries (`:54-59`).
- **validation** (`chartInput.ts:18-32`): date `YYYY-MM-DD`, time `HH:MM`, latitude −90…90, longitude −180…180, offset −14…+14. `describeChartFailure` passes a validation message through and replaces any other error with one plain line, logging the raw error to the console (`:34-38`).
- **time zone** (`timezoneLookup.ts:86-105`): zone name from timeapi.io, verified against `Intl` before it is trusted or cached (`:33-38, 47-54`); the offset at the birth wall-clock instant is converged in two passes so dst at the birth date is honoured (`:57-83`); fallback is longitude / 15 rounded to a quarter hour with `source: "longitude-fallback"`.
- **dashas** (`dasha.ts`): Vimshottari from the Moon's nakshatra; the birth lord's remaining share scaled by the elapsed fraction; sidereal year 365.25636 d (`:36, 125-180`); sub-periods start from the parent's own lord (`:70-97`); the current branch is expanded to deha, other branches one level on demand (`:100-121, 187-204`).
- **readings**: `generateReading` (deterministic corpus by planet × house × sign × nakshatra, `readingEngine.ts:105`), `buildDashaInsight` (power/wealth/relationship scores and life flags per period, `dashaReading.ts:134`), `buildHouseReading` and `buildHouseActivation` (per-house text and which transit unlocks what, `houseReading.ts`, `houseActivations.ts`), `analyzeSwv` (`swvAnalysis.ts`), `compareCharts` (ashta-koota, `compatibility.ts:143`), `matchMythologyFromChart` (cosine match over eight domain weights, `mythologyMatch.ts`). none call the model.
- **transits** (`transits.ts`): a transit chart is a natal computation at the chosen instant with offset 0 (`:33-67`); future ingresses step per planet (`STEP_DAYS`) and bisect to the hour when the sign index changes (`:113-176`). the moon forecast (`moonEvents.ts:184`) lists house ingresses and conjunctions with natal planets for the chosen week or month.
- **date extraction** (`extractDates.ts:36-61`): four shapes, claimed spans so a day-level date is not also read as a month-year, impossible calendar dates and years outside 1800–2200 dropped, output sorted iso strings. the timeline places each at noon utc (`VedicAstrologyView.tsx:551-561`).
- **world chart** (`GlobalChartTab.tsx:60-74`): the most recent 14 april 00:00 ist at New Delhi; the "ten most affected nations" score rotates the world lagna by each country's utc offset as a proxy — the panel's own footnote says it is a proxy, not each nation's foundation lagna (`:136-178, 391`).
- edge cases: a saved chart with a bad stored offset still computes (validation runs on load, `:331-341`); the tz lookup result is discarded if a newer lookup started meanwhile (`:314-321`); a city search superseded by a newer keystroke is aborted silently, a timed-out one is reported (`:264-293`); the custom builder refuses a planet already placed (`CustomChartBuilder.tsx:96-100`).

## integrations & network

| call | where | method / payload | timeout · abort | offline |
| --- | --- | --- | --- | --- |
| `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=<city>` | `VedicAstrologyView.tsx:256-294` | GET, the typed city, `Accept-Language: en`, no key | 8 s (`CITY_LOOKUP_MS`, `:48, 266`); superseded requests aborted (`:264`) | "city lookup is unreachable — type latitude and longitude by hand"; the coordinate fields stay editable |
| `https://timeapi.io/api/TimeZone/coordinate?latitude=&longitude=` | `timezoneLookup.ts:21-45` | GET, the coordinates, no key | 6 s (`ZONE_LOOKUP_MS`, `:11, 25`) | longitude estimate with `source: "longitude-fallback"`, shown in amber under the field |
| `/wasm/swisseph.wasm` (same origin) | `sweChart.ts:50-51` | GET, static | browser default; failure clears the cache for retry (`:57`) | served by the service worker precache (`public/sw.js:7`) |
| model provider (the one connected in settings → intelligence) | `ShepherdChatPanel.tsx:134-141` → `src/lib/ai.ts:133` | streaming chat, the chart context and the question, key from the vault | `AbortController` per turn (`:131`), aborted on stop, on chart change and on unmount (`:71, 77, 158`) | "the model could not be reached from this device…" in the thread; no key → the byok dialog opens and the line says to connect one (`ai.ts:45-53, 71`) |

the room never calls `supabase.functions.invoke`; the former `vedic-asher-chat` edge function is gone from the room. the CSP allows `connect-src https:` (`index.html:20`), so both public lookups are permitted in the browser; in this sandbox they fail and the fallbacks above are what the operator sees.

## security & privacy

- **keys**: no key is read, stored or sent by this room. the old panel kept provider keys as plain json in localStorage and posted them in a request body; the new panel calls `streamChat`, which resolves the key inside `src/lib/ai.ts:85-95` from the vault, and purges the legacy localStorage entries on mount (`ShepherdChatPanel.tsx:37, 63-67`).
- **what the model receives**: the chart context — birth date, time, offset, the place label or coordinates, placements and dasha path (`VedicAstrologyView.tsx:510-538`) — plus the question. the panel says so before the first send (`ShepherdChatPanel.tsx:223`). a birth moment is personal data; it goes only to the provider the operator chose, directly, and only when they ask.
- **model-reply injection**: the reply is rendered as text in a `whitespace-pre-wrap` div, never as html (`ShepherdChatPanel.tsx:229`). dates lifted from it only move markers on a strip (`:143-144`); nothing from a reply is executed, fetched or stored unless the operator presses `keep as note`.
- **hostile responses**: nominatim rows are shape-checked and the label truncated to 160 chars before render (`:275-279`); the zone name is verified with `Intl` before use (`timezoneLookup.ts:47-54`); the custom-chart store is validated on read (`CustomChartBuilder.tsx:59-74`).
- **storage at rest**: IndexedDB and localStorage on this device, unencrypted like every other table in the local edition. birth data and notes are readable by anyone with the unlocked device — the same threat model as the rest of asherin.
- **clipboard / export**: none. the room has no export; nothing is copied without a user gesture.
- **third-party exposure**: the typed city goes to openstreetmap; the coordinates go to timeapi.io. both are public services without keys; the second is skipped entirely when the operator presses `override` and types the offset.

## failure modes

| failure | what the operator sees | where |
| --- | --- | --- |
| missing or malformed birth field | the field named in lowercase under the form, `role="alert"` | `chartInput.ts:18-32`, `VedicAstrologyView.tsx:1195` |
| coordinates or offset off the globe | "latitude must be between -90 and 90" etc. | `chartInput.ts:25-30` |
| wasm fails to load or compute | "the ephemeris could not compute this chart on this device — reload once and try again"; the raw error goes to the console; the next attempt retries | `chartInput.ts:34-38`, `sweChart.ts:54-59` |
| city lookup unreachable / timed out / no match | three distinct lowercase lines; coordinates stay editable | `:285-293` |
| zone service unreachable | offset estimated from longitude, amber hint under the field | `:1124-1126`, `timezoneLookup.ts:104` |
| saved charts cannot be read | toast "saved charts could not be read from this device" | `:216-219` |
| save fails | "the chart could not be written to this device's store" | `:375` |
| save with no name / no chart | "name the chart first" / "generate the chart first, then save it"; the save button is also disabled until a chart exists | `:362-363, 1164` |
| delete fails | toast "the chart could not be removed from this device" | `:463-466` |
| world chart fails | one red line in place of the tab | `GlobalChartTab.tsx:121-124, 233-239` |
| transit ingress scan fails | amber line "the transit scan could not finish on this device — the forecast below is moon-only" | `TransitsPanel.tsx:176-179, 384` |
| moon trace fails | amber line in the forecast body instead of an empty "no events" | `TransitsPanel.tsx:231-233, 425-427` |
| company chart fails | amber line and the subject falls back to the operator's chart | `TransitsPanel.tsx:116-119` |
| compatibility fails | "the comparison could not be computed on this device"; "save a second chart first" when the saved list is empty | `CompatibilityPanel.tsx:54, 61` |
| no model key | the byok dialog, and the panel line repeats `ai.ts`'s own reason ("connect a model key in settings → intelligence…") | `ai.ts:45-53, 71, 93`, `ShepherdChatPanel.tsx:43-49` |
| model unreachable / empty reply | a lowercase line marked as failed in the thread; dropped from history on the next send | `ShepherdChatPanel.tsx:146-151, 110` |
| operator presses stop | partial text stays, nothing is marked failed | `:147-148, 158` |
| notes cannot be read / written | "notes could not be read from this device." / toast "the note could not be saved on this device" | `:93, 165` |
| custom chart store blocked | toast "the custom chart could not be stored on this device" | `CustomChartBuilder.tsx:74` |

no spinner is unbounded: the city search and zone lookup abort on their timers; chart computation is synchronous wasm behind an `await`; the shepherd turn has a stop button; the world chart and transit scans set an error line in `catch`.

## interface & accessibility

- **layout**: a wallpaper layer and a separate scroll container (`:832-846`) — no `background-attachment: fixed`, which mobile safari ignores and desktop browsers repaint on scroll. content column `max-w-6xl`, `p-4` on phone, `p-6` from `sm`, with `pb-24` so the floating shepherd button never covers the last card (`:847`).
- **phone (390 px)**: tab strip is two columns of lowercase labels with a bottom rule between rows (`:861-882`); form fields stack to one column (`:1086`); the wheel is a 420-unit svg that scales to the column width (`:113`); planetary rows use a `20px 64px 1fr auto` grid with tighter gaps (`:1243`); country and company grids are two columns (`:926, 1024`); the italic subtitles that would wrap under section titles are hidden below `sm` (`:895, 992, 1261, 1302`); the shepherd panel is full width and the floating button sits at 16 px from the corner (`ShepherdChatPanel.tsx:184`, `VedicAstrologyView.tsx:1510`); the dossier phase rows stack (`WW3Dossier.tsx:50`).
- **desktop (1440 px)**: seven tabs in one row; wheel beside the cards (`:1213`); readings in two columns; transit forecast cards in two columns.
- **focus & keyboard**: the tab strip has `role="tablist"` / `role="tab"` / `aria-selected` (`:861-881`); every icon-only button carries an `aria-label` (city lookup, remove, close, send, stop, period navigation); the delete confirmation is two ordinary buttons; house cards are keyboard-reachable (`role="button"`, `tabIndex`, enter/space, `WealthHousesPanel.tsx:237-241`); toggles expose `aria-pressed` / `aria-expanded` (granularity, domain chips, swv, dasha nodes, palette planet). the shepherd panel is `role="dialog"` with `aria-modal`, focuses the textarea on open, closes on escape and is `aria-hidden` with `pointer-events-none` when closed (`ShepherdChatPanel.tsx:79-85, 177-186`).
- **motion**: the panel slide and the world-chart pulse honour `motion-reduce` (`ShepherdChatPanel.tsx:184`, `GlobalChartTab.tsx:245`); the ±500-year scrubber animates only while `play` is pressed and cancels its frame on unmount (`TimelineZoomer.tsx:50-70`).
- **contrast**: body copy at `text-muted-foreground/80+` on `bg-background/50`; the amber hint lines are `text-amber-300/80`; errors use `text-destructive`.
- **empty & loading states**: "enter birth details and generate your sidereal chart…" (`:1495-1499`); "no saved charts yet. generate one, name it, and save it — it stays on this device." (`:1169`); "computing planets…" on card strips (`:144`); "computing…" on the generate button (`:1197`); "casting the world chart · sidereal Lahiri…" (`GlobalChartTab.tsx:246`); "tracing the Moon across <period>…" (`TransitsPanel.tsx:422`); "reading the chart…" in the panel (`ShepherdChatPanel.tsx:241`).
- **copy case**: every label, heading, button, placeholder, toast and error in the room's own components is lowercase except proper names (planets, signs, nakshatras, places, Lahiri, Vimshottari, Swiss Ephemeris, NASA). the `uppercase` utility is gone from all thirteen component files.

## performance

- mount: one IndexedDB read; no ephemeris until requested. the wasm module (`sweph-wasm`, excluded from vite optimisation, `vite.config.ts:30`) is imported on the first chart and kept for the session (`sweChart.ts:42-62`).
- the country tab computes 65 + 65 charts and the company tab 25 + 25, sequentially, the first time each opens, with a cancel flag on unmount (`:597-672, 702-773`); each computation is synchronous wasm, so the tab fills over a second or two on a laptop. results are cached in state for the session.
- the transit panel's ingress scan steps and bisects per planet (`transits.ts:113-176`) and the moon trace bisects to the minute (`moonEvents.ts:184`); both run on the main thread behind `await`s, cache per subject and period (`TransitsPanel.tsx:142-187, 197-236`), and are cancelled by the effect cleanup when the subject or period changes.
- `influenceMarkers` expands every mahadasha's children once per chart (`:567-597`); dasha nodes expand further only on click (`DashaNode.tsx:64-68`).
- timers: the 350 ms city debounce and 300 ms zone debounce are cleared on change and unmount (`:282-297, 306-330`); the city and zone fetch timers are cleared in `finally` (`:290`, `timezoneLookup.ts:44`); the zoomer's `requestAnimationFrame` is cancelled on pause and unmount (`TimelineZoomer.tsx:66-69`); the shepherd abort controller is aborted on chart change and unmount (`ShepherdChatPanel.tsx:70-77`).
- media: one wallpaper webp, in a non-scrolling layer (`:836-845`).
- no workers; see open gaps.

## copy & voice

- the room's words are lowercase except proper names; "shepherd" is the model everywhere the operator meets it — the floating button "ask shepherd" (`:1512`), the panel title "shepherd" (`ShepherdChatPanel.tsx:192`), the thread roles "you" / "shepherd" (`:228`), "shepherd markers" on the timeline (`:1345`). the deterministic engines are called what they are — "deterministic reading", "rule-based, from placements · not the model" (`:1303-1304`, `CustomChartBuilder.tsx:384`).
- no account-era language: no "sign in", no "admin · platform", no "your api keys". the shim's always-present identity is never mentioned to the operator; it is just this device.
- "kernel offline" does not appear in the room; every capability here has a device answer.
- forecasts are labelled as a tradition's reading, not a measurement: the global predictions header (`GlobalPredictionsTab.tsx:29`), the ww3 dossier header (`WW3Dossier.tsx:14-15`), the eclipse footnote (`GlobalChartTab.tsx:511`) and the wealth-and-power method line (`TransitsPanel.tsx:709`).
- third-party attribution uses the `~ source` form: "~ NASA / Espenak eclipse canon" (`GlobalChartTab.tsx:448`).
- dates are en-US where formatted (`:54-62`), times in the device's local zone; the forecast says so (`TransitsPanel.tsx:397`).

## tests & proof

- `src/lib/vedic/__tests__/chartInput.test.ts` — the validator parses a full form, names the missing field, refuses off-globe values, and `describeChartFailure` hides an engine error behind one plain line while still logging it.
- `src/lib/vedic/__tests__/extractDates.test.ts` — four date shapes, month-year anchoring without double counting, impossible dates dropped, empty input.
- `src/lib/vedic/__tests__/timezoneLookup.test.ts` — unreachable service → longitude fallback with `source`; a real zone → dst-aware historical offsets (−4 / −5 for New York); an unknown zone name is not cached.
- `src/lib/vedic/__tests__/savedCharts.test.ts` — against the on-device store with `fake-indexeddb`: save a named chart with no account, read it back newest first with the device `user_id` stamped by the shim, remove it; notes stay scoped to their chart key.
- end-to-end step (to be driven when the browsers are free): enter 1990-06-15 08:30 at 28.6139 / 77.209 with offset 5.5 → generate → the lagna card and nine positions render → name "test natal" → save → `saved (1)` → reopen → "loaded test natal" → ask shepherd "when does my next Jupiter mahadasha start" → an answer with a `YYYY-MM-DD` date appears as a shepherd marker on the timeline.
- screenshots: not taken in this pass; the status block says `desktop – phone –` and must be flipped by eye, not by assertion.

## open gaps

- the two public lookups (nominatim, timeapi.io) are the only server calls and both are optional; there is no on-device gazetteer, so without a network the operator types coordinates and the offset by hand. an offline city table would close this.
- generated prose and the data tables keep their original casing: the readings corpus (`src/data/vedic/readings-corpus.json`), swv finding titles such as "Sun EXALTED in Aries (H10)" (`src/lib/vedic/swvAnalysis.ts:116-130`), the editorial prediction and dossier tables (`src/data/vedic/globalPredictions.ts`). the room's chrome is lowercase; the content it quotes is not yet.
- the predictions, dossier and eclipse-omen tabs are editorial tables with no provenance beyond file comments; the interface now says they are a tradition's forecast, but it cannot show a source per row.
- the ten-most-affected-nations score uses a utc-offset rotation of the world lagna as a proxy for each nation's lagna; the panel says so. computing 65 foundation lagnas for the real thing is a tab-open cost the room already pays elsewhere and could reuse.
- ephemeris scans run on the main thread; a worker would keep the page responsive during the first country-tab fill and the transit bisection.
- custom boards live in localStorage rather than the device table store; they never leave the device either way, but they are not part of the same store the rest of the room uses.
- no export or import of saved charts.
- vision confirmation (desktop 1440×900, phone 390×844) is outstanding.

## review log

| # | finding | kind | fix | confirmed by |
| --- | --- | --- | --- | --- |
| 1 | `saveChart` threw "Sign in to save named charts" behind an auth check although the local identity is always present; `loadSavedCharts` had the same gate | defect | `VedicAstrologyView.tsx:210-225, 359-396` — no auth gate, shim stamps `user_id`; `savedCharts.test.ts` | vitest |
| 2 | the chat panel read raw provider keys from localStorage json and posted them to `vedic-asher-chat`, which the local shim answers "kernel offline" — the feature was dead and the keys were exposed | defect | `AsherChatPanel.tsx` removed; `ShepherdChatPanel.tsx:118-157` routes through `streamChat`; legacy keys purged (`:37, 63-67`) | tsc, eslint, grep (no `localStorage` key read, no `functions.invoke` in the room) |
| 3 | nominatim fetch had an abort controller but no timeout | defect | `VedicAstrologyView.tsx:48, 264-293` — 8 s timer, distinct lines for timeout / unreachable / no match | code read |
| 4 | timeapi.io fetch had no timeout or abort and cached any string as a zone | defect | `timezoneLookup.ts:11, 23-45, 47-54` — 6 s timer, `Intl` check before caching | `timezoneLookup.test.ts` |
| 5 | a longitude-estimated offset was shown as "(auto)" with no warning | defect | `tzSource` state and amber hint (`:167, 321, 1124-1126`) | code read |
| 6 | a slow zone lookup could overwrite a newer field value | defect | request sequence guard (`:207, 314-321`) | code read |
| 7 | raw engine errors (`WebAssembly.instantiate(): failed`, `TypeError`) were shown as the error line; "World chart failed: <raw>"; compatibility showed raw `e.message` | defect | `chartInput.ts:34-38`, `GlobalChartTab.tsx:121-124`, `CompatibilityPanel.tsx:61` | `chartInput.test.ts` |
| 8 | birth input was only checked for NaN; 95° latitude or +30 h offset computed a chart | defect | `chartInput.ts:18-32` | `chartInput.test.ts` |
| 9 | save needed only a date, so a chart that was never computed could be saved; the saved chart did not become the active one for shepherd | defect | `:362-379` | code read; `savedCharts.test.ts` for the insert/select path |
| 10 | delete was one tap with no confirmation | defect | two-tap `remove / keep` (`:457-475, 1177-1186`) | code read |
| 11 | capitalised chrome: "VEDIC STRATEGY — SWISS EPHEMERIS · SIDEREAL LAHIRI · CUSTOM CHART ENGINE", `uppercase` on ~170 labels across 13 files, title-case toasts and errors | defect | all room components lowercased; `uppercase` count is 0 in every room file | grep |
| 12 | the model was called "ASHER" / "Asher AI", with an "Admin · Platform Gemini" toggle gated on an owner-email hash; the deterministic custom reading was labelled "ASHER Chart Reading" | defect | shepherd everywhere; admin path removed; "deterministic reading" (`CustomChartBuilder.tsx:384`) | grep |
| 13 | the custom chart builder was html drag-and-drop only — dead on touch screens | defect | tap-to-select, tap-to-place (`CustomChartBuilder.tsx:96-106, 262-300`) | code read |
| 14 | transit ingress and moon-event failures were swallowed (`console.error` + empty list, read as "no events"); a failed company chart left the spinner's subject undefined | defect | `TransitsPanel.tsx:82, 116-119, 176-179, 196, 231-233, 384, 425-427` | code read |
| 15 | `background-attachment: fixed` on the scroll container — ignored by mobile safari (image stretched over the whole scroll height) and repainted per scroll on desktop | defect | wallpaper layer + separate scroll container (`:832-846`) | code read |
| 16 | tab strip: two columns of wrapping caps labels on phone, no tablist semantics | defect | lowercase labels, `sm:grid-cols-4`, `role="tablist"` (`:861-882`) | code read |
| 17 | dates named by the model were marked only because the server extracted them; without the server no marker could appear | defect | `extractDates.ts`, wired at `ShepherdChatPanel.tsx:143-144` | `extractDates.test.ts` |
| 18 | notes insert required `auth.user`; notes were only saved when the server returned a `note` field | defect | `keep as note` on any answer (`ShepherdChatPanel.tsx:160-168, 232-237`) | `savedCharts.test.ts` (chart_notes scoping) |
| 19 | the "ten most affected nations" footnote implied a per-nation lagna; the score rotates the world lagna by utc offset | wrong claim (copy) | footnote names the proxy (`GlobalChartTab.tsx:391`) | code read |
| 20 | `transits.ts` `let loSign` never reassigned (lint error); `CompatibilityPanel` effect missing `targetSaved`; unused imports in five files; `catch {}` swallowing a storage write | defect | `transits.ts:141`, `CompatibilityPanel.tsx:68`, `CustomChartBuilder.tsx:74`, imports | eslint: 0 errors in room files |
| 21 | the custom-chart localStorage value was parsed and trusted as-is | defect | shape check and house back-fill (`CustomChartBuilder.tsx:59-74`) | code read |
| 22 | first-draft narrative claimed `supabase.auth.getUser()` could return no user; the shim always returns one (`src/lib/local/auth.ts:139-141`) — the "sign in" string was unreachable, not thrown | wrong claim | narrative corrected; the string removed anyway as account-era copy | code read |
| 23 | the floating "ask" button was disabled with no explanation when no chart existed; the save and compatibility buttons likewise | defect | titles "generate the chart first" / "generate or load a chart first" (`:1155, 1161, 1508`) | code read |

### shared-file patches (not applied — proposed)

1. `src/lib/dashboard/v2Titles.ts:40` — the v.2 shell shows a bare "vedic" with no subtitle while every neighbouring room carries its `asherin.` name and one line.
   ```ts
   // old
     "vedic-astrology": { title: "vedic" },
   // new
     "vedic-astrology": { title: "asherin.vedic", subtitle: "your sidereal chart, computed on this device." },
   ```
2. `src/lib/navIntents.ts:160-167` — no change needed; label, codename and blurb are lowercase and true.
3. `src/lib/local/postgrest.ts` — no column defaults are needed for `vedic_charts` or `chart_notes`; the readers tolerate a missing `city_label` (`VedicAstrologyView.tsx:1175`) and the shim stamps `id`, `created_at` and `user_id` (`postgrest.ts:437-439`).

## vision confirmation — 2026-10-26

screens: final3-d-vedic-astrology.png and final3-m-vedic-astrology.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: the chart tabs and birth form render at both widths. open item: the floating "ask shepherd" button can sit over the last form row on phone until the page scrolls.
