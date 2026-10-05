# Proof — source indentation, 05–06.10.2026

Base: 4138e601e144e2a8f68712248728a1fac2cb61df; branch refactor/rector-v2-architecture.

## Reproduce

From the repository root, sequentially:

```powershell
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
```

Focused native page (50 cases, also registered in the full runner):

```powershell
$env:EDITOR_NATIVE_PAGE='native-source-indentation.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
```

Dev demo:

```powershell
$env:RECTOR_DOCS_URL='http://127.0.0.1:5173/ru/'
$env:RECTOR_QA_DIR='test-results/refactor-source-indentation-2026-10-05/demo'
node scripts/vitepress-browser-smoke.mjs
Remove-Item Env:RECTOR_DOCS_URL
Remove-Item Env:RECTOR_QA_DIR
```

## Native TDD

indent-boundary-red.log: actual Code Tab changes the unselected Charlie line; setup uses public field focus and browser Shift+Arrow selection. No synthetic DOM keyboard event. indent-boundary-green.log: the same public data/focus/range/Undo/Redo contract passes after the helper fix. indent-ranges-green.log: 50 native cases, both plugins and directions. The final native-all.log repeats these and all existing groups on the frozen source set.

Cases cover partial first lines, ranges ending at another line start, blank lines, a trailing newline, ranges ending inside a line, single-line replacement and collapsed caret. Follow-up typing and Shift+Tab verify exact document bytes, sibling blocks, selection direction and separate history actions. Existing v1 semantics of multiline selection expanding to the first line start remain; indentation at a collapsed caret and single-line replacement remain.

## Historical oracle

v1 5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340 is isolated under ../refactor-equivalence-2026-10-05/v1-oracle. No historical runtime enters production imports. If missing, extract it using ../refactor-conversion-continuations-2026-10-05/README.md; exclude historical *.test.js.

```powershell
Copy-Item -LiteralPath test-results/refactor-source-indentation-2026-10-05/oracle.html -Destination tests/browser/native-vone-indentation.html
$env:EDITOR_NATIVE_PAGE='native-vone-indentation.html'
node tests/browser/physical-history.mjs
Remove-Item Env:EDITOR_NATIVE_PAGE
Remove-Item -LiteralPath tests/browser/native-vone-indentation.html
```

v1-indentation.log records four native observations. Both plugins indent the unselected next line and change backward selection direction to forward. v1-source-snapshot.json verifies 240 JS/CSS files against Git after LF normalization and records separate local/Git byte hashes.

source-snapshot.json freezes product/tests/docs/tooling before final gates. summarize.mjs checks raw counts and all frozen source hashes; running it rewrites verification-summary.json, so regenerate manifest hashes afterwards. The manifest refers to local bytes before Git LF/CRLF normalization and excludes its own hash. Raw logs are preserved verbatim.
