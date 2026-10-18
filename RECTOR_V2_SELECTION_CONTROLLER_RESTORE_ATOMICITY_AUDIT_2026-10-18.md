# Rector v2 — cross-block SelectionController restoration and conversion-caret audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `af6a907c6b7c060e4d599c5affb2a8abd418ef1a`  
**Scope:** `core/SelectionController.js`, `core/SelectionController.test.js`, and a native-browser regression in `tests/browser/runtime-contracts.js`. Source-level regression for cross-block restore, focus remount, editor teardown, native direction and conversion caret. No persisted-data or public API changes.

## Canonical ownership contract

The selected document model, the controller's internal cross-block bookmark/highlight, and the native anchor/focus must refer to one currently mounted author-owned range. A successful restore must not publish selected blocks after a plugin remounts a field, a DOM focus event destroys its owner, or a native selection callback accepts a different caret. When backward range direction is not representable by a browser's available Selection APIs, an unsupported restore must not overwrite the prior selection.

For `conversionCaret`, the native collapsed caret is part of the same operation: publishing a cross-block selection and current block *before* collapse completes would expose a partially committed author selection.

## Finding SC1 — stale range restoration after focus remount, teardown, or throw (P1/P2)

The previous `SelectionController.restore` constructed a DOM Range from both fields, invoked plugin focus and passed the captured old node positions directly to `Selection.setBaseAndExtent` without revalidating the mounted fields afterward. If a plugin focus event remounted a same-ID field, the old text nodes were retired but still used. A `setBaseAndExtent` callback could destroy the controller, yet `#activate` and `view.select` still ran. A throwing plugin `focus()` was outside the old catch and escaped.

**RED evidence:** Three actual-class tests failed before the fix, while a normal cross-block range control remained green.

**Fix:** Capture generation, canonical revision and mode epoch before range preparation. Verify terminal health/abort state and both mounted field elements across the initial range, native selection acquisition, plugin focus and native selection application. Contain plugin DOM focus failures. A retired owner returns `false` without publishing the obsolete cross-selection. The successful canonical document state is not modified.

- [RED and control tests `c79b23a`](https://github.com/Shelamkoff/editor/commit/c79b23a6aed1cdcf60a809f60d402ead79361256)
- [Fix `b6486f3`](https://github.com/Shelamkoff/editor/commit/b6486f3e1c412b09e55bd21d66269d762f65bb35)

## Finding SC2 — direction was lost in native Selection fallback (P2)

Without `Selection.setBaseAndExtent`, the old restore invoked `Range` with sorted endpoints and then `removeAllRanges/addRange`. A DOM Range cannot preserve reversed native anchor/focus. A backward cross-block restore therefore silently became forward. On a browser lacking the `collapse/extend` pair, the attempt also replaced an existing user selection with an unrepresentable range.

**RED evidence:** Two failing tests demonstrated direction loss and destruction of the old range. A forward-range control remained green.

**Fix:** Prefer `collapse(anchor)` + `extend(focus)` where native `setBaseAndExtent` is not supported. Reject an unrepresentable backward request before focusing or modifying the prior native Selection; retain the Range fallback for representable forward selections. The existing logical ordering helper handles both same-field and cross-field positions.

- [RED and control tests `b4451a1`](https://github.com/Shelamkoff/editor/commit/b4451a15f3fe8c199e2c80b895b853acb1dcca1d)
- [Fix `794224b`](https://github.com/Shelamkoff/editor/commit/794224b3df13efb598bf4bb4f9e69890974238c0)

## Finding SC3 — silent native failure or newer caret still published cross-block selection (P2)

Before the native read-back guard, `restore` used the lack of a thrown exception as proof that the requested Selection existed. A browser setter might silently ignore the request or invoke a synchronous listener that moves the caret within the same mounted field. The old controller published selected blocks and a highlight for the superseded requested bookmark.

**RED evidence:** Two tests failed against the pre-fix source: a no-op `setBaseAndExtent` and a callback changing anchor/focus offsets to another valid native caret.

**Fix:** Re-read both native endpoints against the currently mounted field owners and convert native boundaries into the shared logical UTF-16 offsets. Publish the logical selection only when both native positions still match the original bookmark. The check allows equivalent DOM boundary representations around inline widgets rather than requiring node identity.

- [RED tests `45ece15`](https://github.com/Shelamkoff/editor/commit/45ece15f384a8ea3baf6d18999a0ccde357cd656)
- [Fix `44ba775`](https://github.com/Shelamkoff/editor/commit/44ba7754a75fd5401bef2fb5bf6f6c73ea963e1b)

## Finding SC4 — conversionCaret published intermediate state before native collapse (P2)

The previous path invoked `#activate` (internal bookmark, CSS highlight, `view.select`) and only then called `native.collapse` at the converted caret. If collapse threw, was absent, silently failed or a focus handler remounted the destination field, the command returned `false` but the old cross-block selection remained visible or active. A transferred native focus could also be overwritten.

**RED evidence:** Four tests failed against the corresponding pre-fix source versions: throwing collapse, destination remount, silent collapse, and native focus transferred to a newer author control. A successful conversion control remained green.

**Fix:** Require the native collapse method before beginning; perform native focus and collapse while the selection is unpublished. Verify the live source and target fields, active destination element and actual collapsed native offsets. Only then publish `#activate`, the conversion caret marker and current block. No intermediate selected-block event survives a failed conversion.

- [RED and success tests `ec794ee`](https://github.com/Shelamkoff/editor/commit/ec794eec713332aa2920d1c0a6b91a2305629a40)
- [Publication ordering fix `0c39cce`](https://github.com/Shelamkoff/editor/commit/0c39cce150978b94ffc80ce8e63d72b089273389)
- [Additional RED tests `aee646e`](https://github.com/Shelamkoff/editor/commit/aee646e318a910092917b0d9f95aa082be7c3cbe)
- [Collapse ownership fix `5320d65`](https://github.com/Shelamkoff/editor/commit/5320d656f9030102a5d5c783d666a784cebd0100)

## Browser acceptance

Added a native browser test with two real contenteditable fields to assert a backward cross-block restore retains the original native anchor field/offset and reversed focus field/offset without authoring a model revision:

- [Native runtime regression `028afea`](https://github.com/Shelamkoff/editor/commit/028afea8936e9d9b61205fc4ef19b182f16a06f6)

The browser fixture's JavaScript source was syntactically parsed but **not executed in Chrome** here. In particular, browser-native multi-contenteditable selection may differ from the isolated Selection adapter in callback ordering.

## Verification ledger

| Suite | Checked-in cases | Isolated result |
| --- | ---: | --- |
| `core/SelectionController.test.js` | 24 | 24 passed |
| New unit cases in this pass | 14 | All 14 passed on final source |
| Browser cases added | 1 | Syntax valid, Chrome not run |

Eleven newly added unit cases reproduced the intended pre-fix bugs; three were positive controls. The final target verification evaluated the exact current GitHub-fetched `SelectionController.js`, `SelectionController.test.js` and actual `shared/textOffset.js` under isolated V8 execution with controlled DOM, Selection, AbortController and queueMicrotask adapters. This is not a Node.js repository test runner or native Chrome test.

## Required local acceptance

From a clean checkout of the final HEAD:

```sh
npm ci
node --test core/SelectionController.test.js core/LogicalSelection.test.js core/EditorViewModel.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

The browser acceptance matrix should include: same- and cross-field backward selection, unsupported native Selection APIs, focus events remounting the anchor or focus field, synchronous teardown during `setBaseAndExtent`, native callbacks changing logical offsets, and conversion caret collapse failure with no stale highlight or current-block event. Check both backward direction and one canonical Undo/Redo step when the restored selection is used to edit.

**Conclusion:** Four confirmed cross-block native selection lifetime/direction findings corrected. Focused source-level tests pass, but full-library stability and complete v1/v2 behavioral parity remain **unverified** until complete Node/TypeScript/Chrome acceptance at current branch HEAD.
