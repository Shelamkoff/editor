# Rector v2 — opaque inline atomic selection, source-field authority and replay

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `707f46ac8682d27ef5476897f24af04b38c9fa1e`  
**Code checkpoint before this report:** `87211b64e72af0309fb615ab1ea65fc26a50d3c1`

## Contract

Continue [multi-field inline serialization and opaque unloaded reference audit](RECTOR_V2_MULTI_FIELD_OPAQUE_INLINE_SAVE_AUDIT_2026-10-19.md). The active remediation specification requires exact current v2 model semantics, retaining unknown/unloaded inline sidecars, logical UTF-16 selection coordinates, one interaction/history owner, and no resource authority transfer merely because a DOM node or canonical ID survives a remount.

Unknown/unloaded inline payloads remain **inert**, but they are still canonical references with atomic one-unit selection offsets. They must retain their visible `{{id}}` characters and opaque sidecar without acquiring a plugin instance or editing capability. A string `{{id}}` with **no** matching sidecar remains ordinary author text.

## Finding OPAQUE-CARET-1 — unknown references had a different model and DOM length (P2)

`getRichTextLogicalLength('A{{opaque-1}}B', inlineWithOpaqueRef)` counts a sidecar-backed inline reference as one atomic position, giving total length 3. `InlineProjectionRuntime.#hydrateField()` formerly skipped the reference altogether when its type was unregistered. The visible DOM therefore contained an editable Text leaf of length **14 UTF-16 units**. Saving an opaque payload itself was previously protected, but logical selection, native input offsets and history replay could still be inconsistent with the canonical model.

**RED:** actual previous `shared/textOffset.js` on the author field returned 14 logical units, versus 3 expected for the canonical one-unit reference. A new full-browser regression was authored before the production fix.

**Fix:** when a canonical sidecar ID occurs exactly once but the registry has no inline definition or runtime, project a **visible inert atomic span**, with `data-inline-plugin="__unregistered__"`, `data-oe-opaque-inline="<id>"` and `contentEditable=false`. Store its exact identity in a private per-block `state.opaque` Map plus a private WeakMap lease. The span is *not* an extension instance, receives no plugin scope, cannot invoke plugin editing, and is not trusted by arbitrary DOM attributes. It occupies one unit because the existing shared `textOffset` logic treats inline roots as atomic.

The serializer recognizes only the exact currently owned opaque element/field lease, writes its real canonical reference through the existing out-of-band reference marker, and reserves its ID against literal user text. This also fixes literal `{{opaque-id}}` typed next to a retained unknown reference, without converting the original payload into a literal span. Destroy/reconcile/replay retires the old marker and creates a fresh lease. An unmatched `{{ghost}}` token still occupies its full ordinary text length.

**GREEN:** actual current `#projectState`, `#hydrateField`, and `#serializeField` method bodies, executed in controlled DOM from current GitHub sources, showed:
- visible text remains `A{{opaque-1}}B`, but `getTextLength(field) === 3`;
- projected marker is non-editable and serialization is exactly `A{{opaque-1}}B`;
- appended author literal `{{opaque-1}}` is saved as `<span class="oe-inline-literal">{{opaque-1}}</span>`, leaving one true ref;
- canonical removal detaches the owned atom without deleting the separately authored literal;
- a later replay with the same ID uses a fresh inert marker and again has length 3.

Native Chromium standalone smoke confirmed that the inert contenteditable=false span displays identical text, stays non-editable inside an editable field and leaves surrounding text selectable. It did **not** load the Rector package.

Changes:
- [Browser RED regression and replay contract](https://github.com/Shelamkoff/editor/commit/3ff742defe8bc43c137cddb77565dc97874bc9f4)
- [Production ownership/atomic projection](https://github.com/Shelamkoff/editor/commit/fb83778f7a09c2cb882a15bb313afdcb424b8924)
- [Canonical removal preserves independently typed literal](https://github.com/Shelamkoff/editor/commit/00c5e182f346e02ed234c435d9694903dbbc7f8e)
- [Independent shared atomic-offset test](https://github.com/Shelamkoff/editor/commit/3e18893537cb13f49c5a31490ae89b204fc17ada)
- [UTF-16 surrogate boundary correction in test](https://github.com/Shelamkoff/editor/commit/6f2298213fdd20b5ee14f3e9cb745dc06a558636)
- [Runtime authority regression](https://github.com/Shelamkoff/editor/commit/87211b64e72af0309fb615ab1ea65fc26a50d3c1)

## Finding INLINE-FIELD-2 — source reconciliation stole a current inline ID from a sibling field (P2)

The previous `#hydrateField()` scanner knew canonical sidecar occurrence counts but not which rich-text field actually **owned** that reference. In a multi-field block, a real mounted widget or inert opaque reference in Answer could coexist with a newly typed literal `{{id}}` in Question. If a source reconciliation ran before Save, it could treat the Question text as a new canonical reference and retire or move the actual Answer occurrence, despite the canonical model still identifying Answer as the only owner.

**RED:** exact prior `#hydrateField()` source was executed with a live opaque marker owned by Answer and a matching typed literal in Question. The scan removed the Answer marker, created a new opaque atom in Question, and changed the private owner field key before Save.

**Fix:** `#projectState()` now collects the canonical `fieldKey` alongside each unique sidecar reference while scanning all schema-declared fields. `#hydrateField()` only interprets a raw `{{id}}` as a widget when it occurs in that canonical owner field. Existing widget and opaque-marker liveness checks follow the same owner-field constraint, including the case where a canonical operation intentionally transfers a reference between fields. This prevents an incidental sibling literal from stealing any kind of inline occurrence.

**GREEN:** actual updated `#hydrateField()` method with canonical Answer ownership left the old inert Answer occurrence intact, preserved the Question literal Text-node identity and kept the owner field key as Answer. The public browser suite now includes both registered and unloaded types under source reconciliation.

Changes:
- [Browser RED regressions for mounted and opaque sibling ownership](https://github.com/Shelamkoff/editor/commit/62ad457f75513eae3a766e15afbb4fd03197fd68)
- [Canonical owner-field fix](https://github.com/Shelamkoff/editor/commit/3b757417aac59b625c1fb58f70344a45f6ccecd8)

## Focused verification

| Gate | Result | Scope |
| --- | --- | --- |
| Old opaque token logical length | **RED: 14 vs 3** | Actual shared text-offset helper on previous raw DOM representation |
| Current opaque projection / save / removal / replay | **GREEN** | Actual method bodies with controlled DOM and exact private leases |
| Previous cross-field opaque source hydration | **RED: wrong owner** | Actual previous method moved the inline ID to Question |
| Current cross-field source hydration | **GREEN** | Actual current method retains canonical Answer owner |
| Shared UTF-16 / text offset tests | **10/10 passed** | Actual current helper and test source, isolated V8 |
| Logical selection | **28/28 passed** | Source-backed V8 |
| Inline selection authority | **22/22 passed** | Source-backed V8 |
| Inline widget input controller | **35/35 passed** | Source-backed V8 including microtasks |
| Native input controller | **29/29 passed** | Source-backed V8 |
| Keyboard router | **42/42 passed** | Actual helper/controller tests; final V8 adapter configured with real shared offset functions |
| Inline normalization | **9/9 passed** | Source-backed V8 |
| Read-only renderer | **10/10 passed** | Source-backed V8 |
| Owner-document realm offset | **1/1 passed** | Source-backed V8 |
| **Combined focused suites** | **186/186 passed** | Isolated V8 test/assert adapters, not `npm test` |
| Syntax of directly relevant JS source/tests | **5/5 passed** | V8 parsing after stripping ESM import/export, not TypeScript |
| Standalone Chromium DOM smoke | **Passed** | Verifies the inert span's native DOM semantics only |
| Authored full Rector browser scenarios | **Not executed** | Project test harness absent in the working container |
| Full package/typecheck/browser/docs gate or v1 parity | **Not established** | Requires a complete checkout with dependencies |

## Documentation and remaining work

- [English inline extension guide](https://github.com/Shelamkoff/editor/commit/9f8cc36d3bb694979722c3f8151c57cc803f4451)
- [Russian inline extension guide](https://github.com/Shelamkoff/editor/commit/40b5af7d6091ea867ce504bbc79ae224e1d2037f)

Required complete checkout acceptance:

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

In real Chromium test: one opaque reference next to Unicode text; collapsed selection before/after the atom; native Backspace/Delete; initial save and undo/redo; same-ID block remount; a matching typed literal in the same and different rich fields; an actual registered widget moved canonically to another field; changing from an unloaded to loaded registry in a **new** editor instance; and a stale opaque DOM reference from an older block generation. Verify exactly one canonical sidecar reference, stable text/caret, and one history entry per user gesture.

**Important limitation:** the runtime library is not fully checked out in this environment; package tests and real browser editor gestures could not run. These changes are concrete code fixes with source-backed focused checks, not a release stability claim. All changes were committed directly using fresh GitHub content SHA preconditions; no force pushes or overwrites of unrelated parallel changes.
