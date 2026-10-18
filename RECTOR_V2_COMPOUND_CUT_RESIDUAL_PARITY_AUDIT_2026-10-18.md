# Rector v2 — compound Cut residual parity and Table canonical documentation audit

**Date:** 2026-10-18  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `cac4a266e738ca08c461ab8977ea5b40fbf6eb3d`  
**Behavioral comparator:** v1 `master` (audited through `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`).

## Scope

This pass extends the prior Quote visual-empty Cut repair to the other *compound rich-text blocks*: **Toggle, Spoiler and Warning**. It also verifies current Table v2 schema documentation against `shared/blockSchemas/table.js`. No legacy runtime adapters, schema migration paths, or wire-format changes are introduced.

## Confirmed regression C-CUT-1 — Toggle

`Toggle.capabilities.clipboard.slice` tested `remaining.title.trim()` and `remaining.content.trim()` after a partial or cross-block Cut. Visually blank HTML such as `<strong></strong>`, `<br>` and `&nbsp;` is a nonblank source string, so an otherwise empty Toggle was incorrectly retained in the document after Cut. A nonempty neighboring field must prevent deletion, and the `open` author state must be carried forward if the block survives.

**Independent parity evidence:** v1 `plugins/toggle/index.js:isEmpty` tests the rendered title/body `textContent`. Empty formatting marks are not authored text; v2's `empty.isEmpty` already follows that visual contract.

**Fix:** evaluate both `remaining` rich-text fields through `isRichTextEmpty(field, context)` using the `ClipboardSliceContext.ownerDocument` introduced in the preceding audit. The returned `remaining` remains `null` only when both fields are visually empty. No change to persistent Toggle open state or the output part.

- [Test added](https://github.com/Shelamkoff/editor/commit/013c4ff324905d0c49ecc8b6d4d198d62591fcb8): `plugins/toggle/clipboard-empty.test.js`
- [Fix](https://github.com/Shelamkoff/editor/commit/a6c6e7fc75fe940329ad68df9fad24ae525b2623)

## Confirmed regression C-CUT-2 — Spoiler

The `Spoiler` compound Clipboard capability used the same `String.trim()` predicate for the residual label/content pair. This caused formatting-only empty source blocks to remain after Cut even though v1 `Spoiler.isEmpty` uses DOM `textContent` and v2's own `empty.isEmpty` recognizes those fields as visually empty.

**Fix:** use `isRichTextEmpty(remaining.label, context)` and `isRichTextEmpty(remaining.content, context)`. Nonempty label/content still prevents block removal.

- [Test](https://github.com/Shelamkoff/editor/commit/e4c0aa8ae4105274f16323a90aaf5b909bc07ffe)
- [Fix](https://github.com/Shelamkoff/editor/commit/70cd3051ca9624559f6ef555fa3b981f499c8369)

## Confirmed regression C-CUT-3 — Warning

The `Warning` compound Clipboard capability had the identical markup/string mismatch for title/message residuals. The v1 `Warning.isEmpty` classifies emptiness using both DOM fields' `textContent`.

**Fix:** use `isRichTextEmpty(remaining.title, context)` and `isRichTextEmpty(remaining.message, context)`; preserve a surviving field and its authored markup.

- [Test](https://github.com/Shelamkoff/editor/commit/dc009177be9c9779bf1b4f00a286577367abe619)
- [Fix](https://github.com/Shelamkoff/editor/commit/499b17b7106a53615de2d18e17815736fc3bacb1)

## Table v2 documentation mismatch (no code change)

Both `plugins/table/README.md` and `plugins/table/README.ru.md` described a removed `content` string-matrix field and stated that the default table size was 3×3. The actual strict v2 schema has `rows: Array<{id, cells: Array<{id, text}>}>`, a rectangular nonempty shape with row-local unique cell IDs, and a **1×1** default. This was verified against `tableDataSchema` rather than deduced from historical v1 behavior.

Updated documentation to describe the actual v2 canonical schema without changing runtime data or accepting v1 content.

- [English fix](https://github.com/Shelamkoff/editor/commit/4b6b8d46f4ddc4ae94eed7c48d8ab10e903ceafe)
- [Russian fix](https://github.com/Shelamkoff/editor/commit/161bc363da947eee4e6ac5fed79b5cf4a2024004)

## Verification boundary

1. **TDD RED:** executed the actual pre-fix built-in plugin source and registered test bodies in isolated V8. The visual-empty residual test failed for Toggle, Spoiler and Warning. The separate tests for meaningful residual text and unselected companion fields passed before source changes.
2. **TDD GREEN:** **6/6** checked-in `clipboard-empty.test.js` test bodies passed after changes, using actual plugin factory source and `isRichTextEmpty`, with a controlled owner-document template parser. The mock parser models plain text, empty markup and `&nbsp;`; it is not a real browser HTML/TrustedTypes parser.
3. **Syntax:** the three modified JS plugin modules and the three added `node:test` modules parsed successfully in V8 after static ESM import adaptation.
4. **Behavioral reference:** checked v1 Toggle/Spoiler/Warning `isEmpty` implementations directly. All use visible `textContent`, not literal persisted HTML length.

**Not run:** actual `node --test` inside full checkout, `npm run typecheck`, the native browser/IME/ClipboardEvent matrix, full v1-v2 behavior differential, package consumer tests, or heap/lifecycle gates. The container cannot resolve GitHub for a checkout, so commits went through the authenticated GitHub connector.

## Required release verification

```sh
npm ci
node --test plugins/toggle/clipboard-empty.test.js plugins/spoiler/clipboard-empty.test.js plugins/warning/clipboard-empty.test.js plugins/quote/clipboard-empty.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Add real-browser Cut/Undo/Redo cases where the selected author characters are wrapped by formatting marks; ensure the canonical source removes or retains the block consistently for empty and nonempty secondary fields. Continue comparing the exact current v2 schema and API to v1's *behavior* while rejecting obsolete v1 persistence shapes.

**Status:** three previously untested regressions corrected at public Clipboard capability boundaries; documentation updated to reflect the strict v2 Table schema. **Full library release stability and functional parity remain unverified.**
