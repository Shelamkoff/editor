# Rector v2 — drag pointer-session ownership under synchronous DOM/host reentry

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `6dd697fd6b5ad894d051604c3a65be26bd712332`  
**Production:** `core/DragController.js`  
**Regression suite:** `core/DragController.test.js`

## Contract and scope

Continued the refactor architecture, v1-visible-behavior and bug audit in the C7 drag section of `RECTOR_V2_REMEDIATION_SPEC.md`: one pointer session per editor; pointer identity and source generation/revision/mode must remain current; visual gap previews must not mutate the document; abort, destroy, read-only, pointer capture loss and concurrent author decisions must revoke stale sessions; a finished drag may produce at most one move/history action. The repository TDD skill was followed: each behavioral regression was added and reproduced against an older implementation before the production correction.

This audit checks **synchronous reentry** from `releasePointerCapture`, `setPointerCapture`, pointer listeners, class hooks, and DOM insertion. It does not assert a generalized sandbox against malicious same-origin code. All GitHub writes used fresh blob SHAs and direct commits to the existing branch; unrelated/parallel files were not replaced.

## DRAG-OWNER-1 — pointerdown could re-acquire a session after teardown (P2)

When a new `pointerdown` began, the controller retired the previous pointer session by calling `#cancelSession()`. Its browser `releasePointerCapture()` callback can synchronously invoke `destroy()`, switch read-only state, replace the source occurrence, or open a newer pointer session. The old handler continued after returning, allocated an obsolete controller and installed new listeners. Likewise, a callback of `setPointerCapture()` could cancel the brand-new session while the outer handler still attached listeners afterwards. An exception part-way through listener installation also leaked an active pointer capture.

**RED tests:** reentrant destruction from old-capture release, reentrant read-only cancellation from new pointer capture, and partial listener installation failure. The old source re-acquired a stale pointer ID or left document listeners / capture active.

**Fix:** own the source generation/revision/mode and mounted identity before retiring the prior session. Re-check all authority and concurrent replacement after cancellation and after state construction. Re-check the exact current session immediately after `setPointerCapture` and each listener-registration callback; on failure, cancel the partially acquired session through its AbortSignal and release its pointer capture. End-of-condition ownership is checked after potentially reentrant runtime getters as well.

- [Initial RED tests `a1a8ca53`](https://github.com/Shelamkoff/editor/commit/a1a8ca5334d18b7349f9bcd5f82a8d11427f8b27)
- [Fix `72400206`](https://github.com/Shelamkoff/editor/commit/7240020660aa24d0112c692a3c5c1c681a687b63)
- [Listener failure control `5e001c54`](https://github.com/Shelamkoff/editor/commit/5e001c54d4d8e3a62b3899404e9137a1b0a781e5)

## DRAG-OWNER-2 — after-callback drag activation leaked DOM (P2)

`#activate()` sets the dragging class, body class and provisional gap spacer. Any class/attribute/DOM callback can synchronously destroy the active controller. The old function continued applying drag CSS and DOM even after teardown. In particular, a `container.insertBefore(spacer)` callback that destroyed the owner *without throwing* ran before the spacer's original-parent lease was published; `#cancelSession()` could not see or remove the half-inserted spacer. `#move()` could also proceed after the aborted activation.

**RED tests:** classList activation callback destroys controller, and spacer insertion callback destroys controller after DOM attachment. Both leave visible stale presentation on the prior source.

**Fix:** stop each activation stage as soon as its session becomes invalid; re-check before and after the event default-prevention / geometry calculation. After every gap insertion, verify the same live owner before publishing the spacer-parent lease. If retired, release only an element still under this session's former DOM parent, preserving any node adopted by an unrelated application.

- [Initial RED class callback `a1a8ca53`](https://github.com/Shelamkoff/editor/commit/a1a8ca5334d18b7349f9bcd5f82a8d11427f8b27)
- [Spacer RED `c00d8879`](https://github.com/Shelamkoff/editor/commit/c00d88790b3e847ce5ce184b4a38f3da81d7acc5)
- [Fixes `72400206`, `0b12fc55`](https://github.com/Shelamkoff/editor/commit/0b12fc550e1e7475c5f7b56b6ef281f3f82b1d3a)

## DRAG-OWNER-3 — stale pointerup could commit after a successor gesture (P1/P2)

A completed pointerup calls `#cancelSession(state)` to release browser pointer capture before it performs a canonical `runtime.move()`. `releasePointerCapture()` can synchronously dispatch a new `pointerdown` and install a **different current drag session** without changing document revision or source identity. The old pointerup then passed its other checks, installed obsolete click suppression, and committed its prior gap move after a newer gesture had acquired authority.

**RED:** a release callback starts a second pointer with pointerId 8 while the old pointerId 7 finishes. Against original code, the old pointerup moved block A despite pointer 8 now being current.

**Fix:** refuse an older completion if any newer session is active after pointer release, and re-check this condition before and after fallible click-suppression setup. If the newer session appeared during that setup, retire only the older suppression listener, not the successor's pointer owner. The canonical move remains one-shot.

- [RED test `c00d8879`](https://github.com/Shelamkoff/editor/commit/c00d88790b3e847ce5ce184b4a38f3da81d7acc5)
- [Fix `0b12fc55`](https://github.com/Shelamkoff/editor/commit/0b12fc550e1e7475c5f7b56b6ef281f3f82b1d3a)
- [Test refinement `e3cca985`](https://github.com/Shelamkoff/editor/commit/e3cca985b6527721e64cafd4432fcdf75f829628) — asserts the host callback ran without assuming the broken prior implementation attempts the DOM insertion only once.

## Focused verification

- Re-executed the **six new test bodies against the untouched starting production source** `ae09813a0b3a46549b2236c2fcae0ef618bc2f80`: **0/6 passed**, and each failed for the intended stale-pointer/session/listener/DOM behavior.
- Re-executed all **18/18 test bodies** from `core/DragController.test.js` against the final fixed `core/DragController.js` source: **18 passed**, zero failures, 115 observed assertions in the first successful complete pass.
- A focused regression of partial listener registration was separately checked on original and current source: original leaked capture, fixed version cleaned all listeners and capture.

Test execution used the fetched actual DragController class and official test-body source in an **isolated V8 runner** with the repository's fake DOM adapted for AbortController and microtask scheduling. The Node.js `node --test` runner, actual browser PointerEvent/PointerCapture, TypeScript and package tests **were not run**. These remain local acceptance requirements and no overall stability or full v1/v2 behavioral parity is inferred.

## Required acceptance on final HEAD

```sh
npm ci
node --test core/DragController.test.js core/BlockReconciler.test.js core/ProjectionAnimator.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium, verify a real drag pointerdown→move→pointerup path, lostpointercapture reentry, source removal and generation replacement, reentrant mounting of a replacement block during pointer release, read-only cancellation, DOM insertion/cancel callbacks, exact cleanup of the drag gap, and no stale suppressed click from another gesture. Confirm a successful move leaves one canonical history entry and Undo/Redo restores document order.

## Conclusion

This pass closed three independently demonstrated C7 pointer/DOM ownership gaps with six failing-first regression cases. The reviewed drag code is stronger and the focused suite is green. Full Rector v2 stability and end-to-end v1/v2 interaction parity remain open until the native project/browser gates pass.
