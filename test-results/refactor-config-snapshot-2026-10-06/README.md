# Configuration ownership and parity audit — 2026-10-06

Base: `fc95610d25dab56b125db686458bdd7ff190c769`, branch `refactor/rector-v2-architecture`.

The source snapshot was frozen before the final gates. All paths and hashes refer to local bytes before Git line-ending normalization. The manifest excludes its own hash. Historical v1 files remain in `test-results/refactor-equivalence-2026-10-05/v1-oracle/`; they are not production dependencies.

## TDD evidence

| Behavior | Red | Green |
| --- | --- | --- |
| Raw style getters evaluated repeatedly | `style-getter-red.log` | `style-getter-green.log` |
| Paragraph validation and six factory array options reread getters or evaluate inherited options | `config-matrix-red.log` | `config-matrix-green.log` |
| Async preset reads requested config-map getter twice | `async-config-red.log` | `config-complete-green.log` |
| Source action changes after caller mutation | `action-record-red.log`, `record-matrix-red.log` | `action-record-green.log`, `record-matrix-green.log` |
| Pending import observes later action-record changes | `async-record-red.log` | `async-record-green.log` |

`async-config-initial-red.log` is exploratory: its assertion ended before observing early rejection. The corrected fixture observes the promise first; `async-config-red.log` is canonical Red. `typecheck-preflight.log` is intermediate; `typecheck.log` is the final gate.

The first complete gates are archived as `*-before-methods.*`. Its dev-demo attempt failed because the local server was no longer running; production demo checks passed. The final gates restart the local server and include 12 additional prototype/getter/private-receiver scenarios. Their canonical Red is `record-methods-red.log`, Green is `record-methods-green.log`; all 30 configuration scenarios are in `native-config-matrix.log`.

## Reproduce

Run from the repository root in PowerShell with dependencies installed. Browser commands start their own headless Chrome and clean up their own processes; visible Chrome windows are not required.

```powershell
node --test plugins/config-snapshot.test.js
$env:EDITOR_NATIVE_PAGE='native-config-snapshot.html'
try { node tests/browser/physical-history.mjs }
finally { Remove-Item Env:EDITOR_NATIVE_PAGE }

npm run typecheck
npm test
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
node benchmarks/bundle-budget.mjs --enforce
node tests/browser/run.mjs
node tests/browser/physical-history.mjs
node tests/browser/heap-gate.mjs

# With npm run docs:dev already serving the existing demo:
$env:RECTOR_DOCS_URL='http://127.0.0.1:5173/ru/'
$env:RECTOR_QA_DIR='test-results/refactor-config-snapshot-2026-10-06/demo'
node scripts/vitepress-browser-smoke.mjs
Remove-Item Env:RECTOR_DOCS_URL
Remove-Item Env:RECTOR_QA_DIR
```

Historical public-config oracle: prepare-v1.mjs validates existing files or reconstructs missing files from the pinned Git revision. It never overwrites a different existing file. The revision must be available locally (use a full clone). The temporary wrapper is removed in finally.

```powershell
node test-results/refactor-config-snapshot-2026-10-06/prepare-v1.mjs
$taskWrapper='tests/browser/native-vone-config-snapshot.html'
Copy-Item -LiteralPath 'test-results/refactor-config-snapshot-2026-10-06/oracle.html' -Destination $taskWrapper
$env:EDITOR_NATIVE_PAGE='native-vone-config-snapshot.html'
try { node tests/browser/physical-history.mjs }
finally {
  Remove-Item Env:EDITOR_NATIVE_PAGE
  Remove-Item -LiteralPath $taskWrapper
}
```

The oracle confirms one read per own getter for all 21 v1 constructors. Its six record cases document v1 caller-object aliasing; preserving that aliasing is not the v2 C5 definition-ownership contract. Callbacks keep their captured implementation and original receiver; RegExp values retain identity in v2; arbitrary external state captured by callbacks is not deep-cloned.

`summarize.mjs` validates final raw logs, the complete previous native group set, new 30 native cases and frozen source hashes before writing `verification-summary.json`.

```powershell
node test-results/refactor-config-snapshot-2026-10-06/summarize.mjs
```

Screenshots and final logs describe this checkpoint. They do not establish equivalence for every possible sequence, browser, external upload provider or system IME.
