# Rector v2 — hidden/orphan inline references and staged opaque lifetime

**Date:** 2026-10-20  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `9d62a8e9be763324da915d37b744baf1feb9a232`

## Goal and invariant

Continue [the opaque inline selection and ownership audit](RECTOR_V2_OPAQUE_INLINE_ATOMIC_SELECTION_AND_FIELD_OWNER_AUDIT_2026-10-20.md) and the [duplicate source-token audit](RECTOR_V2_DUPLICATE_INLINE_SOURCE_HYDRATION_AUDIT_2026-10-20.md).

The v2 remediation specification P2/P3/P4 and I1/I2/I6/I7 requires that inline references and payloads survive model/history replay without allowing coincidental literal `{{id}}` author text to manufacture another widget reference. A block can have **schema-declared rich-text fields not currently mounted**, and an opaque sidecar key can legitimately exist without a referenced occurrence until a semantic edit prunes it.

The prior implementation reserved only the IDs of currently mounted widget/opaque DOM leases when serializing rich-text fields. This covered mounted sibling fields, but not the remaining canonical/model-side cases.

## Finding HIDDEN-REF-1 — invisible canonical reference could be duplicated by a visible literal (P2)

A canonical inline `hidden-1` can belong to the hidden rich-text field `Hidden {{hidden-1}}`, with a matching opaque sidecar entry. The visible field may have no widget DOM at all. If an author types the *literal* characters `{{hidden-1}}` into the visible field, the former `InlineProjectionRuntime.serializeBlock()` emitted the raw token because `state.widgets` and `state.opaque` did not contain the hidden ID.

Canonical assembly then sees **two** references to one sidecar ID, potentially rejecting the author edit or misclassifying text.

**RED:** the actual prior public `serializeBlock()` and private `#serializeField()` were exercised under a controlled DOM. The visible field serialized `Visible {{hidden-1}}` without a literal marker, while hidden canonical data still contained `Hidden {{hidden-1}}`.

**Fix:** scan each schema-declared *canonical* rich-text field once to record its sidecar-backed inline references and owning `fieldKey`. When serializing any mounted field, reserve IDs whose canonical owner is **another** field, even if that field is not mounted. The true owning field still allows its raw unloaded reference to remain canonical; unrelated author text elsewhere becomes `<span class="oe-inline-literal">{{id}}</span>`. The live editing DOM is never normalized or rewritten.

**GREEN:** the exact updated public+private methods produced:
- visible: `Visible <span class="oe-inline-literal">{{hidden-1}}</span>`;
- hidden: `Hidden {{hidden-1}}` untouched;
- original opaque inline sidecar data unchanged;
- original visible Text-node identity unchanged.

- [Browser RED regression](https://github.com/Shelamkoff/editor/commit/43ea4d78a594ed0b941b0ac11de79d4dfb3777f2)
- [Production fix](https://github.com/Shelamkoff/editor/commit/8cdbf5a78d8fd69f794b4a5306fc4f45c53ae7ab)

## Finding ORPHAN-REF-2 — orphan sidecar could be resurrected by typing a literal ID (P2)

If a block retained an `inline['orphan-1']` payload **with no canonical reference in any schema-declared field**, the previous serializer similarly emitted a newly typed `{{orphan-1}}` as an unmarked token, accidentally giving that orphan payload a live canonical reference.

**RED:** the actual previous public `serializeBlock()` implementation was evaluated with a controlled field serializer that consumed its ID-reservation iterable. A visible `{{orphan-1}}` literal was not reserved and stayed raw.

**Fix:** after scanning canonical fields, reserve every sidecar ID for which **no** canonical owner field exists. This prevents incidental author text from reviving an unreferenced widget; the normal canonical assembler can prune genuinely unreferenced payloads after a semantic edit. Do *not* reserve an unloaded ID in its **own** field if it genuinely has a canonical reference.

**GREEN:** the exact updated public method passed three independent reservation cases:
- orphan sidecar without any canonical reference → author text marked literal;
- canonical reference in hidden field → visible matching token marked literal, hidden reference unchanged;
- real opaque reference in current field → canonical `{{id}}` remains unmarked, not pruned.

- [Browser RED regression](https://github.com/Shelamkoff/editor/commit/05e1433eddb501a0473c20eaeb8ad960b2a9b99a)
- [Production fix](https://github.com/Shelamkoff/editor/commit/0e53666ea4a078bb95fa09962d5e6615bd8d8514)

## Staged opaque reference lifetime (no additional production defect confirmed)

A new public browser test defines the `prepareBlock()` / `discard()` / `apply()` / `recover()` / `finalize()` / `destroyBlock()` lifecycle for an unloaded inline placeholder of the same canonical ID. It asserts that discarded and rolled-back candidate DOM leases are released, the previous committed placeholder survives rollback, finalized successor DOM takes over, and block destruction retires the final marker.

**Source-backed verification:** the exact current `InlineProjectionRuntime` methods were evaluated in a controlled DOM with candidate fields and the actual private `#opaqueOwned` and state maps. All lifecycle checks passed. This is not a full BlockReconciler/TransactionEngine or Chromium integration test.

- [Candidate lifecycle browser regression](https://github.com/Shelamkoff/editor/commit/6c82b09569bff9409d2f3e1b4112353b58e1c070)

## Test and acceptance evidence

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Old hidden-field inline ID serialization | **RED** | Actual previous public+private source, synthetic DOM |
| Current hidden-field serialization | **GREEN** | Actual updated methods and same synthetic DOM |
| Orphan reference ID reservation | **RED → GREEN** | Actual public `serializeBlock()`; controlled private serializer |
| True unloaded own-field canonical reference | **GREEN** | Actual public method; raw reference preserved |
| Prepared opaque candidate discard/recover/finalize | **GREEN** | Actual lifecycle source in isolated V8 + synthetic DOM |
| Text offsets, logical selection, inline authority, normalization, owner realm, renderer | **80/80 passed** | Current source/test suites, isolated V8 |
| Inline widget input, native input, keyboard routing | **106/106 passed** | Current source/test suites, isolated V8 including Promise/microtask cases |
| **Total related suites** | **186/186 passed** | Source-backed test adapters; not the full package runner |
| JavaScript syntax | **7/7 passed** | Changed projector and browser tests plus relevant shared modules; ESM syntax stripped |
| New full Rector browser regressions | **3 authored, not run** | Hidden reference, orphan sidecar, staged lifecycle |
| `npm test`, TypeScript, real editor Chromium, docs/package gates | **Not executed** | Complete repository checkout and dependencies unavailable locally |
| Full v1/v2 feature parity and Undo/Redo acceptance | **Not established** | Requires actual editor browser history and replay |

## Documentation updates

The [English inline extension guide](docs/guide/inline-extensions.md) and [Russian guide](docs/ru/guide/inline-extensions.md) now explain block-scope IDs, hidden canonical fields, unreferenced sidecars, and why their matching literals do not acquire widget ownership.

## Required remaining acceptance

From a full checkout:

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

Prioritize genuine full-editor **Save → Undo → Redo → Reload**, including composite blocks with hidden rich-text fields, unknown/unloaded sidecars, author literals colliding with references in other fields, orphan sidecars awaiting pruning, one-operation history, backward UTF-16 selection, and staged reparent/remount of the same canonical block ID.

This audit demonstrates two concrete fixed model-to-DOM misclassifications but **does not** claim complete v1/v2 behavioral parity or release stability. Changes were committed directly with fresh per-file GitHub blob SHA checks; no force push or unrelated changes were overwritten.
