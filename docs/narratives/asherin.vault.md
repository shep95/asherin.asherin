```
room: asherin.vault   view id: memory   files: src/components/dashboard/OrganismVaultView.tsx, src/lib/memory/vault.ts, src/lib/memory/memoryKinds.ts
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

line numbers are as of this review. shared files (Dashboard.tsx, navIntents.ts, v2Titles.ts) are edited by other rooms concurrently; for those the symbol is the anchor and the line is a hint.

## purpose & promise

asherin.vault is the one place shepherd's memory of the operator is visible. after a chat turn lands, shepherd distils what was durable *about the operator* (not about the subject) into three kinds of row: knowledge (facts and preferences, grouped by facet), patterns (a way of working the operator asked for or corrected towards), and growth (how much has been learned, per conversation). every knowledge row is sealed with the device key before it touches storage (`src/lib/memory/vault.ts:429` `encryptText`), is opened only inside this room or for a short, uncited brief to the model (`vault.ts:528` `composeVaultContext`), and can be forgotten one at a time or all at once with a delete that is proven afterwards (`vault.ts:317`, `:326`, `:341`).

the interface promises exactly this, in one sentence (`OrganismVaultView.tsx:250`): "what shepherd has learned from your conversations. held on this device, sealed with a key that never leaves it, readable only here. it is never quoted back as a source, and you can forget any of it." the code behind each clause is cited in **security & privacy**.

## entry & navigation

- rail: group `keep`, label `asherin.vault`, codename `Vault` (`src/lib/navIntents.ts:253-259`). the blurb there still reads "Everything Asherin has learned about you, encrypted and yours to edit" — capitalised, "Asherin" for the model; patch proposed below.
- deep link: `/dashboard/memory`; `"memory"` is in `VALID_VIEWS` (`src/pages/Dashboard.tsx:163`) and rendered by `case "memory"` (`Dashboard.tsx:2076`) inside `ErrorBoundary` + `Suspense`, lazily loaded (`Dashboard.tsx:37`).
- v.2 shell title: `v2Titles.ts:18` says `memory` / "rules shepherd carries. credentials are refused." — that subtitle describes the standing-rules memory in settings, not this room; patch proposed below to say `asherin.vault` / "what shepherd has learned from your conversations, held on this device."
- in v.2 the room renders no hero of its own; its single action (refresh) is portalled into the shell slot (`OrganismVaultView.tsx:240` `<V2Action>`). in the current shell it renders its own `h1 asherin.vault` plus the refresh button (`:243-247`).
- what loads first: skeleton (four pulsing rows, `:290`), then `load()` (`:53`) reads the three tables and the memory switch in parallel.

## workflow

happy path:
1. operator talks in chat with "remember things about me" on (settings → memory & learning, `IntelligenceSettings.tsx:218`; default is **off**, `src/lib/intelligence/store.ts:32`).
2. after the answer lands, chat calls `distillTurn` (`vault.ts:392`) — **this call is the Dashboard.tsx patch below; until it lands the vault does not fill**. it gates on the memory switch (`:399`), on a minimum of 40 characters of operator text (`:401`), and on a model key being present without raising the key dialog (`:371` `modelReady`). it asks shepherd for one json object under a strict contract (`:225` `DISTILL_SYSTEM`, `:232` `buildDistillPrompt`, bounded to 4000 + 3000 chars), parses it with `parseDistillation` (`:169`), seals each knowledge row (`:429`), reinforces a repeat instead of duplicating it (`:430-444`: occurrences+1, confidence max, content re-sealed), upserts patterns by slug (`:465-498`), and rewrites the growth row (`:500-506`).
3. the room refreshes itself when any of the three tables change (`:99` `onVaultChange` → debounced 400ms `load()`), so new rows appear without pressing refresh.
4. operator reads: knowledge tab grouped by facet with lowercase facet labels (`vault.ts:50`), private rows masked with a lock badge and a reveal eye (`OrganismVaultView.tsx:109` `reveal`), "seen n×" when reinforced.

secondary paths:
- search (`:202` `grouped`): label for every row; content only where it is open (non-private, or private and revealed). the "nothing matches" state says so (`:319`).
- forget one knowledge row (`:127` → `vault.ts:317` `forgetEntry`): delete, re-read to prove it is gone, then recount growth. a row that is still there yields "that entry is still here — try again."
- forget one pattern (`:150` → `vault.ts:326`), retire / restore a pattern (`:168` → `vault.ts:335`; retired rows are dimmed and never carry "· retired" into the brief — patterns are not sent to the model at all, see **open gaps**).
- forget everything (`:178`): `window.confirm` with the item count, then `vault.ts:341` deletes all three tables for this user and proves the count is zero.
- refresh: `load()` again (`:217` button, `:53`).
- reveal a private row: decrypts on demand (`:109`), toggles back to masked on second press; a seal that will not open shows a toast and stays masked.
- try again after an error (`:298`).

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| `organism_vault` rows | IndexedDB `asherin_local_v1` → `tables` store, via the shim (`src/lib/local/postgrest.ts:431` insert, `:474` update, `:490` delete) | `VaultRow` (`vault.ts:65`): facet, label (plain, lowercase, ≤80), content (`ENC:` ciphertext), sensitive, encrypted=true, confidence 0..1, occurrences, first/last_seen, enabled=true, source_conversation_id, user_id (filled by the shim, `postgrest.ts:439`) | until forgotten or "delete my data" (`db.ts:231` `wipeLocalDb`) | no |
| `organism_patterns` rows | same | `PatternRow` (`vault.ts:80`): slug, name, domain, trigger, procedure (plain text), potency, active | same | no |
| `organism_growth` row | same, one per user | `GrowthRow` (`vault.ts:91`): sessions, entries, patterns, density, last_note, last_grown_at, last_conversation_id | recomputed on every write and forget (`vault.ts:294` `writeGrowthCounts`) | no |
| device DEK | IndexedDB kv, non-extractable AES-GCM key (`src/lib/local/keys.ts:305`), cached in memory per session (`src/lib/encryption.ts:46`) | CryptoKey | device lifetime | no — non-extractable |
| memory switch | `ai_intelligence_settings.memory_enabled` (`store.ts:37` `loadSettings`) | boolean, default false | until changed | no |
| react: rows, patterns, growth, plain (opened text by id), revealed (by id), loading, error, memoryOn, filter, tab, busyId | component (`OrganismVaultView.tsx:40-51`) | — | mount | no |
| nothing in localStorage or sessionStorage | — | — | — | — |

label and facet are stored in plain text so the room can group and search without opening every seal; the sentence itself is always sealed. patterns are plain text: they are procedures about how to answer, written by the distiller under the same credential guard, and the room needs them searchable and editable without a decrypt pass.

## logic

- **contract** (`vault.ts:225`): one json object, `knowledge[]` (facet ∈ 12 facets, label, content, sensitive, confidence), `patterns[]` (name, domain, trigger, procedure), `note`. the model is told: about the operator only, at most 8 + 3, empty arrays when nothing durable, never credentials, mark health / money / relationships sensitive, low confidence when inferring.
- **parse** (`vault.ts:169` `parseDistillation`, pure): `extractJson` (`src/lib/local/llm.ts:379`) tolerates fences and trailing prose; a non-object → empty. per item: label/content clipped (`LIMITS`, `vault.ts:127`), whitespace collapsed, label lowercased; `guardMemoryContent` (`memoryKinds.ts:37`) refuses api keys, tokens, "password is …", private keys, card numbers — refusals are returned with a reason and never stored; unknown facet → `context`; duplicate facet+label within one answer dropped; `secret` facet or a health/money/relationship hint (`:142`) forces `sensitive`; confidence clamped to 0..1 with 0.6 default. patterns: name lowercased → slug (`:157`), trigger+procedure pass the same guard, caps at 3. note clipped to 200 chars, lowercased.
- **reinforce vs learn** (`:420-461`): key = `facet|label` against existing rows; hit → update (occurrences+1, confidence = max, content resealed, last_seen); miss → insert.
- **sessions** (`:500-501`): sessions increments only when `last_conversation_id` differs from this turn's conversation, so one long chat counts once. density = entries / max(1, sessions), 2 d.p.
- **brief ranking** (`:528`): only `sensitive=false` and `enabled≠false` rows; score = overlap of label+facet terms with the question (stopwords removed, `:513`), +100 for `directive` (always carried), +0.5 for preference/style, +min(1, occurrences/5); rows with no overlap are dropped unless directive; top 8; each line is `facet: text` capped at 400 chars; header instructs the model never to quote or cite. returns "" when memory is off, nothing qualifies, or no seal opens.
- **search** (`OrganismVaultView.tsx:202`): case-insensitive substring over label + opened content; the `SEALED` sentinel (`:32`) is never searched.

## integrations & network

- the only outbound call is shepherd itself: `askModel` (`src/lib/ai.ts:332`) → `completeLlm` (`llm.ts:363`) to the provider the operator connected, with the key from the device vault, `json: true` (provider json mode where supported: `llm.ts:163`, `:310`), `maxTokens: 700`, a 20 s `AbortController` timeout (`vault.ts:382`), and `completeLlm`'s own 3 attempts. payload: the distill system prompt plus at most 4000 chars of operator text and 3000 of the answer.
- no `supabase.functions.invoke` anywhere in the room or the lib — the hosted edge function that used to fill these tables is gone and nothing here asks for it, so "kernel offline" cannot appear.
- offline / no key: `modelReady` (`:371`) checks `getActiveModel` + `hasProviderKey` first so the distiller never triggers the key dialog (`ai.ts:45` `raiseByok`) from the background; it returns `skipped: "no model"`. a failed or timed-out model call returns `skipped: "model failed"` and writes nothing.
- `loadSettings`, `loadVault`, every forget: IndexedDB only.

## security & privacy

- **threat: a hostile model reply.** it is data, never code: parsed by `extractJson` + `parseDistillation`, every string clipped, every facet whitelisted, every row through the credential guard; counts are capped so a reply cannot flood the store. content is rendered as text nodes (no `dangerouslySetInnerHTML`); patterns render in a `<pre>` as text.
- **threat: credentials entering memory.** `guardMemoryContent` runs on every knowledge sentence and every pattern (`vault.ts:185`, `:209`). refused items are reported in `DistillResult.refused` and never written. the distill prompt also forbids them, but the guard is the boundary.
- **threat: a private fact reaching the model.** `composeVaultContext` filters `sensitive=false` at the query (`:536`); the `secret` facet is forced sensitive at parse time. tested (`vault.test.ts` "never a private row").
- **threat: memory used against the operator's switch.** both the writer (`:399`) and the brief (`:531`) read `memory_enabled`; off means nothing is learned and nothing is used, matching the toggle's own hint (`IntelligenceSettings.tsx:219`).
- **at rest:** content sealed AES-256-GCM with a non-extractable device key (`encryption.ts:130`, `keys.ts:305`); label, facet and patterns in plain text (stated under **state & data**). decrypt failures throw (`encryption.ts:157`) — never a silent plaintext fallback; the room shows "sealed — this entry could not be opened on this device." (`OrganismVaultView.tsx:346`).
- **clipboard / export:** none. nothing copies, downloads or shares.
- **key handling:** the room never touches the DEK directly; `openRow` (`vault.ts:277`) → `decryptText` → `getDek` cache.
- **forgetting is real:** each forget deletes and then re-reads to prove the row is gone before the ui removes it (`:317-346`); tested.

## failure modes

| failure | what the operator sees |
| --- | --- |
| no device identity (never in practice: `useAuth` always has one) | "this device has no identity yet — open chat once and come back." + try again (`:56`) |
| a table read throws | the shim's message, lowercased, in a `role=alert` panel with "try again" (`:298`) |
| a row's seal will not open on load | the row stays, body reads "sealed — this entry could not be opened on this device." (`:346`) |
| a private row's seal will not open on reveal | toast "this entry is sealed and could not be opened on this device.", stays masked (`:120`) |
| forget: delete reports an error | toast "could not remove that entry." |
| forget: delete "succeeds" but the row is still there | toast "that entry is still here — try again."; the row stays on screen (`:133`) |
| forget everything partial | toast "some entries are still here — try again." (`:186`) |
| memory switch off | banner above the list (`:229`) and a specific empty state (`:314`) |
| search with no hit | "nothing matches "…". private entries are searched by label only until revealed." (`:319`) |
| distiller: memory off / too short / no key / model failed / nothing durable | nothing is written; the result names the reason; chat is unaffected (the call is fire-and-forget in the proposed patch) |
| settings read fails | `memoryOn` stays null: no banner, generic empty state (`:67`) |

no spinner lives longer than its await: `loading` is cleared in `finally` (`:84`), guarded by an `alive` ref so an unmounted room never sets state (`:89-93`).

## interface & accessibility

- desktop (1440): v.2 — shell header `asherin.vault` (after the v2Titles patch) with the refresh action in the shell slot; one-line promise; tab row with search on the right and "forget everything" at the far right; facet sections with rows. patterns tab: two-column grid (`md:grid-cols-2`). growth: four stat tiles (`md:grid-cols-4`).
- phone (390): header wraps (`flex-wrap`, `:243`); the search input is `w-full max-w-xs` under the tabs; tiles fall to two columns; pattern cards stack. row action buttons are `shrink-0` so long labels wrap instead of pushing the trash button off-screen (`:354`, `:364`).
- focus order: refresh → tabs → search → forget everything → each row's reveal (private only) → forget. every icon button has an `aria-label` naming the row (`:356`, `:367`, `:412`); tabs are `role=tab` with `aria-selected` inside a `role=tablist` (`:254`); the loading skeleton is `aria-busy`; the error panel is `role=alert`.
- motion: skeleton pulse and a spinning refresh icon only.
- copy: lowercase throughout except the proper name "asherin.vault"; the lock badge reads "private".
- empty states: knowledge (two variants by memory switch), patterns, growth, and no-match — all explain what will fill them.

## performance

- mount: three IndexedDB reads in parallel + one settings read (`:62`), then one decrypt per non-private row (≤500 rows, sequential `await` — on a 500-row vault that is ~500 AES-GCM ops, fine on any device).
- timers: one 400 ms debounce for table-change refreshes, cleared on unmount (`:97-107`). no intervals.
- unmount: `alive` ref flips so in-flight loads drop their result; the table listener is removed.
- distiller cost per turn (chat side): one bounded model call, ≤1000 existing rows read once, ≤8 encrypts, ≤11 writes.

## copy & voice

every visible string is lowercase except "asherin.vault". the model is "shepherd" in the promise, the empty states and the search placeholder. no "account", "sign in", "assistant" or "Asherin". no kernel-offline wording is possible: nothing is invoked. toasts: "forgotten.", "everything forgotten.", and the error lines in **failure modes**. two shared strings still carry the old voice and are patched below (nav blurb, v2 subtitle).

## tests & proof

- `src/lib/memory/__tests__/vault.test.ts` — 18 tests against the real on-device shim (fake-indexeddb) with the model mocked: contract parsing (lowercasing, fences, garbage, caps, facet normalisation, confidence clamp, credential refusal with reasons, forced-private, in-turn dedupe, prompt bounds); the writer (memory off writes nothing and never calls the model; too-short skip; no-key skip without the dialog; rows sealed and openable; growth numbers; reinforce-not-duplicate; sessions count a conversation once; model failure / nothing durable write nothing); forgetting (entry, pattern, everything — proven by re-read, growth follows); the brief (directives always, overlap rows, never private, empty when memory is off).
- `npx vitest run`: 45 files, 477 tests pass.
- end-to-end step: not driven this round (browsers owned elsewhere). screenshots: pending.

## open gaps

1. **the writer is not yet called from chat.** `distillTurn` and `composeVaultContext` are ready and tested, but the hook lives in `src/pages/Dashboard.tsx` (shared, concurrently edited). until the two patches below land, the vault does not fill and the model does not see it. this is the whole room's value; it is a two-line change.
2. **memory is off by default** (`store.ts:32`). the room says so and points to the switch, but a new operator sees an empty vault until they opt in. that is the stated doctrine ("requires memory to be on before anything is stored about you"), not a bug.
3. **patterns are not handed to the model.** the intelligence layer's own `ai_pattern` table is what reaches the prompt; `organism_patterns` are visible and editable here but only reach the model if a later patch includes them in the brief. "retire" therefore changes only what is shown and what a future brief could carry.
4. **project count** in `src/lib/projects/scope.ts:132` filters `organism_vault` by `enabled=true`; new rows write `enabled: true` so the count is right, but rows written by the old hosted build (if any were ever imported) have no `enabled` and are not counted.
5. **labels and patterns are plain text at rest.** stated, deliberate; a device with the operator's IndexedDB open can read them. the sentences are sealed.
6. **no screenshots this round.**

## proposed patches to shared files (not applied)

`src/pages/Dashboard.tsx` — after the intelligence prepare block (anchor `console.error("intelligence prepare skipped:", e);` ≈ line 1288):

```ts
// old
      console.error("intelligence prepare skipped:", e);
    }
// new
      console.error("intelligence prepare skipped:", e);
    }
    // asherin.vault — a silent brief of what shepherd knows; never cited.
    try {
      const { composeVaultContext } = await import("@/lib/memory/vault");
      const vaultBrief = await composeVaultContext(user.id, content);
      if (vaultBrief) intelligenceContext = `${intelligenceContext ?? ""}\n\n${vaultBrief}`.trim();
    } catch (e) {
      console.warn("[vault] brief skipped:", e);
    }
```

`src/pages/Dashboard.tsx` — in `onDone`, after the `completeTurn` kick-off (anchor `const completedTurn = preparedTurn;` ≈ line 1521):

```ts
// old
              .catch((e) => console.error("intelligence complete skipped:", e));
          }
          pushNotification({
// new
              .catch((e) => console.error("intelligence complete skipped:", e));
          }
          // asherin.vault — what this turn taught shepherd about the operator. gated on the memory switch; never blocks the ui.
          void import("@/lib/memory/vault")
            .then(({ distillTurn }) =>
              distillTurn({ conversationId: convId, userId: user.id, userText: content, assistantText: assistantContent }),
            )
            .catch((e) => console.warn("[vault] distill skipped:", e));
          pushNotification({
```

`src/lib/navIntents.ts:256`:

```ts
// old
    blurb: "Everything Asherin has learned about you, encrypted and yours to edit",
// new
    blurb: "what shepherd has learned about you, sealed on this device and yours to forget",
```

`src/lib/dashboard/v2Titles.ts:18`:

```ts
// old
  memory: { title: "memory", subtitle: "rules shepherd carries. credentials are refused." },
// new
  memory: { title: "asherin.vault", subtitle: "what shepherd has learned from your conversations, held on this device." },
```

## review log

| # | finding | kind | fix | confirmed by |
| --- | --- | --- | --- | --- |
| 1 | nothing in the device build writes `organism_vault`, `organism_patterns` or `organism_growth`; the writer was a hosted edge function (`supabase.functions.invoke("organism")` in `organismClient.ts:76`, which now answers "kernel offline"). "the vault fills itself as you work in chat" was false. | defect | new `src/lib/memory/vault.ts` `distillTurn` (:392) on `askModel` with a strict json contract, bounds and the credential guard; chat hook proposed as a Dashboard.tsx patch | unit tests (writer suite) |
| 2 | memory extraction had no schema, size or credential boundary. | defect | `parseDistillation` (:169) + `LIMITS` (:127) + `guardMemoryContent`; 7 parser tests | unit tests |
| 3 | vault content was never read by chat, so "never quoted back as a source" described nothing. | defect | `composeVaultContext` (:528) with a never-cite header, directives always, private rows excluded; Dashboard patch proposed | unit tests (brief suite) |
| 4 | `supabase.auth.getUser()` + "Sign in to open your vault." — account-era dead path; the device identity is always present. | defect | `useAuth()` (`OrganismVaultView.tsx:38`); the only no-identity line is honest about the device | code read |
| 5 | promise copy: "Everything the assistant has learned about you, encrypted to your account" — capitalised, account-era, "assistant". | defect | rewritten lowercase with "shepherd", "held on this device, sealed with a key that never leaves it" (:250) | code read |
| 6 | all copy capitalised (tabs, facets "How they think", "Refresh", "Retire", "Fires when:", "Sessions", "Last grew", toasts "Forgotten."). | defect | lowercased throughout; `FACET_LABEL` moved to the lib (`vault.ts:50`) | code read |
| 7 | v.2 shell showed its own title `memory` above the room's own `h1 asherin.vault` — two heroes, against `V2PageShell`'s contract. | defect | own hero hidden in v.2, refresh portalled with `<V2Action>` (:240); shell title patch proposed | code read |
| 8 | forget removed the row from react state on any non-error, without proving the delete; a shim that filtered nothing would still show "Forgotten." | defect | `forgetEntry` re-reads by id and returns false if the row remains; ui keeps the row and says so (:132) | unit test "forgetEntry removes one row" |
| 9 | patterns could be retired but never forgotten; no "forget everything" although the promise says "you can forget any of it". | defect | `forgetPattern` (:326), `forgetEverything` (:341) with confirm and proof | unit tests (forgetting suite) |
| 10 | growth row never changed after a forget; "things learned" would overstate. | defect | `writeGrowthCounts` recounts after every forget (:294) | unit test (growth follows) |
| 11 | a row whose seal failed on load rendered as an empty string with no explanation. | defect | `SEALED` sentinel (:32) → "sealed — this entry could not be opened on this device." (:346) | code read |
| 12 | search looked at `plain[r.id]` for private rows too, which is empty until revealed — silently unsearchable. | wrong claim → made explicit | label-only search for unrevealed private rows, said in the no-match state (:319); separate "nothing matches" vs "nothing here yet" | code read |
| 13 | the memory switch (default off) silently meant nothing would ever be learned; the room could not say why it was empty. | defect | `memoryOn` read on load; banner (:229) and empty-state variant (:314) point to the switch | code read |
| 14 | the room only refreshed by hand; chat writes would not appear until "Refresh". | defect | `onVaultChange` (`vault.ts:282`) → debounced reload (:99) | code read |
| 15 | icon buttons had no accessible names; tabs were plain buttons. | defect | `aria-label` on reveal/forget, `role=tablist/tab` + `aria-selected`, `aria-busy`, `role=alert` | code read |
| 16 | react state could be set after unmount (no guard around async `load`). | defect | `alive` ref (:51, :89-93) | code read |
| 17 | `.limit(500)`/`.limit(200)` reads were not user-scoped (RLS no longer exists). the shim fills `user_id` on insert, so a shared device db with two identities would leak rows. | defect | every read and write in `vault.ts` filters `.eq("user_id", userId)` | code read |
| 18 | background distill could pop the BYOK key dialog from a finished turn. | defect | `modelReady` pre-check (:371); test "stays quiet when no model key is present" | unit test |
| 19 | nav blurb and v2 subtitle in the old voice / describing another feature. | defect in shared files | patches listed above, not applied | — |
| 20 | screenshots at 1440×900 and 390×844. | pending | not run this round (browsers owned elsewhere) | — |

## vision confirmation — 2026-10-26

screens: final3-d-memory.png and final3-m-memory.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: with memory off the room says so and says how to turn it on; knowledge/patterns/growth tabs and search render.
