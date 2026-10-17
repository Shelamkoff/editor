# Rector v2 — inline payload admission and renderer semantic-signature audit

**Date:** 17 October 2026  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `d27680dfa39a323278f22802d513ff438f911ab8`  
**Last code commit before this report:** `6e8b3d0cc7f37bd7efa52ae29de529f0858eebb1`  
**v1 behavioral reference:** `master` `5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`.

## Scope

This pass extended the previous schema/JSON/style ownership audit to (1) individual inline widget decoding through both the direct and full-block shared document boundaries, and (2) incremental renderer DOM reuse for unrevisioned but semantically identical JSON input. Each change was made directly to the ongoing refactoring branch, without PR or new legacy compatibility paths.

The pass inspected `shared/DocumentSchema.js`, its existing tests and document-format contract, `renderer/EditorRenderer.js`, the public `renderer/index.js` boundary, the renderer's existing incremental reuse tests, and the related JSON/schema/canonical-history regression suites.

## D1 — eager inline map clone executed rejected or later author getters

`decodeCurrentInlineMap()` previously called `cloneEditorData(input)` on the **entire map** before checking each inline record's declared fields, exact `dataVersion`, or registration status. This triggered arbitrary enumerable getters on unsupported metadata; read nested payloads that should have been rejected as unsupported versions; and even read later inline occurrences before detecting an invalid first entry.

**Before:** 14/18 focused `DocumentSchema.test.js` cases passed, with four new RED cases independently reproducing:

1. Unsupported inline field getter executed instead of producing the required unsupported-field error.
2. Known block with wrong version had its deep data getter invoked before the version error.
3. Known inline widget with wrong version had its deep data getter invoked before the version error.
4. Invalid first inline record allowed the decoder to invoke a getter on an unrelated second record.

**Fix:** iterate the inline map by own string keys and process each entry atomically: inspect only allowed envelope keys and metadata once, check the registered exact-version schema **before** touching the payload, then deep-own the admitted JSON data. A registered result is decoded and re-owned by its schema; unknown extension data remains inert and owned. Preserve special own keys including `__proto__` by defining result properties explicitly, and reject enumerable symbol metadata without invoking its getters.

`decodeCurrentBlock()` now checks a known block's version **before** cloning the block payload; it also defers the block's `inline` sidecar until `decodeCurrentInlineMap()` has performed the occurrence-level checks.

- [RED cases](https://github.com/Shelamkoff/editor/commit/ebdfaad7b64ae1e3068d4976beffe0e37ba7f44b)
- [Production fix](https://github.com/Shelamkoff/editor/commit/f717ff49cc057e9a7888159ff952c93ff40f2d20)

A subsequent pass also identified that the shallow block/document envelope validation, after previously removing object spread, had lost rejection of enumerable symbol metadata. Two new RED tests reproduced acceptance of such keys, with a third positive case confirming deferred decoding of an inline sidecar embedded inside a block. The shallow boundaries now reject enumerable symbol keys without executing their getters.

- [Symbol and embedded-inline tests](https://github.com/Shelamkoff/editor/commit/716349783891a2e3b0bf948313c89b8d6ef6d093): 1/3 passed before the symbol fix
- [Production fix](https://github.com/Shelamkoff/editor/commit/ca549ca5a6a7605f33c14efccc85ab35b95bc041)

**After:** the entire committed `shared/DocumentSchema.test.js` suite passed **21/21** cases on the final production source.

## R1 — unrevisioned renderer repainted blocks solely due to JSON object key order

`EditorRenderer.#blockSignature()` already preserves its O(1) producer-revision signature. However its fallback for unrevisioned blocks used `JSON.stringify` on the canonical data, tunes and inline maps. Object key insertion order therefore altered the signature without changing the document's meaning. A second `renderTo()` unnecessarily destroyed and remounted the live block, potentially losing focus, iframe state and other DOM resources. The canonical editor/model equality contract had already treated object key ordering as irrelevant.

**RED:** executing the previous production `EditorRenderer` in a controlled owning-DOM harness, semantically identical nested JSON keys caused **two renders, no DOM reuse, and one disposal**.

**Fix:** create a deterministic stable JSON signature on the deep-signature fallback path: sorted object keys at every nesting level, original ordered arrays, and JSON-escaped primitive values. The code is limited to already-owned/validated JSON values. The fast producer-revision branch remains unchanged and does not traverse deep content.

- [Committed public API regression](https://github.com/Shelamkoff/editor/commit/7daa376753d804af66c7aafaa189ef7f6128d60c)
- [Production fix](https://github.com/Shelamkoff/editor/commit/d730ca84a90fbe13ff662bcb22b9545c3b3f6914)
- [Defensive string return type](https://github.com/Shelamkoff/editor/commit/6e8b3d0cc7f37bd7efa52ae29de529f0858eebb1)

**GREEN:** the **actual committed regression body** from `renderer/index.test.js` passed through the public `EditorRenderer` adapter and production `EditorRendererImpl`, `snapshotCurrentBlockEnvelope`, `snapshotCurrentDocumentEnvelope`, `snapshotDataSchema`, and JSON ownership helpers in a controlled V8 DOM. Its assertions prove one render and identical DOM for reordered nested `data`, `tunes`, and `inline` objects, followed by a second render and disposal only when array item order actually changes.

## Focused tests actually executed

| Test family | Passed | Boundary |
|---|---:|---|
| `shared/DocumentSchema.test.js` | **21/21** | Production decoder, shallow envelope, JSON ownership, validation issue metadata |
| `shared/snapshotDataSchema.test.js` | **7/7** | Production schema snapshot and exact-version contract |
| `core/DocumentIngestion.equality.test.js` | **3/3** | Production ingestion with current shared document decoder |
| `shared/jsonData.semantic-equality.test.js` | **4/4** | Production JSON equality |
| `core/CanonicalTransforms.test.js` — semantic equality cases | **2/2** | Production canonical comparator (other transform tests not included) |
| `renderer/index.test.js` — new unrevisioned signature case | **1/1** | Actual public renderer and production implementation with controlled DOM |
| **Total** | **38/38** | Source-level focused execution, not full project test runner |

All checks above were executed against current production source; DOM/Host APIs and selected extension dependencies were injected where the GitHub connector environment did not provide a complete native checkout. RED results were checked against the prior unpatched implementation and GREEN results against the corresponding committed fixes. This report does not conflate targeted V8 checks with a real Chromium session.

## Remaining release gates

These checks **do not** establish whole-library release stability or exhaustive v1 behavioral parity. The following still require the user's full local checkout and supported browser toolchain:

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

Specifically verify renderer producer-revision O(1) reuse, cross-browser unchanged DOM/selection preservation, correct accessibility state and widget identity on remount, full default block/inline plugin compatibility, all renderer config declarations, and both renderer and editor transaction recovery on failed late inline records. Keep the final assessment scoped to code and tests actually executed.
