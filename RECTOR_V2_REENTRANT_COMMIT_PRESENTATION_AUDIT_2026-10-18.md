# Rector v2 — synchronous commit / retired presentation audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `5205fff1258972a2f4a0cdc0471c081c90c8d7d1`  
**Scope:** inline insertion and paste, keyboard-driven document commands, cross-block selection. This is a targeted follow-up to the inline input and drag lifecycle audit; it does not repeat those changes.

## Audit boundary and expected behavior

A successful canonical transaction can synchronously notify application listeners. Those listeners may destroy the editor before the initiating command returns. The transaction must remain committed, but the old UI owner must no longer restore the caret, reconcile detached blocks, process another key phase, or schedule view focus. A normal unrevoked command must retain its existing behavior. Read-only/terminal ownership guards are defensive; a read-only round trip injected inside a synthetic `interact()` fixture is **not** evidence that the public `DocumentRuntime.setReadOnly()` API permits such a round trip in the publishing phase.

The v1 comparison for this pass inspected `master/core/KeyboardManager.js`, `master/core/CrossBlockSelection.js` and `master/core/inlinePluginInsert.js` to identify corresponding document-editing behaviors. Exact v1/v2 Chrome gesture differential was **not** executed.

## Confirmed finding C1 — inline command restores a dead caret (P2)

**Affected:** `core/InlineCommandController.js` (`insert` via `#withCaret`, `pasteText`).

After `runtime.interact()` returned a successful canonical edit, the controller unconditionally called `selection.setCaret()`. If a synchronous transaction observer had destroyed the editor, this referenced retired selection/DOM ownership.

**RED:** New real-class regression tests reproduced four post-commit cases, including teardown after a successful insertion and paste. The two teardown cases failed pre-fix by attempting stale caret restoration; two additional synthetic mode-epoch cases also failed without defensive rejection.

**Fix:** Capture generation and control-mode epoch before the operation; after successful commit, restore the caret only while runtime health is not `destroyed` or `failed`, runtime is editable and the captured generation/mode epoch remain current. The already committed operation continues to report success.

- [Tests `a7bba6e`](https://github.com/Shelamkoff/editor/commit/a7bba6e322cfe7124bc50d4fcccac53a0555d3bc)
- [Fix `786f4b4`](https://github.com/Shelamkoff/editor/commit/786f4b4c7bc15a29969eb609b144b143a3610cf5)

**Focused GREEN:** 19/19 checked-in `InlineCommandController` cases against the final retrieved class source, including preserved normal insertion, paste conversion, overlap and extension matcher validation.

## Confirmed finding C2 — keyboard commit reaches retired presentation (P2)

**Affected:** `core/KeyboardRouter.js` (Undo/Redo, Split, Exit, Append, backward/forward Merge and shortcut updates).

The router performs synchronous canonical operations followed by view reconciliation/current-block change. A commit observer may synchronously retire the keyboard owner. Its old continuation still attempted to access the view. Additionally, shortcut preparation could retire the router yet fall through into the later Enter structural-key path.

**RED:** Seven newly added cases reproduced stale view reconciliation or focus after teardown; a separate follow-up regression reproduced the structural-key fall-through. All eight failed for their target behaviors on the pre-fix source.

**Fix:** Revalidate router abort signal, runtime health and editability before post-commit presentation; return without revisiting detached DOM while retaining the completed model operation. Explicitly stop further key processing after an ownership-revoking shortcut. An unsuccessful Append no longer presents a non-existent block.

- [Initial regression cases `57001b1`](https://github.com/Shelamkoff/editor/commit/57001b1d8fb026f941d0791416aa345687974079)
- [Initial fix `70bcdf2`](https://github.com/Shelamkoff/editor/commit/70bcdf27aedc834138e82ee8124fadfca577d5c8)
- [Shortcut fall-through test `43163fa`](https://github.com/Shelamkoff/editor/commit/43163fa44221d48ea48caa73226a6e9d7ab204dd)
- [Shortcut fix `6c4ed1e`](https://github.com/Shelamkoff/editor/commit/6c4ed1e0a07cf17399d5fbf3c5aec7dadaf08333)

**Focused GREEN:** 23/23 checked-in `KeyboardRouter` cases against the final retrieved class source. Historical normal-key, history, split, merge and focus cases remained green under the same source-level adapter.

## Confirmed finding C3 — cross-block selection commits then reconciles detached DOM (P2)

**Affected:** `core/SelectionController.js` (`removeWholeBlocks`, `replace` and adjacent structurally equivalent `split` continuation).

A successful `runtime.interact()` could retire the editor in its synchronous commit observer. `removeWholeBlocks` and `replace` then unconditionally deactivated/reconciled a selection in the destroyed view.

**RED:** Two added actual-class tests raised a failure on a dead-view reconciliation after successful selection remove/replace. Original source: 8/10 pass; these two tests fail.

**Fix:** Revalidate the selection owner's abort signal and runtime health/editability before post-commit view operations. The committed canonical result returns success, without resurrecting detached selection. Applied the same check to the structurally identical `split` post-commit path, whose specific reentrant case is not independently tested in this pass.

- [Regression tests `3636be9`](https://github.com/Shelamkoff/editor/commit/3636be974d731d4263431c500eb72e2138ae15e3)
- [Fix `f126390`](https://github.com/Shelamkoff/editor/commit/f126390b2c38c308f54f987106be271543b25e8d)

**Focused GREEN:** 10/10 checked-in `SelectionController` cases against the final retrieved class source.

## Verification ledger

| Scope | Pre-fix regression result | Post-fix focused result |
| --- | --- | --- |
| Inline command | 4 new cases demonstrate unguarded caret continuation | 19/19 |
| Keyboard router | 7 stale-presentation and 1 key-fall-through regression cases | 23/23 |
| Cross-block selection | 2 failed retired-view cases | 10/10 |
| **Total focused** | **14 added cases across 3 controllers** | **52/52** |

Verification executes the **retrieved repository JavaScript class sources** in an isolated V8 runner with controlled narrow DOM, AbortController, event, scheduling and runtime adapters. It is not a full Node.js `node --test` run or native browser test. In particular, no assertion here claims real Chrome pointer, selection, focus, browser IME, clipboard, package consumer or full published-library behavior. The repository's earlier local acceptance checkpoints apply to their then-current HEAD, not automatically this revision.

No new v1 compatibility layer, public extension API change or persisted document data-format migration was added.

## Remaining validation / acceptance

From a local checkout of the **latest branch HEAD**:

```sh
npm ci
node --test core/InlineCommandController.test.js core/KeyboardRouter.test.js core/SelectionController.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Native/browser integration should exercise a commit listener that calls editor destruction during inline insert, inline paste, Undo, structural keyboard edits and cross-block replace/delete. Confirm one canonical history entry, no stale focus/DOM reads, and no uncaught errors. Also rerun native IME, clipboard and range-selection suites. A full v1/v2 user-gesture differential is still required to establish behavioral parity, rather than just matching available plugin names/features.

**Conclusion:** Three concrete post-commit ownership bugs were addressed in this pass, with targeted regression evidence. Whole-library stability and release-level functional parity are **not** certified by these isolated checks.
