# Paragraph split and merge — 2026-11-04

**Accepted: BLOCK_PARAGRAPH_SPLIT_MERGE.**
Register: **143 accepted / 66 open / 209 total**. Tested source: `340297dcdd2ac44d5d4fc5fc15a4330766eb63b0`.

`BLOCK_PARAGRAPH_SPLIT_MERGE` is accepted on `340297dc`: **143/209 obligations
accepted, 66 open**. All **seven affected gates** pass on one clean unchanged
source. [Exact evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-04/paragraph-structure/README.md) verifies **24 current executions / 424
observations**, **389 module identities** and **20 rejected corruptions**.
Production is unchanged from `ce76492c`; this scope needs no implementation repair.

Native Enter splits rich Paragraph content at start, inside Bold, immediately
after an atomic widget and at the end. Forward/backward text-range and whole
widget-range Enter replace exactly the selection and remain one action.
Backspace/Delete merge compatible paragraphs with both distinct Color sidecars;
document-edge keys preserve the author text and create no history. Source and
neighbor IDs, default Paragraph targets, marks, authored BR, meaningful spaces,
widget partition/removal, native caret/range direction and exact raw Undo/Redo
snapshots are checked. Caller data remains owned by its application.

The literal oracle compares every actual observation and event. Only empty
`<b></b>`/`<i></i>` representations are semantically neutral in these fixed
fixtures; nonempty characters/marks/BR and sidecars remain exact requirements.
Raw history replay still equals the captured post-action snapshot. The initial
three representation mismatches and exact fixture/results remain archived.

All twelve cases complete on v1, baseline, immutable parent and both current
policies with no page errors. v1 retains **31 differences**, baseline **one
Backspace caret difference**, parent zero. Missing legacy event subscriptions
are explicitly unavailable, not measured zero events. Current improvements
are preserved.

Native **12 + 13** cases and **25 existing Clipboard cases** pass, totaling
**50**. Inventory: **104 native pages**. Docs/site pass. Exact runtime-byte
identity retains the prior fifteen passing integration gates and two complete
native follow-up gates, including build/Node/types, broad browser, package,
bundle and heap, with their actual source/date. The original prior page timeout
remains recorded. Only this structural Paragraph row is newly accepted;
Paragraph text/alignment, B-HTML and full readiness remain separate obligations.

Post-acceptance documentation and site checks pass on `06411172`.
`artifact-hashes.json` verifies actual Git blobs and decoded compressed artifacts.
