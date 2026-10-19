# Rector v2 — inline trigger query ownership and native-selection preflight

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `3c9c21b288886bd472da9257c60291c32574e30c`  
**Production:** `core/InlineTriggerController.js`  
**Regression tests:** `core/InlineTriggerController.test.js`

## Scope and invariant

Reviewed the active `RECTOR_V2_REMEDIATION_SPEC.md` §10.1–10.3 and the project's TDD skill. Inline trigger queries belong to one living editor/pointer-independent selection session. A native selectionchange or DOM/selection callback may synchronously retire that session and install a new one. A stale callback must never cancel the replacement, invoke a plugin with already stale text, or retain DOM listeners after failed construction. This work was scoped to the controller's public refresh/event interface; it did not introduce legacy v1 formats or unrelated changes.

Each file was fetched at the current branch HEAD and written using its current GitHub blob SHA. Changes were committed directly to the existing refactor branch. Other agents' work was not overwritten.

## Finding INL-TRIG-1 — old selectionchange canceled a successor query (P2)

Previously:
```js
#onSelectionChange() {
  if (this.#active && !this.#liveRange(this.#active)) this.#cancel()
}
```

The native field/selection read in `#liveRange` can call back into `retireFreshQueryForNativeEdit()` and `refresh()`, retiring the old session and creating a new one. If the old read returned an invalid field, the outer `#onSelectionChange()` canceled **whatever session was now active**, including the independent new query.

**RED:** a behavioral test uses the real controller and native selectionchange listener interface; a field resolver starts a successor query while the old selection is checked. The original controller canceled that successor, and the new test failed.

**Fix:** capture the exact active object and session before checking the old native selection, and retire only if that same owner/session remains current when validation finishes.

- [Failing-first regression `7848944a`](https://github.com/Shelamkoff/editor/commit/7848944a74733fb3417a0750b0d99fa77d187bf6)
- [Production fix `d0867eec`](https://github.com/Shelamkoff/editor/commit/d0867eec63a472d0e1e0c72ff700b90ebdde79d3)

## Finding INL-TRIG-2 — failed DOM listener registration left orphan handlers (P2)

The constructor installed six native event listeners before returning a destroyable controller. A host event registration adapter can throw after adding one listener. With no constructor-level rollback, earlier root/document listeners remained alive even though the editor never received a controller instance to destroy.

**RED:** registered listeners with their `AbortSignal`, injected failure after `keydown` listener installation, and confirmed that the old code retained handlers.

**Fix:** register the entire controller listener set in one provisional acquisition boundary; on failure, abort the controller signal and preserve the originating registration exception. This cleans listeners already installed on the root and owner document.

**Expanded regression:** the same behavioral test covers failures after registration of `keydown`, document `selectionchange`, and final root `focusout`, verifying no retained listeners at any stage.

- [Failing-first test `7848944a`](https://github.com/Shelamkoff/editor/commit/7848944a74733fb3417a0750b0d99fa77d187bf6)
- [Production fix `d0867eec`](https://github.com/Shelamkoff/editor/commit/d0867eec63a472d0e1e0c72ff700b90ebdde79d3)
- [Expanded listener cleanup checks `641e9486`](https://github.com/Shelamkoff/editor/commit/641e9486cec95e85b261562b9fa0509d5329714e)

## Finding INL-TRIG-3 — native caret changed between candidate and publication (P2)

`#refreshOwner()` discovers a trigger from a text-before-caret snapshot. `#publish()` then obtains another native selection/text snapshot, but previously accepted it even if the selection had become unavailable or the prefix no longer contained the discovered trigger/query. It could invoke `onTriggerQuery()` for a no-longer-current author gesture, creating an unusable or misleading popup.

**RED:** test performs two reads through the controller's real `refresh()` path. The second read either loses the native Selection or returns a different trigger prefix. The original code published the old query despite the change.

**Fix:** immediately before plugin query publication, require a non-null current prefix, the same captured `trigger + query` suffix, a still-connected field and live editor ownership. Abandon only the session that still belongs to that stale request. Normal matching queries and existing keydown/commit behavior remain unchanged.

- [Failing-first regression `7a689f12`](https://github.com/Shelamkoff/editor/commit/7a689f1244c5451a4697dc888c7c81792635a0b2)
- [Production fix `1c597108`](https://github.com/Shelamkoff/editor/commit/1c5971087e12fcbf9a98744e699e92bebacefbb4)

## Actual focused verification

Using the **same complete 30 test bodies** from `core/InlineTriggerController.test.js`, re-evaluated actual fetched controller source and its real `shared/synchronousResult.js` / `shared/invokeObserver.js` implementations in isolated V8:

| Revision | Cases passed | Assertions | Relevant failures |
| --- | ---: | ---: | --- |
| Starting source `60e2dae13686a0cc68cdf2c949d36efba9ba3213` | **27/30** | 165 | All three newly added regression tests failed for the expected ownership/observer behavior |
| Updated source `2ef217468c8206c2d54138d570a6f8421b8ef7ef` | **30/30** | **176** | None |

The test adapter supplied a controllable `AbortController`, Node-style `test` and `assert`, and microtask scheduling. No test body or assertion was suppressed. Changes to the existing test helper only exposed the document's `selectionchange` listener and allowed a controlled native selection read/prefix; existing test expectations remained unchanged.

**Limit:** isolated V8 execution is not the project's Node `node --test` runner or a real Chromium native Selection/IME test. No full typecheck, browser, integration or package gates were executed in this pass. This does not establish full Rector v1/v2 behavioral parity.

## Local acceptance gates pending

```sh
npm ci
node --test core/InlineTriggerController.test.js core/InlineCommandController.test.js core/KeyboardRouter.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In native Chromium: begin an inline trigger query, change native selection from a host callback during `selectionchange` and ensure the new current query is not retired by the older callback; move the caret between the two trigger scans and confirm no stale suggestions; verify clean destruction when an event listener registration fails and that IME composition/readonly/inline widget commit behavior remains intact.

## Conclusion

Three actual, separately reproduced inline trigger ownership gaps were corrected with failing-first regressions. The complete focused suite is green in the defined isolated environment. Library-wide stability, browser-native behavior and full v1/v2 parity remain unverified until the full local acceptance suite passes on the final HEAD.
