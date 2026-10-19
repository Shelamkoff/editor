# Rector v2 — multi-field inline ID scope and opaque unloaded references

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `e55a981739087c62e8b7f184dd4623e2111fcc1e`

## Scope

Continue [the canonical inline literal / formatting audit](RECTOR_V2_INLINE_LITERAL_CANONICAL_MERGE_AND_TYPED_COMPLETION_AUDIT_2026-10-19.md). Audit `InlineProjectionRuntime.serializeBlock()` across composite blocks with multiple rich-text fields and unknown/unloaded inline types under the explicit current v2 schema.

The active specification `RECTOR_V2_REMEDIATION_SPEC.md` requires:
- **P2 / I1:** preserve author text and current block-level `inline` sidecars, including opaque unknown extensions;
- **P3:** save assembled from committed model with correct renderer/editor ownership;
- **I2 / I6 / I7:** actual mounted widget authority must not be inferred from incidental text or a stale DOM node.

The block's inline IDs are **block-scoped**, even when the widget is mounted in a different rich-text field. However, an unknown/unloaded plugin has **no mounted widget**; its canonical `{{id}}` placeholder remains inert author-facing text and must not be silently rewritten into a literal marker, or the canonical assembler will drop its payload.

## Finding MULTIFIELD-LITERAL-1 — a sibling field could create a false widget reference (P2)

The previous `#serializeField()` built its reserved ID set solely from widget roots it encountered **in that one field**. Consider a two-field block with a live `inline-1` widget in Answer and user-typed literal `{{inline-1}}` in Question. The renderer/serializer was able to emit an unmarked `{{inline-1}}` for Question while the real Answer occurrence emitted the same string. Canonical `filterCanonicalInline()` then sees two references to the block's one sidecar ID, violating the uniqueness rule.

**RED:** the actual prior public `serializeBlock()` + private `#serializeField()` method bodies in a controlled DOM emitted:
- Question: `Question {{inline-1}}` (incorrect, unmarked literal);
- Answer: `Answer {{inline-1}}` (the real widget).

**Fix:** determine the reserved IDs once per block using **currently mounted inline occurrences** in `this.#blocks.get(blockId)?.widgets`, then pass those IDs into every field's serializer. Actual widget roots are still serialized through their unique owned DOM identity; typed matching IDs in a sibling field are marked as literal.

## Finding MULTIFIELD-OPAQUE-2 — reserving *all* sidecar IDs broke unloaded extensions (P2)

An initial broader fix reserved `Object.keys(record.inline)` for every mounted field. This repaired the known sibling-widget collision but introduced a dangerous regression: when the sidecar contains an **unregistered** inline extension, there is no live widget root. Rector intentionally leaves that canonical reference `{{opaque-1}}` as inert visible text, backed by the opaque `inline['opaque-1']` payload.

The all-sidecar reservation would wrap this genuine reference into:

```html
Before <span class="oe-inline-literal">{{opaque-1}}</span> after
```

On the next `filterCanonicalInline()` pass it ceases to count as a reference and the unknown payload can be pruned. This is not an acceptable way to protect literal author text.

**RED:** the actual provisional source-backed `serializeBlock()` test returned exactly that marked literal instead of `Before {{opaque-1}} after`, while the sidecar still existed in the immediate output. The later canonical assembly was the risk.

**Fix:** the shared block-wide reserved set contains **mounted widget IDs only**, not every sidecar key. Thus known mounted widgets cannot be duplicated via sibling literals, while unmounted/unknown references retain their current canonical raw tokens and sidecar ownership.

### TDD and independent verification

| Test | Result | Evidence |
| --- | --- | --- |
| Old cross-field serializer with a mounted widget in another field | **RED** | Actual prior method bodies; unmarked sibling `{{inline-1}}` |
| Current cross-field serializer | **GREEN** | Actual current methods; Question `<span class="oe-inline-literal">{{inline-1}}</span>`, Answer one canonical token |
| Provisional all-sidecar reservation with unloaded type | **RED** | Actual method bodies; unknown reference incorrectly marked literal |
| Current unloaded inline reference | **GREEN** | Actual current methods; raw `{{opaque-1}}` and original opaque payload retained |
| Original DOM Text-node identity | **Preserved** | Source-backed detached-copy serialization |
| New full-browser tests | **2 authored, not executed** | Public `InlineProjectionRuntime` multi-field and unloaded-extension test cases |
| JavaScript parse | **5/5 passed** | Current projector, browser tests, shared rich-text, transforms and renderer parsed after ESM stripping |
| Full Node / TypeScript / Chromium, Undo/Redo integration | **Not run** | No working container checkout/dependencies |
| Complete v1/v2 parity | **Not established** | Requires full native browser acceptance |

The source-backed tests use actual fetched production method bodies, but their synthetic DOM substitutes minimal sanitization/canonicalization for these plain-text fixtures. They are not a substitute for the full `npm test` or real editor renderer and history.

### Commits

- [Cross-field RED regression](https://github.com/Shelamkoff/editor/commit/ee128c596dd55afd036bb0180cf3cd8b1a78aa07)
- [First mounted/sidecar scope adjustment](https://github.com/Shelamkoff/editor/commit/dc998e1a15153b85699c8045b25d20d470b61425)
- [Unknown/unloaded extension RED regression](https://github.com/Shelamkoff/editor/commit/2232ef08f281c7d0dee2e7344ecc14a02ea25149)
- [Final mounted-block-ID solution](https://github.com/Shelamkoff/editor/commit/519e45fbdd45ab6112264db5d588536791db51e3)

## Next acceptance and remaining risk

Run from a working checkout:

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

In full Chromium acceptance, save a multi-field block with a widget in one field and typed matching literal in another; Undo/Redo across a field edit; save and reopen the result. Repeat with an unloaded inline type in a mounted field and another hidden/unmounted field. Verify one inline sidecar, one true widget reference, preserved literal, no stale DOM lease and a single history entry per gesture.

**Known unresolved ambiguity:** if a user types an additional literal `{{opaque-id}}` colliding with an **unloaded** inline type, the source DOM has no mounted widget identity that can distinguish the original opaque canonical placeholder from the new author text. Avoid treating this case as solved by heuristic remapping or dropping the unknown sidecar. A wider representation/ownership change requires a separate contract and full browser acceptance.

All edits were committed directly to `refactor/rector-v2-architecture` with current per-file blob SHA preconditions. No unrelated parallel edits or code paths were force-overwritten.
