# Inline Code and Marker — accepted 2026-11-03

The common public TOOL matrix is extended to inline Code and Marker without
changing production behavior. Each tool has 32 cases: apply, mixed/nested
removal, Text/Element boundaries, both directions, Paragraph/Quote cross-field
selection, actual Color/Mention widgets, native input and separate action
Undo/Redo, atomic no-op with an existing Redo branch, and retained read-only or
destroyed UI with a live successor control. The original 96 Bold/Italic/Strike
cases retain their inventory and expectations.

Use `EDITOR_BASIC_TOOLS_GROUP=code-marker` with
`node scripts/parity/basic-mark-tools.mjs`. Production modules come from exact
Git objects for v1, the specification baseline and the committed candidate.
The native runner adds a separate `native-code-marker.html` page containing the
64 new cases; existing page budgets and the old tools page remain unchanged.

The exploratory comparison on `13b79cc6` completes all 64 candidate cases /
2996 observations with no failures. v1 records 272 failed observations and four
unavailable atomic-only toolbar actions; the specification baseline records
336 failed observations. Those historical defects stay raw failures. The
separate character/mark model recomputes 8626 verdicts and 1740 semantic checks,
verifies 349 production modules and seven dependencies, and rejects three
corruptions. Those exploratory results alone accepted neither row. The
committed-fixture repetition below supplies the final acceptance evidence.

`review.py` extends the frozen basic-mark manual verifier with Code/Marker mark
symbols. It imports neither production toggles/normalizers nor the browser
fixture. It checks exact inventories/phases, every raw verdict, manual canonical
and live meaning, widget data, native input, selection/direction, transactions,
history and disposal. `integration-manifest.json.gz` preserves the exact
successful twenty-gate run on production `13b79cc6`. The checker also requires
byte-identical candidate runtime paths and loaded modules relative to that
integration, plus a fresh native Code/Marker run. This is author verification,
not a separate-agent review.

## Immutable acceptance

The final candidate is `d4f026f8b25ca178c1b3c14e6a1526afa84d0176`, tree
`3e14b9c801555183a1328d59fa6125641b92a23e`. The committed fixture repeats the
preliminary semantic results: **64/64 candidate cases and 2996/2996
observations pass**. Each tool contributes 32 cases and 1498 observations.
v1 retains 272 failed observations and four unavailable atomic-only toolbar
actions; the specification baseline retains 336 failures. The raw comparison
exits **1**, explicitly preserved in `differential-process.json`. The separate
source/oracle review exits **0**; no historical failure is relabelled.

`run-02FJXq` passes all six affected gates on clean unchanged candidate source:
both typechecks, all 96 existing basic-mark native cases, all 64 new native
cases, the three-source comparison plus independent review, three negative
evidence controls and documentation contracts. Started
2026-11-03T00:33:01.954Z; finished 2026-11-03T00:37:41.414Z; identity
`c6bbfe4d268d9fcfc061766d3e4319471fdb73784f39af2a099032bc3f6c1abd`.
Environment: Windows x64, Node 24.22.2, Chrome 156.0.8078.79 and Python 3.12.14.

All candidate production modules and runtime paths are byte identical to
`13b79cc6`, whose original twenty-gate manifest is separately preserved. The
new six-gate run is not presented as another twenty-gate run. The checker
rebuilds **8626 verdicts and 1740 independent semantic checks**, verifies
**349 served production modules**, seven dependency files and eight package
versions, checks the fresh 64-case native inventory, and binds the unchanged
production runtime to the successful integration. Wrong source, consistently
false actual/expected text and missing trusted input are all rejected.

This accepts only `TOOL_CODE_ACTION` and `TOOL_MARKER_ACTION`: **69 of 209
accepted, 140 open**. Other tool/inline rows, B-HTML and whole-library readiness
retain their separate obligations. Native ranges are explicitly installed
valid DOM ranges; the proof claims trusted toolbar/input/history, not physical
mouse-drag selection. Current widget identity, exact history and selection
preservation are retained instead of restoring historical defects.

## Artifacts and reproduction

`final-differential.json.gz` decodes to SHA-256
`70277953d2bbcac8e6c7d64a796dcfa0ab3ffab96177fb71325c846882b047b8`.
`review.json`, both native logs, process outcome, original six-gate manifest
and controls are retained beside it. `artifact-hashes.json` covers compressed
and decoded bytes. `executed-review.py.gz` retains the exact Windows invocation
bytes; its source uses the same manual model as `review.py`. The two runner /
fixture paths require LF in `.gitattributes`, so their exact Git-byte checks
also work on a fresh Windows checkout.

From the repository root, set `EDITOR_BASIC_TOOLS_GROUP=code-marker` and run
`node scripts/parity/basic-mark-tools.mjs`, retaining its expected exit 1 and
complete JSON. Run `tests/browser/physical-history.mjs` with
`EDITOR_NATIVE_PAGE=native-code-marker.html` for the separate 64 native cases;
the existing `native-tools.html` page with `EDITOR_NATIVE_FILTER=basic mark action`
replays the preceding 96 cases. Then run:

```sh
python scripts/parity/checkpoints/2026-11-03/code-marker-tools/review.py --raw scripts/parity/checkpoints/2026-11-03/code-marker-tools/final-differential.json.gz --candidate d4f026f8b25ca178c1b3c14e6a1526afa84d0176 --native scripts/parity/checkpoints/2026-11-03/code-marker-tools/native-final.log.gz --output test-results/code-marker-review.json
node scripts/parity/checkpoints/2026-11-03/code-marker-tools/controls.mjs scripts/parity/checkpoints/2026-11-03/code-marker-tools/final-differential.json.gz d4f026f8b25ca178c1b3c14e6a1526afa84d0176 scripts/parity/checkpoints/2026-11-03/code-marker-tools/native-final.log.gz test-results/code-marker-controls
```

`EDITOR_PYTHON_PATH` selects the Python executable for the control runner.
The healthy corpus must pass before any negative control counts as a rejection.
