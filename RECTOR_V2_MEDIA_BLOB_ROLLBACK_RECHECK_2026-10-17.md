# Rector v2 — cleanup blob: URLs on failed media commits

Date: 2026-10-17. Branch: `refactor/rector-v2-architecture`. Starting HEAD: `bfd1d4fa9b56a7dbab2c3a9a1d16e43a032c3000`.

## Result

Two confirmed resource-lifetime defects were fixed in Carousel and Attaches, with a single focused Node test module exercising their **public mounted block drop surface**. The failures occurred when `task.commit()` threw after browser `URL.createObjectURL()` succeeded.

No v1 compatibility adapter, schema change, global resource registry or changed success-path API was introduced. The full library's stability and entire v1/v2 behavioral parity have **not** been certified.

## Media-R1: Carousel orphaned object URLs on canonical transaction failures (P2)

Before this fix, `plugins/carousel/index.js` accumulated browser-created video `blob:` URLs in `createdObjectUrls` and the setup-scoped `objectUrls` map. Successful or boolean-false `addSlides(slides,task)` reached the cleanup predicate, but a **thrown** canonical commit skipped the predicate and went directly into `finally { finishTask(task) }`. The `blob:` URL remained live until the entire setup runtime was destroyed. The async `resolveFiles()` is called as `void resolveFiles(files)` by the `drop` handler; the failed commit therefore also produced an unhandled Promise rejection.

**Fix:** use a `committed=false` ownership flag, move revocation into a `finally` block, catch/log a non-aborted failed batch commit, then close the async task. Successful commits still retain their URLs for the runtime's existing lifetime; unsupported/failed files continue to be skipped as before. The code does not revoke a resource after a successful commit.

Commits: [regression test](https://github.com/Shelamkoff/editor/commit/1ba3d7124f54af55f47b05d4137c7c72b749b554), [fix](https://github.com/Shelamkoff/editor/commit/0c85672043062d4640f6f39ae4bcef7bd7189910).

## Media-R2: Attaches orphaned object URLs on canonical transaction failures (P2)

`plugins/attaches/index.js` had the equivalent `createdObjectUrls` cleanup behind `const committed=!task.signal.aborted&&addResolved(resolved,task)`, which was bypassed if `task.commit()` threw.

**Fix:** same ownership transfer principle: the error is contained at the async File drop boundary; `finally` revokes every resource in the current batch unless the canonical commit explicitly completed successfully; `finishTask(task)` is still performed exactly once.

Commits: [regression test](https://github.com/Shelamkoff/editor/commit/1ba3d7124f54af55f47b05d4137c7c72b749b554), [fix](https://github.com/Shelamkoff/editor/commit/9f2b03828e23efd8978ea3f4e623d28aac061632).

## Test-first and verified controls

**RED** — actual production source was evaluated with a controlled DOM and URL adapter, and an injected canonical `task.commit()` failure. Both Carousel and Attaches created one `blob:` resource, reported the thrown failure through the pending asynchronous operation, and did **not** call `revokeObjectURL` for the uncommitted URL.

**GREEN** — the updated production module bodies were evaluated with an equivalent controlled block-instance setup:

- Carousel: 1 created URL → 1 revoke; 1 task started and canceled; File drop consumed; failure contained as a warning.
- Attaches: same result.
- For **eight files in a single failed batch**, both modules create eight distinct URLs and revoke exactly those eight, in batch order; 1 task started and canceled once; the exception is contained instead of escaping as an unhandled rejection.

New source test file: `plugins/media-blob-commit.test.js`, with four test functions: one-file and eight-file batch rollback for each built-in plugin. The test imports actual `createCarouselPlugin`/`createAttachesPlugin`, mounts the public `BlockInstance` with a signal-aware fake Document and URL implementation, dispatches a File `drop` and verifies task/error/resource outcomes. This file does not read or mirror private helper implementation.

**Focused V8 execution:** the four test functions and the exact current production module text passed **4/4** in the controlled module dependency adapter. A local installed-project `node --test plugins/media-blob-commit.test.js` execution was **not available** in this chat environment, so this scoped execution must not be presented as the full native Node test-runner result.

Additional regression: [eight-file test expansion](https://github.com/Shelamkoff/editor/commit/303cfeecb1caf1b32c83a5b767d04ac797a71609).

## False-positive filter and limits

- The preexisting boolean-false `task.commit` cleanup path was already correct. The defect was the **throwing** branch, not ordinary cancellation or unsupported media.
- Embed's local cover-upload handler already catches failed commits and revokes the pending object URL on both false and exception outcomes. No redundant change made to Embed.
- `GalleryUploader` uses data URLs, not retained `blob:` objects; its existing async callback exceptions already have separate rejection/cleanup tests.
- A successfully committed local blob may need to survive document Undo/history while the editor remains alive, so the overall setup-scoped object-URL registry was not replaced with an unconditional per-block destroy revoke. That would risk invalidating historical media.
- Project-wide `npm test`, `typecheck`, native browser/IME, package consumer, full v1/v2 plugin matrix and heap gates have **not** run on the resulting HEAD.

**Conclusion:** both concrete object URL leak cases are repaired with recorded red/green evidence and committed source-level regression coverage. This is not a general claim that Rector v2 is release stable.
