```
room: whiteboard   view id: whiteboard   files: src/components/whiteboard/Whiteboard.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

files under review: `src/components/whiteboard/Whiteboard.tsx` (the canvas, the chrome, persistence), `src/lib/whiteboard/types.ts` (element model, bounds, arrow binding), `src/lib/whiteboard/exportBoard.ts` (svg → png / json), `src/lib/whiteboard/dropToElements.ts` (inbox drop → elements), `src/lib/whiteboard/boardInbox.ts` (the contract other rooms use), `src/lib/whiteboard/__tests__/boardInbox.test.ts`.

## purpose & promise

the whiteboard is an infinite canvas on this device: ink, text, stickies, shapes, frames, bound arrows, images, hand-entered chart series, with layers per board and several boards per device. its promise is in its one badge — `encrypted on this device` (`Whiteboard.tsx:1870`): boards are AES-GCM ciphertext in localStorage under a key minted on this device, and nothing on the board is uploaded [observed, `:468-491`, `src/lib/encryption.ts:1-16`]. a second promise is made by other rooms: chat's `send to board` and the knowledge vault's `drop cited notes` put objects here through an in-memory inbox (`boardInbox.ts:1-41`). a third, printed on every chart: `hand-entered — not a live feed` (`:1573`, `exportBoard.ts:196`).

## entry & navigation

- sidebar group `make`, label `asherin.whiteboard`, codename `Canvas`, blurb `Infinite canvas with layers, snap grids, and freeform sketching` (`src/lib/navIntents.ts:218-225`) — capitalised, see shared-file patches. keywords whiteboard / canvas / draw / sketch / diagram / board.
- view id `whiteboard` (`src/components/dashboard/types.ts:138`); rendered by `case "whiteboard"` inside `ErrorBoundary` + `Suspense` with a full-height wrapper (`src/pages/Dashboard.tsx:2048-2056`); v.2 title `whiteboard`, `canvas: true` so the shell does not scroll the room (`src/lib/dashboard/v2Titles.ts:20`); keep-list position 10 (`DashboardSidebarV2.tsx:54`); icon `Layers` (`DashboardSidebar.tsx:108`); connect graph node `Whiteboard` with an edge from chat (`connect/ConnectView.tsx:54`, `:74`).
- in-app arrival: `openBoard()` dispatches `aureon:navigate` with `whiteboard` (`boardInbox.ts:91-101`), which the dashboard turns into `setActiveView` (`Dashboard.tsx:634-642`). this is the only arrival that keeps a queued drop alive (see workflow › inbox).
- what loads first: a placeholder board (`:396-400`) while the stored boards for the device identity decrypt (`:409-462`); drawing is possible at once; saving and the inbox wait for the load (`:468`, `:892`).

## workflow

### draw (main workflow)

1. **pick a tool** — select, pen, text, note, eraser, pan, shapes (menu), frame, arrow; a second row holds marker, highlighter, laser, chart, export, import, colour, fill, size, grids, snap, smart shape, wallpapers, clear (`:1898-2046`). below `lg` the second row folds behind `more` (`:1914-1926`).
2. **pointer down** (`handlePointerDown` `:899-1056`) — pan on the pan tool, middle button or alt; select hits the topmost non-frame first, a frame only when nothing inside it was hit (`:915-922`); double-click on text / sticky opens the editor (`:926-929`); frame drag captures its children by their original bounds (`:932-949`); arrow binds its tail to the element under the start point (`:900-923`); shapes and frames start at zero size; ink starts a `path` with pressure when a stylus reports it (`:1033-1055`).
3. **pointer move** (`:1058-1129`) — drag moves the selection (and a frame's captured children), shapes grow, ink appends points.
4. **pointer up** (`:1131-1192`) — a bound arrow finds its head's element (`:1145-1160`), a tap that never dragged leaves nothing (`:1142-1144`); smart shapes turn a closed stroke into a circle or box and a straight stroke into a line (`:1166-1187`, `detectSmartShape` `:200-243`); one connect trace per 2.5 s burst (`traceCreate` `:596-622`).
5. **persist** — 600 ms after the last change the boards are encrypted and written (`:466-491`); the notice line reports a refused write (`:482-488`).

### secondary paths

- **text / sticky** — click with the tool opens the draft editor at the point; font family, weight, size and note colour; ⌘/ctrl+enter places (`:704-776`, `:2250-2310`). the editor stays inside the pane on a phone (`:2250`).
- **chart** — `chart` places a sketch series; the inspector takes comma-separated numbers (≤ 48) (`:659-682`, `:2160-2177`).
- **files** — `place an image, pdf, csv or text file`: images are decoded and re-encoded at ≤ 1600 px before they touch the board (`shrinkImage` `:318-346`, `:1200-1222`); a pdf becomes a card that says its pages are not read (`:1226-1228`); a csv / json / txt with ≥ 6 numbers becomes a chart (`:1237-1259`); anything else becomes a document card with the first 180 characters (`:1261`).
- **paste** — an image pastes as an image; text pastes as a sticky at the view centre (`:1266-1310`).
- **undo / redo** — 30 snapshots, ⌘/ctrl+z and shift (`:517-574`, `:1320-1325`); backspace and delete remove the selection (`:1335-1339`); escape clears it.
- **boards and layers** — a `board` select and `new board` (`:1850-1868`); a layer stack with show / hide, add, rename (`:2180-2215`).
- **wallpaper** — dark, current, or one of the bundled wallpapers with a blur slider (`:2048-2090`).
- **export / import** — png (svg rasterised at 2×, capped at 8192 px), svg, json; import a json board (`handleExport` `:789-829`, `handleImportBoard` `:831-854`, `exportBoard.ts`).
- **inbox** — drops from chat / vault are consumed once the boards for this key are in state and on every `BOARD_DROP_EVENT`; each drop lands below the existing content with its provenance (`applyDrops` `:856-889`, `:891-897`, `dropToElements.ts`).
- **clear board** — one tap empties the active board; undo brings it back (`:2030-2040`).

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| boards | localStorage `aureon-whiteboards-v3:<identity>` as `ENC:` AES-GCM ciphertext (`:157-158`, `:466-491`) | `{ boards: WhiteboardBoard[], activeBoardId, activeLayerId }` (`types.ts:85-96`) | until cleared; unreadable ciphertext is moved to `…:unreadable:<ts>` not deleted (`:441-447`) | no |
| device key | localStorage `aureon-whiteboard-device-key` (`:160-167`), used only when there is no device identity | `device-<uuid>` | forever | no |
| encryption key | non-extractable WebCrypto key in indexeddb `aureon_e2e_db` (`encryption.ts:38-43`) | CryptoKey | forever | no |
| loaded key, asset tick | react (`:360-362`) | string \| null, number | mount | no |
| view | react: zoom, pan, tool, colour, fill, size, selection, draft editor, panels, notice (`:363-396`) | — | mount | no |
| history | react (`:392-393`) | ≤ 30 deep clones of all boards | mount | no |
| inbox | module memory (`boardInbox.ts:67-68`) | ≤ 12 `BoardDrop` | this javascript realm | no |
| connect traces | local table `asherin_connect_pulls` via `emitPull` (`:609-616`, `:815-828`, `:880-888`) | organ / capability / quote | until the trace store is cleared | no |

the board bytes (including image data urls) leave the device only when the operator exports a file.

## logic

- **bounds** (`types.ts:116-163`): paths pad by stroke; text is estimated at 0.62 em per character; arrows pad 6 px.
- **arrow binding** (`types.ts:193-237`): a bound end follows its element's edge toward the other end, so heads touch boxes instead of burying.
- **smart shapes** (`:200-243`): ≥ 8 points, ≥ 18 px, closed when the ends meet within 22 % of the short side; straight when the mean distance to the chord is under 12 %; ratio 0.76–1.24 is a circle.
- **snap** (`:629-646`): dots 28 px, squares 40 px, off for freeform.
- **wheel** (`:1354-1386`): deltaMode normalised; ctrl / meta zooms exponentially around the cursor between 0.2× and 4×; plain wheel pans.
- **hit testing** is axis-aligned bounds (`:179-187`).
- **drops** (`dropToElements.ts`): note → one sticky (`:48-69`); brief → frame + ≤ 8 stickies in 1–2 columns (`:71-124`); graph → frame + ≤ 28 boxes on a radius that grows with population + ≤ 80 bound arrows, never re-pointed when a node was trimmed (`:126-207`); map-pin → a card with the coordinates or `coordinates unavailable` (`:209-225`).
- **export** (`exportBoard.ts`): visible layers only, frames first, text escaped (`:24-30`, `:238-259`); eraser strokes omitted from vector (`:114-117`); png through a blob url, revoked (`:282-310`).
- **images** (`:318-346`): ≤ 25 mb in, longest edge 1600 px, png kept for alpha formats else jpeg 0.86, placed at ≤ 420×320.

## integrations & network

none. no fetch, no model call, no server. wallpapers are bundled (`src/lib/wallpapers.ts`). `emitPull` writes a local table. the only cross-room edges are the inbox (in memory) and the `aureon:navigate` event. offline changes nothing.

## security & privacy

- **threat: a hostile file**. images are decoded by the browser into a canvas and re-encoded — exif and any payload are discarded (`:320-346`). svg is rasterised the same way. json boards are parsed and shape-checked (`parseBoardJson`, `exportBoard.ts:266-275`); element strings only ever reach `fillText` or escaped svg text (`:24-30`). a crafted `src` on an imported json image element is a string drawn into a canvas; it is also written into an exported svg as an attribute, escaped (`:159`).
- **threat: a hostile drop**. drop text is capped per element (`dropToElements.ts:27-46`), nodes 28, edges 80, bullets 8.
- **at rest**: ciphertext only; the key never leaves indexeddb and is not extractable. a copied localStorage entry is useless without that device's key.
- **bounded work**: 30 history snapshots, 12 inbox drops, 48 chart points, 1600 px images, 8192 px raster, 25 mb file cap.
- **clipboard**: ⌘/ctrl+c copies the selected element's text (`:1327-1332`) — operator action only. paste is read only when the board has focus and no input is active (`:1267-1269`).
- **what the badge does not say**: a board is encrypted at rest but visible to anyone at the unlocked device; this is a device boundary, not a password.

## failure modes

| failure | operator sees | where |
| --- | --- | --- |
| stored boards cannot be decrypted | notice `the stored boards could not be opened on this device — a copy was kept and a fresh board started`; the ciphertext is moved to `…:unreadable:<ts>` | `:432-452` |
| save refused (storage full) | notice `board not saved — this browser's storage is full. remove an image or export the board as json`; clears on the next successful save | `:477-488` |
| save refused (other) | notice `board not saved — the next change will try again` | `:486` |
| image too large / undecodable | notice with the file name and reason; nothing placed | `:321`, `:327`, `:1217-1219` |
| export with nothing on the board | notice `nothing on this board to export yet` | `:801` |
| raster fails | notice `export failed — <reason>`; a `fail` trace | `:818-827` |
| import of a foreign file | notice `that file is not an asherin board export` / `that board file could not be read` | `:836-851` |
| drop carries nothing renderable | skipped silently (no empty card); the notice names the last drop that did land | `dropToElements.ts:227-244`, `:879` |
| finger stroke on a phone | the canvas owns touch (`touch-action: none`), a cancelled pointer ends the stroke cleanly | `:2230`, `:2235` |
| board left mid-stroke | the pointer-leave ends the stroke | `:2236` |

no raw stack reaches the screen; the `ErrorBoundary` in the dashboard is the last net. the one `role="status"` notice (`:2238-2247`) is the room's only transient message and it clears itself after 3.2 s (`:624-627`).

## interface & accessibility

- **desktop (1440×900)**: board select top-left, encrypted badge top-right (`:1836-1872`); toolbar centred at 4 rem, two rows, max 1320 px (`:1890-1926`); layer stack top-right at 15 rem; help line bottom-left; zoom bottom-right. the selected-element inspector sits under the toolbar on the left (`:2093`).
- **phone (390×844)**: the top bar leaves 4 rem on the left for the nav toggle (`pl-16`, `:1836`); the first toolbar row wraps to two lines at 44 px targets (`toolButton` `:1824-1830`); the second row hides behind `more` (`:1914-1926`); the layer stack and the inspector span the width (`left-3 right-3`); zoom controls stay reachable above the safe area. the draft editor is clamped into the pane (`:2250`). the canvas takes touch (`:2230`).
- **affordances**: every icon button has a lowercase `title`; tool buttons carry `aria-pressed` where they are toggles (`:1902-1911`); the board select and layer name input have names (`:1852`, `:2201`); the canvas has a label (`:2231`).
- **feedback**: pending — none needed, every action is local and immediate; success — the notice names exports, imports and drops; error — the notice names the refusal. a stale `board not saved` clears on the next good save.
- **motion**: the laser trail fades after 500 ms (`:1133`); the `more` row shows / hides without animation; nothing else moves.
- **contrast**: chrome type at `muted-foreground/60–70` on `card/75` glass; the canvas is `#08080a` or a blurred, darkened wallpaper (`:1424-1437`).
- **copy**: lowercase throughout; the costume footer `◈ ASHERIN INTELLIGENCE PLATFORM` is gone.

## relationships

| edge | target | real in code? |
| --- | --- | --- |
| reads_from | chat `SendToBoardButton` → `queueBoardDrop` (`ChatView.tsx:90-110`) | yes — but chat then hard-navigates and the queue dies (see shared-file patches) |
| reads_from | knowledge vault `dropToBoard` → `queueBoardDrop` (`KnowledgeVaultView.tsx:218-227`) | yes — the vault stays on its own view, so the drop waits in memory until the board is opened in-app |
| reads_from | zophiel graphs, maps pins | **no** — `BoardDropKind` has the shapes (`boardInbox.ts:36`) but no room queues a `graph` or `map-pin` today |
| writes_to | connect traces (`asherin_connect_pulls`) | yes |
| depends_on | `src/lib/encryption.ts`, `src/lib/wallpapers.ts`, `useAuth` | yes |
| trusts | the device key and the unlocked device | yes |
| verified_by | `boardInbox.test.ts` (inbox contract, drops, export) | yes |

## performance

- mount: one localStorage read, one decrypt (indexeddb key fetch + AES-GCM); drawing starts before it resolves.
- redraw: the whole board is repainted on every state change (`:1409-1817`); grids are drawn per visible cell; images come from an in-memory cache and trigger one repaint when they decode (`:1640-1648`).
- `pushHistory` deep-clones every board on each stroke start (`:517-526`); images at ≤ 1600 px keep that cheap enough; a board with dozens of photos will feel it.
- persistence is debounced 600 ms and encrypts the whole state (`:466-491`).
- timers: the trace burst timer is cleared on unmount (`:619-621`); the notice timer is harmless if it fires late; the resize observer and wheel listener are removed (`:1388-1403`, `:1354-1387`).

## copy & voice

visible copy: `board`, `new board`, `encrypted on this device`, `note`, `marker`, `highlight`, `laser`, `chart`, `export png / svg / json`, `import a board (json)`, `fill`, `none`, `no grid / dot grid / square grid`, `no snap / snap to dots / snap to squares`, `smart shape`, `dark board / current wallpaper / wallpaper library`, `blur`, `close`, `selected`, `image`, `corners`, `bigger / smaller`, `sticky note / text`, `edit words`, `delete`, `layers / topic stack`, `shown / hidden`, `add layer`, `show layers`, `reset view`, `type, then place` / `edit the words`, `place` / `save`, `cancel`, the help line, and the notices listed above. default names `board 1`, `topic 1`, `frame 1`, `sketch series`. no account-era language: boards are "on this device", never "synced". shepherd is not named because shepherd is not used here.

## tests & proof

unit (`npx vitest run src/lib/whiteboard`, 13 tests): the inbox queues, announces and drains once; keeps twelve; `openBoard` dispatches `aureon:navigate` with `whiteboard`; intent detection is explicit; note / brief / graph / map-pin conversions including the never-re-pointed edge rule and lowercase fallbacks; svg export escapes text, skips hidden layers, returns null for an empty board; json round-trip refuses foreign files; `safeFileName`. full run: 826 tests pass.

not proven by unit tests: the canvas itself (pointer handlers, repaint), AES round-trip through real indexeddb, the quota notice. the end-to-end step: draw a stroke → reload → the stroke is back; place a photo → reload → it is back; chat `send to board` → the brief appears on the board without a reload. screenshots pending.

## open gaps

- chat's `send to board` is still broken on chat's side: it queues, then `window.location.assign` reloads the page and the in-memory queue dies (`ChatView.tsx:108-110`). the inbox file now states the contract and exports `openBoard()`; the patch is below.
- no room queues a `graph` or `map-pin` drop yet; the converters are tested but unused.
- a pdf placed on the board is a card, not its pages. asherin.extract reads pdfs; wiring its text into a document card is the honest next step.
- history clones every board per stroke; a per-board history would be lighter.
- the device key fallback (`aureon-whiteboard-device-key`) only applies when `useAuth` yields no identity, which the device edition always provides; it is dead in practice and harmless.
- localStorage's ~5 mb cap bounds how many images a device can keep across all boards; the notice says so when it is hit, but the room cannot show how much is used.

## shared-file patches (not applied — outside the room)

1. `src/components/dashboard/ChatView.tsx:25` — import the in-app opener.
   old: `import { queueBoardDrop } from "@/lib/whiteboard/boardInbox";`
   new: `import { openBoard, queueBoardDrop } from "@/lib/whiteboard/boardInbox";`
2. `src/components/dashboard/ChatView.tsx:107-110` — the reload destroys the queue; switch views in-app.
   old:
   ```
       setSent(true);
       window.setTimeout(() => {
         window.location.assign("/dashboard?view=whiteboard");
       }, 220);
   ```
   new:
   ```
       setSent(true);
       window.setTimeout(() => {
         openBoard();
       }, 220);
   ```
3. `src/components/dashboard/ChatView.tsx:117-121` — lowercase copy.
   old: `      title="Send this answer to the whiteboard"` … `{sent ? "On board" : "Send to board"}`
   new: `      title="put this answer on the whiteboard"` … `{sent ? "on the board" : "send to board"}`
4. `src/lib/navIntents.ts:221-222` — capitalised codename and blurb.
   old: `    codename: "Canvas",\n    blurb: "Infinite canvas with layers, snap grids, and freeform sketching",`
   new: `    codename: "canvas",\n    blurb: "an infinite canvas with layers, snap grids and ink, encrypted on this device",`
5. `src/components/dashboard/connect/ConnectView.tsx:54` — capitalised organ label.
   old: `  { id: "whiteboard", label: "Whiteboard", x: 62, y: 62 },`
   new: `  { id: "whiteboard", label: "whiteboard", x: 62, y: 62 },`

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | save ran as soon as *any* key had loaded; when the storage key changed to the device identity, a 600 ms timer saved the placeholder board under the new key — a decrypt slower than 600 ms lost every stored board | state | cause: one boolean `loadedRef` for all keys | observed `:402`, old save effect | defect | state consolidation | `loadedKey` state gates save and inbox per key (`:360`, `:468`, `:892`) | code; `boardInbox.test.ts` (drain semantics) |
| 2 | a drop could be applied to the placeholder board and then overwritten when the stored boards arrived | state | cause: same | observed | defect | state consolidation | `:891-897` | code |
| 3 | a decrypt failure reset the boards and the next save overwrote the ciphertext — data destroyed by a transient failure | data | failure: loss | observed | defect | local correction | ciphertext moved to `…:unreadable:<ts>`, notice shown (`:432-452`) | code |
| 4 | a refused save (quota) was swallowed; the operator kept drawing into a board that would vanish on reload | behavioral | failure: silent | observed | defect | local correction | quota notice (`:477-488`) | code |
| 5 | images were stored as raw data urls; one phone photo exceeded localStorage and broke every save | execution | cause: unbounded media | observed | defect | local correction | `shrinkImage` ≤ 1600 px, 25 mb cap (`:318-346`) | code |
| 6 | an image that failed to decode hung the import loop forever (no `onerror`) | execution | failure | observed | defect | local correction | `:324-328` | code |
| 7 | images and wallpapers appeared only after the next unrelated repaint | behavioral | cause: `onload` set a cache but triggered no render | observed | defect | local correction | `assetTick` (`:362`, `:1430-1433`, `:1644-1647`) | code |
| 8 | backspace was undo, and shortcuts fired while typing in the layer-name input (deleting a character undid a stroke) | interface | failure: convention + capture | observed | defect | local correction | `:1313-1339` | code |
| 9 | the canvas had no `touch-action`; a finger stroke was cancelled by the browser's scroll gesture on phones | interface | cause | inferred (standard pointer-events behaviour) | defect | local correction | `:2230`, `:2235` | screenshots pending |
| 10 | the draft editor opened at the click point and could sit off-screen on a phone | interface | failure | inferred | defect | local correction | clamp (`:2250`) | screenshots pending |
| 11 | a chart from a csv was flagged `live: true` — the legacy auto-update flag the type says nothing reads | data | failure: wrong claim in data | observed `types.ts:70-75` | defect | local correction | removed (`:1255`) | code |
| 12 | `◈ ASHERIN INTELLIGENCE PLATFORM`, `Encrypted boards`, `Board`, `New`, `Topic stack`, `Full font control`, uppercase tooltips, `Board 1 / Topic 1 / Frame 1`, `Imported onto canvas` | interface | failure: copy | observed | defect | local correction | all lowercased; costume removed | grep |
| 13 | a pdf card said `Imported onto canvas` as if the pdf had been read | semantic | failure: copy ≠ code | observed | defect | local correction | `placed as a card — the pages are not read on the board` (`:1227`) | code |
| 14 | chat's `send to board` reloads the page after queueing; the inbox is in-memory by design, so the drop is lost | interface | cause: `window.location.assign` | observed `ChatView.tsx:108-110` | defect (chat side) | contract repair | contract documented + `openBoard()` (`boardInbox.ts:1-41`, `:91-101`); patch above | `boardInbox.test.ts` |
| 15 | narrative v1 claimed drops arrived from "chat, zophiel or maps" | semantic | — | observed: only chat and the vault call `queueBoardDrop` | wrong claim | — | narrative rewritten | grep |
| 16 | narrative v1 implied boards were "account-synced" (`applyDrops` doc comment) | semantic | — | observed | wrong claim | — | narrative states device-only | — |

## vision confirmation — 2026-10-26

screens: final3-d-whiteboard.png and final3-m-whiteboard.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: toolbar, colours, layer stack and zoom controls render; chat → whiteboard lands on the board without a reload.
- fixed: the bottom hint bar was an uppercase sentence at 10 px and 55 % opacity; it now reads in the same lowercase voice as the rest, at 11 px and 70 %.
