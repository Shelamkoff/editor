# Heading rich paste — 2026-11-05

**Accepted: BLOCK_HEADING_RICH_PASTE.**
Register: **149 accepted / 60 open / 209 total**. Tested source: `174cc8f6dd03099e6fd9d397cc327d2f05028453`.

`BLOCK_HEADING_RICH_PASTE` is accepted on `174cc8f6`: **149/209
obligations accepted, 60 open**. All **seven affected gates** pass on one clean
unchanged source. [Evidence](https://github.com/Shelamkoff/editor/blob/refactor/rector-v2-architecture/scripts/parity/checkpoints/2026-11-05/heading-paste/README.md): **72 current executions / 1,800
observations**, **408 module identities**, **24 rejected corruptions**.
No production change is needed.

Thirty native clipboard cases cover H2–H6, both selection directions and
three routes: rich external HTML, private rich text with an atomic Color widget,
and a registered heading root. Five more cases replace an empty H6 with each
supported imported level; one imports mixed H2/Paragraph/H6 roots in exact order.
Controlled producers receive native Copy and the editor receives native Paste
through the system clipboard. No synthetic Paste is substituted.

Literal expectations preserve source Bold and the target's inherited Italic
context, the current heading level, authored breaks and neighboring text. The
private widget and existing Color keep distinct sidecars, exact values, labels
and dots. Structural-first paste preserves selected author text and inserts
registered roots after it; an empty target reuses its ID. Exact tags, fresh-ID
bindings, native directed caret, one history action, raw Undo/Redo and caller
data are required. The initial prototype incorrectly omitted inherited Italic;
its exact source/results are archived and product behavior is retained.

All 36 current and immutable-parent cases finish without differences or page/
input errors. Baseline retains **15 differences**; v1 retains **88** across its
26 executed paste bodies. For ten old private-widget cases, actual native Copy
does not provide private MIME: availability and unchanged target/history are
observed, while private Paste/Undo/Redo bodies are explicitly **unexecuted**.
The initial exploratory old HTML fallback is retained as an attempted fallback,
not claimed as private widget preservation. Missing legacy observers are explicit.

Native pages pass **36 + 37 + 25 cases**, totaling
**98**; inventory is **116 native pages**. Documentation and site
checks pass. Exact runtime identity retains preceding Heading structure evidence
and all fifteen final integration gates on `c58523cc` with their original
sources/dates and separately recorded earlier Node compatibility failure.
Only this Heading paste row is newly accepted; broader clipboard obligations,
B-HTML and full readiness remain open.
