# Bundle size report

Run `node benchmarks/bundle-budget.mjs` to build the published package and report
four independently bundled entry points:

| Entry | Package surface | Historical gzip reference |
| --- | --- | ---: |
| `core` | `dist/core/index.js` | 51 KiB |
| `paragraph` | `dist/plugins/paragraph/index.js` | 40 KiB |
| `defaultInteractive` | `dist/preset/index.js` (inline tools) | 64 KiB |
| `fullPreset` | `dist/plugins/index.js` (block plugins) | 96 KiB |

These reference values are unchanged. CI requires the report to complete, but a
numeric excess is informational. Keep working features and safety checks; use
the measurements to investigate size changes and decide whether an optimization
is worthwhile. `node benchmarks/bundle-budget.mjs --enforce` remains available for
manual enforcement of the Paragraph, default interactive and full preset
references. Core remains informational in both modes, following its existing
policy.

## What is measured

Each entry receives a separate Vite build of the generated package in `dist`.
The report visits each chunk in the entry's static JavaScript import closure once,
in import order, and concatenates its minified code with newlines. It also
concatenates all emitted CSS assets in filename order. The raw total is
`bytes(JavaScript) + bytes(CSS)`; the compressed total is
`gzip(JavaScript) + gzip(CSS)`, with no CSS stream when the CSS text is empty.
This preserves the historical measurement and avoids counting shared static
chunks twice.

External `@shelamkoff/*` packages and lazy JavaScript chunks are excluded. All
emitted CSS is included, including CSS associated with lazy modules. This metric
describes those package surfaces; it does not predict every application's total
download size or tree shaking configuration.

The console includes exact raw and gzip bytes, reference bytes and signed deltas
alongside rounded KiB. When `EDITOR_RESULTS_DIR` is set, `bundle-size.json` records
the same rows plus static chunks, retained modules, external imports, lazy import
identifiers and CSS filenames. It is written before optional size enforcement,
so a numeric failure in `--enforce` mode retains the measurements.

## Required failures

Report mode still fails on build errors, missing entries or static chunks,
malformed measurement output and violations of the selective static import
boundaries:

- Paragraph must not retain core code or unrelated block plugins. Paragraph and
  shared plugin helpers remain allowed.
- The default interactive preset must not retain block-plugin code.

Module checks use Rollup's rendered module lengths, so eliminated barrel exports
do not count as retained code. These checks cover the static JavaScript graph;
lazy imports are listed separately.

The `Verify library` workflow keeps all three Node jobs and all four release
gates. Size reporting does not bypass failure recording or the required build.
Manual size enforcement is separate from the mandatory CI report.
