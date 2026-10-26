room: asherin.google   view id: google   files: src/components/dashboard/google/GoogleIntelligenceView.tsx (+ MultiAccountManager.tsx, NexusChatPanel.tsx, stationTools.ts, offline.ts, OrganOffline.tsx, intel/*, modules/*, modules/contactIntel/*)
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)

line anchors were taken after the fixes in this pass; `useGoogleApi.ts`, `functions.ts`, `Dashboard.tsx`, `navIntents.ts`, `v2Titles.ts` are quoted at the lines they had on 2026-10-25 and were not edited (see shared-file patches).

## purpose & promise

asherin.google is the station that reads an operator's own google account —
mail, calendar, drive, contacts, fitness, youtube, oauth grants — and turns the
reads into findings: correspondent dossiers, recurring spend, presence
rhythm, envelope forensics, a seven-day projection. twenty-five desks sit in
four directorates (collection, analysis, forecast, counterintel) over eight
raw feeds (`GoogleIntelligenceView.tsx` l.78–120), with a station analyst
(shepherd) that answers only from what a desk actually returned
(`NexusChatPanel.tsx` l.103–168).

what the interface promises after this pass, in its own words: "held on this
device · read only when you ask" and "nothing leaves unasked" (l.197–202);
"collection offline · no account connected" (l.234); and on the overview, the
one sentence every desk shares: "no google account is connected. the
authorization exchange ran on a server asherin no longer has, and no
browser-only path is wired yet." (`offline.ts` l.60–62, rendered by
`MultiAccountManager.tsx` l.43). the promise the room makes is therefore a
negative one, stated plainly: on this device the station reads nothing from
google, and no button pretends otherwise.

what it does not promise any more: a server sweep while the tab is closed, a
push notification, an email, a companion app, an "Authorize Account" exchange,
a tier ladder you can climb, a probability of changing career.

## entry & navigation

- the sidebar group `find` lists it as `asherin.google` / "your accounts" with
  blurb "your connected google accounts, read on request" (`navIntents.ts`
  l.109–116); the v.2 shell titles it `google` with subtitle "your connected
  accounts, read on request." (`v2Titles.ts` l.30). both subtitles still
  speak of connected accounts — a wrong claim on a device, listed under
  shared-file patches.
- `Dashboard.tsx` lazy-loads the view (l.41) and renders it through
  `gatedView("google", …)` (l.2047–2052) inside `ErrorBoundary` + `Suspense`
  with the "Loading…" fallback. the title string passed there, "Cloud
  Intelligence Mesh", is only used by `RetiredRoom`, which this live view
  never reaches.
- what loads first: the overview tab (`activeModule` initial `"overview"`,
  l.134), which mounts `MultiAccountManager` (l.300), the desk directory
  grouped by directorate, the feeds grid, the method cards, and the analyst
  panel under everything (l.409). the station header shows the standing rule
  and the offline status control (l.193–237). under the v.2 shell the room
  drops its own `h1` and keeps only the count line, so the title is not said
  twice (`useIsV2` l.12, 133; l.211–220).
- navigation inside the room is a two-level strip: `overview` and the four
  directorates as `role="tab"` buttons (l.246–276), then the selected
  directorate's desks underneath (l.278–298). a desk opened from the overview
  grid pulls its directorate with it (`activeDirectorate` l.139–141). feeds
  belong to no directorate; the stored `directorate` state survives a jump to
  one and back.
- the status control in the header is a real button: it opens the overview
  (l.229), where the gap is explained. nothing in the header starts an
  authorization.

## workflow

### happy path on this device

1. the operator opens the room. the overview paints: connection card
   (`MultiAccountManager`), four directorate sections of desk cards, feeds,
   method, analyst.
2. the connection card states `NO_ACCOUNT_PATH`, lists the three things a
   browser-only path would need (`BROWSER_PATH_NEEDS`, `offline.ts` l.71–75),
   and says why there is no button (`MultiAccountManager.tsx` l.39–56).
3. the operator opens any desk from the grid or the strip. every desk that
   reads through `useGoogleApi().fetchGoogleData` is gated on `isConnected`,
   which is false on this device (see state & data), so it renders its
   header, dashes in its stat tiles, and `CONNECT_UNAVAILABLE` — "no google
   account can be connected on this device yet, so this desk has nothing to
   read." (`offline.ts` l.64–66; e.g. `CalendarWizard.tsx` l.87,
   `EmailAssistant.tsx` l.82, `LocationProphet.tsx` l.271). the findings
   desks (ledger, archive, waypoint, lattice, augur, bulwark, oauth grants)
   additionally render one `silenceFinding` whose action line is "no connect
   path exists on this device yet — see the station overview for what it
   would take." (`lattice.ts` l.24–30, `deepDive.ts` l.859–864, `augur.ts`
   l.383–389, `SubscriptionOracle.tsx` l.80–86, `ContentIntelligence.tsx`
   l.57–63, `LocationProphet.tsx` l.71–77).
4. every desk whose data lives behind an edge function rather than
   `google-data` (substrate, meet, ghostmail, dossiers, signal, overwatch,
   organism, guardian, transit, trip recorder, sentinel, network, mesh) calls
   it on mount, receives the shim's `FunctionsError` (`functions.ts` l.58–60),
   recognises it with `isLocalOnlyError` (`offline.ts` l.22–30) and renders
   `OrganOffline` — one lowercase sentence naming the organ, with a retry
   (`OrganOffline.tsx` l.11–38). controls that would call the organ again are
   disabled while that state holds (e.g. `MeetVault.tsx` l.184, 218;
   `TransitTab.tsx` l.282, 380; `RideshareGuardian.tsx` l.115 and the form
   inputs; `GoogleMeshPanel.tsx` l.238–367; `ContactVaultPane.tsx` l.447–510;
   `PhoneMessages.tsx` l.334; `TripRecorderTab.tsx` l.236–258;
   `OverwatchTab.tsx` consent buttons and switch; `VitalsTab.tsx` pulse).
5. the operator asks the analyst. `planStationCall` maps the question to one
   `google-mesh` action (`stationTools.ts` l.92–114); the call returns the
   shim's error; the tool row shows `skip · google organ offline on this
   device` (`NexusChatPanel.tsx` l.57, 135–138); the model is told, between
   fences, that nothing was read and to say so in one sentence (l.160, 169);
   the answer streams from the operator's own model key via `streamChat`
   (l.177). with no key, `resolveActiveModel` raises the byok dialog and the
   panel shows the reason — "connect a model key in settings → ai keys to
   start chatting. — the tool result above still stands." (l.189–193,
   `ai.ts` l.71).

### secondary paths

- **export** — contact intelligence exports the vault ledger as text
  (`ContactIntelligence.tsx` `onExport`, `localVault.ts` l.193–262); the
  substrate exports its brief as text (`SubstrateExplorer.tsx` `exportReport`);
  the guardian downloads a ride report; the sentinel exports a markdown case
  file. all are client-side blob downloads; none can hold data on this device
  today except a vault swept on an earlier build.
- **purge** — contact intelligence clears its indexeddb vault
  (`clearVault`, `ContactIntelligence.tsx` `onPurge`).
- **retry** — every `OrganOffline` carries one; the desks with `error` state
  carry "read again".
- **takeout** — the query-log and browser feeds have no api at all; both link
  to google takeout and say the export is not read by this room
  (`SearchHistoryView.tsx` l.42, `ChromeDataView.tsx` l.42).
- **map hand-off** — waypoint and lattice can push venues/contacts into
  `localStorage` for the eye room and navigate there (`mapBridge.ts`
  l.415–461); only reachable with data.
- **analyst stop / clear** — abort controller on stop, on clear, and on
  unmount (`NexusChatPanel.tsx` l.81, 200, 243).

## state & data

| piece | lives in | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| `activeModule`, `directorate` | react (`GoogleIntelligenceView.tsx` l.134–137) | union strings | tab session | no |
| analyst messages, input, streaming | react (`NexusChatPanel.tsx` l.62–65) | `NexusMessage[]` with optional `tool` row | tab session; cleared by ✕ | the transcript plus a system preamble goes to the provider the operator connected, via `streamChat` (`ai.ts` l.133–170) |
| accounts, `isConnected`, `syncStatus` | react inside shared `useGoogleApi` (l.33–41) | `GoogleAccount[]`, booleans | per mount of each desk | no |
| local identity | `localStorage asherin_device_id` (`auth.ts` l.11, 66–76) | uuid | forever | no |
| contact vault snapshot + raw corpus | indexeddb `asherin_contact_vault` stores `snapshots`, `corpus` (`localVault.ts` l.16–22, 29) | `VaultSnapshot`, `CorpusRecord` capped at 6000 messages | until purge | no |
| autosync stamp | `localStorage asherin_autosync_stamp:contact-intel:<uid>` (`useAutoSync.ts` l.48–66) | epoch ms | forever | no |
| ledger watch stars | `localStorage ledger_watch` (`SubscriptionOracle.tsx` l.31–40) | string[] of domains | forever | no |
| vault autopilot opt-out | `localStorage hoa.vault.autopilot` (`ContactVaultPane.tsx` l.189, 216) | "on"/"off" | forever | no |
| op consent level | `localStorage asherin.op.consent` (`opClient.ts` l.16–33) | identity/read/comprehension | forever | would be sent to `op-layer`, which has no device answer |
| sentinel armed flag | `localStorage asherin.sentinel.armed` (`alwaysOn.ts` l.44, 122, 733) | "1" | forever | no |
| trip buffer / session | `localStorage asherin.trip.buffer.v1`, `asherin.trip.session.v1` (`tripRecorder.ts` l.48–49) | fixes | until upload (never, on device) | would go to `rideshare-guardian` |
| `google_intel_devices`, `google_intel_snapshots` rows | the local table store (`remoteVault.ts` l.96–214) via the postgrest shim | device label, snapshot payload | until the local db is cleared | no — the "mirror" was writing to this device's own indexeddb |
| google tokens | nowhere | — | — | none exist on this device |

the shared hook's `isConnected` is `accounts.some(status === "connected")`
(`useGoogleApi.ts` l.256). `fetchAccounts` calls `google-oauth list_accounts`
(l.78), the shim answers `LOCAL_ONLY`, the catch logs and returns `[]`
(l.82–85). so on this device `isConnected` is always false, every
`fetchGoogleData` gate is closed, and nothing is ever requested from google.

## logic

- **desk routing** — `renderModule` (l.149–184) is a switch over the module
  id; the feed ids `gmail`, `fit`, `drive`, `photos` reuse the courier,
  vitals and archive desks. the dead "feed unauthorized — authorize account"
  branch that used to sit under the feed tabs was removed: `renderModule`
  never returned null for a feed id, so it could not render.
- **station tool table** — `planStationCall` (`stationTools.ts` l.92–114):
  bound the prompt to 2000 chars; an explicit "search/find … for X" wins and
  carries X (≤200 chars); otherwise the first matching bounded regex in
  `RULES` (l.61–74); otherwise the desk's default action (`MODULE_DEFAULT`
  l.41–55), with a sanitised query for mail-search defaults (l.110–112);
  otherwise null. tested in `__tests__/stationTools.test.ts`.
- **offline recognition** — `isLocalOnlyError` matches the shim's `code`
  `LOCAL_ONLY` or its message ("kernel offline" / "needs a server-side
  organ"), including after a module rethrows only the message
  (`offline.ts` l.13–30). `describeFailure` turns that into `offlineNote`,
  otherwise returns the error's own message lowercased at the first letter
  and bounded to 200 chars, never an empty line (l.41–54). tested in
  `__tests__/offline.test.ts`, which also asserts that every function the
  room calls has no device handler.
- **findings engine** — `cloudIntel/logic.ts`, `deepDive.ts`, `lattice.ts`,
  `augur.ts`, `movement.ts`, `subscriptions.ts`, `documents.ts` are pure
  transforms over fetched rows (`logic.ts` header l.1–22). on this device
  they only ever run their `connected: false` branch, which returns one
  `silenceFinding` (`logic.ts` l.281–315).
- **contact intelligence** — `buildContactIntel` (`messageIntel.ts`
  l.444–686) fuses address-book records and mail headers into dossiers with a
  lexical marker profile; evidence weight `none/thin/moderate/strong` by token
  count (l.384–385); composites are null without lexical mass (l.399–405);
  importance is a weighted sum (l.616–626). tested in
  `src/test/contactIntel.test.ts`. the sweep is resumable from a stored
  cursor with a two-day overlap and a backward page (`ContactIntelligence.tsx`
  l.200–245) and merges on gmail message id (`localVault.ts` `mergeCorpus`
  l.148–164).
- **overwatch posture** — a weighted sum over open findings (`OverwatchTab.tsx`
  `posture`); it is no longer rendered when the ledger is unread (l.222 and
  the `unreadable` branch), because 100/nominal over nothing read was a
  claim.
- **edge cases handled** — `Treemap` and `Sparkline` return null/empty on no
  data; `Heatmap` prints its empty note; `TrendStat` reserves its row with an
  inline height when the series is short (`TrendStat.tsx` l.33–37).

## integrations & network

every outbound call from this room goes through `supabase.functions.invoke`
on the local client (`client.ts` l.130) → `localFunctions.invoke`
(`functions.ts` l.57–68). no `fetch` to any host exists in the room's files.

| function | called from | device answer |
| --- | --- | --- |
| `google-oauth` (`list_accounts`, `disconnect`) | shared `useGoogleApi` l.54, 67 | none → error, caught → `[]` |
| `google-data` (`gmail_stats`, `gmail_inbox`, `calendar_events`, `drive_files`, `drive_about`, `contacts`, `fitness`, `youtube_channels`, `gmail_forensics`, `voice_forensics`) | `fetchGoogleData` (`useGoogleApi.ts` l.238–249), gated on `isConnected` | never reached on device |
| `google-mesh` | `NexusChatPanel.tsx` l.110, `GoogleMeshPanel.tsx` l.61 | none → skip row / `OrganOffline` |
| `google-substrate`, `mesh-vault`, `meet-vault`, `ghost-engine`, `phone-messages`, `rideshare-guardian`, `rideshare-autopilot`, `transit-guardian`, `sentinel-ble`, `wifi-sentinel`, `op-layer`, `organism` | the desks named in workflow §4 | none → `OrganOffline` |
| `intel-notify` | `driftAlarm.ts` l.308 (only after a forensics sweep lands) | `ok` no-op (`functions.ts` l.45) |

timeouts and aborts: the shim answers synchronously-fast; there is no network
to time out. the analyst's model call carries an `AbortController`
(`NexusChatPanel.tsx` l.174–177) and is aborted on stop, clear and unmount.
the only real network on this device is the model provider the operator
connected, called by `streamLlm` with the key from the vault (`ai.ts`
l.238–243, `keys.ts` l.129–134); its retries are `ai.ts`'s own (3 passes,
l.233).

offline: nothing changes — the room was already not reaching google.

the connect trace: each mesh action emits one `emitPull` row (`NexusChatPanel`
l.125, 139; `GoogleMeshPanel` l.63–69) with status `skip` and quote "google
organ offline on this device" when the shim answered, so the connect room
never shows a google pull as a failure that could be retried.

## security & privacy

- **keys** — no google token exists or is requested. the model key is read
  from the device vault by `ai.ts` and travels only to the provider; the room
  never sees it. `resolveByok` in the guardian/sentinel/signal/transit desks
  reads `user_api_keys` through the shim, which strips `api_key`
  (`keys.ts` `keyVaultTable` — "the api_key column is never present"), so
  those desks would attach no key even if their organ existed. that whole
  branch is dead on device; left as-is because the organ is.
- **injection surfaces** — the analyst sends the operator's prompt and the
  fenced tool payload to the model with a rule to answer only from the
  payload (`NexusChatPanel.tsx` l.155–166). on device the payload is the
  fixed offline sentence; there is no untrusted mail or message content in
  the loop. `planStationCall` bounds and sanitises the query it builds
  (`stationTools.ts` l.93, 101, 111).
- **a hostile response** — none can arrive: the shim is the only responder.
- **storage at rest** — the contact vault is plain indexeddb (`localVault.ts`
  header l.1–12): dossiers and message metadata on this device, unencrypted,
  per local user id. the sweep that would fill it cannot run on this device.
- **export leakage** — the vault export, substrate export, ride report and
  case file are plaintext downloads the operator chooses; the vault export
  carries full addresses and phones (`localVault.ts` l.226–228). the report
  viewer copies to clipboard on request only (`ReportViewer.tsx` l.82–91)
  and renders no third-party image (`proxied` returns null, l.20–25).
- **third-party hot-linking** — avatar `img` tags in the connection card and
  contact rows carry `referrerPolicy="no-referrer"`; none can render without
  data.
- **the gap that was closed** — the header "Authorize Account" button called
  `google-oauth get_auth_url`, got the shim's error, and did nothing
  (`if (res.data?.url)` on a null `data`); the mesh panel's five "Authorize"
  tier buttons threw the shim sentence into a toast. both are removed.

## failure modes

| failure | what the operator sees |
| --- | --- |
| any desk mounts on this device | its header, dashes, and `CONNECT_UNAVAILABLE` or a `silenceFinding` — never a blank |
| an organ-backed desk mounts | skeleton, then `OrganOffline`: "the <organ> ran on a server asherin no longer has. nothing on this device can answer for it, so this desk reports nothing rather than a clean read." + "try again" |
| a control would call a dead organ | disabled, with a one-line reason near it (guardian form, transit form, trip recorder arm switch, mesh actions, vault scans, meet sweep, phone sync) |
| analyst asked | tool row `skip · google organ offline on this device`, then the model's one-sentence answer |
| analyst asked, no model key | byok dialog raised by `ai.ts`; the bubble reads "connect a model key in settings → ai keys to start chatting. — the tool result above still stands." |
| model stream aborted | bubble keeps what arrived; no error line (`NexusChatPanel.tsx` l.189) |
| indexeddb unavailable | contact vault `openDb` resolves null after 4 s (`localVault.ts` l.49); the vault card says nothing is stored; the local table store rejects and the shared hook logs |
| overwatch ledger unread | posture shows "—" and "unread", every list says "unread.", consent and auto-response controls disabled |
| organism unread | stats "—"/"unread.", pulse disabled |
| sentinel radio unheard (desktop) | the amber "no radio has ever been heard on this device" banner (`BluetoothSentinel.tsx` l.442–460) above the ledger; the sentinel organ panel below it |
| guardian push enrolment | disabled while the organ is offline; when it is not, `guardianPush.ts` returns a reason string, never a throw |
| private mode / quota | every `localStorage` write in the room is inside try/catch (`SubscriptionOracle.tsx` l.39, `ContactVaultPane.tsx` l.216 is the one bare write — it sets a flag already defaulted on read; left) |

nothing in the room renders `error.message` raw any more; every error path
goes through `describeFailure`.

## interface & accessibility

- **layout** — `flex h-full flex-col overflow-hidden` with a `ScrollArea`
  body (`GoogleIntelligenceView.tsx` l.191, 239). desktop (1440×900): header
  two rows; the directorate strip; overview sections in a two-column desk
  grid (`lg:grid-cols-2`), a four-column feeds grid, three method cards; the
  analyst panel 420 px tall at the end. phone (390×844): the classification
  rule truncates (`min-w-0 truncate`, l.197; kept from the previous commit),
  the header row wraps with `gap-y-2` and the status control truncates
  (l.207, 232–235), body padding drops to 16 px (l.240), the desk grid is one
  column, feeds two columns, the directorate buttons wrap. no element sets a
  fixed width wider than the viewport; the ghostmail focus input is now
  `w-full max-w-64`; the guardian tab list wraps (`h-auto flex-wrap`).
- **focus & keyboard** — every interactive element is a `button` or input
  with a visible `focus-visible` outline; the directorate strip uses
  `role="tablist"`/`role="tab"` with `aria-selected`; icon-only buttons carry
  `aria-label`; decorative icons `aria-hidden`. the report viewer traps focus
  and closes on escape (`ReportViewer.tsx` l.43–77). the analyst sends on
  enter, newline on shift+enter.
- **motion** — spinners and pulses carry `motion-reduce:animate-none`
  throughout the room's edited files; `ReportViewer` and `OrganOffline` have
  no motion.
- **contrast** — copy sits at `text-muted-foreground` or stronger on the
  card surfaces; the smallest text is 9–10 px mono tracking labels, the same
  scale the rest of the dashboard uses.
- **copy case** — headers, labels, stat tiles, buttons, toasts and the
  station chrome are lowercase; proper nouns (google, gmail, drive, youtube,
  uber, lyft, chrome, android) are lowercase per the doctrine. remaining
  `uppercase` css sits on small data badges (verdict codes CLEAR/THIN/WATCH/
  AVOID, severities, risk levels) in guardian, transit, overwatch, postmark
  and vault; listed under open gaps.
- **empty and loading states** — dashes while loading; skeletons for the
  organ desks; every empty state is a sentence, never a blank.

## performance

- **mount** — the overview is 25 cards + 8 feeds + 6 method cards of static
  text; `MultiAccountManager` mounts the shared hook (one shim call, one
  local-channel subscribe, two listeners); the analyst panel is one textarea.
- **per desk mount** — each desk that uses `useGoogleApi` repeats the hook:
  `fetchAccounts` (shim), `refreshPeerCount` (two indexeddb reads via the
  room's `remoteVault.ts` l.113–126), a `LocalChannel` subscribe, and
  `visibilitychange`/`focus` listeners (`useGoogleApi.ts` l.112–177). all
  are torn down on unmount. the cost is real but small; the console noise is
  the defect (shared-file patch 1).
- **timers** — contact intelligence: `useAutoSync` schedules a 10-minute
  cadence only when `enabled` (false on device; `ContactIntelligence.tsx`
  l.330–336), so no timer runs. vault pane: the 60 s standing-watch interval
  is now gated on `!err` (`ContactVaultPane.tsx` l.339–361), so it is not
  installed when the organ is offline. trip recorder: a 1 s ticker only
  while recording (`TripRecorderTab.tsx` l.372). sentinel: the daemon in
  `alwaysOn.ts` runs only once armed (`readArmed` l.122) and belongs to the
  app, not this room.
- **large lists** — the contact roster pages 40 at a time with "show more";
  the relation graph caps at 42 nodes; treemaps cap at 18/20 items; the vault
  index filters before grouping.
- **unmount** — the analyst aborts its stream (`NexusChatPanel.tsx` l.81);
  the organ desks guard state writes with `alive` refs; the shared hook
  unsubscribes its channel and listeners.

## copy & voice

- lowercase everywhere the operator reads at first paint: station header,
  directorates, desk names and mandates, feeds, method, connection card,
  analyst header/placeholder/footer, every desk header and empty state,
  every error line, every toast in the edited files. the model is addressed
  and introduced as shepherd (`NexusChatPanel.tsx` l.156, 224, 262).
- no account-era language: "sign in", "tier", "available on", "maximum tier",
  "live sync", "tokens encrypted at rest", "refresh tokens in isolated vault",
  "accounts are tied to your asherin identity" are gone from the room.
- "kernel offline" appears nowhere on screen: where no device answer exists
  the room says which organ ran on a server and that this device cannot
  answer for it (`offlineNote`). the shim's own sentence is matched, not
  shown.
- fabricated content removed: the hand-typed "energy map (ai-detected)"
  table, the two scenarios with a $120,000 salary and a 67% probability, the
  nine automation toggles reporting "7 of 9 active", the twin's "predicts
  your choices" cards, the email "patterns" promises, "predict illness",
  "predict job changes", "your accounts look clean".
- the findings engine's own copy (`silenceFinding` in `logic.ts` l.294–311
  and the `connected: true` branches in the cloudIntel libs) is still
  sentence-case ("returned no observations", "Live query executed…"); it
  only renders inside a finding card and only the unlinked branches render
  on device, which were rewritten. listed under open gaps.

## tests & proof

- `src/components/dashboard/google/__tests__/offline.test.ts` — every one of
  the fifteen functions this room calls answers `LOCAL_ONLY` through the real
  shim; `isLocalOnlyError` recognises the error by code, by message and after
  a rewrap; `describeFailure` never shows the shim sentence, never returns
  an empty line, bounds at 200 chars; the standing copy is lowercase and
  names no tier or sign-in.
- `src/components/dashboard/google/__tests__/stationTools.test.ts` — the
  analyst's tool table: explicit search wins and carries its subject, verbs
  pick actions, desk defaults apply, the fallback query is sanitised, the
  prompt is bounded, labels are lowercase.
- `src/test/contactIntel.test.ts` (pre-existing) — `parseAddressList` and
  `buildContactIntel` on a live-shaped corpus.
- end-to-end and screenshots at 1440×900 and 390×844: not run in this
  session (the browsers belong to the main session). the confirm column of
  the review log is therefore empty; the narrative is confirmed against the
  code only.

## open gaps

- **no google path on a device.** the authorization exchange and every data
  read ran on edge functions that this edition does not have. a
  browser-only path exists in principle — google identity services with an
  operator-supplied client id, the token held in the device vault, each desk
  re-pointed at google's rest apis — but it needs the operator to register a
  client id for this origin, a content-security-policy that admits
  `https://accounts.google.com` under `script-src` (`index.html` l.20,
  `vercel.json` l.43, 83 allow only self and cdn.jsdelivr.net), and a port
  of the `google-data` service handlers (gmail header parsing, forensics,
  voice) to the browser. none of that is done; the room says so instead of
  offering a button.
- **the organ desks are shells.** substrate, meet, ghostmail, dossiers,
  signal, overwatch, organism, guardian, transit, trip recorder, sentinel
  ledger, network sentinel and the mesh panel all report `OrganOffline` and
  hold their controls. the radio and geolocation legs of the sentinel daemon
  and the trip recorder's fix buffer still run locally but have nowhere to
  flush.
- **connected-state copy.** inside the desks, copy that only renders with
  data (finding titles, "why" ladders, verdict badges in `uppercase` css,
  the cloudIntel libs' sentence-case strings) is unchanged in case; it is
  unreachable on this device and is listed here rather than claimed fixed.
- **shared-hook noise.** `useGoogleApi.fetchAccounts` logs
  `console.error("Failed to fetch accounts:", …)` on every desk mount and
  every focus/visibility event (`useGoogleApi.ts` l.83, 164–177); and the
  shared hook imports `deviceId`/`listDevices` from this room's
  `remoteVault.ts` (l.95–96), which is why that file stays. patches below.
- **sidebar and shell subtitles** still say "your connected accounts, read on
  request". patches below.
- **the contact vault is unencrypted indexeddb** (`localVault.ts`); the
  room's other data has no at-rest story because it never arrives.

## review log

| # | finding | kind | fix | confirmed by |
| --- | --- | --- | --- | --- |
| 1 | header "Authorize Account" called `google-oauth get_auth_url`, received the shim error and did nothing (`if (res.data?.url)` on null) — a button that silently fails | defect | removed; replaced by a status control that opens the overview (`GoogleIntelligenceView.tsx` l.224–236) | code |
| 2 | feed tabs carried a dead "Feed unauthorized — Authorize account" branch `renderModule` could never reach | defect | removed (`GoogleIntelligenceView.tsx` l.373–384) | code |
| 3 | station header "Restricted · Operator Eyes Only · Maximum Tier", uppercase `h1` "Cloud Intelligence Mesh" — tier language and the costume `v2Titles.ts` names | defect | lowercase rule "held on this device · read only when you ask"; `h1` asherin.google hidden under v.2 (`useIsV2`); truncation kept (l.193–237) | code |
| 4 | mandates promised "pushed to device and email", "Asherin Engine", "scheduled server sweeps while closed", "Standing Collection" | wrong claim | rewritten to what each desk computes; method card "reads on request" (l.78–130) | code |
| 5 | directorate labels, codenames, feed labels, section heads in uppercase | defect | lowercase, `uppercase` css removed (l.60–120, 246–298, 300–397) | code |
| 6 | `MultiAccountManager` "Add Account"/"Connect Google Account" threw the shim sentence into a toast; "Live sync on" over a channel to nowhere; cross-correlation toggle nothing read; "tokens encrypted at rest (AES-256)" with no tokens; "sign in with the same account on every device" | defect | rewritten as the connection card: `NO_ACCOUNT_PATH`, the three needs, no button (`MultiAccountManager.tsx`) | code |
| 7 | analyst introduced itself as "asherin", footer "Encrypted · Context-aware", suggestions capitalised; a shim error was shown as `fail` with the raw sentence | defect | shepherd; `skip · google organ offline on this device`; model told nothing was read; lowercase (`NexusChatPanel.tsx` l.57, 135–145, 156–169, 211–215, 367) | code + stationTools test |
| 8 | analyst stream not aborted on unmount | defect | `useEffect(() => () => abortRef.current?.abort(), [])` (l.81) | code |
| 9 | `CalendarWizard` rendered a hand-typed "Energy Map (AI-detected)" for every operator | defect | removed; desk shows counts and events only | code |
| 10 | `ScenarioEngine` rendered two invented scenarios ($120k salary, 67% probability, "Recommended") before any data | defect | rewritten: three counts and "no scenario is written on this desk" | code |
| 11 | `AutomationSuite` nine toggles flipped a react flag only; "7 of 9 automations active" | defect | rewritten as the chartered orders, each "not armed", no toggle | code |
| 12 | `AITwin` cards claimed to write, predict and "handle tasks before you think about them" | wrong claim | removed; counts only | code |
| 13 | `EmailAssistant` "patterns" list promised analysis nothing computes; `HealthGuardian` "predict illness"; `CareerPredictor` "predict job changes", "you're in demand" | wrong claim | removed/rewritten | code |
| 14 | every "Connect Google to …" empty state promised a connection that cannot be made | wrong claim | `CONNECT_UNAVAILABLE` everywhere (`offline.ts` l.64) | offline test |
| 15 | `silenceFinding` actions said "Link an account under Account Mesh" | wrong claim | "no connect path exists on this device yet — see the station overview…" (`lattice.ts`, `deepDive.ts`, `augur.ts`, three desks) | code |
| 16 | `ContactIntelligence` claimed sync "on the server while the app is closed"; "Background sync arming…" polled a table nothing writes, forever; the "Device Mesh" panel mirrored the snapshot into this device's own table and reported it as another device | defect | server line, `useMeshSyncState`, remote mirror and mesh panel removed; copy says nothing runs while closed | code |
| 17 | `SubscriptionOracle`, `ContentIntelligence`, `LocationProphet` showed `err.message` raw; "— showing the last successful sweep" even when none existed | defect | `describeFailure`; suffix only when data is held | code |
| 18 | `OverwatchTab` rendered posture 100 / NOMINAL and consent success toasts while the ledger could not be read | defect | posture "—"/"unread", lists "unread.", controls disabled, toast only after a report lands | code |
| 19 | `VitalsTab` footer "the involuntary pass runs on the server every 30 minutes" | wrong claim | removed; pulse disabled when unread | code |
| 20 | `PhoneMessages` on load failure showed "No phone messages… Run first sync" inviting a call that fails | defect | `loadError` state → `OrganOffline`; sync disabled | code |
| 21 | `TripRecorderTab` showed "No trips recorded yet" over a failed load and offered "Start recording" against a dead organ | defect | `OrganOffline`; arm controls held with the reason | code |
| 22 | `RideshareGuardian` settings switches flipped locally while the write failed silently; raw error in the rides list; push arm offered | defect | switch moves only when the write lands; `OrganOffline`; form/paste/arm held with reasons | code |
| 23 | `TransitTab`, `NetworkSentinelTab`, `BluetoothSentinel`, `GhostLedgerPanel`, `SubstrateExplorer`, `MeetVault`, `ContactVaultPane`, `GoogleMeshPanel` showed the shim sentence or `error.message` raw; "check you are still signed in" | defect | `OrganOffline` / `describeFailure` throughout | offline test |
| 24 | `GoogleMeshPanel` five "Authorize" tier buttons each failed into a toast | defect | ladder shown as description with granted/not granted; buttons removed | code |
| 25 | `MeetVault` offered play/save against an empty stream url | defect | controls hidden; "open in drive" link when present, else "no playback path on this device" | code |
| 26 | `ContactVaultPane` 60 s standing watch and autopilot ran against a dead organ | defect | gated on `!err`; scans disabled | code |
| 27 | `SearchHistoryView`/`ChromeDataView` promised "upload it to Azplen for analysis" | wrong claim | takeout link kept; "this desk cannot read the export yet" | code |
| 28 | `ConnectedAppsView` printed "0 Google accounts connected · 0 apps authorized" as counts; "All OAuth tokens are encrypted at rest" | wrong claim | `NO_ACCOUNT_PATH`; "no google token is held on this device" | code |
| 29 | `LifePredictions` restored a stale snapshot on failure (closure captured first-render state) | defect | state written only on success | code |
| 30 | `FindingCard`, `TrendStat`, `DeepDivePanel` shouted their labels (OBSERVED / YOUR NORMAL / `toUpperCase()`) | defect | lowercase tracking labels | code |
| 31 | `TrendStat` empty sparkline used a dynamic tailwind class `h-[${height}px]` that is never generated | defect | inline height | code |
| 32 | lint: three unused `eslint-disable` directives hiding missing deps; unused imports; an unused-expression ternary; a bare `localStorage.setItem` | defect | deps added, imports removed, `if/else`, try/catch | eslint |
| 33 | sidebar blurb and v.2 subtitle "your connected accounts, read on request" | wrong claim | shared file — patch proposed, not edited | — |
| 34 | `useGoogleApi.fetchAccounts` `console.error` on every desk mount and focus; shared hook imports from this room's `remoteVault.ts` | defect | shared file — patches proposed, not edited | — |
| 35 | desktop/phone screenshots | — | not taken in this session; main session to confirm | — |

## vision confirmation — 2026-10-26

screens: final3-d-google.png and final3-m-google.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: the offline state ("collection offline · no account connected"), the method cards and the station overview render. defect seen and fixed: the whole screen sat 12 px high because the shell overflowed and a chat panel scrolled it.
- fixed: shell height fixed; background push now states why it cannot work without a push server instead of a dead "arm device"/"enable device push" button.
