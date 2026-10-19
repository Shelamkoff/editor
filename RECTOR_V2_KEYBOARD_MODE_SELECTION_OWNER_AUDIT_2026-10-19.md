# Rector v2 — KeyboardRouter mode, selection and focus owner lifetime audit

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `fe92324b87329b625ebfefc2c132356e33a2cbbb`  
**Changed production owner:** `core/KeyboardRouter.js`  
**Regression tests:** `core/KeyboardRouter.test.js`

## Scope and contract

Reviewed the active `RECTOR_V2_REMEDIATION_SPEC.md` §10 (C6 keyboard and selection ownership), and the repository's TDD skill. The keyboard router receives native editor keydown events, must distinguish document editing hosts from independent/native controls, and must not issue canonical commands or steal author focus after its original owner is retired by a synchronous callback. A read-only → editable round trip increments the control-mode epoch even when the document revision does not change.

This pass inspected the current `core/KeyboardRouter.js` and existing test fixture alongside the real `shared/editableFields.js`, `shared/textOffset.js`, `shared/richTextCaretPadding.js` and `shared/shortcutKey.js` helpers. Before each production change, behavioral regressions were committed and reproduced. All writes used freshly fetched blob SHA through the authorized GitHub connector; no PR or unrelated changes.

## KEY-OWNER-1 — old Mod+Z and Ctrl+A could act after mode or scope retirement (P2)

`handleKeydown()` performed an initial keyboard lifetime check, but then called potentially user-owned event property getters, editing-target resolvers and selection readers before dispatch. The existing later `#canPresent()` check ensured the router had not been **destroyed**, but did not detect a read-only or other mode round trip whose final state was editable.

**RED:** one regression increments `runtime.modeEpoch` from an accessor-backed `event.key` and observes an obsolete `undo()`. Another retires the router inside `selection.capture()` during Ctrl+A but still receives `selectAllBlocks()`. A third increments the control-mode epoch inside selection capture and observes a stale whole-block selection.

**Fix:** capture an ingress mode lease before event ownership and metadata reads. Recheck the exact owner and epoch after those callback boundaries and after Ctrl+A selection/field-length observation; do not mutate or prevent native behavior if the event is no longer owned.

- [RED tests `dd1a22ee`](https://github.com/Shelamkoff/editor/commit/dd1a22ee6d9e85a844fcd0c92e1b919da7599cdf)
- [Fix `efefc330`](https://github.com/Shelamkoff/editor/commit/efefc3308ec75e78d7343609f3869a6325f3d742)

## KEY-OWNER-2 — inline toolbar or shortcut preparation could authorize stale commands (P1/P2)

A rich-text inline toolbar's `handleShortcut()` callback could synchronously change edit mode while returning false. The keyboard router then proceeded to native document Undo/Redo because it did not recheck ownership after the toolbar decision. Separately, `#mutate()` called `selection.capture()` before `runtime.interact()`. The capture callback could destroy the router and still allow an old shortcut action to invoke a canonical `update()`.

**RED:** two new regressions demonstrate obsolete Undo after a false-returning toolbar callback with a mode transition and a canonical block update after the selection reader destroyed the keyboard router. Both failed against the prior production code.

**Fix:** recheck the key's ingress mode lease after the toolbar callback; prevent a retired `#mutate()` from calling the transaction engine after its own selection capture revokes authority; recheck the full key lease after shortcut resolution before considering a structural key fallback.

- [RED tests `6a96fbbb`](https://github.com/Shelamkoff/editor/commit/6a96fbbb2771e6a7e1f89649a43289fb120267bd)
- [Fix `6e00415f`](https://github.com/Shelamkoff/editor/commit/6e00415fe5b98bd1ea0fc95edc15158b2d48e76e)

## KEY-FOCUS-1 — stale cleanup, replay and arrow navigation could steal focus (P2)

`appendDefault()` cleared a cross-selection and hid the inline toolbar before deciding whether to reuse an empty block, without checking whether `crossSelection.clear()` synchronously destroyed its keyboard owner. Similarly, after a successful Undo, `#replayHistory()` called `view.reconcileInteraction()`, then could focus the old root if reconciliation had destroyed it. Finally, ArrowUp/ArrowDown called `setCurrent(nextBlock)` followed by `focus(nextBlock)` without respecting a newer explicit author decision made inside `setCurrent()`.

**RED:** added regressions for terminal cleanup during append, synchronous teardown during Undo reconciliation, and successor focus during arrow navigation. A fixture correction kept the key target inside the editor while setting the native active element to body, isolating the Undo condition.

**Fix:** stop append if the original keyboard owner/mode expires after cross-range or toolbar cleanup. After Undo reconciliation, recheck keyboard liveness before any focus recovery. For arrow navigation, recheck the key lease and require `view.currentId` still match the target after `setCurrent()`.

- [RED tests `4db5d319`](https://github.com/Shelamkoff/editor/commit/4db5d31963b78254330971f6e88a52268b9a3979)
- [Fixture correction `24a67846`](https://github.com/Shelamkoff/editor/commit/24a67846a738aecd5be5a4cf7f63cf0c6273507e)
- [Fix `df697196`](https://github.com/Shelamkoff/editor/commit/df69719617ab9fd898221b5faade9de0a5930159)

## Focused test evidence

Using the **same final 42 test bodies** from `core/KeyboardRouter.test.js` against two fetched production revisions:

| Production source | Cases passed | New regression failures |
| --- | ---: | ---: |
| Baseline `5aff768fbe5cb625ca28023e769fe6f1354a882f` | 34/42 | All **8/8** new test bodies failed for the intended stale keyboard/focus behavior |
| Fixed `4902aa91509b2fff2f6b2013d313d8500c686b04` | **42/42** | **0**, with 130 assertions in the complete green run |

The runner evaluated actual source for KeyboardRouter, editing host ownership, shortcut normalization, text offsets and caret padding. It invoked all fetched official test bodies in isolated V8 with a controlled `AbortController` and Node assertion adapters. This is **not** a complete Node.js `node --test` run and does not execute actual native keyboard, rich DOM/shadow editing, IME or Chromium UI event dispatch.

No other KeyboardRouter issue was asserted without a failing behavioral witness. No production change to undo/redo record formation or user-visible shortcut vocabulary was made.

## Local acceptance on final HEAD

```sh
npm ci
node --test core/KeyboardRouter.test.js core/InlineTriggerController.test.js core/InlineCommandController.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium, verify document keyboard shortcuts after inline toolbar query lifecycle, input/textarea native Undo, a read-only round trip during an editor gesture, Ctrl+A with stale selection and whole-block state, replacement of the focused block in post-commit observers, and Backspace/Delete/Enter structural behavior with browser-native selection. A successor author focus must survive stale arrow or replay callbacks.

## Conclusion

This pass corrected three bounded keyboard/event and focus ownership categories with eight failing-first regression cases. The complete focused keyboard suite is green under the stated isolated evaluation. **Full Rector v2 stability, native-browser correctness and behavioral parity with v1 remain open** until full local acceptance on the final HEAD.
