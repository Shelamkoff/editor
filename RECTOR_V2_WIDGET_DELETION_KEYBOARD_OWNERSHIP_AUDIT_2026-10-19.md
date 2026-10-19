# Rector v2 — inline widget deletion and native keyboard history ownership

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `6524fe19a7ca49c20d455880c8591b9cf4e74e18`

## Contract and scope

Continue [the cross-block/native focus audit](RECTOR_V2_CROSS_BLOCK_TEXT_AND_AUXILIARY_FOCUS_AUDIT_2026-10-19.md). The v2 remediation spec P4/I6/I7/I8 requires actual DOM event ownership, atomic inline-widget operations and one document-history operation per author gesture. A widget/auxiliary control must not borrow author field permissions. Conversely, valid native inline-widget deletion must still reach its registered editing host without falling into generic input persistence.

Reviewed actual branch sources of:
- `core/BlockReconciler.js` (prior strict `resolveEditableTarget` guard);
- `core/NativeInputController.js` and `core/NativeInputController.test.js`;
- `core/KeyboardRouter.js` and `core/KeyboardRouter.test.js`;
- native browser regressions in `tests/browser/native-tools.js`.

The TDD skill `.agents/skills/tdd/SKILL.md` was consulted. Tests were committed before the corresponding fixes and exercised at the public controller boundary.

## Finding WIDGET-DELETE-1 — strict widget ownership disabled supported native deletion (P2, regression)

The earlier ownership audit correctly changed `BlockReconciler.resolveEditableTarget(widgetRoot)` to reject inline-widget roots. However, `NativeInputController.#resolveNativeInlineOwner()` still used precisely `resolveEditableTarget(widget)`. This made the specialized `beforeinput deleteWordBackward` bridge return `null`, even when a live opted-in inline widget belonged to a registered rich-text host. Thus a previously supported native inline deletion could be silently bypassed.

**RED:** a new public `NativeInputController` test models the current strict resolver (widget root denied, ordinary parent field permitted). With the previous production implementation, the expected `capture → settle → route` sequence did not occur.

**Fix:** only in the deletion bridge, resolve the **parent of the live widget occurrence** as the authoring field rather than resolving the widget root. The existing checks still require `projection.resolveWidgetElement(target)`, a connected/editable occurrence, rich-text mode, a currently registered field, the same field element containing that occurrence, and inclusion in this editor's DOM. This does **not** restore general author-field permissions to widget labels or native controls.

**GREEN:** current production `NativeInputController` with the strict test resolver completes the expected deletion, reports one `committed` route and performs no generic projection persistence. Existing widget-control rejection and stale envelope tests remain green.

- [RED regression](https://github.com/Shelamkoff/editor/commit/765ab866524124fb0ce81834d494188c5ec550d0)
- [Production fix](https://github.com/Shelamkoff/editor/commit/4ba9e4207c8f4bf0f824f030141633c9dd424ca4)
- Browser scenario added to `tests/browser/native-tools.js`.

## Finding KEYBOARD-OWNER-2 — native block/widget buttons replayed canonical Undo (P2)

`KeyboardRouter.#ownership()` recognized input/textarea/select and inline-widget labels as auxiliary but omitted native buttons and role-buttons when not in a normal author editing host. A button within a fieldless block could therefore reach the generic `editor-chrome` branch and execute document `Ctrl/Meta+Z`. The inline-widget special case also treated a nested native button as document chrome instead of preserving its native-control ownership.

**RED:** the existing public `KeyboardRouter` history ownership regression was expanded to include `button`, `[role="button"]`, a button within an inline widget and a button in explicit `.oe-toolbar`. On the old implementation it failed because a normal native button claimed canonical history.

**Fix:** classify native and role buttons as auxiliary controls, including when contained by inline widgets. Preserve explicit toolbar chrome's existing document-history behavior by checking `.oe-toolbar`, `.oe-inline-toolbar`, `.oe-toolbox`, `.oe-settings-menu` and `.oe-slash-menu` before the generic button fallback. Existing real editing hosts and registered plain-text fields remain under their established owner branches.

**GREEN:** the focused public keyboard test now confirms native block/widget controls leave the history untouched, while a toolbar Undo remains handled exactly once.

- [Failing keyboard ownership test](https://github.com/Shelamkoff/editor/commit/7a297d06fa268be742d08407212fffbbde25c5e7)
- [Fixture selector correction](https://github.com/Shelamkoff/editor/commit/07834c303ac0f2f9a99c5877d44e70b96da4e611)
- [Production fix](https://github.com/Shelamkoff/editor/commit/813c91505da82ed7906f1870e810ba4344531155)
- Browser scenario added to `tests/browser/native-tools.js`.

## Verification

| Gate | Result | Evidence limit |
| --- | --- | --- |
| Native deletion with strict widget owner | **RED → GREEN** | Full current `NativeInputController` source/test executed in isolated V8; synthetic host |
| Existing `NativeInputController.test.js` | **29/29 passed** | Four Promise/microtask cases included via an adapter; not actual `node --test` |
| Existing `KeyboardRouter.test.js` | **42/42 passed** | Current class/test with real field and shortcut helpers in isolated V8 |
| Integration of exact `BlockReconciler.resolveEditableTarget` and `NativeInputController` methods | **Deletion bridge captured, settled, routed** | Real production method bodies with simulated mounted owner; generic persistence untouched |
| Parse of five edited source/test files | **5/5 passed** | ESM import/export stripped; no project TypeScript gate |
| Two authored full-browser cases | **Not run** | Native `beforeinput/input` widget deletion and Ctrl+Z button vs toolbar history |
| Full Node tests, TypeScript, package/docs gates | **Not run** | Complete checkout and dependencies unavailable in this environment |
| v1/v2 behavior parity, Undo/Redo acceptance | **Not established** | Requires native editor gestures and full local acceptance |

A local `git clone` is blocked by the container's lack of working DNS resolution for `github.com`. Connected GitHub source access is available and all commits are written to the requested branch, but synthetic V8 tests are not substitutes for the full package, browser, or declaration checks.

## Required follow-up

From a checkout with dependencies:

```sh
npm ci
node --test core/NativeInputController.test.js core/KeyboardRouter.test.js core/BlockReconciler.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
npm run test:docs
npm run docs:check
```

In Chromium, verify a live inline widget can be removed by native backward word deletion exactly once; deletion inside a widget's button must remain native-owned; Ctrl/Meta+Z on ordinary block/inline-widget buttons must not alter committed document history; the toolbar's Undo must still work. Also verify abort, remount, stale revision, backward Unicode selection and same-field/cross-field history restoration.

The changes did not alter the public editor schema or add another history engine. Each update used the latest file blob SHA, and no unrelated parallel agent code was overwritten.
