# Rector v2 — Carousel video Paste and clipboard-owned media URLs

**Date:** 2026-10-18  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `ba6e87c6886b4f7c8431107dc8c83963a740cccc`  
**v1 reference:** `master` at `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

This pass continues the behavioral-parity work on media insertion and lifecycle ownership. No removed v1 adapter or migration was restored.

## Confirmed defect — local video Paste was accepted but silently discarded (P1)

V2's Carousel `paste.accepts({kind:'file', file})` returns true for `video/*`, but when `uploadFile` was absent, its `paste.resolve` always encoded the File with `readCarouselDataUrl`. The result is `data:video/...;base64,...`, which the deliberate shared `sanitizeMediaUrl` policy rejects: only narrowly validated **image** data URLs are admitted. This made local video Clipboard Paste a no-op. The v2 drag/drop path already used `URL.createObjectURL(file)` for video; v1 `Code` was unrelated, and v1 Carousel's `onPaste({type:'file'})` → `#addFiles` used an owned blob URL for local videos.

**Fix:** Carousel's default video Paste now calls `context.createObjectURL(file)` and retains the `blob:` reference in the canonical slide. Image files continue using their existing sanitized image data URLs; configured `uploadFile` callbacks continue using the application-provided persisted URL. **Do not widen `sanitizeMediaUrl` to allow arbitrary data:video documents.**

- [Test-first Carousel Paste parity cases](https://github.com/Shelamkoff/editor/commit/5dc38c6b979cb9e82c024168398d8f343315b1af) — `plugins/carousel/video-paste-parity.test.js`
- [Carousel fix](https://github.com/Shelamkoff/editor/commit/f61a6770368ef5c33f59c288e936941a215ceda8)
- [Precise optional-poster assertion](https://github.com/Shelamkoff/editor/commit/d119d94167ed22ed3775f0792641f75e868203a5)

## Resource ownership — all-or-nothing Clipboard Paste lease (P2)

`PasteResolveContext` had no API to tell the host about temporary objects that needed to remain available after a successful Paste, yet be revoked after cancellation or a failed/no-op transaction. Creating `URL.createObjectURL` directly in an asynchronous Paste resolver would leak resources on failures, or prematurely revoke them on Undo.

**Fix:** `ClipboardController` now offers a narrow `createObjectURL(file)` context method. It allocates through the **owning document's** URL API and holds newly created leases within the pending Clipboard task:

1. **Abort, cancel, resolver rejection, declined result, no-op or failed commit:** revoke the uncommitted URL immediately; neither a late resolver nor a reused callback can commit it.
2. **Successful canonical commit:** keep the URL in the ClipboardController's per-editor owned set. Undo does **not** release it, because Redo may restore that exact canonical `blob:` reference.
3. **Editor destruction:** revoke every successfully committed clipboard-owned URL, independently of temporary task cleanup.
4. **Reentrant destruction during `createObjectURL`:** revoke the URL as soon as its creation call returns; it never enters the destroyed owner's registry.
5. **Failure after a committed document revision (e.g. view reconciliation):** preserve the resource referenced by the already committed document rather than creating a broken video/history entry.

The controller removes task-lifetime listeners after settlement. Resources are retained only until editor disposal, **not** across reload; callers must configure an uploader for durable video content.

- [Resource contract tests](https://github.com/Shelamkoff/editor/commit/2089e1ce8c70a81af9debdc0d9c91830fdbc1d02) — `core/ClipboardController.media-resource.test.js`
- [Controller implementation](https://github.com/Shelamkoff/editor/commit/d833228fb6b91e084d3f27f71d0e532edf47b242)
- [Additional post-commit/declined-result regression cases](https://github.com/Shelamkoff/editor/commit/f0bfc82cd62435498152be8fcd7b2bee62f0403f)
- [Typed Paste context](https://github.com/Shelamkoff/editor/commit/561820da71ef22ebcef4858c6bfdee387892177b)

Both the [English](https://github.com/Shelamkoff/editor/commit/cdbf4646da850e74c1acf3cd051c1d764aba6245) and [Russian](https://github.com/Shelamkoff/editor/commit/9fa54efcb492f6bf42cd0e97a6ab308db2b4c1d3) extension guides document the new context method, its cancellation/Undo/Redo lifetime, and the limitations of temporary URLs.

## Focused verification

- **RED:** reviewed the exact pre-fix v2 Carousel Paste route and v1 file Paste path; the no-uploader video branch generated a forbidden `data:video` URL and returned `null`.
- **GREEN:** 3/3 final Carousel `paste.resolve` cases passed on the actual updated factory source in an isolated V8 setup. They cover local video blob allocation, image data URL behavior, and uploader-backed remote video. The exact shape of the optional `poster` field was verified with own-property-sensitive deep equality; an initially over-broad test expectation was corrected.
- **GREEN:** 7/7 `ClipboardController.media-resource.test.js` cases passed against the actual updated controller source using an isolated event/runtime adapter. Coverage includes successful Undo/Redo retention, canceled/hung resolvers, failed commits, no-op transactions, reentrant destruction, post-commit observer failure, and a declined resolver result.
- **Regression control:** 8/8 selected existing asynchronous ClipboardController tests passed in the same environment. The target module and focused test files passed syntax parsing after adapting ESM imports.

A real-browser scenario was committed in [native-plugin-media.js](https://github.com/Shelamkoff/editor/commit/6e88ea3c9f91fd7795f7798196f72d9b28f91ee7), using a native File inside ClipboardEvent and checking inserted video, exact `blob:` identity, Undo/Redo and cleanup after `editor.destroy()`. **It has not been executed in native Chromium in this chat.** Static browser-test parsing passed.

**Limitation:** These V8 checks run checked-in production source with controlled dependencies and test bodies. They are not the project's installed `node --test`, TypeScript, full browser, package consumer, memory-retention or cross-platform acceptance. The execution environment cannot resolve GitHub by DNS for a conventional checkout; source was read and commits were written through the authenticated GitHub connector.

## Required final-branch acceptance

```sh
npm ci
node --test plugins/carousel/video-paste-parity.test.js core/ClipboardController.media-resource.test.js core/ClipboardController.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Check browser behavior in Chrome/Firefox/WebKit, on invalid Blob URL adapters, cross-editor reusable definitions, multiple back-to-back video Pastes and canceled batches, deletion and later Redo, read-only transitions, reentrant destruction, and heap retention for per-editor resource registries. Other v1/v2 gesture differences and previous audit findings remain independent release-gate work.

**Conclusion:** default local-video Paste parity restored while preserving the media URL security policy and giving the host explicit, transaction-aware resource ownership. Complete Rector v2 release stability/parity remains unverified.
