# Rector v2 — inline command caret snapshot authority audit

**Date:** 2026-10-19  
**Branch:** `refactor/rector-v2-architecture`

## Starting point and parallel coordination

At the beginning of this pass, `SlashCommandController` had already received multiple commits from another agent, including provisional menu rollback, selection teardown and native-input event ownership. Its current HEAD was `5303f24d911b1a7ec4dcc366a10c048977c279b8`. Those changes were not overwritten or repeated. The focus shifted to `core/InlineCommandController.js` and `core/InlineCommandController.test.js`, preserving the repository's canonical transaction and explicit ownership approach.

## Finding INLINE-CMD-1 — plugin factories could author into a superseded caret (P2)

The `insert(type)` operation obtained its logical selection and then invoked extension-owned factory/definition callbacks during `prepareExtensionValue()`. The existing generation and mode-epoch checks correctly rejected editor destruction and read-only round trips, but did not account for a newer user caret choice within the same generation and edit mode.

A factory that synchronously selected a different block or field could return a valid new widget payload while the controller continued inserting at the previous `target.range` location.

**RED:** added a test where `createInitial()` changes the current captured caret to a different block. The unmodified controller returned success and invoked `insertInlineWidget()`; the expected result is false, zero author writes and no cursor restoration.

**Fix:** re-read the canonical logical selection immediately after extension preparation and before dispatching the document mutation. Only a same-block, same-field, same-range selection authorizes the prepared insert.

- [Failing-first regression tests `06b68193`](https://github.com/Shelamkoff/editor/commit/06b68193bb2a0de5469aa7f5a6d945c21c9c19a5)
- [Production fix `df1bfed7`](https://github.com/Shelamkoff/editor/commit/df1bfed7d72bbe45e68169dc32fc38cb78fe94fb)

## Finding INLINE-CMD-2 — Paste matchers could convert text after a newer selection (P2)

`pasteText()` similarly captured a target and delegated matching/canonical value preparation to extension `paste.fromMatch()` callbacks. The older result could be submitted to `replaceRichTextWithInlineSegments()` after the author explicitly selected another logical field, without a revision or mode-epoch change.

**RED:** a new test moved `selection.capture()` to another block inside `fromMatch()`. Before the fix the controller committed the former target's widget. With the fix, no edit or caret action occurs.

**Fix:** reuse one `#stillSelected(target)` helper to compare the currently captured logical range against the prepared command's original block, field, and offsets before authoring the canonical update. The same check is applied to explicit-data inline insert after its trailing-text factory, preserving public entry points and widget semantics.

- [RED tests `06b68193`](https://github.com/Shelamkoff/editor/commit/06b68193bb2a0de5469aa7f5a6d945c21c9c19a5)
- [Fix `df1bfed7`](https://github.com/Shelamkoff/editor/commit/df1bfed7d72bbe45e68169dc32fc38cb78fe94fb)

## Regression test refinement

An existing test of post-commit editor teardown assumed that precisely the **second** selection capture occurred after the canonical insertion, and destroyed the editor at that fixed read count. Adding a legitimate pre-commit selection revalidation moved that second read before insertion. This made the old test fail for its fixture timing, not for the observable teardown requirement.

The test was updated to trigger destruction only after `insertInlineWidget()` had actually committed. It still checks that a successfully committed edit returns true and never tries to restore a caret in a destroyed editor.

- [Fixture timing correction `a33fae17`](https://github.com/Shelamkoff/editor/commit/a33fae1704c05d188f51ad5d4b0a79f922cb0e5e)

## Verification

Re-executed the **complete current 47 test bodies** in `core/InlineCommandController.test.js` against the fetched actual controller implementation, `shared/synchronousResult.js`, `shared/cloneEditorData.js` and `shared/jsonData.js`, using isolated V8 and Node-test-like assertion adapters.

| Verification | Result |
| --- | --- |
| New regression scenarios on prior production implementation | **2 failures observed**: stale insert and stale Paste |
| Complete focused suite after fix | **47/47 pass, 134 assertions** |
| Standard Node `node --test` / full `npm test` | Not run |
| TypeScript/Chromium/package checks | Not run |
| Complete v1/v2 behavioral parity | Not established |

## Required local acceptance on final branch HEAD

```sh
npm ci
node --test core/InlineCommandController.test.js core/InlineTriggerController.test.js core/KeyboardRouter.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium, test an inline factory that shifts native selection within the same document, Paste matching with a user-selected successor caret, healthy same-selection insertions, and post-commit destruction. Verify that no prepared widget can be written to the prior field after the caret's ownership changes.

## Conclusion

Two bounded inline-selection ownership bugs were reproduced and corrected with direct commits. The full focused test set is green in the stated isolated execution. That result is not a full-library stability or v1/v2 parity certification.
