# Rector v2 — Clipboard route isolation, reentrant destroy and commit-time blob ownership

**Date:** 2026-10-18  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting tip:** `28c7946c834e` (resource release diagnostics isolation)  
**Historical reference:** Rector v1, `master` (`5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`).

This audit continues the video Paste and temporary object-URL ownership work. It targets remaining mutation isolation and reentrant callback boundaries in `ClipboardController`, **without** changing the current persisted document format or adding any legacy v1 fallback.

## 1. Paste matcher argument pollution (P2)

**Initial defect.** The first matching candidate received the same mutable `PasteInput` envelope later used by every other candidate and, on success, by the selected `paste.resolve()` callback. A rejected plugin could change `input.kind` and `input.file`, preventing the next registered candidate from recognizing the real file. An accepted matcher could replace `input.file` and cause its resolver to import the wrong item.

**RED (original source).**
- Rejected candidate mutated `file/original.mp4` to `text/spoofed.mp4`; the next candidate observed the spoofed input and Paste fell through.
- Accepted candidate rewrote `input.file`; the winning resolver saw `spoofed.mp4` rather than the clipboard's `original.mp4`.

**Fix.** Snapshot the known `kind/text` or `kind/file` input envelope once; pass an independent shallow envelope to each `accepts()` candidate and a fresh envelope to the selected resolver. The underlying browser `File` object is **not** deep-cloned or replaced: it remains an opaque browser-owned object required by `FileReader`/uploaders. Native File name/type properties are read-only; full isolation from mutation of arbitrary custom mutable File-like objects is not claimed.

- [RED regression tests](https://github.com/Shelamkoff/editor/commit/1167edcf8e46e2b73448f6abfdd9fffd47660670) — `core/ClipboardController.test.js`.
- [GREEN source fix](https://github.com/Shelamkoff/editor/commit/89ec30446f1ad3482c4d19a1e06965dbb089d274) — `core/ClipboardController.js`.

## 2. Reentrant destroy revoked committed video resources twice (P2)

**Initial defect.** `ClipboardController.destroy()` iterated the live `#ownedObjectUrls` Map and cleared it only after invoking each URL owner's `revokeObjectURL()`. If a custom host implementation reentered `destroy()` synchronously during the first resource release, the same entries were still present and could be revoked twice or recurse. Separately, retained event listener callbacks could still trigger clipboard work after destruction in DOM adapters dispatching an already-captured listener.

**RED (original source).** An injected `revokeObjectURL` callback invoked `destroy()` once; the same blob was revoked multiple times. Invoking a retained Paste listener after `destroy()` still executed the resolver and consumed the event.

**Fix.** Add terminal `#destroyed` ownership; detach the full blob-resource ledger before running external abort/revoke callbacks; independently settle controller/task abort and per-URL cleanup. Retained Copy/Cut/Paste callbacks and direct late async starts are inert when destroyed.

- [Reentrant blob release test](https://github.com/Shelamkoff/editor/commit/4aec927ceb13d82262c057c8aad9a55d95a7cd94) — `core/ClipboardController.media-resource.test.js`.
- [Stale listener test](https://github.com/Shelamkoff/editor/commit/51985a2e5e382d5a66a3698ddd1ac0a905c629e5) — `core/ClipboardController.test.js`.
- [Production fix](https://github.com/Shelamkoff/editor/commit/9698899cee6fb678f8fe2e96aa1a3e926ee64d19).

## 3. Reentrant Paste canceled blob ownership during its own successful commit (P1)

**Initial defect.** The pending async Paste task owned newly allocated `blob:` URLs and installed an abort listener that immediately revoked them. A second Paste could start from a synchronous user callback during the first Paste's canonical transaction publication. Its normal old-task cancellation aborted the first task **after the canonical document already contained its video URL**, but **before** the first `#mutatePaste()` returned and transferred the URLs into the editor-owned retained Map. The committed video then referenced a revoked `blob:` URL. The same fault class could occur during other reentrant task aborts while the canonical transaction settled.

**RED (original source).** In the synchronous `applyPasteResults` fixture, commit revision advanced and a new Paste started before the old call unwound. The older video's temporary URL was revoked, despite one successful canonical Paste action.

**Fix.** Gate pending resource revocation only for the synchronous `#applyingPasteTask` transaction. During its commit, abort records cancellation but defers physical revocation until the transaction result is known. If canonical revision advanced, transfer the blob into editor lifetime ownership for Undo/Redo; if the transaction rolled back, release it. If the editor was destroyed, the completion path releases rather than retaining. Outside this short commit window, ordinary cancellation still releases resource URLs promptly.

- [Positive commit / destruction regressions](https://github.com/Shelamkoff/editor/commit/86b910976dc355d8d4eb66f8ff9a2597679d5556).
- [Production fix](https://github.com/Shelamkoff/editor/commit/7912db050651895fcf421ebddd17984442e25278).
- [Explicit canceled rollback negative control](https://github.com/Shelamkoff/editor/commit/a820166fb20d9352393b0c3c4f2969dcb0a84c61).

## Focused validation

- **RED before patch:** both Paste envelope mutation cases, reentrant double-revoke, retained Paste callback after destroy and premature revoke during successful commit were demonstrated against the exact production source preceding each respective change.
- **GREEN on final source:** **27/27** selected real test bodies in `core/ClipboardController.test.js` and `core/ClipboardController.media-resource.test.js` passed in an isolated V8 harness executing the actual updated controller source and narrow controlled AbortSignal/clipboard/URL adapters. This includes selected prior Clipboard results, transient diagnostics faults, precommit cancellation, postcommit observer failures, committed-media Undo lifetime, reentrant destroy/new Paste and failed-commit rollback.
- **Syntax:** the updated controller code parsed successfully in V8 after substituting static ESM bindings for the focused test harness.
- **GitHub edits:** all changes were committed directly to the existing branch via authenticated GitHub integration, with optimistic blob-SHA checks.

**Verification boundary:** the targeted V8 runner does not prove the full installed `node --test` suite, actual browser Clipboard/DataTransfer semantics, IME behavior, Playwright/Chromium, package consumer behavior, cross-browser event reentrancy or heap retention. This environment did not run `npm ci`, `npm run typecheck`, or the full release gate. Earlier focused passes on other source SHAs are not transferable to this final HEAD.

## Required acceptance

```sh
npm ci
node --test core/ClipboardController.test.js core/ClipboardController.media-resource.test.js plugins/carousel/video-paste-parity.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Extend native-browser differential checks with file Paste routing across multiple registered extensions, direct/synthetic ClipboardEvent lifecycle, a new Paste dispatched in `transaction:committed`, Undo/Redo playback of temporarily blob-backed Carousel videos, editor destruction in `URL.createObjectURL` / `revokeObjectURL`, and measurement of retained URL/AbortSignal listeners after cancellation.

**Status:** three new verified Clipboard lifecycle and routing regressions corrected. **Do not mark the whole Rector v2 library release-stable or fully behaviorally equivalent to v1** until the complete test and acceptance matrix has passed on the final branch tip.
