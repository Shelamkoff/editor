# Rector v2 — LogicalSelection capture, fieldless focus and native range fallback

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `5d26cc04af0132ee685e263ad32e5a97e2f71f93`  
**Scope:** `core/LogicalSelection.js`, `core/LogicalSelection.test.js`; regression verification against `core/EditorViewModel.test.js` and `core/InteractionState.test.js`.

## Architecture / contract

The remediation spec's C5/C1 logical-selection obligations require exact author caret ownership and reliable Undo/Redo bookmarks. A capture must reflect one coherent DOM/native selection state. A restore should report success only when the addressed mounted field/shell owns the resulting native selection. Backward selection must preserve its anchor/focus direction where native APIs permit. A callback that remounts an element or changes focus must not authorize a stale selection.

No external public API name, persisted data format, extension contract or v1 compatibility layer changed.

## Finding LS1 — a fieldless block restore accepted a retired same-ID shell (P2)

`LogicalSelection.restore()` special-cases bookmarks with empty `fieldKey` for blocks that own no text fields. It focused a shell and returned `document.activeElement === oldShell`, without rechecking that `reconciler.getElement(blockId)` still returned that same shell. A synchronous focus callback could replace the mounted block with the same ID while the old shell remained active in a retained DOM reference. A throwing native `focus()` also escaped rather than returning failure.

**RED:** Two real-class regressions reproduced a stale same-ID fieldless success and an uncaught native focus failure.

**Fix:** Check shell identity again before/after native focus and contain focus-related errors. A rejected restore does not claim a new author selection.

- [Tests `6f820f3`](https://github.com/Shelamkoff/editor/commit/6f820f399ddb299c6d584cfe4440f6a1bf47ccc4)
- [Fix `35ebb3c`](https://github.com/Shelamkoff/editor/commit/35ebb3c48184a4a3fcb64c03d89eef49ab4c6a21)

## Finding LS2 — reentrant capture mixed old and new selection owners (P2)

`capture()` evaluated potentially synchronous `resolveEditableTarget`, native input selection getters and native Selection endpoints without checking whether the active DOM host or underlying native range changed during those callbacks. It could return the former field's bookmark after a newer focus, or build a mixed rich-text bookmark from endpoints observed at different moments.

**RED:** Three regressions covered ownership resolution changing the active input, `selectionStart` getter moving focus, and native rich Selection changing `focusOffset` during endpoint resolution.

**Fix:** Reject obsolete active-element snapshots; capture input start/end/direction once; capture native anchor/focus nodes and offsets together, and verify they have not changed after owner resolution or text offset calculation. Do not follow a stale bookmark after an intervening synchronous author action.

- [Tests `6f820f3`](https://github.com/Shelamkoff/editor/commit/6f820f399ddb299c6d584cfe4440f6a1bf47ccc4)
- [Fix `35ebb3c`](https://github.com/Shelamkoff/editor/commit/35ebb3c48184a4a3fcb64c03d89eef49ab4c6a21)

## Finding LS3 — legacy native Selection fallback lost backward direction (P2)

If `Selection.setBaseAndExtent` is missing, the previous `Range.setStart(anchor); Range.setEnd(focus)` path cannot represent a reversed anchor/focus pair. A DOM Range has sorted boundaries; setting its end before its start collapses the range, losing the requested selection.

**RED:** A test using DOM-Range-equivalent normalization reproduced a returned success with collapsed native offsets after requesting rich-text anchor=4, focus=1. A forward-range control stayed green.

**Fix:** When native `Selection.collapse` and `Selection.extend` are available, use them for the fallback so the original direction is retained. Keep the Range fallback for environments without those methods. This restores backward selection in the supported native fallback without changing `setBaseAndExtent` behavior.

- [Regression and positive control `40971ee`](https://github.com/Shelamkoff/editor/commit/40971ee32b11cb57125b36f7c84bd3090f490eaf)
- [Fix `fd19b04`](https://github.com/Shelamkoff/editor/commit/fd19b0485c8a2239a51f7a69eda323cc044efc51)

## Finding LS4 — native caret setter silently failed or was superseded (P2)

The earlier ownership guard only validated the mounted target and active host, not the resulting native offsets. `Selection.setBaseAndExtent` or `input.setSelectionRange` can return normally without changing the selection; a synchronous `selectionchange` callback can move the caret within the **same host** with no remount or change to `activeElement`. The old implementation would still report that the original caret had been restored.

**RED:** Three tests reproduced a silent rich setter, a newer same-field selection offset established inside the setter, and a silent plain-text setter.

**Fix:** Read back the input start/end and reject mismatches; for rich text, verify that native anchor/focus endpoints belong to the same mounted fields and correspond to the requested *logical* offsets. Comparing logical offsets rather than literal DOM node identity accommodates equivalent native boundaries around inline widgets and line breaks.

- [RED tests `4a30179`](https://github.com/Shelamkoff/editor/commit/4a301792087d2cb79a9f59cb83373eacf0a72595)
- [Fix `be5e730`](https://github.com/Shelamkoff/editor/commit/be5e730071de895900e0d9f120ebf759747f0d97)

## Verification ledger

| Checked-in suite | Tests | Result |
| --- | ---: | --- |
| `core/LogicalSelection.test.js` | 18 | 18 passed |
| `core/EditorViewModel.test.js` | 29 | 29 passed |
| `core/InteractionState.test.js` | 15 | 15 passed |
| **Total** | **62** | **62 passed** |

Ten tests were added in this pass. Nine reproduced the incorrect behavior before their respective fixes; one verifies unchanged forward native Range fallback. All test bodies were executed against the **current actual GitHub-fetched source** of these three production classes, using the real `shared/textOffset.js` and `shared/invokeObserver.js` helper implementations under an isolated V8 JavaScript executor with controlled native DOM/Selection adapters. The test code and production sources were re-fetched after the final changes.

**Not executed here:** repository `node --test`, `npm test`, complete TS check, native browser input/IME, package/docs gates and differential comparison with v1. The available local git client still cannot resolve `github.com` to obtain a complete checkout. The isolated fixtures are narrower than Chrome's full selection and event timing.

## Required local acceptance

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

Native acceptance should test rich/textarea selection in same and cross-block ranges, browser-native focus/selectionchange remount, a fieldless/media block, a replaced same-ID host, backward selection when `setBaseAndExtent` is absent but `collapse/extend` work, and a browser rejecting or normalizing a requested caret. Verify matching DOM selection and current logical bookmark, not only the method return value.

**Conclusion:** Four actual source-level selection ownership and native fallback findings are addressed with targeted regression evidence. Library-wide stability and complete v1 behavioral parity are still **unverified** until full Node.js/TypeScript/Chrome acceptance on the final branch HEAD.
