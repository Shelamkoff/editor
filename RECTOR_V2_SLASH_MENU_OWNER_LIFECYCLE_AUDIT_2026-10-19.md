# Rector v2 — Slash menu provisional ownership and native input lifetime

**Date:** 2026-10-19  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD for this follow-up:** `f96269b3c2ab1b4fbb1ef5229a8223998fe1adf3`  
**Source:** `core/SlashCommandController.js`  
**Focused tests:** `core/SlashCommandController.retired.test.js`

## Scope

Following the active `RECTOR_V2_REMEDIATION_SPEC.md` §10.1 (native event ownership, Slash command parity), reviewed the Slash controller's constructor and `input` event lifecycle. Slash is a presentation/control owner only: it must not leak an unattached controller's menu/listeners or access native selection after the editor has been destroyed. These changes do not alter the canonical slash block transaction, toolbox item schema, persisted data or user-visible v1 shortcut vocabulary.

The source was fetched at current HEAD and all writes made directly to the existing refactor branch with freshly read blob SHAs. No competing changes were overwritten.

## SLASH-OWNER-1 — constructor error leaked its already mounted menu (P2)

The controller created and appended its `ul.oe-slash-menu` before fetching plugin/toolbox labels. If a localization provider failed during item capture, the constructor threw without returning any controller to destroy. The provisional DOM menu remained in the editor root.

**RED:** a regression test causes `translate()` to throw after menu append, then requires the menu to be removed exactly once. On the old class, the attached menu remained.

**Fix:** enclose menu append, item snapshot and event subscriptions in one provisional acquisition boundary. On failure, abort the event-listener scope, remove the menu if it is still under this root (or detached), and propagate the original error. Do not remove a menu node that a newer foreign DOM owner has adopted.

## SLASH-OWNER-2 — partial native listener registration leaked handlers (P2)

The controller installed root input/composition/keydown/focusout and owner-document scroll/window resize handlers without constructor rollback. An event host can throw after registering a listener, leaving the earlier subscriptions alive even though no destroyable controller instance was returned.

**RED:** a focused test makes `keydown` listener registration throw after attachment. The unchanged code leaves an attached menu and earlier live event handlers.

**Fix:** the same constructor acquisition catch aborts every already-installed listener via their shared AbortSignal, releases the current menu and preserves the source failure.

- [Two failing-first constructor and input tests `e10ac8d0`](https://github.com/Shelamkoff/editor/commit/e10ac8d01e6e8a97c1d9173318f83cf18750118d)
- [Provisional owner fix `da30eef6`](https://github.com/Shelamkoff/editor/commit/da30eef669692235b8f482609a5edb758d14cc89)

## SLASH-OWNER-3 — native input continued reading a retired editor selection (P2)

The native input callback checked `this.#controller.signal.aborted` at ingress, then called `reconciler.resolveEditableTarget(event.target)`. This is a DOM/editor callback and may synchronously destroy the Slash controller while returning a previously valid rich-text field. The old input continuation then called `selection.capture()` against a retired editor and could throw or publish obsolete menu state.

**RED:** a regression destroys the controller inside editable-target resolution and makes `selection.capture()` throw if it is subsequently called. Before the fix, the stale input reached that read and threw.

**Fix:** capture the control-mode epoch, prior active session and menu version on ingress, and recheck them after external target, selection, native Selection, text and menu callbacks. A superseded input cannot interrogate or publish the old menu. At the end of filtering, the controller also rechecks the settled session before displaying/positioning it.

- [RED regression `e10ac8d0`](https://github.com/Shelamkoff/editor/commit/e10ac8d01e6e8a97c1d9173318f83cf18750118d)
- [Production guard `da30eef6`](https://github.com/Shelamkoff/editor/commit/da30eef669692235b8f482609a5edb758d14cc89)

## SLASH-READONLY-1 — ensure read-only input still dismisses a live menu

The initial owner guard treated `runtime.readOnly === true` as insufficient authority even to dismiss the menu that this controller already owned. A regression then revealed that the corrected input handler would leave the menu visible after read-only transition if a native input arrived.

**RED for the intermediate implementation:** an additional test opens a Slash query, changes the runtime to read-only and dispatches input; the menu remained open.

**Fix:** explicitly allow a read-only/composition input to retire **only its still-current ingress session**, while continuing to refuse any newer popup or stale authoring action.

- [Read-only regression `c78b07ad`](https://github.com/Shelamkoff/editor/commit/c78b07ad9f11e86572baea368960ee6719cb04f1)
- [Correction `e93024a9`](https://github.com/Shelamkoff/editor/commit/e93024a9fa07ee1c4489d49e956438281d5fa36d)

## Focused verification

| Scope | Result | Execution boundary |
| --- | --- | --- |
| All `core/SlashCommandController.retired.test.js` test bodies | **6/6 passed**, 25 assertions | Fetched real Slash controller and actual `shared/textOffset.js` helper evaluated in isolated V8 with synthetic DOM/AbortSignal |
| Three original defects | All three new regressions were RED against the pre-fix class, GREEN after fixing | Same isolated V8 |
| Read-only guard regression | RED against intermediate refactor, GREEN after correction | Same isolated V8 |
| Full Node.js tests and TS typecheck | **Not executed** | Requires local checkout/dependencies |
| Browser `Slash` menu events / native composition | **Not executed** | Native Chromium and user-gesture acceptance pending |
| Overall Rector v1/v2 feature parity | **Not established** | Independent acceptance matrix required |

All existing retirement tests were retained. No tests were disabled or mocked to return the expected production result. The DOM/Abort adapters simulate contract behavior but do not exercise browser-native pointer, focus, native Selection, Custom Elements or IME.

## Local acceptance commands

```sh
npm ci
node --test core/SlashCommandController.retired.test.js core/InlineTriggerController.test.js core/KeyboardRouter.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In Chromium, exercise `/` menu opening, filtered block/toolbox/inline options, Enter/Tab selection, Escape removal, focusout, read-only transition, and a selection/DOM callback that tears down the editor during input. Check that no command menu/listener survives a failed initial mount, a stale callback cannot reclaim the author's focus and canonical Slash changes preserve the expected one-step Undo/Redo behavior.

## Conclusion

This pass closed two constructor-resource leaks and one obsolete native input continuation, and caught/fixed a read-only dismissal regression during the refactor. It does **not** certify complete native browser correctness, full-library stability or v1/v2 behavior parity.
