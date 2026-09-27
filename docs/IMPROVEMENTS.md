# asherin — what changed, and where your data lives now

date: 2026-09-27 · branch: `claude/friendly-gates-5l9uq4`

## the short version

asherin is now a **local-first application**. there is no hosted database, no edge functions, no sign-in, no subscription and no dependency on lovable.dev. the dashboard opens directly. everything you write is kept in this browser's own store on this device, and the model that answers you is the one you connect, called straight from the browser with a key that is encrypted on the device.

## where your data is

| what | where it lives now | who can read it |
|---|---|---|
| conversations, messages, projects, memory, library, notes, vault items, whiteboards, team workspaces | IndexedDB database `asherin_local_v1` in this browser profile | this browser profile only |
| uploaded files and wallpapers | the same database, `blobs` store | this browser profile only |
| provider api keys | `keyvault` entries: aes-256-gcm ciphertext under a **non-extractable** webcrypto key (device mode) or a key that only exists wrapped under your passphrase (passphrase mode) | this browser profile; with a passphrase, only after you unlock |
| vault/message encryption key (DEK) | a non-extractable webcrypto key in the same database | this browser profile only |
| device identity | one random id in `localStorage` (`asherin_device_id`) — stands in for the old account id | this browser profile only |
| what leaves the device | only the request to the model provider you chose, and reads of public data sources the maps/feeds use | those providers, under their terms |

export or wipe everything from dashboard → settings → data. clearing site data in the browser does the same.

**nothing about you is saved by me or by this session.** the only copies of your project are the git repository and your own machine.

## what was removed

- **backend**: the entire `supabase/` tree — 210 edge functions, 262 migrations, config. no server exists to be attacked.
- **billing**: stripe checkout, webhooks, subscription context, pricing page, plan gates, tier checks in ~40 places, all "$18 / $79" copy, offers in json-ld, team seat billing.
- **auth**: sign-up, login, google oauth via lovable, mfa flows, session tracking, step-up password prompts. `ProtectedRoute` is a pass-through.
- **lovable**: `@lovable.dev/*` packages, the vite mcp/tagger plugins, preview-host auth brokering, the private npm registry pinned in both lockfiles (which is why `bun install` was failing with 403s), lovable-hosted asset pointers (`*.asset.json`), lovable hosts in cors/sentinel/sw guards.
- **forgotten pages**: /pricing, /asher, /asher-dashboard, /updates, /sources, /glossary/*, /feature/*, /ziaassets, /report/:id, /internal/traffic, the lovable oauth consent page, the `asherin.soren` static workspace, two pricing blog posts. old urls 301 to the nearest live page (vercel.json) and in-app.
- **dead code**: an import-graph sweep from `src/main.tsx` removed 530 unreachable source files (retired rooms: azplen, zeeion, zaxin, axrlen, aziion, ghost, shepherd view, asher-gov, ziaassets, aureon-shield, unused shadcn primitives, etc.) and 17 tests that only exercised them.
- **media**: 207 MB of founder videos, 23 MB of pdfs, 13 MB of face-recognition models, unreferenced og images, 0-byte desktop installers, the chrome extension zip, ~6 MB of unreferenced founder illustrations.
- **side projects**: electron shell, capacitor native config, companion app, browser extension, cloudflare worker, `.lovable` plans, `hashtest.ts` (which held operator e-mail addresses in the clear).
- **dependencies**: 46 unused packages (three.js/fiber, chess.js, face-api, electron, capacitor platforms, supabase-js, unused radix pieces, …). lockfiles regenerated against the public npm registry only.

| | before | after |
|---|---|---|
| tracked files | 2,427 | ~880 |
| `src/` | 29 MB · 1,385 files | 14 MB · ~800 files |
| `public/` | 268 MB | 5.5 MB |
| edge functions | 210 | 0 |
| runtime dependencies | 105 | 58 |

## what was built

- `src/lib/local/db.ts` — IndexedDB store: tables, blobs, kv; serialised writes; change notifications.
- `src/lib/local/postgrest.ts` — a postgrest-shaped query builder (`select/eq/in/ilike/or/order/limit/single/upsert/…`) so the ~260 files that used the hosted client keep working unchanged against local rows.
- `src/lib/local/auth.ts`, `storage.ts`, `functions.ts`, `client.ts` — local identity, local buckets, local rpc/realtime shims, and an honest "kernel offline" answer for the tools that needed a server.
- `src/lib/local/keys.ts` — the device key vault (device mode / passphrase mode, aes-gcm, pbkdf2 310k, aes-kw wrapping).
- `src/lib/local/llm.ts` — direct browser → provider streaming for openai-compatible apis (openai, xai, mistral, deepseek, openrouter, venice, perplexity, groq, nvidia, cohere, qwen, zhipu, moonshot, baidu, minimax, maritaca, sarvam, krutrim), anthropic, google gemini, and local ollama / lm studio.
- `src/lib/local/prompts.ts` — the shepherd system prompt assembled on the device (ported from the server).
- `src/lib/ai.ts` — chat, thinking pass, continuation, consensus and suggestions all run locally.
- `src/components/dashboard/KeyVaultLockCard.tsx` — settings → ai keys: passphrase lock on/off, lock now, unlock.
- `middleware.ts` (vercel edge) — blocks ai-training and bulk scrapers by user-agent, rate-limits page loads per ip, answers recon paths (`/.git`, `/.env`, `/wp-admin`, …) with a 404. search engines and link-preview bots are allow-listed.
- `src/lib/consoleGuard.ts` — production console is stripped at build time (esbuild `drop`), prints a single self-xss warning, then goes inert; react devtools hook is stubbed.
- `.claude/skills/shepherd/SKILL.md` — the shepherd data-set installed as a repo skill, so "use shepherd" is available in every future session.

## security fixes applied

- no server-side attack surface remains (this closes every backend finding: unauthenticated paid-api functions, ssrf proxies, open mail relay, cron endpoints without secrets, public analytics table, cors wildcards).
- csp rewritten without `'unsafe-inline'` for scripts (the inline host-redirect script is gone), `frame-src` no longer allows `blob:`/`data:`, connect-src is an explicit provider allow-list; coop/corp/hsts/x-frame-options kept; `frame-ancestors 'none'`.
- generated-code previews run in an iframe **without** `allow-same-origin`; "open externally" became a file download instead of a same-origin top-level blob document.
- raw `innerHTML` in the camera hud and the globe hit-list now escapes ocr/rf/entity text.
- model- and search-provided links go through `safeHref()` (`javascript:` never becomes clickable).
- third-party avatar images are no longer fetched at all (was a proxy; would otherwise leak the device's address).
- the `next` open-redirect and the preview-host session broker are gone with auth.
- `.env` (tracked despite `.gitignore`) and `hashtest.ts` (plaintext operator e-mails) are removed.

## shepherd — interface pass

per the shepherd doctrine ("dark. cold. cinematic. one accent only at trust states. thin lowercase type arriving quietly."):

- **type**: self-hosted Work Sans (body) and Instrument Serif (display) via fontsource; the google-fonts cdn and the unloaded "Inter" reference are gone. tailwind `font-sans/display/mono` tokens set.
- **colour**: `--accent` is now tonal (a lighter layer of the same black), not gold; colour is reserved for `--signal-live` (trust: live / verified / encrypted) and `--destructive`.
- **radius**: one small system radius (0.5rem) instead of pill-everything.
- **motion**: one house easing (`cubic-bezier(0.2, 0.7, 0.2, 1)`) and three durations; `animate-bounce` and `animate-ping` are redefined system-wide as a slow breath and a quiet fade, never a jump; `prefers-reduced-motion` honoured globally; `.arrive` and `.trust-breathe` utilities added.
- **anti-patterns removed**: pricing page that listed features, "coming soon" modules, console spray in production, default-vibe gold accent, cdn fonts, inline scripts.
- **reading rooms redesigned** (`/blog`, every `/blog/<slug>`, the landing overlay): the cream "journal" paper, the serif masthead, the tag chips, the search pill, the refine drawer, the glass cards, the aurora glow, the shimmer headline and the click ripple are gone. what replaced them: layered blacks over the wallpaper, thin lowercase Work Sans at weight 200, hairlines instead of boxes, negative space as the layout, a staggered `arrive` on each masthead line on the one house easing, and the accent shown in exactly one place on the landing page — the rule beside an answer that has arrived. verified in headless chromium at 1440 and 390 wide.
- **anti-pattern audit on those pages**: generic SaaS overlay (chips, pills, cards, drawers) → corrected; consumer glass and glow → corrected; uppercase tracking labels everywhere → lowercase; accent used for decoration (progress bar) → reserved for the trust state; decorative margin glyph and "field notes" stamp → removed; magazine serif costume → removed.

## if the site reloads itself in a loop

three things can make a browser tab reload or redirect on its own, and each is now fenced:

- **host redirects** are no longer done in javascript. the old build redirected `www.asherin.com` to `asherin.com` from inside the page; if the host is configured to redirect the other way, that is an endless loop. set the canonical host once in the hosting dashboard (vercel → domains → make one of the two the redirect) and nothing in the app will fight it.
- **post-deploy chunk recovery** reloads only when the server is serving a different build than the one running, once per served build, and never without a working storage guard.
- **a reload-storm breaker** (`src/lib/bootLoopGuard.ts`) counts boots per tab: more than three inside a minute switches every automatic reload off for the session and lets the error show instead.
- the service worker cache is versioned (`asherin-v4`); activating the new worker deletes every cache an earlier worker left on the origin, so a stale shell from the previous deployment cannot be served. a visitor who still sees the old site should hard-refresh once (or clear site data) so the old worker is replaced.

## honest limits

- rooms that leaned on server-side organs (paid indexes like shodan/virustotal/firecrawl, e-mail, team invitations by e-mail) now report **kernel offline** for that tool. the rest of each room works.
- removed outright rather than left half-working: the search-operator ("dork") battery and its report sections, the defender's paired device agent (defender now measures only what a browser can and marks the rest unmeasured), and the health room's 3d body atlas together with the body-model capture and three.js. the health record, intake, pain, herbs, systems, timeline, live sensing, photo reading and read-out all remain.
- the founder portrait ships with the app under `public/founder/`.
- some model providers do not permit browser calls (cors). openai, anthropic, google, xai, mistral, deepseek, openrouter, venice, groq and the local runtimes do.

## repository

- all of this is on `claude/friendly-gates-5l9uq4` in `shep95/asherin`.
- the same tree is pushed to `main` on the private repo **`shep95/asherin.asherin`**.
