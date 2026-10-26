```
room: asherin.guardian-vault   view id: guardian-vault   files: src/components/dashboard/GuardianVaultView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

files this narrative covers (all exclusively imported by this room, confirmed with `grep -rln`):

- `src/components/dashboard/GuardianVaultView.tsx` — shell, tabs, loaders
- `src/components/dashboard/guardian/DeviceOverview.tsx` — overview tab
- `src/components/dashboard/guardian/VaultKeyCard.tsx` — lock / unlock / add / change / remove passphrase
- `src/components/dashboard/guardian/DeviceTrail.tsx` — trail tab
- `src/components/dashboard/guardian/DeviceNotifications.tsx` — notifications tab
- `src/components/dashboard/vault/VaultItemsPanel.tsx` — items + watchtower tabs
- `src/lib/guardian/deviceSecurity.ts` — every reader and every pure decision
- `src/lib/security/vaultItems.ts`, `src/lib/security/watchtower.ts`, `src/lib/security/totp.ts` — item store, exposure/reuse/age logic, local totp
- `src/test/guardianDeviceSecurity.test.ts` — unit tests

shared modules it reads but does not own: `src/lib/local/keys.ts` (key vault), `src/lib/encryption.ts` (device data key, `ENC:` envelope), `src/lib/local/db.ts` (`onTableChange`), `src/lib/local/postgrest.ts` (query shim), `src/lib/local/auth.ts` (device identity), `src/pages/Dashboard.tsx` (wiring), `src/lib/navIntents.ts`, `src/lib/dashboard/v2Titles.ts`.

## purpose & promise

guardian vault is the device-security room of the local edition. there is no account, so there is nothing to say about sessions, logins, factors or passwords; what the room reports is true of this device: how the key vault is locked and the controls to change that (`VaultKeyCard.tsx`), which provider keys the device holds by name and date, never the secret (`DeviceOverview.tsx:87-109`), what is ciphertext at rest and under which key (`DeviceOverview.tsx:112-128`), the sealed items it stores and the watchtower review of them (`VaultItemsPanel.tsx`), the trail of what the device did to itself (`DeviceTrail.tsx`), and what this browser can notify about with no server behind it (`DeviceNotifications.tsx`). the promise on screen is one line: "device security, held on this device" (`GuardianVaultView.tsx:126`). every number on the overview is read from a real module at mount, and nothing in the room sends anything off the device except one opt-in exposure check that sends a five-character hash prefix (`watchtower.ts:57`).

## entry & navigation

- sidebar group "keep", nav intent `view: "guardian-vault"` (`src/lib/navIntents.ts:261`). the intent's label, blurb and keywords are still account-era ("Passwords, TOTP, sessions, and activity", keyword "mfa", "sessions") — shared file, patch proposed below.
- rendered from `src/pages/Dashboard.tsx:2031` through `gatedView(...)`, whose description string still says "Sessions, MFA, audit trail … Included on every paid plan." — shared file, patch proposed below. `canAccess` lets the room through on a device; the description is only shown by `RetiredRoom` when it does not.
- v.2 shell title: `src/lib/dashboard/v2Titles.ts:19` — "vault / locked storage, sessions and factors." — shared file, patch proposed below.
- in v.1 the room draws its own heading "guardian vault" and the one-line promise (`GuardianVaultView.tsx:125-126`); in v.2 it renders only the refresh action into the shell slot via `V2Action` (`GuardianVaultView.tsx:119`).
- what loads first: the overview tab (`useState<VaultTab>("overview")`, `GuardianVaultView.tsx:49`), with a skeleton while `loadAll` runs (`GuardianVaultView.tsx:155-161`). there is no deep link to a tab and no url state; the tab is react state only.
- other rooms reach settings from here with `window.dispatchEvent(new CustomEvent("aureon:navigate", { detail: "settings" }))` (`DeviceOverview.tsx:31`), which `Dashboard.tsx:640` listens for. settings opens on its "you" tab; the wipe control is on "privacy" — the copy says so (`DeviceOverview.tsx:184`). a tab hint would need a settings patch (proposed below).

## workflow

happy path — read the device:
1. mount → `loadAll` (`GuardianVaultView.tsx:84-88`) runs three readers in parallel: `readVaultFacts` (`deviceSecurity.ts:43` → `vaultLockState` + `listProviderKeys` from `keys.ts:214,121`), `readEncryptionFacts` (`deviceSecurity.ts:134` → head-count queries on `messages` and `vault_items` plus a localStorage scan for whiteboard envelopes), `readTrail` (`deviceSecurity.ts:244` → `audit_log`, newest first, 200 rows).
2. overview renders four tiles (key vault state, provider key count, chat sealed n/m, this device id prefix + minted-ago) (`DeviceOverview.tsx:38-66`), the vault card, the provider-key list, the at-rest table, the recommendations from `recommend()` (`deviceSecurity.ts:164`), the five most recent trail lines and the "wipe this device" pointer.

vault verbs (`VaultKeyCard.tsx`):
- lock now → `lockVault()` (sync, `keys.ts:278`), trail row `vault_locked`, toast "vault locked" (`VaultKeyCard.tsx:60-65`).
- unlock → `unlockVault(pass)`; false → trail row `vault_unlock_failed` and inline error "that passphrase did not open the vault." (`VaultKeyCard.tsx:50-58`).
- add a passphrase lock → two fields must match, 8+ chars, `enablePassphrase` (`keys.ts:245`), trail `passphrase_enabled` (`VaultKeyCard.tsx:67-71`).
- change passphrase → `changePassphrase(current, next)` (`deviceSecurity.ts:85-98`): proves the current one with `unlockVault`, then `disablePassphrase` + `enablePassphrase`; a failure between the two steps throws a message that says the vault is now in device mode and to add a lock again.
- remove lock → `disablePassphrase(pass)` (`keys.ts:284`), trail `passphrase_disabled`.
- every verb ends with `onChanged()` → `loadVault()`; the vault also emits `VAULT_EVENT` which the view listens to (`GuardianVaultView.tsx:96`), so a change made in settings → intelligence shows here without a refresh.

items (`VaultItemsPanel.tsx`, mode "items"):
- new item → pick kind (login / secure note / card / authenticator / api token), label (max 120), fields per kind → `createVaultItem` seals `JSON.stringify(secret)` with `encryptText` (`vaultItems.ts:102`) and writes a row with label, kind, normalised domain and ciphertext (`vaultItems.ts:103-113`); trail `item_created {kind}` (`VaultItemsPanel.tsx:177`).
- edit → `updateVaultItem`; if the password/token changed, `rotated_at` resets and the exposure verdict is cleared to `unchecked` (`vaultItems.ts:135-140`); trail `item_updated`.
- delete → `deleteVaultItem` (`vaultItems.ts:147`), trail `item_deleted` (`VaultItemsPanel.tsx:199`). no confirm step — see open gaps.
- reveal / hide per item, copy per field (`VaultItemsPanel.tsx:46-66,474-535`); authenticator items show a live 6-digit code recomputed every second (`VaultItemsPanel.tsx:68-100`, `totp.ts:34`).

watchtower (`VaultItemsPanel.tsx:283-370`):
- reuse (`findReuse`, `watchtower.ts:88`), weakness (`passwordStrength`, `watchtower.ts:77`) and age (`ageInDays`, `watchtower.ts:100`) are computed in-page from the decrypted items on every render.
- "run exposure check" is the only network step: for each item with a password or token, `checkPasswordExposure` (`watchtower.ts:47`) sha-1s the secret locally and fetches the five-character prefix range; the verdict is written back with `recordExposure` (`vaultItems.ts:152`); trail `exposure_check {checked, exposed, errors}` (`VaultItemsPanel.tsx:244`). offline → the room says so and does not fetch (`VaultItemsPanel.tsx:219-225`).

trail (`DeviceTrail.tsx`): list, filter chips by `resource_type` (shown only when more than one kind exists, `DeviceTrail.tsx:40`), retry on error.

notifications (`DeviceNotifications.tsx`): read permission → allow (asks the browser) → show a test. that is all a browser can do without a server, and the copy says so (`DeviceNotifications.tsx:71`).

refresh: the header button re-runs `loadAll` (`GuardianVaultView.tsx:109`).

## state & data

| state | lives in | shape | lifetime | leaves device |
| --- | --- | --- | --- | --- |
| `tab` | react | `"overview" \| "items" \| "watchtower" \| "trail" \| "notifications"` | mount | no |
| `vault` | react, read from `keys.ts` | `{ mode, unlocked, keys: {provider,is_active,created_at,updated_at}[] }` (`deviceSecurity.ts:35-39`) | mount; refreshed on `VAULT_EVENT` | no |
| `encryption` | react, counts over local tables | `{ messagesTotal, messagesEncrypted, vaultItems, whiteboardSealed }` (`deviceSecurity.ts:101-109`) | mount; refreshed when `vault_items` changes | no |
| `trail` | react, from `audit_log` | `{ id, action, resource_type, resource_id, details, created_at }[]` (`deviceSecurity.ts:213-220`) | mount; refreshed on `onTableChange("audit_log")` | no |
| `factsError`, `trailError`, `loading` | react | string \| null, boolean | mount | no |
| key vault wrap, keys, prefs, data key | indexeddb `asherin_local_v1` kv store: `keyvault:wrap`, `keyvault:keys`, `keyvault:prefs`, `keyvault:dek` (`keys.ts:25-28`) | aes-256-gcm ciphertext per key; non-extractable `CryptoKey` objects | until wiped | only the decrypted provider key, inside a request to that provider, from other rooms |
| passphrase session key | module memory in `keys.ts` (`sessionKey`, `keys.ts:61`) | `CryptoKey`, non-extractable | until `lockVault()` or the tab closes | no |
| vault items | indexeddb table `vault_items` | `VaultRow` (`vaultItems.ts:29-41`): label, kind, domain in clear; `payload_cipher` is `ENC:` + base64(iv‖ct) (`encryption.ts:151`) | until deleted or wiped | no |
| trail rows | indexeddb table `audit_log` | `{ action, resource_type, resource_id, details }` + shim-added `id`, `created_at`, `user_id` (`postgrest.ts` insert path) | until wiped | no |
| device identity | localStorage `asherin_device_id`, `asherin_device_id_created` (`auth.ts:11,72`) | uuid, iso date | until wiped | no |
| notification permission | browser | `Notification.permission` | browser-managed | no |
| passphrase fields | react (`a`, `b`, `c` in `VaultKeyCard.tsx`) | strings | cleared on success/cancel (`reset`) | no; never written anywhere |
| revealed map, draft, form flags | react in `VaultItemsPanel.tsx` | per-item booleans, `VaultDraft` | tab lifetime | no |
| exposure verdict | `vault_items.breach_status/_count/_checked_at` | `"unchecked" \| "clear" \| "exposed" \| "error"`, number, iso | until the secret changes (reset) | no |

nothing from this room is written and never read: the former `security_notification_prefs` upsert and the per-visit `account_activity_log` "security_review" insert are gone (review log #4, #6).

the whole-device export (`src/lib/local/exportData.ts:9`) includes every local table, so `vault_items` ciphertext and `audit_log` rows travel in the export bundle — ciphertext stays ciphertext; the trail carries counts and kinds only.

## logic

- `describeLock` (`deviceSecurity.ts:49-56`): three fixed lowercase sentences, one per `{mode, unlocked}` state.
- `providerName` (`deviceSecurity.ts:58-77`): proper names for known provider ids, otherwise the id as written.
- `changePassphrase` (`deviceSecurity.ts:85-98`): rejects < 8 chars, same-as-current, wrong current; then disable → enable. the window where the vault is in device mode is two awaited webcrypto calls long and is reported if the second fails.
- `whiteboardSealedState` (`deviceSecurity.ts:121-132`): scans localStorage keys with prefix `aureon-whiteboards-v3:`; null when none, true when every value starts with `ENC:`, false otherwise. never parses the board.
- `readEncryptionFacts` (`deviceSecurity.ts:134-152`): three head-count queries through the shim; `messages` is not scoped to a user (one device, one identity); `vault_items` is scoped by `user_id`. a `like("content","ENC:%")` filter counts sealed rows; `isEncrypted` (`encryption.ts:191`) defines the envelope.
- `recommend` (`deviceSecurity.ts:164-210`): add-passphrase (amber) only when keys exist and mode is device; lock-now (quiet) when passphrase mode and unlocked; plain-messages (amber) when `messagesTotal - messagesEncrypted > 0` (clamped at zero); no-keys (quiet) when no keys; all-clear (good) prepended when nothing amber remains. order is fixed and tested.
- `trailLabel` (`deviceSecurity.ts:238-240`): mapped lowercase label, otherwise underscores → spaces, lowercased.
- `recordTrail` (`deviceSecurity.ts:258-274`): one insert, swallowed on failure — the trail is a record, not a gate.
- `readNotifyState` / `requestNotify` / `showLocalNotification` / `describeNotify` (`deviceSecurity.ts:280-325`): permission read, prompt, show via the service-worker registration when one exists within 1.5 s else `new Notification`, and a sentence per state.
- watchtower: `sha1Hex` (`watchtower.ts:27`), `matchSuffix` parses `SUFFIX:COUNT` lines and tolerates junk lines (`watchtower.ts:36-45`), `passwordStrength` 0–4 heuristic (`watchtower.ts:77`), `findReuse` groups identical secrets by index (`watchtower.ts:88`), `ageInDays` null when never rotated or unparsable (`watchtower.ts:100`). only `password` or `token` fields are checked (`secretOf`, `VaultItemsPanel.tsx:42`); notes, cards and totp seeds are not.
- totp: rfc-6238, base32 decode that strips spaces, dashes and padding (`totp.ts:8-24`), 64-bit counter split across two `setUint32` (`totp.ts:50-51`), `extractSeed` pulls `secret=` from an `otpauth://` uri (`totp.ts:70`).
- `normalizeDomain` (`vaultItems.ts:58-68`): lowercases, adds `https://` when no scheme, strips `www.`, requires a dot, caps at 253.

edge cases handled: missing `asherin_device_id_created` or epoch zero → "unknown" (`DeviceOverview.tsx:24-28`); unparsable `created_at` → "time unknown" (`DeviceTrail.tsx:92`); `audit_log` rows without a string `action` are dropped (`deviceSecurity.ts:251`); sealed items (ciphertext this device cannot open) render as sealed with the ciphertext intact (`vaultItems.ts:82-85`, `VaultItemsPanel.tsx:503-507`).

## integrations & network

exactly one outbound call exists in this room:

| call | where | method | payload | timeout / abort | retry | offline | key |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `GET https://api.pwnedpasswords.com/range/<5 hex>` | `watchtower.ts:57-60` | GET, header `Add-Padding: true` | the first five characters of the sha-1 of one password, nothing else | 8 s via `AbortController` (`watchtower.ts:54`) | none; the verdict is recorded as `error` and the item says "last check could not reach the range service." | `navigator.onLine === false` → not contacted (`watchtower.ts:49-51`, `VaultItemsPanel.tsx:219`) | none; the endpoint is unauthenticated |

it runs only when the operator presses "run exposure check" (`VaultItemsPanel.tsx:299-306`), once per item with a password or token, sequentially. nothing else in the room calls `fetch`, `supabase.functions.invoke`, or any host. the former `security-notify` edge-function calls (push enrolment, device list, test push, event report) are gone with `src/lib/securityPush.ts` no longer imported (review log #7). `emitPull` (`VaultItemsPanel.tsx:168,184,200,212,237`) writes a connect trace to the local store, not the network.

## security & privacy

threat model: the adversary is whoever can read this browser profile (another local user, malware, a stolen laptop), a hostile page on another origin, and the range service.

- key handling: provider keys are aes-256-gcm under the vault key (`keys.ts:99-108`); in device mode that key is a non-extractable `CryptoKey` in indexeddb (`keys.ts:88`), in passphrase mode it exists only aes-kw-wrapped under a pbkdf2-sha256 key, 310 000 rounds (`keys.ts:29,221-230`). this room never calls `getProviderKey`; it lists metadata only (`deviceSecurity.ts:43-47`) and the copy says the secret is never shown (`DeviceOverview.tsx:108`).
- passphrases: react state in `VaultKeyCard.tsx`, cleared by `reset()` on success or cancel; never logged, never written, never in a trail row. inputs are `type="password"` with `autoComplete` hints so password managers behave (`VaultKeyCard.tsx:105,118-119,139-141,154`).
- vault items: secrets live only inside `payload_cipher`; the clear columns are label, kind and domain (`vaultItems.ts:29-41`). decrypted secrets stay in react state while the tab is open and are masked until revealed (`VaultItemsPanel.tsx:474`).
- device data key (`getLocalDek`, `keys.ts:305`) is the same key for chat messages, whiteboards and vault items; it is non-extractable and is not wrapped by the passphrase. a passphrase lock protects provider keys, not items or chat — the overview's at-rest table names the key for each row so this is visible (`DeviceOverview.tsx:114-120`). see open gaps.
- injection surfaces: labels, domains and notes are rendered as text nodes in react; the domain is normalised through `URL` (`vaultItems.ts:58-68`). trail `details` values are stringified by `detailLine` (`DeviceTrail.tsx:17-23`); the room writes only counts and kinds there.
- clipboard: `CopyButton` writes a revealed field or a live totp code to the clipboard on an explicit click (`VaultItemsPanel.tsx:56`); nothing is copied without a click.
- what a hostile range response can do: nothing beyond a wrong count — `matchSuffix` parses integers and ignores malformed lines (`watchtower.ts:36-45`).
- what a hostile page on another origin can do: nothing to indexeddb or localStorage (same-origin); `aureon:navigate` is a same-window event.
- export leakage: the settings export includes `vault_items` ciphertext (opaque without this device's data key) and `audit_log` (counts/kinds).
- the device id prefix on the overview (`user.id.slice(0, 8)`) is the local identity, not a secret.

## failure modes

| failure | what the operator sees |
| --- | --- |
| indexeddb unavailable / vault read throws | overview still renders; key-vault and provider-key tiles show "—" with "could not be read"; keys section and recommendations say so; a `role="alert"` block with the message and "try again" replaces the vault card (`GuardianVaultView.tsx:171-181`, `DeviceOverview.tsx:37-45,89-91,132`) |
| encryption counts fail | counts fall back to zeros silently (`GuardianVaultView.tsx:66-73`); the tiles read "—" for chat when there are no messages |
| trail read fails | overview recent list shows the empty text; trail tab shows a `role="alert"` with the message and "try again" (`DeviceTrail.tsx:59-67`) |
| trail write fails | swallowed; the action it recorded still completed (`deviceSecurity.ts:271-273`) |
| wrong passphrase on unlock | inline error + `vault_unlock_failed` trail row (`VaultKeyCard.tsx:50-58`) |
| passphrases differ / too short | inline error; submit disabled below 8 chars (`VaultKeyCard.tsx:67-71,78-82,124,146`) |
| change passphrase fails after the old lock is removed | inline error naming the state: vault in device mode, add a lock again (`deviceSecurity.ts:91-97`) |
| items decrypt fails for a row | the row is shown as sealed with intact ciphertext; edit refuses with a toast (`VaultItemsPanel.tsx:142-148,503-507`) |
| items load fails | "the vault did not load." + message + "try again" (`VaultItemsPanel.tsx:268-280`) |
| exposure check offline | toast "offline" and no fetch (`VaultItemsPanel.tsx:219-225`) |
| exposure check unreachable / 4xx / timeout | item verdict `error`, toast "n could not be checked — the range service was unreachable." or "nothing could be checked" when every item failed (`VaultItemsPanel.tsx:246-251`) |
| nothing to check | toast "nothing to check / no stored passwords or tokens yet." (`VaultItemsPanel.tsx:210-218`) |
| invalid base32 seed on a totp item | "seed is not valid base32" in place of the code (`VaultItemsPanel.tsx:91`) |
| notifications unsupported / denied | sentence per state, no button (`DeviceNotifications.tsx:56-66`, `deviceSecurity.ts:318-325`) |
| test notification refused by the browser | destructive toast with the state sentence (`DeviceNotifications.tsx:40`) |
| no local user | the view renders nothing (`GuardianVaultView.tsx:106`) — unreachable on a device, `useAuth` always mints one (`auth.ts:89`) |

no path shows a blank, a raw stack or an unbounded spinner: the only spinner is the refresh icon while `loading` (`GuardianVaultView.tsx:110`), bounded by `loadAll`.

## interface & accessibility

- layout: header with heading (v.1) or the shell slot (v.2), then a horizontally scrollable tab row, then a `ScrollArea` body capped at `max-w-4xl` (`GuardianVaultView.tsx:117-153`). gutters are `px-4` on phone and `px-6` from `sm` (`GuardianVaultView.tsx:117,153`).
- phone (390): tiles are two per row (`grid-cols-2 sm:grid-cols-4`, `DeviceOverview.tsx:72`); the at-rest rows stack what/how vertically (`flex-col sm:flex-row`, `DeviceOverview.tsx:122`); watchtower tiles go 2 → 3 → 5 (`VaultItemsPanel.tsx:309`); the tab row scrolls sideways with `scrollbar-hide`. the trail row's timestamp line wraps under the label.
- desktop (1440): four tiles across, at-rest rows two-column with the explanation right-aligned at ≤ 60 % width.
- focus order: refresh → tabs → panel content; every interactive control has `focus-visible:ring-2` (`GuardianVaultView.tsx:109,140`, `VaultKeyCard.tsx:16-21`, `DeviceTrail.tsx:49`, `DeviceNotifications.tsx:59,64`).
- semantics: tabs are `role="tab"` with `aria-selected` inside `role="tablist"` (`GuardianVaultView.tsx:133-147`); the body is `role="tabpanel"` labelled by the tab id (`GuardianVaultView.tsx:153`); sections carry `aria-labelledby` headings (`DeviceOverview.tsx:87,112,130,153,174`); errors are `role="alert"`; the notification state line is `aria-live="polite"` (`DeviceNotifications.tsx:56`); skeletons are `aria-busy` (`GuardianVaultView.tsx:156`, `DeviceTrail.tsx:70`, `VaultItemsPanel.tsx:260`); icons are `aria-hidden`; every input has an `aria-label` or placeholder-matching label.
- contrast: body text uses `text-foreground` / `text-foreground/80-90`; the quietest explanatory lines are `text-muted-foreground/35-40` at 10 px, which is the house style for footnotes and sits below aa for body text — acceptable for tertiary notes, not for anything the operator must read to act (those are `/50` or higher).
- motion: `animate-pulse` on skeletons and `animate-spin` on the refresh icon only; no entrance animation.
- copy case: every string in the room's files is lowercase except proper names (OpenAI, Have I Been Pwned, Pwned Passwords); the `uppercase` tailwind class was removed from every heading the room owns.
- empty states: provider keys none, trail nothing recorded, items nothing stored, watchtower nothing stored — each tells the operator what would fill it.
- loading states: overview skeleton, trail skeleton, items skeleton.

## performance

- mount cost: three parallel reads — `vaultLockState` + `listProviderKeys` (two kv reads), two head-counts over `messages` (one table load into the shim's in-memory cache, then filtered in memory), one head-count over `vault_items`, one scan of localStorage keys, one `audit_log` read of up to 200 rows. the `messages` table is the only potentially large read; it is the same cached array the chat room keeps.
- listeners: `VAULT_EVENT` on `window`, `onTableChange("audit_log")`, `onTableChange("vault_items")` — all removed in the effect cleanup (`GuardianVaultView.tsx:93-104`). `focus` listener in notifications, removed on unmount (`DeviceNotifications.tsx:20-24`).
- timers: one `setInterval(1000)` per visible authenticator item, cleared on unmount (`VaultItemsPanel.tsx:87-88`); copy-button reset timeouts cleared on unmount (`VaultItemsPanel.tsx:49`); the exposure fetch's 8 s abort timer cleared in `finally` (`watchtower.ts:71`); the service-worker lookup race of 1.5 s (`deviceSecurity.ts:303`).
- items and watchtower each mount their own `VaultItemsPanel`, so switching between those two tabs re-reads and re-decrypts every item (`VaultItemsPanel.tsx:115-128`). fine at tens of items; see open gaps for hundreds.
- no workers, no media, no large lists beyond the 200-row trail.

## copy & voice

- lowercase throughout the room's own files; proper names keep their case. no "Guardian Vault" title case remains in files the room owns (the nav intent and dashboard description are shared — patches below).
- no account-era words remain in the room: no session, login, sign-in, mfa, factor, password-change, "your account", "upload", "server". the items panel used to say "Sealed with your account key before upload" and "The server stores ciphertext only" — now "sealed with the device data key before the row is written … nothing leaves this device" (`VaultItemsPanel.tsx:379-381`).
- the model is not named in this room; nothing says "shepherd" because nothing here talks to the model.
- "kernel offline" does not appear: every state has a device answer.
- the one thing the room cannot do is said plainly in lowercase: "which sites leaked a given email address needs a paid Have I Been Pwned key, which asherin does not hold. that check is unavailable rather than guessed." (`VaultItemsPanel.tsx:363-365`); and "nothing can reach this device while asherin is closed: there is no server to send a push …" (`DeviceNotifications.tsx:71`).

## tests & proof

unit tests — `src/test/guardianDeviceSecurity.test.ts` (11 tests, vitest, jsdom + fake-indexeddb):
- `describeLock` sentences (`:38`), `providerName` (`:44`), `recommend` ordering and tones for device-with-keys, no-keys, unlocked, plain rows, clamping (`:50-71`), `whiteboardSealedState` over a fake storage (`:73`), `trailLabel` (`:85`), `describeNotify` every state + `readNotifyState` unsupported in jsdom (`:90`).
- `recordTrail` → `readTrail` through the real shim: newest first, details intact, visible to the same `audit_log` query the activity room runs (`:99`).
- `readEncryptionFacts` counts sealed vs plain rows and vault items from the real tables (`:112`).
- `changePassphrase` end to end on the real `keys.ts`: rejects short / wrong / same, re-seals the stored key, old passphrase stops opening, new one opens (`:126`).

existing coverage this room leans on: `src/test/keyVault.test.ts` (lock/unlock semantics), `src/test/localShim.test.ts` (query shim defaults and `like`).

verification run on 2026-10-25: `npx tsc --noEmit -p tsconfig.app.json` reports no errors in any file this room owns (remaining errors are in sentinel/zali/asher files other agents are editing); `npx eslint` on the room's files: 0 errors, 0 warnings; `npx vitest run`: 568 passed, 1 failed — `src/test/shepherdArchitecturePrompt.test.ts`, which does not import anything from this room (prompt doctrine work in flight elsewhere).

screenshots: not taken this round — playwright and the dev server are owned by other processes. the "confirmed" boxes in the status block stay empty until the 1440×900 and 390×844 captures are read by eye.

## open gaps

- a passphrase lock protects provider keys only. chat messages, vault items and whiteboards are sealed under the device data key (`keys.ts:305`), which is not wrapped by the passphrase; anyone who can run script on this origin in this profile can read them. the at-rest table says which key each row is under so this is not hidden, but the room cannot change it — it would be a `keys.ts` design change.
- "last used" for a provider key is not recorded anywhere (`StoredKey`, `keys.ts:41-48`); the overview shows saved-ago and says so (`DeviceOverview.tsx:108`). patch proposed below.
- the trail is written only by this room. nothing else on the device writes `audit_log`, so the activity room's "actions logged" count is this room's actions.
- the exposure check contacts a third party (api.pwnedpasswords.com) with a hash prefix. an on-device alternative would need a bundled list of the most common password hashes; not done.
- which sites leaked a given email address: unavailable, said on screen.
- delete item has no confirm step; a mis-click removes the row (ciphertext and all).
- items and watchtower re-decrypt everything on each tab switch; fine at tens of items.
- the "wipe this device" pointer opens settings on its first tab, not on privacy; the copy guides, a tab hint would need a settings change (patch proposed).
- `wipeEverything` (`exportData.ts:24`) deletes `asherin_local_v1` but not the legacy `aureon_e2e_db` (`encryption.ts:18`), which may still hold pre-migration device-key material on old installs; `wipeKeyMaterial` (`encryption.ts:199`) exists but is not called by the wipe. shared-file gap.
- `src/lib/securityPush.ts` is now imported by nobody; it is account-era (push enrolment through an edge function) and can be deleted.

## review log

| # | finding | kind | fix | confirmed by |
| --- | --- | --- | --- | --- |
| 1 | overview showed "Active sessions 0 · Recent logins 0 · Failed attempts 0 · MFA status Disabled" from `user_sessions`, `account_activity_log` and `supabase.auth.mfa.listFactors()`, none of which can be non-empty on a device; recommendation "Enable Multi-Factor Authentication … your account" pointed at a tab that was hidden (`LOCAL_HIDDEN`) so the button did nothing | defect | overview rebuilt from `readVaultFacts`, `readEncryptionFacts`, `readTrail` (`deviceSecurity.ts:43,134,244`); recommendations from `recommend()` (`:164`) | unit tests `:50-71`; tsc/eslint |
| 2 | three tabs ("Active Sessions", "MFA", "Password") were defined with ~500 lines of handlers for GoTrue calls the local auth shim answers with "not part of asherin local" | defect (dead controls, server calls) | removed with the state, imports (`useStepUp`, `reauthenticateWithPassword`, `supabase`) and the qr image fetched from `api.qrserver.com` | grep: no `mfa`, `password`, `session` in room files |
| 3 | "Audit Trail" read `account_activity_log`, a table only this room and `sessionTracker` ("Signed in from …") wrote; the room also inserted a "security_review" row on every visit, so the trail was a visit counter | defect | trail now reads/writes `audit_log`, the table asherin.activity shows (`ActivityView.tsx:47`); visit logging removed; rows carry action/resource_type/details (`deviceSecurity.ts:244-274`) | unit test `:99` |
| 4 | notifications tab saved `security_notification_prefs` (email / sms / push toggles) that nothing on the device reads — state written and never read | defect | tab reduced to what the browser can do: permission, allow, test (`DeviceNotifications.tsx`) | unit test `:90`; grep |
| 5 | "Alert devices" enrolment called `security-notify` for a vapid key; the local handler answers `{ok:true}` with no `publicKey`, so "Enable" always failed with "Alert service is not configured yet." and "Send test alert" would report "sent to 0 devices" | defect (server call, false success) | removed; copy states there is no server to push (`DeviceNotifications.tsx:71`) | grep: no `invoke(` in room files |
| 6 | `security_notification_prefs` and `account_activity_log` inserts carried `user_id` from `useAuth` and `is_current` session rows — account-era rows written into the device store | defect | all removed | grep |
| 7 | `src/lib/securityPush.ts` (edge-function push) imported for five functions | defect (server calls) | no longer imported; left in place as a shared file, flagged for deletion | tsc |
| 8 | items copy: "Sealed with your account key before upload", "The server stores ciphertext only", "encrypted before upload", "this account key could not open the envelope" | wrong claim (code↔copy) | device wording (`VaultItemsPanel.tsx:379-381,468,505`) | read |
| 9 | watchtower computed a `weak` list but never showed it (eslint: assigned, never used) | defect | "weak" tile added (`VaultItemsPanel.tsx:314`) | eslint 0 warnings |
| 10 | exposure check ran while offline and reported every item as "service unreachable" after 8 s each | defect | offline guard before the loop and inside `checkPasswordExposure` (`VaultItemsPanel.tsx:219`, `watchtower.ts:49`) | read |
| 11 | capitalised copy across the room ("Overview", "Run check", "Stored Items", "Try again", toasts, placeholders, KIND_LABEL) and `uppercase` tailwind headings | defect (doctrine) | every string lowercased; `uppercase` classes removed in room files | grep `[A-Z]` on room strings |
| 12 | no way to change a passphrase (settings card offers add/remove only) | defect (promised by brief) | `changePassphrase` (`deviceSecurity.ts:85`) + form (`VaultKeyCard.tsx:137-150`) | unit test `:126` |
| 13 | lock/unlock/passphrase changes left no record | defect | each verb writes a trail row (`VaultKeyCard.tsx:39,54,62`) | unit test `:99` pattern |
| 14 | vault facts error would have shown default tiles ("device key", "0 keys") as if true | defect (found in self-review) | `vaultError` prop: tiles read "—/could not be read", recommendations suppressed (`DeviceOverview.tsx:37-45,68,89-91,132`) | tsc |
| 15 | at-rest rows were two columns at phone width, squeezing a long explanation beside a label | defect (phone) | stack below `sm` (`DeviceOverview.tsx:122`) | read; screenshot pending |
| 16 | trail tab had no loading state; tabs had no tabpanel | defect (a11y) | skeleton (`DeviceTrail.tsx:69-73`), `role="tabpanel"` (`GuardianVaultView.tsx:153`) | read |
| 17 | narrative v1 claimed "chat and tables are encrypted at rest"; only `messages.content`, `vault_items.payload_cipher` and whiteboards are `ENC:`; other tables are plain rows | wrong claim | narrative corrected; the at-rest table on screen says the same (`DeviceOverview.tsx:120`) | read of `postgrest.ts` insert path (no encryption) |
| 18 | shared copy still account-era: `Dashboard.tsx:2031-2037` description, `navIntents.ts:261-267` blurb/keywords, `v2Titles.ts:19` subtitle | defect (shared) | not edited; exact patches below | — |

## proposed patches to shared files (not applied)

re-read immediately before writing this; line numbers are from that read.

**`src/pages/Dashboard.tsx:2031-2037`**
```
-          "Guardian Vault",
-          "Sessions, MFA, audit trail, encrypted item storage, and Watchtower exposure review. Included on every paid plan.",
+          "guardian vault",
+          "device security: the key vault, sealed items, watchtower review and the device trail.",
```

**`src/lib/navIntents.ts:261-267`**
```
-    label: "Guardian Vault",
-    codename: "Vault",
-    blurb: "Passwords, TOTP, sessions, and activity — contents never enter chat",
-    keywords: ["vault", "password", "secret", "mfa", "totp", "sessions", "activity"],
+    label: "guardian vault",
+    codename: "vault",
+    blurb: "key vault, sealed items, authenticator codes and the device trail — contents never enter chat",
+    keywords: ["vault", "password", "secret", "passphrase", "totp", "authenticator", "trail", "device security"],
```

**`src/lib/dashboard/v2Titles.ts:19`**
```
-  "guardian-vault": { title: "vault", subtitle: "locked storage, sessions and factors." },
+  "guardian-vault": { title: "vault", subtitle: "the key vault, sealed items and the device trail." },
```

**`src/lib/local/keys.ts:41-48,121-134`** — record last use so the overview can show it
```
 interface StoredKey {
   provider: string;
   iv: number[];
   ct: number[];
   is_active: boolean;
   created_at: string;
   updated_at: string;
+  last_used_at?: string;
 }
…
-export async function listProviderKeys(): Promise<{ provider: string; is_active: boolean; created_at: string; updated_at: string }[]> {
-  return (await readKeys()).map(({ provider, is_active, created_at, updated_at }) => ({ provider, is_active, created_at, updated_at }));
+export async function listProviderKeys(): Promise<{ provider: string; is_active: boolean; created_at: string; updated_at: string; last_used_at?: string }[]> {
+  return (await readKeys()).map(({ provider, is_active, created_at, updated_at, last_used_at }) => ({ provider, is_active, created_at, updated_at, last_used_at }));
 }
…
 export async function getProviderKey(provider: string): Promise<string | null> {
-  const row = (await readKeys()).find((k) => k.provider === provider && k.is_active);
+  const keys = await readKeys();
+  const row = keys.find((k) => k.provider === provider && k.is_active);
   if (!row) return null;
   const key = await currentKey();
-  return decryptString(key, row.iv, row.ct);
+  const plain = await decryptString(key, row.iv, row.ct);
+  row.last_used_at = new Date().toISOString();
+  await kvSet(KV_KEYS, keys); // no emit: a read must not look like a change
+  return plain;
 }
```
(then `ProviderKeyFact` in `deviceSecurity.ts` gains `last_used_at?` and the overview row shows "used {since}" — a one-line follow-up in the room.)

**`src/components/dashboard/SettingsView.tsx:127`** — let a room open settings on a section
```
-  const [tab, setTab] = useState<SettingsTab>("you");
+  const [tab, setTab] = useState<SettingsTab>(() => {
+    try {
+      const hint = sessionStorage.getItem("asherin:settings-tab");
+      sessionStorage.removeItem("asherin:settings-tab");
+      return hint === "privacy" || hint === "intelligence" || hint === "look" || hint === "spend" || hint === "connections" ? hint : "you";
+    } catch { return "you"; }
+  });
```
(then `openSettings` in `DeviceOverview.tsx:30-32` sets `sessionStorage.setItem("asherin:settings-tab", "privacy")` before dispatching.)

**`src/lib/local/exportData.ts:24-27`** — wipe the legacy encryption db too
```
 export async function wipeEverything(): Promise<void> {
   await wipeKeyVault().catch(() => undefined);
   await wipeLocalDb().catch(() => undefined);
+  await new Promise<void>((resolve) => {
+    try {
+      const req = indexedDB.deleteDatabase("aureon_e2e_db");
+      req.onsuccess = req.onerror = req.onblocked = () => resolve();
+    } catch { resolve(); }
+  });
```

**`src/lib/securityPush.ts`** — delete the file; no importer remains (`grep -rln securityPush src` → none after this change).

## vision confirmation — 2026-10-26

screens: final3-d-guardian-vault.png and final3-m-guardian-vault.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: device key, provider keys, sealed chat and device cards, and the at-rest table render; phone stacks the cards.
