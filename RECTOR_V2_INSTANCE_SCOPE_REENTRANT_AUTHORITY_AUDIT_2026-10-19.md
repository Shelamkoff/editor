# Rector v2 — reentrant InstanceScope authority and DataTask lifecycle audit

**Date:** 2026-10-19  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `50f02828d96d56edfb2ef5309f1fc93d6e580003`  
**Production owner:** `core/InstanceScope.js`  
**Regression suite:** `core/InstanceScope.test.js`

## Contract and approach

The active `RECTOR_V2_REMEDIATION_SPEC.md` §9.2–§9.3 requires scope authority to be revoked on occurrence teardown, read-only transition and parent revocation, with inactive callbacks unable to author persisted data. An active DataTask must capture generation and interaction epoch, abort when the owner is retired, and never invoke stale producers. Project `.agents/skills/tdd/SKILL.md` prescribes RED → GREEN at the owning public boundary. The observed methods are `createAuthority().getData()`, `createAuthority().updateData()`, `createAuthority().createId()`, `createAuthority().beginTask()`, `DataTask.commit()` and `InstanceScope.runMutation()`, not private field layout.

Each change was applied to the current GitHub blob SHA, directly on the refactor branch, without overwriting other work.

## Finding SCOPE-AUTH-1 — admission callbacks returned obsolete task and mutation permissions (P1/P2)

`#beginTask()` checked active/healthy/readOnly/phase and then called injected `currentRevision()` before registering its new task. If that callback synchronously revoked the scope or parent, or performed a read-only true→false round trip, `beginTask()` still returned a task with a non-aborted signal. `#canMutate()` likewise checked the scope *before* injected health/phase/parent callback calls; a callback that revoked the scope but returned `ready`/`idle` let `runMutation()` and `updateData()` proceed.

`assertReadable()` had the same pre-observer-only check: a health callback could revoke the scope while returning `ready`, and `getData()` would continue.

**RED:** three new `InstanceScope` test cases reproduced stale task issuance, stale mutation dispatch and a data read after synchronous revocation.

**Fix:** introduce `#stillOwnInteraction(epoch,generation)` and recheck owner state, generation and monotonic interaction epoch after every injected admission callback; fail inactive `beginTask()` with `AbortError`, while `runMutation()` correctly returns false. `assertReadable()` rechecks revocation and epoch after health observation.

- [RED tests `721bc17c`](https://github.com/Shelamkoff/editor/commit/721bc17cf57cdf159aadd933a5de8cf0d4a87d1a)
- [Production fix `0c15e354`](https://github.com/Shelamkoff/editor/commit/0c15e354e85973bff4cb6448ecc59ab64d93012a)

## Finding SCOPE-AUTH-2 — DataTask.commit and instance reads/IDs were not rechecked after callbacks (P1/P2)

A previously issued task performed some owner checks before calling injected `currentGeneration()` and `phase()`; either callback could revoke the task and still return the old expected value. `DataTask.commit()` then invoked the author producer and could report success despite `task.signal.aborted === true`.

Likewise, `getData()` and `createId()` observed ownership only *before* calling extension-supplied `readData()` or `createId()`. Their callbacks could destroy the editor or complete a read-only round trip before returning the old result.

**RED:** added two focused tests; against the previous code both failed for expected stale task/read behavior. A direct independent source witness showed `task.commit()` returning true and calling the producer after an injected generation/phase callback revoked its owner; `getData()` and `createId()` returned values after teardown.

**Fix:** recheck task state, AbortSignal, scope epoch and generation after injected generation/parent/phase callbacks; recheck read and ID authority after the full snapshot/allocator operation.

- [RED tests `661aa3a8`](https://github.com/Shelamkoff/editor/commit/661aa3a86eb4403cfdad1e5bfaf5a1b702cefe86)
- [Production fix `64904c4a`](https://github.com/Shelamkoff/editor/commit/64904c4a92615a95c3542daf7236b32cdbded543)

## Finding SCOPE-AUTH-3 — snapshots and producers could publish after revocation (P1/P2)

`createAuthority().updateData()` passed `current => producer(snapshot(current))` directly into the owning update adapter. A getter on current author data can revoke the scope during `snapshot(current)` but still allow the extension producer and its result to be committed. A producer that itself triggered a read-only round trip could similarly return a stale patch.

The one-shot task path contained the same unchecked `current => producer(snapshot(current))` continuation, even if `DataTask.commit()` had been authorized on entry.

**RED:** two tests for host updates and one test covering both async-task snapshot/producers failed against the unfixed source: stale producers ran and/or their author data crossed the persistence boundary.

**Fix:** snapshot the owner epoch/generation before the host update and check again before and after invoking its producer. A retired result now throws `AbortError` so the owning transaction rejects the patch. Do the same within the task's one-shot producer callback, additionally checking task closed/aborted state; task failure revokes its lease. Healthy existing update and task semantics are preserved.

- [Host update RED `cff6b75f`](https://github.com/Shelamkoff/editor/commit/cff6b75fb0d79d6013cb1cf8d7a9915b5f775f3d)
- [Task update RED `91e0fade`](https://github.com/Shelamkoff/editor/commit/91e0fadea96c84edc0921005a9a51d3f77748ec0)
- [Production fix `39d0a88d`](https://github.com/Shelamkoff/editor/commit/39d0a88d2308439566fe2f021c609e2e5cdb71d9)

## Tests and limits

| Verification | Result |
| --- | --- |
| Regression tests added in this pass | **8** |
| New RED witnesses against pre-fix source | Confirmed at the relevant stages |
| Full fetched `core/InstanceScope.test.js` test body execution | **25/25 passed**, **14,545 assertions** |
| Source under test | Actual latest `InstanceScope.js` and `shared/jsonData.js` clone logic |
| Execution environment | Strict isolated V8 with synthetic `AbortController`, assert/test adapters |
| Full Node.js `node --test` | **Not executed** |
| TypeScript, actual Chromium and package-consumer gates | **Not executed** |
| Full Rector v1/v2 behavioral parity | **Not established** |

A first isolated run evaluated tests without strict mode and therefore incorrectly failed the pre-existing frozen-data-mutation test; rerunning in strict mode (equivalent to ES module strict semantics) passed the full original and new suite. Do not treat that harness artifact as a production failure.

Required local acceptance against final refactor HEAD:

```sh
npm ci
node --test core/InstanceScope.test.js core/BlockReconciler.test.js core/InlineToolMounts.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

For browser/plug-in integration, construct a plugin task while its owner is replaced or made read-only, trigger a parent revoke during a synchronous callback, and confirm `DataTask.commit()` returns false or raises its specified `AbortError` without invoking stale producers. Confirm healthy one-shot tasks still commit once and undo/redo remain correct.

## Conclusion

The audit corrected concrete authority/ownership defects in the common instance-scope runtime and added failing-first regressions. It does **not** certify all plugins, clipboard/native input, Chromium behavior, or full functional parity with Rector v1. Those require acceptance against the final SHA.
