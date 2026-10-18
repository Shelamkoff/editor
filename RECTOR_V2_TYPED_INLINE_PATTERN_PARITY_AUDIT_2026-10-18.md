# Rector v2 — typed inline-pattern parity follow-up

**Date:** 2026-10-18  
**Branch:** `refactor/rector-v2-architecture`  
**Starting HEAD:** `d38165b2aab7465bc17414fa056540a1bfed039b`  
**Scope:** preserve typed inline-pattern conversion after existing v2 clipboard, trigger, input, keyboard and lifecycle refactors.

## Finding: typed inline matcher path was missing in v2 (behavioral parity)

Rector v1 `core/InlinePatternMatcher.js` explicitly handles Space and Enter on `keydown`: it checks the preceding word in the current native text node, tests plugin-owned expressions and replaces a match with an inline widget; a Space delimiter is then inserted. The built-in Color plugin supplies seven supported color expressions through `pasteConfig.patterns`.

Rector v2 had `InlineCommandController.pasteText()` for clipboard conversion, called from `ClipboardController`, but no corresponding Space/Enter word matcher in `KeyboardRouter`, `NativeInputController` or `InlineTriggerController`. Thus the v1 typing capability was absent from the v2 source path.

**v1 behavior qualification:** the v1 `core/index.js` initializes `KeyboardManager` before `InlinePatternMatcher`, and the former may synchronously split blocks on a regular Enter before the latter inspects the selection. This report establishes the intended Space/Enter matcher branch in v1, **not** that every Enter gesture was reliably converted in native v1 Chrome. The v1/v2 native differential remains required; the v2 implementation supports normal Enter and Shift+Enter deliberately.

## Source change

- `InlineCommandController.commitTypedPattern(word,target,delimiter)` prepares exactly one candidate under `runtime.prepareExtensionValue`, using a fresh RegExp so extension-owned `lastIndex` is unchanged; a failing callback or payload rejects before canonical mutation. The first registered accepted pattern replaces the **entire preceding word** (v1 semantics even for unanchored expressions), not a substring as the Paste scanner does.
- It applies one canonical `replaceRichTextWithInlineSegments` transaction: `[widget,text(' ')]` on Space, `[widget]` on Enter. The committed result's caret is restored only while the previously captured runtime generation/mode authority survives.
- `KeyboardRouter` invokes this command on Space/Enter, including Shift+Enter, after plugin shortcut routing and before a regular Enter split. It only proceeds for a collapsed rich-text selection whose native text-node boundary agrees with the canonical logical offset, outside inline widget labels/auxiliary inputs, and not for control-modified keys.
- `createEditorRuntime` explicitly injects the existing inline-command owner into the keyboard router; no new public extension API, v1 format compatibility shim or persisted data migration is introduced.

## Test-first evidence and commits

### Inline command

Seven new behavioral tests first failed against the actual source because `commitTypedPattern` did not exist: full-word match on Space/Enter, native fall-through on mismatches, unanchored full-word matching, RegExp state ownership, atomic failure and destroyed-editor caret revocation.

- [RED tests `7ff8e18`](https://github.com/Shelamkoff/editor/commit/7ff8e18384345732bc6ccc08056d999fb8b9fce2)
- [GREEN fix `d00e002`](https://github.com/Shelamkoff/editor/commit/d00e002b400419783210d7dc436add44cfe32c05)

### Keyboard and runtime

Five new route tests reproduced three missing-path failures (Space, Enter and unmatched fall-through). Two additional tests assert ordinary/NBSP word boundaries and that a failing typed matcher consumes the recognized Enter without a second edit. The Shift+Enter test subsequently failed in a focused RED run and was fixed separately.

- [Initial RED route tests `0401efe`](https://github.com/Shelamkoff/editor/commit/0401efe5e8f37016abc2a6b7227160ad956d574d)
- [Keyboard route `619e699`](https://github.com/Shelamkoff/editor/commit/619e699f8280485c54735d08629913db9393f525)
- [Runtime wiring `32d1315`](https://github.com/Shelamkoff/editor/commit/32d13153e4542659e6b40cfc2de68eedd8c1a2a6)
- [DOM Text type narrowing `841c5d7`](https://github.com/Shelamkoff/editor/commit/841c5d77315ae69807343d4e7da0a7213ffeccb2)
- [Boundary and atomicity tests `18f316d`](https://github.com/Shelamkoff/editor/commit/18f316de722b3048ecc7c67352919d2723292518)
- [Shift+Enter RED test `eb89edd`](https://github.com/Shelamkoff/editor/commit/eb89edd49d27b8707fa1881a1eaadee4d593a56b)
- [Shift+Enter fix `557d708`](https://github.com/Shelamkoff/editor/commit/557d708a554fc5529336c93cae3b5f3da7721325)

### Native acceptance fixtures

Four additional native-browser cases were registered in `tests/browser/native-text-input.js`: typed Color on Space, Enter and Shift+Enter (model, caret, Undo/Redo), and fall-through for unmatched/selected words.

- [Native fixtures `d142816`](https://github.com/Shelamkoff/editor/commit/d142816c4f3a6aee6bf60a919e6226c593fa9174)
- [Shift+Enter fixture `ffe071a`](https://github.com/Shelamkoff/editor/commit/ffe071abc57bd9811768ce540c3f1686421059d5)

## Verification ledger

| Source-level suite | Current checked-in test cases | Focused result |
| --- | ---: | ---: |
| `core/InlineCommandController.test.js` | 26 | 26 passed |
| `core/KeyboardRouter.test.js` | 31 | 31 passed |
| **Total** | **57** | **57 passed** |

The focused checks executed the **actual retrieved current class sources** with V8 and injected narrowly scoped runtime, DOM, AbortController and scheduling adapters. For the keyboard suite, the actual checked-in `shared/textOffset.js` implementation was evaluated, not a placeholder length calculation. Browser suite source parsed as JavaScript but **was not executed in Chrome**.

The environment cannot resolve `github.com` from its local git client, so full checkout, `npm ci`, `npm test`, TypeScript package gates and native Chromium input cannot be reproduced here. GitHub edits, code tests and final source reads instead used the authenticated repository connector.

## Required local acceptance

```sh
npm ci
node --test core/InlineCommandController.test.js core/KeyboardRouter.test.js
npm run typecheck
npm test
npm run test:browser
npm run test:docs
npm run test:types
npm run test:package
npm run docs:check
```

For a strict v1/v2 behavioral comparison, replay the same real Chrome caret and key sequences on v1 and v2: Space, Enter, Shift+Enter, unmatched text, nested marks, an atomic widget before the typed word, IME composition and Undo/Redo. Verify final document data, rendered widget counts and caret/selection (not only test-case counts).

**Current conclusion:** the source-level typed-word parity gap is remediated with 15 new focused unit scenarios and four registered native acceptance scenarios. This is **not** an assertion of whole-library stability or complete browser-verified v1 parity.
