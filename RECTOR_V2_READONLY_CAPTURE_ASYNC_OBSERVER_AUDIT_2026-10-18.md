# Rector v2 — read-only capture and asynchronous transaction observer audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `a036b60822552099ad5b67f60a7c404548dc3f6e`  
**Area:** `DocumentRuntime.setReadOnly` and `TransactionEngine.#publish`.

## Contract and risk

The current remediation specification §5 requires protected read-only transitions, no nested mutation from control hooks, an atomic committed model/history boundary, and isolation of **both synchronous exceptions and rejected asynchronous values** returned by observers. These rules do not require a v1 compatibility API or persisted document migration.

## Finding R1 — selection capture before the read-only transition guard (P2)

Previously `setReadOnly()` advanced the mode epoch and called `#captureSelection()` **before** setting `#changingReadOnly=true`. A selection port can execute host callbacks or getters while returning its logical bookmark. During this interval `#assertHostMutation()` still considered the editor idle, permitting a host update, or a recursively requested `setReadOnly(true)`. In the latter case, the projector's transition ran twice.

**Red:** A source-level execution of the **actual previous `DocumentRuntime` class** with an isolated stateful Store/TransactionEngine adapter demonstrated:
- A selection capture invoking a host update successfully authored another block value (`Nested`) before the original read-only transition.
- A capture invoking `setReadOnly(true)` recursively produced two projector transitions for one public request.

**Fix:** Enter the `#changingReadOnly` guard immediately after epoch invalidation but **before** selection capture, and keep its scope through projection, selection recovery, application notifications and the existing `finally`. Committed read-only queries remain available to selection hooks, while reentrant writes and transitions now reject at their authority boundary.

- [Unit regressions `28d455d`](https://github.com/Shelamkoff/editor/commit/28d455db3728a1ce30dd86757ba619967febc35d)
- [Production fix `483cd05`](https://github.com/Shelamkoff/editor/commit/483cd057fbe8d840caaaea1aa8001dc87ec7eb8d)
- [Complete projector fixture `382b5eb`](https://github.com/Shelamkoff/editor/commit/382b5eb0c2df0570f7cfac70a1fea6cbc6cf8f4b)

**Green (focused):** 3/3 scenarios using the revised actual class with a minimal stateful Store/Engine adapter: reentrant update rejected, reentrant mode transition rejected, committed read permitted. The two checked-in `core/DocumentRuntime.test.js` regressions use the **real** `DocumentRuntime`, registry and complete noop prepared-projection fixture, but Node.js execution of that full test file was not available in this environment.

## Finding R2 — asynchronous onCommit observation was not contained (P2)

`TransactionEngine.#publish` caught synchronous exceptions but ignored the return value of `onCommit`. An observer returning a rejected native Promise or custom thenable could therefore leave an unhandled rejection **after** the model and history already committed. A throwing `then` getter was also never observed, so no diagnostic was emitted.

**Red:** Two tests against the actual pre-fix `DocumentStore`, `HistoryStore`, `PersistentBlockMap` and `TransactionEngine` classes showed:
- A rejecting thenable's `then` method was not assimilated (`0` calls instead of `1`), with no diagnostic.
- A throwing thenable accessor yielded no `transaction.observer` diagnostic.

**Fix:** Route `onCommit` through the existing `shared/invokeObserver.js` helper. This observes at most one callback result, contains synchronous throws and late Promise/thenable rejection (including a failing `then` accessor), forwards errors to `#diagnostic`, and does not await the observer or roll back the canonical commit.

- [Red tests `ad9672e`](https://github.com/Shelamkoff/editor/commit/ad9672eecfc1bc73f9ed62e2562e1e08296f1349)
- [Production fix `0767f5b`](https://github.com/Shelamkoff/editor/commit/0767f5b04e6aab1286baecc84c7b5749477ca330)
- [Native rejected Promise control `77b0771`](https://github.com/Shelamkoff/editor/commit/77b0771e14023672e3487c3a1b69f8996cd8b842)

**Green:** 31/31 checked-in `core/TransactionEngine.test.js` cases executed against actual fetched source of `DocumentStore`, `HistoryStore`, `PersistentBlockMap`, `TransactionEngine`, `jsonData`, `synchronousResult` and `invokeObserver` in the isolated JavaScript executor (with a microtask adapter). Includes sync and async observer errors, Undo/Redo, draft poisoning, transaction projection and history guards.

## Verification ledger

| Scope | New unit tests | Isolated checks | Full Node/Chrome |
| --- | ---: | --- | --- |
| DocumentRuntime read-only selection capture | 2 | 3/3 focused green (stateful dependency adapter) | Not run |
| TransactionEngine observer containment | 3 | 31/31 checked-in real-module cases green | Not run |

Five new unit tests have been committed. The test-first red evidence is specific to the paths described above. The isolated success counts must **not** be interpreted as a passing full project `npm test`, TypeScript build, native Chrome suite or confirmed complete v1/v2 behavioral parity.

## Required local acceptance at final HEAD

```sh
npm ci
node --test core/DocumentRuntime.test.js core/TransactionEngine.test.js core/PublicEditorApi.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

For a native integration follow-up, test read-only mode switching while selection capture or editor callbacks are active, verify exactly one transition, no nested host changes, unchanged model revision/history, and recoverable editability. Verify async `transaction:committed` listeners rejecting after a committed action do not produce unhandled browser rejections or affect Undo/Redo.

**Conclusion:** Both confirmed runtime invariants were corrected in the target branch, with focused regression evidence. The library cannot yet be certified fully stable or fully behaviorally equivalent to v1 without the complete native/package/type acceptance on the final HEAD.
