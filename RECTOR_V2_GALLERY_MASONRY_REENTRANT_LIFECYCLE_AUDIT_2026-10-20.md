# Rector v2 — Gallery Masonry synchronous cancellation and owner-lifetime audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `5f5c2a7af575f96e06da91600f2b0ffa18cf0d38`  
**Priority:** P2 resource and asynchronous ownership safety

## Scope

Inspected the current actual `shared/galleryMasonry.js`, `shared/galleryMasonry.realm.test.js`, previous Gallery-specific audit notes, and project `.agents/skills/tdd/SKILL.md` plus modern JavaScript skill. The active `RECTOR_V2_REMEDIATION_SPEC.md` requires I7 (a revoked context must not continue producer/DOM work; each resource has one owner), I2 (consistent post-commit/projection state) and P5 (owner-window resource handling). This audit concerns the shared Masonry mount used by editor and renderer Gallery consumers. It does not restore v1 formats or APIs.

## GALLERY-MASONRY-LIFETIME-1 — synchronous DOM callbacks could outlive abort

### Reproduction

The original mount checked `destroyed` only before geometry measurement and observer cancellation. A custom owner-document adapter could synchronously call `AbortController.abort()` from `getBoundingClientRect()` or `ResizeObserver.disconnect()`. The remaining `start()` body then still read layout styles, constructed Masonry, and called append after cancellation. A disconnect-triggered abort reentered `destroy()` while `waitingObserver` still held the same observer, so it ran `disconnect()` twice.

Similarly, `ResizeObserver.observe()` could synchronously abort while the mount still registered a new frame and microtask. A constructor-side abort before the observer was assigned left the newly constructed observer without a registered disposer. Immediate `requestAnimationFrame()` callbacks could abort before a returned frame handle was published, leaving a stale frame lease and scheduling more work.

These are bounded source-level races with owner-realm callbacks; they are not a claim that the native ResizeObserver API itself invokes `disconnect()` recursively.

### Fix

- Snapshot/detach observer and frame leases **before** calling external `disconnect()` or `cancelAnimationFrame()`.
- Recheck `destroyed` and `settled` after geometry observation, stopWaiting and layout-style reads.
- After Masonry construction, dispose its returned instance when a synchronous constructor callback has already canceled the mount; do not call append.
- When abort occurs during an awaited append, rely on the authoritative `destroy()` cleanup and avoid a second instance disposal.
- Skip frame/microtask registration after a synchronous abort; treat immediately invoked frame callbacks as already fired.
- Release an observer constructed during a synchronous abort, even if it was never published to the normal observer ledger.

## GALLERY-MASONRY-TEARDOWN-1 — observer disposal errors prevented cleanup

### Reproduction and fix

The previous `stopWaiting()` directly called `observer.disconnect()` before canceling the pending frame. If `disconnect()` threw, the pending frame was not canceled and `destroy()` could exit without settling `ready`. The updated code handles each resource release independently, delivers the cleanup error to the existing best-effort `onError` observer, and continues releasing other resources. No new global error channel was created.

## RED → GREEN regressions and verification

Three focused tests were committed before the first production fix. Against the original exact source they **all failed** for the intended missing cancellation/reentry checks. The updated code passed all three and the two preexisting tests (**5/5**).

Two further tests covered cancellation in `ResizeObserver` construction and a throwing disconnect. They **both failed** against the first corrected source and **both passed** after follow-up remediation (**7/7**).

A final regression tested synchronous owner-window requestAnimationFrame firing and cancellation. All **eight actual test bodies** in `shared/galleryMasonry.realm.test.js` were run together against the original baseline source and the current source with injected fake Masonry and owner-realm DOM/AbortController adapters:

| Source | Passing checks | Failing checks |
| --- | ---: | ---: |
| Original baseline `4e78f108ae21b40dd03570c8292b17828a6cacda` | 2 / 8 | 6 / 8 |
| Updated `30d3afd75fd3e145a29d958f2001ff063c91b49f` | **8 / 8** | 0 |

An additional isolated source-level case aborted inside the Masonry constructor: the current source created one instance, performed **zero append calls**, destroyed that instance exactly once, and resolved `ready` to `null`. This additional check is not a repository test case.

This is source-backed **isolated JavaScript execution**, not native `node --test` or Chromium. The test harness replaced imported Masonry with a controlled fake and supplied minimal assertion and AbortController adapters. Native owner-realm API quirks, real Masonry layout behavior, and heap retention still require acceptance.

### Direct branch commits

- [Three initial regressions](https://github.com/Shelamkoff/editor/commit/7c58b00523fc2aad5eb7e38b0007e4b37f14245e)
- [First synchronous-abort fix](https://github.com/Shelamkoff/editor/commit/545f8acf5e4270536e2b0401035ddd16705029c1)
- [Constructor/teardown regressions](https://github.com/Shelamkoff/editor/commit/ad6a11a6ef29eea2dd2c8924ca4546fbb398212d)
- [Observer construction and teardown isolation](https://github.com/Shelamkoff/editor/commit/1896630713f26a9be7bcc2936d222b3b38511e49)
- [Synchronous animation-frame regression](https://github.com/Shelamkoff/editor/commit/dcc1e9a36507a7c4f8777f31c8a5d6d72039bb91)

## Acceptance required before release

```sh
npm ci
node --test shared/galleryMasonry.realm.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
```

Browser acceptance should cover Gallery mounts that remain detached until measurable, mounted Gallery edits and style updates, owner-window ResizeObserver/animationFrame activity, abort during pending Masonry append and host/editor teardown. Verify no retained observer/frame/instance leases and parity of Gallery rendering and caption editing against v1.

**Not executed:** installed-package native Node run, TypeScript checks, full browser tests, heap gate and the full v1/v2 behavioral parity suite. This focused audit therefore does **not** certify Rector v2 release readiness.
