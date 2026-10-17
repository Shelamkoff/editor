# Rector v2 — Code Paste behavioral parity audit

**Date:** 2026-10-18  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Source HEAD at audit start:** `f649ea2a7816eb10376d76379bb5815f3ab24acb`  
**v1 reference:** `master` at `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`

## Scope and reference behavior

Compared the Code plugin's v1 `pasteConfig.patterns` and `onPaste({type:'tag'})` against the v2 `paste.accepts/resolve` and `htmlImport.importRoot` capabilities. Traced the v2 plain-text routing through `core/ClipboardController.js` and the conversion/HTML import boundary through `core/HtmlImportRouter.js`. Checked the repository's TDD and JavaScript skills and followed the no-v1-runtime/no-legacy-adapter architecture decision.

### C1 — Code Paste lost most supported language signatures (P2)

The v1 plugin exposed **58** regex patterns for recognizing source-code Paste. V2 had reduced these to one broad alternative matching `#!`, `<?php`, `import`, `SELECT` or `#include` at line starts. It no longer matched many v1 examples (TypeScript `interface`, Python `def`, HTML doctype, CSS `@media`, JSON, `CREATE TABLE`, Go, Rust, Dockerfile, Nginx, etc.). It also misclassified ordinary prose such as `import unread mail` and `SELECT your favorite plan`.

**Fix:** Reuse all 58 v1 patterns and flags inside the v2 Code paste capability, without any v1 plugin class or compatibility wrapper. `paste.resolve` still returns a current v2 canonical Code payload. Native HTML imports retain their separate capability.

- [Regression tests](https://github.com/Shelamkoff/editor/commit/cab562437c14ae5599c516279c87371173b02438)
- [Production fix](https://github.com/Shelamkoff/editor/commit/81f186c8b151c9e8a1fe0997b4a31ec9787d00fd)

### C2 — Code HTML Paste did not preserve v1 trailing-newline normalization (P3)

V1 `Code.onPaste({type:'tag'})` normalized one or more trailing `\n` characters to exactly one `\n`. The v2 HTML import read `textContent` without this normalization, changing pasted source content for `<pre><code>line\n\n</code></pre>`.

**Fix:** Apply the exact former trailing-newline decision to the v2 `htmlImport.importRoot` result, preserving no-newline text and the canonical `{code, language:'auto'}` payload.

- [Regression test](https://github.com/Shelamkoff/editor/commit/a75c19d44c73053f72513fadf851fdeb08f3eb91)
- [Production fix](https://github.com/Shelamkoff/editor/commit/f9abca21b6b92e45e7524be556313e13414ef8d8)

## Verification performed

- Retrieved the actual live v1 and v2 source files and compared each regex source/flag pair: **58/58 equal** after the fix.
- Executed the extracted regexp decisions in an independent V8 isolate with **22/22** representative v1 language-family cases accepted and **5/5** prose/invalid-prefix cases rejected. The same examples failed in the earlier v2 reduced-pattern predicate.
- Inspected the new `htmlImport.importRoot` normalization against the original v1 `onPaste` logic.
- Added four Node `node:test` behavioral cases under `plugins/code/paste-parity.test.js`, covering signatures, negative decisions, lossless block resolution, and HTML trailing newlines. They are **committed but not executed by Node's project runner in this environment**.

These checks are *source-level and focused V8 checks*, not a full project `RED/GREEN` test-run claim. Network resolution of `github.com` is unavailable in the container, so no full repository checkout was possible.

## Required later acceptance

From a clean checkout of the final branch SHA:

```sh
npm ci
node --test plugins/code/paste-parity.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Additionally compare actual v1/v2 native Paste into Paragraph and Code with `text/plain` and `text/html`: inherited language patterns, precedence with other registered paste capabilities, source newlines, multi-block paste, Undo/Redo and read-only/document ownership. The wider 21-block/12-inline-tool behavioral matrix, real IME/browser-engine results and resource-retention gates are not established by this targeted pass.

**Status:** two Code Paste parity regressions fixed and committed. This is not a declaration of release stability or complete v1/v2 behavioral parity.
