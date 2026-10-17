# Rector v2 — LogicalSelection, InteractionState and EditorViewModel focus authority recheck

**Date:** 17 October 2026  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `8204be440241d17ed781b2a9b7d50b24e704c0f9`  
**Last code/test commit in this pass:** `9efda5fe2d2eb5a90cbfdcaa59773d9001f7ec08`  
**v1 comparison baseline:** `master` `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`

## Goal and evidence limits

This independent pass continued Rector v2 stability auditing beyond the prior clipboard, inline-tool, animation and media checks. It focused on the authority of logical bookmarks, explicit keyed field focus, current-block changes and non-mutating failures. These requirements are relevant to Undo/Redo, type conversions and dynamically mounted fields in all 21 built-in block types.

**Evidence:** New Node-compatible tests invoked actual production `LogicalSelection`, `InteractionState`, `EditorViewModel` and `shared/textOffset` methods with a deterministic owning-DOM/native-selection adapter. The committed tests reproduced failures on the prior production source, then passed after the corresponding fixes. **12/12 focused test cases PASS** on the final code. The browser regression in `tests/browser/native-plugin-parity.js` was syntactically checked, **not run in Chromium**. The pass does not establish full v1 behavioral parity or overall library release stability.

## LS1 — stale explicit bookmark redirected into the first surviving field

`LogicalSelection.#resolvePoint()` resolved an unknown, explicitly specified `fieldKey` with `fields[0]`. A restored bookmark for a deleted caption could silently select another valid field, such as a title, while reporting a successful restoration.

The runtime now returns `null` for a non-empty, unknown field key. Implicit/default-field resolution remains available when no key was requested.

- [RED regression + valid-field control](https://github.com/Shelamkoff/editor/commit/9420736b4b72d2d593780ed254d8f0c8a37d1dd0)
- [Fix](https://github.com/Shelamkoff/editor/commit/f18c5e50c0868e69b3875e449d7da73bcf62a562)

## LS2 — rejected explicit caret request erased existing native selection

When `LogicalSelection.setCaret()` could not find an explicitly keyed field, it returned `false` but still called `#clearNativeSelection()` on the existing editor range. The author lost the current selection despite no new caret being set.

The fieldless/default caret behavior retains its previous cleanup path. Explicitly missing field keys now reject without clearing the selection.

- [RED regression](https://github.com/Shelamkoff/editor/commit/441346f275328ad2a44b9dab6bf014ddf297a177)
- [Fix](https://github.com/Shelamkoff/editor/commit/879e43517bd08a6c4317eba8aad674f96da84a9b)

## LS3 — partially stale ranges triggered plugin focus before validation

`LogicalSelection.restore()` focused the anchor's editable field **before** resolving the range's focus endpoint. If that second field had been removed, restoration failed after a side-effectful plugin `focus()` invocation on the surviving anchor.

The code now preflights **both keyed endpoints before invoking plugin focus**. It resolves again after the plugin focus phase to preserve the existing post-focus DOM validation behavior.

- [RED test](https://github.com/Shelamkoff/editor/commit/654d959a2ffcc8aca867696f1e11e80930379c5f)
- [Fix](https://github.com/Shelamkoff/editor/commit/d8dd4d7172bdbf66d16577e3dc8a8a48bf5d9178)

## FV1 — rejected focus moved the caret and could report false success

`EditorViewModel.focus()` unconditionally called `LogicalSelection.setCaret()` after `InteractionState.focus()` even if the latter returned `false`. It returned a successful plugin focus flag even when the explicitly requested native caret could not be placed.

It now declines to move the caret after a rejected block focus and returns `false` when a requested caret placement fails. Void/no-target focus remains supported.

- [RED and positive controls](https://github.com/Shelamkoff/editor/commit/d39dc3102d641de97c5a7dd80aeab090c9a36752)
- [Fix](https://github.com/Shelamkoff/editor/commit/5ba8ec23ee184de096f3ece9678df51631459686)
- [Additional rejected-caret control](https://github.com/Shelamkoff/editor/commit/713c66b70d7d9a51de8790aa8bb18b25dc98f55c)

## IS1 — focus changed current block before success, with missing notification

`InteractionState.focus()` wrote `#currentId` before asking the block reconciler to focus the instance, then failed to publish `onChange` even after a successful focus. `EditorViewModel.focus()` separately tried to compensate by eagerly calling `setCurrent()`, causing a false current-block event when the subsequent DOM focus was refused.

Now the interaction owner calls the reconciler first, returns `false` on rejection without changing the current block, and uses `setCurrent()` to publish a consistent event after accepted focus. `EditorViewModel` no longer pre-claims the target block before the focus operation.

- [RED tests](https://github.com/Shelamkoff/editor/commit/0b517b07ecba52e9a53306f2dfe6fa0886ff2c7d): initial 1/3 pass; two failures
- [InteractionState fix](https://github.com/Shelamkoff/editor/commit/43765e9d145da4f6ae53ee23df4f867409a1fe6f)
- [EditorViewModel fix](https://github.com/Shelamkoff/editor/commit/abdf1f6a5c23f7fcaf6e35ac14b7bdb11bac7154)
- [Positive/negative test update](https://github.com/Shelamkoff/editor/commit/f9f129c03e7a8d6a832e019aaf6dd3f5447769e1)

## Executed checks

| Committed focused test file | Final result | Scope |
|---|---:|---|
| `core/LogicalSelection.ownership.test.js` | **5/5 PASS** | Real `LogicalSelection`, real `getTextLength` and `findNodeAtOffset`; controlled DOM/native selection |
| `core/InteractionState.focus.test.js` | **3/3 PASS** | Real `InteractionState`; controlled block registry/reconciler and observer |
| `core/EditorViewModel.focus.test.js` | **4/4 PASS** | Real `EditorViewModel`; controlled runtime/interaction/selection |
| **Total** | **12/12 PASS** | No complete checkout/npm browser gate |

The browser `tests/browser/native-plugin-parity.js` also records a Quote plugin scenario: correct native field focus and caret, rejected nonexistent field focus, unchanged native Range/current block and no document write. [Browser test](https://github.com/Shelamkoff/editor/commit/9efda5fe2d2eb5a90cbfdcaa59773d9001f7ec08). It **has not been run** in a physical browser session.

## Remaining acceptance

No official `npm ci`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run test:docs`, `npm run test:types`, `npm run test:package` or `npm run docs:check` was executed against this HEAD. Full real native selection + keyboard/IME testing, cross-editor focus handoff and differential v1/v2 behavior must still be verified. In particular, targeted synthetic owning-DOM tests are not a guarantee that every built-in plugin exposes all dynamic fields at each intermediate focus phase.

**Conclusion:** Five concrete failure surfaces across three existing modules are repaired and have reproducible target-level RED/GREEN tests. This is an additional, scoped stability improvement, not full acceptance or a claim of universal v1 behavioral parity.
