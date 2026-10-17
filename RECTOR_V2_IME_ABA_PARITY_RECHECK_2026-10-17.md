# Rector v2 — LinkPreview / Embed IME, metadata races and v1 parity recheck

**Date:** 17 October 2026.  
**Branch:** `refactor/rector-v2-architecture`.  
**Starting HEAD:** `e83dd4313de3abc06b708ede0a48a8f336a1b17e`.  
**Last code commit of this pass:** `f6b7a73c115634b8ee4be321acb225218d14d4dc`.  
**Original v1 reference:** `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

## Outcome

Three independent defects were confirmed with new failing tests and repaired in their owning plugins, without restoring legacy APIs or schemas. LinkPreview's asynchronous metadata ownership was also tightened to handle **ABA** host edits to individual fields. The existing native source/caret and URL debounce regressions from the preceding pass remain green under the checked deterministic fixtures.

The test evidence is **source-level production factory execution with controlled DOM/URL/timer/task adapters**. Native-browser test cases are registered and syntax-checked, not executed in a complete `createEditor` Chromium session. No full-project npm/typecheck/browser/packaging gate was run. Whole-library stability and exhaustive v1 behavioral parity are therefore **not established** by this pass.

## LP-IME1 — LinkPreview committed an IME preedit before completion (P2)

The URL input listened to `input`, `change` and Enter and started its independent debounce even while a browser was composing text. The native input controller has its own composition transaction boundary, but this plugin timer did not honor it. Enter used to choose an IME candidate could be treated as an immediate URL submission.

**Red:** 11/14 focused LinkPreview cases passed on prior production code; three new IME tests failed.  
**Green:** 14/14 passed after the fix.

LinkPreview now revokes a pending timer on compositionstart, refuses Enter / change / composing input before completion, and schedules one deferred submission after compositionend; it also respects `event.isComposing` if compositionstart was missed and does not leave composition authority across read-only/destroy.

- [Red tests](https://github.com/Shelamkoff/editor/commit/d8e654d914d4c9ae3e4c05c5aa5445371a7f9c49)
- [Fix](https://github.com/Shelamkoff/editor/commit/9c14effa54aad25ff324b2466b43b00ba8d1bb18)
- [Registered browser test](https://github.com/Shelamkoff/editor/commit/bd57e4f447e94fa476619e13b79d19cf9a51b82e)

## LP-META1 — ABA edit of metadata fields lost to a late fetch (P2)

The earlier fix checked whether a metadata value still equaled its request baseline. That protected against a one-way concurrent edit, but not against a host action `A → B → A` while `fetchMeta` was pending. Late metadata then incorrectly replaced the final host-selected `A` value, even though the host had made more recent edits.

**Red:** 14/16 LinkPreview cases passed. The new title and description ABA examples failed.  
**Green:** 16/16 cases passed after the fix.

The plugin now tracks **per-field projected change revisions** for `title`, `description`, `image`, `favicon`, and `domain`. A metadata result may update a field only if (1) its canonical value still equals the request baseline and (2) that field's projected revision has not advanced. Unedited fields may still receive the fetch result; an unrelated template edit does not invalidate all metadata.

- [Red tests](https://github.com/Shelamkoff/editor/commit/dbd3652860d231b5178e579156bc9773fa3c4cd2)
- [Fix](https://github.com/Shelamkoff/editor/commit/fcec671ed9eb9df7e41b1f026095ffc4cd3a4fe2)
- [Registered browser regression](https://github.com/Shelamkoff/editor/commit/d399ce2495d03aa5b97ef6917b89d60d2d233477)

## E-IME1 — Embed could parse a composing URL before IME completion (P2)

Embed's independent URL timer, Enter and paste handlers also ignored IME composition, despite previously repaired URL draft/caret projection ownership. The preedit could replace a valid video source before the user finished entering a provider URL.

**Red:** 6/9 Embed reconciliation tests passed on the prior production code. Three new IME scenarios failed.  
**Green:** 9/9 tests passed after the fix, including all six earlier caption, ownership, source-clearing and debounce cases.

Embed now cancels older timers on compositionstart, defers parsing until compositionend, ignores intermediate composing input/paste/Enter, and closes the composition session on read-only/destroy.

- [Red tests](https://github.com/Shelamkoff/editor/commit/ab8563bebd9cbb66d0289ca88ba18de01d1c9c6e)
- [Fix](https://github.com/Shelamkoff/editor/commit/f6b7a73c115634b8ee4be321acb225218d14d4dc)
- [Registered browser test](https://github.com/Shelamkoff/editor/commit/561362688a50b4a624bee5edf6888b655dc91763)
- [Browser fixture scope refinement](https://github.com/Shelamkoff/editor/commit/239ee920e1a13f3a288c29c091e94a1ee795450b)

## Confirmed source and tests

Files in this pass:
- `plugins/link-preview/index.js`
- `plugins/link-preview/input-lifetime.test.js`
- `plugins/embed/index.js`
- `plugins/embed/reconciliation.test.js`
- `tests/browser/native-plugin-parity.js`
- `tests/browser/native-plugin-media.js`

All modified production JavaScript and browser files passed independent JavaScript parsing under source import stripping. The actual registered test bodies were executed against actual plugin source in the deterministic V8 DOM adapter. They are **not a substitute** for native browser IME/selection tests and `npm test` on a full checkout.

## Still open — exact one-step v1 URL/metadata Undo semantics

Review of the [original v1 LinkPreview implementation](https://github.com/Shelamkoff/editor/blob/5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340/plugins/link-preview/index.js) confirms that it waits for URL metadata and then commits URL plus metadata in one `context.mutate` path. In v2, native URL input is independently committed to the canonical document, `commitUrl` synchronizes URL, then `DataTask.commit` may record a second metadata transaction.

This is **an unresolved behavioral history-parity difference**. It should not be bypassed with an unsafe forced history merge: current `HistoryStore` only coalesces adjacent compatible block.update records with the same origin/name/historyGroup, and the native-input path uses separate authoring metadata. The correct solution must preserve native URL caret/history, prevent merging unrelated host actions while `fetchMeta` is pending, and guarantee Undo+Redo reproduce a single coherent snapshot even when metadata arrives after other changes. This pass did **not** claim or implement one-step parity for that case.

## Required final gates

On a complete local checkout at the final branch SHA:

```sh
npm ci
node --test plugins/link-preview/input-lifetime.test.js plugins/embed/reconciliation.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Additionally test real system IME in Chromium/Firefox/WebKit, compositionend/final-input ordering, deliberate URL replacement during composition, async metadata races under Undo/Redo, and the v1/v2 single-step history scenario. Until these run and remaining parity items are resolved, whole-library release stability must remain **unverified**.


## Additional verification — end-to-end runner limitation

A focused Node/V8 adapter executes the **actual production plugin source** plus the **committed test bodies** from:
- `plugins/link-preview/input-lifetime.test.js` — 16/16 checks (11 preceding lifetime/restore scenarios, 3 IME cases, 2 ABA metadata cases).
- `plugins/embed/reconciliation.test.js` — 9/9 checks (6 preceding ownership/URL cases, 3 IME cases).

The adapter intentionally stubs DOM layout, URL validation helpers, plugin panels and network/runtime dependencies. The registered browser scenarios in `tests/browser/native-plugin-parity.js` and `tests/browser/native-plugin-media.js` passed independent JavaScript syntax parsing after stripping imports for the check, but they were **not run in the real browser**.

The full `npm test`, project TypeScript 5.9.3 gate, browser runner, installed-package consumer, heap/IME/multirealm checks and complete v1/v2 gesture matrix have **not** run on this HEAD. The remaining LinkPreview URL/metadata single-step Undo/Redo difference from v1 remains unresolved; no claim of full functional parity should be made.

## Guarded async-history follow-up

The adjacent LinkPreview URL-plus-metadata history discrepancy described above has since been addressed with a revision-scoped continuation protocol. See [the subsequent async history parity report](RECTOR_V2_LINK_PREVIEW_ASYNC_HISTORY_PARITY_2026-10-17.md) for commits, tests and limitations. All full-browser and final-SHA acceptance boundaries stated here remain outstanding.
