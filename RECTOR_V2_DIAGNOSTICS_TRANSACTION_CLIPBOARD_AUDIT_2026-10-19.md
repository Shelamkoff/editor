# Rector v2 — diagnostic observer authority at save/render and Clipboard Paste/Cut

**Date:** 2026-10-19  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `7378c460f39ef261b2a0a3cd805ad06ecd23ba67`  
**Scope:** `core/DocumentRuntime.js`, `core/ClipboardController.js` and their focused test files. Work was committed directly using the current GitHub blob SHA for each edit, without overriding unrelated agent work.

## Contract and method

The active `RECTOR_V2_REMEDIATION_SPEC.md` requires diagnostics to be content-free observers that cannot change authoring behavior, insert hidden document mutations, interrupt cleanup, or leak rejected promises. `TransactionEngine` already contains telemetry within a temporary `diagnostic-observation` phase and suppresses telemetry exceptions. This pass checked its sibling runtime paths and clipboard async finalizers against the same contract.

Connected GitHub sources were read at current HEAD; checkout-based `npm ci` and full Node/Chromium gates were not available in the executing environment. Only the focused V8 source exercises described below were performed.

## Finding DOC-DIAG-1 — diagnostic sink broke successful save/render (P1/P2)

`DocumentRuntime.save()` and `render()` invoked `diagnostics.now()`, `diagnostics.threshold()`, and `diagnostics.emit()` directly. Those methods were outside the protected `TransactionEngine` observer phase. A throw at the initial clock could prevent saving or rendering; a throw at the final slow-operation callback could replace successful operation completion with an exception **after the document had already changed**.

**RED witness:** extracted the exact old `save()` and `render()` bodies from `6ad91f82` and evaluated them with minimal store/engine adapters in isolated V8. Clock throws and slow-telemetry emit throws produced errors in both methods (four failing outcomes).

**Fix:** add a scoped runtime `#observeDiagnostics` boundary that catches telemetry failure and marks a distinct `#diagnosticObservationDepth`, used by both control and command authority checks. Instrument save/render clocks and slow events through it. Other error-reporting sites — extension preparation, projection edit, validation callbacks and logical selection capture/restore — now use the same protected reporter. Original document errors keep their original result/exception.

- [Tests `deea26f`](https://github.com/Shelamkoff/editor/commit/deea26f73040d78c1c81a0c0bc16a4f49774dcd7)
- [Fix `a970bd6`](https://github.com/Shelamkoff/editor/commit/a970bd6ffc76b412ebb7c3d47e1161a086265e65)
- [Test message refinement `5d13479`](https://github.com/Shelamkoff/editor/commit/5d13479fe3df5b82128111f3c6f4b8b70a2fa32c)

## Finding DOC-DIAG-2 — monotonic clock at zero suppressed real latency events (P3)

Before the fix, both save/render timing checks used `if (startedAt && ...)`; a legitimate monotonic time of exactly 0 was considered absent. The new guard checks for a finite numeric start, so zero is valid, while failed/invalid clocks simply omit a metric.

- [Zero-clock regression `3ca9190`](https://github.com/Shelamkoff/editor/commit/3ca91908917ec4323edbec2802a76fbcb1886f90)

## Finding CLIP-DIAG-1 — Paste telemetry could cancel completion or reject async finalizer (P1/P2)

`ClipboardController` invoked diagnostics directly at owned Paste ingress, at async Paste startup, in error handlers, and in `(async () => { ... })().finally(...)`. A thrown clock could prevent Paste routing. A thrown `threshold`/`emit` during async finalization could reject the finalizer before `#task` was cleared. A failed error report while handling a rejected resolver could itself escape instead of containing the original failure.

**Fix:** add `#observeDiagnostics`, `#reportDiagnosticError` and `#emitSlowDiagnostic` in ClipboardController. When the real runtime supports `observeExtension`, diagnostic callbacks run inside its authoring-denial observation boundary. Replace all eleven direct optional error-emission sites, plus the remaining asynchronous resolver reporter; guard both synchronous and async clock reads and both slow-operation finalizers. After a potentially reentrant clock read, recheck the Paste owner lease. A valid start at time zero now reports the metric. Blob retention and release, selection ownership, and canonical Paste routing logic were otherwise left unchanged.

- [Regression tests `b563196`](https://github.com/Shelamkoff/editor/commit/b5631962467c3ca3bbf125cf8eebe179c1fcebb9)
- [Fix `2302498`](https://github.com/Shelamkoff/editor/commit/23024987f95edf6a6c7241cdfbb30722285312f7)
- [Observer-authority regression `50792eb`](https://github.com/Shelamkoff/editor/commit/50792eb9b68df4d1cb2b032130d284219ffe6083)
- [Zero-origin async timing regression `a02ca86`](https://github.com/Shelamkoff/editor/commit/a02ca864c4d5ec90ebd610565c78404c3d07db9e)

## Focused verification

| Area | Result | Limit |
| --- | --- | --- |
| `DocumentRuntime.js` source | JavaScript syntax parsed successfully after adapting ESM imports; extracted real save/render/helper bodies executed | Stub store and engine, not a full instance |
| Old save/render behavior | Four synchronous telemetry-failure cases reproduced before fix | Minimal isolated V8 adapter |
| Fixed save/render behavior | Six clock/threshold/emit failure cases passed; eight attempted diagnostic reentrant writes denied; original storage failure preserved | Minimal isolated V8 adapter |
| Zero-origin save/render latency | Expected `save.slow` and `render.slow` emitted with finite durations | Minimal isolated V8 adapter |
| `ClipboardController.js` | Actual entire class parsed/evaluated with synthetic clipboard/DOM/AbortController | Not native Chrome clipboard |
| `ClipboardController.media-resource.test.js` | **21/21 test bodies passed** against actual fetched class in isolated V8 with Node-style assertion and AbortController adapters | Not the project's Node test runner |
| Full `core/DocumentRuntime.test.js`, typecheck, browser, docs and package gates | **Not run** | Must run locally against final HEAD |

## Required acceptance commands

```sh
npm ci
node --test core/DocumentRuntime.test.js core/TransactionEngine.test.js core/ClipboardController.test.js core/ClipboardController.media-resource.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium verify a real file clipboard Paste followed by Undo/Redo, a failed provider/resolver and another successful Paste, read-only or editor destruction during an in-flight Paste, and revocation of all uncommitted media resources. For save/render use a test diagnostic sink that throws from its clock, threshold and emission methods and tries a nested public write during observation; after success, check canonical document and history. Repeat with a clock whose first return value is exactly zero.

## Overall conclusion

This pass closes two related diagnostics/ownership boundaries and a zero-timestamp accounting gap with focused regression coverage. It **does not** establish full-library stability, browser-native correctness or total behavioral parity with Rector v1. That judgment still requires the full suite and v1/v2 gesture comparison on the final refactor HEAD.
