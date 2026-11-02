# Public renderer errors

Accept `RENDERER_ERRORS` on immutable `e3cbb0d5`, Windows Chrome 156, after its
complete 17-gate unchanged-source integration. The earlier scoped comparison on
`906e3dbf` remains a separate successful observation.

`scripts/parity/renderer-errors.mjs` serves every production module from its
exact Git object. The shared real-browser fixture is also registered in the
ordinary `renderer-lifetimes.html` page. It executes 348 cases / 6918 observations
per source: renderBlock/render/renderTo, data/revision signatures, strict and
placeholder unknown types, unsupported versions and invalid schemas. Custom
schemas and actual built-in Paragraph validation have separate controls.

Fourteen observer modes include no observer, normal diagnostics, Error and five
falsy throws, rejected promises, rejected false, hostile then getters/calls and
synchronous/asynchronous reentry. Every case checks authoritative error identity
or cause, frozen content-free diagnostic fields, prior DOM/connection/content,
unchanged caller input, repeat reporting after settlement, staged cleanup and
valid recovery where applicable. Browser unhandled rejections remain observations.
The fixture bounds its own reentry probe; it does not implement a library guard.

Results on Windows Chrome 156.0.8078.79 / Node 24.9.0:

| Source | Completed cases | Passing observations | Raw failures |
| --- | ---: | ---: | ---: |
| v1 `5e5c7f8d` | 348 | 3282 | 3636 |
| Specification baseline `e981ff30` | 348 | 6918 | 0 |
| Diagnostic parent `69c8425e` | 348 | 6918 | 0 |
| Candidate `906e3dbf` | 348 | 6918 | 0 |

The v1 differences are retained raw: custom overrides have no current schema or
version admission (2368), built-ins have no dataVersion admission (974), schema
cause is omitted (168), diagnostic shape/freeze differs (78), rejected observers
are uncontained (24), and per-source recursion protection is absent (24).
These do not authorize restoring the older missing validation or rejection
handling. Unknown-type strict/placeholder controls pass in every version.

The independent reviewer reconstructs every fixed oracle and exact case/property
inventory, recomputes all 27672 verdicts, verifies 323 Git-module records and 68
dependency records, and permits no candidate failure. Three deliberate evidence
corruptions are rejected: another candidate, consistently altered actual/expected
error, and removal of a loaded-source record.

```text
node scripts/parity/renderer-errors.mjs > renderer-errors.json
node scripts/parity/checkpoints/2026-11-02/renderer-errors/review.mjs renderer-errors.json EXACT_CANDIDATE
```

Set `EDITOR_PLAYWRIGHT_PATH` / `EDITOR_CHROME_PATH` for the installed browser
tooling. `EDITOR_CANDIDATE_SHA` can pin the comparison source. The working runner
and fixture bytes are hashed and checked unchanged; no production source is
transformed. Local frozen evidence is `test-results/run-qoqb4j/renderer-errors.log`
and `renderer-errors-review.log`. That sixteen-gate run remains **failed** at
the unrelated asynchronous HTML-ready observation in the native common corpus;
its fifteen successful gates are not relabelled as a complete integration pass.

The fresh `test-results/run-PC0mTs/manifest.json` completes all 17 gates on clean
`e3cbb0d5306c58b9860d07345e341901dc5f536b`, 2026-11-02 20:13:42-20:43:20 UTC.
Its renderer comparison and independent review repeat all 348 cases / 6918
observations per source, with zero candidate/specification/parent failures and
the same 3636 raw v1 differences. The corrected ordinary/native HTML-ready
observations require actual authored nodes and preserve all existing expected
values, including valid empty Raw content. Every gate records unchanged source.
The manifest SHA-256 is
`8b1f1ffe41e47c96632af61cd3a4d261df131d40660c17398bc0c0d39612bd58`.
Registration/output/construction retain their own accepted scopes; HTML and the
other remaining obligations are not accepted by this error matrix.

Earlier candidate-only two-case and 180-case probes remain exploratory evidence.
The complete fixture adds actual built-in validation because v1 deliberately
disables built-in validators after a custom renderer overrides the type. This
historical API limitation is not patched into v1 by a test adapter.
Built-in invalid-data controls select v1's existing `validationMode: 'strict'`;
current sources use their current schema contract without that legacy option.
