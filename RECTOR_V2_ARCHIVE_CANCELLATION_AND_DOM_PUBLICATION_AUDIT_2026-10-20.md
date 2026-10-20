# Rector v2 — ZIP archive cancellation and DOM publication audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `b17f97639f4279046385cc0a3c6b76bc5d161010`  
**Baseline source:** `renderer/renderers/attaches/index.js` blob `b24c5ecada0fb5c808f5769d707f5be8ac911932`  
**Final source:** `renderer/renderers/attaches/index.js` blob `c83ff1d5f6b78b157a5680d69320e01b972092a2`

## Audit scope and acceptance contract

Continued the Rector v2 stability and v1 capability-parity audit of attachment ZIP export. Reviewed the **current actual** `renderer/renderers/attaches/index.js`, its unit tests, the previous `RECTOR_V2_ZIP_RUNTIME_AND_ARCHIVE_URL_OWNERSHIP_AUDIT_2026-10-20.md`, and the active `RECTOR_V2_REMEDIATION_SPEC.md`. Relevant requirements are **I7** (revoked contexts cannot use successor DOM/producer authority) and **P5** (owner-window URL/async resource safety). The endpoint must preserve existing successful archive downloads, per-file failures and size limits while ensuring a canceled export performs no further ZIP mutations or download publication.

No new document format, backend service, cancellation framework, or legacy v1 API was introduced.

## Finding ARCHIVE-CANCEL-1 — canceled file normalization could still download and publish (P2)

### Baseline reproduction

`downloadArchive()` checked `signal.throwIfAborted()` before mapping supplied files, then registered a signal listener **after** normalization. A supplied URL/name accessor could synchronously call `abort()` during that window. Because an already dispatched abort event does not replay when a listener is registered later, the archive-local controller remained active.

On the exact baseline source, a one-file fixture with `get url() { caller.abort(); return 'https://example.test/...' }` **resolved successfully**, performed a fetch and called `zip.file()` despite `caller.signal.aborted === true`.

### Fix

After registering the local abort listener, explicitly synchronize the local controller with the current caller state (`if (signal.aborted) abortOperation()`). The already present `operationSignal.throwIfAborted()` before runtime acquisition then rejects the revoked operation without starting a fetch.

## Finding ARCHIVE-CANCEL-2 — non-cooperative async responses could write after abort (P2)

### Baseline reproduction

The stream reader checked cancellation **before** `await reader.read()`, not after it. A pending final `{ done: true }` read could therefore resolve after abort and produce a ZIP entry. The `Response.blob()` fallback also had no cancellation checks after `blob()` or `arrayBuffer()`. The worker used `zip.file(name, await readBoundedResponse(...))` with no post-read admission gate.

The baseline added ZIP entries from a delayed Blob response, from a completed stream read after abort, and from a delayed `arrayBuffer()` after abort; it also read response metadata when an earlier `fetch()` fulfilled after cancellation.

### Fix

- Check the operation signal after the awaited fetch resolves and before inspecting its response.
- Check before and after Blob-body reads and `arrayBuffer()`, and compare actual returned byte length to archive limits.
- Check after every awaited stream read, **including the terminal `done:true` case**; cancel the retired reader through the existing catch path.
- Check immediately before `zip.file()` and after the extension-owned ZIP `file()` callback.
- Admit Blob byte counts only once the returned buffer has been read and checked.

This leaves the existing per-file network error partial-success policy unchanged.

## Finding ARCHIVE-PUBLISH-1 — synchronous Blob/URL/DOM callbacks could publish a canceled archive (P2)

The prior code checked cancellation after `generateAsync()`, then constructed `Blob`, called `URL.createObjectURL()`, allocated an anchor, set `href`, and clicked it without checking whether those synchronous callbacks had revoked the request.

Controlled Blob construction, URL creation and anchor attribute-setting callbacks could abort the caller while the old code continued toward creating or clicking the download anchor.

The fix checks the signal:

- After Blob construction, before `createObjectURL`.
- Immediately after object URL creation (inside the existing error-cleanup boundary).
- After anchor creation and safe URL publication, and before `click()`.
- After `click()`, before scheduling delayed URL revocation.

The previously fixed idempotent URL release closure immediately revokes a produced Blob URL on abort/error. Successful click paths continue using deferred revocation.

## RED → GREEN evidence

Eight new regression tests were added to the existing renderer attachment test suite, covering:

1. Abort from a file `url` accessor before listener registration.
2. Non-cooperative delayed `Response.blob()` after abort.
3. A stream whose final read settles after abort.
4. Abort inside the owning-window Blob constructor.
5. Abort inside `URL.createObjectURL`, requiring immediate URL revocation without click.
6. Abort inside link `setAttribute('href', ...)`, requiring no click and immediate URL revocation.
7. Fetch fulfillment after abort, requiring no response-body/header access.
8. Blob `arrayBuffer()` fulfillment after abort, requiring no `zip.file()`.

The test bodies and both baseline/updated production bodies were fetched directly from the repository and evaluated against the same small deterministic JavaScript harness providing `AbortController`, `Response`, `Blob`, a fake ZIP provider, DOM URL callbacks and minimal Node assertion/test adapters.

| Suite | Previous source | Updated source |
| --- | ---: | ---: |
| Six pre-existing ZIP renderer tests | 6/6 | 6/6 |
| Eight new revocation regressions | **0/8** | **8/8** |
| **Total focused checks** | **6/14** | **14/14** |

Individual intermediate checkpoints were also green (9/9 after async-read fixes and 12/12 after DOM-publication fixes). These are **actual source-backed isolated JavaScript tests**, not `node --test`, real `jszip`, or Chromium.

## Direct-branch commits

- [Input/Blob/stream RED tests](https://github.com/Shelamkoff/editor/commit/5403d98a6e7228e60bded95936dc5cfca249f9e4)
- [Async cancellation/ZIP write fix](https://github.com/Shelamkoff/editor/commit/c846c8ac3f49839979898193b85911b1e054e01b)
- [Blob/URL/anchor RED tests](https://github.com/Shelamkoff/editor/commit/51fc0bcaaac7b69faba579b53ad4bbdcc43e8578)
- [Blob/DOM cancellation and URL cleanup fix](https://github.com/Shelamkoff/editor/commit/2d1178a694fcf97d235a84142b4900f7a1c42376)
- [Late fetch/arrayBuffer regressions](https://github.com/Shelamkoff/editor/commit/9c9f50706058f52f482deb08e9ee24443f4be7ed)

## Verification boundaries and required local acceptance

No full checkout, installed dependency tree or native browser runtime was available for these checks. Therefore **full `npm test`, TypeScript, native DOM, archive-click/download, memory/retention and v1/v2 behavioral parity are not proven**.

Run in a complete checkout of the final branch:

```sh
npm ci
node --test renderer/renderers/attaches/index.test.js shared/zipRuntime.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
```

In Chromium, exercise ZIP export success, cancellation during actual network fetch, streaming body read, blob creation and URL publication, per-file partial failures, MIME handling, URL revocation, multiple simultaneous files and rapid teardown/new-instance replacement. Confirm that canceled export never clicks an anchor, no stale ZIP entries are added, and all object URLs are released.

**Outcome:** Three related cancellation/ownership findings corrected with eight red/green regressions. Rector v2 is **not** certified stable or fully feature-parity-complete until native acceptance is run.
