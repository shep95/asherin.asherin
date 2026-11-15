# Browser security headers

The enforced policy lives in `vercel.json`; `index.html` carries the compatible
meta policy for static hosts. Neither permits `unsafe-inline` for scripts or
styles. The app's styles are external CSS; React still sets individual CSSOM
properties for measured positions, sizes, and animation variables.

`scripts/cspStylesPlugin.ts` removes Sonner 1.7.4's runtime CSS insertion in
production because `src/main.tsx` loads its official external stylesheet. The
plugin fails the build if that dependency's insertion format changes. It also
adapts react-style-singleton's measured scroll-lock CSS to constructed stylesheets,
preserving reference counting and cleanup without accepting inline style markup.
This requires a browser with constructed stylesheet support (current Chrome,
Edge, Firefox, and Safari). Review these adapters when upgrading dependencies.

Vercel's default wildcard CORS is overridden with the canonical public origin,
`https://www.asherin.com`. The apex domain and previews continue to load their
own same-origin resources. This setting concerns reads of this site's responses;
it does not prevent the workspace from calling configured model providers.

The first-party service worker is intentional and stays enabled for offline WASM
and background message handling. Its presence in a passive audit is an
informational attack-surface observation, not evidence of hijacking. Public pages
and the worker remain network-updated under the existing cache policy.

## Verification (2026-11-15)

- Production build and TypeScript check passed.
- Three CSP regression tests cover dependency upgrades, stylesheet lifecycle,
  enforced/meta policies, and CORS.
- Full suite: 832 passed; three failed in PDF extraction and timezone handling.
  The same three failures reproduced on the original commit, d6f0d3d.
- Changed-component lint findings match the original commit; new plugin/tests lint clean.
- Browser smoke check with the production headers: landing, dashboard, onboarding
  dialog open/close, and embedded globe loaded without browser console errors.

These checks do not establish absence of server-side or business-logic flaws.
