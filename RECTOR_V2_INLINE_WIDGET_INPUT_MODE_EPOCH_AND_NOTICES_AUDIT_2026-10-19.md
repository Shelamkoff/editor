# Rector v2 — inline widget input authority, mode epoch and native notices

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `d25cd48f6260738cf784cf49ba8d099f9d7053ae`  
**Primary source:** `core/InlineWidgetInputController.js`  
**Regression suite:** `core/InlineWidgetInputController.test.js`

## Scope and coordination

Continued the Rector v2 architecture/behavioral-parity audit following the repository's `RECTOR_V2_REMEDIATION_SPEC.md` C5/C6 protected mutation and native input ownership contracts and TDD skill. The just-completed `SlashCommandController` ownership tests/fixes were found in parallel commits at the beginning of this pass, so those files were not overwritten or reimplemented. The new scope is inline widget native input, editor mode authority, and delayed notification/focus callbacks.

All source updates were committed directly to `refactor/rector-v2-architecture` using the latest remote blob SHA. The regression test boundary is the public `InlineWidgetInputController` instance, its beforeinput listener, `completeNativeDeletion()` and observable native caret/plugin notification callbacks.

## Finding INL-INPUT-1 — destroyed inline controller still consumed an obsolete beforeinput (P2)

Previously an inline widget plugin's synchronous `editing.handle()` could call `InlineWidgetInputController.destroy()` while returning a valid action. The controller then invoked `#claimBeforeInput(event)` **before** checking whether its owner still existed, consuming a browser-native event even though the editor was detached. This was distinct from legitimate teardown *inside* the already accepted `onOwnedBeforeInput` callback, which must continue to suppress the event that was claimed while live.

**RED:** a test destroys the controller inside the editing callback, returns `{kind:'remove'}`, and observes `preventDefault`/propagation suppression despite zero canonical author edits. The same test passes on the fixed implementation and asserts the controller no longer claims that event.

**Fix:** before consuming the event, verify current controller signal, read-only state, document generation/revision, editor mode epoch and widget identity; recheck after the claim callback before canonical mutation. Existing legitimate accepted events still claim and settle once.

- [RED cases `1efe52a9`](https://github.com/Shelamkoff/editor/commit/1efe52a92300b27a6fc834c94a649aca3c257f20)
- [Fix `5bbc1a64`](https://github.com/Shelamkoff/editor/commit/5bbc1a64be19aa449e5e8c977f8c6cf045d2fe7c)

## Finding INL-INPUT-2 — read-only round trip retained stale input authority (P1/P2)

The original pre-commit guard compared generation/revision and current read-only value but **not** the monotonic control-mode epoch. An extension could transition read-only true→false during `editing.handle()`, returning to an editable final value with unchanged canonical revision and generation; the old event was still consumed and could commit the outdated action.

**RED:** the test performs this round trip synchronously inside `editing.handle()`; before the fix, the old event was consumed, and post-fix the original event is not claimed or committed.

**Fix:** capture `runtime.modeEpoch` alongside generation/revision at the same admission boundary and require it to remain unchanged before claiming and again after the claim callback.

- [RED cases `1efe52a9`](https://github.com/Shelamkoff/editor/commit/1efe52a92300b27a6fc834c94a649aca3c257f20)
- [Fix `5bbc1a64`](https://github.com/Shelamkoff/editor/commit/5bbc1a64be19aa449e5e8c977f8c6cf045d2fe7c)

## Finding INL-INPUT-3 — deferred caret could restore after widget resolver teardown (P2)

After an accepted canonical inline edit, `#withCaret` schedules a microtask for native selection restoration. That task checks owner state and native selection early, but then calls `projection.resolveWidgetElement()`, an external callback that may synchronously destroy the inline controller while returning the previously valid element. The original code continued into `native.setBaseAndExtent()` and moved the old caret after teardown.

**RED:** a new async test tracks a committed update and destroys the controller inside this resolver during the deferred callback. The original implementation still changed the native selection. The correction prevents that stale change and preserves the committed canonical edit.

**Fix:** revalidate scope, read-only state, generation, revision and mode epoch immediately after the potentially reentrant projection resolver, before modifying native selection.

- [RED `f331933f`](https://github.com/Shelamkoff/editor/commit/f331933f8161f5c416f12cf33903d1ee2cb09b7d)
- [Fix `0f526705`](https://github.com/Shelamkoff/editor/commit/0f526705f845d1daefb979b23a5b9ea0d6e8d60b)

## Finding INL-INPUT-4 — native selection restoration emitted plugin notices after destroy (P2)

`#settleNativeNotices()` begins with a living-controller guard, then calls native `Selection.setBaseAndExtent()` to recover the inline label caret and emits plugin-facing `notifyNativeInlineEdit()` notices. Native focus/selection APIs can synchronously invoke listeners that destroy the editor. Previously notices were still emitted for the retired controller's plugin instances after the selection call returned.

**RED:** test commits a native sidecar update and destroys the inline controller inside `setBaseAndExtent()`. Against the initial source, the model remained committed but the retired instance still received a plugin notice. The intended behavior preserves the committed model while stopping obsolete notifications.

**Fix:** recheck owner liveness after native Selection observation/restoration, after `onNativeSettled` and before independently notifying each remaining widget. No stale plugin observer is invoked after the retired owner loses its scope.

- [RED `cf94e75f`](https://github.com/Shelamkoff/editor/commit/cf94e75fcfc47b5679e3b4590d1efab5938ace4f)
- [Fix `92f0bb1a`](https://github.com/Shelamkoff/editor/commit/92f0bb1af3c583cce908028560c4791a2f5e28ef)

## Focused RED / GREEN verification

The **same complete 34 test bodies** from `core/InlineWidgetInputController.test.js` were executed against two actual fetched production revisions, using `shared/containedTextRange.js`, `shared/editableFields.js`, `shared/cloneEditorData.js`, `shared/jsonData.js` and `shared/synchronousResult.js` from the repository:

| Revision | Tests | Assertions | Failed new cases |
| --- | ---: | ---: | ---: |
| Starting source `81d8fd1bb19e0ef80ac955330e8d04c10e891e5a` | 30/34 passed | 138 | 4 |
| Updated source `daec29cc99e7e9a7a24fc4a04ce6e8525ffcaa11` | **34/34 passed** | **145** | 0 |

The four original failures were precisely the new regressions for post-destroy input consumption, mode round trip, stale deferred caret, and post-teardown native notices. All pre-existing tests remained green. The tests ran under isolated V8 with a synthetic AbortController/microtask and Node-style assertion adapters, **not** the repository's full `node --test` runner. The existing test fixture was not changed or weakened.

## Acceptance remaining

```sh
npm ci
node --test core/InlineWidgetInputController.test.js core/NativeInputController.test.js core/InlineProjectionRuntime.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Chromium acceptance must verify genuine `beforeinput` delivery and native selection callbacks during inline widget authoring, widget editing after `readOnly` transitions, history/Redo caret placement, plugin teardown during label restoration, and no stale callbacks into retired occurrences. The test environment used here does not provide native browser DOM/Selection/IME or full package consumers.

**Conclusion:** four verified inline-widget lifetime/authority faults were corrected with failing-first regressions; full Rector v2 stability and complete user-visible parity with v1 remain unproven until native/local project acceptance completes.
