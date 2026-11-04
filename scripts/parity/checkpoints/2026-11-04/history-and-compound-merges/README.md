# History and compound merges — 2026-11-04

**Accepted: HISTORY_GESTURE, HISTORY_BUDGET.**
Register: **142 accepted / 67 open / 209 total**. Tested source: `ce76492c0ed242205b617a2dd6179ae45e6b57e4`.

`HISTORY_GESTURE` and `HISTORY_BUDGET` are accepted on `ce76492c`:
**142/209 obligations accepted, 67 open**. The initial sixteen-gate run retains **fifteen passes and one native-page timeout**.
Both complete native follow-up gates pass on the same unchanged source. [Exact evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-04/history-and-compound-merges/README.md) retains the full
comparison, trusted Chrome events, negative controls and package artifact.
The 120-second page deadline ended the conversion page after 46 of 53 cases;
the active case passes alone. All 53 cases and the 68 field-clipboard cases
that the first run had not reached pass in the full follow-up. The original
timeout logs remain archived; successful repeats use the same code and conditions.

History contributes **40 current executions / 796 observations**: count-only,
explicit undefined bytes, a one-byte budget and a wide budget cover grouped
typing, focus boundaries, structural Enter, insertion, a no-op after Undo and
branching. Whole document/identity and native selection snapshots, exact author
action/replay events and truthful history flags pass. The complete Node suite
also passes all **25 byte-boundary/failure cases**, including independent UTF-8
costs, disabled accounting, oversize whole actions, coalescence, continuation,
branching, abandoned/stale plans and failure without cursor/eviction changes.
No history implementation change is required.

The same verification repairs additional empty-markup merges. Quote captions,
Toggle and Spoiler fields used to add a line for `<b></b>` or `<i></i>` where
an empty string added none, including native Cut between two blocks of one type.
One shared helper now joins two visible fields with a line break and preserves
the nonempty operand otherwise. Warning uses that same tested helper. Quote's
main text keeps its concatenation contract, and Toggle keeps authored open state.
The owning document supplies HTML parsing without borrowing another editor's realm.

The complete literal model verifies **280 executions / 3,772 observations**,
**1,262 module identities** and **60 rejected corruptions**. Native merge adds
224 executions / 2,688 observations; same-type residual Cut adds 16 / 288.
Both sides, Backspace/Delete, empty strings/formatting, two distinct widgets,
exact selected private Clipboard parts and unselected neighbors are checked.
The immutable RED source retains **26 merge + 6 Cut failures per policy**.
Its complete observed states/events match the independently executed immutable
parent, whose runtime bytes are identical. An initial expected Quote word
serialization was corrected for adjacent Bold normalization; its exact raw run
and fixture remain archived, and the text-concatenation behavior is preserved.

Every source completes all scenarios without page errors. v1 retains 348 merge,
24 Cut and 39 history differences; baseline retains 36, 8 and 17; compound
parent retains 26 + 6, history parent zero. Legacy byte-budget absence and event
API limitations are explicit. Improved current behavior is preserved.

The new native pages pass **140 + 141** cases. Existing rich fields, disclosure,
clipboard and conversion pages bring the selected total to **577**; inventory
is **102 native pages**. Build, **2,221 Node passes / three skips**, implementation
and declaration types, all 55 ordinary pages, external package consumer/assets,
bundle, heap, docs and site pass. Only the two history rows are newly accepted;
the compound repairs extend regression coverage of previously accepted rows.
B-HTML and full readiness remain open.

Post-acceptance documentation and site checks pass on `f9eccb91`.
`artifact-hashes.json` verifies actual Git blobs and decoded compressed artifacts.
