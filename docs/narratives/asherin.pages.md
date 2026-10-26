```
room: asherin.pages   view id: pdf-generator   files: src/components/dashboard/DocumentStudioView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

files under review: `src/components/dashboard/DocumentStudioView.tsx` (the studio: one row of three kinds), `src/components/dashboard/PdfGeneratorView.tsx` (kind **page**), `src/components/dashboard/SlideshowGeneratorView.tsx` (kind **deck**), `src/components/dashboard/ebook/EBookGeneratorView.tsx` + `ebook/types.ts` (kind **book**), `src/lib/pages/deck.ts` (the deck parser), `src/lib/pages/text.ts`, `src/components/dashboard/__tests__/pages.test.ts`.

## purpose & promise

asherin.pages turns a prompt, some notes, or a manuscript into one file the operator keeps: a typeset page, a 16:9 deck, or a chaptered book, each as a pdf written on this device. the studio promises one thing in its subtitle — `one prompt, one file — page, deck or book.` (`src/lib/dashboard/v2Titles.ts:41`) — and the kinds promise their own shape: `page · report, letter, pdf`, `deck · slides you present`, `book · long form, chapters` (`DocumentStudioView.tsx:19-23`). shepherd is used in all three kinds to propose words or structure; the file is always built locally — a hand-written pdf for the page (`PdfGeneratorView.tsx:254-338`), html2canvas + jspdf for the deck (`SlideshowGeneratorView.tsx:149-172`), jspdf for the book (`EBookGeneratorView.tsx:641-854`). nothing is uploaded [observed].

## entry & navigation

- sidebar group `make`, label `asherin.pages`, codename `document studio`, blurb `one prompt, one file — report, deck, book or pdf`, keywords pages / pdf / document / report / typeset / typst / slides / deck / ebook / book / write (`src/lib/navIntents.ts:178-200`). "typst" is a keyword only; the room does not use typst [observed; see shared-file patches].
- view id `pdf-generator` (`src/components/dashboard/types.ts:115`); aliases `pages`, `asherin-pages` (`src/pages/Dashboard.tsx:218-219`); the retired `ebook` and `slideshow` ids still open the studio on their own kind (`Dashboard.tsx:2124-2133`: `initialKind` = book / deck / page). v.2 keep list position 5 (`DashboardSidebarV2.tsx:49`); sidebar icon `FileText` (`DashboardSidebar.tsx:107`).
- v.2 title `asherin.pages` with the subtitle above, rendered by `V2PageShell`; the three ids share one title row (`v2Titles.ts:41-43`).
- what loads first: the kind row (`DocumentStudioView.tsx:34-58`), then the chosen generator behind `Suspense` with one spinner (`:60-74`). the generators are lazy chunks (`:12-14`); html2canvas and jspdf arrive only with deck or book.
- in v.2 the studio hides its own `asherin.pages` mono label because the shell already prints the title (`DocumentStudioView.tsx:31-39`); the page kind likewise drops its inner `page` heading under the shell (`PdfGeneratorView.tsx:370`, `:464-471`), and the deck kind drops its `deck` heading (`SlideshowGeneratorView.tsx:259-266`). in the current (v.1) chrome the inner headings stay, because nothing else names the room there.

## workflow

### page (main workflow)

1. **say what the page is** — the textarea (`PdfGeneratorView.tsx:532-546`), or one of the first two chips (`:356-363`). enter sends; shift+enter breaks a line (`:540-545`). the send button is disabled while a pass runs or the box is empty (`:547-553`).
2. **local seed** — before shepherd answers, `localSeed` reads the prompt for paper, face and size words and, on an empty document, seeds the cream letter so the sheet is never blank (`:117-135`, `:386-388`).
3. **ask shepherd** — the last six bubbles become history (`:391-397`), the brain text plus the current page json plus the prompt become the user turn (`:169-178`, `packUserTurn`), and `streamChat` runs in `chat` mode at `shallow` depth with an abort signal (`:402-412`). the status line reads `setting type…` (`:472`, `:524`).
4. **parse** — `parseReply` (`:137-167`) takes the fenced `page` or `json` block (`:92-104`), applies only the known keys with length caps (`:106-115`), reads up to four chips (`:141-150`), and refuses encyclopedia prose about what a pdf is (`:78-82`, `:152-158`), falling back to the room's own two sentences.
5. **compile pdf →** — `buildQuietPdf` lays the title, lede and paragraphs onto letter / a4 / 6×9 media (`:182-186`), wraps with a canvas measurement (`:222-243`), paginates so text never runs off the sheet (`:277-305`), and writes a pdf-1.4 with base-14 fonts and honest xref offsets (`:308-338`). the blob downloads as `<slug>.pdf` (`:437-449`); the object url is revoked after 4 s so safari finishes (`:447`).

### deck

1. **notes** — paste, or `open a text file` (`.txt .md .csv .json .xml`, ≤ 2 mb, `SlideshowGeneratorView.tsx:49-64`).
2. **propose slides** — one `streamChat` turn carrying at most 8,000 characters of the notes (`:66-105`); `parseSlides` reads the json array, keeps only slides with strings, maps unknown layouts to `content`, caps at 40 (`src/lib/pages/deck.ts:29-47`). the notice line says how many slides came back, or that none did (`SlideshowGeneratorView.tsx:109-116`).
3. **edit** — pick a slide in the list, change layout / title / body in the inspector (`:384-404`); add a slide by layout (`:126-134`); remove one (`:351-355`).
4. **present** — the preview goes fullscreen; the state follows `fullscreenchange`, so escape is honoured (`:41-46`, `:176-182`).
5. **compile pdf** — each slide is shown in turn, screenshotted at scale 2, and placed on a 1920×1080 landscape page; the active slide is restored afterwards (`:149-172`).

### book

1. **books list** — rows from the local table, newest first (`EBookGeneratorView.tsx:77-108`); `new book` inserts a draft row with `updated_at` stamped (`:132-157`).
2. **sources** — title and metadata (`:992-1010`); text files (≤ 4 mb each, `:271-275`) or pasted text (`:1041-1057`), each stored as a row of ≤ 400k characters (`:235-257`).
3. **settings** — `shepherd splits it` or `by hand` (`:1066-1079`); cover, page size, type size, line spacing, tone of the summaries (`:1081-1124`); chapter count; what shepherd may do (`:1148-1174`).
4. **build** — by hand: one chapter per source (`:955-975`). with shepherd: one turn carrying at most 150k characters of the sources (`:304-443`), parsed as a json array with truncation recovery (`:378-437`); a failed pass returns the operator to settings with the reason (`:297-302`).
5. **chapters** — reorder, edit, add, remove (`:489-516`, `:1246-1290`); `fix grammar in every chapter` runs one bounded pass (`:447-540`); cover png (`:558-639`).
6. **compile pdf** — cover, copyright, dedication, contents, chapters (text or diagram pages), about the author (`:641-854`); the toast names the page and chapter counts (`:849`).

### secondary paths

- **page**: chips re-send a fixed prompt (`:506-517`); a failed pass keeps the letter and prints the reason in lowercase (`:420-428`); leaving the room aborts the pass (`:372-373`, `:429`).
- **deck**: a file over the cap is refused before it is read (`:53-56`); a provider failure is one notice line, never a silent reset (`:117-121`).
- **book**: delete is two taps — the first arms `sure?` for 3.5 s (`:175-196`); autosave is debounced 1.5 s and reports `saved on this device` / `saving…` / `not saved — <reason>` (`:198-233`, `:1378`); a source row can be removed (`:258-265`).

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| studio kind | react (`DocumentStudioView.tsx:30`) | `"page" \| "deck" \| "book"` | mount | no |
| page document, bubbles, draft | react (`PdfGeneratorView.tsx:351-367`) | `PageDoc` (`:8-15`), `Bubble[]` (`:18-24`) | mount — a page is not saved anywhere; the pdf is the record | the prompt, the page json and the last six bubbles go to the model provider (`:391-412`) |
| deck notes, slides, wallpaper | react (`SlideshowGeneratorView.tsx:27-33`) | `Slide[]` (`deck.ts:7-12`) | mount — not saved | the first 8,000 characters of the notes go to the provider (`:99`) |
| books | indexeddb table `ebook_sessions` via the postgrest shim | id, user_id, title, subtitle, author, description, dedication, copyright, about_author, settings, chapters, status, created_at, updated_at (`EBookGeneratorView.tsx:82-107`, `:201-215`) | until deleted | title, description and the sources go to the provider when shepherd splits the book (`:325-360`) |
| book sources | indexeddb table `ebook_text_uploads` | id, session_id, user_id, file_name, content, word_count, created_at (`:111-129`) | until removed or the book is deleted | as above |
| identity | `user.id` from the device identity (`useAuth`, `:38`) | string | forever | no |

nothing in this room writes localStorage. the hosted schema's `status` is written as `draft` / `structured` (`:137`, `:213`) and read for the list label (`:921`).

## logic

- **page prompt shaping**: `PAGES_BRAIN` forbids encyclopedia answers and asks for one thought, one recommendation and a fenced json block (`PdfGeneratorView.tsx:28-29`); `looksLikeEncyclopedia` catches the known failure sentences (`:78-82`); `applyPage` whitelists the enum values and caps title 120 / lede 400 (`:106-115`).
- **page typesetting**: smart punctuation is folded to latin-1 and anything outside is dropped so the ascii xref stays honest (`:198-206`); parentheses and backslashes are escaped, bytes above 126 become octal (`:209-220`); the body column is capped at 34 ems (`:290`); the serif faces map to Times, jost to Helvetica (`:189-195`) — the browser preview uses web stacks that fall back to Georgia (`:37-43`) and the pdf uses the reader's base-14 faces; the opening bubble says so (`:356`).
- **deck parsing**: `parseSlides` (`deck.ts:29-47`) — first `[...]` span, json, array check, string fields only, layout whitelist, 40-slide cap.
- **book structuring**: the prompt is a strict copy-editor contract (`EBookGeneratorView.tsx:325-360`); `toneMap` now reaches the summaries rule (`:314`, `:346`); recovery closes a truncated array at the last `}` (`:388-406`, `:412-431`).
- **book export**: margins 72/54 pt, body size and leading from settings, page breaks when `y` passes the bottom margin (`:646-652`, `:788-806`); diagram chapters split `diagramDescription` on arrows into boxes (`:745-775`).
- **estimates**: 250 words per page, 200 words per minute (`:801-802`, `:1208-1209`) — stated as `pages, about`.

## integrations & network

- **model**: every kind calls `streamChat` from `src/lib/ai.ts` (`PdfGeneratorView.tsx:402`, `SlideshowGeneratorView.tsx:75`, `EBookGeneratorView.tsx:323`, `:461`). `ai.ts` resolves the operator's own saved key and provider (`resolveActiveModel`, `ai.ts:57`), streams directly from this device, retries rate limits twice (`ai.ts:245-272`), and raises the byok dialog when no key exists (`ai.ts:45-53`). the page and deck pass an abort signal (`PdfGeneratorView.tsx:407`, `SlideshowGeneratorView.tsx:101`); the book does not yet (open gap).
- **no other host**. the wallpapers are bundled assets (`src/lib/wallpapers.ts`); html2canvas draws same-origin images (`SlideshowGeneratorView.tsx:161`). `supabase.from(...)` is the local shim (`src/integrations/supabase/client.ts:7`), so no "kernel offline" can appear.
- **offline**: page / deck / book editing and every pdf work offline; the three shepherd buttons fail with the provider's sentence, lowercased, and the document stays.

## security & privacy

- **what reaches the provider**: page — the prompt, page json, last six bubbles; deck — up to 8,000 characters of notes; book — title, description and up to 150k characters of the sources, or up to 100k characters of chapters for the grammar pass (`EBOOK_LIMITS`, `EBookGeneratorView.tsx:21`). the operator chose the provider and the key; nothing goes anywhere else.
- **injection**: model output is parsed as json with whitelists (`applyPage`, `parseSlides`); the page renders as react text nodes (`PdfGeneratorView.tsx:577-595`); the deck renders slide strings as text (`SlideshowGeneratorView.tsx:184-250`); the pdf writer escapes every string (`pdfEscape`). a hostile answer can only change words, never markup or script.
- **files**: text files are read with `FileReader.readAsText` and never executed; the deck caps at 2 mb, the book at 4 mb per file and 400k characters per source.
- **storage at rest**: books and sources sit unencrypted in this origin's indexeddb; a page or deck is never stored.
- **clipboard / export**: downloads happen only on a click; `rel="noopener"` on the page anchor (`:444`).

## failure modes

| failure | operator sees | where |
| --- | --- | --- |
| no saved key / provider refuses / busy | page: bubble `shepherd missed this pass. the letter on the right stayed.` + the lowercased reason; deck: notice `shepherd could not run: …`; book: back to settings + toast `book not structured` | `PdfGeneratorView.tsx:420-428`, `SlideshowGeneratorView.tsx:117-121`, `EBookGeneratorView.tsx:439-442` |
| answer has no json | page: fallback thought + the letter unchanged; deck: `shepherd did not answer with slides this time…`; book: back to settings with the reason | `:137-167`, `:115`, `:407`, `:433` |
| answer cut short | book: last complete chapters recovered and labelled | `EBookGeneratorView.tsx:412-431` |
| pdf writer throws | page: bubble `the compile failed before the file left the page.`; deck: notice `the deck could not be rendered: …`; book: toast `pdf not written` | `:449-457`, `:168-170`, `:850-852` |
| file too large | deck notice / book toast with the size and the limit; nothing read | `SlideshowGeneratorView.tsx:53-56`, `EBookGeneratorView.tsx:271-275` |
| file unreadable | deck notice `<name> could not be read as text.` | `:62` |
| books table unreadable | red line `the books table could not be read: …` + `try again` | `EBookGeneratorView.tsx:882-887` |
| insert / update / delete refused | toasts `book not created`, `text not added`, `source kept`, `book kept`; header `not saved — <reason>` | `:143-146`, `:252`, `:260-263`, `:185-189`, `:1378` |
| nothing to compile | `compile pdf` disabled with a tooltip | `PdfGeneratorView.tsx:477-479`, `SlideshowGeneratorView.tsx:276-278` |
| fullscreen refused | notice `this browser refused fullscreen.` | `:179` |
| room left mid-pass | page / deck abort the stream; nothing is written into the dead tree | `PdfGeneratorView.tsx:373`, `SlideshowGeneratorView.tsx:47` |

no spinner runs without an end: the book's build step shows the character count coming back and says that is the only progress there is (`EBookGeneratorView.tsx:1188-1200`); a failed build leaves the step.

## interface & accessibility

- **desktop (1440×900)**: page — sheet right, conversation left at 34 % (`PdfGeneratorView.tsx:484`); the sheet keeps its paper ratio on both axes with container units (`:560-573`). deck — notes column 380–420 px, preview and inspector right (`SlideshowGeneratorView.tsx:288`, `:365`). book — centred 768 px column, steps row under the header, footer actions (`EBookGeneratorView.tsx:1365-1452`).
- **phone (390×844)**: page — sheet above (48 dvh), conversation below (`:484-486`). deck — notes column caps at 46 dvh and scrolls, preview below (`:288`). book — stats in two columns, cover wallpapers in four, step labels hidden except the active one (`:1204`, `:1082`, `:1409`), delete visible without hover (`:927`).
- **one focal point**: the sheet, the slide, the chapter list — the chrome is 10–11 px muted type around it.
- **keyboard / names**: textareas and icon buttons carry `aria-label` (`PdfGeneratorView.tsx:535`, `:549`; `SlideshowGeneratorView.tsx:323`, `:351`, `:371`, `:379`, `:386`, `:393`, `:400`); the kind row is a `tablist` (`DocumentStudioView.tsx:34`); the book's steps are tabs (`:1398`) and its toggles are real `switch` buttons whose knob moves (`:1164-1169`); the slide list no longer nests a button in a button (`:343-356`).
- **motion**: one spinner per pending action; nothing decorative. the fake 60 % progress bar is gone.
- **contrast**: 10–11 px copy sits at `muted-foreground/60–80` on the room's glass — the house scale; the page preview's own ink pairs are cream/charcoal, white/near-black, night/cream (`PdfGeneratorView.tsx:31-35`).
- **empty states**: `say what the page is`, `no slides yet…`, `no books yet.`

## relationships

| edge | target | real in code? |
| --- | --- | --- |
| calls | `streamChat` (`src/lib/ai.ts`) | yes — three kinds |
| reads_from / writes_to | local tables `ebook_sessions`, `ebook_text_uploads` | yes — book only |
| reads_from | device identity (`useAuth`) | yes — book rows carry `user_id` |
| depends_on | `src/lib/wallpapers.ts` | yes — deck and book covers |
| depends_on | `useIsV2` (`src/lib/dashboardUiContext.tsx`) | yes — hides duplicate headings |
| trusts | the operator's chosen provider | yes |
| writes_to | connect traces | **no** — this room emits no `emitPull` row [observed; open gap] |
| reads_from | library / vault / projects | **no** — nothing is imported from other rooms |

## performance

- mount: the studio chunk is small; html2canvas and jspdf load with deck / book only. the page kind creates one measuring canvas once (`PdfGeneratorView.tsx:222-228`).
- the deck export renders n slides at scale 2 with a 150 ms settle each; forty slides is the cap.
- the book's autosave serialises the whole chapters array every 1.5 s of change; the per-source cap bounds it.
- unmount: the page and deck abort their streams; the book clears its save timer (`EBookGeneratorView.tsx:225-231`).

## copy & voice

all on-screen copy is lowercase except operator text and proper names (A4, US Letter): `compile pdf →`, `setting type…`, `ready to compile`, `propose slides`, `splitting…`, `rendering…`, `present` / `leave`, `new book`, `start a book`, `sources`, `how the chapters are made`, `shepherd splits it` / `by hand`, `let shepherd decide`, `ask shepherd to split it`, `build the book`, `fix grammar in every chapter`, `saved on this device`, toasts `book not created`, `text not added`, `pdf saved`. the model is `shepherd` everywhere (no `Aureon`, no `AI`). no account-era language. the pdf itself prints `contents`, `chapter n`, `about the author` in lowercase.

## tests & proof

unit (`npx vitest run src/components/dashboard/__tests__/pages.test.ts`, 7 tests): `parseSlides` — clean array, prose around the array, unknown layout → content and empty objects dropped, prose / cut json / non-array → nothing, 40-slide cap; `lowerFirst`; the limits are finite and ordered. full run: 826 tests pass.

not proven by unit tests: the hand-written pdf opening in a reader (the earlier desktop screenshot showed the page kind rendering well; the pdf writer is unchanged by this pass), html2canvas output, jspdf output. screenshots at 1440×900 and 390×844 are pending.

## open gaps

- a page or a deck is not saved; close the tab and it is gone. the pdf is the record. a local table for pages and decks would match the book.
- the book's `streamChat` turns carry no abort signal; leaving mid-build lets the stream finish into a dead tree (harmless, wasteful).
- the page preview shows web serif stacks that resolve to Georgia unless the named faces are installed; the pdf uses Times / Helvetica. a bundled face would make the two agree.
- the deck screenshot inherits the preview's pixel size; on a phone the exported slides are upscaled.
- no connect trace is emitted for a compiled file.
- `typst` is a nav keyword with no typst in the room.

## shared-file patches (not applied — outside the room)

1. `src/lib/navIntents.ts:181-182` — the codename is a product-era label and the blurb repeats "pdf".
   old: `    codename: "document studio",\n    blurb: "one prompt, one file — report, deck, book or pdf",`
   new: `    codename: "page, deck or book",\n    blurb: "one prompt, one file — a typeset page, a deck or a chaptered book, written on this device",`
2. `src/lib/navIntents.ts:189` — remove the keyword `"typst",` (nothing in the room uses typst).
3. `src/pages/Dashboard.tsx:2421-2423` — the `data-asherin-room` list names the retired ids `"slideshow", "ebook"` but not `"pdf-generator"`, so the room-accent override never applies to the live id.
   old: `"snippets", "zali", "slideshow", "ebook",`
   new: `"snippets", "zali", "pdf-generator", "slideshow", "ebook",`

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | the opening bubble claimed `fonts live in the file`; the writer uses base-14 Times / Helvetica, nothing embedded | semantic | failure: copy ≠ code | observed `PdfGeneratorView.tsx:189-195` | wrong claim in copy | local correction | `:356` | code |
| 2 | a page pass had no abort; leaving the room let the stream write into a dead tree | state | cause: no signal | observed | defect | local correction | `:372-373`, `:401-407`, `:421` | code |
| 3 | provider errors were printed capitalised and raw | interface | failure | observed | defect | local correction | `lowerFirst`, `src/lib/pages/text.ts` | `pages.test.ts` |
| 4 | the send `→` button had no name and no disabled state while a pass ran | interface | failure | observed | defect | local correction | `:547-553` | code |
| 5 | three stacked titles in v.2 (shell, studio label, inner `pages` h1) | interface | failure: redundancy | observed | defect | local correction | `DocumentStudioView.tsx:31-39`, `PdfGeneratorView.tsx:464-471` | code |
| 6 | deck: `WALLPAPERS` used a non-null `!` on a lookup; a missing key crashed the room at module load | execution | cause | inferred | defect | local correction | `SlideshowGeneratorView.tsx:17-21` | code |
| 7 | deck: a failed shepherd pass and a failed export were swallowed (`catch {}` / `console.error`); the operator saw nothing | behavioral | failure: no error state | observed | defect | local correction | `notice` line `:30`, `:109-121`, `:168-170` | code |
| 8 | deck: `isFullscreen` was set true even when fullscreen was refused and never reset on escape | state | cause | observed | defect | local correction | `:41-46`, `:176-182` | code |
| 9 | deck: a `<button>` (trash) nested inside a `<button>` (slide row) — invalid html, unreliable clicks | interface | failure | observed | defect | local correction | `:343-356` | code |
| 10 | deck: any file size was read into memory; the prompt silently truncated | execution | failure: unbounded | observed | defect | local correction | `DECK_LIMITS` `deck.ts:5`, `:53-56`, `:69` | `pages.test.ts` |
| 11 | deck: model output parsed with a bare cast; non-string fields and unknown layouts reached the renderer | data | cause | observed | defect | contract repair | `parseSlides` `deck.ts:29-47` | `pages.test.ts` 5 cases |
| 12 | deck: capitalised copy throughout (`Download PDF`, `Generate Slides`, `Background Theme`, `Raw Data`, `Title Slide`…) and "AI" | interface | failure | observed | defect | local correction | file rewritten | grep |
| 13 | book: rows were inserted without `updated_at` and updated without it, so the list showed `Invalid Date` and ordered undefined | data | cause: shim only stamps `updated_at` when the row already has it (`postgrest.ts:482`) | observed | defect | local correction | `:137`, `:202`, `:103` | code |
| 14 | book: a failed structuring pass left the operator on the `processing` step with a spinner, no footer and no way out | behavioral | failure: spinner forever | observed | defect | local correction | `failStructure` `:297-302` | code |
| 15 | book: a fake 60 % progress bar pulsed under every build | interface | failure: misleading affordance | observed | defect | local correction | `:1188-1200` | code |
| 16 | book: every store call ignored `error` | behavioral | failure: silent | observed | defect | local correction | `:86`, `:143`, `:185`, `:216`, `:252`, `:259` | code |
| 17 | book: delete was one tap, irreversible, and the button was `opacity-0` until hover (invisible on touch) | interface | failure | observed | defect | local correction | two-tap arm `:175-196`, visible on phone `:927` | code |
| 18 | book: the toggle knob used `left-4.5`, a class tailwind does not generate — the switch never visibly moved | interface | cause | observed | defect | local correction | `:1168` | code |
| 19 | book: the whole manuscript went into one prompt unbounded; the grammar pass sliced a json string at 100k and sent broken json | execution | failure | observed | defect | local correction | `EBOOK_LIMITS` `:21`, `:360`, `:456-459` | `pages.test.ts` limits |
| 20 | book: `tone` was a dead control — `toneMap` was computed and never used in the prompt | behavioral | failure: dead control | observed | defect | local correction | `:346` | code |
| 21 | book: `rewriteForConsistency` toggle controlled nothing | behavioral | failure: dead control | observed | defect | local correction | removed from the list `:1148-1160` (type kept for old rows) | code |
| 22 | book: 4-column stats and 7-column cover grid at 390 px; four labelled steps overflowed the header | interface | failure: phone | inferred from widths | defect | local correction | `:1204`, `:1082`, `:1398-1409` | screenshots pending |
| 23 | book: `Aureon`, `AI`, `Untitled Book`, `New Book`, `✓ Structured`, uppercase section labels everywhere | interface | failure | observed | defect | local correction | file copy rewritten | grep |
| 24 | narrative v1 said the room "uses its proven generators underneath — nothing was reimplemented" as if that were a guarantee; two of the three had no error states | semantic | — | observed | wrong claim | — | narrative rewritten | — |

## vision confirmation — 2026-10-26

screens: final3-d-pdf-generator.png and final3-m-pdf-generator.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: page/deck/book tabs, the page preview and the composer render. defect seen and fixed: "compile pdf" was green and on phone the floating bell covered the send button.
- fixed: tonal button; floating bell removed.
