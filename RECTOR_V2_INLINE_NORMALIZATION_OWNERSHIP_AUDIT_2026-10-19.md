# Rector v2 — authored text normalization and protected DOM ownership audit

**Date:** 2026-10-19  
**Repository:** `Shelamkoff/editor`  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `b720d39fe5d4dea7616f2d1e778968d4aec31f9c`

## Scope and contract

This pass continues [the inline unwrap audit](RECTOR_V2_INLINE_UNWRAP_NATIVE_OWNERSHIP_AUDIT_2026-10-19.md) and the v2 remediation specification's I6/I7 ownership boundaries. Author text formatting must not mutate a different DOM owner, including `contenteditable=false`, native form/button controls, nested editable hosts, or mounted inline-plugin widgets. This ownership applies to the **identity of their text nodes**, not only to saved HTML or visible text.

Reviewed:

- `inline-tools/inlineContent.js`: empty inline cleanup and recursive normalization.
- `inline-tools/utils.js`: `mergeAdjacentTags()`, tag-wrap fallback and `normalizeAfterEdit()`.
- `inline-tools/fontSize.js`: direct normalization after applying a size.
- `tests/browser/native-tools.js`: native browser ownership fixtures.
- `inline-tools/inlineContent.test.js`: new lightweight node:test ownership checks.

## Finding NORMALIZE-1 — Node.normalize() crossed independent DOM ownership (P2)

The existing `removeEmptyInlineTags()`, `mergeAdjacentTags()`, `normalizeAfterEdit()`, tag-wrap fallback and Font Size Apply used `Element.normalize()` on editing hosts or ancestors. The platform method recursively merges/removes adjacent/empty text nodes **inside all descendants**. A native control or mounted inline widget with multiple text leaves could therefore lose nodes on a completely unrelated author formatting action.

**Focused RED:** the original `normalizeAfterEdit(null, root)` called `normalize()` on a `contenteditable=false` field (one forbidden call); the single-field path called the recursive host normalizer (which also traverses protected descendants). The original `mergeAdjacentTags()` called `parent.normalize()` twice.

**Fix:** use `normalizeAuthoredText()` to normalize text siblings at author-owned levels only. It does not enter nested `[contenteditable]`, native controls, inline widget roots or role-button subtrees; a root inside another protected owner is rejected. The shared function is now used by all the affected formatting paths, including Font Size Apply. For cross-block changes, `normalizeAfterEdit()` selects only actual `[contenteditable="true"]` candidates and the helper excludes candidates beneath locked owners.

The implementation deliberately does **not** replace the editing model, change persistence format, or run normalization inside a plugin's private controls.

- [Shared normalization and empty content fix](https://github.com/Shelamkoff/editor/commit/4539f4bea0fed4f6ecf7685df732b58b50cbb6df)
- [Tag and field normalization changes](https://github.com/Shelamkoff/editor/commit/05ef020758c93e5496da40262f3e016da9505d14)
- [Font Size Apply change](https://github.com/Shelamkoff/editor/commit/141c8ddb9f8c245490c3e9b2a84c03f33bccbb05)
- [Fix for a JS automatic-semicolon-insertion issue revealed by new focused tests](https://github.com/Shelamkoff/editor/commit/ecf003de0e72938ba1f4167d0626f355c95d345a)

## Finding NORMALIZE-2 — adjacent tag merge could move native-controlled descendants (P2)

`mergeAdjacentTags()` previously combined adjacent, attribute-equal `<b>`/other inline wrappers, moving every child from the second element into the first. When either wrapper contained a native button or widget, the editor would rewrite its surrounding ownership structure.

**Fix:** do not merge candidate wrappers containing any independently owned subtree. Continue merging author-only adjacent siblings. Do not run merge logic at all when the parent itself belongs to a locked/native/inline-widget owner.

- [Merge guards](https://github.com/Shelamkoff/editor/commit/05ef020758c93e5496da40262f3e016da9505d14)
- [Protect merge roots](https://github.com/Shelamkoff/editor/commit/182402660c4732536dac52a629967a521e086482)

## Finding NORMALIZE-3 — empty author wrapper could delete an empty protected descendant (P2)

The earlier cleanup audit protected **elements inside** native and locked controls but not an otherwise empty formatting wrapper **containing** an empty control. For example, a `<b>` with an empty native button and no text was considered empty and removed together with the button. Similarly, an empty nested `contenteditable=true` host could be discarded.

**RED:** actual original `hasInlineContent()` returned `false` for a wrapper with an empty native control. An additional new test showed the first revised helper still failed to recognize an empty nested `contenteditable=true` host.

**Fix:** `hasProtectedDomContent()` makes independently owned elements count as content even when they contain no visible text. The scanner considers both the candidate and protected descendants, including nested editable hosts. Cleanup also explicitly excludes `[contenteditable]` elements themselves.

- [Initial empty control protection](https://github.com/Shelamkoff/editor/commit/4539f4bea0fed4f6ecf7685df732b58b50cbb6df)
- [Nested-host RED test](https://github.com/Shelamkoff/editor/commit/4ac7d6eafc06c697586c185ebadaabbc856fd4d8)
- [Nested-host fix](https://github.com/Shelamkoff/editor/commit/3bf656b2aaff6865060a42f095a0ca8c829c1dfa)

## Regressions and focused verification

- [Four new native browser scenarios](https://github.com/Shelamkoff/editor/commit/236d71c9f9ddc4b191f45e339fbed15386214bce): empty protected shells, one-host text identity, cross-host normalization and mixed protected/author adjacent tag merging.
- [Three dependency-free Node unit cases](https://github.com/Shelamkoff/editor/commit/5aefe7390ec54970c31f25e23f8316febba230f5): empty controls, protected text identity, nested/explicit editing hosts.

| Check | Result | Evidence |
| --- | --- | --- |
| Original empty control `hasInlineContent` | **RED**, returned `false` | Original source in isolated V8 |
| Original `normalizeAfterEdit` + tag merge | **RED**, recursive `normalize` on protected scope | Actual method bodies with synthetic DOM |
| Revised `inlineContent` unit cases | **3/3 passed** | Exact current source and unit-case code, evaluated in isolated V8 with a local `node:test`/assert shim |
| Nested empty `contenteditable=true` | **RED → GREEN** | Focused regression on original and revised source |
| Revised private `mergeAdjacentTags` | **Passed** | Exact current private method in synthetic DOM: protected wrapper retained, two author wrappers merged |
| Revised `normalizeAfterEdit(null, root)` | **Passed** | Actual method body: two author fields normalized, locked text nodes preserved |
| Added real Chromium browser cases | **Authored, not run** | Execution still required |
| `node --test`, full `npm test`, TypeScript, package/types/docs checks | **Not run in full repo** | No full checkout/dependencies in current environment |
| Complete native v1/v2 parity | **Not established** | Requires real editor input/selection/history tests |

The focused V8 checks validate the actual modified source, but do not replace a native browser or full-package acceptance run. An attempted local headless Chromium run on a minimal test fixture timed out, so no browser-green claim is made.

## Local acceptance gates

```sh
npm ci
node --test inline-tools/inlineContent.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

In native browser acceptance, verify that formatting and clearing one author range preserves exact protected text-node identity, both forward and backward logical selection, one history entry per action and unchanged plugin/runtime ownership. In particular, recheck unusual offset boundaries around empty text and nested editable controls.

All writes were committed directly to the requested branch using each file's current blob SHA. No force pushes or unrelated worktree rewrites were used.
