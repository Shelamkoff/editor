# Rector v2 — trigger commit and inline caret ownership audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `2918539e2ba4c3afdc7c8fccde51ce0628af47db`  
**Scope:** `InlineCommandController`, `InlineTriggerController` and their existing keyboard/selection integration. No public API compatibility shim or persisted-format change.

## Required ownership invariants

1. Once an inline text insertion has committed, trigger-refresh notifications are only valid while the originating editor and control mode still exist.
2. When a trigger's `session.commit()` successfully creates a canonical edit, its initiating key must not fall through to another structural edit, regardless of a plugin callback's `'pass'` or omitted return.
3. A single trigger session may attempt at most one in-flight commit. A synchronous nested attempt must not author another widget, and a later independently published successor must remain usable.
4. A successful inline command must not reclaim native/logical caret ownership when an application commit observer has already moved focus to another block or field, even though generation/mode epoch did not change.

These rules complement the existing post-destroy and read-only guards; they do not establish complete v1/v2 behavior by themselves.

## Finding F1 — fresh-text completion notifies retired trigger owner (P2)

`InlineCommandController.insert()` invoked `onFreshText` after a successful rich-text insert even if the synchronous commit observer, control-mode callback, or native caret-focus callback retired its editor. The command's older post-commit selection guard did not protect the subsequent notification.

**RED:** Three real-class regression scenarios failed on the retrieved pre-fix implementation. The observer received a fresh-text notice from a retired owner. An additional control case kept live successful behavior.

**Fix:** Check the captured runtime generation/mode and current caret owner again before publishing `onFreshText`. Preserve the already completed canonical action's success result.

- [Regression tests `2d8af44`](https://github.com/Shelamkoff/editor/commit/2d8af44865aedb52d5dcb05d7a4e08b63aae79ab)
- [Fix `cdc1a49`](https://github.com/Shelamkoff/editor/commit/cdc1a49463bda63ee80e899438e40346fdb7f8ad)

## Finding T1 — successful trigger commit can fall through to Enter split (P1)

A custom `InlineWidgetRuntime.onTriggerKeydown()` may synchronously call `session.commit()` and return `'pass'` (or no value). Previously the controller treated `'pass'` as permission to continue ordinary Enter editing, despite a successful model commit. This could cause a second structural edit from one key.

**RED:** Two tests for successful commit plus `'pass'`/undefined and one test with a reentrant successor all reproduced the leaked, unconsumed Enter. The failed-commit control case already passed, confirming that unsuccessful actions retain normal fall-through.

**Fix:** Use a per-session successful-commit WeakSet to authoritatively own the triggering key, independent of the extension's `'handled'`/`'pass'` hint. The callback remains type-checked, and a destroyed/retired controller still cannot consume captured native input.

## Finding T2 — a trigger session can synchronously reenter its own commit (P1)

The `session.commit` closure did not mark the session in-flight before calling `commands.commitTrigger`. The host callback could call that same session's `commit()` again, causing two canonical edits from a single session before the first response. The old active/session identity checks were insufficient because neither identity had been retired yet.

**RED:** A test made the first commit synchronously invoke another commit; the nested call wrongly succeeded. A separate test ensured that a throwing commit can release its busy lease and retry.

**Fix:** Guard in-flight and completed commits per session, with `finally` release for synchronous failure. Recheck abort, read-only, mode epoch and active session after live-range inspection and before command execution. A successor query gets its own independent lease even if reentrant and may still commit.

- [Enter ownership regressions `54904b2`](https://github.com/Shelamkoff/editor/commit/54904b274c63a40d288c91066758af3e9ff6981a)
- [Reentrant commit regressions `7747fb8`](https://github.com/Shelamkoff/editor/commit/7747fb81d5ac87442172ba24c37e449354e24539)
- [Both fixes `d7ff715`](https://github.com/Shelamkoff/editor/commit/d7ff715ac8001974ea2cecd77b64a775372e0353)
- [Successor and live-range regression guards `8c9368c`](https://github.com/Shelamkoff/editor/commit/8c9368c4d4c365b55a7ad6a5e91fec64c381fd3f)

## Finding F2 — successful inline edit steals newer author caret (P2)

The previous caret lease covered only editor health, generation and mode epoch. An application `onCommit` observer could synchronously move the author's logical selection to another block or another field without changing these values. `InlineCommandController` would then unconditionally call `selection.setCaret` for the original insertion target. Also, selection inspection itself could retire the editor.

**RED:** Five actual-class tests failed for insert, Paste, typed-pattern conversion, a sibling field and synchronous teardown during post-commit `capture()`.

**Fix:** Before restoring the caret, read the current logical bookmark under a live lease. A non-null author selection pointing into a different block/field wins; a revoked owner or failing post-commit capture does not initiate stale focus work. When projection leaves no logical bookmark, normal authoring caret restoration remains permitted. Guard fresh-text notifications with the same owner check.

- [Regression tests `2d8a1aa`](https://github.com/Shelamkoff/editor/commit/2d8a1aa295343487c71d4e4fd7edcefef5bf5e47)
- [Fix `d681d6b`](https://github.com/Shelamkoff/editor/commit/d681d6b2973e07c922eeb366e190b8370f97188a)

## Focused verification

| Checked-in module | Tested cases | Result |
| --- | ---: | --- |
| `core/InlineCommandController.test.js` | 41 | 41 passed |
| `core/InlineTriggerController.test.js` | 27 | 27 passed |
| `core/KeyboardRouter.test.js` | 34 | 34 passed |
| `core/SelectionController.test.js` | 10 | 10 passed |
| **Total** | **112** | **112 passed** |

Seventeen unit regression cases were added in this pass. Twelve failed against the targeted pre-fix source, while the remaining cases check preserving successful behavior, failure recovery and independent successor ownership.

All cited focused executions used **actual retrieved JavaScript source for the current repository classes** in an isolated V8 test executor with controlled runtime/DOM/AbortController/selection adapters. For keyboard checks the actual `shared/textOffset.js` and `shared/shortcutKey.js` source was evaluated; the native browser was not exercised. These results are narrower than a full checkout/Node test runner and do **not** establish real Chrome, native IME, real clipboard, generated declarations, npm-package or end-to-end v1/v2 parity.

## Required full local acceptance at final HEAD

```sh
npm ci
node --test core/InlineCommandController.test.js core/InlineTriggerController.test.js core/KeyboardRouter.test.js core/SelectionController.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Add or run native Chrome acceptance for a successful custom trigger commit whose key callback returns `'pass'`; reentrant repeated session commit; commit-observer focus switching to another block/field; and editor destruction during fresh-text notification scheduling. Verify one committed action per key, no native Enter split after a successful mention insertion, no stale focus restoration, and correct independent successor query operation.

**Conclusion:** Four confirmed synchronous lifecycle/ownership findings corrected with targeted regressions; library-wide stability and full v1 behavioral parity still require the complete local/browser acceptance on the actual HEAD.
