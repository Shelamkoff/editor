# Rector v2 — ZIP archive byte quota and filename portability audit

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `8a068c9710aa721c52a06180a8f8a4f309d5ac7c`  
**Original ZIP renderer blob:** `c83ff1d5f6b78b157a5680d69320e01b972092a2`  
**Verified updated renderer blob:** `be5317cd137baa9425af11d674a5374e9710da01`

## Scope and requirements

Continued the active Rector v2 stability and functional-parity audit after prior ZIP cancellation fixes. Examined actual `renderer/renderers/attaches/index.js` and `renderer/renderers/attaches/index.test.js`, the existing ZIP cancellation report, and relevant resource/ownership constraints in `RECTOR_V2_REMEDIATION_SPEC.md`. The acceptance intent is to preserve partial success for recoverable attachment transfer failures, enforce the declared 25 MiB per-file / 100 MiB aggregate ZIP memory budget, and generate flat, unique, portable ZIP names. This is not an attempt to restore legacy v1 serialization/API.

## Finding ARCHIVE-QUOTA-1 — failed stream retained its byte reservation (P2)

### Reproduction

Before the fix, `readBoundedResponse()` incremented shared `total.value` for each stream chunk, even when the reader later threw. The catch canceled the reader but did not return that file's counted bytes. The worker intentionally tolerated an ordinary network error to preserve partial ZIP success, so later successful responses could exceed the **incorrectly inflated** total and cause a `RangeError`.

A direct source-backed reproduction used an existing total near the aggregate cap, a failing 6-byte stream, and a valid 5-byte stream; the failed stream left the total inflated, causing the valid stream to fail despite sufficient true remaining budget.

The committed public-boundary regression uses a real 24 MiB stream that fails, three staged valid 25 MiB Blob responses, and a valid 2 MiB Blob response. The accepted files total **77 MiB**, below the 100 MiB bound, but the stale 24 MiB reservation pushed the pre-fix total to **101 MiB**. The original `downloadArchive()` rejected instead of producing the partial archive. The test stages large responses behind a gate to make the ordering deterministic, keeps the declared production limits intact, and shares one 25 MiB buffer between the staged fixtures.

### Fix

- Maintain an explicit per-stream `reserved` count of in-flight bytes.
- Check per-file and aggregate capacity **before** admitting each new chunk.
- Refund the stream's reserved bytes on any read, cancel, copy or validation failure, including a cancellation that arrives during the reader's last awaited continuation.
- Retain reservations on successful decoding so concurrent files still respect the aggregate in-flight limit.
- At the worker boundary, refund bytes from a fully decoded but non-admitted file if ZIP insertion fails or is revoked, without altering the existing partial-network-failure policy.
- Reserve Blob bytes only after successfully reading and validating the resulting buffer.

The aggregate limit remains a cap on committed **plus in-progress** reads; simultaneous streams can still fail closed on genuine over-budget pressure.

Commits:
- [RED regression](https://github.com/Shelamkoff/editor/commit/98c3b9bf278b9b283e00a82412ed9035f9b98576)
- [Production quota fix](https://github.com/Shelamkoff/editor/commit/be134a9edfcf741f54e21f17a4d2d585b0014edd)

## Finding ARCHIVE-NAME-1 — duplicate long extensions could exceed the 128-unit ZIP name limit (P3)

The existing `sanitizeArchiveFilename()` capped an original name at 128 UTF-16 code units, but `uniqueArchiveFilename()` inserted ` (2)` before an extension without always reserving space for the marker. Repeating `a.` followed by 126 `x` characters generated a **132-unit** second ZIP entry.

The correction reserves capacity for the duplicate suffix, at least one stem code unit and the retained extension. If the extension is abnormally long, it is truncated as needed. The existing collision loop still ensures unique case-folded archive names.

## Finding ARCHIVE-NAME-2 — a Unicode truncation could leave a dangling surrogate (P3)

`sanitizeArchiveFilename()` previously used `slice(0,128)`; for `'x'.repeat(127) + '😀'`, the result ended in the isolated leading UTF-16 surrogate rather than the complete emoji or a clean shorter filename.

Added `truncateArchiveFilename(value, maxLength)` to omit a dangling high surrogate at the boundary, and reused it for original names and collision suffix candidates. This is bounded UTF-16 safe truncation, not a general normalization of arbitrary preexisting malformed UTF-16 input.

Commits:
- [RED filename regressions](https://github.com/Shelamkoff/editor/commit/b51244a7c1b98c156055994e7af18c4ab9e04f30)
- [Production filename fix](https://github.com/Shelamkoff/editor/commit/d8b3b501b0859128bc5ffd5afdef8823557d0a05)
- [JSDoc type annotations](https://github.com/Shelamkoff/editor/commit/2da042049000a34ce530192a77b321be45ba2faf)

## RED → GREEN evidence

The updated `renderer/renderers/attaches/index.test.js` contains 17 test bodies, comprising the 14 previously present cases and three new regressions.

Evaluated the **exact actual baseline production source and the updated source** with the same tests in a controlled JavaScript V8 runner. The runner adapts the `node:test` / Node assertion APIs and supplies synthetic `AbortController`, `Response`, `Blob`, ZIP constructor and DOM link operations while executing the actual ZIP production function bodies.

| Checked source | Passed | Failed |
| --- | ---: | ---: |
| Starting blob `c83ff1d5` | **14 / 17** | quota refund, duplicate extension length, Unicode surrogate truncation |
| Updated blob `be5317cd` | **17 / 17** | none |

A standalone source-backed check also reproduced the stale quota with small byte buffers and a valid existing aggregate reservation. The final three test bodies were committed and each independently failed for the intended defect before the corresponding production change.

These results do **not** constitute native `node --test`, real JSZip output parsing, TypeScript check, Chromium download behavior, or full v1/v2 parity.

## Required release acceptance

On a complete installed checkout of the final branch:

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

In Chromium, verify mixed successful and failed attachment streams, long multilingual filenames with collisions, a multi-file archive near the hard size limit, canceled archive URL cleanup, simultaneous file transfers, and the user-facing download action. For v1/v2 feature parity, compare the attachment list/download behaviors and accepted current-format document data, not removed legacy API signatures.

**Release status:** focused source-backed regressions green, **full Rector v2 stability and behavioral parity not established**.
