```
room: asherin.snippets   view id: snippets   files: src/components/dashboard/CodeSnippetsView.tsx, src/components/dashboard/snippets/snippetStore.ts
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

line numbers are as of this review. shared files (`Dashboard.tsx`, `navIntents.ts`, `v2Titles.ts`, `src/lib/library/snippets.ts`) are edited by other rooms concurrently; for those the symbol is the anchor and the line is a hint. evidence status per claim: **observed** (read in code), **verified** (unit-tested), **inferred**, **unknown**.

## purpose & promise

asherin.snippets is where saved code lives on this device: snippets with a title, a language label, tags and a body, filed in flat folders or left unfiled; searched across title, tags, language and code; copied to the clipboard or downloaded as a file with the right extension; exported all at once as one markdown file (`snippetStore.ts:54-148`, verified). the artifact runtime also writes here through `saveFilesAsSnippets` (`src/lib/library/snippets.ts:62`), so code shepherd produced elsewhere is found in the same list.

the interface promises exactly this: "saved code, in folders, kept on this device." (`CodeSnippetsView.tsx:537`), the empty list says "code you want to find again, in folders, with a language label. kept on this device." (`:401`), and the detail pane with nothing selected says "folders, a language label and tags make it findable; copy or download it when you need it. nothing leaves this device." (`:522`). nothing calls a server; nothing is shared.

## entry & navigation

- rail: group `make`, label `asherin.snippets`, codename "saved code", blurb "saved code you reuse" (`src/lib/navIntents.ts:226-232`, observed) — already honest and lowercase.
- deep link `/dashboard/snippets`; `"snippets"` is in `VALID_VIEWS` (`src/pages/Dashboard.tsx:170`); rendered by `case "snippets"` inside `ErrorBoundary` + `Suspense` (`Dashboard.tsx:2040-2046`, lazy at `:35`); the room surface carries `data-asherin-room="snippets"` (`:2422`).
- v.2 shell title `asherin.snippets` / "saved code, ready when needed." (`src/lib/dashboard/v2Titles.ts:44`) — honest; no patch.
- in v.2 the room renders no hero; `new snippet` is portalled into the shell slot (`CodeSnippetsView.tsx:532` `<V2Action>`). in the current ui a lowercase header row holds the name line and the same button (`:534-540`).
- what loads first: "reading this device's snippets…" with a spinner (`:283-289`), then `loadAll` reads `code_folders` (by `created_at`) and `code_snippets` for this device identity in parallel and sorts snippets newest-updated first (`:91-107` → `snippetStore.ts:158-168`, verified). a missing identity (never in practice) or a read error shows a `role=alert` panel with `try again` in the list pane (`:92-96, 331-336`).
- the list refreshes itself when the artifact runtime writes a snippet while the room is open: `onSnippetsChange` → debounced 400 ms `refresh` (`:112-115`, `snippetStore.ts:247-250`).

## workflow

happy path:
1. **create a folder** (`:316` → `:319-328` inline form → `:126-140`): name ≤80, enter creates, escape cancels; `createFolder` writes `{user_id, name, parent_id: null}` (`snippetStore.ts:170-176`, verified). the new folder is expanded and becomes the active folder.
2. **create a snippet** (`new snippet` `:277-281` → compose pane `:420-441` → `:183-198`): title (required, ≤160), language from the 21-item list (`snippetStore.ts:15-19`), tags comma-separated, body ≤200 000 chars. `createSnippet` files it in the active folder, normalises the language, parses tags and sets `updated_at` (`:193-215`, verified). the snippet opens and "snippet saved" toasts.
3. **search** (`:313`): one field; with text, the whole store is searched case-insensitively over title, tags, language and content and every folder is shown open with its matches (`filterSnippets`, `snippetStore.ts:102-118`, verified; `:348` `isOpen = expanded || searching`); the count row reads "matches · n" (`:345-346`); no match says `nothing matches "…"` (`:406`). clearing the search (`x`, `:314`) returns to the folder scope.
4. **copy** (`:457` → `:246-257`): `copyText` tries the async clipboard and falls back to a hidden textarea + `execCommand` (`snippetStore.ts:253-276`); success flips the icon to a check for 1.6 s; refusal toasts "the clipboard is not available here — select the code and copy it by hand."
5. **delete** (`:469` → inline confirm `:473-477` → `:231-244`): `deleteSnippet` removes the row and proves it by re-reading (`snippetStore.ts:238-245`, verified); the detail pane returns to the empty state; "snippet removed" toasts.

secondary paths:
- **open a snippet**: any row (`:293-305`); on a phone this navigates to the detail pane (`:291, 308, 419`).
- **edit** (`:467` → `:200-218`): title, language, tags and body in place; check saves through `updateSnippet` (which bumps `updated_at`, verified), `x` cancels; the save button is disabled on an empty title.
- **move to a folder** (`:486-491` select → `:220-229`): `folder_id` update; the target folder expands.
- **tag chips** (`:483-485`): clicking a tag searches it.
- **rename a folder** (`:368` pencil → `:355-363` inline → `:142-150`).
- **delete a folder** (`:369` → inline confirm `:377-381` → `:152-163`): `deleteFolder` first sets `folder_id = null` on its snippets, then removes the folder (`snippetStore.ts:186-191`, verified); toast "folder removed — its snippets are unfiled, not deleted."
- **download one** (`:460` → `:259-262`): `{slug}.{ext}` with the extension of its language (`snippetFileName`, `extensionFor`, verified).
- **export all** (`:317` → `:264-267`): `asherin-snippets-{date}.md`, grouped "unfiled" then each folder, each snippet as `### title`, `tags:` line and a fenced block; a body containing ``` is fenced with ```` (`exportMarkdown`, `snippetStore.ts:130-148`, verified).
- **orphans**: a snippet whose folder no longer exists is shown as unfiled and counted as such (`effectiveFolder`, `:120-122`, verified) — no row is ever invisible.
- **retry**: the list read has `try again` (`:334`).

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| `code_folders` rows | IndexedDB `asherin_local_v1` → `tables`, via the shim | `id, user_id, name (≤80), parent_id (always null now), created_at`; `normalizeFolder` tolerates missing names (`snippetStore.ts:88-94`) | until deleted or "delete my data" (`db.ts:231`) | no |
| `code_snippets` rows | same | `id, user_id, folder_id, title (≤160), language (one of 21, else plaintext), content (≤200 000), tags[] (≤12 × 40, lowercase, unique), created_at, updated_at` (`:35-44, 74-86`); rows the artifact runtime wrote (`src/lib/library/snippets.ts:68-76`) have no `updated_at` and read as `created_at` | until deleted | no |
| react: folders, snippets, loading, loadError, activeFolder, activeId, expanded, search, newFolderOpen/newFolderName, renamingFolder/renameValue, confirmFolder, composing, draft, editing, edit, confirmSnippet, busy, copied | component (`:55-77`) | mount | no |
| refs: `alive`, `copiedTimer` | component (`:79-80`) | mount; timer cleared on unmount | no |
| nothing in localStorage or sessionStorage | — | — | — | — |

derived, never stored: `folderIds`, `visible` (filtered list), `unfiled`, `inFolder(id)` (`:82-88`).

what leaves the device: nothing. there is no outbound call in the room or its store.

## logic

- **tags** (`snippetStore.ts:54-63`): split on commas and newlines (or take an array), trim, lowercase, cap each at 40 chars, dedupe, cap at 12 (verified).
- **language** (`:65-72`): lowercase and whitelist, else `plaintext`; extension table for downloads (`:23-27`), `txt` fallback (verified).
- **filter** (`:102-118`): a non-empty query searches everything (title, language, tags, content); otherwise `folderId === null` shows all and a folder shows the snippets whose *effective* folder is that id (verified).
- **effective folder** (`:120-122`): the stored folder if it still exists, else none.
- **ordering** (`:158-168`): snippets by `updated_at` descending (`created_at` substitutes when the row predates the column), folders by `created_at`.
- **export** (`:130-148`): groups, fence escalation, date in the header (verified).
- **filenames** (`:124-128`): slug of the title, 60 chars, "snippet" fallback.
- **clipboard** (`:253-276`): async api first, legacy `execCommand("copy")` second, `false` if both refuse.

## integrations & network

none. every call is `supabase.from(...)` against the on-device shim (`src/integrations/supabase/client.ts` → `src/lib/local/client.ts:119`). `supabase.functions.invoke` is not referenced (grep), so "kernel offline" cannot appear. no model call: this room never spends tokens and is not in `UsageSettings.AI_TOOLS` (`settings/UsageSettings.tsx:27-37`), correctly.

## security & privacy

- **code is never executed or rendered as html**: bodies render inside `<pre><code>` as text nodes (`:508`); the compose and edit textareas are plain inputs. no `dangerouslySetInnerHTML`.
- **clipboard**: writes only, on an explicit press, of the operator's own snippet (`:246-257`). the fallback textarea is removed from the document immediately (`snippetStore.ts:262-270`).
- **downloads**: blob urls revoked after one second (`:29-37`).
- **hostile stored row** (e.g. an artifact file saved with a strange language or tags): normalised on read (`normalizeSnippet`, `:74-86`); sizes are clipped on write (`LIMITS`, `:21`).
- **at rest**: plain text in IndexedDB, like every room except the vault; a snippet that holds a secret is as exposed as any other local file. stated in open gaps.
- **identity**: rows are scoped by `user_id = useAuth().user.id` on read (`:159-160`); the shim also fills `user_id` on insert.

## failure modes

| failure | what the operator sees |
| --- | --- |
| no device identity | list: "this device has no identity yet — open chat once and come back." + try again (`:92-96, 331-336`) |
| a table read fails | the shim's message, lowercased, `role=alert`, try again (`:99, 331-336`) |
| folder create / rename / delete fails | destructive toast with the message (`:132, 145, 156`) |
| empty folder name | create disabled (`:323`); store refuses with "give the folder a name." (`snippetStore.ts:172`) |
| snippet create / save / move / delete fails | destructive toast (`:188, 211, 224, 235`) |
| empty title | save disabled (`:437, 463`); store refuses with "give the snippet a title." (`:195, 221`) |
| clipboard refused (insecure context, permission) | toast "the clipboard is not available here — select the code and copy it by hand." (`:250`) |
| delete "succeeds" but the row is still there | "that snippet is still here — try again." (`snippetStore.ts:243`) |
| snippet edited after it was deleted elsewhere | "that snippet is no longer here." (`:235`) |
| search with no hit | `nothing matches "…"` (`:406`) |
| empty snippet body | "this snippet is empty. edit it to add code." (`:510`) |
| rows without `updated_at` | shown with `created_at` instead of "Invalid Date" (`snippetStore.ts:84`; verified) |

no spinner outlives its await: `loading` is set once after the first read (`:106`); `alive` guards state writes after awaits (`:99, 248`); `copied` is reset by a timer that is cleared on unmount (`:120, 254-256`).

## interface & accessibility

- **desktop (1440)**: two panes — a 288 px list (`md:w-72`, `:308`) with search, new-folder and export controls on top (`:309-318`), then "all snippets", the folders with their snippets nested, then "unfiled" (`:337-410`); the detail pane shows one snippet with its actions in the header, the tag/folder row, the code, and a footer with dates and size (`:442-517`). compose uses a centred `max-w-2xl` form (`:421-441`). one focal point: the open snippet's code.
- **phone (390)**: list → detail. with nothing open and no compose form, the list is full width and the detail is hidden (`:308, 419`, `hidden md:flex`); opening a snippet or `new snippet` hides the list and shows a `back to the list` chevron (`:414-416`, `md:hidden`). header actions wrap (`flex-wrap`, `:444`); the compose and edit panes scroll (`overflow-y-auto`, `:421, 495`) so the save button is never clipped; the edit textarea is `min-h-[14rem] flex-1 resize-y` rather than `calc(100vh-320px)` (`:506`). inferred from classes; screenshots pending.
- **focus order**: new snippet → search → new folder → export → all snippets → each folder (toggle, rename, delete) and its rows → unfiled rows → back (phone) → copy, download, edit/save/cancel, delete → tags → folder select. every icon button has an `aria-label` (`:314, 316-317, 357-358, 368-369, 415, 457-469`); folder toggles carry `aria-expanded`; rows `aria-current`; confirms are `role=alertdialog`.
- **keyboard**: enter creates a folder / saves a rename; escape cancels either (`:321, 357`). the compose form's save is a button (textareas need their newlines).
- **colour**: red only on delete confirms and destructive hovers; accent on the language pill, the selected row and the copied check.
- **motion**: the loading spinner only; the copied check swaps icons without animation.
- **type**: 12 px lists, 11–12 px mono code with `leading-relaxed`, 10 px labels; code wraps (`whitespace-pre-wrap`) and scrolls horizontally when it must (`:508`).
- **copy**: lowercase throughout except "asherin.snippets" and language names as written in the list.
- **empty states**: no snippets (`:398-404`), nothing matches (`:406`), empty active folder (`:383-385`), nothing selected (`:519-525`), empty body (`:510`), no tags (`:482`).

## relationships

| edge | to | real in code? |
| --- | --- | --- |
| reads_from / writes_to | `code_folders`, `code_snippets` through the shim | yes (`snippetStore.ts:158-245`) |
| reads_from (incoming) | the artifact runtime's `saveFilesAsSnippets` writes `code_snippets` with tag `artifact` (`src/lib/library/snippets.ts:62-81`) | yes; the room refreshes via `onSnippetsChange` (`:112`) |
| calls | nothing — no model, no function, no network | — |
| trusts | the device identity from `useAuth` | yes |
| owns_state | its two tables | — |
| verified_by | `snippets/__tests__/snippetStore.test.ts` | yes (6 tests) |
| no longer | nested folders via `parent_id` (never drawn; see review log #6) | removed |

## performance

- mount: two table reads in parallel; filtering is `useMemo` over the loaded arrays (`:82-88`), fine for thousands of snippets; content search is a substring scan per keystroke over every body — acceptable to the low thousands, noted as open gap 3.
- timers: one 400 ms refresh debounce, one 1.6 s copied reset, one 1 s `revokeObjectURL`; all cleared on unmount (`:116-121`).
- no intervals, workers, media or virtualisation.

## copy & voice

every visible string is lowercase except "asherin.snippets". no "Create First Snippet", "All Snippets", "New Snippet", "Save Snippet", "Code Snippets", "Organize your code into folders…", "// Empty snippet", "Snippet saved" (now "snippet saved"), "Created/Updated". no "sign in" — but the shared helper `src/lib/library/snippets.ts:65` still says "sign in to save code"; patch below. no model name appears: shepherd is not involved here.

## tests & proof

- `src/components/dashboard/snippets/__tests__/snippetStore.test.ts` — 6 tests against the real on-device shim (fake-indexeddb): tag parsing (trim, lowercase, dedupe, cap), language whitelist and extensions, filename slug, filter (content/language/tag search, folder scope, orphan shown as unfiled), export grouping and fence escalation; and the device workflow: folder create (refuses blank), snippet create in a folder (language normalised, tags parsed, `updated_at` valid), update (tags re-parsed, `updated_at` advances), folder rename, folder delete unfiles the snippet, snippet delete proven gone; ordering newest-updated first with a row written without `updated_at` reading as its `created_at`.
- `npx vitest run src/components/dashboard/snippets`: 6 passed. full suite: 670 passed, 1 failed in `google/__tests__/offline.test.ts` (another room, edited concurrently; not touched here).
- `npx tsc --noEmit -p tsconfig.app.json`: no errors in the room's files. `npx eslint` on the room files and tests: exit 0.
- end-to-end step (create folder → create snippet → search → copy → delete): the store half is driven by the unit test; the clipboard half needs a browser. screenshots: pending.

## open gaps

1. **plain text at rest.** a snippet holding a credential is as readable as any IndexedDB row on the device. a "seal this snippet" option through the vault's `encryptText` would be the next step.
2. **no syntax highlighting.** the language is a label and an extension, not a tokenizer; monaco is in the deps (`@monaco-editor/react`) but loading it for a read-only view is a weight decision outside this review.
3. **content search is linear** over every body on every keystroke; fine today, a debounce or index if the store grows large.
4. **flat folders.** rows from the hosted build with a `parent_id` are shown flat; nothing nests.
5. **import** (the reverse of export) does not exist; the artifact runtime is the only other writer.
6. **no screenshots this round.**

## proposed patches to shared files (not applied)

1. `src/lib/library/snippets.ts:65` (account-era copy; `useAuth` always has an identity so the branch is practically dead, but the sentence is wrong on a device):
```ts
// old
  if (!user) return { saved: 0, error: "sign in to save code" };
// new
  if (!user) return { saved: 0, error: "this device has no identity yet — open chat once and come back." };
```
2. `src/pages/Dashboard.tsx:2040-2046` — none needed: the case renders the view directly without a title string.
3. `src/lib/navIntents.ts:226-232`, `src/lib/dashboard/v2Titles.ts:44` — none needed: already lowercase and honest.

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | fixed `w-72 flex-shrink-0` sidebar plus a flex detail pane: at 390 px the code pane was a sliver | interface | failure | old `CodeSnippetsView.tsx:155, 242` | defect | structural | list → detail below `md` with a back button (`:308, 414-419`) | class read; screenshot pending |
| 2 | `updated_at` never written on insert; the shim only maintains it when the key exists; footer showed "Updated Invalid Date" for every new snippet | data | cause | old `:87-98, 324`; `postgrest.ts:474-487` | defect | local correction | `createSnippet`/`updateSnippet` set it; `normalizeSnippet` falls back to `created_at` (`snippetStore.ts:84, 205, 221`) | test "tolerates rows written without updated_at" |
| 3 | deleting a folder nulled `folder_id` only in react state; after reload the snippets kept a dead `folder_id`, matched no folder and no "unfiled" filter — invisible | data, state | cause | old `:77-82`, no cascade in `postgrest.ts:498` | defect | boundary repair | `deleteFolder` unfiles its snippets in the store first (`snippetStore.ts:186-191`); `effectiveFolder` treats a missing folder as unfiled (`:120`) | tests "unfile on folder delete", "never hides an orphan" |
| 4 | every store call ignored `error`: a failed insert silently closed the form; a failed delete removed the row from the screen only | behavioral | failure | old `:65-124` | defect | contract repair | `{data, error}` from every store function, shown per action (`:126-244`) | tsc; store tests exercise refusals |
| 5 | `loading` stayed `true` forever when `user` was null; no error state for a failed read | behavioral | failure | old `:51-63, 150` | defect | local correction | identity guard + `role=alert` with try again (`:91-107, 331-336`) | tsc |
| 6 | new folders were created with `parent_id: activeFolder` but only `parent_id === null` folders were drawn: a folder created inside a folder vanished, with its snippets | data, interface | cause | old `:69, 196` | defect | requirement reconciliation | folders are flat (`parent_id: null`, `snippetStore.ts:173`) and every folder is drawn (`:347`) | tsc; test creates folders |
| 7 | folder delete button `opacity-0 group-hover:opacity-100` — unreachable on touch; folder and snippet deletes fired on one click with no confirm | interface | failure | old `:208, 278` | defect | local correction | always-visible labelled buttons, inline confirms (`:368-381, 469-477`) | tsc |
| 8 | `navigator.clipboard.writeText` un-awaited, no catch: a refused clipboard still flashed the check | behavioral | failure | old `:126-131` | defect | local correction | `copyText` with fallback and an honest toast (`snippetStore.ts:253-276`, `:246-257`) | tsc |
| 9 | search covered title and tags only | requirements | failure | old `:141-145` | defect | local correction | title, tags, language, content (`snippetStore.ts:102-118`) | filter test |
| 10 | "All Snippets" count ignored the search while folder counts respected it | interface | failure | old `:192, 206` | defect | local correction | "matches · n" while searching (`:345-346`) | tsc |
| 11 | compose form in an `overflow-hidden` pane with `rows={16}`: on a phone the save button was below the fold and unreachable | interface | failure | old `:242-258` | defect | structural | compose pane scrolls (`:421`) | class read |
| 12 | edit textarea `h-[calc(100vh-320px)]` broke inside the shell's own scroll container | interface | failure | old `:312` | defect | local correction | `min-h-[14rem] flex-1 resize-y` in a scrolling pane (`:495-506`) | class read |
| 13 | no export, no download, no rename, no move between folders | requirements | failure | — | defect | local correction | export all (`:264-267`), download one (`:259-262`), rename folder (`:142-150`), move (`:220-229`) | export/filename tests |
| 14 | title-case copy throughout ("All Snippets", "New Snippet", "Save Snippet", "Create First Snippet", "Code Snippets", "Search snippets…", "Snippet saved", "// Empty snippet", "Created … Updated …") | interface, copy | failure | old file | defect | local correction | all room copy lowercase | grep of the file |
| 15 | room drew its own `h2 asherin.snippets` under the v.2 shell title — the name twice | interface | failure | old `:158` | defect | local correction | `useIsV2` hides the header and portals the action (`:532-540`) | tsc |
| 16 | snippets written by the artifact runtime while the room was open never appeared until a reload | state | failure | `src/lib/library/snippets.ts:78`, no listener | defect | local correction | `onSnippetsChange` listener (`:112-115`) | tsc |
| 17 | `tags` arrays from other writers were trusted as-is (`s.tags.some` would throw on a non-array) | data | failure | old `:142, 285` | defect | local correction | `normalizeSnippet` parses tags on read (`snippetStore.ts:81`) | tsc |
| 18 | first draft of this narrative said the v2 subtitle was hosted-era; "saved code, ready when needed." is accurate | — | — | `v2Titles.ts:44` | wrong claim | narrative corrected | — | file read |
| 19 | first draft said the shim set `updated_at` on every update; it does so only when the row already has the key | — | — | `postgrest.ts:482` | wrong claim | narrative corrected; code sets it explicitly | shim read, test |
| 20 | screenshots at 1440×900 and 390×844 | verification | — | — | — | — | not taken: browsers owned by another process | pending |

## vision confirmation — 2026-10-26

screens: final3-d-snippets.png and final3-m-snippets.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: folders, search and the empty state render. defect seen and fixed: "new snippet" was green.
- fixed: tonal button.
