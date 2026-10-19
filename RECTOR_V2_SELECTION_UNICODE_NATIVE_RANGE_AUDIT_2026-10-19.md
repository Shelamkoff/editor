# Rector v2 — Unicode inline-selection boundaries and native Range preservation audit

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `e7bf65e8cde26ee7b95791aef889720f1b51e5e9`

## Scope and acceptance contract

Continue [editable-field normalization audit](RECTOR_V2_INLINE_EDITABLE_FIELD_NORMALIZATION_PARITY_AUDIT_2026-10-19.md) along the selection → formatting → DOM normalization → selection restore → Undo/Redo path.

Under `RECTOR_V2_REMEDIATION_SPEC.md`, authored editing gestures must preserve logical UTF-16 positions, backward native selection and canonical one-gesture history (P4/I2/I4/I6). An independently owned native control or inline widget must retain DOM identity (I6/I7). This audit tests the actual v2 implementation, not an assumed v1 migration path.

Reviewed `core/InlineSelectionAuthority.js`, `shared/textOffset.js`, `inline-tools/inlineContent.js`, and their unit/browser tests.

## Finding SELECTION-UTF16-1 — split surrogate pair across DOM Text leaves was admitted (P2)

A Unicode surrogate pair can be split between sibling DOM Text nodes or across inline styling wrappers while retaining one logical authored text string. The inline selection resolver formerly checked only whether a caret divided two UTF-16 units **inside the single native Text node** selected by `findNodeAtOffset()`. At the boundary between two Text nodes, it therefore admitted a caret in the middle of a surrogate pair. Merging the nodes changed the answer for the exact same logical offset.

**RED:** the newly authored `InlineSelectionAuthority.test.js` case failed on the original method: an invalid offset was accepted when the high and low surrogate were in adjacent Text leaves.

**Fix:** shared `splitsSurrogateAtOffset(root, offset)` walks the editor's existing logical position leaves rather than relying on a single DOM node. It rejects the interior of a UTF-16 surrogate pair within a node or across text/styling wrappers, but treats BR and inline-widget atoms as barriers. `InlineSelectionAuthority.#resolve` uses this shared guard for all endpoints.

- [Failing private authority regression](https://github.com/Shelamkoff/editor/commit/290c175b53625738f9edba4d190c24544627082d)
- [Independent UTF-16 helper tests](https://github.com/Shelamkoff/editor/commit/58e346b91c156905370d4db9fd4bf67567bd1e5f)
- [Shared logical-UTF-16 fix](https://github.com/Shelamkoff/editor/commit/9cf9cf806b2fbe40fab0cc06735c5f66b5595a9c)
- [Inline selection resolver fix](https://github.com/Shelamkoff/editor/commit/0b5ecb467ae1fa1f407b9ace8c3d962070cbdc27)

## Finding SELECTION-RANGE-2 — manual normalization did not preserve live native Range endpoints (P2)

The preceding refactor avoided `Element.normalize()` on a mixed editing host because it would recursively traverse inline widgets and native controls. Its replacement used `Text.appendData()` followed by `parent.removeChild(sibling)`. Unlike the browser's native `Node.normalize()` algorithm, removing a selected sibling relocates a live DOM Range boundary into the parent/child index rather than the retained Text node at its cumulative offset. This changes or collapses author selection despite unchanged document text.

**RED:** three focused synthetic DOM checks failed on the old helper:
1. An author-only field detached the selected second Text node, moving the simulated native Range endpoint into the parent.
2. A field containing a native button similarly detached the selected text segment.
3. A field with nested editable content merged text directly beside the nested owner, invalidating an existing text endpoint.

**Fix:** within a subtree free of nested `[contenteditable]`, inline widgets and native controls, delegate to the browser's `Node.normalize()`, which updates all live DOM Range endpoints according to native DOM semantics. If a parent has protected descendants or another editing host, **do not manually merge its direct Text children**. Descend only into safe author-owned subtrees and normalize them natively. This intentionally permits adjacent authored Text leaves at mixed-owner boundaries to avoid destroying unknown live Range objects. It does not change canonical document JSON or saved inline payloads.

- [Native selection RED regressions](https://github.com/Shelamkoff/editor/commit/5c412d9b7dc404788818cfca63e8d5ce17e3a23c)
- [Scoped native normalization fix](https://github.com/Shelamkoff/editor/commit/5e2ce1da42c11990b6fa3707003c798d50cbcd29)

## New browser acceptance cases

Three cases were authored in `tests/browser/native-tools.js`, but **not executed in Chromium**:

- [Backward Unicode selection retargeting and mixed-owner Text identity](https://github.com/Shelamkoff/editor/commit/c8f58ec347ee5e054214530766c5d2ab8a620440): select a DOM text leaf, normalize, verify the browser retained logical offsets and direction; with a native button present, ensure both text-node and button-label identities survive.
- [Cross-block Unicode case transformation and Undo/Redo](https://github.com/Shelamkoff/editor/commit/47ed95fcf5f94433645a12918d80bddf12b8a316): select backward across two blocks containing `Straße` and `Alpha`, transform to `STRASSE` and `ALPHA`, verify one history operation, Undo/Redo model equality, and selection anchor/focus offsets.

These are *authored expectations*. Until executed in a real browser, they are not evidence that browser history selection always survives.

## Focused verification

| Check | Result | Limits |
| --- | --- | --- |
| Old inline authority regression | **RED** | Actual previous class and text-offset source under synthetic DOM |
| New shared surrogate cases | **3/3 passed** | Actual helper under isolated V8 |
| Current authority suite including new case | **Passed** | Actual source/tests, isolated V8 with node:test/assert adapter |
| Old manual-normalizer selection regressions | **3 RED** | Actual old normalizer under a range-aware fake DOM |
| Current normalizer suite | **9/9 passed** | Actual source/tests; fake DOM models native Range retargeting |
| Combined focused suites | **34/34 passed** | Isolated V8; not a full Node.js package run |
| Syntax of eight involved JS source/test files | **Parsed** | Static ESM imports/exports stripped for isolated V8 |
| Chromium / full `node --test` / typecheck / package acceptance | **Not run** | Complete checkout and dependency/browser harness unavailable here |
| Full v1/v2 native gesture and Undo/Redo parity | **Not established** | Requires local acceptance |

## Required next verification

From the complete checkout:

```sh
npm ci
node --test core/InlineSelectionAuthority.test.js shared/textOffset.surrogate.test.js inline-tools/inlineContent.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium, check the new two normalization scenarios plus the backward cross-block Unicode case-transform Undo/Redo cycle; repeat with inline widgets between styled text leaves, native controls inside authored fields and caret near empty text nodes. The committed changes have not passed full acceptance.

All writes were committed directly to the existing branch after fetching each path's current blob SHA. No force updates or unrelated agents' files were overwritten.
