# Rector v2 — authored UTF-16 offset and text walker ownership audit

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `7bb9fdcb6f66016f8bb18b3d7550f82de11d189b`  
**Code checkpoint before this report:** `2fb69a526366a5bd8877c046dc31fe0b12789dfc`

## Scope

Continues the selection/normalization ownership work in [the preceding Unicode and native Range audit](RECTOR_V2_SELECTION_UNICODE_NATIVE_RANGE_AUDIT_2026-10-19.md). Relevant requirements are v2 remediation spec P4/I2/I6/I7/I8: logical selection and authored content must not accidentally include independent native controls, while true editing hosts inside plugin read-only shells still work.

This pass examined `shared/textOffset.js`, its existing `shared/textOffset.surrogate.test.js` tests and the native regression fixture `tests/browser/native-tools.js`. The audit also reevaluated existing `LogicalSelection` and `InlineSelectionAuthority` tests on the updated helpers.

The v1 `master` tree walker also excluded inline-plugin widget labels but had no general native-control ownership filter. These defects are not asserted to be regressions introduced by v2.

## Finding OFFSET-OWNER-1 — native labels polluted logical text offsets (P2)

`positionNodes()` yielded ordinary Text leaves under native buttons, `contenteditable=false` descendants and nested `contenteditable=true` hosts. Consequently `getTextLength(field)`, `getTextOffset(field, nativeBoundary)`, `findNodeAtOffset(field, offset)` and the surrogate helper could count independently owned labels as author text.

This is not just a rendering issue: logical selection bookmarks must share the same UTF-16 address space as the actual authored field. Native controls are auxiliary UI, not authoring text. Inline widgets remain atomic **one-unit** leaves, as required by the existing format.

**RED:** two new unit cases initially failed on the original source. A contenteditable field containing `A`, a button label, a locked label and `😀B` had an inflated logical length. A field containing a one-unit inline widget plus a nested independent editor also included the nested editor's text in its parent offset.

**Fix:** skip native/role buttons, native input/select controls, locked subtrees and nested editing hosts when walking a parent field. Retain BR/inline widgets as atomic one-unit leaves. When an endpoint occurs inside a control, `getTextOffset` now projects it to the containing authored field's edge rather than reading its private label as author text.

A second bug appeared during GREEN: a sibling subtree was measured by `getTextLength(sibling)` independently, making a nested `contenteditable=true` look like the **root** authoring host again and reintroducing its length. The corrected `textLengthWithin(subtree, ownerRoot)` retains the actual outer editing host throughout native-to-logical offset conversion.

- [Failing regressions](https://github.com/Shelamkoff/editor/commit/33bca52df228c5b8d5262f3fe392241bda736814)
- [Initial control boundary fix](https://github.com/Shelamkoff/editor/commit/4ce922b1efc37d2f3c3e4bc82ef2a4dbde9f27f3)
- [Root-scoped sibling length fix](https://github.com/Shelamkoff/editor/commit/6f5add5854931845054266ed8faa83f1a92e08bd)
- [Native-browser regression](https://github.com/Shelamkoff/editor/commit/033a257597fce09313bd0a330711db1e4bbb96ee)

## Finding OFFSET-OWNER-2 — text-only TreeWalker exposed native and nested UI (P2)

`editableTextWalker()` previously filtered only `[data-inline-plugin]`. An author-field walker still returned locked/native control labels and nested editing-host text, so functions using the public walker or `firstTextNode` / `lastTextNode` could address a different owner.

A simple blanket `closest('[contenteditable=false]')` rule would be incorrect: multi-field plugins such as Person/Poll/Columns place real `contenteditable=true` authored fields **inside** `contenteditable=false` block shells.

**RED:** two new focused walker cases failed. The single-field walker returned `native`, `locked` and `other field` in addition to its own `A` and `B`. The cross-block walker returned settings/locked labels rather than just the two nested authored fields.

**Fix:** `isOutsideEditableWalker` inspects the closest owner sequence up to the supplied walk root. Native controls and inline widgets are excluded. Under a true authoring host, nested true hosts have separate ownership; under a cross-block/false-shell root, a nested true field is still discoverable, even through its read-only plugin shell.

- [RED walker cases](https://github.com/Shelamkoff/editor/commit/acf7fb6df414556d02a125337b10ac6bb1b22bb5)
- [Production fix](https://github.com/Shelamkoff/editor/commit/d3d7c67bba748c341d6260a6efdea3f2f689ff2c)
- [Native-browser walker fixture](https://github.com/Shelamkoff/editor/commit/2fb69a526366a5bd8877c046dc31fe0b12789dfc)

## Focused verification

| Check | Result | Scope |
| --- | --- | --- |
| Original logical offset regressions | **RED, 2/2 new cases failed** | Actual old source with synthetic DOM |
| First production adjustment | One case GREEN; second still RED | Root-scope discrepancy discovered and fixed |
| Original text-walker regressions | **RED, 2/2 new cases failed** | Actual old walker with controlled TreeWalker |
| Shared `textOffset.surrogate.test.js` | **7/7 GREEN** | Actual current source/tests under isolated V8 |
| `LogicalSelection.test.js` | **26/26 GREEN** | Actual current source/tests under isolated V8 |
| `InlineSelectionAuthority.test.js` | **22/22 GREEN** | Actual current source/tests under isolated V8 |
| `inlineContent.test.js` | **9/9 GREEN** | Actual current source/tests under isolated V8 |
| `core/textOffset.realm.test.js` | **1/1 GREEN** | Actual current source/test under isolated V8 |
| Combined focused source-backed tests | **65/65 passed** | Lightweight V8 test/assert adapter, **not** `node --test` |
| Source/test syntax checks | **10/10 parsed** | ESM imports/exports stripped; not a TypeScript gate |
| Native Chromium DOM smoke | **Passed** | Minimal `page.set_content` smoke proved native `Node.normalize()` retargets a backward selection from the removed Text leaf to the retained leaf with correct `[6,4]` offsets. This did **not** execute Rector itself |
| New full-app browser regressions | **2 authored, not run** | Native offset and walker cases in `tests/browser/native-tools.js` |
| Full `npm test`, `typecheck`, browser harness, v1/v2 parity | **Not established** | Full project checkout/dependencies unavailable: GitHub DNS failed from the container |

Native Chromium was usable for a minimal standalone page via Playwright `set_content`, even though direct `data:` navigation was blocked by the environment. This is useful DOM confirmation, **not** a passing full Rector browser test.

## Follow-up and acceptance

After obtaining a complete checkout with installed dependencies, run:

```sh
npm ci
node --test shared/textOffset.surrogate.test.js \
  core/LogicalSelection.test.js \
  core/InlineSelectionAuthority.test.js \
  inline-tools/inlineContent.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In real browser acceptance, explicitly check selection before/after native controls and locked descendants, caret restoration across an inline widget, backward Unicode selection and one-operation Undo/Redo after cross-block formatting. Verify the saved model and inline sidecars remain unchanged by auxiliary control interaction. These gates have **not** been run on this branch head and full functional parity with v1 is **not** claimed.

All changed source/test files were written with the current GitHub blob SHA and committed directly to `refactor/rector-v2-architecture` without force push. No unrelated parallel work was overwritten.
