room: asherin.cyber   view id: zerlal   files: src/components/dashboard/zerlal/ZerlalView.tsx
narrative version: 1   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)

---

## purpose & promise

asherin.cyber (internal id `zerlal`) is the security room. in the hosted era it was a full cloud
product: upload a repo and a server organ ran a multi-section ai audit, graded the risk, wrote
findings to a database; a second organ ran live domain reconnaissance, port scans, certificate and
whois lookups; a third wrote adversarial exploitation dossiers. the interface still carries all of
that vocabulary — "scan now", "domain reconnaissance", "ghostchain", 18 "intelligence modules",
integrations, scheduled reports, a team roster.

in the local edition there is no server (`src/integrations/supabase/client.ts` → a device-only shim;
`src/lib/local/functions.ts` answers "kernel offline" for anything without a device handler). so the
honest promise of this room shrank hard: it can run the checks a browser tab can do on this device —
static code scanning, log pattern correlation, a device/browser posture check, sigma-rule conversion —
and it can read, triage and export whatever findings already live in the local store. everything that
needed to reach another host, a paid index, a mailer or a server model is offline, and the room now
says so in place instead of pretending.

the top bar wordmark and the screen chrome live in two layers: the shared v.2 shell header
(`src/lib/dashboard/v2Titles.ts:34` → "asherin.cyber" / "passive domain and infrastructure context.")
and the room's own nav (`ZerlalNav.tsx`).

## entry & navigation

- sidebar / command palette: `src/components/dashboard/CommandPalette.tsx:73` ("asherin.cyber", keywords cyber/recon/domain/vulnerability), icon in `DashboardSidebar.tsx:120`.
- deep-link + intent: `src/lib/navIntents.ts:100-108` (view "zerlal", label "asherin.cyber", group "find").
- wired in `src/pages/Dashboard.tsx:2022` `case "zerlal"` via `gatedView(...)`; zerlal is **not** in `RETIRED_VIEWS` (`src/lib/retiredSurfaces.ts`), so `useAccess().canAccess("zerlal")` is always true and the room renders.
- framed window + v.2 shell: `Dashboard.tsx:2457` lists "zerlal" among `data-asherin-room` rooms, so it renders inside the rounded room frame (`src/index.css:1104`) wrapped in `V2PageShell` (`v2TitleFor`).
- first paint: `ZerlalView.tsx` opens on `activeScreen = "dashboard"`; every screen is `React.lazy` (`ZerlalView.tsx:11-31`) so only the active screen's bundle loads. `useZerlalFindings()` reads the local `zerlal_findings` table for the critical-count badge.

## workflow

happy path on this device:
1. dashboard (`DashboardScreen.tsx`) reads local `zerlal_projects` / `zerlal_findings`; empty on a fresh device → honest empty state (`DashboardScreen.tsx:115`) that points to the on-device tools.
2. the working tools (left rail → "intelligence modules"):
   - **code scanner** (`CodeVulnScanner.tsx`) — regex SAST over pasted/typed source, CWE-mapped, fully on-device.
   - **log correlator** (`LogCorrelationEngine.tsx`) — regex threat patterns over pasted logs, on-device.
   - **sigma rules** (`SigmaRuleEngine.tsx`) — converts sigma yaml to splunk/elastic/sentinel/qradar query text, on-device.
   - **device security** (`DeviceSecurityScanner.tsx`) — 19 `navigator`/webrtc/webgl/permission checks on this browser, on-device.
   - **threat feed** (`StixTaxiiFeed.tsx`) — browses a static built-in sample of stix objects (not a live feed).
3. findings that exist in the store are read and triaged in `ProjectView.tsx` / `FindingDetail.tsx`: filter, expand, assign/waive/false-positive/resolve (`useUpdateFinding`), copy/preview/download a plain-text report (`generateFindingReport` / `generateFullReport`, blob download).
4. project delete: `DashboardScreen.handleDelete` → local `zerlal_projects` delete, confirmed by `IdeDeleteConfirm` (now a zerlal-local copy at `./IdeDeleteConfirm`, the old `components/dashboard/ide/` tree was retired).

offline paths (each says so in place, see failure modes): new-scan modal, domain recon, path map, ghostchain, port scanner, cert-transparency, whois, tor/vpn checker, the 18 intelligence modules, integrations, reports, team, settings.

## state & data

- **react**: `ZerlalView` holds `activeScreen`, `selectedProjectId`, `selectedFindingId`, `scanModalOpen/Mounted`, `refreshKey`. screen-local state in each tool (inputs, results).
- **indexeddb (local store, `asherin_local_v1`)** via the postgrest shim:
  - `zerlal_projects`, `zerlal_findings`, `zerlal_scans` — read by `useZerlalProjects/Findings/Scans`, scoped to the device user id. shapes in `types.ts`. empty by default; nothing writes findings on this device any more (the scanner that wrote them was the server organ), so these are a reader over whatever is already there.
  - `zerlal_team_members`, `zerlal_settings` — formerly written by the team/settings screens; those screens are now honest notices and nothing reads these tables (`grep` confirms no other consumer), so they are dead tables.
- **vault**: `ScanModal` formerly read `user_model_preferences` / `user_api_keys` through the key-vault shim to gate scans on a byok key; that gate is gone with the modal rewrite. no screen in this room now touches the vault.
- **leaves the device**: nothing. after the fixes this room makes **zero** `supabase.functions.invoke` and **zero** outbound `fetch` calls. all reads/writes are local indexeddb; all exports are client-side blob downloads and clipboard writes.

## logic

the real on-device logic lives in the working tools and is unchanged:
- `CodeVulnScanner.scanCode` — per-line regex rules → findings sorted by severity.
- `LogCorrelationEngine.analyzeLog` — per-pattern threshold counting, ip/timestamp extraction.
- `SigmaRuleEngine.sigmaToQuery` / `validateRule` — yaml → backend query string.
- `DeviceSecurityScanner.checkOS/Browser/HTTPS/...` — read `navigator`/`screen`/`location`, score safe/moderate/critical, aggregate a 0-100 posture.
- report builders in `ProjectView`/`FindingDetail` — deterministic text assembly from a finding row.

the logic that was **removed as dishonest** (it fabricated results from a hash of the input string and
drew them as genuine): `PortScannerUI.simulateScan`, `CertTransparencyMonitor.generateMockCerts`,
`WhoisTimeline.generateWhoisTimeline`, `TorExitNodeChecker.checkIp`. each took `target.split("").reduce(charCode)`
and produced plausible open ports / rogue certs / registrar history / tor verdicts an operator could not
tell from the real thing. all four are deleted; the screens now state the capability ran on the kernel.

## integrations & network

after the fixes, **none**. the room makes no outbound call. the shim's "kernel offline" fall-through
for `zerlal-exploit-intel`, `zerlal-ghostchain`, `zerlal-path-map`, `zerlal-bg-worker` (`src/lib/local/functions.ts`)
is now unreferenced by this room. the connect-graph tracer (`emitPull`) is no longer called from here
(it was only in the old `PathMapScreen`).

## security & privacy

- **injection surface**: inputs (domain/ip/code/logs) are rendered as text, never `innerHTML`. the only `dangerouslySetInnerHTML` risk the room ever flagged was in scanned code, shown in `<pre>` as text.
- **fabrication**: the four hash-fabricators were the main integrity hole — a defensive tool that invents "suspicious" certs or "tor exit" verdicts is worse than useless, it misleads an operator into action. removed.
- **offensive content**: the old `ExploitIntelTab` generated "how we would take this down" kill-chains, a "live shutdown feasibility test", and live api-key probes via `zerlal-exploit-intel`. none could run locally; the surface was removed entirely (file deleted, exploit tab dropped from `FindingDetail`).
- **secrets**: no key handling remains in the room (the byok gate in `ScanModal` is gone). the vault is untouched here.
- **export leakage**: report copy/download is local-only; findings text is whatever the operator already stored.

## failure modes

every offline capability now renders a single shared honest panel (`KernelOfflineNotice.tsx`): a muted
`CloudOff` tile and two lowercase lines — "<capability> ran on the asherin kernel and is not part of the
local edition." + a plain reason. no blank panel, no raw stack, no forever-spinner, no toast-then-nothing.
screens using it: port scanner, cert-transparency, whois, tor/vpn checker, path map, ghostchain, domain
recon, reports, integrations, team, settings; the 18 intelligence modules carry the same message as a
banner above their (reference-only) feature list; the new-scan modal says it in place and points to the
on-device tools.

residual real failure paths kept honest: project delete failure → toast with the error message;
finding not found → "finding not found" line (not a blank); findings still loading → a spinner that
resolves to data or the empty state (local reads are near-instant and cannot hang on a network).

## interface & accessibility

- desktop 1440×900: 208px left rail (`ZerlalNav`, `w-52`) + action bar + screen body inside the v.2 shell. the room's own top bar no longer repeats the "asherin.cyber" wordmark that the shell header already shows (that duplicate title was a visual error; fixed in `ZerlalView.tsx`).
- phone 390×844: the left rail is a fixed 208px column — on a 390px viewport it consumes half the width and the body is cramped. this is a **known residual** (noted in open gaps): the rail does not collapse to a sheet on phone the way other rooms do. not fixed in this pass (bounded risk vs. a shared-shell change); documented.
- copy: chrome converted to lowercase per the shepherd doctrine — nav labels, section labels, wordmark, the "scan"/"close"/"back" buttons, dashboard headings, the offline notices. the deep working-tool screens (code scanner, log correlator, sigma, device security, threat feed) still carry title-case headings and are flagged as a residual.
- motion: the old scanner progress spinners/cooldown countdowns are gone with the scan apparatus; remaining spinners are short local reads.

## performance

- mount: lazy per-screen; `ZerlalView` only pulls the active screen. the honest offline screens are tiny (a header + one shared notice), far lighter than the fabricators/servers they replaced.
- removed: the whole live-scan apparatus — `scanContext.tsx` (realtime subscription to `zerlal_background_jobs` that mirrored a cloud job and could spin forever), `LiveScanNarrative.tsx`, `useRunScan`'s section/cooldown loop, `ScanModal`'s `JSZip` archive extraction and storage upload. no timers, intervals, channels or workers are created by this room now, so there is nothing to clean up on unmount.
- large lists: findings tables (`BlueprintFindingsTable`, classic view) render whatever is in the store; empty by default.

## copy & voice

- offline notices and rewritten chrome are lowercase, no account-era language, no "shepherd" misuse, and never claim a device answer the room cannot give.
- "Powered by AUREON" footer and the "ZERLAL / Cyber Intelligence Engine" wordmark (account-era brand) → "asherin.cyber / domain + infrastructure context" and "local edition · on this device" (`ZerlalNav.tsx`).
- shared-file residual: `Dashboard.tsx` passes the description "Passive domain reconnaissance and public advisory context. **Available on Asherin Pro.**" to `gatedView` — account-era, title-case. it is only shown by `RetiredRoom` (never, since zerlal is live), so it is dead copy, but it is still account-era language in the tree. patch proposed below (shared file, not edited).

## tests & proof

- `src/components/dashboard/zerlal/__tests__/zerlalOffline.test.tsx` (new): asserts `KernelOfflineNotice` renders its capability/reason, and that the seven offline screens each state "ran on the asherin kernel …" and render **no** fabricated-result vocabulary (Suspicious / typosquat / Tor Exit Node / Residential IP / Open Proxy / REDACTED FOR PRIVACY) and no "scan complete". 8 tests, passing.
- verification: `tsc --noEmit -p tsconfig.app.json` clean for every zerlal file; `eslint` clean on all touched files; `vitest run` 568/569 (the one failure is `src/test/shepherdArchitecturePrompt.test.ts`, a shared-lib test another session is editing — not this room).
- vision pass (desktop/phone screenshots) deferred: the dev server and playwright are owned by another process this session, per the task constraints.

## open gaps (said plainly)

- the phone layout keeps a fixed 208px rail; it should collapse to a sheet at ≤640px. not done this pass.
- the deep working-tool screens (code scanner, log correlator, sigma, device security, threat feed) still use title-case headings and sentence-case body copy; a full lowercase pass over them is pending.
- `StixTaxiiFeed` presents a static built-in sample as a "threat intelligence feed"; it should label the data as a sample more loudly (its CVE entry is already marked "(Hypothetical)").
- `zerlal_projects/findings/scans` can only ever be populated by data imported from the hosted era; nothing on-device writes findings. a future honest feature would route the on-device code-scanner output into the findings store so the dashboard/project/finding views have something real to show.
- dead-but-harmless: `useZerlalData.useRunScan` / `useCreateProject` / `ScanProgress` are no longer imported by anything (the scan modal that used them is now a notice). left in place to keep the shared hook file stable under concurrent edits; safe to delete later.

## review log

| # | finding | kind | fix (file:line) | confirmed by |
|---|---------|------|-----------------|--------------|
| 1 | port scanner fabricated open ports/versions from `hash(target)` and drew them as a real scan | defect (fabrication) | rewritten to honest offline notice — `PortScannerUI.tsx` | tsc/eslint/test |
| 2 | cert-transparency fabricated a "rogue CA" and a "typosquat" cert from the domain string | defect (fabrication) | `CertTransparencyMonitor.tsx` → notice | test asserts no "typosquat/Suspicious" |
| 3 | whois timeline fabricated registrar/transfer history from `hash(domain)` | defect (fabrication) | `WhoisTimeline.tsx` → notice | test |
| 4 | tor/vpn checker fabricated verdict/country/asn/risk from `hash(ip)` | defect (fabrication) | `TorExitNodeChecker.tsx` → notice | test asserts no "Tor Exit Node/Residential IP" |
| 5 | domain recon threw "kernel offline" only after a click, behind a full marketing scanner UI; also the whole `buildFallbackInfrastructureMap` + `InfrastructureMap` + `ExploitIntelTab` subtree was dead | defect (pretends + dead code) | `DomainReconScreen.tsx` → notice; `InfrastructureMap.tsx` deleted | tsc/test |
| 6 | path map called `zerlal-path-map` (shim → kernel-offline) and surfaced it as a toast-then-nothing; also emitted `emitPull` traces for a scan that never ran | defect (server call / pretends) | `PathMapScreen.tsx` → notice | tsc/test |
| 7 | ghostchain called `zerlal-ghostchain`; whole UI (mode/depth/urls, "live key probe") pretended until a click failed | defect (server call / pretends) | `GhostChainScanner.tsx` → notice | tsc/test |
| 8 | exploit-intel tab generated offensive kill-chains / "live shutdown test" / live key probes via `zerlal-exploit-intel`; could never run locally | defect (server call / offensive dead UI) | `ExploitIntelTab.tsx` deleted; exploit tab removed from `FindingDetail.tsx` | tsc |
| 9 | new-scan modal: 3-step wizard + byok gate that implied a key would let the scan run; "run in background & email me" claimed "queued in cloud … we'll email the report" (no worker, no mailer) and the cross-tab `scanContext` mirrored that job as a forever-running spinner | defect (dishonest copy / forever-spinner / server) | `ScanModal.tsx` → honest modal; `scanContext.tsx` + `LiveScanNarrative.tsx` deleted; `ProjectView`/`ZerlalView` decoupled | tsc/eslint |
| 10 | `ZerlalView` top bar repeated the "asherin.cyber" wordmark already shown by the v.2 shell header (duplicate title) | defect (desktop visual error) | `ZerlalView.tsx` — action-only bar, lowercase | code read |
| 11 | integrations: 21 tiles, all "not connected", each with a dead settings button; nothing can connect without a server broker | defect (dead controls / account-era) | `IntegrationsScreen.tsx` → notice | tsc/eslint |
| 12 | reports: 5 report types with dead PDF/CSV/JSON buttons, 2 fake scheduled reports mailed to hard-coded `@aureon.io` addresses, dead Edit / +Schedule | defect (dead controls / account-era / fabricated) | `ReportsScreen.tsx` → notice pointing to the real per-project export | tsc/eslint |
| 13 | team: persisted a roster and toasted "invitation sent" though no email is sent and no second operator can ever exist (device = single operator) | defect (account-era / dishonest) | `TeamScreen.tsx` → notice | tsc/eslint |
| 14 | settings: scan cadence / alert email / slack webhook / auto-remediation / retention all persisted but inert — no scheduler, mailer, webhook or reader of `zerlal_settings` exists | defect (dead controls that pretend) | `SettingsScreen.tsx` → notice | grep confirms no consumer; tsc/eslint |
| 15 | 18 intelligence modules badged ~90 server-era capabilities "Active" (CMMC engine, dark-web monitoring, red-team agent, auto CVE filing, …) — none execute on-device | defect (vaporware / "available"-style) | `IntelligenceModule.tsx` — honest banner + every badge reads "kernel"; title lowercased | code read |
| 16 | `ProjectView` "Create PR with fix" button had no handler | defect (dead control) | removed — `ProjectView.tsx` | code read |
| 17 | `FindingDetail` "Create PR with this fix", "Export to JIRA", "Escalate" had no handlers | defect (dead control) | removed — `FindingDetail.tsx` | tsc |
| 18 | dashboard empty state: "Upload a codebase, ZIP file, or connect a GitHub repository to start scanning for vulnerabilities" implied a working scanner | defect (dishonest copy) | rewritten honest + lowercase — `DashboardScreen.tsx` | eslint |
| 19 | capitalised chrome throughout (nav labels, wordmark, "Security Posture", "Loading…", "Powered by AUREON") vs. lowercase doctrine | defect (copy/voice) | lowercased nav, wordmark, dashboard headings, fallback, buttons; "AUREON" brand dropped | code read |
| 20 | pre-existing `any` + unused imports in `DashboardScreen` surfaced once the file was touched | defect (lint) | typed the delete catch; pruned unused lucide/recharts imports | eslint clean |

### shared-file patches proposed (not edited — outside the room directory)

1. `src/pages/Dashboard.tsx` (`case "zerlal"`, ~line 2022) — drop the account-era, title-case description:

   old:
   ```
           "asherin.cyber",
           "Passive domain reconnaissance and public advisory context. Available on Asherin Pro.",
   ```
   new:
   ```
           "asherin.cyber",
           "domain and infrastructure context, read on this device.",
   ```
   (the string only ever reaches `RetiredRoom`, which zerlal never hits, so this is cosmetic/account-era cleanup; low risk.)

2. `src/lib/navIntents.ts:105` — blurb "domain and infrastructure recon" still implies live recon; suggest "domain and infrastructure context" to match what the room actually does on-device. optional.

3. `src/lib/local/functions.ts` — no change needed. the "kernel offline" fall-through for `zerlal-*` edge names is correct; after this pass the room no longer calls it, so it is simply unexercised by asherin.cyber.

4. `src/index.css:1104` (`[data-asherin-room]`) — no change needed; the room frame is correct. (phone-rail collapse, if addressed, belongs in `ZerlalNav`/the shell, not here.)

## vision confirmation — 2026-10-26

screens: final3-d-zerlal.png and final3-m-zerlal.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: desktop shows the section column and the empty projects state. defect seen and fixed: on phone the section column took half the 390 px width and squeezed every screen into a strip; its labels were 7–8 px at 20–30 % opacity.
- fixed: phone gets a full-width section picker above the screen (`ZerlalNav.tsx`); the column returns from md width; labels raised to 9–10 px at readable opacity. re-checked on the rebuilt screen.
