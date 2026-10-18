# Rector v2 — synchronous Clipboard Paste reentry and control-epoch audit

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `a809ec1396d3c32c504b5a364eff4044162c3953`  
**Scope:** synchronous Clipboard Paste lifetime, private fragment decoding, logical cross-block replacement, read-only round trips and nested events. No persisted document data/API format changes.

## Invariants

- One committed Paste survives synchronous host-observer destruction, but the retired controller cannot reconcile detached UI, start another canonical edit, or read detached fields.
- Valid private fragments do not authorize an edit after a MIME getter, clipboard decoder, field/slice resolver or provider callback revokes the event owner.
- An edit-mode round trip (`false → true → false` for read-only state) revokes earlier event authority even when the canonical document revision is unchanged.
- If a later *owned* Paste runs reentrantly, the preceding synchronous event must not author a second transaction or fall back to raw native contenteditable insertion.
- A nested clipboard event from an *auxiliary, non-owned* input must not supersede a legitimate authored Paste already in progress.

## Finding CP-1 — Cross-block plain Paste reconciled detached view (P2)

`ClipboardController.#applyPaste()` had an unguarded branch for non-private, composite text/HTML Paste. After successful `#mutatePaste()`, the current code always cleared the logical selection and called `view.reconcileInteraction()`/`view.setCurrent()`, even if a synchronous commit observer had destroyed the editor. Reads from `ClipboardData.getData` in the same branch also continued into canonical preparation after that getter destroyed the controller.

**RED:** Two tests using the checked-in `ClipboardController` class failed before the correction. The successful composite Paste touched the retired view twice; clipboard getter teardown still invoked `prepareLogicalClipboardSlice`.

**Fix:** Recheck terminal edit ownership immediately after clipboard reads and preparation, and after canonical commit before any selection/view reconciliation. Preserve the completed model change.

- [Regression tests `e9af961`](https://github.com/Shelamkoff/editor/commit/e9af961f94efeeac15dc5d456309578d6bbf7483)
- [Fix `6ca402d`](https://github.com/Shelamkoff/editor/commit/6ca402df6af1e03ab23b66162ebd1de576824d8e)

## Finding CP-2 — Private MIME callbacks retained stale Paste authority (P2)

The private fragment branch called `preventDefault()`, read clipboard data, decoded the fragment and accessed `selection.capture()`/`prepareLogicalClipboardSlice()` without rechecking the owner after every external boundary. A user-defined ClipboardData getter for MIME types or payload, or a synchronous logical-plan callback, could destroy the editor while the old handler continued authoring.

**RED:** Three new cases failed against the retrieved pre-fix implementation: MIME payload getter teardown, private composite plan callback teardown and the `types` getter revoking the editor before the private format was claimed.

**Fix:** Validate the current owner after retrieving the formats, private payload, decoded fragment, logical slice and final target range. A private MIME recognized before a payload getter remains consumed; if ownership disappeared *before* the format was recognized, the old handler does not claim the event.

- [Regression tests `e9cac16`](https://github.com/Shelamkoff/editor/commit/e9cac169e67b7f006b111f26a1b05698d4c5695a)
- [Fix `83be0ed`](https://github.com/Shelamkoff/editor/commit/83be0ed89a809c83b42a05e60ebe436f8ef52879)

## Finding CP-3 — Read-only round-trip does not revoke synchronous Paste (P2)

Before this pass, `#canPresent()` checked only the current read-only boolean and terminal state. A matcher could synchronously set the editor to read-only, then back to editable, leaving the old Paste free to continue with a stale author selection. The initial event-owner resolver had the same exposure.

**RED:** The original `ClipboardController` failed two tests: control epoch changes during paste matcher evaluation still committed a local edit; owner resolution with an epoch change continued making additional DOM owner queries. A third regression for destruction during the final field lookup was already green and retained as a guard.

**Fix:** Snapshot `DocumentRuntime.modeEpoch` at Paste ingress and carry it across the synchronous dispatch. Recheck alongside terminal/read-only status after event ownership lookup, pending-task cancellation, clipboard and plugin callbacks, target resolution and before writing. A mode-revoked event does not author a new transaction.

- [Regressions `3554b48`](https://github.com/Shelamkoff/editor/commit/3554b48e1125c9fee634d8baf7c7c7ac672a8e56)
- [Fix `696cf85`](https://github.com/Shelamkoff/editor/commit/696cf855bb905971d6b2d96f1da37471536dd8d5)

## Finding CP-4 — Nested Paste double-authoring within the same control epoch (P1)

A synchronous clipboard callback could dispatch a newer, independently owned Paste event. Both handlers used the same valid edit mode, and the older one would resume after the successor committed and author its older content as a second transaction. The existing async-task cancellation only handled pending resolvers; it did not revoke a currently executing synchronous Paste.

**RED:** A checked-in regression called a nested document Paste from the older clipboard data reader. The original implementation committed both `newer` and `older` text.

**Fix:** Give each synchronous Paste an opaque turn owner. Later owned Paste supersedes the older one without depending on document revision. When the old turn discovers a newer owner, it consumes its superseded DOM event while avoiding a second model mutation; terminal or mode-revoked events retain the existing no-claim semantics. A nested auxiliary/non-owned Paste restores the former turn rather than canceling it.

- [Reentry regression `ee31664`](https://github.com/Shelamkoff/editor/commit/ee31664fa4149fcef26f8cbfd593448386cac6ad)
- [Fix `147ce45`](https://github.com/Shelamkoff/editor/commit/147ce458f29bf9cf1379d60dad7ebccb809b90e8)
- [Negative ownership control `6f9ea36`](https://github.com/Shelamkoff/editor/commit/6f9ea36d5705feb2c8a7670137ea86be6465d64a)

## Verification ledger

| Scope | Newly added cases | Result |
| --- | ---: | --- |
| Cross-block non-private Paste | 2 | 2 passed |
| Private Clipboard MIME | 3 | 3 passed |
| Mode epoch/field-resolution checks | 3 | 3 passed |
| Synchronous owned Paste supersession | 1 | 1 passed |
| Non-owned nested Paste control | 1 | 1 passed |
| **New cases in this pass** | **10** | **10 passed** |
| **Entire checked-in ClipboardController.test.js** | **47** | **47 passed** |

Eight added regressions independently reproduced failures on original affected production source. Two extra cases acted as negative/control checks.

The final result was an **isolated V8 execution of all 47 checked-in test bodies** with the exact retrieved branch `ClipboardController.js`, real `ClipboardFragment.js`, `editableFields.js`, `synchronousResult.js`, `textOffset.js` and `escapeHtml.js` functions, plus narrow injected AbortController, DOM, event and runtime adapters. The TrustedHTML adapter was a controlled stub. This is stronger than a mere static inspection, but does **not** replace the actual Node.js test runner, TypeScript project checks or Chrome/native clipboard behavior.

The local git client could not resolve `github.com` in this session. Authenticated repository connector operations were used for direct branch reads/commits without rewriting unrelated files.

## Remaining acceptance

From a clean local checkout at the **latest branch HEAD**, run:

```sh
npm ci
node --test core/ClipboardController.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Browser-specific acceptance must include native Copy/Cut/Paste, private MIME and HTML import, an app commit observer destroying the editor during Paste, changes to the current text selection after a successful commit, asynchronous resolver cancellation, read-only round trips, and real OS clipboard provider behavior. Compare identical v1/v2 author gestures to establish behavioral parity. Verify single canonical history entries and no raw native insertion after an accepted but superseded Paste.

**Conclusion:** Four concrete synchronous Clipboard Paste ownership defects are corrected and all available focused class tests pass. Complete library stability and v1 behavioral parity remain unverified until full local and native browser acceptance on the current HEAD.
