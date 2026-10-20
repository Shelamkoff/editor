# Rector v2 — JSON symbol metadata preflight and canonical data ownership audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `d51607d7ef79ee2eb2391c07f02be95c16e17edd`  
**Module:** `shared/jsonData.js`

## Scope and requirements

Continued the v2 stability / feature-parity audit after the versioned-schema accessor and asynchronous callback fixes. Checked actual `shared/jsonData.js`, `shared/cloneEditorData.js`, `shared/DocumentSchema.js`, related schema tests and the canonical transaction/history store suites. Project invariant **I5** requires strict owned current JSON input; **I7** prohibits revoked/invalid contexts from acquiring producer authority, and **I3** preserves committed state on failed input validation. The existing codec intentionally permits normal getter-backed JSON data with a single read, but a known-invalid envelope should reject unsupported metadata before executing data getters where possible.

## Finding JSON-SYMBOL-PREFLIGHT-1 — rejected metadata could execute payload getters (P2)

`cloneJsonValue()` intentionally rejects **enumerable own symbol keys** on JSON records. However, the original object branch enumerated and cloned all ordinary string-keyed properties *before* checking for symbol keys. A value with a known-forbidden symbol and a getter for `secret` could therefore execute that getter and throw its error before the intended symbol validation. This defeats metadata-first rejection for a structurally invalid document and may allow extension-provided getters to trigger effects unnecessarily.

Direct reproduction from the actual unfixed `shared/jsonData.js` blob `4ca643368c2e1cc32ecac9f0596e2a7543c09e95`:

1. Construct a plain object with an enumerable `Symbol('metadata')` field.
2. Add a `secret` getter which records a read and throws.
3. Call `cloneJsonValue(value)`.

**Observed:** exception `payload getter executed`, **1 payload getter read**; expected `contains an enumerable symbol key` and **zero** payload reads. A nested equivalent also reproduced the issue. A non-enumerable symbol getter remains permitted metadata that is ignored by the serializer.

### Fix

Move the existing own-symbol enumeration/validation ahead of `Object.keys(current)` / ordinary value traversal in the **plain object branch**. No new format, extra whitelist, or double-validation pass was added. Array behavior is intentionally unchanged: this serializer already drops arbitrary non-index array metadata that JSON serialization ignores. The object branch still preserves own `__proto__` JSON keys using `Object.defineProperty`.

## RED → GREEN tests

Three tests were added to `shared/cloneEditorData.test.js` before the production change:

- Root enumerable symbol rejects before an ordinary payload getter, and neither the payload nor the symbol getter executes.
- Nested symbol-bearing record rejects before an adjacent nested payload getter.
- Non-enumerable symbol metadata is ignored without executing its getter.

Using the **actual previous production source plus the new test bodies** in an isolated V8 harness:

| Stage | Focused result |
| --- | ---: |
| RED — original source | **1/3 passed**, 2 regressions failed for the intended premature getter execution |
| GREEN — updated source | **3/3 passed** |

Commits:
- [Regression tests](https://github.com/Shelamkoff/editor/commit/da3d20fafd49e739ee6672808ee9ca6f5b228d1c)
- [Production fix](https://github.com/Shelamkoff/editor/commit/ec2a5bc0ad1e47985ef3dc676779bddb2f7ac102)

## Wider verification against the current source

The updated `shared/jsonData.js` blob is `7a1693ebe05cd061e49342d789a3fda7faae30a9`. Five schema/data suites executed in one source-backed isolated JS runner using actual module bodies (ESM import/export replacements only), including `shared/cloneEditorData.test.js`, `shared/jsonData.semantic-equality.test.js`, `shared/versionedDataSchema.test.js`, `shared/snapshotDataSchema.test.js`, and `shared/DocumentSchema.test.js`: **56/56 passed**.

Separately, five transaction/history suites executed against actual `DocumentStore`, `HistoryStore`, `TransactionEngine`, persistent block map and updated JSON helpers in an asynchronous test adapter: **81/81 passed**. This is **137/137 focused source-backed assertions across ten test suites**, not a complete native Node test run.

Additional controlled source checks:
- An own JSON `__proto__` property survives cloning as an ordinary key.
- The clone's intrinsic `Object.prototype` remains unchanged.
- Nested JSON data is detached from the input.
- Non-enumerable symbol getters are not evaluated.

No evidence of a new regression was found in these focused tests. This does **not** establish full runtime performance, native browser behavior or the required v1/v2 capability parity.

## Required local acceptance

From a complete installed checkout at the final branch HEAD:

```sh
npm ci
node --test shared/cloneEditorData.test.js shared/jsonData.semantic-equality.test.js \
  shared/jsonData.realm.test.js shared/versionedDataSchema.test.js \
  shared/snapshotDataSchema.test.js shared/DocumentSchema.test.js \
  core/DocumentStore.test.js core/HistoryStore.test.js core/TransactionEngine.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
```

Native VM cross-realm tests, real editor/renderer save and reload, performance/heap, browser input and complete v1/v2 feature-parity acceptance were not executed in this tool session. Those gates remain open.

## Outcome

One independently reproduced symbol metadata preflight defect fixed directly in the active refactor branch, with three focused tests and 137 current source-backed checks green. This is not a declaration that the overall Rector v2 release is stable or fully compatible in behavior with v1.
