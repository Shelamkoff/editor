# Rector v2 — Renderer early schema admission and snapshot ownership audit

**Date:** 17 October 2026  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `2ed95d2168220d60251720ff34d5587b44886119`  
**Last production commit of this pass:** `7c0e7dc1a80ca9907e3ab1daed63eed049a34cbf`  
**Historical behavior reference:** Rector v1 at `master`, `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

## Context and specification

This independent audit checked the renderer's exact current-version admission, the producer-revision fast path, JSON snapshots, stylesheet acquisition and atomic DOM reuse. The source of requirements is `RECTOR_V2_REMEDIATION_SPEC.md`, section 4.3: a registered block with a mismatched `dataVersion` is rejected before attempting to decode the payload; an unrevisioned block must undergo current-format deep validation, while an unchanged producer `revision` must allow O(1) reuse without traversing the opaque data. Failed late blocks must not alter existing DOM owners.

Tests were written first and committed directly to the existing branch, reproducing the problem against unpatched production code before the implementation was changed.

## R1 — Registered wrong-version block was deeply inspected before version admission

The public `renderer/index.js` previously copied every unrevisioned block deeply in `prepareOutputData()` before knowing the renderer's registered schema version. Even with a producer revision, `EditorRenderer.#createRenderedBlock()` called `cloneEditorData(block)` before `renderer.schema.decode()`. For wrong-version data containing an accessor-backed payload, the getter could throw first. This suppressed the meaningful schema-version error, its content-free `unsupported-data-version` validation diagnostic and the `InvalidBlockDataError` cause chain.

The problem was reproduced for **all three public methods**, with and without a producer revision:

- `renderBlock`: unrevisioned and revisioned.
- `render`: unrevisioned and revisioned.
- `renderTo`: unrevisioned and revisioned, including a previously mounted good block that must remain unchanged when a later invalid block is rejected.

**RED:** all six new cases failed against the previous public and production implementation, reporting the hostile payload getter error instead of the required version rejection.

**Fix:** the owning renderer now checks registered `schema.currentVersion` before performing any deep copy. Unsupported versions are reported through the existing content-free validation observer and wrapped in `InvalidBlockDataError` with a `RangeError` cause. For document operations, all block versions are admitted before the complete set of unrevisioned author data is deeply snapshotted. `renderer/index.js` retains only the strict shallow envelope; the owning renderer itself performs the preflight and snapshot. No separate schema registry or legacy format decoder was introduced.

- [RED test cases](https://github.com/Shelamkoff/editor/commit/4242bc2da0d7075eb38c37c114f9cda3ce3b9309)
- [Version admission and internal snapshot implementation](https://github.com/Shelamkoff/editor/commit/60ba95b4ff2bf4e349f31e8eea0101f027028c35)
- [Public adapter adjustment](https://github.com/Shelamkoff/editor/commit/14e367a556c729949a0ffcf77f15743b05d1ccf7)

**GREEN:** 6/6 version admission cases passed. Error classification and the previous mounted DOM were explicitly asserted.

## R2 — Preserve document snapshot isolation and O(1) producer revisions

Moving the unrevisioned deep-copy boundary into the renderer must not allow earlier renderer callbacks to mutate later input before it is owned. Two tests now assert that during `render()` and `renderTo()`, an earlier custom renderer's synchronous mutation of a later caller-owned data object cannot affect what the later renderer receives. Another test asserts that a same-type/current-version block with an unchanged producer `revision` reuses the exact DOM element without enumerating or cloning a hostile replacement payload.

- [Added regression and positive-control tests](https://github.com/Shelamkoff/editor/commit/929d84e27ea3c6d6d917b69e6e01a7ea0eaf798c)

**GREEN:** both eager-snapshot cases and the producer-revision reuse case passed, 3/3.

## R3 — Stylesheet insertion callback could mutate author JSON before ownership

A later audit of the new snapshot location identified an actual callback reentry hazard: `#ensureStyles()` was invoked before the renderer's new snapshot. A synchronous `head.appendChild(link)` callback could change the caller's JSON during style acquisition, and `render` or `renderTo` would then render the changed value rather than the value supplied at the public boundary. This was a regression risk introduced by moving deep snapshot responsibility.

**RED:** both `render` and `renderTo` new cases failed (0/2), and a subsequent test showed that `renderBlock` also had this pre-existing boundary error.

**Fix:** snapshot every unrevisioned document block before stylesheet acquisition begins for `render` and `renderTo`. For `renderBlock`, validate the version and clone the author record first, then acquire CSS; forward the already-owned record to `#createRenderedBlock()` without a redundant second clone. Preserve previous error handling and lifecycle ownership semantics.

- [RED render/renderTo cases](https://github.com/Shelamkoff/editor/commit/8c7684dff86c3e64418f46112ec0e46fd3b75b90)
- [Document render fix](https://github.com/Shelamkoff/editor/commit/a22e9f09015c370be1d7c1daf87fd48ee92758c8)
- [RED renderBlock case](https://github.com/Shelamkoff/editor/commit/d990d9095c386d2d2e356858f82bfe38da074457)
- [Single-block fix](https://github.com/Shelamkoff/editor/commit/7c0e7dc1a80ca9907e3ab1daed63eed049a34cbf)

**GREEN:** all three stylesheet/reentry cases passed. The final `renderer/version-preflight.test.js` suite passed **12/12** focused cases.

## Verification actually executed

| Test suite / subset | Final results | Boundary |
|---|---:|---|
| `renderer/version-preflight.test.js` | **12/12 PASS** | All committed new tests on the public renderer and production implementation |
| `renderer/index.test.js` selected reuse, render, author getter and styling cases | **6/6 PASS** | Actual older test bodies; real text-alignment helper, controlled DOM |
| `renderer/reentrancy.test.js` selected ownership, teardown, DOM rollback and projection cases | **13/13 PASS** | Actual older test bodies, controlled DOM and resource adapters |
| **Total** | **31/31 PASS** | Production-source V8 execution, not the full project test runner |

The renderer version tests include six negative public API routes, two cross-block snapshot-isolation scenarios, one unchanged-revision fast-path control, and three stylesheet callback reentry scenarios. Older index/reentrancy cases were selected by their relevance to the changed paths. All code/tests were retrieved from the live refactoring branch and executed against the final production source.

## Remaining acceptance and limitations

These are deterministic source-level checks with controlled DOM and selected dependencies, **not an installed-package, browser-engine, or full-repository npm test run**. A native Chrome/Firefox/WebKit pass remains necessary for cross-document element ownership, CSS handling, custom-element callbacks, real selection state and the v1/v2 user-behavior matrix.

Full local gates not executed by this pass include:

```sh
npm ci
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

The fix removes the proven wrong-version payload traversal and stylesheet reentry risks while preserving tested producer-revision reuse and DOM rollback. It does **not** by itself prove that the entire Rector v2 library is release-stable or has exhaustive behavioral parity with v1.
