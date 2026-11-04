# Heading structure and conversion — 2026-11-05

**Accepted: BLOCK_HEADING_SPLIT_CONVERT.**
Register: **148 accepted / 61 open / 209 total**. Tested source: `612b5bf4f164d664f9b344bdcf2ae16bf21122f7`.

`BLOCK_HEADING_SPLIT_CONVERT` is accepted on `612b5bf4`: **148/209
obligations accepted, 61 open**. All **seven affected gates** pass on one clean
unchanged source. [Evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-05/heading-structure-conversion/README.md): **144 current executions / 3,032
observations**, **816 module identities**, **40 rejected corruptions**. No
production change is needed.

Forty-two structural cases cover H2–H6 Enter at the start, middle, after a
widget and at the end, forward/backward text replacement, H2/H6 selected-widget
removal, and plain or formatting-empty Enter/Backspace exit. The original ID
and level stay with the Heading prefix; a fresh Paragraph receives the suffix.
Empty exit reuses the original ID as a Paragraph. Literal rich text, authored
breaks, Color sidecars, tags, neighboring DOM, directed caret and exact raw
keyboard Undo/Redo are required.

Thirty conversions use the actual type chooser at H2–H6 with whole, middle
and widget-only forward/backward selections. Whole conversion reuses its source
ID. Partial conversion preserves both Heading residual levels and creates
distinct target/residual IDs. Text, marks and Color sidecars follow the selected
partition. Single-target conversion places the caret at its start; Undo restores
the original directed range. Redo restores exact data and IDs.

All current, baseline and immutable-parent cases finish without differences or
page/input errors. v1 completes 42 structural and 20 conversion bodies, retaining
123 and 130 differences respectively. The ten old widget-only chooser bodies
are explicitly **unexecuted**: actual UI availability, unchanged data and history
are observed separately. Missing legacy observers are recorded explicitly.
Initial exploratory sources/results are retained: the structural prototype
mistakenly expected a div rather than the real Paragraph p; the first old
widget conversion attempt stopped at the absent chooser. Neither is reported
as a product regression or an old behavioral pass.

Native pages pass **72 + 73 + 21 + 7 cases**, totaling
**173**; inventory is **114 native pages**. Documentation and site
checks pass. Exact runtime identity retains the preceding Columns field evidence
and all fifteen final integration gates on `c58523cc`, with original sources,
dates and the separately recorded earlier Node compatibility failure. Only this
Heading obligation is newly accepted; rich paste, B-HTML and full readiness remain
open.
