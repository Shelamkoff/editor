# Rector v2 — clipboard import ownership and history continuation recheck

**Date:** 2026-10-18  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Audit starting head:** `3d744ac5413edf8a10eff67a03ec4489f1fc7304`  
**Behavioral reference:** Rector v1 `master` at `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

This audit extends the prior Code Paste and conversion parity work to **all built-in/custom rich-text clipboard importers**, public HTML import fallback selection, and async URL metadata history grouping. No legacy adapter or migration support was added.

## Confirmed defect 1 — clipboard rich-text conversion shared a mutable payload (P2)

`core/ClipboardPlans.js:materializeClipboardRichText` passed one mutable `ConversionPayload` instance to each candidate's `canImport()`. A rejected importer could mutate the candidate's author HTML and cause a later importer to save the altered text. This helper also accepted truthy nonboolean/Promise decisions, called importer `import(payload)` without the owning document (unlike the newly updated conversion contract), and did not independently enforce synchronous imported data.

**RED source execution:** a rejected importer overwrote `Expected author text` with `POISONED`, which the next importer stored. A string return and a Promise from `canImport` were accepted as if `true`.

**Fix:** each extension callback receives its own cloned author payload. `canImport` must return a synchronous boolean, `import` must complete synchronously, and the accepted importer receives a frozen narrow `{ownerDocument}` context. Allocation occurs only after the import completes.

- [Test commit](https://github.com/Shelamkoff/editor/commit/bb69f69055c3119adb4713e4169621a4019c2279)
- [Source fix](https://github.com/Shelamkoff/editor/commit/84949a5f4004347675cb301ea5ba1e36e0876575)

**Focused GREEN:** 3/3 checked-in test bodies executed in a V8 harness using the final extracted production method, actual `cloneJsonValue` and actual `synchronousResult`. An independently validated fixture checks mutation isolation, frozen owning context, nonboolean decisions, asynchronous acceptance and importer returns, and allocation-before-failure. This is not a full Node test-run claim.

## Confirmed defect 2 — HTML fallback conversion had the same mutation leak (P2)

`core/HtmlImportRouter.js:materializeRichText` already enforced boolean/synchronous completion and supplied `ownerDocument`, but shared the exact same `payload` object across multiple candidates. A rejecting conversion importer could alter the HTML seen by subsequent importers.

**RED source execution:** a rejected candidate rewrote `Expected author text` to `POISONED`, and the accepting candidate imported `POISONED`.

**Fix:** clone the payload individually for `canImport()` and `import()`. No change to registered root capability precedence or other HTML normalization rules.

- [Real-browser public API regression fixture](https://github.com/Shelamkoff/editor/commit/98faade37a7fa717c81b4e04551db3a23c63db35) added to `tests/browser/html-root-parity.js`.
- [Production fix](https://github.com/Shelamkoff/editor/commit/df11d0f9b300e420fd54dc7dde0bb5ab0b99f0e3).

**Focused GREEN:** executed the final public `prepareHtmlImport()` with two `<div>` roots in a controlled DOM adapter. The rejecting importer could not change either `First` or `Second` in the resulting two blocks. The browser fixture has been committed but not executed in native Chromium during this pass.

## Confirmed defect 3 — history continuation used string-based JSON order (P2)

`HistoryStore.compatibleContinuation` compared the complete previous-after and next-before snapshots using `JSON.stringify()`. Canonical objects can have different property insertion order without changing JSON meaning. A genuinely adjacent asynchronous link-preview metadata completion then became a second Undo step if a normalization/reconstruction had reordered the object keys. The repository already uses the shared order-insensitive `equalJsonValue` for comparable canonical document equality decisions.

**RED source execution:** an author URL edit followed by metadata with an identical but reordered `before` record produced `coalesced=false`. A distinct stale record was correctly rejected.

**Fix:** use `equalJsonValue(prior.after, update.before)` for the already-owned JSON snapshots, retaining value, own-key, type and array-order sensitivity and all existing origin/token/replay protections.

- [Tests](https://github.com/Shelamkoff/editor/commit/d24b31534bb5d7943cd1e1fe512710816dd29598)
- [History fix](https://github.com/Shelamkoff/editor/commit/8c46edd797b317df5084c724db1c0e0faf376813)

**Focused GREEN:** 16/16 existing plus new `HistoryStore.test.js` and `HistoryStore.continuation.test.js` test bodies passed in an isolated V8 harness using actual `HistoryStore` and `jsonData` source. No full transaction/browser/IME sweep was performed.

## Structural follow-up

Examined direct conversion invocation sites in `DocumentRuntime`, `SelectionConversionPlans`, `ClipboardPlans`, `HtmlImportRouter`, `DocumentIngestion`, `CanonicalTransforms`, `PublicEditorApi`, `ClipboardController`, `BlockReconciler`, `createEditorRuntime`, and `ExtensionRegistry`. The remaining principal `conversion.import()` sites now apply synchronous completion, per-candidate payload isolation, and the owning document argument.

No claim is made for third-party callbacks intentionally mutating supplied live DOM nodes inside `matchesRoot()`; JavaScript extension purity is still a cooperative public contract, not a sandbox guarantee.

## Verification boundary and acceptance

The V8 harness executed exact checked-in production functions and selected test bodies after adapting static ESM imports. Controlled DOM implementations do not simulate real browser selection, Trusted Types enforcement, native clipboard, OS IME, or actual webpack/Vite/package resolution. The container cannot resolve `github.com` to perform a clean repository checkout; edits were committed via the authenticated GitHub connection.

From the **final branch HEAD**, execute sequentially:

```sh
npm ci
node --test core/ClipboardPlans.importOwnership.test.js core/HistoryStore.test.js core/HistoryStore.continuation.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In the browser, exercise structural/multi-root HTML Paste through real ClipboardEvents and a configured default Code block; test Undo/Redo for a plugin-pasted rich-text block, early rejected importers, and late link-preview metadata with reordered but semantically equal author snapshots.

**Status:** three source-confirmed regressions fixed; all reported focused cases pass after fixes. Exhaustive v1/v2 native gesture parity, browser-engine matrix, heap gate, installed package and full project test gates remain unverified.
