# Rector v2 — menu keyboard navigation and disabled-action ownership audit

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `3481aaae65f5ea6fd7d41002c66b1f3e9b0e79c6`

## Scope and contract

Reviewed the existing native menu and toolbar keyboard flows following `RECTOR_V2_REMEDIATION_SPEC.md` (author gestures, native keyboard ownership and user-visible behavioral parity) and `.agents/skills/tdd/SKILL.md`. This pass changes only `shared/menuKeyboardNav.js` and `core/BlockToolbar.js`, with a new shared unit suite and added native-browser regression cases.

The inline toolbar uses the shared `handleMenuKeydown()` helper through its public plugin-kit export; the block settings/toolbox menus have their own `BlockToolbar.#menuKeydown()` path. Both should treat a handled menu key as owned by the menu rather than allowing the same key to reach the editor's or application's parent listener. Native disabled buttons and `aria-disabled` options must not be focused during arrow navigation. The first ArrowUp on a focused menu container should select the last available item, consistent with the shared helper's existing semantics.

All writes were committed directly with a current GitHub blob SHA; no parallel agents' changes were overwritten.

## Finding MENU-KEY-1 — shared Home/End did not stop keyboard bubbling (P2/P3)

The shared helper already consumed ArrowUp, ArrowDown and Escape with `preventDefault()` and `stopPropagation()`, but only called `preventDefault()` for Home and End. A parent application/editor keydown listener could therefore react to an already-handled menu navigation key.

**RED:** added `shared/menuKeyboardNav.test.js`. On the unmodified source, the Home/End event ownership test failed, while the previously supported Arrow wrap-around and Escape behavior passed.

**Fix:** stop propagation of Home/End once the menu owns those keys, matching the existing Arrow/Escape event contract.

- [RED tests `b12e8331`](https://github.com/Shelamkoff/editor/commit/b12e83315627f1fbd1cf202af3071377d9cdd38a)
- [Production fix `91c2690e`](https://github.com/Shelamkoff/editor/commit/91c2690e91337788680f135b9deb0188d826d5ac)

## Finding MENU-KEY-2 — default menu navigation included native disabled buttons (P2/P3)

The helper's default selector excluded `[aria-disabled="true"]`, but not a native `button:disabled`. Attempting to focus a disabled button can fail without moving focus to another enabled action, leaving Arrow navigation stuck.

**RED:** the new default-selector regression demonstrated navigation stopping on a disabled native item instead of selecting the next enabled menu action.

**Fix:** default to `[role="menuitem"]:not(:disabled):not([aria-disabled="true"])`. Existing explicit custom item selectors remain caller-owned and unchanged.

**GREEN:** all **4/4 new `shared/menuKeyboardNav.test.js` test bodies, 24 assertions** pass against the actual fixed source in isolated V8. On the old helper 2/4 cases failed and 2/4 passed, providing meaningful RED controls.

## Finding MENU-KEY-3 — block settings/toolbox used a divergent keyboard contract (P2/P3)

The dedicated `BlockToolbar.#menuKeydown()` had the same native-disabled omission and did not stop propagation of handled Arrow, Home, End, Enter/Space, submenu, or Escape keys. Unlike the shared helper, when the focused element was the menu container itself (`index === -1`), ArrowUp incorrectly selected the **first** action rather than wrapping to the last action.

**RED:** evaluated the exact old private menu handler text within a minimal class shell using synthetic DOM menus. Four focused cases (ArrowUp from no current item, Home, End and ArrowDown with a disabled first item) all failed their expected focus and/or propagation behavior.

**Fix:** apply the same native `:disabled` filter, choose the last available item for an unfocused ArrowUp, and centralize consumption of every handled menu key through `preventDefault()` plus `stopPropagation()`. Existing submenu/selection logic, click behavior, canonical document commands and translations are unchanged.

- [Native browser regressions `51694b39`](https://github.com/Shelamkoff/editor/commit/51694b3913e9af295078dd30ffd5dce2ad334b27)
- [Production fix `f8866f57`](https://github.com/Shelamkoff/editor/commit/f8866f5787a6ec4a055f070564071233724c56e7)

**Focused verification:** the same four cases now pass with the real current `BlockToolbar.#menuKeydown()` source, adapted only into an isolated class shell with a fake menu and activeElement. The complete `tests/browser/native-block-menus.js` file's syntax also parses successfully after import adaptation. The two newly added browser cases have **not** run in Chromium; their definitive native acceptance remains pending.

## Verification and limits

| Verification | Focused result | Limits |
| --- | --- | --- |
| Shared menu helper | **4/4 test bodies, 24 assertions** | Actual helper + test source, isolated V8 |
| Original shared helper RED | 2 failures for intended behavior | Isolated V8 |
| Block toolbar four menu cases | **4/4** after fix, **0/4** before fix | Actual extracted private method under synthetic DOM |
| Native browser regression additions | 2 authored, source syntax verified | Chromium **not run** |
| Full `node --test`, npm scripts, TypeScript and package import checks | **Not run** | Requires complete local project/dependencies |
| Full Rector v1/v2 behavioral parity | **Not established** | Requires user-gesture acceptance matrix |

The browser tests live in `tests/browser/native-block-menus.js`. They open the actual block settings menu, navigate ArrowUp/Home/End with the browser, verify no propagation to a parent editor listener, and check navigation past a temporarily native-disabled action.

## Local acceptance gates

```sh
npm ci
node --test shared/menuKeyboardNav.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

For Chromium, include `tests/browser/native-block-menus.js`, the inline-toolbar dropdowns in `tests/browser/native-panel-keyboard.js`, browser Enter/Space submenu action dispatch, and focus restoration when a menu closes. Verify handled menu keys never cause independent structural edits or a second global shortcut.

## Conclusion

Three coherent menu keyboard ownership/parity bugs were reproduced and fixed without changing the editor's document schema or public authoring API. Their focused checks are green. Global library stability, full native browser behavior and Rector v1/v2 parity remain unverified until final local acceptance.
