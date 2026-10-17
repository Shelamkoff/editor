# Rector v2 — audit of animation ownership, inline commands, triggers and clipboard

**Date:** 17 October 2026  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `ff48dd90f75ed76144d4b1f72d6e1375c577a35b`  
**Latest code commit in this audit:** `86edaca6e21c225388a4e0d5af846e66609f2fcb`  
**Legacy v1 behavioral reference:** `master` `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`

## Summary

This pass moved away from the previously audited LinkPreview/history modules. It inspected production `ProjectionAnimator`, `InlineCommandController`, `InlineTriggerController` and `ClipboardController`, plus the editor composition wiring, neighboring tests and the v2 remediation spec. Four independent problem groups were confirmed with **RED → GREEN tests**, then fixed in the existing architecture. No legacy API, migration, serialized-document field or alternate persistence layer was introduced.

After the committed fixes the targeted source-level tests passed:

| Module under test | Final checks | Earlier RED evidence |
|---|---:|---|
| `core/ProjectionAnimator.js` | **8/8 PASS** | 5/8: 3 new lifecycle/DOM scenarios failed |
| `core/InlineCommandController.js` | **15/15 PASS** | 10/13 for insertion failures; 13/15 for frozen/shared RegExp after adjusting the harness to actual strict ESM semantics |
| `core/InlineTriggerController.js` | **11/11 PASS** | 9/11: both async hook-result cases failed |
| `core/ClipboardController.js` | **8/8 PASS** | 4/6 for IME Cut, then 6/8 for stale cross-selection vs auxiliary controls |
| **Total** | **42/42 focused checks PASS** | Source-specific production tests, not a full-suite pass |

Execution used actual up-to-date production JavaScript and the committed test bodies in a deterministic V8 isolate, with restricted DOM, timers, AbortController, immutable data and other controlled dependencies. Where test assertions depend on ECMAScript modules being strict, the adapter explicitly executed in strict mode. The browser regression in `tests/browser/native-ime.js` was syntax-checked but **not executed in Chromium**.

## A1 — removal animation leaked partial DOM / stole adopted nodes

In `ProjectionAnimator.animateRemovals()`, a `container.insertBefore()` implementation that inserted the spacer then threw left the spacer in the canonical document. Further, animation completion and `destroy()` blindly called `remove()` even after another host had reparented that node.

**Fix:** roll back a partly inserted spacer when the insertion throws; track each removal-spacer's original parent; only remove it while that parent still owns it. Clear tracked claims on animation completion and destroy. Preserve active inserted spacers for the usual animation lifetime.

[Tests](https://github.com/Shelamkoff/editor/commit/ad2675b8134ea1a0f76ab115ad50f85ae5e3a8dd) · [Fix](https://github.com/Shelamkoff/editor/commit/7a22e8890c7cf3f0d5d990311104c6bacb9a1423)

## I1 — rejected inline insertion reported success and moved the caret

The inline controller ignored the result of `#withCaret()` when inserting widgets, always returning `true` even if the underlying `insertInlineWidget` transaction returned `false`. That could retire an active trigger query even though no widget was inserted. For fresh-text insertion the controller also reported success to `onFreshText` despite an explicit failed result.

**Fix:** `#withCaret` now moves the caret only after a confirmed successful operation. Widget insertion reports that outcome. The rich-text replacement path explicitly translates its **valid `void` success** to `true` without swallowing a real `false` failure. A refused trigger insertion no longer loses its query merely through a false success report.

[Tests](https://github.com/Shelamkoff/editor/commit/61a054d9f32dfa82c7f61c5fd77d666db15ad0c6) · [Fix](https://github.com/Shelamkoff/editor/commit/fbe912ac4b881f28aa30a43aeebe7735f0864f76)

## I2 — inline Paste mutated extension-owned RegExp state

The controller stripped regex anchors to search within pasted text, then called `pattern.lastIndex = 0; pattern.test(value); pattern.lastIndex = 0` on the original extension-owned RegExp. This fails on a frozen global/sticky RegExp under strict ESM semantics and corrupts `lastIndex` state shared by another editor, even when the pasted content is valid.

**Fix:** keep the original regex untouched. Match with a separate search RegExp and validate with a separate RegExp with the original source/flags and local `lastIndex`. The extension's original validation method is invoked against the local instance.

[Tests](https://github.com/Shelamkoff/editor/commit/c24714baf23ef18bd5f52539606297384782f673) · [Fix](https://github.com/Shelamkoff/editor/commit/1a744b7da3a1ebe188fb15acd5c86ec94796b3b9)

## I3 — asynchronous inline trigger hooks escaped the synchronous contract

`InlineTriggerController` enforced the `onTriggerCancel()` synchronous boundary, but ignored a returned Promise/thenable from `onTriggerQuery()` and did not consume an invalid async `onTriggerKeydown()` result. A late rejection was then unobserved while the query could remain active, or a trigger-owned Enter escaped to generic handlers.

**Fix:** apply the already-existing shared `synchronousResult()` boundary to both query/keydown callbacks, retire only the affected session, consume the thenable's rejection through the error sink, and keep event ownership for the invalid keydown. The built-in Mention plugin's synchronous hook contract was inspected and remains compatible.

[Tests](https://github.com/Shelamkoff/editor/commit/faec9421ba865703e8fe31f000a3eabb97b4fc35) · [Fix](https://github.com/Shelamkoff/editor/commit/3a3831d0e20194472d27714ffe6502ce39e59d45)

## C1 — structured Cut during IME, and auxiliary clipboard ownership

The specification C4 requires rejecting destructive structured Cut during unfinished IME preedit. `ClipboardController` did not receive the native controller's `isComposing` state. Both a registered rich-text field and an active cross-block selection could enter the canonical Cut planner while the native composition was unsettled.

A separate reproduced defect arose when cross-block selection state outlived focus on an auxiliary plain-text input: structured Cut or private-MIME Paste could claim the event instead of allowing normal native input handling.

**Fix:** pass `isComposing: () => nativeInput.isComposing` from `createEditorRuntime`; reject model-owned Cut before reading canonical slices during composition while preserving plain-text native Cut; and always yield Cut/Paste on a registered plain-text auxiliary field regardless of stale cross-selection state.

[IME tests](https://github.com/Shelamkoff/editor/commit/004128158a0315246ad63834fe99e9a05c4534ac) · [IME Cut fix](https://github.com/Shelamkoff/editor/commit/065eea9aca801930298f056704a4ebd8691230e9) · [Wiring](https://github.com/Shelamkoff/editor/commit/6181a7c835ee50d4e1d18a082d8609dcbba9a75a) · [Auxiliary tests](https://github.com/Shelamkoff/editor/commit/e3431fc461d95994dbca97beded8cfa8cf9124ad) · [Auxiliary fix](https://github.com/Shelamkoff/editor/commit/86edaca6e21c225388a4e0d5af846e66609f2fcb)

A corresponding synthetic Cut dispatched **during a genuine CDP-started IME composition** is registered in `tests/browser/native-ime.js`: it checks prevention, no private clipboard fragment, no canonical/history change, and harmless cancellation. [Browser test](https://github.com/Shelamkoff/editor/commit/e14e2a245996dee5a07cb099881b2ef5636c9681). It is **not** a completed physical-IME/browser acceptance result.

## Verification boundary / remaining work

The findings above were corroborated using deterministic committed tests before and after code changes; earlier failing tests were not retroactively called green until the matching fix was applied. Several nearby hypotheses were checked without altering code where existing behavior and tests were sufficient, including the built-in Mention hook contract and ordinary native plain-text Cut.

The current pass did **not** run a complete checkout's `npm ci`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package`, or `npm run docs:check`. In particular the real browser synthetic Cut/IME route, keyboard-trigger typing and cross-input selections, mutable/frozen-regex external integration, installed package API and heap/lifetime must still be checked. Full v1 behavioral parity of all 21 block types and 12 inline tools is not proven by this focused pass.

This audit is additive to `RECTOR_V2_LINK_PREVIEW_ASYNC_HISTORY_PARITY_2026-10-17.md`; it does not undo its source/authority history fixes.
