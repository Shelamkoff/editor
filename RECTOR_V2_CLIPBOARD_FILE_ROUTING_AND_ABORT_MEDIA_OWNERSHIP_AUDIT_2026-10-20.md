# Rector v2 — file Paste matcher revocation and abort-resistant media ownership

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `ea883f7b73aa00172b1ec647963c1d80df0a2e58`  
**Production:** `core/ClipboardController.js`  
**Tests:** `core/ClipboardController.test.js`, `core/ClipboardController.media-resource.test.js`

## Scope and contract

Continued the Rector v2 functional-stability and parity audit after strict nested Clipboard inline-envelope checks. Consulted the repository TDD skill and current v2 remediation contract. Reviewed real `ClipboardController` file matching, async Paste task lifetime, ownership checks, resource release, owner realm AbortController interactions, and the existing 75+ regression scenarios.

The relevant contracts: **I7** (a revoked owner cannot dispatch a producer or new editing operation), **I3/P4** (no late Paste may change the committed document), **P5** (owner-document media URL lifetime and cancellation) and **C4** (file and structured Paste share one valid transaction). This pass changed no legacy format, clipboard wire schema, public API, or plugin registration contract.

## Finding CLIPBOARD-MATCHER-REVOKE-1 (P2): file routing continued after owner revocation

### Confirmed bug

The file Paste branch used `files.map(... this.#route(...))`, filtering and checking `#canPaste()` **after routing every file**. A plugin's `paste.accepts()` callback is synchronous external code and can destroy the editor, advance its mode epoch, or start a newer Paste. The old code nevertheless invoked matchers for subsequent files even after the earlier matcher retired the current editor.

Similarly, `#route()` evaluated more registered candidate plugins after a preceding candidate synchronously changed read-only mode. The outer caller eventually rejected the stale Paste, but **the extension code had already executed without authority**.

### RED tests and correction

Two regressions were committed before changing production:

1. Two-file Paste: matcher for the first file destroys the owning editor; matcher for the second file **must not execute**.
2. A single file with two registered candidate matchers: the first switches the runtime to read-only and returns `false`; the second candidate must not execute.

Both tests **failed** against production blob `18977df6aeb214bda8454ffb4e8e50479318455b`, proving the invalid post-revocation dispatch rather than an unrelated test setup failure.

Fix:
- Process files in a synchronous guarded `for` loop, checking the current Paste lease before and immediately after each `#route()`.
- Propagate the original `modeEpoch`, `turn` and event into `#route()`.
- Check `#canPaste()` before invoking candidate producers and after each matcher; stop evaluating further candidates as soon as the lease expires.
- Retain the normal routing priority, matcher receiver, per-file independence and one combined Paste transaction.

The unchanged two negative regressions passed with the fix. A third **positive** regression subsequently proved that two valid file inputs are still routed in order and passed to **one** `applyPasteResults()` transaction when no revocation occurs.

Commits:
- [RED file/matcher revocation regressions](https://github.com/Shelamkoff/editor/commit/2a653a6b34f87f7dca16d9cd7f7b1f44ef03d76b)
- [Production lease-guard correction](https://github.com/Shelamkoff/editor/commit/a11fc7bede35348df2869043b5368be510845d3f)
- [Positive two-file atomic transaction test](https://github.com/Shelamkoff/editor/commit/252505dfb4cbdc5edbaa279bd4ee89c2283b400e)

## Finding CLIPBOARD-ABORT-THROW-1 (P2): abort adapter failures blocked release and next Paste

### Confirmed bug

`cancelPendingTask()` detached the current `#task` and then called its owner-realm `AbortController.abort()` **without containment**. When a caller-supplied AbortController threw synchronously:
- The cancellation API and a subsequent Paste could throw instead of proceeding.
- If it threw **before dispatching the abort signal**, the registered `releasePending()` callback never ran; temporary blob-backed media remained unreleased while the resolver could hang indefinitely.
- When abort dispatched its listeners and then threw, it could prevent the outer cancellation from returning normally even if a new Paste had been synchronously started by an abort listener.

The owner-document realm is explicitly supported as the source of AbortController; rejecting non-cooperative adapters must not bypass internal lifetime/cleanup invariants.

### RED tests and correction

Two regressions were committed first:

1. A hostile owner AbortController throws before sending `abort`. A pending resolver has created a provisional blob and never settles. `cancelPendingTask()` must **not throw**, must revoke that URL immediately, permit a replacement Paste, and release the replacement blob at editor destroy.
2. A second owner controller dispatches `abort` (including a listener which synchronously starts another Paste) and then throws. Canceling the predecessor must not revoke the successor or escape through the editor API.

Both failed against the then-current production `ClipboardController.js`: **0/2 new checks passed** for the intended aborted-control failure.

Fix:
- Track the current task's provisional media `releasePending()` callback separately from the controller, with explicit task ownership.
- Detach both task authority and its cleanup reference **before invoking external abort hooks**.
- Best-effort invoke `abort()` and then release pending media directly even if no abort signal was dispatched. Diagnostic reporting remains non-authoritative.
- Do not clear cleanup belonging to a newer task started reentrantly.
- Clear the completed task's cleanup reference in the finalizer to prevent retention of settled task state.
- Preserve the existing `applying` guard: a URL already committed during a synchronous transaction remains owned by Undo/Redo until the editor is destroyed.

After the fix, both new regressions passed without changing the tests. Existing successful media Paste, cancellation, destroy, and reentrant transaction behavior also remained green.

Commits:
- [RED throwing-abort/media regressions](https://github.com/Shelamkoff/editor/commit/e00f74e2890512cb9b1571a1d3d7c16eaa2a6327)
- [Production abort-resistant media release](https://github.com/Shelamkoff/editor/commit/9625b448721ec864150eab961a6ad0dabdc20ebe)

## Verification

The entire current bodies of `core/ClipboardController.test.js` and `core/ClipboardController.media-resource.test.js` were executed on the actual fetched production code, together with the actual supporting implementations from `core/ClipboardFragment.js`, `shared/DocumentSchema.js`, JSON cloning, synchrony checking, editing host routing, text/HTML helpers and validation metadata.

A controlled isolated JavaScript/V8 test adapter supplied a deterministic owner `AbortController`, signal listener semantics, lightweight `console` and Node `test/assert` API. The controller, module methods, callback bodies and all 78 registered test executions were not rewritten. The fixture exercises synchronous and asynchronous resolver paths, blob URL provider behavior and failure/reentry sequences.

| Scope | Result |
| --- | ---: |
| Two new revocation regressions vs. previous source | **0/2** (RED as intended) |
| Two new abort/media regressions vs. previous source | **0/2** (RED as intended) |
| Revocation regressions after fix | **2/2** |
| Abort/media regressions after fix | **2/2** |
| **Complete current ClipboardController + media resource suites** | **78/78 passed** |

Current verified blobs:
- `core/ClipboardController.js` — `4f088ee467afae578573ac5caaec3bc808a073f7`
- `core/ClipboardController.test.js` — `f44116f30d85629cb51e80577775d3d035402656`
- `core/ClipboardController.media-resource.test.js` — `259ac569dfcf3d0e697fe93da1178b462d0c5156`

**Important limits:** these are isolated source-backed JavaScript tests, **not** the project's native `node --test`, TypeScript check, real Chromium Clipboard DataTransfer/Blob API or heap acceptance. A native AbortController typically does not synchronously throw on ordinary abort; the throwing-provider tests prove resilience at a supported owner-realm adapter boundary rather than implying a widespread browser implementation defect.

## Required local acceptance

In a complete installed checkout of the final branch:

```sh
npm ci
node --test core/ClipboardController.test.js core/ClipboardController.media-resource.test.js \
  core/ClipboardFragment.test.js core/ClipboardPlans.importOwnership.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
```

In Chromium, Paste two files into one editor and confirm one atomic history step, order and media. Trigger read-only/destroy from a file matcher and ensure later matchers, resolvers and DOM publication do not run. Verify copied/undone blob media lifetimes, cancellation during slow file resolution, editor recreation and reentrant newer Paste ownership. Complete the separate v1/v2 per-plugin/user-visible parity matrix.

**Outcome:** two independently reproduced Clipboard runtime lifetime defects fixed with four negative tests and one positive control; **78/78 current scoped source-backed tests** green. Overall Rector v2 release readiness, native browser/TypeScript checks and full behavioral parity remain unverified.
