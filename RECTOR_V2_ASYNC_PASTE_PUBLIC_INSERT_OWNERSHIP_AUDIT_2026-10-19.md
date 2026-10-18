# Rector v2 — async Paste preflight settlement and public insert focus ownership

**Date:** 2026-10-19  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `e111e5ae67fae69f46e6072aa36c7a22d8e8c7a4`

## Scope and safeguards

Reviewed actual current branch files `core/ClipboardController.js`, `core/ClipboardController.media-resource.test.js`, `core/PublicEditorApi.js`, `core/EditorViewModel.js`, `core/InteractionState.js` and the corresponding regression tests. Changes follow `.agents/skills/tdd/SKILL.md` and `.agents/skills/modern-javascript-patterns/SKILL.md` and the active remediation spec. GitHub contents-API writes used each file's freshly read blob SHA to avoid overwriting parallel work. No legacy v1 adapters or unrelated module modifications were introduced.

## Finding PASTE-ASYNC-1 — half-open staging task and unhandled post-resolver failure (P1/P2)

The asynchronous clipboard file path assigned `#task` before calling `this.#selection.capture()` and serializing the logical snapshot. If that fallible operation threw, the synchronous Paste handler caught and reported the error but did not abort the newly created task. The old task therefore stayed registered without a finalizer.

After a resolver produced a blob-backed result, final validation directly ran `JSON.stringify(this.#selection.capture())` and `runtime.get()` **outside** both the resolver catch and the commit catch. A throw here rejected the async IIFE. The previous `void asyncIIFE().finally(cleanup)` supplied no rejection handler: an error could become an unhandled Promise rejection even if provisional object URLs were subsequently released.

**Regression tests added:**

1. A synchronous staging selection failure must abort the half-open task lease, leave the document untouched and permit a new Paste.
2. A post-resolver selection failure must not author stale data, must revoke temporary blob URLs, must publish a contained `paste.failed` diagnostic while current, and must not block a later Paste.

**Fix:** guard the initial task snapshot in a try/catch, canceling only the still-current task when staging fails (never a newer reentrant task). Add an explicit catch to the asynchronous IIFE before the cleanup `finally`; suppress stale/cancelled errors, report current unexpected failures through the protected diagnostics boundary, and always settle the resource lease.

- [RED test commit `180fd274`](https://github.com/Shelamkoff/editor/commit/180fd2749aa5b57039724e01821f2aef31c217c2)
- [Fix commit `65cf9a20`](https://github.com/Shelamkoff/editor/commit/65cf9a208e7b6b87951fe1f9e7f653a0503b9529)

**Focused verification:** the new half-open task regression was run against the original `74a13b2b` source in isolated V8 and **failed for its intended contract** (task `signal.aborted === false` after staging failure). After the fix, 23/23 `ClipboardController.media-resource.test.js` test bodies passed, using actual fetched class source in an isolated V8 runner with synthetic DOM and `AbortController`. The other 50/50 `ClipboardController.test.js` test bodies also passed against actual support classes under the same limited runner. The old source's unhandled-rejection path after resolver completion is established by code inspection; this is **not** a claim of a complete Node.js RED run or real-browser clipboard acceptance.

## Finding PUBLIC-INSERT-1 — public insertion overwrote newer author focus (P2)

`EditorViewModel.insert()` already secured `InteractionState.explicitCurrentVersion` before authoring a block, and only selected the newly inserted block if no later explicit focus/current-block decision occurred. But `EditorBlocksApi.insert()` bypassed that guard by calling `DocumentRuntime.insert()`, then unconditionally calling `view.setCurrent(insertedId)` after reconciliation.

A synchronous post-commit observer could publish the newer current-block choice; the public insert continuation would overwrite that decision.

**RED reproduced against actual current classes:** a unit harness with real `EditorBlocksApi`, `EditorViewModel`, and `InteractionState` and a controlled canonical runtime fired `interaction.setCurrent('a')` inside the insertion commit. Before the production change, `blocks.insert()` left `currentId = 'inserted-1'` instead of `a`. The unchanged-focus control passed.

**Fix:** extend the internal `EditorViewModel.insert()` to accept the existing canonical insert options as an optional fifth argument; delegate public `blocks.insert()` through that guarded path, forwarding previously captured `tunes` and `inline`. A minimal public test fixture was updated to support the internal adapter. No public method signature or schema was changed.

- [RED test commit `b4d8e296`](https://github.com/Shelamkoff/editor/commit/b4d8e296b477767859080ca41b6176af393e2258)
- [ViewModel option forwarding `a7ffe317`](https://github.com/Shelamkoff/editor/commit/a7ffe317031ca5b18f88871ed853dce405542312)
- [Public API fix `5830107d`](https://github.com/Shelamkoff/editor/commit/5830107d99b3e8d8ca051a22af753b13cd9c5579)
- [Public fixture update `6c144f66`](https://github.com/Shelamkoff/editor/commit/6c144f667a201da01ba249ea362a1df6d39d97f4)

**Focused verification:** the two real-class tests went from **1 FAIL / 1 PASS** before the code fix to **2 PASS** after the fix in isolated V8. The failing assertion directly observed an unexpected `currentId`, not an implementation detail. Full `PublicEditorApi.test.js` and real-browser event integration are not yet verified.

## Local acceptance gates pending

```sh
npm ci
node --test core/ClipboardController.test.js core/ClipboardController.media-resource.test.js
node --test core/PublicEditorApi.test.js core/EditorViewModel.test.js core/InteractionState.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium: test file Paste with delayed resolver and a selection getter or DOM reconciliation callback that throws; check no unhandled rejections, successful later Paste, and exact blob URL cleanup. For public `blocks.insert()`, retain an event subscriber that chooses a newer current block during a synchronous commit/reconcile phase, and verify that this choice survives insert completion with `tunes`/`inline` unchanged.

## Limitations and conclusion

These are two independently identified ownership gaps, not proof that every Rector v2 subsystem is now stable or equivalent to v1. Full Node, TypeScript, package, Chrome/native IME and all user-visible v1/v2 interaction scenarios still require local acceptance on the final branch HEAD.
