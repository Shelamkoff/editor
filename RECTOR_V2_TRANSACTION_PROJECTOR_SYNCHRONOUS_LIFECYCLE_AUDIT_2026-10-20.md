# Rector v2 — TransactionEngine synchronous projection lifecycle audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `b7d76fe30794949a00fe0237e018dd79aa4c40ca`  
**Production module:** `core/TransactionEngine.js`  
**Regression suite:** `core/TransactionEngine.test.js`

## Scope and governing contract

Continued the Rector v2 audit from the instance-task lifecycle into atomic transaction and history publication. Examined `core/TransactionEngine.js`, `core/HistoryStore.js`, `core/DocumentStore.js`, `core/PersistentBlockMap.js`, the corresponding TransactionEngine replay/continuation tests, `.agents/skills/tdd/SKILL.md`, and the active `RECTOR_V2_REMEDIATION_SPEC.md`.

The normative **C1 §5.2 prepared protocol** exposes `prepare → apply → commit → finalize` on successful transactions and `recover/discard` on failed preparations. `apply()`, `recover()`, `finalize()`, `discard()` are **synchronous void** operations. Canonical store/history may advance only after successful application. When recovery cannot be guaranteed, the engine must enter `failed` instead of reporting a successful rollback. Post-commit finalizer failures must be routed to diagnostics without undoing an already completed commit. **C1/I2/P3/P4** also require the same semantics for history Undo/Redo.

No new history engine, persistence format, public API or legacy compatibility path was added.

## Finding TX-PROJECTOR-APPLY-ASYNC-1 — async apply could commit before projection completed (P1/P2)

### Reproduction

`#executeOuter()` and `#replayObserved()` previously called `prepared.apply()` and ignored its return value. A supplied projector could return `Promise.resolve()` or a thenable. The engine would continue to build history and atomically swap the document store and history cursor **before projection completion**.

A new public `TransactionEngine.execute()` regression provided an async `apply`. With the original production source `aa3116313221149218719c5217355397a7455f31`, the edit succeeded and became committed, whereas the synchronous projection contract required rejecting the operation and leaving the original committed model and history unchanged. A second regression proved the same issue for `undo()`: an async inverse projection could move the history cursor before rendering the reverted model.

### Correction

Use the existing `shared/synchronousResult()` on `prepared.apply()` in **both** normal and replay paths. Reject thenables before store/history commit; route late returned thenable rejections through the standard diagnostic sink; keep the existing rollback that calls `recover` and `discard` on an unsuccessful preparation. A rejected async apply cannot be treated as a successful model edit.

## Finding TX-PROJECTOR-ROLLBACK-ASYNC-1 — pending cleanup was reported as safe rollback (P1/P2)

### Reproduction

`#rollbackPrepared()` previously called `prepared.recover()` and `prepared.discard()` without inspecting returned values. Even if either function returned a Promise, the engine marked the rollback as complete, returned to `idle`, and allowed new authoring against a projection whose restoration or resource cleanup had not yet finished.

Two regressions deliberately made `recover()` or `discard()` return `Promise.resolve()` following a failed `apply()`. On the old source each test observed the **original apply error instead of a failed recovery state**.

### Correction

Require synchronous completion of both recovery stages using `synchronousResult()`. Any non-synchronous return is recorded as a recovery/discard failure and combined with the original error. The existing `AggregateError`/failed-health path then blocks new edits instead of incorrectly treating a pending rollback as complete. A cleanup failure does not skip independent `discard()`, preserving the existing best-effort staged resource-release protocol.

## Finding TX-PROJECTOR-FINALIZE-ASYNC-1 — post-commit async finalization went unobserved (P2)

### Reproduction

`#finalize()` previously invoked `prepared.finalize()` in a try/catch but ignored its returned value. A Promise or thenable could therefore be left unobserved, including late rejection, even though finalization is the point at which superseded instance scopes and resources are retired.

### Correction

Call `synchronousResult(prepared.finalize(), ...)` and send the synchronous violation and any subsequently rejected thenable to the existing `transaction.finalize` diagnostics. **Do not change or roll back the already committed document/history** when finalization reports a cleanup failure.

## Additional preparation boundary

`#prepareProjection()` could accept a thenable object that also exposed methods named `apply/recover/finalize/discard`. Shape checks alone previously let it cross into the projection protocol. The correction validates the return from `projector.prepare()` with `synchronousResult()` before accepting its method shape, and observes potentially asynchronous `discard()` of malformed returned values. A dedicated negative test requires no `apply` call or committed edit for this case.

## RED → GREEN evidence

Six public-boundary regressions were added, covering:
1. `execute` async `apply` prevents document/history commit;
2. async `recover` never permits a false-success rollback;
3. async `discard` never permits a false-success rollback;
4. async `finalize` reports diagnostics but preserves the committed model;
5. a thenable projector `prepare` result with valid-looking methods is rejected;
6. async `apply` during Undo cannot move the history cursor.

The tests were executed against **the exact previous production blob**, producing **0/6 passing** for the new cases (all failed for the intended contract violations). After the production correction, **6/6** new cases passed. The broader full current regression run included the complete actual test bodies of:

- `core/TransactionEngine.test.js`;
- `core/TransactionEngine.replay-lifetime.test.js`;
- `core/TransactionEngine.history-continuation.test.js`.

Using actual retrieved `TransactionEngine`, `DocumentStore`, `HistoryStore`, `PersistentBlockMap`, `cloneEditorData`, JSON equality, `invokeObserver`, and `synchronousResult` implementations, all **58/58 source-backed focused tests passed**. ESM module imports and `node:test`/`node:assert` were adapted in an isolated JS/V8 harness; it is **not** native `node --test` or a browser/editor suite. Native project dependency installation, TypeScript and Chromium acceptance have **not** been executed in this environment.

Checked production SHA:
- Before fix: `aa3116313221149218719c5217355397a7455f31`.
- After fix: `24853b711869acb803d5adcf70df45c08c0feaa8`.
- Final test blob: `4153b105f3f289aa2c321b43b94a84ba56cddf58`.

## Direct commits

- [Initial four RED tests](https://github.com/Shelamkoff/editor/commit/21c15ffff0fea6a183ec26adf6247acb214d26b1)
- [Synchronous projector protocol fix](https://github.com/Shelamkoff/editor/commit/ebdf46fcd731ffd547f2f21eaf9e46f8da93e3be)
- [Prepare/Undo negative tests](https://github.com/Shelamkoff/editor/commit/110aebb1e754b80a426a2c7e4d21febf941a0ca2)

## Required native acceptance

On a full installed checkout of the current `refactor/rector-v2-architecture` branch:

```sh
npm ci
node --test core/TransactionEngine.test.js \
  core/TransactionEngine.replay-lifetime.test.js \
  core/TransactionEngine.history-continuation.test.js \
  core/DocumentStore.test.js core/HistoryStore.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
```

In Chromium, exercise actual mounted projector apply/recover/finalize under extension `create`, `destroy`, invalid rich-text normalization, reentrant observers, Undo/Redo and readOnly transition. Verify one commit/history entry per successful gesture, no document commit after failed projection, no incorrect `idle` after incomplete rollback, and resource lifetimes for discarded/staged scopes. Validate the complete v1/v2 behavioral feature parity matrix independently of JSON/API legacy compatibility.

**Outcome:** four closely related synchronous projection-boundary failures corrected (application, rollback, post-commit finalization, prepare), with six RED/GREEN regressions and **58/58 focused source-backed tests** passing. This does **not** certify Rector v2 release readiness or browser/TypeScript completion.
