# Raw source and preview preservation — 2026-10-30

The candidate passes **21 cases / 1,421 observations** for
`BLOCK_RAW_SOURCE` and `BLOCK_RAW_PREVIEW`. All three implementations complete
every planned phase without page/server errors or exceptions. The existing
Raw implementation required no change. Its corrected indentation, selection
replay and preview focus behavior are retained.

This checkpoint supports acceptance of these two bounded obligations after
the parent integration completes. It does not update the preservation register.
The HTML confinement/presentation decisions in `B-HTML` and `B-STYLE`, general
navigation, renderer layout and broader platform acceptance remain separate.

## Sources and execution

| Source | Commit | Cases | Observations | Raw failures |
| --- | --- | ---: | ---: | ---: |
| v1 | `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` | 21 | 1,260 | 226 |
| Specification baseline | `e981ff308000c1d92d7e820df95113c1e19bcee8` | 21 | 1,421 | 30 |
| Candidate | `90b28965d2ea7735c44f5f1483a334f8a565fda3` | 21 | 1,421 | **0** |

Candidate tree: `6fa6f2946a375bae518a95f91c005ea42ab04833`.
Its production source equals the parent baseline
`69c8425e0081fde69cf5176ccb73d032720c15fc`. The only changed tracked paths are
the new comparison runner, its fixture, one native regression and that
regression's import into the existing source-mode page. No plugin, shared
helper, core owner, renderer, dependency or production contract changes.

Environment: Node `v24.22.1`, Chrome `156.0.8078.79`, Linux x64. The final raw
comparison exits **1** because the historical failures remain failures;
`candidatePass` is `true`. A failed assertion count is not a count of distinct
product defects: later input/replay assertions can expose consequences of an
earlier wrong indentation or lost focus.

The runner serves each implementation from immutable Git objects, records
every loaded production-module hash and the actual dependency bytes/versions,
and verifies its committed fixture/runner and tracked source remain unchanged.
The local dependency symlink is not committed. Source identities and hashes
for all earlier attempts are retained in `source-facts.json` and their raw JSON.

## Source editing: twelve cases

The fixed input contains literal tags, an entity, multiple lines, spaces and
tabs, with independent rich Paragraph siblings before and after the Raw block.
The source remains a plain textarea; author markup is not mounted as elements
inside its editor shell.

| Operation | Cases and intended behavior |
| --- | --- |
| Collapsed Tab | Insert two spaces at the caret without changing other source text. |
| Single-line selection | Replace the selected substring with two spaces and collapse after them. |
| Multiline range ending at a line boundary | Forward and backward controls indent only the selected lines, excluding the following unselected line. |
| Partial multiline range | Forward and backward controls include the first line prefix and retain the resulting direction. |
| Empty lines | Indent selected empty lines without touching the following populated line. |
| Final newline | Do not indent the unselected empty line beyond a selected terminal newline. |
| Mixed-prefix Shift+Tab | Forward and backward controls remove one leading tab or up to two spaces per selected line, preserving the next line's tab. |
| Caret within spaces | Remove the complete two-space indentation unit and clamp the caret to the line start. |
| Unindented Shift+Tab | Preserve data, range and history as a no-op. |

Selections are established through the actual textarea and trusted keyboard
navigation; Tab, Shift+Tab and subsequent typing use native browser input.
Each successful indentation is exactly one transaction. A following typed
`X` is a separate action: two keyboard Undo operations restore the indented
and original records, and two Redo operations replay them. The selected,
authored and replayed states check literal source, all authored records/IDs,
caller-input immutability, history availability, focus, offsets and direction.
The no-op control has only the
single subsequent input action to undo and redo.

## Preview and read-only: nine cases

Three mouse controls cover a caret, a forward range and a backward multiline
range. Two keyboard controls activate the real preview button with Space and
retain forward/backward source ranges. Two read-only round trips preserve
existing forward/backward ranges; a separate initially read-only editor proves
automatic preview and its subsequent authoring field. The final case types
before opening preview and performs native Undo directly from that state.

All cases preserve the exact literal author source and neighboring records.
The shown iframe receives the expected benign markup and an empty sandbox
attribute. Read-only mode shows preview automatically and disables/hides its
authoring toggle. View and mode transitions create no history or author
transaction. Returning to the source preserves the selected range and actual
focus, so the next typed character edits that position; its single Undo/Redo
restores exact records and selection. History invoked from preview returns to
the usable source field.

Older implementations may already expose the source when read-only mode is
turned off. The fixture uses their existing toggle only if preview remains
shown. It does not invent a keyed focus API or adjust a failed historical
selection before continuing. The initially read-only case establishes its
first editable selection with the same standard textarea/native navigation
used by every source; it makes no claim about a preexisting author caret.

## Retained historical differences

v1 indents the next unselected line at some newline boundaries, cannot remove
a leading tab, removes only part of an indentation when the caret lies inside
it, and loses selection direction or replay focus. Its preview return can
leave focus outside the textarea, so subsequent input/history remains
ineffective. These observations remain failures with their subsequent effects
recorded. No historical behavior is restored to make the implementations equal.

The specification baseline has **30** failures confined to the two mixed
tab/space Shift+Tab cases. It retains the selected leading tab; the resulting
source and selection differences recur during input and history. Its other
19 cases pass. The candidate passes all 21 cases with the improved behavior.

## Focused native verification

The existing browser harness passes **27/27 Raw indentation cases** and
**28/28 Raw source-mode cases** on the final candidate. The latter includes
the new direct regression for a backward literal source range across
read-only → editable, followed by native typing and exact Undo/Redo.

These **55** cases are retained separately from the 1,421 differential
observations. The initial standalone native regression also passed before its
test-only commit; that overlapping result is historical corroboration and is
not added to the final count. Full integration remains the parent task.

## Independent oracle and preserved preparation failures

`review.py` reconstructs the fixed input records, expected text, range endpoints,
history states and transaction counts independently of the JavaScript fixture.
It recomputes all **4,102** verdicts across the three sources and checks every
planned phase, saved-record projection and trusted gesture. It verifies
**297** source-module hash records, **6** loaded dependency-file hashes and
**8** dependency versions. Four altered-proof controls are rejected: changed
author text, a view transition inventing history, lost backward selection and
a missing keyboard-history phase. Original raw verdicts are never relabeled.

Earlier preparation failures remain archived:

- `raw/initial-schema-fixture.json.gz`, fixture `c66fb937`: Paragraph was
  incorrectly tagged with data version 1; the registered current/spec schema
  requires version 2. Both stopped before loading. The fixture now uses each
  actual registered schema version. This is a fixture error, not product RED.
- `raw/initial-event-capture.json.gz`, fixture `e122f317`: all 12 candidate
  failures concerned a bubbling-only Tab recorder. Raw intentionally stops
  propagation after handling Tab. Capture-phase observation fixes the
  recorder; the 1,409 other candidate observations already passed.
- `review-history/`: the first independent reviewer draft required the same
  case-loop ordering as the JavaScript fixture. These cases own separate
  editors. The final review requires every unique case ID and exact per-case
  phase ordering instead, without changing an intended or observed value.

`raw/readonly-control.json.gz` retains the completed targeted control between
those fixture corrections. Empty stderr files and the full historical raw
outputs are included rather than replaced by a summarized success claim.

## Reproduction and immutable source recovery

Run the non-browser review against the recorded Git objects and dependencies:

```sh
python scripts/parity/checkpoints/2026-10-30/raw-source-preview/review.py \
  --repo /path/to/editor \
  --raw scripts/parity/checkpoints/2026-10-30/raw-source-preview/raw/final.json.gz
```

Run the browser comparison from a clean checkout containing the committed
fixture and runner. Select the original candidate when replaying this checkpoint:

```sh
EDITOR_CANDIDATE_SHA=90b28965d2ea7735c44f5f1483a334f8a565fda3 \
EDITOR_CHROME_PATH=/path/to/chrome \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
node scripts/parity/raw-source-preview.mjs
```

The expected raw exit is 1 while the historical failures remain. Use
`EDITOR_RAW_FILTER` to select a named case; a filter selecting no cases fails.
Native commands, their filters and original exit codes are in `source-facts.json`.

`reproduce/source-history.json` retains all three original commit objects,
parents and trees. Apply the three full-index patches in that file's order
from `69c8425e`; each recorded tree can be reconstructed even when integration
changes the commit IDs. The exact final runner, fixture and native regression
bytes are also archived. `artifact-hashes.json` covers both compressed and
decoded bytes, including this README and the independent review.
