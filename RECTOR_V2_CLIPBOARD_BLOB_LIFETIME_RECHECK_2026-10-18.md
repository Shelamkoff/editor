# Rector v2 — Clipboard media resource lifetime, stale revisions and cleanup isolation

**Date:** 2026-10-18  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `d119d94167ed22…` (continued after the local Carousel video Paste parity implementation)  
**Behavioral reference:** v1 `master` (`5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`).

This pass checks the recently restored local-video `blob:` Paste ownership boundary and its behavior when the document changes while a file resolver is awaiting, or when resource revocation/error reporting fails. It uses the existing ClipboardController and versioned v2 Paste capability. No legacy runtime or compatibility layer is added.

## Confirmed C-BLOB-1 — later document commits did not revoke stale media Paste tasks (P2)

`ClipboardController.#beginAsync` captures the author document's `generation`, `revision` and selected range. When a later edit changes the revision, the async operation is no longer eligible to commit its result. Previously, `handleTransaction(event)` actively canceled the task only on Undo/Redo, document replacement/clear or removal of its anchor block. Ordinary edits to that block, or an unrelated block, invalidated the saved revision **without aborting the task**.

For a plugin that had already obtained `context.createObjectURL(file)` and then awaited a noncooperative resolver, the invalidated Paste retained an uncommitted temporary media resource indefinitely until either the resolver settled or the editor was destroyed. Merely rejecting at the final revision check was not sufficient resource cleanup.

**RED** on the exact pre-fix controller:
- Host `block.update` targeting the anchor retained the blob immediately after its revision changed.
- Host `block.update` targeting a different block retained the blob even though the same global revision guard made Paste stale.
- The synchronous onCommit event from the Paste transaction itself must **not** cancel its own URL lease; this negative control already passed.

**Fix:** a non-owning transaction event with committed changes immediately retires the pending async Paste task and revokes its uncommitted blob resources. Undo/Redo and document reset remain terminal even without an explicit change list. A narrow `#applyingPasteTask` token distinguishes the Paste command's own synchronous commit notification from other events. The previous redundant `#taskAnchorId` slot was removed. Existing new-task cancellation, read-only cancellation, selection/revision final checks and successful retained history resource ownership remain in place.

- [Focused regression tests](https://github.com/Shelamkoff/editor/commit/e059d0f2def441496351b0ce6fe85f9c4750fd68) — `core/ClipboardController.media-resource.test.js`
- [Production fix](https://github.com/Shelamkoff/editor/commit/2754a13cf4109c72e5c3158db9d161d6b4b3f3af) — `core/ClipboardController.js`

## Confirmed C-BLOB-2 — a failing diagnostic reporter could interrupt URL cleanup (P2)

The newly added resource ownership path already isolated exceptions from `URL.revokeObjectURL`, but immediately called the injected diagnostics sink from the catch block without isolating **that** secondary exception. If the first URL revocation failed and diagnostic reporting also threw, the remaining URLs were not revoked. The same fault could escape from an AbortSignal listener during cancellation.

**RED** on the exact pre-fix controller:
- Destruction with two committed resources and throwing first revoke + throwing `diagnostics.emit` escaped before releasing the second resource.
- Cancellation with two pending resources and the same injected failures escaped before fully retiring the task.

**Fix:** `#reportResourceReleaseError(error)` contains diagnostic submission failures so every independently owned URL is still attempted once, in both pending cancellation and committed editor teardown. No changed URI format or broader error policy.

- [Test-first cases](https://github.com/Shelamkoff/editor/commit/1f0565d8cffa5bebb423601ff27a7bb49329db56)
- [Complete diagnostic fixture correction](https://github.com/Shelamkoff/editor/commit/c47c331d9e53e72d1f6dd96a44cd53310364011f) — provides the existing `now/threshold/errorName` contract rather than failing for an unrelated fixture error
- [Production cleanup isolation](https://github.com/Shelamkoff/editor/commit/28c7946c834e7ae20be9704a1512ef9dd01ef82d)

## Focused verification

**20/20** selected checked-in test bodies passed against the exact updated `ClipboardController.js` source in a controlled V8 runtime with scoped AbortController, ClipboardEvent, URL and runtime/view adapters:
- All **12** tests in `core/ClipboardController.media-resource.test.js`, including native-video resource retention for history, no-op rejection, pending cancellation, commit failure, declined resolver, editor destruction during URL acquisition, post-commit observer failure, stale anchor/unrelated updates and failing URL-revoke/diagnostic sinks.
- **8** selected asynchronous task/Paste-route tests from `core/ClipboardController.test.js`.
- Both C-BLOB-1 positive regressions and both C-BLOB-2 failures were demonstrated on the original source before their fixes.

The final controller, focused test files, Carousel plugin/test and browser regression were parsed by V8 after adapting static ESM imports. `tests/browser/native-plugin-media.js` requires its top-level `await` to be wrapped in an async function for this isolated **syntax-only** inspection; it passed after doing so.

These controlled executions do **not** establish the complete project `node --test`, TypeScript `typecheck`, native browser paste with an OS-provided FileList, Chrome/Firefox/WebKit gesture parity, installed package exports or a memory/heap acceptance gate. The container cannot resolve GitHub for a complete checkout, so GitHub changes were made and verified using the authenticated repository connection.

## Local release gate

```sh
npm ci
node --test core/ClipboardController.media-resource.test.js core/ClipboardController.test.js plugins/carousel/video-paste-parity.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In a native browser, exercise local video Paste while a second author edit is committed before resolver completion; type changes and deletion of the Paste anchor; cancellation on a read-only transition; two media resources with one release failure; Undo/Redo preserving playable `blob:` resources; document destruction releasing URLs even if the final observer throws; and heavy repeated paste/cancel/delete with heap snapshot checks.

**Conclusion:** two confirmed lifecycle regressions repaired while preserving Undo/Redo ownership of successfully committed video Paste. Project-wide release readiness and exhaustive v1/v2 parity remain unverified.
