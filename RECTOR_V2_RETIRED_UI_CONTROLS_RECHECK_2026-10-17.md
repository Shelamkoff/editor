# Rector v2 — DOM listener lifetime / retired UI controls

**Date:** 2026-10-17.  
**Branch:** `refactor/rector-v2-architecture`.  
**Starting HEAD:** `df9bec06989da27c4df886c4c3703a4048940f14`.

## Summary

Four independently identified UI lifetime regressions were fixed in their owning plugins: Person, Gallery, Attaches, and Poll. None required legacy v1 runtime/API, a new manager, or a core architectural layer. Controls rebuilt by an update must lose authority once retired. Handlers on persistent editing hosts must survive a presentation-only repaint.

**Caution:** This recheck is a scoped implementation/red-green verification. It does not certify the entire editor or the complete v1/v2 parity of unrelated capabilities.

## PERS-L1 — retired Person tabs and body still retained event handlers (P2)

Previously, `renderTabs()`, `renderBody()`, and `createLinkRow()` registered DOM listeners with the enclosing `context.signal` even though those DOM elements were removed at each repaint. Holding an old tab reference could invoke its callback after `update()` had replaced it, including navigation to another person. Old name-input handlers also remained reachable after replacing the active body.

Person also supports an important partial repaint: when another person's data changes, **only tabs** are rebuilt while the active authoring body remains connected. A single signal for the whole view would wrongly revoke the still-active name/role/bio handlers.

**Change:** separate `tabsController` and `bodyController`; abort/recreate each only at the start of its corresponding repaint, and abort both on instance destroy. All generated tab controls and link/body controls use their correct signal; persistent async avatar tasks keep their existing lifetime.

**Tests:** `plugins/person/reconciliation.test.js`, using actual Person production source with signal-aware DOM adapter. Red **5/7 passed** (the two new stale-lifetime cases failed); green **7/7 passed**. Existing tests for active-input retention, 400 unrelated reorder/update operations, current tab-label input and actual active-person removal remain green.

Commits: [regressions](https://github.com/Shelamkoff/editor/commit/75f2510c609af938858d74251820a3928ef5f4f5), [fix](https://github.com/Shelamkoff/editor/commit/e5474b9b9b44ef9d0fcf1899aff6ed149d34ffa0).

## GALLERY-L1 — removed view buttons could still modify the document (P2)

`plugins/gallery/index.js` recreated slot/control DOM with `wrapper.replaceChildren()` and aborted `viewController`, but six per-projection listeners were registered against **`context.signal`** instead of the retired view controller. A saved reference to an old remove-image button retained a callback and could remove current canonical images after a later author update.

**Change:** use `viewController.signal` for regenerated caption keyboard handling, remove/back/forward buttons, an empty slot's add button and Delete All; keep persistent wrapper drag/drop listeners bound to `context.signal`. Other per-view Gallery handlers already use `viewController.signal`.

**Red/green:** execute the actual `renderImage` function extracted from the production JS with a signal-aware DOM adapter: after discarding the view, the retired remove button still invoked one additional canonical write before the fix; after the fix its listener count and writes are zero. An active remove button remained callable before disposal.

Registered a full-editor browser regression in `tests/browser/native-plugin-parity.js`: after a style update, old remove/Delete All controls cannot touch current `save().blocks`, while current controls still delete normally.

Commits: [browser test](https://github.com/Shelamkoff/editor/commit/be5285230892a19a0a2e0e5eaab7d9bf3f0e85db), [fix](https://github.com/Shelamkoff/editor/commit/8e244af7f06c5367449a34d50900eadbf36b43a1).

## ATTACHES-L1 — removed file controls retained authoring authority (P2)

`plugins/attaches/index.js` had an existing `settingsController` that was aborted during `project()`, but it only managed the settings menu. File remove buttons, name keydown, group controls, add/URL/source actions and Delete All used the block-lifetime `context.signal`. Detached controls could still mutate current file data.

**Change:** create `settingsController` once at **each** `project()` start, and use that same per-view signal for all generated view controls, the temporary media dropzone and the existing settings panel. Removed redundant controller replacement within the menu builder; persistent wrapper drag/drop and source editor preload retain their original scope.

**Red/green:** execute the real production `renderFile` function in a signal-aware DOM adapter. Baseline: clicking an obsolete remove button after retiring the view produced a second write; updated: no second write and zero retained click listeners. Current button remains functional.

Registered a full-editor browser regression in `tests/browser/native-plugin-parity.js` testing stale remove and Delete All buttons after changing the file variant, and a live remove control.

Commits: [browser test](https://github.com/Shelamkoff/editor/commit/e43478f1d3c81cfde9fcb54d9ea9e0a4c28034a8), [fix](https://github.com/Shelamkoff/editor/commit/b75e6ffbd7d1b3d931e5d5f11a8bc339644dfaef).

## POLL-L1 — stale author controls and runtime actions remained callable (P2)

`plugins/poll/index.js` has two distinct projection lifetimes:

- **Authoring option rows** are sometimes reused by `projectRuntime()` to preserve native typing selection.
- **Submit/settings/add-option controls** are rebuilt every runtime update; authoring rows are rebuilt only for a full author update or changed option identities.

Previously, every control used `context.signal`, which never revoked a retired button during a live block's repaint. A stale option marker could mutate the pending selection after a question edit; a stale Add button could write a new canonical option after a runtime-only update.

**Change:** separate `authorViewController` (aborted only when option/question DOM is regenerated) and `runtimeViewController` (aborted on every projection), with corresponding listener bindings. Both are aborted on instance destruction and on the parent context signal. Focusout remains owned by the block.

**Actual Chromium 144 red/green:** the exact production `plugins/poll/index.js` source was run through Blob ESM imports with the actual selected subset of `DocumentStore`, `HistoryStore`, `TransactionEngine`, `NativeInputController` and existing browser contract fixture.

- RED: **18/20 PASS**, exactly the two new retired-control scenarios fail; no browser errors.
- GREEN: **20/20 PASS**, including old remote revisions, subscriptions, local vote/history, author updates, pending choices, read-only round trips, NativeInputController and both retired-control cases; zero page errors.
- Exact tested final Poll Git blob: `0c8ba268be01cb464e9452b1bef15c5f4a6f825f`, identical to the pushed source.

Commits: [tests](https://github.com/Shelamkoff/editor/commit/d5708598b2af1768a49bd35da2eb6b75c7ecbcac), [fix](https://github.com/Shelamkoff/editor/commit/c2fe8ba105d36a5616626fe8e939477e9428de96).

## Broader scoped verification

- Available materialized Node ESM suite (DocumentStore, TransactionEngine, HistoryStore, persistent index, native-input controllers and model regressions): **39/39 PASS**, no failures. This is a selected subset and not a full checkout at the newest Git HEAD.
- Production JS and affected browser/unit JS: seven changed files passed independent JavaScript parsing after removing import/export syntax in a controlled parser adapter. This is not a TypeScript/typecheck run.
- Full-editor native Gallery, Attaches, Person and Poll integration tests have been **registered** in repository fixtures, but the project-wide Vite/browser suite was **not executed** at this new branch HEAD.
- The remaining Gallery/Carousel/Person authoring surfaces, clipboard, OS-level IME, web platform cross-engine behavior, installed-package consumer, docs and heap gates are **not certified** by this recheck.

## Findings consciously not converted into speculative changes

- Carousel dynamically generated DOM controls already use its refreshed `viewSignal`, while persistent wrapper event handlers use their block lifecycle signal; no corresponding retention defect was established there.
- Gallery/Attaches do still rebuild some editing hosts on externally triggered updates, but preserving DOM during every possible media/layout change would require a separately reproduced behavioral contract. No broad renderer rewrite was made.
- Other previously fixed ownership and history bugs were not reclassified as newly discovered problems.

## Acceptance caveat

For release, run the exact latest SHA locally through `npm ci`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package`, and applicable native IME/heap checks. CI capacity constraints are noted but do not convert a registered test into a passed test.

**Conclusion:** all four defects in this pass have focused red/green evidence and committed fixes. Full-library stability and total v1 behavioral parity remain unproven.
