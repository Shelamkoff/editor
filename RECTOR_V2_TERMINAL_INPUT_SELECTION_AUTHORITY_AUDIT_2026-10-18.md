# Rector v2 — terminal input, keyboard and selection authority audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `48df7ffd7e93ccd29fa746b2f84fd961680674ab`  
**Scope:** lifecycle terminality for native editing, structural shortcuts, selection restoration, and pointer events. No v1 compatibility adapter or change to canonical document serialization was introduced.

## Root cause

Event listeners registered with `AbortSignal` are normally detached on editor destruction, but this does **not** make callbacks already captured by browser dispatch or callbacks retained by integration code inert. Public component methods must also reject stale invocations once their lifecycle owner has ended. These methods previously checked read-only/composition/document revision but omitted an unconditional check of their **own aborted controller** on one or more synchronous entry points.

This violates the v2 lifecycle invariant that retired callbacks cannot reacquire authoring authority after editor teardown.

## N-LIFE-1 — NativeInputController could continue after destroy (P2)

The native input class's public `handleBeforeInput()`, `handleInput()`, `handleCompositionStart()`, `handleCompositionKey()`, `handleCompositionEnd()` and internal commit path lacked terminal-controller checks. A retained callback could still consume native browser history, submit a canonical model write, or start an IME composition after the associated editor was destroyed.

**RED:** direct execution against the pre-fix production class reproduced:
- `historyUndo` being intercepted after `destroy()`;
- an input event attempting document mutation after retirement;
- a new composition being created after retirement;
- a captured cross-block beforeinput callback consuming native text.

**Fix:** check `#controller.signal.aborted` before performing each of those operations. Existing `destroy()` still invalidates any pending composition/input session. Normal editing behavior and per-edit history contracts remain unchanged.

- [Regression tests](https://github.com/Shelamkoff/editor/commit/604ebf8f5a6d23606267ed94a86cd52968459fbc) — `core/NativeInputController.test.js`
- [Production fix](https://github.com/Shelamkoff/editor/commit/6c6e0be0a44f3069afa25d0ece3f8e8ef6e2b90a) — `core/NativeInputController.js`

**Focused GREEN:** 28/28 registered `NativeInputController.test.js` test bodies passed with the updated production class and a controlled abort/DOM adapter.

## K-LIFE-1 — KeyboardRouter retained shortcuts and structural methods (P2)

`handleKeydown()` relied on root listener removal, not on its own terminal lifecycle state. A direct callback after `destroy()` could still consume Ctrl+Z or Enter. The public structural entry points `split()`, `exit()` and `appendDefault()` also accepted calls after retirement and could edit model-owned blocks.

**RED:** a retained keydown callback after destroy consumed history and structural keys; the explicit public split/exit/append actions could still return success or invoke model operations.

**Fix:** check the router's aborted signal on all four public entry points, leaving its active read-only checks and deferred-focus revision/mode guards intact.

- [Regression tests](https://github.com/Shelamkoff/editor/commit/25a928a9530abd0e066c48a4ff71c5c123764bf1)
- [Focused test harness for exit action](https://github.com/Shelamkoff/editor/commit/8c9ba9599f6836026199f9119e944f4dc7f2a321)
- [Production fix](https://github.com/Shelamkoff/editor/commit/ce46b2554300a7ac69d265a8d40741a678d56237)

**Focused GREEN:** 15/15 registered `KeyboardRouter.test.js` bodies passed with the actual updated class in the V8 harness.

## S-LIFE-1 — SelectionController could restore selections or pointer-hit-test after destroy (P2)

`SelectionController.restore()`, `selectBlocks()`, `activate()`, `extend()` and other public structural selection methods had no early terminal check. This allowed retained references to read detached projection fields, republish selected block IDs, or run range activation after owner teardown. The retained mousedown callback also performed hit-testing after `destroy()`, despite the listener's signal having been revoked.

**RED:** the original production implementation:
- republished selected IDs after `destroy()`;
- called a deliberately retired `reconciler.getEditableField()` in `restore()`;
- called the retired range owner in `extend()`/`activate()`;
- ran `Document.caretPositionFromPoint()` from a captured mousedown after destroy.

**Fix:** add terminal checks to public selection restoration/activation/extension, whole-block editing, composition, split and select-all methods, and guard the captured pointer handler. Make `destroy()` idempotent. Queued focus callbacks already checked the signal and continue to do so.

- [Core selection authority tests](https://github.com/Shelamkoff/editor/commit/9231198cc08d58b41a2645b3e0cb64a236222fad)
- [Core source fix](https://github.com/Shelamkoff/editor/commit/d8b9417482e0e6b8b76493a2a7e056333c808f47)
- [Stale pointer test](https://github.com/Shelamkoff/editor/commit/d1827e67d08e6c30cb745a6de51c2b32e884cc5b)
- [Stale pointer source fix](https://github.com/Shelamkoff/editor/commit/7393d25b7e18df189b04a2d60389dfcd754fec8b)

**Focused GREEN:** 8/8 registered `SelectionController.test.js` bodies passed on the actual updated source in V8.

## Verification boundary

- 28/28 NativeInputController, 15/15 KeyboardRouter, 8/8 SelectionController: **51/51 focused test bodies passed**. All three defect classes were reproduced on the pre-fix production JavaScript with intent-specific assertions before patches were applied.
- Production JavaScript parsed/executed in isolated V8 harnesses, injecting narrow AbortController/browser adapters. The existing and new tests were evaluated together against the updated exact source.
- This does **not** demonstrate the full installed project's `node --test`, TypeScript, native browser/IME/Clipboard or package integration gates. The container cannot perform a direct GitHub checkout; source and commits were handled by the authenticated GitHub connection.
- No exhaustive v1-to-v2 behavior differential was run in this pass. These are v2 lifecycle-invariant regressions, not claims that every historical gesture was directly compared with v1.

## Required full release validation

```sh
npm ci
node --test core/NativeInputController.test.js core/KeyboardRouter.test.js core/SelectionController.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium, use a real input/IME lifecycle matrix that captures event handlers before teardown and dispatches them after teardown. Include pending Undo/Redo focus restoration, retained pointer callbacks, independently mounted editors, alternating read-only periods and editor recreation in the same holder. Confirm no stale model mutations, DOM focus changes, event interception, timers, abort listeners or retained projection references.

**Status:** three confirmed terminal-lifecycle regressions fixed and tested at their existing class boundaries; overall Rector v2 release stability and exhaustive functional parity with v1 remain unverified.
