# Rector v2 — prepared HistoryStore cursor revocation and replay safety

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `a44d926bfb892033007a1bb4098e9685015fdbfe`

## Scope and contract

Continue Rector v2's stability/functional-parity audit beyond inline DOM ownership, into the canonical history boundary. The active `RECTOR_V2_REMEDIATION_SPEC.md` requires atomic and replayable user interactions (P4 / I2), post-commit consistency, no resurrection of revoked state (I7), and one history cursor owned by committed transactions.

Reviewed the **current actual** `core/HistoryStore.js`, its unit and continuation suites, `core/TransactionEngine.js`, `core/DocumentStore.js`, and the corresponding replay/transaction integration tests. The stale-plan issue is at the prepared history cursor boundary, not in the inline JSON format.

## Finding HISTORY-PREPARED-1 — a stale prepared plan could overwrite committed history or revive cleared redo (P2)

`HistoryStore.prepareRecord()` and `prepareReplay()` returned `commit()` closures capturing new undo/redo stack arrays. The closures were not tied to the history snapshot from which they were prepared. If the store's history changed between preparation and commit, the old closure could replace the newer stacks without noticing.

The exact previous `HistoryStore` implementation reproduced both failures:

1. Push record 1, prepare record 2, then push record 3 and commit the old plan: **record 3 disappears** and history's latest record becomes 2.
2. Push record 1, prepare Undo, call `history.clear()`, then commit the old Undo: **history resurrects an entry in Redo** after explicitly being cleared.

A similarly stale prepared Redo could restore an outdated cursor over a newer edit. Competing prepared Undo plans could also both claim the same replay boundary.

These are direct API-level state integrity defects. The public `TransactionEngine` normally serializes document commands using its phase guards, so this audit does **not** claim the stale state is reachable through every ordinary keyboard command; the store nevertheless must never allow a previously revoked cursor lease to write.

## Fix

Added a private, monotonically advancing history `#epoch` in `HistoryStore`:

- A prepared record or replay snapshot captures the epoch at preparation time.
- Its one-shot `commit()` checks that the captured epoch still equals the current epoch **before** replacing either undo or redo arrays.
- Every successfully committed record/replay advances the epoch, and `clear()` advances it even if no entries remain.
- A stale closure raises a clear `Prepared history plan is stale` error without changing history or typing coalescence state.
- Calling `commit()` again after the *same plan already successfully committed* remains idempotent, without invalidating a later legitimately prepared plan.
- Failed preparation and abandoned/uncommitted plans do not advance the cursor or epoch.

No second history store, new document format, or changes to engine's command protocol were introduced.

## RED → GREEN regression evidence

The new cases in `core/HistoryStore.test.js` were committed **before** the production fix. The previous class, evaluated with the new test source, failed the first three newly added regressions:
- stale prepared record overwrote a newer record;
- stale Undo resurrected Redo after `clear()`;
- stale Redo could revert a newer committed edit.

The prior implementation also fails the subsequent competing-prepared-Undo regression because the second `commit()` does not reject a superseded snapshot.

After the fix, the current source and exact tests were evaluated using real `shared/jsonData.js` (`cloneJsonValue`, `equalJsonValue`) and `shared/cloneEditorData.js`; all new and previous unit cases passed.

- [RED tests for stale records, cleared history and stale replay](https://github.com/Shelamkoff/editor/commit/51051bf68d541782274b1bce6a4f3e17428f1953)
- [Production epoch/revocation fix](https://github.com/Shelamkoff/editor/commit/41e4e878de70337a001f181eec5e33e9a702ab59)
- [Competing prepared Undo regression](https://github.com/Shelamkoff/editor/commit/5a9e1e8817334bac72563d0b26825b260ca841cd)

## Source-backed verification

| Suite / scenario | Result | Evidence boundary |
| --- | --- | --- |
| Original `HistoryStore` stale record and Undo cursor | **RED** | Actual prior class with new regressions in isolated V8 |
| `core/HistoryStore.test.js` | **14/14 passed** | Current source/tests, real JSON clone/equality helpers |
| `core/HistoryStore.continuation.test.js` | **9/9 passed** | Actual source/tests, including coalescence and async metadata continuation |
| `core/HistoryStore.replay-boundary.test.js` | **8/8 passed** | Actual `TransactionEngine`, `DocumentStore`, `HistoryStore`, persistent AVL index |
| `core/TransactionEngine.history-continuation.test.js` | **5/5 passed** | Same actual production modules with source-backed adapters |
| `core/HistoryStore.model.test.js` | **8/8 passed** | Actual store/engine/model code and random model invariants |
| **Total focused checks** | **44/44 passed** | Actual fetched source/test bodies in isolated V8, not the repository's Node test runner |
| Full `npm test`, browser, TypeScript, docs, package | **Not run** | Complete checkout and dependency tree unavailable; container DNS cannot resolve GitHub |
| Full v1/v2 UI and history behavioral parity | **Not established** | Requires physical editor interaction and complete acceptance |

The isolated V8 harness uses the actual repository implementations of the JSON helpers, persistent block map, DocumentStore, TransactionEngine and HistoryStore rather than reimplementing their logic. It supplies a minimal `test`/`assert` adapter and a Promise-backed microtask queue, so it must not be described as a full `node --test` or browser success.

## Required local acceptance

From a complete checkout of `refactor/rector-v2-architecture`:

```sh
npm ci
node --test core/HistoryStore.test.js core/HistoryStore.continuation.test.js \
  core/HistoryStore.model.test.js core/HistoryStore.replay-boundary.test.js \
  core/TransactionEngine.history-continuation.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Then run the real Save → Undo → Redo → Reload scenarios for inline widgets (including unknown/opaque sidecars), backward selections and one canonical history entry per user gesture. Add a real engine teardown/failed-replay boundary check if a public `HistoryStore` mutator can be invoked by an external adapter. This audit is not a declaration of release stability.

All edits were committed directly on the existing refactor branch with current GitHub file SHA preconditions; no PR, force push, or unrelated agent code overwrite was used.
