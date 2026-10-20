# Rector v2 — Gallery Masonry preflight and scheduler failure containment

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `a822a0833036e86966f4d8dbaaa2e38d2d9f8505`  
**Final source blob at focused verification:** `f894f57920931feeb5fba6ec64204966f55779ac`

## Scope and constraints

Continued the active Gallery/Masonry lifetime audit against the actual `shared/galleryMasonry.js` and `shared/galleryMasonry.realm.test.js`. Reviewed existing recent Masonry abort/ownership regressions and the project's TDD/modern JavaScript skills. The active remediation specification requires recoverable failure of optional projection, one owner per resource, no use of revoked context (I7), and consistent completion/cleanup (P5, I2/I3). Kept the existing `mountGalleryMasonry(container, elements, options)` public signature and shared editor/renderer Gallery path. No new fallback runtime, compatibility API, or legacy document parser was introduced.

## Finding GALLERY-MASONRY-PREFLIGHT-1 — thrown geometry getter stranded ready (P2)

The previous asynchronous `start()` called `container.isConnected` and `getBoundingClientRect().width` **outside** its `try/catch`. A throwing geometry read yielded a rejected `start()` promise invoked via `void start()`, bypassed the configured error observer and never resolved `ready`. A reentrant callback during geometry preflight could run a second `start()` because the `starting` lease had not yet been acquired.

### Fix

- Acquire the `starting` guard before any host geometry getters.
- Move the entire geometry preflight inside the existing error/cleanup boundary.
- Reset the guard via `finally` on both the disconnected wait path and terminal paths.
- After potentially reentrant geometry callbacks, recheck cancellation before invoking additional producer or DOM operations.
- Report a fatal geometry failure through the existing best-effort `onError` and fallback class; settle `ready` to `null`.

## Finding GALLERY-MASONRY-BOOTSTRAP-1 — registration failures escaped synchronously (P2)

The prior mount registered an abort listener, `ResizeObserver`, an animation frame and a microtask without an encompassing failure boundary. A throwing `ResizeObserver.observe()` or `requestAnimationFrame()` could escape `mountGalleryMasonry()` itself, leaving an observer or abort listener in a partially installed state, and never return the `ready/destroy` interface.

### Fix

- Wrap bootstrap registration in a best-effort terminal failure boundary.
- On observer/frame registration failure, emit the diagnostic through `onError`, mark Gallery's existing fallback and run the authoritative `destroy()` path.
- Ensure the observer, pending frame, signal listener and `ready` are all retired.
- This treats failed optional layout registration as a failed Masonry mount, **not** a failed editor document operation.

## Lifecycle strengthening while correcting preflight

The shared code now uses `releaseInstance()` to detach and dispose a single Masonry owner, containing a disposer exception so it cannot strand `ready` or suppress the original append error. The `start()` path rechecks cancellation after reading the elements list, preventing a canceled mount from calling `append()` in a synchronous reentrant array callback. `destroy()` also isolates signal listener removal errors before settling.

Source-backed controlled-producer checks against the final code:

| Scenario | Verified result |
| --- | --- |
| Masonry disposal throws after successful append | One disposal, no throw from `mount.destroy()`, instance cleared and error reported |
| `append()` rejects while disposal throws | `ready = null`, exactly one disposal, original append error and cleanup error both reported |
| Caller elements map aborts synchronously | No `append()` after abort, exactly one disposal, `ready = null` |

These three are isolated controlled-fake checks, **not** committed repository unit tests or native browser validations.

## RED → GREEN test evidence

Four new regression tests were appended to `shared/galleryMasonry.realm.test.js`:

1. Geometry failure reports the error, adds fallback and settles `ready`.
2. Reentrant geometry callback cannot duplicate preflight before the first start lease is established.
3. Failed observer registration tears down and settles without scheduling later work.
4. Failed owner frame registration tears down the observer and settles.

Actual original source plus the twelve test bodies were evaluated in an isolated V8 adapter using the same controlled fake Masonry, owner-window observer, animation frame and abort signal contracts:

- **RED: 8/12 passed**, four new scenarios failed as intended.
- **GREEN: 12/12 passed** after the production fix.

The isolated harness implements the minimal assertion/test/microtask and fake Masonry contracts. It is **not** the repository's Node test runner. The code formatting follow-up changed bootstrap indentation only; the three controlled-producer checks above were run on its final source blob.

## Direct branch commits

- [Four RED regressions](https://github.com/Shelamkoff/editor/commit/f2b85d414da069ecc8bfd0c7ed3c26ae20026f7d)
- [Preflight and bootstrap production fix](https://github.com/Shelamkoff/editor/commit/34bc5bb25c620f9ef34c55f89038b18ad8e98091)
- [Bootstrap structure formatting](https://github.com/Shelamkoff/editor/commit/2999696ec635664b9c3d17dd2df943e048bb2cce)

## Required final acceptance

From a complete checkout of the latest branch:

```sh
npm ci
node --test shared/galleryMasonry.realm.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
```

In Chromium, test the real `@shelamkoff/masonry` dependency, disconnected-to-connected Gallery mounts, ResizeObserver and frame setup/teardown, asynchronous append and cancellation, and settings/caption editing. Verify no unhandled rejection, double disposer, stale frame/observer, or blocked `ready` settlement. Review heap/retention and full v1/v2 Gallery feature-parity scenarios.

**Not executed here:** installed-package Node suite, TypeScript, browser/heap gate, complete CI, and full v1/v2 UI parity. These focused fixes therefore do not establish Rector v2 release readiness.
