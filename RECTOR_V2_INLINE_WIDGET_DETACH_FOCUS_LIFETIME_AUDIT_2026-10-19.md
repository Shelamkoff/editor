# Rector v2 — inline widget detachment, reentrant updates and deferred-focus lifetime

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `a6e99af474433bbfef5d4152300f1b6e876fd0af`  
**Code checkpoint:** `3ec381ab7637bc3942409e7fb2dbca2ea1676c0c`

## Contract and scope

Continue [the previous widget deletion/keyboard ownership audit](RECTOR_V2_WIDGET_DELETION_KEYBOARD_OWNERSHIP_AUDIT_2026-10-19.md). Check remediation spec P3/P4, I2/I6/I7/I8: a live mounted inline widget must retain its valid edit/caret route; a detached or retired occurrence must not inherit it; asynchronous caret restoration must not reclaim a subsequent author/native control focus; one author gesture must remain a single canonical history operation.

This pass focuses on `core/InlineProjectionRuntime.js`, `core/InlineWidgetInputController.js`, `core/InlineWidgetInputController.test.js`, and `tests/browser/native-tools.js`. No new state store or public API was introduced.

## Finding WIDGET-LIFETIME-1 — detached occurrences retained DOM/selection authority (P2)

`InlineProjectionRuntime.resolveWidgetElement()` checked the current inline occurrence and `entry.fieldElement.contains(entry.element)`, but not whether that field and widget were still connected to the owning document. Removing a block from the DOM leaves this containment relation intact: the widget is still a child of its detached field. A retained mapping could therefore return a widget that is no longer mounted.

`resolveWidgetInputTarget()` had the same problem in its internal `ownedEntry` lookup and final field/selection validation. A detached widget could still receive an inline input or caret target while its old object remained in the runtime's current map.

**RED:** exact original method bodies were evaluated against a controlled current field/widget map. Before detachment both public resolvers accepted the widget; after detachment they still accepted it. Moving an occurrence to a different field was also tested as an independent ownership boundary.

**Fix:** require `entry.fieldElement.isConnected`, `entry.element.isConnected` and live containment for `resolveWidgetElement` and `resolveWidgetInputTarget` (including the internal lookup and final validation). This leaves a still-mounted occurrence valid while rejecting stale detached/reparented roots.

**GREEN:** same exact current methods: two connected resolutions succeed; two detached resolutions and two foreign-field resolutions are rejected.

- [Browser regression first](https://github.com/Shelamkoff/editor/commit/69a441ded676811e6a5b91dec3560cbf0f33b4b8)
- [Production fix](https://github.com/Shelamkoff/editor/commit/b1106660feb75d838a819c23b9744eb7cd8f1bd1)

## Finding WIDGET-LIFETIME-2 — deferred inline caret could steal newer native-control focus (P2)

After an immediate inline editing action, `InlineWidgetInputController.#withCaret()` captures logical field, revision, widget instance and DOM Selection boundaries, then queues a microtask to restore the native caret. The former implementation verified those snapshots but did **not** verify that `document.activeElement` was still the same element.

A button may take focus between the accepted edit and the queued microtask while the browser's Selection remains inside the old authoring field. The queued callback could then call `setBaseAndExtent` or `selection.setCaret` and reclaim focus after an independent native gesture.

**RED:** a new async test first failed for an accepted `update` action with unchanged native Selection and focus transferred to a button. It also exercises the `remove` action's deferred logical caret route.

**Fix:** snapshot the active element after the synchronous accepted author operation. Reject queued native/logical caret restoration if that focus owner has changed, with a second check after widget-resolution callbacks that may synchronously transfer focus or retire the owner. Existing generation, revision, mode-epoch, field identity and native selection checks remain in place.

**GREEN:** the 35-case `InlineWidgetInputController` suite, including the new focus-handoff case, passes under an isolated V8 adapter. Normal unchanged-focus inline caret restoration remains covered by the existing suite.

- [RED async regression](https://github.com/Shelamkoff/editor/commit/0c284cc55c2e078690430288a9e9bc8b1857ad31)
- [Production fix](https://github.com/Shelamkoff/editor/commit/a98b92a82e42e2b14fa93810b8181bbe14e566d5)
- [Browser focus-handoff regression](https://github.com/Shelamkoff/editor/commit/222c7f45af2e0204f708cf62798c9fbcc4d43ceb)

## Finding WIDGET-LIFETIME-3 — stale field could still receive plugin update and settle cache (P2)

`InlineProjectionRuntime.finalizeNativeInlineUpdates()` checks widget instance identity and containment. It formerly lacked connectivity checks and therefore could call a plugin's `instance.update()` after its editing host was detached. It could also continue cache settlement after the plugin's own `update()` callback detached the block or widget.

**RED:** exact original method with a controlled current instance invoked `update('Next')` even when `entry.fieldElement.isConnected === false` and `entry.element.isConnected === false`, then completed without error.

**Fix:** require field/widget connectivity before invoking the plugin. Recheck connectivity, instance identity and current-state ownership after `instance.update()` and again after setting widget marker attributes. A stale operation throws before updating the stored canonical inline data cache. The transaction owner is responsible for projection recovery on such failures.

**GREEN:** three focused original-method scenarios were re-executed:
- disconnected at entry: zero plugin calls; operation rejected;
- connected throughout: one plugin call; cache updated normally;
- disconnect during plugin callback: operation rejected before writing updated cache or marker.

- [Disconnected widget/cache browser regression](https://github.com/Shelamkoff/editor/commit/4ee493f6cbe8d173d41dbe9be80519e2f798057d)
- [Production fix](https://github.com/Shelamkoff/editor/commit/df5b3ef73319a5c489c3ddf064e880314b646382)
- [Browser reentrant detachment/cache regression](https://github.com/Shelamkoff/editor/commit/3ec381ab7637bc3942409e7fb2dbca2ea1676c0c)

## Verification and limitations

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Original projection resolvers after detach | **RED** | Exact public method source, simulated live map/DOM |
| Current projection resolvers (connected/detached/reparented) | **6/6 focused conditions passed** | Exact method bodies, simulated DOM |
| Original native inline cache settlement after detach | **RED** | Real `finalizeNativeInlineUpdates` method in synthetic owner |
| Current cache settlement (detached/live/reentrant-detach) | **3/3 passed** | Real method body under controlled runtime |
| `InlineWidgetInputController.test.js` | **35/35 passed** | Actual current controller/test code in isolated V8 with Promise/microtask adapter |
| `NativeInputController.test.js` | **29/29 passed** | Actual source/tests in isolated V8 |
| `KeyboardRouter.test.js` | **42/42 passed** | Actual source/tests with shared shortcut/field helpers in isolated V8 |
| Source/test syntax validation | **8/8 passed** | V8 parse after stripping ESM imports/exports; not TypeScript |
| Standalone Chromium DOM smoke | **Passed** | Headless Chromium: after detach, `field.contains(widget)` stays true while both `isConnected` properties turn false; external-button focus retained the existing native Selection |
| New actual Rector browser scenarios | **Authored, not run** | Project/browser harness not executed |
| Real project `node --test`, typecheck and full browser/docs/package gates | **Not run** | Complete checkout and installed project dependencies unavailable |
| Full v1/v2 behavioral parity and one-operation Undo/Redo across remount | **Not established** | Requires complete native gesture/History acceptance |

The standalone Chromium smoke uses DOM only and does not load Rector. Connected GitHub file/commit tools were used to read and write this branch; container GitHub cloning has remained unavailable.

## Acceptance steps

```sh
npm ci
node --test core/InlineWidgetInputController.test.js \
  core/NativeInputController.test.js core/KeyboardRouter.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:types
npm run test:package
npm run test:docs
npm run docs:check
```

In full Chromium acceptance specifically check: remove/reinsert inline widget; detach a block without immediately disposing its projection; await a native edit after a different button takes focus; destroy/recreate the same block ID; update callback that reparents its widget; Undo/Redo before and after projection reconciliation. Verify widget payload, logical caret, exact DOM ownership, single history entry, and no native-control focus theft.

All files were committed directly with per-file current blob SHAs, without force push or unrelated file overwrites.
