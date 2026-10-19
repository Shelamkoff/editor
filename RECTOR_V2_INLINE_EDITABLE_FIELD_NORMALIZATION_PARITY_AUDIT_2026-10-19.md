# Rector v2 — inline normalization within real editable fields and Unicode logical offsets

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `27297e60c26df5be61305c56298721bf0fe9f902`  
**Code checkpoint before this report:** `62ea325e322160eb08798b16daf697d985cc5923`

## Scope

Continue [the prior DOM normalization ownership audit](RECTOR_V2_INLINE_NORMALIZATION_OWNERSHIP_AUDIT_2026-10-19.md) through the real multi-field plugin layout, native logical selection and Undo/Redo acceptance boundary. The remediation spec requires that a formatting action change authored text only (I6/I7), preserve logical selection/history consistency (P4), and not rewrite another owner's DOM. This pass focuses on the precise authoring-host boundary and concrete UTF-16 offsets, not a schema change or new history layer.

Reviewed `inline-tools/inlineContent.js`, `inline-tools/utils.js`, unit cases in `inline-tools/inlineContent.test.js`, browser scenarios in `tests/browser/native-tools.js`, and markup/field registration of Person, Poll, Columns, Quote, Table and List.

## Finding FIELD-NORM-1 — normalizing a cross-block walk root touched static UI instead of authored fields (P2)

The previous `normalizeAuthoredText(root)` traversed all descendants when `root` was an editor shell without its own `contenteditable` attribute. It merged adjacent text nodes in static UI labels outside actual editing hosts, yet treated nested `[contenteditable]` fields as traversal barriers. This was an unintended side effect of the earlier protection against recursively normalizing native controls.

**RED:** two new unit cases failed on the former implementation. An editor-shell fixture merged unrelated UI-label text nodes and did not normalize the two authored fields (`Stra` + `ße`, `A` + `😀B`).

**Fix:** resolve whether the supplied root is itself inside an authored editing host. Outside one, walk the shell as a *discovery-only* container and normalize explicit `contenteditable="true"` fields; skip native and inline-widget owners. Never merge static shell/toolbar text. Nested independently owned `contenteditable=true` hosts under a true host remain separate.

- [Initial RED tests](https://github.com/Shelamkoff/editor/commit/d7358f7f40a19669bbd6c2d64279a513bae9ac84)
- [Host-scoped normalization fix](https://github.com/Shelamkoff/editor/commit/ea295e08e48c346eb66e1e08f35548a52f707665)
- [Shared cross-root normalization and tag-merger guard](https://github.com/Shelamkoff/editor/commit/341c6289ac1624b703ddc64f65c072fbe994e9db)

## Finding FIELD-NORM-2 — read-only plugin shells blocked their legitimate editable fields (P2)

Person, Poll and Columns deliberately create outer `contenteditable=false` wrappers and inner `contenteditable=true` authored fields. The earlier normalizer rejected **any** node with a false ancestor, even when the supplied root was the actual explicitly editable field. The earlier `mergeAdjacentTags()` guard had the same blanket false-ancestor restriction.

**RED:** an explicit true field inside a false plugin shell could not merge ordinary text fragments. This was reproduced with the actual helper using a synthetic DOM fixture.

**Fix:** a directly targeted true editing host is author-owned even if a plugin-specific false shell surrounds it. Native button, input, role-button and `data-inline-plugin` owners remain hard boundaries. Inline empty-wrapper cleanup uses the same nearest-editing-host check, so an author span under a false plugin shell may be removed without entering a locked element. Adjacent-tag merging likewise requires an actual author host and does not touch static UI.

- [Original host-boundary fix](https://github.com/Shelamkoff/editor/commit/ea295e08e48c346eb66e1e08f35548a52f707665)
- [Regression for fields inside false shells](https://github.com/Shelamkoff/editor/commit/86cf4aea1b9a0e33380cc4a78dbc70b563b597b9)
- [Explicit author ownership for tag merging](https://github.com/Shelamkoff/editor/commit/341c6289ac1624b703ddc64f65c072fbe994e9db)

## Finding FIELD-NORM-3 — a false block shell as the immediate normalization root still skipped authored fields (P2)

Even after fixing a true field passed directly, the function returned early if its *immediate* root was a `contenteditable=false` block shell containing multiple actual editable fields. This occurs when a cross-field range has its common ancestor inside a block.

**RED:** the new block-shell fixture failed with the previous implementation, leaving `one` + ` two` and `Stra` + `ße` split rather than normalized.

**Fix:** a false shell is a traversal-only container: discover its true fields without modifying its own static/locked text. The normalizer still skips hard native/inline-widget subtrees and nested true hosts.

- [Block-shell RED regression](https://github.com/Shelamkoff/editor/commit/2ff51f6e4b7a7c63fdd5d553c00c7187d2c4429d)
- [Block-shell fix](https://github.com/Shelamkoff/editor/commit/17f243ad93133c332cb17ecc0956344ee65f9a21)

## Verification

| Check | Result | Scope |
| --- | --- | --- |
| Original host-boundary regressions | **RED: 2/2 new cases failed** | Actual old `inlineContent` source and controlled DOM |
| Root-is-false-shell regression | **RED: one new case failed** | Previous source vs new independent expectation |
| Revised `inlineContent.test.js` | **7/7 cases passed** | Actual source/test bodies in isolated V8, with a minimal `node:test`/assert adapter |
| Revised `normalizeAfterEdit` cross-root | **Passed** | Actual method + source-driven DOM fixture; nested true owner untouched, false-shell author field normalized |
| UTF-16 `getTextLength` and `getTextOffset` + `findNodeAtOffset` | **Passed** | Actual shared logic; `Straße` = 6 UTF-16 units and `A😀B` = 4; endpoints round-trip after node merging |
| Static syntax parse | **Passed for 4 changed JS files** | V8 parse after stripping module imports/exports, not TypeScript |
| Browser regressions | **3 new scenarios authored, not run** | Cross-field host ownership, backward Unicode selection, cleanup within a false plugin shell |
| `node --test`, `npm test`, TypeScript, full Chromium | **Not executed** | Requires full checkout/dependencies and viable browser runner |
| Native Undo/Redo parity and v1/v2 parity | **Not established** | Existing gesture/history matrix must be run in Chromium |

The browser cases are:
- [Nested editing ownership](https://github.com/Shelamkoff/editor/commit/8a52b6fb85cb92a36a73861257cc64a5c3ed8c9)
- [Unicode offsets and backward native selection](https://github.com/Shelamkoff/editor/commit/a22ea32edb2f39715ab4f45dae0f8304c383c046)
- [Empty authored markup within false plugin shells](https://github.com/Shelamkoff/editor/commit/62ea325e322160eb08798b16daf697d985cc5923)

The test fixture's `getAttribute` behavior was aligned with the real DOM in [`ad465883`](https://github.com/Shelamkoff/editor/commit/ad465883bfa9ce3fd34dcc775462dbf9d2135322). Obsolete selector state was removed in [`0807415b`](https://github.com/Shelamkoff/editor/commit/0807415b33c4261798a1f0b60b402a48c28e60e6).

## Remaining acceptance

From a complete repository checkout, run:

```sh
npm ci
node --test inline-tools/inlineContent.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

The new focused unit cases do **not** establish one-history-entry or Undo/Redo correctness for actual user gestures. Validate with a real editor: select Unicode text in reverse direction, apply/unapply font/case/tag controls across two fields, inspect saved document, then Undo/Redo and verify both endpoints, active editor host and preserved inline widget payload. The previous synthetic suite did not establish browser acceptance.

All writes were made directly to the requested branch with current blob SHAs; no force push or unrelated code overwrite was used.
