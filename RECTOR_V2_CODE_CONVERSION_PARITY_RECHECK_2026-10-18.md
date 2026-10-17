# Rector v2 — Code conversion and nested PRE parity recheck

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Start HEAD:** `e79dbac251b159d4f7def9adc0cd976a272ee872`  
**Historical reference:** v1 `master` (`5e5c7f8d2d9e9a6cf2f95cfb7fd67aba227fa340`)

This pass continues [the Code Paste parity audit](RECTOR_V2_CODE_PASTE_PARITY_AUDIT_2026-10-18.md). It distinguishes committed regressions, focused runtime demonstrations, and unexecuted full-project acceptance.

## Findings and fixes

### C3 — single/whole rich-text conversion stored raw HTML inside Code (P2)

V2 Code already used `selectedPayloadText(payload, ownerDocument)` for cross-block `joinSelection()`, converting rich text to plain source text and `<br>` to line feeds. Its separate `conversion.import(payload)` instead blindly used `payload.data.text`, even for `kind: 'rich-text'`. Thus conversion of `First <b>bold</b><br>last` to Code produced literal HTML in the source editor; cross-block conversion did not. That is an inconsistent user-facing conversion contract. The current v2 behavior (not a legacy data decoder) now uses the same sanitizer-backed text projection in both branches.

The conversion host now passes a frozen narrow `{ ownerDocument }` argument to importers:
- [Typed public capability](https://github.com/Shelamkoff/editor/commit/6400ae731c180ed38438c724c0b6b8aea4428382): second argument optional in the interface so existing pure importers remain valid.
- [Single/whole/per-block planner](https://github.com/Shelamkoff/editor/commit/066921ab378bed33cd27835b4ba8c5461292e6d4).
- [HTML fallback importer](https://github.com/Shelamkoff/editor/commit/96878a3e0334bcb5f5880e5a9a94d575f17620b8).
- [Code rich-text conversion](https://github.com/Shelamkoff/editor/commit/1242de5bc78565cd50336c2748349a5f4ab50f5): plain-text payloads remain literal; HTML parsing without an owning document is rejected rather than borrowing ambient DOM or persisting source tags.

New tests:
- [Code conversion import boundary](https://github.com/Shelamkoff/editor/commit/a896a6825248ee0d0aaac2f1f39eac91f106a73a).
- [Owning document planner contract](https://github.com/Shelamkoff/editor/commit/06238b6cca5427302d28eebc550864aafca6c6f8).
- [Real-browser editor whole-block conversion and Undo/Redo fixture](https://github.com/Shelamkoff/editor/commit/828010e635f441de14654dfd0f8ba01c9bcd6696), [literal newline assertion correction](https://github.com/Shelamkoff/editor/commit/b2c04accf02f22852edb8e8ac18d7a635b295e96).

One proposed native same-field drag fixture was withdrawn because the existing `dragAcross` helper only certifies a cross-field selection, not a same-field range. The final browser regression uses the established public `editor.blocks.convert` boundary and checks one Undo and Redo.

### C4 — Code HTML PRE import discarded text outside its child CODE (P2)

V1's `Code.onPaste({type: 'tag'})` used the **entire matched element's `textContent`**, then normalized trailing newlines. V2's `htmlImport.importRoot` instead selected `:scope > code` for PRE roots, discarding sibling text, e.g. `<pre>before <code>inner</code> after</pre>`.

- [Test added first](https://github.com/Shelamkoff/editor/commit/903639320f6e6b4067ea5d8bfb6e91cb20e95a80).
- [Behavior restored](https://github.com/Shelamkoff/editor/commit/f44c3097014e96d41b426790ef1b3234749721e4): use the matched root's complete `textContent` and retain v1 trailing-newline normalization.

## Evidence actually executed

1. **RED** from the exact pre-fix Code source in a V8 source-level harness: rich-text import returned the literal HTML string and did not reject a missing document. The PRE import returned `inner` instead of `before inner after\n`.
2. **GREEN** from final source in that harness with minimal controlled DOM/sanitizer doubles: rich-text and plain-text Code import, explicit missing-document rejection, multi-fragment join, PRE surrounding text, direct CODE root, and newline normalization all matched expected values.
3. **Cross-module V8 check:** evaluated the final real `SelectionConversionPlans` and `HtmlImportRouter` modules after substituting isolated dependencies. `convertedCanonicalRecord` returned `First bold\nlast`; `materializeRichText` correctly imported `foo <b>bar</b><br>end` as `foo bar\nend`. Frozen owner context and declared type surfaces were inspected.
4. Parsed the final changed Code, browser regression, and Node test source through the V8 parser (with ESM imports adapted for syntax inspection).

**Important boundary:** the controlled sanitizer/Document adapter is not an actual browser DOM, and source-level execution is not equivalent to executing the checked-in `node --test` files. No assertion of a full project green gate, real Chrome input, OS IME, package acceptance, or complete v1/v2 parity is made. Git checkout was not available from this container because github.com DNS could not be resolved. The repository changes were written directly through the authenticated GitHub connection.

Documentation updated:
- [English extension guide](https://github.com/Shelamkoff/editor/commit/ef257409019ea7f59f9df1ae815e996def8f19e0).
- [Russian extension guide](https://github.com/Shelamkoff/editor/commit/6e6500f9d435fb8b52aeb877bc35a0b22d949ca0).

## Pending acceptance on final branch HEAD

```sh
npm ci
node --test plugins/code/conversion-parity.test.js plugins/code/paste-parity.test.js core/SelectionConversionPlans.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

Browser work should additionally cover code conversion of formatted blocks with decoded HTML entities, `<br>` line breaks, reentrant DOM ownership, sibling PRE markup, context in registered third-party conversion importers, and read-only rejection. The broader differential behavioral matrix, resource-retention and browser/IME gates remain outstanding before marking the library release-stable.
