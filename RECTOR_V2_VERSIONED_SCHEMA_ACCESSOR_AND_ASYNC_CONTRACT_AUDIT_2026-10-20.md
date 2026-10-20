# Rector v2 — versioned schema accessor preflight and synchronous callback audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `2231c0766de8c624641c95255183cdf3ac126b41`  
**Audited module:** `shared/versionedDataSchema.js`

## Scope and contract

Continued Rector v2's stability and functional-parity audit beyond the completed attachment ZIP passes. Reviewed the actual source of `shared/versionedDataSchema.js`, `shared/snapshotDataSchema.js`, `shared/DocumentSchema.js`, `shared/documentValidationIssue.js`, and their test suites. The active `RECTOR_V2_REMEDIATION_SPEC.md` requires a **single explicit current version** (I5), stable ownership of serialized data, one authoritative schema contract (I11) and controlled external plugin execution. Asynchronous schema transforms must never be accepted as synchronously committed data.

The package remains v2-only: no legacy fallback, migrations, compatibility aliases or alternative document format were introduced.

## Finding VDS-ACCESSOR-1 — schema read rejected or unrelated fields before validation (P2)

### Reproduction

The pre-fix `createVersionedDataSchema()` used object spread in both descriptor capture and serialized decode:

- `const supplied = { ...options }` ran a getter for the removed `migrations` option **before** it could reject the forbidden name.
- `const candidate = { ...input }` ran a getter for the serialized `data` payload **before** rejecting a missing or unsupported `dataVersion`.
- That same spread evaluated unrelated extension fields even on valid, current-version payloads.
- Enumerable symbol getters on the options object could run although symbols are not schema options.

These were reproduced directly on the original module with controlled throwing accessors. A wrong-version payload threw the *getter's error* rather than the expected `Unsupported data version` rejection, and the removed-option getter similarly ran instead of reporting the unknown name.

### Fix

- Inspect own enumerable option **names** first, rejecting unknown names without reading their values.
- Snapshot only the declared own options `currentVersion`, `createDefault`, `normalize`, and optional `mapRichText` once; do not elevate inherited getters or inspect unrelated symbol properties.
- In `decode()`, check for an own `dataVersion` and validate it before reading the `data` property.
- Read only declared decode fields. Avoid materializing a copied arbitrary input envelope.
- Preserve existing detached JSON ownership and exact-version behavior.

**TDD evidence:** Four new regressions were committed first. With the new suite against the old production source, **6/10 tests passed; all 4 new cases failed** for their intended missing preflight. After the fix, **10/10 passed**.

Commits:
- [RED regressions](https://github.com/Shelamkoff/editor/commit/648141f7ab7211446c1cb5d241c72586a43011c2)
- [Accessor preflight fix](https://github.com/Shelamkoff/editor/commit/b89ce1234862c4d5d710717eddfccb2c35aaa0e1)

## Finding VDS-ASYNC-1 — asynchronous rich-text mapping silently succeeded (P2)

### Reproduction

The original factory called `mapRichText(owned, transform)` and ignored its return value. A schema implementation that returned `Promise.resolve()` was accepted as a synchronous map: `schema.mapRichText()` returned canonical data without reporting that the extension transform was unfinished. Asynchronous `createDefault()` and `normalize()` results failed only accidentally when JSON cloning encountered a Promise (`non-JSON object Promise`), without the shared synchronous-operation rejection protocol.

The v2 schema contract is synchronous; late extension work cannot be allowed to act as a valid authoring transformation or produce an unobserved rejected Promise.

### Fix

- Reuse existing `shared/synchronousResult.js` to verify producer completion.
- Guard results of `createDefault()`, `normalize()` and `mapRichText()`.
- Promise/thenable producers are rejected with the explicit `Extension operation must complete synchronously` error; asynchronous rejection is observed by the shared helper.
- Fully synchronous data normalization and rich-text operations preserve their previous behavior.

**TDD evidence:** Three new regressions were committed before the fix. Against the then-current production source **10/13 passed; all 3 new async cases failed**. After the fix, the schema's unit suite passed, and wider schema-boundary checks below were green.

Commits:
- [RED regressions](https://github.com/Shelamkoff/editor/commit/ed27e590e4f2d9aa87a8572abea955e209cd15f8)
- [Synchronous schema callback guard](https://github.com/Shelamkoff/editor/commit/b4bed8e4ee085fdecc6464bc403522414f8d6976)

## Verification: current source and shared document decoder

Fetched the **actual current** sources and executed three corresponding test files through one isolated JavaScript harness with direct, unmodified function bodies (apart from ESM import/export adapter) and minimal Node assertion/test adapters:

| Test suite | Cases | Result |
| --- | ---: | --- |
| `shared/versionedDataSchema.test.js` | 13 | Passed |
| `shared/snapshotDataSchema.test.js` | 7 | Passed |
| `shared/DocumentSchema.test.js` | 21 | Passed |
| **Total** | **41** | **41/41 passed** |

The suite uses the actual `shared/jsonData.js`, `cloneEditorData.js`, `documentFormat.js`, `documentValidationIssue.js`, `synchronousResult.js`, `versionedDataSchema.js`, `snapshotDataSchema.js`, and `DocumentSchema.js` bodies. It validates both schema behavior and the shared decode boundary. The fixture harness cannot substitute for the package's full Node test runner.

**Not run on this final commit:** native `node --test`, full `npm test`, TypeScript `typecheck`, Chromium/editor and renderer end-to-end flows, package gates, native IME, and the full v1/v2 behavioral parity matrix. Code changes and source-backed harness results therefore **do not establish release readiness**.

## Required local acceptance

From a complete installed checkout of `refactor/rector-v2-architecture`:

```sh
npm ci
node --test shared/versionedDataSchema.test.js shared/snapshotDataSchema.test.js shared/DocumentSchema.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
```

Also run editor and renderer save → reload, unknown unloaded block/inline round-trip, wrong-version rejection with getter-backed inputs, and a plugin schema returning asynchronous/thenable data. Confirm the schema failure cannot modify committed state, undo/redo or later callbacks.

## Conclusion

Two additional schema-boundary defects were confirmed and corrected, with seven new regression cases. The current combined document/schema tests pass **41/41** in an isolated JavaScript harness. The full Rector v2 release gate remains open until the complete native/local acceptance matrix runs.
