# Security test results — asherin.asherin

- **Date:** 2026-11-22
- **Branch reviewed:** `aureon/wonderful-shannon-nnofrg` (HEAD `36a1fe4`)
- **Scope:** Client-side SPA (Vite + React + TS), Vercel edge middleware/config, CSP,
  secret handling, Supabase client wiring. Backend Supabase edge functions and RLS
  policies live outside this repo and were **not** reachable for testing.
- **Method:** Static analysis against the actual codebase. No destructive or live tests
  were run. Attack "theories" below were derived from the app's real stack and surfaces,
  not from a generic checklist.

## Summary

No exploitable vulnerability was found. The codebase is security-conscious and
holds up against the theories tested. Two minor defense-in-depth items are noted at
the end — neither is exploitable in the current configuration.

## Theories tested (pass/fail per surface)

| # | Theory / attack primitive chain | Surface | Result |
|---|---|---|---|
| 1 | Secret leakage into the client bundle (service-role key, Stripe/AWS/GitHub/Google tokens, private keys) | `src`, `scripts`, `seo` | **PASS** — no live secrets. Only `VITE_SUPABASE_PUBLISHABLE_KEY` (anon, safe to ship) and `VITE_ARVISION_*` URLs. JWT-looking strings are test fixtures and the Cesium vendor lib. No `.env` tracked. |
| 2 | Provider API-key theft from the "device vault" | `src/lib/local/keys.ts` | **PASS** — keys are AES-256-GCM ciphertext in IndexedDB; vault key is a **non-extractable** WebCrypto key (device mode) or AES-KW-wrapped under PBKDF2-310k (passphrase mode). Never in localStorage, exports, or logs. The `api_key` column never returns to the client. |
| 3 | Cross-frame message injection → forged OAuth state / agent execution | `googleConsent.ts`, `AsherPublishedTabRenderer.tsx`, `ArtifactStage.tsx` | **PASS** — OAuth handler validates `event.origin` against an allow-list (`isTrustedAppOrigin`). Sandboxed-iframe handlers (`sandbox="allow-scripts"`, null-origin) correctly guard on `event.source === contentWindow`, the right pattern for opaque-origin frames. |
| 4 | DOM-XSS from attacker-controlled RF environment (malicious BLE/WiFi device name broadcast into the ARVision HUD) → `innerHTML` | `OpticalHudView.tsx` | **PASS** — all RF/BLE/WiFi fields (`t.name`, `d.name`, `wifi.ssid`, `wifi.auth`) flow through `row()`/`list()`, which call a correct HTML-escaper (`esc`) internally. Even if escaping were missed, the CSP (`script-src 'self'`, **no `'unsafe-inline'`**) blocks injected inline handlers and `<script>`. |
| 5 | Stored-markdown / React HTML injection | `ZaliCodeOutputPanel.tsx` and other `dangerouslySetInnerHTML` sites | **PASS** — output is run through `DOMPurify.sanitize()`. Card renderers deliberately avoid raw HTML. |
| 6 | Clickjacking / framing | `vercel.json`, CSP | **PASS** — `frame-ancestors 'none'` + `X-Frame-Options: DENY` globally; `/adam/*` intentionally relaxes to `'self'`/`SAMEORIGIN` for its own embed. |
| 7 | Recon / soft-200 on sensitive paths; scraper/DoS abuse | `middleware.ts` | **PASS (by design)** — `/.git`, `/.env`, `/wp-admin`, etc. 404 before the SPA shell; token-bucket rate limit is explicitly a speed bump, with real enforcement deferred to backend edge functions. |

## Minor hardening notes (not exploitable — informational)

1. **`OpticalHudView.tsx` `paintInbox()` — unescaped interpolation into `<img src>`.**
   `r.jpeg` is placed into `src="..."` without escaping. Today it is always a locally
   produced `canvas.toDataURL()` value read back from this origin's own localStorage, so it
   is not attacker-controlled, and the CSP would block script even if it were. Wrapping the
   attribute value (or asserting a `data:image/` prefix) would close the path fully as
   defense-in-depth.

2. **`OpticalHudView.tsx` line ~1718 — double HTML-escaping of `wifi.ssid`.**
   `ssid` is passed through `esc()` and then again through `list()`'s internal `esc()`,
   so an SSID containing `&`/`<`/`>` renders double-encoded (e.g. `&amp;lt;`). Cosmetic
   display bug, not a security issue. Drop the outer `esc()` on that line.

## What could not be tested here

- **Supabase RLS policies and edge-function authorization** (e.g. `google-oauth`,
  key-vault query shim, agent run resolution) — these enforce the real tenant-isolation
  and live in the Supabase project, not this repo. A full assessment needs read access to
  those policies/functions or a staging project to probe.
- **Dependency CVEs** — not cross-referenced against a live feed this cycle;
  `npm audit` against `package-lock.json` is the fast next step and can be run in CI.
