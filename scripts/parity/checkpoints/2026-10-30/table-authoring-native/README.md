# Table authoring: Enter formatting and structural controls

Plain Enter at the end of a marked Table cell lost the active mark for the next
trusted keystroke. This checkpoint records the source-specific failure, the
Table-only correction, and bounded controls for native authoring and structure.

## Sources and behavior

The investigation compares pinned v1
`5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340` with pre-fix v2
`ebf128b1ac301c8985e0359e1cf6ced422ed94b0`. The portable probe verifies every served
repository source against its Git object, records loaded-source and dependency
hashes, and checks that those bytes remain unchanged. There are no page/server
errors in that probe.

With the caret at the end of `<b>Alpha</b>`, pre-fix v2 inserts a break outside
the bold wrapper. Trusted `X` then produces `<b>Alpha</b><br>X<b></b>`. The native
regression fails because the bold text remains `Alpha`, rather than `AlphaX`.

The fix retains Table's existing nullable `splitField` admission check and
returns the existing `native` shortcut action. The shared `beforeinput` owner
already handles `insertParagraph` / `insertLineBreak` through logical range
replacement, preserving the wrappers, sidecars, selection and history. No core
implementation or public API changes are included. Corrected canonical values
are `<b>Alpha<br></b>` followed by `<b>Alpha<br>X</b>`.

V1 retains the bold mark, but it places follow-up text before its terminal BR
(`<b>AlphaX<br></b>`). That separate legacy placement issue is deliberately not
copied: the native regression requires the new text to appear on the next
visual line, with logical caret offsets 6 then 7. It also requires Enter and X
to remain separate actions through two native Undo and two Redo commands.

## Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Pre-fix Enter → trusted X | Expected failure: active bold mark lost | `enter-native-red.log` |
| Corrected Enter, visual line, caret, two Undo/Redo | 1 passed | `enter-native-green.log` |
| Five row/column/header controls after native input in first/last cell | 10 passed | `structural-controls-native.log` |
| Ctrl+B, backward-range Enter/Shift+Enter, X, Tab/Shift+Tab, three Undo/Redo | 2 passed | `selection-formatting-native.log` |
| Complete registered Table slice on native plugin parity page | 30 passed | `table-native-final.log` |
| All Table unit tests | 15 passed | `table-unit-final.log` |
| Both JavaScript typecheck projects | Passed | `typecheck-final.log.gz` |

The new cases use real native key/input events and actual settings buttons.
Controls cover rows and columns added or removed while the first or last cell
is active, header replacement, stable surviving IDs/hosts, rich sibling cells,
real Mention/Color widgets and sidecars, caller/public snapshot isolation, and
separate input/setting history. Existing Table cases continue to cover escaped
IDs, stale/adopted focus, modes, default dimensions, conversions and sibling
selection.

`evidence.json` gives exact commands, source hashes, the staged tested source
tree before adding this checkpoint, counts, raw-file hashes and limitations.
The four source/test files are the only changes to the baseline outside this
checkpoint. Gzip has level 9, zero timestamp and no filename; the archived
original probe JSON was decompressed and verified byte for byte.

## Probe reproduction and limits

`pre-fix-probe.mjs` is the original exploratory runner, preserved byte for byte.
Supply immutable v1 and pre-fix v2 source directories, the repository containing
their Git objects, shared dependencies, Playwright and Chrome:

```sh
EDITOR_REPO_ROOT=/path/to/repository \
EDITOR_V1_ROOT=/path/to/v1-archive \
EDITOR_CANDIDATE_ROOT=/path/to/ebf128b1-archive \
EDITOR_CANDIDATE_SHA=ebf128b1ac301c8985e0359e1cf6ced422ed94b0 \
EDITOR_DEPENDENCIES_ROOT=/path/to/node_modules \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
EDITOR_CHROME_PATH=/path/to/chrome \
node pre-fix-probe.mjs
```

The exploratory probe retained its first field reference. V1 Undo remounts the
field, so its post-Undo `html`/`active` observations refer to that detached old
element; its saved canonical data remains valid. Those DOM observations are not
used as legacy history/caret proof. The final candidate native tests independently
verify canonical results, live focus/selection and Undo/Redo.

`selection-formatting-fixture-error.log` preserves an initial wrong test import
and page startup timeout. After correcting that import, both formatting cases
pass. This setup error is not the product RED. The initial header-only green
log is retained for provenance but is already included in the later ten-control
and thirty-case runs; their counts must not be added together.

This is a bounded Chromium functional checkpoint, not full-editor acceptance,
a timing run, or an allocation/retention claim. The final native suite executes
the candidate; only the original pinned investigation executes v1.
