# Poll authoring and local voting 2026-11-05

**Accepted: BLOCK_POLL_AUTHOR, BLOCK_POLL_LOCAL.**
Register: **164 accepted / 45 open / 209 total**. Tested source: `2b9951213a7bf51c3630d6a4a20cf1de1a49ff27`.

`BLOCK_POLL_AUTHOR` and `BLOCK_POLL_LOCAL` are accepted on `2b995121`: **164/209 obligations accepted, 45 open**. All **seven affected gates** pass on one clean unchanged source. [Evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-05/poll-author-local/README.md): **52 current executions / 1038 observations**, **409 module identities** and **24 rejected corruptions**. Production is unchanged.

Fourteen author cases cover a marked question and both option fields, actual add/remove controls and native Enter/empty-markup Backspace, stable/fresh IDs and order, type changes, every results visibility transition, sorting and reset. Distinct initial option counts bind the result mapping during sorting. Empty new options display their declared dash placeholder. The two-option minimum leaves no active remove control; current disabled controls are retained. A multiple-to-single change adjusts the current local ballot without rewriting other ballots. Source input and exact raw Undo/Redo are required for every change.

Twelve local cases combine single/multiple choice, all three results modes and first vote/revote. Literal known totals distinguish the ballot denominator from summed option votes; multiple percentages may exceed 100% in total. Selection is transient; submitting updates the declared persisted `initialResults` in exactly one action. Repeating the identical ballot changes no counts and adds no action. Results visibility, exact percentages/bar widths, current user selection, canonical data and native history are checked before/after vote and replay. This is the documented local history contract; remote live results remain a separate unaccepted obligation.

All 26 reference bodies finish without input/page errors or unavailable bodies. V1 retains **61 differences**, baseline three, and immutable parent/both current policies zero. Missing old transaction observers remain explicit; the final old repeat phase makes no zero-event claim. Three exploratory attempts retain their exact sources/bytes/dates, including initial blank-label expectations, the added unequal sort counts/reset paint checks and the corrected minimum-control expectation. No old behavior is restored.

Native pages pass **83 cases**, including prior Poll field/widget ownership and runtime regressions. Inventory is **142 native / 57 ordinary browser pages**. Documentation and site pass. Exact runtime/package identity and 115 Git-verified artifacts retain all fifteen full gates on `c0054fb8`, with actual source/date. Only authoring and local voting are newly accepted; Poll remote/race/renderer and full readiness remain open.

Post-acceptance documentation and site checks pass on `c0683ad1`.
`artifact-hashes.json` verifies actual Git blobs and decoded compressed artifacts.
