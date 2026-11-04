# Quote fields and rich selections — 2026-11-04

**Accepted: BLOCK_QUOTE_FIELDS. Register: 134 accepted / 75 open / 209 total.**

Tested reviewer source `373ce247b986eb41fd268250a43386c9ef47d37d` passes both follow-up gates. The initial
`41131315` run passes all five product gates; its proof fails an event-API
classification assertion and its dependent controls never run. The one-file
checker correction distinguishes the v2 baseline from absent v1 subscriptions.
Both manifests and all available logs are preserved.

The independent literal oracle verifies **32 current executions / 944
observations**, **455 module identity checks**, and **20 rejected corruptions**.
Every source completes all sixteen real cases without page errors. v1 retains
50 failed observations; baseline 34; immutable parent zero. Missing legacy
event APIs remain explicit. Real save timestamps are bounded by run times.

Both text/caption support native caret and backward replacement, distinct
Color references and labels/dots, field/widget/neighbor identity, independent
marks and exact keyboard replay. Directed cross-field Bold apply/remove covers
Text/Element endpoints. The established ANY-selected-bold removal rule remains
intact. Empty fields, Tab/Shift+Tab offsets and read-only save roundtrip pass.
The first exploratory mixed-toggle expectation mistake is retained verbatim.

Native **16 + 17 + 27 = 60** cases pass, including existing rich sibling,
paste/merge/conversion and incompatible-boundary tests. Docs/site pass. The
default inventory is **94 native pages**. No production code changes are needed:
all runtime bytes match `932f119b` and the accepted Slash runtime `3c02d2d4`.
Its build/Node/type/package/bundle checks and preceding complete eighteen-gate
integration and heap measurements retain their own dates and sources.

Only BLOCK_QUOTE_FIELDS is newly accepted. B-HTML and full readiness remain open.
