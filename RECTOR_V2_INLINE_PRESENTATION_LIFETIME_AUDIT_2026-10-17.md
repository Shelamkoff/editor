# Rector v2 — inline presentation ownership and mount authority audit

**Date:** 17 October 2026  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `b80da728002f1d40f4a64b5e76feb4407fd91ccc`  
**Last production/docs adjustment before this report:** `7ceb57632367eacf48612bb8ba1b1eb1ac5d5f4f`  
**v1 comparison reference:** `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

## Scope

A focused audit of three **previously under-tested** ownership transitions used by inline tools:

- `InlinePopupHost`: independent cleanup of popup resources and ownership after external reparenting.
- `Tooltip`: stale or reentrant label / layout callbacks after another tooltip acquired presentation authority.
- `InlineToolMounts`: mutation authority during `bindSelectionPort` and `onMount` lifecycle callbacks.

The audit followed actual source from the current refactoring branch and consulted existing control/lifecycle tests and v2 remediation requirements. New cases were committed **before** each production fix and executed on the corresponding previous production implementation to distinguish confirmed failures from speculation. No v1 shim or new serialized document format was introduced.

## P1 — InlinePopupHost incomplete cleanup and foreign DOM removal

The previous `#hide()` reset logical ownership and executed `AbortController.abort()`, `MutationObserver.disconnect()`, outside-listener removal and `popup.remove()` as a single sequential block. A throwing observer or listener removal prevented subsequent release of the popup; a surface reparented outside the editor was still removed on close.

**RED:** 11/14 focused tests passed before fixing; three new tests reproduced observer-disconnect failure, outside-listener failure and adopted popup removal.

**Fix:** independently attempt each cleanup operation, contain/reveal its error without aborting subsequent releases, and remove an owned transient popup only while it is still a direct child of the original editor root. The registered author cleanup runs once and remains independent of DOM/observer failures; existing reentrant successor protection is preserved.

- [Regression tests](https://github.com/Shelamkoff/editor/commit/5abc6b32ebe1fdc1f69e0c8bbe780e712cf39437)
- [Production fix](https://github.com/Shelamkoff/editor/commit/3483b2f9e759a86ecbd75cd622fa374a01d91ac9)
- [Type annotation](https://github.com/Shelamkoff/editor/commit/7ceb57632367eacf48612bb8ba1b1eb1ac5d5f4f)

**GREEN: 14/14** focused tests pass against the updated production code.

## P2 — Tooltip reentrant labels and layout stole newer tooltip state

The previous per-timer epoch checked for stale callbacks only on entering a timer. Calling an extension's bound `label()` could itself open a successor tooltip; after returning, the old event blindly called `show()` and superseded it. A synchronous reentry during `anchor.getBoundingClientRect()` similarly created a newer timer but allowed the old, already-started callback to publish stale content and ARIA state.

**RED:** 7/9 focused tests passed; two new scenarios reproduced both reentrant races.

**Fix:** capture the presentation epoch **before** evaluating a bound label and refuse stale results; recheck the epoch and destruction state after layout measurements before publishing a tooltip. This preserves the earlier fix against obsolete `mouseleave` / `blur`, teardown and throwing label callbacks.

- [Regression tests](https://github.com/Shelamkoff/editor/commit/25e257b07833f0bf01dcb31ffa0955643a80c45a)
- [Production fix](https://github.com/Shelamkoff/editor/commit/ce9a836bd3c3884d9b48b8c731d77e6ee09c8112)

**GREEN: 9/9** focused tests pass.

## P3 — InlineToolMounts setup hooks were outside observation authority

`InlineToolMounts.destroy()` already ran lifecycle cleanup under `runtime.observeExtension()`, but `InlineToolMounts.start()` called `bindSelectionPort()` and `onMount()` directly. Consequently those extension hooks executed while the runtime could be idle and could reenter persisted document commands during toolbar construction. The remediation specification requires extension lifetime callbacks to respect phase/authority boundaries.

**RED:** 9/10 focused tests passed; a new guard-aware mount test showed both acquisition hooks escaped observation authority and permitted live editor mutation attempts.

**Fix:** run both acquisition hooks through the existing `observeExtension` gateway, while retaining synchronous-result enforcement, started-owner ownership, immediate revocation and independent teardown. Built-in inline tool `onMount` implementations (including color picker, font size and script tools) were inspected and do not rely on a persisted mutation being allowed during initial mount.

- [Regression test](https://github.com/Shelamkoff/editor/commit/d15a59f97141bd7312f57136804833e0f7ee7b22)
- [Production fix](https://github.com/Shelamkoff/editor/commit/34d1de2e66b393bee8649f8e2608f107edaaf62c)

**GREEN: 10/10** focused tests pass.

## Test evidence and outstanding acceptance

| Committed test file | Before | After | Boundary |
|---|---:|---:|---|
| `core/InlinePopupHost.test.js` | 11/14 | **14/14** | Actual production class in V8; controlled DOM, MutationObserver and AbortController |
| `core/Tooltip.test.js` | 7/9 | **9/9** | Actual production class in V8; deterministic timers, labels and DOM |
| `core/InlineToolMounts.test.js` | 9/10 | **10/10** | Actual production class; real synchronous-result helper; controlled observation authority |
| **Total** | 27/33 | **33/33** | Focused targeted checks only |

Full project gates **not executed in this pass**: `npm ci`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package`, `npm run docs:check`. No real Chromium/Firefox/WebKit inline-panel rendering or physical keyboard/IME tests were run. The V8 adapters validate the confirmed lifecycle cases, not the complete native DOM or installed-package boundaries.

These are scoped stability fixes. They **do not justify a claim that Rector v2 as a whole is release stable or fully behaviorally equivalent to v1**. Full local acceptance and broader differential testing remain required.
