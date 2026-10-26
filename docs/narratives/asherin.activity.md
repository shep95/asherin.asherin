```
room: asherin.activity   view id: stats (alias: audit)   files: src/components/dashboard/ActivityView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

files this narrative covers (exclusively imported by this room, confirmed with `grep -rln`):

- `src/components/dashboard/ActivityView.tsx` — the one panel
- `src/lib/activity/usage.ts` — the usage reducer and its reader
- `src/lib/activity/usage.test.ts` — unit tests

shared modules it reads but does not own: `src/lib/guardian/deviceSecurity.ts` (`readTrail`, `trailLabel`, `TRAIL_LIMIT` — the trail is the guardian vault's writer), `src/lib/local/db.ts` (`onTableChange`), `src/lib/local/postgrest.ts` (query shim), `src/contexts/AuthContext.tsx` (device identity), `src/components/dashboard/v2/V2PageShell.tsx` (`V2Action`), `src/pages/Dashboard.tsx` (wiring), `src/lib/navIntents.ts`, `src/lib/dashboard/v2Titles.ts`, `src/components/dashboard/CommandPalette.tsx`.

## purpose & promise

asherin.activity is the room that answers "what have i done here". two half-rooms used to exist — a stats page over a server-filled `usage_stats` row and an audit page over `audit_log` — and `Dashboard.tsx` already folded them into one component (`Dashboard.tsx:2026` `case "audit"` and `:2134` `case "stats"` both render `ActivityView`). the promise on screen is one line: "what you did here, read from this device. nothing is compared to anyone else." (`ActivityView.tsx:120`) [observed].

the honest version of that promise on a device has two halves. the usage half is reduced from the chat store itself: every prompt is a `messages` row with `role: "user"`, every conversation carries the mode it was opened in, and the room reads only `role`, `created_at` and `conversation_id` — never content, which is ciphertext (`usage.ts:150-158`) [observed]. the trail half is the same `audit_log` rows the guardian vault writes with `recordTrail` (`deviceSecurity.ts:258-274`) and shows in its own trail tab (`DeviceTrail.tsx`) [observed]. nothing is estimated: the previous "rough time saved, 1.5 min per prompt" figure (`total * 1.5`) was an invented number dressed as a metric and is gone [verified by code read].

## entry & navigation

- sidebar group "account", nav intent `view: "stats"`, label "asherin.activity", codename "usage + trail" (`src/lib/navIntents.ts:300-306`). the blurb still reads "what you used, and every recorded action on your account" — account-era; shared file, patch proposed below [observed].
- v.2 keep-stack lists `"stats"` (`DashboardSidebarV2.tsx:55`); v.1 sidebar icon `stats: BarChart3`, `audit: ClipboardList` (`DashboardSidebar.tsx:144-145`) [observed].
- command palette: `{ id: "stats", label: "My Stats" }` and `{ id: "audit", label: "Audit Trail" }` (`CommandPalette.tsx:80`, `:73`) — title-case, and "My Stats" is a name the room no longer has; shared file, patch proposed below [observed].
- deep links: `/dashboard/stats`, `/dashboard/audit`, and the aliases `activity`, `asherin-activity`, `asherin.activity` → `stats` (`Dashboard.tsx:224-226`) [observed].
- `"stats"` and `"audit"` are not in `RETIRED_VIEWS` (`src/lib/retiredSurfaces.ts`), so the room always renders; neither is routed through `gatedView`, so there is no retired-room copy to worry about [observed].
- v.2 title: `stats` and `audit` both → "asherin.activity / your usage and your recorded actions." (`v2Titles.ts:45-46`); in v.2 the room draws no heading of its own and portals its refresh button into the shell slot (`ActivityView.tsx:114-116`); in v.1 it draws "asherin.activity" + the one-line promise (`:118-124`) [observed].
- `"stats"` and `"audit"` are not in the `data-asherin-room` list (`Dashboard.tsx:2420-2423`), so the room is not framed as a "surface" room; it renders in the ordinary rounded frame [observed].
- what loads first: a skeleton (two rows of pulsing tiles, `ActivityView.tsx:127-134`) while `load()` runs both readers in parallel (`:57`) [observed].

## workflow

happy path:
1. mount → `load()` (`ActivityView.tsx:51-71`): `Promise.allSettled([readUsage(user.id), readTrail()])`. each half settles on its own, so a broken chat store does not blank the trail and vice versa [observed].
2. four tiles: prompts sent (with the reply count as a note), conversations, days active (with "since <first prompt date>"), current streak (`:92-97`) [observed].
3. "how you used it": one bar per chat mode — chat, research, code, truth, and "unknown" only when a prompt's conversation has been deleted (`usage.ts:116-118`); shares from `modeShares` sum to 100 (`usage.ts:134-148`) [verified by unit test].
4. "recorded actions": the trail, newest first, with a text filter over the lowercase label, the resource type and the detail line (`:86-90`) [observed].

secondary paths:
- refresh: the header button re-runs `load()` (`:99-109`) [observed].
- live update: the room subscribes to `onTableChange("audit_log")` and `onTableChange("messages")` and reloads on either (`:73-82`), so a guardian-vault action or a new chat prompt shows without a refresh [observed]. both subscriptions are released on unmount (`:78-81`) [observed].
- filter: client-side, case-insensitive, over `trailLabel(e)`, `resource_type` and `detailLine(details)` (`:86-90`) [observed].
- there is no edit, delete or export in this room by design: the trail is a record, not a document; the whole-device export in settings (`src/lib/local/exportData.ts:9`) already carries `audit_log` and `messages` [observed].

## state & data

| state | lives in | shape | lifetime | leaves device |
| --- | --- | --- | --- | --- |
| `usage` | react, from `readUsage` | `UsageFacts` (`usage.ts:31-45`): prompts, replies, conversations, byMode[], activeDays, streakDays, firstAt, lastAt | mount; reloaded on `messages` change | no |
| `trail` | react, from `readTrail` | `TrailEntry[]` (`deviceSecurity.ts:213-220`), at most 200 | mount; reloaded on `audit_log` change | no |
| `usageError`, `trailError`, `loading` | react | `string \| null`, boolean | mount | no |
| `search` | react | string | mount; never written anywhere | no |
| `messages` rows | indexeddb table `messages` (shim) | written by chat; this room reads `role, created_at, conversation_id` only (`usage.ts:152`) | until wiped | no (content is ciphertext and is not even read here) |
| `conversations` rows | indexeddb table `conversations` | this room reads `id, mode` (`usage.ts:153`) | until wiped | no |
| `audit_log` rows | indexeddb table `audit_log` | `{ action, resource_type, resource_id, details }` + shim-added `id`, `created_at`, `user_id` (`postgrest.ts` insert path) | until wiped | no |
| `usage_stats` row | indexeddb table `usage_stats` | **no longer read here.** `Dashboard.tsx:1089-1104` `trackUsage` still selects and updates it, but nothing ever inserts it, so it never exists on a device | — | no |

nothing in this room is written and never read; the room writes nothing at all [observed].

## logic

all of it is pure and unit-tested in `src/lib/activity/usage.ts`:

- `dayKey` (`usage.ts:59-64`): the operator's local calendar day, not utc's [verified].
- `streakFrom` (`:73-85`): consecutive days with a prompt counted back from today; a quiet today does not break the chain (yesterday is tried), a quiet yesterday does; empty set → 0 [verified].
- `summarizeUsage` (`:88-131`): one pass over messages. `role === "assistant"` → replies; `role === "user"` → prompts, mode via the conversation map (unknown mode or missing conversation → "unknown"), day set, first/last timestamps. rows with an unparsable `created_at` are counted but skipped for the day maths (`:111`) [verified]. the "unknown" bucket is appended only when non-zero (`:116-118`) [verified].
- `modeShares` (`:134-148`): largest-remainder rounding so the percentages are whole and sum to 100 when prompts > 0; a mode with zero prompts never receives a remainder point [verified].
- `readUsage` (`:150-158`): two scoped selects through the shim, errors surfaced as thrown `Error(message)` so the view can show them [verified through the shim with fake-indexeddb].
- `trailLabel` (`deviceSecurity.ts:238-240`): mapped lowercase label for the twelve known actions, otherwise `action` with underscores → spaces, lowercased [observed; tested in `guardianDeviceSecurity.test.ts`].
- `detailLine` (`ActivityView.tsx:28-34`): flat scalar fields of `details` joined with " · "; nested objects are dropped (same as `DeviceTrail.tsx:17-23`) [observed].

edge cases: no user → `loading` goes false and the empty shape renders (`:52-55`), no forever-spinner [observed]; `created_at` unparsable → "time unknown" (`:36-39`) [observed]; more than 200 trail rows → the note "most recent 200." (`:188`) [observed].

## integrations & network

none. the room makes no `fetch`, no `supabase.functions.invoke`, no channel. both readers resolve against the local store (`src/lib/local/postgrest.ts`). the shim's realtime is not used; the cheaper `onTableChange` listener is (`:76-77`) [observed; `grep -n "fetch\|invoke\|channel" ActivityView.tsx usage.ts` → none].

## security & privacy

threat model: whoever can read this browser profile; a hostile row in the local store.

- message content is never read (`usage.ts:152` selects `role, created_at, conversation_id`), so the room cannot leak chat text even by accident, and the reducer has no path from content to screen [observed].
- the trail's `details` is rendered through `detailLine` as text; `resource_id` is no longer shown at all (the old view printed its first eight characters) [observed].
- every string reaches the dom as a react text node; no `dangerouslySetInnerHTML` [observed].
- the search string is react state only; nothing is persisted from this room [observed].
- the device identity used to scope reads is `useAuth().user.id` (`auth.ts:89`) — a locally minted uuid, not a person [observed].

## failure modes

| failure | what the operator sees | where |
| --- | --- | --- |
| chat store read throws | "the chat store did not read." + the shim message, in a `role="alert"` box; the trail card still renders below | `ActivityView.tsx:137-142` |
| trail read throws | "the trail did not load." + message + "try again" | `:205-213` |
| both fail | both alerts, no blank | both branches are independent (`Promise.allSettled`, `:57`) |
| no user | skeleton resolves to the empty shape | `:52-55` |
| no prompts | "no prompts yet. the first one you send in chat counts here." | `:165` |
| no trail rows | "nothing recorded yet. the guardian vault writes a line here when it locks, unlocks, stores an item or runs a check." | `:218` |
| filter matches nothing | "no recorded action matches that filter." | `:219` |
| still loading | a skeleton (`aria-busy`), not a bare spinner; local reads cannot hang on a network | `:127-134` |

no path renders a raw stack, a blank panel or a spinner that cannot end [observed].

## interface & accessibility

- layout: one column, `max-w-3xl`, `p-4` on phone and `p-6` from `sm:` (`:112`). tiles are a 2×2 grid at every width (`:146`); at 390px each tile is ~170px wide and the 2xl numeral fits [inferred from classes; screenshot pending]. the trail card's heading row stacks on phone and goes side-by-side from `sm:` (`:181`); the filter input is a labelled `<label>` wrapper with an `aria-label` (`:189-199`) [observed].
- figure-ground and grouping: three cards (tiles, modes, trail), each one bordered region (common region); the trail list is a `<ul>` of `<li>` rows [observed].
- one focal point: the prompt count is the largest numeral and sits first (visual weight follows importance) [observed]; the refresh action is the single header action and portals into the v.2 slot (`:114-116`) [observed].
- colour carries no meaning here beyond foreground/muted; bars are `bg-foreground/30` on `bg-border/30` and each carries a `role="img"` with a spoken label "chat: 3 prompts, 50 percent" (`:171`) [observed].
- motion: the skeleton pulses while reading; the refresh icon spins while `loading` (`:106`); nothing else moves [observed].
- keyboard: refresh, input and "try again" are native controls with `focus-visible` rings; icons are `aria-hidden` [observed].
- copy is lowercase except "asherin" product names; the small tracking labels are no longer `uppercase` [observed].

## relationships

| edge | target | real in code |
| --- | --- | --- |
| reads_from | `messages`, `conversations` (chat's tables) | yes — `usage.ts:150-158` |
| reads_from | `audit_log` | yes — via `readTrail` (`deviceSecurity.ts:244-252`) |
| depends_on | guardian vault's `trailLabel` / `TRAIL_LIMIT` | yes — `ActivityView.tsx:17`; the two rooms show the same label for the same action |
| writes_to | — | nothing |
| owns_state | react state only | yes |
| trusts | the shim to scope rows by `user_id`; the guardian vault to put no secrets in `details` (`deviceSecurity.ts:256-257`) | yes |
| verified_by | `src/lib/activity/usage.test.ts` (9 tests); `guardianDeviceSecurity.test.ts:99` for the shared trail | yes |
| contradicted edge removed | `usage_stats` (server-filled counters) | the row never exists on a device; `Dashboard.tsx:1089-1104` still updates it if present — dead write, shared file, noted below |

## performance

- mount: two table reads from the in-memory table cache (`db.ts:92-99` caches whole tables after the first idb read); `messages` is projected to three columns before leaving the shim. for thousands of messages this is a linear reduce, well under a frame [inferred].
- live reload: `onTableChange` fires on every write to `messages`, so an active chat stream re-reduces on each saved row. one reduce per saved message is cheap; if chat ever writes per token this would need a debounce (open gap) [inferred].
- no timers, intervals, workers or channels; the two listeners are removed on unmount (`:78-81`) [observed].

## copy & voice

- lowercase throughout; "asherin.activity" as the only proper name; no "account", "team", "invite", "member" anywhere — the old `actionIcons` map for `team_created` / `invite_sent` / `invite_accepted` / `member_removed` (actions no device can write) is gone [observed].
- "shepherd" is not named here because the room does not call a model [observed].
- no "kernel offline": the room has no capability that needs a server [observed].
- shared-file residuals (not edited here): nav blurb "…on your account" (`navIntents.ts:303`); command palette "My Stats" / "Audit Trail" (`CommandPalette.tsx:80`, `:73`). patches below.

## tests & proof

- `src/lib/activity/usage.test.ts` — 9 tests: counting, mode attribution and ordering, unknown bucket, local-day active count and streak, quiet-today/quiet-yesterday streak rule, unparsable dates, empty shape, share rounding, and a round trip through the shim with fake-indexeddb. all pass.
- `npx tsc --noEmit -p tsconfig.app.json`: no errors in this room's files (the run reports errors in `LibraryView.tsx` and `data/*`, which other sessions are editing).
- `npx eslint` on the three touched files: clean.
- screenshots at 1440×900 and 390×844: not taken this pass (no dev server / playwright from this session).

## open gaps (said plainly)

- the `usage_stats` table is still touched by `Dashboard.tsx:1089-1104` (`trackUsage`): it selects a row that never exists and therefore never updates anything. harmless, dead, and a shared file — patch proposed below to remove it.
- `onTableChange("messages")` reloads on every saved message; fine today, would want a debounce if chat starts persisting partial streams per token.
- the trail shows only what the guardian vault chose to record. chat, library and the other rooms write no trail rows, so "recorded actions" is honest but narrow; widening it is a decision for those rooms.
- screenshots pending.

## shared-file patches (not applied here)

1. `src/lib/navIntents.ts:303`
   - old: `    blurb: "what you used, and every recorded action on your account",`
   - new: `    blurb: "what you did here, and what this device recorded about itself",`
2. `src/components/dashboard/CommandPalette.tsx:80`
   - old: `{ id: "stats", label: "My Stats", category: "Navigation", icon: BarChart3, action: wrap("stats", () => onViewChange("stats")), keywords: ["usage", "analytics"] },`
   - new: `{ id: "stats", label: "asherin.activity", category: "Navigation", icon: BarChart3, action: wrap("stats", () => onViewChange("stats")), keywords: ["usage", "activity", "trail", "audit", "streak"] },`
3. `src/components/dashboard/CommandPalette.tsx:73` (the `audit` alias duplicates the same panel)
   - old: `    { id: "audit", label: "Audit Trail", category: "Navigation", icon: ClipboardList, action: wrap("audit", () => onViewChange("audit")), keywords: ["log", "compliance"] },`
   - new: (remove the line; `ClipboardList` stays imported for `bug-reports`)
4. `src/pages/Dashboard.tsx:1082-1107` — `trackUsage` reads and updates a `usage_stats` row that nothing inserts on a device. remove the callback and its call site(s) (`grep -n "trackUsage" src/pages/Dashboard.tsx`), or leave as dead code; the activity room no longer depends on it.

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | "prompts recorded", "current streak" and the mode bars read `usage_stats`, a row no code path inserts on a device (`grep usage_stats` → only a `select` + `update` in `Dashboard.tsx:1089-1104`); the tiles were 0 forever and the bars said "no prompts recorded yet" regardless of use | data | cause | observed (grep; shim has no insert) | defect | component replacement | reducer over `messages`/`conversations` — `src/lib/activity/usage.ts:88-158`; view `ActivityView.tsx:57` | unit tests (9), tsc, eslint |
| 2 | "rough time saved — estimated at 1.5 min per prompt" (`total * 1.5`) was an invented metric drawn as data | requirements | failure | observed | defect | requirement reconciliation | tile removed; replaced by "days active" and "conversations", both counted | code read |
| 3 | action icons mapped `team_created`, `invite_sent`, `invite_accepted`, `member_removed`, `notebook_created`, `data_viewed`, `data_modified` — none is written on a device; the labels were `capitalize`d | semantic / interface | failure | observed (the only writer is `deviceSecurity.recordTrail`) | defect | local correction | icons by `resource_type` as in `DeviceTrail.tsx`; labels via `trailLabel` (`ActivityView.tsx:21-26, 229`) | code read |
| 4 | with `user` null the loader returned early and `loading` stayed true: a spinner that could never end | behavioral | failure | observed | defect | local correction | `ActivityView.tsx:52-55` | code read |
| 5 | shim errors were discarded (`audit.error` never read; `(supabase.from as any)` cast); a failed read rendered as an empty "nothing logged yet", i.e. a lie | failure modes | failure | observed | defect | contract repair | `Promise.allSettled` + `role="alert"` boxes with the message and retry (`:57-70, 137-142, 205-213`) | code read |
| 6 | the trail was read once at mount while the guardian vault writes it continuously; the two rooms disagreed until a reload | state | failure | observed | defect | state consolidation | `onTableChange("audit_log")` and `("messages")` (`:76-77`) | code read |
| 7 | title-case and account-era copy: "Your activity", "Your own usage and your own recorded actions.", "Prompts recorded", "Current streak", "How you used it", "Recorded actions", "Filter actions…", "Nothing logged yet. Actions on your account will appear here.", `uppercase` tracking labels | copy & voice | failure | observed | defect | local correction | all copy rewritten lowercase, device-era (`:118-124, 93-96, 160, 165, 183-185, 218-219`) | code read |
| 8 | `resource_id` was printed as an eight-character prefix with no meaning to the reader | interface | failure | observed | defect | local correction | dropped; `details` scalars shown instead (`:28-34`) | code read |
| 9 | `toLocaleDateString() + toLocaleTimeString()` timestamps differed from the guardian trail's `d MMM yyyy HH:mm:ss` for the same row | interface | failure | observed | defect | local correction | `format(t, "d MMM yyyy HH:mm")` (`:36-39`) | code read |
| 10 | narrative claim "nothing is estimated beyond the clearly-labelled time figure" (file header) | — | — | contradicted | wrong claim | — | header rewritten (`:1-8`) | code read |
| 11 | nav blurb "…every recorded action on your account"; palette "My Stats" / "Audit Trail" | copy & voice | failure | observed | defect (shared) | local correction | patches 1-3 above, not applied | — |
| 12 | `Dashboard.trackUsage` updates a row that never exists | data | cause | observed | defect (shared, dead) | dependency restructuring | patch 4 above, not applied | — |

## vision confirmation — 2026-10-26

screens: final3-d-stats.png and final3-m-stats.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: counters, the "how you used it" card and the device-trail filter render with honest empty states; nothing overflows at 390 px.
