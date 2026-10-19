# Rector v2 — literal inline reference collision, canonical save and renderer parity

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `6a8e29d9309021abd7f8368e522814975412d4b4`

## Scope and contract

Continue [the canonical inline replay and widget ownership audit](RECTOR_V2_INLINE_CANONICAL_REPLAY_WIDGET_OWNERSHIP_AUDIT_2026-10-19.md). The outstanding issue was a collision between an actual canonical widget reference `{{inline-1}}` and author-typed **literal** text containing the same characters while `inline['inline-1']` exists.

Requirements are `RECTOR_V2_REMEDIATION_SPEC.md` I1/I2/I6, P2/P3/P4 and the documented renderer/editor parity: accidental string equality must not turn authored text into widget payload, change sidecar ownership, alter logical caret lengths, or give Undo/Redo a different canonical document. The current v2 document envelope remains `2.0.0`; there is no legacy fallback or second persistence engine.

Affected code:
- `shared/richTextOperations.js` — literal token protection, scanner, logical expansion, range replacements, and ID remap;
- `core/InlineProjectionRuntime.js` — source DOM serialization and canonical hydration;
- `renderer/inlineWidgets.js` — read-only projection;
- `renderer/inlineWidgets.test.js`, `tests/browser/native-tools.js` — regressions;
- `docs/guide/inline-extensions.md` and `docs/ru/guide/inline-extensions.md` — current format behavior.

## Finding LITERAL-ROUNDTRIP-1 — literal text with an owned ID was reinterpreted as a widget (P2)

A source document could contain an actual mounted widget and separately the authored string `{{inline-1}}`. Earlier native DOM reconciliation avoided *moving* the already mounted widget to the new string, but serialization still produced:

```html
A{{inline-1}}B{{inline-1}}
```

With one `inline-1` payload in the sidecar, `scanRichTextPlaceholders()` interpreted **both** occurrences as references. Canonical assembly rejects duplicate references or a subsequent renderer could project the literal as a second widget. The same ambiguity also affected logical UTF-16 length, clipboard text/HTML range replacement and ID remapping.

**RED — actual prior production source:**
- `#serializeField()` emitted two indistinguishable `{{inline-1}}` strings;
- `scanRichTextPlaceholders()` counted two references with a matching sidecar;
- the previous read-only renderer invoked widget rendering for a literal marker with an ID collision.

The regressions exercise the public source projection, canonical scan, remap, removal, rich-text insertion and renderer boundaries rather than asserting an internal private field layout.

### Fix: sanitizer-preserved literal marker

For author text that collides with a real owned ID, the canonical rich-text representation is now:

```html
A{{inline-1}}B<span class="oe-inline-literal">{{inline-1}}</span>
```

The `oe-inline-literal` class is reserved by Rector and visually inert. It is an **existing allowed span/class HTML shape**, not a second wire envelope or a widget instance. The shared sanitizer preserves it. Text inside such a span remains ordinary UTF-16 text, even if the matching sidecar entry exists; unmarked owned tokens remain atomic widget references.

Implementation:
1. `protectInlineLiteralTokens()` wraps collision-shaped author text with the canonical span marker. It is used by DOM serialization and by explicit logical text/HTML replacement.
2. `#serializeField()` temporarily captures actual current widget roots as out-of-band DOM markers, protects colliding author text, then writes **only real markers** back as raw `{{id}}` tokens before canonical HTML sanitization. The live DOM is unchanged.
3. Shared reference expansion, scanning, removal and remapping ignore tokens in literal spans (but reserve literal IDs for collision avoidance).
4. `InlineProjectionRuntime` does not hydrate the contents of literal spans into widgets.
5. Read-only `renderInlineWidgets()` similarly skips literal spans.
6. Both English and Russian extension guides document the reserved internal format.

The result preserves existing real widget position, sidecar payload and normal formatting wrappers without imposing a visible style on the user-typed literal.

### Source-backed focused verification

- **RED → GREEN serializer:** actual old serializer output `A{{inline-1}}B{{inline-1}}`, whereas the current one outputs the marked literal representation above.
- **RED → GREEN scanner:** previous actual scanner returned 2 canonical references for the colliding text; current scanner returns **1** and records `inline-1` as a reserved literal as well.
- **Current logical length:** `A` (1) + widget (1) + `B` (1) + literal `{{inline-1}}` (12) = **15 UTF-16 units**.
- **Current reference deletion:** removing the actual `{{inline-1}}` leaves `AB<span class="oe-inline-literal">{{inline-1}}</span>`.
- **Current reference remap:** only the genuine reference changes to `{{fresh}}`; the literal stays `{{inline-1}}`.
- **Current read-only render:** exactly one inline renderer invocation; the literal text remains in its span. The independent renderer unit case failed on the old source and passed on the current source.
- **Renderer unit suite:** **10/10 passed** in isolated V8, including existing asynchronous and ownership cases.
- **Chromium DOM smoke:** the literal span and its 12-character text survive a DOM `innerHTML` parse/serialize cycle. This is not a full Rector browser acceptance run.
- **JavaScript parse:** all five directly modified JS source/test files parsed in isolated V8 after removing ESM import/export syntax.
- **Split literal across adjacent DOM Text leaves:** actual serializer RED → GREEN as above, with live source-node identity retained.

Relevant changes:

- [Browser canonical save/replay regression](https://github.com/Shelamkoff/editor/commit/4b1ad896252c8877a97dff2409a4cfaa9789e5be)
- [Shared rich-text semantics](https://github.com/Shelamkoff/editor/commit/2aaf258eb654c84c5fee58e27ed15aa94c0fbb2c)
- [Source DOM serializer and hydration](https://github.com/Shelamkoff/editor/commit/e8a9c1169eb97abe5cf3fcee2adbeb572d3dcd9f)
- [Renderer treatment](https://github.com/Shelamkoff/editor/commit/2e95062b52fac2ebaf42b55371090d01cc5bc3e0)
- [Range, ID remap and read-only regression](https://github.com/Shelamkoff/editor/commit/b9f0168bb6ed4b912a55ec6c3cb414f8f5741b7a)
- [Renderer unit regression](https://github.com/Shelamkoff/editor/commit/f764ff364b4a927d94222697752ddd4954bb017e)
- [HTML paste literal regression](https://github.com/Shelamkoff/editor/commit/930413aa66df40324cc6ae702f2692f03c7c999e)
- [English documentation](https://github.com/Shelamkoff/editor/commit/e294d24ee47e816d4bcfe67db39b96529b0a05ad)
- [Russian documentation](https://github.com/Shelamkoff/editor/commit/75d3a2ccb4c20b7145e9feba387ad2139ee2e38f)

## Finding LITERAL-ROUNDTRIP-2 — joined adjacent Text leaves could form a new reference during serialization (P2)

The DOM may contain two adjacent live author Text nodes with values `{{inline-` and `1}}`, particularly when normalization was intentionally avoided near protected controls to preserve live native Range boundaries. Earlier `protectInlineLiteralTokens()` scanned each Text node separately and found no full match. But `innerHTML` serialization concatenates these adjacent leaves into `{{inline-1}}`, turning their author text into a second canonical reference.

**RED:** the actual pre-fix `#serializeField()` and current literal-protection helper emitted `A{{inline-1}}B{{inline-1}}` from these separate leaves. A new browser regression was committed before changing the production code.

**Fix:** call native `Node.normalize()` **only on the detached serialization clone** immediately before protecting the literal tokens. The clone has no live editor Selection/Range ownership. Adjacent cloned Text leaves are merged so the full literal `{{inline-1}}` is protected, while the source field's original Text identities stay unchanged.

**GREEN:** running exact previous/current serializer bodies with a synthetic DOM that implements native adjacent-text normalization proved that the old source produced two unmarked tokens, whereas the current source emitted one owned token plus the marked literal span. The original two live author Text nodes were unchanged in both runs.

- [RED browser regression](https://github.com/Shelamkoff/editor/commit/88fa2815e12f0c578d65d93c0c20c9c056449b7a)
- [Detached-clone normalization fix](https://github.com/Shelamkoff/editor/commit/9d9cb12603f111740cbf1ba2c89527a188b41c90)

## Remaining acceptance and caveats

The added `tests/browser/native-tools.js` scenarios are authored but **not executed in the full project Chromium runner**. The source-backed isolated V8 experiments are not a full `node --test`, TypeScript or browser pass. A local checkout is not available because the container cannot resolve GitHub DNS, although the connected GitHub API permits direct reads and SHA-guarded commits.

Run from a complete current checkout:

```sh
npm ci
node --test renderer/inlineWidgets.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Browser acceptance must verify actual save → Undo → Redo → reload, renderer hydration, one widget DOM/sidecar lease, backward and cross-field Unicode caret offsets, literal content within formatting marks, native/plain input and structured paste, and failure recovery on remounting the same block ID. In particular, test placeholder-shaped literals divided across *adjacent formatting elements* that canonical HTML normalization may merge; the detached Text-node normalization fix does not by itself establish that additional edge case.

A preexisting canonical document containing two *unmarked* `{{id}}` strings and one matching sidecar cannot be disambiguated retrospectively from that string alone. No migration or speculative guess was added; the new reversible marker is produced for new author edits and respected by the existing current-format consumers. Explicitly test unknown/unloaded inline types before declaring global parity.

All writes were committed directly to the requested branch using each file's current blob SHA. No forced branch update or unrelated agent code overwrite was used.
