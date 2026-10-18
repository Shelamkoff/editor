# Rector v2 — BlockToolbar and InlineToolbar terminal event authority

**Date:** 2026-10-18  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `2b50328ee1ec34329cd0f6bab04f324defc5d642`

This continuation checked the remaining toolbar UI controllers for work that can occur after an editor's terminal `destroy()`. It is a v2 lifecycle invariant audit rather than a claim of full gesture-level v1/v2 parity. No new service, state owner, persisted schema or legacy adapter is introduced.

## T-LIFE-1 — BlockToolbar could reopen detached menus and process captured events (P2)

`BlockToolbar.showFor()` and `refresh()` already checked `#destroyed`, but `openToolbox()` and `openSettings()` did not. Their callbacks can be invoked directly or through a DOM handler captured before detachment. A retired BlockToolbar then tried to read its old selection, construct/present detached menu content and focus the old menu. Retained plus/settings button callbacks also read `selection.capture()` on mousedown and stopped click propagation after destruction. The menu's captured `keydown` listener could prevent default Arrow/Escape behavior on a detached control.

**RED:** instantiated the actual old `BlockToolbar` production class with a controlled DOM/Tooltip adapter. All **3/3** new tests failed on the pre-fix source: reopening menu after destroy, stale button mousedown recapturing selection, and retired click/keyboard callback consuming host events.

**Fix:** guard public menu/read-only methods and all captured BlockToolbar event callbacks at terminal state. In particular, check `#destroyed` **before** preventing default or stopping propagation in menu/button handlers. The normal live actions, session IDs and mounted DOM ownership are otherwise unchanged. Nested settings/toolbox item event callbacks already checked terminality but previously canceled browser events before that check; move their check before event consumption.

- [Regression tests](https://github.com/Shelamkoff/editor/commit/ddfd6d0356efa166080be734d414ea924c11a823) — `core/BlockToolbar.retired.test.js`
- [Implementation](https://github.com/Shelamkoff/editor/commit/ca54a6929ab1ece70159e7b54155bd26d0491760)

**GREEN:** **3/3** new checked-in test bodies passed using the final full BlockToolbar class source, actual Tooltip class source and a controlled document/element adapter.

## IT-LIFE-1 — InlineToolbar retained dropdown, shortcut and DOM callbacks after destroy (P2)

`InlineToolbar.openTool()` and existing action-selection leases check `#destroyed`, but `handleShortcut()`, `show()`, `setReadOnly()`, dropdown mouse/keyboard handlers and several selection listeners did not. A retained Mod+B could still ask for native formatting selection from a detached editor. Type-menu mousedown could still prevent default and call `selection.capture()`. The level selector could prevent native ArrowDown on a detached button. The public `show()` could still inspect browser selection after teardown.

**RED:** instantiated the actual unmodified InlineToolbar class with real `InlineToolMounts`, `InlineSelectionAuthority` and `Tooltip` sources in an isolated V8 adapter, plus one real configured tool. All **4/4** new regression bodies failed on the pre-fix source, covering shortcut, pointer, dropdown key and public presentation paths.

**Fix:** add early terminal checks to those entry points and captured event listeners, before reading range/DOM state or consuming user events. The existing tool mount revocation and action lease mechanisms remain intact.

- [Regression tests](https://github.com/Shelamkoff/editor/commit/b4e47c87192a2b255be1b2885f45344f025d3cdb) — `core/InlineToolbar.retired.test.js`
- [Implementation](https://github.com/Shelamkoff/editor/commit/26a80013bb13b7735a22583f60d1724cbeda9dca)

**GREEN:** **4/4** new test bodies passed against the final actual InlineToolbar production source and controlled DOM dependencies.

## Browser regression

Added a native-browser scenario to the existing `tests/browser/native-plugin-parity.js` test suite that mounts an editor, saves references to the BlockToolbar and InlineToolbar buttons, destroys the editor, dispatches late DOM click/mousedown/keydown events to the detached controls, and asserts that no event is consumed. The fixture was parsed for JS syntax, but **not run in Chromium** in this environment.

- [Browser fixture](https://github.com/Shelamkoff/editor/commit/8dbdf4bab371f62ad8d0f54771bd17669d253166)

## Execution boundaries

- Targeted **7/7** new unit-test bodies passed after production changes in isolated V8 using checked-in source. Pre-fix **7/7** reproduced invalid behavior.
- All **5** modified/new production/test/browser JavaScript files passed syntax parsing in V8 after static ESM-import adaptation.
- No installed `npm ci`, full `node --test`, `npm run typecheck`, full `npm test`, native Chromium/Firefox/WebKit, release package, IME or full historical v1 comparison was executed. DOM fixtures test callback order/ownership; they do not establish native accessibility or focus behavior.

## Full release gate

```sh
npm ci
node --test core/BlockToolbar.retired.test.js core/InlineToolbar.retired.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Additionally in real browsers: dispatch a captured button/mousedown listener after editor destruction, hold Mod+B over editor teardown, verify no focus/selection reacquisition by detached menus, test read-only transitions, and alternate creation/destruction of independent editors within one document.

**Result:** two confirmed toolbar lifecycle regressions fixed with test-first evidence. Release stability and complete behavioral parity with Rector v1 remain unverified.
