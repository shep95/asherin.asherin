# asherin.asherin — security synthesis cycle, test results

**date:** 2026-11-26
**target:** `shep95/asherin.asherin` @ `aureon/wonderful-shannon-vk3giu` (commit 36a1fe4)
**stack:** React 18 + Vite 5 + TypeScript SPA, client-side only ("runs on your own device"), deployed on Vercel with edge middleware. No first-party server code in repo; data egress is to Supabase + model endpoints.
**scope:** static review of the client attack surface — file parsers, markdown/HTML render sinks, CSP/headers, upload trust boundaries, and third-party deps cross-referenced against known CVE data.

---

## headline finding

**F-1 — untrusted spreadsheet reaches a vulnerable `xlsx@0.18.5` with no content gate (data-workspace path)**

Severity: **medium** (local-delivery, client-side; CSP limits escalation). Confidence: 0.9. Status: confirmed in code + verified CVE data.

This is a 3-primitive, cross-domain chain:

- **supply chain —** `xlsx` is pinned to `0.18.5` in `package-lock.json`. That is the *last version SheetJS ever published to the npm registry*, and every npm-registry version is vulnerable to:
  - **CVE-2023-30533** — prototype pollution in the workbook parser (`XLSX.read`). Fixed only in **0.19.3**, CDN-only. NVD/GitHub severity 7.8 (High).
  - **CVE-2024-22363** — ReDoS in the parser's regexes. Fixed only in **0.20.2**, CDN-only.
  - There is no npm upgrade that fixes these — the fix tarballs live at `https://cdn.sheetjs.com`.
- **trust boundary / entry vector —** the data-analysis upload path does **not** run the project's own `validateFile()` gate. `src/components/dashboard/data/DataTab.tsx:41` → `handleFile` does a size check only, then calls `parseDataFile()` directly (`:49`). `parseDataFile` (`src/lib/data/parse.ts:344`) dispatches purely on the filename **extension** and hands the raw `ArrayBuffer` to `XLSX.read(buf, …)` (`:132`). No magic-byte check, no MIME check. By contrast `BrainsManager.tsx:141` and `lib/library/library.ts` *do* call `validateFile()` first — so the protection exists but is applied asymmetrically.
- **target layer —** parsing executes in the victim's browser on a file they were handed (emailed/shared "open this in asherin"). CVE-2023-30533 pollutes `Object.prototype`, a classic gadget primitive; CVE-2024-22363 freezes the tab (client DoS). The strict CSP (`script-src 'self' 'wasm-unsafe-eval' blob:`, no `unsafe-inline`) blocks the easy escalation to script execution, which is why this is rated medium rather than high — but prototype pollution can still corrupt downstream app logic that reads `obj[key]` without `hasOwnProperty`, and the ReDoS is a reliable tab-kill.

**kill chain:** attacker crafts a malicious `.xlsx` (valid `PK\x03\x04` header — identical to a real xlsx, so even magic-byte checks wouldn't catch the pollution payload) → delivers to a user → user opens it in asherin.data → `DataTab` skips `validateFile` → `XLSX.read` parses attacker bytes → `Object.prototype` polluted / tab frozen.

**test probe used:** traced every `parseDataFile` caller and every `XLSX`/`sheet_to_json` import (`src/lib/data/parse.ts`, `DataTab.tsx`, `lib/data/live.ts:67`, `lib/acatalepsy/parser.ts:64`). All of them reach the vulnerable `XLSX.read` without a content gate.

**remediation direction:**
1. Replace the registry `xlsx` with a patched SheetJS build (`0.20.3`+ from `cdn.sheetjs.com`, or the community-maintained `@e965/xlsx` mirror which publishes patched versions to npm). This alone closes both CVEs.
2. Route `DataTab` uploads through the existing `validateFile()` (or at minimum its magic-byte + size checks) for parity with the other two upload paths — defense in depth; it won't stop a pollution payload inside a structurally valid xlsx, but it closes the extension-spoofing gap and is free since the function already exists.
3. Consider parsing workbooks inside the existing worker boundary so a ReDoS freezes a worker, not the main tab.

---

## tested clean (probed, no finding)

| surface | probe | result |
|---|---|---|
| markdown render | react-markdown + remark-gfm, no `rehype-raw`, no `allowDangerousHtml` | **pass** — raw HTML in markdown is not rendered |
| `dangerouslySetInnerHTML` (ZaliCodeOutputPanel.tsx:205) | sole React raw-HTML sink | **pass** — wrapped in `DOMPurify.sanitize(...)`, DOMPurify is `3.4.16` (current, patched) |
| OpticalHudView `innerHTML` sinks (7 sites) | source of interpolated strings | **pass** — dynamic fields pass through `esc()` (escapes `& < > "`); structural HTML is static; CSP blocks inline event handlers anyway |
| pdf parsing | `pdfjs-dist` version | **pass** — `6.3.289`, well past the `4.2.67` fix for the CVE-2024-4367 pdf.js RCE; worker served same-origin |
| upload validation (library/brains paths) | `file-security.ts` | **pass** — extension whitelist, blocked-executable set, MIME check, magic-byte check, CSV/Excel formula-injection scan, SVG explicitly disallowed |
| path traversal | `sanitizeStoragePath` / `sanitizeDisplayName` | **pass** — null-byte strip, `..` collapse, chroot to `userId/` prefix with post-check |
| CSP / headers (vercel.json) | header audit | **strong** — `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, HSTS preload, COOP/CORP same-origin, scoped Permissions-Policy. Minor note below. |
| recon / scraper edge filter | middleware.ts | **pass** — recon paths 404; token-bucket rate limit (acknowledged as a speed bump, not a wall, in its own comments) |

### low-severity notes (not findings, worth a glance)

- **N-1 (info):** `connect-src` in the CSP is `'self' blob: data: https: wss:` — effectively any HTTPS origin. For a local-first app that intentionally talks to Supabase + model endpoints this is a deliberate trade-off, but it means a hypothetical injected-script (were CSP ever weakened elsewhere) could exfiltrate to any host. Tightening to an explicit allowlist of the Supabase/model origins would make the CSP a real exfil boundary rather than only a script-source boundary.
- **N-2 (info):** two `file-security.ts` and `data/parse.ts` modules maintain **separate** accepted-extension lists and separate size caps (`MAX_FILE_SIZE` 500MB vs `MAX_UPLOAD_BYTES` 100MB). Not a vulnerability, but the drift is what let F-1's path-asymmetry exist. Worth unifying on one validator.

---

## cycle summary

- **surfaces tested:** file parsers (csv/tsv/xlsx/json/ndjson/parquet/pdf/image-OCR/sql/md), 2 upload paths, 8 DOM/React HTML sinks, CSP + 9 response headers, edge middleware, path sanitizers.
- **patterns applied:** supply-chain-dep × trust-boundary-skip × client-side-parse (F-1); markdown-injection; DOM-XSS-via-innerHTML; path-traversal; formula-injection; CSP-exfil.
- **flagged:** 1 (F-1, medium).
- **clean:** everything else probed.
- **dependency flags vs CVE data:** `xlsx@0.18.5` (F-1). All other security-relevant deps checked (`dompurify 3.4.16`, `pdfjs-dist 6.3.289`) are on patched versions.

*Method note: no live/production testing was performed — this is static source + dependency analysis only, per the no-destructive-testing rule. CVE facts for `xlsx` were verified against NVD, Snyk, and the SheetJS advisories; see the F-1 links. `xlsx` has no NVD-recorded exploit-in-the-wild, so F-1 is rated **emerging**, not observed-in-wild.*
