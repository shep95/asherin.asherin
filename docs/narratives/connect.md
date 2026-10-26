```
room: connect   view id: api-keys (alias: connect)   files: src/components/dashboard/connect/ConnectView.tsx, src/lib/connect/graph.ts, src/lib/connect/emitPull.ts, src/components/dashboard/AIKeysSettings.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

line numbers are as of this review. shared files (Dashboard.tsx, navIntents.ts, v2Titles.ts, ChatView.tsx, TurnTraces.tsx and every writer of `emitPull`) are edited by other rooms concurrently; for those the symbol is the anchor and the line a hint. evidence status per claim: **observed** (read in code), **verified** (unit test), **inferred**, **unknown**.

## purpose & promise

connect answers one question: what actually ran on this device, and what it is bound to. rooms that really reach for something — the library extracting a file, the agents forge running an agent, the guardian vault checking a breach, chat geocoding an address — write one row to `asherin_connect_pulls` through `emitPull` (`src/lib/connect/emitPull.ts:87`, observed). connect reads those rows and derives everything from them and from the rail's own list of rooms (`src/lib/navIntents.ts`): which room is lit, which edge exists, what the log says. nothing is seeded, no edge is drawn by hand, no node is green because a diagram said so (`graph.ts:1-7`).

the interface promises exactly that in its header (`ConnectView.tsx:189-191`): "what actually ran on this device, and what it is bound to. a room lights up only when a pull is on record — nothing is simulated." version 1 broke the promise with a hand-drawn constellation of twenty-two organs — Eye, Zophiel, Ghost, RAD, Shield, Zerlal, Azplen, Zahten, ZALI… — of which half were never written by any caller, and twenty-nine edges none of which a row backed (review log #1–#3).

## entry & navigation

- rail: group `account`, label `Connect`, codename `Connect`, blurb "Live capability pull-graph, bindings, and your encrypted provider keys (BYOK)" (`src/lib/navIntents.ts:277-298`) — capitalised; patch proposed below.
- deep links `/dashboard/api-keys` and `/dashboard/connect`: both in `VALID_VIEWS` (`src/pages/Dashboard.tsx:165-166`), rendered by `case "api-keys": case "connect":` (`:2108-2113`) inside `ErrorBoundary` + `Suspense`, lazily (`:42`).
- `?organ=<id>`: a trace row in the chat transcript opens connect scoped to one organ (`ChatView.tsx:1056` → `TurnTraces.tsx:80` `onOpenOrgan(r.organ)`). the id is a writer's organ id (`"maps"`, `"vault"`…) and is normalised to the room that owns it with `roomFor` (`ConnectView.tsx:54`, `:59`; `graph.ts:117`). later navigations re-scope (`:57-60`).
- `#asherin-connect-keys`: the provider-keys binding card scrolls to the keys section on the same page (`:219`, `:375`).
- v.2 shell title: `connect` / "what actually ran, and what it is bound to." for both ids (`src/lib/dashboard/v2Titles.ts:22-23`) — correct, lowercase. in v.2 the refresh action is portalled into the shell slot (`:186`) and the map is behind `show map` (`:45`, `:224-232`); in the current shell the header and the map render at once.
- what loads first: the bindings cards and the log header; `loadPulls` and `loadBindings` run in parallel (`:111-114`). the log shows a spinner only while `loading` is true (`:327`).

## workflow

happy path:
1. a room runs something and calls `emitPull({ organ, capability, fromSurface, status, latencyMs, quote })` (callers: `grep -rn "emitPull({" src` — library, knowledge vault, projects scope, zahten runtime, whiteboard, notebooks, briefing, guardian vault items, defender, arvision, asherinx, google panels, chat's geocoder, the scrapper queue).
2. `emitPull` masks the quote and meta (`maskQuote` `:52`, `safeMeta` `:71`), bounds every string (`:100-102`), and inserts one row scoped to the device identity (`:89-97`). it never throws (`:108-110`).
3. connect reads the newest 300 rows (`loadPulls`, `:71-92`) and `buildGraph(pulls)` (`:150`; `graph.ts:183`) derives: one node per rail room except settings (`graph.ts:200-203`), extra nodes for organ or surface ids no room claims (`:205-208`), node state from the newest row that ran (`nodeState`, `:133`), and edges from rows where `from_surface` and `organ` are different rooms (`:210-227`).
4. the operator reads the map (desktop) or the room list (phone), clicks a room to filter the log to rows it pulled or was pulled from (`filtered`, `:153-156`), and clears the filter (`:242-249`).
5. new rows stream in: the local realtime shim fires on every write to the table (`src/lib/local/client.ts:79-91`); connect debounces 300 ms and re-reads (`:134-147`), so ordering stays right and no row appears twice (v1 prepended the payload and duplicated rows; log #6).

secondary paths:
- refresh (`:160-164`): re-reads pulls and bindings; the icon spins while loading.
- bindings: `google` → `/dashboard/google` (asherin.google owns oauth); `provider keys` → the keys section below, which is the same `AIKeysSettings` settings → intelligence renders (`:377`): add, replace, remove a key, pick the model, lock the vault.
- first open with an empty table: one `skip` row "connect opened — nothing has run yet" is written once per mount (`:118-130`) so the log is never a blank and never a lie; a skip row lights nothing (`graph.ts:134-136`, verified).

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| `asherin_connect_pulls` rows | IndexedDB table via the shim | `PullLike` (`graph.ts:13`): id, ts, organ ≤48, capability ≤64, from_surface ≤48, status ok/fail/skip/stale, latency_ms 0..600000 or null, quote_masked ≤160 masked, meta (scalars only, secret-like keys dropped), user_id | until wiped | no |
| react: pulls (≤300), loading, error, selected, showMap, google {count, valid}, byok (provider names) | component (`:45-56`) | — | mount | no |
| graph | derived (`useMemo`, `:150`) | `Graph` nodes/edges/counts | render | no |
| google binding | read of `google_accounts` (`:97`) — never written on a device (oauth is offline) | count, valid | mount / refresh | no |
| provider keys | read of `user_api_keys` through the shim → vault (`keys.ts:326`), provider names only | string[] | mount / refresh | no |
| `?organ=` | url search param | string | the navigation | no |
| nothing in localStorage or sessionStorage | — | — | — | — |

## logic

- **id normalisation** `roomFor` (`graph.ts:117-121`): `ORGAN_ROOM` (`:62-113`) maps every organ id and `from_surface` a writer uses onto the room view id that owns it (`vault`→`guardian-vault`, `briefings`→`briefing`, `google-station`→`google`, `asherinx-eng`→`ghost-engine`, `connect`→`api-keys`, `asherin.agents`→`zahten` …); an unknown id stays itself; empty → `unknown`. verified.
- **labels** `labelFor` (`:123-127`): the rail's label lowercased, or `EXTRA_LABELS` for ids with no rail row (`ghost-engine`→`asherinx.eng`, `maps`→`geocoder`), else the raw id. verified.
- **node state** `nodeState` (`:133-140`): consider only rows that ran (ok / fail / stale); none → `never`; newest is `fail` → `fail`; newest within `LIVE_MS` (5 min) → `ok`; else `stale`. v1 returned `ok` for anything under an hour and `stale` only after it, contradicting its own legend "green only in the last five minutes" (log #5). verified.
- **edges** (`:210-227`): key `from->to` for rows where the two rooms differ; count, newest ts and status; `lit` when any `ok` row is inside the live window. verified.
- **layout** (`:153-181`): chat at (50,50); every other node on a ring in group order (watch, find, understand, make, keep, account, other), alternating radii 30/41 once there are more than twelve nodes so neighbouring labels do not collide; coordinates rounded to 0.1 in a 0..100 viewBox. deterministic. verified that every node is inside the box.
- **counts** per state over nodes (`:230-232`).
- **log filter** (`ConnectView.tsx:153-156`): no selection → newest 60; a selection → rows whose organ *or* surface normalise to it, newest 40. v1 special-cased the `eye` organ with a hard-coded capability list that no writer used (log #4).
- `relTime` (`graph.ts:142-151`) never prints a negative age.

## integrations & network

- **none.** every read is the shim over IndexedDB; the only write is the one mount `skip` row. no `fetch`, no `functions.invoke`, no realtime socket (the channel is the local table listener, `client.ts:74-113`). offline changes nothing.
- the google binding card reads a local table that nothing on a device writes; it reports "no account on this device — the authorization exchange needs a server" (`:205`) rather than probing anything.

## security & privacy

- **what a row may carry**: `maskQuote` (`emitPull.ts:52-67`) redacts key/token/bearer/secret/pat/ghp… prefixes with ≥16 chars, jwts, google api keys, six-digit codes followed by otp/2fa, `password:`-style pairs; emails become `a***@d***.tld`; phone-length digit runs become `***123`; hard cap 160 chars. `safeMeta` (`:71-80`) keeps numbers, booleans and masked strings only and drops any key matching key/token/secret/password/totp/otp/auth/cookie/session. these run before insert, so the table never holds the raw quote.
- **render**: every field is a text node; `quote_masked` is truncated by css; no html.
- **the `?organ=` param** is normalised and used only as a filter key and a label (`labelFor` falls back to the raw id, rendered as text). a hostile value cannot reach storage.
- **keys**: the keys section is `AIKeysSettings` with the same guarantees as settings (vault routing, no plaintext read-back, step-up on save).
- **a hostile row** (another tab writing to the table) can at most light a node or draw an edge; counts and labels are bounded by the writer's own `slice` limits and the reader's `.limit(300)`.

## failure modes

| failure | what the operator sees |
| --- | --- |
| table read error | `role=alert` "the pull log could not be read — <message>" + try again (`:330-336`) |
| no device identity | `loadPulls` returns early; `loading` stays true → the spinner would persist. `useAuth` always has a device user (`AuthContext.tsx:36`), so this does not occur in practice (stated, not hidden) |
| no rows at all | one skip row is written and shown; the log says "connect opened — nothing has run yet" |
| rows but none for the selected room | "nothing on record for <room>." (`:340`) |
| rows with no `ts` (older writers) | `ts` falls back to `created_at`, then epoch (`:85-89`) |
| google table empty | "no account on this device — the authorization exchange needs a server" |
| no provider key | "none saved — add one below" with the anchor to the keys section |
| binding reads fail | the cards keep their last state; the error surfaces in the log panel only if the pulls read failed too (bindings have no alert of their own — stated gap) |
| unmounted during a read | `alive` ref drops the result (`:63-68`, `:79`, `:100`) |

## interface & accessibility

- desktop (1440): header → two binding cards (`sm:grid-cols-2`) → map card (legend row, svg 480px tall) → log → provider keys. one accent meaning: green = ran in the last five minutes, amber = stale, red = failed, grey = never — in the legend, the nodes, the edges and the log dots alike (`STATE_STROKE`, `:31`). the selected node gets a thin foreground ring (`:300`), unrelated nodes dim to 0.3 (`:280`).
- phone (390): padding `px-4 py-6`; the svg is hidden below `sm` and the same nodes render as a two-column list of chips with state dots and `aria-pressed` (`:311-317`, `NodeChip` `:390`) — the map's meaning without a 640px horizontal scroll (v1 forced `min-w-[640px]`, log #8). log rows restack into two lines (`grid-cols-[auto_1fr]` → `sm:grid-cols-[4.5rem_auto_1fr_auto]`, `:352`). nothing is wider than the viewport — inferred from classes.
- keyboard: every svg node is `role=button tabIndex=0` with `aria-pressed` and an `aria-label` naming room and state, toggled by enter or space (`:283-294`); the legend's clear-filter and every card are native buttons/links.
- motion: only the refresh spinner. the live halo is a static second ring, not an animation.
- empty/loading: text + spinner with `aria-label`; the empty log explains which rooms write rows.
- copy: lowercase throughout; proper names from the rail keep theirs (`asherin.agents`, `v.2`).

## relationships

| edge | kind | real in code? |
| --- | --- | --- |
| every `emitPull` writer → `asherin_connect_pulls` | writes_to | yes: 14 files (grep); the mapping of their ids is `ORGAN_ROOM`, verified for the ids seen |
| connect → navIntents | depends_on (node list) | yes: `graph.ts:200` |
| chat transcript → connect `?organ=` | calls | yes: `ChatView.tsx:1056`, `TurnTraces.tsx:80` |
| connect → asherin.google | trusts (binding hand-off) | yes: `/dashboard/google` |
| connect → key vault | reads_from via shim; shares `AIKeysSettings` with settings | yes |
| connect → settings | owns_state shared (keys) | yes |
| v2 shell | verified_by `v2Titles.ts:22-23` | yes |

## performance

- mount: one table read (≤300 rows, from the shim's in-memory cache after first load), two binding reads; `buildGraph` is O(rows + rooms) and memoised on `pulls`.
- the realtime listener debounces re-reads to one per 300 ms burst; the timer and the channel are cleared on unmount (`:143-146`).
- the svg draws ≤ ~35 nodes and as many edges as the log backs; labels are plain `<text>`.
- no intervals, no workers, no media.

## copy & voice

lowercase except rail proper names. the map legend reads `live / stale / failed / never ran`; the node tooltip says the state in words (`STATE_LABEL`, `graph.ts:237`). no "kernel offline": the google card states why there is no account on a device in one sentence. no "BYOK", no "platform routing" (v1's "none — platform routing" claimed a routing path that does not exist; log #9). the shared rail blurb still says "pull-graph … BYOK"; patch below.

## tests & proof

- `src/lib/connect/__tests__/graph.test.ts` — 10 tests: id normalisation for every writer id seen, unclaimed ids kept, labels from the rail, skip rows never light or fail, live window / stale / newest-failure precedence, non-negative relative time, one node per rail room with chat centred and all coordinates in the box, edges only from cross-room rows with counts and `lit`, extra node for an unclaimed organ, the mount skip row lights nothing.
- `maskQuote` has no unit test of its own in this round (it was unchanged except two regex escapes); the patterns are read-verified above.
- `npx vitest run src/lib/connect src/components/dashboard/settings`: 18 tests pass. full-suite tail in the report.
- end-to-end step: not driven. screenshots: pending.

## open gaps

1. **most rooms do not pull yet.** of the rail's rooms, writers exist for library, knowledge vault, projects (as chat), zahten, whiteboard, notebooks, briefing, guardian vault, defender, arvision, asherinx, google panels, chat's geocoder and the scrapper; search, cyber, data, design, vedic, pages, health, sentinel, adam, snippets and memory write nothing, so they are honestly `never ran`. the map says so instead of pretending.
2. **chat is a surface, not an organ.** chat's rows name `maps` (the geocoder) as the organ with chat as the surface, so the chat node is lit only when another writer names `organ: "chat"` (projects scope does). a `tracePull` around the model call in `ai.ts` would make chat's own answers visible here; that is a shared-file change and is not proposed this round because the ledger patch in settings.md covers the same call site — the two should land together.
3. **google binding is a dead read on a device**: the table is never written; the card says so.
4. **bindings have no error surface of their own** (table reads failing silently keep the last state).
5. **the mount skip row is a write on open.** deliberate, one per mount, only when the table is empty; it is the only row connect ever writes.
6. **no screenshots this round.**

## proposed patches to shared files (not applied)

`src/lib/navIntents.ts` (anchor `view: "api-keys"`):
```ts
// old
    view: "api-keys",
    label: "Connect",
    codename: "Connect",
    blurb: "Live capability pull-graph, bindings, and your encrypted provider keys (BYOK)",
// new
    view: "api-keys",
    label: "connect",
    codename: "what ran",
    blurb: "what actually ran on this device, what it is bound to, and the provider keys it answers with",
```

(`src/lib/dashboard/v2Titles.ts:22-23` already reads `connect` / "what actually ran, and what it is bound to." — no change.)

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ORGANS` listed 22 hand-placed organs (eye/Adam, zophiel, zerlal, azplen, zahten, zali, vedic, document-studio, snippets, rad, shield, ghost, memory…); writers in `src/` emit only chat, maps, google, vault, zahten, briefings, notebooks, knowledge-vault, library, whiteboard, ghost, file-scrapper, connect, defender, arvision | semantic / requirements | cause | grep `emitPull({` across src | wrong claim + defect | component replacement | nodes derived from `NAV_INTENTS` + log ids (`graph.ts:183-235`) | unit test |
| 2 | organ labels were codenames ("Eye", "Zophiel", "ZALI", "Azplen", "Zahten"); the rooms are asherin.adam, asherin.search, asherin.design, asherin.data, asherin.agents | copy / semantic | failure | `navIntents.ts` | wrong claim | local correction | `labelFor` uses the rail's lowercase labels | unit test |
| 3 | `EDGES` (29 static pairs) claimed "the product's honest wiring diagram"; no row backs a static edge, and several joined organs nothing writes (`zophiel→zali`, `shield→vault`, `google→briefings`) | semantic | cause | no writer emits those pairs | wrong claim | contract repair | edges derived from `from_surface → organ` rows only | unit test |
| 4 | `MAP_CAPABILITIES` filtered the `eye` organ by take/property/nearby/roofs/ship/cameras; no writer emits `eye`, and `property` is written under `maps` | semantic | cause | `ChatView.tsx:551` | defect (dead branch) | local correction | removed; filter is by normalised room | read |
| 5 | `organState` returned `ok` for any pull under 60 min and `stale` only after; the header said green means the last five minutes | logic | cause | v1 `:104-112` | defect (contradiction) | local correction | `nodeState`: ok < 5 min, else stale; skip rows ignored | unit test |
| 6 | realtime handler prepended `payload.new`; the local shim fires on every write with the table's last row (`client.ts:86`), and the mount effect also re-read → duplicate rows | state | cause | `client.ts:79-91` | defect | local correction | debounced re-read; no prepend | read |
| 7 | `?organ=maps` selected a node id that did not exist in `ORGANS`; the filter matched raw organ ids against room ids | logic | cause | `TurnTraces.tsx:80` passes `r.organ` | defect | local correction | `roomFor` on the param and on every row | unit test (roomFor) |
| 8 | svg `min-w-[640px]` inside `overflow-x-auto` → a sideways-scrolling map at 390px; nodes were `<g onClick>` with no keyboard access | interface / a11y | failure | v1 `:325`, `:347` | defect | local correction | svg hidden below `sm`, chip list on phone; `role=button tabIndex=0` on desktop nodes | read |
| 9 | BYOK card "none — platform routing": there is no platform key or routing (`aiProviders.ts`: no `isPlatform`), and "BYOK" is jargon | semantic / copy | failure | grep | wrong claim | local correction | "none saved — add one below" / "held in the device vault" | read |
| 10 | google card queried a `harvest` pull that no writer emits, and promised "reconnect" | semantic | cause | grep `capability: "harvest"`: none | wrong claim | local correction | count/valid only; states the device truth | read |
| 11 | empty log said "chat, map, or search will appear here"; search writes nothing | semantic | failure | grep | wrong claim | local correction | names rooms that do write | read |
| 12 | table read errors were ignored (`data ?? []`) → an unreadable log looked empty | failure modes | cause | v1 `:151-158` | defect | local correction | `error` state, `role=alert`, try again | read |
| 13 | rows without `ts` sorted undefined | data | cause | shim orders by the named column only | defect | local correction | `ts ?? created_at ?? epoch` | read |
| 14 | header/legend/log copy capitalised ("Connect", "Live pulls", "Refresh", "Provider keys"); "Encrypted at rest and used for BYOK routing" | copy | failure | v1 | defect | local correction | lowercase, device sentence | read |
| 15 | `Organ` type in `emitPull.ts` named 33 ids incl. ide, axrlen, zeeion, zaxin, zacoon, pattern, timeseries, teams; `ORGANS` comment said "keep in sync with the view" | structural | failure | grep | wrong claim | local correction | type lists the 15 ids writers use; comment points at `ORGAN_ROOM` | tsc |
| 16 | `emitPull.ts` regexes had five useless escapes (`\-` in classes) — eslint errors | structural | failure | eslint | defect | local correction | fixed | eslint clean |
| 17 | in-flight reads could set state after unmount | performance | failure | v1 | defect | local correction | `alive` ref | read |
| 18 | rail label/codename/blurb capitalised and jargon ("pull-graph", "BYOK") | copy | failure | `navIntents.ts:277-281` | wrong claim | — (patch proposed) | not applied | — |
| 19 | bindings have no error state of their own | failure modes | failure | `:94-108` | defect (open) | — | stated as gap #4 | — |

## vision confirmation — 2026-10-26

screens: final3-d-api-keys.png and final3-m-api-keys.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: the derived room graph, the live/stale/failed legend and the pull log render; the one red node is arvision, whose camera pull really failed in the test browser.
