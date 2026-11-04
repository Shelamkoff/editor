# Columns rich fields — 2026-11-04

**Accepted: BLOCK_COLUMNS_FIELDS.**
Register: **147 accepted / 62 open / 209 total**. Tested source: `7e5b84e195a667c8f4aa4ef5c1dab1412df11620`.

`BLOCK_COLUMNS_FIELDS` is accepted on `7e5b84e1`: **147/209 obligations
accepted, 62 open**. All **seven affected gates** pass on one clean unchanged
source. [Evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-04/columns-fields/README.md): **90 current executions / 1,758 observations**,
**882 module identities**, **40 rejected corruptions**. No new repair is needed.

Twenty-seven rich-field cases cover independent native typing in each of three
keyed columns, local Bold apply/remove and both range directions, and formatting
across adjacent and outer columns. Literal text/marks, all three distinct Color
sidecars/labels/dots, visible field contents, native caret/direction, neighboring
DOM and exact raw Undo/Redo are required. A separate fixed-vocabulary reviewer
links raw replay HTML to the literal character/mark model; equivalent b/i nesting
does not relax text, IDs or widget requirements.

Eighteen real type-chooser conversions select each field in both directions,
with text, widget-only and formatting-empty residuals. Every unselected column,
sidecar and stable ID survives; the selected rich text becomes a fresh Paragraph.
The target's recorded ID must survive exact replay. Empty Columns residuals
retain their authored layout and item identities. The first prototype incorrectly
expected that empty structure to be removed; its exact source/results and the
corrected run remain archived. Product behavior was preserved.

All 45 cases finish on v1, baseline, immutable parent and both current policies
without page/input errors. v1 retains **69 rich-field and 90 conversion
differences**; the other sources have zero. Missing legacy observers are explicit.
Three existing strict-schema tests in the inherited full Node run reject
unknown/mismatched layouts and missing/duplicate IDs and verify exact versions
and independent defaults. Their exact executed bytes, Git hashes and passing
names are retained; no separate unit invocation is claimed.

Native pages pass **45 + 46 + 33 + 8 + 9 cases**, totaling
**141**; inventory is **112 native pages**. Docs/site pass. Exact
runtime identity retains all fifteen passing final integration gates on
`c58523cc` and **173 Git-verified artifacts**, with their actual source/date.
The earlier failed Node-compatibility run remains separately recorded. Only this
Columns field row is newly accepted; B-HTML and full readiness remain open.
