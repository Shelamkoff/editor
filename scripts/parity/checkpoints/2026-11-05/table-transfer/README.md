# Table native paste and conversion 2026-11-05

**Accepted: BLOCK_TABLE_PASTE_CONVERT.**
Register: **169 accepted / 40 open / 209 total**. Tested source: `aa181a13c98e4560f722ed99f3b277825fa51026`.

`BLOCK_TABLE_PASTE_CONVERT` is accepted on `aa181a13`. The register is **169 of 209 accepted with 40 open**. All fifteen integration checks pass on this clean source. The comparative proof records **48 current executions, 744 observations, 409 module identities and 24 rejected corruptions**. [Evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-05/table-transfer/README.md)

Four external system Copy/Paste cases combine both selection directions and headed and unheaded tables. Actual clipboard HTML contains a table and no private Rector fragment. The selected paragraph remains unchanged. The new table keeps its marks, headings and independent row and cell IDs. Insertion takes one action with exact keyboard Undo/Redo.

Twenty conversion cases cover marked text, a Color widget, a complete cell, a cell with only blank neighbors and all table fields. They exercise both header modes and both directions. Fully selected table text replaces the table and retains its block ID. Partial conversion preserves all unselected cells and IDs, including blank neighbors. The repair uses logical endpoints to distinguish real residuals from empty formatting. The model accepts the two observed inert bold wrappers in widget-only extraction and verifies exact raw replay. No other markup differences are normalized there.

Three focused regressions fail before the repair and pass with it. The reference v1 records eighty differences and lacks the chooser in four widget-only cases. Their conversion and replay bodies remain unexecuted. The baseline and immutable parent each retain sixteen differences. Both current policies pass with zero differences. The exploratory attempts retain their original cases and source bytes.

The full verification passes **59 ordinary browser pages and 395 cases on ten native pages**. It covers the package, size, heap, types, documentation and site. The first run passed thirteen gates. The related native suite stopped at a Chrome driver timeout, and the site browser smoke did not find a tooltip after a successful build and link check. An isolated run on the identical source passed the timed-out page, the two remaining pages and the site browser smoke. Both manifests retain their recorded outcomes. The native inventory has 148 pages. Only Table paste and conversion are accepted in this checkpoint. The broader clipboard and conversion obligations remain open.

Post-acceptance documentation and site checks pass on `f207c969`.
`artifact-hashes.json` verifies actual Git blobs and decoded compressed artifacts.
