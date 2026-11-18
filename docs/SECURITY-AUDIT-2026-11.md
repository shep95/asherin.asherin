# security audit — www.asherin.com (2026-11-18)

source: external header scan (B+, 80/100) plus a review of `vercel.json`,
`index.html` and the service worker.

| # | finding | severity | status |
|---|---------|----------|--------|
| 1 | CSP allowed `http://localhost:*`, `http://127.0.0.1:*`, `ws://localhost:*`, `ws://127.0.0.1:*` on every page (A02 · CWE-319) | medium | fixed |
| 2 | no `upgrade-insecure-requests` | low | fixed |
| 3 | meta CSP in `index.html` duplicated the loose policy on every route | low | removed |
| 4 | Radix ScrollArea injected an inline `<style>` the CSP blocked (console error, scrollbars visible in the workspace) | low | fixed |
| 5 | service worker registered without scope or cache rules (A05 · CWE-16, informational) | info | hardened |

## what changed

- **public pages** (`/(.*)`): `connect-src` is `https:`/`wss:` only and the
  policy ends with `upgrade-insecure-requests`. no `http://` source remains.
- **workspace** (`/dashboard*`, `/whiteboard*`, `/auth*`): the only place the
  local model runtimes (Ollama `:11434`, LM Studio `:1234`, the eng box
  `:8768`) stay reachable. chromium does not upgrade loopback requests, so the
  local runtimes keep working there.
- `src/components/CspScopeGuard.tsx`: a document keeps the CSP it was loaded
  with, so an in-app navigation from a public page into the workspace reloads
  that URL once to pick up the workspace policy.
- `scripts/cspStylesPlugin.ts` strips Radix ScrollArea's inline style; the
  rules live in `src/index.css`.
- `src/main.tsx` registers only the first-party `/sw.js`, only in a secure
  context, with `scope: "/"` and `updateViaCache: "none"` so a fixed worker
  always replaces a bad one on the next visit.

## verified

- `npm run build`, `npx vitest run`: 85 files / 837 tests pass, plus 3 new
  tests (`cspStyles`, `cspScopeGuard`).
- production build served with the `vercel.json` headers and loaded in
  chromium: `/`, `/software`, `/blog`, `/for/developers`, `/privacy`,
  `/terms`, `/dashboard`, `/dashboard/settings`, `/whiteboard` — no CSP
  violations, no console errors, injected inline event handlers blocked.

## still informational

a service worker controls the origin by design (offline wasm). it is
first-party, served `no-cache`, and its script is bundled from this repo.
