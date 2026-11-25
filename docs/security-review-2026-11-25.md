# Security test run — asherin.asherin — 2026-11-25

Autonomous cycle. Scope: the actual repository on branch `aureon/wonderful-shannon-xeixs9`.
Method: grounded static review of the real attack surface. No destructive tests, no
live-production probing. No fabricated threat-feed data (see "Honesty note" below).

## Architecture (determines the threat model)

- **Local edition — there is no hosted database.** `src/integrations/supabase/client.ts`
  returns `createLocalClient()`; every `supabase.*` call resolves against a device-local
  store. **This removes the entire server-side vulnerability class** (RLS bypass, IDOR on
  tenant rows, metadata SSRF, service-role leakage). There is no server to attack.
- Static SPA on Vercel + one Edge Middleware (`middleware.ts`): bot/recon filtering and a
  per-IP token-bucket speed bump. Not a security boundary, and it doesn't claim to be.
- AI is **BYOK** (`src/lib/aiProviders.ts`): the user supplies their own Anthropic/
  OpenRouter key; it stays on device and is sent only to the chosen provider. No embedded
  secret.

## What was tested — findings

| # | Surface | Pattern probed | Result |
|---|---------|----------------|--------|
| 1 | Secrets in repo | hardcoded keys / JWTs / service_role / supabase URLs | **PASS** — only matches are JWT *fixtures* in `src/lib/library/__tests__` (a redaction test) |
| 2 | Model-generated tab HTML → DOM | XSS via rendered agent pages | **PASS (strong)** — rendered in `<iframe sandbox="allow-scripts">` **without `allow-same-origin`** (opaque origin: no parent/storage/same-origin access) + per-page CSP; `postMessage` bridge validates `e.source` (`AsherPublishedTabRenderer.tsx`) |
| 3 | `innerHTML` sinks (`OpticalHudView.tsx`) | DOM XSS from data fields | **PASS** — dynamic fields pass through local `esc()`; data is device-local telemetry, not remote |
| 4 | Code-output rendering (`ZaliCodeOutputPanel.tsx`) | XSS via highlighted code | **PASS** — `DOMPurify.sanitize(...)` before `dangerouslySetInnerHTML` |
| 5 | `eval` / `new Function` | arbitrary code execution | **PASS** — none in app code; matches are the app's own vuln-scanner *pattern strings* + one test |
| 6 | `postMessage` listeners | spoofed cross-frame messages | **PASS** — `AsherPublishedTabRenderer` and `ArtifactStage` both check `event.source`; `Dashboard` listens only to same-origin service worker |
| 7 | Vault / at-rest crypto (`src/lib/local/keys.ts`, `src/lib/encryption.ts`) | weak KDF / IV reuse / weak cipher | **PASS** — AES-GCM-256, random 12-byte IV via `getRandomValues`, PBKDF2 **310k** rounds + AES-KW wrap (above OWASP 2023 minimums) |
| 8 | HTTP response headers (`vercel.json`) | missing CSP / clickjacking / sniffing | **PASS** — strict CSP (`script-src 'self'`, no `unsafe-inline`), HSTS preload, `frame-ancestors 'none'`, COOP/CORP same-origin, tight Permissions-Policy |
| 9 | Tab-page CSP injection (`ensureCsp`, `src/lib/zahten/parse.ts`) | network lockdown opt-out | **WARN** — see below |

## The one finding — WARN (low severity, defense-in-depth)

**`ensureCsp()` honors a page-supplied CSP instead of always enforcing the strict one.**

```js
export function ensureCsp(html: string): string {
  if (/http-equiv\s*=\s*["']content-security-policy["']/i.test(html)) return html; // <-- opt-out
  ...
}
```

A model- or operator-authored tab page that embeds its *own* `<meta http-equiv="Content-Security-Policy">`
causes `ensureCsp` to return the page unchanged, so the strict `TAB_CSP` (which forbids
network) is never applied. The page could then declare a permissive CSP and beacon out.

**Why it is low, not high:** the iframe is `sandbox="allow-scripts"` with no
`allow-same-origin`, so the page runs in an opaque origin — it holds no keys, rows, or
identifiers (nothing sensitive crosses the boundary; only the run's own input/output the
user fed it). The blast radius is already contained by the sandbox. This is a
hardening gap, not an exploit.

**Fix (trivial, strictly safe):** drop the early return and always inject `TAB_CSP`.
Browsers enforce the *intersection* of multiple CSPs, so adding a strict policy can only
tighten a page that already has one — never loosen it.

```js
export function ensureCsp(html: string): string {
  const tag = `<meta http-equiv="Content-Security-Policy" content="${TAB_CSP}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${tag}</head>`);
  return `${tag}${html}`;
}
```

## Overall

No critical or high-severity exploitable vulnerability. The app is security-conscious and
well-hardened: local-only data model, opaque-origin sandboxing of untrusted model output,
sound client crypto, strict headers. One low-severity hardening item (#9).

## Honesty note (per operating rules — "never invent data")

This run did **not** ingest NVD / MITRE / CISA / vendor feeds. No live, verifiable feed
access was available to this session, so no CVE-attributed "synthesized patterns" are
reported — fabricating feed data or CVE numbers would violate the rules. The probes above
are standard structural attack classes applied to the real code, which is verifiable. To
enable real feed-grounded synthesis in future cycles, wire a verifiable source (e.g. the
NVD 2.0 API) into the environment and I will cite only what resolves.
