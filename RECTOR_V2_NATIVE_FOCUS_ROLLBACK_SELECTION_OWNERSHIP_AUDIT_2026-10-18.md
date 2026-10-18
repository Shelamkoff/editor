# Rector v2 — native focus rollback and LogicalSelection ownership audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `1f2aa158aa2283021f15d13b8daf333fb5544697`  
**Scope:** `EditorViewModel.focus`, `LogicalSelection.restore`, their actual internal `InteractionState` handoff, and native DOM focus/caret ownership. No public API signature or persisted document schema changes.

## Expected contract

- A rejected `blocks.focus(id,{fieldKey,...})` must not falsely update `currentId`, **nor leave native DOM focus or the author's previous caret in the rejected destination**.
- A focus rollback may only restore the old bookmark while its prior current-block decision, canonical revision, document generation, control epoch and editor health remain valid. A newer explicit user focus wins.
- Dynamic editable fields revealed by a plugin *after* it is focused must continue to work. Preemptively banning unknown keys before plugin focus would break this legitimate contract.
- `LogicalSelection.restore()` cannot apply native caret commands to retired DOM text nodes or plain-text inputs after a focus/selection callback remounts the same logical block ID. A rejected or throwing native selection setter reports failure without an uncaught exception.

## Finding F1 — rejected keyed focus retained incorrect native DOM focus (P2)

The earlier v2 fix correctly deferred `currentBlock:changed` until a requested caret was accepted. However, `BlockReconciler.focus` legitimately invokes a plugin's `instance.focus()` *before* `LogicalSelection.setCaret`. Paragraph-like plugins therefore moved `document.activeElement` to the destination block even when the requested keyed field was absent, and the second stage then returned `false`. The old `currentId` survived, but its native caret owner did not.

**RED:** A checked-in real `EditorViewModel + InteractionState + LogicalSelection` test used a controlled plain-text DOM and observed `false` with `document.activeElement` left in the rejected block. Separate controls prove that a newer focus on another block must not be rolled back, and that a dynamically revealed field may still be successfully focused.

**Fix:** Capture the existing logical bookmark before plugin focus, then, if plugin focus or keyed caret fails, restore that bookmark only if the original author decision and all edit-lifetime checks remain current. Best-effort failed restoration never converts a rejected focus into an exception.

- [RED tests `9a52611`](https://github.com/Shelamkoff/editor/commit/9a52611c88ffe899a6ed1d398df68102020c1cfb)
- [Fix `63880ae`](https://github.com/Shelamkoff/editor/commit/63880aeb1fb566022c4964f19a693a05a0487c55)

## Finding F2 — reentrant selection capture could authorize obsolete plugin focus (P2)

The new bookmark capture is itself an external DOM/selection callback. Before a pre-dispatch revalidation, a callback could change current block or round-trip read-only mode, yet the obsolete keyed-focus request would still invoke the destination plugin, briefly stealing native focus before a later lease check rejected it.

**RED:** Two tests demonstrated a plugin focus running after the capture callback had chosen another block or advanced `modeEpoch`. A terminal destruction control was already green because `InteractionState.focus` independently guards runtime health before touching plugins.

**Fix:** Revalidate explicit current-block intent, current ID, document generation/revision, control epoch, read-only state and ready health immediately **after** selection capture, before the destination plugin callback executes.

- [RED/control tests `aee597c`](https://github.com/Shelamkoff/editor/commit/aee597cbe8a989ac5070a1654c0b2c3825560848)
- [Fix `a8f5859`](https://github.com/Shelamkoff/editor/commit/a8f5859f3eddc74a782580fbf373109661aa7e34)

## Finding S1 — rich and plain-text caret restore wrote into remounted fields (P2)

In `LogicalSelection.restore`, resolving the logical endpoints before native focus did not ensure those DOM elements stayed mounted during `element.focus()`. A same-ID replacement could retire the source text node/input while a pending restore still invoked `Selection.setBaseAndExtent` or `input.setSelectionRange` on that old element. A newer native focus acquired from inside a focus listener could be overwritten. Also, a throwing plain-text `setSelectionRange` propagated instead of returning `false`.

**RED:** Four real-class tests reproduced stale rich/plane DOM writes, stolen newer native focus and the uncaught plain-text setter failure. Two positive controls checked normal rich and plain-text restoration.

**Fix:** Check active DOM owner and re-resolve both logical endpoints after native focus, before setting text selection. For plain-text, contain DOM setter errors. Require that the same mounted fields still own the range after the setter as well.

- [RED/control tests `429a42e`](https://github.com/Shelamkoff/editor/commit/429a42e636eaea2c650ff2080724991e0edec1d4)
- [Fix `3bdd9ea`](https://github.com/Shelamkoff/editor/commit/3bdd9ea30b740721bdf92dfcb3e0196cc7625981)

## Finding S2 — native rich-selection setter itself could retire the owner (P2)

After the pre-application guard, a synchronous `Selection.setBaseAndExtent` callback could still remount the target field or redirect native author focus. The restore operation previously returned `true` without revalidating whether the authored selection remained current.

**RED:** Two tests proved that replacing the field or moving active native focus *inside* the selection setter led to a false-success result.

**Fix:** After native selection application, revalidate mounted anchor/focus owners, and for collapsed caret restoration require the destination field to remain the active element. Cross-field range restoration is not forced to keep `activeElement` at the anchor field.

- [RED tests `1a71918`](https://github.com/Shelamkoff/editor/commit/1a71918dbd258be6eb0bfebbc76402fc7ef9f7c6)
- [Fix `3196aea`](https://github.com/Shelamkoff/editor/commit/3196aea0bf7d2f145d2e2db23d8a9baab56b3f81)

## Browser acceptance fixture

`tests/browser/runtime-contracts.js` now checks that a rejected public keyed focus:
- Preserves prior `currentId`, canonical model, history and emits no spurious current-block event.
- Returns native `document.activeElement` to the original editable field.
- Restores a collapsed native caret to its previous logical offset.

[Browser source change `272487e`](https://github.com/Shelamkoff/editor/commit/272487e176a36d1d633b8c38c897a1ae36f3412c). **Not executed in Chrome** during this pass.

## Verification

| Suite | Registered tests | Isolated result |
| --- | ---: | --- |
| `core/EditorViewModel.test.js` | 29 | 29 passed |
| `core/InteractionState.test.js` | 15 | 15 passed |
| `core/LogicalSelection.test.js` (new) | 8 | 8 passed |
| **Total** | **52** | **52 passed** |

Fourteen unit tests were added in this pass: **9 RED** before relevant fixes; **5 positive/retirement controls**. Focused tests executed **exact current production source** for `EditorViewModel`, `InteractionState`, `LogicalSelection`, `shared/textOffset` and `shared/invokeObserver` under an isolated V8 runner with controlled native text selection, focus, field remount and logical-runtime adapters.

This is real source-level class execution, but **not** full repository `node --test`, TypeScript, packaged consumer gates, real OS/native Chrome input, or an exhaustive differential against Rector v1. In the browser, focus events may reorder plugin/control observers relative to native selection; only the actual browser gate can certify that behavior.

## Required final acceptance

```sh
npm ci
node --test core/EditorViewModel.test.js core/InteractionState.test.js core/LogicalSelection.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Test real paragraph/code/media compound inputs, dynamic fields revealed during focus, focus that remounts its own field, rejected focus after same-ID document replacement, native caret movement in another editor, and Undo/Redo selection replay. Verify no false current-block events, that the current block agrees with the native active field, and no stale ranges are applied.

**Conclusion:** Four confirmed native focus/selection ownership issues have been addressed. Complete library stability and full v1/v2 behavioral parity remain **unverified** until full local and native browser acceptance of the final branch HEAD.
