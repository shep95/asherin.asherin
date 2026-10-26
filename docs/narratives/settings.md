```
room: settings   view id: settings   files: src/components/dashboard/SettingsView.tsx, src/components/dashboard/settings/{tabs.ts, spendRooms.ts, UsageSettings.tsx, IntelligenceSettings.tsx, GoogleAccountsSettings.tsx, DashboardAppearanceControls.tsx}, src/components/dashboard/AIKeysSettings.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

line numbers are as of this review. shared files (Dashboard.tsx, navIntents.ts, v2Titles.ts, ai.ts, index.css, main.tsx) are edited by other rooms concurrently; for those the symbol is the anchor and the line a hint. evidence status per claim: **observed** (read in code), **verified** (unit test), **inferred**, **unknown**.

## purpose & promise

settings is where the operator decides how asherin looks and works on *this device*. there is no account behind it: `useAuth()` hands back a device identity minted once in this browser (`src/lib/local/auth.ts:11-76`, observed) and every row the room writes is scoped to it by the query shim (`src/lib/local/postgrest.ts:439`, observed). the room's one rule, stated in its header comment (`SettingsView.tsx:1-4`): every control on screen is read by something else in `src/`, and the reader is named beside the control. a control nothing reads is not shown — that is what version 1 got wrong (review log #1–#9).

the interface promises six sections — this device · look · intelligence · spend · connections · privacy & data (`settings/tabs.ts:5-12`, verified lowercase) — and under each only things that act: the shell layout and surface (read by Dashboard.tsx), the send-button shape (read by AdaptiveInputBar), provider keys and the model that answers (read by `src/lib/ai.ts` through the vault), memory and learning switches (read by the intelligence orchestrator and asherin.vault), per-room provider off-switches (read by `src/lib/byokInvoke.ts`), google accounts (owned by asherin.google), export and wipe (`src/lib/local/exportData.ts`).

## entry & navigation

- rail: group `account`, label `Settings`, codename `Settings` (`src/lib/navIntents.ts:270-276`) — capitalised; patch proposed below.
- deep link `/dashboard/settings`: `"settings"` is in `VALID_VIEWS` (`src/pages/Dashboard.tsx:164`) and rendered by `case "settings"` (`:2100`) inside `ErrorBoundary` + `Suspense`, lazily (`:40`). other rooms also reach it with `window.dispatchEvent(new CustomEvent("aureon:navigate", { detail: "settings" }))` (`guardian/DeviceOverview.tsx:32`), which Dashboard listens for (`:640`).
- one-shot tab hint: a room writes `sessionStorage["asherin:settings-tab"]` before navigating (`guardian/DeviceOverview.tsx:31` → `privacy`; `ByokRequiredDialog.tsx:56` → `intelligence`). `takeTabHint` (`settings/tabs.ts:34`) reads it once, removes it, and resolves unknown values to the default tab; the legacy hint `you` lands on `device` (`:29`). verified (`settings/__tests__/settings.test.ts` "settings tabs").
- v.2 shell title: `settings` / "account, appearance, security." (`src/lib/dashboard/v2Titles.ts:21`) — "account" and "security" are not sections; patch proposed below. in v.2 the room renders no header of its own (`SettingsView.tsx:188`); in the current shell: `h2 settings` + "how asherin looks and works on this device." (`:190-191`).
- what loads first: the tab strip and the chosen tab render synchronously from localStorage reads (`readAppearance`, `readDashboardUi`, `readWallpaperKey`, `readSendShape`, `:69-72`); the only async reads are the vault lock state (`:93`) and whatever the open tab's child loads. there is no whole-room spinner any more (v1 blocked on two table reads, log #10).

## workflow

**this device** (`:211-260`): read-only facts — the first 8 chars of the device id, where storage lives (`storageIsMemoryOnly()`, `src/lib/local/db.ts:92` → "memory only — nothing survives a reload" when indexeddb was refused), the key vault's mode and key count (`vaultLockState`, `src/lib/local/keys.ts:219`, refreshed on `VAULT_EVENT`), two in-page jumps to privacy and intelligence, and the keyboard shortcuts that have handlers (`settings/tabs.ts:52-61`, verified against `Dashboard.tsx`, `AdaptiveInputBar.tsx`, `CommandPalette.tsx` by the test "lists only shortcuts that have a handler in code").

**look** (`:262-328`):
1. layout `current` / `v.2` → `applyDashboardUi` (`:118`) = `writeDashboardUi` (localStorage `asherin_dashboard_ui` + event, `src/lib/dashboardUi.ts:32`) then the settings row (`persistRow`, `:102`). Dashboard.tsx swaps the `<aside>` live (`:360` `DASHBOARD_UI_EVENT`) and hydrates from the row on load (`:713`).
2. background `wallpaper` / `colour`, swatches, hex, dim veil → `applyAppearance` (`:112`) = `writeAppearance` (`src/lib/dashboardAppearance.ts:163`) + row. Dashboard.tsx repaints on `APPEARANCE_EVENT` (`:361`) and hydrates (`:705`).
3. wallpaper tile → `pickWallpaper` (`:123`): localStorage `aureon_wallpaper`, event `aureon-wallpaper-change` (Dashboard listens, `:364`), exits colour mode, writes the row (`wallpaper` column; Dashboard hydrates it, `:692`). the active tile falls back to `"aureon"` when nothing is stored (`:30-32`), the same default Dashboard seeds (`:311-313`) — v1 compared against `"default"` and marked the wrong tile (log #11). tiles show `wp.thumb` (360w), not the full `src` (log #12).
4. send button shape → `pickSendShape` (`:137`): localStorage `aureon_send_btn_shape` + event `aureon-border-color-change`; AdaptiveInputBar reads both (`:99-105`).

**intelligence**: `AIKeysSettings` then `IntelligenceSettings`.
- keys: expand a provider → `add a key` → step-up if the vault is passphrase-locked (`AIKeysSettings.tsx:107` → `StepUpProvider.tsx:92`) → `upsert user_api_keys` which the shim routes into the vault (`keys.ts:326-358`, never the row store) → `loadData` (`:79`). `replace`, `remove` (`:130`; if it was the answering provider the preference resets to default quietly). pick a model → `updatePreference` (`:142`) → `user_model_preferences` → `setPrefs` (`keys.ts:175`) → `getActiveModel` is what `src/lib/ai.ts:58` resolves on the next message. "answering now" (`:205`) states the explicit choice, or that the single saved key answers (mirrors `getActiveModel`, `keys.ts:197-199`), or that nothing is chosen. `last used …` per provider comes from `last_used_at`, written on every `getProviderKey` (`keys.ts:136`).
- vault lock: `KeyVaultLockCard` (add / unlock / lock a passphrase; `KeyVaultLockCard.tsx`), unchanged.
- memory & learning (`IntelligenceSettings.tsx`): `remember things about me` → `ai_intelligence_settings.memory_enabled`, read by the orchestrator (`src/lib/intelligence/orchestrator.ts:299`) and by asherin.vault's writer and brief (`src/lib/memory/vault.ts:399`, `:531`); `learn from how conversations go` → `learning_enabled`, read by `learningGate.ts:109`, `:174`, `orchestrator.ts:261`, `:317`. add / edit / delete a standing rule, approve or reject a candidate, read procedures and recent decisions — all `src/lib/intelligence/store.ts`.

**spend** (`UsageSettings.tsx`): recorded calls by room and provider over 30 days from `ai_usage_events` (`fetchUsageEvents`, `src/lib/usage/ledger.ts:202`), a headline that is money only when some row carries a cost, otherwise the call count (`:60`, `:114-116`); per-room `on`/`off` and a monthly limit → `tool_api_switches` (`setToolApiEnabled`, `ledger.ts:148`; `setToolBudget`, `:159`). the rooms listed are `spendRooms(GATED_TOOLS, switches, events)` (`:61`, `spendRooms.ts:29`): rooms whose code names itself to the gate, plus any room with a switch row or a recorded call. verified: `GATED_TOOLS` equals the ids found by grepping `src/` for `invokeWithByokRetry` callers that pass `tool:` (test "gated tools match the ids the code passes to the gate").

**connections**: `GoogleAccountsSettings` — tier picker, `add a google account`, list, disconnect with confirm. the oauth logic is asherin.google's (`useGoogleApi`, `useGoogleOAuthCallback`) and is left as is; see **open gaps** #1.

**privacy & data** (`:341-427`): a plain statement of where data is; `export everything` (`exportData`, `:147`: step-up, `buildExportBundle`, `exportData.ts:160`, downloads `asherin-export-<date>.json`); `wipe this device` (`:169`: typed phrase `wipe this device`, step-up, `wipeEverything`, `exportData.ts:175`, then `location.href = "/"`). the decline button is `keep everything`, the same size as the confirm (`:415`).

## state & data

| state | where | shape | lifetime | leaves device? |
| --- | --- | --- | --- | --- |
| tab | react (`:59`), seeded once from `sessionStorage["asherin:settings-tab"]` which is removed on read | `SettingsTab` | mount; the hint one navigation | no |
| chrome layout | localStorage `asherin_dashboard_ui` (`dashboardUi.ts:11`) + `user_settings.dashboard_ui` (IndexedDB table, `persistRow` `:102`) | `"current" \| "v2"` | until changed | no |
| appearance | localStorage `aureon_dash_bg_mode/_color/_dim` (`dashboardAppearance.ts:61-63`) + `user_settings.dashboard_bg_mode/_color` | mode, hex, dim 0–40 | until changed | no |
| wallpaper key | localStorage `aureon_wallpaper` + `user_settings.wallpaper` | key from `ALL_WALLPAPERS` | until changed | no |
| send shape | localStorage `aureon_send_btn_shape` | `"circle" \| "square"` | until changed | no |
| provider keys | key vault kv `keyvault:keys` — AES-GCM ciphertext under a non-extractable device key or a passphrase-wrapped key (`keys.ts:1-20`) | `StoredKey[]` without plaintext | until removed / wiped | only inside the request to that provider (`ai.ts:88` → `llm.ts`) |
| model preference | kv `keyvault:prefs` + localStorage mirror `aureon_byok_active` (`keys.ts:180`, read as a fallback by `ai.ts:63`) | provider, model | until changed | no |
| memory/learning switches, rules, candidates, patterns, decisions | tables `ai_intelligence_settings`, `ai_user_memory`, `ai_memory_candidates`, `ai_pattern`, `ai_learning_event` (`intelligence/store.ts`) | see `intelligence/types.ts` | until deleted / wiped | no (what reaches the model is composed by the orchestrator, not by this room) |
| usage rows, switches | tables `ai_usage_events`, `tool_api_switches` (`ledger.ts`) | `UsageEvent`, `ToolSwitch` | until wiped | no |
| google accounts | asherin.google's (`google_accounts` table never written on a device — see gaps) | — | — | — |
| vault lock state | react, from `vaultLockState()` | mode, unlocked, keys | mount, refreshed on `VAULT_EVENT` | no |
| export bundle | a Blob for one download (`exportData.ts:172`) | json: tables + provider names, never keys, no library blobs | the click | yes — to the operator's downloads folder, by their own act |

the `user_settings` row is written with `upsert … onConflict user_id` (`:102-109`) so it exists for Dashboard's hydration read (`Dashboard.tsx:672`); v1 used `update`, which on a device with no row wrote nothing (log #13). the row is a mirror of localStorage, not the source: a refused write is logged and the live change stands (`:107`).

## logic

- `resolveSettingsTab` / `takeTabHint` (`tabs.ts:29-45`): known key → that tab; `you` → `device`; anything else, a missing hint or a storage exception → `device`. verified.
- `KEYBOARD_SHORTCUTS` (`tabs.ts:52`): eight entries, each with a named handler; `ctrl+n` and `tab (accept autocomplete)` from v1 have no handler anywhere in `src/` and were removed. verified by source grep in the test.
- `spendRooms` (`spendRooms.ts:29`): gated ids first in declared order, then switch-row and event tools, deduplicated and sorted. verified.
- `GATED_TOOLS = ["chat", "asherin-sentinel"]` (`spendRooms.ts:22`): `chat` is `src/lib/intelligence/modelGateway.ts:127` (the orchestrator's model call, not the chat room's direct path); `asherin-sentinel` is `src/lib/sentinel/alwaysOn.ts:426`, `:459` and two google modules. `asherin-health` dropped out of the list during this review because its caller stopped using the gate; the test caught it.
- ledger maths (`bucketBy`, `monthToDateUsd`, `budgetState`, `estimateCostUsd`) are `src/lib/usage/ledger.ts`, tested in `ledger.test.ts`; the room only renders them. money is shown only where `estimated_cost_usd` is non-null (`UsageSettings.tsx:60`), calls with no token count read "tokens not reported".
- appearance: `normalizeHex`, `isLightBackground` (`dashboardAppearance.ts:108`, `:136`): a light colour gets a readable scrim; a 3-digit hex commits on blur only, so the field is not rewritten under the cursor (`DashboardAppearanceControls.tsx:232-239`).
- "answering now" mirrors `getActiveModel` (`keys.ts:192`): explicit non-default preference wins; else a single active key; else nothing.

## integrations & network

- **none initiated by this room.** every read and write is the local shim over IndexedDB (`supabase.from` → `LocalQuery`, `postgrest.ts:226`) or the key vault (`keys.ts`). the provider key leaves the device only when chat sends a message (`ai.ts:88-96` → `llm.ts`), which is not this room's call.
- `GoogleAccountsSettings` → `useGoogleApi.callOAuth` → `supabase.functions.invoke("google-oauth")`, for which the device has no handler (`src/lib/local/functions.ts:182-204`); the answer is the shim's structured "kernel offline" error, which the room rewrites into one sentence (`GoogleAccountsSettings.tsx:81-90`). no bytes leave the device.
- wallpaper tiles load `/wallpapers/*.thumb.webp` from the app's own origin (`src/lib/wallpapers.ts:13`).
- offline: nothing in the room changes offline; every control works without a network.

## security & privacy

- **keys never shown**: the shim strips `api_key` from every `user_api_keys` read (`keys.ts:357`); the key field is `type=password` with `autoComplete="off"` and an explicit reveal toggle (`AIKeysSettings.tsx:300-317`). saving a key is a step-up action (`:107`): with a passphrase vault the operator proves it now; in device mode the device is the proof (`StepUpProvider.tsx:92-96`).
- **export** carries every table but never a key (`exportData.ts:169` lists provider names only) and never library blobs; the copy says both (`SettingsView.tsx:355-357`). export is step-up gated (`:150`) because the bundle is the whole device.
- **wipe** needs the typed phrase and the step-up, then `wipeKeyVault` + `wipeLocalDb` + legacy db + localStorage + caches (`exportData.ts:175-199`). accept and decline have the same visual weight (`:405-424`) — record 050.
- **injection surfaces**: the hex field is validated by an anchored, bounded regex (`dashboardAppearance.ts:100-106`); the standing-rule text is stored and rendered as text; the google error string is bounded to 180 chars and lowercased (`GoogleAccountsSettings.tsx:88`).
- **identity**: the device id's first 8 chars are shown (`:216`); the pseudo-email `<id>@this.device` v1 showed as "Email" is gone (log #3).
- **storage at rest**: everything in this room's tables is plaintext in IndexedDB except the keys (vault) — stated under state & data.

## failure modes

| failure | what the operator sees |
| --- | --- |
| sessionStorage refuses | the default tab, no error (`tabs.ts:34-45`) |
| localStorage refuses on a pick | the live change still happens (events fire); the preference is lost on reload — `try/catch` at `:125`, `:139`, `dashboardUi.ts:35`, `dashboardAppearance.ts:171` |
| settings row write fails | `console.warn`, live change stands (`:107`) |
| vault state unreadable | "0 keys · sealed under a device key…" fallback (`:93`) |
| key vault read fails | `role=alert` "the key vault could not be read — …" + try again (`AIKeysSettings.tsx:172-180`) |
| vault passphrase-locked while saving | the step-up dialog asks for it; cancel leaves the form open; a note under the intelligence tab says the vault is locked (`:429`) |
| save/remove/model error | lowercase destructive toast with the shim's message |
| ledger unreadable | `role=alert` + try again (`UsageSettings.tsx:95-104`) |
| budget not a number ≥ 0 | toast "a limit is a number of dollars, zero or more." (`:79`) |
| google list fails | the list stays empty with "no google account is connected on this device."; the add button answers with the one-sentence refusal inline (`GoogleAccountsSettings.tsx:125`) |
| export fails | toast "export failed — <reason>" (`:161`) |
| wipe fails | toast "wipe failed — <reason>", button re-enabled (`:178`) |
| memory settings load fails | sonner "could not load intelligence settings" (`IntelligenceSettings.tsx:91`) |

no spinner lives longer than its await; the room itself has no blocking load.

## interface & accessibility

- desktop (1440): one column `max-w-2xl`; the tab strip is a `role=tablist` of `role=tab` buttons with `aria-selected` (`:195-208`) — selection is visible, recognition over recall (record 028). each section is one card with icon + lowercase title (`Card`, `:44`). wallpaper tiles 3-up; send-shape two radios.
- phone (390): padding `p-4`, tabs wrap (`flex-wrap`), wallpaper tiles 2-up (`grid-cols-2 sm:grid-cols-3`, `:274`), cards `p-4`, the wipe buttons wrap (`flex-wrap`, `:405`); UsageSettings rows wrap their controls under the label (`flex-wrap`, `:184`). no fixed-width element wider than 358px — inferred from classes, not seen.
- grouping (record 005): within-card spacing `space-y-4` is smaller than between-card `space-y-6`; the destructive wipe sits in its own red-bordered card, the only red on the page (record 041 — one accent, one meaning).
- focus: every control is a native `button`/`input`; radios are `role=radiogroup` + `role=radio aria-checked` (`:274`, `:302`); switches are `role=switch aria-checked` (`IntelligenceSettings.tsx` Toggle, `UsageSettings.tsx:202`); the budget input has an `sr-only` label (`:187`).
- motion: none in this room beyond spinners. (the motion preference card is gone — nothing read it; log #7.)
- copy: lowercase throughout; proper names keep their case (provider names from the catalog, "v.2").
- empty/loading: "nothing recorded yet.", "nothing stored yet.", "no google account is connected on this device."; loading lines are text + spinner, `aria-busy`.

## relationships

| edge | kind | real in code? |
| --- | --- | --- |
| Dashboard.tsx reads layout / appearance / wallpaper | reads_from (events + `user_settings` row) | yes: `Dashboard.tsx:360-371`, `:687-714` |
| AdaptiveInputBar reads send shape | reads_from | yes: `AdaptiveInputBar.tsx:99-105` |
| chat (`ai.ts`) resolves the model and key | reads_from the vault this room writes | yes: `ai.ts:58-96` |
| intelligence orchestrator, asherin.vault read memory/learning switches | reads_from | yes: `orchestrator.ts:261-317`, `memory/vault.ts:399`, `:531` |
| `byokInvoke` reads tool switches, writes the ledger | reads_from / writes_to | yes, but only its callers (`modelGateway.ts`, `sentinel/alwaysOn.ts`, two google modules) |
| guardian vault, BYOK dialog open settings on a tab | depends_on (sessionStorage hint) | yes: `DeviceOverview.tsx:31`, `ByokRequiredDialog.tsx:56` |
| connect renders the same `AIKeysSettings` | owns_state shared | yes: `connect/ConnectView.tsx:377` |
| asherin.google owns google oauth | trusts | yes, and it is offline on a device |
| v2 shell title | verified_by `v2Titles.ts:21` | wrong subtitle; patch below |

## performance

- mount: four synchronous localStorage reads, one `vaultLockState` (two kv reads). the intelligence tab adds five table reads in parallel (`IntelligenceSettings.tsx:78`); the keys card two (`AIKeysSettings.tsx:81`); spend two (`UsageSettings.tsx:42`).
- the provider catalog (~50 providers) is filtered and grouped once per search change (`useMemo`, `AIKeysSettings.tsx:59`).
- timers: none. listeners: `APPEARANCE_EVENT`, `DASHBOARD_UI_EVENT`, `storage`, `VAULT_EVENT` — all removed on unmount (`:81-85`, `:96`).
- wallpaper thumbnails are the 360w variants, lazy and async-decoded (`:286`).

## copy & voice

lowercase throughout; the model is "shepherd" (`AIKeysSettings.tsx:189`, `IntelligenceSettings.tsx` "rules shepherd carries"); the operator is "you" or "the operator", never "account owner"; no "sign in", no email, no profile picture, no plan. "kernel offline" never appears: the only offline organ (google) is explained in one sentence of its own (`GoogleAccountsSettings.tsx:84`). toasts are lowercase sentences. three shared strings still carry the old voice and are patched below (rail label, rail blurb, v2 subtitle).

## tests & proof

- `src/components/dashboard/settings/__tests__/settings.test.ts` — 8 tests: tab resolution and the one-shot hint (read, cleared, refusal-safe), lowercase labels, shortcuts cross-checked against the three handler files, gated tools cross-checked against every `invokeWithByokRetry` caller in `src/`, every gated id a real rail room, `spendRooms` ordering and dedupe.
- the libs this room writes are tested elsewhere: `src/test/keyVault.test.ts`, `src/lib/usage/__tests__/ledger.test.ts`, `src/lib/memory/__tests__/vault.test.ts`.
- `npx vitest run src/components/dashboard/settings src/lib/connect`: 2 files, 18 tests pass. full-suite tail in the report.
- end-to-end step: not driven this round. screenshots: pending.

## open gaps

1. **google cannot be connected on a device.** `connectGoogle` → `google-oauth` edge function → no device handler. the room says so in its header and in the inline refusal, but the `add a google account` button still exists and still fails; the oauth logic belongs to asherin.google and was left untouched (only copy and error wording changed). the honest end state is either a browser-only oauth path in that room or the button's removal there.
2. **spend is mostly empty by construction.** `ai_usage_events` and `tool_api_switches` are consulted only by `invokeWithByokRetry` (`byokInvoke.ts:74-98`), whose callers all go to edge functions the device answers "kernel offline" — so the ledger holds `status: "error"` rows without tokens. the direct provider path (`ai.ts` → `llm.ts`) that really answers chat records nothing and is not gated. the headline says so (`UsageSettings.tsx:120`). patch for `ai.ts` proposed below; `llm.ts` would also need to surface the provider's `usage` object for money to be real.
3. **custom wallpapers are gone.** v1 uploaded to the `custom-wallpapers` bucket and wrote `aureon_custom_wallpaper_url` = a blob: object url that dies on reload; `getWallpaperSrc("custom")` falls back to the default (`wallpapers.ts:46-49`), so a custom photo never showed on the dashboard. a real version needs Dashboard.tsx to resolve `"custom"` from the blob store; sketched below.
4. **motion preference has no consumer.** `src/lib/motionPrefs.ts` writes `data-motion*` attributes on `<html>` but no stylesheet reads them and nothing calls `applyMotionPrefs` at boot. the card was removed; the lib stays for the index.css + main.tsx patch below.
5. **the wipe phrase is typed, not clicked** — deliberate friction for an irreversible act (record 038), and the decline is equal weight (record 050).
6. **no screenshots this round.**

## proposed patches to shared files (not applied)

`src/lib/navIntents.ts` (anchor `view: "settings"`):
```ts
// old
    view: "settings",
    label: "Settings",
    codename: "Settings",
    keywords: ["settings", "preferences", "config", "options"],
// new
    view: "settings",
    label: "settings",
    codename: "this device",
    blurb: "how asherin looks and works on this device — keys, memory, spend, export",
    keywords: ["settings", "preferences", "config", "options", "keys", "export", "wipe"],
```

`src/lib/dashboard/v2Titles.ts:21`:
```ts
// old
  settings: { title: "settings", subtitle: "account, appearance, security." },
// new
  settings: { title: "settings", subtitle: "how asherin looks and works on this device." },
```

`src/lib/ai.ts` — gate and record the direct path (anchor: the start of the chat/complete entry point that calls `resolveActiveModel`; `tool` is the room id, `"chat"` for chat):
```ts
// old
  const resolved = await resolveActiveModel(conversationId);
// new
  const { isToolApiEnabled, recordAiCall } = await import("@/lib/usage/ledger");
  if (!(await isToolApiEnabled(tool))) {
    void recordAiCall({ tool, status: "blocked" });
    throw new Error(`${tool} has its provider switched off in settings → spend.`);
  }
  const resolved = await resolveActiveModel(conversationId);
  // …after the provider answers:
  void recordAiCall({ tool, provider: resolved.provider, model: resolved.model, promptTokens: usage?.prompt ?? null, completionTokens: usage?.completion ?? null, status: "ok" });
```
(`llm.ts` `completeLlm`/`streamLlm` must return the provider's `usage` for the token fields to be non-null; until then rows read "tokens not reported", which is the truth.)

`src/index.css` + `src/main.tsx` — make the motion preference real before restoring the card:
```css
/* index.css, new */
html[data-motion="still"] *, html[data-motion="still"] *::before, html[data-motion="still"] *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
html[data-motion="calm"] * { animation-duration: 0.5s !important; }
html[data-motion-ripple="off"] .ripple { display: none; }
html[data-motion-shimmer="off"] .shimmer { animation: none; }
```
```ts
// main.tsx, before render
import { applyMotionPrefs } from "@/lib/motionPrefs";
applyMotionPrefs();
```

`src/pages/Dashboard.tsx` — custom wallpaper, if wanted (anchor `const activeWallpaper = getWallpaperSrc(wallpaperKey);`):
```ts
// new: resolve "custom" from the local blob store instead of falling back
const activeWallpaper = wallpaperKey === "custom" ? customWallpaperUrl ?? getWallpaperSrc("aureon") : getWallpaperSrc(wallpaperKey);
// where customWallpaperUrl is created once from supabase.storage.from("custom-wallpapers").createSignedUrl(path) on mount
```

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | "Profile Picture — Click to upload · Max 5MB" uploaded to the local blob bucket; `getPublicUrl` returns `data:,` first (`storage.ts:389-397`), so `profiles.avatar_url` was saved as a broken url; nothing in `src/` reads `profiles.avatar_url` | requirements / data | cause | grep `avatar_url` outside SettingsView: google modules only | defect (dead control, account-era) | requirement reconciliation | removed; the device tab shows the identity instead (`SettingsView.tsx:211-247`) | tsc, read |
| 2 | "Display Name" written to `profiles.display_name`; no reader in `src/` | requirements | cause | grep `from("profiles")`: SettingsView only | defect (dead control) | requirement reconciliation | removed | read |
| 3 | "Email b6bd415b@this.device" — the pseudo-email of `auth.ts:16` presented as an account field | semantic / interface | failure | `auth.ts:16` | defect (account-era) | local correction | removed; device id shown as "identity" | read |
| 4 | keyboard list claimed `Ctrl+N new conversation`, `Tab accept autocomplete`, `Esc close modal / stop`; no handler for any of them | semantic | cause | grep in Dashboard.tsx, AdaptiveInputBar.tsx, CommandPalette.tsx | wrong claim + defect | local correction | `KEYBOARD_SHORTCUTS` lists eight wired shortcuts | unit test (source grep) |
| 5 | "Send Button Border" — 28 colour themes written to `aureon_send_border_color`; no reader anywhere (AdaptiveInputBar reads only the shape) | requirements | cause | grep `aureon_send_border_color`: SettingsView only | defect (dead control, 28 accents) | requirement reconciliation | removed; shape radios kept with a neutral preview | read |
| 6 | "Response Preferences → Response Length" wrote `user_settings.response_length`; chat reads `response_depth` (`Dashboard.tsx:687`) | semantic / state | cause | grep `response_length`: none | defect (dead control) | requirement reconciliation | removed (depth is set from chat's selector) | read |
| 7 | Motion card wrote `asherin_motion`; `applyMotionPrefs` is never called at boot and no css reads `data-motion*` | requirements / interface | cause | grep `data-motion`, `applyMotionPrefs`, `rippleEnabled`: no consumer | defect (dead control) | component removal + shared patch proposed | `MotionControls.tsx` deleted; css/main patch above | read |
| 8 | Privacy "Memory enabled / Web search enabled" wrote `user_settings.memory_enabled/web_search_enabled`; memory is read from `ai_intelligence_settings` (`store.ts:42`), web search from nothing | state / semantic | cause | grep | defect (dead + duplicate control) | state consolidation | removed; the privacy tab points at the one memory switch | read |
| 9 | GitHub connect → `functions.invoke("github-api")` → kernel offline; the ide that read `github_connections` is retired (`Dashboard.tsx` case "ide") | dependency | cause | `useGitHub.ts:86`, `functions.ts:182-204` | defect (dead control, raw error) | component removal | `GitHubSettings` removed | read |
| 10 | whole room showed a spinner until `user_settings` + `profiles` loaded; neither was needed for any surviving control | performance / interface | failure | v1 `:199-210` | defect | local correction | no blocking load | read |
| 11 | wallpaper active tile compared to `"default"`; Dashboard seeds and falls back to `"aureon"` (`:311`, `:342`) — a fresh install highlighted the wrong tile | state | cause | both files | defect | local correction | `WALLPAPER_DEFAULT_KEY = "aureon"` (`:30`) | read |
| 12 | tiles loaded full `src` (≤1920w) for a 3-up thumbnail grid | performance | failure | `wallpapers.ts:1-4` | defect | local correction | `wp.thumb` | read |
| 13 | appearance/layout/wallpaper persisted with `update()`; with no row the write matched nothing | state | cause | `postgrest.ts:474-488` | defect | contract repair | `upsert … onConflict user_id` (`persistRow`) | read |
| 14 | "Custom Wallpapers · included" uploaded to a bucket; blob url died on reload; `getWallpaperSrc("custom")` falls back | requirements | cause | `wallpapers.ts:46-49`, `storage.ts:241` | defect (dead control) | component removal + patch sketch | removed | read |
| 15 | "Your Data Rights … permanently delete your account", "Download My Data … profile, conversations, memory, files" — no account; files (blobs) are not in the bundle | semantic | failure | `exportData.ts:160-172` | wrong claim | local correction | copy states what the bundle holds and omits | read |
| 16 | export filename `aureon-data-export-` | copy | failure | v1 `:383` | defect | local correction | `asherin-export-<date>.json` | read |
| 17 | wipe phrase `WIPE THIS DEVICE` and "Cancel" — capitalised; decline weaker than confirm | copy / ethics | failure | v1 | defect | local correction | `wipe this device`, `keep everything`, equal weight | read |
| 18 | `isAdminEmail`, `V2Action`, `v2ActionClass` imported and unused; `hasWallpaperAddon` state set and never read | structural | failure | eslint | defect | local correction | gone with the rewrite | eslint clean |
| 19 | AIKeysSettings "Detected key bindings" read `key-status` expecting `{byok, platform, effective}`; the device handler returns `{present, active, selected}` (`functions.ts:183-197`) → every saved key displayed `provider=no` | semantic / data | cause | both shapes read | defect (false negative on screen) | component removal | block removed; the list below already shows "key saved" and the vault card shows the count | read |
| 20 | "Resolution order: your saved key → platform key → keyless public source → offline", "asherin does not provide a shared/default key" — no provider is `isPlatform` (grep: 0) and there is no platform key path | semantic | failure | `aiProviders.ts` | wrong claim | local correction | copy: a key you add, straight from this device | read |
| 21 | AIKeysSettings copy capitalised throughout; toasts "API key saved … stored securely" | copy | failure | v1 | defect | local correction | lowercase; "sealed in this device's vault" | read |
| 22 | AIKeysSettings `toggleFallback` defined, no control called it | structural | failure | v1 `:191` | defect | local correction | removed | eslint |
| 23 | key vault read errors were swallowed (`keysRes.data || []`) → an empty list read as "no keys" | failure modes | cause | v1 `:114` | defect | local correction | `loadError` + `role=alert` + try again (`:172`) | read |
| 24 | IntelligenceSettings "Contribute anonymised lessons" wrote `global_contribution_enabled`; no reader in `src/` (a device has nowhere to contribute) | requirements | cause | grep `globalContributionEnabled`: store/types only | defect (dead control) | requirement reconciliation | toggle removed | read |
| 25 | IntelligenceSettings "account owner" in stored rationale strings; capitalised labels | copy | failure | v1 `:125`, `:188`, `:190` | defect (account-era) | local correction | "the operator"; lowercase | read |
| 26 | UsageSettings `AI_TOOLS` listed ten rooms; only `asherin-sentinel`, `asherin-health`, `chat` ever named themselves to the gate, and `asherin-health` stopped during this review | semantic / requirements | cause | grep `invokeWithByokRetry` callers | wrong claim + defect | contract repair | `GATED_TOOLS` + `spendRooms` derived list; test fails when code drifts | unit test |
| 27 | UsageSettings headline "spend this month $0.00" when no row has a cost — an invented zero | semantic | failure | `ledger.ts:88-98` writes null cost without tokens | defect | local correction | money only when a cost exists; else the call count and why (`:114-120`) | read |
| 28 | UsageSettings `white/*` hard-coded colours (ignored the theme), no error state, capitalised labels, budget input unlabelled, switch button without `role=switch` | interface / a11y | failure | v1 | defect | local correction | theme tokens, alert + retry, lowercase, sr-only label, `role=switch` | read |
| 29 | GoogleAccountsSettings "Tokens are stored encrypted and scoped to your account only", "Cloud Intelligence", "Asherin merges them" — account-era, model named "Asherin", claims about a server that is gone | copy | failure | v1 `:110-114`, `:232` | wrong claim | local correction (copy only) | header states the device truth; footer corrected | read |
| 30 | GoogleAccountsSettings surfaced the shim's raw "kernel offline" sentence as a destructive error + toast | failure modes / copy | failure | v1 `:90` | defect | local correction (copy only) | `describe()` → one lowercase sentence, `role=alert`, no toast | read |
| 31 | DashboardAppearanceControls doc claimed "only the photo upload add-on is paid"; eyebrow labels CSS-uppercase; "Wallpaper/Color/Current" capitalised | copy | failure | v1 `:26-30` | wrong claim | local correction | corrected | read |
| 32 | settings tab strip had no tablist semantics; selected tab only by colour | a11y | failure | v1 `:412` | defect | local correction | `role=tablist/tab aria-selected` | read |
| 33 | default tab "you" with only shortcuts left after the account fields went | interface | failure | — | defect | component replacement | "this device" tab: identity, storage, vault state, shortcuts | read |
| 34 | rail label/codename "Settings", v2 subtitle "account, appearance, security." | copy | failure | shared files | wrong claim | — (patch proposed) | not applied | — |
| 35 | the direct provider path is neither gated nor recorded, so spend cannot be true for chat | requirements / dependency | cause | `ai.ts`, `llm.ts`: no `recordAiCall`, no `isToolApiEnabled` | defect (shared) | contract repair (patch proposed) | copy states it; patch above | — |

## vision confirmation — 2026-10-26

screens: final3-d-settings.png and final3-m-settings.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: the tabs, the device card and keyboard shortcuts render; the intelligence tab connects a local model end to end.
