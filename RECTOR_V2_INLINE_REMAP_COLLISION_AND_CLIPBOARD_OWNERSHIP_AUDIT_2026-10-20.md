# Rector v2 — canonical inline remap collisions and Clipboard sidecar ownership

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `6f8f4310805b9774866e58fa92a0e29d1dae03b5`  
**Code:** `core/CanonicalTransforms.js`  
**Tests:** `core/CanonicalTransforms.test.js`

## Contract and audit scope

Continued the v2 stability and behavioral-parity audit in canonical content transfer. Reviewed `core/CanonicalTransforms.js`, the Clipboard plan paths that call `remapCanonicalFragment()` and `prepareCanonicalInlineMerge()`, `core/projectionFields.js`, shared rich-text placeholder grammar, sanitizer/codec and the project TDD/architecture specification. **I1** requires rich-text and its actual referenced inline payload to move together; **P2** requires preservation of valid current content; **I3** requires invalid preparation to fail without a partially committed result. No legacy format, migration path, duplicate remap framework or new external API was introduced.

## Finding INLINE-REMAP-COLLISION-1 — sidecar IDs silently overwritten during remap (P2)

### Reproduction

The previous `remapCanonicalInline(inline, remap)` immediately mapped `Object.entries(inline)` through `Object.fromEntries()` without first checking the output namespace. A change from `first` → `second` when both IDs were already present produced just the `second` payload, losing the `first` one. A two-to-one mapping `first` → `same` and `second` → `same` similarly retained only the last widget. Destination IDs such as `bad/id` were also accepted although they cannot be expressed by Rector's canonical `{{id}}` placeholder grammar.

The old actual source `d734cde6754261eb701314d31cf37752fa2f3064` yielded those results in a direct exported-function reproduction; no fake UI states were needed.

### Correction

- First enumerate and validate *all* destination IDs, rejecting duplicate destinations **before reading any sidecar payload getters**.
- Require explicitly mapped IDs to match `[A-Za-z0-9_-]+`, the same grammar as `shared/richTextOperations.js`.
- Preserve legal one-to-one swaps (`first` ↔ `second`) without rejecting merely because an original key is temporarily occupied.
- Clone detached payloads only after validating the entire remap.
- Keep literal `__proto__` as an ordinary own JSON key; no prototype mutation or removed opaque/current content.

**RED:** with the four newly added tests, the original source passed **6/9**; the three new negative cases failed as intended. A follow-up test-only commit corrected an overly narrow assertion regex for the message word *collision*. The updated source then passed **9/9**.

Commits:
- [RED namespace and positive-swap tests](https://github.com/Shelamkoff/editor/commit/2688612eac8e7776d025e3dda1d38dc7d5800a38)
- [Source correction](https://github.com/Shelamkoff/editor/commit/e0c2736ede91cc19c86688129accf892feea6b95)
- [Test regex correction](https://github.com/Shelamkoff/editor/commit/38354e7d8570493ebbb184eb7ebc5b900f29ef83)

## Finding CLIPBOARD-UNREFERENCED-SIDECAR-1 — plain-text paste could replace an existing widget (P2)

### Reproduction

`ClipboardPlans.recordWithRichTextFragment()` merges the current block inline table with `remapCanonicalFragment(...).inline` using `{ ...currentInline, ...remapped.inline }`. The old `remapCanonicalFragment()` scanned visible placeholders to decide which IDs needed remapping, but **returned the entire incoming sidecar**, including entries not referenced anywhere in pasted HTML.

For a fragment containing ordinary text only and an unreferenced incoming sidecar key `shared`, pasted into a block whose current `shared` widget belonged to real authored text, the copied unused entry could **overwrite the existing widget payload** during that merge. This violates I1 regardless of the integrity of the source document. The bug was reproduced against the exported `remapCanonicalFragment()` with an owning document supporting real shared rich-text text-node scanning.

### Correction

Pass to `remapCanonicalInline()` only own sidecar entries whose keys occur in `scan.references`, not unrelated entries merely present in the fragment's incoming metadata. Actual visible references retain their payloads and are remapped where they collide with reserved target IDs; unrelated stale entries are not published into the receiving block.

## Finding INLINE-ALLOCATOR-COLLISION-1 — broken allocator could steal another widget's ID (P2)

`remapCanonicalFragment()` and `prepareCanonicalInlineMerge()` previously accepted whatever ID `allocateInlineId(reserved)` returned. If an owner allocator returned an already occupied ID, the helper could create duplicate entries in `Object.fromEntries()` or make a widget's placeholder point to the wrong payload. Invalid destination IDs also created references the reader would not recognize.

The correction centralizes the local validity check: snapshot the previously reserved ID set, invoke the allocator, require the canonical placeholder ID grammar, reject IDs present **before** the invocation, then reserve the accepted ID. A legitimate allocator such as `createSessionIdAllocator()` may itself add its returned ID to `reserved`; the pre-invocation snapshot prevents falsely rejecting that existing contract.

The two exported operations now fail preparation on allocator collisions rather than publishing a collapsed/misnamed inline graph.

Commits for both latter findings:
- [RED clipboard and merge ownership tests](https://github.com/Shelamkoff/editor/commit/36c235135f616dc27268b03957566307271ddcc8)
- [Production reference filtering and allocator validation](https://github.com/Shelamkoff/editor/commit/8a5d5e15c10323f1875d11da8e0a316fdd277d38)
- [Allocator reservation and invalid-ID positive/negative coverage](https://github.com/Shelamkoff/editor/commit/d90138178c1b5b580468d6954ca781457fa24256)
- [Safe own `__proto__` inline occurrence regression](https://github.com/Shelamkoff/editor/commit/cc438017193a9b8248af1ffd58ddae5335270068)

## RED → GREEN evidence

| Production/test stage | Result |
| --- | ---: |
| Original source with first four remap tests | **6/9 passed** |
| First namespace fix with corrected assertion regex | **9/9 passed** |
| More clipboard + merge tests, before second production fix | **10/14 passed** |
| After clipboard and allocator fix | **14/14 passed** |
| Final augmented suite, including allocator self-reservation and own `__proto__` control | **16/16 passed** |

In the final source-backed run, the **real fetched** shared `sanitizeHtml`, `richTextCodec`, `richTextOperations.scanRichTextPlaceholders`, `remapRichTextReferences`, `projectionFields`, JSON clone, and `CanonicalTransforms` functions executed against the complete `core/CanonicalTransforms.test.js` test bodies. The fixture provides a deterministic **text-only owning-document DOM adapter**, so no actual Chromium or arbitrary HTML markup was exercised. ESM imports and Node test/assert APIs were adapted inside isolated V8. The final checked blobs were:

- Production `core/CanonicalTransforms.js`: `e27a1c07208e232402034f4056e5e52bd75ce7b9`.
- Tests `core/CanonicalTransforms.test.js`: `a21a03e90a5cda3bfaaf73a20774f7ebdcf124c3`.

This focused result cannot certify real-browser clipboard behavior, all composite document merges, performance, native package tests, or full v1-v2 capability parity.

## Required local acceptance

From a complete checkout on the current branch:

```sh
npm ci
node --test core/CanonicalTransforms.test.js \
  core/ClipboardPlans.importOwnership.test.js \
  core/ClipboardPlans.localHtml.test.js \
  core/ClipboardFragment.test.js \
  core/ClipboardFragment.ownership.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
```

In Chromium, test Copy/Paste between two independent editors, ordinary text fragments alongside stale inline metadata, same-ID inline widgets from different source blocks, one-to-one remaps, explicit inline insertion, compound block merges, literal `{{id}}` text, and discarded insertion when an ID allocator rejects its candidate. Verify all original valid widget payloads still resolve to the intended occurrences and no unreferenced sidecar overwrites a target widget.

**Status:** three related source-level data-loss/invariant failures corrected with new RED/GREEN regressions and positive controls. Native CI/browser gates and full v1-v2 user-visible parity remain **unverified**.
