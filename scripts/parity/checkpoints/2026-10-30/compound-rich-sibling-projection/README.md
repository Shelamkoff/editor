# Compound sibling projection — 2026-10-30

This checkpoint records the Quote, Warning, Image and Embed repair in
`f4a8c3cc`, based on `355577fc`. It preserves live authored fields when an
unrelated field or presentation property changes. It does not accept complete
detailed preservation-register rows or claim whole-library parity.

## Confirmed behavior

Quote and Warning compared hydrated `innerHTML` to canonical widget tokens.
Image did the same for its caption when appearance or source data changed.
Embed retained a stale instance caption after native input, so its next
metadata update could replace the entire caption host. These paths changed
live Text/widget ownership and collapsed author ranges despite preserving the
saved strings.

The fix uses the existing `update(next, previousCanonical)` contract. Unchanged
canonical fields retain their DOM; actual field changes still project through
the existing sanitizer and inline owners. Image and Embed pass their current
canonical caption through mode transitions without replacing its live field.
No model, history owner, selection protocol or public API was added.

The shared native fixture tests both Quote fields, both Warning fields, Image
appearance and Embed title updates. Each case contains real Mention and Color
widgets with fixed sidecars. Six cases perform native X, a sibling update,
native Y, then three separate keyboard Undo/Redo actions. Six additional cases
retain a backward range through the update, replace it using native Z, and
replay two separate actions. Two mode controls type before a read-only round
trip and verify exact caption, Text/widget identities and history. Expectations
use fixed author records; provider calls must remain zero and caller input is
unchanged.

## Actual execution

The final fixture bytes were copied unchanged into an isolated worktree at
`355577fc` for RED. Its 12 sibling cases produced 11 intended failures and one
positive control: Embed already retained a backward range before any native
caption edit. Both separate mode cases failed as intended. The manifest hashes
that exact fixture; it is identical to the committed candidate fixture.

The candidate's 12 directed/caret cases and two mode cases passed separately.
The subsequent combined run `run-8eMxkW` on clean, unchanged `0a2a41c7`
passed all four recorded gates:

| Gate | Actual outcome |
| --- | --- |
| Unit | 2,031/2,031, zero failures/skips |
| Source types | Both configurations pass |
| Full native plugin page | 316/316, including all 14 cases here |
| Gallery renderer page | 164/164, including the separately owned lifetime repair |

The combined source also includes other block and Gallery fixes. Its total
does not add overlapping targeted runs. The earlier first-Quote and expanded
RED logs preserve their original smaller fixture scope and line numbers; they
are development evidence, not execution of the final 14-case fixture.

Environment: Node 24.22.1, Chrome 156.0.8078.79, Linux x64. The archived
verification manifest contains command argv, UTC times, source/tree and
source-unchanged outcomes. Compressed and decoded SHA-256 hashes are recorded
in `manifest.json`.

## Reproduction

With the recorded dependencies and browser installed, run the existing native
runner from the relevant checkout:

```sh
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_NATIVE_PAGE=native-plugin-parity.html \
EDITOR_NATIVE_FILTER='rich sibling update' \
node tests/browser/physical-history.mjs

EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_NATIVE_PAGE=native-plugin-parity.html \
EDITOR_NATIVE_FILTER='rich field retains native text' \
node tests/browser/physical-history.mjs
```

For RED, copy the committed fixture and its one import into the `355577fc`
checkout without changing production source. The unrelated imports present in
later combined revisions are not needed for that reproduction. The candidate
test scope is native Chromium; this checkpoint does not independently compare
these 14 cases against v1, establish other-engine/IME behavior, or alter the
accepted count of the functional preservation register.
