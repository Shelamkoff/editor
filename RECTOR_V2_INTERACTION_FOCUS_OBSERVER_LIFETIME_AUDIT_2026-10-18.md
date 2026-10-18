# Rector v2 — InteractionState focus and observer lifetime audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `ad7d2a5efbc45410db810f81118e985a4cda5b24`  
**Scope:** `core/InteractionState.js`, `core/InteractionState.test.js`, `core/createEditorRuntime.js`.

## Contract

A focus command belongs to the specific mounted editor generation, editing-control epoch and most recent author focus intent. It must not claim a block as current if a synchronous plugin/DOM focus callback has already accepted a newer focus or destroyed/remounted the underlying occurrence. Observing a change to the current block or selected IDs must not throw or reject into the command; such errors should be routed to the editor's content-free diagnostics.

These are v2 lifecycle and event rules; this change does not add a compatibility shim, a public extension API, document-format migration or new persisted fields.

## Finding I1 — stale older focus overrode an independently accepted newer block focus (P2)

`InteractionState.focus(id,target)` called `reconciler.focus()`, then unconditionally `setCurrent(id)` if that returned true. This is unsafe when the callback synchronously dispatches another focus or current-block decision. Comparing only `currentId` would also miss a newer focus on the *already-current* block.

**RED:** Two tests against the original retrieved production class showed that a nested `focus('b')` was overwritten by a still-unwinding `focus('a')`. This also occurred when `b` was already current when the nested focus occurred.

**Fix:** Introduce a monotonically changing current-block claim token incremented on explicit current-block claims, including same-ID claims, and when reconciliation changes the current block. Capture its value before invoking the plugin focus callback and refuse to reclaim a superseded owner. Return `false` if an event observer changes current block again while delivering the notification.

- [Initial RED cases `da2531f`](https://github.com/Shelamkoff/editor/commit/da2531fddd1de10f8ec607509196bab1d96787dd)
- [Fix `697602e`](https://github.com/Shelamkoff/editor/commit/697602ec16e9557301b4e3722ceb99b4774c5d33)

## Finding I2 — focus could claim a destroyed or re-mounted same-ID occurrence (P2)

A plugin focus callback could change model projection lifetime or destroy the editor before returning success. The stale `focus()` then set the former ID current even though its mounted occurrence no longer belonged to the old editor.

**RED:** Two original-class tests simulated a generation replacement with the *same* block ID, and terminal health changing to `destroyed` inside focus. Both were incorrectly accepted.

**Fix:** Revalidate document generation, current record membership and ready/non-terminal state after the callback. The result is not assumed successful merely because `reconciler.focus()` returned true. The real BlockReconciler separately guards mounted entry identity.

- [Generation/terminal RED cases `da2531f`](https://github.com/Shelamkoff/editor/commit/da2531fddd1de10f8ec607509196bab1d96787dd)
- [Fix `697602e`](https://github.com/Shelamkoff/editor/commit/697602ec16e9557301b4e3722ceb99b4774c5d33)

## Finding I3 — change observer errors either escaped the committed interaction or went undiagnosed (P2)

`InteractionState.#notify` invoked its `onChange` callback directly. A sync throw escaped `setCurrent()/focus()` even after committing the new current block; a rejecting thenable was not assimilated. After basic isolation, a separate audit found the errors were suppressed without reaching the normal editor diagnostic sink.

**RED:** Four cases were confirmed across the pre-fix revisions: a sync throw broke the committed current-block command; a rejecting thenable was not assimilated; and sync/async observer errors were not delivered to a supplied error callback.

**Fix:** Use the established `shared/invokeObserver` utility and accept an optional internal `onError` sink. `createEditorRuntime` wires this into `reportDiagnostic('command.failed','interaction.change',error)`; diagnostics remain content-free. A throwing diagnostic sink itself cannot break the command due to existing invokeObserver error containment.

- [Basic observer cases `da2531f`](https://github.com/Shelamkoff/editor/commit/da2531fddd1de10f8ec607509196bab1d96787dd)
- [Observer isolation `697602e`](https://github.com/Shelamkoff/editor/commit/697602ec16e9557301b4e3722ceb99b4774c5d33)
- [Missing diagnostic sink RED tests `500ae42`](https://github.com/Shelamkoff/editor/commit/500ae42912b7650089342e0d267f2e12f5189ddf)
- [Error sink fix `4975b79`](https://github.com/Shelamkoff/editor/commit/4975b79e4521bff7012f6fa0fe4b18d69611a21b)
- [Runtime diagnostic wiring `3ab19ec`](https://github.com/Shelamkoff/editor/commit/3ab19ec988956f26d967b03e65cdd9135f94a108)

## Finding I4 — read-only round trips could leave an outdated focus owner active (P2)

Even after generation and current-claim validation, `focus()` could accept a stale callback after the editor toggled read-only `false → true → false` without a model revision. Stable read-only focusing remains permitted where the underlying plugin accepts it; the bug is a *change* in control epoch during the operation.

**RED:** Two additional real-class tests reproduced an erroneously accepted focus after a mode-epoch round trip and after entering read-only while its focus callback was running. A third test for a reentrant `onChange` author focus was already green and retained as a guard.

**Fix:** Capture both `DocumentRuntime.modeEpoch` and requested `readOnly` before the callback, compare afterward and again before reporting success, without using a blanket read-only prohibition. The previous document-generation, mounted-block and current-claim checks remain.

- [Mode-epoch RED tests `431a3ee`](https://github.com/Shelamkoff/editor/commit/431a3eef60369c794bdb676669d1673f75ed243a)
- [Fix `95054ca`](https://github.com/Shelamkoff/editor/commit/95054ca6ca762eb58c94de2205849cfa030bd55b)

## Test ledger

| Suite | New tests | Final isolated result |
| --- | ---: | ---: |
| `core/InteractionState.test.js` | **12** | **12/12 passed** |

Before fixes, **10 of 12 tests** demonstrated the respective incorrect behavior on earlier production source revisions. The two control tests cover ordinary successful focus and newer focus delivered from an observer.

The test suite was created in this pass because no existing `core/InteractionState.test.js` was present. Every test was executed against the **exact current production InteractionState class source**, with the real `shared/invokeObserver.js` and a controlled runtime/reconciler fixture in V8. The final source and tests were read back from GitHub after the last change. The test uses native Promise microtasks inside V8, but this is **not** a Node.js `node --test` run against the full checkout and does not exercise browser focus/IME event behavior.

## Remaining verification and follow-up

From a clean checkout of the most recent branch HEAD, run:

```sh
npm ci
node --test core/InteractionState.test.js core/PublicEditorApi.test.js core/TransactionEngine.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

A real Chrome integration check should cover simultaneous pointer/keyboard focus and current-block changes, editing-mode round trips, same-ID remount, `EditorViewModel.focus` handoff to native caret selection and observer error diagnostics. For complete v1/v2 behavior parity, compare author-visible document state, active DOM editing host, logical/native caret, history and event order rather than reusing old v1 internal signatures.

**Conclusion:** Four focused interaction ownership and observer-diagnostic risks are corrected. The full library's stability and browser-verified v1 behavioral parity still require local Node/TypeScript/Chrome acceptance at final HEAD.
