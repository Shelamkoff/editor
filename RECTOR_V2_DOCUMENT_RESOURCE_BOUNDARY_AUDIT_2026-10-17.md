# Rector v2 — document boundaries, semantic JSON and stylesheet ownership audit

**Date:** 17 October 2026  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `e56e77f705d21115869897da9d53ac3f1168b325`  
**Code HEAD before this report:** `fd125e147545a58d36833a954dc5f59e0f10aa92`  
**v1 behavior reference:** `master` `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`

## Scope

This pass audited the shared contracts below the plugin registry and the canonical document runtime, instead of repeating previous toolbar and event-controller patches:

- Schema decode/version admission in `shared/snapshotDataSchema.js`.
- Equality semantics for schema round trips, canonical history and document ingestion.
- Shallow document/block envelope validation in `shared/DocumentSchema.js`.
- Stylesheet reference counting and ownership in `shared/styleRegistry.js`.
- Integration of the updated schema and style helpers with `ExtensionRegistry`.

**All code changes were made directly to the existing refactoring branch.** New regression tests were committed first, reproducing each defect on the original production implementation; subsequent fixes were checked against the committed tests. No legacy schema/migration, compatibility facade or second editor runtime was introduced.

## D1 — schema decode read unrelated properties and unsupported-version payloads

The previous `snapshotDataSchema().decode()` copied the full caller-owned input with `{...input}` before inspecting `dataVersion`. This executed unrelated enumerable/symbol getters, and a payload getter for an unsupported version could override the required `unsupported-data-version` error.

**Fix:** check the own `dataVersion` property exactly once and reject unsupported versions **before** reading `data`. Only the declared `data` field is read, under the schema-validation boundary.

- [RED test file](https://github.com/Shelamkoff/editor/commit/33d8f8c8a220780002c8060c32aabd85946eb2fb): 1/4 pass initially, three failures.
- [Production fix](https://github.com/Shelamkoff/editor/commit/ae85dd35b8e02fb28f0b3d159736af3127d68202): all four cases pass.

## D2 — key insertion order was treated as a semantic document change

The schema's default encode/decode round-trip used `JSON.stringify()`, rejecting semantically equivalent JSON objects if a valid decoder emitted the same key/value pairs in another order. `DocumentIngestion` used the same byte-order-sensitive check and removed a producer `revision` solely because nested object keys were reordered, even though the authored document meaning had not changed.

The canonical history engine already compared **meaningful JSON structure** rather than serialized object key order. A single shared `equalJsonValue()` now preserves this invariant across the schema, document ingestion and canonical history. Object keys are unordered, but field presence, primitive values, and **array element order** remain meaningful. The comparator is implemented on owned JSON and does not execute arbitrary custom equality/iteration methods.

- [RED schema round-trip cases](https://github.com/Shelamkoff/editor/commit/86b0266ad5cf29aa8bff55296242ad818046ebf7)
- [RED document ingestion cases](https://github.com/Shelamkoff/editor/commit/0dcd2e1a06fdc0c322d5b22596007d478c5a631b)
- [Comparator unit cases](https://github.com/Shelamkoff/editor/commit/530d34604c8031455e635822e48bd3af45cda621)
- [Shared comparator](https://github.com/Shelamkoff/editor/commit/a262b1460c1ccf015da8b0df02a39535a9222951)
- [Schema round-trip fix](https://github.com/Shelamkoff/editor/commit/125e2be32dd76186c73c18340d7cd87f0f7fc931)
- [Ingestion revision fix](https://github.com/Shelamkoff/editor/commit/b1d3c80b08b392ceda30d79869c1072c1f449422)
- [Canonical history reuse](https://github.com/Shelamkoff/editor/commit/f7bf4c9b90836afbbe1175e95e5541a193615b8f)

**RED:** in the initial combined schema/ingestion run, 8/10 cases passed; the schema key-order and producer revision tests failed. **GREEN:** all 16 targeted schema, ingestion, shared equality and canonical-history checks pass on the final source.

## D3 — document envelope validation invoked rejected input getters

`snapshotCurrentDocumentEnvelope()` and `snapshotCurrentBlockEnvelope()` used object spread before rejecting unsupported envelope keys and before validating required identities/versions. A getter for an unknown property, or the block list getter of an unsupported document version, could throw first; a block with an invalid ID could also invoke a `data` getter despite not being admissible.

**Fix:** check the names of declared own fields before executing values; then read and validate required identity/version fields before accessing payloads and optional metadata. Valid fields are read once; unsupported document versions still carry the `unsupported-document-version` classification, while bad shapes remain `invalid-input`. Deep payload ownership remains with the existing decoder.

- [RED tests](https://github.com/Shelamkoff/editor/commit/4627a84cd4017512a2eb0862f2bb30dd5611bf43): 0/4 new cases initially passed.
- [Production fix](https://github.com/Shelamkoff/editor/commit/29430c506bdfd9b9b9fb3442f82bed1642cbd6cc).
- **GREEN:** the complete committed `shared/DocumentSchema.test.js` file passed 12/12 source-level cases including all earlier contract tests.

## D4 — stylesheet acquisition could execute a caller's iterator or delete adopted DOM

`acquireStyleUrls()` iterated URLs through `new Set(urls)`. An otherwise valid dense array with an overridden iterator could execute arbitrary extension code. Further, both normal lease release and failed DOM append recovery used unconditional `link.remove()`, even if another DOM owner had already reparented that link.

**Fix:** read URLs by numeric index, reject holes and non-string entries, de-duplicate internally, and only remove styles while they remain in their original head (or are unattached). The refcount registry releases old claims even after reparenting; later acquisitions use a fresh link rather than retaining stale ownership.

- [RED tests](https://github.com/Shelamkoff/editor/commit/ede8875cfea2af3752c47fd5aefb407f007c141b): 6/9 original and added source-level tests passed; three new cases failed.
- [Production fix](https://github.com/Shelamkoff/editor/commit/fd125e147545a58d36833a954dc5f59e0f10aa92).
- **GREEN:** all 9/9 stylesheet ownership tests pass.

## Focused verification summary

| Suite/call site | Final results | Adapter boundary |
|---|---:|---|
| `shared/snapshotDataSchema.test.js` | **7/7 PASS** | Production schema wrapper, JSON clone, validation and thenable helper |
| `core/DocumentIngestion.equality.test.js` | **3/3 PASS** | Production ingestion plus actual document decoder with controlled schema services |
| `shared/jsonData.semantic-equality.test.js` | **4/4 PASS** | Production JSON equality |
| `core/CanonicalTransforms.test.js` (semantic equality cases only) | **2/2 PASS** | Production canonical comparator and shared JSON helper |
| `shared/DocumentSchema.test.js` | **12/12 PASS** | Production document parser and validation helpers |
| `shared/styleRegistry.realm.test.js` | **9/9 PASS** | Production reference counter with controlled DOM |
| `core/ExtensionRegistry.test.js` | **34/34 PASS** | Production registry, schema snapshot, JSON clone and style registry; controlled AbortController |
| **Total focused source-level executions** | **71/71 PASS** | V8 with controlled dependencies; NOT the official complete project runner |

All 71 checks were evaluated against the final production sources after the corresponding fixes, including previously committed tests. This number is not the number of native-browser tests or a guarantee that unrelated modules pass.

## Outstanding release requirements

The connector environment allowed focused source execution and direct GitHub commits but did not provide a full native project checkout and browser harness. The following **were not executed** at this commit:

```sh
npm ci
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Complete acceptance still requires full TypeScript/JSDoc diagnostics, installed-package checks, browser selection/IME/clipboard/parity against v1, and testing on the final synchronized branch HEAD. The audit documents **scoped defects fixed**, not a determination that the entire Rector v2 library is stable or behaviorally identical to its first version.
