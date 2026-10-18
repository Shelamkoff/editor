# Rector v2 — keyed focus atomicity and revision ownership audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `adefb1fbc81022b18a8226c887b1b6dbda92f51a`  
**Scope:** `core/InteractionState.js`, `core/EditorViewModel.js`, their unit tests, and `tests/browser/runtime-contracts.js`. Other agents' files were not modified.

## Intended contract

An explicit keyed focus is one author gesture requiring (1) a live mounted plugin accepting the focus and (2) native/logical selection successfully claiming the requested field/offset. A public `currentBlock:changed` event must not announce a new block before the corresponding explicit caret has been accepted. Failed focus must not publish a false current-block change. The command must not enter a retired plugin/DOM instance, nor treat an old focus as current after a newer authoring revision, remount or editing-mode transition.

Plugin-only/block-level focus without an explicit caret target retains its existing behavior. These are internal v2 ownership changes, not v1 API aliases or serialized-format migrations.

## Finding F1 — current block changed before keyed caret accepted (P2)

Before the fix, `EditorViewModel.focus(id,target)` called `InteractionState.focus`, which invoked `setCurrent(id)` and published `currentBlock:changed` immediately after plugin focus. It then called `LogicalSelection.setCaret`. If the field was absent or native selection failed, the command returned `false` **after** changing current block and emitting a misleading event. Successful focus also notified observers before the native caret was ready.

**RED:** Three source-level tests failed against the original classes: a rejecting caret, a real `LogicalSelection` rejecting a missing keyed field, and event publication preceding native caret acceptance. A fourth positive test confirmed target-less plugin focus worked.

**Fix:** `InteractionState.focus(id,target,{deferCurrent:true})` can validate plugin focus and ownership without claiming currentId. `EditorViewModel.focus` uses this internal option **only** for explicit keyed focus; it publishes `setCurrent(id)` after the logical caret returns `true` and all current lifetime/author-decision checks pass. Plugin-only focus uses the unchanged default path. Superseded focus now emits only the newer decision, not an intermediate stale block.

- [Red regression tests `edc89c5`](https://github.com/Shelamkoff/editor/commit/edc89c59ae3d07bdca4aeaa212138b4b0a6e608e)
- [Deferred claim `296480c`](https://github.com/Shelamkoff/editor/commit/296480c3158679cf1f267a70fd0417143ab365fe)
- [Two-phase keyed focus `123abf6`](https://github.com/Shelamkoff/editor/commit/123abf60e5bd61986b494dfa3eff1bdf6eda600d)
- [Event-order expectation `d2b68d5`](https://github.com/Shelamkoff/editor/commit/d2b68d5a197470e7aea25e40ca199627e34e609f)

## Finding F2 — retired focus and caret invoked plugin or detached DOM before checking lifetime (P2)

The previous `InteractionState.focus` checked terminal health only **after** invoking `reconciler.focus`, and `EditorViewModel.setCaret` checked terminal health only after `selection.setCaret`. Deferred control work could therefore touch a destroyed/failed owner.

**RED:** Four tests across `destroyed` and `failed` runtime health states reproduced external plugin/DOM callbacks being invoked before the rejection.

**Fix:** Reject terminal health and missing block membership before calling `reconciler.focus` or `LogicalSelection.setCaret`, while preserving read-only viewer focus when its plugin legitimately accepts it. Follow-up lease checks remain in place after successful external callbacks.

- [InteractionState RED `024e8fa`](https://github.com/Shelamkoff/editor/commit/024e8fa46445827b427445295d45c1a60d967b75)
- [ViewModel RED `72d9141`](https://github.com/Shelamkoff/editor/commit/72d9141472e6bef9694ace476f178e294f526ea9)
- [InteractionState fix `c5c30f7`](https://github.com/Shelamkoff/editor/commit/c5c30f7ad31d6d4d2c19a72e67c63e2cafac72a4)
- [ViewModel fix `b695d5d`](https://github.com/Shelamkoff/editor/commit/b695d5d6e0e105bb8fc59cf19c5a4d8010f49af1)

## Finding F3 — new authoring revision did not revoke an old focus/caret continuation (P2)

Existing ownership checks guarded `generation`, `modeEpoch`, `readOnly`, current claim and runtime health, but did not check ordinary committed `revision`. A synchronous focus/DOM callback can initiate a newer canonical edit **without** replacing the document generation. The older caret or focus command could still report success or claim a block with outdated authoring state.

**RED:** Three real-class tests demonstrated an old plugin focus, keyed ViewModel focus and direct `setCaret` incorrectly returning success after a newer committed revision in their callback.

**Fix:** Capture and validate the canonical revision as part of the same lifetime lease in `InteractionState.focus`, `EditorViewModel.focus` and `EditorViewModel.setCaret`. Revalidate after callback completion and after final current-block publication.

- [InteractionState RED `6cebe2e`](https://github.com/Shelamkoff/editor/commit/6cebe2efb60e7eb22a6ea079e7067b87e7b9ea09)
- [ViewModel RED `c851704`](https://github.com/Shelamkoff/editor/commit/c8517049069ed8db6c3558af94fb0fdd7517f22e)
- [InteractionState fix `049cac6`](https://github.com/Shelamkoff/editor/commit/049cac6d315ad2458ad691ad2dfe512eab2347fe)
- [ViewModel fix `a811b4c`](https://github.com/Shelamkoff/editor/commit/a811b4c62a9b053187e0f5451f14c15bce4f45e9)

## Browser acceptance fixtures

Two cases were added to `tests/browser/runtime-contracts.js`:

1. An explicit `blocks.focus('b', { fieldKey:'missing-title',offset:1 })` must return `false`, retain previous `currentId`, emit no false `currentBlock:changed`, and create no history step.
2. For a valid keyed focus, `currentBlock:changed` must be dispatched only **after** native caret position is collapsed in the destination field at the requested offset.

[Browser cases `e30ed49`](https://github.com/Shelamkoff/editor/commit/e30ed49821da6e81c060a59129337521182b5578).

The browser test source was syntax-checked, but **neither case was executed in Chrome**. In particular, real plugin focus may alter the active DOM host before a keyed caret refusal, so the rejected-focus native-host restoration outcome still needs browser observation. The model-level/current-block event guard alone does not prove DOM focus rollback in every plugin.

## Focused verification ledger

| Scope | Unit tests | Isolated result |
| --- | ---: | --- |
| `core/EditorViewModel.test.js` | 23 | 23 passed |
| `core/InteractionState.test.js` | 15 | 15 passed |
| **Total** | **38** | **38 passed** |

This pass added **11 unit tests**; ten exposed the respective old source defects and one was a positive plugin-only focus control. The final tests executed the actual GitHub-fetched `EditorViewModel`, `InteractionState` and `LogicalSelection` source with the actual `shared/textOffset` and `invokeObserver` helpers in an isolated V8 runner and a controlled runtime/DOM adapter.

**Not verified:** actual Node `node --test`, whole-project TypeScript, real native selection/Chrome, package build, documentation suite and complete v1/v2 behavioral parity.

## Required local acceptance

```sh
npm ci
node --test core/EditorViewModel.test.js core/InteractionState.test.js core/PublicEditorApi.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Also compare real browser behavior for missing keyed fields, successful one-event caret focus, dynamic editable field activation, same-block reentrant focus, read-only transitions, document revision changes during native focus listeners, and Undo/Redo. Any browser failure should be fixed with a new focused regression rather than marking the suite green based on isolated mocks.

**Conclusion:** Three confirmed focus/caret lifecycle and event-order defects are corrected with regression evidence. Complete library stability and behavioral parity with v1 remain open until full local/browser acceptance succeeds at final HEAD.
