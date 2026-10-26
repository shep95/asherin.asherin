```
room: asherin.bugs   view id: bug-reports   files: src/components/dashboard/BugReportsView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

files this narrative covers (exclusively imported by this room, confirmed with `grep -rln`):

- `src/components/dashboard/BugReportsView.tsx` — the room
- `src/lib/bugs/bugLog.ts` — shapes, filters, digest, exports, store readers and writers
- `src/lib/bugs/bugLog.test.ts` — unit tests

shared modules it reads but does not own: `src/lib/ai.ts` (`askModel`), `src/lib/local/db.ts` (`onTableChange`), `src/lib/local/postgrest.ts` (query shim), `src/contexts/AuthContext.tsx` (device identity), `src/components/dashboard/v2/V2PageShell.tsx` (`V2Action`), `src/pages/Dashboard.tsx` (wiring), `src/lib/navIntents.ts`, `src/lib/dashboard/v2Titles.ts`.

## purpose & promise

asherin.bugs is where the operator writes down what broke and what they want. the hosted-era copy promised "Submit reports privately — only the admin team can see them" and toasted "this has been sent privately to the team": on a device there is no team and nothing is sent, so that promise could never be kept [observed in the previous `BugReportsView.tsx:185, 92`]. the room now promises exactly what it does: "what broke and what you want, logged on this device. nobody receives it unless you send the export." (`BugReportsView.tsx:195-198`) [observed].

three things are true of it: entries are rows in this browser's store (`bugLog.ts:219-241`); shepherd — the model the operator connected — can summarise the log from this browser, and only titles plus clipped descriptions are sent to it (`bugLog.ts:109-118`, `BugReportsView.tsx:154-155`); and an export as markdown or json is the only way the log reaches anyone (`bugLog.ts:141-192`) [observed].

## entry & navigation

- sidebar group "account", nav intent `view: "bug-reports"`, label "asherin.bugs", codename "your reports", blurb "what you reported, and its state" (`src/lib/navIntents.ts:316-322`) — "reported" implies a recipient; patch proposed below [observed].
- v.1 sidebar icon `"bug-reports": ClipboardList` (`DashboardSidebar.tsx:146`); not in the v.2 keep-stack (`DashboardSidebarV2.tsx:V2_ORDER`), so in v.2 it is reached from the palette or a deep link [observed].
- wired at `Dashboard.tsx:2061-2067` directly (not through `gatedView`), so there is no retired-room copy and `canAccess` is not consulted [observed]. deep link `/dashboard/bug-reports`; `"bug-reports"` is in `VALID_VIEWS` (`Dashboard.tsx:189`) [observed].
- v.2 title: "bugs / what you reported, and its state." (`v2Titles.ts:47`) — same "reported" wording; patch proposed below. in v.2 the room draws no heading and portals its two export buttons into the shell slot (`BugReportsView.tsx:190-192`); in v.1 it draws "asherin.bugs" + the promise + the buttons (`:193-201`) [observed].
- what loads first: a three-row skeleton (`:204-208`) while `readReports` and `readSummaries` run in parallel (`:84`) [observed].

## workflow

happy path — log something:
1. "new entry" disclosure (`:224-236`) opens the compose form. the row's right side states the live count: "the log is empty" or "n bugs · n requests" (`:234`) [observed].
2. pick a kind — bug or request (`role="radiogroup"`, `:239-258`); title (max 140, `TITLE_MAX`) and description (max 4000, `DESCRIPTION_MAX`) (`:260-281`); for a bug, a severity — low / medium / high / critical (`:283-302`). a request is stored with severity "low" and never shows a severity chip (`bugLog.ts:233`, `BugReportsView.tsx:360-362`) [observed].
3. "add to the log" is disabled until title and description are non-blank (`canSave`, `:107`) → `addReport` trims, clips, inserts with an explicit `status: "open"` and both timestamps (`bugLog.ts:219-241`) → the form clears and closes (`:115-118`); the list refreshes through the `bug_reports` change listener (`:98`) [observed].

secondary paths:
- filter by kind and by status (`:330-338`), client-side (`filterReports`, `bugLog.ts:94-96`) [observed].
- change status per entry: open / in progress / resolved / dismissed via a labelled `<select>` (`:366-368`); optimistic in react, written with `setReportStatus`, reverted by a reload on failure (`:127-136`) [observed].
- remove an entry: two steps — the trash icon asks "remove this entry?" with "remove" / "keep" of equal weight (`:371-381`); `removeReport` deletes the row (`bugLog.ts:248-251`) [observed].
- summarise: "summarize the log" (`:398-401`) → `digestFor(reports)` (newest 60, descriptions clipped at 400) → `summaryPrompt` → `askModel(..., { maxTokens: 600 })` → `addSummary` writes the text with the ids it read and the bug/request counts (`:148-164`, `bugLog.ts:253-270`); the new summary opens expanded (`:159`) [observed].
- export: "export .md" / "export .json" (`:174-185`) build `toMarkdown` / `toExportBundle` and hand the browser a blob download named `asherin-bugs-<yyyy-mm-dd>.<ext>` (`bugLog.ts:175-192`); disabled while loading or when the log is empty [observed].
- refresh: none needed — the room subscribes to both of its tables (`:98-99`) [observed].

## state & data

| state | lives in | shape | lifetime | leaves device |
| --- | --- | --- | --- | --- |
| `reports` | react, from `readReports` | `BugReport[]` (`bugLog.ts:34-44`), normalised on read | mount; reloaded on `bug_reports` change | only inside an export the operator saves, or as the digest inside the summary request |
| `summaries` | react, from `readSummaries` | `BugSummary[]` (`:46-53`) | mount; reloaded on `bug_report_summaries` change | only inside an export |
| compose fields | react (`type`, `title`, `description`, `severity`) | strings / enums | until saved or the view unmounts; not persisted as a draft | no |
| `filter` | react | `{ type, status }` (`:55-58`) | mount | no |
| `confirmRemove` | react | entry id or null | until remove / keep | no |
| `loading`, `loadError`, `saving`, `saveError`, `rowError`, `summarizing`, `summaryError`, `expandedSummary`, `composing` | react | booleans / strings | mount | no |
| `bug_reports` rows | indexeddb table via the shim | `{ user_id, type, title, description, severity, status, created_at, updated_at }` + shim `id` | until removed or wiped | export only |
| `bug_report_summaries` rows | indexeddb table | `{ user_id, summary, report_ids[], bug_count, feature_count }` + shim `id`, `created_at` | until wiped (no remove path — open gap) | export only |

hosted-era rows: the old form inserted no `status` (the server default filled it). `normalizeReport` reads a missing or unknown status as "open", an unknown severity as "medium", an unknown type as "bug", and a missing `updated_at` as `created_at` (`bugLog.ts:69-81`) [verified by test]. nothing is written and never read: both tables are read back into the view [observed].

## logic

- `normalizeReport` / `normalizeSummary` (`bugLog.ts:69-91`): defensive shaping so a row from any era renders [verified].
- `filterReports` (`:94-96`), `countByType` (`:98-107`) [verified].
- `digestFor` (`:109-118`): one line per entry, newest first, `[kind · severity · status] title: description` with severity only for bugs, description clipped at 400 chars with an ellipsis, at most 60 entries [verified].
- `summaryPrompt` (`:120-128`): tells the model the writer is the only reader, asks for themes, most severe open bug first, requests after, a closing line on resolved/dismissed, lowercase, under 200 words, no headings [observed].
- `toMarkdown` (`:141-162`): header with export time (utc), device prefix (8 chars, never the full id), counts; one `##` per entry with kind/severity/status/logged time; a `## shepherd summaries` section only when there are summaries; "_no entries._" when the log is empty [verified].
- `toExportBundle` (`:164-173`): `{ format: "asherin-bugs-export", version: 1, exported_at, device, reports, summaries }` — the full device id travels in the json (it is a locally minted uuid, not a person; see security) [verified].
- `exportFilename` (`:175-178`): local date [verified].
- `downloadText` (`:181-192`): blob url → anchor click → revoke after 1 s; a no-op where `document` or `URL.createObjectURL` is absent [observed].
- `addReport` (`:219-241`): trim, clip, refuse blank title/description with a plain message, write `status: "open"`, `created_at`, `updated_at`, severity "low" for a request [verified].
- `setReportStatus` (`:243-246`) stamps `updated_at`; `removeReport` (`:248-251`); `addSummary` (`:253-270`) records `report_ids` so a summary stays tied to what it read [verified].

## integrations & network

exactly one outbound call, and only on the operator's press:

| call | where | what leaves | timeout / abort | retry | offline | key |
| --- | --- | --- | --- | --- | --- | --- |
| `askModel(summaryPrompt(digest), { maxTokens: 600 })` → the provider the operator connected, called from this browser (`src/lib/ai.ts:332-346` → `completeLlm`) | `BugReportsView.tsx:154-155` | the digest: up to 60 lines of `[kind · severity · status] title: description≤400` — nothing else from the device | none set here beyond the provider client's own; a thrown error is shown inline | none; the button is live again after the error | the provider call fails and the message is shown inline ("shepherd did not answer: …") | the provider key from the device key vault, resolved by `resolveActiveModel` (`ai.ts:59-96`); this room never touches the key |

no key → `resolveActiveModel` raises the byok dialog and throws "connect a model key in settings → ai keys…" (`ai.ts:71`), which the room shows inline (`:160-161, 404-406`) [observed]. no `supabase.functions.invoke`, no `fetch`, no channel in this room [observed; grep].

## security & privacy

threat model: whoever can read this browser profile; the model provider; whoever receives an export.

- what the model sees: `digestFor` output only — titles and clipped descriptions the operator typed. no device id, no trail, no other table (`bugLog.ts:109-118`) [observed]. the operator is told so on screen: "only the titles and clipped descriptions are sent to it." (`:395`) [observed].
- what the export carries: every entry and summary in full, the device uuid (json) or its 8-char prefix (markdown), the export time. the operator chooses to send it; the room never does [observed]. the device id is a random uuid minted locally (`auth.ts:54-61`), not an identity, but it is stable per device — mentioned in open gaps.
- injection: titles, descriptions and the model's summary render as react text nodes (`whitespace-pre-wrap`, `:364, 435`); no markdown renderer, no `innerHTML`. a hostile model answer becomes visible text and nothing else [observed].
- bounds: title ≤ 140, description ≤ 4000, enforced both in the input (`maxLength`) and at write (`slice`) [observed]; digest ≤ 60 × ~500 chars, so the prompt is bounded regardless of log size [observed].
- the "admin" split is gone: `isOwnerEmail(user.email)` against `<8 hex>@this.device` (`auth.ts:95`) could never be true, so the former admin tabs were unreachable dead code and the "my reports" tab was the only live one; there is now one reader, the operator [observed].
- destructive action: remove is two-step with equal-weight "remove" / "keep" (`:371-379`); no dark pattern [observed].

## failure modes

| failure | what the operator sees | where |
| --- | --- | --- |
| store read fails | "the log did not load." + message + "try again" | `BugReportsView.tsx:210-218` |
| no user | skeleton resolves; nothing else renders (cannot happen on a device, `useAuth` always returns one) | `:80-83` |
| blank title / description | the button is disabled; if forced, `addReport` throws "a title is needed." / "a description is needed." shown inline | `:107`, `bugLog.ts:224-225`, `:305-307` |
| insert fails | "the entry was not saved: <message>" inline; the form keeps its text | `:119-122, 305-307` |
| status write fails | "that change did not save: <message>"; the list reloads to the stored truth | `:127-136, 342-344` |
| remove fails | same inline line | `:138-146` |
| empty log, summarise pressed | the button is disabled; the summary card says "add an entry first; a summary needs something to read." | `:398, 410` |
| no model key | byok dialog + inline "shepherd did not answer: connect a model key in settings → ai keys…" | `ai.ts:71`, `:404-406` |
| model returns empty | "shepherd did not answer: shepherd returned an empty answer." | `:156` |
| model/network error | "shepherd did not answer: <provider message>" | `:160-161` |
| export with empty log | buttons disabled | `:176, 180` |
| filter matches nothing | "no entry matches that filter." | `:348` |

no toast carries an error any more (toasts show one at a time and vanish, `src/hooks/use-toast.ts`); every failure is inline, next to the control that caused it, in a `role="alert"` [observed].

## interface & accessibility

- layout: one column, `max-w-3xl`, `p-4` on phone, `p-6` from `sm:` (`:188`). three cards: compose, the log, shepherd's summary. the v.1 header stacks title above the two export buttons on phone and goes side-by-side from `sm:` (`:193`) [observed]. the kind toggle is two buttons (`flex gap-2`, `:239`); severity wraps (`flex-wrap`, `:286`); filter selects sit on their own row and wrap (`:328`); entry footers wrap (`:365`) — nothing is fixed-width, so 390px holds [inferred from classes; screenshot pending].
- one focal point: "new entry" is the first interactive row and the only emphasised button is "add to the log" (`:311-318`); the exports are quiet [observed].
- grouping: each entry is one bordered `<li>` with its own status control and remove control; each summary is one disclosure `<li>` with `aria-expanded` (`:421-428`) [observed].
- colour carries meaning only on the severity chip (red/orange/amber/muted, `SEVERITY_CLASS`, `:22-27`) and the chip also carries the word, so colour is never the only channel [observed]; status is a word in a `<select>` plus an icon (`:33-38`), never colour alone [observed].
- motion: the plus rotates 45° when compose is open (`:231`); the chevron rotates on expand (`:427`); the spinner runs only while saving or asking shepherd; nothing decorates [observed].
- keyboard: every control is a native `button`, `input`, `textarea` or `select` with `focus-visible` rings; radiogroups carry `role="radio"` + `aria-checked` (`:239-258, 286-302`); per-row selects and remove buttons have `aria-label`s that name the entry (`:366, 378`) [observed].
- copy lowercase except "asherin.bugs"; "shepherd" for the model [observed].

## relationships

| edge | target | real in code |
| --- | --- | --- |
| owns_state | `bug_reports`, `bug_report_summaries` | yes — only this room reads or writes them (`grep -rn bug_report src` → this room and its lib) |
| calls | `askModel` → the connected provider | yes — `:154-155` |
| trusts | the key vault via `resolveActiveModel` to hold the key; the shim to scope by `user_id` | yes |
| depends_on | `onTableChange` for live reload | yes — `:98-99` |
| hands_to | the operator, as a file (`downloadText`) | yes |
| verified_by | `src/lib/bugs/bugLog.test.ts` (10 tests) | yes |
| contradicted edge removed | "the admin team" / a server inbox | no such edge exists on a device |

## performance

- mount: two reads from the cached table store; linear normalise. `filterReports` and `countByType` are memoised (`:105-106`) [observed].
- live reload: one reload per write to either table; writes here are operator-paced [observed].
- the summary request is bounded to 60 lines × ≤ ~500 chars and `maxTokens: 600` [observed].
- `downloadText` revokes the blob url after 1 s (`bugLog.ts:191`) [observed]. no timers otherwise, no intervals, no workers; both listeners are removed on unmount (`:100-103`) [observed].

## copy & voice

- rewritten lowercase, device-era: "asherin.bugs", "what broke and what you want, logged on this device. nobody receives it unless you send the export.", "new entry", "bug" / "request", "add to the log", "kept in this browser's store. nothing is sent.", "the log", "bugs and requests", "any status", "shepherd's summary", "summarize the log", "asking shepherd", "export .md" / "export .json" [observed].
- gone: "Bug Reports & Feature Requests", "Submit reports privately — only the admin team can see them.", "Review all submissions — generate AI summaries for action.", "Thank you — this has been sent privately to the team.", "Generate AI Summary", "AI Summaries", "All Reports", "My Reports", "Failed to submit" [verified: grep for each → none].
- "feature" survives only as the stored `type` value, for compatibility with existing rows; on screen it is "request" (`TYPE_LABEL`, `bugLog.ts:19`) [observed].
- shared-file residuals: nav codename "your reports" / blurb "what you reported, and its state" (`navIntents.ts:318-319`); v.2 subtitle "what you reported, and its state." (`v2Titles.ts:47`). patches below.

## tests & proof

- `src/lib/bugs/bugLog.test.ts` — 10 tests: hosted-era row normalisation (the `status.replace` crash class), filters and counts, digest clipping/capping/severity rule and prompt framing, markdown export contents (device prefix, counts, summaries section, never the full id), empty export, json bundle + filename, and through the shim with fake-indexeddb: add with explicit open status and newest-first read, refusal of blank fields, status change with `updated_at` stamp, summary tied to ids, removal, and a legacy row without status. all pass.
- `npx tsc --noEmit -p tsconfig.app.json`: no errors in this room's files.
- `npx eslint` on the three touched files: clean.
- screenshots at 1440×900 and 390×844: not taken this pass.

## open gaps (said plainly)

- summaries cannot be removed from the room (there is no delete for `bug_report_summaries`); a wipe in settings removes them with everything else.
- the json export carries the full device uuid; the markdown carries 8 characters. the uuid is random and local, but it is stable, so two exports from one device are linkable. if that matters to an operator, the markdown is the one to send.
- the summary request has no abort control of its own; a slow provider is waited on until the client's own timeout.
- compose text is react state only: closing the view loses an unsaved draft.
- screenshots pending.

## shared-file patches (not applied here)

1. `src/lib/navIntents.ts:318-319`
   - old: `    codename: "your reports",` / `    blurb: "what you reported, and its state",`
   - new: `    codename: "your log",` / `    blurb: "what broke and what you want, logged on this device",`
2. `src/lib/dashboard/v2Titles.ts:47`
   - old: `  "bug-reports": { title: "bugs", subtitle: "what you reported, and its state." },`
   - new: `  "bug-reports": { title: "asherin.bugs", subtitle: "what broke and what you want, logged on this device." },`

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | the room promised delivery it could not make: "Submit reports privately — only the admin team can see them." and the toast "this has been sent privately to the team." — on a device the insert lands in this browser's store and nobody reads it | requirements | cause | observed (`client.ts` has no network; `grep bug_reports` → no other reader) | defect | requirement reconciliation | room rebuilt as a local log with shepherd summary and export (`BugReportsView.tsx`, `bugLog.ts`) | tsc, eslint, 10 tests |
| 2 | the view forked on `isOwnerEmail(user.email)`; the device identity is `<8hex>@this.device` (`auth.ts:95`) so the admin branch (all reports, filters, status control, summaries) was unreachable dead code and the only live tab could not change a status or summarise | structural | cause | observed | defect | component replacement | one reader; status, filters, summary and export available to the operator | code read |
| 3 | the insert wrote no `status`; the "my reports" tab did `r.status.replace("_", " ")` → `TypeError` on every row ever filed, caught only by the error boundary (a blank room) | data / behavioral | cause | observed (shim applies no default for `bug_reports`, `postgrest.ts:71-82`) | defect | contract repair | explicit `status: "open"` at write (`bugLog.ts:234`); `normalizeReport` on read (`:69-81`) | unit test "normalises a hosted-era row…", "reads a hosted-era row with no status" |
| 4 | `useEffect(() => { if (!user) return; loadData(); }, [user])` with `loading` initial true: no user → spinner forever; also `loadData` not in deps (lint) | behavioral | failure | observed | defect | local correction | `load` is a `useCallback`, sets `loading` false on every path (`:79-96`) | eslint clean |
| 5 | errors from the shim were discarded on read (`const { data } = …`) and shown as destructive toasts on write; a failed read rendered as an empty log | failure modes | failure | observed | defect | contract repair | thrown errors from every store function (`bugLog.ts:195-198`); inline `role="alert"` lines (`:210-218, 305, 342, 404`) | code read |
| 6 | the room read once at mount; a write from the compose form called `loadData()` by hand and a summary did too — two code paths for one truth | state | failure | observed | defect | state consolidation | `onTableChange` on both tables (`:98-99`); writers do not reload by hand | code read |
| 7 | delete did not exist for the operator (admin-only paths had none either); the old `community`-style one-tap delete pattern elsewhere is irreversible | interface | failure | observed | defect | local correction | two-step remove with equal-weight "remove" / "keep" (`:371-381`) | code read |
| 8 | no export: a log nobody receives and nobody can send is a dead end | requirements | failure | observed | defect | contract repair | markdown and json exports (`bugLog.ts:141-192`, `:166-185`) | unit tests on both formats |
| 9 | the summary prompt said "for the person who filed them" but was wired to an admin reviewing other people's reports; the result was stored with `user_id: user?.id` (possibly undefined) | semantic | failure | observed | defect | local correction | `summaryPrompt` names the writer as the only reader (`bugLog.ts:120-128`); `addSummary(userId, …)` (`:253`) | unit test "the digest…" |
| 10 | `prose prose-invert` classes on the summary with no typography plugin loaded (dead classes); `whitespace-pre-wrap` did the work | interface | failure | observed | defect | local correction | plain `whitespace-pre-wrap` paragraph (`:435`) | code read |
| 11 | title-case copy throughout: "Bug Reports & Feature Requests", "Bug Report", "Feature Request", "Title", "Description", "Severity", "Generate AI Summary", "All Types", "All Time", "All Status", "No reports submitted yet." | copy & voice | failure | observed | defect | local correction | all lowercase, "request" for feature, "shepherd" for the model | grep |
| 12 | the date filter ("Today / This Week / This Month") lived only in the unreachable admin branch | interface | failure | observed | dead control | component replacement | dropped; kind and status filters kept, reachable | code read |
| 13 | unbounded inputs: no `maxLength`, no clip at write; the digest clipped at 400 but took the whole description into memory | data | failure | observed | defect | boundary repair | `TITLE_MAX` 140 / `DESCRIPTION_MAX` 4000 in input and at write (`bugLog.ts:27-28, 220-221`) | unit test "writes an entry…" |
| 14 | nav codename/blurb and v.2 subtitle say "what you reported" | copy & voice | failure | observed | defect (shared) | local correction | patches 1-2 above, not applied | — |

## vision confirmation — 2026-10-26

screens: final3-d-bug-reports.png and final3-m-bug-reports.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: new entry, filters, export .md/.json and the shepherd summary card render; summary is disabled with a reason until an entry exists.
