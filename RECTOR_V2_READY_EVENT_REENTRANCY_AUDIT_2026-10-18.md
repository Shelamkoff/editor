# Rector v2 — editor:ready observer reentrancy and onReady lifetime

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Source entry HEAD:** `4ecb1d3ea72c4e6fa0c63dd47a817d8996b2898f`

## Scope

Inspected `core/createEditorRuntime.js` ready notification microtask and the lifecycle/browser harness at `tests/browser/lifecycle.js`. Checked the actual source before and after the change via the connected GitHub repository. No compatibility shims, unrelated module edits or v1 persistence changes.

## Finding READY-1 — onReady ran after ready observer destroyed the editor (P2)

The editor composition root schedules a ready microtask:

```js
if (destroyed) return
ready = true
emit('editor:ready')
invokeObserver(config.onReady, [editor], ...)
```

A host can attach a synchronous `editor.on('editor:ready', () => editor.destroy())` subscription after `createEditor()` returns and before the queued microtask executes. `editor.destroy()` marks the handle terminal, runs lifecycle cleanup, and publishes `editor:destroyed`. The original microtask nevertheless continued to `config.onReady` with that already-destroyed handle.

This violates the same owner-lifetime invariant enforced throughout delayed selection, clipboard and plugin callbacks. A consumer can otherwise receive a public handle in `onReady` even though `editor.isReady` was already reset to false by its own ready-event subscriber.

**Source-level witness (before fix):** extracted the exact queued callback from the branch source and modeled `emit('editor:ready')` with a synchronous teardown subscriber. It produced `['editor:ready', 'onReady']` while state was `destroyed: true, ready: false`.

**Fix:** after `emit('editor:ready')`, recheck `destroyed`; return immediately for a retired editor. Healthy editors retain the original order of `editor:ready` then `onReady`. A user-triggered destroy in `onReady` itself remains supported.

- [Browser regression commit `3e62eb0`](https://github.com/Shelamkoff/editor/commit/3e62eb0cde134333bab3e858f3b2db31362d8818)
- [Production fix `6977ba8`](https://github.com/Shelamkoff/editor/commit/6977ba80941ffbaf4e8780c77000394775219e84)

## Verification

- Re-read current `core/createEditorRuntime.js` and `tests/browser/lifecycle.js` after both commits.
- The exact final production ready microtask, evaluated with a synthetic synchronous event subscriber in isolated V8, produced `['editor:ready']` after teardown, and `['editor:ready', 'onReady']` on the healthy control path.
- `core/createEditorRuntime.js` syntax parsed under a JS evaluator after adapting ESM imports/`import.meta`; `tests/browser/lifecycle.js` parsed with an async-function parser for its top-level await.
- The added browser test covers the both the destroyed and healthy event-order paths and checks lifecycle resource snapshots after both.

**Not executed:** actual Chrome browser page, full `npm test`, `npm run typecheck`, build/package/types/docs gates, native OS composition, heap gate and full v1/v2 behavioral parity. A source-level witness is not a claim that actual `@shelamkoff/event-bus` integration was executed in this environment.

## Local acceptance

```sh
npm ci
node --test core/PublicEditorApi.test.js core/Diagnostics.test.js core/I18n.plural.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Readiness callbacks should be exercised in real Chromium with an `editor:ready` listener that destroys the current instance, a normal ready event, a retained user callback that tries to invoke API methods, and repeated construction/destruction on the same holder. Verify no destroyed-handle notification, leaked event listeners, dangling styles, or exceptions.

## Remaining audit boundary

The fix closes the identified synchronous ready-notification lifetime gap. It does not imply the full Rector library is stable or that all v1 author-visible gestures have reached parity; those require full local and native/browser acceptance on final HEAD.
