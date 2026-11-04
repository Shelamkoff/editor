# Columns formatting-empty layout — 2026-11-04

**Supplement: BLOCK_COLUMNS_NO_LOSS_REDUCE; no additional row accepted.**
Register: **146 accepted / 63 open / 209 total**. Tested source: `c58523ccf1ab5bb521d800ff6b549fa4eccc54da`.

The `BLOCK_COLUMNS_NO_LOSS_REDUCE` follow-up on `c58523cc` fixes invented
line breaks when the removed or receiving column contains only empty Bold or
Italic markup. The register remains **146/209 accepted, 63 open**; this repair
accepts no additional scenario row. All **fifteen integration gates** pass on one
clean unchanged source. [Evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-04/columns-empty-layout/README.md): **16 current executions / 264
observations**, **665 module identities** and **20 rejected corruptions**.

Columns now uses the existing rich-text join, distinguishing visible text and
widget placeholders from formatting-only emptiness in the supplied document.
Direct controls and the settings menu preserve surviving column IDs, both Color
sidecars, the unchanged first field and exact native Undo/Redo. The editor and
published renderer contain no invented BR. Settings and inline-control actions
receive their UI ownerDocument alongside createId; the additive optional type
keeps direct pure-data capability calls compatible. The guide documents this
context. The unit regression also covers literal empty, BR and nonbreaking space
with an explicitly supplied parser.

The canonical pre-fix run retains **28 failed observations per current policy**
(24 content/output differences and four settings-document checks). Actual data,
events and commands match the immutable parent. Both current policies now pass;
baseline/parent retain 28 differences. v1 runs four direct layout bodies with
16 differences. Its four unavailable settings-menu layout bodies are explicitly
unexecuted; opening the actual old menu verifies that those layout actions are
absent. Legacy observer absence is also explicit.

The first prototype counted object-key order as a legacy difference and mistook
an empty menu container for layout-action availability. Its exact source/results
remain archived; the canonical actor checks structural values and opens the menu.
The first post-fix unit run had one unused-parser-counter expectation; all data
assertions passed, and correcting that expectation required no implementation
change. Original failing logs and executed test sources are retained.

The first complete integration on `20c39596` passed fourteen gates but exposed
one existing Node test calling the HTML-capable operation without any DOM.
Direct DOM-free calls now retain their prior literal-string joining; UI calls
continue using the owning parser and the repaired empty-markup semantics.
That failed run remains complete and separate. The fresh complete integration
passes all fifteen gates on the final source.

Native pages pass **8 + 9 + 33 + 169 + 14 + 15 + 16 + 14 cases**, totaling
**278**; inventory is **110 native pages**. Existing block/settings,
ordinary-input, IME and presentation-recovery controls pass. Build, Node,
implementation/public types, ordinary browser pages, package consumer/assets,
bundle, heap, docs and site gates pass with exact logs. Columns field editing,
formatting/selection/conversion, B-HTML and full readiness retain their separate
open obligations.

Post-acceptance documentation and site checks pass on `4bc49bef`.
`artifact-hashes.json` verifies actual Git blobs and decoded compressed artifacts.
