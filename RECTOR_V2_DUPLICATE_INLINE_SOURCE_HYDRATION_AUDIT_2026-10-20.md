# Rector v2 — duplicate source tokens during inline hydration

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `da074fad061386d5a49dea7dc010dd352dd359a8`

## Scope and invariant

Continue the strict ownership audit for canonical inline widgets and unknown/unloaded inline placeholders. `RECTOR_V2_REMEDIATION_SPEC.md` P2/P3/P4 and I1/I2/I6/I7 require a single real DOM owner for one canonical inline reference, atomic logical offsets, preservation of literal author text and stable Save → Undo → Redo → Reload behavior.

The previous passes established:
- real, mounted widgets and unknown/unloaded inline references occupy one canonical logical caret unit each;
- literal `{{id}}` text that collides with an owned sidecar ID is preserved as an author-owned literal marker;
- an inline occurrence belongs to its actual canonical rich-text field and cannot borrow control/widget DOM ownership.

This pass focused on `InlineProjectionRuntime.#hydrateField()` when a **source rich-text field** contains two raw matching `{{id}}` strings but the **committed canonical model** contains exactly one reference. The source DOM may be dirty after native input and before canonical synchronization.

## Finding SOURCE-DUPLICATE-1 — two opaque atoms minted for one canonical reference (P2)

The hydrator used `state.opaque.get(id)` and `belongsToAuthorField(element, entry.element)` to decide whether a source token was already projected. For the first `{{id}}` match, the new opaque marker was appended only to a **detached DocumentFragment**; it was not yet a descendant of the author field. When the same Text node had a second `{{id}}` match, `belongsToAuthorField()` was necessarily false for the first staged marker, so the second match created another opaque marker and overwrote `state.opaque[id]`.

The public effects were:
- two rendered atomic placeholders for one canonical sidecar entry;
- only the *last* root retained in the runtime's ownership map;
- the earlier orphan root could be skipped during `#serializeField()`, losing user-visible literal text or shifting canonical selection;
- a single canonical widget ID accidentally acquired multiple DOM occurrences.

**RED:** the actual previous `#hydrateField` production method was executed under a controlled synthetic author DOM with source `A{{opaque-1}}B{{opaque-1}}`, one canonical sidecar entry, and `counts.get('opaque-1') === 1`. It produced **2 opaque marker elements**, `state.opaque.size === 1`, and just **1 element** matching the current owned map entry. This proves a genuine DOM owner mismatch, not merely a duplicate regex token count.

## Fix

The hydrator already uses a per-block `live` Set for installed widget instances and `liveOpaque` Set for inert unknown placeholders. Both are updated as soon as the corresponding source token creates a new pending occurrence, **before** its fragment is published.

For each matched owned token, after checking canonical field ownership, the hydrator now immediately skips further matches when `live.has(id) || liveOpaque.has(id)`. This prevents duplicate creation within the same Text node, across adjacent Text nodes, or across later text leaves, while leaving the additional raw author characters intact. Existing connected occurrences remain protected by the earlier current-owner tests; this is an additive guard for not-yet-attached staged instances.

No new model format, widget registry, DOM ownership table or history engine was introduced.

## RED → GREEN evidence

- [Public browser regression for duplicate opaque token](https://github.com/Shelamkoff/editor/commit/c24332e11b0a42b6f721d7569eda2e34a4f0cc90)
- [Production owner guard](https://github.com/Shelamkoff/editor/commit/9daf78f96afd0871030f2c3df5997e6d1f829143)
- [Public browser regression for duplicate installed widget](https://github.com/Shelamkoff/editor/commit/74064fa04c76be1520d1573fa224c57a5b2f968e)

The actual **current** `#hydrateField` source was retested, not a rewritten algorithm:

| Source DOM shape | Opaque marker roots | Installed plugin create() calls | Owned elements | Authored text |
| --- | ---: | ---: | ---: | --- |
| One text node `A{{id}}B{{id}}` | 1 | 1 in installed case | 1 | Second literal preserved |
| Adjacent Text leaves `A{{id}}B` + `{{id}}` | 1 | 1 in installed case | 1 | Second literal preserved |

For both opaque and installed cases, the live source DOM retains the original `{{id}}` characters and the one canonical-owned root remains the exact entry in the runtime map. Saving them must distinguish the literal from the real reference using the existing `oe-inline-literal` serialization marker; the new browser regressions assert that separately.

## Focused source-backed tests

| Check | Result | Limit |
| --- | --- | --- |
| Original duplicate opaque hydration | **RED: 2 roots, only 1 owned** | Exact old private source, controlled synthetic DOM |
| Current opaque hydration across 2 source shapes | **GREEN: 1 root, 1 owned** | Exact current private source, controlled synthetic DOM |
| Current installed plugin hydration across 2 shapes | **GREEN: 1 create(), 1 owned root** | Exact current source + source plugin lifecycle helpers |
| Shared UTF-16 tests (including opaque caret atom) | **10/10 passed** | Current source/tests under isolated V8 adapter |
| Logical selection | **28/28 passed** | Actual current source/tests, isolated V8 |
| Inline selection authority | **22/22 passed** | Actual current source/tests, isolated V8 |
| Inline content normalization | **9/9 passed** | Actual source/tests, isolated V8 |
| Text-offset owner realm | **1/1 passed** | Actual source/test, isolated V8 |
| Inline widget input controller | **35/35 passed** | Actual current source/tests, isolated V8 with microtasks |
| Native input controller | **29/29 passed** | Actual current source/tests, isolated V8 |
| Keyboard router | **42/42 passed** | Actual current source/tests, isolated V8 |
| Renderer unit tests | **10/10 passed** | Actual current source/tests, isolated V8 |
| **Total focused related tests** | **186/186 passed** | Not a full Node.js project test run |
| Syntax checking | **7/7 passed** | Imports/exports removed for V8 static parse |
| New full Rector Chromium regressions | **Written, not executed** | No full editor checkout with browser dependencies |
| Full `npm test`, TypeScript, browser, docs, package acceptance | **Not run** | Full checkout/dependencies unavailable in the local container |
| Full v1/v2 behavioral parity | **Not established** | Requires whole-editor real native interaction and history acceptance |

## Acceptance still required

From the complete branch checkout:

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

In Chromium, verify source with one canonical occurrence and multiple raw identical token-shaped literals, both in the same Text node and in adjacent leaves; repeat with an installed widget and an unloaded opaque placeholder. Save the result, Undo, Redo and Reload. Verify one actual widget/atomic caret position, preserved ordinary literal text, one sidecar entry, and no retired/orphan DOM owners. Also test that the public `serializeBlock()` output is stable after source reconciliation.

The source-backed V8 tests establish the precise defect and the focused fix, but do not establish full browser-side Undo/Redo or global v1/v2 feature parity.

All writes used the latest target file blob SHA, with direct commits on the existing branch and no force push or overwriting unrelated parallel work.
