# Inline Code and Marker — proof in progress

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
corruptions. These are preliminary results; the committed fixture must execute
again before either preservation row is accepted.

`review.py` extends the frozen basic-mark manual verifier with Code/Marker mark
symbols. It imports neither production toggles/normalizers nor the browser
fixture. It checks exact inventories/phases, every raw verdict, manual canonical
and live meaning, widget data, native input, selection/direction, transactions,
history and disposal. `integration-manifest.json.gz` preserves the exact
successful twenty-gate run on production `13b79cc6`. The checker also requires
byte-identical candidate runtime paths and loaded modules relative to that
integration, plus a fresh native Code/Marker run. This is author verification,
not a separate-agent review.

Final candidate identity, source-specific results and artifact hashes will be
recorded after the immutable run. The register remains 67 accepted / 142 open.
