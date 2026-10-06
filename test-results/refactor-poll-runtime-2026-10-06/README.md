# Poll runtime and parity audit — 2026-10-06

Base: `fa113bf8bd0fc49579e9be59ac6f504994fe4024`, branch `refactor/rector-v2-architecture`.

The editor's authored question and option hosts now survive remote result/error updates. Missing remote identity no longer records a local vote. Source methods are captured with their original receiver before construction or asynchronous import. The direct renderer uses the same existing Poll configuration boundary as the renderer facade and async loader; it does not import editing plugins.

## TDD evidence

| Behavior | Red | Green |
| --- | --- | --- |
| Remote source without pollId records a local author vote | missing-id-red.log | missing-id-green.log |
| Subscription getter is evaluated twice | service-getter-red.log | service-getter-green.log |
| Pending plugin import observes later source methods | async-service-red.log | async-service-green.log |
| Failed loading has no visible localized status | error-status-red.log | error-status-green.log |
| Live result update removes the authored range and focus | live-range-red.log | live-range-green.log |
| Direct renderer observes source method replacement after construction | renderer-service-red.log | renderer-service-green.log |

The completed native matrix is `poll-matrix-complete.log`: 22 editor cases and four renderer entry paths. It includes real clicks, keys, forward/backward selection, cross-block drag and conversion after a live update, Undo/Redo, errors in RU/EN, class/private-state method receivers, independent editors, document replacement and late/disposed callbacks.

`poll-matrix-fixture-red.log` incorrectly assumed public render clears Undo. The corrected fixture expects one undoable canonical document replacement; no product behavior was changed to satisfy that assumption. The initial Node gate (`node-before-dom-fixture.log`) exposed missing getAttribute/remove operations in its minimal DOM stand-in. These DOM operations were added without weakening lifecycle assertions; seven focused cases then passed in `lifecycle-fixture-green.log`. Runtime, docs and native fixture bytes stayed unchanged, verified against `source-snapshot-before-dom-fixture.json`. Final Node and type gates were repeated. The first package attempt (`package-locked.log`) hit a Windows EBUSY file lock in the installed jszip dependency; the repeated package gate is canonical.


The bundle declaration generator recreates dist. The last docs run during that emission saw zero packaged README copies (`docs-before-package-rebuild.log`). The package was rebuilt from unchanged frozen sources (`final-package-build.log`), then the canonical docs gate was repeated after build to check all 92 packaged copies. This affects generated output and verification order, not runtime source.

## Reproduce

Run from the repository root in PowerShell with dependencies installed. Browser runners create headless Chrome processes and clean up their own processes. No visible Chrome windows are needed.

```powershell
$env:EDITOR_NATIVE_PAGE='native-poll-runtime.html'
try { node tests/browser/physical-history.mjs }
finally { Remove-Item Env:EDITOR_NATIVE_PAGE }

node --test renderer/renderers/poll/lifecycle.test.js
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

# With npm run docs:dev serving the existing demo:
$env:RECTOR_DOCS_URL='http://127.0.0.1:5173/ru/'
$env:RECTOR_QA_DIR='test-results/refactor-poll-runtime-2026-10-06/demo'
try { node scripts/vitepress-browser-smoke.mjs }
finally { Remove-Item Env:RECTOR_DOCS_URL; Remove-Item Env:RECTOR_QA_DIR }
```

The helper `run-gate.mjs <gate-name>` records raw output and a separate exit/timestamp outcome for each gate. `summarize.mjs` requires all 11 successful outcomes, all previous native groups, the new Poll matrix and unchanged source hashes.

## Historical v1

The pinned revision is `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`. All 240 extracted JS/CSS files were rehashed against Git for this checkpoint. Three real v1 cases in `v1-poll.log` confirm missing-ID rejection, visible load-error status and retention of the native question range through live results. Capturing service methods is the v2 C5 ownership contract; it is not presented as old v1 behavior.

The extraction stays in ignored `test-results/refactor-equivalence-2026-10-05/v1-oracle/`; it is not a production dependency. The preparer validates existing files or recreates missing files from the pinned Git revision without overwriting differing contents. A full clone must contain that revision.

```powershell
node test-results/refactor-poll-runtime-2026-10-06/prepare-v1.mjs
$taskWrapper='tests/browser/native-vone-poll-runtime.html'
Copy-Item -LiteralPath 'test-results/refactor-poll-runtime-2026-10-06/oracle.html' -Destination $taskWrapper
$env:EDITOR_NATIVE_PAGE='native-vone-poll-runtime.html'
try { node tests/browser/physical-history.mjs }
finally {
  Remove-Item Env:EDITOR_NATIVE_PAGE
  Remove-Item -LiteralPath $taskWrapper
}
node test-results/refactor-poll-runtime-2026-10-06/summarize.mjs
```

Hashes in the source snapshot and manifest use local bytes before Git line-ending normalization. The manifest excludes its own hash. Evidence establishes this Chrome matrix; it does not prove every possible sequence, browser, external upload provider or system IME.
