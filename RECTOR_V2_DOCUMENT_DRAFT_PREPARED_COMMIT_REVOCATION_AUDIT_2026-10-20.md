# Rector v2 — DocumentStore prepared-commit and stale draft revocation

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Baseline HEAD:** `2322eeda297d7d5e65b589dcf64bcd8df5a74919`  
**Priority:** P2 (canonical document state integrity)

## Scope and governing contract

Continued audit after diagnostics accessor isolation and HistoryStore prepared cursor revocation. Inspected actual `core/DocumentStore.js`, `core/DocumentStore.test.js`, `core/TransactionEngine.js`, `core/HistoryStore.js`, persistent block map and JSON ownership helpers. The active `RECTOR_V2_REMEDIATION_SPEC.md` requires atomic committed model/history/projection consistency (P4, I2, I3) and forbids revoked contexts from acquiring successor authority (I7). This is a v2 model-state defect, not a claim about legacy format support.

## Finding DOCUMENT-PREPARED-1 — old document plan can overwrite newer commits

Prior `DocumentStore.prepareCommit(draft)` captured a frozen document snapshot and calculated `revision = store.revision + 1`, but its returned `commit()` closure did **not** check whether another commit had advanced the store since preparation. Nor did it track the revision from which its draft was created.

Using the actual previous `DocumentStore`, `PersistentBlockMap`, `cloneEditorData`, and `jsonData` sources in an isolated V8 harness:

1. Start with canonical block `a = base`.
2. Prepare an old draft updating `a = stale`; do not commit.
3. Prepare and commit a newer draft with `a = fresh`.
4. Invoke the older prepared `commit()`.

**Observed pre-fix result:** the stale plan was accepted and canonical text became `stale` again. A similar prepared replacement could roll back `generation` and `revision` after additional commits. A stale draft constructed before a new commit could also prepare afterward without rejection. This is a source-backed model-state integrity issue, even though normal `TransactionEngine` phases typically serialize commands; it is not proof that every ordinary UI gesture can reach the race.

## Fix

- Capture the store revision in each `DocumentDraft` at construction time, *before* traversing external document data or running an accessor.
- `DocumentStore.prepareCommit()` rejects a draft based on an older revision.
- Recheck the store revision after obtaining the prepared draft state, protecting against synchronous reentry during that step.
- The prepared `commit()` compares its expected revision with the current store revision **before mutating** document, generation, or revision.
- Preserve the idempotence of a plan that already committed successfully. Failed/stale plans do not mutate the live store.
- No new editor document format, history engine, or legacy compatibility code was introduced.

## RED → GREEN evidence

The first three regressions were committed separately before the production change:

- Stale prepared commit cannot overwrite a later canonical commit.
- Stale draft cannot prepare against an intervening replacement.
- Stale prepared replacement cannot rewind generation/revision.

With the regressions checked against the previous production source, **10/13 passed and the three new tests failed for the intended defect** (missing stale rejection). After the fix, **13/13 passed** in a source-backed isolated V8 execution.

Two additional tests cover:

- A successor commit occurring inside a reentrant `draft.preparedState()`.
- A successor commit invoked by an external document accessor during `createDraftFrom()`.

After the additional tests and type comments, **81/81 passed** across the actual fetched sources of `DocumentStore`, `HistoryStore`, `TransactionEngine`, and their five corresponding test modules. The harness substituted minimal test/assert and microtask adapters; it was **not** a full native `node --test` run. Static type checking, package suite, and real browser acceptance were **not run** because an installed checkout was unavailable and this container could not resolve github.com.

## Commits

- [Three initial RED regressions](https://github.com/Shelamkoff/editor/commit/a8bd3a84f99f746a0a58d62bfb9aa8fcc525d2f9)
- [Prepared state revision guard](https://github.com/Shelamkoff/editor/commit/e8f0d05c34e6526b3d06981d5f5dc9fb89beb73a)
- [Two reentrant preparation regressions](https://github.com/Shelamkoff/editor/commit/da800c1ec9b40db20395bb964f9c5da1af8f8258)
- [Revision guard JSDoc annotations](https://github.com/Shelamkoff/editor/commit/18b13157ff6e242be57d77428006d48751ed7a32)

## Required local acceptance

Run from a complete checkout of `refactor/rector-v2-architecture`:

```sh
npm ci
node --test core/DocumentStore.test.js core/HistoryStore.test.js \
  core/TransactionEngine.test.js core/TransactionEngine.history-continuation.test.js \
  core/TransactionEngine.replay-lifetime.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
```

Then exercise a real editing session: author text, save, undo, redo, whole-document replace, and rapid asynchronous plugin callbacks. Confirm that a revoked pre-replacement draft cannot overwrite content or restore an obsolete history/projection generation. The 81 green focused V8 checks do **not** establish complete v1/v2 feature parity or release readiness.

No unrelated agent code was intentionally modified; writes used GitHub file SHA preconditions and direct commits to the existing branch.
