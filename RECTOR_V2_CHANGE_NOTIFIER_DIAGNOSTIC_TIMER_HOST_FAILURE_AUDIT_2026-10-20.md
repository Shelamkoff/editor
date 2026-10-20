# Rector v2 — ChangeNotifier diagnostic containment and timer-host failure audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `28aca6ded3ffc1ff5e106ca92a2276808e321544`  
**Scope:** `core/ChangeNotifier.js`, `core/ChangeNotifier.test.js`, `shared/invokeObserver.js`.

## Contract and selection

Continued the stability and v1 feature-capability audit of Rector v2 after recent `ExtensionRegistry` lifetime fixes. Scanned `core/DocumentIngestion.js` and its call sites, `core/CanonicalTransforms.js`, the current `DocumentRuntime` tune normalization path, and reviewed `ChangeNotifier` and its tests. No code was changed in DocumentIngestion or CanonicalTransforms because this pass did not establish a new source-backed correctness failure in those interfaces.

The active `RECTOR_V2_REMEDIATION_SPEC.md` requires **P4** (committed editor changes cannot be invalidated by observers) and **I7/P5** (revoked async/timer contexts cannot perform new work or retain resources). Change notifications are best-effort observers of committed data; logging and timer-adapter failures must not change transaction success, create stale saves, or prevent owner teardown.

## Finding NOTIFIER-DIAGNOSTIC-1 — throwing console reporter rejected notification callbacks (P2)

The existing notifier already isolated asynchronous `saveFn()` and `onChange()` errors, and routed configured error sinks through `invokeObserver()`. But the no-sink branch called `console.warn('[ChangeNotifier] Failed to save or notify:', err)` directly. A throwing console adapter replaced the underlying save/observer error and **rejected the timer's own async callback**, inviting unhandled rejections.

### Reproduction and fix

The actual prior `ChangeNotifier.js` code was executed with an explicitly throwing `console.warn`. A failed save produced the error `logging failed` from the notification timer callback, rather than safely settling. Added one public contract regression covering both failing `saveFn` and synchronous throwing `onChange` with a throwing warning adapter.

Wrapped both direct diagnostic console invocations in best-effort try/catch. A failure to report a diagnostic cannot reject the notification task.

- [RED test](https://github.com/Shelamkoff/editor/commit/d3cd6ce5a4cb451ea33373f72a7b2cd2ffd70f3e)
- [Production correction](https://github.com/Shelamkoff/editor/commit/9ca23f4242c837acd6df16e622385e83eea438fb)

The new test failed with the old code and passed with the fix.

## Finding NOTIFIER-TIMER-CLEAR-1 — throwing owner timer cancellation blocked next edit or teardown (P2)

The notifier atomically detached the old timer handle and incremented its generation before calling the host's `clearTimeout`, correctly preventing a queued older callback from owning later saves. However, any synchronous error thrown by `clearTimeout` escaped `schedule()` or `destroy()`:

- It prevented `schedule()` from installing a successor timer and could propagate from the committed-editor notification path.
- It caused `destroy()` to throw even though the timer lease was already revoked.

Two regressions first failed on the previous source. The fix best-effort contains cancellation adapter failures in the three lease cleanup paths while preserving generation revocation and idempotent disposal.

- [RED cancellation tests](https://github.com/Shelamkoff/editor/commit/c0453f0f761aed63400270ca90bba15c689a639e)
- [Production correction](https://github.com/Shelamkoff/editor/commit/a3e0c0202ed67cc166751a85259da1aecc82ef12)

## Finding NOTIFIER-TIMER-REGISTER-1 — throwing timer registration left an unowned callback authoritative (P2)

A host `setTimeout` implementation can enqueue a callback and then throw before returning its handle. Previously the resulting error escaped `schedule()`. As no handle was published, the callback could not be canceled normally and, if eventually invoked by the host, could still pass the active generation check and save stale data.

### Reproduction and fix

One added test stages a callback inside a throwing `setTimeout`, invokes that queued callback after registration failure, then issues a successful replacement schedule. The desired contract is: no save from the abandoned callback, one current save from the successor, and a reported registration error. Another positive/negative control verifies that a throwing diagnostic console cannot cause a timer-registration failure to escape `schedule()`.

Both tests failed against the previous version. The fix:

1. Wraps `setTimeout` registration in a try/catch.
2. If the failing generation is still current, advances the generation to **revoke any orphan callback** that might already have been queued.
3. Delivers the original scheduling failure through the existing `onError` observer or best-effort `console.warn`.
4. Does not cancel or overwrite a newer generation created reentrantly during the host callback.

This cannot undo synchronous effects if a nonstandard host invokes its timer callback *before throwing*; the guarantee is that any orphaned callback executing **after failed registration** has no authority.

- [RED registration tests](https://github.com/Shelamkoff/editor/commit/6cffc5e55a9f8f06241db84969e9b89cfb596371)
- [Production correction](https://github.com/Shelamkoff/editor/commit/dfda13f1246b1af53ec166da66a1bdb4e6659612)

## RED → GREEN and verification scope

The preexisting `core/ChangeNotifier.test.js` test bodies were retained, covering async save ordering, reentrant timer cleanup, destruction during pending saves, owner timer host selection and error-sink observation. New tests were committed before the corresponding production fixes.

| Test scope | Baseline | After fix |
| --- | --- | --- |
| Throwing console diagnostic | RED (1 new failing test) | GREEN |
| Failing `clearTimeout` operations | RED (2 new failing tests) | GREEN |
| Failing `setTimeout` operations | RED (2 new failing tests) | GREEN |
| **Current whole `ChangeNotifier` focused file** | not one unified historical baseline | **20/20 passed** |

Executed the **exact fetched production and test bodies** in a deterministic isolated JavaScript/V8 runner with a minimal assertion adapter, a microtask-based timer substitute where tests require native timers, and the real source of `shared/invokeObserver.js`. This is source-backed regression evidence, **not** native `node --test`, npm/TypeScript, actual browser window timers or a proof of whole-package stability. The harness's fake timers cover callback ownership deterministically but cannot validate browser scheduling delays.

## Required full acceptance

Run on the current branch from a complete installed checkout:

```sh
npm ci
node --test core/ChangeNotifier.test.js shared/invokeObserver.test.js shared/invokeObserver.thenable.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
```

In Chromium, verify a real editor's debounced `onChange` after ordinary edits, repeated rapid changes, async save overlap, destroy/re-create lifecycle and an unavailable or detached owner timer realm. Confirm stale notification callbacks cannot fire after an editor is removed, and that fatal producer errors still fail the correct document operation rather than being swallowed as diagnostics.

**Outcome:** three confirmed timer/diagnostic ownership failures fixed with five new regressions, **20/20 scoped source-backed tests green**. Full v1/v2 feature parity and Rector v2 release readiness remain **unverified**.
