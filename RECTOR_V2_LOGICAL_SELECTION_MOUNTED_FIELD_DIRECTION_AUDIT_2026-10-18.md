# Rector v2 — mounted field identity and native selection direction audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `d189723dadb05cc8fc1976f403c1fcc7327ab75f`  
**Scope:** `core/LogicalSelection.js` and `core/LogicalSelection.test.js` with regression checks for adjacent EditorViewModel and InteractionState. No public API extension, v1 compatibility alias or persisted-document change.

## Contract and starting risk

A logical selection bookmark must be owned by the editor's **currently mounted field**, not merely by a matching block ID and field key. A field can be remounted during native selection/property callbacks without changing `document.activeElement` or the raw `Selection.anchorNode`/offset object. Bookmarks from the previous occurrence must not become valid inputs to a later command or history replay.

A fieldless block bookmark is valid only if its current shell still owns the active DOM focus and has no registered editable fields. In browsers without native APIs for preserving backward anchor/focus direction, an unrepresentable requested selection should fail **without destroying the previous native selection**.

## Finding LS-M1 — capture accepted a remounted same-key field (P2)

In `LogicalSelection.capture()`, the previous lifecycle checks verified the native selection endpoints and activeElement had not changed, but did not verify that the editor's reconciler still registered **the exact same editable element**. A plugin callback could remount the field under the same `blockId`/`fieldKey` while the old native text input or range remained referenced. The method returned a stale logical bookmark.

**RED:** Two tests reproduced this for (1) a plain-text field replaced while a native `selectionStart` getter ran, and (2) a rich-text field replaced while resolving the selected native text node.

**Fix:** Require both captured field owners to match a currently registered `getEditableFields(blockId)` entry by key, mode and **element identity**. For rich text, recheck native endpoints and active owner after that membership validation. Do not relocate old field keys to new siblings.

- [RED unit tests `76ae903`](https://github.com/Shelamkoff/editor/commit/76ae903a9ebd7be32711c6c3a973afe7d147eb2b)
- [Fix `8f8ab61`](https://github.com/Shelamkoff/editor/commit/8f8ab61403c15901c40278c3d07f018f7f71ae3c)

## Finding LS-M2 — fieldless capture/restore accepted a retired shell or a newly editable block (P2)

A fieldless bookmark could be captured after the block shell was synchronously replaced during `getEditableFields` resolution, even if the old shell remained active. Similarly, a bookmark for a block with no editable fields could be restored and reported as successful although focusing the shell dynamically registered an editable field.

**RED:** Two new tests detected stale same-ID shell capture and a fieldless focus accepted after dynamic field registration. A positive control verified ordinary fieldless capture and restore still work.

**Fix:** Validate the current shell is the exact active element or contains the active auxiliary control after resolving fields. After native fieldless focus, validate the shell identity, active element and absence of newly registered editable fields. This preserves legitimate fieldless media/auxiliary control ownership without silently claiming a newly revealed text field.

- [RED and positive control tests `5b2a1c2`](https://github.com/Shelamkoff/editor/commit/5b2a1c2896a93e0d006d3827db767941f31bbc8a)
- [Fix `39bde46`](https://github.com/Shelamkoff/editor/commit/39bde468d4572610a7e1115cc581afa3a8834d3f)

## Finding LS-M3 — unsupported backward Range fallback destroyed existing selection (P2)

The previous implementation correctly preferred `Selection.setBaseAndExtent`, then `Selection.collapse`/`extend`, and finally a DOM `Range` fallback. A DOM Range is inherently forward-ordered; on browsers without both direction-preserving options, attempting a backward restore could clear/overwrite the current native selection, only to return `false` once the resulting offsets were checked.

**RED:** A focused test proved an unsupported same-field backward request called `removeAllRanges` and damaged an existing native range before rejecting.

**Fix:** For fallback-only browsers, identify an unrepresentable backward request **before native focus/selection modifications** and return `false` without overwriting the user's current selection. Detect backwards positions within one field by logical offsets, and between fields through DOM `compareDocumentPosition` where available. Reject disconnected endpoints. Retain normal forward Range fallback and preferred direction-preserving APIs.

- [RED same-field test `e0cfa0c`](https://github.com/Shelamkoff/editor/commit/e0cfa0c13b068068d6b608950acbcb47445dfdc2)
- [Fix `edfef29`](https://github.com/Shelamkoff/editor/commit/edfef29e7c5e5e71d260e0bd7e8c21ed37adb878)
- [Backward cross-field / forward cross-field controls `69ce49d`](https://github.com/Shelamkoff/editor/commit/69ce49d1012235c2a2d294b01be6d1db44be349f)

## Verification ledger

| Checked-in real-class suite | Cases | Result |
| --- | ---: | --- |
| `core/LogicalSelection.test.js` | 26 | 26 passed |
| `core/EditorViewModel.test.js` | 29 | 29 passed |
| `core/InteractionState.test.js` | 15 | 15 passed |
| **Total** | **70** | **70 passed** |

**Eight tests** were added this pass; five reproduced the targeted defects on previous source, and three were positive/negative controls. The final result was reexecuted against **the exact current production source** retrieved from GitHub with real `shared/textOffset.js` and `shared/invokeObserver.js` in an isolated JavaScript/V8 test executor. The focused suites also parsed successfully. DOM and Selection adapters were controlled and do **not** replace a genuine native browser test.

## Remaining acceptance

Run from a clean checkout of the **current branch HEAD**:

```sh
npm ci
node --test core/LogicalSelection.test.js core/EditorViewModel.test.js core/InteractionState.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Chrome/other supported browser checks must cover an editable field remounted under a reused block ID, fieldless media focus with/without auxiliary controls, rich/plain native selection ranges, Undo/Redo, same-field and cross-field backward selection, and browsers lacking `setBaseAndExtent` or `extend`. The fallback-only case should **not** claim successful backward restoration; it should preserve the earlier native range. Correct model and history outcomes matter in addition to return values.

**Conclusion:** Three focused selection ownership/fallback problems were corrected with reproducible source-level red/green evidence. Whole-library stability and complete browser-verified v1/v2 behavior parity are still **unverified** until the full local/Chrome/type acceptance passes at the final branch HEAD.
