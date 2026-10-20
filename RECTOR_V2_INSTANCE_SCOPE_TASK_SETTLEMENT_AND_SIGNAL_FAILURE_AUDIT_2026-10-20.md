# Rector v2 — task settlement generation, abort failure and signal attachment audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `a09e5fa8392f33c9994092d03a4491997392ebfb`  
**Production module:** `core/InstanceScope.js`  
**Tests:** `core/InstanceScope.test.js`, `core/InstanceScope.history-continuation.test.js`.

## Requirements and scope

Continued the Rector v2 audit after `InstanceScope` deferred DOM producer and early-generation checks. Inspected the actual current scope lifecycle, `DataTask.commit`, queued `updateData` producer boundary, parent admission, `#cancelTasks()`, and owner-supplied `configure({signal})`. Consulted the project TDD skill and the current `RECTOR_V2_REMEDIATION_SPEC.md`, especially **C5 §§9.2–9.3**, C1 and invariants I7/P5.

Required properties:
- A mounted instance cannot author another document generation, even before its finalizer calls `revoke()`.
- External phase/health/revision, host update, and author producer callbacks cannot confer authority by returning an obsolete generation.
- A revoked task stops invoking producers, and cancellation failure must not skip other tasks or descendants.
- A configured owner abort signal must revoke its scope reliably, or a failed subscription must reject and leave no active scope.

No persisted format, public API, new dependency or compatibility path was introduced.

## Finding SCOPE-TASK-SETTLEMENT-GENERATION-1 (P2)

### Reproduction

The earlier generation boundary fix checked `currentGeneration()` during `beginTask()` and in the initial `DataTask.commit()` predicate, but **not after** subsequent extension/parent callbacks or inside the host-owned `updateData` callback before/after the producer. Therefore:

1. A task acquired in generation 3 could have `phase()`, parent `health()` or parent `phase()` synchronously advance the committed generation to 4; old `task.commit()` still returned `true` and ran a producer.
2. A queued ordinary instance `updateData` host could advance generation before invoking its captured callback; the callback still called its old producer.
3. The producer itself could advance the document generation and return a value that the old wrapper permitted to persist.

Direct execution of the original production source `f13ab47cc67ad40b20191acadc32fc8cc61d30ec` reproduced all three parent/local admission scenarios, including `commit() === true`, one persisted callback and one obsolete producer execution.

### RED → GREEN

Added three public context regressions **before** production changes, including a matrix of phase/parent-health/parent-phase, a host update boundary, and producer-side reentry. Against the old code, **38/41** suite tests passed; all **three added tests failed for the intended violations**.

The source fix introduces a local `#stillOwnGeneration(epoch, generation)` which checks:
- active/read-write state and captured local epoch/generation;
- the **current committed** generation through the configured host function;
- the local state once more after that function (it can itself reenter).

Applied this to ordinary `updateData` before and after the producer, `DataTask.commit` after parent/phase checks, and inside the task's actual host `updateData` callback before and after the producer. Generation supersession closes/aborts the task, and no producer runs when the invalidation is detected before invocation. A producer that itself invalidates generation triggers `AbortError` before its result is returned to the host transaction.

Commits:
- [RED settlement/generation regressions](https://github.com/Shelamkoff/editor/commit/b0f5c3856f194c476d6b38f9d4b4d6ba6848aa35)
- [Production generation authority correction](https://github.com/Shelamkoff/editor/commit/cff78b06db561bab8aa4524e50d0f995ba9ba48d)

## Finding SCOPE-ABORT-FAILURE-1 (P2)

### Reproduction

`#cancelTasks()` marked tasks closed and removed them from the local Set, but then called their `AbortController.abort()` without isolating synchronous errors. A throwing AbortController could therefore stop the loop before other task cancellations and before recursive child-scope revocation. Likewise, `DataTask.cancel()` could throw despite the task already being logically retired; on a producer failure the failing abort could mask the original producer/validation exception.

A controlled AbortController that throws *before* updating `signal.aborted` demonstrated:

- `parent.revoke()` threw and left a child `state === 'active'` and able to read its data.
- `parent.setReadOnly(true)` threw before its read-only restriction propagated to children.

These scenarios test failure containment at the source-level abort-provider boundary; **native browser AbortController normally does not throw on ordinary abort**.

### RED → GREEN

Committed three regressions:
1. One failing task abort must not skip cancellation of another independent task, revocation of child/grandchild scopes, or rejection of the retired task's later commit.
2. A failed task abort cannot stop inherited read-only propagation and a read-only round trip cannot reactivate an older task.
3. A failed task cancellation cannot mask an original `TypeError` from the producer, or make `task.cancel()` throw after logical retirement.

The previous source passed **41/44** suite tests; all three new tests failed as intended. Fixed the direct `#cancelTasks`, `close(true)` and provisional task-acquisition abort paths by containing abort-provider exceptions **after irrevocably detaching the task lease**, allowing independent cleanup and original failures to proceed. The task's public closed state remains authoritative even if an abnormal controller does not mark its signal aborted.

Commits:
- [RED abort/child-lifetime tests](https://github.com/Shelamkoff/editor/commit/e36938fbc1e97ad98e5fcabb341c22224c40c4c2)
- [Production failure containment](https://github.com/Shelamkoff/editor/commit/48e027b0758ce7a2ae412cf7c5b51caf5338a009)

## Finding SCOPE-HOST-SIGNAL-ATTACH-1 (P2)

### Reproduction

`configure({signal})` previously did a single `if (signal.aborted)` check before calling a supplied `signal.addEventListener('abort', ...)`. A host signal which became aborted **inside subscription** before installing its callback could silently leave the scope active forever. When `addEventListener` or even the `aborted` getter threw, configure failed without revoking the previous instance authority or child scopes.

### RED → GREEN

Two more public scope tests were added:
1. Subscription callback marks its signal aborted but never emits an event to a late subscriber. Parent and children must be revoked; active child `getData()` cannot expose author data.
2. A broken abort-listener registration or throwing signal-status getter must fail closed, revoking the scope and descendants even though `configure` throws.

Both failed against the previous source (**44/46** pass count). The final correction rechecks `signal.aborted` immediately after subscribing; if either status inspection or listener setup throws, it first calls `revoke()` (including descendants) and rethrows the original installation error.

Commits:
- [RED abort-signal attachment tests](https://github.com/Shelamkoff/editor/commit/a78a6d4e11c4c55194f833fc77b4253316ab1343)
- [Production signal attachment correction](https://github.com/Shelamkoff/editor/commit/a0e7304972188ffae53ade860465257cb980eb48)

## Focused verification summary

| Stage | Suite results |
| --- | ---: |
| Previous production + three new settlement tests | **38/41** (three intended RED failures) |
| First fix | **41/41** |
| Three new abort-failure cases before fix | **41/44** (three intended RED failures) |
| Abort-failure correction | **44/44** |
| Two new signal-registration tests before fix | **44/46** (two intended RED failures) |
| All three production corrections | **46/46 passed** |

The full current bodies of both `InstanceScope` test files and the actual production `shared/jsonData.js`, `shared/cloneEditorData.js`, `core/InstanceScope.js` sources were executed using an isolated JavaScript/V8 harness with Node assertion/test adapters and a controlled AbortController/DOMException implementation. Tests temporarily substituted a deliberately throwing AbortController **only while acquiring faulty task instances**, restoring the global constructor immediately afterward. No actual Node test runner, Chromium DOM or installed package was exercised in the current environment.

Current verified source blobs:
- `core/InstanceScope.js`: `51e634c99d523228f2caf26504b895022aa93112`
- `core/InstanceScope.test.js`: `a7fda258db8b2b9a7cc7d8d902172ac34c22f97d`

## Remaining native and browser release gates

From a complete installed checkout on the final branch:

```sh
npm ci
node --test core/InstanceScope.test.js core/InstanceScope.history-continuation.test.js
node --test core/BlockReconciler.test.js core/TransactionEngine.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
```

In a real browser, exercise concurrent block/inline DataTasks, document render/replacement and undo/redo, mode epoch transitions, and all revoke paths. Confirm that no stale producer can persist an old candidate, that native AbortSignal delivery is reliable and that the current projection/selection/history remain coherent when abort handlers run during editor teardown. Full v1/v2 per-feature behavioral parity and package consumer tests remain separate work.

**Outcome:** three newly reproduced scope authority/teardown defects corrected via RED/GREEN tests, eight new focused test bodies, and **46/46** source-backed current tests passing. This does **not** certify full Rector v2 release readiness or browser/TypeScript acceptance.
