# Rector v2 — IME staging, retained composition and deferred focus reentrancy audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `d28968841e33854515b41cf9f98e0624c8b5a340`  
**Scope:** `core/SelectionController.js`, `core/SelectionController.test.js`, actual `shared/textOffset.js`. Direct commits to the refactor branch; no v1 compatibility shims, persistence changes or unrelated source edits.

## Owner contract

A pending IME composition may edit exactly one current author selection. Starting composition cannot first discard the previous logical cross-block selection and only then discover that staging focus/native caret failed. Retained `commit()`/`cancel()` handles cannot reclaim a previously selected block or field after another user focus, author selection, edit-mode transition or unmount. The same synchronous focus/caret callback cannot create two active composition handles through reentrant `beginComposition()`. Deferred post-commit microtasks cannot call into a revoked editor after a read of mounted/current DOM state itself revoked authority.

These invariants must preserve successful whole-block and cross-block IME flows and normal cancellation/recovery.

## Finding IME1 — whole-block composition cleared selection before checking focus (P1/P2)

`#beginWholeComposition` called `#deactivate()`, clearing selected block IDs before asking the ViewModel to focus the preedit field. A rejected, throwing, destroyed-editor, read-only round-trip or revision-changing focus still returned a composition handle or lost the author selection.

**RED:** Five tests failed on the starting source.

**Fix:** Acquire a lifetime lease, invoke the plugin/editor focus first, and retire old selected blocks only when focus returned true and the same runtime generation/revision/control epoch remained live. A failed staging callback returns null without clearing the old selection.

- [Tests `ce99a33`](https://github.com/Shelamkoff/editor/commit/ce99a33e833133867807c771606a9d1c9cb28aac)
- [Fix `cbcd734`](https://github.com/Shelamkoff/editor/commit/cbcd73420c8ae9d86ce23abcbfa6af746a1fa18a)

## Finding IME2 — cross-block preedit staging lost native/logical selection before caret validation (P1/P2)

`beginComposition()` cleared a cross-block selection before focusing the staging host and calling `Selection.setBaseAndExtent`. A native setter that threw, silently ignored the edit or was reached after a same-ID field remount could leave an invalid handle or discard the original logical selected range.

**RED:** Three tests showed a thrown setter, silent no-op and remount. A normal stage→cancel→restore control stayed green.

**Fix:** Keep the logical bookmark active during a guarded focus/native preedit operation. Suppress reentrant selectionchange cleanup during this brief stage, verify live generation/revision/control owner, current mounted DOM endpoints, active staging field and actual collapsed native logical offsets. Only after that verification, release the old highlight/selected blocks and hand out the IME session. A cyclic DOM test fixture was subsequently tightened to assert node identity instead of deep-traversing parent/child cycles.

- [Tests `b5952fa`](https://github.com/Shelamkoff/editor/commit/b5952fafd1462da04a9c46a225bc566155e9d0b6)
- [Fix `fc0bfc7`](https://github.com/Shelamkoff/editor/commit/fc0bfc7336d80d329d78048b03781496ff7e4302)
- [Fixture refinement `e97e611`](https://github.com/Shelamkoff/editor/commit/e97e6118a83d86f3f2e1a0a11d5ced4e5e49cc2e)

## Finding IME3 — retained IME cancellation overwrote newer author selection (P1/P2)

A successfully issued handle still passed only generation/revision/mode checks. A later user selection of different blocks (whole-block IME) or a newer native focus in a different field (cross-block IME) did not advance those values. A retained `cancel()` could therefore restore the obsolete selected blocks/range. The matching commit path used that same stale restoration and could have authored the old replacement.

**RED:** Two real-class tests demonstrated a cancelled handle reselecting `a` after the user chose `b`, and a cross-block handle stealing focus back from another editing field.

**Fix:** Capture the post-staging selected-block state, current block and native focus, or the exact original staging field owner. Revalidate this author ownership on retained commit/cancel before invoking restore. When superseded, permanently settle the old handle as false without changing the newer user selection.

- [Tests `47ac970`](https://github.com/Shelamkoff/editor/commit/47ac970d737088f2e80336bb6f55758576229873)
- [Fix `167b29d`](https://github.com/Shelamkoff/editor/commit/167b29de0ccb13fd16f852c4ea520be30162b642)

## Finding IME4 — same-stack nested composition could create duplicate sessions (P1)

During focus/preedit staging, a plugin or native listener could invoke `beginComposition()` recursively while the original selection was still eligible. The previous controller created a second independent handle for the same range, which could then be restored or edited twice.

**RED:** Two tests proved nested whole-block and cross-block handles were returned.

**Fix:** A scoped opening-composition guard rejects a nested request. The guard covers all synchronous preparation callbacks and is always released, including throwing native focus, without leaving the editor stuck in staging mode.

- [Tests `7194b0d`](https://github.com/Shelamkoff/editor/commit/7194b0d24fe67ef7609973c524e17bc82ac88fbe)
- [Fix `b642a83`](https://github.com/Shelamkoff/editor/commit/b642a83cd6b77e13d57d140f825ddf5d08fcd85d)

## Finding IME5 — explicit selection during focus/teardown superseded old preedit (P2)

Even a successful focus callback may issue a newer selected-block decision without changing the canonical revision/control mode. `#beginWholeComposition` and cross-block `beginComposition` would continue staging from the previous selection and later clear or replace the newer choice. A `clearSelection` notification during `#deactivate()` can also reentrantly publish a successor block selection.

**RED:** Three cases reproduced takeover during focus and during the old selection's clearing callback. A normal unchanged whole-block stage remained green.

**Fix:** Compare selected block IDs before/after focus, and verify the old selection was actually retired without a newer choice when deactivation completes. Refuse the stale session instead of clearing or reclaiming the successor.

- [Focus selection tests `efc8c3a`](https://github.com/Shelamkoff/editor/commit/efc8c3aeacbdbcc4af7fb6dff8811647722d514b)
- [Fix `700118b`](https://github.com/Shelamkoff/editor/commit/700118bda33e64bfb94b3d8ac12f3729cdffbdfe)
- [Teardown observer tests `3d19b55`](https://github.com/Shelamkoff/editor/commit/3d19b55b318741b7cfa451595e12ad22ab5ec3c5)
- [Fix `890121c`](https://github.com/Shelamkoff/editor/commit/890121c152aae8b3f297966b09b626845aa8ffd3)

## Finding F1 — queued focus getters could retire the editor after the earlier guard (P2)

The deferred `#queueOwnedFocus` microtask checked abort, generation/revision/control epoch **before** reading `view.element(blockId)` and `view.currentId`. Each getter may invoke application or view callbacks that synchronously destroy the editor or change mode, even while returning the same element/current ID. The old microtask then invoked `view.focus` on a revoked owner.

**RED:** Two source-level tests reproduced an epoch change during the mounted-element getter and synchronous controller destruction during the current-block getter.

**Fix:** Revalidate the original owner lease after each externally observable DOM/view getter, including the native Selection read and active-element comparison, before calling `view.focus`. The completed canonical transaction remains committed; stale focus merely does not execute.

- [Tests `842f6eb`](https://github.com/Shelamkoff/editor/commit/842f6eb96c1e16d5b4be962555eff702a6bf1cf6)
- [Fix `8345b24`](https://github.com/Shelamkoff/editor/commit/8345b246425eb753aad709dc269280418f9c5bae)

## Verification ledger

| Area | Number |
| --- | ---: |
| New unit tests | **19** |
| RED reproductions before corresponding fixes | **17** |
| Successful behavior controls | **2** |
| Existing unit cases before this pass | 24 |
| **All current SelectionController.test.js cases** | **43 / 43 passed** |

The final run used freshly fetched production code from the current GitHub refactor branch and actual `shared/textOffset.js` with controlled `AbortController`, native DOM selection, focus and microtask adapters in an isolated JavaScript/V8 runner. The code was committed directly without rewriting unrelated agent work. This result **does not establish full Node.js test execution**, TypeScript type correctness, Chrome/OS IME behavior or complete v1/v2 author-visible parity.

## Required local acceptance on final HEAD

```sh
npm ci
node --test core/SelectionController.test.js core/LogicalSelection.test.js core/EditorViewModel.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In real Chrome, explicitly exercise native compositionstart/update/end against forward/backward cross-block and whole-block selections; refused/throwing plugin focus; native Selection setter failures; selectionchange during preedit; an IME handle retained through new focus/selection, Undo/Redo, read-only and same-ID remount; and deferred focus after user caret movement. Verify one history edit per committed IME, no partial provisional text in untouched fields, and no stale block/highlight/DOM focus.

**Conclusion:** Six focused IME/deferred-focus ownership groups are corrected with deterministic regression evidence. Full-library stability and comprehensive v1/v2 parity are still pending local/node/native acceptance at the final HEAD.
