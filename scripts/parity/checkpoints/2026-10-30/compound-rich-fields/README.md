# Compound rich-field and Toggle focus checkpoint

This bounded checkpoint preserves two implementation repairs and their actual
validation. It does not accept an entire preservation-register row or establish
whole-library parity.

## Source and repairs

- `58d5fa7b914579e721b3af1e1b07aa4d75dd030e`: List, Checklist, Toggle and
  Spoiler compare the previous canonical rich field before replacing its live
  children. Hydrated Mention/Color markup is not the persisted token spelling.
  Native input may advance the canonical record without calling `update`, so
  the existing `previousCanonical` argument is the authority. Columns is an
  unchanged passing control.
- `05305b0cc9db2f4f41055b1e8bfbac8402835ddc`: valid keyed Toggle body focus
  reveals the body without authoring `open`. An update changes disclosure only
  when the canonical `open` changes; an unrelated field edit or history replay
  cannot conceal the current author caret. Invalid keys do not temporarily
  focus another field.

The final complete native plugin page ran on unchanged tracked source
`05305b0c` with **302/302 cases passing**. Thirteen added cases cover ten
caret/backward-range sibling-edit variants and three Toggle hidden-focus
controls. They exercise real keyboard input, fixed expected canonical records,
widget/Text ownership, provider silence, caller-data immutability and separate
keyboard Undo/Redo. Both source typechecks pass. The privileged scoped unit
command passes **24/24 tests**, zero failures/skips.

`unit-sandbox-incomplete.log.gz` is retained as an environment limitation: its
unprivileged nine-file summary is not the individual test result. The subsequent
`unit-verified.log.gz` is the valid result. The native full result includes the
thirteen new cases; overlapping focused totals are not added to it.

## Pinned-source native comparison

The adjacent `probe.mjs` and `fixture.js` are the exact executed bytes. The probe
loads v1 `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`, specification baseline
`e981ff308000c1d92d7e820df95113c1e19bcee8`, and candidate `05305b0c`. Every
loaded source/style file is checked against its Git object. Dependencies are
shared installed current dependencies, separately hashed in the raw output.

Two scenarios use native controls available in all three versions: Toggle's
chevron on a rich title and Checklist's checkbox on a rich item. The sequence is
native `X`, control click, native `Y`, three keyboard Undo actions and three Redo
actions. There is no focus repair after the initial setup. Fixed records,
control state, caret, live author/widget nodes, trusted events, caller input,
provider silence and cleanup are checked. Adapters change only plugin
construction, schema versions and v1's lack of item IDs.

| Source | Cases | Observations | Raw failures | Page/server errors | Incomplete phases |
| --- | ---: | ---: | ---: | ---: | ---: |
| v1 | 2 | 120 | 2 | 0 | 0 |
| Specification baseline | 2 | 120 | 16 | 0 | 0 |
| Candidate | 2 | 120 | 0 | 0 | 0 |

v1 preserves the control gesture and subsequent input. Its two failures occur
when Undo of the initial text edit restores focus to the preceding paragraph;
the expected document history still passes. The specification baseline resets
the caret to the beginning of the rich field when its control changes. The next
`Y` consequently appears before `Alpha`; the exact record/caret differences and
their replay are retained. The candidate receives no exception.

The raw comparison exits **1**, because historical failures remain failures.
There is no historical classifier and no claim of an all-source green gate.
The new keyed hidden-body API is tested separately on the candidate; v1 has no
equivalent keyed `blocks.focus` method, so that method is not fabricated in the
test adapter. Linux, Node `v24.22.1`, Chrome `156.0.8078.79`. Exact UTC interval,
loaded hashes and per-observation data are in the JSON and manifest.

Reproduction requires immutable source roots at these commits, installed
dependencies matching the recorded lock and an installed Playwright module:

```sh
EDITOR_CANDIDATE_ROOT=/path/to/candidate \
EDITOR_CANDIDATE_SHA=05305b0cc9db2f4f41055b1e8bfbac8402835ddc \
EDITOR_V1_ROOT=/path/to/v1 \
EDITOR_SPEC_BASELINE_ROOT=/path/to/spec-baseline \
EDITOR_DEPENDENCIES_ROOT=/path/to/node_modules \
EDITOR_PLAYWRIGHT_PATH=/path/to/playwright/index.mjs \
EDITOR_CHROME_PATH=/path/to/chrome \
node scripts/parity/checkpoints/2026-10-30/compound-rich-fields/probe.mjs
```

## Development evidence and limits

The initial List RED, three additional compound REDs, hidden-focus RED and
subsequent Undo-focus RED are retained separately. The initial expanded fixture
used the wrong `blocks.update` call form; that fixture failure is preserved in
`compound-fixture-error.log.gz` and is not a product defect. Later native logs
show the corrected scenarios. Those development logs predate the final fixture
names/lines; the pinned-source comparison supplies immutable-source evidence
for the native control regression.

The manifest records compressed and decoded SHA-256 hashes. These results do not
cover every List/Checklist/Toggle/Spoiler action, every style/column layout,
all hidden-field APIs, other browser engines or the open HTML/style decisions.
