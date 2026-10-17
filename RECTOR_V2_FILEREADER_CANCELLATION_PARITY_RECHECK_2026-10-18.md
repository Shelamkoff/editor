# Rector v2 — FileReader cancellation, async media completion and cleanup

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Audit starting HEAD:** `d555b39846104a70bb855e89b5238a0f6b82da14`  
**Behavioral comparator:** v1 `master` at `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

This is a targeted continuation of the Rector v2 stability and v1 behavioral parity audit. The scope is the existing **Carousel, Image and Gallery** asynchronous local-file readers, not a new upload service or a legacy compatibility path. Previous work already covered blob URL rollback in Carousel and Attaches; this pass targets promises, listeners, and cancellation of local `FileReader` operations.

## Finding F-R1 — Carousel read could hang on abort (P2)

`plugins/carousel/index.js:readCarouselDataUrl()` allocated a reader and registered an abort listener without first checking whether the signal was already aborted. Its signal listener invoked `reader.abort()` but depended entirely on `FileReader.onabort` to settle the Promise; if the reader/adapter did not dispatch that event, the task stayed pending and held the listener and editor/Document references.

A synchronous exception from `reader.readAsDataURL()` rejected through the Promise constructor but never removed the abort listener or reader callback references. The v1 reader implementation already rejected early and used an explicit one-shot completion/cleanup path; this behavior was lost during the v2 rewrite.

**RED** on the exact pre-fix function in a controlled V8 reader:
- Already-aborted signal: **pending** Promise and **one reader allocated**.
- Abort with no `onabort` dispatch: **pending** Promise with retained abort lease.
- Synchronous read failure: Promise rejected, but **one abort listener leaked** and a subsequent signal abort invoked the failed reader.

**Fix:** reject pre-aborted reads before allocation; settle success/error/abort exactly once; clear all reader callbacks and abort listeners; contain native `abort()` exceptions while preserving cancellation rejection. No change to slide serialization or upload adapter contract.

- [Test first](https://github.com/Shelamkoff/editor/commit/c277f49002a684b6011a1026e916bc404242affd): `plugins/carousel/file-reader-lifecycle.test.js` checks pre-aborted, silent-abort, synchronous-failure and successful-completion scenarios through `createCarouselPlugin().capabilities.paste.resolve()`.
- [Production fix](https://github.com/Shelamkoff/editor/commit/d8147be5b1c5ee140ef0d32f49b4e8ecb923125b).

## Finding F-R2 — ImageUploader silent abort never completed (P2)

`plugins/image/uploader.js:#readDataUrl()` delegated cancellation to `reader.abort()`, assuming that the native/host adapter always invokes `onabort`. Without that callback, the upload remained pending and its owner was never released.

**RED:** the actual ImageUploader source stayed pending with a retained abort listener after canceling a reader whose `abort()` did not dispatch an event.

**Fix:** the signal abort handler now invokes `finish()` in a `finally` block. Existing successful, error, canceled and duplicate completion paths still use the single-settlement guard.

- [Regression test](https://github.com/Shelamkoff/editor/commit/7506936c09bced298db70229c842940bf2e8c6df) in `plugins/image/uploader.failures.test.js`.
- [Fix](https://github.com/Shelamkoff/editor/commit/feba1ad755cebd24dc4fe26a12706b128b9655e4).

## Finding F-R3 — GalleryUploader batch blocked by silent reader abort (P2)

`plugins/gallery/uploader.js:#readDataUrls()` waits for every reader. Its cancellation path similarly depended on each reader dispatching `onabort`. If one reader omitted the event, the whole batch Promise remained pending, even if other files had already completed.

**RED:** a two-file batch with one completed read and one silent-aborted read stayed pending and retained the last reader's abort listener.

**Fix:** the signal abort handler always calls idempotent `completeReader()`. The batch skips `onAdded` when aborted and releases all listener/reader callback references.

- [Regression test](https://github.com/Shelamkoff/editor/commit/79dedae259a4f1a032cec5ceb8c97c578ee14ef5).
- [Fix](https://github.com/Shelamkoff/editor/commit/27eb4555268cb9bb96f27510c02fb0d7dd0bc0ae).

## Finding F-R4 — partial Gallery reader construction leaked previously registered readers (P2)

If the constructor of a later `FileReader` threw, the outer Promise rejected, but readers from earlier iterations stayed registered and held their `AbortSignal` callbacks. The upload had failed without releasing resources allocated during its incomplete setup.

**RED:** constructor failure on reader two rejected the batch, leaving one live reader callback and one AbortSignal listener.

**Fix:** track live abort/cleanup callbacks within the batch. A setup exception seals the batch, terminates all previously started readers, releases their listeners and rejects the original setup error. Existing successful file ordering and per-file `readAsDataURL` error skipping are unchanged.

- [Test first](https://github.com/Shelamkoff/editor/commit/a9816a2dbda4180b593faef74bbc0899b8da23f7).
- [Fix](https://github.com/Shelamkoff/editor/commit/6550e86419683661fbd4762a809b67159ef6ee0c).

## Focused verification and limitations

With the final source:
- **Carousel:** 4/4 checked-in `file-reader-lifecycle.test.js` test bodies executed and passed using the real `createCarouselPlugin` factory and Paste capability with a controlled FileReader, AbortSignal and minimal dependency adapters.
- **Image + Gallery:** 17/17 checked-in `uploader.failures.test.js` test bodies executed and passed against the full corresponding updated uploader class sources with controlled FileReader, AbortSignal and a narrow media-URL adapter.
- **Total focused:** **21/21** passed in V8 source-level tests. The exact original source failures were separately reproduced before the fixes.
- **Syntax:** all six touched JavaScript production/test modules parsed under V8 after ESM import adaptation.

**Important:** the V8 harness with mocked browser dependencies is narrower than the actual installed project's Node runner and is not native Chrome/Firefox/WebKit. `npm ci`, the full test suite, TypeScript checks, physical native input/IME, package consumer checks and heap retention were not run in this environment. The working container cannot resolve github.com for checkout, so the changes were made directly through the authenticated GitHub connection.

## Required release gate

```sh
npm ci
node --test plugins/carousel/file-reader-lifecycle.test.js plugins/image/uploader.failures.test.js plugins/gallery/uploader.failures.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Browser follow-ups: cancel image and gallery uploads mid-read, cancel after one member of a multi-file batch completes, reject malformed/vanished input Files, destroy the owning block and editor before async completion, verify Undo/Redo and latest-document focus/caret, and measure residual `FileReader`, signal and blob URL references after cancellation.

**Conclusion:** four concrete asynchronous resource/settlement regressions fixed without changing public plugin APIs. Overall Rector v2 release stability and exhaustive parity with v1 are not yet proven.
