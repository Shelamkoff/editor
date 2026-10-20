# Rector v2 — ZIP runtime selection and archive Blob URL ownership audit

**Date:** 2026-10-20  
**Repo:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `f8c5009fe2a3b9fff6cdc77df40d0279d28b018b`

## Scope and contract

Continued the stability/feature-parity audit of Rector v2 after document/history snapshot revocation. Examined `shared/zipRuntime.js`, `shared/highlightRuntime.js` (its already fixed analogous provider-precedence pattern), `renderer/renderers/attaches/index.js`, renderer attachment tests and `RECTOR_V2_REMEDIATION_SPEC.md`. Required invariants include **P5** (owner-window, URL/resource safety), **I7** (revoked asynchronous context must not acquire successor authority), and robust resource disposal after failures. No legacy API or document migration was introduced.

## ZIP-RUNTIME-1 — stale lazy JSZip import overwrote explicit injection (P2)

### Reproduction

The prior `loadZipRuntime()` cached a Promise and unconditionally assigned its eventually loaded constructor to the module-level `runtime`. A later `setZipRuntime(PreferredZip)` was therefore overwritten when the first import completed. Additionally, `setZipRuntime(null)` left the resolved Promise cached, so a subsequent load returned the old provider while `getZipRuntime()` remained null.

Executed the **actual previous source** with a controlled dependency import:

- Pending import, then explicit provider, then import completion: **the stale import replaced the preferred provider**.
- Reset after a resolved load: **the old cached Promise returned without restoring the current runtime**.

These defects are relevant to renderer attachment ZIP export, which awaits `loadZipRuntime()` before constructing `JSZip`.

### Fix

- A monotonically increasing provider-selection revision distinguishes active imports from superseded ones.
- Explicit injection/reset revokes the previous pending/resolved load lease.
- A late import resolution returns a newer selected provider without overwriting it.
- A retired import's rejection can resolve to a newly installed valid provider, while an active import's real rejection remains observable.
- A load Promise clears its cache on settle only if it is still the current lease.
- `setZipRuntime(null)` is documented in its JSDoc type.

### RED/GREEN evidence

The new `shared/zipRuntime.test.js` tests cover explicit injection, reload after reset, reset during import and concurrent-request deduplication. Against the previous source in **individually isolated** runs, **3/4 cases failed for the targeted defects**; concurrent deduplication remained green. Against updated production source, **4/4 passed individually and together** with a controlled JSZip import. These are real source-body tests with a dependency importer adapter; full Node resolution of the installed package was not executed.

Commits:
- [Regression tests](https://github.com/Shelamkoff/editor/commit/70ce7bb8c33234fb7d06dc89b5e3e7bf8782c0a1)
- [Production fix](https://github.com/Shelamkoff/editor/commit/5bece453fc5960b2f9532a53ce58b6ecf4c89248)

## ARCHIVE-URL-1 — failed ZIP download publication leaked a Blob URL (P2)

### Reproduction

After `URL.createObjectURL(blob)`, `downloadArchive()` previously allocated an anchor, set its href, clicked it, then scheduled `revokeObjectURL()`. Any synchronous error from DOM link allocation, attribute publication, click dispatch or timer registration skipped revocation entirely. This leaked a temporary Blob URL even though no valid export completed.

The previous actual code was exercised with a controlled owning-window DOM: `createElement('a')` threw after a Blob URL was created; **the thrown error was propagated but no URL was revoked**.

### Fix

- Introduced one idempotent `releaseUrl()` closure per generated object URL.
- Keep deferred revocation on a successful click to preserve browser download lifetime.
- Revoke immediately if link creation, URL attribute publication, click, or timer registration fails.
- Contain revocation failures so cleanup does not replace the primary operation error or escape a timer.
- Invoke the timer on its owning window, preserving the owner-realm call context.
- Corrected one existing test to restore the previous ZIP runtime even when that runtime was `null`, preventing cross-test pollution.

### RED/GREEN evidence

Added one regression test that exercises four failure configurations: anchor allocation, click dispatch, timer registration, and click dispatch when `revokeObjectURL` itself throws. Every path requires **one** revocation attempt, while retaining the original failure.

Evaluated the previous and current exact archive function bodies together with the **six actual `renderer/renderers/attaches/index.test.js` test bodies** in an isolated V8 harness. The harness supplied minimal `Response`, `AbortController`, `Blob`, ZIP constructor, URL and DOM adapters:

| Archive checks | Previous source | Updated source |
| --- | --- | --- |
| Existing plus new renderer/ZIP tests | **5/6 passed** | **6/6 passed** |
| New URL-ownership regression | **RED** (first anchor-allocation case) | **GREEN** (all four failure configurations) |

These checks are **not** native Node/Chromium. The new four-path test stops at its first assertion failure in the RED run; only the first path is independently evidenced against the old implementation, while all four pass on the new implementation.

Commits:
- [Regression test and null restoration](https://github.com/Shelamkoff/editor/commit/043e27723be5260e6e44ef5ec707157e1187f51e)
- [Production resource fix](https://github.com/Shelamkoff/editor/commit/67da6dcf2976222d77087263b62a22a6791b7116)

## Verification boundary and required acceptance

The GitHub connector accepted source, test and report commits on the intended branch using SHA-protected file updates. Native `node --test`, `npm test`, TypeScript, browser heap/clipboard/download and package tests **were not run** in this session because a complete installed checkout was unavailable. No declaration of complete v1/v2 behavioral parity, ZIP download compatibility across browsers, or release readiness is made.

From a complete checkout of the latest branch:

```sh
npm ci
node --test shared/zipRuntime.test.js renderer/renderers/attaches/index.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
```

In native Chromium, validate download success, URL revocation after download, fast abort/teardown, injected ZIP constructor precedence during loading, repeated reset/reload, and thrown DOM/timer callbacks. Also run the complete v1/v2 attachment download and file action parity matrix.
