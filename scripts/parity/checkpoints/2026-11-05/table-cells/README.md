# Table rich cells and sibling projection 2026-11-05

**Accepted: BLOCK_TABLE_CELLS.**
Register: **168 accepted / 41 open / 209 total**. Tested source: `46438770cb554d4c1106490d9cdd7bc78fa4e943`.

`BLOCK_TABLE_CELLS` is accepted on `46438770`: **168/209 obligations accepted, 41 open**. All **seven affected gates** pass on one clean unchanged source. [Evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-05/table-cells/README.md): **16 current executions / 2064 observations**, **665 module identities** and **24 rejected corruptions**. Production is unchanged.

Eight cases combine both header modes and every cell in a two-by-two rich table. Distinct row IDs deliberately reuse cell IDs in different rows. Bold/italic/strike, entities, BRs and two independent Mention/Color pairs survive native edits in the chosen cell and its sibling, precise raw two-step Undo/Redo, readonly output and public editor re-render. Cell shape, tags, sidecars, caller data and retained snapshots are literal requirements. Native edits retain existing field/widget hosts and each create the correct action.

An external sibling-cell producer runs while the first field owns a collapsed caret at offset three. The active host, exact caret and all widget owners survive. Its own raw keyboard Undo/Redo changes only that external action. Current save timestamps remain exact unchanged caller metadata; the model checks they lie within the actual execution interval before comparing the time-free authored envelope. Provider searches never run.

V1 retains **64 differences** from grouped cross-cell edit history. Its eight public producer/projection and dedicated replay bodies are unexecuted because that API does not exist; no render substitution emulates it. Other native edit/history/output bodies finish. The baseline retains **eight lost-caret differences**, immutable parent and both current policies zero. Three exploratory attempts retain exact bytes/source/date. The first selector also counted old inline-tool buttons as widgets; the corrected selector requires actual widget IDs. Those extra initial differences are probe errors, not product defects.

The initial seven-gate run retains five passing gates, a failed identity review and its unexecuted dependent control gate. The generic verifier incorrectly required unused Paragraph rather than actual Table. Only that required module changes before the fresh complete green rerun; raw original outcomes and both verifier sources are archived. A second attempt on the corrected source stopped after a browser module fetch failure. Its unfinished manifest and logs are archived separately. Native pages pass **115 cases**, including Table keyboard and field clipboard regressions. Inventory is **146 native / 59 ordinary pages**. Documentation/site pass. Exact runtime/package identity and **96 Git-verified artifacts** retain all fifteen full checks on `a6704f65`, with their real source/date and asset-command follow-up. Only Table rich cells are newly accepted; Table paste/conversion and full readiness remain open.

Post-acceptance documentation and site checks pass on `7cdba43a`.
`artifact-hashes.json` verifies actual Git blobs and decoded compressed artifacts.
