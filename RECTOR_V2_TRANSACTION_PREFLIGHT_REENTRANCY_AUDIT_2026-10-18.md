# Rector v2 — transaction preflight, teardown and diagnostic reentrancy audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `8c1124abbae2f7680cef1ddb37a144220c2c4910`  
**Scope:** `core/TransactionEngine.js`, `core/TransactionEngine.test.js`. No public API aliases, persisted format changes, migration paths or unrelated source modifications.

## Architecture and expected behavior

The v2 remediation specification §5 requires one canonical draft/history commit per author action; callbacks from projection and observation phases must not synchronously reenter authoring, and a destroyed editor must not commit new work. Observer/diagnostic failures cannot invalidate an already committed result. `TransactionEngine` also underlies Undo/Redo, so callbacks invoked while acquiring its logical selection and command metadata need explicit ownership.

This pass looked for *observably incorrect canonical history, mutation count, model state or transaction return values*. Every newly added unit regression was verified **RED** on the exact previous production class source before the corresponding fix.

## Finding E1 — selection capture entered external authoring while phase was still idle (P1)

Both `#executeOuter()` and `#replayObserved()` called `#captureSelection()` before entering a non-idle engine phase. A caller-supplied selection port could author a new transaction during the pre-command capture, or mutate history immediately before Undo/Redo planned its replay. The outer command then operated on a changed store/history cursor.

**RED:** Three real-engine tests demonstrated unexpected nested authoring before a normal command and during Undo/Redo. In the Undo case, the new command changed what was on the top of the replay stack.

**Fix:** `#captureSelection()` claims `capturing-selection` temporarily **only** when invoked from idle. Any reentrant command, history edit or clearHistory is rejected before its operation runs, and the prior phase is restored in `finally`. Post-commit/projected selection capture preserves its existing active phase.

- [Red regressions `5c2dd3d`](https://github.com/Shelamkoff/editor/commit/5c2dd3da46c61c8f62b83e4814a373a98c4ae853)
- [Fix `a55cf73`](https://github.com/Shelamkoff/editor/commit/a55cf739a26b527cfe39df5cf2d2a84e64c4181c)

## Finding E2 — destroyed engine could continue authoring and projection (P1)

A terminal `engine.destroy()` invoked from a selection callback, projected operation or `selectionAfter()` could retire the engine while its existing outer command still advanced toward canonical history commit. Prior `#assertHealthy()` calls checked only the *entry* state.

**RED:** Four real-engine tests: direct destruction during command selection capture, destruction before Undo replay, destruction during projector apply and destruction while preparing selectionAfter. Each showed a commit/replay or a missing required rejection on the original implementation.

**Fix:** Revalidate engine health after preflight selection capture, after `prepareProjection()`, after projection `apply()`, and after selectionAfter preparation. The existing rollback/recover path handles a pre-commit abort. Already committed actions remain committed and host observer failures remain isolated.

- [Red regressions `0d7d809`](https://github.com/Shelamkoff/editor/commit/0d7d809f764a8624c59421a2a8b3058f1f9fca48)
- [Fix `b3e3ed9`](https://github.com/Shelamkoff/editor/commit/b3e3ed98c23217b2ad9589a28dc8278f69771e54)

## Finding E3 — transaction metadata getters could author nested commands and change values between reads (P2)

`normalizeMetadata()` read caller-owned `name` more than once and ran before any engine phase guard. Its accessor could insert an unrelated command before the outer draft, and a volatile getter could produce inconsistent command/history/event names. `continuation` and optional metadata fields had similar repeated read surfaces.

**RED:** Two actual-class tests demonstrated a metadata getter authoring a hidden second history step and an unstable name getter read repeatedly rather than once.

**Fix:** Introduce `preparing-metadata` ownership around metadata normalization, recheck engine health afterward, and observe each supported metadata property exactly once. Nested `continuation` token members are captured once before validating and copying. No arbitrary extra metadata properties are traversed.

- [Red regressions `391244e`](https://github.com/Shelamkoff/editor/commit/391244e3daa40a5bda4e010a7e1eb9d395e0eaed)
- [Fix `1b1e6b0`](https://github.com/Shelamkoff/editor/commit/1b1e6b06aef3b4c23d0206008170ec06d0328e52)

## Finding E4 — a command could succeed or invoke projector preparation after self-destruction (P1)

Even after guarding projection callbacks, the user-supplied command `operation(context)` itself could synchronously call `engine.destroy()`. The engine still called the projector for changed draft data, or returned a successful no-op result when no changes were produced.

**RED:** Two real-engine tests detected projector preparation after destruction, and a false-success result for a no-op command whose owner had been destroyed.

**Fix:** Recheck health immediately after the synchronous operation settles and before examining draft changes or preparing a projection. The ordinary existing catch resets current draft/phase and rejects. No post-destroy projector callbacks run.

- [Red regressions `c2227a6`](https://github.com/Shelamkoff/editor/commit/c2227a6318d9ed1a0851847c3b8c71ff587d954e)
- [Fix `56258bc`](https://github.com/Shelamkoff/editor/commit/56258bc2260079229218e17d8ff451ad9ebe79a6)

## Finding E5 — diagnostic clock and sink callbacks had mutation authority or could override a committed result (P2)

`#observeCommand()` called the diagnostic sink's `now()` while the engine was idle, and emitted `command.slow` during `finally` after the transaction phase returned to idle. Either callback could author another document command. If the sink threw while emitting slow telemetry, that exception replaced the successful transaction return **after** its canonical model/history commit.

**RED:** Three actual-class tests reproduced a nested write from the diagnostic clock, a second synchronous history step from the slow-operation sink, and an exception replacing an already committed result.

**Fix:** Centralize best-effort telemetry under a temporary `diagnostic-observation` phase, including asynchronous observer-error reporting. Ignore sink faults, never let metrics callbacks acquire authoring authority, and recheck engine health if the initial clock callback explicitly destroyed the owner.

- [Red regressions `1d557cf`](https://github.com/Shelamkoff/editor/commit/1d557cf452c7b1d719a8225c2e96e1a53e344ccf)
- [Fix `cb8ede9`](https://github.com/Shelamkoff/editor/commit/cb8ede9cfd25b4a2e45d8f332f5519cfaaeaabbf)

## Verification ledger

| Coverage | Count |
| --- | ---: |
| New regression cases in this pass | **14** |
| Existing checked-in TransactionEngine test bodies before pass | 31 |
| **Total checked-in TransactionEngine test bodies executed** | **45** |
| **Passing on final real-class source** | **45/45** |

Tests were evaluated with the actual retrieved current `TransactionEngine.js`, `DocumentStore.js`, `HistoryStore.js`, `PersistentBlockMap.js`, `shared/jsonData.js`, `shared/synchronousResult.js` and `shared/invokeObserver.js` inside an isolated V8 executor with a minimal microtask adapter. Both unit source and production source were freshly retrieved after fixes. All 14 new tests demonstrated RED failures on appropriate pre-fix revisions. This is **not** a full `node --test` invocation from the repository checkout.

## Remaining acceptance

A clean local checkout at the **final branch HEAD** still needs:

```sh
npm ci
node --test core/TransactionEngine.test.js core/DocumentRuntime.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Real Chrome integration should check that selection callbacks cannot introduce a second block edit during initial native input or Undo/Redo, plugin callbacks cannot resurrect a destroyed editor, and diagnostics/listeners do not alter canonical history or emit unhandled rejections. Compare v1/v2 expected gestures independently of old internal API names.

**Conclusion:** Five confirmed transactional ownership groups are corrected with deterministic source-level red/green proof. Full-library stability and complete browser-verified v1 parity are not yet certified.
