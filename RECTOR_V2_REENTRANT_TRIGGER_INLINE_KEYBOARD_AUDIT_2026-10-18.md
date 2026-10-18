# Rector v2 — reentrant trigger, inline preparation and keyboard ownership audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `e3beed8fdfe9047f4bd2af7d573be1e84195281a`  
**Scope:** lifecycle and same-stack reentrancy around `InlineTriggerController`, `InlineCommandController` and `KeyboardRouter`. Follow-up to the typed inline-pattern parity audit. Other agents' unrelated code was not overwritten.

## Contract

A user event may call an application/plugin callback that synchronously destroys the editor, changes control mode or reenters a trigger query. A retired event must not access detached fields or consume keyboard input. A nested query may acquire a successor session, but the older invocation must not publish it again. Prepared inline data cannot authorize a new canonical transaction once the preparing callback has retired or changed its runtime owner. A canonical transaction already committed before teardown remains successful.

These are implementation-lifetime invariants, not new public v1 APIs, old serialized document formats or compatibility shims. This pass did not establish full v1/v2 browser-gesture parity.

## Finding T1 — Trigger native routing and selection capture outlive their owner (P2)

`InlineTriggerController.#onInput()` checked its abort signal only at entry. `nativeInputRoute` is an externally provided callback and could synchronously destroy the trigger owner or read-only round-trip it. The old handler then accessed `reconciler.resolveEditableTarget()` and selection. `refresh()` likewise continued to `getEditableField` and even republished a query after `selection.capture()` destroyed the controller. During `#onKeyDown`, `#liveRange` or `onTriggerKeydown` could retire the owner, but the captured key was still delivered to the plugin or consumed.

Five actual-class regression cases failed on the pre-fix source (11/16 passed); after revalidation of terminal state and mode epoch at each externally callable boundary, **16/16 passed**.

- [Test-first regressions `e163b3a`](https://github.com/Shelamkoff/editor/commit/e163b3a7025334a666258b2dd272fe6fe9572e51)
- [Source fix `708dae6`](https://github.com/Shelamkoff/editor/commit/708dae6f0b9f3994a08c8ac1566a34d1a8ae318e)

## Finding T2 — Reentrant refresh double-publishes the same successor query (P2)

A nested `refresh()` invoked while the outer call was reading selection or mounted field state could publish its new query. The outer call resumed and published a second `onTriggerQuery` for that same session. The same error occurred if `nativeInputRoute` synchronously refreshed the trigger. These were deterministic duplicate side effects, even with unchanged document revision/control mode.

Three added actual-class tests failed against T1's already-fixed source (16/19 passed): capture, getEditableField and native-input routing each delivered `['query','query']` instead of `['query']`.

**Fix:** track both active owner and per-query session identity across selection capture, DOM lookup, native routing, text-before-caret and keydown range inspection. An outer invocation does not supersede a session published by an inner one. Read-only/abort checks remain independent and are evaluated before any further DOM access.

- [RED `1ad0ba1`](https://github.com/Shelamkoff/editor/commit/1ad0ba1e2a0547af1f55bdd288ca4835ab2c7030)
- [GREEN `e2243d4`](https://github.com/Shelamkoff/editor/commit/e2243d4ed192f1d379a784a52843ed8047f2e1d9)

## Finding I1 — Inline preparation may start a transaction after teardown (P2)

The v2 typed pattern/Paste matcher and insert factories run under `runtime.prepareExtensionValue()`. A host/plugin callback can synchronously destroy the editor during that operation, after which the previous implementation still invoked `runtime.interact()`. An actual runtime rejects it, but the originating control continued to attempt an invalid post-destroy authoring command.

Three tests failed on the pre-fix source (26/29 passed): typed pattern matcher teardown, Paste matcher teardown, and insertion factory teardown. After the fix, additional coverage verifies explicit insertion trailing-text getter teardown, trigger encode teardown, and control-mode round trip during typed preparation.

**Fix:** acquire the generation/mode-epoch lease before preparation and revalidate runtime health/editability and the lease before any canonical interaction. The existing post-commit caret guard remains unchanged. A retired preparation returns `false` rather than attempting to operate on detached runtime state.

- [RED tests `7900cef`](https://github.com/Shelamkoff/editor/commit/7900cefd08acb58825132e33af9b73363275b5bc)
- [Fix `fb9825c`](https://github.com/Shelamkoff/editor/commit/fb9825ca0033a7a768897a68235bd9a65bbdd89a)
- [Additional regression coverage `bd04eaf`](https://github.com/Shelamkoff/editor/commit/bd04eaff2a16818e1f59266044223c0c82434652)

## Finding K1 — Retired typed-pattern keyboard callback still claims Enter (P2)

`KeyboardRouter.handleKeydown()` called `InlineCommandController.commitTypedPattern()` before native default/split. If that command destroyed the owner during successful commit, or destroyed it then threw, the original handler still consumed the old `Enter`. If a callback changed `modeEpoch` and returned no match, the original key fell through to structural split.

Three actual-class tests initially failed (31/34 passed). Now the keyboard handler rechecks the abort signal, health/editability and original mode epoch before consuming an event or proceeding to another key action. An error is still reported without claiming a key whose owner has been retired.

- [RED `7007c6e`](https://github.com/Shelamkoff/editor/commit/7007c6e09a22bb8bffdc8072265da23999dadbd2)
- [GREEN `2fd233a`](https://github.com/Shelamkoff/editor/commit/2fd233a7f8a9c92d480741abb1ac6f9529f1def9)

## Verification ledger at final source

| Source-level suite | Checked-in test bodies | Passed |
| --- | ---: | ---: |
| `core/InlineTriggerController.test.js` | 19 | 19 |
| `core/InlineCommandController.test.js` | 32 | 32 |
| `core/KeyboardRouter.test.js` | 34 | 34 |
| **Total** | **85** | **85** |

Seventeen tests were added in this pass. Fourteen reproduced failures in the pre-fix source and three extended post-fix protection. For final verification, each test body executed against the **retrieved current real production class source** inside an isolated V8 environment, using a controlled small DOM, `AbortController`, scheduling and runtime adapters. Actual `synchronousResult`, `invokeObserver`, `textOffset` and `shortcutKey` implementations were evaluated where relevant. An isolated V8 run is narrower than a Node.js test-runner invocation or a real browser.

**Not run in this environment:** `npm ci`, `node --test` in an actual checkout, `npm test`, `npm run typecheck`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package`, `npm run docs:check`, Chrome native IME/selection/clipboard and full v1/v2 differential. The local git client cannot resolve `github.com`; authenticated GitHub connector calls were used for all exact-branch reads and direct writes. Existing historical green acceptance reports cannot be carried forward to this new HEAD without rerunning their gates.

## Required local acceptance

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

Add or run native/browser teardown scenarios for root `input` routing, trigger refresh during selection capture, nested query publication, typed Space/Enter matcher teardown and read-only mode changes. Inspect for single callback publication, no detached DOM reads and no stray default or structural keyboard mutations.

**Conclusion:** Four concrete ownership/reentrancy findings are resolved with targeted regression evidence. No claim of full-library stability or complete v1 behavioral parity is made until the complete native/type/package gates pass on the final HEAD.
