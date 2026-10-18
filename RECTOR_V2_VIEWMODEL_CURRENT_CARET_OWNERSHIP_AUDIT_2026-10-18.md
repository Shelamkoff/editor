# Rector v2 — ViewModel current-block and caret ownership audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `7685de3ebbc6b212449014723ba26de58a74ae2a`  
**Scope:** `core/EditorViewModel.js`, internal `core/InteractionState.js` owner decision version, and `core/EditorViewModel.test.js`. No persistence, public EditorHandle signature or plugin contract changes.

## Contract

A controller may synchronously commit a document change, and its command continuation may subsequently reconcile and change the current block. If a newer explicit current-block decision was accepted during the command, that decision must take precedence over default insert/remove fallback. Automatic reconciliation after deleting the current block is *not* a newer author decision: in the absence of any explicit choice, the remove command should still focus its returned adjacent survivor.

A keyed caret target that no longer exists must return a failed operation **without first publishing a different current block**. After a plugin accepts focus, native caret restoration can itself trigger a newer selection, change read-only mode or retire the editor. A stale focus continuation must not report success.

These are internal lifecycle/focus invariants and source-level integration tests. The controlled callbacks below do **not** establish that every nested control mutation can originate in public `transaction:committed` listeners (which normally run under the engine's protected publishing phase).

## Finding V1 — insert overwrote a newer current-block decision (P2)

`EditorViewModel.insert()` always ran `interaction.setCurrent(insertedId)` after the canonical insertion and reconciliation. A synchronous callback during the insertion could already choose another current block, or explicitly reclaim the same original block without changing the ID. The continuation would overwrite the newer choice.

**RED:** A real `EditorViewModel` + `InteractionState` regression demonstrated an inserted block replacing an independently claimed `b` as current.

**Fix:** Track an internal, monotonically increasing `explicitCurrentVersion` for explicit `InteractionState.setCurrent` calls. Unlike the existing `currentClaimVersion`, it does not advance on automatic `reconcile()` fallback. The insert continuation claims its new block only when no newer explicit decision exists.

- [Initial RED tests `245c6f8`](https://github.com/Shelamkoff/editor/commit/245c6f86e4c99f22924505813c00b6b073ffbf56)
- [Explicit decision token `8f548e5`](https://github.com/Shelamkoff/editor/commit/8f548e52a8ba65bcb0ab821dd1a5cc521411b156)
- [ViewModel fix `fcddf16`](https://github.com/Shelamkoff/editor/commit/fcddf169be42531530e786c81ae46ee7ff680ca5)

## Finding V2 — removed-block fallback reclaimed a newer selection (P2)

`EditorViewModel.remove()` remembered whether the deleted block had been current, then called `interaction.setCurrent(nextId)` after the commit and reconciliation. If the commit callback had already chosen a different surviving block, the old removal overwrote that decision. Conversely, naively suppressing the fallback after every automatic reconcile would fail cases where the deleted current block's next sibling is not the document's first block.

**RED:** The old code overwrote an explicitly chosen `c` after removing `a`. Positive controls ensure removal of middle block `b` still selects its returned neighbor `c` when no explicit replacement was chosen.

**Fix:** Apply the returned-neighbor fallback only when the explicit current decision token has not advanced. A newer explicit choice of the automatically selected fallback itself also wins.

- [Red and positive controls `245c6f8`](https://github.com/Shelamkoff/editor/commit/245c6f86e4c99f22924505813c00b6b073ffbf56)
- [Fix `fcddf16`](https://github.com/Shelamkoff/editor/commit/fcddf169be42531530e786c81ae46ee7ff680ca5)
- [Same-ID intent controls `a99abd8`](https://github.com/Shelamkoff/editor/commit/a99abd80aac9e5c29d3b144f78ff4b2b4edcb955)

## Finding V3 — failed keyed caret claim changed current block (P2)

Previously `EditorViewModel.setCaret` called `interaction.setCurrent(blockId)` before delegating to `LogicalSelection.setCaret()`. If the addressed field was removed or unavailable, `LogicalSelection` returned false but the interaction had already claimed the destination and published a current-block event.

**RED:** The original ViewModel changed `currentId` to `b` even when its caret adapter refused the keyed target.

**Fix:** Attempt the native/logical caret first. Only after it accepts and the runtime generation, mode epoch, health and block membership still match does the ViewModel claim the associated current block. Respect any newer explicit decision already published from native focus/selection callbacks.

- [RED and successful caret controls `245c6f8`](https://github.com/Shelamkoff/editor/commit/245c6f86e4c99f22924505813c00b6b073ffbf56)
- [Fix `fcddf16`](https://github.com/Shelamkoff/editor/commit/fcddf169be42531530e786c81ae46ee7ff680ca5)
- [Real LogicalSelection missing-field integration `7ad517b`](https://github.com/Shelamkoff/editor/commit/7ad517babc96c763568d59a13c7347e4478d7baf)

## Finding V4 — focused caret callback could retire its owner yet report success (P2)

`EditorViewModel.focus(id,target)` delegated plugin focus to `InteractionState.focus` and then returned the boolean result from `selection.setCaret`. The later caret callback can accept a newer current-block choice, round-trip edit mode or destroy the editor. A true return value from the old selection call alone does not prove that the original focus still owns current author state.

**RED:** Three tests failed against the previous implementation: newer current-block selection, read-only epoch switch and editor destruction during keyed caret restoration.

**Fix:** Capture the latest explicit focus decision and runtime lifetime after the plugin focus succeeds. After caret restoration, require matching explicit decision, current block, generation, edit epoch, readOnly state, runtime health and block membership before reporting success. No-target focus retains the original InteractionState result.

- [Red tests `e5dd8b8`](https://github.com/Shelamkoff/editor/commit/e5dd8b8660d77b788f100d754f11691bded89b41)
- [Fix `72636b9`](https://github.com/Shelamkoff/editor/commit/72636b9a3f3f2618ad3efe9511b0568a684f048d)

## Verification

| Checked-in suite | Test bodies | Focused result |
| --- | ---: | ---: |
| `core/EditorViewModel.test.js` (new) | 15 | 15 passed |
| `core/InteractionState.test.js` | 12 | 12 passed |
| **Total** | **27** | **27 passed** |

Six cases reproduced failures against the original/progressively updated production source, while additional cases verify successful fallback, same-ID explicit author intent, stale caret rejection and stable focus. An extra integration test instantiated the **real** `LogicalSelection` together with the real `EditorViewModel` and `InteractionState` classes to prove that an absent keyed field returns false without republishing current block.

Verification used exact GitHub-fetched JavaScript source from the current branch and the checked-in tests executed in isolated V8 with a controlled stateful runtime/reconciler; `shared/invokeObserver.js` and `shared/textOffset.js` were also evaluated from source. This is **not** a complete checkout, native Node.js test runner or real browser interaction and does not prove that every synthetic reentrant callback is reachable from an external host through the normal protected publication boundary.

## Required full acceptance

```sh
npm ci
node --test core/EditorViewModel.test.js core/InteractionState.test.js core/PublicEditorApi.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Native Chrome acceptance should verify currentBlock/selection event order after insert/remove, real focus ownership for compound block fields, retained-keyed fields that disappear during re-render, read-only mode transitions inside focus hooks, and Undo/Redo caret snapshots. Distinguish internal synchronous reentrancy from prohibited public `onCommit` control mutation. Compare v1 and v2 at the author-visible level.

**Conclusion:** Four internal focus/current-block ownership issues were corrected with focused regression evidence. Library-wide stability and complete browser-verified v1 behavioral parity remain open until the complete local acceptance suite passes on the final branch HEAD.
