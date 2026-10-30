# Browser-parsed inline CSS — 2026-10-30

This is a bounded C06 preservation repair. Inline `color`, `background-color` and `font-size` now use the owning element's browser-parsed declaration block. The property allowlist is unchanged. Canonical rich-text serialization sorts parsed declarations instead of splitting the raw attribute on semicolons. Browser declaration precedence, escaped names, comment boundaries and `!important` survive both operations.

The previous substring check removed valid `var(--expression-size)` and `var(--expression-color)` references. A separate raw-string canonicalizer also split a semicolon inside a CSS comment and could introduce a spurious declaration. The initial CSSOM implementation exposed one additional edge case during independent review: a pending shorthand containing `var()` can expose longhands with no serializable value. Both serialization paths now omit those empty values.

No additional parser element, cache, style registry, alternate HTML policy or legacy-browser branch was introduced. The sanitizer reads the declaration block of an element already inside its inert template. Native shorthand expansion retains only the three allowed longhands; properties such as `background-image`, positioning, dimensions and stacking remain excluded. A shorthand whose allowed longhand cannot yet be serialized is omitted, rather than emitting invalid empty CSS.

## Source and results

- Standalone implementation: `f8f34775` on base `e99fec9d3cfe6b3b05028fb60bc26bb24c3924ef`.
- Integrated local implementation: `8d2e37d0c0f7989b5abc6aea03ba722f5dd960e5`.
- Published integrated implementation: [`5eb0abec1df5be70ff42576f78bf2d2e1ce5ff03`](https://github.com/Shelamkoff/editor/commit/5eb0abec1df5be70ff42576f78bf2d2e1ce5ff03), exact tree `e004d9901c3a33e992bfdf27391ded765a3b3229`.
- Environment: Linux x64, Node 24.22.1, Chrome 156.0.8078.47.

| Run | Outcome and interpretation |
| --- | --- |
| `run-6pLasK` | Initial RED: the valid theme variable is stripped; 0/1 pass. |
| `run-gqDosI` | First narrow GREEN: theme variable, editor/renderer appearance, input isolation and unchanged history; 1/1 pass. |
| `run-G0fCuu` | Corner RED: 1/5 pass; raw comment splitting and three empty shorthand serialization cases fail. |
| `run-dSIqNE` | Intermediate attempt: 7/8 pass; the network positive-control observation was not reliable because the fetch body was unread and the resource timing buffer was already populated. This failed run remains failed. |
| `run-I0FvVz` | Final ordinary page: 8/8 pass after clearing that test's resource timing observations and consuming the positive-control response. |
| `run-6cpUiD` | Same eight cases under `require-trusted-types-for 'script'`: 8/8 pass. |
| `run-0ECNb5` | Actual native typing, separate Undo/Redo, complete canonical records, neighbor/input isolation and renderer appearance: 1/1 pass. |
| `run-hFqZAg` | Both source typecheck configurations pass. |
| `run-e38Uw4` | Final oracle against the original production implementations: 2/8 pass, six intended differences detected. This is a deliberate negative control, not a passing candidate run. |

Every listed C11 run records `sourceUnchanged: true`. The final ordinary/Trusted Types/native/typecheck runs share the same tested source identity. `green-tracked-source.patch.gz` and `green-untracked-source/` reconstruct that source from the recorded base: their bytes were checked against the original manifest hashes. `original-control-source.patch.gz` reproduces the final negative control from the standalone implementation commit and also matches its manifest hash. Earlier exploratory manifests/logs preserve their recorded identities; they are not relabeled as final-source checks. Complete compressed logs and raw failures are retained with an artifact hash index.

## Observation boundaries

The controls exercise computed formatting, duplicate declarations, priorities, escapes, comments, canonical idempotence, direct invalid CSS functions, excluded resource properties, a missing-variable URL fallback, a positive observable resource fetch, and a foreign owning document with its own theme variables. The native case uses trusted `beforeinput`, actual keyboard history, an unchanged neighboring record and unchanged caller input.

The URL-fallback check observes no request for its specific resource and verifies that the positive fetch is observable. It does not establish a general security result for arbitrary future CSS properties or browser engines. Invalid direct functions are rejected by the browser grammar for these allowed properties; the previous malformed strings were not evidence of successful script execution.

This repair does **not** resolve B-STYLE host-class confinement, arbitrary host-theme transfer, B-HTML iframe sizing/navigation policy, complete C06 acceptance or cross-browser/platform coverage. No preservation-register row is accepted solely by this checkpoint. The full integrated verification has its own source and results.
