room: the workspace shell   view id: (all)   files: src/pages/Dashboard.tsx · src/components/dashboard/DashboardSidebar.tsx · DashboardSidebarV2.tsx · DashboardSurface.tsx · src/lib/navIntents.ts · src/lib/retiredSurfaces.ts · src/hooks/useAccess.ts · src/components/ErrorBoundary.tsx · RootErrorBoundary.tsx · src/lib/bootLoopGuard.ts · src/lib/lazyWithRetry.ts · public/sw.js
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (second build of this day; see review log)

## purpose & promise

the shell is the frame every room sits in: the sidebar that names the
software, the surface behind it, the error fences around each room, and the
boot path that gets a device from a url to a rendered workspace without a
server. it promises three things: every room named in the sidebar opens; a
url an operator was told opens the room it names; and a broken room breaks
alone, inside its own boundary, with a readable card rather than a blank
page.

## entry & navigation

- `/dashboard` and `/dashboard/<view>` rewrite to `index.html` (vercel.json
  rewrites) and `Dashboard.tsx` reads the view from the path
  (`resolveView(viewParam)`; `Dashboard.tsx` ~l.226, observed). unknown views
  fall back to chat.
- `VIEW_ALIASES` (`Dashboard.tsx` ~l.207) maps product names to ids: eye,
  "asherin.eye", health, sentinel, defender, arvision, activity, pages. the
  investigations and osint aliases were removed with that room (commit
  633a300). the adam port replaces the eye aliases (task #15).
- the sidebar is built from one source, `NAV_INTENTS` in
  `src/lib/navIntents.ts`, grouped by `INTENT_GROUPS` (talk · watch · find ·
  understand · make · keep · account) with a blurb per group
  (`INTENT_GROUP_BLURB`). `DashboardSidebar.tsx` ~l.160 maps them to items;
  `DashboardSidebarV2.tsx` ~l.50 holds the v2 ordering. observed.
- hidden views exist that no sidebar entry reaches: `connect` (alias of
  api-keys), `audit` (the activity panel), `ebook` and `slideshow` (open
  the pages studio on a book or deck), `ghost-engine` and `ide` (retired).
  observed in `Dashboard.tsx` cases ~l.1940–2160.
- retired rooms (`RETIRED_VIEWS` in `src/lib/retiredSurfaces.ts`) render
  `RetiredRoom` through `gatedView` (`Dashboard.tsx` ~l.1878). `useAccess`
  (`src/hooks/useAccess.ts`) has no paywall: every live room opens for the
  device identity; only retired ones stay closed. observed.

## workflow

1. boot: `main.tsx` runs `bootLoopGuard()` (sessionStorage counter; more
   than three boots in a minute disables automatic reloads), registers
   `/sw.js`, mounts `RootErrorBoundary` → router → `Dashboard`.
2. `Dashboard` loads conversations and the active view from the local
   store; until `loaded` it shows the pulsing wordmark (`Dashboard.tsx`
   ~l.2300).
3. first run: `NewAccountWelcomeModal` (lazy) explains the device model and
   is dismissed with "begin"; the harnesses prove it never returns once
   dismissed (usetest step 1). observed.
4. a room is chosen from the sidebar, the command palette (⌘/ctrl+k), a
   deep link, or a keyboard chord (⌘/ctrl+1…4 switch chat modes;
   `Dashboard.tsx` ~l.617–640). each room renders inside `ErrorBoundary` +
   `Suspense` (`gatedView`).
5. chat is the default room; split panes (`SplitPaneManager`) open when a
   conversation is dragged onto the main area while chat is active
   (`<main onDrop>` ~l.2376).
6. "leave the workspace" at the sidebar foot returns to the landing page;
   there is no sign-out because there is no account.

## state & data

| state | where | lifetime | leaves the device |
| --- | --- | --- | --- |
| active view, split panes, focus mode, sidebar open | react state in `Dashboard` | page session | no |
| conversations, messages | encrypted tables in IndexedDB (`src/lib/local/db.ts`, `postgrest.ts`) | until wiped | only the text sent to the connected model |
| appearance (wallpaper / colour / dim) | localStorage `aureon_dash_bg_*` (`src/lib/dashboardAppearance.ts`) | until cleared | no |
| dashboard ui (v1 / v2) | localStorage via `src/lib/dashboardUi.ts`, hydrated from the local db | until cleared | no |
| recent intents | localStorage `aureon_recent_intents` (`navIntents.ts` ~l.340) | last 6 | no |
| boot counter, stale-reload claim | sessionStorage (`bootLoopGuard.ts`) | tab | no |
| first-run flag | local db / localStorage (modal) | until wiped | no |

## logic

- stacking: `DashboardSurface` draws the wallpaper at z 1 and a veil at z 3
  (80 % black over a photo; the operator's dim value over a colour); the
  shell content sits at `relative z-10` (`Dashboard.tsx` ~l.2334). observed
  with a dom probe: the veil is `pointer-events: none` and content is above
  it; the dark look is the design, not a stuck overlay.
- `perf-lite` on `<html>` strips backdrop blurs app-wide during scroll
  (`src/lib/perf/scrollPerf.ts`, `index.css` ~l.919); `perf-keep-blur`
  opts an element back in.
- lazy chunks: `lazyWithRetry` compares the served entry fingerprint with
  the running one; a stale build claims exactly one reload per build via
  `claimStaleReload` shared with `RootErrorBoundary.attemptChunkRecovery`.
  simulation: same build + missing chunk → one load; stale build → exactly
  two loads (verified in the earlier session, docs/IMPROVEMENTS.md).

## integrations & network

the shell itself makes no network call except the service worker
registration and the lazy chunk fetches. `sw.js` (`asherin-v4`) is
network-first for same-origin requests, stale-while-revalidate for the
ephemeris wasm, and never touches foreign origins; activation deletes every
older cache. headers (`vercel.json`): csp with `connect-src https:` and
local runtimes, `frame-ancestors 'none'`, `no-store` on dashboard routes,
immutable on `/assets/`.

## security & privacy

- no credential crosses the shell: keys live in the WebCrypto vault
  (`src/lib/local/keys.ts`) and are read only by `src/lib/ai.ts` and the
  provider calls.
- `ErrorBoundary` shows the error name and message to the operator (its
  own file, l.136). the message can contain a provider response; it never
  contains a key because the vault throws typed errors before any request
  is built.
- the welcome modal and settings use the device language ("this device",
  "wipe this device"); the shell has no sign-in, session or plan surface
  since commits cebeae2 / 633a300 / 11754a9.

## failure modes

| failure | what the operator sees |
| --- | --- |
| a room throws | the room's `ErrorBoundary` card (title "something went wrong" family, error name + message, retry); the sidebar and other rooms stay alive |
| a chunk is missing after a deploy | one automatic reload; if still missing, the boundary card with a reload button; never a loop (boot guard) |
| local db unavailable (private window with storage blocked) | the shim fails closed; rooms show empty states; the boot guard still works without storage |
| a retired or unknown view in the url | retired → "has been retired" card; unknown → chat |
| phone width | sidebar becomes a drawer behind a floating button; main content starts below the button (`pt-[calc(env(safe-area-inset-top,0px)+3.5rem)] lg:pt-0`) |

## interface & accessibility

- desktop 1440×900: sidebar 22 rem, rooms fill the rest; one focal
  point per room is the room's own job. the shell keeps a single accent
  (foreground at low alpha) and lowercase group blurbs; group names are
  small caps with 0.14 em tracking.
- phone 390×844: a floating 44 px navigation button at the safe-area
  corner opens the drawer; a transparent 24 px edge strip lets a drag open
  it; the drawer is `min(22rem, 100vw − 1rem)` wide. confirmed by screenshot
  after the pt fix: room titles no longer sit under the button.
- the sidebar group word can never wrap (`whitespace-nowrap`); the blurb
  truncates first (fix in this version).
- motion: the drawer slides 300 ms; the wallpaper crossfade 800 ms with a
  light streak; none of it runs during scroll (`data-scrolling`).
- keyboard: `/` and `?` are room-level; ⌘/ctrl+k opens the palette;
  escape closes drawers and modals.

## performance

- the sentinel daemon no longer mounts on every page (opt-in, workspace
  only; commit e3fac88), which removed the navigation stalls observed in
  the first end-to-end run.
- the prompt enhancer rail renders only from `lg` up (commit 11754a9); on
  a phone it had covered the conversation and cost a second scroll
  container.
- every room is a lazy chunk; nothing heavy (cesium, monaco, mediapipe)
  loads until its room is opened.

## copy & voice

group blurbs, the welcome modal, settings and the sidebar foot are
lowercase and device-worded. two shell strings are still title-case
("Past Convos", "Search software…") and a few room headers set by
`gatedView` titles are capitalised; the whole-app pass (task from the
operator's 2026-10-25 message) will bring the shell, landing and blog to
the aesthetic doctrine together.

## tests & proof

- `src/test/bootLoopGuard`-family and `lazyWithRetry` behaviour are
  covered in the earlier session's tests (440 unit tests green at e3fac88;
  re-run after these shell commits: green).
- usetest.mjs step 1 (landing → workspace → begin) and roomstest.mjs (every
  room opens, no boundary card) are the shell's end-to-end proof.
- screenshots: scratchpad/shots/*.png (desktop) and m-*.png (phone), taken
  on the 2026-10-25 build before the fixes; the after-fix set is taken on
  the final build of this pass.

## open gaps

- a room can still be reached by a url the sidebar never shows (`ebook`,
  `slideshow`, `audit`, `connect`); harmless but undocumented to the
  operator.
- the error card shows raw error messages; a provider's error body can be
  long. a bounded, lowercase rendering is part of the whole-app pass.

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | phone: the floating navigation button covered every room's title | interface | repair | observed (m-*.png) | defect | local correction | `Dashboard.tsx` main `pt-[…+3.5rem] lg:pt-0` (633a300) | screenshot after build |
| 2 | phone: the prompt enhancer rail covered the whole conversation | interface | repair | observed (m-chat.png) | defect | local correction | rail wrapped in `hidden lg:contents` (11754a9) | screenshot after build |
| 3 | the team room opened on a red "kernel offline" toast and billing copy | requirements | cause | observed (m-teams.png) | defect | component replacement (removal) | room, palette entry, graph node removed (11754a9) | tsc + rooms harness |
| 4 | the retired ide still opened from `/dashboard/ide` and chat still handed code to it | behavioral | cause | observed (`Dashboard.tsx` cases) | defect | boundary repair | case renders `RetiredRoom`; handoff and editor code deleted (cf38da8) | tsc |
| 5 | sidebar group word wrapped ("UNDERSTAN / D") at every width in the screenshots | interface | repair | observed | defect | local correction | label `whitespace-nowrap`, blurb `truncate` (this version) | screenshot after build |
| 6 | "keep" blurb named a team that no longer exists | semantic | domain | observed | wrong claim | requirement reconciliation | blurb → "library, projects, vault, guardian" | read |
| 7 | the narrative first claimed the veil dimmed the content | semantic | cause | contradicted by dom probe (content at z-10 above the z-3 veil) | wrong claim | — | narrative corrected | dom probe |
