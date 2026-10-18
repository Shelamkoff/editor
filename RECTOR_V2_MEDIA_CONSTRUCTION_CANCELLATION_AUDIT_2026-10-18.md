# Rector v2 — Media task cancellation during reader construction

**Date:** 2026-10-18  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting commit:** `b142850698b2b6e193f2f8a5045d7da3d7217fad`  
**Behavioral reference:** Rector v1 `master`, last audited at `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

This audit continues the previous FileReader cancellation parity repair, specifically checking **cancellation while local media readers are being constructed** and the ownership controls governing asynchronous block tasks. It does not introduce a legacy compatibility layer.

## Findings

### I-R1 — Image FileReader may register its abort handler after the signal has already been aborted (P2)

`ImageUploader.#readDataUrl()` checked `signal.aborted` once in `handle()`, then constructed a FileReader before installing its event and signal listeners. If editor teardown, read-only transition, or an application FileReader adapter synchronously aborted the task **during that constructor**, the signal's abort event was already gone when the listener was added. The uploader then invoked `readAsDataURL()` and could remain pending forever. This retained reader callbacks and a stale AbortSignal listener and prevented the old task from releasing its loading state.

**RED:** running the original class body with a FileReader constructor that called `controller.abort()` produced one allocated reader, `pending` upload Promise, one retained signal listener and live reader callbacks. No late event or timeout was needed.

**Fix:** after attaching the one-shot completion and abort handlers, explicitly check `signal.aborted` before starting the reader. The existing idempotent abort path settles the Promise and cleans up listeners even when the reader does not dispatch `onabort`.

- [Regression test first](https://github.com/Shelamkoff/editor/commit/0a40d434e0a9be165529f686730208bd6e28ecdc) — `plugins/image/uploader.failures.test.js`
- [Production fix](https://github.com/Shelamkoff/editor/commit/6b2cd2616a8ad9c2840797b45388334cd7842b7c) — `plugins/image/uploader.js`

### G-R1 — Gallery continued allocating readers after a synchronous owner cancellation (P2)

The prior Gallery repair detected cancellation after constructing an individual FileReader, but did not stop the `forEach` loop. A three-file batch whose first FileReader constructor synchronously aborted the owner still allocated **three** readers, unnecessarily holding resources during teardown. Larger batches amplified the issue. All readers eventually completed, so this was a resource/teardown regression rather than a stuck Promise.

**RED:** the original GalleryUploader class completed its Promise but allocated three FileReaders for a canceled three-file batch. The intended ownership behavior is at most the first reader (the one already under construction).

**Fix:** skip reader construction for each remaining batch entry once the signal is aborted, account for the skipped entry in the outstanding-reader counter and settle the whole batch once all attempted/skipped entries are accounted for. No partial results may be committed after cancellation.

- [Regression test first](https://github.com/Shelamkoff/editor/commit/2d19f680fe4dd2bcc3ad614e8353df476632d7da) — `plugins/gallery/uploader.failures.test.js`
- [Production fix](https://github.com/Shelamkoff/editor/commit/8128f2e8bde2bc4c5d53e9d82cef1e5157ee9c45) — `plugins/gallery/uploader.js`

## Focused controls

- **18/18** checked-in Image and Gallery uploader test cases passed under controlled V8 execution of the exact current class sources, with local FileReader/AbortSignal and URL-sanitizer adapters. This included I-R1 plus the previous silent-abort and constructor-failure cases.
- After G-R1, the expanded set passed **19/19** checked-in uploader test cases with the same source-level method, including cancellation during the first Gallery reader construction. The **19/19** is the current result and supersedes the preliminary 18/18.
- **17/17** existing `core/InstanceScope.test.js` test cases passed against the exact current `InstanceScope` source and a controlled AbortController adapter. They cover canceled/retired tasks, read-only transitions, revocation, generation/phase guardrails, parent-child inheritance, reentrancy and a 1,200-step hierarchical read-only oracle. No changes to core InstanceScope were necessary; those conditions were not counted as a defect.

The production/test files have not been run through an installed Node project or native browser here. Source execution adapts ESM module bindings inside a controlled V8 harness and checks selected test bodies; it is not equivalent to `npm test` or real-browser acceptance. GitHub network checkout from the container remains unavailable, so commits were made through the authenticated GitHub integration.

## Follow-up local release gate

```sh
npm ci
node --test plugins/image/uploader.failures.test.js plugins/gallery/uploader.failures.test.js core/InstanceScope.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

The acceptance matrix should also exercise: deleting a block with pending local and remote file tasks; read-only transitions before and after FileReader acquisition; Undo/Redo after a completed media commit; consecutive canceled multi-file batches; a FileReader that fires its onabort handler synchronously; browser-owned DataTransfer/FileList behavior; and heap/signal-listener retention after destruction.

**Conclusion:** two additional verified asynchronous media-resource lifecycle regressions fixed. The current `InstanceScope` cancellation checks passed the focused tests, but release stability and exhaustive v1/v2 behavioral parity for the entire library remain unverified.
