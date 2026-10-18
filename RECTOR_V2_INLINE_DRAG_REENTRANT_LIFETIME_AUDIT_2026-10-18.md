# Rector v2 — inline-native and drag reentrant lifecycle audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `f7f7ed2443731f000d4230e26b0c4346031a5255`  
**Scope:** terminal inline widget input, teardown during native event ownership, pointer-capture release, reentrant click suppression and synchronous commit observers. No old data format, public extension API or compatibility layer was introduced.

## Finding I-LIFE-1 — Retired inline editing capture could still claim and mutate the document (P2)

`InlineWidgetInputController.destroy()` aborted the DOM event listener, but an already-captured `beforeinput` listener could still invoke `#beforeInput()`. The callback performed runtime/selection/inline-projection reads and could call `runtime.interact()` even though the controller was destroyed. Public `captureNativeDeletion()`, `completeNativeDeletion()`, and `discardStaleNativeDeletion()` also accepted calls after teardown. The latter could touch stale projected fields, reconcile native data or discard projection state after its owner was gone.

A separate reentry seam exists after `#claimBeforeInput()`: its `onOwnedBeforeInput` hook may synchronously destroy the owner. The original logic still applied the previously selected inline action after the hook returned.

**RED confirmed:** four newly written `core/InlineWidgetInputController.test.js` bodies failed against the pre-fix actual class source. They reproduced retained input consumption, detached field access during native deletion reconciliation, post-retirement action execution and destruction during the beforeinput claim callback.

**Fix:** retire the class's routing envelope, check its abort signal at the beginning of input and public native-deletion methods, and recheck after invoking externally supplied `onOwnedBeforeInput` before performing canonical mutations. After destroy, `completeNativeDeletion()` returns `{status:'stale'}`, capture returns `null`, and discard is inert. Already-accepted edits continue to use their existing revision/mode/selection authority guards.

- [Test-first terminal input cases](https://github.com/Shelamkoff/editor/commit/2dc90f31612ef845921a4d66c5ba3f324e401c71)
- [Reconciler fixture exposure](https://github.com/Shelamkoff/editor/commit/5764e38e1b2a6c04274d1da0b5ddccd1c44d8dce)
- [Reentrant event-claim test](https://github.com/Shelamkoff/editor/commit/21e5bd5c16c27ca5a235fc1aa53d49cf33217fea)
- [Source fix](https://github.com/Shelamkoff/editor/commit/23d30ece6ff4bdeddb120e19a4d1185ff4f9be8b)

**GREEN:** 30/30 of the registered current InlineWidgetInputController unit-test bodies executed against the actual fixed source in an isolated V8 runner. It used the checked-in `containedTextRange`, `editingHostForEvent`, `cloneEditorData`, `synchronousResult` sources and a controlled DOM/AbortSignal adapter. Its deep-equality adapter explicitly supports cyclic DOM objects.

## Finding D-LIFE-1 — Completed drag could move a block after its pointer capture released the editor (P1)

Before committing the final block move, `DragController.#finish()` called `#cancelSession()`. That helper invokes `handle.releasePointerCapture()`; browsers may synchronously fire `lostpointercapture`, and host integrations can destroy the editor, switch to read-only mode or replace the mounted block from that event. The original completion path continued into `runtime.move()` using the stale drag even if teardown occurred during the release.

**RED confirmed:** a new real-class test injected synchronous editor destruction in the pointer-release callback and observed a canonical move after destruction.

**Fix:** after releasing the pointer, revalidate terminal state, read-only status, generation, revision, mode epoch, block existence and mounted block identity before installing click suppression or committing the move. Session state now records its originating `modeEpoch`; a read-only round trip invalidates the old operation even if its author revision remains unchanged.

- [Pointer-release regression](https://github.com/Shelamkoff/editor/commit/385d3e33bc47df25c3b8a0ce1e737c06e2e45aa8)
- [Source fix](https://github.com/Shelamkoff/editor/commit/d5d6009788b4527e563dc0d7d9d83348b17da529)

## Finding D-LIFE-2 — Reentrant click-suppression timer could reacquire listeners after destroy (P2)

`#suppressNextClick()` schedules cleanup using the owning window's `setTimeout`. A reentrant timer provider can synchronously destroy the editor during that allocation, leaving `#clickCleanup` not yet registered. The old implementation then installed a listener on the now-retired drag handle and continued the canonical move.

**RED confirmed:** one focused test destroyed the controller synchronously inside `setTimeout`. The original implementation still moved the block after destruction.

**Fix:** make setup return a success flag; establish idempotent cleanup before invoking timer/listener providers; reject a retired owner before and after event listener installation; never consume a click or commit a move after that rejection. `#finish()` also checks validity after click-suppression acquisition.

- [Timer regression](https://github.com/Shelamkoff/editor/commit/d3103373db398922f8c9dbfc9cc1dadf5c05936b)
- [Source fix](https://github.com/Shelamkoff/editor/commit/bcec95b3500dd80d18ced77fd843cee436ea52c2)

## Finding D-LIFE-3 — Drag commit observers could destroy the editor before view reconciliation (P2)

A successful `runtime.move()` publishes the canonical transaction synchronously; an application commit observer can destroy the editor at that point. The old drag path then unconditionally invoked `view.reconcileInteraction()` and `view.setCurrent()`, potentially restoring focus or operating on detached DOM **after the canonical move had already succeeded**.

**RED confirmed:** a test invoking `controller.destroy()` inside the runtime move observer reached an intentionally dead view and threw. The canonical move itself was correct.

**Fix:** after the move, check terminal status, read-only state, generation/mode epoch, mounted source ownership, and whether another user action changed the current block. Preserve the canonical move but skip stale view/focus work.

- [Post-commit teardown regression](https://github.com/Shelamkoff/editor/commit/1b2169d0b4ad8ff4c5a0d1a00edce79ef2d1c14a)
- [Source fix](https://github.com/Shelamkoff/editor/commit/ae4c0898785dbc99b31fe14826003686c5bf70ae)

## Focused verification

- **InlineWidgetInputController:** 30/30 checked-in test bodies passed.
- **DragController:** 12/12 checked-in test bodies passed, covering old gap/move/read-only/capture invariants and the new reentrant release, timer and commit observer scenarios.
- **Total targeted:** **42/42**, executed on the final checked-in JavaScript source in an isolated V8 runner with narrow DOM and AbortSignal adapters.
- **Syntax:** all four modified production/test JavaScript modules passed parsing in V8 after ESM imports were replaced for focused execution.
- Each new defect was demonstrated against the pre-fix source, without changing v1. Non-regressing components (InlinePopupHost, normal InlineTriggerController event guards) were inspected but not patched without a concrete failing case.

**Limitations:** no actual `npm ci`, full `node --test` runner, `npm test`, TypeScript/typecheck, browser pointer-event/IME integration, bundle/package smoke test or full v1/v2 gesture differential ran in this environment. GitHub source edits were made through the authenticated connection, and all commit responses were recorded. Test counts describe selected source-level executions, not release acceptance.

## Required local acceptance

```sh
npm ci
node --test core/InlineWidgetInputController.test.js core/DragController.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

**Native browser follow-ups:** perform a pointer gesture whose `lostpointercapture` listener destroys/replaces the editor, an observer destroying an editor during a successful move event, cancellation during asynchronous menu/overlay setup, and a captured beforeinput callback after inline widget editor teardown. Verify single transaction boundaries, no stale focus or DOM reads, and no leaked click listeners.

**Result:** four confirmed lifecycle/reentrancy defects corrected, public behavior and data structures otherwise retained. Whole-library stability and full behavioral parity with Rector v1 are not established until final HEAD acceptance.
