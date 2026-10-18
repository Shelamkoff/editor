# Rector v2 — clipboard terminal event and post-commit ownership audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `267dec94fd73d359cff820ad0695633f986387c9`  
**Scope:** synchronous Copy, Cut and Paste event ownership, post-commit presentation, callback reentrancy and read-only Copy. Other working areas were not modified.

## Finding C-CLIP-1 — Completed Paste can reconcile an editor destroyed by its commit observer (P2)

`ClipboardController.#replaceLocal` and multiline text Paste continued to schedule focus, reconcile the view and set current block after a successful `runtime.interact` even if its transaction observer had synchronously destroyed the editor. An aborted focus *microtask* is not sufficient: `#scheduleFocus` also reads the mounted view synchronously before scheduling.

**Red evidence:** two checked-in tests used the real ClipboardController class and a controlled `runtime.interact` that destroys the clipboard owner only **after** running the prepared selection callback, i.e. at the commit-observer boundary. Before the fix, each path read detached view state once.

**Fix:** an idempotent `#canPresent()` guard blocks immediate view/focus reads on retired owners. Recheck around follow-up view reconciliation and `setCurrent` in private, HTML, multiline, local and asynchronous Paste result paths. The canonical edit is not reverted or misreported.

- [Initial failing scenarios `9626ae4`](https://github.com/Shelamkoff/editor/commit/9626ae4cbfc6798c329bc14efcda3eff666ab62f)
- [Precise clipboard MIME fixture correction `fa8668d`](https://github.com/Shelamkoff/editor/commit/fa8668dfbd5f256d8eb068ee989cbab0d318dff8)
- [Post-commit fix `fa71d52`](https://github.com/Shelamkoff/editor/commit/fa71d5255d5406d92faaea20577f1867bb864be7)

## Finding C-CLIP-2 — Paste ingress reentrancy can claim a retired event (P2)

`#ownsEvent`, a subsequent `resolveEditableTarget`, cancellation of an older task, and clipboard `getData` are externally observable boundaries. They can synchronously destroy the editor. Previously `#onPaste` and `#applyPaste` continued through them, reading data and entering a new canonical edit despite a revoked clipboard owner.

**Red evidence:** four actual-class regression tests covered destruction during initial ownership lookup, second owner lookup, pending-task cancellation and clipboard plain-text data read. All four attempted a new canonical edit on the pre-fix source.

**Fix:** revalidate owner lifetime after each ingress boundary and after data reads/matching/preparation. A callback that has already destroyed the editor no longer suppresses the old native Paste event or attempts a new model mutation; a live owned error still prevents native fall-through.

- [Red tests `96474bc`](https://github.com/Shelamkoff/editor/commit/96474bc424a50d6056bc8dd0cd46aae3727c2d67)
- [Fix `803b316`](https://github.com/Shelamkoff/editor/commit/803b316e24c0de0c4fa68db7b08aca1f75959aea)

## Finding C-CLIP-3 — Completed Cut reconciles detached presentation (P2)

A successful whole-block `#mutateCut` could synchronously destroy the editor while publishing the canonical transaction. The old Cut continuation still cleared/reconciled UI state and changed the current block. A similar post-commit sequence existed for cross-block range and ordinary rich-text Cut.

**Red evidence:** a focused whole-block Cut test instrumented the old view and reproduced two stale presentation accesses after a single committed Cut. The owned event had already prevented browser-native deletion.

**Fix:** after successful Cut, validate current owner before cross-selection clearing, view reconciliation and current-block changes; recheck between potentially reentrant presentation calls. Guard the canonical Cut initiation against a synchronous clipboard-writer teardown.

- [Red test `b9a2667`](https://github.com/Shelamkoff/editor/commit/b9a2667b3a3d4a1c068c2c642981ce8405a09bcd)
- [Fix `725a87a`](https://github.com/Shelamkoff/editor/commit/725a87acae5493a4722d9da758d3da7294fa6a9d)

## Finding C-CLIP-4 — Copy and Cut read a revoked owner after event lookup (P2)

The first `#ownsEvent` lookup can run an externally supplied resolver that destroys the editor. The original Copy/Cut handlers immediately resolved the editing owner again and continued work with detached state.

**Red evidence:** two tests verified three total owner resolutions instead of one, despite synchronous destruction during the first lookup.

**Fix:** introduce a nonmutating `#isAlive()` check for Copy, and use the stronger editable `#canPresent()` for Cut/Paste. Importantly, **Copy remains available when the document is read-only**, while Cut and Paste still respect authoring restrictions.

- [Red cases `fdc2f94`](https://github.com/Shelamkoff/editor/commit/fdc2f940d12d124637f5a661550badaa191bde7f)
- [Fix `14ee35a`](https://github.com/Shelamkoff/editor/commit/14ee35a6d18b4ca887fd545f9bce73e2480e9ee0)

## Control regressions

Two additional cases were added as post-fix guards:

- Read-only Copy still emits the editor-owned structured whole-block clipboard fragment.
- Clipboard `setData` that synchronously destroys the controller cannot start an uncommitted whole-block Cut or clear the old author selection.

[Tests `1dbebac`](https://github.com/Shelamkoff/editor/commit/1dbebac41d3cda03b4d91b4fea17ca642d4a3c02).

## Focused verification

| Scenario group | New cases | Isolated final result |
| --- | ---: | --- |
| Local and multiline post-commit Paste | 2 | 2 passed |
| Paste ingress and clipboard getter retirement | 4 | 4 passed |
| Whole-block Cut post-commit presentation | 1 | 1 passed |
| Copy/Cut ingress retirement | 2 | 2 passed |
| Read-only Copy and Cut writer-retirement controls | 2 | 2 passed |
| **Total** | **11** | **11 passed** |

Nine newly added regressions failed on the relevant original real-class sources before correction. The final **11/11** result was executed using the exact fetched branch `ClipboardController.js`, `shared/editableFields.js`, `shared/synchronousResult.js` and `shared/textOffset.js` in an isolated V8 harness with controlled DOM, ClipboardData, AbortController and runtime boundaries. The clipboard fragment functions in that narrow focused execution used simple deterministic stubs; this is **not** a complete Node.js or native Chrome suite result.

## Required local and browser acceptance

```sh
npm ci
node --test core/ClipboardController.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Also exercise real Chrome Copy/Cut/Paste and Undo/Redo for local text, multiline rich text, whole-block selections, HTML import, private fragments and file/media resolvers. Include host commit observers that destroy the editor during Cut/Paste and native selection movement immediately after commit. Verify no detached DOM accesses, no duplicate authored transaction and no object-URL leak. V1/v2 behavioral parity remains subject to that native differential.

**Conclusion:** Four confirmed synchronous ownership findings were corrected. Source-level target checks passed, but whole-library stability and complete v1 behavioral parity are not yet established.
