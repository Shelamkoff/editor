# Rector v2 — Table/Columns structural, Clipboard and shortcut parity audit

**Date:** 2026-10-18  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `d2d01e87d45f825d0020cf94d10c1a742232cc5a`  
**Historical comparison:** Rector v1 `master` (prior audit baseline `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`).

This pass audits the v2 Table/Columns public capability and schema boundaries, focusing on **multi-cell Cut/Paste slices, selected rectangle ownership, stable row/column identities, layout changes and keyboard navigation**. The work follows the C4/S8 structural contract and does not add a legacy adapter or accept the old Table/Columns wire shape.

## Confirmed defect: Table Enter dereferenced a missing field slice (P2)

The public Table shortcut capability delegates Enter to the nullable `ShortcutOperationContext.splitField(fieldKey, range)`. The declared contract returns either `{before, after}` or `null` when a field is stale, unregistered or no longer sliceable. The existing Table implementation unconditionally read `parts.before` and `parts.after`, causing a `TypeError` on that legal rejected decision. The core keyboard router caught the exception and canceled native editing but unnecessarily surfaced a plugin error instead of declining an inapplicable shortcut.

**RED:** a new test of the real `createTablePlugin().capabilities.shortcuts.handle()` invoked Enter with a stale row/cell address and a `splitField()` implementation returning `null`. The original source failed with a dereference error. Positive controls for rich-text split and Tab traversal passed.

**Fix:** handle `null` by returning `null` (no action) before dereferencing `parts`. Valid Table Enter still emits one `kind:'update'` with a rich-text line break and caret restoration in the addressed cell. This is consistent with core's nullable shortcut preparation contract; it does not weaken validation or fabricate stale edit targets.

- [TDD regression](https://github.com/Shelamkoff/editor/commit/c7bdf3d6bc1e6ec4bfe2d30cf19224644b01bcde) — `plugins/table/shortcut-parity.test.js`.
- [Production fix](https://github.com/Shelamkoff/editor/commit/30fa92a4d0b3d1dbc33e203437049b42c894bca6).

## Structural/C4 tests added without speculative code changes

**Table:** added `plugins/table/clipboard-grid.test.js` with a 3×3 selection spanning nonadjacent columns and multiple rows. The selected transferable block contains the minimal rectangular row/column area, with empty cells where the rectangle includes unselected author values. The original grid retains all unselected cell data, and only the selected intervals change. A slice starting below the heading row must not declare its first row a heading, while the residual source retains its setting. Settings row/column additions preserve IDs, dimensions and source data.

- [Table Clipboard tests](https://github.com/Shelamkoff/editor/commit/8831ccf1ab06af94cd23b20e2c89de635415c099).

**Table keyboard:** added tests for rich text splitting with escaped row/cell identity tokens such as `cell:r%3A0:c%250`, nonmutation of sibling cells, and row-major Tab/Shift+Tab navigation. The stale input regression above was the only failing focused Table case before the fix.

**Columns:** added `plugins/columns/layout-clipboard.test.js` for 3→2 layout reduction: overflow rich text is appended to the surviving second column without changing source objects or IDs. Growing to three adds exactly one new stable ID; shrinking back recovers the original two values. Compound Clipboard transfers only selected text and layout, blanking unselected fields in the transferable block while preserving them in the source residual.

- [Columns layout/Clipboard tests](https://github.com/Shelamkoff/editor/commit/b2b902caca192b565ce4b7daaa4120fadb31c3cb).

**Columns strict v2 schema:** added `plugins/columns/strict-schema.test.js` verifying exact `dataVersion`, detached encode/decode, independent defaults, stable required IDs, and rejection of unknown layouts, wrong column counts, duplicate IDs or legacy entries missing IDs.

- [Strict schema tests](https://github.com/Shelamkoff/editor/commit/233596da2ae2c5c698a32722f4f80eec65b40241).

The Table/Columns structural and schema cases passed **without** adding implementation changes beyond the Table nullable shortcut guard.

## Documentation discrepancies fixed

The English and Russian Columns READMEs incorrectly described column entries as `{content: string}` rather than required `{id: string, content: string}`. They also claimed invalid document imports would silently normalize unknown layouts and merge extra columns. The strict v2 schema instead rejects these invalid inputs; merging is performed **only** during a valid user-initiated layout setting change. Both READMEs were corrected accordingly.

The Table READMEs were updated to specify Enter/Tab behavior and non-applicable stale cell shortcuts.

## Focused execution

- Table `shortcut-parity.test.js` and `clipboard-grid.test.js`: **6/6** passed against the fixed factory source in a controlled V8 harness. Prior to the guard, the stale-slice test failed and five controls passed.
- Columns `layout-clipboard.test.js`: **3/3** passed against the current factory source and exported layout metadata.
- Columns `strict-schema.test.js`: **3/3** passed against actual `columnsDataSchema`, `createVersionedDataSchema` and `cloneJsonValue` sources in V8.
- **Total selected: 12/12**, all pass in targeted source execution. The mocks are only narrow dependency adapters; they do not simulate real browser native selection or history.
- GitHub branch source was fetched and updated with SHA-checked commits; no speculative changes to Table/Columns schema or persistent data format were made.

**Verification boundary:** these focused V8 tests are not a native Node test-run against installed dependencies. The full `npm test`, `npm run typecheck`, native Chromium Table/Columns selection and toolbar actions, Copy/Cut/Paste between editors, end-to-end Undo/Redo, iframe DOM realm and package consumer checks have **not** been executed on this branch tip in the current environment. Do not claim release stability or exhaustive v1/v2 behavioral parity from this evidence.

## Final acceptance commands

```sh
npm ci
node --test plugins/table/clipboard-grid.test.js plugins/table/shortcut-parity.test.js plugins/columns/layout-clipboard.test.js plugins/columns/strict-schema.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Native browser follow-up: actual mouse selection crossing Table cells in both directions, saving a rectangular private clipboard fragment, pasting into an independent editor, Cut/Undo/Redo while retaining untouched cells and header state; 3→2→3 Columns layout changes with rich marks and inline widgets, native caret restoration and Undo/Redo; Tab and Enter on escaped author field IDs.

**Status:** one confirmed nullable-shortcut bug fixed; Table/Columns structural behavior covered by independent regressions, existing logic retained where correct; strict v2 schema and documentation aligned. Remaining native/full-project gates are mandatory.
