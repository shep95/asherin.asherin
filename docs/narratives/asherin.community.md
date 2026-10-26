```
room: asherin.community   view id: community   files: src/components/dashboard/zali/CommunityView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: n/a (room removed)
```

files this narrative covers: `src/components/dashboard/zali/CommunityView.tsx` (imported only by `src/pages/Dashboard.tsx:47`; it sits in the `zali/` folder by accident of history and shares nothing with asherin.design — `grep -rn CommunityView src` → `Dashboard.tsx` only).

## decision

**remove the room.** the sidebar entry, dashboard case, icon, view type and v.2 title are shared-file edits and are listed as exact patches below for the main session; the component file is reduced here to an honest interim notice so a deep link to `/dashboard/community` says what the room is until those patches land, and is then deleted.

the reason, from the code and the doctrine:

- a forum is other people plus a server. the local edition has neither: `supabase` is `createLocalClient()` (`src/integrations/supabase/client.ts:7`), whose `from()` resolves against this device's indexeddb (`src/lib/local/postgrest.ts`) and whose `channel()` fires only on this device's own writes (`src/lib/local/client.ts:74-113`). `community_posts`, `community_votes` and `community_replies` are tables only this operator can write [observed].
- so every surface in the old component was fake liveness: an "upvote / downvote" column on your own posts, a vote count that only you move, a reply thread where every avatar is "You" and the "U" branch for other users can never render (old `CommunityView.tsx:380`), a "popular" sort over one author, a realtime subscription that mirrors your own insert back to you (old `:90-107`), and an empty state that told an empty single-user table "No posts yet. Be the first!" (old `:300`) [observed]. the doctrine forbids exactly this: no fake "verified"/liveness cues (aesthetic record 045), no coercive framing (record 050), and the software rule that completion must not be claimed for behaviour the system cannot perform (`shepherd_software_architecture.txt:18, 518`).
- the honest alternatives already exist as rooms. notes to yourself: asherin.notebooks and projects. a request or a bug you want to send someone: asherin.bugs, now a local log with an export. a "local notes-to-self board" here would be a third, weaker copy of notebooks wearing a forum's clothes, which is the kind of duplicate the nav doctrine ("every room one click inside one group", `navIntents.ts:8-9`) is written against.
- nothing depends on it: no other room reads `community_*`; no test references it; the v.2 keep-stack never listed it (`DashboardSidebarV2.tsx:V2_ORDER`); the account group blurb already omits it ("settings, keys, activity, device", `navIntents.ts:334`) [observed].

## purpose & promise (interim)

until the patches land, the room renders one static card: "asherin.community is not part of the local edition." with the reason in two lowercase sentences and two equal-weight buttons — "log a bug or a request" → `bug-reports`, "write a note to yourself" → `notebooks` (`CommunityView.tsx:21-41`) [observed]. it promises nothing else and does nothing else.

## entry & navigation (interim)

- sidebar group "account", nav intent `view: "community"`, label "asherin.community", codename "shared room", blurb "shared prompts and rooms" (`src/lib/navIntents.ts:307-314`) — to be removed.
- v.1 sidebar icon `community: MessagesSquare` (`DashboardSidebar.tsx:140`) — to be removed; `MessagesSquare` stays imported because `chat` uses it (`:105`).
- `Dashboard.tsx:47` lazy import; `:184` in `VALID_VIEWS`; `:1999-2003` `case "community"` via `gatedView(…, "Community")` — all to be removed.
- `types.ts:108` `| "community"` — to be removed.
- `v2Titles.ts:48` `community: { title: "community" }` — to be removed.
- navigation out of the notice: `window.dispatchEvent(new CustomEvent("aureon:navigate", { detail: view }))` (`CommunityView.tsx:14-16`), the same event the guardian overview uses and `Dashboard.tsx:635-642` listens for [observed].

## workflow (interim)

one step: read the card; optionally press one of the two buttons. there is no compose, vote, reply, sort or delete.

## state & data (interim)

none in react beyond the render. the component reads no table and writes no table. the three hosted-era tables (`community_posts`, `community_votes`, `community_replies`) may still hold rows on devices that were used before this change; nothing reads them now, so they are dead data until the operator's whole-device wipe removes them (`src/lib/local/exportData.ts:24`). they still travel in the whole-device export because that exports every table (`exportData.ts:10-12`) — noted in open gaps.

## logic

none. `go(view)` dispatches one dom event (`CommunityView.tsx:14-16`).

## integrations & network

none. no `fetch`, no `supabase`, no channel [observed; the file imports only `lucide-react` and a type].

## security & privacy

no input, no storage, no network: no injection surface, no key, nothing at rest, nothing leaves. the two buttons dispatch a navigation event with a literal view id, not operator input [observed].

## failure modes

the component cannot fail at runtime: it has no async path. if the `aureon:navigate` listener is absent (it is mounted for the dashboard's lifetime, `Dashboard.tsx:635-642`) a button press does nothing visible — acceptable for an interim notice that is itself scheduled for removal.

## interface & accessibility (interim)

a centred card, `max-w-md`, `p-8`, icon + heading + two sentences + two equal-weight buttons that wrap on phone (`flex-wrap`, `CommunityView.tsx:32`) [observed]. the heading is an `<h1>`; the icon is `aria-hidden`; both buttons are native with `focus-visible` rings. the visual form matches `RetiredRoom` in `Dashboard.tsx:109-116` (a centred card) so a retired room and a removed room read the same way [observed]. lowercase throughout.

## relationships

| edge | target | real in code |
| --- | --- | --- |
| hands_to | asherin.bugs (`bug-reports`), notebooks | yes — via `aureon:navigate` |
| reads_from / writes_to / calls / trusts | — | none |
| verified_by | tsc + eslint on the file; no runtime path to test | — |

## performance

one static render, no effects, no listeners.

## copy & voice

three lowercase sentences and two button labels; "asherin.community" as the only proper name; no "be the first", no "posted!", no "community" as a promise.

## tests & proof

- `npx tsc --noEmit -p tsconfig.app.json`: no errors in this file.
- `npx eslint src/components/dashboard/zali/CommunityView.tsx`: clean.
- no unit test: there is no logic. no screenshots: the card is interim.

## open gaps (said plainly)

- the five shared-file patches below have not been applied; until they are, "asherin.community" still appears in the v.1 sidebar's account group and the palette has no entry for it (it never had one).
- hosted-era `community_*` rows on an old device are dead but still part of the whole-device export; a one-off `mutateTable` drop of those three tables could be added to a migration if a clean export matters.
- after the patches, delete `src/components/dashboard/zali/CommunityView.tsx` (its last importer is the dashboard case).

## shared-file patches (not applied here; apply in this order, then delete the component)

1. `src/lib/navIntents.ts:307-314` — remove the whole entry:
   - old:
     ```
       {
         view: "community",
         label: "asherin.community",
         codename: "shared room",
         blurb: "shared prompts and rooms",
         keywords: ["community", "forum", "shared", "people"],
         group: "account",
       },
     ```
   - new: (nothing)
2. `src/pages/Dashboard.tsx:47`
   - old: `const CommunityView = lazyWithRetry(() => import("@/components/dashboard/zali/CommunityView"));`
   - new: (nothing)
3. `src/pages/Dashboard.tsx:184` (inside `VALID_VIEWS`)
   - old: `    "community",`
   - new: (nothing)
4. `src/pages/Dashboard.tsx:1999-2003`
   - old:
     ```
           case "community":
             return gatedView(
               "community",
               CommunityView,
               "Community",
             );
     ```
   - new: (nothing — an unknown view id falls through the switch to the default)
5. `src/components/dashboard/DashboardSidebar.tsx:140`
   - old: `  community: MessagesSquare,`
   - new: (nothing; keep the `MessagesSquare` import — `chat` uses it at `:105`)
6. `src/components/dashboard/types.ts:108`
   - old: `  | "community"`
   - new: (nothing)
7. `src/lib/dashboard/v2Titles.ts:48`
   - old: `  community: { title: "community" },`
   - new: (nothing)
8. then: `git rm src/components/dashboard/zali/CommunityView.tsx` (main session; it is the last reference).

interim alternative if the main session prefers one line now: add `"community"` to `RETIRED_VIEWS` in `src/lib/retiredSurfaces.ts:4-14`. `setActiveView` then redirects it to chat (`Dashboard.tsx:245-251`) and `gatedView` renders `RetiredRoom`. but the v.1 sidebar does not filter retired views (`DashboardSidebar.tsx:263-269`), so the row would stay as a dead control that lands on chat — which is why the full removal above is the right repair, not the retirement flag.

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | a forum on a device with no other people and no server: `community_posts/votes/replies` are tables only this operator writes; votes, "popular" sort, reply threads and a realtime channel all mirrored the operator back to themself | requirements | cause | observed (`client.ts` local-only; `LocalChannel` fires on own writes) | defect (fake liveness) | component replacement → removal | room file reduced to an honest notice; removal patches 1-8 listed | tsc, eslint |
| 2 | empty state "No posts yet. Be the first!" addressed to an empty single-user table | copy & voice / ethics | failure | observed (old `:300`) | defect (coercive framing, record 050) | requirement reconciliation | gone with the component body | grep |
| 3 | avatar branch `r.userId === user?.id ? "You" : "U"` — the "U" case can never render on a device | semantic | failure | observed (old `:380`) | dead code | removal | gone | grep |
| 4 | realtime subscription `supabase.channel("community-posts-rt")` re-fetched the whole table on every own write, with the same mapping code duplicated from the mount loader (old `:59-107`) | structural / performance | failure | observed | defect | removal | gone | grep |
| 5 | one-tap delete of a post with no confirm (old `:176-181`) | interface | failure | observed | defect (irreversible destructive action, record 038) | removal | gone; asherin.bugs' remove is two-step | code read |
| 6 | title-case copy: "Community", "New Post", "Cancel", "Questions / Requests / Feature Votes", "Posted!", "Post deleted", "Write a reply..." | copy & voice | failure | observed | defect | removal | gone | grep |
| 7 | `handleVote` used `posts.find(...)!` (non-null assertion on a possibly stale list) and two sequential writes with no error handling | behavioral | failure | observed (old `:122, 130`) | defect | removal | gone | — |
| 8 | the component lives under `zali/` (asherin.design's folder) but belongs to no room there | structural | failure | observed | misplacement | removal | delete after patch 8 | — |
| 9 | nav entry, dashboard case, sidebar icon, view type and v.2 title still present | structural | failure | observed | defect (shared) | dependency restructuring | patches 1-7, not applied | — |

## vision confirmation — 2026-10-26


- seen: the room was removed, so there is no screen to look at. the sweep confirms no nav entry or page leads to it.
