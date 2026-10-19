# Rector v2 — inline literal collision after canonical tag merge and text completion

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `d6f655e035306e97d0fd944fd77f5fdfdc9f1b8b`

## Scope and invariant

Continue [the inline literal roundtrip audit](RECTOR_V2_LITERAL_INLINE_REFERENCE_ROUNDTRIP_AUDIT_2026-10-19.md). In the current v2 document format, one real `{{inline-1}}` occurrence and a separately typed literal `{{inline-1}}` must remain distinct after canonical HTML normalization, composition-like text insertions, save/replay and read-only rendering. The inline sidecar is not permission to reinterpret arbitrary matching author text as another widget. This follows the remediation spec's P2/P4 and I1/I2/I6/I8.

Reviewed the actual code in `shared/richTextCodec.js`, `shared/richTextOperations.js`, `shared/sanitize/walker.js`, `core/InlineProjectionRuntime.js`, `renderer/inlineWidgets.js` and the native browser regression suite.

## Finding LITERAL-MERGE-1 — canonical tag merge could forge an owned reference (P2)

The previous serializer normalized adjacent Text leaves **inside one element** on a detached clone, then applied the `oe-inline-literal` marker per text node. But the canonical rich-text pipeline later converts `<strong>` to `<b>` and merges adjacent equal `<b>` wrappers, which concatenates their text when serialized. For example, authored literal:

```html
<strong>{{inline-</strong><b>1}}</b>
```

became:

```html
<b>{{inline-1}}</b>
```

without any literal marker. With an actual `inline['inline-1']` sidecar, a later canonical scan sees a **second owned occurrence**. A similar collision occurs when the sanitizer unwraps a formerly unsupported tag and joins its text with an adjacent author text node.

**RED:** exercised the actual previous shared `replaceTag()` and `mergeAdjacentCanonicalTags()` code with the actual literal-protection helper and controlled DOM. Before canonicalization there was no full literal token in either text node. After canonicalization the output was `<b>{{inline-1}}</b>`, an unmarked collision.

**Fix:**
1. Extract `canonicalizeRichTextSubtree(root, ownerDocument)` from the existing rich-text canonicalizer and have `canonicalizeRichText()` reuse exactly that implementation (no second divergent merge algorithm).
2. In `InlineProjectionRuntime.#serializeField()`, canonicalize **only the detached clone** using `sanitizeSubtree()`, `canonicalizeRichTextSubtree()`, and `normalize()` **before** wrapping any authored collision-shaped tokens.
3. Actual owned widget references remain transient `<span class="oe-inline-owned-reference">` elements until protection is complete. The initial sanitizer can strip their private data attributes without losing the reference's retained Element identity; the serializer replaces those exact elements with canonical `{{id}}` tokens afterward.
4. The live source field, native Selection and Text-node identities are never normalized or sanitized.

**GREEN:** exercised the current actual `#serializeField()`, sanitizer and shared canonical-tag routine under a controlled DOM with a real widget marker and the two formatted author fragments. Output:

```html
A{{inline-1}}B<b><span class="oe-inline-literal">{{inline-1}}</span></b>
```

The author `<strong>` and `<b>` nodes and original Text identities were unchanged. The first draft of this synthetic DOM lacked a standard `textContent` setter; after fixing the test adapter, the exact source-backed check passed.

- [RED browser regression](https://github.com/Shelamkoff/editor/commit/79e89e3c4c000a8ec815e1098f6a560ad6ff7c54)
- [Shared canonicalizer refactor](https://github.com/Shelamkoff/editor/commit/90d28404ea291aed5187dfce7f3b78527d2aa135)
- [Detached clone sanitizer/canonicalizer fix](https://github.com/Shelamkoff/editor/commit/3ad29da6062c4b934a1a8c7c44249699aab52471)
- [Additional sanitizer-unwrapping regression](https://github.com/Shelamkoff/editor/commit/6759e089fd0d84502c57c71a8a038240b5858186)

## Finding LITERAL-COMPLETION-2 — finishing a typed literal token could create a widget (P2)

`replaceRichTextRange()` previously protected only the **new replacement fragment**. When the prior authored text ended in `{{inline-` and the next inserted text was `1}}`, neither individual fragment matched a complete `{{id}}` token, but the final HTML serialization concatenated them to `{{inline-1}}`. Because the block had one `inline-1` sidecar, the new literal became a second canonical widget reference.

**RED:** executed the exact original `replaceRichTextRange()` body with its original shared reference helpers under a controlled DOM/Range insertion adapter. Appending `1}}` to the authored `{{inline-` suffix of `A{{inline-1}}B{{inline-` produced ambiguous `A{{inline-1}}B{{inline-1}}`.

**Fix:** `finalizeEditedReferences()` handles both `replaceRichTextRange()` and `ensureRichTextReferenceSuffix()`. Before the temporary real-reference marker spans are collapsed into `{{id}}` text, it canonicalizes temporary formatting wrappers, normalizes temporary Text siblings, and protects any now-complete literal tokens. True references remain separate private spans throughout this pass. No live editor DOM is mutated and no document/history engine was added.

**GREEN:** the exact current `replaceRichTextRange()` body with its actual literal/reference helper implementations produced:

```html
A{{inline-1}}B<span class="oe-inline-literal">{{inline-1}}</span>
```

The mock canonicalizer was a no-op for this *plain-text* insertion-only fixture; earlier formatted-wrapper protection is verified separately. The test is source-backed, but not a full native browser edit.

- [RED browser regression](https://github.com/Shelamkoff/editor/commit/d7edc7be56e3693c1d6622c328bf7c2239d8d62d)
- [Shared reference-finalization fix](https://github.com/Shelamkoff/editor/commit/ee46add722370c8b1827cfd338a4b4f6d99bae4a)

## Verification and remaining gaps

| Check | Result | Limit |
| --- | --- | --- |
| Actual prior tag canonicalization + literal protection | **RED** | Genuine helper bodies evaluated in a synthetic DOM |
| Current serializer + sanitizer + canonicalization | **GREEN** | Genuine source methods, controlled DOM; native source identity retained |
| Actual original typed-token completion | **RED** | Real source with synthetic text/Range insertion |
| Current typed-token completion | **GREEN** | Real source; synthetic DOM with no-op canonicalize helper in this plain-text case |
| Renderer source unit tests | **10/10 passed** | Actual current source and tests in isolated V8; unchanged by this fix |
| Syntax parsing of related source/tests | **7/7 passed** | ESM imports/exports stripped for V8 parsing, not TypeScript |
| New native browser regression cases | **Authored, not run** | Formatted wrappers, sanitizer unwrapping, completed text insertion |
| Full `node --test`, TypeScript, Chromium Rector, Undo/Redo acceptance | **Not run** | Complete current checkout/dependencies not available in this environment |
| Complete v1/v2 behavioral parity | **Not established** | Requires full local acceptance and real editor interactions |

The regression fixtures are in `tests/browser/native-tools.js`; they are not evidence of a passing full browser harness. The current code deliberately leaves untrusted markup sanitization in the existing shared policy, does not change the versioned document envelope, and preserves widget ownership.

### Next local verification

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

In real Chromium acceptance, verify save → Undo → Redo → reload with a widget followed by literal `{{id}}` split across adjacent same-style wrappers, across sanitizer-unwrapped markup, and across successive keystroke insertions. Also test Unicode, one history entry per gesture, sidecar consistency, remapped IDs, and unchanged live DOM selection.

All writes used current GitHub blob SHAs and were committed directly to `refactor/rector-v2-architecture`, with no force push or unrelated parallel-agent changes overwritten.
