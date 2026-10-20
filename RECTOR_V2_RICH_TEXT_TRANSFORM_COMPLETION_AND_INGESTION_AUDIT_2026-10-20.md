# Rector v2 — rich-text transform completion and document ingestion integrity audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `24c0a2c1a44f1e796032de6b8cc0f3c37cc9a8f3`  
**Affected modules:** `shared/versionedDataSchema.js`, `shared/snapshotDataSchema.js`.

## Scope, behavior contract and non-findings

Continued the Rector v2 stability/functional-parity audit after `ChangeNotifier` fixes. Examined `core/DocumentIngestion.js`, `shared/DocumentSchema.js`, `core/DocumentRuntime.js` (especially `#normalizeLocalData()`), `shared/versionedDataSchema.js`, `shared/snapshotDataSchema.js`, built-in Paragraph and Checklist schemas, and the corresponding tests.

The active `RECTOR_V2_REMEDIATION_SPEC.md` requires canonical/current-version normalization **before** publishing editor data (I3/I5), data preservation (P2), one synchronous rich-text transformation contract, and controlled external extension execution (I7/I11). A schema's `mapRichText(data, transform)` is synchronous, and its `transform(html, fieldKey)` callback must return a **string**, not a Promise or another type. Editor-ingestion callbacks must not be able to commit a document in which rich-text normalization remains unresolved.

The current document format permits optional `time`, but the specification explicitly requires editor `save()` to generate its **current** timestamp. No new claim was made that ingestion must retain a loaded document's original timestamp: this pass did not change `DocumentIngestion.js`'s document envelope policy. No legacy v1 compatibility or new persisted field was introduced.

## Finding RICH-TRANSFORM-1 — ignored callback return bypassed async and shape validation (P2)

### Reproduction

Both schema adapters guarded their own `mapRichText()` method's return via `synchronousResult()`, but passed the supplied `transform()` callback directly into external mapper code. A plugin mapper can call `transform(data.text, 'text')` for its effects and ignore the returned value; if the callback returns `Promise.resolve('later')`, the mapper can return a canonical-looking data object synchronously. The two schema adapters previously accepted this as successful normalization. The same problem occurred when the transform returned a non-string such as an integer or object.

The original actual source bodies were executed with controlled mappings that called the transform but did not retain its return. **Both adapters returned successful data despite an async transform.** A `prepareCurrentDocument()` public-boundary regression modeled a registered block's normalizer using the mapper and an async author transform: prior ingestion accepted the document instead of rejecting the unresolved normalization.

### First correction

At both schema seams, pass a verified callback to the mapper which:
- executes the original author transform exactly once per invocation;
- runs the result through existing `synchronousResult()` so thenables are rejected and late rejections are observed;
- requires a string return and rejects all non-strings with `Rich-text transform must return a string`.

Five public-boundary regression tests (two in each shared schema test file and one in `core/DocumentIngestion.equality.test.js`) were committed **before** production changes. The actual initial source against the augmented three-suite tests passed **25/30**; all five new tests failed for the intended missing contract check. The initial source fix passed **30/30**.

Commits:
- [Versioned-schema regressions](https://github.com/Shelamkoff/editor/commit/f586c7e76e494343377f7a9eac017213eee3b697)
- [Captured-schema regressions](https://github.com/Shelamkoff/editor/commit/ad42f012d3aefff94abf631b161e0b764b8c4f9b)
- [Document-ingestion regression](https://github.com/Shelamkoff/editor/commit/6d445844f60819aa1c08dd37815e3068b709a7b5)
- [Versioned-schema correction](https://github.com/Shelamkoff/editor/commit/0926687a616e8ba44598903239bbdcb9ef80f8f6)
- [Captured-schema correction](https://github.com/Shelamkoff/editor/commit/998453043815a93587638478f2a6c26f26cac6f1)

## Finding RICH-TRANSFORM-2 — plugin catch could suppress invalid callback completion (P2)

### Reproduction

After the initial correction, a mapper could catch the synchronous exception thrown by the verified `transform()` callback and then return its otherwise valid input data. That would again convert an invalid/async callback into a successful schema result.

Added two further regressions in which a mapper deliberately catches the error from a Promise-valued or non-string-valued `transform()`. With the first correction but without sticky failure tracking, the three focused test files passed **30/32**; both new regressions failed because the enclosing mapper swallowed the validation error.

### Final correction

Each mapper call keeps an operation-local first-failure record. If any invocation of the provided text transform throws, returns a Promise/thenable, or returns a non-string value, the callback still throws immediately; **even if mapper code catches it**, the schema rethrows the recorded first failure before accepting the mapped data. The existing plugin mapper return-value validation, detached data cloning, and normalization paths remain in place.

This validation is synchronous, not a new asynchronous editing capability.

Commits:
- [Versioned swallowed-error regression](https://github.com/Shelamkoff/editor/commit/96ef42d13f873c316ad288259f67be966cbcd876)
- [Captured swallowed-error regression](https://github.com/Shelamkoff/editor/commit/59e3cb2c5fcd4ab371bbbd09be19a9bd5947b151)
- [Versioned sticky-error correction](https://github.com/Shelamkoff/editor/commit/c385da4d1f1d22db687c795adfe760386cb4db71)
- [Captured sticky-error correction](https://github.com/Shelamkoff/editor/commit/aa79e6155387c6b030903fded360f26a49a01085)

## RED → GREEN verification

| Stage | Focused test results |
| --- | --- |
| Original production, first five RED regressions added | **25/30** |
| First callback-validation correction | **30/30** |
| Two swallowed-exception regressions added | **30/32** |
| Final correction, three relevant suites | **32/32** |
| Final correction, six broader schema/data/ingestion suites | **68/68** |

The broader run included unchanged and updated actual test bodies from:

1. `shared/versionedDataSchema.test.js`;
2. `shared/snapshotDataSchema.test.js`;
3. `core/DocumentIngestion.equality.test.js`;
4. `shared/DocumentSchema.test.js`;
5. `shared/cloneEditorData.test.js` (including actual Checklist rich-text mapping);
6. `shared/jsonData.semantic-equality.test.js`.

Production bodies were fetched directly from GitHub, including real JSON cloning, document format, validation issue classification, synchronous result handling, versioned and captured schemas, exact-version document decoder, document ingestion and built-in Checklist schema. Tests ran using an **isolated JavaScript/V8 harness** with adapted ESM imports and minimal Node test/assert adapters. This confirms the addressed behavioral regressions but is **not** the repository's native Node runner, Chromium, actual DOM, package-consumer, or TypeScript acceptance.

The broader 68/68 checks do not cover cross-realm VM JSON tests, complete builtin plugin rendering, or full user-facing v1/v2 functional parity.

## Required native and browser acceptance

Run from a complete, installed checkout of the final branch:

```sh
npm ci
node --test shared/versionedDataSchema.test.js shared/snapshotDataSchema.test.js \
  core/DocumentIngestion.equality.test.js shared/DocumentSchema.test.js \
  shared/cloneEditorData.test.js shared/jsonData.semantic-equality.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
```

Also exercise actual editor load/save/reload, async-returning host `richTextNormalizer`, user conversion into compound rich-text blocks, unknown opaque blocks, and a plugin mapper catching an invalid transform exception. Confirm that no invalid document is committed and that an extension transform's failure cannot change history, selection, or persisted content.

**Release status:** two specific transformation-contract defects corrected with seven new regressions; **68/68** current source-backed scoped checks green. Overall Rector v2 release stability and complete v1 behavior parity remain unverified pending the native and browser acceptance gates.
