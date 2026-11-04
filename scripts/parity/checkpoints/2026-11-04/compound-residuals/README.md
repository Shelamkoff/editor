# Compound residual cut merge and conversion — 2026-11-04

**Accepted: BLOCK_WARNING_RESIDUAL, BLOCK_TOGGLE_CUT, BLOCK_SPOILER_CUT.**
Register: **138 accepted / 71 open / 209 total**. Tested source: `54e04b11ad369fb68ed79314c6743c4de5bb7900`.

Three obligations are accepted on `54e04b11`: `BLOCK_WARNING_RESIDUAL`,
`BLOCK_TOGGLE_CUT` and `BLOCK_SPOILER_CUT`. The register is **138/209 accepted,
71 open**. [Exact evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-04/compound-residuals/README.md) retains all comparison sources, native input,
reviewer controls and the **fifteen passing gates** on one clean unchanged tree.

Warning merging used to append a line break for a formatting-only field such
as `<b></b>`, where an equivalent empty string added none. The repair treats
both operands by visible content, preserves authored marks and widget tokens,
and supplies the owning editor document to merge capabilities. The optional
context is passed consistently through adjacent merge, logical replacement
and both clipboard merge paths; two-argument third-party callbacks remain valid.
The immutable pre-fix run retains ten current failing merge observations.

The independent literal model verifies **152 current executions / 2,768
observations**, **1,240 module identities** and **54 rejected corruptions**.
Actual native Cut covers Warning, Toggle and Spoiler, both fields and directions,
text/widget survivors and formatting-only remnants. The exact private fragment
and selected plain text are checked; untouched content is not published. Warning
Backspace/Delete merging covers empty source and target fields. Its native type
chooser converts either selected field while preserving the residual owner or
reusing its ID only when empty. Data, distinct widgets, DOM identity, caller
ownership, one author action and exact keyboard Undo/Redo are verified.

Every historical case completes without page errors. v1 retains 156 Cut, 87
merge and 64 conversion differences; the baseline and parent retain ten merge
differences. Their superior current replacements are preserved. Missing legacy
event subscriptions are explicitly unavailable, not measured zero events.

Native pages pass **76 + 77** cases, including enforcing Trusted Types; existing
clipboard and conversion pages bring the selected native total to **306**.
The inventory is **98 native pages**. Build, Node, implementation/declaration
types, all 55 ordinary pages, package consumer/assets, bundle budget, heap,
documentation and site checks pass. These three rows alone are newly accepted;
broader clipboard contracts, the other field rows, B-HTML and full readiness
remain separate obligations.

Exploratory test corrections are retained: schema-key ordering and native
Range text across editing hosts were precondition issues. The first reviewer
incorrectly named removal of a fully empty merge source `block.merge`;
the correct existing transaction is `block.remove`. Exact original bytes and
the failed review are preserved. None of these corrections changed production.
