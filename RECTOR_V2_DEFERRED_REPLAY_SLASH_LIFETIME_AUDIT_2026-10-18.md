# Rector v2 — deferred history restore and Slash lifetime audit

**Date:** 2026-10-18  
**Working branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `394af74e25a94c255bd37eee6f7cea3b6f4a76b9`  
**Scope:** core transaction ownership, Undo/Redo queued focus restoration, terminal Slash command input callbacks. No legacy-version runtime code or persistent schema changes.

## H-LIFE-1 — Undo/Redo selection microtask ran after DocumentRuntime.destroy() (P2)

`TransactionEngine.#replayObserved()` restores the logical selection immediately after committing Undo/Redo. It also schedules a guarded microtask to restore it once more after browser projection settles. The guard checked history engine health/phase and document revision/generation and whether the caret was changed; it did **not** test whether its owning editor was destroyed.

`DocumentRuntime.destroy()` previously destroyed the projector but did not retire the `TransactionEngine`. As a result the queued callback could still invoke a caller-supplied `selection.restore()` after teardown, potentially reacquiring focus on an unmounted document or causing a cross-editor interference. Even the newer `SelectionController` guards did not protect external selection-port implementations.

**RED demonstrated:** the unmodified actual `TransactionEngine`, real `DocumentStore` and `HistoryStore` classes were run in V8. A committed edit followed by Undo, then owner teardown before the queued microtask, produced **one restoration after teardown**, in addition to the correct immediate restoration.

**Fix:**
1. Add idempotent `TransactionEngine.destroy()` to revoke engine mutation/replay authority.
2. Gate the queued replay selection callback on its terminal flag; `canUndo`/`canRedo` return false after teardown.
3. Call `this.#engine?.destroy()` inside `DocumentRuntime.destroy()` **before** releasing projector and clipboard handles. This also covers teardown reentered from an Undo commit event.

No committed model, history cursor, or synchronous Undo selection behavior was changed.

- [Transaction engine regression tests](https://github.com/Shelamkoff/editor/commit/428b7ac23538ded1bc74173ad7013ca4829e65d0) — `core/TransactionEngine.replay-lifetime.test.js`.
- [Runtime owner regression tests](https://github.com/Shelamkoff/editor/commit/86db54213bac6c489cf53679fc21d7471d0eb67a) — `core/DocumentRuntime.test.js`.
- [Engine fix](https://github.com/Shelamkoff/editor/commit/285913ccd7ffafadd70263fc2efc377215c5feeb).
- [Runtime lifecycle integration](https://github.com/Shelamkoff/editor/commit/bab5df22d2c466028e2cf1b305079ff0030ac23e).

**Focused GREEN:** **35/35** registered test bodies from `TransactionEngine.test.js`, `TransactionEngine.history-continuation.test.js`, and the new `TransactionEngine.replay-lifetime.test.js` passed with the actual final engine, DocumentStore, HistoryStore, PersistentBlockMap, clone/JSON and synchronous-result sources. The two added `DocumentRuntime.test.js` scenarios are **committed but not run in the installed whole-project Node runner**.

## S-LIFE-1 — stale Slash input callback accessed detached editor fields (P2)

`SlashCommandController.destroy()` detached its root listeners using `AbortSignal` and removed the menu. This is insufficient for an already-dispatched event whose callback has been captured by the browser or a host integration. In `#onInput()`, the controller read `runtime.readOnly`, `reconciler.resolveEditableTarget()` and the selection without checking whether its own terminal signal was aborted.

**RED demonstrated:** a retained `input` callback invoked after `destroy()` reached a deliberately retired reconciler and threw while attempting to inspect an old editing field.

**Fix:** early-return in the root `input` and `keydown` handlers whenever the controller signal is aborted. Make destroy idempotent and abort before final menu removal; existing `#sessionIsCurrent()` and queued focus guards still enforce generation/revision/read-only.

- [Regression tests](https://github.com/Shelamkoff/editor/commit/bf129eef0fea8c44f48a0bfc086834d7252b5106) — `core/SlashCommandController.retired.test.js`.
- [Production fix](https://github.com/Shelamkoff/editor/commit/87d52a4ebb5e69dfd2d0ca357c3ba90d2d0552ba).

**Focused GREEN:** **2/2** new Slash tests passed under controlled V8 execution of its real production class. A negative control verifies retained keyboard callbacks do not consume browser keys after teardown.

## Validation performed and limits

- Exact-source V8 execution: **35/35 TransactionEngine** tests and **2/2 Slash** tests passed after fixes.
- Pre-fix red confirmation for queued focus and retained Slash `input`; no need to modify historical v1 source or add compatibility.
- All six affected JS source/test files parsed in V8 after static ESM import adaptation.
- Current SHA-specific source and tests were obtained through the authenticated GitHub connector and all changes committed directly into the existing refactor branch.

**Not executed in this environment:** `npm ci`, full native `node --test`, the newly added direct `DocumentRuntime.test.js` test bodies in a complete imported module graph, TypeScript typecheck, Playwright/Chromium with real focus and Clipboard/IME, package/renderer smoke tests, or exhaustive v1/v2 gesture comparison. Passing V8 fixtures is not a release/stability certification.

### Mandatory checkout acceptance

```sh
npm ci
node --test core/TransactionEngine.replay-lifetime.test.js core/TransactionEngine.test.js core/TransactionEngine.history-continuation.test.js core/DocumentRuntime.test.js core/SlashCommandController.retired.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Key native follow-ups: author Undo immediately followed by `destroy()` before microtasks; teardown from a `transaction:committed` Undo listener; multiple editors sharing one document with independent selections; dispatching captured Slash input/keydown handlers after editor recreation; and verifying no detached caret focus, source mutation, or DOM resource retention.

**Result:** two confirmed terminal-lifecycle regressions fixed with narrow regression tests; overall Rector v2 stability and complete v1 behavioral parity remain subject to local acceptance.
