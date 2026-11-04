# Toggle and Spoiler rich fields — 2026-11-04

**Accepted: BLOCK_TOGGLE_FIELDS, BLOCK_SPOILER_FIELDS.**
Register: **140 accepted / 69 open / 209 total**. Tested source: `2c4f35d3665f1c28c53d0b89dd610df3a1ec4db2`.

`BLOCK_TOGGLE_FIELDS` and `BLOCK_SPOILER_FIELDS` are accepted on `2c4f35d3`:
**140/209 obligations accepted, 69 open**. All **seven affected gates** pass on
one clean unchanged source. [Exact evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-04/disclosure-fields/README.md) verifies **56 current
executions / 2,236 observations**, **465 module identities** and **24 rejected
corruptions**. No production repair is needed.

Actual Toggle title/content and Spoiler label/content fields preserve native
caret insertion, backward replacement and cross-field Bold apply/remove.
Text and Element boundaries in both directions retain unselected marks,
separate Color references, labels/dots, authored breaks, nodes and caller data.
Native selection positions and direction are checked after action, Undo and
Redo. Empty-field deletion cannot discard its nonempty sibling. Saved data
opens in a real read-only editor with unchanged widgets and no author history.
Native conceal/reveal preserves all rich data: Toggle starts open for this
fixture, while the read-only Spoiler correctly starts closed.

The literal rich-field oracle remains unchanged at `373ce247`; only expected
document type/field names and Toggle's authored open value map to these types.
The actual factories/classes run unchanged. Every historical case completes
without page errors. v1 retains **144 differences**, baseline **56**, parent
zero. Current improvements are preserved, and absent legacy observation APIs
remain explicit limitations. Real save timestamps are bounded by the run.

Native **28 + 29** cases and **18 existing disclosure cases** pass, totaling
**75**. The native inventory is **100 pages**. Runtime bytes exactly match
`54e04b11`, retaining its fifteen passing integration gates and 192 verified
Git artifacts, including Node/types, all ordinary pages, package, bundle and
heap checks with their original source/date. Docs/site pass. Only these two
field rows are newly accepted; B-HTML and full readiness remain open.

Exact exploratory fixtures/results are retained. Their field-name shadowing,
schema-key order, initial reader visibility and placement of the selection
assertion were test mistakes, corrected without production changes. The final
independent model checks every observation and trusted event.

Post-acceptance documentation and site checks pass on `90070bb0`.
`artifact-hashes.json` verifies actual Git blobs and decoded compressed artifacts.
